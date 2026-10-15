// Construction des lignes du bulletin PRIMAIRE APC en disposition COMPACTE.
//
// Moteur PUR : aucun store, aucun DOM, aucun réseau → testable sous Node.
//
// POURQUOI C'EST ICI ET PAS DANS L'ÉCRAN. Ce calcul décide ce qu'un parent lit
// sur le carnet de son enfant : quelle note, sur quel barème, et si une
// compétence compte ou non. Laissé dans le composant, il n'était vérifiable
// qu'à l'œil, sur un écran, un élève à la fois. Ici, les cas qui comptent — note
// nulle contre note absente, trimestre incomplet, barème qui change d'une UA à
// l'autre — sont couverts par des tests.
//
// ENTRÉE : la sortie de `primAnnualRowsFor` (écran Bulletins), c'est-à-dire les
// lignes DÉJÀ calculées du bulletin détaillé :
//   [{ code, intitule, criteres:[{id,nom,points_max}],
//      uas:[{ ua, notesByCritere:{[critId]:note}, baremes:{[critId]:max},
//             achieved, possible, cote }],
//      totalAchieved, totalPossible, totalCote }]
//
// On RÉUTILISE cette entrée au lieu de relire les notes : les deux dispositions
// doivent afficher les mêmes totaux. Deux lectures indépendantes des mêmes
// notes finiraient par donner deux cotes différentes pour le même élève — et
// c'est le genre d'écart qu'une école découvre devant un parent.

import { pointsOverall } from './primEngine.js';

const r2 = (v) => Math.round(v * 100) / 100;

/**
 * Colonnes de critères : union ORDONNÉE des critères rencontrés.
 *
 * Le référentiel national en a quatre (Oral / Écrit / Pratique / Savoir-être),
 * mais on ne les fige pas : une école dont le référentiel en compte trois ou
 * cinq doit voir ses colonnes, pas quatre colonnes dont une vide.
 */
export function critereColumnsOf(compRows) {
  const vues = new Map();
  for (const r of compRows || []) {
    for (const cr of r?.criteres || []) {
      if (!vues.has(cr.id)) vues.set(cr.id, cr.nom);
    }
  }
  return [...vues].map(([id, nom]) => ({ id, nom }));
}

/**
 * Valeur affichée d'une cellule (compétence × critère) sur la période.
 *
 * @returns {{note, max}|null} null = AUCUNE note sur la période → la cellule
 *          s'écrit « — ». Jamais 0 : une compétence non encore enseignée n'est
 *          pas un échec.
 *
 * UNE SEULE UA notée : la note et SON barème, tels quels. C'est le « 16 /25 »
 * du carnet de référence — le barème de l'évaluation, pas celui du référentiel,
 * parce que l'enseignant a pu interroger l'Écrit sur 25 là où le référentiel
 * dit 20.
 *
 * PLUSIEURS UA notées : moyenne des notes ET des barèmes de ces UA. On moyenne
 * plutôt qu'on somme pour que la cellule reste comparable au barème d'une UA :
 * un trimestre afficherait sinon « 48 /60 » là où l'école attend « 16 /20 ».
 * C'est la même convention que le total de la ligne (`totalAchieved` du
 * bulletin détaillé), et c'est ce qui garantit que les deux dispositions
 * s'accordent.
 */
export function critereCellValue(row, critereId) {
  const notees = (row?.uas || []).filter((u) => u?.notesByCritere?.[critereId] != null
    && u.notesByCritere[critereId] !== '');
  if (!notees.length) return null;
  const critere = (row?.criteres || []).find((c) => c.id === critereId);
  let sommeN = 0, sommeM = 0;
  for (const u of notees) {
    sommeN += Number(u.notesByCritere[critereId]);
    const m = Number(u.baremes?.[critereId] ?? critere?.points_max ?? 0);
    sommeM += Number.isFinite(m) ? m : 0;
  }
  return { note: r2(sommeN / notees.length), max: r2(sommeM / notees.length) };
}

/**
 * Lignes + synthèse du bulletin compact d'UN élève.
 *
 * @param {Array} compRows  sortie de `primAnnualRowsFor` pour cet élève
 * @returns {{ critereColumns, rows, overall, nonEvalueesCodes }}
 *
 * `overall` vient de `pointsOverall` : les compétences non évaluées sortent du
 * numérateur ET du dénominateur — c'est le « total sur 240 et non sur 300 » du
 * carnet de référence.
 *
 * ⚠ `overall` n'est PAS la moyenne générale. Celle-ci reste `generalAverage`
 * (moyenne des compétences pondérée par coefficient), calculée ailleurs et
 * inchangée. Les deux lignes du carnet sont deux lectures, pas un calcul et son
 * résultat — voir l'en-tête de `primEngine.js`.
 */
export function buildCompactRows(compRows) {
  const critereColumns = critereColumnsOf(compRows);
  const rows = (compRows || []).map((r) => {
    const parCritere = {};
    for (const col of critereColumns) parCritere[col.id] = critereCellValue(r, col.id);
    return {
      code: r.code,
      intitule: r.intitule,
      parCritere,
      achieved: r.totalAchieved ?? null,
      // Pas de barème affiché pour une compétence non évaluée : « — /40 »
      // laisserait croire qu'elle a été interrogée et ratée.
      possible: r.totalAchieved == null ? null : (r.totalPossible ?? null),
      cote: r.totalCote ?? null,
    };
  });
  const overall = pointsOverall(rows.map((r) => ({ achieved: r.achieved, possible: r.possible })));
  const nonEvalueesCodes = rows.filter((r) => r.achieved == null).map((r) => r.code);
  return { critereColumns, rows, overall, nonEvalueesCodes };
}
