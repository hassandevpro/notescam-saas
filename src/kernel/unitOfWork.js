// Unit of Work — regroupe les écritures d'un cas d'usage + les Domain Events,
// et les valide ensemble selon le pattern « persist-then-publish ».
//
// Pourquoi pas une transaction ACID ? Depuis un client supabase-js (et a
// fortiori hors-ligne), on ne peut pas ouvrir de transaction multi-tables.
// On garantit donc :
//   1. les écritures de données sont appliquées d'abord ;
//   2. les events ne sont publiés qu'APRÈS succès des écritures ;
//   3. chaque event est d'abord persisté dans l'outbox (bus.publish) avant
//      dispatch → il survit au crash / hors-ligne et se rejoue à la sync.
//
// Si une écriture échoue, on lève AVANT toute publication : aucun abonné
// (audit, notif, workflow) ne réagit à un fait qui n'a pas eu lieu.
//
// TRANSACTIONAL OUTBOX. Si le driver expose `commit(opList)` (mémoire, LAN via
// /api/db/batch), les écritures métier ET l'append de l'outbox `domain_events`
// sont validées dans UNE SEULE transaction → un crash ne peut pas laisser la
// donnée sans son event, ni l'inverse. Sinon (driver Cloud supabase-js, sans
// transaction multi-tables), on retombe sur un enchaînement séquentiel best-effort
// (l'outbox reste écrite avant le dispatch). Les projections (audit, notif) sont
// des consommateurs ASYNCHRONES et IDEMPOTENTS, rattrapés par le relay de rejeu
// (outboxRelay.js) en cas de dispatch manqué.
export function createUnitOfWork({ driver, bus, outboxTable = 'domain_events' }) {
  const ops = [];    // { table, type: 'insert'|'upsert'|'update'|'delete', entity }
  const events = [];

  function stage(table, type, entity) {
    ops.push({ table, type, entity });
    return api;
  }
  function emit(event) {
    events.push(event);
    return api;
  }

  async function applyOp({ table, type, entity }) {
    switch (type) {
      case 'insert': return driver.insert(table, entity);
      case 'upsert': return driver.upsert(table, entity);
      case 'update': {
        const { id, ...patch } = entity;
        return driver.update(table, id, patch);
      }
      case 'delete': return driver.delete(table, entity.id);
      default: throw new Error(`UnitOfWork: opération inconnue « ${type} »`);
    }
  }

  async function commit() {
    // 1. Données + append outbox (append-only) dans la MÊME unité atomique.
    const eventOps = events.map((e) => ({ table: outboxTable, type: 'insert', entity: e }));
    const all = [...ops, ...eventOps];
    if (typeof driver.commit === 'function') {
      await driver.commit(all);                     // atomique : tout ou rien (LAN batch, mémoire)
    } else if (typeof driver.emit === 'function') {
      // Cloud : données via le client (RLS), events via kernel_emit (RPC
      // SECURITY DEFINER — la RLS refuse un insert direct dans domain_events).
      for (const op of ops) await applyOp(op);
      for (const ev of events) await driver.emit(ev);
    } else {
      for (const op of all) await applyOp(op);       // repli séquentiel (tests mémoire)
    }
    // 2. Dispatch aux consommateurs (audit, notif…) APRÈS persistance durable.
    //    Un échec ici n'annule pas le fait métier : l'event est dans l'outbox et
    //    sera redispatché par le relay (abonnés idempotents).
    const failures = [];
    for (const ev of events) failures.push(...(await bus.dispatch(ev)));
    const summary = { ops: ops.length, events: events.length, dispatchFailures: failures.length };
    ops.length = 0; events.length = 0;              // UoW à usage unique
    return summary;
  }

  const api = { stage, emit, commit, _ops: ops, _events: events };
  return api;
}
