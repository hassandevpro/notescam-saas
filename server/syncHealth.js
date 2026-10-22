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
  // Dernier CONTRÔLE D'INTÉGRITÉ Cloud ↔ LAN (exécuté AUTOMATIQUEMENT après chaque
  // synchro). Une synchro mécaniquement réussie mais qui laisse des tables DIVERGENTES
  // n'est PAS « validée à 100 % ».
  lastVerifyAt: null,     // ISO — dernier contrôle abouti
  lastVerifyOk: null,     // true/false/null(jamais contrôlé)
  lastMismatches: [],     // noms des tables divergentes au dernier contrôle
  lastReport: null,       // rapport compact (dashboard + empreinte globale + verdict) pour l'UI
  // DIVERGENCE PERSISTANTE — la seule qui coûte quelque chose.
  //
  // Une divergence qui se répare au cycle suivant est normale : deux bases qui
  // s'écrivent en parallèle divergent une seconde, puis convergent. Une
  // divergence qui revient CYCLE APRÈS CYCLE, sur les MÊMES tables, est un
  // défaut qui ne se réparera pas tout seul — et c'est elle qui, avant le
  // plafonnement de l'audit, pouvait consommer le quota d'invocations du Cloud
  // en descendant indéfiniment dans les mêmes partitions.
  //
  // On compte donc les cycles consécutifs où l'empreinte de divergence ne
  // change pas, et on lève une alerte au-delà du seuil. Compter les cycles
  // plutôt que les minutes rend la mesure indépendante de la cadence.
  divergenceStreak: 0,       // cycles consécutifs avec LA MÊME divergence
  divergenceSince: null,     // ISO — début de cette série
  divergenceSignature: null, // empreinte des tables divergentes, pour détecter un changement
  verifyTruncated: false,    // la dernière localisation a-t-elle été écourtée par le budget ?
  scopesLastCycle: 0,        // appels de portée consommés au dernier cycle
};

// Au-delà de ce nombre de cycles sur la même divergence, l'état n'est plus
// « en cours de convergence » mais « bloqué ». À 5 minutes par cycle, 12 cycles
// font une heure : assez long pour qu'une réparation normale ait eu lieu, assez
// court pour alerter le jour même.
const DIVERGENCE_ALERT_STREAK = Number(process.env.NOTESCAM_DIVERGENCE_ALERT_STREAK || 12);

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

// Enregistre le résultat d'un contrôle d'intégrité (best-effort, ne lève jamais).
// Conserve un rapport COMPACT (métriques + empreinte globale + verdict) pour que l'UI
// affiche le « rapport de synchronisation » automatiquement, sans action de l'admin.
export function markVerification(report) {
  state.lastVerifyAt = report?.at || new Date().toISOString();
  state.lastVerifyOk = !!report?.ok;
  state.lastMismatches = Array.isArray(report?.mismatches) ? report.mismatches.slice() : [];

  // Suivi de la divergence persistante. La signature est la liste TRIÉE des
  // tables divergentes : si elle change, c'est une autre divergence et la série
  // repart de zéro — on ne veut pas additionner deux défauts différents.
  const sig = state.lastMismatches.length ? state.lastMismatches.slice().sort().join(',') : null;
  if (!sig) {
    state.divergenceStreak = 0;
    state.divergenceSince = null;
    state.divergenceSignature = null;
  } else if (sig === state.divergenceSignature) {
    state.divergenceStreak += 1;
  } else {
    state.divergenceStreak = 1;
    state.divergenceSince = state.lastVerifyAt;
    state.divergenceSignature = sig;
  }
  state.verifyTruncated = !!report?.truncated;
  state.scopesLastCycle = Number(report?.summary?.scopesCompared || 0);
  state.lastReport = report ? {
    ok: !!report.ok,
    at: report.at,
    dashboard: report.dashboard || [],
    globalChecksum: report.globalChecksum || null,
    mismatches: report.mismatches || [],
    mismatchLabels: report.mismatchLabels || [],
    divergences: report.divergences || [],
    summary: report.summary || null,
  } : null;
}

// RÉPLICATION DES FICHIERS (photos, logos, cachets) — dernier cycle connu.
//
// Sans cela, l'école n'avait aucun moyen de savoir où en étaient ses photos :
// elles ne montaient pas du tout, et rien à l'écran ne le disait. On garde des
// COMPTEURS et le motif des échecs, jamais un nom de fichier d'élève.
export function markFileSync(rapport) {
  if (!rapport) return;
  state.lastFileSync = {
    at: new Date().toISOString(),
    montes: rapport.montes || 0,
    restants: rapport.restants || 0,
    references: rapport.references || 0,
    absentsDuDisque: rapport.absentsDuDisque || 0,
    ignores: (rapport.ignores || []).length,
    erreurs: (rapport.erreurs || []).slice(0, 3),
  };
}

export function syncHealth() {
  return { ...state, divergenceAlert: divergenceAlert() };
}

/**
 * Alerte de divergence persistante, ou null.
 *
 * Lue par l'écran Paramètres et par le diagnostic. Elle répond à la question
 * qu'aucun indicateur ne posait : « cette désynchronisation est-elle en train
 * de se résorber, ou est-elle bloquée depuis ce matin ? »
 */
export function divergenceAlert(h = state, seuil = DIVERGENCE_ALERT_STREAK) {
  if (!h.divergenceSignature || h.divergenceStreak < seuil) return null;
  return {
    level: 'warning',
    streak: h.divergenceStreak,
    since: h.divergenceSince,
    tables: h.divergenceSignature.split(','),
    truncated: !!h.verifyTruncated,
    message: `Les mêmes tables divergent depuis ${h.divergenceStreak} cycles de synchronisation `
           + `(${h.divergenceSignature}). La réparation automatique n'y parvient pas : `
           + `une intervention est nécessaire.`,
  };
}

// Dérive l'état affichable à partir de l'activation + la santé vécue.
// enabled : le mode hybride est-il activé (env ou réglage persistant).
export function hybridMode(enabled, h = state) {
  if (!enabled) return 'CLOUD';
  if (h.inFlight) return 'HYBRIDE_SYNC';
  if (h.lastError?.kind === 'network') return 'HYBRIDE_OFFLINE';
  if (h.lastError) return 'HYBRIDE_ERROR';
  // Synchro mécaniquement OK MAIS données divergentes : ce n'est PAS « connecté sain ».
  if (h.lastVerifyOk === false) return 'HYBRIDE_MISMATCH';
  if (h.lastSuccessAt) return 'HYBRIDE_CONNECTED';
  return 'HYBRIDE_SYNC'; // activé mais aucun cycle abouti encore → en cours
}
