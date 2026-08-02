// Règles de NOTIFICATION INTERNE dérivées des DOMAIN EVENTS finance (PUR).
//
// POURQUOI UN MAPPER ET PAS DES notify() ÉPARPILLÉS : la finance possède déjà un
// vocabulaire d'événements complet (domains/finance/events.js) et un point
// d'émission UNIQUE (emitFinanceEvent). Brancher les notifications là-dessus
// évite de toucher au métier (services, statuts, resolveValidatorRole) : un fait
// finance déjà accompli entre, un descriptif de notification sort — ou rien.
//
// PUR : aucune I/O, aucun store, aucun accès réseau → testable en Node.
// Le service (notificationProducers.js) fournit le contexte et fait l'envoi.
//
// CANAL : interne UNIQUEMENT dans cette itération. Les canaux externes existent
// dans le moteur mais aucun expéditeur ne vide `notification_outbox` — annoncer
// un email qui ne partira jamais serait pire que ne rien annoncer.
import { EVT } from '../domains/finance/events.js';
import { resolveValidatorRole } from '../governance/validationEngine.js';
import { formatMoney } from './currency.js';

// ── Helpers de construction ──────────────────────────────────────────────────

const money = (amount, currency) => formatMoney(Number(amount) || 0, currency);

// Destinataires : `{ id }` = utilisateur précis, `{ role }` = tous ceux qui l'ont.
const toUser = (id) => (id ? [{ id }] : []);
const toRole = (role) => (role ? [{ role }] : []);

// Lien profond RÉELLEMENT servi par une route existante. `/app/depenses` accepte
// `?budget=<ligne>` (Expenses.jsx la présélectionne) — c'est le lien le plus utile
// pour une dépense ou un déblocage. Il n'existe AUCUNE route `/app/depenses/:id`.
const expenseLink = (payload) =>
  payload?.budget_chapter_id ? `/app/depenses?budget=${payload.budget_chapter_id}` : '/app/depenses';

// Rôle habilité à décider pour ce montant — LU depuis le barème configuré, jamais
// codé en dur (invariant du moteur de validation : aucun montant en dur).
const validatorFor = (ctx, amount) =>
  resolveValidatorRole(ctx?.validationRules, 'expense', Number(amount) || 0);

// ── Table de règles : type d'événement → descripteur (ou null) ────────────────
// Chaque règle reçoit ({ payload, aggregateId, ctx }) et renvoie soit un
// descripteur { recipients, type, title, body, link }, soit null (= on ne notifie
// pas ; c'est un choix explicite, pas un oubli).
export const FINANCE_NOTIFICATION_RULES = Object.freeze({

  // ── Dépenses ───────────────────────────────────────────────────────────────

  // Soumise → prévient CELUI QUI PEUT LA VALIDER pour ce montant.
  [EVT.EXPENSE_SUBMITTED]: ({ payload, ctx }) => {
    // En gouvernance DISTANTE, ce moment appartient au serveur LAN
    // (governanceApply.requestRemoteApproval notifie déjà les décideurs
    // distants). Notifier ici en plus ferait double.
    if (ctx?.remoteGovernance) return null;
    const role = validatorFor(ctx, payload?.amount);
    if (!role) return null;
    return {
      recipients: toRole(role),
      type: 'expense_to_validate',
      title: 'Dépense à valider',
      body: `Une dépense de ${money(payload?.amount, ctx?.currency)} attend votre validation.`,
      link: expenseLink(payload),
    };
  },

  // Approuvée → le demandeur est informé, ET le caissier sait qu'il y a à décaisser.
  [EVT.EXPENSE_APPROVED]: ({ payload, ctx }) => ({
    recipients: [...toUser(payload?.created_by), { role: 'caissier' }],
    type: 'expense_approved',
    title: 'Dépense approuvée',
    body: `La dépense de ${money(payload?.amount, ctx?.currency)} a été approuvée et peut être décaissée.`,
    link: expenseLink(payload),
  }),

  [EVT.EXPENSE_REJECTED]: ({ payload, ctx }) => ({
    recipients: toUser(payload?.created_by),
    type: 'expense_rejected',
    title: 'Dépense refusée',
    body: `Votre dépense de ${money(payload?.amount, ctx?.currency)} a été refusée.`,
    link: expenseLink(payload),
  }),

  [EVT.EXPENSE_PAID]: ({ payload, ctx }) => ({
    recipients: toUser(payload?.created_by),
    type: 'expense_paid',
    title: 'Dépense décaissée',
    body: `Votre dépense de ${money(payload?.amount, ctx?.currency)} a été payée.`,
    link: expenseLink(payload),
  }),

  // Brouillon créé / dépense supprimée / annulée : bruit sans destinataire utile.
  [EVT.EXPENSE_DRAFTED]: () => null,
  [EVT.EXPENSE_DELETED]: () => null,
  [EVT.EXPENSE_CANCELLED]: ({ payload, ctx }) => ({
    recipients: toUser(payload?.created_by),
    type: 'expense_cancelled',
    title: 'Dépense annulée',
    body: `La dépense de ${money(payload?.amount, ctx?.currency)} a été annulée.`,
    link: expenseLink(payload),
  }),

  // ── Déblocage de ligne épuisée ─────────────────────────────────────────────

  // Demandé → le décideur habilité POUR CE MONTANT (même barème que les dépenses).
  [EVT.UNLOCK_REQUESTED]: ({ payload, ctx }) => {
    const role = validatorFor(ctx, payload?.requested_amount);
    if (!role) return null;
    return {
      recipients: toRole(role),
      type: 'unlock_requested',
      title: 'Déblocage de ligne demandé',
      body: `Une ligne budgétaire est épuisée : déblocage de ${money(payload?.requested_amount, ctx?.currency)} demandé.`,
      link: expenseLink(payload),
    };
  },

  [EVT.UNLOCK_REFUSED]: ({ payload }) => ({
    recipients: toUser(payload?.requested_by),
    type: 'unlock_refused',
    title: 'Déblocage refusé',
    body: 'Votre demande de déblocage de ligne a été refusée.',
    link: expenseLink(payload),
  }),

  [EVT.UNLOCK_AUTHORIZED]: ({ payload, ctx }) => ({
    recipients: toUser(payload?.requested_by),
    type: 'unlock_authorized',
    title: 'Déblocage autorisé',
    body: `Dépassement exceptionnel autorisé pour ${money(payload?.granted_amount, ctx?.currency)}.`,
    link: expenseLink(payload),
  }),

  [EVT.UNLOCK_INCREASED]: ({ payload, ctx }) => ({
    recipients: toUser(payload?.requested_by),
    type: 'unlock_increased',
    title: 'Ligne budgétaire augmentée',
    body: `La ligne a été relevée de ${money(payload?.granted_amount, ctx?.currency)}.`,
    link: expenseLink(payload),
  }),

  // ── Opérations budgétaires tracées (révision / réallocation) ────────────────

  // NB : le payload d'une révision porte `new_amount` (budgetOpsService), pas `amount`.
  [EVT.REVISION_REQUESTED]: ({ payload, ctx }) => {
    const role = validatorFor(ctx, payload?.new_amount ?? payload?.amount);
    if (!role) return null;
    return {
      recipients: toRole(role),
      type: 'budget_revision_requested',
      title: 'Révision de budget demandée',
      body: 'Une révision de l’enveloppe annuelle attend votre décision.',
      link: '/app/budgets',
    };
  },
  [EVT.REVISION_APPLIED]: ({ payload }) => ({
    recipients: toUser(payload?.requested_by),
    type: 'budget_revision_applied',
    title: 'Révision de budget appliquée',
    body: 'Votre demande de révision de l’enveloppe annuelle a été appliquée.',
    link: '/app/budgets',
  }),
  [EVT.REVISION_REJECTED]: ({ payload }) => ({
    recipients: toUser(payload?.requested_by),
    type: 'budget_revision_rejected',
    title: 'Révision de budget refusée',
    body: 'Votre demande de révision de l’enveloppe annuelle a été refusée.',
    link: '/app/budgets',
  }),

  [EVT.REALLOCATION_REQUESTED]: ({ payload, ctx }) => {
    const role = validatorFor(ctx, payload?.amount);
    if (!role) return null;
    return {
      recipients: toRole(role),
      type: 'budget_realloc_requested',
      title: 'Réallocation demandée',
      body: `Un transfert de ${money(payload?.amount, ctx?.currency)} entre lignes attend votre décision.`,
      link: '/app/budgets',
    };
  },
  [EVT.REALLOCATION_APPLIED]: ({ payload }) => ({
    recipients: toUser(payload?.requested_by),
    type: 'budget_realloc_applied',
    title: 'Réallocation appliquée',
    body: 'Votre transfert entre lignes budgétaires a été appliqué.',
    link: '/app/budgets',
  }),
  [EVT.REALLOCATION_REJECTED]: ({ payload }) => ({
    recipients: toUser(payload?.requested_by),
    type: 'budget_realloc_rejected',
    title: 'Réallocation refusée',
    body: 'Votre transfert entre lignes budgétaires a été refusé.',
    link: '/app/budgets',
  }),
});

// ── Point d'entrée ───────────────────────────────────────────────────────────
// Renvoie le descriptif de notification d'un événement finance, ou `null` s'il
// n'y a rien à notifier (type inconnu, règle muette, aucun destinataire
// identifiable). Ne lève JAMAIS : une règle qui casse ne doit pas remonter
// jusqu'au chemin d'écriture financier.
export function financeNotification(event = {}, ctx = {}) {
  try {
    const rule = FINANCE_NOTIFICATION_RULES[event?.eventType];
    if (typeof rule !== 'function') return null;
    const desc = rule({ payload: event?.payload || {}, aggregateId: event?.aggregateId || null, ctx });
    if (!desc || !desc.title) return null;
    // Une notification sans destinataire identifiable serait DIFFUSÉE à toute
    // l'école (cf. dispatcher : recipients vide = diffusion). Sur de la finance,
    // c'est une fuite — on préfère ne rien envoyer.
    // On retire aussi l'AUTEUR de l'action : se notifier soi-même de ce qu'on
    // vient de faire est du bruit. (Un ciblage par RÔLE n'est pas filtrable ici :
    // on ne sait pas qui le porte — c'est assumé.)
    const recipients = (desc.recipients || [])
      .filter((r) => r && (r.id || r.role))
      .filter((r) => !(ctx?.actorId && r.id && r.id === ctx.actorId));
    if (!recipients.length) return null;
    return { ...desc, recipients, channels: ['internal'] };
  } catch {
    return null;
  }
}

// Liste des événements réellement notifiés (utile aux tests et à la doc).
export function notifiedEventTypes() {
  return Object.keys(FINANCE_NOTIFICATION_RULES).filter(
    (k) => typeof FINANCE_NOTIFICATION_RULES[k] === 'function',
  );
}
