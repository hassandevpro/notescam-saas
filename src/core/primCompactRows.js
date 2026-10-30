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

import { pointsOverall, primCote } from './primEngine.js';

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
  autonomie: ["DÉMONTRER L'AUTONOMIE, L'ESPRIT D'INITIATIVE, DE CRÉATIVITÉ ET D'ENTREPRENEURIAT",
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
 * Les six familles, dans l'ordre du carnet, pour les proposer à l'école.
 *
 * Même source que les bandeaux imprimés : une famille ajoutée ici apparaît du
 * même coup dans la liste de choix et sur le bulletin, sans seconde liste à
 * tenir à jour.
 */
export const FAMILLES_PRIMAIRE = Object.keys(DOMAINE_LIBELLE);

/** Intitulé officiel d'une famille, ou `null` si le domaine est inconnu. */
export function familleLabel(domaine, sys = 'FR') {
  const l = DOMAINE_LIBELLE[domaine];
  return l ? (sys === 'EN' ? l[1] : l[0]) : null;
}

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
 * @param coteBareme bandes de cotes de l'école. FOURNIE → chaque groupe porte
 *        aussi sa COTE, comme le carnet imprimé de THE GENIUS, qui écrit
 *        « Grade: A » au bout de chaque ligne de regroupement. ABSENTE — le cas
 *        des deux appels existants — le champ vaut `null` et aucun gabarit ne
 *        change. La cote n'est pas inventée : c'est le barème de l'école appliqué
 *        au total du groupe, exactement comme pour une compétence.
 */
export function groupesDe(rows, sys = 'FR', coteBareme = null) {
  // On regroupe par NUMÉRO d'abord, et par domaine seulement à défaut.
  //
  // L'inverse paraissait naturel — le domaine est la donnée officielle — mais
  // il rangeait mal les compétences MAISON : « 1D » ajoutée par l'école n'a pas
  // de domaine, sa clé devenait « num:1 », différente de « langues », et elle
  // formait un septième groupe fantôme au lieu de rejoindre le premier. Comme
  // tous les codes nationaux portent leur numéro (1A, 2A…), grouper par numéro
  // redonne exactement les six familles ET accueille les maisons numérotées.
  //
  // ── QUELLE FAMILLE PORTE QUEL DOMAINE ? ON L'APPREND DES LIGNES ──────────
  //
  // Une ligne MAISON n'a pas de numéro dans son code : `codeMaison` refuse même
  // d'en produire un, pour qu'on ne la confonde pas avec un code du ministère
  // (« Dictée - Question » → « DQ »). Son seul rattachement possible est donc le
  // DOMAINE, que l'école choisit à l'écran.
  //
  // Mais `domaine` et numéro sont deux clés différentes pour une même famille :
  // tel quel, « DQ » avec `domaine = 'langues'` formait un SEPTIÈME groupe
  // portant le même titre que le premier — le carnet imprimait donc deux fois
  // « 1) COMMUNIQUER EN FRANÇAIS… », chacun avec un bout du total.
  //
  // On relie les deux par la DONNÉE, pas par une table écrite à la main : 1A
  // porte `langues`, donc `langues` est la famille 1. Si le ministère renumérote
  // un jour ses familles, le rattachement suit sans qu'on y touche.
  const numeroDuDomaine = new Map();
  for (const r of rows || []) {
    const n = numeroDe(r?.code);
    if (n != null && r?.domaine && !numeroDuDomaine.has(r.domaine)) numeroDuDomaine.set(r.domaine, n);
  }

  const ordre = [];
  const par = new Map();
  for (const r of rows || []) {
    const n = numeroDe(r?.code);
    // Un domaine qu'AUCUNE ligne nationale ne porte reste sa propre clé : une
    // école qui range ses épreuves ailleurs garde son groupe, elle ne le voit
    // pas fondre dans une famille qui n'est pas la sienne.
    let cle = null;
    if (n != null) cle = `num:${n}`;
    else if (r?.domaine) {
      const nDom = numeroDuDomaine.get(r.domaine);
      cle = nDom != null ? `num:${nDom}` : r.domaine;
    }
    if (!cle) continue;
    if (!par.has(cle)) { par.set(cle, []); ordre.push(cle); }
    par.get(cle).push(r);
  }
  return ordre.map((cle) => {
    const lignes = par.get(cle);
    // L'intitulé officiel vient du DOMAINE : on le prend sur la première ligne
    // du groupe qui en porte un. Une maison sans domaine hérite ainsi du titre
    // de la famille qu'elle rejoint, au lieu de le perdre.
    const domaine = lignes.find((r) => r.domaine)?.domaine || null;
    const libelle = DOMAINE_LIBELLE[domaine];
    return {
      cle,
      // Le numéro se lit sur la CLÉ, pas sur la première ligne : une famille
      // dont l'école a mis son épreuve en tête (« Calcul Rapide » avant 2B)
      // perdait sinon son numéro, et son bandeau s'imprimait sans « 2) ».
      numero: /^num:(\d+)$/.test(cle) ? Number(cle.slice(4)) : null,
      // Un domaine inconnu du produit garde les codes de ses compétences comme
      // libellé : mieux qu'un titre inventé, et l'école voit quoi corriger.
      intitule: libelle ? (sys === 'EN' ? libelle[1] : libelle[0]) : lignes.map((r) => r.code).join(', '),
      ...agregerGroupe(lignes, coteBareme),
    };
  });
}

/**
 * TOTAL, MOYENNE ET COTE D'UN PAQUET DE LIGNES — le calcul d'un bandeau.
 *
 * Extrait de `groupesDe` parce qu'il sert maintenant à DEUX découpages : les
 * six familles du MINEDUB, et les deux programmes d'une classe bilingue
 * (`primProgramme.js`). Les écrire deux fois, c'était s'exposer à ce qu'un
 * carnet bilingue et un carnet ordinaire finissent par arrondir différemment la
 * même addition — et c'est le genre d'écart qui se découvre devant un parent.
 *
 * Les compétences NON ÉVALUÉES sortent du numérateur ET du dénominateur, comme
 * partout ailleurs : un groupe à moitié enseigné n'est pas un groupe raté.
 *
 * @param lignes      lignes de `buildCompactRows`
 * @param coteBareme  bandes de cotes de l'école ; ABSENTE → `cote: null`
 */
export function agregerGroupe(lignes, coteBareme = null) {
  const liste = lignes || [];
  const notees = liste.filter((r) => r.achieved != null);
  const achieved = notees.length ? notees.reduce((a, r) => a + Number(r.achieved), 0) : null;
  const possible = notees.length ? notees.reduce((a, r) => a + Number(r.possible || 0), 0) : null;
  return {
    codes: liste.map((r) => r.code),
    achieved: achieved == null ? null : Math.round(achieved * 100) / 100,
    possible: possible == null ? null : Math.round(possible * 100) / 100,
    moyenne: (achieved == null || !possible) ? null : Math.round((achieved / possible) * 20 * 100) / 100,
    // Même appel que pour une compétence : `primCote(obtenu, possible, barème)`.
    // Pas de second calcul de pourcentage ici — c'est ce qui garantit qu'un
    // groupe et une compétence au même ratio portent la même cote.
    cote: (achieved == null || !possible || !coteBareme)
      ? null
      : (primCote(achieved, possible, coteBareme)?.cote || null),
  };
}

/**
 * UNE LIGNE PAR ÉPREUVE — la disposition du carnet PAPIER de THE GENIUS.
 *
 * ── CE QU'ELLE CHANGE, ET POURQUOI ────────────────────────────────────────
 *
 * Le carnet que l'école remet aux parents (8 bulletins photographiés, relevés
 * le 2026-10-29 : SIL, CE1, CM1, CLASS I, CLASS III, CLASS V, Class 2/CP) ne
 * met PAS les critères en colonnes. Il écrit une ligne par ÉPREUVE RÉELLEMENT
 * PASSÉE, avec son barème et sa note :
 *
 *     COMPETENCES              | L.U.      | Bar. | Mark | Grade
 *     5- TIC                   | Pratique  |  10  |  9   |  A
 *                              | Écrite    |  20  | 18   |
 *
 * C'est la même donnée que la disposition par colonnes — les mêmes cellules
 * `parCritere` — lue autrement. D'où une fonction de PRÉSENTATION et non un
 * second calcul : si l'on relisait les notes ici, le même élève finirait par
 * porter deux totaux différents selon la disposition choisie.
 *
 * Deux raisons tiennent à la lisibilité du papier :
 *   · une classe BILINGUE coche jusqu'à 37 matières ; 37 lignes × 4 colonnes de
 *     critères font 148 cases, dont la grande majorité vides ;
 *   · le barème VARIE d'une épreuve à l'autre (Écrite sur 20 en 1A, sur 30 en
 *     2A). En colonnes, chaque case doit porter « 18 /20 » ; en lignes, le
 *     barème a sa propre colonne, et l'addition se vérifie à l'œil — ce que
 *     l'école fait précisément avec ce carnet.
 *
 * Une compétence SANS aucune note garde sa ligne (`epreuves` vide) : c'est la
 * règle du responsable — « je ne veux pas voir une seule matière cochée qui ne
 * soit pas au bulletin ». Le gabarit y écrit « — », jamais 0.
 *
 * @param rows            lignes de `buildCompactRows`
 * @param critereColumns  colonnes de `critereColumnsOf` — elles donnent l'ORDRE
 *                        des épreuves, celui du référentiel, pas celui du hasard
 * @returns les mêmes lignes, enrichies de `epreuves: [{ id, nom, note, max }]`
 */
export function lignesParEpreuve(rows, critereColumns) {
  const cols = (critereColumns || []).filter((c) => c && c.id != null);
  return (rows || []).map((r) => {
    const epreuves = [];
    for (const c of cols) {
      const v = r?.parCritere?.[c.id];
      // `note == null` = rien de saisi. On ne fabrique pas une ligne « — » par
      // critère du référentiel : le carnet n'imprime que les épreuves passées.
      if (!v || v.note == null) continue;
      epreuves.push({ id: c.id, nom: c.nom, note: v.note, max: v.max });
    }
    return { ...r, epreuves };
  });
}

/**
 * Où poser le BANDEAU et le TOTAL d'un regroupement, quand ses membres ne se
 * suivent pas.
 *
 * ── LE DÉFAUT QUE CECI CORRIGE (THE GENIUS, relevé le 2026-10-27) ──────────
 *
 * Les deux gabarits décidaient en regardant la ligne VOISINE : « la suivante
 * est-elle d'une autre famille ? alors je suis la dernière de la mienne ». Juste
 * tant que les membres d'une famille se suivent — et ils ne se suivent plus dès
 * qu'une compétence MAISON s'intercale.
 *
 * Une maison n'a ni `domaine` ni numéro dans son code (« CH », « PW », « EG ») :
 * `groupesDe` la laisse donc hors regroupement, à dessein. Mais `addRefLigne`
 * lui donnait un `ordre` qui la plaçait au MILIEU du national. Sur le CE2 BIL de
 * THE GENIUS, « Chinois », « Practical Work » et « Économie Générale » tombaient
 * entre 6A (ordre 100) et 6B (ordre 110) : la famille 6 se retrouvait coupée en
 * deux morceaux, et le carnet imprimait DEUX fois
 * « 6) PRATIQUER LES ACTIVITÉS PHYSIQUES, SPORTIVES ET ARTISTIQUES » — avec le
 * MÊME total les deux fois, puisque `groupesDe` ne l'avait compté qu'une. Un
 * parent lisait donc deux totaux identiques pour un seul groupe.
 *
 * On repère ici la PREMIÈRE et la DERNIÈRE ligne de chaque famille, où qu'elles
 * soient dans la liste. Un groupe n'a ainsi qu'un bandeau et qu'un total, quoi
 * qu'il y ait entre les deux. Ce qui s'intercale reste visible et compté dans le
 * total général — on ne masque rien, on cesse seulement de compter double.
 *
 * @param rows    lignes du bulletin, dans l'ordre d'affichage
 * @param groupes sortie de `groupesDe` pour ces mêmes lignes
 * @returns {{debut: Map<number, object>, fin: Map<number, object>}}
 *          index de ligne → groupe dont elle OUVRE / FERME la famille.
 */
export function reperesDeGroupe(rows, groupes) {
  const groupeDe = new Map();
  for (const g of groupes || []) for (const code of g?.codes || []) groupeDe.set(code, g);

  // Un seul parcours : on retient l'index de la première et de la dernière
  // ligne de chaque famille. `dernier` est écrasé à chaque membre rencontré,
  // donc il porte bien le DERNIER à la fin du parcours.
  const premier = new Map();
  const dernier = new Map();
  (rows || []).forEach((r, i) => {
    const g = groupeDe.get(r?.code);
    if (!g) return;
    if (!premier.has(g)) premier.set(g, i);
    dernier.set(g, i);
  });

  // Deux familles ne peuvent pas ouvrir sur la même ligne, ni fermer sur la
  // même : l'inversion est donc sans perte.
  const debut = new Map();
  const fin = new Map();
  for (const [g, i] of premier) debut.set(i, g);
  for (const [g, i] of dernier) fin.set(i, g);
  return { debut, fin };
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
      // DÉCLARÉE non évaluée par la classe — à distinguer de « rien de saisi ».
      // Le carnet imprime « - - - - » dans un cas, « — » dans l'autre.
      nonEvaluee: r.nonEvaluee === true,
      cote: r.totalCote ?? null,
    };
  });
  const overall = pointsOverall(rows.map((r) => ({ achieved: r.achieved, possible: r.possible })));
  const nonEvalueesCodes = rows.filter((r) => r.achieved == null).map((r) => r.code);
  return { critereColumns, rows, overall, nonEvalueesCodes };
}
