// Tests du moteur pur RH.  node src/lib/_hrEngine.test.mjs
import {
  computeLeaveDays, isContractActive, currentContract, leaveBalance,
  attendanceSummary, evaluationAverage,
  HR_CONTRACT_TYPES, HR_LEAVE_TYPES, HR_ATTENDANCE_STATUSES, HR_CAREER_TYPES,
} from './hrEngine.js';

let failed = false;
const ok = (cond, msg) => { console.log(`${cond ? '✅' : '❌'} ${msg}`); if (!cond) failed = true; };

// --- Jours de congé (bornes incluses) ---------------------------------------
ok(computeLeaveDays('2026-01-01', '2026-01-01') === 1, '1 jour = même date');
ok(computeLeaveDays('2026-01-01', '2026-01-05') === 5, '5 jours (bornes incluses)');
ok(computeLeaveDays('2026-01-05', '2026-01-01') === 0, 'fin avant début = 0');
ok(computeLeaveDays('', '2026-01-05') === 0, 'date manquante = 0');

// --- Contrat actif -----------------------------------------------------------
ok(isContractActive({ status: 'active', start_date: '2025-09-01', end_date: '2026-08-31' }, '2026-01-15'), 'CDD en cours = actif');
ok(!isContractActive({ status: 'active', start_date: '2025-09-01', end_date: '2025-12-31' }, '2026-01-15'), 'CDD expiré = inactif');
ok(!isContractActive({ status: 'suspended', start_date: '2025-09-01' }, '2026-01-15'), 'suspendu = inactif');
ok(isContractActive({ status: 'active', start_date: '2025-09-01', end_date: null }, '2026-01-15'), 'CDI sans fin = actif');
ok(!isContractActive({ status: 'active', start_date: '2027-01-01' }, '2026-01-15'), 'contrat futur = inactif');

// --- Contrat courant ---------------------------------------------------------
{
  const cs = [
    { id: 'a', status: 'ended', start_date: '2023-09-01', end_date: '2024-08-31' },
    { id: 'b', status: 'active', start_date: '2025-09-01', end_date: null },
  ];
  ok(currentContract(cs, '2026-01-15')?.id === 'b', 'contrat courant = actif le plus récent');
}

// --- Solde de congés ---------------------------------------------------------
{
  const leaves = [
    { type: 'annuel', status: 'approved', start_date: '2026-02-01', end_date: '2026-02-05' }, // 5 j
    { type: 'annuel', status: 'approved', start_date: '2026-04-01', days: 3 },                 // 3 j (explicite)
    { type: 'annuel', status: 'pending',  start_date: '2026-05-01', end_date: '2026-05-10' },  // ignoré (non approuvé)
    { type: 'maladie', status: 'approved', start_date: '2026-03-01', end_date: '2026-03-02' }, // autre type
  ];
  const bal = leaveBalance(30, leaves, '2026', 'annuel');
  ok(bal.used === 8 && bal.remaining === 22, 'solde congés annuels : 30 − 8 = 22');
}

// --- Présences ---------------------------------------------------------------
{
  const recs = [
    { status: 'present' }, { status: 'present' }, { status: 'retard' },
    { status: 'absent' }, { status: 'mission' },
  ];
  const s = attendanceSummary(recs);
  ok(s.total === 5 && s.present === 2 && s.absent === 1, 'comptes par statut');
  ok(s.presenceRate === 80, 'taux de présence = (2+1+1)/5 = 80%');
}

// --- Moyenne d'évaluation ----------------------------------------------------
ok(evaluationAverage([{ score: 16 }, { score: 14 }, { score: 'x' }]) === 15, 'moyenne = 15 (non numérique ignoré)');
ok(evaluationAverage([]) === null, 'aucune évaluation = null');

ok(HR_CONTRACT_TYPES.length >= 4 && HR_LEAVE_TYPES.includes('annuel')
  && HR_ATTENDANCE_STATUSES.includes('present') && HR_CAREER_TYPES.includes('promotion'), 'énumérations exposées');

console.log(failed ? '\n❌ HR engine KO' : '\n✅ HR engine OK');
process.exit(failed ? 1 : 0);
