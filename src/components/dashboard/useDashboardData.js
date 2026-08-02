// Chargement des données propres à certains BLOCS du tableau de bord.
//
// Règle : on ne charge QUE ce que la composition a retenu (cf. dashboardBlocks.js).
// Un enseignant ne déclenche donc aucune requête discipline ni finance, et un
// surveillant n'interroge jamais le budget.

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { fetchVieScolaireSnapshot } from '../../lib/vieScolaireService';
import { fetchExpenses } from '../../lib/expenseService';
import { fetchUnlockRequests } from '../../lib/unlockService';
import { fetchBudgets, fetchBudgetChapters } from '../../lib/budgetService';
import { fetchBudgetPeriods } from '../../lib/budgetPeriodService';
import { fetchLinePeriods, fetchLineSectors } from '../../lib/budgetLineService';
import { computeBudget } from '../../lib/budgetLinesEngine';

export function todayISO() { return new Date().toISOString().slice(0, 10); }

// ── Vie scolaire ────────────────────────────────────────────────────────────
// Faits du jour + faits de l'année, bornés au périmètre déjà appliqué par le store.
export function useDisciplineSnapshot(enabled, { schoolId, yearLabel, classIds }) {
  const [state, setState] = useState({ loading: enabled, snapshot: null, attendanceToday: [] });
  const key = (classIds || []).join(',');
  const today = todayISO();

  useEffect(() => {
    if (!enabled || !schoolId) { setState({ loading: false, snapshot: null, attendanceToday: [] }); return undefined; }
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    (async () => {
      const ids = key ? key.split(',') : [];
      const [snap, att] = await Promise.all([
        fetchVieScolaireSnapshot(schoolId, yearLabel),
        ids.length
          ? supabase.from('attendance').select('student_id, class_id, status, date')
              .eq('school_id', schoolId).eq('date', today).in('class_id', ids)
          : Promise.resolve({ data: [] }),
      ]);
      if (!alive) return;
      setState({ loading: false, snapshot: snap, attendanceToday: att?.data || [] });
    })().catch(() => { if (alive) setState({ loading: false, snapshot: null, attendanceToday: [] }); });
    return () => { alive = false; };
  }, [enabled, schoolId, yearLabel, key, today]);

  return state;
}

// ── Finance ─────────────────────────────────────────────────────────────────
// Dépenses + demandes de déblocage + consommation du budget annuel. Le calcul de
// consommation réutilise le moteur pur des Budgets — jamais un total recalculé à
// la main, sous peine de diverger de la page Budgets.
export function useFinanceSnapshot(enabled, { schoolId, year, withFigures }) {
  const [state, setState] = useState({
    loading: enabled, expenses: [], unlockRequests: [], annual: null, consumption: null, envelope: 0,
  });

  useEffect(() => {
    if (!enabled || !schoolId) {
      setState({ loading: false, expenses: [], unlockRequests: [], annual: null, consumption: null, envelope: 0 });
      return undefined;
    }
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    (async () => {
      const [ex, un] = await Promise.all([
        fetchExpenses(schoolId, {}),
        fetchUnlockRequests(schoolId, {}),
      ]);
      if (!alive) return;
      const expenses = ex || [];
      const unlockRequests = un || [];

      if (!withFigures) {
        setState({ loading: false, expenses, unlockRequests, annual: null, consumption: null, envelope: 0 });
        return;
      }

      const [budgets, chapters, linePeriods, lineSectors, periods] = await Promise.all([
        fetchBudgets(schoolId, { yearLabel: year }),
        fetchBudgetChapters(schoolId, {}),
        fetchLinePeriods(schoolId),
        fetchLineSectors(schoolId),
        fetchBudgetPeriods(schoolId, { yearLabel: year }),
      ]);
      if (!alive) return;
      const annual = (budgets || []).find((b) => b.tier === 'annual') || null;
      const annualChapters = annual ? (chapters || []).filter((c) => c.budget_id === annual.id) : [];
      const model = annual
        ? computeBudget(annual, annualChapters, {
          periodAllocs: linePeriods || [], sectorAllocs: lineSectors || [], periods: periods || [], expenses,
        })
        : null;
      setState({
        loading: false, expenses, unlockRequests, annual,
        consumption: model?.annual?.consumption || null,
        envelope: Number(annual?.envelope_amount) || 0,
      });
    })().catch(() => {
      if (alive) setState({ loading: false, expenses: [], unlockRequests: [], annual: null, consumption: null, envelope: 0 });
    });
    return () => { alive = false; };
  }, [enabled, schoolId, year, withFigures]);

  return state;
}
