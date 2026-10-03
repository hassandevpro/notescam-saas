// Test de l'ASSEMBLAGE des bulletins APC (premier cycle MINESEC) :
// synthèse trimestrielle depuis les séquences, et synthèse annuelle depuis les
// trois trimestres.
//
// Ce que ce fichier verrouille, et qui n'était couvert par aucun test :
//   • un trimestre agrège TOUTES les séquences qui lui sont rattachées, quel
//     qu'en soit le nombre (référentiel asymétrique 3/2/1 ici) ;
//   • une compétence non évaluée reste NON ÉVALUÉE — jamais un zéro ;
//   • un zéro réel compte comme un zéro ;
//   • `coefSum` n'inclut jamais une matière non notée ;
//   • aucune compétence d'un autre trimestre ne fuit dans le bulletin ;
//   • l'annuel ne lit QUE les trois trimestres, et un trimestre vide n'y vaut
//     pas zéro.
//
//   node --experimental-loader ./scripts/lib/esm-resolve.mjs src/lib/_apcBulletinDoc.test.mjs

import { assemblePeriod, assembleTrimester, assembleApcAnnual } from './apcBulletinDoc.js';
import { noteNkey } from '../core/apcEngine.js';
import { apcSeqIdsForTrimestre } from '../core/apcPeriods.js';

let failed = 0;
const ok = (c, m) => { if (!c) failed++; console.log(`${c ? '✅' : '❌'} ${m}`); };
const eq = (a, b, m) => ok(a === b, `${m} (${a} ≈ ${b})`);

// ── Référentiel de test ─────────────────────────────────────────────────────
// Séquences ASYMÉTRIQUES : T1 en compte TROIS (s1, s2, s3), T2 deux, T3 une.
// Aucun calcul de parité ne peut le deviner — c'est le cœur du test D.
const sequences = [
  { id: 's1', numero: 1, trimestre_id: 't1' },
  { id: 's2', numero: 2, trimestre_id: 't1' },
  { id: 's3', numero: 3, trimestre_id: 't1' },
  { id: 's4', numero: 4, trimestre_id: 't2' },
  { id: 's5', numero: 5, trimestre_id: 't2' },
  { id: 's6', numero: 6, trimestre_id: 't3' },
];

const C = (id, trimestre_id, matiere_id, ordre, intitule) =>
  ({ id, cycle_id: 'premier_cycle', classe_id: '6e', trimestre_id, matiere_id, ordre, intitule, coefficient: null, actif: true });

const competences = [
  // Français : 3 compétences en T1, 1 en T2, 1 en T3.
  C('c1', 't1', 'francais', 1, 'Lire un texte courant'),
  C('c2', 't1', 'francais', 2, 'Produire un écrit bref'),
  C('c3', 't1', 'francais', 3, 'Réciter un poème'),
  C('f2', 't2', 'francais', 1, 'Résumer un récit'),
  C('f3', 't3', 'francais', 1, 'Argumenter à l\'écrit'),
  // Mathématiques : 1 compétence en T1, 1 en T2, AUCUNE en T3.
  C('m1', 't1', 'mathematiques', 1, 'Calculer une aire'),
  C('m2', 't2', 'mathematiques', 1, 'Résoudre une équation'),
  // EPS : 1 compétence en T1 seulement, jamais évaluée.
  C('e1', 't1', 'eps', 1, 'Courir 600 m'),
  // Compétence DÉSACTIVÉE : ne doit jamais apparaître.
  { ...C('cx', 't1', 'francais', 4, 'Compétence retirée'), actif: false },
];

const matieres = [
  { id: 'francais',      nom: 'Français',       coefficient: 4 },
  { id: 'mathematiques', nom: 'Mathématiques',  coefficient: 2 },
  { id: 'eps',           nom: 'EPS',            coefficient: 1 },
];

// Français porte le coef 6 EN 6e (le coef par classe prime sur le coef global 4).
const classeMatieres = [{ classe_id: '6e', matiere_id: 'francais', coefficient: 6, ordre: 1 }];

const referentiel = { sequences, competences, matieres, classeMatieres };

const E = 'eleve-1';
const student = { id: E, name: 'NDJOCK Awa' };

// ── Notes ───────────────────────────────────────────────────────────────────
// Français T1 :
//   c1 évaluée en s1 (12) et s2 (16) → 14 ; PAS évaluée en s3.
//   c2 évaluée en s3 SEULEMENT (10)  → 10 ; invisible si l'on ignore s3.
//   c3 JAMAIS évaluée                → non évaluée (et non 0).
// Maths T1 :
//   m1 = 0 en s1 → un VRAI zéro, qui doit compter.
// EPS T1 :
//   e1 : chaîne vide, null et 'ABS' → non évaluée dans les trois cas.
// Piège : c1 porte aussi une note sur s4, qui appartient à T2. Elle ne doit
// jamais remonter dans le bulletin de T1.
const notes = {};
const put = (compId, seqId, note) => { notes[noteNkey(E, compId, seqId)] = { note }; };

put('c1', 's1', '12');   put('c1', 's2', 16);
put('c2', 's3', '10');
put('m1', 's1', '0');
put('e1', 's1', '');     put('e1', 's2', null);   put('e1', 's3', 'ABS');
put('c1', 's4', 20);     // séquence de T2 — hors périmètre de T1
put('f3', 's6', '16');   // T3
put('cx', 's1', 19);     // compétence désactivée

const ctx = { classeSlug: '6e', student, gradeScale: null, sys: 'FR' };
const bySubject = (data, id) => data.matieres.find((m) => m.id === id);

// ── D · le trimestre agrège TOUTES ses séquences rattachées ─────────────────
console.log('\n── D · T1 agrège ses TROIS séquences (rattachement réel) ──');

eq(apcSeqIdsForTrimestre(referentiel, 't1').join('/'), 's1/s2/s3',
   'T1 porte trois séquences au référentiel');

const t1 = assembleTrimester(referentiel, notes, { ...ctx, trimestreId: 't1' });
const fr1 = bySubject(t1, 'francais');

eq(fr1.competences.length, 3, 'Français T1 : 3 compétences (la désactivée exclue)');
eq(fr1.competences[0].note, 14, 'c1 = moyenne de ses notes sur s1 et s2 → 14');
eq(fr1.competences[1].note, 10, 'c2 = 10, notée sur la SEULE séquence s3');
ok(fr1.competences[1].note !== null,
   's3 est bien agrégée : sans elle, c2 serait non évaluée (preuve que `% 2` ne pilote plus rien)');
eq(fr1.moyenne, 12, 'Français T1 = (14 + 10) / 2 = 12');
ok(fr1.moyenne !== 14,
   'la note de c1 posée sur s4 (T2) ne remonte PAS dans T1');

// ── A/B · non évalué ≠ zéro, et le zéro compte ──────────────────────────────
console.log('\n── A/B · compétence non évaluée ignorée, zéro réel compté ──');

eq(fr1.competences[2].note, null, 'c3 jamais évaluée → null');
ok(fr1.moyenne !== 8, 'c3 n\'est PAS comptée 0 (sinon Français vaudrait (14+10+0)/3 = 8)');

const ma1 = bySubject(t1, 'mathematiques');
eq(ma1.moyenne, 0, 'Maths T1 = 0 : le zéro réel est une note, pas une absence');
ok(ma1.moyenne !== null, 'le zéro ne dégénère jamais en « non évalué »');

const eps1 = bySubject(t1, 'eps');
eq(eps1.moyenne, null, 'EPS non évaluée (chaîne vide, null, ABS) → null');
eq(eps1.competences[0].note, null, "'' / null / 'ABS' sont tous « non évalué »");

// ── coefSum n'inclut jamais une matière non notée ───────────────────────────
console.log('\n── coefSum et moyenne générale ──');

eq(t1.coefSum, 8, 'coefSum T1 = Français 6 + Maths 2 = 8 (EPS non notée exclue)');
ok(t1.coefSum !== 9, 'le coef 1 d\'EPS n\'est PAS compté');
eq(t1.mxSum, 72, 'mxSum T1 = 12×6 + 0×2 = 72');
eq(t1.moyenneGenerale, 9, 'moyenne générale T1 = 72 / 8 = 9');
ok(t1.moyenneGenerale !== 10.5,
   'preuve de bout en bout : avec seulement s1+s2, la générale aurait valu 10,5');
eq(fr1.coef, 6, 'coef par classe (6) prime sur le coef global (4)');

// ── E/F/G · chaque trimestre ne voit QUE ses compétences ────────────────────
console.log('\n── E/F/G · étanchéité des trimestres ──');

ok(fr1.competences.every((c) => c.intitule !== 'Résumer un récit'),
   'aucune compétence de T2 ne fuit dans le bulletin de T1');
ok(fr1.competences.every((c) => c.intitule !== 'Compétence retirée'),
   'la compétence désactivée n\'apparaît pas');

const t2 = assembleTrimester(referentiel, notes, { ...ctx, trimestreId: 't2' });
eq(bySubject(t2, 'francais').competences.length, 1, 'Français T2 : 1 compétence (f2)');
eq(bySubject(t2, 'francais').competences[0].intitule, 'Résumer un récit', 'T2 affiche bien SA compétence');
eq(bySubject(t2, 'francais').moyenne, null, 'T2 n\'est pas noté → Français T2 non évalué');
eq(t2.coefSum, 0, 'T2 vide → coefSum 0');
eq(t2.moyenneGenerale, null, 'T2 vide → moyenne générale null, JAMAIS 0');

const t3 = assembleTrimester(referentiel, notes, { ...ctx, trimestreId: 't3' });
eq(t3.matieres.length, 1, 'T3 : seule la matière ayant une compétence en T3 apparaît');
eq(bySubject(t3, 'francais').moyenne, 16, 'Français T3 = 16 (une seule séquence rattachée)');
eq(t3.moyenneGenerale, 16, 'moyenne générale T3 = 16');
ok(!t3.matieres.some((m) => m.id === 'mathematiques'),
   'Maths, sans compétence en T3, n\'est pas inventée sur le bulletin de T3');

// ── I · l'annuel est la synthèse de T1 + T2 + T3 ────────────────────────────
console.log('\n── I · annuel = synthèse T1 + T2 + T3, trimestre vide ≠ 0 ──');

const an = assembleApcAnnual(referentiel, notes, ctx);
const frAn = bySubject(an, 'francais');

ok(an.annual === true, 'le résultat annuel se déclare comme tel');
eq(frAn.t1, 12,   'annuel : colonne T1 = 12');
eq(frAn.t2, null, 'annuel : colonne T2 = non évaluée');
eq(frAn.t3, 16,   'annuel : colonne T3 = 16');
eq(frAn.moyenne, 14, 'Français annuel = (12 + 16) / 2 = 14 — T2 vide IGNORÉ');
ok(frAn.moyenne !== 9.33,
   'T2 vide n\'est PAS compté 0 (sinon (12+0+16)/3 = 9,33)');

const maAn = bySubject(an, 'mathematiques');
eq(maAn.t1, 0, 'annuel : Maths T1 = 0 (zéro réel conservé jusqu\'à l\'annuel)');
eq(maAn.moyenne, 0, 'Maths annuel = 0');

const epsAn = bySubject(an, 'eps');
eq(epsAn.moyenne, null, 'EPS jamais évaluée → annuel non évalué');

eq(an.coefSum, 8, 'coefSum annuel = 6 + 2 (EPS exclue)');
eq(an.mxSum, 84, 'mxSum annuel = 14×6 + 0×2 = 84');
eq(an.moyenneGenerale, 10.5, 'moyenne générale annuelle = 84 / 8 = 10,5');

// L'annuel ne lit QUE les trimestres : lui passer des séquences ne change rien.
const anAvecSeqs = assembleApcAnnual(referentiel, notes, { ...ctx, seqIds: ['s1'], seqs: [1, 2, 3, 4, 5, 6] });
ok(JSON.stringify(an) === JSON.stringify(anAvecSeqs),
   'assembleApcAnnual ignore toute séquence qu\'on lui passe → c\'est bien un dérivé des trimestres');

// Et il ne sait pas produire de quatrième trimestre.
ok(an.matieres.every((m) => !('t4' in m)), 'aucune colonne T4 dans l\'annuel');

// ── Compatibilité : assemblePeriod reste exact quand on lui donne un trimestre ──
console.log('\n── compatibilité du chemin assemblePeriod ──');

const viaPeriod = assemblePeriod(referentiel, notes, {
  ...ctx, trimestreId: 't1', seqIds: apcSeqIdsForTrimestre(referentiel, 't1'),
});
ok(JSON.stringify(viaPeriod) === JSON.stringify(t1),
   'assemblePeriod(toutes les séquences de T1) ≡ assembleTrimester(T1)');

// ── C · échelles différentes, de bout en bout ───────────────────────────────
console.log('\n── C · barèmes différents jusqu\'au bulletin ──');

// Même référentiel, mais Français T3 n'a qu'une compétence (f3) : on lui donne
// un barème /3, et on ajoute une 2e compétence T3 notée /20 pour mélanger.
const refEch = {
  ...referentiel,
  competences: [...competences, C('f3b', 't3', 'francais', 2, 'Lire à voix haute')],
};
const notesEch = { ...notes };
notesEch[noteNkey(E, 'f3', 's6')]  = { note: 2,  note_max: 3 };   // 2/3  = 66,67 %
notesEch[noteNkey(E, 'f3b', 's6')] = { note: 14, note_max: 20 };  // 14/20 = 70 %

const t3e = assembleTrimester(refEch, notesEch, { ...ctx, trimestreId: 't3' });
const fr3e = bySubject(t3e, 'francais');

eq(fr3e.competences[0].note, 2, 'la note 2/3 est conservée telle quelle…');
eq(fr3e.competences[0].max, 3, '…avec son barème /3');
eq(fr3e.competences[1].note, 14, 'et la note 14/20 reste 14…');
eq(fr3e.competences[1].max, 20, '…sur /20');
eq(fr3e.moyenne, 13.67, 'moyenne matière = (66,67 % + 70 %)/2 ≈ 13,67/20');
ok(fr3e.moyenne !== 8, 'et surtout pas (2 + 14)/2 = 8');

// Une même compétence notée sur deux barèmes différents selon la séquence :
// la moyenne de la compétence passe alors en proportion, exprimée sur /20.
const notesMulti = { ...notes };
notesMulti[noteNkey(E, 'c1', 's1')] = { note: 2,  note_max: 3 };   // 66,67 %
notesMulti[noteNkey(E, 'c1', 's2')] = { note: 20, note_max: 20 };  // 100 %
delete notesMulti[noteNkey(E, 'c1', 's4')];
const t1m = assembleTrimester(referentiel, notesMulti, { ...ctx, trimestreId: 't1' });
const c1m = bySubject(t1m, 'francais').competences[0];
eq(c1m.max, 20, 'barèmes mélangés sur une même compétence → résultat ramené sur /20');
eq(c1m.note, 16.67, 'et vaut (66,67 % + 100 %)/2 = 83,33 % ≈ 16,67/20');

console.log(failed ? '\n❌ DES TESTS ONT ÉCHOUÉ' : '\n✅ Tous les tests d\'assemblage des bulletins APC passent');
process.exit(failed ? 1 : 0);
