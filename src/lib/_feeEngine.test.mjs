// Test du moteur tarifaire pur (échéancier, ajustements, statuts, dashboard).
// Aucune dépendance (pas de store / réseau / React). Lancer : node src/lib/_feeEngine.test.mjs
import {
  applyAdjustments, resolveSchedule, studentFeeSituation, feeDashboard,
  inscriptionApplies, PAYMENT_MODES, FEE_STATUS, daysBetween,
  sumPaidForStudent, derivePaid, reconcilePaid,
} from './feeEngine.js';

let failed = false;
const ok = (cond, msg) => { console.log(`${cond ? '✅' : '❌'} ${msg}`); if (!cond) failed = true; };

// Grille « Terminale C » de l'énoncé.
const grid = {
  amount_comptant:  600000,
  amount_echelonne: 650000,
  tranches: [
    { id: 'insc', label: 'Inscription', amount: 100000, due_date: '2025-08-31' },
    { id: 't1',   label: 'Tranche 1',   amount: 200000, due_date: '2025-10-15' },
    { id: 't2',   label: 'Tranche 2',   amount: 200000, due_date: '2026-01-15' },
    { id: 't3',   label: 'Tranche 3',   amount: 150000, due_date: '2026-03-15' },
  ],
};

// ── Ajustements ──────────────────────────────────────────────────────────────
const adjA = applyAdjustments(650000, [{ mode: 'percent', value: 10 }]);
ok(adjA.net === 585000, 'remise 10% sur 650000 → 585000');
const adjB = applyAdjustments(650000, [{ mode: 'amount', value: 50000 }, { mode: 'amount', value: 30000 }]);
ok(adjB.net === 570000, 'deux remises fixes cumulées → 570000');
const adjC = applyAdjustments(100000, [{ mode: 'amount', value: 200000 }]);
ok(adjC.net === 0, 'remise > total → net borné à 0');

// ── Comptant ─────────────────────────────────────────────────────────────────
const compFee = { payment_mode: PAYMENT_MODES.COMPTANT, frais_payes: 0 };
const compSched = resolveSchedule(compFee, grid);
ok(compSched.total === 600000, 'comptant → total 600000 (tarif réduit)');
ok(compSched.tranches.length === 1, 'comptant → une seule échéance');

// ── Échelonné : statuts de tranches ─────────────────────────────────────────
const echFee = (paid) => ({ payment_mode: PAYMENT_MODES.ECHELONNE, frais_payes: paid, tranches: grid.tranches });

// Au 2025-09-10 : inscription échue, payée (100000). À jour.
let s = studentFeeSituation(echFee(100000), grid, { today: '2025-09-10' });
ok(s.total === 650000, 'échelonné → total 650000');
ok(s.tranches[0].status === 'covered', 'inscription payée → covered');
ok(s.status === FEE_STATUS.UP_TO_DATE, 'inscription réglée en sept → à jour');

// Au 2025-10-20 : T1 échue (15/10) mais non payée → en retard de 5 j.
s = studentFeeSituation(echFee(100000), grid, { today: '2025-10-20' });
ok(s.status === FEE_STATUS.LATE, 'T1 échue impayée → en retard');
ok(s.daysLate === daysBetween('2025-10-15', '2025-10-20') && s.daysLate === 5, 'retard = 5 jours');
ok(s.current.id === 't1', 'tranche attendue = T1');

// Avance : 400000 payés au 2025-09-20 → inscription + T1 + T2 couvertes par avance.
s = studentFeeSituation(echFee(400000), grid, { today: '2025-09-20' });
ok(s.tranches[0].status === 'covered' && s.tranches[1].status === 'covered', 'avance couvre inscription + T1');
ok(s.tranches[2].status === 'partial' && s.tranches[2].allocated === 100000, 'avance partielle sur T2 (avances autorisées)');
ok(s.status === FEE_STATUS.UP_TO_DATE, 'avance importante → à jour');

// Échéance proche : T2 due le 15/01, on est le 10/01, inscription+T1 payées (300000).
s = studentFeeSituation(echFee(300000), grid, { today: '2026-01-10', soonDays: 7 });
ok(s.status === FEE_STATUS.DUE_SOON, 'T2 dans 5 j → échéance proche');

// Soldé.
s = studentFeeSituation(echFee(650000), grid, { today: '2026-04-01' });
ok(s.status === FEE_STATUS.PAID && s.balance === 0, 'tout payé → soldé');

// ── Ajustement sur échelonné : bourse 65000 (10%) → tranches mises à l'échelle ──
s = studentFeeSituation(
  { payment_mode: PAYMENT_MODES.ECHELONNE, frais_payes: 0, tranches: grid.tranches, adjustments: [{ mode: 'percent', value: 10 }] },
  grid, { today: '2025-09-10' },
);
ok(s.total === 585000, 'bourse 10% → net 585000');
ok(s.tranches.reduce((a, t) => a + t.amount, 0) === 585000, 'somme des tranches == net après mise à l\'échelle');

// ── Libre / legacy (compatibilité) : pas de grille, frais_annuels manuels ──────
s = studentFeeSituation({ frais_annuels: 150000, frais_payes: 50000 }, null, { today: '2025-09-10' });
ok(s.total === 150000 && s.balance === 100000, 'legacy frais manuels → total/solde OK');
ok(s.mode === PAYMENT_MODES.LIBRE, 'sans mode → libre');

// ── Frais d'inscription (nouveau dans l'établissement) ──────────────────────
const gridInsc = { ...grid, amount_inscription: 25000 };
ok(inscriptionApplies({ statut_etablissement: 'nouveau' }) === true, 'nouveau établissement → inscription due');
ok(inscriptionApplies({ statut_etablissement: 'ancien' }) === false, 'ancien établissement → pas d\'inscription');
// Dimension indépendante : redoublant peut être nouveau dans l'établissement.
ok(inscriptionApplies({ statut_etablissement: 'nouveau', statut: 'redoublant' }) === true, 'redoublant + nouveau établissement → inscription due');
ok(inscriptionApplies({ statut: 'nouveau' }) === false, 'statut de classe seul → pas d\'inscription');
ok(inscriptionApplies({}) === false, 'aucun statut → pas d\'inscription');

// Appliquée : total = scolarité + inscription, en tête de l'échéancier.
s = studentFeeSituation(echFee(0), gridInsc, { today: '2025-09-10', applyInscription: true });
ok(s.total === 650000 + 25000, 'inscription ajoutée au total (675000)');
ok(s.inscription === 25000, 'montant d\'inscription exposé');
ok(s.tranches[0].id === 'inscription' && s.tranches[0].amount === 25000, 'inscription = 1re ligne de l\'échéancier');
// Non appliquée (ancien) : total inchangé, aucune ligne inscription.
s = studentFeeSituation(echFee(0), gridInsc, { today: '2025-09-10', applyInscription: false });
ok(s.total === 650000 && s.inscription === 0, 'ancien élève → pas de frais d\'inscription');
// Le versement couvre l'inscription en premier (cagnotte séquentielle).
s = studentFeeSituation(echFee(25000), gridInsc, { today: '2025-09-10', applyInscription: true });
ok(s.tranches[0].status === 'covered', 'versement couvre d\'abord l\'inscription');

// ── Dashboard ─────────────────────────────────────────────────────────────────
const entries = [
  { student: { id: 'a', name: 'A' }, fee: echFee(100000), grid }, // retard au 20/10
  { student: { id: 'b', name: 'B' }, fee: echFee(650000), grid }, // soldé
  { student: { id: 'c', name: 'C' }, fee: echFee(300000), grid }, // T2 à venir
];
const dash = feeDashboard(entries, '2025-10-20', 7);
ok(dash.expected === 650000 * 3, 'dashboard : attendu = 3 × 650000');
ok(dash.collected === 100000 + 650000 + 300000, 'dashboard : encaissé cumulé');
ok(dash.lateTotal === 1, 'dashboard : 1 élève en retard');

// ── C4 : frais_payes dérivé des lignes de paiement ──────────────────────────
const pays = [
  { student_id: 's1', academic_year: '2025-2026', amount: 30000 },
  { student_id: 's1', academic_year: '2025-2026', amount: '20000' }, // string toléré
  { student_id: 's1', academic_year: '2024-2025', amount: 99999 },   // autre année
  { student_id: 's2', academic_year: '2025-2026', amount: 5000 },
];
ok(sumPaidForStudent(pays, 's1', '2025-2026') === 50000, 'sumPaid : somme année courante (string incluse)');
ok(sumPaidForStudent(pays, 's1', null) === 149999, 'sumPaid : toutes années si year null');
ok(sumPaidForStudent(pays, 'sX', '2025-2026') === 0, 'sumPaid : élève inconnu → 0');
ok(sumPaidForStudent(null, 's1') === 0, 'sumPaid : entrée nulle → 0');

// derivePaid — ajout de versement (rowsBefore → rowsBefore+montant)
ok(derivePaid(0, 0, 30000) === 30000, 'derivePaid : 1er versement');
ok(derivePaid(30000, 30000, 50000) === 50000, 'derivePaid : 2e versement cohérent');
// socle opaque importé (frais_payes=50000 sans ligne) : +20000 → 70000, jamais reperdu
ok(derivePaid(50000, 0, 20000) === 70000, 'derivePaid : préserve le socle opaque importé');
// cache sous-évalué (lost-update) : la dérivation se recale sur les lignes
ok(derivePaid(15000, 20000, 50000) === 50000, 'derivePaid : guérit un cache sous-évalué');
// suppression : rowsAfter = rowsBefore - montant
ok(derivePaid(50000, 50000, 30000) === 30000, 'derivePaid : suppression d\'un versement');
ok(derivePaid(30000, 30000, 0) === 0, 'derivePaid : suppression du dernier versement → 0');
// suppression en préservant socle : cache 70000 (socle 50000 + 20000 en lignes), on retire les 20000
ok(derivePaid(70000, 20000, 0) === 50000, 'derivePaid : suppression conserve le socle importé');

// reconcilePaid — monotone (ne fait que remonter)
ok(reconcilePaid(30000, 60000) === 60000, 'reconcile : remonte au total réel des lignes (lost-update)');
ok(reconcilePaid(50000, 0) === 50000, 'reconcile : préserve le solde importé (0 ligne)');
ok(reconcilePaid(50000, 30000) === 50000, 'reconcile : ne diminue jamais (suppression en vol)');
ok(reconcilePaid(0, 0) === 0, 'reconcile : rien à faire → 0');

console.log(failed ? '\n❌ ÉCHECS' : '\n✅ Tous les tests passent');
process.exit(failed ? 1 : 0);
