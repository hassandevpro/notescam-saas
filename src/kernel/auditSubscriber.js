// Audit Log — abonné générique du bus : CHAQUE Domain Event devient une ligne
// d'audit immuable. Aucun domaine n'appelle l'audit en dur ; il suffit d'émettre
// un event. Remplace, à terme, les appels directs à historyService.logAction().
//
// Le store d'audit est injecté ({ append(entry) }) : Repository('audit_events')
// en app (Cloud/LAN), tableau mémoire en test.
//
// IDEMPOTENCE : la ligne d'audit reprend l'`id` de l'event (relation 1:1). Un
// rejeu du même event (relay après dispatch manqué) réécrit donc la MÊME ligne
// au lieu d'en créer un doublon — à condition que le store fasse un upsert
// (onConflict:id), ce que garantit le câblage index.js.

export function attachAudit(bus, { store }) {
  return bus.subscribe('*', async function auditAll(event) {
    await store.append({
      id: event.id, // = event.id → rejeu idempotent (upsert sur la clé primaire)
      school_id:      event.school_id,
      action:         event.event_type,
      aggregate_type: event.aggregate_type,
      target_id:      event.aggregate_id,
      actor_id:       event.actor_id,
      actor_name:     event.actor_name,
      payload:        event.payload ?? {},
      correlation_id: event.correlation_id ?? null,
      event_id:       event.id, // idempotence / traçabilité vers l'outbox
      at:             event.occurred_at,
    });
  });
}
