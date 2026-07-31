// Opérations budgétaires TRACÉES (P5) : réallocation entre enveloppes sœurs et
// révision du budget annuel. Cœur LAN, exposé en RPC (server/rpc.js) — mêmes
// garanties que les fonctions SECURITY DEFINER Cloud (supabase_budget_ops_p5.sql).
//
// Invariants (autorité serveur) :
//   • permissions de gouvernance imposées ICI (jamais confiées au client) ;
//   • hiérarchie respectée : réallocation entre SŒURS (même parent, même tier) ;
//   • jamais d'enveloppe rendue < aux engagements/paiements déjà comptés ;
//   • atomique (tx) ; historisation avant/après + auteur/date/motif/statut ;
//   • pas de modification silencieuse : ces écritures ne passent PAS par l'API
//     générique (bloquée par budgetGuard) → uniquement par ces RPC.
import { db, tx } from './db.js';
import { randomUUID } from 'node:crypto';
import { hasPermission } from '../src/governance/governanceEngine.js';
import { GOV_PERM } from '../src/governance/permissions.js';

const nowISO = () => new Date().toISOString();

function membership(userId) {
  return userId ? db.prepare('SELECT * FROM school_users WHERE user_id = ? AND active = 1').get(userId) : null;
}
function actorCtx(schoolId, userId) {
  const su = userId ? db.prepare('SELECT role, full_name FROM school_users WHERE user_id = ? AND school_id = ? AND active = 1').get(userId, schoolId) : null;
  const catalog = db.prepare('SELECT * FROM governance_roles WHERE school_id = ?').all(schoolId);
  const assignments = userId ? db.prepare('SELECT * FROM user_governance_roles WHERE school_id = ? AND user_id = ?').all(schoolId, userId) : [];
  return { baseRole: su?.role || null, fullName: su?.full_name || null, catalog, assignments };
}
function requirePerm(a, perm) {
  if (!hasPermission(a.baseRole, a.catalog, a.assignments, perm)) throw new Error(`Permission requise : ${perm}`);
}
const getBudget = (id, schoolId) => db.prepare('SELECT * FROM budgets WHERE id = ? AND school_id = ?').get(id, schoolId) || null;

// (E8) Réallocation entre NŒUDS period/sector (P5 legacy) SUPPRIMÉE — remplacée par
// la réallocation entre LIGNES ci-dessous (createLineReallocation). Le moteur
// budgetHierarchyEngine et la table budget_reallocations ne sont plus écrits.

// ══ MODÈLE CIBLE v3 ══════════════════════════════════════════════════════════
// Engagé (submitted+approved+paid) d'une LIGNE (chapitre) — via les dépenses.
function lineCommitted(chapterId, schoolId) {
  return db.prepare("SELECT COALESCE(SUM(amount),0) s FROM budget_expenses WHERE budget_chapter_id = ? AND school_id = ? AND status IN ('submitted','approved','paid')").get(chapterId, schoolId).s;
}
const getLine = (id, schoolId) => db.prepare("SELECT * FROM budget_chapters WHERE id = ? AND school_id = ?").get(id, schoolId) || null;

// ── RÉALLOCATION ENTRE LIGNES (transfert de montant annuel, total inchangé) ────
export function createLineReallocation(p, ctx) {
  const m = membership(ctx.userId); if (!m) throw new Error('Non autorisé');
  const schoolId = m.school_id;
  const a = actorCtx(schoolId, ctx.userId);
  requirePerm(a, GOV_PERM.REALLOCATE_REQUEST);

  const src = getLine(p.p_source_chapter_id, schoolId);
  const dst = getLine(p.p_dest_chapter_id, schoolId);
  const amount = Math.trunc(Number(p.p_amount) || 0);
  if (!src || !dst) throw new Error('Ligne introuvable');
  if (src.id === dst.id) throw new Error('Source et destination identiques');
  if (!src.scope || !dst.scope) throw new Error('La réallocation concerne des lignes budgétaires');
  if (src.budget_id !== dst.budget_id) throw new Error('Les deux lignes doivent appartenir au même budget annuel');
  if (amount <= 0) throw new Error('Montant invalide');
  if (!String(p.p_reason || '').trim()) throw new Error('Motif obligatoire');

  const year = db.prepare('SELECT academic_year FROM budgets WHERE id = ?').get(src.budget_id)?.academic_year || '';
  const id = randomUUID();
  db.prepare(`INSERT INTO budget_line_reallocations
      (id, school_id, academic_year, source_chapter_id, dest_chapter_id, amount, reason, receipt,
       requester, requested_by, status, created_by, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?, 'pending', ?, ?, ?)`)
    .run(id, schoolId, year, src.id, dst.id, amount, String(p.p_reason).trim(),
      p.p_receipt ?? null, a.fullName, ctx.userId, ctx.userId, nowISO(), nowISO());
  return id;
}

// Cœur SANS transaction propre (l'appelant fournit la tx) — réutilisé par l'applicateur
// de gouvernance budgétaire distante (H3b-3) pour composer create+decide + idempotence
// dans UNE seule transaction atomique. La version publique enveloppe dans tx().
export function decideLineReallocationCore(p, ctx) {
  const m = membership(ctx.userId); if (!m) throw new Error('Non autorisé');
  const schoolId = m.school_id;
  const a = actorCtx(schoolId, ctx.userId);
  requirePerm(a, GOV_PERM.REALLOCATE_DECIDE);

  const r = db.prepare('SELECT * FROM budget_line_reallocations WHERE id = ? AND school_id = ?').get(p.p_id, schoolId);
  if (!r) throw new Error('Demande introuvable');
  if (r.status !== 'pending') throw new Error('Demande déjà décidée');
  const decision = p.p_decision === 'approve' ? 'approve' : 'refuse';
  const stamp = (status, extra = {}) => {
    const set = { status, decision_note: p.p_note ?? null, decided_by: a.fullName, decided_by_id: ctx.userId,
      decided_role: a.baseRole, decided_at: nowISO(), updated_at: nowISO(), ...extra };
    const keys = Object.keys(set);
    db.prepare(`UPDATE budget_line_reallocations SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...keys.map((k) => set[k]), r.id);
  };
  if (decision === 'refuse') { stamp('refused'); return { status: 'refused' }; }

  const src = getLine(r.source_chapter_id, schoolId);
  const dst = getLine(r.dest_chapter_id, schoolId);
  if (!src || !dst) throw new Error('Ligne introuvable');
  const amount = Number(r.amount) || 0;
  const srcBefore = Number(src.planned_amount) || 0;
  const dstBefore = Number(dst.planned_amount) || 0;
  const srcAfter = srcBefore - amount;
  const dstAfter = dstBefore + amount;
  if (srcAfter < 0) throw new Error('Réallocation impossible : montant supérieur à la ligne source');
  // JAMAIS en dessous des engagements déjà comptés (respect engagé/payé).
  const srcCommitted = lineCommitted(src.id, schoolId);
  if (srcAfter < srcCommitted) throw new Error(`Réallocation refusée : la ligne source tomberait sous ses engagements (${srcCommitted}).`);
  // Écriture DIRECTE (contourne le gel E3 : chemin RPC serveur autorisé).
  db.prepare('UPDATE budget_chapters SET planned_amount = ?, updated_at = ? WHERE id = ?').run(srcAfter, nowISO(), src.id);
  db.prepare('UPDATE budget_chapters SET planned_amount = ?, updated_at = ? WHERE id = ?').run(dstAfter, nowISO(), dst.id);
  stamp('applied', { source_before: srcBefore, source_after: srcAfter, dest_before: dstBefore, dest_after: dstAfter });
  return { status: 'applied' };
}
export function decideLineReallocation(p, ctx) { return tx(() => decideLineReallocationCore(p, ctx)); }

// ── RÉVISION DU BUDGET ANNUEL ─────────────────────────────────────────────────
export function createRevision(p, ctx) {
  const m = membership(ctx.userId); if (!m) throw new Error('Non autorisé');
  const schoolId = m.school_id;
  const a = actorCtx(schoolId, ctx.userId);
  requirePerm(a, GOV_PERM.ANNUAL_REVISE_REQUEST);

  const annual = getBudget(p.p_annual_budget_id, schoolId);
  if (!annual || annual.tier !== 'annual') throw new Error('Budget annuel introuvable');
  const newAmount = Math.trunc(Number(p.p_new_amount));
  if (!Number.isFinite(newAmount) || newAmount < 0) throw new Error('Nouveau montant invalide');
  if (!String(p.p_reason || '').trim()) throw new Error('Motif obligatoire');

  const oldAmount = Number(annual.envelope_amount) || 0;
  const firstApplied = db.prepare("SELECT initial_amount FROM budget_revisions WHERE annual_budget_id = ? AND status = 'applied' ORDER BY created_at LIMIT 1").get(annual.id);
  const initialAmount = firstApplied?.initial_amount != null ? firstApplied.initial_amount : oldAmount;

  const id = randomUUID();
  db.prepare(`INSERT INTO budget_revisions
      (id, school_id, academic_year, annual_budget_id, initial_amount, old_amount, new_amount, reason, receipt,
       requester, requested_by, status, created_by, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?, 'pending', ?, ?, ?)`)
    .run(id, schoolId, annual.academic_year, annual.id, initialAmount, oldAmount, newAmount,
      String(p.p_reason).trim(), p.p_receipt ?? null, a.fullName, ctx.userId, ctx.userId, nowISO(), nowISO());
  return id;
}

// Cœur SANS transaction propre (l'appelant fournit la tx) — cf. decideLineReallocationCore.
export function decideRevisionCore(p, ctx) {
  const m = membership(ctx.userId); if (!m) throw new Error('Non autorisé');
  const schoolId = m.school_id;
  const a = actorCtx(schoolId, ctx.userId);
  requirePerm(a, GOV_PERM.ANNUAL_REVISE);

  const r = db.prepare('SELECT * FROM budget_revisions WHERE id = ? AND school_id = ?').get(p.p_id, schoolId);
  if (!r) throw new Error('Demande introuvable');
  if (r.status !== 'pending') throw new Error('Demande déjà décidée');
  const decision = p.p_decision === 'approve' ? 'approve' : 'refuse';
  const stamp = (status) => db.prepare(`UPDATE budget_revisions SET status=?, decision_note=?, decided_by=?, decided_by_id=?, decided_role=?, decided_at=?, updated_at=? WHERE id=?`)
    .run(status, p.p_note ?? null, a.fullName, ctx.userId, a.baseRole, nowISO(), nowISO(), r.id);

  if (decision === 'refuse') { stamp('refused'); return { status: 'refused' }; }

  const annual = getBudget(r.annual_budget_id, schoolId);
  if (!annual || annual.tier !== 'annual') throw new Error('Budget annuel introuvable');
  const newAmount = Number(r.new_amount) || 0;
  // v3 : l'annuel ne peut passer sous la somme des montants des LIGNES finalisées
  // (active/closed) déjà activées — sinon une combinaison de lignes dépasserait.
  const sumLines = db.prepare("SELECT COALESCE(SUM(planned_amount),0) s FROM budget_chapters WHERE budget_id = ? AND scope IS NOT NULL AND status IN ('active','closed')").get(annual.id).s;
  if (newAmount < sumLines) throw new Error(`Révision refusée : le nouvel annuel (${newAmount}) est inférieur aux lignes déjà activées (${sumLines}).`);
  // Legacy : ni sous les enveloppes de période (nœuds hérités, s'il en reste).
  const sumPeriods = db.prepare("SELECT COALESCE(SUM(envelope_amount),0) s FROM budgets WHERE parent_budget_id = ? AND tier = 'period'").get(annual.id).s;
  if (newAmount < sumPeriods) throw new Error(`Révision refusée : le nouvel annuel (${newAmount}) est inférieur aux enveloppes de période déjà réparties (${sumPeriods}).`);
  // …ni sous les engagements déjà comptés (engagé/payé) — v3 : agrégé depuis les dépenses.
  const committed = db.prepare("SELECT COALESCE(SUM(e.amount),0) s FROM budget_expenses e JOIN budget_chapters c ON c.id = e.budget_chapter_id AND c.budget_id = ? WHERE e.school_id = ? AND e.status IN ('submitted','approved','paid')").get(annual.id, schoolId).s;
  if (newAmount < committed) throw new Error(`Révision refusée : le nouvel annuel est inférieur aux engagements (${committed}).`);
  db.prepare('UPDATE budgets SET envelope_amount = ?, updated_at = ? WHERE id = ?').run(newAmount, nowISO(), annual.id);
  stamp('applied');
  return { status: 'applied' };
}
export function decideRevision(p, ctx) { return tx(() => decideRevisionCore(p, ctx)); }
