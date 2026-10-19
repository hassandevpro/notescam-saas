import { strict as assert } from 'node:assert';
import {
  cashLedger, cashTotals, monthlySummary, reconcile, balancesByUnit, pendingBalances,
  isEntry, isExit, isOpening, movementEffect, isCashOut, MOVEMENT_KINDS,
} from './cashBookEngine.js';

let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n++; };
const eq = (a, b, msg) => { assert.equal(a, b, msg); n++; };
const deq = (a, b, msg) => { assert.deepEqual(a, b, msg); n++; };

const COL = 'unit-college';
const PRI = 'unit-primaire';

// ── Classification des natures ──────────────────────────────────────────────
ok(isOpening('report'), 'report = solde d’ouverture');
ok(!isEntry('report'), 'un report n’est PAS une entrée');
ok(!isExit('report'), 'un report n’est pas une sortie');
eq(movementEffect('report'), 0, 'un report ne déplace pas le solde, il l’établit');
for (const k of ['approvisionnement', 'recette_diverse', 'transfert_entrant']) {
  eq(movementEffect(k), 1, `${k} = entrée`);
}
for (const k of ['transfert_sortant', 'retrait']) eq(movementEffect(k), -1, `${k} = sortie`);
eq(MOVEMENT_KINDS.length, 6, 'six natures de mouvement');
// Toute nature déclarée doit être classée : une nature ajoutée sans prédicat
// serait silencieusement traitée comme un report (effet nul).
for (const k of MOVEMENT_KINDS) {
  ok(isOpening(k) || isEntry(k) || isExit(k), `nature classée : ${k}`);
}

// ── Seules les dépenses PAYÉES quittent la caisse ───────────────────────────
ok(isCashOut({ status: 'paid' }), 'paid = sortie de caisse');
for (const s of ['draft', 'submitted', 'approved', 'rejected', 'cancelled', undefined]) {
  ok(!isCashOut({ status: s }), `${s} : engagement ou rien, l’argent est encore là`);
}

// ════════════════════════════════════════════════════════════════════════════
// Scénario repris du cahier du collège (juillet 2026) — chiffres réels.
// 2 000 000 de dotation, puis les dépenses, puis 300 000, puis 150 000.
// ════════════════════════════════════════════════════════════════════════════
// Le cahier n'inscrit la BALANCE qu'en fin de groupe (cellule fusionnée) :
// `bal` vaut null partout ailleurs, et reconcile() n'a donc rien à comparer là.
// [ligne, date, montant, balance inscrite ou null]
const JUILLET_COLLEGE = {
  appro: [
    [4, '2026-07-01', 2000000, 2000000],
    [23, '2026-07-28', 300000, 418850],
  ],
  depenses: [
    [5, '2026-07-01', 5000, 1995000],
    [7, '2026-07-09', 80000, 1915000],
    [8, '2026-07-16', 8600, null],
    [9, '2026-07-16', 8500, 1897900],
    [11, '2026-07-20', 75000, null],
    [12, '2026-07-20', 256000, 1566900],
    [14, '2026-07-22', 600000, 966900],
    [15, '2026-07-23', 500000, null],
    [16, '2026-07-23', 3000, 463900],
    [18, '2026-07-24', 1050, 462850],
    [19, '2026-07-25', 172000, 290850],
    [20, '2026-07-28', 114000, null],
    [21, '2026-07-28', 58000, 118850],
    [24, '2026-07-28', 150000, 268850],
  ],
};
const mvCol = JUILLET_COLLEGE.appro.map(([row, date, amount, bal]) => ({
  id: `m${row}`, school_unit_id: COL, date, kind: 'approvisionnement', amount,
  label: 'APPROVISIONNEMENT DE LA CAISSE', source_balance: bal, source_file: 'f.xlsx', source_row: row,
}));
const expCol = JUILLET_COLLEGE.depenses.map(([row, date, amount, bal]) => ({
  id: `e${row}`, school_unit_id: COL, expense_date: date, amount, status: 'paid',
  notes: `dépense ligne ${row}`, source_balance: bal, source_file: 'f.xlsx', source_row: row,
}));

const ledCol = cashLedger({ movements: mvCol, expenses: expCol, unitId: COL });
eq(ledCol.length, 16, 'journal du collège : 16 écritures (14 dépenses + 2 dotations)');
deq(ledCol.map((r) => r.balance), [
  2000000, 1995000, 1915000, 1906400, 1897900, 1822900, 1566900, 966900,
  466900, 463900, 462850, 290850, 176850, 118850, 418850, 268850,
], 'suite des soldes = celle du cahier');
// Le test qui compte : aucune balance inscrite ne contredit le recalcul.
deq(reconcile(ledCol), [], 'aucun écart sur le bloc de juillet du collège');

const tCol = cashTotals(ledCol);
eq(tCol.entrees, 2300000, 'entrées = 2 300 000 (ligne TOTAL du cahier)');
eq(tCol.depenses, 2031150, 'dépenses payées = 2 031 150 (ligne TOTAL du cahier)');
eq(tCol.nDepenses, 14, '14 dépenses, sans compter un seul sous-total');
eq(tCol.solde, 268850, 'solde de clôture = 268 850 (ligne TOTAL du cahier)');
eq(tCol.reports, 0, 'aucun report dans ce bloc');

// ── Le report positionne le solde, il ne s'y ajoute pas ─────────────────────
const avecReport = cashLedger({
  movements: [
    { id: 'r', school_unit_id: COL, date: '2026-08-01', kind: 'report', amount: 268850, label: 'Report caisse du 31/07' },
    { id: 'r2', school_unit_id: COL, date: '2026-08-02', kind: 'report', amount: 268850, label: 'Report (ressaisi par erreur)' },
  ],
  expenses: [], unitId: COL,
});
eq(avecReport[1].balance, 268850, 'deux reports successifs ne cumulent RIEN');
eq(cashTotals(avecReport).entrees, 0, 'un report n’entre jamais dans les entrées');
eq(cashTotals(avecReport).solde, 268850, 'solde = montant reporté');

// ── Les caisses ne se mélangent jamais ──────────────────────────────────────
const mix = {
  movements: [
    ...mvCol,
    { id: 'p1', school_unit_id: PRI, date: '2026-07-09', kind: 'approvisionnement', amount: 700000, label: 'appro primaire' },
  ],
  expenses: [
    ...expCol,
    { id: 'p2', school_unit_id: PRI, expense_date: '2026-07-07', amount: 244000, status: 'paid', notes: 'SOCADEL' },
  ],
};
eq(cashTotals(cashLedger({ ...mix, unitId: COL })).solde, 268850, 'solde collège inchangé par le primaire');
eq(cashTotals(cashLedger({ ...mix, unitId: PRI })).solde, 700000 - 244000, 'solde primaire isolé');

const parUnite = balancesByUnit(mix).sort((a, b) => String(a.schoolUnitId).localeCompare(String(b.schoolUnitId)));
eq(parUnite.length, 2, 'deux caisses distinctes');
eq(parUnite.find((u) => u.schoolUnitId === COL).solde, 268850, 'caisse collège');
eq(parUnite.find((u) => u.schoolUnitId === PRI).solde, 456000, 'caisse primaire');

// La caisse du complexe (unité NULL) est une caisse à part entière, pas un fourre-tout.
const cxt = cashLedger({
  movements: [{ id: 'c1', school_unit_id: null, date: '2026-07-01', kind: 'approvisionnement', amount: 50000 }, ...mvCol],
  expenses: expCol, unitId: null,
});
eq(cashTotals(cxt).solde, 50000, 'caisse du complexe : seules ses propres écritures');
eq(cxt.length, 1, 'aucune écriture d’unité ne tombe dans le complexe');

// ── Écarts : signalés, jamais corrigés ──────────────────────────────────────
// Cas réel du classeur primaire : balance inscrite « 254 08 » au lieu de 254 080.
const faux = cashLedger({
  movements: [
    // Solde réel de la caisse primaire avant la dotation du 15 août.
    { id: 'w', school_unit_id: PRI, date: '2026-08-14', kind: 'report', amount: 77480, source_balance: 77480 },
    { id: 'x', school_unit_id: PRI, date: '2026-08-15', kind: 'approvisionnement', amount: 775000, source_balance: 852480 }],
  expenses: [{ id: 'y', school_unit_id: PRI, expense_date: '2026-08-15', amount: 598400, status: 'paid', source_balance: 25408, source_file: 'd.xlsx', source_row: 83 }],
  unitId: PRI,
});
const ec = reconcile(faux);
eq(ec.length, 1, 'un seul écart détecté');
eq(ec[0].sourceBalance, 25408, 'la valeur SOURCE est conservée telle quelle');
eq(ec[0].computed, 254080, 'le solde recalculé est donné à côté');
eq(ec[0].delta, 254080 - 25408, 'l’écart est chiffré');
eq(faux[2].sourceBalance, 25408, 'la ligne garde sa valeur d’origine (rien n’est réécrit)');

// ── Balance illisible : conservée brute, signalée, JAMAIS convertie ─────────
// Cas réel : le cahier du primaire porte « 254 08 » au lieu de 254 080.
const illisible = cashLedger({
  movements: [{ id: 'w', school_unit_id: PRI, date: '2026-08-14', kind: 'report', amount: 77480, source_balance: 77480 },
    { id: 'x', school_unit_id: PRI, date: '2026-08-15', kind: 'approvisionnement', amount: 775000, source_balance: 852480 }],
  expenses: [{ id: 'y', school_unit_id: PRI, expense_date: '2026-08-15', amount: 598400,
    status: 'paid', source_balance: null, source_balance_raw: '254 08', source_file: 'd.xlsx', source_row: 83 }],
  unitId: PRI,
});
const enAttente = pendingBalances(illisible);
eq(enAttente.length, 1, 'une balance illisible est remontée pour arbitrage');
eq(enAttente[0].raw, '254 08', 'la valeur brute du document est rendue TELLE QUELLE');
eq(enAttente[0].computed, 254080, 'le solde recalculé est donné à côté, pour trancher');
eq(enAttente[0].sourceRow, 83, 'la provenance exacte est conservée');
// Une balance illisible n'est PAS un écart : on ne peut rien comparer.
deq(reconcile(illisible), [], 'une balance illisible n’est pas comptée comme un écart chiffré');
// Et surtout : rien n'a été converti au passage.
eq(illisible[2].sourceBalance, null, 'aucune conversion automatique en 25408');
eq(illisible[2].sourceBalanceRaw, '254 08', 'la ligne garde sa valeur brute');
// Une balance correctement renseignée ne doit jamais remonter ici.
deq(pendingBalances(ledCol), [], 'aucune fausse alerte sur un bloc sain');
// Chaîne vide ou espaces : ce n'est pas une valeur, rien à arbitrer.
deq(pendingBalances([{ id: 'z', sourceBalance: null, sourceBalanceRaw: '   ' }]), [],
  'une balance brute vide n’est pas un arbitrage à rendre');

// ── Récapitulatif mensuel ───────────────────────────────────────────────────
const surDeuxMois = cashLedger({
  movements: [
    ...mvCol,
    { id: 'r', school_unit_id: COL, date: '2026-08-01', kind: 'report', amount: 268850 },
    { id: 'a', school_unit_id: COL, date: '2026-08-05', kind: 'approvisionnement', amount: 100000 },
  ],
  expenses: [...expCol, { id: 'e4', school_unit_id: COL, expense_date: '2026-08-06', amount: 50000, status: 'paid' }],
  unitId: COL,
});
const mois = monthlySummary(surDeuxMois);
eq(mois.length, 2, 'deux mois');
eq(mois[0].month, '2026-07', 'premier mois');
eq(mois[0].closing, 268850, 'clôture de juillet');
eq(mois[1].opening, 268850, 'ouverture d’août = report inscrit');
eq(mois[1].entrees, 100000, 'entrées d’août (report exclu)');
eq(mois[1].depenses, 50000, 'dépenses d’août');
eq(mois[1].closing, 318850, 'clôture d’août');

// Sans report inscrit, l'ouverture d'un mois est la clôture du précédent —
// sinon le solde repartirait de zéro à chaque changement de mois.
const sansReport = cashLedger({
  movements: [{ id: 'a1', school_unit_id: COL, date: '2026-07-01', kind: 'approvisionnement', amount: 10000 }],
  expenses: [{ id: 'x1', school_unit_id: COL, expense_date: '2026-08-02', amount: 4000, status: 'paid' }],
  unitId: COL,
});
const m2 = monthlySummary(sansReport);
eq(m2[1].opening, 10000, 'ouverture héritée de la clôture précédente');
eq(m2[1].closing, 6000, 'clôture après la dépense');

// ── Robustesse : rien ne doit jeter sur des données partielles ──────────────
deq(cashLedger({}), [], 'aucune donnée → journal vide');
eq(cashTotals([]).solde, 0, 'totaux d’un journal vide');
deq(monthlySummary([]), [], 'récapitulatif vide');
const sale = cashLedger({
  movements: [{ id: 'z', school_unit_id: COL, date: null, kind: 'approvisionnement', amount: 'pas-un-nombre' }],
  expenses: [{ id: 'z2', school_unit_id: COL, expense_date: '2026-07-01', amount: null, status: 'paid' }],
  unitId: COL,
});
eq(sale.every((r) => Number.isFinite(r.balance)), true, 'montants illisibles → 0, jamais NaN');
eq(monthlySummary(sale).some((m) => m.month === 'sans-date'), true, 'une écriture sans date est isolée, pas perdue');

// ── Tri : l'ordre du cahier départage les écritures du même jour ────────────
const memeJour = cashLedger({
  movements: [{ id: 'b', school_unit_id: COL, date: '2026-07-28', kind: 'approvisionnement', amount: 300000, source_file: 'f.xlsx', source_row: 23 }],
  expenses: [{ id: 'a', school_unit_id: COL, expense_date: '2026-07-28', amount: 150000, status: 'paid', source_file: 'f.xlsx', source_row: 24 }],
  unitId: COL,
});
deq(memeJour.map((r) => r.id), ['b', 'a'], 'à date égale, la ligne du document fait l’ordre');

console.log(`cashBookEngine : ${n} assertions OK`);
