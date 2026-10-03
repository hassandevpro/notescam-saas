// Test des PÉRIODES DE BULLETIN du secondaire APC.
//
// Verrouille la règle métier : séquence = saisie, trimestre = bulletin, annuel =
// synthèse. Aucun bulletin de séquence, aucun T4, et le rattachement d'une
// séquence à son trimestre vient du RÉFÉRENTIEL — jamais d'un calcul de parité.
//
//   node src/core/_apcPeriods.test.mjs

import {
  APC_TRIMESTRE_IDS, APC_BULLETIN_PERIOD_VALUES, APC_PERIOD_LABELS,
  apcBulletinPeriods, apcPeriodLabel, resolveApcPeriod,
  isApcAnnualPeriod, isApcTrimestrePeriod, isApcBulletinPeriodValue,
  apcTrimestreOfPeriodValue, apcTrimestreOfSeqNum, apcSeqIdOfSeqNum,
  apcSeqIdsForTrimestre, apcSeqNumsForTrimestre,
} from './apcPeriods.js';

let failed = 0;
const ok = (c, m) => { if (!c) failed++; console.log(`${c ? '✅' : '❌'} ${m}`); };
const eq = (a, b, m) => ok(a === b, `${m} (${a} ≈ ${b})`);

// Référentiel de référence : le rythme MINESEC courant, 2 séquences par trimestre.
const ref2 = { sequences: [
  { id: 's1', numero: 1, trimestre_id: 't1' }, { id: 's2', numero: 2, trimestre_id: 't1' },
  { id: 's3', numero: 3, trimestre_id: 't2' }, { id: 's4', numero: 4, trimestre_id: 't2' },
  { id: 's5', numero: 5, trimestre_id: 't3' }, { id: 's6', numero: 6, trimestre_id: 't3' },
] };

// Référentiel ASYMÉTRIQUE : 3 séquences en T1, 2 en T2, 1 en T3. Aucune parité ne
// permet de le deviner — c'est précisément le piège que l'ancien `% 2` tendait.
const refAsym = { sequences: [
  { id: 's1', numero: 1, trimestre_id: 't1' }, { id: 's2', numero: 2, trimestre_id: 't1' },
  { id: 's3', numero: 3, trimestre_id: 't1' },
  { id: 's4', numero: 4, trimestre_id: 't2' }, { id: 's5', numero: 5, trimestre_id: 't2' },
  { id: 's6', numero: 6, trimestre_id: 't3' },
] };

// ── H · AUCUN BULLETIN SÉQUENTIEL ───────────────────────────────────────────
console.log('\n── H · aucune période de bulletin « seq* » ──');

eq(APC_BULLETIN_PERIOD_VALUES.length, 4, 'exactement 4 périodes de bulletin');
eq(APC_BULLETIN_PERIOD_VALUES.join(','), 'term_1,term_2,term_3,annuel', 'term_1 · term_2 · term_3 · annuel');
ok(APC_BULLETIN_PERIOD_VALUES.every((v) => !/^seq/i.test(v)),
   'aucune clé de bulletin ne commence par « seq »');
ok(!APC_BULLETIN_PERIOD_VALUES.some((v) => /s[eé]quence|^s\d/i.test(v)),
   'aucune clé ne nomme une séquence');
ok(!isApcBulletinPeriodValue('seq_1') && !isApcBulletinPeriodValue('seq_6'),
   'seq_1 / seq_6 ne sont PAS des périodes de bulletin APC');
ok(isApcBulletinPeriodValue('term_1') && isApcBulletinPeriodValue('annuel'),
   'term_1 et annuel sont bien des périodes de bulletin');

for (const ref of [null, ref2, refAsym]) {
  const vals = apcBulletinPeriods(ref).map((p) => p.value);
  ok(vals.join(',') === 'term_1,term_2,term_3,annuel',
     `apcBulletinPeriods ne produit que les 4 périodes (référentiel ${ref === null ? 'absent' : ref === ref2 ? '2/trim' : 'asymétrique'})`);
}
// Même un référentiel à 9 séquences ne doit pas faire apparaître de période de séquence.
const ref9 = { sequences: Array.from({ length: 9 }, (_, i) => ({
  id: `s${i + 1}`, numero: i + 1, trimestre_id: `t${Math.floor(i / 3) + 1}` })) };
eq(apcBulletinPeriods(ref9).length, 4, '9 séquences au référentiel → toujours 4 bulletins');

// ── J · EXACTEMENT 3 TRIMESTRES, AUCUN T4 ───────────────────────────────────
console.log('\n── J · trois trimestres, aucun T4 ──');

eq(APC_TRIMESTRE_IDS.join(','), 't1,t2,t3', 'trimestres du référentiel = t1, t2, t3');
eq(APC_TRIMESTRE_IDS.length, 3, 'trois trimestres, pas quatre');
const trimIds = apcBulletinPeriods(ref2).filter(isApcTrimestrePeriod).map((p) => p.trimestreId);
eq(trimIds.join(','), 't1,t2,t3', 'trois périodes trimestrielles, dans l\'ordre');
ok(!trimIds.includes('t4'), 'aucun trimestre t4');
ok(apcTrimestreOfPeriodValue('annuel') === null,
   'l\'annuel ne porte AUCUN trimestre (ce n\'est pas un T4)');
ok(apcBulletinPeriods(ref2).filter(isApcAnnualPeriod).length === 1, 'un seul annuel');
// Un trimestre inconnu ne fabrique pas de période.
eq(apcSeqIdsForTrimestre(ref2, 't4').length, 0, 't4 n\'a aucune séquence rattachée');
eq(apcSeqIdsForTrimestre(ref2, null).length, 0, 'trimestre null → aucune séquence');

// ── I · L'ANNUEL EST UNE SYNTHÈSE, PAS UNE PÉRIODE DE SAISIE ────────────────
console.log('\n── I · l\'annuel est dérivé des trois trimestres ──');

const annuel = apcBulletinPeriods(ref2).find(isApcAnnualPeriod);
eq(annuel.trimestreId, null, 'annuel.trimestreId = null → rien ne s\'y saisit');
eq(annuel.trimestreIds.join(','), 't1,t2,t3', 'l\'annuel couvre les trois trimestres');
eq(annuel.kind, 'annuel', 'l\'annuel se reconnaît par sa NATURE, pas par son cardinal');
ok(isApcAnnualPeriod(annuel) && !isApcTrimestrePeriod(annuel),
   'l\'annuel n\'est pas une période trimestrielle');
ok(!isApcAnnualPeriod(apcBulletinPeriods(ref2)[0]), 'T1 n\'est pas l\'annuel');
// Le piège historique : reconnaître l'annuel au nombre de séquences couvertes.
const annuelAsym = apcBulletinPeriods(refAsym).find(isApcAnnualPeriod);
const t1Asym     = apcBulletinPeriods(refAsym)[0];
eq(t1Asym.seqs.length, 3, 'T1 asymétrique couvre 3 séquences…');
ok(!isApcAnnualPeriod(t1Asym),
   '…et reste un TRIMESTRE : `seqs.length >= 3` n\'identifie plus l\'annuel');
eq(annuelAsym.seqs.length, 6, 'l\'annuel asymétrique couvre bien les 6 séquences');

// ── D · PLUSIEURS SÉQUENCES PAR TRIMESTRE, NOMBRE LIBRE ─────────────────────
console.log('\n── D · rattachement réel des séquences au trimestre ──');

eq(apcSeqNumsForTrimestre(ref2, 't1').join('/'), '1/2', 'rythme courant : T1 = séquences 1 et 2');
eq(apcSeqNumsForTrimestre(ref2, 't3').join('/'), '5/6', 'rythme courant : T3 = séquences 5 et 6');

eq(apcSeqNumsForTrimestre(refAsym, 't1').join('/'), '1/2/3', 'T1 asymétrique = séquences 1, 2 ET 3');
eq(apcSeqNumsForTrimestre(refAsym, 't2').join('/'), '4/5',   'T2 asymétrique = séquences 4 et 5');
eq(apcSeqNumsForTrimestre(refAsym, 't3').join('/'), '6',     'T3 asymétrique = séquence 6 seule');
eq(apcSeqIdsForTrimestre(refAsym, 't1').join('/'), 's1/s2/s3', 'identifiants du référentiel, pas reconstruits');

// La preuve que la parité ne pilote plus rien : la séquence 3 est en T1 ici alors
// que `SEQ_TO_TRIM` (repli) la mettrait en T2.
eq(apcTrimestreOfSeqNum(refAsym, 3), 't1', 'séquence 3 → T1 par RATTACHEMENT (et non T2 par parité)');
eq(apcTrimestreOfSeqNum(refAsym, 5), 't2', 'séquence 5 → T2 par rattachement (et non T3)');
eq(apcTrimestreOfSeqNum(refAsym, 6), 't3', 'séquence 6 → T3');
eq(apcTrimestreOfSeqNum(ref2, 3), 't2', 'rythme courant inchangé : séquence 3 → T2');
eq(apcSeqIdOfSeqNum(refAsym, 3), 's3', 'identifiant de la séquence 3 lu du référentiel');

// Neuf séquences, trois par trimestre — aucune limite codée en dur.
eq(apcSeqNumsForTrimestre(ref9, 't1').join('/'), '1/2/3', '9 séquences : T1 = 1/2/3');
eq(apcSeqNumsForTrimestre(ref9, 't2').join('/'), '4/5/6', '9 séquences : T2 = 4/5/6');
eq(apcSeqNumsForTrimestre(ref9, 't3').join('/'), '7/8/9', '9 séquences : T3 = 7/8/9');
eq(apcTrimestreOfSeqNum(ref9, 7), 't3', '9 séquences : la 7e est en T3');

// Aucune séquence d'un trimestre ne fuit dans un autre.
const all9 = ['t1', 't2', 't3'].map((tid) => apcSeqNumsForTrimestre(ref9, tid));
ok(new Set(all9.flat()).size === all9.flat().length, 'aucune séquence rattachée à deux trimestres');

// ── Repli sans référentiel chargé ───────────────────────────────────────────
console.log('\n── repli quand le référentiel n\'est pas chargé ──');

eq(apcSeqNumsForTrimestre(null, 't1').join('/'), '1/2', 'sans référentiel : repli sur le rythme MINESEC courant');
eq(apcTrimestreOfSeqNum(null, 4), 't2', 'sans référentiel : repli SEQ_TO_TRIM');
eq(apcTrimestreOfSeqNum(null, 'x'), null, 'numéro invalide → null (jamais un trimestre deviné)');
eq(apcBulletinPeriods(undefined).length, 4, 'référentiel undefined → les 4 périodes quand même');

// ── Libellés et résolution de clé persistée ─────────────────────────────────
console.log('\n── libellés et clé persistée ──');

const periods = apcBulletinPeriods(ref2);
eq(apcPeriodLabel(periods[0], 'FR'), 'Trimestre 1', 'libellé FR');
eq(apcPeriodLabel(periods[0], 'EN'), 'Term 1', 'libellé EN = « Term » (document officiel)');
eq(apcPeriodLabel(periods[3], 'EN'), 'Annual', 'libellé EN de l\'annuel');
eq(APC_PERIOD_LABELS.term_2.short, 'T2', 'libellé court T2');
// Une clé de bulletin de séquence persistée dans l'UI ne doit pas vider l'écran.
eq(resolveApcPeriod(periods, 'seq_3').value, 'term_1', 'clé historique « seq_3 » → repli sur T1');
eq(resolveApcPeriod(periods, 'term_3').value, 'term_3', 'clé connue conservée');
eq(resolveApcPeriod(periods, 'annuel').value, 'annuel', 'annuel conservé');
eq(resolveApcPeriod([], 'term_2').value, 'term_2', 'liste vide → repli sur les périodes par défaut');

console.log(failed ? '\n❌ DES TESTS ONT ÉCHOUÉ' : '\n✅ Tous les tests des périodes APC passent');
process.exit(failed ? 1 : 0);
