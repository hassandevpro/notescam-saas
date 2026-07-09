// PoC TRANSVERSE : le cycle de vie complet d'un signalement, câblé sur le
// kernel réel (EventBus + Repository + UnitOfWork + RBAC + Audit) et un
// adaptateur de notification espionné. Prouve que le socle P0 fait collaborer
// plusieurs préoccupations (données, events, audit, notif, permissions) sans
// couplage. 100% mémoire.
//   node src/domains/signalement/_signalement.test.mjs
import { createMemoryDriver } from '../../kernel/drivers/memoryDriver.js';
import { createRepository } from '../../kernel/repository.js';
import { createEventBus } from '../../kernel/eventBus.js';
import { createUnitOfWork } from '../../kernel/unitOfWork.js';
import { createRbac } from '../../kernel/rbac.js';
import { attachAudit } from '../../kernel/auditSubscriber.js';
import { GRANTS } from '../../kernel/permissions.js';
import { createSignalementService } from './service.js';
import { attachSignalementReactions } from './subscribers.js';
import { STATUS } from './signalement.js';

let failed = false;
const ok = (cond, msg) => { console.log(`${cond ? '✅' : '❌'} ${msg}`); if (!cond) failed = true; };

// --- Câblage complet du kernel (comme l'app, mais en mémoire) ---------------
let seq = 0;
const ids = () => `sig-${++seq}`;
const driver = createMemoryDriver();
// L'outbox `domain_events` est écrite ATOMIQUEMENT par l'UoW (driver.commit),
// pas par le store du bus : on l'inspecte donc directement dans le driver.
const bus = createEventBus({ store: { append: () => {} } });
const outboxEvents = () =>
  createRepository('domain_events', driver).list({ order: { col: 'occurred_at', dir: 'asc' } });

const auditLog = [];               // audit_events
attachAudit(bus, { store: { append: (e) => { auditLog.push(e); } } });

const notifications = [];          // adaptateur notif espionné
attachSignalementReactions(bus, { notify: (n) => { notifications.push(n); } });

const rbac = createRbac({ grants: GRANTS });
const repo = (t) => createRepository(t, driver);
const uow = () => createUnitOfWork({ driver, bus });
const svc = createSignalementService({ repo, uow, rbac, ids });

// Acteurs de différents rôles / écoles.
const admin       = { id: 'a1', role: 'admin', school_id: 'E1', fullName: 'Directrice' };
const teacher     = { id: 't1', role: 'teacher', school_id: 'E1', fullName: 'Prof' };
const otherAdmin  = { id: 'a2', role: 'admin', school_id: 'E2', fullName: 'Autre école' };

// --- 1. Création (raise) ----------------------------------------------------
const sig = await svc.raise(teacher, {
  domain: 'maintenance', title: 'Fuite d’eau au bloc B', priority: 'high',
});
ok(sig.status === STATUS.NEW, 'raise crée un signalement au statut NEW');
const afterRaise = await outboxEvents();
ok(afterRaise.length === 1 && afterRaise[0].event_type === 'SignalementRaised', 'raise émet SignalementRaised dans l’outbox');
ok(auditLog.length === 1 && auditLog[0].action === 'SignalementRaised', 'l’audit capte l’event automatiquement (abonné *)');
ok(notifications.length === 1 && notifications[0].audience === 'triage:maintenance', 'la cellule de tri Maintenance est notifiée');

// --- 2. RBAC : un enseignant ne peut pas trier -----------------------------
let forbidden = false;
try { await svc.triage(teacher, sig.id, { priority: 'critical' }); }
catch (e) { forbidden = e.code === 'FORBIDDEN'; }
ok(forbidden, 'RBAC bloque le triage par un enseignant (permission manquante)');

// --- 3. Transition illégale : NEW -> CLOSED interdit ------------------------
let illegal = false;
try { await svc.close(admin, sig.id); }
catch (e) { illegal = e.code === 'INVALID_TRANSITION'; }
ok(illegal, 'machine à états : NEW -> CLOSED refusé');

// --- 4. ABAC : un admin d'une AUTRE école ne peut pas agir ------------------
let crossTenant = false;
try { await svc.triage(otherAdmin, sig.id); }
catch (e) { crossTenant = e.code === 'FORBIDDEN'; }
ok(crossTenant, 'ABAC : admin d’une autre école bloqué (isolation tenant)');

// --- 5. Cycle de vie complet, par l'admin ----------------------------------
await svc.triage(admin, sig.id, { priority: 'critical' });
const assigned = await svc.assign(admin, sig.id, 'agentX');
ok(assigned.status === STATUS.ASSIGNED && assigned.assignee_id === 'agentX', 'assign -> ASSIGNED + responsable');
ok(notifications.some((n) => n.audience === 'user:agentX'), 'le responsable affecté est notifié');
await svc.start(admin, sig.id);
const resolved = await svc.resolve(admin, sig.id, 'Joint remplacé');
ok(resolved.status === STATUS.RESOLVED && resolved.resolution === 'Joint remplacé', 'resolve -> RESOLVED + résolution');
ok(notifications.some((n) => n.title.includes('résolu')), 'l’auteur est notifié de la résolution');
const closed = await svc.close(admin, sig.id);
ok(closed.status === STATUS.CLOSED, 'close -> CLOSED (terminal)');

// --- 6. Invariants globaux du flux -----------------------------------------
// Events attendus : Raised, Triaged, Assigned, Started, Resolved, Closed = 6.
const allEvents = await outboxEvents();
ok(allEvents.length === 6, `outbox contient les 6 events du cycle (obtenu ${allEvents.length})`);
ok(auditLog.length === 6, 'chaque event a produit exactement une ligne d’audit');
ok(allEvents.every((e) => e.correlation_id === sig.id), 'tous les events partagent la même correlation_id');
ok((await svc.get(sig.id)).status === STATUS.CLOSED, 'l’état persisté final est CLOSED');

console.log(failed ? '\n❌ ÉCHECS' : '\n✅ Signalement (PoC transverse) OK');
process.exit(failed ? 1 : 0);
