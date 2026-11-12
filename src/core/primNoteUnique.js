// BULLETIN DU PRIMAIRE « MATIÈRES À NOTE UNIQUE » — moteur PUR (aucun DOM, aucun store).
//
// Une matière = UNE note et SON barème (50, 20, 30, 40…), sans coefficient. Une compétence APC (plusieurs critères)
// y devient une matière : sa note est la SOMME de ses critères, son barème la somme de leurs barèmes.
//
// ── LES RÈGLES (impératives, demandées par l'école) ─────────────────────────
//   N/20          = note ÷ barème × 20, arrondi à 2 décimales « au plus proche, 0,005 vers le haut »
//   Moyenne       = total des notes ÷ (total des barèmes ÷ 20)  — JAMAIS une moyenne de moyennes
//                   (260,5 / 400 → 13,03 ; la moyenne des N/20 donnerait 13,55, résultat erroné)
//   Cote          = pourcentage note ÷ barème rapporté aux seuils de l'ÉCOLE (jamais codés ici)
//   Min–Max       = plage en /20 de la cote : [seuil × 20 / 100 ; seuil de la cote supérieure − 0,01]
//   Classe        = MÊME règle pour la moyenne de la classe, le premier, le dernier, le rang, réussis/échoués et la
//                   répartition : tout part de `moyenneNoteUnique`, pour que bulletin, PV et rapports concordent.
//
// Les arrondis se font en CENTIÈMES ENTIERS (comme core/primMoyennePoints) : `Math.round(x * 100) / 100` donne
// 13,56 pour 13,565 (stocké 13,56499…).

import { moyennePointsSur20 } from './primMoyennePoints.js';
import { primCote, PRIM_COTE_DEFAULT } from './primEngine.js';

/** Valeur de `classes.bulletin_format` qui sélectionne ce gabarit. */
export const FORMAT_NOTE_UNIQUE = 'note_unique';

/** Cette classe imprime-t-elle le bulletin à note unique ? (null / absent = l'ancien comportement) */
export const classeNoteUnique = (cls) => cls?.bulletin_format === FORMAT_NOTE_UNIQUE;

const GRADE_MAX = 20;

// Un nombre (≤ 2 décimales utiles) → centièmes entiers, sans dérive flottante.
const enCentiemes = (x) => {
  if (x === null || x === undefined || x === '') return null;   // Number(null) vaut 0 : une note ABSENTE n'est pas un zéro
  const n = Number(x);
  return Number.isFinite(n) ? Math.round(Number(`${n.toFixed(6)}e2`)) : null;
};

/** N/20 = note ÷ barème × 20, arrondi commercial à 2 décimales. null si la note ou le barème manque. */
export function noteSur20(note, bareme) {
  const t = enCentiemes(note);
  const s = enCentiemes(bareme);
  if (t === null || s === null || s <= 0) return null;
  // centièmes de N/20 = t × 20 ÷ s, arrondi « half up » en entiers
  const num = t * GRADE_MAX * 100;
  return Math.floor((2 * num + s) / (2 * s)) / 100;
}

/**
 * Les lignes du bulletin d'UN élève, à partir de ses matières.
 * @param {Array<{intitule:string, cells:Array<{achieved:number|null, possible:number|null}>, bareme?:number|null}>} matieres
 *   `cells` : une entrée par évaluation de la période (UA, séquence…). `bareme` (facultatif) : barème de la matière
 *   quand elle n'est pas encore notée, pour que la ligne l'affiche quand même.
 * @param {Array} baremeCotes  bandes de cotes de l'école (`seuil_min` en %)
 * @returns {Array<{intitule, note, bareme, sur20, cote, evaluee}>}  UNE ligne par matière — aucune ne disparaît.
 */
export function lignesNoteUnique(matieres, baremeCotes) {
  return (matieres || []).map((m) => {
    let t = 0; let s = 0; let n = 0;
    for (const c of m.cells || []) {
      const a = c ? enCentiemes(c.achieved) : null;
      const p = c ? enCentiemes(c.possible) : null;
      if (a === null || p === null || p <= 0) continue;
      t += a; s += p; n += 1;
    }
    const evaluee = n > 0;
    const note = evaluee ? t / 100 : null;
    const bareme = evaluee ? s / 100 : (Number(m.bareme) > 0 ? Number(m.bareme) : null);
    const sur20 = evaluee ? noteSur20(note, bareme) : null;
    const c = evaluee ? primCote(note, bareme, baremeCotes) : null;
    return { intitule: m.intitule, note, bareme, sur20, cote: c ? c.cote : null, libelle: c ? c.libelle : '', evaluee };
  });
}

/**
 * Total des notes, total des barèmes et MOYENNE /20 d'un élève. Seules les matières évaluées comptent, au
 * numérateur comme au dénominateur (une matière non encore notée ne fait pas baisser la moyenne).
 */
export function totauxNoteUnique(lignes) {
  const r = moyennePointsSur20((lignes || []).map((l) => ({ achieved: l.note, possible: l.bareme })));
  return { totalNotes: r.moyenne === null ? null : r.totalObtenu, totalBareme: r.moyenne === null ? null : r.totalBareme, moyenne: r.moyenne };
}

/**
 * LA moyenne d'un élève pour ce format, à partir des cellules (achieved/possible) de TOUTES ses matières.
 * Source unique : bulletin, rang, statistiques de classe, PV, rapports l'appellent tous.
 */
export function moyenneNoteUnique(cells) {
  return moyennePointsSur20(cells || []).moyenne;
}

/**
 * Plage /20 d'une cote : `min` = seuil de la cote × 20 ÷ 100 ; `max` = seuil de la cote supérieure − 0,01 (ou 20).
 * @returns {{min:number, max:number}|null}
 */
export function plageCoteSur20(cote, baremeCotes) {
  const bandes = (baremeCotes && baremeCotes.length ? baremeCotes : PRIM_COTE_DEFAULT)
    .slice().sort((a, b) => a.seuil_min - b.seuil_min);
  const i = bandes.findIndex((b) => b.cote === cote);
  if (i < 0) return null;
  const min = (bandes[i].seuil_min * GRADE_MAX) / 100;
  const sup = bandes[i + 1];
  return { min, max: sup ? Math.round(((sup.seuil_min * GRADE_MAX) / 100 - 0.01) * 100) / 100 : GRADE_MAX };
}

/** « 10–13.99 », « 18–20 » — le texte de la colonne Min–Max. */
export function plageCoteTexte(cote, baremeCotes) {
  const p = plageCoteSur20(cote, baremeCotes);
  if (!p) return '';
  const f = (x) => String(Number(x.toFixed(2)));
  return `${f(p.min)}–${f(p.max)}`;
}

/**
 * Titre du bulletin : « BULLETIN DE LA SÉQUENCE 1 », « BULLETIN DU PREMIER TRIMESTRE », « BULLETIN DE L'UA2 »…
 * Le nom de la période vient de la période elle-même (réglages de l'école) : le mot « Trimestre » n'est JAMAIS codé
 * en dur. Une école bilingue ajoute « / PROGRESS REPORT CARD ».
 * @param {{label?:string, ua?:number, value?:string}} period
 */
export function titreNoteUnique(period, sys = 'FR', bilingue = false) {
  const label = String(period?.label || '').trim();
  const maj = label.toLocaleUpperCase(sys === 'EN' ? 'en' : 'fr');
  let fr;
  let en;
  if (period?.ua) { fr = `BULLETIN DE L'UA${period.ua}`; en = `LEARNING UNIT ${period.ua} REPORT CARD`; }
  else if (!label) { fr = 'BULLETIN'; en = 'PROGRESS REPORT CARD'; }
  else if (/^(s[ée]quence|sequence)\b/i.test(label)) { fr = `BULLETIN DE LA ${maj}`; en = `${maj} PROGRESS REPORT CARD`; }
  else if (/^(trimestre|term)\b/i.test(label)) { fr = `BULLETIN DU ${maj}`; en = `${maj} PROGRESS REPORT CARD`; }
  else if (/^(annuel|annual)\b/i.test(label)) { fr = 'BULLETIN ANNUEL'; en = 'ANNUAL PROGRESS REPORT CARD'; }
  else { fr = `BULLETIN — ${maj}`; en = `${maj} PROGRESS REPORT CARD`; }
  if (sys === 'EN') return en;
  return bilingue ? `${fr} / PROGRESS REPORT CARD` : fr;
}
