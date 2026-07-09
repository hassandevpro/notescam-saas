// Domain Events du signalement (convention « au passé »). Les autres modules
// (notifications, audit, workflow, BI) s'y abonnent sans connaître ce domaine.
export const EVT = {
  RAISED:    'SignalementRaised',
  TRIAGED:   'SignalementTriaged',
  ASSIGNED:  'SignalementAssigned',
  STARTED:   'SignalementStarted',
  RESOLVED:  'SignalementResolved',
  CLOSED:    'SignalementClosed',
  REJECTED:  'SignalementRejected',
};

export const AGGREGATE = 'signalement';
