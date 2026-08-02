// Règles de NOTIFICATION INTERNE de la vie de l'établissement (PUR).
//
// Pendant de notificationRules.js (finance), pour les familles qui n'ont PAS de
// bus d'événements : périodes de saisie, RH (congés), signalements, discipline.
// Ces modules sont branchés au niveau de leur point d'écriture unique — les deux
// fabriques `makeEntity` (hrService / vieScolaireService) et les services de
// périodes / signalements.
//
// PUR : aucune I/O. Toute RÉSOLUTION d'identité (classe → titulaire → compte,
// agent → compte) est faite en amont par notificationProducers.js et arrive ici
// dans `ctx.resolved` : le mapper ne fait que décider QUOI dire et À QUI, jamais
// aller le chercher.
//
// CANAL : interne uniquement (aucun expéditeur externe n'existe encore).

// ── Vocabulaire ──────────────────────────────────────────────────────────────
export const SCHOOL_EVENT = Object.freeze({
  PERIOD_LOCKED:    'period.locked',
  PERIOD_UNLOCKED:  'period.unlocked',
  LEAVE_REQUESTED:  'hr.leave.requested',
  LEAVE_DECIDED:    'hr.leave.decided',
  REPORT_ASSIGNED:  'report.assigned',
  REPORT_STATUS:    'report.status_changed',
  DISCIPLINE_EVENT: 'discipline.recorded',
});

const toUser = (id) => (id ? [{ id }] : []);
const toRole = (role) => (role ? [{ role }] : []);

// Libellés de discipline : table → (titre, verbe). Une seule règle couvre les
// 5 entités de vie scolaire qui concernent le titulaire d'une classe.
export const DISCIPLINE_LABELS = Object.freeze({
  disciplinary_incidents: { label: 'Incident disciplinaire', verb: 'un incident a été enregistré' },
  disciplinary_actions:   { label: 'Sanction disciplinaire', verb: 'une sanction a été prononcée' },
  student_warnings:       { label: 'Avertissement',          verb: 'un avertissement a été émis' },
  student_detentions:     { label: 'Retenue',                verb: 'une retenue a été programmée' },
  parent_meetings:        { label: 'Convocation des parents', verb: 'une convocation a été émise' },
});

export const SCHOOL_NOTIFICATION_RULES = Object.freeze({

  // ── Périodes de saisie : concerne TOUS les enseignants ─────────────────────
  // Ciblage par RÔLE : le verrou est une information collective, et on ne veut
  // pas générer une ligne par enseignant.
  [SCHOOL_EVENT.PERIOD_LOCKED]: ({ payload }) => ({
    recipients: toRole('teacher'),
    type: 'period_locked',
    title: 'Saisie des notes verrouillée',
    body: `${payload?.label || 'La séquence'} est verrouillée : les notes ne peuvent plus être modifiées.`,
    link: '/app/notes',
  }),

  [SCHOOL_EVENT.PERIOD_UNLOCKED]: ({ payload }) => ({
    recipients: toRole('teacher'),
    type: 'period_unlocked',
    title: 'Saisie des notes ouverte',
    body: `${payload?.label || 'La séquence'} est ouverte : la saisie des notes est de nouveau possible.`,
    link: '/app/notes',
  }),

  // ── RH : congés ────────────────────────────────────────────────────────────
  // Demande → l'administration ; décision → l'agent concerné (compte résolu).
  [SCHOOL_EVENT.LEAVE_REQUESTED]: ({ payload }) => ({
    recipients: toRole('admin'),
    type: 'leave_requested',
    title: 'Demande de congé',
    body: `${payload?.staffName || 'Un agent'} demande un congé ${payload?.type || ''}`.trim()
      + (payload?.days ? ` (${payload.days} j).` : '.'),
    link: '/app/personnel',
  }),

  [SCHOOL_EVENT.LEAVE_DECIDED]: ({ payload, ctx }) => {
    const approved = payload?.status === 'approved' || payload?.status === 'accepte';
    return {
      recipients: toUser(ctx?.resolved?.staffUserId),
      type: approved ? 'leave_approved' : 'leave_refused',
      title: approved ? 'Congé accordé' : 'Congé refusé',
      body: approved
        ? `Votre demande de congé${payload?.days ? ` de ${payload.days} jour(s)` : ''} a été accordée.`
        : `Votre demande de congé${payload?.days ? ` de ${payload.days} jour(s)` : ''} a été refusée.`,
      link: '/app/personnel',
    };
  },

  // ── Signalements ───────────────────────────────────────────────────────────
  // Le signalement part vers un DÉPARTEMENT (`assigned_department`), et les
  // départements de `staff` emploient exactement le même vocabulaire : la carte
  // reportEngine.DEFAULT_ASSIGNMENT ne produit que administration / surveillance /
  // comptabilite / support, tous présents dans staffService.STAFF_DEPARTMENTS.
  // On peut donc viser les AGENTS du département (résolus en amont), et non plus
  // l'administration par défaut. Repli sur `admin` si personne n'y a de compte —
  // sinon un signalement affecté à un département sans utilisateur serait perdu.
  [SCHOOL_EVENT.REPORT_ASSIGNED]: ({ payload, ctx }) => {
    const users = ctx?.resolved?.departmentUserIds || [];
    return {
      recipients: users.length ? users.map((id) => ({ id })) : toRole('admin'),
      type: 'report_assigned',
      title: 'Signalement affecté',
      body: `« ${payload?.title || 'Signalement'} » est affecté à ${payload?.department || 'un département'}.`,
      link: '/app/signalements',
    };
  },

  // Changement de statut → celui QUI A SIGNALÉ (il attend une suite).
  [SCHOOL_EVENT.REPORT_STATUS]: ({ payload }) => ({
    recipients: toUser(payload?.reporterId),
    type: 'report_status',
    title: 'Suivi de votre signalement',
    body: `« ${payload?.title || 'Votre signalement' } » est passé au statut : ${payload?.status || '—'}.`,
    link: '/app/signalements',
  }),

  // ── Discipline → le TITULAIRE de la classe de l'élève ──────────────────────
  [SCHOOL_EVENT.DISCIPLINE_EVENT]: ({ payload, ctx }) => {
    const meta = DISCIPLINE_LABELS[payload?.table];
    if (!meta) return null;                       // table hors périmètre = muet
    return {
      recipients: toUser(ctx?.resolved?.classTeacherUserId),
      type: 'discipline_recorded',
      title: meta.label,
      body: `Dans votre classe${payload?.className ? ` ${payload.className}` : ''}, ${meta.verb}.`,
      link: '/app/vie-scolaire',
    };
  },
});

// ── Point d'entrée ───────────────────────────────────────────────────────────
// Mêmes garanties que financeNotification : ne lève jamais, jamais de diffusion
// à toute l'école, l'auteur ne se notifie pas lui-même.
export function schoolNotification(event = {}, ctx = {}) {
  try {
    const rule = SCHOOL_NOTIFICATION_RULES[event?.kind];
    if (typeof rule !== 'function') return null;
    const desc = rule({ payload: event?.payload || {}, ctx });
    if (!desc || !desc.title) return null;
    const recipients = (desc.recipients || [])
      .filter((r) => r && (r.id || r.role))
      .filter((r) => !(ctx?.actorId && r.id && r.id === ctx.actorId));
    if (!recipients.length) return null;
    return { ...desc, recipients, channels: ['internal'] };
  } catch {
    return null;
  }
}

// Tables de vie scolaire qui déclenchent une notification au titulaire.
export function isDisciplineTable(table) {
  return Object.prototype.hasOwnProperty.call(DISCIPLINE_LABELS, table);
}
