// Réactions TRANSVERSES au signalement — la preuve du découplage : ces
// abonnés vivent hors du service, qui les ignore totalement. On peut en
// ajouter/retirer sans toucher au domaine signalement.
//
// `notify` est injecté (adaptateur du futur module #4 Notifications). En test
// c'est un espion ; en app il pontera notificationsService (in-app -> puis
// Email/SMS/WhatsApp/Push). L'audit, lui, est déjà branché globalement via
// attachAudit('*') : rien à faire ici pour tracer.
import { EVT } from './events.js';

export function attachSignalementReactions(bus, { notify }) {
  const off = [];

  // Nouveau signalement -> alerter la cellule de tri du domaine concerné.
  off.push(bus.subscribe(EVT.RAISED, async (e) => {
    await notify({
      school_id: e.school_id,
      audience: `triage:${e.payload.domain}`,
      priority: e.payload.priority,
      title: `Nouveau signalement — ${e.payload.title}`,
      correlation_id: e.correlation_id,
    });
  }));

  // Affectation -> prévenir le responsable désigné.
  off.push(bus.subscribe(EVT.ASSIGNED, async (e) => {
    await notify({
      school_id: e.school_id,
      audience: `user:${e.payload.assignee_id}`,
      title: `Un signalement vous est affecté`,
      correlation_id: e.correlation_id,
    });
  }));

  // Résolution -> informer l'auteur.
  off.push(bus.subscribe(EVT.RESOLVED, async (e) => {
    await notify({
      school_id: e.school_id,
      audience: `signalement:${e.aggregate_id}:reporter`,
      title: `Votre signalement a été résolu`,
      correlation_id: e.correlation_id,
    });
  }));

  return () => off.forEach((fn) => fn && fn()); // détacher tout
}
