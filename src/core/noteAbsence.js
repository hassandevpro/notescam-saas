// ABSENT ≠ ZÉRO ≠ PAS ENCORE SAISI — la lecture d'une case de `grades.value`, en un seul endroit.
//
//   « 14 » ou « 0 »  → 'note'  : une vraie note (un vrai zéro en est une)
//   « ABS »          → 'abs'   : absent à la composition, déclaré par l'enseignant
//   '' / null / rien → 'vide'  : pas encore saisi
//
// L'absence reste la chaîne « ABS » dans la colonne existante : aucune migration, et elle se
// synchronise comme avant. Un absent n'entre dans AUCUNE statistique (moyenne, rang, taux de
// réussite) : `valeurNumerique` rend null pour 'abs' comme pour 'vide', donc les moteurs qui
// ignorent les null ignorent aussi les absents — et un 0 saisi, lui, reste compté.

export const ABS = 'ABS';

export function etatNote(v) {
  if (v === undefined || v === null) return 'vide';
  const s = String(v).trim();
  if (s === '') return 'vide';
  if (s.toUpperCase() === ABS) return 'abs';
  return Number.isFinite(parseFloat(s.replace(',', '.'))) ? 'note' : 'vide';
}

/** La note comme nombre, ou null si absent / vide. Un « 0 » rend 0, jamais null. */
export function valeurNumerique(v) {
  return etatNote(v) === 'note' ? parseFloat(String(v).replace(',', '.')) : null;
}

/**
 * État d'une matière pour un élève sur plusieurs séquences : 'note' dès qu'une séquence est
 * notée, sinon 'abs' si l'une est ABS, sinon 'vide'. Sert au bulletin : « ABS » ou « — ».
 */
export function etatMatiere(gradeMap, classId, studentId, subjectId, seqs = [1, 2, 3, 4, 5, 6]) {
  let abs = false;
  for (const seq of seqs) {
    const e = etatNote((gradeMap?.[`${classId}_${studentId}_${seq}`] || {})[subjectId]);
    if (e === 'note') return 'note';
    if (e === 'abs') abs = true;
  }
  return abs ? 'abs' : 'vide';
}

/** Effectif d'une liste de cases : inscrits, ont composé, absents, pas saisis. */
export function effectifCompose(valeurs) {
  const out = { inscrits: 0, composes: 0, absents: 0, vides: 0 };
  for (const v of valeurs || []) {
    out.inscrits += 1;
    const e = etatNote(v);
    if (e === 'note') out.composes += 1; else if (e === 'abs') out.absents += 1; else out.vides += 1;
  }
  return out;
}
