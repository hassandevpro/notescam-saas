// LIRE LE REGISTRE EXCEL D'UN SERVICE — les pièges viennent du fichier réel
//
// Chaque cas ci-dessous reproduit un accroc constaté dans « TRANSPORT 2026.xlsx »
// de THE GENIUS (2026-10-31) : les quatre défauts qui ont fait mentir mes
// premières versions du lecteur, et les accrocs du fichier de l'école qu'il doit
// signaler sans jamais les corriger.
//
// Lancer : node --experimental-loader ./scripts/lib/esm-resolve.mjs src/lib/_registreServiceImport.test.mjs
import { lireRegistre, resumeRegistre, serieExcelEnDate, compteEleves } from './registreServiceImport.js';

let pass = 0, fail = 0;
const ok = (c, label, got) => {
  if (c) { console.log(`✅ ${label}`); pass++; }
  else { console.log(`❌ ${label} (obtenu: ${JSON.stringify(got)})`); fail++; }
};

// ── La feuille d'essai : TROIS tableaux empilés, comme le vrai fichier ──────
const V = '';
const FEUILLE = [
  ['GSBPL THE GENIUS', V, V, V, V, V, V, V, V, V, V],                                         // 1
  [V, V, V, V, V, V, V, V, V, V, V],                                                          // 2
  // ── TABLEAU 1 : LE REGISTRE — les versements sont par trimestre
  ['N°', 'NOMS ET PRENOMS', 'CLASSE', 'RESIDENCE', 'FRAIS/MOIS', 'FRAIS ANNUEL',
    '1er  TRIM', '2ème TRIM', '3ème TRIM', 'TOTAL ANNUEL', 'OBSERVAT°'],                       // 3
  // Une date glissée dans OBSERVAT° : 46028 est un numéro de série Excel.
  [1, 'MEDJO MANGA WINNIE', 'N1', 'ADINA MOTO', 7500, 60000, 25000, 23000, 12000, 60000, 46028], // 4
  // T3 vide → DEUX versements, et non trois dont un à zéro. Et sa colonne
  // TOTAL ANNUEL (70 000) contredit la somme des trimestres (65 000).
  [2, 'MBASSI MANDA YANNIS', 'CE2/BIL', 'SALVIA', 10000, 80000, 35000, 30000, V, 70000, V],    // 5
  // Montant négocié : 50 000 n'est pas un multiple de 7 500.
  [3, 'BOGNE KAMGA', 'N1', 'CAMI', 7500, 50000, 25000, 15000, 10000, 50000, V],                // 6
  [V, 'TOTAUX', V, V, 25000, 190000, 85000, 68000, 22000, 175000, V],                          // 7
  [V, V, V, V, V, V, V, V, V, V, V],                                                           // 8
  // ── TABLEAU 2 : LES SORTIS — en-tête « OU RAISONS », motifs partout.
  // La première cellule de l'en-tête est VIDE : c'est ce qui faisait voler la
  // colonne des noms par la colonne « N° » (« no » est un préfixe de « noms »).
  ['GSBPL THE GENIUS', V, V, V, V, V, V, V, V, V, V],                                          // 9
  [V, 'NOMS ET PRENOMS', 'CLASSE', 'RESIDENCE', 'PAIEMENT MOIS', 'PAIEMENT ANNUEL',
    'DÉJÀ PAYER', 'RESTE A PAYER', 'OBSERVATIONS OU RAISONS', V, V],                           // 10
  [1, 'MATEMBE TENE HELENA', 'CL1', 'Hotel Zingana', 10000, 80000, 30000, 50000, 'Affectation des parents', V, V], // 11
  // Déjà présent au registre : sa DERNIÈRE mention le dit sorti.
  [2, 'BOGNE KAMGA', 'N1', 'CAMI', 10000, 80000, 65000, 15000, 'Transféré à Douala', V, V],    // 12
  [V, 'TOTAL', V, V, 20000, 160000, 95000, 65000, V, V, V],                                    // 13
  [V, V, V, V, V, V, V, V, V, V, V],                                                           // 14
  // ── TABLEAU 3 : UN RELEVÉ — même forme, mais ce sont des élèves ACTIFS
  // presque soldés. En-tête « OBSERVATIONS » sans « RAISONS », et la colonne
  // reste vide. Les prendre pour des partants annulerait leur abonnement.
  [V, 'NOMS ET PRENOMS', 'CLASSE', 'RESIDENCE', 'PAIEMENT MOIS', 'PAIEMENT ANNUEL',
    'MONTANT DÉJÀ PAYE', 'RESTE A PAYER', 'OBSERVATIONS', V, V],                               // 15
  // 60 000 − 35 000 = 25 000, mais la feuille écrit 2 500.
  [1, 'OUMAR BEN OUSMANOU', 'CL1', 'MOSQUE', 7500, 60000, 35000, 2500, V, V, V],               // 16
  // UNE LIGNE POUR QUATRE ENFANTS : le cas qui doit bloquer.
  [2, 'FAMILLE FOMETEU (04)', 'CL3', 'EVECHE', 6000, 192000, 180000, 12000, V, V, V],          // 17
  [V, 'TOTAL', V, V, 13500, 252000, 215000, 14500, V, V, V],                                   // 18
];

const lu = lireRegistre(FEUILLE);
const r = resumeRegistre(lu);

// ── 1. LES QUATRE DÉFAUTS QUI ONT FAIT MENTIR LE LECTEUR ───────────────────
console.log('\n— Les quatre pièges du fichier réel —');
ok(r.nbTableaux === 3, 'les TROIS tableaux sont repérés, même celui dont la colonne N° est vide', r.nbTableaux);
ok(lu.tableaux[0].type === 'registre', 'le premier est le registre : il a des colonnes trimestrielles');
// LE PIÈGE QUI COÛTAIT DE L'ARGENT : « a une colonne OBSERVATIONS donc liste
// des partants » aurait abandonné onze abonnements en cours.
ok(lu.tableaux[1].type === 'sortis', 'le deuxième liste des SORTANTS : « OU RAISONS », et des motifs partout');
ok(lu.tableaux[2].type === 'releve',
  'le troisième est un RELEVÉ d’élèves actifs, pas des partants — sa colonne d’observations est vide',
  lu.tableaux[2].type);
// « TOTAL » et « TOTAUX » : /^totaux?$/ ne reconnaissait que le second, et les
// lignes de total devenaient des élèves, avec un « tarif » de 117 000 par mois.
const noms = lu.eleves.map((e) => e.nom);
ok(!noms.some((n) => /^TOTAL/i.test(n)), 'aucune ligne TOTAL / TOTAUX n’est prise pour un élève',
  noms.filter((n) => /TOTAL/i.test(n)));
ok(!r.tarifs.some((t) => t > 20000), 'aucun tarif aberrant : les totaux de colonne ne polluent plus les tarifs', r.tarifs);
ok(lu.eleves.every((e) => e.nom && !/^\d+$/.test(e.nom)), 'chaque élève a un nom, jamais un numéro d’ordre');

// ── 2. SE CONTRÔLER SUR LES TOTAUX DE L'ÉCOLE ──────────────────────────────
console.log('\n— Se contrôler sur les totaux de l’école —');
{
  const t0 = lu.tableaux[0];
  const somme = (f) => t0.lignes.reduce((s, l) => s + f(l), 0);
  ok(somme((l) => l.annuel) === t0.totaux.annuel, 'tableau 1 : l’attendu lu égale le total écrit par l’école');
  ok(somme((l) => l.paye) === t0.totaux.totalPaye, 'tableau 1 : l’encaissé lu égale TOTAL ANNUEL',
    [somme((l) => l.paye), t0.totaux.totalPaye]);
  // Et quand ça ne concorde pas, c'est DIT, et rien ne passe en silence.
  const faussee = FEUILLE.map((x, i) => (i === 6 ? [V, 'TOTAUX', V, V, 25000, 999999, 85000, 68000, 22000, 175000, V] : x));
  const alerte = lireRegistre(faussee).anomalies.filter((a) => a.type === 'total_tableau');
  ok(alerte.length === 1, 'un total qui ne tombe pas juste lève UNE anomalie', alerte.length);
  ok(/je lis 190000/.test(alerte[0]?.message || ''), 'et l’anomalie met les deux chiffres en regard', alerte[0]?.message);
}

// ── 3. LES VERSEMENTS : des montants, jamais une date inventée ─────────────
console.log('\n— Les versements —');
{
  const w = lu.eleves.find((e) => e.nom === 'MEDJO MANGA WINNIE');
  ok(w.versements.length === 3, 'trois trimestres versés font trois versements, pas un cumul');
  ok(w.versements.map((v) => v.trimestre).join() === 'T1,T2,T3', 'dans l’ordre');
  ok(w.paye === 60000, 'et leur somme est l’encaissé');
  const y = lu.eleves.find((e) => e.nom === 'MBASSI MANDA YANNIS');
  ok(y.versements.length === 2, 'un trimestre vide ne produit pas un versement à zéro', y.versements.length);
  ok(r.sansDate === r.versements,
    'AUCUN versement ne porte de date : le fichier n’en donne pas, et on n’en invente pas', [r.sansDate, r.versements]);
  ok(w.dateObservee === '2026-01-06' && w.motif === '',
    'une observation qui n’est QU’un numéro de série Excel devient une date, pas un motif',
    [w.dateObservee, w.motif]);
  ok(r.datesObservees === 1, 'et ces dates-là sont comptées à part : on ne sait pas ce qu’elles datent', r.datesObservees);
}

// ── 4. LES SORTANTS GARDENT LEUR RAISON ────────────────────────────────────
console.log('\n— Les sortants —');
{
  const s = lu.eleves.find((e) => e.nom === 'MATEMBE TENE HELENA');
  ok(s.sortant === true, 'un élève du tableau des sortis est marqué sortant');
  ok(s.motif === 'Affectation des parents', 'et sa raison est conservée mot pour mot', s.motif);
  ok(s.reste === 50000, 'son reste dû est celui que l’école a écrit');
  const b = lu.eleves.find((e) => e.nom === 'BOGNE KAMGA');
  ok(b.sortant === true, 'un élève du registre repris aux sortis EST un sortant');
  ok(b.motif === 'Transféré à Douala', 'avec le motif de sa dernière mention');
  ok(Array.isArray(b.repris) && b.repris.length === 1, 'et la mention précédente reste en trace');
  // LE RELEVÉ N'EST PAS UNE SORTIE.
  const o = lu.eleves.find((e) => e.nom === 'OUMAR BEN OUSMANOU');
  ok(o.sortant === false, 'un élève du relevé reste ACTIF : son abonnement n’est pas abandonné');
  ok(r.elevesDistincts === 6, 'six élèves distincts, pas sept : le doublon est fondu', r.elevesDistincts);
  ok(r.sortants === 2, 'deux sortants seulement', r.sortants);
}

// ── 5. CE QUI EST SIGNALÉ, ET JAMAIS CORRIGÉ ───────────────────────────────
console.log('\n— Les anomalies —');
{
  const par = (t) => lu.anomalies.filter((a) => a.type === t);
  ok(par('plusieurs_eleves').length === 1, 'une ligne pour quatre enfants est signalée');
  ok(par('plusieurs_eleves')[0].nbEleves === 4, 'avec son effectif lu entre parenthèses');
  ok(r.bloquantes === 1, 'et elle est BLOQUANTE : on n’invente pas quatre noms', r.bloquantes);
  ok(par('reste_incoherent').length === 1, 'un reste qui ne tombe pas juste est signalé', par('reste_incoherent').length);
  ok(/2500/.test(par('reste_incoherent')[0]?.message || ''), 'avec les deux chiffres en regard');
  ok(par('total_incoherent').length === 1,
    'un TOTAL ANNUEL qui contredit la somme des trimestres est signalé', par('total_incoherent').length);
  ok(par('annuel_non_multiple').length === 1, 'un annuel non multiple du tarif est signalé, pas corrigé',
    par('annuel_non_multiple').length);
  ok(par('doublon').length === 1, 'le doublon est signalé même s’il a été fondu');
  // RIEN n'est corrigé : la valeur de l'école reste celle de l'école.
  const o = lu.eleves.find((e) => e.nom === 'OUMAR BEN OUSMANOU');
  ok(o.reste === 2500, 'le reste reste celui écrit par l’école, incohérent ou non', o.reste);
  ok(o.resteEcrit === 2500, 'et on garde la trace qu’il était écrit');
}

// ── 6. LES DEUX HELPERS PURS ───────────────────────────────────────────────
console.log('\n— Série Excel et effectif —');
ok(serieExcelEnDate('46028') === '2026-01-06', '46028 → 2026-01-06', serieExcelEnDate('46028'));
ok(serieExcelEnDate('45922') === '2025-09-22', '45922 → 2025-09-22', serieExcelEnDate('45922'));
ok(serieExcelEnDate('7500') === null, 'un montant à quatre chiffres n’est pas une date');
ok(serieExcelEnDate('60000') === null, 'ni un montant à cinq chiffres hors de la fourchette');
ok(serieExcelEnDate('Affectation') === null, 'ni un vrai motif');
ok(serieExcelEnDate('') === null && serieExcelEnDate(null) === null, 'ni le vide');
ok(compteEleves('FAMILLE FOMETEU (04)') === 4, '« (04) » → quatre élèves');
ok(compteEleves('FAMILLE NGONO') === 0, 'une famille sans effectif → inconnu, pas un');
ok(compteEleves('MEDJO MANGA WINNIE') === 1, 'un nom ordinaire → un élève');
ok(compteEleves('') === 1 && compteEleves(null) === 1, 'rien → un, sans lever');

// ── 7. LES REFUS ───────────────────────────────────────────────────────────
console.log('\n— Les refus —');
{
  const rien = lireRegistre([]);
  ok(rien.tableaux.length === 0 && rien.anomalies[0].type === 'aucun_tableau',
    'une feuille vide est refusée clairement, pas lue à moitié');
  const sansEntete = lireRegistre([['du texte', 'au hasard'], [1, 2, 3]]);
  ok(sansEntete.anomalies[0].type === 'aucun_tableau', 'une feuille sans en-tête reconnaissable aussi');
  ok(lireRegistre(null).tableaux.length === 0, 'null ne lève pas');
  ok(resumeRegistre().elevesDistincts === 0, 'un résumé sans lecture ne lève pas');
}

console.log(fail === 0 ? '\n✅ Tous les tests passent' : `\n❌ ÉCHEC : ${fail}`);
if (fail > 0) process.exit(1);
