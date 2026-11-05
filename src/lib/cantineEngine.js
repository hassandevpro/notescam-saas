// ════════════════════════════════════════════════════════════════════════════
// REGISTRE MENSUEL D'UN SERVICE À ABONNEMENT — cantine, transport, internat
// ════════════════════════════════════════════════════════════════════════════
//
// CE QUE L'ÉCOLE TIENT AUJOURD'HUI, et qu'il s'agit de rendre : un tableau Word,
// une ligne par élève, une colonne par mois, avec quatre conventions de lecture
// et une seule derrière (`CANTINE.docx`, trois années) :
//
//     15 000        mois complet dû
//      7 500        DEMI-MOIS (entrée en cours de mois)
//      /            élève NON INSCRIT ce mois-là — ce n'est PAS un impayé
//      A B A N D O N abandon : les mois suivants ne sont plus dus
//
// et, sous le tableau, « Q P = 2 500 X nbre », devenu « Q P = 3500 X NBRE » en
// 2026-2027 : la quote-part.
//
// ── CE MODULE NE STOCKE RIEN, ET C'EST LE POINT ────────────────────────────
// Tout est déjà en base : le service dans `fee_catalog`, l'abonnement dans
// `student_fee_items`, l'échéance mensuelle dans `fee_schedule_items` (avec ses
// statuts `not_applicable` et `abandoned`, qui existaient déjà), l'encaissement
// dans `fee_payments`. Le besoin non couvert était de PRÉSENTATION : l'école
// veut sa grille élèves × mois, pas une fiche par élève.
//
// Aucune écriture financière nouvelle n'est donc introduite ici. Les recettes
// restent dans `fee_payments`, les dépenses dans `budget_expenses`.
//
// ── LA QUOTE-PART N'EST PAS UNE RECETTE ────────────────────────────────────
// La cantine est TENUE PAR L'ÉCOLE (réponse du responsable, 31/10/2026). Les
// 15 000 sont la recette ; les denrées, le cuisinier, l'eau et la lumière sont
// des dépenses. La quote-part est la MARGE, donc elle est DÉJÀ CONTENUE dans les
// 15 000. L'enregistrer en plus la compterait deux fois.
//
// Elle est pour cette raison calculée ICI, à la lecture, et n'est écrite dans
// aucune table d'écritures. Voir docs/MODULE_CANTINE.md § 4.
//
// ── LE DEMI-MOIS FAIT DEMI-QUOTE-PART ─────────────────────────────────────
// Mesuré sur le cahier, pas supposé. Avril 2026 porte une quote-part de 27 500,
// que l'on pouvait lire « 11 élèves à 2 500 » ou « 22 élèves à 1 250 ». Le
// comptage de la colonne tranche : AUCUN élève n'a payé le mois plein en avril,
// et dix-neuf au moins sont au demi-mois — plus que les onze qu'exigerait la
// première lecture. 22 × 1 250 = 27 500, au franc près.
//
// ── LE MOIS PAYÉ N'EST PAS LE MOIS SERVI ──────────────────────────────────
// « Certains parents (03) n'ayant pas payé se sont rattrapés au mois de Janvier
// 2026 », et deux lignes du cahier portent 30 000 en janvier — deux mois en un
// versement. Les états ci-dessous sont donc indexés par `period_key`, JAMAIS par
// la date du versement : l'effectif de novembre doit rester celui de novembre.
// La ventilation d'un versement sur les mois les plus anciens est déjà faite par
// `repartitionVersement` (feeScheduleEngine), qui cite ce même cas.
//
// ── DÉCEMBRE N'EXISTE PAS ─────────────────────────────────────────────────
// La colonne DEC vaut « / » pour tout le monde en 2025-2026, et le cahier
// 2024-2025 ne la porte pas du tout. Un mois sans service n'est pas un mois à
// zéro impayé : `moisSansService` le dit, pour qu'aucun état ne le présente
// comme une défaillance de recouvrement.

import {
  periodesDuFrais, libellePeriode, statutEcheance, paidForSchedule,
} from './feeScheduleEngine.js';

// Part du tarif plein due pour une entrée en cours de mois. Le cahier emploie
// 7 500 pour 15 000 ; c'est un PARAMÈTRE, pas une constante de la cantine —
// une école peut proratiser autrement, et le transport le fera sans doute.
export const TAUX_DEMI_MOIS = 0.5;

// Les quatre conventions du cahier, plus l'exemption que la base connaît déjà.
// Ce sont les valeurs que l'écran peint ; elles ne sont jamais stockées.
export const CONVENTIONS = Object.freeze([
  'plein', 'demi', 'non_inscrit', 'abandon', 'exempte',
]);

// Ce qui s'écrit dans la case, exactement comme le cahier l'écrit.
export const TEXTE_CONVENTION = Object.freeze({
  non_inscrit: '/',
  abandon: 'ABANDON',
  exempte: 'EXEMPTÉ',
});

/** Les mois facturés par un service, dans l'ordre. */
export function moisDuService(item, academicYear) {
  if (!item) return [];
  return periodesDuFrais(item, academicYear || item.academic_year).map(String);
}

/**
 * LES PÉRIODES QUE LA GRILLE DOIT MONTRER = celles que le service facture,
 * PLUS celles qui portent déjà des échéances.
 *
 * Signalé le 2026-11-04 : « le service de transport n'a pas de chiffre — on
 * voit les élèves mais pas les montants », alors que l'import venait d'écrire.
 * La grille n'affichait que `periodesDuFrais`, c'est-à-dire la configuration
 * du service À CET INSTANT. Il suffit donc qu'on change la facturation après
 * coup — mensuelle devenue trimestrielle, ou « en une fois » — pour que des
 * échéances mensuelles déjà écrites n'aient plus AUCUNE colonne où s'afficher.
 * Les élèves restaient listés (ils viennent des abonnements), les montants
 * disparaissaient, et rien ne disait pourquoi.
 *
 * L'argent écrit ne doit jamais être caché par un réglage. Les périodes
 * configurées gardent leur ordre, et celles qui existent en plus sont
 * ajoutées à la suite, triées : `horsConfig` les nomme pour que l'écran
 * puisse le dire au lieu d'afficher un tableau vide.
 *
 * @param {object|null} service    article du catalogue
 * @param {string} academicYear    l'année visée
 * @param {Array} echeances        échéances DE CE SERVICE
 * @returns {{ mois: string[], horsConfig: string[] }}
 */
export function moisAffiches(service, academicYear, echeances = []) {
  const configurees = moisDuService(service, academicYear);
  const connues = new Set(configurees);
  const horsConfig = [...new Set((echeances || [])
    .map((l) => String(l?.period_key ?? '').trim())
    .filter((c) => c && !connues.has(c)))].sort();
  return { mois: [...configurees, ...horsConfig], horsConfig };
}

/** Libellés des mois, figés une fois pour l'en-tête de la grille. */
export function enteteMois(mois = [], langue = 'fr') {
  return mois.map((cle) => ({ period_key: cle, label: libellePeriode(cle, langue) }));
}

/**
 * Le tarif plein du service pour une période. `fee_catalog.amount` fait foi ;
 * une échéance peut porter moins (demi-mois), jamais le contraire — c'est ce qui
 * rend le demi-mois DÉTECTABLE sans colonne supplémentaire.
 */
export function tarifPleinDe(item) {
  return Math.max(0, Math.floor(Number(item?.amount ?? 0) || 0));
}

/**
 * Une case de la grille : un élève, un mois.
 *
 * @param {object|null} ligne  échéance `fee_schedule_items`, ou null si l'élève
 *                             n'a AUCUNE échéance ce mois-là — ce qui vaut
 *                             « non inscrit », et non « dû à zéro ». La nuance
 *                             compte : une échéance à zéro apparaîtrait dans les
 *                             états, une absence d'échéance non.
 * @param {number} paye        somme imputée à CETTE échéance (contre-passations
 *                             comprises, avec leur signe négatif).
 * @param {number} tarifPlein  `fee_catalog.amount` de l'année — le tarif du
 *                             SERVICE, qui ne vaut que pour les écoles à tarif
 *                             unique.
 * @param {number} tarifEleve  le tarif propre à CET élève
 *                             (`student_fee_items.amount`), quand l'école en
 *                             pratique un. Il gagne sur `tarifPlein`.
 *
 * POURQUOI DEUX TARIFS, ET NON UN (défaut trouvé le 2026-10-31).
 * Le registre transport réel de THE GENIUS porte TREIZE tarifs mensuels, de
 * 5 000 à 15 000, selon la résidence de l'élève — et c'est la règle, pas
 * l'exception : on ne fait pas payer le même prix à deux kilomètres et à douze.
 * Or le repère du « demi-mois » était le tarif du SERVICE. Un élève à 5 000
 * dans un service affiché à 7 500 voyait donc chacun de ses mois étiqueté
 * « demi », et `quotePartDuMois` ne le comptait que pour MOITIÉ : l'écart ne
 * restait pas à l'écran, il entrait dans l'argent. Le repère juste est le plein
 * tarif de l'élève ; le tarif du service ne sert plus que de repli, pour les
 * écoles qui n'en pratiquent qu'un.
 */
export function celluleDuMois({ ligne = null, paye = 0, tarifPlein = 0, tarifEleve = 0 } = {}) {
  if (!ligne) {
    return {
      convention: 'non_inscrit', statut: 'not_applicable',
      montantDu: 0, paye: 0, reste: 0, texte: TEXTE_CONVENTION.non_inscrit,
    };
  }
  const montantDu = Math.max(0, Math.floor(Number(ligne.amount_due) || 0));
  const verse = Math.floor(Number(paye) || 0);
  const statut = statutEcheance({
    amountDue: montantDu, amountPaid: verse, manualStatus: ligne.status,
  });

  if (statut === 'abandoned') {
    return { convention: 'abandon', statut, montantDu, paye: verse, reste: 0,
      texte: TEXTE_CONVENTION.abandon };
  }
  if (statut === 'exempted') {
    return { convention: 'exempte', statut, montantDu, paye: verse, reste: 0,
      texte: TEXTE_CONVENTION.exempte };
  }
  if (statut === 'not_applicable') {
    return { convention: 'non_inscrit', statut, montantDu: 0, paye: verse, reste: 0,
      texte: TEXTE_CONVENTION.non_inscrit };
  }

  // Facturé : plein mois, ou demi-mois si l'échéance porte MOINS que le plein
  // tarif DE CET ÉLÈVE. Son tarif propre gagne ; celui du service ne sert que
  // de repli.
  const repere = tarifEleve > 0 ? Math.floor(tarifEleve) : tarifPlein;
  const demi = repere > 0 && montantDu > 0 && montantDu < repere;
  return {
    convention: demi ? 'demi' : 'plein',
    statut,                                  // due | partial | paid
    montantDu, paye: verse,
    reste: Math.max(0, montantDu - verse),
    texte: String(montantDu),
  };
}

/** Somme imputée à une échéance. `amount_paid` déjà porté par la ligne gagne. */
function payeDe(ligne, paiements) {
  if (ligne?.amount_paid !== undefined && ligne.amount_paid !== null) {
    return Math.floor(Number(ligne.amount_paid) || 0);
  }
  return ligne?.id ? paidForSchedule(ligne.id, paiements) : 0;
}

/**
 * LA GRILLE — une ligne par élève, une case par mois.
 *
 * @param {object} p
 * @param {Array}  p.eleves      [{ id, name, className }] dans l'ordre d'affichage
 * @param {Array}  p.echeances   lignes `fee_schedule_items` du service
 * @param {Array}  p.paiements   lignes `fee_payments` (portant `fee_schedule_item_id`)
 * @param {Array}  p.mois        clés de période, dans l'ordre
 * @param {number} p.tarifPlein  tarif du service (repli)
 * @param {object} [p.tarifParEleve] { [student_id]: tarif propre } — le tarif
 *                 que l'école pratique POUR CET ÉLÈVE. Treize valeurs
 *                 différentes au transport de THE GENIUS ; voir `celluleDuMois`.
 */
export function grilleCantine({
  eleves = [], echeances = [], paiements = [], mois = [], tarifPlein = 0,
  tarifParEleve = null,
} = {}) {
  // Index (élève, mois) → échéance. Une seule passe : la grille d'une école de
  // soixante élèves sur neuf mois, c'est déjà cinq cents cases.
  const parEleveEtMois = new Map();
  for (const l of echeances) {
    parEleveEtMois.set(`${l.student_id}|${l.period_key}`, l);
  }

  return eleves.map((e) => {
    const tarifEleve = tarifParEleve
      ? Math.max(0, Math.floor(Number(tarifParEleve[e.id] ?? 0) || 0)) : 0;
    const cellules = mois.map((cle) => {
      const ligne = parEleveEtMois.get(`${e.id}|${cle}`) || null;
      const c = celluleDuMois({ ligne, paye: payeDe(ligne, paiements), tarifPlein, tarifEleve });
      return { period_key: cle, echeance_id: ligne?.id ?? null, ...c };
    });
    const du    = cellules.reduce((s, c) => s + (c.convention === 'plein' || c.convention === 'demi' ? c.montantDu : 0), 0);
    const paye  = cellules.reduce((s, c) => s + c.paye, 0);
    return {
      student_id: e.id, name: e.name ?? '', className: e.className ?? '',
      // Reporté tel quel : la grille se cherche au matricule autant qu'au nom,
      // et deux homonymes dans une école ne se départagent que par lui.
      matricule: e.matricule ?? '',
      cellules, du, paye, reste: Math.max(0, du - paye),
    };
  });
}

/**
 * QUOTE-PART D'UN MOIS. `quote_part × effectif facturé`, le demi-mois comptant
 * pour moitié. Arrondi à l'entier : on est en francs CFA, il n'y a pas de
 * centime, et un demi de 2 500 doit donner 1 250 et non 1 250,000000001.
 *
 * Rend 0 si le service ne porte pas de quote-part (colonne NULL) — l'écran
 * n'affiche alors aucune ligne, ce qui est le cas des 43 autres écoles.
 */
export function quotePartDuMois({ cellules = [], quotePart = null, tauxDemi = TAUX_DEMI_MOIS } = {}) {
  const taux = Math.max(0, Math.floor(Number(quotePart) || 0));
  if (!taux) return 0;
  let total = 0;
  for (const c of cellules) {
    if (c.convention === 'plein') total += taux;
    else if (c.convention === 'demi') total += taux * tauxDemi;
  }
  return Math.round(total);
}

/**
 * L'ÉTAT D'UN MOIS, tel que § 4bis.3 le définit.
 *
 * `encaisse` compte TOUT ce qui est entré sur ce mois, décisions comprises :
 * cet argent est en caisse, un état ne peut pas faire comme s'il n'existait pas.
 * `impaye` se calcule en revanche sur le seul `encaisseSurDus`, sans quoi un
 * versement posé sur un mois abandonné viendrait éteindre la dette d'un AUTRE
 * mois — un impayé masqué, exactement ce que le guichet ne doit pas produire.
 */
export function etatMensuel({ cellules = [], quotePart = null, tauxDemi = TAUX_DEMI_MOIS } = {}) {
  let inscrits = 0, demiMois = 0, abandons = 0, nonInscrits = 0, exemptes = 0;
  let attendu = 0, encaisse = 0, encaisseSurDus = 0;

  for (const c of cellules) {
    encaisse += c.paye;
    if (c.convention === 'plein' || c.convention === 'demi') {
      inscrits++;
      if (c.convention === 'demi') demiMois++;
      attendu += c.montantDu;
      encaisseSurDus += c.paye;
    } else if (c.convention === 'abandon')     abandons++;
    else if (c.convention === 'exempte')       exemptes++;
    else                                       nonInscrits++;
  }

  return {
    inscrits, demiMois, abandons, nonInscrits, exemptes,
    attendu, encaisse, encaisseSurDus,
    impaye: Math.max(0, attendu - encaisseSurDus),
    quotePart: quotePartDuMois({ cellules, quotePart, tauxDemi }),
    // Un mois que l'école ne facture à PERSONNE. Ce n'est pas un mois à zéro
    // impayé : c'est décembre, et aucun état ne doit le montrer en défaut.
    moisSansService: inscrits === 0 && abandons === 0 && exemptes === 0,
  };
}

/** Les états de tous les mois, plus le total de l'année. */
export function etatsMensuels({ grille = [], mois = [], quotePart = null, tauxDemi = TAUX_DEMI_MOIS } = {}) {
  const parMois = mois.map((cle, i) => ({
    period_key: cle,
    label: libellePeriode(cle),
    ...etatMensuel({ cellules: grille.map((r) => r.cellules[i]).filter(Boolean), quotePart, tauxDemi }),
  }));

  const total = parMois.reduce((t, m) => ({
    inscrits: t.inscrits + m.inscrits,          // mois-élèves, pas des personnes
    demiMois: t.demiMois + m.demiMois,
    attendu:  t.attendu  + m.attendu,
    encaisse: t.encaisse + m.encaisse,
    impaye:   t.impaye   + m.impaye,
    quotePart: t.quotePart + m.quotePart,
  }), { inscrits: 0, demiMois: 0, attendu: 0, encaisse: 0, impaye: 0, quotePart: 0 });

  return { parMois, total };
}

/**
 * Export CSV de l'état mensuel — ce que l'école remet à sa comptabilité.
 *
 * Point-virgule comme séparateur, et BOM : Excel en configuration francophone
 * ouvre un CSV à virgules en une seule colonne, et sans BOM il rend « Février »
 * illisible. Mêmes raisons que les autres exports de la plateforme.
 */
export function csvEtatsMensuels({ parMois = [], total = null, devise = 'XAF' } = {}) {
  const l = (cs) => cs.map((c) => {
    const s = String(c ?? '');
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(';');

  const lignes = [l(['Mois', 'Inscrits', 'dont demi-mois', 'Abandons', 'Non inscrits',
    'Exemptés', `Attendu (${devise})`, `Encaissé (${devise})`, `Impayé (${devise})`,
    `Quote-part (${devise})`, 'Service'])];

  for (const m of parMois) {
    lignes.push(l([m.label, m.inscrits, m.demiMois, m.abandons, m.nonInscrits,
      m.exemptes, m.attendu, m.encaisse, m.impaye, m.quotePart,
      m.moisSansService ? 'sans service' : '']));
  }
  if (total) {
    lignes.push(l(['TOTAL (mois-élèves)', total.inscrits, total.demiMois, '', '', '',
      total.attendu, total.encaisse, total.impaye, total.quotePart, '']));
  }
  return '﻿' + lignes.join('\r\n') + '\r\n';
}

// ── LA PASTILLE D'UNE CASE — ce qu'on doit voir SANS lire de chiffre ────────
//
// Constat du responsable (2026-10-31, captures d'écran) : « chaque cellule de
// mois affiche seulement un chiffre brut (15000), sans dire s'il est payé,
// partiel ou impayé ». Un tableau de dix colonnes de montants bruts ne répond
// pas à la question qu'on se pose au guichet — « cet élève est-il à jour ? » —
// il la rend plus difficile : il faut comparer de tête chaque montant à ce qui
// a été versé, et rien à l'écran ne dit ce qui l'a été.
//
// Cette fonction traduit donc une case en UN SEUL ton, lisible d'un coup d'œil.
// Elle est ici et non dans l'écran parce que c'est une lecture de l'état
// financier d'un mois, pas une question de couleur : les six tons recouvrent
// exactement les statuts que la base connaît, et le jour où un septième
// apparaîtra, c'est ce banc qui le dira.
//
// `valeur` est le RESTE pour un partiel — le seul chiffre que la maquette garde
// dans la case, parce que c'est celui qu'on réclame. Ailleurs elle est nulle :
// le montant complet reste accessible en infobulle et dans la fiche.
export function pastilleCellule(cellule) {
  if (!cellule) return { ton: 'vide', valeur: null };
  const { convention, statut, reste, montantDu, paye } = cellule;

  if (convention === 'non_inscrit') return { ton: 'vide', valeur: null };
  if (convention === 'exempte')     return { ton: 'exempte', valeur: null };
  if (convention === 'abandon')     return { ton: 'abandon', valeur: null };

  // Un mois facturé à zéro n'est ni dû ni impayé : le peindre en rouge
  // réclamerait une dette qui n'existe pas.
  if (!(Number(montantDu) > 0)) return { ton: 'vide', valeur: null };

  if (statut === 'paid' || Number(reste) <= 0) return { ton: 'solde', valeur: null };
  if (Number(paye) > 0) return { ton: 'partiel', valeur: Number(reste) };
  return { ton: 'impaye', valeur: Number(reste) };
}

/**
 * LE MOT JUSTE POUR LA PÉRIODE D'UN SERVICE.
 *
 * Le registre a été écrit pour la cantine, qui se règle au mois — d'où « Grille
 * mensuelle », « Mois à payer », « Mois créés » partout dans l'écran. Mais le
 * transport de THE GENIUS se règle au TRIMESTRE, et `fee_schedule_items`
 * l'accepte depuis toujours (`period_key` vaut '2026-10' ou '2026-T1'). Seul le
 * vocabulaire de l'écran était bloqué sur le mois.
 *
 * Un libellé faux n'est pas qu'inélégant : une caissière à qui l'on demande
 * « quels mois ? » devant trois trimestres hésite, et une hésitation au guichet
 * est une erreur d'imputation en puissance.
 *
 * Rend les deux formes dont l'interface a besoin, dans la langue de l'école.
 * `periodicity` inconnue → le mois, qui est le cas de quarante-trois écoles sur
 * quarante-quatre.
 */
export function motPeriode(service, t = (fr) => fr) {
  const p = String(service?.periodicity || '').toLowerCase();
  if (p === 'trimestriel') {
    return {
      un: t('trimestre', 'term', 'trimestre'),
      le: t('Trimestre', 'Term', 'Trimestre'),
      les: t('Trimestres', 'Terms', 'Trimestres'),
      parPeriode: t('Grille trimestrielle', 'Term grid', 'Cuadrícula trimestral'),
      aPayer: t('Trimestres à payer', 'Terms to pay', 'Trimestres a pagar'),
      parX: t('Par trimestre', 'By term', 'Por trimestre'),
    };
  }
  if (p === 'annuel' || p === 'unique') {
    return {
      un: t('période', 'period', 'periodo'),
      le: t('Période', 'Period', 'Periodo'),
      les: t('Périodes', 'Periods', 'Periodos'),
      parPeriode: t('Grille des périodes', 'Period grid', 'Cuadrícula de periodos'),
      aPayer: t('Périodes à payer', 'Periods to pay', 'Periodos a pagar'),
      parX: t('Par période', 'By period', 'Por periodo'),
    };
  }
  return {
    un: t('mois', 'month', 'mes'),
    le: t('Mois', 'Month', 'Mes'),
    les: t('Mois', 'Months', 'Meses'),
    parPeriode: t('Grille mensuelle', 'Monthly grid', 'Cuadrícula mensual'),
    aPayer: t('Mois à payer', 'Months to pay', 'Meses a pagar'),
    parX: t('Par mois', 'By month', 'Por mes'),
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * LA LISTE DES ABONNÉS — quatre fonctions sorties de `src/pages/Cantine.jsx`.
 *
 * POURQUOI ELLES DESCENDENT ICI. La règle des quatre états vivait dans le
 * `useMemo` de la page (l.284-297 avant ce lot). C'était la DERNIÈRE règle
 * métier de cet écran écrite dans du JSX : on ne pouvait pas l'exercer sans
 * monter React, et le dépôt n'a pas de moteur de rendu. Le critère
 * d'acceptation « les chiffres affichés sont ceux de `derivees`, champ par
 * champ » était donc invérifiable sur la seule règle qui pouvait diverger.
 *
 * Elles ne changent AUCUN calcul : même ordre de test, mêmes bornes, même
 * barème de tri. C'est un déplacement, et `_cantineListe.test.mjs` compare
 * ligne à ligne avec le jeu d'essai du dossier de refonte.
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * L'ÉTAT D'UN ABONNÉ, lu sans calcul par la secrétaire.
 *
 * L'ordre des tests est la règle, pas un détail : `sans_dette` passe AVANT
 * `a_jour`. Un élève à qui l'école ne facture rien n'est pas « à jour » — il
 * n'a jamais rien dû, et le dire autrement laisserait croire qu'il a payé.
 */
export function etatAbonne(ligne) {
  const du = Number(ligne?.du) || 0;
  const reste = Number(ligne?.reste) || 0;
  const paye = Number(ligne?.paye) || 0;
  if (du <= 0) return 'sans_dette';
  if (reste <= 0) return 'a_jour';
  return paye > 0 ? 'partiel' : 'impaye';
}

/** Les quatre états, dans l'ordre où l'écran les classe. */
export const ETATS_ABONNE = Object.freeze(['impaye', 'partiel', 'a_jour', 'sans_dette']);

/**
 * La grille, lue par élève. Même matière que la grille des mois : deux listes
 * qui divergeraient sous le même filtre seraient pires qu'une seule.
 *
 * @param {Array}  grille    sortie de `grilleCantine`
 * @param {object} [sections] { [student_id]: clé de section } — résolue par
 *                 `classSectionKey`, jamais stockée en base.
 */
export function listeAbonnes({ grille = [], sections = null, periode = '' } = {}) {
  return grille.map((r0) => {
    // La projection vient AVANT l'état : « À jour » doit vouloir dire « à jour
    // POUR LE MOIS REGARDÉ », sinon un élève qui a payé novembre mais pas
    // décembre serait annoncé impayé pendant qu'on encaisse novembre.
    const r = projeterSurPeriode(r0, periode);
    return {
      ...r,
      moisCrees: r0.cellules.filter((c) => c.echeance_id).length,
      section: (sections && sections[r0.student_id]) || 'autre',
      statut: etatAbonne(r),
    };
  });
}

/**
 * LE FILTRE, commun aux trois onglets — et donc aux totaux, au papier et au
 * classeur. Un filtre qui ne vaudrait que pour la liste donnerait deux
 * chiffres contradictoires sur le même écran.
 *
 * `texte` cherche dans le NOM, le MATRICULE et la CLASSE : « MAT07 » et
 * « 6eme A » sont deux façons dont une école désigne quelqu'un, et exiger le
 * nom serait une chicane.
 *
 * `etat` ne s'applique qu'à une liste DÉJÀ étatée (`listeAbonnes`) : sur une
 * grille brute il ne filtrerait rien, faute de colonne `statut`.
 */
export function filtrerAbonnes(lignes = [], {
  texte = '', section = '', classe = '', etat = '', classeDe = null,
} = {}) {
  const q = String(texte || '').trim().toLowerCase();
  return lignes.filter((r) => {
    if (section && (r.section || 'autre') !== section) return false;
    if (classe && classeDe && classeDe(r.student_id) !== classe) return false;
    if (etat && (r.statut || etatAbonne(r)) !== etat) return false;
    if (!q) return true;
    return (r.name || '').toLowerCase().includes(q)
      || (r.matricule || '').toLowerCase().includes(q)
      || (r.className || '').toLowerCase().includes(q);
  });
}

// Le barème du tri par état : ce qu'on réclame en premier vient en premier.
const RANG_ETAT = { impaye: 0, partiel: 1, a_jour: 2, sans_dette: 3 };

/**
 * LE TRI. Le nom départage toujours en dernier ressort : deux lignes de même
 * reste doivent sortir dans le même ordre d'un affichage à l'autre, sinon la
 * liste bouge sous la main de la secrétaire entre deux encaissements.
 */
export function trierAbonnes(lignes = [], tri = 'nom') {
  const l = [...lignes];
  const parNom = (a, b) => (a.name || '').localeCompare(b.name || '', 'fr');
  if (tri === 'classe') {
    l.sort((a, b) => (a.className || '').localeCompare(b.className || '', 'fr') || parNom(a, b));
  } else if (tri === 'reste') {
    l.sort((a, b) => (Number(b.reste) || 0) - (Number(a.reste) || 0) || parNom(a, b));
  } else if (tri === 'statut') {
    l.sort((a, b) => (RANG_ETAT[a.statut ?? etatAbonne(a)] - RANG_ETAT[b.statut ?? etatAbonne(b)])
      || parNom(a, b));
  } else {
    l.sort(parNom);
  }
  return l;
}

/**
 * LA LIGNE D'UN ÉLÈVE, RAMENÉE À UN SEUL MOIS.
 *
 * ── POURQUOI CETTE FONCTION EXISTE ────────────────────────────────────────
 *
 * `grilleCantine` somme `du`, `paye` et `reste` sur TOUTE l'année. Tant qu'une
 * école n'avait facturé que le mois courant, cette somme ÉTAIT le mois courant
 * et la liste répondait à la question du guichet. Dès que les dix mois de
 * l'année sont créés d'avance — ce que THE GENIUS a fait le 2026-11-04 — le
 * même chiffre devient le solde annuel : 120 000 XAF en face de chaque nom, et
 * plus personne ne voit qui n'a pas payé NOVEMBRE.
 *
 * On projette donc la ligne sur une période. Les totaux et l'état se
 * recalculent sur cette seule case, avec EXACTEMENT la règle de la grille :
 * seules les conventions `plein` et `demi` sont dues — un mois exempté,
 * abandonné ou non inscrit ne doit rien, et ne doit donc pas apparaître en
 * défaut.
 *
 * `cellules` est conservé tel quel : la grille continue de montrer l'année
 * entière, c'est son office. Seule la LISTE regarde par le petit bout.
 *
 * @param {object} ligne   une ligne de `grilleCantine`
 * @param {string} periode clé de période ; vide ou absente = l'année entière
 */
export function projeterSurPeriode(ligne, periode) {
  if (!periode) return ligne;
  const c = (ligne?.cellules || []).find((x) => x.period_key === periode);
  const du = c && (c.convention === 'plein' || c.convention === 'demi')
    ? Math.max(0, Math.floor(Number(c.montantDu) || 0)) : 0;
  const paye = c ? Math.floor(Number(c.paye) || 0) : 0;
  return {
    ...ligne,
    periode,
    du,
    paye,
    reste: Math.max(0, du - paye),
    // Ce que porte la case, pour que l'écran puisse dire « exempté » plutôt
    // que « rien dû » quand la nuance compte.
    convention: c?.convention || 'non_inscrit',
  };
}
