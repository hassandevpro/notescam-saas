// Lecture des INTENTIONS budgétaires distantes — logique PURE, testable en Node.
//
// Le journal d'événements est la source de vérité : une demande (`BudgetOperationRequested`)
// est plus tard tranchée par le serveur de l'école, qui écrit `BudgetOperationApplied`
// ou `BudgetOperationRejected` portant la MÊME corrélation. Ce module ne fait que
// relire ce journal ; il n'écrit rien et n'appelle aucun service (cf.
// budgetOperationService.js pour la couche I/O).

function safeParse(s) { try { return JSON.parse(s); } catch { return {}; } }

function correlationOf(e) {
  const payload = typeof e?.payload === 'object' && e.payload !== null ? e.payload : safeParse(e?.payload);
  return payload?.correlation_id;
}

// Issue d'une intention + INSTANT du verdict (Invariant #6 : « appliqué »
// UNIQUEMENT sur confirmation LAN). `pending` = transmise, pas encore appliquée.
//
// L'horodatage retenu est celui du VERDICT, jamais celui de la demande : c'est lui
// qui permet à l'écran de faire disparaître un message « Appliquée »/« Rejetée »
// une fois qu'il a été vu, sans jamais escamoter une demande encore en attente.
export function budgetOperationOutcome(events, correlationId) {
  let applied = null; let rejected = null;
  for (const e of events || []) {
    if (!e || correlationOf(e) !== correlationId) continue;
    if (e.event_type === 'BudgetOperationApplied') { if (!applied) applied = e; }
    else if (e.event_type === 'BudgetOperationRejected') { if (!rejected) rejected = e; }
  }
  const verdict = applied || rejected;
  return {
    status: applied ? 'applied' : rejected ? 'rejected' : 'pending',
    resolvedAt: verdict?.occurred_at || null,
  };
}

export function budgetOperationStatus(events, correlationId) {
  return budgetOperationOutcome(events, correlationId).status;
}

// Délai de grâce d'affichage d'un verdict dans le bandeau de gouvernance distante.
export const INTENT_NOTICE_MS = 5 * 60 * 1000;

// Ce que le bandeau doit AFFICHER. Deux natures d'information, deux durées de vie :
//   - `pending` : la demande attend le serveur de l'école → visible tant qu'elle dure,
//     l'escamoter ferait passer une saisie en transit pour une saisie perdue ;
//   - verdict   : information ponctuelle → s'efface seule passé le délai de grâce,
//     sinon un « Rejetée » d'il y a trois semaines reste à l'écran pour toujours.
// Un verdict sans horodatage exploitable est considéré comme déjà vu (rien à annoncer).
export function visibleIntents(intents, now = Date.now(), graceMs = INTENT_NOTICE_MS) {
  return (intents || []).filter((i) => {
    if (!i) return false;
    if (i.status === 'pending') return true;
    const at = i.resolvedAt ? Date.parse(i.resolvedAt) : NaN;
    if (Number.isNaN(at)) return false;
    return now - at < graceMs;
  });
}
