// LE PROGRAMME ANGLOPHONE D'UNE CLASSE BILINGUE DU PRIMAIRE — onze compétences jumelles
//
// ── CE QUE DEMANDE L'ÉCOLE ─────────────────────────────────────────────────
//
// THE GENIUS, CE1 BIL (2026-11-03) : les onze compétences nationales du primaire (1A…6B) sont
// saisies et imprimées en FRANÇAIS ; une classe bilingue doit les avoir AUSSI en ANGLAIS, avec
// leurs propres notes, chacune commençant par son code (1A, 1B…). C'est le « Class 2 / CP » de
// l'école : deux blocs, English et French, chacun avec son total (242 + 260 = 502 / 560).
//
// ── LA FORME RETENUE ───────────────────────────────────────────────────────
//
// Une compétence MAISON par compétence nationale, au libellé anglais du référentiel
// (`referentielI18n.PRIM_COMPETENCE_EN`) et au code « <code national>-EN » : 1A-EN, 1B-EN…
//   • le code COMMENCE par le chiffre et la lettre du national : la famille (le chiffre) et
//     l'ordre suivent, et l'école lit « 1A » en tête ;
//   • il se TERMINE par « -EN » : c'est la marque explicite du programme (aucune colonne de
//     plus). `primProgramme.programmesParCode` la lit pour ranger la ligne dans le bloc English ;
//   • il n'est jamais égal à un code du ministère : deux lignes « 1A » se confondraient dans
//     tous les index par code du carnet.
//
// Chaque jumelle est portée par une matière de la classe (`subjects.prim_competence_id`) : c'est
// ce qui la garde dans le périmètre de la classe (`refClassScope.primForClass`, qui ne retient une
// compétence maison que si une matière la réclame).
//
// NE SONT PAS DOUBLÉES : les compétences d'école (Chinois, Economics, Management, Practical
// Work…). Elles n'ont pas de jumelle nationale et restent dans « Autres matières ».
//
// MODULE PUR : aucun store, aucun réseau.
import { PRIM_COMPETENCE_EN } from './referentielI18n.js';

export const SUFFIXE_EN = '-EN';

/** Cette compétence est-elle une jumelle anglophone posée par l'école ? */
export const estJumelleAnglophone = (c) =>
  !!c && c.school_id != null && new RegExp(`${SUFFIXE_EN}$`).test(String(c.code || ''));

/**
 * Ce qu'il y a à créer pour qu'une classe porte les onze compétences en anglais.
 *
 * @param {object[]} competences  compétences du niveau (nationales ET maison)
 * @param {object[]} classSubjects  lignes `subjects` de la classe
 * @returns {Array<{ nat, code, intitule, coef, ligne, matiere }>}  une entrée par compétence
 *   nationale ; `ligne` / `matiere` valent null quand il reste à les créer.
 */
export function planProgrammeAnglophone({ competences = [], classSubjects = [] } = {}) {
  const liste = (competences || []).filter((c) => c && c.id != null);
  const nationales = liste.filter((c) => !c.school_id && PRIM_COMPETENCE_EN[c.id]);
  const jumelles = liste.filter(estJumelleAnglophone);
  return nationales.map((nat) => {
    const code = `${nat.code}${SUFFIXE_EN}`;
    const ligne = jumelles.find((j) => j.code === code) || null;
    const matiere = ligne
      ? (classSubjects || []).find((s) => s && s.prim_competence_id === ligne.id) || null
      : null;
    return {
      nat, code, intitule: PRIM_COMPETENCE_EN[nat.id],
      coef: Number(nat.coefficient) > 0 ? Number(nat.coefficient) : 1,
      ligne, matiere,
    };
  });
}

/** Combien de compétences jumelles sont déjà en place, sur combien ? */
export function etatProgrammeAnglophone(plan = []) {
  const total = plan.length;
  const completes = plan.filter((p) => p.ligne && p.matiere).length;
  return { total, completes, aFaire: total - completes };
}
