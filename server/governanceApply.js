// server/governanceApply.js
// H3-b — LE LAN EST L'UNIQUE AUTORITÉ D'APPLICATION FINANCIÈRE.
//
// Le Cloud n'émet qu'une INTENTION (événement de décision, via kernel_emit). Le
// serveur LAN la reçoit par le canal H3-a (réplication domain_events) puis, ICI :
//   1. vérifie l'IDEMPOTENCE (décision déjà traitée ? → no-op) ;
//   2. vérifie le PÉRIMÈTRE ÉCOLE (la décision vise bien cette école) ;
//   3. vérifie la VERSION attendue (expected_version == version courante) ;
//   4. vérifie l'ÉTAT (transition légale de la machine à états) ;
//   5. RE-VÉRIFIE l'AUTORITÉ du décideur (permission + plafond de montant), à
//      partir des tables de gouvernance RÉPLIQUÉES (défense en profondeur) ;
//   6. APPLIQUE une seule fois (transaction atomique) et ÉMET la CONFIRMATION.
//
// INVARIANT : une décision n'est « appliquée » que lorsque le LAN l'a vérifiée,
// exécutée ET confirmée (événement de confirmation estampillé applied_at LAN,
// repoussé au Cloud par H3-a). Aucune application directe depuis le Cloud.
//
// GATE : ne fait rien si l'école n'est pas en mode gouvernance financière distante
// (policyEngine.governanceChannel(policy,'finance')==='cloud'). Défaut = INERTE.

import { randomUUID } from 'node:crypto';
import { db, deviceId, tx } from './db.js';
import { governanceChannel } from '../src/lib/policyEngine.js';
import { hasPermission, canValidateAmount } from '../src/governance/governanceEngine.js';
import { GOV_PERM } from '../src/governance/permissions.js';
import { canTransition } from '../src/lib/expenseEngine.js';
import {
  EVT, DECISION_EVENT_ACTION,
  isBudgetOp, isBudgetOpTarget, budgetOpEventType,
} from '../src/domains/finance/events.js';
import { runOpsGuarded } from './query.js';
import { createRevision, decideRevisionCore, createLineReallocation, decideLineReallocationCore } from './budgetOps.js';

const DECISION_TYPES = Object.keys(DECISION_EVENT_ACTION);

// H3b-3 — autorité d'APPLICATION requise (LAN) par type d'opération budgétaire. Plus
// stricte que le filtre amont Cloud (BUDGET_OP_PERMISSION) : ici c'est le droit de
// FAIRE MUTER l'argent. revise/reallocate = droit de DÉCISION (pas seulement proposer).
const BUDGET_OP_APPLY_PERM = Object.freeze({
  create:     GOV_PERM.BUDGET_PREPARE,
  modify:     GOV_PERM.BUDGET_PREPARE,
  allocate:   GOV_PERM.BUDGET_PREPARE,
  activate:   GOV_PERM.BUDGET_APPROVE,
  revise:     GOV_PERM.ANNUAL_REVISE,
  reallocate: GOV_PERM.REALLOCATE_DECIDE,
});
// Table portant l'agrégat visé (pour existence/version). allocation → la LIGNE.
const aggTable = (target) => (target === 'budget' ? 'budgets' : 'budget_chapters');

function safeParse(s) { try { return typeof s === 'string' ? JSON.parse(s) : (s || {}); } catch { return {}; } }
function localSchoolId() { return db.prepare('SELECT id FROM schools LIMIT 1').get()?.id || null; }

// Mode gouvernance financière distante actif pour l'école locale ? (défaut : NON)
export function remoteFinanceGovernance() {
  const s = db.prepare('SELECT deployment_policy FROM schools LIMIT 1').get();
  return governanceChannel(s?.deployment_policy, 'finance') === 'cloud';
}

// Émission SERVEUR d'un événement d'ORIGINE LOCALE (replicated_from NULL → poussé
// par H3-a) + ligne d'audit dérivée. Préserve l'acteur (non-répudiation).
function emitLocalEvent({ schoolId, aggregateType, aggregateId, eventType, payload = {}, actorId = null, actorName = null, correlationId = null }) {
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO domain_events
      (id, school_id, aggregate_type, aggregate_id, event_type, payload, actor_id, actor_name, correlation_id, occurred_at, device_id)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, schoolId, aggregateType, aggregateId, eventType, JSON.stringify(payload), actorId, actorName, correlationId, now, deviceId());
  try {
    db.prepare(`INSERT INTO audit_events
        (id, school_id, action, aggregate_type, target_id, actor_id, actor_name, payload, correlation_id, event_id, at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, schoolId, eventType, aggregateType, aggregateId, actorId, actorName, JSON.stringify(payload), correlationId, id, now);
  } catch { /* audit best-effort */ }
  return id;
}

// Contexte de rôles du DÉCIDEUR, depuis les tables de gouvernance RÉPLIQUÉES.
function deciderCtx(schoolId, userId) {
  const su = userId ? db.prepare('SELECT role FROM school_users WHERE user_id = ? AND school_id = ? AND active = 1').get(userId, schoolId) : null;
  const catalog = db.prepare('SELECT * FROM governance_roles WHERE school_id = ?').all(schoolId);
  const assignments = userId ? db.prepare('SELECT * FROM user_governance_roles WHERE school_id = ? AND user_id = ?').all(schoolId, userId) : [];
  return { baseRole: su?.role || null, catalog, assignments };
}

function alreadyProcessed(eventId) {
  return !!db.prepare('SELECT 1 FROM applied_decisions WHERE event_id = ?').get(eventId);
}
function recordDecision(eventId, expenseId, decision, result) {
  db.prepare(`INSERT INTO applied_decisions (event_id, expense_id, decision, result, applied_at)
              VALUES (?,?,?,?,?) ON CONFLICT(event_id) DO NOTHING`)
    .run(eventId, expenseId || null, decision || null, result, new Date().toISOString());
}

// Écrit le nouveau statut de la dépense + alimente l'outbox d'état (réplication).
function writeExpenseStatus(expense, toStatus) {
  const now = new Date().toISOString();
  const version = (expense.version || 0) + 1;
  db.prepare('UPDATE budget_expenses SET status = ?, updated_at = ?, version = ?, device_id = ? WHERE id = ?')
    .run(toStatus, now, version, deviceId(), expense.id);
  db.prepare('INSERT INTO sync_outbox (tablename, row_id, op, at) VALUES (?,?,?,?)')
    .run('budget_expenses', String(expense.id), 'upsert', now);
  return version;
}

// Émet un rejet de décision (LAN→Cloud) : la décision N'A PAS été appliquée.
function emitRejection(schoolId, expenseId, event, reason, extra = {}) {
  return emitLocalEvent({
    schoolId, aggregateType: 'expense', aggregateId: expenseId, eventType: EVT.DECISION_REJECTED,
    actorId: event.actor_id || null, actorName: event.actor_name || null, correlationId: expenseId,
    payload: { reason, decision_event_id: event.id, ...extra },
  });
}

// ── CŒUR : vérifie + applique UNE décision distante. Idempotent. Ne lève jamais. ──
export function verifyRemoteDecision(event) {
  const action = DECISION_EVENT_ACTION[event?.event_type];
  if (!action) return { skip: true, reason: 'not_a_decision' };
  const eventId = event.id;
  if (!eventId) return { skip: true, reason: 'no_id' };
  if (alreadyProcessed(eventId)) return { skip: true, reason: 'already_applied' };

  const payload = safeParse(event.payload);
  const expenseId = payload.expense_id || event.aggregate_id || null;
  const expectedVersion = payload.expected_version;
  const school = localSchoolId();

  // (2) Périmètre école — une décision d'une AUTRE école est rejetée.
  if (!school || event.school_id !== school) {
    tx(() => recordDecision(eventId, expenseId, action, 'rejected_other_school'));
    return { applied: false, result: 'rejected_other_school' };
  }

  const expense = expenseId ? db.prepare('SELECT * FROM budget_expenses WHERE id = ?').get(expenseId) : null;
  if (!expense) {
    tx(() => recordDecision(eventId, expenseId, action, 'rejected_not_found'));
    return { applied: false, result: 'rejected_not_found' };
  }

  // (3) Version attendue OBLIGATOIRE et EXACTE (état inchangé depuis la demande).
  if (expectedVersion == null || Number(expectedVersion) !== Number(expense.version)) {
    tx(() => {
      recordDecision(eventId, expenseId, action, 'rejected_version_conflict');
      emitRejection(school, expenseId, event, 'version_conflict', { expected_version: expectedVersion, current_version: expense.version });
    });
    return { applied: false, result: 'rejected_version_conflict' };
  }

  // (4) État courant compatible (machine à états de la dépense).
  const toStatus = action === 'approve' ? 'approved' : 'rejected';
  if (!canTransition(expense.status, toStatus)) {
    tx(() => {
      recordDecision(eventId, expenseId, action, 'rejected_bad_state');
      emitRejection(school, expenseId, event, 'bad_state', { from: expense.status, to: toStatus });
    });
    return { applied: false, result: 'rejected_bad_state' };
  }

  const deciderId = event.actor_id || null;

  // (5a) H4 — SÉPARATION « droit d'accès à distance » vs « droit financier ». Le
  // décideur DOIT porter la capacité remote_access_allowed. Un rôle financier LOCAL
  // (RAF, caissier…) ne suffit JAMAIS à décider depuis Internet. C'est la garantie
  // qui sécurise H3-b : le LAN reste l'autorité finale et refuse toute décision d'un
  // compte sans accès distant, même parvenue jusqu'ici.
  const su = deciderId
    ? db.prepare('SELECT remote_access_allowed FROM school_users WHERE user_id = ? AND school_id = ? AND active = 1').get(deciderId, school)
    : null;
  if (!su || Number(su.remote_access_allowed) !== 1) {
    tx(() => {
      recordDecision(eventId, expenseId, action, 'rejected_no_remote_access');
      emitRejection(school, expenseId, event, 'no_remote_access', { decider_id: deciderId });
    });
    return { applied: false, result: 'rejected_no_remote_access' };
  }

  // (5b) RE-VÉRIFICATION d'autorité du décideur (permission + plafond de montant).
  const { baseRole, catalog, assignments } = deciderCtx(school, deciderId);
  const perm = action === 'approve' ? GOV_PERM.EXPENSE_APPROVE : GOV_PERM.EXPENSE_REJECT;
  const rules = db.prepare('SELECT validation_rules FROM schools WHERE id = ?').get(school)?.validation_rules || null;
  const amount = Number(expense.amount) || 0;
  const authorized = hasPermission(baseRole, catalog, assignments, perm)
    && (action !== 'approve' || canValidateAmount(baseRole, catalog, assignments, rules, amount));
  if (!authorized) {
    tx(() => {
      recordDecision(eventId, expenseId, action, 'rejected_unauthorized');
      emitRejection(school, expenseId, event, 'unauthorized', { decider_id: deciderId, amount });
    });
    return { applied: false, result: 'rejected_unauthorized' };
  }

  // (6) APPLICATION ATOMIQUE + CONFIRMATION (tout ou rien : pas d'état partiel).
  let confirmId = null;
  tx(() => {
    const newVersion = writeExpenseStatus(expense, toStatus);
    recordDecision(eventId, expenseId, action, 'applied');
    confirmId = emitLocalEvent({
      schoolId: school, aggregateType: 'expense', aggregateId: expenseId,
      eventType: action === 'approve' ? EVT.EXPENSE_APPROVED : EVT.EXPENSE_REJECTED,
      actorId: deciderId, actorName: event.actor_name || null, correlationId: expenseId,
      payload: { from: expense.status, to: toStatus, decision_event_id: eventId, applied_at: new Date().toISOString(), version: newVersion },
    });
  });
  return { applied: true, result: 'applied', status: toStatus, confirmationEventId: confirmId };
}

// ── DRAIN : applique toutes les décisions non traitées (robuste à la reprise). ──
// Ne traite QUE les événements d'ORIGINE CLOUD (replicated_from='cloud') non encore
// inscrits dans applied_decisions, par ordre d'arrivée (rowid). GATE : mode distant.
export function applyPendingDecisions() {
  if (!remoteFinanceGovernance()) return { applied: 0, processed: 0 };
  const ph = DECISION_TYPES.map(() => '?').join(',');
  const rows = db.prepare(
    `SELECT * FROM domain_events
       WHERE event_type IN (${ph}) AND replicated_from = 'cloud'
         AND id NOT IN (SELECT event_id FROM applied_decisions)
       ORDER BY rowid ASC`,
  ).all(...DECISION_TYPES);
  let applied = 0;
  for (const ev of rows) { if (verifyRemoteDecision(ev).applied) applied++; }
  return { applied, processed: rows.length };
}

// ── DEMANDE minimale d'approbation (LAN→Cloud) pour une dépense SOUMISE. ──
// Dédupliquée par (dépense, version) : une même version ne génère qu'une demande.
export function emitApprovalRequest(expense) {
  if (!expense?.id || !expense.school_id) return null;
  const dup = db.prepare(
    `SELECT 1 FROM domain_events WHERE aggregate_id = ? AND event_type = ?
       AND json_extract(payload, '$.expected_version') = ?`,
  ).get(expense.id, EVT.REMOTE_APPROVAL_REQUESTED, expense.version);
  if (dup) return null;
  return emitLocalEvent({
    schoolId: expense.school_id, aggregateType: 'expense', aggregateId: expense.id,
    eventType: EVT.REMOTE_APPROVAL_REQUESTED, correlationId: expense.id,
    actorId: expense.created_by || null, actorName: expense.requester || null,
    payload: {
      expense_id: expense.id, budget_id: expense.budget_id, budget_chapter_id: expense.budget_chapter_id,
      amount: expense.amount, requester: expense.requester, expense_date: expense.expense_date,
      motif: expense.notes || null, expected_version: expense.version,
    },
  });
}

// Hook appelé par query.js après une écriture de budget_expenses : émet la demande
// si la dépense est SOUMISE et que l'école est en mode gouvernance distante.
export function emitApprovalRequestForOp(op) {
  if (!remoteFinanceGovernance()) return;
  const id = op?.values?.id || (op?.filters || []).find((f) => f.col === 'id' && f.op === 'eq')?.val;
  if (!id) return;
  const exp = db.prepare('SELECT * FROM budget_expenses WHERE id = ?').get(id);
  if (exp && exp.status === 'submitted') emitApprovalRequest(exp);
}

// ════════════════════════════════════════════════════════════════════════════
// H3b-3 — GESTION BUDGÉTAIRE À DISTANCE : application vérifiée des INTENTIONS.
//
// Le Cloud émet une intention (BudgetOperationRequested) ; le LAN, SEULE autorité,
// re-vérifie ICI école + accès distant + permission + version + plafonds (via les
// GUARDS budgetGuard) + idempotence + ordre causal, puis applique par le CHEMIN
// GUARDÉ (runOpsGuarded / RPC tracées) — JAMAIS de rawUpsert — ou rejette (journalisé).
// « Application directe après re-vérif LAN » : un décideur autorisé (Fondatrice/
// Coordonnateur) applique sans second décideur local. Idempotent, ne lève jamais.
// ════════════════════════════════════════════════════════════════════════════

function opProcessed(eventId) {
  return !!db.prepare('SELECT 1 FROM applied_budget_ops WHERE event_id = ?').get(eventId);
}
function recordBudgetOp(eventId, op, target, aggId, result) {
  db.prepare(`INSERT INTO applied_budget_ops (event_id, op, target, aggregate_id, result, applied_at)
              VALUES (?,?,?,?,?,?) ON CONFLICT(event_id) DO NOTHING`)
    .run(eventId, op || null, target || null, aggId || null, result, new Date().toISOString());
}
function emitBudgetOutcome(kind, { school, aggId, event, corr, extra = {} }) {
  return emitLocalEvent({
    schoolId: school, aggregateType: 'budget', aggregateId: aggId,
    eventType: budgetOpEventType(kind), // applied → BudgetOperationApplied ; rejected → …Rejected
    actorId: event.actor_id || null, actorName: event.actor_name || null, correlationId: corr,
    payload: {
      ...extra, operation_event_id: event.id, correlation_id: corr,
      ...(kind === 'applied' ? { applied_at: new Date().toISOString() } : {}),
    },
  });
}

// Construit les op(s) de STRUCTURE à passer au CHEMIN GUARDÉ (runOpsGuarded). Ces op
// repassent par guardBudgetStructure/Line/Allocations → cap annuel, config, gel
// enforcés. AUCUN rawUpsert. revise/reallocate ne passent PAS par ici (→ RPC tracées).
function buildStructureOps({ op, target, aggId, data, school }) {
  const d = data || {};
  if (target === 'budget') {
    if (op === 'create') return [{ table: 'budgets', action: 'upsert', values: { ...d, id: aggId, school_id: school } }];
    if (op === 'modify') return [{ table: 'budgets', action: 'update', values: { ...d }, filters: [{ col: 'id', op: 'eq', val: aggId }] }];
  }
  if (target === 'line') {
    if (op === 'create') return [{ table: 'budget_chapters', action: 'upsert', values: { ...d, id: aggId, school_id: school } }];
    if (op === 'modify') return [{ table: 'budget_chapters', action: 'update', values: { ...d }, filters: [{ col: 'id', op: 'eq', val: aggId }] }];
    if (op === 'activate') return [{ table: 'budget_chapters', action: 'update', values: { ...d, status: 'active' }, filters: [{ col: 'id', op: 'eq', val: aggId }] }];
  }
  if (target === 'allocation' && op === 'allocate') {
    const ops = [];
    const periods = Array.isArray(d.periods) ? d.periods : [];
    const sectors = Array.isArray(d.sectors) ? d.sectors : [];
    if (periods.length) ops.push({ table: 'budget_line_periods', action: 'upsert', values: periods.map((r) => ({ ...r, school_id: school, budget_chapter_id: aggId })) });
    if (sectors.length) ops.push({ table: 'budget_line_sectors', action: 'upsert', values: sectors.map((r) => ({ ...r, school_id: school, budget_chapter_id: aggId })) });
    if (!ops.length) throw new Error('Allocation vide (ni périodes ni secteurs).');
    return ops;
  }
  throw new Error(`Combinaison op/target non supportée : ${op}/${target}.`);
}

// Applique l'effet métier (DANS la tx de l'appelant). Structure → chemin guardé ;
// révision/réallocation → RPC tracées (create + decide, jamais un upsert — R-rpc).
function applyBudgetEffect({ op, target, aggId, data, school, decider }) {
  const ctx = { userId: decider };
  const d = data || {};
  if (op === 'revise') {
    const rid = createRevision({ p_annual_budget_id: aggId, p_new_amount: d.new_amount, p_reason: d.reason, p_receipt: d.receipt ?? null }, ctx);
    decideRevisionCore({ p_id: rid, p_decision: 'approve', p_note: d.note ?? null }, ctx);
    return;
  }
  if (op === 'reallocate') {
    const rid = createLineReallocation({ p_source_chapter_id: d.source_chapter_id ?? aggId, p_dest_chapter_id: d.dest_chapter_id, p_amount: d.amount, p_reason: d.reason, p_receipt: d.receipt ?? null }, ctx);
    decideLineReallocationCore({ p_id: rid, p_decision: 'approve', p_note: d.note ?? null }, ctx);
    return;
  }
  runOpsGuarded(buildStructureOps({ op, target, aggId, data: d, school }), ctx);
}

// ── CŒUR : vérifie + applique UNE intention budgétaire distante. Idempotent. ──
// Renvoie { applied } | { deferred } (dépendance causale absente → réessai) | { skip }.
export function verifyRemoteBudgetOperation(event) {
  if (event?.event_type !== EVT.BUDGET_OP_REQUESTED) return { skip: true, reason: 'not_a_budget_op' };
  const eventId = event.id;
  if (!eventId) return { skip: true, reason: 'no_id' };
  if (opProcessed(eventId)) return { skip: true, reason: 'already_applied' };

  const p = safeParse(event.payload);
  const op = p.op;
  const target = p.target;
  const aggId = p.aggregate_id || event.aggregate_id || null;
  const expectedVersion = p.expected_version;
  const data = p.data || {};
  const corr = p.correlation_id || event.correlation_id || aggId;
  const school = localSchoolId();

  const reject = (result, reason, extra = {}) => {
    tx(() => {
      recordBudgetOp(eventId, op, target, aggId, result);
      emitBudgetOutcome('rejected', { school, aggId, event, corr, extra: { op, target, reason, ...extra } });
    });
    return { applied: false, result };
  };

  // (1) Validité de la commande (op/cible connues, identité autoritaire présente).
  if (!isBudgetOp(op) || !isBudgetOpTarget(target)) return reject('rejected_invalid', 'invalid_op');
  if (!aggId) return reject('rejected_invalid', 'no_aggregate_id');

  // (2) Périmètre école — une intention d'une AUTRE école est rejetée.
  if (!school || event.school_id !== school) return reject('rejected_other_school', 'other_school');

  // (3) H4 — ACCÈS DISTANT obligatoire (séparation droit financier / accès distant).
  const decider = event.actor_id || null;
  const su = decider
    ? db.prepare('SELECT remote_access_allowed FROM school_users WHERE user_id = ? AND school_id = ? AND active = 1').get(decider, school)
    : null;
  if (!su || Number(su.remote_access_allowed) !== 1) return reject('rejected_no_remote_access', 'no_remote_access', { decider_id: decider });

  // (4) PERMISSION d'application (autorité de mutation), depuis la gouvernance répliquée.
  const { baseRole, catalog, assignments } = deciderCtx(school, decider);
  const perm = BUDGET_OP_APPLY_PERM[op];
  if (!perm || !hasPermission(baseRole, catalog, assignments, perm)) {
    return reject('rejected_unauthorized', 'unauthorized', { decider_id: decider, perm: perm || null });
  }

  // (5) Existence de l'agrégat + ORDRE CAUSAL + VERSION.
  const agg = db.prepare(`SELECT * FROM ${aggTable(target)} WHERE id = ?`).get(aggId);
  if (op === 'create') {
    if (agg) { // déjà matérialisé (rejeu après crash) → idempotent : confirmer une fois.
      let cid = null;
      tx(() => { recordBudgetOp(eventId, op, target, aggId, 'applied'); cid = emitBudgetOutcome('applied', { school, aggId, event, corr, extra: { op, target, idempotent: true } }); });
      return { applied: true, result: 'applied', idempotent: true, confirmationEventId: cid };
    }
  } else {
    // R-order : l'agrégat cible n'existe pas encore (create pas encore appliqué) →
    // on DIFFÈRE (rien inscrit) ; l'intention sera réessayée au prochain cycle.
    if (!agg) return { deferred: true, reason: 'missing_aggregate' };
    // Version EXACTE si fournie (état inchangé depuis la vue distante) — sinon rejet.
    if (expectedVersion != null && Number(expectedVersion) !== Number(agg.version)) {
      return reject('rejected_version_conflict', 'version_conflict', { expected_version: expectedVersion, current_version: agg.version });
    }
  }

  // (6) APPLICATION ATOMIQUE (mutation guardée + idempotence + confirmation) OU rejet
  //     journalisé si un GUARD refuse (cap annuel dépassé, config incomplète, gel…).
  let confirmId = null;
  try {
    tx(() => {
      applyBudgetEffect({ op, target, aggId, data, school, decider });
      recordBudgetOp(eventId, op, target, aggId, 'applied');
      confirmId = emitBudgetOutcome('applied', { school, aggId, event, corr, extra: { op, target } });
    });
  } catch (e) {
    return reject('rejected_rule', 'rule_violation', { message: e.message });
  }
  return { applied: true, result: 'applied', confirmationEventId: confirmId };
}

// ── DRAIN : applique les intentions budgétaires non traitées (robuste à la reprise). ──
// Ordre d'arrivée (rowid) → respecte l'ordre causal d'une même source (créer avant
// activer). Une intention différée reste non inscrite → réessayée au cycle suivant.
export function applyPendingBudgetOps() {
  if (!remoteFinanceGovernance()) return { applied: 0, deferred: 0, processed: 0 };
  const rows = db.prepare(
    `SELECT * FROM domain_events
       WHERE event_type = ? AND replicated_from = 'cloud'
         AND id NOT IN (SELECT event_id FROM applied_budget_ops)
       ORDER BY rowid ASC`,
  ).all(EVT.BUDGET_OP_REQUESTED);
  let applied = 0; let deferred = 0;
  for (const ev of rows) {
    const r = verifyRemoteBudgetOperation(ev);
    if (r.applied) applied++; else if (r.deferred) deferred++;
  }
  return { applied, deferred, processed: rows.length };
}

// Scheduler (gated NOTESCAM_CLOUD_SYNC=1) : draine décisions de dépense ET opérations
// budgétaires distantes. No-op tant que l'école n'est pas en mode gouvernance distante.
let _timer = null;
export function scheduleDecisionApply(intervalMs = 60 * 1000) {
  if (process.env.NOTESCAM_CLOUD_SYNC !== '1') return false;
  const drain = () => {
    try { applyPendingDecisions(); } catch (e) { console.error('[gov-apply] decisions:', e.message); }
    try { applyPendingBudgetOps(); } catch (e) { console.error('[gov-apply] budget-ops:', e.message); }
  };
  drain();
  _timer = setInterval(drain, intervalMs);
  _timer.unref?.();
  return true;
}
