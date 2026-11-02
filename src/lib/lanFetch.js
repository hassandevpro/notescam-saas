// src/lib/lanFetch.js
// L'APPEL AUTHENTIFIÉ AU SERVEUR LAN — une seule fois, pour tout le monde.
//
// LE DÉFAUT, TROUVÉ LE 02/11/2026 EN PILOTANT UN VRAI NAVIGATEUR. Les routes
// `/api/sync/*` sont protégées par `requireLocalAdmin`, qui lit le jeton dans
// l'en-tête `Authorization`. Or `SyncStatePanel` et `SyncHistory` appelaient
// `fetch('/api/sync/health')` et `fetch('/api/sync/audit')` NUS, sans jeton.
// Les deux recevaient donc **403**, et comme les deux terminaient par
// `.catch(() => {})`, le 403 disparaissait sans un mot : l'écran affichait
// « En attente de la première synchronisation… » et un journal vide, pour
// toujours. À l'école, ça se lit exactement comme « la synchronisation ne
// marche pas » — alors que c'était l'ÉCRAN qui ne voyait rien.
//
// Le code juste existait déjà, en privé, dans `src/lib/backupService.js`. Il
// était simplement au mauvais endroit — un `lanToken()` local que personne
// d'autre ne pouvait appeler. C'est la leçon de I32, mot pour mot : la panne
// vient de la duplication, pas de la valeur.
//
// NE PAS NOMMER CE FICHIER `.../supabase.js` NI RIEN QUI S'Y TERMINE : en
// édition LAN, Vite remplace `/^.*\/supabase$/` par `localClient.js`, et ce
// module disparaîtrait du paquet.

// La session vit en `sessionStorage` — PAS en `localStorage` : elle doit mourir
// avec l'onglet, c'est le correctif de la session qui survivait au
// redémarrage du poste (cf. src/lib/localClient.js).
export const SESSION_KEY = 'nc_lan_session';

export function lanToken() {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null')?.access_token || null;
  } catch { return null; }
}

export function lanHeaders(body) {
  const token = lanToken();
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(body ? { 'Content-Type': 'application/json' } : {}),
  };
}

/**
 * Appelle une route du serveur LAN avec le jeton de la session en cours.
 * Rend le `data` de l'enveloppe { data, error } et LÈVE sur erreur — un appel
 * qui échoue en silence est précisément ce qui a rendu l'écran de
 * synchronisation muet pendant des mois.
 */
export async function lanFetch(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: lanHeaders(body),
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* corps vide */ }
  if (!res.ok || json?.error) {
    throw new Error(json?.error?.message || `HTTP ${res.status}`);
  }
  return json?.data ?? json;
}
