// Tests du mapper PUR événement finance → notification interne.
//   node src/lib/_notificationRules.test.mjs
import { financeNotification, notifiedEventTypes, FINANCE_NOTIFICATION_RULES } from './notificationRules.js';
import { EVT } from '../domains/finance/events.js';

let failed = false;
const ok = (cond, msg) => { console.log(`${cond ? '✅' : '❌'} ${msg}`); if (!cond) failed = true; };

// Barème par défaut du moteur de validation : <25k RAF / 25k-250k Coord / >250k Fondatrice.
const ctx = { validationRules: null, currency: 'XAF', remoteGovernance: false };

// ── Dépense soumise → le validateur habilité POUR CE MONTANT ─────────────────
{
  const petit = financeNotification(
    { eventType: EVT.EXPENSE_SUBMITTED, payload: { amount: 10000, budget_chapter_id: 'L1' } }, ctx);
  const gros = financeNotification(
    { eventType: EVT.EXPENSE_SUBMITTED, payload: { amount: 900000, budget_chapter_id: 'L1' } }, ctx);
  ok(!!petit && petit.recipients.length === 1 && !!petit.recipients[0].role, 'dépense soumise → un rôle validateur ciblé');
  ok(!!gros && gros.recipients[0].role !== petit.recipients[0].role,
     'le rôle notifié CHANGE avec le montant (barème lu, jamais codé en dur)');
  ok(petit.link === '/app/depenses?budget=L1', 'lien profond vers la ligne (route réellement servie)');
  ok(petit.channels.join(',') === 'internal', 'canal interne uniquement');
}

// ── Gouvernance distante : ce moment appartient au serveur LAN ───────────────
{
  const res = financeNotification(
    { eventType: EVT.EXPENSE_SUBMITTED, payload: { amount: 10000 } },
    { ...ctx, remoteGovernance: true });
  ok(res === null, 'gouvernance distante → pas de doublon avec governanceApply (moment 1)');
}

// ── Décisions → le demandeur ────────────────────────────────────────────────
{
  const app = financeNotification(
    { eventType: EVT.EXPENSE_APPROVED, payload: { amount: 50000, created_by: 'u9', budget_chapter_id: 'L2' } }, ctx);
  ok(app.recipients.some((r) => r.id === 'u9'), 'approuvée → notifie le demandeur');
  ok(app.recipients.some((r) => r.role === 'caissier'), 'approuvée → notifie aussi le caissier (à décaisser)');

  const rej = financeNotification(
    { eventType: EVT.EXPENSE_REJECTED, payload: { amount: 50000, created_by: 'u9' } }, ctx);
  ok(rej.recipients.length === 1 && rej.recipients[0].id === 'u9', 'refusée → le demandeur seul');
}

// ── Montant formaté dans la devise de l'école ───────────────────────────────
{
  const res = financeNotification(
    { eventType: EVT.EXPENSE_PAID, payload: { amount: 250000, created_by: 'u1' } }, ctx);
  ok(/250/.test(res.body) && /XAF/.test(res.body), 'montant formaté via le module devises');
}

// ── Déblocage ───────────────────────────────────────────────────────────────
{
  const req = financeNotification(
    { eventType: EVT.UNLOCK_REQUESTED, payload: { requested_amount: 300000, budget_chapter_id: 'L3' } }, ctx);
  ok(!!req && !!req.recipients[0].role, 'déblocage demandé → décideur habilité au montant');

  const auth = financeNotification(
    { eventType: EVT.UNLOCK_AUTHORIZED, payload: { granted_amount: 300000, requested_by: 'u5' } }, ctx);
  ok(auth.recipients[0].id === 'u5', 'déblocage autorisé → le demandeur');
}

// ── Sécurité : jamais de diffusion à toute l'école sur de la finance ────────
{
  // created_by absent → aucun destinataire identifiable → on n'envoie RIEN
  // (sinon le dispatcher diffuserait la ligne à tout l'établissement).
  const res = financeNotification({ eventType: EVT.EXPENSE_REJECTED, payload: { amount: 5000 } }, ctx);
  ok(res === null, 'aucun destinataire identifiable → aucune notification (pas de diffusion)');
}

// ── L'auteur de l'action ne se notifie pas lui-même ─────────────────────────
{
  const soi = financeNotification(
    { eventType: EVT.EXPENSE_REJECTED, payload: { amount: 5000, created_by: 'u7' } },
    { ...ctx, actorId: 'u7' });
  ok(soi === null, 'l’auteur seul destinataire → aucune notification (pas d’auto-notification)');

  const autre = financeNotification(
    { eventType: EVT.EXPENSE_APPROVED, payload: { amount: 5000, created_by: 'u7' } },
    { ...ctx, actorId: 'u7' });
  ok(!!autre && autre.recipients.every((r) => r.id !== 'u7'),
     'auteur retiré mais le rôle caissier reste notifié');
}

// ── Règles muettes explicites ───────────────────────────────────────────────
{
  ok(financeNotification({ eventType: EVT.EXPENSE_DRAFTED, payload: {} }, ctx) === null, 'brouillon → muet');
  ok(financeNotification({ eventType: EVT.EXPENSE_DELETED, payload: {} }, ctx) === null, 'suppression → muet');
}

// ── Robustesse : ne lève jamais ─────────────────────────────────────────────
{
  ok(financeNotification(null, null) === null, 'événement null → null, pas d’exception');
  ok(financeNotification({ eventType: 'InventéParPersonne' }, ctx) === null, 'type inconnu → null');
  ok(Object.isFrozen(FINANCE_NOTIFICATION_RULES), 'table de règles gelée (non altérable à chaud)');
  // Une donnée d'entrée hostile ne doit pas remonter au chemin d'écriture financier.
  const poison = { eventType: EVT.EXPENSE_PAID, get payload() { throw new Error('boom'); } };
  ok(financeNotification(poison, ctx) === null, 'payload qui lève → null (avalé, le métier n’est jamais impacté)');
}

// ── Couverture ──────────────────────────────────────────────────────────────
ok(notifiedEventTypes().length >= 14, `${notifiedEventTypes().length} types d'événements couverts`);

console.log(failed ? '\n❌ ÉCHEC' : '\n✅ Tous les tests passent');
process.exit(failed ? 1 : 0);
