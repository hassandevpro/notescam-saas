// Tests du mapper PUR vie de l'établissement → notification interne.
//   node src/lib/_notificationRulesSchool.test.mjs
import {
  schoolNotification, isDisciplineTable, SCHOOL_EVENT, DISCIPLINE_LABELS,
} from './notificationRulesSchool.js';

let failed = false;
const ok = (cond, msg) => { console.log(`${cond ? '✅' : '❌'} ${msg}`); if (!cond) failed = true; };

// ── Périodes : information collective → ciblage par rôle ────────────────────
{
  const lock = schoolNotification({ kind: SCHOOL_EVENT.PERIOD_LOCKED, payload: { label: 'Séquence 3' } }, {});
  ok(lock.recipients.length === 1 && lock.recipients[0].role === 'teacher', 'verrou → rôle enseignant (pas 1 ligne par prof)');
  ok(/Séquence 3/.test(lock.body), 'le libellé de la séquence apparaît');

  const unlock = schoolNotification({ kind: SCHOOL_EVENT.PERIOD_UNLOCKED, payload: {} }, {});
  ok(/ouverte/.test(unlock.body), 'déverrouillage → saisie de nouveau possible');
  ok(unlock.channels.join(',') === 'internal', 'canal interne uniquement');
}

// ── RH : congés ────────────────────────────────────────────────────────────
{
  const req = schoolNotification(
    { kind: SCHOOL_EVENT.LEAVE_REQUESTED, payload: { staffName: 'M. Nkolo', type: 'annuel', days: 5 } }, {});
  ok(req.recipients[0].role === 'admin', 'demande de congé → administration');
  ok(/Nkolo/.test(req.body) && /5 j/.test(req.body), 'nom et durée dans le corps');

  const okDec = schoolNotification(
    { kind: SCHOOL_EVENT.LEAVE_DECIDED, payload: { status: 'approved', days: 5 } },
    { resolved: { staffUserId: 'u42' } });
  ok(okDec.recipients[0].id === 'u42' && okDec.type === 'leave_approved', 'congé accordé → l’agent, via compte résolu');

  const noAccount = schoolNotification(
    { kind: SCHOOL_EVENT.LEAVE_DECIDED, payload: { status: 'approved' } }, { resolved: {} });
  ok(noAccount === null, 'agent sans compte → aucune notification (jamais de diffusion)');
}

// ── Signalements ───────────────────────────────────────────────────────────
{
  // Routage réel : les agents du département visé (résolus en amont).
  const assigned = schoolNotification(
    { kind: SCHOOL_EVENT.REPORT_ASSIGNED, payload: { title: 'Fuite d’eau', department: 'support' } },
    { resolved: { departmentUserIds: ['u1', 'u2'] } });
  ok(assigned.recipients.length === 2 && assigned.recipients.every((r) => r.id),
     'affectation → les agents du département, pas l’administration par défaut');
  ok(/support/.test(assigned.body), 'département nommé dans le corps');

  // Repli : personne du département n'a de compte → l'admin, sinon c'est perdu.
  const orphan = schoolNotification(
    { kind: SCHOOL_EVENT.REPORT_ASSIGNED, payload: { title: 'Fuite', department: 'support' } },
    { resolved: { departmentUserIds: [] } });
  ok(orphan.recipients[0].role === 'admin', 'département sans compte → repli sur l’administration');

  const status = schoolNotification(
    { kind: SCHOOL_EVENT.REPORT_STATUS, payload: { title: 'Fuite', status: 'resolu', reporterId: 'u7' } }, {});
  ok(status.recipients[0].id === 'u7', 'changement de statut → celui qui a signalé');

  const anon = schoolNotification(
    { kind: SCHOOL_EVENT.REPORT_STATUS, payload: { title: 'Fuite', status: 'resolu' } }, {});
  ok(anon === null, 'signalement anonyme → pas de destinataire, donc rien');
}

// ── Discipline → titulaire de la classe ────────────────────────────────────
{
  const inc = schoolNotification(
    { kind: SCHOOL_EVENT.DISCIPLINE_EVENT, payload: { table: 'disciplinary_incidents', className: '6e A' } },
    { resolved: { classTeacherUserId: 'u3' } });
  ok(inc.recipients[0].id === 'u3' && /6e A/.test(inc.body), 'incident → titulaire de la classe');

  const det = schoolNotification(
    { kind: SCHOOL_EVENT.DISCIPLINE_EVENT, payload: { table: 'student_detentions' } },
    { resolved: { classTeacherUserId: 'u3' } });
  ok(det.title === DISCIPLINE_LABELS.student_detentions.label, 'chaque table a son libellé propre');

  const horsPerimetre = schoolNotification(
    { kind: SCHOOL_EVENT.DISCIPLINE_EVENT, payload: { table: 'late_arrivals' } },
    { resolved: { classTeacherUserId: 'u3' } });
  ok(horsPerimetre === null, 'retards → muet (trop fréquent pour notifier)');

  ok(isDisciplineTable('student_warnings') && !isDisciplineTable('exit_permissions'),
     'périmètre des tables de discipline explicite');
}

// ── L'auteur ne se notifie pas lui-même ────────────────────────────────────
{
  const soi = schoolNotification(
    { kind: SCHOOL_EVENT.DISCIPLINE_EVENT, payload: { table: 'disciplinary_incidents' } },
    { resolved: { classTeacherUserId: 'u3' }, actorId: 'u3' });
  ok(soi === null, 'le titulaire qui saisit lui-même n’est pas notifié');
}

// ── Robustesse ─────────────────────────────────────────────────────────────
{
  ok(schoolNotification(null, null) === null, 'événement null → null');
  ok(schoolNotification({ kind: 'inconnu' }, {}) === null, 'kind inconnu → null');
  const poison = { kind: SCHOOL_EVENT.PERIOD_LOCKED, get payload() { throw new Error('boom'); } };
  ok(schoolNotification(poison, {}) === null, 'payload hostile → null (avalé)');
}

console.log(failed ? '\n❌ ÉCHEC' : '\n✅ Tous les tests passent');
process.exit(failed ? 1 : 0);
