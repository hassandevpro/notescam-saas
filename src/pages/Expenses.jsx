// Module DÉPENSES — exécution budgétaire.
// Chaque dépense est rattachée à un budget ; le « budget restant » est recalculé
// automatiquement (planifié − engagé) à chaque changement. Statut piloté par
// l'admin (le circuit gouverné s'activera via le drapeau schools.budget_validation).
import { useEffect, useMemo, useState, useCallback } from 'react';
import Layout from '../components/Layout';
import { useAuthStore } from '../store/authStore';
import { useT } from '../lib/i18n';
import { useMoney } from '../lib/useMoney';
import { fetchBudgets, fetchBudgetChapters } from '../lib/budgetService';
import { fetchExpenses, upsertExpense, deleteExpense } from '../lib/expenseService';
import { fetchUnlockRequests, createUnlockRequest, decideUnlockRequest } from '../lib/unlockService';
import { budgetConsumption, canTransition, isExpenseLocked, EXPENSE_STATUSES, hierarchyRollup } from '../lib/expenseEngine';
import { periodLabel, SECTOR_LABELS, STATUS_UI as BUDGET_STATUS_UI } from '../components/budgets/budgetUi';
import { EXPENSE_STATUS_UI, TRANSITION_LABEL, UNLOCK_STATUS_UI } from '../components/expenses/expenseUi';
import ExpenseFormModal from '../components/expenses/ExpenseFormModal';
import ValidationRulesEditor from '../components/expenses/ValidationRulesEditor';
import UnlockRequestModal from '../components/expenses/UnlockRequestModal';
import UnlockDecisionModal from '../components/expenses/UnlockDecisionModal';
import { loadWithCache } from '../lib/offlineCache';
import { resolveValidatorRole } from '../governance/validationEngine';
import { getGovernanceRole } from '../governance/roles';
import { fetchUserGovernanceRoles } from '../governance/governanceService';

export default function Expenses() {
  const t = useT();
  const money = useMoney();
  const school = useAuthStore((s) => s.school);
  const role = useAuthStore((s) => s.role);
  const fullName = useAuthStore((s) => s.fullName);
  const userId = useAuthStore((s) => s.user?.id);
  const schoolId = school?.id;
  const activeYear = school?.current_year || '';
  const canManage = role === 'admin';

  const [budgets, setBudgets]     = useState([]);
  const [budgetId, setBudgetId]   = useState('');
  const [chapters, setChapters]   = useState([]);
  const [expenses, setExpenses]   = useState([]);
  const [requests, setRequests]   = useState([]);
  const [govRoles, setGovRoles]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [modal, setModal]         = useState(null);        // dépense
  const [rulesOpen, setRulesOpen] = useState(false);
  const [unlockReq, setUnlockReq] = useState(null);        // { chapter, amount } demande
  const [decision, setDecision]   = useState(null);        // { request } décision

  // Décideurs du déblocage : Coordonnateur Général ou Fondatrice (ou admin en repli).
  const canDecideUnlock = canManage
    || govRoles.some((r) => r === 'fondatrice' || r === 'coordonnateur_general');

  useEffect(() => {
    if (!schoolId || !userId) return;
    fetchUserGovernanceRoles(schoolId, userId).then((rs) => setGovRoles((rs || []).map((x) => x.role)));
  }, [schoolId, userId]);

  // Validateur requis pour un montant (moteur générique + barème de l'école).
  const requiredValidator = useCallback((amount) => {
    const roleId = resolveValidatorRole(school?.validation_rules, 'expense', amount);
    return roleId ? getGovernanceRole(roleId) : null;
  }, [school?.validation_rules]);

  const budget = budgets.find((b) => b.id === budgetId) || null;

  useEffect(() => {
    if (!schoolId) { setLoading(false); return; }
    (async () => {
      setLoading(true);
      const { rows } = await loadWithCache(`nc_budgets_${schoolId}_${activeYear}`, () => fetchBudgets(schoolId, { yearLabel: activeYear }));
      setBudgets(rows);
      setBudgetId((cur) => cur && rows.some((b) => b.id === cur) ? cur : (rows[0]?.id || ''));
      setLoading(false);
    })();
  }, [schoolId, activeYear]);

  const reload = useCallback(async (bid) => {
    if (!schoolId || !bid) { setChapters([]); setExpenses([]); setRequests([]); return; }
    const [ch, ex, rq] = await Promise.all([
      loadWithCache(`nc_chapters_${bid}`, () => fetchBudgetChapters(schoolId, { budgetId: bid })),
      loadWithCache(`nc_expenses_${bid}`, () => fetchExpenses(schoolId, { budgetId: bid })),
      loadWithCache(`nc_unlocks_${bid}`, () => fetchUnlockRequests(schoolId, { budgetId: bid })),
    ]);
    setChapters(ch.rows);
    setExpenses(ex.rows);
    setRequests(rq.rows);
  }, [schoolId]);

  useEffect(() => { reload(budgetId); }, [budgetId, reload]);

  const consumption = useMemo(() => budgetConsumption(chapters, expenses), [chapters, expenses]);
  const rollup = useMemo(() => hierarchyRollup(chapters, expenses), [chapters, expenses]);
  const chapterLabel = useMemo(() => {
    const m = new Map(chapters.map((c) => [c.id, c.label]));
    return (id) => (id ? (m.get(id) || '—') : '—');
  }, [chapters]);

  const saveExpense = async (data) => {
    const saved = await upsertExpense({ ...data, school_id: schoolId, created_by: data.created_by || fullName || '' });
    setModal(null);
    if (saved) await reload(budgetId);
  };

  const changeStatus = async (exp, to) => {
    if (!canTransition(exp.status, to)) return;
    const saved = await upsertExpense({ ...exp, status: to });
    if (saved) await reload(budgetId);
  };

  const removeExpense = async (exp) => {
    if (!window.confirm(t('Supprimer cette dépense ?', 'Delete this expense?', '¿Eliminar este gasto?'))) return;
    if (await deleteExpense(exp.id)) await reload(budgetId);
  };

  // — Déblocage de ligne épuisée —
  const submitUnlockRequest = async ({ requested_amount, reason, budget_chapter_id }) => {
    await createUnlockRequest({
      school_id: schoolId, budget_id: budgetId, budget_chapter_id,
      requested_amount, reason, requester: fullName || '', requested_by: userId || '',
    });
    setUnlockReq(null);
    await reload(budgetId);
  };

  const applyDecision = async (dec, { grantedAmount, note }) => {
    const req = decision.request;
    const decidedRole = govRoles.find((r) => r === 'fondatrice' || r === 'coordonnateur_general') || (canManage ? 'admin' : '');
    const chapter = chapters.find((c) => c.id === req.budget_chapter_id) || null;
    await decideUnlockRequest(req, dec, {
      grantedAmount, note, decidedBy: fullName || '', decidedById: userId || '', decidedRole, chapter,
    });
    setDecision(null);
    await reload(budgetId);
  };

  const pendingCount = requests.filter((r) => r.status === 'pending').length;

  const btn = 'px-3 py-1.5 text-sm font-semibold rounded-lg transition-colors';

  return (
    <Layout>
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{t('Dépenses', 'Expenses', 'Gastos')}</h1>
            <p className="text-sm text-gray-500 mt-1">{t('Exécution budgétaire', 'Budget execution', 'Ejecución presupuestaria')} — {activeYear || '—'}</p>
          </div>
          <div className="flex items-center gap-2">
            {budgets.length > 0 && (
              <select className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                value={budgetId} onChange={(e) => setBudgetId(e.target.value)}>
                {budgets.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.label} · {periodLabel(t, b)} · {t(...(SECTOR_LABELS[b.sector] || [b.sector]))}
                  </option>
                ))}
              </select>
            )}
            {canManage && (
              <button className={`${btn} text-gray-600 bg-gray-100 hover:bg-gray-200`}
                onClick={() => setRulesOpen(true)} title={t('Configurer les seuils de validation', 'Configure validation thresholds', 'Configurar umbrales')}>
                ⚙ {t('Seuils', 'Thresholds', 'Umbrales')}
              </button>
            )}
            {canManage && budget && (
              <button className={`${btn} text-white bg-indigo-600 hover:bg-indigo-700`}
                onClick={() => setModal({ expense: null })}>
                + {t('Dépense', 'Expense', 'Gasto')}
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="text-gray-400 text-sm py-16 text-center animate-pulse">{t('Chargement…', 'Loading…', 'Cargando…')}</div>
        ) : !budget ? (
          <div className="bg-white rounded-xl border border-dashed border-gray-300 p-12 text-center">
            <p className="text-gray-500 text-sm">
              {t('Créez d’abord un budget pour saisir des dépenses.', 'Create a budget first to record expenses.', 'Cree primero un presupuesto para registrar gastos.')}
            </p>
          </div>
        ) : (
          <>
            {/* Budget restant recalculé automatiquement */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
              <div className="flex items-center gap-2 mb-3">
                <h2 className="font-bold text-gray-900">{budget.label}</h2>
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${(BUDGET_STATUS_UI[budget.status] || BUDGET_STATUS_UI.draft).color}`}>
                  {t(...(BUDGET_STATUS_UI[budget.status] || BUDGET_STATUS_UI.draft).label)}
                </span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
                <Stat label={t('Dépenses prévues', 'Planned', 'Previsto')} value={money(consumption.depensesPrevues)} tone="text-gray-800" />
                <Stat label={t('Engagé', 'Committed', 'Comprometido')} value={money(consumption.engage)} tone="text-amber-600" />
                <Stat label={t('Reste', 'Remaining', 'Restante')} value={money(consumption.reste)}
                  tone={consumption.depassement ? 'text-rose-600' : 'text-emerald-700'} />
                <Stat label={t('Consommation', 'Usage', 'Consumo')} value={`${consumption.tauxConsommation}%`}
                  tone={consumption.depassement ? 'text-rose-600' : 'text-gray-800'} />
              </div>
              <div className="mt-3 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${consumption.depassement ? 'bg-rose-500' : 'bg-emerald-500'}`}
                  style={{ width: `${Math.min(100, consumption.tauxConsommation)}%` }} />
              </div>
              {consumption.depassement && (
                <p className="text-xs text-rose-600 mt-2 font-semibold">
                  ⚠ {t('Dépassement du budget prévu.', 'Planned budget exceeded.', 'Presupuesto previsto superado.')}
                </p>
              )}
            </div>

            {/* Analyse hiérarchique : catégorie → chapitre → sous-chapitre */}
            {rollup.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-5">
                <div className="px-4 py-3 text-sm font-bold text-gray-800 border-b border-gray-100">
                  {t('Exécution par catégorie / chapitre / sous-chapitre', 'Execution by category / chapter / sub-chapter', 'Ejecución por categoría / capítulo / subcapítulo')}
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-400 text-xs"><tr>
                    <th className="text-left px-4 py-2 font-semibold">{t('Poste', 'Line', 'Partida')}</th>
                    <th className="text-right px-4 py-2 font-semibold">{t('Alloué', 'Allocated', 'Asignado')}</th>
                    <th className="text-right px-4 py-2 font-semibold">{t('Engagé', 'Committed', 'Comprom.')}</th>
                    <th className="text-right px-4 py-2 font-semibold">{t('Reste', 'Remaining', 'Restante')}</th>
                    <th className="text-right px-4 py-2 font-semibold">{t('Exéc.', 'Exec.', 'Ejec.')}</th>
                  </tr></thead>
                  <tbody>{rollup.filter((n) => n.kind === 'depense').map((n) => <RollupRows key={n.id} node={n} depth={0} money={money} />)}</tbody>
                </table>
              </div>
            )}

            {/* Liste des dépenses */}
            {expenses.length === 0 ? (
              <div className="bg-white rounded-xl border border-dashed border-gray-300 p-10 text-center">
                <p className="text-gray-500 text-sm">{t('Aucune dépense enregistrée.', 'No expense recorded.', 'Ningún gasto registrado.')}</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500 text-xs">
                    <tr>
                      <th className="text-left px-4 py-2 font-semibold">{t('Date', 'Date', 'Fecha')}</th>
                      <th className="text-left px-4 py-2 font-semibold">{t('Objet', 'Object', 'Objeto')}</th>
                      <th className="text-left px-4 py-2 font-semibold">{t('Chapitre', 'Chapter', 'Capítulo')}</th>
                      <th className="text-left px-4 py-2 font-semibold">{t('Fournisseur', 'Supplier', 'Proveedor')}</th>
                      <th className="text-right px-4 py-2 font-semibold">{t('Montant', 'Amount', 'Importe')}</th>
                      <th className="text-left px-4 py-2 font-semibold">{t('Validateur requis', 'Required approver', 'Validador requerido')}</th>
                      <th className="text-left px-4 py-2 font-semibold">{t('Statut', 'Status', 'Estado')}</th>
                      <th className="px-4 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {expenses.map((e) => {
                      const ui = EXPENSE_STATUS_UI[e.status] || EXPENSE_STATUS_UI.draft;
                      const nexts = EXPENSE_STATUSES.filter((s) => canTransition(e.status, s));
                      return (
                        <tr key={e.id} className="border-t border-gray-100 hover:bg-gray-50/50">
                          <td className="px-4 py-2 text-gray-500 whitespace-nowrap">{e.expense_date || '—'}</td>
                          <td className="px-4 py-2">
                            <div className="font-medium text-gray-800">{e.category || t('Dépense', 'Expense', 'Gasto')}</div>
                            {e.subcategory && <div className="text-xs text-gray-400">{e.subcategory}</div>}
                          </td>
                          <td className="px-4 py-2 text-gray-600">{chapterLabel(e.budget_chapter_id)}</td>
                          <td className="px-4 py-2 text-gray-600">{e.supplier || '—'}</td>
                          <td className="px-4 py-2 text-right tabular-nums text-gray-800">{money(e.amount)}</td>
                          <td className="px-4 py-2">
                            {(() => { const v = requiredValidator(e.amount); return (
                              <span className="text-xs text-gray-600">{v ? t(...v.label) : '—'}</span>
                            ); })()}
                          </td>
                          <td className="px-4 py-2">
                            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${ui.color}`}>{t(...ui.label)}</span>
                          </td>
                          <td className="px-4 py-2">
                            {canManage && (
                              <div className="flex items-center justify-end gap-1 flex-wrap">
                                {nexts.map((s) => (
                                  <button key={s} onClick={() => changeStatus(e, s)}
                                    className="text-[11px] px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-700">
                                    {t(...(TRANSITION_LABEL[s] || [s]))}
                                  </button>
                                ))}
                                {!isExpenseLocked(e) && (
                                  <button onClick={() => setModal({ expense: e })}
                                    className="text-[11px] px-2 py-1 text-gray-400 hover:text-gray-700">✎</button>
                                )}
                                <button onClick={() => removeExpense(e)}
                                  className="text-[11px] px-2 py-1 text-rose-400 hover:text-rose-600">✕</button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Déblocages : demandes + décisions + historique */}
            {requests.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 mt-5 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
                  <h3 className="text-sm font-bold text-gray-800">{t('Déblocages de lignes', 'Line unlocks', 'Desbloqueos de líneas')}</h3>
                  {pendingCount > 0 && (
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                      {pendingCount} {t('en attente', 'pending', 'pendiente')}
                    </span>
                  )}
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500 text-xs">
                    <tr>
                      <th className="text-left px-4 py-2 font-semibold">{t('Ligne', 'Line', 'Línea')}</th>
                      <th className="text-right px-4 py-2 font-semibold">{t('Marge demandée', 'Requested', 'Solicitado')}</th>
                      <th className="text-left px-4 py-2 font-semibold">{t('Demandeur', 'Requester', 'Solicitante')}</th>
                      <th className="text-left px-4 py-2 font-semibold">{t('Statut', 'Status', 'Estado')}</th>
                      <th className="text-left px-4 py-2 font-semibold">{t('Décision', 'Decision', 'Decisión')}</th>
                      <th className="px-4 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {requests.map((r) => {
                      const ui = UNLOCK_STATUS_UI[r.status] || UNLOCK_STATUS_UI.pending;
                      return (
                        <tr key={r.id} className="border-t border-gray-100">
                          <td className="px-4 py-2 text-gray-700">{chapterLabel(r.budget_chapter_id)}</td>
                          <td className="px-4 py-2 text-right tabular-nums text-gray-700">{money(r.requested_amount)}</td>
                          <td className="px-4 py-2 text-gray-600">{r.requester || '—'}{r.reason ? <div className="text-xs text-gray-400">{r.reason}</div> : null}</td>
                          <td className="px-4 py-2">
                            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${ui.color}`}>{t(...ui.label)}</span>
                          </td>
                          <td className="px-4 py-2 text-xs text-gray-500">
                            {r.status === 'pending' ? '—' : (
                              <>
                                <div>{r.decided_by || '—'}{r.granted_amount ? ` · ${money(r.granted_amount)}` : ''}</div>
                                {r.decided_at && <div className="text-gray-400">{String(r.decided_at).slice(0, 10)}</div>}
                                {r.decision_note && <div className="text-gray-400 italic">{r.decision_note}</div>}
                              </>
                            )}
                          </td>
                          <td className="px-4 py-2 text-right">
                            {r.status === 'pending' && canDecideUnlock && (
                              <button onClick={() => setDecision({ request: r })}
                                className="text-[11px] px-2 py-1 rounded bg-indigo-600 text-white hover:bg-indigo-700 font-semibold">
                                {t('Décider', 'Decide', 'Decidir')}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      {modal && budget && (
        <ExpenseFormModal
          expense={modal.expense} budget={budget} chapters={chapters}
          expenses={expenses} requests={requests}
          onSave={saveExpense}
          onRequestUnlock={({ chapter, shortfall }) => { setModal(null); setUnlockReq({ chapter, amount: shortfall }); }}
          onClose={() => setModal(null)}
        />
      )}
      {rulesOpen && <ValidationRulesEditor onClose={() => setRulesOpen(false)} />}
      {unlockReq && (
        <UnlockRequestModal chapter={unlockReq.chapter} defaultAmount={unlockReq.amount}
          onSubmit={submitUnlockRequest} onClose={() => setUnlockReq(null)} />
      )}
      {decision && (
        <UnlockDecisionModal request={decision.request}
          onDecide={applyDecision} onClose={() => setDecision(null)} />
      )}
    </Layout>
  );
}

function Stat({ label, value, tone }) {
  return (
    <div>
      <div className={`text-lg font-bold ${tone}`}>{value}</div>
      <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{label}</div>
    </div>
  );
}

// Lignes récursives du rollup hiérarchique (catégorie → chapitre → sous-chapitre).
function RollupRows({ node, depth, money }) {
  const weight = depth === 0 ? 'font-bold text-gray-900' : depth === 1 ? 'font-semibold text-gray-800' : 'text-gray-600';
  return (
    <>
      <tr className="border-t border-gray-100">
        <td className="px-4 py-1.5" style={{ paddingLeft: `${16 + depth * 18}px` }}><span className={`text-sm ${weight}`}>{node.label}</span></td>
        <td className="px-4 py-1.5 text-right tabular-nums text-gray-700">{money(node.planned)}</td>
        <td className="px-4 py-1.5 text-right tabular-nums text-amber-600">{money(node.engage)}</td>
        <td className={`px-4 py-1.5 text-right tabular-nums ${node.reste < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>{money(node.reste)}</td>
        <td className={`px-4 py-1.5 text-right tabular-nums ${node.depassement ? 'text-rose-600' : 'text-gray-500'}`}>{node.taux}%</td>
      </tr>
      {(node.children || []).map((c) => <RollupRows key={c.id} node={c} depth={depth + 1} money={money} />)}
    </>
  );
}
