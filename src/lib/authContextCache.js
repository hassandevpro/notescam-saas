// Cache local du contexte utilisateur (école, rôle, nom, classe…) pour
// permettre un DÉMARRAGE À FROID HORS-LIGNE.
//
// Principe : on n'altère JAMAIS le comportement en ligne. Le cache est écrit
// après chaque chargement réussi du contexte depuis Supabase, et il n'est LU
// qu'en repli — uniquement quand l'appel réseau échoue (machine hors-ligne).
//
// Cloisonné par user.id : un autre compte connecté sur le même appareil ne
// récupère jamais le contexte d'un précédent utilisateur.

const PREFIX = 'notescam_authctx_';

// Persiste le contexte d'un utilisateur. Tout objet renvoyé par
// getCurrentUserContext() est sérialisable en JSON (user, school = lignes brutes).
export function cacheUserContext(userId, ctx) {
  if (!userId || !ctx) return;
  try {
    localStorage.setItem(PREFIX + userId, JSON.stringify(ctx));
  } catch (_) { /* quota dépassé / navigation privée : on ignore */ }
}

// Recharge le contexte mis en cache pour un utilisateur, ou null s'il n'existe pas.
export function loadCachedContext(userId) {
  if (!userId) return null;
  try {
    const raw = localStorage.getItem(PREFIX + userId);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

// Supprime le cache : un userId précis, ou tout (déconnexion sans id connu).
export function clearCachedContext(userId) {
  try {
    if (userId) {
      localStorage.removeItem(PREFIX + userId);
      return;
    }
    Object.keys(localStorage)
      .filter((k) => k.startsWith(PREFIX))
      .forEach((k) => localStorage.removeItem(k));
  } catch (_) { /* ignored */ }
}
