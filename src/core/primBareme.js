// BORNES DU BARÈME D'UNE ÉVALUATION DU PRIMAIRE — fonctions PURES.
//
// ── LE DÉFAUT, RELEVÉ CHEZ BRIGHT CONTINENT LE 2026-11-04 ──────────────────
// « On n'arrive pas à ajouter une note dans Langue et culture nationale. » La file de
// saisies non transmises ne contenait qu'une ligne, refusée 25 fois par le Cloud :
//
//     prim_notes · competence 5A · critère « pratique » · UA 2 · points_max = 513
//     « violates check constraint "prim_notes_points_max_sain" »
//
// La base borne le barème d'une évaluation à 1…200 (`supabase_prim_note_points_max.sql`).
// L'écran, lui, acceptait n'importe quel nombre ≥ 0 dans la petite case d'en-tête
// (`BaremeCell`) : « 513 » — une faute de frappe — était posé comme barème de TOUTE la
// colonne, et chaque note saisie ensuite dans cette colonne emportait `points_max = 513`.
// Le Cloud refusait donc chaque note de la colonne, pour toujours, sans un mot à l'écran.
//
// La parade est à trois niveaux : l'écran refuse (et dit pourquoi), l'écriture refuse
// (défense en profondeur), et une ligne déjà bloquée est réparée au lieu de rester coincée.
export const PRIM_POINTS_MAX_LIMITE = 200;

/** `null`/`undefined` = « le barème officiel du référentiel » : valide. Sinon 1…200. */
export function pointsMaxSain(v) {
  if (v === null || v === undefined) return true;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 && n <= PRIM_POINTS_MAX_LIMITE;
}

/**
 * Répare la charge utile d'une ligne `prim_notes` dont le barème est hors bornes.
 * On NE TOUCHE PAS à la note : seul le barème invalide est retiré (NULL = barème
 * officiel du référentiel, la valeur que le schéma définit déjà pour « pas de barème
 * d'école »). Rend `null` si la charge est saine ou n'est pas une note du primaire.
 */
export function repairPrimNotePayload(payload) {
  if (!payload || typeof payload !== 'object') return null;
  if (pointsMaxSain(payload.points_max)) return null;
  return { ...payload, points_max: null };
}
