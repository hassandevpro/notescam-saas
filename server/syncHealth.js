// server/syncHealth.js
// Santé RÉELLE de la synchronisation hybride (Cloud ↔ LAN) — état vécu, pas
// déclaratif. Alimente l'écran Paramètres pour distinguer :
//   CLOUD · HYBRIDE CONNECTÉ · HYBRIDE INTERNET INDISPONIBLE ·
//   HYBRIDE SYNCHRONISATION EN COURS · HYBRIDE ERREUR DE SYNCHRONISATION.
//
// Volontairement en mémoire (pas de table, pas de synchro) : c'est l'état du
// PROCESSUS local, réinitialisé à chaque démarrage du serveur LAN. Best-effort :
// n'influence jamais le métier, ne lève jamais.

let state = {
  inFlight: false,        // un cycle de synchro est en cours
  lastAttemptAt: null,    // ISO — début du dernier cycle
  lastSuccessAt: null,    // ISO — dernier cycle réussi (pull+push OK)
  lastErrorAt: null,      // ISO — dernier échec
  lastError: null,        // { kind: 'network'|'error', message } | null
  lastPushed: 0,          // # lignes poussées au dernier succès
  lastPulled: 0,          // # lignes tirées au dernier succès
};

// Distingue « Internet indisponible » (réseau) d'une vraie erreur de synchro
// (edge, jeton, contrainte…) pour l'affichage. Best-effort sur le message.
function classify(err) {
  const msg = (err && (err.message || String(err))) || 'Erreur inconnue';
  const code = err && (err.code || err.cause?.code || '');
  const NET = /ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENETUNREACH|EHOSTUNREACH|fetch failed|network|getaddrinfo|socket hang up|timeout/i;
  const kind = NET.test(code) || NET.test(msg) ? 'network' : 'error';
  return { kind, message: msg };
}

export function markSyncStart() {
  state.inFlight = true;
  state.lastAttemptAt = new Date().toISOString();
}

export function markSyncSuccess(res) {
  state.inFlight = false;
  state.lastSuccessAt = new Date().toISOString();
  state.lastError = null;
  state.lastErrorAt = null;
  state.lastPushed = res?.pushed ?? 0;
  state.lastPulled = res?.pulled ?? 0;
}

export function markSyncError(err) {
  state.inFlight = false;
  state.lastErrorAt = new Date().toISOString();
  state.lastError = classify(err);
}

export function syncHealth() {
  return { ...state };
}

// Dérive l'état affichable à partir de l'activation + la santé vécue.
// enabled : le mode hybride est-il activé (env ou réglage persistant).
export function hybridMode(enabled, h = state) {
  if (!enabled) return 'CLOUD';
  if (h.inFlight) return 'HYBRIDE_SYNC';
  if (h.lastError?.kind === 'network') return 'HYBRIDE_OFFLINE';
  if (h.lastError) return 'HYBRIDE_ERROR';
  if (h.lastSuccessAt) return 'HYBRIDE_CONNECTED';
  return 'HYBRIDE_SYNC'; // activé mais aucun cycle abouti encore → en cours
}
