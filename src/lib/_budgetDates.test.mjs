// Tests des dates d'exercice (Phase D).  node src/lib/_budgetDates.test.mjs
import {
  budgetPeriodBounds, periodDatesLabel, getActiveBudget, budgetsOverlap, findOverlappingBudget,
} from './budgetEngine.js';
import { elapsedFraction, exercisePosition } from './budgetAnalyticsEngine.js';

let failed = false;
const ok = (c, m) => { console.log(`${c ? '✅' : '❌'} ${m}`); if (!c) failed = true; };
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// ── budgetPeriodBounds ──────────────────────────────────────────────────────
{
  const b = budgetPeriodBounds({ academic_year: '2025-2026', period_type: 'annuel' }, 9);
  ok(iso(b.start) === '2025-09-01' && iso(b.endInclusive) === '2026-08-31', 'annuel dérivé (sept) = 01/09/2025 → 31/08/2026');
  ok(b.source === 'derived', 'source = dérivée');

  const jan = budgetPeriodBounds({ academic_year: '2025-2026', period_type: 'annuel' }, 1);
  ok(iso(jan.start) === '2025-01-01' && iso(jan.endInclusive) === '2025-12-31', 'mois de début configurable (janvier)');

  const tri = budgetPeriodBounds({ academic_year: '2025-2026', period_type: 'trimestriel', period_ref: 3 }, 9);
  ok(iso(tri.start) === '2026-05-01' && iso(tri.endInclusive) === '2026-08-31', 'trimestriel T3 = mai→août');

  const ex = budgetPeriodBounds({ academic_year: '2025-2026', start_date: '2025-10-01', end_date: '2026-06-30' }, 9);
  ok(iso(ex.start) === '2025-10-01' && iso(ex.endInclusive) === '2026-06-30' && ex.source === 'explicit', 'dates explicites prioritaires');

  ok(periodDatesLabel({ academic_year: '2025-2026', period_type: 'annuel' }, 9) === '01/09/2025 – 31/08/2026', 'libellé de plage');
}

// ── exercisePosition : 3 cas requis (en cours / pas commencé / dépassé) ──────
{
  const today = new Date(2026, 6, 10);           // 10/07/2026
  const running = exercisePosition(budgetPeriodBounds({ academic_year: '2025-2026', period_type: 'annuel' }, 9), today);
  ok(running.state === 'running' && running.fraction > 0.8 && running.fraction < 0.95, 'EN COURS : ~85% écoulé');

  const before = exercisePosition(budgetPeriodBounds({ academic_year: '2026-2027', period_type: 'annuel' }, 9), today);
  ok(before.state === 'before' && before.fraction === 0, 'PAS COMMENCÉ : fraction 0');

  const ended = exercisePosition(budgetPeriodBounds({ academic_year: '2024-2025', period_type: 'annuel' }, 9), today);
  ok(ended.state === 'ended' && ended.fraction === 1, 'DÉPASSÉ : fraction 1 (pas de 112% aberrant)');

  // Le bug corrigé : un trimestre terminé doit être à 100%, pas ~85%.
  const triEnded = exercisePosition(budgetPeriodBounds({ academic_year: '2025-2026', period_type: 'trimestriel', period_ref: 1 }, 9), today);
  ok(triEnded.state === 'ended', 'trimestriel T1 (sept→déc) : terminé au 10/07 (avant : faussement ~85%)');
}

// ── elapsedFraction configurable ────────────────────────────────────────────
ok(elapsedFraction('2025-2026', new Date(2025, 8, 1), 9) === 0, 'sept-start : 1er sept = 0%');
ok(elapsedFraction('2025-2026', new Date(2025, 8, 1), 1) > 0.6, 'jan-start : 1er sept ≈ 8/12 écoulé');

// ── getActiveBudget + chevauchement ─────────────────────────────────────────
{
  const budgets = [
    { id: 'y25', academic_year: '2024-2025', period_type: 'annuel', status: 'closed' },
    { id: 'y26', academic_year: '2025-2026', period_type: 'annuel', status: 'active' },
  ];
  ok(getActiveBudget(budgets, new Date(2026, 6, 10), 9)?.id === 'y26', 'budget actif au 10/07/2026 = exercice 2025-2026');
  ok(getActiveBudget(budgets, new Date(2027, 6, 10), 9) === null, 'aucun budget actif hors exercice');

  const a = { id: 'a', academic_year: '2025-2026', period_type: 'annuel', sector: 'primaire' };
  const b = { id: 'b', academic_year: '2025-2026', period_type: 'annuel', sector: 'primaire' };
  ok(budgetsOverlap(a, b, 9), 'chevauchement détecté (même période)');
  ok(findOverlappingBudget(a, [b], 9)?.id === 'b', 'chevauchement même secteur → averti');
  ok(findOverlappingBudget(a, [{ ...b, sector: 'transport' }], 9) === null, 'secteur différent → pas d’avertissement');
}

console.log(failed ? '\n❌ Budget dates KO' : '\n✅ Budget dates OK');
process.exit(failed ? 1 : 0);
