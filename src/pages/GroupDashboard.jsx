// Tableau de bord du GROUPE SCOLAIRE — vue consolidée pour le Coordonnateur
// Général et la Fondatrice : finances, RH, discipline, académique, budgets,
// dépenses, alertes. Lecture seule, agrège les modules existants (aucune table).
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import { useSchoolStore } from '../store/schoolStore';
import { useAuthStore } from '../store/authStore';
import { useT } from '../lib/i18n';
import { useMoney } from '../lib/useMoney';
import { consolidate } from '../lib/groupStatsEngine';
import { fetchGroupData } from '../lib/groupDashboardService';
import { fetchUserGovernanceRoles } from '../governance/governanceService';
import { SECTOR_LABELS } from '../components/budgets/budgetUi';

const ALERT_COLOR = {
  critical: 'border-rose-400 bg-rose-50 text-rose-700',
  high:     'border-amber-400 bg-amber-50 text-amber-700',
  normal:   'border-blue-300 bg-blue-50 text-blue-700',
};

export default function GroupDashboard() {
  const t = useT();
  const money = useMoney();
  const school = useAuthStore((s) => s.school);
  const role = useAuthStore((s) => s.role);
  const userId = useAuthStore((s) => s.user?.id);
  const schoolId = school?.id;
  const year = school?.current_year || '';

  const fees = useSchoolStore((s) => s.fees);
  const students = useSchoolStore((s) => s.students);
  const classes = useSchoolStore((s) => s.classes);
  const staff = useSchoolStore((s) => s.staff);
  const units = useSchoolStore((s) => s.schoolUnits);

  const [remote, setRemote] = useState(null);
  const [govRoles, setGovRoles] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!schoolId) { setLoading(false); return; }
    let alive = true;
    const cacheKey = `nc_groupdash_${schoolId}_${year}`;
    // Cache immédiat (offline-lite) puis rafraîchissement non bloquant.
    try { const c = JSON.parse(localStorage.getItem(cacheKey) || 'null'); if (c) { setRemote(c); setLoading(false); } } catch { /* ignore */ }
    (async () => {
      try {
        const [data, gr] = await Promise.all([
          fetchGroupData(schoolId, { yearLabel: year }),
          userId ? fetchUserGovernanceRoles(schoolId, userId) : Promise.resolve([]),
        ]);
        if (!alive) return;
        setRemote(data); setGovRoles((gr || []).map((x) => x.role));
        if (data && (data.budgets?.length || data.expenses?.length || data.reports?.length)) {
          try { localStorage.setItem(cacheKey, JSON.stringify(data)); } catch { /* quota */ }
        }
      } catch { /* hors-ligne : on garde le cache */ }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [schoolId, year, userId]);

  const stats = useMemo(() => remote ? consolidate({
    fees, students, classes, staff, units, ...remote,
  }) : null, [remote, fees, students, classes, staff, units]);

  // Audience : direction générale (admin, ou rôle Coordonnateur/Fondatrice).
  const isGeneralDirection = role === 'admin'
    || govRoles.some((r) => r === 'fondatrice' || r === 'coordonnateur_general');

  if (loading) {
    return <Layout><div className="text-gray-400 text-sm py-20 text-center animate-pulse">{t('Chargement…', 'Loading…', 'Cargando…')}</div></Layout>;
  }
  if (!stats) {
    return <Layout><div className="max-w-md mx-auto py-24 text-center text-gray-500">
      <div className="text-3xl mb-2">📡</div>
      <p className="font-semibold text-gray-700">{t('Données indisponibles hors-ligne', 'Data unavailable offline', 'Datos no disponibles sin conexión')}</p>
      <p className="text-sm mt-1">{t('Reconnectez-vous, ou utilisez l’édition LAN pour un accès hors-ligne complet.', 'Reconnect, or use the LAN edition.', 'Reconéctese o use la edición LAN.')}</p>
    </div></Layout>;
  }

  const { finance, budget, expense, hr, academic, discipline, alerts } = stats;

  return (
    <Layout>
      <div className="max-w-6xl mx-auto">
        <div className="mb-5">
          <h1 className="text-xl font-bold text-gray-900">{t('Tableau de bord du groupe', 'Group dashboard', 'Panel del grupo')}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {school?.name || ''} · {year || '—'}
            {isGeneralDirection && <span className="ml-2 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">{t('Direction générale', 'General direction', 'Dirección general')}</span>}
          </p>
        </div>

        {/* Alertes */}
        {alerts.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 mb-5">
            {alerts.map((a) => (
              <Link key={a.key} to={a.link} className={`border-l-4 rounded-lg px-3 py-2 text-sm ${ALERT_COLOR[a.severity] || ALERT_COLOR.normal}`}>
                <div className="font-bold text-lg">{a.count}</div>
                <div className="text-xs font-semibold">{a.label}</div>
              </Link>
            ))}
          </div>
        )}

        {/* Domaines */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Card title={t('Finances', 'Finance', 'Finanzas')} to="/app/fees">
            <Row label={t('Encaissé', 'Collected', 'Cobrado')} value={money(finance.collected)} />
            <Row label={t('Restant dû', 'Outstanding', 'Pendiente')} value={money(finance.outstanding)} tone="text-rose-600" />
            <Bar pct={finance.rate} />
            <div className="text-xs text-gray-400 mt-1">{finance.rate}% {t('recouvré', 'collected', 'cobrado')}</div>
          </Card>

          <Card title={t('Budgets', 'Budgets', 'Presupuestos')} to="/app/budgets">
            <Row label={t('Budgets', 'Budgets', 'Presupuestos')} value={budget.count} />
            <Row label={t('Dépenses prévues', 'Planned', 'Previsto')} value={money(budget.depensesPrevues)} />
            <Row label={t('Recettes prévues', 'Planned revenue', 'Ingresos previstos')} value={money(budget.recettes)} tone="text-emerald-700" />
          </Card>

          <Card title={t('Dépenses', 'Expenses', 'Gastos')} to="/app/depenses">
            <Row label={t('Engagé', 'Committed', 'Comprometido')} value={money(expense.engage)} tone="text-amber-600" />
            <Row label={t('Reste', 'Remaining', 'Restante')} value={money(expense.reste)} tone={expense.reste < 0 ? 'text-rose-600' : 'text-emerald-700'} />
            <Bar pct={expense.rate} danger={expense.overBudget > 0} />
            <div className="text-xs text-gray-400 mt-1">{expense.rate}% · {expense.overBudget} {t('dépassement(s)', 'over budget', 'excedidos')}</div>
          </Card>

          <Card title={t('Ressources humaines', 'HR', 'RRHH')} to="/app/rh">
            <Row label={t('Effectif', 'Headcount', 'Plantilla')} value={hr.staffCount} />
            <Row label={t('Contrats actifs', 'Active contracts', 'Contratos activos')} value={hr.activeContracts} />
            <Row label={t('Congés en attente', 'Pending leaves', 'Permisos pendientes')} value={hr.pendingLeaves} tone={hr.pendingLeaves ? 'text-amber-600' : ''} />
          </Card>

          <Card title={t('Académique', 'Academic', 'Académico')} to="/app/classes">
            <Row label={t('Élèves', 'Students', 'Alumnos')} value={academic.students} />
            <Row label={t('Classes', 'Classes', 'Clases')} value={academic.classes} />
            <Row label={t('Unités', 'Units', 'Unidades')} value={academic.units} />
          </Card>

          <Card title={t('Discipline', 'Discipline', 'Disciplina')} to="/app/signalements">
            <Row label={t('Signalements ouverts', 'Open reports', 'Reportes abiertos')} value={discipline.open} />
            <Row label={t('Vie scolaire', 'School life', 'Vida escolar')} value={discipline.vieScolaire} />
          </Card>
        </div>

        {/* Ventilation budgétaire par secteur */}
        {budget.bySector.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-5 mt-5">
            <h3 className="text-sm font-bold text-gray-800 mb-3">{t('Budget de dépenses par secteur', 'Expense budget by sector', 'Presupuesto por sector')}</h3>
            <div className="space-y-2">
              {budget.bySector.map((s) => {
                const pct = budget.depensesPrevues > 0 ? Math.round((s.planned / budget.depensesPrevues) * 100) : 0;
                return (
                  <div key={s.sector}>
                    <div className="flex justify-between text-xs text-gray-600 mb-0.5">
                      <span>{t(...(SECTOR_LABELS[s.sector] || [s.sector]))}</span>
                      <span className="tabular-nums">{money(s.planned)} · {pct}%</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}

function Card({ title, to, children }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-bold text-gray-800">{title}</h3>
        {to && <Link to={to} className="text-xs text-indigo-500 hover:text-indigo-700">→</Link>}
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}
function Row({ label, value, tone = 'text-gray-800' }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-gray-500">{label}</span>
      <span className={`font-semibold tabular-nums ${tone}`}>{value}</span>
    </div>
  );
}
function Bar({ pct, danger }) {
  return (
    <div className="h-2 bg-gray-100 rounded-full overflow-hidden mt-2">
      <div className={`h-full rounded-full ${danger ? 'bg-rose-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(100, pct || 0)}%` }} />
    </div>
  );
}
