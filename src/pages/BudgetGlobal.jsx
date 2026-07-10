// Budget GLOBAL — dashboard moderne (consultation consolidée + prévisions +
// statistiques avancées). Réservé à la direction. Graphiques SVG maison.
import { useEffect, useMemo, useState } from 'react';
import Layout from '../components/Layout';
import { useSchoolStore } from '../store/schoolStore';
import { useAuthStore } from '../store/authStore';
import { useT } from '../lib/i18n';
import { useMoney } from '../lib/useMoney';
import { fetchGroupData } from '../lib/groupDashboardService';
import {
  globalBudget, forecast, feeForecast, topExpenseChapters, exercisePosition,
} from '../lib/budgetAnalyticsEngine';
import { budgetPeriodBounds, periodDatesLabel, DEFAULT_SCHOOL_YEAR_START_MONTH } from '../lib/budgetEngine';
import { SECTOR_LABELS } from '../components/budgets/budgetUi';
import { Donut, RadialGauge, Legend, ProgressBar } from '../components/charts/Charts';

const PALETTE = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#14b8a6', '#ef4444'];

export default function BudgetGlobal() {
  const t = useT();
  const money = useMoney();
  const school = useAuthStore((s) => s.school);
  const fees = useSchoolStore((s) => s.fees);
  const schoolId = school?.id;
  const year = school?.current_year || '';

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    if (!schoolId) { setLoading(false); return; }
    let alive = true;
    const cacheKey = `notescam_budgetglobal_${schoolId}_${year}`;

    // 1) Affiche IMMÉDIATEMENT les dernières données connues (offline-lite).
    try {
      const cached = JSON.parse(localStorage.getItem(cacheKey) || 'null');
      if (cached) { setData(cached); setLoading(false); }
    } catch { /* cache illisible */ }

    // 2) Rafraîchit depuis le réseau ; ne bloque JAMAIS sur échec.
    setLoading((l) => (data ? false : l));
    fetchGroupData(schoolId, { yearLabel: year })
      .then((d) => {
        if (!alive) return;
        setData(d); setOffline(false); setLoading(false);
        // Ne met en cache que des données réelles (évite d'écraser par du vide hors-ligne).
        if (d && (d.budgets?.length || d.expenses?.length || d.chapters?.length)) {
          try { localStorage.setItem(cacheKey, JSON.stringify(d)); } catch { /* quota */ }
        }
      })
      .catch(() => { if (alive) { setOffline(true); setLoading(false); } });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId, year]);

  const startMonth = school?.school_year_start_month || DEFAULT_SCHOOL_YEAR_START_MONTH;
  const bounds = useMemo(() => budgetPeriodBounds({ academic_year: year, period_type: 'annuel' }, startMonth), [year, startMonth]);
  const pos = useMemo(() => exercisePosition(bounds, new Date()), [bounds]);
  const f = pos.fraction;
  const g = useMemo(() => data ? globalBudget(data.budgets, data.chapters, data.expenses) : null, [data]);
  const fc = useMemo(() => g ? forecast(g, f) : null, [g, f]);
  const ff = useMemo(() => feeForecast(fees, f), [fees, f]);
  const top = useMemo(() => data ? topExpenseChapters(data.chapters, data.expenses) : [], [data]);

  if (loading) {
    return <Layout><div className="text-gray-400 text-sm py-24 text-center animate-pulse">{t('Chargement…', 'Loading…', 'Cargando…')}</div></Layout>;
  }
  if (!g) {
    return <Layout><div className="max-w-md mx-auto py-24 text-center text-gray-500">
      <div className="text-3xl mb-2">📡</div>
      <p className="font-semibold text-gray-700">{t('Données indisponibles hors-ligne', 'Data unavailable offline', 'Datos no disponibles sin conexión')}</p>
      <p className="text-sm mt-1">{t('Cette vue lit les budgets en ligne. Reconnectez-vous, ou utilisez l’édition LAN pour un accès hors-ligne complet.', 'This view reads budgets online. Reconnect, or use the LAN edition for full offline access.', 'Esta vista lee en línea. Reconéctese o use la edición LAN.')}</p>
    </div></Layout>;
  }

  const secLabel = (s) => t(...(SECTOR_LABELS[s] || [s]));
  const sectorDonut = g.bySector.map((s, i) => ({ label: secLabel(s.sector), value: s.engage, color: PALETTE[i % PALETTE.length] }));

  return (
    <Layout>
      <div className="max-w-6xl mx-auto">
        <div className="mb-5">
          <h1 className="text-2xl font-bold text-gray-900">{t('Budget global', 'Global budget', 'Presupuesto global')}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {school?.name || ''} · {periodDatesLabel({ academic_year: year, period_type: 'annuel' }, startMonth) || year || '—'} ·{' '}
            {pos.state === 'before'
              ? <span className="text-amber-600 font-semibold">{t('Exercice à venir', 'Upcoming exercise', 'Ejercicio por comenzar')}</span>
              : pos.state === 'ended'
                ? <span className="text-rose-600 font-semibold">{t('Exercice terminé — en attente de clôture', 'Exercise ended — awaiting closure', 'Ejercicio terminado — pendiente de cierre')}</span>
                : <span className="text-indigo-600 font-semibold">{fc.elapsed}% {t('de l’année écoulée', 'of year elapsed', 'del año')}</span>}
          </p>
          {offline && (
            <span className="inline-block mt-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
              📡 {t('Hors-ligne — dernières données connues', 'Offline — last known data', 'Sin conexión — últimos datos')}
            </span>
          )}
        </div>

        {/* Tuiles en dégradé */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          <Tile grad="from-emerald-500 to-teal-600" label={t('Recettes prévues', 'Planned revenue', 'Ingresos')} value={money(g.recettes)} />
          <Tile grad="from-indigo-500 to-violet-600" label={t('Dépenses prévues', 'Planned expenses', 'Gastos')} value={money(g.depensesPrevues)} />
          <Tile grad="from-amber-500 to-orange-600" label={t('Engagé', 'Committed', 'Comprometido')} value={money(g.engage)} />
          <Tile grad={g.solde < 0 ? 'from-rose-500 to-red-600' : 'from-sky-500 to-blue-600'} label={t('Solde prévisionnel', 'Forecast balance', 'Saldo')} value={money(g.solde)} />
        </div>

        {/* Trésorerie : distinguer l'ENGAGÉ (validé, va sortir) du PAYÉ (déjà décaissé). */}
        <div className="bg-white rounded-2xl border border-gray-200 p-4 mb-5">
          <div className="grid grid-cols-3 gap-3 text-center">
            <Mini label={t('Engagé (validé)', 'Committed (approved)', 'Comprometido (validado)')} value={money(g.engage)} tone="text-amber-600" />
            <Mini label={t('Payé (décaissé)', 'Paid (disbursed)', 'Pagado (desembolsado)')} value={money(g.paid)} tone="text-emerald-700" />
            <Mini label={t('À payer', 'To pay', 'Por pagar')} value={money(g.aPayer)} tone="text-gray-800" />
          </div>
          <p className="text-[10px] text-gray-400 text-center mt-2">
            {t('« Engagé » inclut les dépenses validées non encore payées ; « À payer » = engagé − payé.',
               '“Committed” includes approved expenses not yet paid; “To pay” = committed − paid.',
               '«Comprometido» incluye gastos validados aún no pagados; «Por pagar» = comprometido − pagado.')}
          </p>
        </div>

        {/* Hero : jauge d'exécution + donut secteurs + prévision */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
          <div className="bg-white rounded-2xl border border-gray-200 p-5 flex flex-col items-center justify-center">
            <RadialGauge value={g.executionRate} label={t('Exécution', 'Execution', 'Ejecución')} size={150} />
            <div className="mt-3 w-full">
              <div className="flex justify-between text-xs text-gray-500 mb-1"><span>{t('Reste', 'Remaining', 'Restante')}</span><span className="font-semibold text-gray-800">{money(g.reste)}</span></div>
              <ProgressBar value={g.executionRate} marker={fc.elapsed} danger={fc.overspendRisk} />
              <div className="text-[10px] text-gray-400 mt-1">{t('Repère : temps écoulé', 'Marker: time elapsed', 'Marca: tiempo')} ({fc.elapsed}%)</div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 p-5 flex items-center gap-4">
            <Donut data={sectorDonut.length ? sectorDonut : [{ label: '—', value: 1, color: '#e5e7eb' }]}
              center={money.amount(g.engage)} sub={t('engagé', 'committed', 'comprometido')} size={150} />
            <div className="flex-1 min-w-0">
              <h3 className="text-xs font-bold text-gray-400 uppercase mb-2">{t('Engagé par secteur', 'Committed by sector', 'Por sector')}</h3>
              <Legend data={sectorDonut} format={(v) => money.amount(v)} />
            </div>
          </div>

          <div className={`rounded-2xl p-5 text-white bg-gradient-to-br ${fc.overspendRisk ? 'from-rose-500 to-red-600' : fc.onTrack ? 'from-emerald-500 to-teal-600' : 'from-amber-500 to-orange-600'}`}>
            <h3 className="text-xs font-bold uppercase tracking-wide opacity-90 mb-1">{t('Prévision fin d’année', 'Year-end forecast', 'Previsión')}</h3>
            <div className="text-2xl font-bold">{money(fc.projectedSpend)}</div>
            <div className="text-xs opacity-90 mb-3">{t('dépense projetée', 'projected spend', 'gasto proyectado')}</div>
            <Row2 label={t('Solde projeté', 'Projected balance', 'Saldo proy.')} value={money(fc.projectedBalance)} />
            <Row2 label={t('Rythme mensuel', 'Monthly burn', 'Ritmo mensual')} value={money(fc.burnMonthly)} />
            <div className="mt-3 text-xs font-semibold bg-white/20 rounded-lg px-2 py-1 inline-block">
              {fc.overspendRisk ? '⚠ ' + t('Risque de dépassement', 'Overspend risk', 'Riesgo de exceso') : fc.onTrack ? '✓ ' + t('Dans les clous', 'On track', 'En línea') : '● ' + t('À surveiller', 'Watch', 'Vigilar')}
            </div>
          </div>
        </div>

        {/* Recouvrement des frais */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-gray-800">{t('Recouvrement des frais scolaires', 'Fee collection', 'Cobro de tasas')}</h3>
            <span className="text-xs font-semibold text-gray-500">{ff.rate}% {t('recouvré', 'collected', 'cobrado')}</span>
          </div>
          <ProgressBar value={ff.rate} marker={fc.elapsed} color="bg-emerald-500" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 text-center">
            <Mini label={t('Encaissé', 'Collected', 'Cobrado')} value={money(ff.collected)} tone="text-emerald-700" />
            <Mini label={t('Attendu', 'Expected', 'Esperado')} value={money(ff.expected)} />
            <Mini label={t('Recouvrement projeté', 'Projected', 'Proyectado')} value={money(ff.projectedCollection)} />
            <Mini label={t('Manque à gagner', 'Shortfall', 'Déficit')} value={money(ff.projectedShortfall)} tone={ff.projectedShortfall > 0 ? 'text-rose-600' : 'text-emerald-700'} />
          </div>
        </div>

        {/* Exécution par secteur */}
        {g.bySector.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-5">
            <h3 className="text-sm font-bold text-gray-800 mb-3">{t('Exécution par secteur', 'Execution by sector', 'Ejecución por sector')}</h3>
            <div className="space-y-3">
              {g.bySector.map((s, i) => (
                <div key={s.sector}>
                  <div className="flex justify-between text-xs text-gray-600 mb-1">
                    <span className="font-medium">{secLabel(s.sector)}</span>
                    <span className="tabular-nums">{money(s.engage)} / {money(s.depensesPrevues)} · <b className={s.rate > 100 ? 'text-rose-600' : 'text-gray-700'}>{s.rate}%</b></span>
                  </div>
                  <ProgressBar value={s.rate} marker={fc.elapsed} danger={s.rate > 100} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Top postes de dépense */}
        {top.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-3 text-sm font-bold text-gray-800 border-b border-gray-100">{t('Top postes de dépense', 'Top expense lines', 'Principales partidas')}</div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-400 text-xs"><tr>
                <th className="text-left px-5 py-2 font-semibold">{t('Chapitre', 'Chapter', 'Capítulo')}</th>
                <th className="text-right px-4 py-2 font-semibold">{t('Prévu', 'Planned', 'Previsto')}</th>
                <th className="text-right px-4 py-2 font-semibold">{t('Engagé', 'Committed', 'Comprom.')}</th>
                <th className="text-right px-4 py-2 font-semibold">{t('Variance', 'Variance', 'Variación')}</th>
                <th className="text-left px-4 py-2 font-semibold w-32">{t('Taux', 'Rate', 'Tasa')}</th>
              </tr></thead>
              <tbody>{top.map((r) => (
                <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50/50">
                  <td className="px-5 py-2 font-medium text-gray-800">{r.label}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-gray-600">{money(r.planned)}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-amber-600">{money(r.engage)}</td>
                  <td className={`px-4 py-2 text-right tabular-nums ${r.variance < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>{money(r.variance)}</td>
                  <td className="px-4 py-2"><div className="flex items-center gap-2"><ProgressBar value={r.rate} danger={r.rate > 100} /><span className="text-xs text-gray-500 w-9 text-right">{r.rate}%</span></div></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>
    </Layout>
  );
}

function Tile({ grad, label, value }) {
  return (
    <div className={`rounded-2xl p-4 text-white bg-gradient-to-br ${grad} shadow-sm`}>
      <div className="text-[11px] font-semibold uppercase tracking-wide opacity-90">{label}</div>
      <div className="text-xl font-bold mt-1 truncate">{value}</div>
    </div>
  );
}
function Row2({ label, value }) {
  return <div className="flex justify-between text-sm py-0.5"><span className="opacity-90">{label}</span><span className="font-semibold">{value}</span></div>;
}
function Mini({ label, value, tone = 'text-gray-800' }) {
  return <div><div className={`text-base font-bold ${tone}`}>{value}</div><div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{label}</div></div>;
}
