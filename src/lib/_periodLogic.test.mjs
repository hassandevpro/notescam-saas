// Test du cœur pur des périodes académiques : auto-switch par date + dérivation
// de la séquence active. Aucune dépendance (pas de store / réseau / React).
import { computeAutoActive, deriveActiveSequence, toDateStr, isSequenceLockedByPeriod } from './periodLogic.js';

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

// 7) isSequenceLockedByPeriod (C6/I6) — verrou matériel par sequence_order.
const lockPeriods = [
  { type: 'trimestre', name: 'T1', is_locked: true }, // ignoré (pas une séquence)
  { type: 'sequence', sequence_order: 1, school_year: '2025-2026', is_locked: true },
  { type: 'sequence', sequence_order: 2, school_year: '2025-2026', is_locked: false },
  { type: 'sequence', sequence_order: 1, school_year: '2024-2025', is_locked: false },
];
ok(isSequenceLockedByPeriod(lockPeriods, 1, '2025-2026') === true, 'lock: séquence 1 verrouillée (année courante)');
ok(isSequenceLockedByPeriod(lockPeriods, 2, '2025-2026') === false, 'lock: séquence 2 non verrouillée');
ok(isSequenceLockedByPeriod(lockPeriods, 1, '2024-2025') === false, 'lock: même ordre, autre année → non verrouillée');
ok(isSequenceLockedByPeriod(lockPeriods, '1', '2025-2026') === true, 'lock: tolère sequence en string');
ok(isSequenceLockedByPeriod(lockPeriods, 1, null) === true, 'lock: sans filtre année → verrouillée si une séquence 1 l\'est');
ok(isSequenceLockedByPeriod(lockPeriods, 9, '2025-2026') === false, 'lock: séquence inexistante → false');
ok(isSequenceLockedByPeriod(lockPeriods, null) === false, 'lock: sequence null → false');
ok(isSequenceLockedByPeriod(null, 1) === false, 'lock: périodes nulles → false');

console.log(failed ? '\n❌ ÉCHEC' : '\n✅ OK');
process.exit(failed ? 1 : 0);
