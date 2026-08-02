// Émetteur d'événements finance — OBSERVATION (H2), best-effort.
//
// GARANTIES (« aucun changement de comportement ») :
//   • fire-and-forget : la fonction ne renvoie rien et ne s'attend jamais ;
//   • ne LÈVE JAMAIS : toute erreur (offline, RLS, kernel) est avalée et loggée ;
//   • n'ajoute AUCUNE latence au chemin d'écriture finance : l'appelant NE l'attend
//     pas ; l'écriture métier a déjà réussi et été renvoyée avant l'émission.
//
// L'émission réutilise le KERNEL (uow) : Cloud → kernel_emit (RPC SECURITY DEFINER,
// non-répudiation + audit atomique) ; LAN → /api/db/batch (domain_events + audit via
// l'abonné). L'import du kernel est DYNAMIQUE : le composition root n'est activé
// qu'au PREMIER événement finance réellement émis (zéro effet au chargement).
import { createEvent } from '../../kernel/domainEvent.js';
import { useAuthStore } from '../../store/authStore.js';

// Émet un fait finance. Ne jamais `await` côté appelant (fire-and-forget).
export function emitFinanceEvent({
  aggregateType, aggregateId = null, eventType, schoolId = null, payload = {}, correlationId = null,
} = {}) {
  try {
    const st = (typeof useAuthStore.getState === 'function' ? useAuthStore.getState() : null) || {};
    const sid = schoolId || st.school?.id || null;
    if (!sid || !eventType || !aggregateType) return; // rien à tracer sans école/type
    const actor = st.user ? { id: st.user.id, name: st.fullName || st.user.email || null } : null;
    const event = createEvent({ schoolId: sid, aggregateType, aggregateId, eventType, actor, correlationId, payload });
    // Dynamique : n'active le kernel qu'ici, et jamais dans un test pur (les
    // services ne sont pas importés par les tests d'ingénierie).
    import('../../kernel/index.js')
      .then(({ uow }) => uow().emit(event).commit())
      .catch((e) => console.warn('[finance-event] émission best-effort ignorée (observation) —', eventType, e?.message));

    // NOTIFICATION INTERNE — même fait, même garanties (fire-and-forget, jamais
    // levée, hors du chemin d'écriture). Branchée ICI et pas dans chaque service :
    // `emitFinanceEvent` est déjà le point de passage UNIQUE de tous les faits
    // finance, donc le métier n'est pas touché. Le tri (qui notifier, ou personne)
    // appartient au mapper pur notificationRules.js.
    import('../../lib/notificationProducers.js')
      .then(({ notifyFromFinanceEvent }) => notifyFromFinanceEvent(event))
      .catch((e) => console.warn('[finance-event] notification best-effort ignorée —', eventType, e?.message));
  } catch (e) {
    console.warn('[finance-event] émission ignorée —', e?.message);
  }
}
