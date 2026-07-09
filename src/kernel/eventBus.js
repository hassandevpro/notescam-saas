// EventBus — publish / subscribe découplé, avec OUTBOX durable.
//
// publish(event) :
//   1. append de l'event dans un store durable (outbox `domain_events`) —
//      il survit au hors-ligne et au crash, et se réplique via la sync Phase 2.
//   2. dispatch synchrone aux abonnés locaux (audit, notifications, workflow…).
//
// Le store est INJECTÉ (interface { append(event) }) : en test = tableau
// mémoire ; en app = Repository('domain_events') sur le client supabase/LAN.
// Le bus lui-même ne connaît ni Supabase ni IndexedDB.
export function createEventBus({ store, onError = null } = {}) {
  const subs = new Map(); // eventType -> Set<handler> ; '*' = tous les events

  function subscribe(eventType, handler) {
    if (!subs.has(eventType)) subs.set(eventType, new Set());
    subs.get(eventType).add(handler);
    return () => subs.get(eventType)?.delete(handler); // unsubscribe
  }

  async function dispatch(event) {
    const handlers = [
      ...(subs.get(event.event_type) || []),
      ...(subs.get('*') || []),
    ];
    const failures = [];
    for (const h of handlers) {
      try {
        await h(event);
      } catch (err) {
        // Un abonné qui échoue ne doit PAS empêcher les autres ni annuler le
        // fait métier (l'event est déjà persisté dans l'outbox et sera rejoué).
        failures.push({ handler: h.name || 'anonymous', error: err });
        if (onError) { try { onError(err, event, h); } catch { /* ignore */ } }
      }
    }
    return failures;
  }

  async function publish(event) {
    if (store?.append) await store.append(event); // outbox d'abord (durable)
    return dispatch(event);
  }

  return { subscribe, publish, dispatch, _subs: subs };
}
