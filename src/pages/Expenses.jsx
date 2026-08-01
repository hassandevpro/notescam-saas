// Module DÉPENSES — modèle CIBLE v3 (E5). Imputation = LIGNE budgétaire (active)
// + PÉRIODE + SECTEUR concerné (ou Complexe/Global). Le « disponible » est recalculé
// par le moteur pur (maillon contraignant) ; le SERVEUR (E3) reste l'autorité finale
// (cohérence d'imputation, chaîne, permissions, plafond). Objectif analytique par
// ligne : annuel → période → secteur → alloué / engagé / payé / disponible.
import { useEffect, useMemo, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import Layout from '../components/Layout';
import { useAuthStore } from '../store/authStore';
import { useT } from '../lib/i18n';
import { useMoney } from '../lib/useMoney';
import { fetchBudgets, fetchBudgetChapters } from '../lib/budgetService';
import { fetchBudgetPeriods } from '../lib/budgetPeriodService';
import { fetchLinePeriods, fetchLineSectors } from '../lib/budgetLineService';
import { fetchSchoolUnits } from '../lib/schoolUnitService';
import { fetchExpenses, upsertExpense, deleteExpense } from '../lib/expenseService';
import { fetchUnlockRequests, createUnlockRequest, decideUnlockRequest } from '../lib/unlockService';
import { canTransition, isExpenseLocked, isCancellable, canHardDelete, EXPENSE_STATUSES, totalPaid } from '../lib/expenseEngine';
import {
  indexAllocations, isLine, lineConsumption, linePeriodConsumption, lineSectorConsumption, lineSectorIds,
} from '../lib/budgetLinesEngine';
import { STATUS_UI as BUDGET_STATUS_UI, SCOPE_UI } from '../components/budgets/budgetUi';
import { unitLabel } from '../components/budgets/BudgetHierarchyModals';
import { EXPENSE_STATUS_UI, TRANSITION_LABEL, UNLOCK_STATUS_UI } from '../components/expenses/expenseUi';
import ExpenseFormModalV3 from '../components/expenses/ExpenseFormModalV3';
import CancelExpenseModal from '../components/expenses/CancelExpenseModal';
import { useConfirm } from '../components/ConfirmDialog';
import { toast } from '../store/toastStore';
import { printExpenseVoucher, printExpenseList } from '../lib/expenseDoc';
import ValidationRulesEditor from '../components/expenses/ValidationRulesEditor';
import UnlockRequestModal from '../components/expenses/UnlockRequestModal';
import UnlockDecisionModal from '../components/expenses/UnlockDecisionModal';
import { resolveValidatorRole } from '../governance/validationEngine';
import { getGovernanceRole } from '../governance/roles';
import { hasPermission, canValidateAmount } from '../governance/governanceEngine';
import { catalogOrDefault } from '../governance/defaultCatalog';
import { GOV_PERM } from '../governance/permissions';
import { financeRemoteMode } from '../lib/budgetRemote';

const Badge = ({ ui, t }) => <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${ui.color}`}>{t(...ui.label)}</span>;

export default function Expenses() {
  const t = useT();
  const money = useMoney();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const school = useAuthStore((s) => s.school);
  const role = useAuthStore((s) => s.role);
  const fullName = useAuthStore((s) => s.fullName);
  const userId = useAuthStore((s) => s.user?.id);
  const governanceCatalog = useAuthStore((s) => s.governanceCatalog);
  const assignments = useAuthStore((s) => s.governanceAssignments);
  const govRows = useAuthStore((s) => s.governanceRoleRows);
  const catalog = useMemo(() => catalogOrDefault(governanceCatalog), [governanceCatalog]);
  const [searchParams] = useSearchParams();
  const schoolId = school?.id;
  const year = school?.current_year || '';

  // Gouvernance financière distante (finance:lan + governance:cloud) SUR LE BUILD CLOUD :
  // l'opérationnel (créer/modifier/annuler/payer/décider en direct) se fait AU LAN, jamais
  // ici — sinon la dépense s'écrit dans le Cloud et ne redescend JAMAIS au LAN (orpheline).
  // On rend donc la page LECTURE SEULE : toutes les capacités d'écriture sont neutralisées.
  // Les décisions passent par l'écran « Décisions à approuver » (canal de gouvernance).
  const [remote, setRemote] = useState(false);
  useEffect(() => {
    let ok = true;
    financeRemoteMode(schoolId).then((v) => { if (ok) setRemote(v); });
    return () => { ok = false; };
  }, [schoolId]);

  const canManage = (role === 'admin' || hasPermission(role, catalog, assignments, GOV_PERM.MANAGE)) && !remote;
  const canPrepare = hasPermission(role, catalog, assignments, GOV_PERM.EXPENSE_PREPARE) && !remote;
  const canDecideUnlock = canManage || hasPermission(role, catalog, assignments, GOV_PERM.UNLOCK_DECIDE);
  const canRequestUnlock = canManage || hasPermission(role, catalog, assignments, GOV_PERM.UNLOCK_REQUEST);

  const [annual, setAnnual] = useState(null);
  const [chapters, setChapters] = useState([]);
  const [periods, setPeriods] = useState([]);
  const [units, setUnits] = useState([]);
  const [linePeriods, setLinePeriods] = useState([]);
  const [lineSectors, setLineSectors] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [requests, setRequests] = useState([]);
  const [lineId, setLineId] = useState('');
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);         // { expense }
  const [cancelModal, setCancelModal] = useState(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [unlockReq, setUnlockReq] = useState(null);
  const [decision, setDecision] = useState(null);
  const [fStatus, setFStatus] = useState('all');
  const [fPeriod, setFPeriod] = useState('all');
  const [fSector, setFSector] = useState('all');
  const [fSupplier, setFSupplier] = useState('');

  const load = useCallback(async () => {
    if (!schoolId) { setLoading(false); return; }
    setLoading(true);
    const [b, ch, pd, un, lp, ls] = await Promise.all([
      fetchBudgets(schoolId, { yearLabel: year }), fetchBudgetChapters(schoolId, {}),
      fetchBudgetPeriods(schoolId, { yearLabel: year }), fetchSchoolUnits(schoolId),
      fetchLinePeriods(schoolId), fetchLineSectors(schoolId),
    ]);
    const an = (b || []).find((x) => x.tier === 'annual') || null;
    setAnnual(an); setChapters(ch || []); setPeriods(pd || []); setUnits(un || []);
    setLinePeriods(lp || []); setLineSectors(ls || []);
    if (an) {
      const [ex, rq] = await Promise.all([
        fetchExpenses(schoolId, { budgetId: an.id }), fetchUnlockRequests(schoolId, { budgetId: an.id }),
      ]);
      setExpenses(ex || []); setRequests(rq || []);
    } else { setExpenses([]); setRequests([]); }
    setLoading(false);
  }, [schoolId, year]);
  useEffect(() => { load(); }, [load]);

  // Lignes ACTIVES (exploitables pour les dépenses), rattachées à l'annuel.
  const lines = useMemo(() => (annual ? chapters.filter((c) => c.budget_id === annual.id && isLine(c) && c.status === 'active') : []), [chapters, annual]);
  const idx = useMemo(() => indexAllocations(linePeriods, lineSectors), [linePeriods, lineSectors]);
  const rubricById = useMemo(() => new Map(chapters.map((c) => [c.id, c])), [chapters]);

  // Présélection depuis Budgets (?budget=<ligne>), sinon 1re ligne active.
  useEffect(() => {
    const wanted = searchParams.get('budget');
    if (wanted && lines.some((l) => l.id === wanted)) { setLineId(wanted); return; }
    setLineId((cur) => (cur && lines.some((l) => l.id === cur) ? cur : lines[0]?.id || ''));
  }, [lines, searchParams]);
  useEffect(() => { setFStatus('all'); setFPeriod('all'); setFSector('all'); setFSupplier(''); }, [lineId]);

  const line = lines.find((l) => l.id === lineId) || null;
  const periodName = useMemo(() => new Map(periods.map((p) => [p.id, p.name])), [periods]);
  const unitName = useMemo(() => new Map(units.map((u) => [u.id, unitLabel(t, u)])), [units, t]);
  const sectorLabelOf = (e) => (e.school_unit_id ? (unitName.get(e.school_unit_id) || '—') : t('Complexe/Global', 'Complex/Global', 'Complejo/Global'));

  const lineExpenses = useMemo(() => expenses.filter((e) => e.budget_chapter_id === lineId), [expenses, lineId]);
  const lineRequests = useMemo(() => requests.filter((r) => r.budget_chapter_id === lineId), [requests, lineId]);
  const cons = useMemo(() => (line ? lineConsumption(line, { expenses: lineExpenses, requests: lineRequests }) : null), [line, lineExpenses, lineRequests]);

  // Cellules période / secteur (objectif analytique).
  const periodCells = useMemo(() => {
    if (!line) return [];
    const ids = new Set(linePeriods.filter((a) => a.budget_chapter_id === line.id).map((a) => a.budget_period_id));
    return periods.filter((p) => ids.has(p.id)).map((p) => ({ p, c: linePeriodConsumption(line, p.id, idx, { expenses: lineExpenses }) }));
  }, [line, periods, linePeriods, idx, lineExpenses]);
  const sectorCells = useMemo(() => {
    if (!line || line.scope !== 'sectors') return [];
    const allowed = lineSectorIds(line.id, idx);
    return units.filter((u) => allowed.has(u.id)).map((u) => ({ u, c: lineSectorConsumption(line, u.id, idx, { expenses: lineExpenses }) }));
  }, [line, units, idx, lineExpenses]);

  const requiredValidator = useCallback((amount) => {
    const roleId = resolveValidatorRole(school?.validation_rules, 'expense', amount);
    return roleId ? getGovernanceRole(roleId) : null;
  }, [school?.validation_rules]);

  const PERM_FOR_TARGET = { submitted: GOV_PERM.EXPENSE_SUBMIT, approved: GOV_PERM.EXPENSE_APPROVE, paid: GOV_PERM.EXPENSE_PAY, rejected: GOV_PERM.EXPENSE_REJECT };
  const canActTransition = useCallback((e, target) => {
    if (role === 'admin') return true;
    const perm = PERM_FOR_TARGET[target];
    if (!perm || !hasPermission(role, catalog, assignments, perm)) return false;
    if (target === 'approved') return canValidateAmount(role, catalog, assignments, school?.validation_rules, e?.amount);
    return true;
  }, [role, catalog, assignments, school?.validation_rules]);

  const failToast = (e) => toast.error(e?.message || t('Échec de l’opération — vérifiez votre connexion.', 'Operation failed — check your connection.', 'Error — verifique su conexión.'));

  // Garde de défense en profondeur : en gouvernance distante, aucune écriture
  // opérationnelle depuis le Cloud (les boutons sont déjà masqués ; ceci bloque tout
  // chemin résiduel). La finance s'exécute sur le poste de l'école (LAN).
  const blockedRemote = () => { toast.error(t('Action indisponible ici : les dépenses se gèrent sur le poste de l’école.', 'Unavailable here: expenses are managed on the school workstation.', 'No disponible aquí: los gastos se gestionan en el puesto de la escuela.')); return true; };

  const saveExpense = async (data) => {
    if (remote) { setModal(null); return blockedRemote(); }
    const { data: saved, error } = await upsertExpense({ ...data, school_id: schoolId, created_by: data.created_by || fullName || '' });
    setModal(null);
    if (error) return failToast(error);
    if (saved) { await load(); toast.success(t('Dépense enregistrée', 'Expense saved', 'Gasto guardado')); }
  };
  const changeStatus = async (exp, to) => {
    if (remote) return blockedRemote();
    if (!canTransition(exp.status, to)) return;
    const { data, error } = await upsertExpense({ ...exp, status: to });
    if (error) return failToast(error);
    if (data) { await load(); toast.success(t('Statut mis à jour', 'Status updated', 'Estado actualizado')); }
  };
  const removeExpense = async (exp) => {
    if (!canHardDelete(exp.status)) return;
    if (!(await confirm({ tone: 'danger', title: t('Supprimer le brouillon', 'Delete draft', 'Eliminar borrador'), message: t('Supprimer ce brouillon de dépense ?', 'Delete this draft expense?', '¿Eliminar este borrador?'), confirmLabel: t('Supprimer', 'Delete', 'Eliminar') }))) return;
    if (await deleteExpense(exp.id)) { await load(); toast.success(t('Brouillon supprimé', 'Draft deleted', 'Borrador eliminado')); }
    else failToast();
  };
  const cancelExpense = async ({ reason }) => {
    const exp = cancelModal?.expense; if (!exp) return;
    const { data, error } = await upsertExpense({ ...exp, status: 'cancelled', cancel_reason: reason, cancelled_by: fullName || '', cancelled_at: new Date().toISOString() });
    setCancelModal(null);
    if (error) return failToast(error);
    if (data) { await load(); toast.success(t('Dépense annulée', 'Expense cancelled', 'Gasto anulado')); }
  };
  const submitUnlockRequest = async ({ requested_amount, reason, budget_chapter_id }) => {
    const saved = await createUnlockRequest({ school_id: schoolId, budget_id: annual.id, budget_chapter_id, requested_amount, reason, requester: fullName || '', requested_by: userId || '' });
    setUnlockReq(null); await load();
    if (saved) toast.success(t('Demande de déblocage envoyée', 'Unlock request sent', 'Solicitud enviada')); else failToast();
  };
  const applyDecision = async (dec, { grantedAmount, note }) => {
    const req = decision.request;
    const decidedRole = govRows.find((r) => hasPermission(role, catalog, [r], GOV_PERM.UNLOCK_DECIDE))?.role || (canManage ? 'admin' : '');
    const chapter = chapters.find((c) => c.id === req.budget_chapter_id) || null;
    const saved = await decideUnlockRequest(req, dec, { grantedAmount, note, decidedBy: fullName || '', decidedById: userId || '', decidedRole, chapter });
    setDecision(null); await load();
    if (saved) toast.success(t('Décision enregistrée', 'Decision recorded', 'Decisión registrada')); else failToast();
  };

  const popupError = () => toast.error(t('Autorisez les pop-ups pour imprimer.', 'Allow pop-ups to print.', 'Permita las ventanas emergentes.'));
  const printVoucher = (e) => {
    const v = requiredValidator(e.amount);
    const ok = printExpenseVoucher(e, { school, t, money, chapterPath: line?.label || '', sectorLabel: sectorLabelOf(e), validatorLabel: v ? t(...v.label) : '' });
    if (!ok) popupError();
  };
  const printList = () => {
    const ok = printExpenseList(filtered, { school, t, money, budget: { label: line?.label || t('Dépenses', 'Expenses', 'Gastos') }, chapterLabel: () => line?.label || '', filterSummary: '' });
    if (!ok) popupError();
  };

  const filtered = useMemo(() => lineExpenses.filter((e) => {
    if (fStatus !== 'all' && e.status !== fStatus) return false;
    if (fPeriod !== 'all' && (e.budget_period_id || '') !== fPeriod) return false;
    if (fSector !== 'all') {
      if (fSector === '__global__') { if (e.school_unit_id) return false; }   // Complexe/Global = pas de secteur
      else if ((e.school_unit_id || '') !== fSector) return false;
    }
    if (fSupplier.trim() && !String(e.supplier || '').toLowerCase().includes(fSupplier.trim().toLowerCase())) return false;
    return true;
  }), [lineExpenses, fStatus, fPeriod, fSector, fSupplier]);

  const pendingCount = lineRequests.filter((r) => r.status === 'pending').length;
  const btn = 'px-3 py-1.5 text-sm font-semibold rounded-lg transition-colors';

  if (loading) return <Layout><div className="text-gray-400 text-sm py-24 text-center animate-pulse">{t('Chargement…', 'Loading…', 'Cargando…')}</div></Layout>;

  return (
    <Layout>
      <div className="max-w-6xl mx-auto">
        {remote && (
          <div className="mb-4 text-sm text-sky-800 bg-sky-50 border border-sky-200 rounded-lg px-4 py-3">
            🛰️ <strong>{t('Gouvernance à distance', 'Remote governance', 'Gobernanza remota')}</strong> — {t(
              'les dépenses sont saisies et exécutées sur le poste de l’école (LAN). Ici, la finance est en LECTURE SEULE ; les approbations passent par l’écran « Décisions à approuver ».',
              'expenses are entered and executed on the school workstation (LAN). Finance is READ-ONLY here; approvals go through the “Decisions to approve” screen.',
              'los gastos se registran y ejecutan en el puesto de la escuela (LAN). Aquí la finanza es de SOLO LECTURA; las aprobaciones se hacen en «Decisiones por aprobar».')}
          </div>
        )}
        <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{t('Dépenses', 'Expenses', 'Gastos')}</h1>
            <p className="text-sm text-gray-500 mt-1">{t('Exécution budgétaire — imputation ligne / période / secteur', 'Budget execution — line / period / sector', 'Ejecución — línea / período / sector')} — {year || '—'}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {lines.length > 0 && (
              <select className="border border-gray-300 rounded-lg px-3 py-2 text-sm" value={lineId} onChange={(e) => setLineId(e.target.value)}>
                {lines.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
              </select>
            )}
            {canManage && (
              <button className={`${btn} text-gray-600 bg-gray-100 hover:bg-gray-200`} onClick={() => setRulesOpen(true)} title={t('Seuils de validation', 'Validation thresholds', 'Umbrales')}>⚙ {t('Seuils', 'Thresholds', 'Umbrales')}</button>
            )}
            {canPrepare && line && (
              <button className={`${btn} text-white bg-indigo-600 hover:bg-indigo-700`} onClick={() => setModal({ expense: null })}>+ {t('Dépense', 'Expense', 'Gasto')}</button>
            )}
          </div>
        </div>

        {!annual ? (
          <Empty t={t} msg={t('Créez d’abord le budget annuel et activez des lignes.', 'Create the annual budget and activate lines first.', 'Cree el presupuesto anual primero.')} />
        ) : lines.length === 0 ? (
          <Empty t={t} msg={t('Aucune ligne budgétaire active. Activez une ligne dans Budgets pour imputer des dépenses.', 'No active budget line. Activate a line in Budgets.', 'Ninguna línea activa.')} />
        ) : !line ? (
          <Empty t={t} msg={t('Sélectionnez une ligne.', 'Select a line.', 'Seleccione una línea.')} />
        ) : (
          <>
            {/* Synthèse de la ligne */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <h2 className="font-bold text-gray-900">{line.label}</h2>
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${(SCOPE_UI[line.scope] || SCOPE_UI.complex).color}`}>{t(...(SCOPE_UI[line.scope] || SCOPE_UI.complex).label)}</span>
                <Badge ui={BUDGET_STATUS_UI[line.status] || BUDGET_STATUS_UI.active} t={t} />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
                <Stat label={t('Montant', 'Amount', 'Monto')} value={money(cons.ceiling)} tone="text-gray-800" />
                <Stat label={t('Engagé', 'Committed', 'Comprometido')} value={money(cons.committed)} tone="text-amber-600" />
                <Stat label={t('Payé', 'Paid', 'Pagado')} value={money(totalPaid(lineExpenses))} tone="text-emerald-700" />
                <Stat label={t('Disponible', 'Available', 'Disponible')} value={money(cons.available)} tone={cons.depassement ? 'text-rose-600' : 'text-sky-700'} />
              </div>
            </div>

            {/* Cellules période + secteur */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <CellTable title={t('Par période', 'By period', 'Por período')} rows={periodCells.map(({ p, c }) => ({ label: p.name, c }))} money={money} t={t} />
              {line.scope === 'sectors' && (
                <CellTable title={t('Par secteur', 'By sector', 'Por sector')} rows={sectorCells.map(({ u, c }) => ({ label: unitName.get(u.id) || u.name, c }))} money={money} t={t} />
              )}
            </div>

            {/* Filtres */}
            <div className="bg-white rounded-xl border border-gray-200 p-3 mb-3 flex flex-wrap items-end gap-2">
              <Filter label={t('Statut', 'Status', 'Estado')}><select value={fStatus} onChange={(e) => setFStatus(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm">
                <option value="all">{t('Tous', 'All', 'Todos')}</option>
                {EXPENSE_STATUSES.map((s) => <option key={s} value={s}>{t(...(EXPENSE_STATUS_UI[s]?.label || [s]))}</option>)}
              </select></Filter>
              <Filter label={t('Période', 'Period', 'Período')}><select value={fPeriod} onChange={(e) => setFPeriod(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm">
                <option value="all">{t('Toutes', 'All', 'Todas')}</option>
                {periodCells.map(({ p }) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select></Filter>
              {line.scope === 'sectors' && (
                <Filter label={t('Secteur', 'Sector', 'Sector')}><select value={fSector} onChange={(e) => setFSector(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm">
                  <option value="all">{t('Tous', 'All', 'Todos')}</option>
                  <option value="__global__">{t('Complexe/Global', 'Complex/Global', 'Complejo/Global')}</option>
                  {sectorCells.map(({ u }) => <option key={u.id} value={u.id}>{unitName.get(u.id) || u.name}</option>)}
                </select></Filter>
              )}
              <Filter label={t('Fournisseur', 'Supplier', 'Proveedor')}><input value={fSupplier} onChange={(e) => setFSupplier(e.target.value)} placeholder={t('Rechercher…', 'Search…', 'Buscar…')} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm" /></Filter>
              <button onClick={printList} className="ml-auto self-center text-xs font-semibold text-indigo-600 hover:text-indigo-800 px-2 py-1.5">🖨 {t('Imprimer', 'Print', 'Imprimir')}</button>
              <span className="text-xs text-gray-400 self-center tabular-nums">{filtered.length}/{lineExpenses.length}</span>
            </div>

            {/* Liste des dépenses */}
            {filtered.length === 0 ? (
              <Empty t={t} msg={t('Aucune dépense.', 'No expense.', 'Ningún gasto.')} />
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[820px]">
                    <thead className="bg-gray-50 text-gray-500 text-xs"><tr>
                      <th className="text-left px-4 py-2 font-semibold">{t('Date', 'Date', 'Fecha')}</th>
                      <th className="text-left px-4 py-2 font-semibold">{t('Objet', 'Object', 'Objeto')}</th>
                      <th className="text-left px-4 py-2 font-semibold">{t('Période', 'Period', 'Período')}</th>
                      <th className="text-left px-4 py-2 font-semibold">{t('Secteur', 'Sector', 'Sector')}</th>
                      <th className="text-left px-4 py-2 font-semibold">{t('Fournisseur', 'Supplier', 'Proveedor')}</th>
                      <th className="text-right px-4 py-2 font-semibold">{t('Montant', 'Amount', 'Importe')}</th>
                      <th className="text-left px-4 py-2 font-semibold">{t('Statut', 'Status', 'Estado')}</th>
                      <th className="px-4 py-2" />
                    </tr></thead>
                    <tbody>
                      {filtered.map((e) => {
                        const ui = EXPENSE_STATUS_UI[e.status] || EXPENSE_STATUS_UI.draft;
                        const nexts = EXPENSE_STATUSES.filter((s) => s !== 'cancelled' && canTransition(e.status, s));
                        return (
                          <tr key={e.id} className="border-t border-gray-100 hover:bg-gray-50/50">
                            <td className="px-4 py-2 text-gray-500 whitespace-nowrap">{e.expense_date || '—'}</td>
                            <td className="px-4 py-2"><div className="font-medium text-gray-800">{e.category || t('Dépense', 'Expense', 'Gasto')}</div>{e.subcategory && <div className="text-xs text-gray-400">{e.subcategory}</div>}</td>
                            <td className="px-4 py-2 text-gray-600">{periodName.get(e.budget_period_id) || '—'}</td>
                            <td className="px-4 py-2 text-gray-600">{sectorLabelOf(e)}</td>
                            <td className="px-4 py-2 text-gray-600">{e.supplier || '—'}</td>
                            <td className="px-4 py-2 text-right tabular-nums text-gray-800">{money(e.amount)}</td>
                            <td className="px-4 py-2">
                              <Badge ui={ui} t={t} />
                              {e.status === 'cancelled' && e.cancel_reason && <div className="text-[10px] text-gray-400 italic mt-0.5 max-w-[160px] truncate" title={e.cancel_reason}>{e.cancel_reason}</div>}
                            </td>
                            <td className="px-4 py-2">
                              {(canManage || govRows.length > 0 || canPrepare) && (
                                <div className="flex items-center justify-end gap-1 flex-wrap">
                                  {nexts.filter((s) => canActTransition(e, s)).map((s) => (
                                    <button key={s} onClick={() => changeStatus(e, s)} className="text-[11px] px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-700">{t(...(TRANSITION_LABEL[s] || [s]))}</button>
                                  ))}
                                  {(e.status === 'submitted' || e.status === 'approved') && (
                                    <button onClick={() => printVoucher(e)} title={t('Bon de dépense', 'Expense voucher', 'Comprobante')} className="text-[11px] px-2 py-1 text-gray-400 hover:text-indigo-600">🖨</button>
                                  )}
                                  {canPrepare && !isExpenseLocked(e) && <button onClick={() => setModal({ expense: e })} title={t('Modifier', 'Edit', 'Editar')} className="text-[11px] px-2 py-1 text-gray-400 hover:text-gray-700">✎</button>}
                                  {canPrepare && canHardDelete(e.status) ? (
                                    <button onClick={() => removeExpense(e)} title={t('Supprimer', 'Delete', 'Eliminar')} className="text-[11px] px-2 py-1 text-rose-400 hover:text-rose-600">✕</button>
                                  ) : canPrepare && isCancellable(e.status) ? (
                                    <button onClick={() => setCancelModal({ expense: e })} className="text-[11px] px-2 py-1 rounded text-rose-600 hover:bg-rose-50 font-semibold">{t('Annuler', 'Cancel', 'Anular')}</button>
                                  ) : null}
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Déblocages de la ligne */}
            {lineRequests.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 mt-5 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
                  <h3 className="text-sm font-bold text-gray-800">{t('Déblocages de la ligne', 'Line unlocks', 'Desbloqueos')}</h3>
                  {pendingCount > 0 && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">{pendingCount} {t('en attente', 'pending', 'pendiente')}</span>}
                </div>
                <div className="overflow-x-auto"><table className="w-full text-sm min-w-[560px]">
                  <thead className="bg-gray-50 text-gray-500 text-xs"><tr>
                    <th className="text-right px-4 py-2 font-semibold">{t('Marge demandée', 'Requested', 'Solicitado')}</th>
                    <th className="text-left px-4 py-2 font-semibold">{t('Demandeur', 'Requester', 'Solicitante')}</th>
                    <th className="text-left px-4 py-2 font-semibold">{t('Statut', 'Status', 'Estado')}</th>
                    <th className="px-4 py-2" />
                  </tr></thead>
                  <tbody>
                    {lineRequests.map((r) => {
                      const ui = UNLOCK_STATUS_UI[r.status] || UNLOCK_STATUS_UI.pending;
                      return (
                        <tr key={r.id} className="border-t border-gray-100">
                          <td className="px-4 py-2 text-right tabular-nums text-gray-700">{money(r.requested_amount)}</td>
                          <td className="px-4 py-2 text-gray-600">{r.requester || '—'}{r.reason ? <div className="text-xs text-gray-400">{r.reason}</div> : null}</td>
                          <td className="px-4 py-2"><Badge ui={ui} t={t} /></td>
                          <td className="px-4 py-2 text-right">{r.status === 'pending' && canDecideUnlock && <button onClick={() => setDecision({ request: r })} className="text-[11px] px-2 py-1 rounded bg-indigo-600 text-white hover:bg-indigo-700 font-semibold">{t('Décider', 'Decide', 'Decidir')}</button>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table></div>
              </div>
            )}
          </>
        )}
      </div>

      {modal && line && (
        <ExpenseFormModalV3 expense={modal.expense} lines={lines} periods={periods} units={units}
          linePeriods={linePeriods} lineSectors={lineSectors} expenses={expenses} annual={annual} defaultLineId={lineId}
          onSave={saveExpense}
          onRequestUnlock={canRequestUnlock ? ({ chapter, shortfall }) => { setModal(null); setUnlockReq({ chapter, amount: shortfall }); } : undefined}
          onClose={() => setModal(null)} />
      )}
      {cancelModal && <CancelExpenseModal expense={cancelModal.expense} onConfirm={cancelExpense} onClose={() => setCancelModal(null)} />}
      {rulesOpen && <ValidationRulesEditor onClose={() => setRulesOpen(false)} />}
      {unlockReq && <UnlockRequestModal chapter={unlockReq.chapter} defaultAmount={unlockReq.amount} onSubmit={submitUnlockRequest} onClose={() => setUnlockReq(null)} />}
      {decision && <UnlockDecisionModal request={decision.request} onDecide={applyDecision} onClose={() => setDecision(null)} />}
      {confirmDialog}
    </Layout>
  );
}

function Empty({ t, msg }) {
  return <div className="bg-white rounded-xl border border-dashed border-gray-300 p-12 text-center"><p className="text-gray-500 text-sm">{msg}</p></div>;
}
function Stat({ label, value, tone }) {
  return <div><div className={`text-lg font-bold ${tone}`}>{value}</div><div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{label}</div></div>;
}
function Filter({ label, children }) {
  return <div><label className="block text-[11px] font-semibold text-gray-400 mb-1">{label}</label>{children}</div>;
}
function CellTable({ title, rows, money, t }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-100 text-sm font-bold text-gray-800">{title}</div>
      {rows.length === 0 ? <p className="text-xs text-gray-400 py-4 text-center">{t('—', '—', '—')}</p> : (
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-400 text-[11px]"><tr>
            <th className="text-left px-4 py-1.5 font-semibold">{t('Poste', 'Item', 'Ítem')}</th>
            <th className="text-right px-3 py-1.5 font-semibold">{t('Alloué', 'Allocated', 'Asignado')}</th>
            <th className="text-right px-3 py-1.5 font-semibold">{t('Engagé', 'Committed', 'Comprom.')}</th>
            <th className="text-right px-4 py-1.5 font-semibold">{t('Dispo', 'Avail.', 'Disp.')}</th>
          </tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-gray-100">
                <td className="px-4 py-1.5 text-gray-700 truncate">{r.label}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-gray-600">{money(r.c.ceiling)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-amber-600">{money(r.c.committed)}</td>
                <td className={`px-4 py-1.5 text-right tabular-nums ${r.c.available < 0 ? 'text-rose-600' : 'text-sky-700'}`}>{money(r.c.available)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
