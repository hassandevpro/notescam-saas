// Le cahier de caisse est un format tenu à la main. Ce test construit un
// classeur SYNTHÉTIQUE qui reproduit ses cinq pièges, et vérifie qu'aucun ne
// passe. Il ne dépend d'aucun fichier de l'école : il tourne partout.
import { strict as assert } from 'node:assert';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import XLSX from 'xlsx';
import { readCashBook, parseDate, parseMontant } from './caisseWorkbook.mjs';

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const eq = (a, b, m) => { assert.equal(a, b, m); n++; };
const deq = (a, b, m) => { assert.deepEqual(a, b, m); n++; };

// ── Montants ────────────────────────────────────────────────────────────────
eq(parseMontant(2000000).value, 2000000, 'montant numérique');
eq(parseMontant('254 08').value, 25408, '« 254 08 » se lit 25408 (la valeur source est conservée)');
ok(parseMontant('254 08').suspect, '« 254 08 » est signalé comme douteux');
ok(!parseMontant(25408).suspect, 'un nombre propre n’est pas suspect');
eq(parseMontant('pas un nombre').value, null, 'texte non numérique → null');
ok(parseMontant('pas un nombre').suspect, 'texte non numérique → signalé');
deq(parseMontant(null), { value: null, suspect: false }, 'cellule vide : ni valeur ni alerte');

// ── Dates saisies à la main ─────────────────────────────────────────────────
eq(parseDate('1er/07/2026').iso, '2026-07-01', '« 1er » = le 1er');
ok(parseDate('1er/07/2026').note, '… et c’est signalé');
eq(parseDate('20/007/2026').iso, '2026-07-20', '« 007 » se lit 07');
eq(parseDate('2026-07-09').iso, '2026-07-09', 'ISO inchangée');
eq(parseDate(new Date(Date.UTC(2026, 6, 16))).iso, '2026-07-16', 'date Excel réelle');
// Une année sur 3 chiffres n'est PAS devinée : rattacher l'opération au mauvais
// mois comptable serait pire que de la signaler.
eq(parseDate('13/02/025').iso, null, '« 025 » refusée');
ok(/3 chiffres/.test(parseDate('13/02/025').note), '… avec la raison');
eq(parseDate('32/07/2026').iso, null, 'jour 32 refusé');
eq(parseDate('20/13/2026').iso, null, 'mois 13 refusé');

// ════════════════════════════════════════════════════════════════════════════
// Classeur synthétique : deux mois, et les cinq pièges du format.
// ════════════════════════════════════════════════════════════════════════════
const EN_TETE = ['ORDRE', 'REPORT', 'ENTREES', 'DATES', 'SORTIES', 'MOTIFS OU LIBELLES', 'BALANCE', 'OBSERVAT°'];
const aoa = [
  // Piège 5 : titre fusionné sur A1:H2 → son texte se retrouve dans TOUTES les cellules.
  ['TEST COLLEGE ETAT DES DEPENSES DU MOIS DE JUILLET 2026', null, null, null, null, null, null, null],
  [null, null, null, null, null, null, null, null],
  EN_TETE,
  // Dotation de caisse.
  [1, 'O', 1000000, '1er/07/2026', null, 'APPROVISIONNEMENT DE LA CAISSE', 1000000, null],
  // Groupe de 2 dépenses + 1 sous-total (pièges 1 et 2 : ORDRE/DATE/BALANCE fusionnés).
  [26001, null, null, '2026-07-10', 300000, 'Première dépense du groupe', 550000, null],
  [null, null, null, null, 150000, 'Deuxième dépense du groupe', null, null],
  [null, null, null, null, 450000, null, null, null],          // sous-total TAPÉ À LA MAIN
  // Dépense isolée.
  [26002, null, null, '2026-07-20', 50000, 'Dépense isolée', 500000, null],
  [null, null, null, null, null, null, null, null],
  ['TOTAL', 0, 1000000, null, 500000, 'Dépenses générales du mois', 500000, 'Solde caisse'],
  // Piège 4 : annexe SOUS le TOTAL, réglée par la banque, montant en ENTREES.
  ['Salaires du personnel', null, 2900000, null, null, null, null, null],
  ['TOTAL GENERAL', null, 3400000, null, null, 'Sorties de banque', null, null],
  [null, null, null, null, null, null, null, null],
  // Mois suivant : piège 3, le REPORT n'est pas une recette.
  ['TEST COLLEGE ETAT DES DEPENSES DU MOIS D\'AOUT 2026', null, null, null, null, null, null, null],
  [null, null, null, null, null, null, null, null],
  EN_TETE,
  [null, 500000, null, '1er/08/2026', null, 'Report caisse du 31/07/2026', 500000, null],
  [26003, null, null, '2026-08-05', 120000, 'Dépense d\'août', 380000, null],
  // Dépense RÉELLEMENT sans n° d'ordre (cas de tout le bloc d'août du primaire) :
  // à distinguer d'un numéro simplement hérité d'une cellule fusionnée.
  [null, null, null, '2026-08-06', 80000, 'Dépense sans numéro d\'ordre', null, null],
];
const ws = XLSX.utils.aoa_to_sheet(aoa);
ws['!merges'] = [
  { s: { r: 0, c: 0 }, e: { r: 1, c: 7 } },     // titre juillet
  { s: { r: 4, c: 0 }, e: { r: 5, c: 0 } },     // ORDRE 26001 sur 2 lignes
  { s: { r: 4, c: 3 }, e: { r: 6, c: 3 } },     // DATE du groupe
  { s: { r: 4, c: 6 }, e: { r: 6, c: 6 } },     // BALANCE du groupe
  { s: { r: 13, c: 0 }, e: { r: 14, c: 7 } },   // titre août
];
const dir = mkdtempSync(join(tmpdir(), 'caisse-test-'));
const path = join(dir, 'TEST.xlsx');
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'Feuil1');
XLSX.writeFile(wb, path);

try {
  const r = readCashBook(path, { etabResolver: () => 'TEST', label: 'TEST.xlsx' });

  // Piège 5 : deux sections, pas quatre (le titre fusionné n'en ouvre qu'une).
  eq(r.sections.length, 2, 'un titre fusionné n’ouvre qu’UNE section');
  eq(r.sections[0].mois, 7, 'juillet reconnu');
  eq(r.sections[1].mois, 8, 'août reconnu');

  const jul = r.sections[0].resume;
  // Piège 1 : le sous-total de 450 000 ne doit PAS compter comme une dépense.
  eq(jul.nbDepenses, 3, 'trois dépenses réelles, le sous-total exclu');
  eq(jul.sommeDepenses, 500000, 'dépenses = 500 000, et non 950 000 (sous-total compté)');
  // Piège 4 : ni les salaires (2 900 000) ni le total banque (3 400 000) en entrées.
  eq(jul.sommeAppros, 1000000, 'entrées = 1 000 000 : annexes bancaires exclues');
  eq(jul.soldeFinal, 500000, 'solde de juillet');
  deq(jul.concordance, { sorties: true, entrees: true, solde: true }, 'juillet se rapproche de sa ligne TOTAL');

  // Piège 2 : la balance fusionnée vaut après la DERNIÈRE ligne du groupe.
  deq(r.ecarts, [], 'aucun écart : la balance de bloc est comparée au bon solde');
  // ORDRE et DATE hérités du bloc, et marqués comme tels.
  const g2 = r.ops.find((o) => o.row === 6);
  eq(g2.ordre, 26001, 'le n° d’ordre du groupe est hérité');
  ok(g2.ordreMerged, '… et signalé comme hérité, non comme saisi');
  eq(g2.date, '2026-07-10', 'la date du groupe est héritée');

  // Piège 3 : le report positionne le solde d'août, il ne s'ajoute pas.
  const aou = r.sections[1].resume;
  eq(aou.report, 500000, 'report d’août lu');
  eq(aou.sommeAppros, 0, 'un report n’est PAS une entrée');
  eq(aou.soldeFinal, 300000, 'solde d’août = 500 000 − 120 000 − 80 000');
  eq(aou.nbDepenses, 2, 'deux dépenses en août');

  // Les lignes de contrôle sont conservées, étiquetées, et hors des opérations.
  const parType = {};
  for (const c of r.controls) parType[c.type] = (parType[c.type] || 0) + 1;
  eq(parType.sous_total_groupe, 1, 'un sous-total identifié');
  eq(parType.total_mensuel, 1, 'un total mensuel identifié');
  eq(parType.report_solde, 1, 'un report identifié');
  eq(parType.annexe_hors_caisse, 1, 'une annexe hors caisse identifiée');
  eq(parType.total_banque, 1, 'un total de banque identifié');
  ok(r.ops.every((o) => o.type === 'depense' || o.type === 'approvisionnement'),
    'les opérations ne contiennent QUE des dépenses et des entrées');

  // Traçabilité : chaque opération sait d'où elle vient.
  ok(r.ops.every((o) => o.file === 'TEST.xlsx' && Number.isInteger(o.row)),
    'chaque opération porte son fichier et sa ligne');

  // Un n° d'ordre HÉRITÉ d'une fusion n'est pas un numéro manquant ; seul un
  // numéro réellement absent de la source doit être signalé. Confondre les deux
  // noierait les vraies lacunes sous des centaines de fausses.
  const sansOrdre = r.anomalies.filter((a) => /ordre absent/.test(a.probleme));
  eq(sansOrdre.length, 1, 'une seule dépense signalée sans n° d’ordre');
  eq(sansOrdre[0].row, 19, '… celle qui n’en a réellement pas');
  ok(!sansOrdre.some((a) => a.row === 6), 'la ligne au numéro hérité n’est PAS signalée');

  // Aucun doublon dans ce classeur : deux montants égaux à libellés différents
  // ne doivent surtout pas être fusionnés.
  deq(r.doublons, [], 'pas de faux doublon sur des libellés différents');

  console.log(`caisseWorkbook : ${n} assertions OK`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
