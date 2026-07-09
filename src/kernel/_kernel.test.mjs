// Tests du kernel : Repository, EventBus, UnitOfWork, RBAC.
// 100% mémoire (createMemoryDriver) — aucune dépendance réseau / Vite / React.
//   node src/kernel/_kernel.test.mjs
import { createMemoryDriver } from './drivers/memoryDriver.js';
import { createRepository } from './repository.js';
import { createEventBus } from './eventBus.js';
import { createUnitOfWork } from './unitOfWork.js';
import { createOutboxRelay } from './outboxRelay.js';
import { createRbac } from './rbac.js';
import { createEvent } from './domainEvent.js';

let failed = false;
const ok = (cond, msg) => { console.log(`${cond ? '✅' : '❌'} ${msg}`); if (!cond) failed = true; };

// --- Repository sur driver mémoire -----------------------------------------
{
  const driver = createMemoryDriver();
  const repo = createRepository('widgets', driver);
  await repo.insert({ id: 'w1', school_id: 's1', name: 'A' });
  await repo.insert({ id: 'w2', school_id: 's1', name: 'B' });
  await repo.insert({ id: 'w3', school_id: 's2', name: 'C' });
  ok((await repo.get('w1')).name === 'A', 'Repository.get retourne la ligne');
  ok((await repo.list({ match: { school_id: 's1' } })).length === 2, 'Repository.list filtre par match');
  await repo.update('w1', { name: 'A2' });
  ok((await repo.get('w1')).name === 'A2', 'Repository.update applique le patch');
  await repo.remove('w2');
  ok((await repo.get('w2')) === null, 'Repository.remove supprime');
}

// --- EventBus : outbox + dispatch + wildcard + isolation des échecs ---------
{
  const outbox = [];
  const bus = createEventBus({ store: { append: (e) => { outbox.push(e); } } });
  const seen = [];
  bus.subscribe('ThingHappened', (e) => seen.push(`typed:${e.payload.n}`));
  bus.subscribe('*', (e) => seen.push(`all:${e.event_type}`));
  bus.subscribe('ThingHappened', () => { throw new Error('abonné cassé'); });

  const failures = await bus.publish(createEvent({
    aggregateType: 'thing', aggregateId: 't1', eventType: 'ThingHappened', payload: { n: 42 },
  }));
  ok(outbox.length === 1, 'EventBus persiste dans l’outbox avant dispatch');
  ok(seen.includes('typed:42') && seen.includes('all:ThingHappened'), 'EventBus dispatch typé + wildcard');
  ok(failures.length === 1, 'EventBus isole l’abonné en échec (les autres passent)');
}

// --- UnitOfWork : transactional outbox (données + outbox atomiques) ---------
{
  const driver = createMemoryDriver();          // fournit driver.commit atomique
  const published = [];
  const bus = createEventBus({ store: { append: () => {} } });
  bus.subscribe('*', (e) => published.push(e.event_type));

  const u = createUnitOfWork({ driver, bus });
  u.stage('orders', 'insert', { id: 'o1', school_id: 's1', total: 100 });
  u.emit(createEvent({ schoolId: 's1', aggregateType: 'order', aggregateId: 'o1', eventType: 'OrderPlaced' }));
  const summary = await u.commit();

  const outboxRows = await createRepository('domain_events', driver).list({ match: { school_id: 's1' } });
  ok((await createRepository('orders', driver).get('o1'))?.total === 100, 'UoW persiste les données au commit');
  ok(outboxRows.length === 1 && outboxRows[0].event_type === 'OrderPlaced',
    'UoW écrit l’event dans l’outbox (domain_events) via driver.commit');
  ok(published.includes('OrderPlaced'), 'UoW dispatch les events APRÈS persistance');
  ok(summary.ops === 1 && summary.events === 1, 'UoW retourne un résumé exact');
  ok(u._ops.length === 0 && u._events.length === 0, 'UoW est à usage unique (vidé après commit)');
}

// --- driver.commit : ATOMICITÉ (tout ou rien) -------------------------------
{
  const driver = createMemoryDriver();
  let threw = false;
  try {
    await driver.commit([
      { table: 'orders', type: 'insert', entity: { id: 'oA', total: 1 } },
      { table: 'orders', type: 'bogus',  entity: { id: 'oB' } },        // op invalide
    ]);
  } catch { threw = true; }
  ok(threw, 'driver.commit lève sur op invalide');
  ok((await driver.get('orders', 'oA')) === null, 'driver.commit ROLLBACK : aucune écriture partielle après échec');
}

// --- Relay de rejeu : redispatch idempotent de l'outbox ---------------------
{
  const driver = createMemoryDriver();
  const outbox = createRepository('domain_events', driver);
  await outbox.insert(createEvent({ id: 'r1', schoolId: 's1', aggregateType: 'x', eventType: 'A', occurredAt: '2026-01-01T00:00:00Z' }));
  await outbox.insert(createEvent({ id: 'r2', schoolId: 's1', aggregateType: 'x', eventType: 'B', occurredAt: '2026-01-02T00:00:00Z' }));

  const dispatched = [];
  const bus = createEventBus({ store: { append: () => {} } });
  bus.subscribe('*', (e) => dispatched.push(e.id));

  const seen = new Set();
  const acked = { has: (id) => seen.has(id), add: (id) => { seen.add(id); } };
  const relay = createOutboxRelay({ outbox, bus, acked });

  const first = await relay.pump({ schoolId: 's1' });
  ok(first.processed === 2, 'Relay traite les events non acquittés');
  const second = await relay.pump({ schoolId: 's1' });
  ok(second.processed === 0, 'Relay est idempotent (ne rejoue pas un event déjà acquitté)');
  ok(dispatched.length === 2, 'Relay ne dispatch chaque event qu’une fois');
}

// --- RBAC + ABAC ------------------------------------------------------------
{
  const rbac = createRbac({ grants: { admin: ['thing.do'], super_admin: ['*'] } });
  const admin = { id: 'u1', role: 'admin', school_id: 's1' };
  const other = { id: 'u2', role: 'admin', school_id: 's2' };
  const sa    = { id: 'u3', role: 'super_admin', school_id: 's9' };
  const res   = { school_id: 's1' };
  ok(rbac.can(admin, 'thing.do', res) === true, 'RBAC autorise la permission accordée');
  ok(rbac.can(admin, 'thing.other', res) === false, 'RBAC refuse une permission non accordée');
  ok(rbac.can(other, 'thing.do', res) === false, 'ABAC refuse une autre école (isolation tenant)');
  ok(rbac.can(sa, 'anything', res) === true, 'RBAC : super_admin (*) tout permis');
  // Durcissement ABAC : une ressource sans school_id ne contourne plus l'isolation.
  ok(rbac.can(admin, 'thing.do', { school_id: null }) === false, 'ABAC : school_id null refusé (plus de bypass silencieux)');
  ok(rbac.can(admin, 'thing.do', { __global: true }) === true, 'ABAC : ressource globale EXPLICITE autorisée');
  ok(rbac.can(admin, 'thing.do', null) === true, 'ABAC : pas de ressource ciblée → vérif permission seule');
  let threw = false;
  try { rbac.require(other, 'thing.do', res); } catch (e) { threw = e.code === 'FORBIDDEN'; }
  ok(threw, 'RBAC.require lève FORBIDDEN');
}

console.log(failed ? '\n❌ ÉCHECS' : '\n✅ Kernel OK');
process.exit(failed ? 1 : 0);
