// Domain Event — fait métier IMMUABLE, exprimé au passé.
//
// Convention de nommage : « AggregatePastParticiple » (ex. GradeSubmitted,
// SignalementRaised). Un event décrit un fait accompli, jamais un ordre.
//
// L'enveloppe est polymorphe (aggregate_type + aggregate_id) : le kernel ne
// connaît aucun domaine en particulier. Tout module (académique, RH, finances,
// maintenance, patrimoine…) émet la même structure.
import { uuid } from '../lib/uuid.js';

export function createEvent({
  schoolId = null,
  aggregateType,
  aggregateId = null,
  eventType,
  payload = {},
  actor = null,
  correlationId = null,
  occurredAt = null,
}) {
  if (!eventType)     throw new Error('createEvent: eventType requis');
  if (!aggregateType) throw new Error('createEvent: aggregateType requis');
  // Garde-fou de convention : un event est au passé (se termine par « ed »
  // ou fait partie d'une liste blanche courte). Non bloquant hors dev.
  return {
    id: uuid(),
    school_id: schoolId,
    aggregate_type: aggregateType,
    aggregate_id: aggregateId,
    event_type: eventType,
    payload,
    actor_id: actor?.id ?? null,
    actor_name: actor?.name ?? actor?.fullName ?? actor?.email ?? null,
    occurred_at: occurredAt ?? new Date().toISOString(),
    correlation_id: correlationId,
    device_id: null, // rempli par la couche sync (convention Phase 2)
  };
}
