// Relay de rejeu de l'outbox — rattrape les events dont le DISPATCH a échoué
// (crash entre la persistance et le dispatch, abonné momentanément KO, reprise
// après coupure). L'outbox `domain_events` étant durable et append-only, on peut
// redispatcher sans risque : les consommateurs sont IDEMPOTENTS (l'audit réécrit
// la même ligne, cf. auditSubscriber ; une notif déjà envoyée est dédupliquée).
//
// Le suivi de progression est INJECTÉ (`acked`) : ensemble des event.id déjà
// traités PAR CE CONSOMMATEUR. En test = Set mémoire ; en app = table/So store
// persistant (un curseur par consommateur). On n'utilise PAS `seq` ici : il n'est
// pas peuplé en LAN (chantier Phase 2) et l'id suffit à garantir l'idempotence.
//
//   const relay = createOutboxRelay({ outbox: repo('domain_events'), bus, acked });
//   await relay.pump({ schoolId });   // au démarrage + périodiquement
export function createOutboxRelay({ outbox, bus, acked }) {
  if (!outbox?.list) throw new Error('outboxRelay: outbox (repository) requis');
  if (!bus?.dispatch) throw new Error('outboxRelay: bus requis');
  if (!acked?.has || !acked?.add) throw new Error('outboxRelay: acked { has, add } requis');

  async function pump({ schoolId = null, limit = null } = {}) {
    const query = { order: { col: 'occurred_at', dir: 'asc' } };
    if (schoolId) query.match = { school_id: schoolId };
    if (limit != null) query.limit = limit;

    const events = await outbox.list(query);
    let processed = 0;
    const failures = [];
    for (const ev of events) {
      if (await acked.has(ev.id)) continue;      // déjà traité → skip
      const f = await bus.dispatch(ev);          // abonnés idempotents
      if (f.length) { failures.push(...f); continue; } // on réessaiera au prochain pump
      await acked.add(ev.id);
      processed++;
    }
    return { processed, failures: failures.length };
  }

  return { pump };
}
