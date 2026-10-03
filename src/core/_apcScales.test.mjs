// Test des ÉCHELLES D'ÉVALUATION du moteur APC.
//
// Une compétence n'est évaluée QU'UNE FOIS par séquence (clé `apc_notes_uniq`),
// et cette évaluation porte son propre barème (`apc_notes.note_max`, NULL = /20).
// Deux dénominateurs différents ne s'additionnent pas : on normalise d'abord.
//
//   node src/core/_apcScales.test.mjs

import {
  matiereAverage, noteScale, noteRatio, APC_DEFAULT_MAX, generalAverage,
} from './apcEngine.js';

let failed = 0;
const ok = (c, m) => { if (!c) failed++; console.log(`${c ? '✅' : '❌'} ${m}`); };
const eq = (a, b, m) => ok(a === b, `${m} (${a} ≈ ${b})`);

const C2 = [{ id: 'c1' }, { id: 'c2' }];
const C3 = [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }];

// ── Test 1 · compétence non évaluée ─────────────────────────────────────────
console.log('\n── Test 1 · compétence non évaluée ignorée ──');

eq(matiereAverage({ c1: 12 }, C2), 12, 'une seule compétence notée → 12, et non 6');
eq(matiereAverage({ c1: 12, c2: null }, C2), 12, 'note null → non évaluée');
eq(matiereAverage({ c1: 12, c2: '' }, C2), 12, "note '' → non évaluée");
eq(matiereAverage({ c1: 12, c2: 'ABS' }, C2), 12, "note 'ABS' → ignorée (règle en vigueur)");
eq(matiereAverage({}, C2), null, 'aucune compétence notée → null (pas 0)');

// `coefSum` : une compétence non évaluée ne pèse pas dans la pondération.
const pond = [{ id: 'c1', coefficient: 3 }, { id: 'c2', coefficient: 1 }];
eq(matiereAverage({ c1: 12 }, pond), 12,
   'coefSum n\'inclut pas la compétence non évaluée (sinon 12×3/4 = 9)');
eq(matiereAverage({ c1: 12, c2: 16 }, pond), 13, 'pondération normale quand les deux sont notées');

// ── Test 2 · le zéro est une vraie note ─────────────────────────────────────
console.log('\n── Test 2 · le zéro compte ──');

eq(matiereAverage({ c1: 0, c2: 10 }, C2), 5, 'zéro + 10 → 5');
eq(matiereAverage({ c1: '0', c2: 10 }, C2), 5, "le zéro en chaîne ('0') compte aussi");
eq(matiereAverage({ c1: 0 }, C2), 0, 'une seule note, un zéro → 0');
ok(matiereAverage({ c1: 0 }, C2) !== null, 'un zéro ne devient jamais « non évalué »');

// ── Test 3 · échelles différentes normalisées ───────────────────────────────
console.log('\n── Test 3 · échelles différentes ──');

const mixte = { c1: { note: 2, max: 3 }, c2: { note: 14, max: 20 } };
eq(matiereAverage(mixte, C2), 13.67, '2/3 (66,67 %) et 14/20 (70 %) → 68,33 % ≈ 13,67/20');
ok(matiereAverage(mixte, C2) !== 8, 'JAMAIS (2 + 14) / 2 = 8');

eq(noteRatio({ note: 2, max: 3 }).toFixed(4), '0.6667', '2/3 = 66,67 %');
eq(noteRatio({ note: 14, max: 20 }), 0.7, '14/20 = 70 %');
eq(noteRatio(14), 0.7, 'valeur brute → barème par défaut /20');

// La forme stockée (`note_max`) est acceptée telle quelle, sans réécriture.
eq(matiereAverage({ c1: { note: 2, note_max: 3 }, c2: { note: 14, note_max: null } }, C2), 13.67,
   'enregistrement brut { note, note_max } : note_max null ⇒ /20');

// Trois échelles d'un coup.
eq(matiereAverage({ c1: { note: 1, max: 1 }, c2: { note: 1, max: 2 }, c3: { note: 3, max: 3 } }, C3),
   16.67, '100 %, 50 %, 100 % → 83,33 % ≈ 16,67/20');

// ── Test 4 · une seule compétence évaluée décide du résultat ────────────────
console.log('\n── Test 4 · une seule évaluée parmi plusieurs ──');

eq(matiereAverage({ c2: { note: 3, max: 3 } }, C3), 20, 'seule 3/3 notée → 20/20');
eq(matiereAverage({ c2: { note: 1, max: 3 } }, C3), 6.67, 'seule 1/3 notée → 6,67/20');
eq(matiereAverage({ c3: { note: 0, max: 5 } }, C3), 0, 'seule 0/5 notée → 0');

// ── Test 5 · zéro + compétence non évaluée ──────────────────────────────────
console.log('\n── Test 5 · zéro et non évaluée ──');

eq(matiereAverage({ c1: 0 }, C2), 0, 'C1 = 0, C2 non évaluée → 0 (et non 0 divisé par 2)');
eq(matiereAverage({ c1: { note: 0, max: 3 } }, C2), 0, '0/3 → 0, le barème ne change rien à un zéro');
eq(matiereAverage({ c1: 0, c2: 20 }, C2), 10, 'zéro et 20 → 10 : les deux comptent');

// ── Test 6 · maximum dynamique ──────────────────────────────────────────────
console.log('\n── Test 6 · barèmes et conversions ──');

for (const n of [1, 2, 3, 5, 10, 20]) {
  eq(matiereAverage({ c1: { note: n, max: n } }, C2), 20, `${n}/${n} → 20/20 (100 %)`);
  eq(matiereAverage({ c1: { note: 0, max: n } }, C2), 0, `0/${n} → 0`);
}
eq(matiereAverage({ c1: { note: 1, max: 2 } }, C2), 10, '1/2 → 10/20');
eq(matiereAverage({ c1: { note: 2, max: 5 } }, C2), 8, '2/5 → 8/20');
eq(matiereAverage({ c1: { note: 7, max: 10 } }, C2), 14, '7/10 → 14/20');

// Barèmes aberrants : on retombe sur le défaut plutôt que de diviser par zéro.
eq(noteScale({ note: 5, max: 0 }).max, APC_DEFAULT_MAX, 'barème 0 → repli /20 (jamais de division par zéro)');
eq(noteScale({ note: 5, max: -3 }).max, APC_DEFAULT_MAX, 'barème négatif → repli /20');
eq(noteScale({ note: 5, max: 'x' }).max, APC_DEFAULT_MAX, 'barème illisible → repli /20');
eq(noteScale(null), null, 'absence de note → null');
eq(noteScale({ note: null, max: 3 }), null, 'note null → null, quel que soit le barème');

// ── Non-régression : tout l'historique est sur /20 ──────────────────────────
console.log('\n── Non-régression · jeu entièrement /20 ──');

eq(matiereAverage({ c1: 12, c2: 16 }, C2), 14, 'moyenne /20 inchangée');
eq(matiereAverage({ c1: '12.5', c2: '15.5' }, C2), 14, 'notes en chaîne, moyenne inchangée');
eq(matiereAverage({ c1: { note: 12, max: 20 }, c2: { note: 16, max: 20 } }, C2), 14,
   'barème /20 explicite ≡ barème implicite');
eq(generalAverage([{ moyenne: 13.67, coef: 4 }, { moyenne: 10, coef: 2 }]), 12.45,
   'moyenne générale pondérée inchangée (elle agrège des moyennes, déjà sur /20)');

console.log(failed ? '\n❌ DES TESTS ONT ÉCHOUÉ' : '\n✅ Tous les tests d\'échelles APC passent');
process.exit(failed ? 1 : 0);
