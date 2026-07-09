// Budget GLOBAL — consultation consolidée + PRÉVISIONS + STATISTIQUES avancées.
// Lecture seule ; agrège tous les budgets/chapitres/dépenses (moteurs existants).
import { useEffect, useMemo, useState } from 'react';
import Layout from '../components/Layout';
import { useSchoolStore } from '../store/schoolStore';
import { useAuthStore } from '../store/authStore';
import { useT } from '../lib/i18n';
import { useMoney } from '../lib/useMoney';
import { fetchGroupData } from '../lib/groupDashboardService';
import {
  elapsedFraction, globalBudget, forecast, feeForecast, topExpenseChapters,
} from '../lib/budgetAnalyticsEngine';
import { SECTOR_LABELS } from '../components/budgets/budgetUi';

export default function BudgetGlobal() {
  const t = useT();
  const money = useMoney();
  const school = useAuthStore((s) => s.school);
  const fees = useSchoolStore((s) => s.fees);
  const schoolId = school?.id;
  const year = school?.current_year || '';

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!schoolId) return;
    let alive = true;
    setLoading(true);
    fetchGroupData(schoolId, { yearLabel: year }).then((d) => { if (alive) { setData(d); setLoading(false); } });
    return () => { alive = false; };
  }, [schoolId, year]);

  const f = useMemo(() => elapsedFraction(year), [year]);
  const g = useMemo(() => data ? globalBudget(data.budgets, data.chapters, data.expenses) : null, [data]);
  const fc = useMemo(() => g ? forecast(g, f) : null, [g, f]);
  const ff = useMemo(() => feeForecast(fees, f), [fees, f]);
  const top = useMemo(() => data ? topExpenseChapters(data.chapters, data.expenses) : [], [data]);

  if (loading || !g) {
    return <Layout><div className="text-gray-400 text-sm py-20 text-center animate-pulse">{t('Chargement…', 'Loading…', 'Cargando…')}</div></Layout>;
  }

  const secLabel = (s) => t(...(SECTOR_LABELS[s] || [s]));

  return (
    <Layout>
      <div className="max-w-6xl mx-auto">
        <div className="mb-5">
          <h1 className="text-xl font-bold text-gray-900">{t('Budget global', 'Global budget', 'Presupuesto global')}</h1>
          <p className="text-sm text-gray-500 mt-1">{school?.name || ''} · {year || '—'} · {t('année écoulée à', 'year elapsed', 'año transcurrido')} {fc.elapsed}%</p>
        </div>

        {/* KPIs globaux */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
          <Kpi label={t('Recettes prévues', 'Planned revenue', 'Ingresos previstos')} value={money(g.recettes)} tone="text-emerald-700" />
          <Kpi label={t('Dépenses prévues', 'Planned expenses', 'Gastos previstos')} value={money(g.depensesPrevues)} />
          <Kpi label={t('Engagé', 'Committed', 'Comprometido')} value={money(g.engage)} tone="text-amber-600" />
          <Kpi label={t('Reste', 'Remaining', 'Restante')} value={money(g.reste)} tone={g.reste < 0 ? 'text-rose-600' : 'text-emerald-700'} />
          <Kpi label={t('Exécution', 'Execution', 'Ejecución')} value={`${g.executionRate}%`} />
          <Kpi label={t('Solde prévisionnel', 'Forecast balance', 'Saldo previsional')} value={money(g.solde)} tone={g.solde < 0 ? 'text-rose-600' : 'text-emerald-700'} />
        </div>

        {/* PRÉVISIONS */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-gray-800">{t('Prévision dépenses (fin d’année)', 'Expense forecast (year end)', 'Previsión de gastos')}</h3>
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${fc.overspendRisk ? 'bg-rose-100 text-rose-700' : fc.onTrack ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                {fc.overspendRisk ? t('Risque de dépassement', 'Overspend risk', 'Riesgo de exceso') : fc.onTrack ? t('Dans les clous', 'On track', 'En línea') : t('À surveiller', 'Watch', 'Vigilar')}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              <Kpi label={t('Projection annuelle', 'Projected annual', 'Proyección anual')} value={money(fc.projectedSpend)} tone={fc.overspendRisk ? 'text-rose-600' : 'text-gray-800'} />
              <Kpi label={t('Solde projeté', 'Projected balance', 'Saldo proyectado')} value={money(fc.projectedBalance)} tone={fc.projectedBalance < 0 ? 'text-rose-600' : 'text-emerald-700'} />
              <Kpi label={t('Rythme mensuel', 'Monthly burn', 'Ritmo mensual')} value={money(fc.burnMonthly)} />
            </div>
            <DualBar label={t('Consommation vs temps', 'Usage vs time', 'Consumo vs tiempo')} a={g.executionRate} b={fc.elapsed}
              aLabel={t('consommé', 'used', 'usado')} bLabel={t('écoulé', 'elapsed', 'transcurrido')} />
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-bold text-gray-800 mb-3">{t('Prévision recouvrement des frais', 'Fee collection forecast', 'Previsión de cobros')}</h3>
            <div className="grid grid-cols-2 gap-3 text-center">
              <Kpi label={t('Encaissé', 'Collected', 'Cobrado')} value={money(ff.collected)} tone="text-emerald-700" />
              <Kpi label={t('Attendu', 'Expected', 'Esperado')} value={money(ff.expected)} />
              <Kpi label={t('Recouvrement projeté', 'Projected collection', 'Cobro proyectado')} value={money(ff.projectedCollection)} />
              <Kpi label={t('Manque à gagner projeté', 'Projected shortfall', 'Déficit proyectado')} value={money(ff.projectedShortfall)} tone={ff.projectedShortfall > 0 ? 'text-rose-600' : 'text-emerald-700'} />
            </div>
            <div className="mt-3 h-2 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${ff.rate}%` }} />
            </div>
            <div className="text-xs text-gray-400 mt-1">{ff.rate}% {t('recouvré', 'collected', 'cobrado')}</div>
          </div>
        </div>

        {/* Par secteur */}
        {g.bySector.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
            <h3 className="text-sm font-bold text-gray-800 mb-3">{t('Exécution par secteur', 'Execution by sector', 'Ejecución por sector')}</h3>
            <div className="space-y-2">
              {g.bySector.map((s) => (
                <div key={s.sector}>
                  <div className="flex justify-between text-xs text-gray-600 mb-0.5">
                    <span>{secLabel(s.sector)}</span>
                    <span className="tabular-nums">{money(s.engage)} / {money(s.depensesPrevues)} · {s.rate}%</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${s.rate > 100 ? 'bg-rose-500' : 'bg-indigo-500'}`} style={{ width: `${Math.min(100, s.rate)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Top postes de dépense */}
        {top.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 text-sm font-bold text-gray-800 border-b border-gray-100">{t('Top postes de dépense', 'Top expense lines', 'Principales partidas')}</div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs"><tr>
                <th className="text-left px-4 py-2">{t('Chapitre', 'Chapter', 'Capítulo')}</th>
                <th className="text-right px-4 py-2">{t('Prévu', 'Planned', 'Previsto')}</th>
                <th className="text-right px-4 py-2">{t('Engagé', 'Committed', 'Comprometido')}</th>
                <th className="text-right px-4 py-2">{t('Variance', 'Variance', 'Variación')}</th>
                <th className="text-right px-4 py-2">{t('Taux', 'Rate', 'Tasa')}</th>
              </tr></thead>
              <tbody>{top.map((r) => (
                <tr key={r.id} className="border-t border-gray-100">
                  <td className="px-4 py-2 text-gray-800">{r.label}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{money(r.planned)}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-amber-600">{money(r.engage)}</td>
                  <td className={`px-4 py-2 text-right tabular-nums ${r.variance < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>{money(r.variance)}</td>
                  <td className={`px-4 py-2 text-right tabular-nums ${r.rate > 100 ? 'text-rose-600' : 'text-gray-600'}`}>{r.rate}%</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>
    </Layout>
  );
}

function Kpi({ label, value, tone = 'text-gray-800' }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-3 text-center">
      <div className={`text-base font-bold ${tone}`}>{value}</div>
      <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mt-0.5">{label}</div>
    </div>
  );
}
function DualBar({ label, a, b, aLabel, bLabel }) {
  return (
    <div className="mt-3">
      <div className="text-[11px] text-gray-400 mb-1">{label}</div>
      <div className="relative h-3 bg-gray-100 rounded-full overflow-hidden">
        <div className="absolute inset-y-0 left-0 bg-indigo-500/70" style={{ width: `${Math.min(100, a)}%` }} title={`${a}% ${aLabel}`} />
        <div className="absolute inset-y-0 w-0.5 bg-gray-800" style={{ left: `${Math.min(100, b)}%` }} title={`${b}% ${bLabel}`} />
      </div>
      <div className="flex justify-between text-[10px] text-gray-400 mt-0.5"><span>{a}% {aLabel}</span><span>{b}% {bLabel}</span></div>
    </div>
  );
}
