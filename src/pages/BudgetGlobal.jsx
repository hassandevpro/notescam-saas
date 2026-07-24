// Dashboard BUDGET GLOBAL — modèle CIBLE V3 (E6). Drill-down annuel → rubrique →
// ligne, avec ventilation Par période / Par secteur concerné → dépenses. Lecture
// seule. Tous les chiffres viennent du moteur pur `budgetLinesEngine` (lignes +
// allocations + dépenses) — AUCUNE dépendance aux nœuds tier=period/sector legacy
// ni au champ plat `budgets.sector`.
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { useSchoolStore } from '../store/schoolStore';
import { useAuthStore } from '../store/authStore';
import { useT } from '../lib/i18n';
import { useMoney } from '../lib/useMoney';
import { fetchGroupData } from '../lib/groupDashboardService';
import { fetchSchoolUnits } from '../lib/schoolUnitService';
import {
  computeBudget, indexAllocations, isLine, annualConsumption, lineConsumption,
  periodTotals, sectorTotals, linePeriodConsumption, lineSectorConsumption, lineSectorIds,
} from '../lib/budgetLinesEngine';
import { forecast, feeForecast, exercisePosition } from '../lib/budgetAnalyticsEngine';
import { budgetPeriodBounds, periodDatesLabel, DEFAULT_SCHOOL_YEAR_START_MONTH } from '../lib/budgetEngine';
import { ANNUAL_STATUS_UI, SCOPE_UI, UNIT_SECTION_LABELS } from '../components/budgets/budgetUi';
import { unitLabel } from '../components/budgets/BudgetHierarchyModals';
import { RadialGauge, ProgressBar } from '../components/charts/Charts';
import { coveredSectors } from '../governance/governanceEngine';
import { catalogOrDefault } from '../governance/defaultCatalog';

const SECTOR_ALIASES = { college: ['college', 'premier_cycle'], lycee: ['lycee', 'second_cycle'], premier_cycle: ['premier_cycle', 'college'], second_cycle: ['second_cycle', 'lycee'] };
function unitCovered(covered, sectionKey) {
  if (covered == null) return true;
  if (!sectionKey) return false;
  return covered.some((c) => c === sectionKey || (SECTOR_ALIASES[c] || [c]).includes(sectionKey));
}

export default function BudgetGlobal() {
  const t = useT();
  const money = useMoney();
  const navigate = useNavigate();
  const school = useAuthStore((s) => s.school);
  const role = useAuthStore((s) => s.role);
  const governanceCatalog = useAuthStore((s) => s.governanceCatalog);
  const assignments = useAuthStore((s) => s.governanceAssignments);
  const catalog = useMemo(() => catalogOrDefault(governanceCatalog), [governanceCatalog]);
  const fees = useSchoolStore((s) => s.fees);
  const schoolId = school?.id;
  const year = school?.current_year || '';
  const startMonth = school?.school_year_start_month || DEFAULT_SCHOOL_YEAR_START_MONTH;
  const covered = useMemo(() => coveredSectors(role, catalog, assignments), [role, catalog, assignments]);

  const [data, setData] = useState(null);
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [nav, setNav] = useState({ rubriqueId: null, lineId: null });

  useEffect(() => {
    if (!schoolId) { setLoading(false); return; }
    let alive = true;
    const cacheKey = `notescam_budgetglobal_v3_${schoolId}_${year}`;
    try { const c = JSON.parse(localStorage.getItem(cacheKey) || 'null'); if (c) { setData(c.data); setUnits(c.units || []); setLoading(false); } } catch { /* cache */ }
    Promise.all([fetchGroupData(schoolId, { yearLabel: year }), fetchSchoolUnits(schoolId)])
      .then(([d, u]) => {
        if (!alive) return;
        setData(d); setUnits(u || []); setOffline(false); setLoading(false);
        if (d && (d.budgets?.length || d.expenses?.length)) { try { localStorage.setItem(cacheKey, JSON.stringify({ data: d, units: u || [] })); } catch { /* quota */ } }
      })
      .catch(() => { if (alive) { setOffline(true); setLoading(false); } });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId, year]);

  const budgets = data?.budgets || [];
  const expenses = data?.expenses || [];
  const linePeriods = data?.linePeriods || [];
  const lineSectors = data?.lineSectors || [];
  const periods = data?.periods || [];
  const annual = useMemo(() => budgets.find((b) => b.tier === 'annual') || null, [budgets]);
  const annualChapters = useMemo(() => (annual ? (data?.chapters || []).filter((c) => c.budget_id === annual.id) : []), [data, annual]);
  const idx = useMemo(() => indexAllocations(linePeriods, lineSectors), [linePeriods, lineSectors]);
  const model = useMemo(() => (annual ? computeBudget(annual, annualChapters, { periodAllocs: linePeriods, sectorAllocs: lineSectors, periods, expenses }) : null), [annual, annualChapters, linePeriods, lineSectors, periods, expenses]);
  const chapterById = useMemo(() => new Map(annualChapters.map((c) => [c.id, c])), [annualChapters]);

  const visibleUnits = useMemo(() => units.filter((u) => unitCovered(covered, u.section_key)), [units, covered]);

  const bounds = useMemo(() => budgetPeriodBounds({ academic_year: year, period_type: 'annuel' }, startMonth), [year, startMonth]);
  const pos = useMemo(() => exercisePosition(bounds, new Date()), [bounds]);
  const g = model?.annual.consumption || null;
  const fc = useMemo(() => (g ? forecast({ engage: g.committed, depensesPrevues: g.ceiling, executionRate: g.taux }, pos.fraction) : null), [g, pos.fraction]);
  const ff = useMemo(() => feeForecast(fees, pos.fraction), [fees, pos.fraction]);

  if (loading) return <Layout><div className="text-gray-400 text-sm py-24 text-center animate-pulse">{t('Chargement…', 'Loading…', 'Cargando…')}</div></Layout>;

  if (!annual || !model) return (
    <Layout><div className="max-w-md mx-auto py-24 text-center text-gray-500">
      <div className="text-3xl mb-2">{offline ? '📡' : '🗂️'}</div>
      <p className="font-semibold text-gray-700">{offline ? t('Données indisponibles hors-ligne', 'Data unavailable offline', 'Sin conexión') : t('Aucun budget annuel pour cette année', 'No annual budget for this year', 'Ningún presupuesto anual')}</p>
      <p className="text-sm mt-1">{offline ? t('Reconnectez-vous pour consulter le budget.', 'Reconnect to view the budget.', 'Reconéctese.') : t('Créez le budget annuel dans la page Budgets.', 'Create the annual budget in the Budgets page.', 'Cree el presupuesto anual.')}</p>
    </div></Layout>
  );

  // Navigation
  const rubrique = nav.rubriqueId ? model.tree.find((n) => n.id === nav.rubriqueId) : null;
  const lineNode = nav.lineId ? (rubrique?.children || model.tree).find((n) => n.id === nav.lineId) : null;
  const level = lineNode ? 'line' : rubrique ? 'rubrique' : 'annual';

  // Lignes du périmètre courant (pour les ventilations période/secteur).
  const scopeLines = level === 'annual'
    ? annualChapters.filter(isLine)
    : level === 'rubrique'
      ? (rubrique.children || []).map((c) => chapterById.get(c.id)).filter(Boolean)
      : lineNode ? [chapterById.get(lineNode.id)].filter(Boolean) : [];

  const summaryNode = level === 'annual'
    ? { label: annual.label, status: model.annual.status, c: g }
    : level === 'rubrique'
      ? { label: rubrique.label, status: null, c: rubrique.consumption }
      : { label: lineNode.label, status: lineNode.status, c: lineNode.consumption, scope: lineNode.scope };

  // Ventilations
  const periodRows = periods.map((p) => ({ label: p.name, c: periodTotals(scopeLines, p.id, idx, { expenses }) })).filter((r) => r.c.ceiling > 0);
  const sectorRows = visibleUnits.map((u) => ({ label: unitLabel(t, u), c: sectorTotals(scopeLines, u.id, idx, { expenses }) })).filter((r) => r.c.ceiling > 0);
  const lineCellsPeriod = level === 'line' && lineNode
    ? periods.filter((p) => (idx.byLinePeriod.get(lineNode.id) || []).some((a) => a.budget_period_id === p.id))
        .map((p) => ({ label: p.name, c: linePeriodConsumption(chapterById.get(lineNode.id), p.id, idx, { expenses }) }))
    : [];
  const lineCellsSector = level === 'line' && lineNode?.scope === 'sectors' ? visibleUnits.filter((u) => lineSectorIds(lineNode.id, idx).has(u.id)).map((u) => ({ label: unitLabel(t, u), c: lineSectorConsumption(chapterById.get(lineNode.id), u.id, idx, { expenses }) })) : [];

  return (
    <Layout>
      <div className="max-w-6xl mx-auto">
        {covered && (
          <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 px-4 py-2 text-sm text-amber-800">
            🔒 {t('Ventilation sectorielle limitée à votre secteur', 'Sector breakdown limited to your sector', 'Vista limitada a su sector')} : <span className="font-semibold">{covered.map((s) => t(...(UNIT_SECTION_LABELS[s] || [s]))).join(', ')}</span>
          </div>
        )}
        <div className="mb-4">
          <h1 className="text-2xl font-bold text-gray-900">{t('Budget global', 'Global budget', 'Presupuesto global')}</h1>
          <p className="text-sm text-gray-500 mt-1">{school?.name || ''} · {periodDatesLabel({ academic_year: year, period_type: 'annuel' }, startMonth) || year || '—'}
            {offline && <span className="ml-2 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">📡 {t('Hors-ligne', 'Offline', 'Sin conexión')}</span>}</p>
        </div>

        {/* Fil d'Ariane */}
        <nav className="flex items-center gap-1.5 text-sm mb-4 flex-wrap">
          <Crumb active={level === 'annual'} onClick={() => setNav({ rubriqueId: null, lineId: null })}>{t('Budget annuel', 'Annual budget', 'Presupuesto anual')}</Crumb>
          {rubrique && (<><span className="text-gray-300">/</span><Crumb active={level === 'rubrique'} onClick={() => setNav({ rubriqueId: rubrique.id, lineId: null })}>{rubrique.label}</Crumb></>)}
          {lineNode && (<><span className="text-gray-300">/</span><Crumb active>{lineNode.label}</Crumb></>)}
        </nav>

        {/* Synthèse du niveau courant */}
        <Summary node={summaryNode} money={money} t={t}
          tierLabel={level === 'annual' ? t('Budget annuel', 'Annual budget', 'Presupuesto anual') : level === 'rubrique' ? t('Rubrique', 'Category', 'Rúbrica') : t('Ligne', 'Line', 'Línea')} />

        {/* Niveau annuel : prévision + recouvrement */}
        {level === 'annual' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
            <div className="bg-white rounded-2xl border border-gray-200 p-5 flex flex-col items-center justify-center">
              <RadialGauge value={g.taux} label={t('Exécution', 'Execution', 'Ejecución')} size={150} />
              <div className="mt-3 w-full">
                <div className="flex justify-between text-xs text-gray-500 mb-1"><span>{t('Disponible', 'Available', 'Disponible')}</span><span className="font-semibold text-gray-800">{money(g.available)}</span></div>
                <ProgressBar value={g.taux} marker={fc?.elapsed} danger={g.depassement || fc?.overspendRisk} />
                <div className="text-[10px] text-gray-400 mt-1">{t('Repère : temps écoulé', 'Marker: time elapsed', 'Marca: tiempo')} ({fc?.elapsed}%)</div>
              </div>
            </div>
            <div className={`rounded-2xl p-5 text-white bg-gradient-to-br ${fc?.overspendRisk ? 'from-rose-500 to-red-600' : fc?.onTrack ? 'from-emerald-500 to-teal-600' : 'from-amber-500 to-orange-600'}`}>
              <h3 className="text-xs font-bold uppercase tracking-wide opacity-90 mb-1">{t('Prévision fin d’année', 'Year-end forecast', 'Previsión')}</h3>
              <div className="text-2xl font-bold">{money(fc?.projectedSpend || 0)}</div>
              <div className="text-xs opacity-90 mb-3">{t('dépense projetée', 'projected spend', 'gasto proyectado')}</div>
              <Row2 label={t('Solde projeté', 'Projected balance', 'Saldo proy.')} value={money(fc?.projectedBalance || 0)} />
              <Row2 label={t('Rythme mensuel', 'Monthly burn', 'Ritmo mensual')} value={money(fc?.burnMonthly || 0)} />
              <div className="mt-3 text-xs font-semibold bg-white/20 rounded-lg px-2 py-1 inline-block">{fc?.overspendRisk ? '⚠ ' + t('Risque de dépassement', 'Overspend risk', 'Riesgo') : fc?.onTrack ? '✓ ' + t('Dans les clous', 'On track', 'En línea') : '● ' + t('À surveiller', 'Watch', 'Vigilar')}</div>
            </div>
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-2"><h3 className="text-sm font-bold text-gray-800">{t('Recouvrement des frais', 'Fee collection', 'Cobro')}</h3><span className="text-xs font-semibold text-gray-500">{ff.rate}%</span></div>
              <ProgressBar value={ff.rate} color="bg-emerald-500" />
              <div className="grid grid-cols-2 gap-2 mt-3 text-center"><Mini label={t('Encaissé', 'Collected', 'Cobrado')} value={money(ff.collected)} tone="text-emerald-700" /><Mini label={t('Attendu', 'Expected', 'Esperado')} value={money(ff.expected)} /></div>
            </div>
          </div>
        )}

        {/* Ventilations Par période / Par secteur (du périmètre courant) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
          <CellTable title={t('Par période', 'By period', 'Por período')} rows={periodRows} money={money} t={t} />
          <CellTable title={t('Par secteur', 'By sector', 'Por sector')} rows={sectorRows} money={money} t={t} />
        </div>

        {/* Enfants du niveau : rubriques / lignes */}
        {level === 'annual' && (
          <ChildList title={t('Rubriques', 'Categories', 'Rúbricas')} items={model.tree}
            money={money} t={t} onOpen={(n) => n.isLine ? setNav({ rubriqueId: null, lineId: n.id }) : setNav({ rubriqueId: n.id, lineId: null })} />
        )}
        {level === 'rubrique' && (
          <ChildList title={t('Lignes', 'Lines', 'Líneas')} items={rubrique.children}
            money={money} t={t} onOpen={(n) => setNav({ rubriqueId: rubrique.id, lineId: n.id })} scopeChip />
        )}
        {level === 'line' && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <CellTable title={t('Cette ligne · par période', 'This line · by period', 'Por período')} rows={lineCellsPeriod} money={money} t={t} />
              {lineNode.scope === 'sectors' && <CellTable title={t('Cette ligne · par secteur', 'This line · by sector', 'Por sector')} rows={lineCellsSector} money={money} t={t} />}
            </div>
            <button onClick={() => navigate(`/app/depenses?budget=${lineNode.id}`)} className="mt-4 text-sm font-semibold text-indigo-600 hover:text-indigo-800">💳 {t('Voir les dépenses de cette ligne', 'View this line’s expenses', 'Ver gastos')} →</button>
          </>
        )}
      </div>
    </Layout>
  );
}

function Crumb({ active, onClick, children }) {
  return <button onClick={onClick} disabled={active || !onClick} className={`px-1 ${active ? 'font-bold text-gray-900' : 'text-indigo-600 hover:text-indigo-800'}`}>{children}</button>;
}
function Summary({ node, tierLabel, money, t }) {
  if (!node?.c) return null;
  const c = node.c; const blocked = c.depassement;
  const statusUi = node.status ? (ANNUAL_STATUS_UI[node.status] || null) : null;
  return (
    <div className={`bg-white rounded-2xl border p-5 mb-5 ${blocked ? 'border-rose-300' : 'border-gray-200'}`}>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{tierLabel}</span>
        {statusUi && <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${statusUi.color}`}>{t(...statusUi.label)}</span>}
        {node.scope && <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${(SCOPE_UI[node.scope] || SCOPE_UI.complex).color}`}>{t(...(SCOPE_UI[node.scope] || SCOPE_UI.complex).label)}</span>}
        <h2 className="font-bold text-gray-900 text-lg ml-1">{node.label}</h2>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-center">
        <Tile grad="from-indigo-500 to-violet-600" label={t('Prévu', 'Planned', 'Previsto')} value={money(c.ceiling)} />
        <Tile grad="from-amber-500 to-orange-600" label={t('Engagé', 'Committed', 'Comprometido')} value={money(c.committed)} />
        <Tile grad="from-emerald-500 to-teal-600" label={t('Payé', 'Paid', 'Pagado')} value={money(c.paid)} />
        <Tile grad={blocked ? 'from-rose-500 to-red-600' : 'from-sky-500 to-blue-600'} label={t('Disponible', 'Available', 'Disponible')} value={money(c.available)} />
        <Tile grad="from-slate-500 to-slate-700" label={t('Exécution', 'Execution', 'Ejecución')} value={`${c.taux}%`} />
      </div>
      {blocked && <p className="text-xs text-rose-600 mt-2 font-semibold">⚠ {t('Dépassement — enveloppe insuffisante.', 'Overrun — envelope exceeded.', 'Excedido.')}</p>}
    </div>
  );
}
function ChildList({ title, items, money, t, onOpen, scopeChip }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100"><h3 className="text-sm font-bold text-gray-800">{title}</h3></div>
      {(!items || items.length === 0) ? <p className="text-sm text-gray-400 py-10 text-center">{t('Rien à afficher.', 'Nothing to show.', 'Nada.')}</p> : (
        <ul className="divide-y divide-gray-100">
          {items.map((it) => {
            const c = it.consumption;
            return (
              <li key={it.id}>
                <button onClick={() => onOpen(it)} className="w-full text-left px-5 py-3 hover:bg-gray-50/70 transition-colors">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-900 truncate">{it.label}</span>
                        {scopeChip && it.scope && <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${(SCOPE_UI[it.scope] || SCOPE_UI.complex).color}`}>{t(...(SCOPE_UI[it.scope] || SCOPE_UI.complex).label)}</span>}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5 tabular-nums">{t('Prévu', 'Planned', 'Previsto')} {money(c.ceiling)} · {t('Engagé', 'Committed', 'Comprom.')} {money(c.committed)} · {t('Dispo', 'Avail.', 'Disp.')} <b className={c.available < 0 ? 'text-rose-600' : 'text-sky-700'}>{money(c.available)}</b></div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 w-44"><div className="flex-1"><ProgressBar value={c.taux} danger={c.depassement} /></div><span className={`text-xs tabular-nums w-10 text-right ${c.depassement ? 'text-rose-600 font-semibold' : 'text-gray-500'}`}>{c.taux}%</span></div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
function CellTable({ title, rows, money, t }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-100 text-sm font-bold text-gray-800">{title}</div>
      {(!rows || rows.length === 0) ? <p className="text-xs text-gray-400 py-4 text-center">{t('Aucune donnée.', 'No data.', 'Sin datos.')}</p> : (
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-400 text-[11px]"><tr><th className="text-left px-4 py-1.5 font-semibold">{t('Poste', 'Item', 'Ítem')}</th><th className="text-right px-3 py-1.5 font-semibold">{t('Alloué', 'Allocated', 'Asignado')}</th><th className="text-right px-3 py-1.5 font-semibold">{t('Engagé', 'Committed', 'Comprom.')}</th><th className="text-right px-4 py-1.5 font-semibold">{t('Dispo', 'Avail.', 'Disp.')}</th></tr></thead>
          <tbody>{rows.map((r, i) => (
            <tr key={i} className="border-t border-gray-100"><td className="px-4 py-1.5 text-gray-700 truncate">{r.label}</td><td className="px-3 py-1.5 text-right tabular-nums text-gray-600">{money(r.c.ceiling)}</td><td className="px-3 py-1.5 text-right tabular-nums text-amber-600">{money(r.c.committed)}</td><td className={`px-4 py-1.5 text-right tabular-nums ${r.c.available < 0 ? 'text-rose-600' : 'text-sky-700'}`}>{money(r.c.available)}</td></tr>
          ))}</tbody>
        </table>
      )}
    </div>
  );
}
function Tile({ grad, label, value }) { return <div className={`rounded-xl p-3 text-white bg-gradient-to-br ${grad}`}><div className="text-[10px] font-semibold uppercase tracking-wide opacity-90">{label}</div><div className="text-base font-bold mt-0.5 truncate">{value}</div></div>; }
function Row2({ label, value }) { return <div className="flex justify-between text-sm py-0.5"><span className="opacity-90">{label}</span><span className="font-semibold">{value}</span></div>; }
function Mini({ label, value, tone = 'text-gray-800' }) { return <div><div className={`text-base font-bold ${tone}`}>{value}</div><div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{label}</div></div>; }
