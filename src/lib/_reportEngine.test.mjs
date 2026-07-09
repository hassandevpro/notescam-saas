// Tests du moteur pur Reports.  node src/lib/_reportEngine.test.mjs
import {
  STATUS, canTransition, isTerminal, REPORT_CATEGORIES, REPORT_SEVERITIES,
  severityRank, resolveAssignment, initialStatus, nextStatuses, DEFAULT_ASSIGNMENT,
} from './reportEngine.js';

let failed = false;
const ok = (cond, msg) => { console.log(`${cond ? '✅' : '❌'} ${msg}`); if (!cond) failed = true; };

// --- Réutilisation de la machine à états signalement ------------------------
ok(REPORT_CATEGORIES.includes('maintenance') && REPORT_CATEGORIES.includes('vie_scolaire'), 'catégories = domaines signalement');
ok(REPORT_SEVERITIES.join(',') === 'low,normal,high,critical', 'gravités = priorités signalement');
ok(canTransition('assigned', 'in_progress') && !canTransition('new', 'closed'), 'transitions réutilisées (pas de saut illégal)');
ok(isTerminal('closed') && isTerminal('rejected'), 'statuts terminaux');

// --- Gravité ordonnée --------------------------------------------------------
ok(severityRank('critical') > severityRank('high') && severityRank('high') > severityRank('normal'), 'gravité ordonnée');

// --- Affectation automatique par catégorie ----------------------------------
ok(resolveAssignment('maintenance') === 'support', 'maintenance -> support');
ok(resolveAssignment('vie_scolaire') === 'surveillance', 'vie scolaire -> surveillance');
ok(resolveAssignment('finances') === 'comptabilite', 'finances -> comptabilité');
ok(resolveAssignment('inconnue') === null, 'catégorie inconnue -> aucune affectation');
ok(Object.keys(DEFAULT_ASSIGNMENT).length === REPORT_CATEGORIES.length, 'toutes les catégories ont une affectation par défaut');

// Surcharge de carte d'affectation.
ok(resolveAssignment('maintenance', { maintenance: 'sante' }) === 'sante', 'carte d’affectation surchargeable');

// --- Statut initial selon l'affectation -------------------------------------
ok(initialStatus('maintenance') === STATUS.ASSIGNED, 'affecté auto -> statut initial « assigned »');
ok(initialStatus('inconnue') === STATUS.NEW, 'non affecté -> statut initial « new »');

// --- Transitions suivantes (UI) ---------------------------------------------
ok(nextStatuses('assigned').includes('in_progress'), 'prochaines transitions exposées');

console.log(failed ? '\n❌ Report engine KO' : '\n✅ Report engine OK');
process.exit(failed ? 1 : 0);
