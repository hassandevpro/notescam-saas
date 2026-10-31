// LE REGISTRE DE CANTINE REND-IL LE CAHIER DE L'ÉCOLE, AU FRANC PRÈS ?
//
// Fonctions pures : aucun DOM, aucune base, aucun réseau.
// Lancer : node src/lib/_cantineEngine.test.mjs
//
// Ce que ce fichier protège, et pourquoi chaque point a été choisi :
//   • les quatre conventions du cahier (15 000, 7 500, /, ABANDON) — ce sont
//     elles que l'école lit, et une case mal peinte se voit immédiatement ;
//   • « / » ne crée AUCUNE dette — le confondre avec un impayé accuserait des
//     familles qui n'ont jamais souscrit ;
//   • un abandon n'efface pas un impayé ANTÉRIEUR — l'inverse perdrait de
//     l'argent dû, en silence ;
//   • le demi-mois fait DEMI-quote-part — mesuré sur avril 2026, pas supposé ;
//   • la quote-part ne sort d'aucune table d'écritures — l'y porter la
//     compterait deux fois, elle est déjà contenue dans les 15 000 ;
//   • décembre est un mois SANS SERVICE, pas un mois à zéro impayé ;
//   • et, contrôle d'ensemble : rejouer le cahier 2025-2026 doit redonner les
//     615 000 que l'école a écrits à la main.
import {
  TAUX_DEMI_MOIS, CONVENTIONS, TEXTE_CONVENTION,
  moisDuService, enteteMois, tarifPleinDe, celluleDuMois,
  grilleCantine, quotePartDuMois, etatMensuel, etatsMensuels, csvEtatsMensuels,
} from './cantineEngine.js';

let ko = 0;
const ok = (c, libelle, obtenu) => {
  if (c) { console.log(`  ok   ${libelle}`); }
  else { console.log(`  KO   ${libelle} — obtenu ${JSON.stringify(obtenu)}`); ko++; }
};

const PLEIN = 15000;
const DEMI  = 7500;
const QP    = 2500;

const SERVICE = {
  id: 'cat-cantine', name: 'Cantine', category: 'cantine', amount: PLEIN,
  academic_year: '2025-2026', periodicity: 'mensuel', quote_part: QP,
  allow_partial: 1, allow_exemption: 1,
};

// Le cahier ne facture PAS décembre. On le dit explicitement, comme l'école.
const MOIS = ['2025-09', '2025-10', '2025-11', '2026-01', '2026-02',
  '2026-03', '2026-04', '2026-05'];

const ech = (student_id, period_key, amount_due, status = 'due', extra = {}) =>
  ({ id: `${student_id}-${period_key}`, student_id, period_key, amount_due, status, ...extra });

// ── 1. Le service et ses mois ───────────────────────────────────────────────
console.log('\n— Le service —');
{
  const m = moisDuService({ ...SERVICE, billing_periods: MOIS }, '2025-2026');
  ok(m.length === 8 && m[0] === '2025-09' && !m.includes('2025-12'),
    'les mois facturés sont une DONNÉE : décembre n’y est pas', m);

  const defaut = moisDuService({ ...SERVICE, billing_periods: [] }, '2025-2026');
  ok(defaut.includes('2025-12'),
    'sans liste explicite, le défaut mensuel porte bien décembre (c’est l’école qui le retire)',
    defaut.length);

  ok(tarifPleinDe(SERVICE) === PLEIN, 'le tarif plein vient de fee_catalog.amount', tarifPleinDe(SERVICE));
  ok(enteteMois(['2025-09'])[0].label.length > 0, 'chaque mois porte un libellé lisible');
  ok(CONVENTIONS.length === 5 && TAUX_DEMI_MOIS === 0.5, 'cinq conventions, demi-mois à 50 %');
}

// ── 2. Les quatre conventions du cahier ─────────────────────────────────────
console.log('\n— Les quatre conventions —');
{
  const plein = celluleDuMois({ ligne: ech('e1', '2025-09', PLEIN), paye: 0, tarifPlein: PLEIN });
  ok(plein.convention === 'plein' && plein.texte === '15000', '15 000 → mois plein', plein);

  const demi = celluleDuMois({ ligne: ech('e1', '2025-09', DEMI), paye: 0, tarifPlein: PLEIN });
  ok(demi.convention === 'demi' && demi.montantDu === DEMI,
    '7 500 → DEMI-MOIS, détecté sans colonne supplémentaire', demi);

  const absente = celluleDuMois({ ligne: null, tarifPlein: PLEIN });
  ok(absente.convention === 'non_inscrit' && absente.montantDu === 0
     && absente.texte === TEXTE_CONVENTION.non_inscrit,
    'aucune échéance → « / », et surtout PAS une échéance à zéro', absente);

  const na = celluleDuMois({ ligne: ech('e1', '2025-09', PLEIN, 'not_applicable'), tarifPlein: PLEIN });
  ok(na.convention === 'non_inscrit' && na.montantDu === 0,
    'status not_applicable → « / », et le montant tombe à zéro', na);

  const ab = celluleDuMois({ ligne: ech('e1', '2026-02', PLEIN, 'abandoned'), tarifPlein: PLEIN });
  ok(ab.convention === 'abandon' && ab.reste === 0,
    'ABANDON → plus rien n’est dû sur ce mois', ab);

  const ex = celluleDuMois({ ligne: ech('e1', '2026-02', PLEIN, 'exempted'), tarifPlein: PLEIN });
  ok(ex.convention === 'exempte' && ex.reste === 0, 'EXEMPTÉ sort du dû', ex);

  const partiel = celluleDuMois({ ligne: ech('e1', '2025-09', PLEIN), paye: 5000, tarifPlein: PLEIN });
  ok(partiel.statut === 'partial' && partiel.reste === 10000,
    'un versement partiel laisse le reste exact', partiel);

  const solde = celluleDuMois({ ligne: ech('e1', '2025-09', PLEIN), paye: PLEIN, tarifPlein: PLEIN });
  ok(solde.statut === 'paid' && solde.reste === 0, 'soldé → reste nul', solde);
}

// ── 3. « / » ne crée aucune dette ───────────────────────────────────────────
console.log('\n— « / » n’est pas un impayé —');
{
  const cellules = [
    celluleDuMois({ ligne: ech('e1', '2025-09', PLEIN), tarifPlein: PLEIN }),
    celluleDuMois({ ligne: null, tarifPlein: PLEIN }),
    celluleDuMois({ ligne: null, tarifPlein: PLEIN }),
  ];
  const e = etatMensuel({ cellules, quotePart: QP });
  ok(e.inscrits === 1 && e.nonInscrits === 2, 'un seul inscrit, deux non inscrits', e);
  ok(e.attendu === PLEIN && e.impaye === PLEIN,
    'l’attendu et l’impayé ne portent QUE l’inscrit', { attendu: e.attendu, impaye: e.impaye });
}

// ── 4. Un abandon n’efface pas un impayé antérieur ──────────────────────────
console.log('\n— L’abandon ne solde rien —');
{
  const grille = grilleCantine({
    eleves: [{ id: 'e1', name: 'ESSONO IVRACK', className: 'CL3' }],
    mois: ['2025-09', '2025-10', '2025-11'],
    tarifPlein: PLEIN,
    echeances: [
      ech('e1', '2025-09', PLEIN, 'due'),                 // impayé ANTÉRIEUR
      ech('e1', '2025-10', PLEIN, 'abandoned'),
      ech('e1', '2025-11', PLEIN, 'abandoned'),
    ],
    paiements: [],
  });
  ok(grille[0].du === PLEIN,
    'seul le mois antérieur à l’abandon reste dû', grille[0].du);

  const { total } = etatsMensuels({ grille, mois: ['2025-09', '2025-10', '2025-11'], quotePart: QP });
  ok(total.impaye === PLEIN, 'l’impayé de septembre SURVIT à l’abandon d’octobre', total.impaye);
  ok(total.quotePart === QP, 'un mois abandonné ne porte aucune quote-part', total.quotePart);
}

// ── 5. Le demi-mois fait DEMI-quote-part ────────────────────────────────────
console.log('\n— Avril 2026 : 22 demi-mois font 27 500, pas 55 000 —');
{
  const vingtDeux = Array.from({ length: 22 }, (_, i) =>
    celluleDuMois({ ligne: ech(`e${i}`, '2026-04', DEMI), tarifPlein: PLEIN }));
  ok(quotePartDuMois({ cellules: vingtDeux, quotePart: QP }) === 27500,
    '22 élèves au demi-mois → 27 500, le chiffre écrit par l’école',
    quotePartDuMois({ cellules: vingtDeux, quotePart: QP }));

  const onzePleins = Array.from({ length: 11 }, (_, i) =>
    celluleDuMois({ ligne: ech(`e${i}`, '2026-04', PLEIN), tarifPlein: PLEIN }));
  ok(quotePartDuMois({ cellules: onzePleins, quotePart: QP }) === 27500,
    'l’autre lecture donne le même total — c’est le COMPTAGE qui tranche, pas l’arithmétique',
    quotePartDuMois({ cellules: onzePleins, quotePart: QP }));

  ok(quotePartDuMois({ cellules: vingtDeux, quotePart: null }) === 0,
    'sans quote-part renseignée (les 43 autres écoles), le calcul rend 0');

  const impair = [celluleDuMois({ ligne: ech('e1', '2026-04', DEMI), tarifPlein: PLEIN })];
  ok(Number.isInteger(quotePartDuMois({ cellules: impair, quotePart: 2500 })),
    'la quote-part reste un entier : on est en francs, il n’y a pas de centime',
    quotePartDuMois({ cellules: impair, quotePart: 2500 }));
}

// ── 6. Décembre : un mois SANS SERVICE ──────────────────────────────────────
console.log('\n— Décembre n’existe pas —');
{
  const vide = etatMensuel({ cellules: [
    celluleDuMois({ ligne: null, tarifPlein: PLEIN }),
    celluleDuMois({ ligne: null, tarifPlein: PLEIN }),
  ], quotePart: QP });
  ok(vide.moisSansService === true, 'aucun facturé, aucun abandon → mois sans service', vide);
  ok(vide.impaye === 0 && vide.attendu === 0 && vide.quotePart === 0,
    'et il ne compte ni en attendu, ni en impayé, ni en quote-part', vide);

  const actif = etatMensuel({ cellules: [
    celluleDuMois({ ligne: ech('e1', '2025-09', PLEIN), tarifPlein: PLEIN }),
  ], quotePart: QP });
  ok(actif.moisSansService === false, 'un mois qui facture n’est jamais « sans service »');
}

// ── 7. Le mois PAYÉ n’est pas le mois SERVI ─────────────────────────────────
console.log('\n— Le rattrapage de janvier —');
{
  // 30 000 posés en janvier soldent novembre ET janvier : deux versements
  // rattachés à DEUX échéances distinctes, datés du même jour.
  const grille = grilleCantine({
    eleves: [{ id: 'e1', name: 'MUSANGO ANDRE', className: 'CL4' }],
    mois: ['2025-11', '2026-01'],
    tarifPlein: PLEIN,
    echeances: [ech('e1', '2025-11', PLEIN), ech('e1', '2026-01', PLEIN)],
    paiements: [
      { id: 'p1', fee_schedule_item_id: 'e1-2025-11', amount: PLEIN, date: '2026-01-12' },
      { id: 'p2', fee_schedule_item_id: 'e1-2026-01', amount: PLEIN, date: '2026-01-12' },
    ],
  });
  const { parMois } = etatsMensuels({ grille, mois: ['2025-11', '2026-01'], quotePart: QP });
  ok(parMois[0].encaisse === PLEIN && parMois[0].impaye === 0,
    'novembre est soldé par un versement de JANVIER — l’état suit le mois SERVI', parMois[0]);
  ok(parMois[0].inscrits === 1 && parMois[1].inscrits === 1,
    'et l’effectif de novembre reste celui de novembre', [parMois[0].inscrits, parMois[1].inscrits]);
}

// ── 8. Une contre-passation remet le mois à « dû » ──────────────────────────
console.log('\n— La contre-passation —');
{
  const grille = grilleCantine({
    eleves: [{ id: 'e1', name: 'X' }],
    mois: ['2025-09'], tarifPlein: PLEIN,
    echeances: [ech('e1', '2025-09', PLEIN)],
    paiements: [
      { id: 'p1', fee_schedule_item_id: 'e1-2025-09', amount: PLEIN },
      { id: 'p2', fee_schedule_item_id: 'e1-2025-09', amount: -PLEIN, reversal_of: 'p1' },
    ],
  });
  ok(grille[0].cellules[0].statut === 'due' && grille[0].reste === PLEIN,
    'annuler le versement de septembre remet septembre à « dû »', grille[0].cellules[0]);
}

// ── 9. Un versement posé sur un mois abandonné ne solde pas un autre mois ───
console.log('\n— L’argent entré ne gomme pas la dette d’ailleurs —');
{
  const grille = grilleCantine({
    eleves: [{ id: 'e1', name: 'X' }],
    mois: ['2025-09', '2025-10'], tarifPlein: PLEIN,
    echeances: [ech('e1', '2025-09', PLEIN, 'due'), ech('e1', '2025-10', PLEIN, 'abandoned')],
    paiements: [{ id: 'p1', fee_schedule_item_id: 'e1-2025-10', amount: PLEIN }],
  });
  const { parMois } = etatsMensuels({ grille, mois: ['2025-09', '2025-10'], quotePart: QP });
  ok(parMois[0].impaye === PLEIN, 'septembre reste impayé', parMois[0].impaye);
  ok(parMois[1].encaisse === PLEIN && parMois[1].impaye === 0,
    'octobre montre l’argent réellement entré, sans créer de dette', parMois[1]);
}

// ── 10. LE CONTRÔLE D'ENSEMBLE : rejouer le cahier 2025-2026 ────────────────
console.log('\n— Le cahier de l’école, rejoué —');
{
  // Effectifs relevés sur CANTINE.docx. Avril : 22 élèves, tous au demi-mois.
  const EFFECTIFS = [
    ['2025-09', 33, 0], ['2025-10', 37, 0], ['2025-11', 28, 0],
    ['2026-01', 35, 0], ['2026-02', 32, 0], ['2026-03', 37, 0],
    ['2026-04', 22, 22], ['2026-05', 33, 0],
  ];
  const eleves = Array.from({ length: 40 }, (_, i) => ({ id: `e${i}`, name: `ELEVE ${i}` }));
  const echeances = [];
  for (const [cle, effectif, demis] of EFFECTIFS) {
    for (let i = 0; i < effectif; i++) {
      echeances.push(ech(`e${i}`, cle, i < demis ? DEMI : PLEIN));
    }
  }
  const mois = EFFECTIFS.map(([c]) => c);
  const grille = grilleCantine({ eleves, mois, tarifPlein: PLEIN, echeances, paiements: [] });
  const { parMois, total } = etatsMensuels({ grille, mois, quotePart: QP });

  const attenduQP = [82500, 92500, 70000, 87500, 80000, 92500, 27500, 82500];
  const obtenuQP = parMois.map((m) => m.quotePart);
  ok(JSON.stringify(obtenuQP) === JSON.stringify(attenduQP),
    'les huit quote-parts mensuelles du cahier, une à une', obtenuQP);

  ok(total.quotePart === 615000,
    'TOTAL GENERAL = 615 000 FCFA — le chiffre écrit à la main par l’école',
    total.quotePart);

  ok(total.inscrits === 257,
    '257 mois-élèves (et non 246 : avril en compte 22, pas 11)', total.inscrits);

  // 2026-2027 : la quote-part passe à 3 500, portée par la ligne de l'ANNÉE.
  const { total: t27 } = etatsMensuels({ grille, mois, quotePart: 3500 });
  // 235 mois pleins × 3 500 + 22 demi-mois × 1 750 = 822 500 + 38 500.
  // C'est exactement le chiffre annoncé au § 5.2 de docs/MODULE_CANTINE.md.
  ok(t27.quotePart === 861000,
    'à 3 500, le même effectif donne 861 000 — la ligne de l’ANNÉE suffit, sans reprise de données',
    t27.quotePart);
}

// ── 11. L'export ────────────────────────────────────────────────────────────
console.log('\n— L’export remis à la comptabilité —');
{
  const grille = grilleCantine({
    eleves: [{ id: 'e1', name: 'X' }], mois: ['2025-09'], tarifPlein: PLEIN,
    echeances: [ech('e1', '2025-09', PLEIN)], paiements: [],
  });
  const { parMois, total } = etatsMensuels({ grille, mois: ['2025-09'], quotePart: QP });
  const csv = csvEtatsMensuels({ parMois, total });
  ok(csv.startsWith('﻿'), 'BOM présent : Excel francophone rend « Février » lisible');
  ok(csv.includes(';'), 'séparateur point-virgule : une colonne par champ, pas une seule');
  ok(csv.includes('2500'), 'la quote-part figure dans l’export');
  ok(csv.split('\r\n').filter(Boolean).length === 3, 'en-tête + un mois + total', csv.split('\r\n').length);
}

console.log(`\n${ko === 0 ? 'TOUT PASSE' : ko + ' ECHEC(S)'}`);
process.exit(ko === 0 ? 0 : 1);
