// Service applicatif SIGNALEMENT (cas d'usage). Orchestration Clean Architecture :
// RBAC -> chargement -> règle de la machine à états -> Unit of Work (persist +
// events). Aucune dépendance directe à Supabase/IndexedDB : tout est injecté,
// donc identique en Cloud, LAN et test.
//
//   const svc = createSignalementService({ repo, uow, rbac, ids });
//   await svc.raise(actor, { domain:'maintenance', title:'Fuite au bloc B' });
import { createEvent } from '../../kernel/domainEvent.js';
import { newSignalement, canTransition, STATUS } from './signalement.js';
import { EVT, AGGREGATE } from './events.js';
import { PERM } from './permissions.js';

const TABLE = 'signalements';

export function createSignalementService({ repo, uow, rbac, ids, clock = () => new Date().toISOString() }) {
  const store = repo(TABLE);

  function notFound(id) {
    const e = new Error(`signalement ${id} introuvable`); e.code = 'NOT_FOUND'; return e;
  }
  function illegal(from, to) {
    const e = new Error(`transition illégale ${from} -> ${to}`); e.code = 'INVALID_TRANSITION'; return e;
  }

  // Cas d'usage générique : applique une transition d'état + émet l'event.
  async function transition(actor, id, to, permission, eventType, { patch = {}, payload = {} } = {}) {
    const cur = await store.get(id);
    if (!cur) throw notFound(id);
    rbac.require(actor, permission, cur);            // ABAC : même école que cur
    if (!canTransition(cur.status, to)) throw illegal(cur.status, to);

    const next = { ...cur, ...patch, status: to, updated_at: clock() };
    const u = uow();
    u.stage(TABLE, 'update', next);
    u.emit(createEvent({
      schoolId: cur.school_id, aggregateType: AGGREGATE, aggregateId: id,
      eventType, actor, correlationId: cur.correlation_id || id,
      payload: { from: cur.status, to, domain: cur.domain, priority: cur.priority, ...payload },
    }));
    await u.commit();
    return next;
  }

  return {
    // Création — seul cas d'usage qui INSÈRE.
    async raise(actor, input) {
      rbac.require(actor, PERM.RAISE, { school_id: actor?.school_id });
      const s = newSignalement({
        id: ids(),
        schoolId: actor.school_id,
        reporterId: actor.id,
        reporterName: actor.name || actor.fullName || null,
        domain: input.domain,
        title: input.title,
        description: input.description,
        priority: input.priority,
        clock,
      });
      const u = uow();
      u.stage(TABLE, 'insert', s);
      u.emit(createEvent({
        schoolId: s.school_id, aggregateType: AGGREGATE, aggregateId: s.id,
        eventType: EVT.RAISED, actor, correlationId: s.id,
        payload: { domain: s.domain, priority: s.priority, title: s.title },
      }));
      await u.commit();
      return s;
    },

    get:  (id) => store.get(id),
    list: (query) => store.list(query),

    triage:  (actor, id, { domain, priority } = {}) =>
      transition(actor, id, STATUS.TRIAGED, PERM.TRIAGE, EVT.TRIAGED,
        { patch: { ...(domain && { domain }), ...(priority && { priority }) } }),

    assign:  (actor, id, assigneeId) =>
      transition(actor, id, STATUS.ASSIGNED, PERM.ASSIGN, EVT.ASSIGNED,
        { patch: { assignee_id: assigneeId }, payload: { assignee_id: assigneeId } }),

    start:   (actor, id) =>
      transition(actor, id, STATUS.IN_PROGRESS, PERM.RESOLVE, EVT.STARTED),

    resolve: (actor, id, resolution = '') =>
      transition(actor, id, STATUS.RESOLVED, PERM.RESOLVE, EVT.RESOLVED,
        { patch: { resolution }, payload: { resolution } }),

    close:   (actor, id) =>
      transition(actor, id, STATUS.CLOSED, PERM.CLOSE, EVT.CLOSED),

    reject:  (actor, id, reason = '') =>
      transition(actor, id, STATUS.REJECTED, PERM.TRIAGE, EVT.REJECTED,
        { patch: { resolution: reason }, payload: { reason } }),
  };
}
