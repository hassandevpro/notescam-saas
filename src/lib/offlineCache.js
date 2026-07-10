// Cache local léger (localStorage) pour les écrans finances en LECTURE : affiche
// les dernières données connues hors-ligne et évite de rester bloqué sur
// « Chargement… » quand le réseau (cloud) est injoignable.
//
// NB : ce n'est PAS l'offline-first complet (IndexedDB + file de synchro) des
// données cœur — juste un cache de confort pour les vues dérivées.

export function readCache(key) {
  try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
}

export function writeCache(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* quota / privé */ }
}

// Charge une liste avec cache : renvoie tout de suite le cache (si présent) puis
// rafraîchit. `hasData(rows)` évite d'écraser le cache par un résultat vide
// (typiquement une réponse vide obtenue hors-ligne).
//   const { rows, fromCache } = await loadWithCache(key, () => fetchX(), r => r.length);
export async function loadWithCache(key, fetcher, hasData = (r) => Array.isArray(r) && r.length) {
  let rows = [];
  let fromCache = false;
  try {
    rows = (await fetcher()) || [];
    if (hasData(rows)) writeCache(key, rows);
    else { const c = readCache(key); if (c && hasData(c)) { rows = c; fromCache = true; } }
  } catch {
    const c = readCache(key);
    rows = (c && hasData(c)) ? c : [];
    fromCache = !!(c && hasData(c));
  }
  return { rows, fromCache };
}
