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
// ── LES SIX REGROUPEMENTS OFFICIELS DU CARNET MINEDUB ─────────────────────
//
// Le bulletin imprimé que l'école remet aux parents (modèle THE GENIUS, SIL,
// relevé le 2026-10-20) ne liste pas onze compétences à plat : il les range
// sous SIX intitulés numérotés, chacun suivi d'un « Total » et d'une
// « Moyenne ». Notre gabarit compact affichait les onze lignes sans ces
// regroupements — c'est ce qui manquait.
//
// La donnée existe déjà : `prim_competences.domaine` porte exactement ces six
// familles (relevé en production : langues, maths_sciences, vie_citoyennete,
// autonomie, tic, arts_sport), et le NUMÉRO est le chiffre du code (1A → 1).
// Rien n'est donc inventé ni déduit d'un libellé.
const DOMAINE_LIBELLE = {
  langues: ['COMMUNIQUER EN FRANÇAIS ET EN ANGLAIS ET PRATIQUER AU MOINS UNE LANGUE NATIONALE',
    'COMMUNICATE IN FRENCH AND ENGLISH AND PRACTISE AT LEAST ONE NATIONAL LANGUAGE'],
  maths_sciences: ['UTILISER LES NOTIONS DE BASE EN MATHÉMATIQUES, SCIENCES ET TECHNOLOGIES',
    'USE BASIC NOTIONS IN MATHEMATICS, SCIENCE AND TECHNOLOGY'],
  vie_citoyennete: ['PRATIQUER LES VALEURS SOCIALES ET CITOYENNES',
    'PRACTISE SOCIAL AND CIVIC VALUES'],
  autonomie: ["DÉMONTRER L'AUTONOMIE, L'ESPRIT D'INITIATIVE, DE CRÉATIVITÉ ET D'ENTREPRENARIAT",
    'DEMONSTRATE AUTONOMY, INITIATIVE, CREATIVITY AND ENTREPRENEURSHIP'],
  tic: ["UTILISER LES CONCEPTS DE BASE ET LES OUTILS DE TECHNOLOGIES DE L'INFORMATION ET DE LA COMMUNICATION",
    'USE BASIC CONCEPTS AND TOOLS OF INFORMATION AND COMMUNICATION TECHNOLOGY'],
  arts_sport: ['PRATIQUER LES ACTIVITÉS PHYSIQUES, SPORTIVES ET ARTISTIQUES',
    'PRACTISE PHYSICAL, SPORTING AND ARTISTIC ACTIVITIES'],
};

/** Numéro du regroupement, lu sur le code de la compétence : « 1A » → 1. */
const numeroDe = (code) => {
  const m = /^\s*(\d+)/.exec(String(code || ''));
  return m ? Number(m[1]) : null;
};

/**
 * Regroupe les lignes par domaine, dans l'ordre d'apparition, et calcule pour
 * chacun le TOTAL (points obtenus / possibles) et la MOYENNE sur 20.
 *
 * Une compétence MAISON ajoutée par l'école (« CHINOIS » sur le modèle) n'a pas
 * forcément de domaine : elle rejoint le regroupement de son NUMÉRO quand son
 * code en porte un, sinon elle reste hors regroupement — jamais rangée de force
 * dans une famille qui n'est pas la sienne.
 *
 * @param rows lignes de `buildCompactRows`
 * @param sys  'FR' | 'EN' — langue des intitulés officiels
 */
export function groupesDe(rows, sys = 'FR') {
  // On regroupe par NUMÉRO d'abord, et par domaine seulement à défaut.
  //
  // L'inverse paraissait naturel — le domaine est la donnée officielle — mais
  // il rangeait mal les compétences MAISON : « 1D » ajoutée par l'école n'a pas
  // de domaine, sa clé devenait « num:1 », différente de « langues », et elle
  // formait un septième groupe fantôme au lieu de rejoindre le premier. Comme
  // tous les codes nationaux portent leur numéro (1A, 2A…), grouper par numéro
  // redonne exactement les six familles ET accueille les maisons numérotées.
  const ordre = [];
  const par = new Map();
  for (const r of rows || []) {
    const n = numeroDe(r?.code);
    const cle = n != null ? `num:${n}` : (r?.domaine || null);
    if (!cle) continue;
    if (!par.has(cle)) { par.set(cle, []); ordre.push(cle); }
    par.get(cle).push(r);
  }
  return ordre.map((cle) => {
    const lignes = par.get(cle);
    const notees = lignes.filter((r) => r.achieved != null);
    const achieved = notees.length ? notees.reduce((a, r) => a + Number(r.achieved), 0) : null;
    const possible = notees.length ? notees.reduce((a, r) => a + Number(r.possible || 0), 0) : null;
    // L'intitulé officiel vient du DOMAINE : on le prend sur la première ligne
    // du groupe qui en porte un. Une maison sans domaine hérite ainsi du titre
    // de la famille qu'elle rejoint, au lieu de le perdre.
    const domaine = lignes.find((r) => r.domaine)?.domaine || null;
    const libelle = DOMAINE_LIBELLE[domaine];
    return {
      cle,
      numero: numeroDe(lignes[0]?.code),
      // Un domaine inconnu du produit garde les codes de ses compétences comme
      // libellé : mieux qu'un titre inventé, et l'école voit quoi corriger.
      intitule: libelle ? (sys === 'EN' ? libelle[1] : libelle[0]) : lignes.map((r) => r.code).join(', '),
      codes: lignes.map((r) => r.code),
      achieved: achieved == null ? null : Math.round(achieved * 100) / 100,
      possible: possible == null ? null : Math.round(possible * 100) / 100,
      moyenne: (achieved == null || !possible) ? null : Math.round((achieved / possible) * 20 * 100) / 100,
    };
  });
}

export function buildCompactRows(compRows) {
  const critereColumns = critereColumnsOf(compRows);
  const rows = (compRows || []).map((r) => {
    const parCritere = {};
    for (const col of critereColumns) parCritere[col.id] = critereCellValue(r, col.id);
    return {
      code: r.code,
      intitule: r.intitule,
      // Le DOMAINE voyage avec la ligne : c'est lui qui regroupe les compétences
      // sous les six intitulés officiels du carnet (voir `groupesDe`).
      domaine: r.domaine ?? null,
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
