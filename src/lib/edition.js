// Édition courante de l'app.
//   - 'cloud' (défaut)      : backend = Supabase (distant, nécessite Internet)
//   - 'lan'  (build --mode lan) : backend = serveur local du réseau de l'école
//
// VITE_EDITION est injecté par vite.config.js (define).
export const IS_LAN = import.meta.env.VITE_EDITION === 'lan';

// « En ligne » du point de vue du BACKEND — PAS de la connexion Internet.
//
// En cloud, le backend est distant : on dépend de `navigator.onLine`.
// En LAN, le backend est le serveur local du réseau de l'école ; il est
// joignable même si le poste n'a AUCUN accès Internet. Se fier à
// `navigator.onLine` (false sans Internet) faisait basculer toutes les
// écritures en file d'attente sans jamais les pousser au serveur local
// (symptôme : « Hors ligne · N en attente » et données non partagées).
// On se considère donc toujours « en ligne » en LAN : si le serveur local
// est momentanément injoignable, l'appel HTTP échoue → l'opération retombe
// dans la syncQueue (même repli qu'en cloud) et sera rejouée au prochain flush.
export function backendOnline() {
  if (IS_LAN) return true;
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}
