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
import { EVT, DECISION_EVENT_ACTION } from '../src/domains/finance/events.js';

const DECISION_TYPES = Object.keys(DECISION_EVENT_ACTION);

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

// Scheduler (gated NOTESCAM_CLOUD_SYNC=1) : draine les décisions distantes. No-op
// tant que l'école n'est pas en mode gouvernance distante.
let _timer = null;
export function scheduleDecisionApply(intervalMs = 60 * 1000) {
  if (process.env.NOTESCAM_CLOUD_SYNC !== '1') return false;
  try { applyPendingDecisions(); } catch (e) { console.error('[gov-apply] initial:', e.message); }
  _timer = setInterval(() => { try { applyPendingDecisions(); } catch (e) { console.error('[gov-apply]:', e.message); } }, intervalMs);
  _timer.unref?.();
  return true;
}
