// Test des PÉRIODES DE BULLETIN du secondaire APC.
//
// Verrouille la règle métier : trimestre = bulletin de référence, annuel =
// synthèse, séquence = saisie ET bulletin tirable à la demande. Aucun T4, et le
// rattachement d'une séquence à son trimestre vient du RÉFÉRENTIEL — jamais d'un
// calcul de parité.
//
// Les périodes de séquence ne sont servies que sur `{ withSequences: true }` :
// c'est ce qui garantit aux rapports de classe et aux procès-verbaux le rythme
// trimestriel qu'ils avaient.
//
//   node src/core/_apcPeriods.test.mjs

import {
  APC_TRIMESTRE_IDS, APC_BULLETIN_PERIOD_VALUES, APC_PERIOD_LABELS,
  apcBulletinPeriods, apcPeriodLabel, resolveApcPeriod,
  isApcAnnualPeriod, isApcTrimestrePeriod, isApcBulletinPeriodValue,
  isApcSequencePeriod, isApcSequencePeriodValue, apcSequencePeriodValue,
  apcSeqNumOfPeriodValue,
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

// ── H · PÉRIODES FIXES, ET SÉQUENCES SERVIES SUR DEMANDE SEULEMENT ──────────
console.log('\n── H · périodes fixes · séquences sur demande ──');

eq(APC_BULLETIN_PERIOD_VALUES.length, 4, 'exactement 4 périodes FIXES');
eq(APC_BULLETIN_PERIOD_VALUES.join(','), 'term_1,term_2,term_3,annuel', 'term_1 · term_2 · term_3 · annuel');
ok(APC_BULLETIN_PERIOD_VALUES.every((v) => !/^seq/i.test(v)),
   'aucune clé FIXE ne commence par « seq » (les séquences sont dérivées du référentiel)');
ok(isApcBulletinPeriodValue('term_1') && isApcBulletinPeriodValue('annuel'),
   'term_1 et annuel sont bien des périodes de bulletin');
ok(isApcBulletinPeriodValue('seq_1') && isApcBulletinPeriodValue('seq_6'),
   'seq_1 / seq_6 sont désormais des périodes de bulletin reconnues');
ok(!isApcBulletinPeriodValue('seq_') && !isApcBulletinPeriodValue('seq_x'),
   '« seq_ » et « seq_x » ne sont PAS des clés de séquence valides');

eq(apcSequencePeriodValue(3), 'seq_3', 'clé de séquence construite depuis le numéro');
eq(apcSeqNumOfPeriodValue('seq_3'), 3, 'numéro relu de la clé');
eq(apcSeqNumOfPeriodValue('term_2'), null, 'une clé de trimestre ne porte pas de numéro de séquence');
ok(isApcSequencePeriodValue('seq_12') && !isApcSequencePeriodValue('annuel'),
   'reconnaissance d\'une clé de séquence, quel que soit le nombre de chiffres');

// SANS option : le rythme d'avant, à l'identique. C'est ce que lisent les
// rapports de classe et les procès-verbaux.
for (const ref of [null, ref2, refAsym]) {
  const vals = apcBulletinPeriods(ref).map((p) => p.value);
  eq(vals.join(','), 'term_1,term_2,term_3,annuel',
     `sans option : seules les 4 périodes fixes (référentiel ${ref === null ? 'absent' : ref === ref2 ? '2/trim' : 'asymétrique'})`);
}

// AVEC option : chaque séquence précède le trimestre dont elle relève.
const withSeq2 = apcBulletinPeriods(ref2, { withSequences: true });
eq(withSeq2.map((p) => p.value).join(','),
   'seq_1,seq_2,term_1,seq_3,seq_4,term_2,seq_5,seq_6,term_3,annuel',
   'ordre de travail : les séquences avant leur trimestre');
eq(withSeq2.filter(isApcSequencePeriod).length, 6, '6 périodes de séquence (rythme 2/trimestre)');

// Le référentiel ASYMÉTRIQUE donne 3 + 2 + 1 séquences, sans aucune parité.
const withSeqAsym = apcBulletinPeriods(refAsym, { withSequences: true });
eq(withSeqAsym.map((p) => p.value).join(','),
   'seq_1,seq_2,seq_3,term_1,seq_4,seq_5,term_2,seq_6,term_3,annuel',
   'asymétrique : 3 séquences en T1, 2 en T2, 1 en T3');

// Une période de séquence porte SON trimestre et SA seule séquence.
const s4 = withSeqAsym.find((p) => p.value === 'seq_4');
ok(isApcSequencePeriod(s4), 'seq_4 est de nature « sequence »');
ok(!isApcTrimestrePeriod(s4) && !isApcAnnualPeriod(s4), '…et n\'est ni trimestre ni annuel');
eq(s4.trimestreId, 't2', 'seq_4 relève de T2 (lu du référentiel)');
eq(s4.seqs.join(','), '4', 'seq_4 ne couvre que la séquence 4');
eq(s4.seqIds.join(','), 's4', '…et ne retient que les notes de s4');
eq(apcPeriodLabel(s4, 'FR'), 'Séquence 4', 'libellé FR de la séquence');
eq(apcPeriodLabel(s4, 'EN'), 'Sequence 4', 'libellé EN de la séquence');
eq(s4.short, 'S4', 'badge court de la séquence');

// Le T3 asymétrique n'a qu'UNE séquence : il reste un TRIMESTRE pour autant.
const t3Asym = withSeqAsym.find((p) => p.value === 'term_3');
ok(isApcTrimestrePeriod(t3Asym) && !isApcSequencePeriod(t3Asym),
   'un trimestre à une seule séquence reste un trimestre (la nature, jamais le cardinal)');

// Une ligne de séquence inexploitable n'est pas tirable en bulletin. Les trois
// trimestres sont peuplés, sinon `sequencesOfTrimestre` retombe sur la constante
// et le trou qu'on veut éprouver serait recomblé.
const refTroue = { sequences: [
  { id: 's1', numero: 1, trimestre_id: 't1' },
  { id: 's2', numero: null, trimestre_id: 't1' },   // pas de numéro -> « Séquence 0 » évitée
  { numero: 3, trimestre_id: 't1' },                // pas d'id -> aucune note à retrouver
  { id: 's4', numero: 'x', trimestre_id: 't2' },    // numéro non numérique
  { id: 's5', numero: 5, trimestre_id: 't2' },
  { id: 's6', numero: 6, trimestre_id: 't3' },
] };
const troue = apcBulletinPeriods(refTroue, { withSequences: true });
eq(troue.filter(isApcSequencePeriod).map((p) => p.value).join(','),
   'seq_1,seq_5,seq_6', 'une ligne sans numéro, sans identifiant ou non numérique est écartée');
ok(!troue.some((p) => p.value === 'seq_0'),
   'jamais de « Séquence 0 » : `Number(null)` vaut 0, le vide est écarté avant conversion');
// `seqs` (numéros) et la liste des bulletins de séquence n'ont PAS le même
// critère, et c'est voulu : une ligne numérotée mais sans identifiant reste
// comptée par le trimestre — les surfaces qui raisonnent en numéros (notes,
// rapports) n'ont que faire de l'id — alors qu'elle n'est pas tirable en
// bulletin, faute de pouvoir retrouver ses notes.
eq(troue.find((p) => p.value === 'term_1').seqs.join(','), '1,3',
   'le trimestre compte ses séquences numérotées, identifiant ou non');
// Comparé trié : l'ordre vient du tri par numéro, et une ligne sans numéro s'y
// place arbitrairement — ce n'est pas ce qu'on éprouve ici.
eq([...troue.find((p) => p.value === 'term_1').seqIds].sort().join(','), 's1,s2',
   '…mais `seqIds` ne retient que les lignes identifiées');
ok(!troue.some((p) => p.value === 'seq_3'),
   'la séquence 3, sans identifiant, n\'est pas tirable en bulletin');
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
// Une clé « seq_3 » retrouve sa séquence là où elles sont servies, et retombe sur
// le trimestre là où elles ne le sont pas — sans jamais vider l'écran.
eq(resolveApcPeriod(periods, 'seq_3').value, 'term_1',
   'liste sans séquences : « seq_3 » → repli sur T1');
eq(resolveApcPeriod(withSeq2, 'seq_3').value, 'seq_3',
   'liste avec séquences : « seq_3 » retrouve sa séquence');
eq(resolveApcPeriod(withSeq2, 'seq_9').value, 'term_1',
   'séquence absente du référentiel → repli sur T1, jamais sur la première entrée (S1)');
eq(resolveApcPeriod(periods, 'term_3').value, 'term_3', 'clé connue conservée');
eq(resolveApcPeriod(periods, 'annuel').value, 'annuel', 'annuel conservé');
eq(resolveApcPeriod([], 'term_2').value, 'term_2', 'liste vide → repli sur les périodes par défaut');
// Les libellés des séquences passent par le même point d'entrée que ceux des
// trimestres, bien qu'ils ne soient pas en table.
eq(apcPeriodLabel(withSeq2[0], 'FR'), 'Séquence 1', 'libellé FR porté par la période de séquence');
eq(apcPeriodLabel(withSeq2[0], 'ES'), 'Secuencia 1', 'libellé ES de la séquence');

console.log(failed ? '\n❌ DES TESTS ONT ÉCHOUÉ' : '\n✅ Tous les tests des périodes APC passent');
process.exit(failed ? 1 : 0);
