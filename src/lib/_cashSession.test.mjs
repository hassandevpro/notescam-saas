// Arrêté de caisse + rétention d'élève — moteurs PURS.
// Lancer : node src/lib/_cashSession.test.mjs
//
// Les deux failles que ces moteurs ferment :
//   • la recette JAMAIS SAISIE (rien à protéger : il faut confronter au physique) ;
//   • l'élève supprimé qui emportait ses versements par cascade FK.
import {
  expectedCash, reconcile, requiresExplanation, canValidate,
  receiptSequenceGaps, dayOverview, SESSION_STATUS,
} from './cashSessionEngine.js';
import { retentionDecision, RETENTION, paymentTrail, splitArchived, archiveFields, unarchiveFields } from './studentRetention.js';

let failed = false;
const ok = (cond, msg) => { console.log(`${cond ? '✅' : '❌'} ${msg}`); if (!cond) failed = true; };

const DAY = '2026-02-10';
const CAISSIER = 'u-atangana';
const AUTRE    = 'u-mballa';
const pay = (id, amount, extra = {}) => ({ id, amount, date: DAY, recorded_by: CAISSIER, student_id: 's1', ...extra });

// ── Attendu en caisse ────────────────────────────────────────────────────────
const rows = [
  pay('p1', 100000),
  pay('p2', 50000),
  pay('p3', -50000, { reversal_of: 'p2', void_reason: 'erreur' }),
  pay('p4', 25000, { recorded_by: AUTRE }),          // autre caissier
  pay('p5', 999999, { date: '2026-02-09' }),          // autre jour
];

const exp = expectedCash(rows, { cashierId: CAISSIER, date: DAY });
ok(exp.expected === 100000, 'attendu = 100 000 (150 000 encaissés − 50 000 annulés)');
ok(exp.count === 3, 'seules les 3 écritures du bon caissier / bon jour sont retenues');
ok(exp.encaissements === 150000, 'encaissements bruts = 150 000');
ok(exp.annulations === -50000, 'annulations = −50 000');

const withFloat = expectedCash(rows, { cashierId: CAISSIER, date: DAY, openingFloat: 20000 });
ok(withFloat.expected === 120000, 'fond de caisse d\'ouverture ajouté à l\'attendu');

// ── LE cas qui nous intéresse : encaissé mais jamais saisi ───────────────────
// Le tiroir contient 130 000 alors que les écritures n'en annoncent que 100 000.
const surplus = reconcile({ counted: 130000, expected: exp.expected });
ok(surplus.variance === 30000, 'écart de +30 000 détecté');
ok(surplus.direction === 'surplus', 'sens = excédent (recette encaissée non saisie)');
ok(!surplus.balanced, 'la caisse n\'est pas équilibrée');
ok(requiresExplanation(surplus.variance), 'un écart exige une justification');

// Recette fictive / espèces disparues : le tiroir est plus léger.
const shortfall = reconcile({ counted: 80000, expected: exp.expected });
ok(shortfall.variance === -20000, 'écart de −20 000 détecté');
ok(shortfall.direction === 'shortfall', 'sens = manquant');

// Caisse juste.
const balanced = reconcile({ counted: 100000, expected: exp.expected });
ok(balanced.balanced && balanced.variance === 0, 'comptage exact → caisse équilibrée');
ok(!requiresExplanation(0), 'aucune justification quand l\'écart est nul');
ok(!requiresExplanation(500, 500), 'écart dans la tolérance de monnaie → pas de blocage');
ok(requiresExplanation(501, 500), 'au-delà de la tolérance → justification exigée');

// ── Personne ne valide son propre comptage ──────────────────────────────────
const declared = { cashier_id: CAISSIER, status: SESSION_STATUS.DECLARED };
ok(!canValidate(declared, CAISSIER), 'le caissier ne peut PAS valider son propre arrêté');
ok(canValidate(declared, AUTRE), 'un tiers peut valider');
ok(!canValidate({ cashier_id: CAISSIER, status: SESSION_STATUS.OPEN }, AUTRE), 'rien à valider tant que rien n\'est déclaré');
ok(!canValidate({ cashier_id: CAISSIER, status: SESSION_STATUS.VALIDATED }, AUTRE), 'un arrêté déjà validé ne se revalide pas');

// ── Trous dans la série des reçus ───────────────────────────────────────────
const gaps = receiptSequenceGaps([1, 2, 3, 5, 6, 9]);
ok(gaps.gaps.join(',') === '4,7,8', 'reçus manquants identifiés : 4, 7, 8');
ok(gaps.from === 1 && gaps.to === 9, 'bornes de la série');
ok(receiptSequenceGaps([1, 2, 3]).gaps.length === 0, 'série continue → aucun trou');
ok(receiptSequenceGaps([]).gaps.length === 0, 'série vide → aucun trou (pas de faux positif)');

// ── Vue journée : qui n'a pas arrêté sa caisse ? ─────────────────────────────
const sessions = [{ date: DAY, cashier_id: CAISSIER, status: SESSION_STATUS.DECLARED, counted_cash: 130000 }];
const day = dayOverview(rows, sessions, { date: DAY, cashiers: [{ id: CAISSIER }, { id: AUTRE }] });
ok(day.rows.length === 2, 'les deux caissiers apparaissent');
ok(day.unreconciled === 1, 'un caissier a encaissé sans arrêter sa caisse');
ok(day.rows.find((r) => r.cashier.id === AUTRE).unreconciled, 'c\'est bien le second caissier');
ok(day.totalVariance === 30000, 'écart consolidé de la journée = +30 000');

// Un caissier sans aucune écriture n'est pas « en défaut ».
const idle = dayOverview([], [], { date: DAY, cashiers: [{ id: AUTRE }] });
ok(idle.unreconciled === 0, 'aucun mouvement → aucun arrêté attendu');

// ── Rétention d'élève ───────────────────────────────────────────────────────
const payments = [
  { id: 'x1', student_id: 'stuA', amount: 50000, academic_year: '2025-2026' },
  { id: 'x2', student_id: 'stuA', amount: -50000, reversal_of: 'x1', academic_year: '2025-2026' },
];
ok(retentionDecision('stuA', payments).action === RETENTION.ARCHIVE, 'élève avec écritures → ARCHIVAGE');
ok(retentionDecision('stuB', payments).action === RETENTION.DELETE, 'élève sans écriture → suppression classique');

// Point clé : un versement intégralement annulé fait un solde NUL, mais reste
// une pièce comptable. Le solde ne doit pas rouvrir le droit à l'effacement.
const trail = paymentTrail('stuA', payments);
ok(trail.net === 0 && trail.entries === 2, 'solde nul mais 2 écritures conservées');
ok(retentionDecision('stuA', payments).blocking, 'solde nul ⇒ la suppression reste bloquée');

// ── Champs d'archivage ──────────────────────────────────────────────────────
const f = archiveFields({ at: '2026-02-10T08:00:00.000Z', actorId: 'u1', actorName: 'Mme Ada', reason: '  Départ  ' });
ok(f.archived_at === '2026-02-10T08:00:00.000Z', 'horodatage d\'archivage fourni par l\'appelant');
ok(f.archive_reason === 'Départ', 'motif nettoyé');
ok(archiveFields({ at: 'x', reason: '   ' }).archive_reason === null, 'motif vide → null');
ok(unarchiveFields().archived_at === null, 'désarchivage : la marque est retirée');

const split = splitArchived([{ id: 'a' }, { id: 'b', archived_at: 'x' }]);
ok(split.active.length === 1 && split.archived.length === 1, 'listes actives / archivées séparées');

console.log(failed ? '\n❌ ÉCHEC' : '\n✅ Tous les tests passent');
process.exit(failed ? 1 : 0);
