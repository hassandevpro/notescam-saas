// Câblage applicatif du kernel (Cloud & LAN). NON importé par les tests
// (il tire `./supabase` → import.meta.env). C'est le seul endroit qui relie
// le kernel pur au client réel.
//
//   import { bus, repo, uow, rbac } from '../kernel';
//
import { supabase } from '../lib/supabase'; // aliasé -> localClient en LAN (Vite)
import { createPgDriver } from './drivers/pgDriver.js';
import { createRepository } from './repository.js';
import { createEventBus } from './eventBus.js';
import { createUnitOfWork } from './unitOfWork.js';
import { attachAudit } from './auditSubscriber.js';
import { createOutboxRelay } from './outboxRelay.js';
import { createRbac } from './rbac.js';
import { GRANTS } from './permissions.js';

const driver = createPgDriver(supabase);

// Repository fabrique — un domaine fait `repo('signalements')`.
export function repo(table) {
  return createRepository(table, driver);
}

// Outbox durable : l'UoW écrit `domain_events` DANS la même transaction que les
// données (driver.commit) — cf. unitOfWork.js. Le `store` du bus n'est conservé
// que pour d'éventuels publishers directs (bus.publish) hors UoW.
const eventsRepo = createRepository('domain_events', driver);
const auditRepo  = createRepository('audit_events', driver);

export const bus = createEventBus({
  store: { append: (e) => eventsRepo.insert(e) },
  onError: (err, event) =>
    console.warn('[eventBus] abonné en échec (event conservé dans l’outbox, rejeu par le relay)', event.event_type, err),
});

// Audit = simple abonné du bus (LAN + mémoire). En Cloud (driver.emit), l'audit
// est dérivé SERVEUR par kernel_emit dans la même transaction que l'event : on
// n'attache donc PAS l'abonné client (la RLS refuserait l'insert, et ce serait
// un doublon). Le store d'audit LAN passe par /api/db → table append-only avec
// actor_id estampillé par le serveur (non-répudiation), rejeu idempotent.
if (!driver.emit) {
  attachAudit(bus, { store: { append: (e) => auditRepo.upsert(e) } });
}

export const rbac = createRbac({ grants: GRANTS });

// Nouvelle Unit of Work par cas d'usage (usage unique).
export function uow() {
  return createUnitOfWork({ driver, bus });
}

// Relay de rejeu de l'outbox. NON exécuté automatiquement : le suivi `acked`
// (event.id déjà traités) doit être PERSISTANT et BORNÉ, sinon chaque démarrage
// rejouerait tout l'historique. L'appelant fournit un store `acked` durable
// (table dédiée) puis déclenche relay.pump({ schoolId }) au boot / périodiquement.
export function makeOutboxRelay(acked) {
  return createOutboxRelay({ outbox: eventsRepo, bus, acked });
}
