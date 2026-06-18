// Test du cœur pur des périodes académiques : auto-switch par date + dérivation
// de la séquence active. Aucune dépendance (pas de store / réseau / React).
import { computeAutoActive, deriveActiveSequence, toDateStr } from './periodLogic.js';

let failed = false;
const ok = (cond, msg) => { console.log(`${cond ? '✅' : '❌'} ${msg}`); if (!cond) failed = true; };

const seq = (order, status, teaching_start) => ({
  type: 'sequence', sequence_order: order, status, teaching_start,
});

// Jeu de données : 6 séquences avec dates de début étalées.
const periods = [
  { type: 'trimestre', name: 'Trimestre 1' },
  seq(1, 'closed', '2025-09-01'),
  seq(2, 'closed', '2025-11-01'),
  seq(3, 'active', '2026-01-05'),
  seq(4, 'upcoming', '2026-03-01'),
  seq(5, 'upcoming', '2026-05-01'),
  seq(6, 'upcoming', '2026-06-01'),
];

// 1) computeAutoActive : la séquence démarrée la plus récente.
ok(computeAutoActive(periods, new Date('2025-09-15'))?.sequence_order === 1, 'mi-septembre → séquence 1');
ok(computeAutoActive(periods, new Date('2025-11-02'))?.sequence_order === 2, 'début novembre → séquence 2');
ok(computeAutoActive(periods, new Date('2026-04-15'))?.sequence_order === 4, 'mi-avril → séquence 4');
ok(computeAutoActive(periods, new Date('2026-12-31'))?.sequence_order === 6, 'fin d\'année → séquence 6');

// 2) Avant toute date de début → null (le hook retombe sur la 1ère séquence).
ok(computeAutoActive(periods, new Date('2025-08-01')) === null, 'avant la rentrée → null');

// 3) Aucune teaching_start → null (calcul date impossible, pas de plantage).
ok(computeAutoActive([seq(1, 'upcoming', null), seq(2, 'upcoming', null)]) === null, 'sans dates → null');
ok(computeAutoActive([]) === null, 'liste vide → null');

// 4) deriveActiveSequence : renvoie l'entier de la séquence active, sinon null.
ok(deriveActiveSequence(periods) === 3, 'active = séquence 3');
ok(deriveActiveSequence([seq(1, 'closed', '2025-09-01')]) === null, 'aucune active → null');

// 5) toDateStr robuste.
ok(toDateStr(new Date('2026-01-05T10:00:00Z')) === '2026-01-05', 'toDateStr formate en YYYY-MM-DD');
ok(toDateStr('pas une date') === '', 'toDateStr tolère une entrée invalide');

// 6) Le tri ne mute pas l'entrée et ignore les non-séquences.
const snapshot = JSON.stringify(periods);
computeAutoActive(periods, new Date('2026-04-15'));
ok(JSON.stringify(periods) === snapshot, 'computeAutoActive ne mute pas le tableau source');

console.log(failed ? '\n❌ ÉCHEC' : '\n✅ OK');
process.exit(failed ? 1 : 0);
