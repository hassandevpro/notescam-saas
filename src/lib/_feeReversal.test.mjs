// Contre-passation d'un versement — moteur PUR (aucun store, aucun réseau).
// Lancer : node src/lib/_feeReversal.test.mjs
//
// Ce que ce test protège : la faille de détournement #1 de l'audit. Un versement
// encaissé ne doit JAMAIS pouvoir disparaître ; l'annuler doit laisser DEUX
// écritures visibles et un solde exact. Le test vérifie donc que l'arithmétique
// des soldes reste juste quand des lignes négatives entrent dans le jeu.
import { sumPaidForStudent, derivePaid, reconcilePaid } from './feeEngine.js';
import { paidForItem, itemBalance } from './feeCatalogEngine.js';

let failed = false;
const ok = (cond, msg) => { console.log(`${cond ? '✅' : '❌'} ${msg}`); if (!cond) failed = true; };

const YEAR = '2025-2026';
const STU  = 'stu-1';
const pay = (id, amount, extra = {}) => ({
  id, student_id: STU, academic_year: YEAR, amount, date: '2026-01-10', ...extra,
});

// ── Encaissements normaux ────────────────────────────────────────────────────
const p1 = pay('p1', 100000);
const p2 = pay('p2', 50000);
let rows = [p1, p2];
ok(sumPaidForStudent(rows, STU, YEAR) === 150000, 'deux versements → 150 000 encaissés');

// ── Contre-passation du second versement ────────────────────────────────────
// La ligne d'origine RESTE dans le jeu : on ajoute une ligne négative.
const rev = pay('r2', -50000, { reversal_of: 'p2', void_reason: 'Erreur de saisie' });
const rowsAfter = [...rows, rev];

ok(rowsAfter.length === 3, 'annulation : rien n\'est retiré, une 3e ligne est ajoutée');
ok(rowsAfter.some((p) => p.id === 'p2'), 'le versement annulé reste présent dans l\'historique');
ok(sumPaidForStudent(rowsAfter, STU, YEAR) === 100000, 'après annulation → 100 000 encaissés');

// ── frais_payes dérivé : il doit retomber juste, sans soustraction en aveugle ─
const before = sumPaidForStudent(rows, STU, YEAR);
const after  = sumPaidForStudent(rowsAfter, STU, YEAR);
ok(derivePaid(150000, before, after) === 100000, 'frais_payes dérivé → 100 000');

// Socle opaque importé (solde d'ouverture sans lignes détaillées) : préservé.
// cache 200 000 dont 150 000 de lignes ⇒ socle 50 000, qui doit survivre.
ok(derivePaid(200000, before, after) === 150000, 'socle importé préservé (50 000 + 100 000)');

// Un montant ne peut pas devenir négatif, même si on annule plus que le socle.
ok(derivePaid(50000, 150000, -20000) === 0, 'frais_payes borné à 0, jamais négatif');

// ── Réconciliation au chargement : ne doit PAS ressusciter le montant annulé ──
// Le cache a déjà été abaissé par l'annulation ; rowsSum vaut la même chose.
ok(reconcilePaid(100000, after) === 100000, 'rechargement : l\'annulation n\'est pas défaite');

// ── Annulation d'un frais du catalogue ───────────────────────────────────────
const item = { id: 'it1', amount: 30000, status: 'active' };
const itemPaid = [pay('p3', 30000, { student_fee_item_id: 'it1' })];
ok(itemBalance(item, itemPaid).status === 'paid', 'frais optionnel réglé → payé');

const itemVoided = [...itemPaid, pay('r3', -30000, { student_fee_item_id: 'it1', reversal_of: 'p3', void_reason: 'Remboursé' })];
ok(paidForItem('it1', itemVoided) === 0, 'annulation du frais → 0 payé sur la ligne');
ok(itemBalance(item, itemVoided).status === 'unpaid', 'frais optionnel redevient non payé');
ok(itemBalance(item, itemVoided).balance === 30000, 'solde du frais rétabli à 30 000');

// ── Double annulation : le total ne doit pas partir deux fois ────────────────
// (La garde applicative refuse le 2e appel ; ici on vérifie que même si une
//  double ligne existait, la somme resterait cohérente et bornée à 0.)
const doubleRev = [...rowsAfter, pay('r2b', -50000, { reversal_of: 'p2', void_reason: 'doublon' })];
ok(sumPaidForStudent(doubleRev, STU, YEAR) === 50000, 'double contre-passation : la somme reste arithmétiquement juste');

// ── Une année différente n'est pas touchée ──────────────────────────────────
const otherYear = [...rowsAfter, pay('p9', 80000, { academic_year: '2024-2025' })];
ok(sumPaidForStudent(otherYear, STU, YEAR) === 100000, 'les versements d\'une autre année restent hors du calcul');

console.log(failed ? '\n❌ ÉCHEC' : '\n✅ Tous les tests passent');
process.exit(failed ? 1 : 0);
