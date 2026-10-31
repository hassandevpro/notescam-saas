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
 * @param {number} tarifPlein  `fee_catalog.amount` de l'année.
 */
export function celluleDuMois({ ligne = null, paye = 0, tarifPlein = 0 } = {}) {
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

  // Facturé : plein mois, ou demi-mois si l'échéance porte MOINS que le tarif.
  const demi = tarifPlein > 0 && montantDu > 0 && montantDu < tarifPlein;
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
 * @param {number} p.tarifPlein
 */
export function grilleCantine({ eleves = [], echeances = [], paiements = [], mois = [], tarifPlein = 0 } = {}) {
  // Index (élève, mois) → échéance. Une seule passe : la grille d'une école de
  // soixante élèves sur neuf mois, c'est déjà cinq cents cases.
  const parEleveEtMois = new Map();
  for (const l of echeances) {
    parEleveEtMois.set(`${l.student_id}|${l.period_key}`, l);
  }

  return eleves.map((e) => {
    const cellules = mois.map((cle) => {
      const ligne = parEleveEtMois.get(`${e.id}|${cle}`) || null;
      const c = celluleDuMois({ ligne, paye: payeDe(ligne, paiements), tarifPlein });
      return { period_key: cle, echeance_id: ligne?.id ?? null, ...c };
    });
    const du    = cellules.reduce((s, c) => s + (c.convention === 'plein' || c.convention === 'demi' ? c.montantDu : 0), 0);
    const paye  = cellules.reduce((s, c) => s + c.paye, 0);
    return {
      student_id: e.id, name: e.name ?? '', className: e.className ?? '',
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
