// Enforcement SERVEUR des règles budgétaires sur les dépenses (LAN).
//
// Frontière de confiance = ce serveur (comme guardAppendOnly / kernel_emit). Le
// SEUL chemin d'écriture du frontend passe par runQuery/runBatch → ces contrôles
// ne peuvent PAS être contournés par l'UI ni par un appel API direct au serveur
// local. La synchro cloud (rawUpsert) NE passe PAS par ici → elle applique la
// vérité déjà validée à l'origine (pas de re-validation qui bloquerait la sync).
//
// Aucune logique métier dupliquée (exigence P3 #8) : on RÉUTILISE les moteurs purs
//   • P2  budgetHierarchyEngine.checkExpense  → chaîne ligne→secteur→période→annuel
//   • Dépenses expenseEngine (machine à états, verrou terminal, hard-delete)
//   • Gouvernance governanceEngine + validationEngine (permissions + plafond)
// Ces fichiers `src/…` sont purs (aucune dépendance navigateur) ; ils sont
// embarqués dans l'installeur LAN (packaging/build-installer.ps1 stage `src/`).

import { db } from './db.js';
import {
  checkExpense as v3CheckExpense, expenseImputationErrors, indexAllocations,
  lineAllocationErrors, canActivateLineAnnual, isLine,
} from '../src/lib/budgetLinesEngine.js';
import { canTransition, isExpenseLocked, isCommitting, canHardDelete } from '../src/lib/expenseEngine.js';
import { hasPermission, canValidateAmount } from '../src/governance/governanceEngine.js';
import { GOV_PERM } from '../src/governance/permissions.js';
import { governanceChannel } from '../src/lib/policyEngine.js';

function budgetValidationOn(schoolId) {
  const s = db.prepare('SELECT budget_validation FROM schools WHERE id = ?').get(schoolId);
  return !!(s && Number(s.budget_validation) === 1);
}

// H3-b : l'école délègue-t-elle l'approbation des dépenses à la gouvernance distante ?
function remoteFinanceGovernance(schoolId) {
  const s = db.prepare('SELECT deployment_policy FROM schools WHERE id = ?').get(schoolId);
  return governanceChannel(s?.deployment_policy, 'finance') === 'cloud';
}

function actorCtx(schoolId, userId) {
  let baseRole = null;
  if (userId) {
    const su = db.prepare('SELECT role FROM school_users WHERE user_id = ? AND school_id = ? AND active = 1').get(userId, schoolId);
    baseRole = su?.role || null;
  }
  const catalog = db.prepare('SELECT * FROM governance_roles WHERE school_id = ?').all(schoolId);
  const assignments = userId
    ? db.prepare('SELECT * FROM user_governance_roles WHERE school_id = ? AND user_id = ?').all(schoolId, userId)
    : [];
  return { baseRole, catalog, assignments };
}

// Permission requise pour une transition de statut de dépense (mode gouverné).
function permForTransition(to) {
  if (to === 'submitted') return GOV_PERM.EXPENSE_SUBMIT;
  if (to === 'approved')  return GOV_PERM.EXPENSE_APPROVE;
  if (to === 'rejected')  return GOV_PERM.EXPENSE_REJECT;
  if (to === 'paid')      return GOV_PERM.EXPENSE_PAY;
  return null; // draft / cancelled traités à part
}

// Contrôle d'UNE écriture de dépense (état résultant = existing + incoming).
function enforceExpense({ incoming, existing, userId }) {
  const result = { ...(existing || {}), ...incoming };
  const schoolId = result.school_id || existing?.school_id;
  if (!schoolId) return; // laissera la FK/NOT NULL trancher
  const fromStatus = existing?.status || null;
  const toStatus = result.status || 'draft';

  // 1) Verrou terminal : une dépense payée/annulée ne se modifie plus.
  if (existing && isExpenseLocked(existing)) {
    throw new Error(`Dépense « ${existing.status} » verrouillée (lecture seule).`);
  }

  // 1bis) H3-b — GOUVERNANCE DISTANTE : en mode distant, un acteur LOCAL ne peut
  // pas approuver une dépense. L'approbation n'arrive QUE par une décision distante
  // vérifiée (server/governanceApply.verifyRemoteDecision), qui écrit hors de ce
  // chemin. Vaut aussi pour une création directe en « approved ». (Défaut : inerte.)
  if (toStatus === 'approved' && (!existing || fromStatus !== 'approved') && remoteFinanceGovernance(schoolId)) {
    throw new Error('Approbation réservée à la gouvernance distante (Fondatrice/Coordonnateur) — décision émise depuis le Cloud, appliquée par le serveur de l’école.');
  }

  // 2) Machine à états sur MODIFICATION (mêmes transitions que le moteur Dépenses).
  //    À la CRÉATION, tout statut initial reste toléré en mode NON gouverné
  //    (comportement historique : enregistrer une dépense déjà approuvée). En mode
  //    gouverné, créer directement à un statut engageant exige la permission
  //    correspondante (cf. §4) → aucun contournement d'autorité par appel direct.
  if (existing && fromStatus !== toStatus && !canTransition(fromStatus, toStatus)) {
    throw new Error(`Transition de dépense invalide : ${fromStatus} → ${toStatus}.`);
  }

  // 3) CHAÎNE budgétaire — TOUJOURS active (intégrité de l'argent, non optionnelle).
  //    Édition : on exclut l'ancien montant de la dépense (anti double comptage).
  //    Deux modèles cohabitent pendant la migration :
  //      • v3  : la cible est une LIGNE (budget_chapters.scope défini) → cohérence
  //              d'imputation (secteur autorisé / période répartie) sur TOUS les
  //              statuts + chaîne ligne/période/secteur/annuel si engageant ;
  //      • legacy : la cible est un nœud secteur (tier=sector) → bloc P3 inchangé.
  const targetChapter = result.budget_chapter_id
    ? db.prepare('SELECT * FROM budget_chapters WHERE id = ?').get(result.budget_chapter_id) : null;

  if (targetChapter && isLine(targetChapter)) {
    // PÉRIODE dérivée AUTOMATIQUEMENT de la DATE de la dépense (jamais choisie, jamais
    // la date du jour) — NON contournable : écrase toute valeur budget_period_id
    // envoyée par un appel API direct, et rejette si 0 (aucune période) ou >1 (chevauchement).
    const expDate = result.expense_date;
    if (!expDate) throw new Error('Imputation invalide : date de la dépense requise.');
    const year = db.prepare('SELECT academic_year FROM budgets WHERE id = ?').get(targetChapter.budget_id)?.academic_year || null;
    const bpSql = 'SELECT * FROM budget_periods WHERE school_id = ?' + (year ? ' AND academic_year = ?' : '');
    const budgetPeriods = db.prepare(bpSql).all(...(year ? [schoolId, year] : [schoolId]));
    const covering = budgetPeriods.filter((p) => p.start_date && p.end_date && p.start_date <= expDate && expDate <= p.end_date);
    if (covering.length === 0) throw new Error("Aucune période budgétaire ne couvre cette date. Configurez d'abord les périodes de l'année.");
    if (covering.length > 1) throw new Error('Chevauchement de périodes budgétaires sur cette date (erreur de configuration).');
    const periodId = covering[0].id;
    result.budget_period_id = periodId;
    if (incoming) incoming.budget_period_id = periodId;   // persiste la période dérivée de la date

    const periodAllocs = db.prepare('SELECT * FROM budget_line_periods WHERE school_id = ?').all(schoolId);
    const sectorAllocs = db.prepare('SELECT * FROM budget_line_sectors WHERE school_id = ?').all(schoolId);
    const idx = indexAllocations(periodAllocs, sectorAllocs);
    const sectorId = result.school_unit_id ?? null;
    const committing = isCommitting(toStatus);
    // Cohérence d'imputation (§2 arbitrage) — imposée quel que soit le statut. Le
    // verrou « ligne active » ne s'applique qu'à l'ENGAGEMENT (un brouillon se
    // prépare sur une ligne non encore active).
    const impErr = expenseImputationErrors(targetChapter, { periodId, sectorId }, idx)
      .filter((e) => (committing ? true : e !== 'line_not_active'));
    if (impErr.length) throw new Error(`Imputation de dépense invalide (${impErr.join(', ')}).`);

    if (committing) {
      const budgets = db.prepare('SELECT * FROM budgets WHERE school_id = ?').all(schoolId);
      const annual = budgets.find((b) => b.id === targetChapter.budget_id && b.tier === 'annual') || null;
      const expenses = db.prepare('SELECT * FROM budget_expenses WHERE school_id = ?').all(schoolId);
      const requests = db.prepare('SELECT * FROM budget_unlock_requests WHERE school_id = ?').all(schoolId);
      const verdict = v3CheckExpense({
        amount: Number(result.amount) || 0, line: targetChapter, periodId, sectorId, annual, idx, expenses, requests,
        excludeExpenseId: existing?.id || result.id || null,
      });
      if (!verdict.ok) {
        throw new Error(`Enveloppe insuffisante (niveau « ${verdict.blockingLevel} ») : demandé ${verdict.requested}, disponible ${verdict.available}, dépassement ${verdict.overBy}.`);
      }
    }
  }
  // (E8) Branche legacy (nœud secteur, budgetHierarchyEngine) SUPPRIMÉE : plus aucun
  // nœud period/sector n'est créé (seed migré v3). Une dépense v3 vise toujours une
  // LIGNE (scope défini) → seule la chaîne v3 ci-dessus s'applique.

  // 4) Permissions + plafond de validation — SEULEMENT en mode gouverné
  //    (schools.budget_validation = 1). Sinon comportement historique inchangé.
  //    L'acteur est la SESSION serveur (userId), jamais le payload → non forgeable.
  if (budgetValidationOn(schoolId)) {
    const { baseRole, catalog, assignments } = actorCtx(schoolId, userId);
    const isEditNoStatus = existing && fromStatus === toStatus;
    const isCreateDraft = !existing && toStatus === 'draft';
    if ((isCreateDraft || isEditNoStatus) &&
        !hasPermission(baseRole, catalog, assignments, GOV_PERM.EXPENSE_PREPARE)) {
      throw new Error('Permission requise : préparer une dépense (expense.prepare).');
    }
    // Transition (ou CRÉATION directe) vers un statut engageant → permission dédiée.
    // Créer d'emblée « approved »/« paid » exige donc la même autorité qu'une
    // transition vers ce statut : impossible de contourner l'approbation par un
    // insert direct en mode gouverné.
    const changed = (!existing && ['submitted', 'approved', 'paid', 'rejected'].includes(toStatus))
      || (existing && fromStatus !== toStatus && toStatus !== 'cancelled');
    if (changed) {
      const perm = permForTransition(toStatus);
      if (perm && !hasPermission(baseRole, catalog, assignments, perm)) {
        throw new Error(`Permission requise pour « ${toStatus} » : ${perm}.`);
      }
      // Plafond de validation à l'APPROBATION (montant → rôle habilité).
      if (toStatus === 'approved') {
        const s = db.prepare('SELECT validation_rules FROM schools WHERE id = ?').get(schoolId);
        if (!canValidateAmount(baseRole, catalog, assignments, s?.validation_rules, Number(result.amount) || 0)) {
          throw new Error('Plafond de validation dépassé pour votre rôle.');
        }
      }
    }
  }
}

// Suppression physique : tolérée UNIQUEMENT pour un brouillon (comme le moteur).
// Tout autre statut doit passer par l'annulation tracée (jamais de hard-delete).
function enforceDelete(op) {
  const idFilter = (op.filters || []).find((f) => f.col === 'id');
  let rows = [];
  if (idFilter && idFilter.op === 'eq') {
    const r = db.prepare('SELECT status FROM budget_expenses WHERE id = ?').get(idFilter.val);
    if (r) rows = [r];
  } else if (idFilter && idFilter.op === 'in' && Array.isArray(idFilter.val) && idFilter.val.length) {
    const ph = idFilter.val.map(() => '?').join(',');
    rows = db.prepare(`SELECT status FROM budget_expenses WHERE id IN (${ph})`).all(...idFilter.val);
  } else {
    // Filtre non-id : prudence maximale, on inspecte tout ce qui matche l'école si fourni.
    const school = (op.filters || []).find((f) => f.col === 'school_id' && f.op === 'eq');
    if (school) rows = db.prepare('SELECT status FROM budget_expenses WHERE school_id = ?').all(school.val);
  }
  for (const r of rows) {
    if (!canHardDelete(r.status)) {
      throw new Error(`Suppression interdite (statut « ${r.status} ») : utilisez l'annulation tracée.`);
    }
  }
}

// ── P5 : intégrité de la STRUCTURE budgétaire (budgets + tables d'opérations) ──
const OPS_TABLES = new Set(['budget_reallocations', 'budget_revisions', 'budget_line_reallocations']);

export function guardBudgetStructure(op) {
  // Les opérations tracées (réallocation / révision) ne s'écrivent QUE via leurs
  // RPC serveur (budgetOps) — jamais par l'API générique → aucun contournement.
  if (OPS_TABLES.has(op.table) && ['insert', 'upsert', 'update', 'delete'].includes(op.action)) {
    throw new Error(`${op.table} : opération réservée aux RPC de réallocation/révision.`);
  }
  // Pas de modification SILENCIEUSE d'un budget ACTIF : enveloppe / allocation ne
  // changent que par réallocation (période/secteur) ou révision (annuel), tracées.
  // Les brouillons restent librement éditables (P4).
  if (op.table === 'budgets' && ['upsert', 'update'].includes(op.action)) {
    const inc = op.values || {};
    const id = inc.id || (op.filters || []).find((f) => f.col === 'id' && f.op === 'eq')?.val;
    if (!id) return;
    const cur = db.prepare('SELECT status, envelope_amount, allocation_pct, sector_amount FROM budgets WHERE id = ?').get(id);
    if (!cur || cur.status !== 'active') return;
    const changed = (k) => (k in inc) && Number(inc[k] ?? 0) !== Number(cur[k] ?? 0);
    if (changed('envelope_amount') || changed('allocation_pct') || changed('sector_amount')) {
      throw new Error('Budget actif : l’enveloppe ne se modifie pas directement — utilisez la réallocation ou la révision.');
    }
  }
}

// ── Modèle CIBLE v3 : activation d'une LIGNE + gel de sa structure ────────────
// Rendu NON contournable par API directe : appelé par query.js sur budget_chapters.
//   • activer une ligne exige une configuration complète (Σ%=100, montant défini…)
//     ET le respect du PLAFOND ANNUEL FERME (Σ montants des lignes finalisées +
//     la ligne à activer ≤ enveloppe annuelle) ;
//   • une ligne active/clôturée ne voit pas son montant/portée modifiés en direct.
const idOfOp = (op) => (op.filters || []).find((f) => f.col === 'id' && f.op === 'eq')?.val || null;

export function guardBudgetLine(op) {
  if (op.table !== 'budget_chapters') return;
  if (!['insert', 'upsert', 'update'].includes(op.action)) return;
  const list = op.action === 'update' ? [op.values || {}] : (Array.isArray(op.values) ? op.values : [op.values || {}]);
  for (const incoming of list) {
    const id = incoming.id || idOfOp(op);
    const existing = id ? db.prepare('SELECT * FROM budget_chapters WHERE id = ?').get(id) : null;
    const result = { ...(existing || {}), ...incoming };
    if (!isLine(result)) continue;                          // rubrique : aucune règle de ligne
    const schoolId = result.school_id || existing?.school_id;

    // Gel : montant / portée d'une ligne active ou clôturée non modifiables en direct.
    if (existing && (existing.status === 'active' || existing.status === 'closed')) {
      const changed = (k) => (k in incoming) && String(incoming[k] ?? '') !== String(existing[k] ?? '');
      if (changed('planned_amount') || changed('scope')) {
        throw new Error('Ligne active/clôturée : le montant ou la portée ne se modifie pas directement (réallocation / révision).');
      }
    }

    // Activation (draft → active) : configuration complète + plafond annuel ferme.
    const activating = result.status === 'active' && (!existing || existing.status !== 'active');
    if (activating && schoolId) {
      const chapters = db.prepare('SELECT * FROM budget_chapters WHERE school_id = ?').all(schoolId);
      const periodAllocs = db.prepare('SELECT * FROM budget_line_periods WHERE school_id = ?').all(schoolId);
      const sectorAllocs = db.prepare('SELECT * FROM budget_line_sectors WHERE school_id = ?').all(schoolId);
      const idx = indexAllocations(periodAllocs, sectorAllocs);
      const cfg = lineAllocationErrors(result, idx);
      if (cfg.length) throw new Error(`Activation impossible : configuration incomplète (${cfg.join(', ')}).`);
      const annual = db.prepare("SELECT * FROM budgets WHERE id = ? AND tier = 'annual'").get(result.budget_id);
      // `chapters` porte encore le statut ANCIEN de cette ligne (brouillon) → exclue
      // du cumul via excludeLineId ; on teste result.planned_amount contre la marge.
      if (annual && !canActivateLineAnnual(result, annual, chapters)) {
        throw new Error('Activation refusée : le budget annuel global serait dépassé (Σ des lignes activées > enveloppe).');
      }
    }
  }
}

// Gel des ALLOCATIONS (période/secteur) d'une ligne active ou clôturée : elles ne
// se modifient plus en direct (passeront par réallocation/révision — phase E6).
const ALLOC_TABLES = new Set(['budget_line_periods', 'budget_line_sectors']);
export function guardBudgetAllocations(op) {
  if (!ALLOC_TABLES.has(op.table)) return;
  if (!['insert', 'upsert', 'update', 'delete'].includes(op.action)) return;
  const chapterIds = new Set();
  const chapterOfRow = (id) => db.prepare(`SELECT budget_chapter_id FROM ${op.table} WHERE id = ?`).get(id)?.budget_chapter_id;

  if (op.action === 'delete') {
    const chF = (op.filters || []).find((f) => f.col === 'budget_chapter_id' && f.op === 'eq');
    const idF = (op.filters || []).find((f) => f.col === 'id');
    if (chF) chapterIds.add(chF.val);
    else if (idF && idF.op === 'eq') { const c = chapterOfRow(idF.val); if (c) chapterIds.add(c); }
    else if (idF && idF.op === 'in' && Array.isArray(idF.val)) {
      const ph = idF.val.map(() => '?').join(',');
      for (const r of db.prepare(`SELECT budget_chapter_id FROM ${op.table} WHERE id IN (${ph})`).all(...idF.val)) chapterIds.add(r.budget_chapter_id);
    }
  } else {
    const list = op.action === 'update' ? [op.values || {}] : (Array.isArray(op.values) ? op.values : [op.values || {}]);
    for (const v of list) if (v.budget_chapter_id) chapterIds.add(v.budget_chapter_id);
    if (op.action === 'update' && !chapterIds.size) { const c = chapterOfRow(idOfOp(op)); if (c) chapterIds.add(c); }
  }
  for (const cid of chapterIds) {
    const c = db.prepare('SELECT status FROM budget_chapters WHERE id = ?').get(cid);
    if (c && (c.status === 'active' || c.status === 'closed')) {
      throw new Error('Ligne active/clôturée : ses allocations ne se modifient pas directement (réallocation / révision).');
    }
  }
}

// Point d'entrée : appelé par query.js pour toute écriture sur budget_expenses.
export function guardBudgetExpense(op, ctx = null) {
  if (op.table !== 'budget_expenses') return;
  const userId = ctx?.userId || null;

  if (op.action === 'delete') { enforceDelete(op); return; }
  if (!['insert', 'upsert', 'update'].includes(op.action)) return;

  const idFromFilter = () => (op.filters || []).find((f) => f.col === 'id' && f.op === 'eq')?.val || null;
  const list = op.action === 'update'
    ? [op.values || {}]
    : (Array.isArray(op.values) ? op.values : [op.values || {}]);

  for (const incoming of list) {
    const id = incoming.id || idFromFilter();
    const existing = id ? db.prepare('SELECT * FROM budget_expenses WHERE id = ?').get(id) : null;
    enforceExpense({ incoming, existing, userId });
  }
}
