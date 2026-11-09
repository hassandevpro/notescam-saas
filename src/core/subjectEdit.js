// ÉDITION DES MATIÈRES D'UNE CLASSE : règles pures (réordonner, abaisser un barème).
//
// Les matières « par matières » d'une classe du primaire (Dictée /40, Physique /50…) se créent, se renomment
// et se pèsent déjà dans ClassSubjectsEditor. Il manquait deux gestes, qui ont chacun leur règle.

/**
 * Notes DÉJÀ saisies pour une matière qui dépasseraient un nouveau barème.
 * « ABS », les cases vides et le non-numérique ne dépassent rien. Même principe que le barème d'une colonne
 * du primaire : on ne transforme pas en silence un 35/40 en 35/20 — l'enseignant corrige d'abord.
 *
 * @param gradeMap  { "<classe>_<élève>_<séquence>": { [subjectId]: valeur } }  (la forme du store)
 * @returns {{ nombre: number, plusHaute: number|null }}
 */
export function notesAuDessusDuBareme(gradeMap, classId, subjectId, nouveauMax) {
  const max = Number(nouveauMax);
  let nombre = 0;
  let plusHaute = null;
  for (const [cle, scores] of Object.entries(gradeMap || {})) {
    if (!cle.startsWith(`${classId}_`)) continue;
    const brut = scores?.[subjectId];
    if (brut === undefined || brut === null || brut === '' || String(brut).toUpperCase() === 'ABS') continue;
    const n = Number(String(brut).replace(',', '.'));
    if (!Number.isFinite(n)) continue;
    if (n > max) { nombre += 1; if (plusHaute === null || n > plusHaute) plusHaute = n; }
  }
  return { nombre, plusHaute };
}

/** Un barème est valide s'il est un nombre > 0 (libre : /40, /50, /12,5…). Jamais 20 ni 100 imposés. */
export function baremeValide(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0;
}

/**
 * Déplacer une matière d'un cran (delta = -1 vers le haut, +1 vers le bas).
 * Rend les SEULES lignes à réécrire : [{ id, position }] — au plus deux, et [] au bord de la liste.
 * Les positions sont d'abord normalisées 0..n-1 : des positions nulles ou en double (cas des matières
 * importées) ne doivent pas rendre le geste sans effet.
 */
export function deplacer(lignes, id, delta) {
  const liste = [...(lignes || [])];
  const i = liste.findIndex((l) => l.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= liste.length) return [];
  [liste[i], liste[j]] = [liste[j], liste[i]];
  const ecrire = [];
  liste.forEach((l, k) => { if (l.position !== k) ecrire.push({ id: l.id, position: k }); });
  return ecrire;
}
