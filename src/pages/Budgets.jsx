// Module BUDGETS — modèle CIBLE v3 (E4).
//   Budget annuel global → RUBRIQUES → LIGNES (montant annuel) réparties par
//   PÉRIODE (%) et par SECTEUR concerné (%) → dépenses.
// L'UI CONSOMME le moteur pur (budgetLinesEngine) et écrit via les services ; le
// SERVEUR (E3) reste l'autorité finale (activation, plafond annuel, gel, chaîne).
import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { useAuthStore } from '../store/authStore';
import { useT } from '../lib/i18n';
import { useMoney } from '../lib/useMoney';
import { fetchBudgets, upsertBudget, deleteBudget, fetchBudgetChapters, upsertBudgetChapter, deleteBudgetChapter } from '../lib/budgetService';
import { fetchBudgetPeriods } from '../lib/budgetPeriodService';
import { fetchLinePeriods, fetchLineSectors } from '../lib/budgetLineService';
import { fetchSchoolUnits } from '../lib/schoolUnitService';
import { fetchExpenses } from '../lib/expenseService';
import {
  computeBudget, indexAllocations, isLine, activationErrors,
} from '../lib/budgetLinesEngine';
import {
  createLineReallocation, decideLineReallocation, fetchLineReallocations,
  createRevision, decideRevision, fetchRevisions,
} from '../lib/budgetOpsService';
import { financeRemoteMode } from '../lib/budgetRemote';
import { fetchBudgetOperations, budgetOperationOutcome, visibleIntents } from '../lib/budgetOperationService';
import { AnnualBudgetModal } from '../components/budgets/BudgetHierarchyModals';
import LineFormModal from '../components/budgets/LineFormModal';
import LineAllocationsModal from '../components/budgets/LineAllocationsModal';
import BudgetPeriodsModal from '../components/budgets/BudgetPeriodsModal';
import { LineReallocationModal, AnnualRevisionModal, OpDecisionModal } from '../components/budgets/BudgetOpsModalsV3';
import { STATUS_UI, SCOPE_UI, ANNUAL_STATUS_UI, LINE_ERROR_LABELS } from '../components/budgets/budgetUi';
import { ProgressBar } from '../components/charts/Charts';
import { useConfirm } from '../components/ConfirmDialog';
import { toast } from '../store/toastStore';
import { hasPermission } from '../governance/governanceEngine';
import { catalogOrDefault } from '../governance/defaultCatalog';
import { GOV_PERM } from '../governance/permissions';

const Badge = ({ ui, t }) => <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${ui.color}`}>{t(...ui.label)}</span>;

// H3b-4 — libellés des intentions budgétaires distantes (mode gouvernance distante).
const OP_LABEL = {
  create: ['Création', 'Create', 'Creación'], modify: ['Modification', 'Modify', 'Modificación'],
  allocate: ['Répartition', 'Allocation', 'Reparto'], activate: ['Activation', 'Activate', 'Activación'],
  revise: ['Révision', 'Revision', 'Revisión'], reallocate: ['Réallocation', 'Reallocation', 'Reasignación'],
};
const opLabel = (t, op) => t(...(OP_LABEL[op] || [op, op]));
const intentStatusLabel = (t, s) => (s === 'applied'
  ? t('Appliquée', 'Applied', 'Aplicada')
  : s === 'rejected' ? t('Rejetée', 'Rejected', 'Rechazada') : t('En attente', 'Pending', 'Pendiente'));
const intentStatusPill = (s) => `text-[11px] font-semibold px-2 py-0.5 rounded-full ${
  s === 'applied' ? 'bg-emerald-100 text-emerald-700' : s === 'rejected' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`;

export default function Budgets() {
  const t = useT();
  const money = useMoney();
  const navigate = useNavigate();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const school = useAuthStore((s) => s.school);
  const role = useAuthStore((s) => s.role);
  const governanceCatalog = useAuthStore((s) => s.governanceCatalog);
  const assignments = useAuthStore((s) => s.governanceAssignments);
  const catalog = useMemo(() => catalogOrDefault(governanceCatalog), [governanceCatalog]);
  const schoolId = school?.id;
  const year = school?.current_year || '';
  const canManage = hasPermission(role, catalog, assignments, GOV_PERM.BUDGET_PREPARE);   // créer/gérer
  const canApprove = hasPermission(role, catalog, assignments, GOV_PERM.BUDGET_APPROVE);   // activer
  const canClose = hasPermission(role, catalog, assignments, GOV_PERM.BUDGET_CLOSE);
  const canReopen = hasPermission(role, catalog, assignments, GOV_PERM.BUDGET_REOPEN);
  // Opérations tracées V3 (le serveur reste l'autorité finale).
  const canReqRealloc = hasPermission(role, catalog, assignments, GOV_PERM.REALLOCATE_REQUEST);
  const canDecRealloc = hasPermission(role, catalog, assignments, GOV_PERM.REALLOCATE_DECIDE);
  const canReqRev = hasPermission(role, catalog, assignments, GOV_PERM.ANNUAL_REVISE_REQUEST);
  const canDecRev = hasPermission(role, catalog, assignments, GOV_PERM.ANNUAL_REVISE);

  const [budgets, setBudgets] = useState([]);
  const [chapters, setChapters] = useState([]);
  const [linePeriods, setLinePeriods] = useState([]);
  const [lineSectors, setLineSectors] = useState([]);
  const [periods, setPeriods] = useState([]);
  const [units, setUnits] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [reallocations, setReallocations] = useState([]);
  const [revisions, setRevisions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [modal, setModal] = useState(null); // {type:'annual'|'rubrique'|'line'|'alloc'|'periods', node?, parent?}
  const [opModal, setOpModal] = useState(null);        // {type:'realloc'|'revision'}
  const [decisionOp, setDecisionOp] = useState(null);  // {kind:'realloc'|'revision', request}
  // H3b-4 — gouvernance distante : mode « émission d'intention » + état en attente.
  const [remoteMode, setRemoteMode] = useState(false);
  const [intents, setIntents] = useState([]);          // intentions budgétaires + statut dérivé
  const [intentsBusy, setIntentsBusy] = useState(false);
  const [intentsAt, setIntentsAt] = useState(null);    // dernier rafraîchissement réussi
  const [nowTs, setNowTs] = useState(() => Date.now()); // horloge d'expiration des verdicts
  const pendingRef = useRef(new Set());                // corrélations en attente au tour précédent

  const load = useCallback(async () => {
    if (!schoolId) { setLoading(false); return; }
    setLoading(true); setError(false);
    try {
      const [b, ch, lp, ls, pd, un, ex, rl, rv] = await Promise.all([
        fetchBudgets(schoolId, { yearLabel: year }),
        fetchBudgetChapters(schoolId, {}),
        fetchLinePeriods(schoolId),
        fetchLineSectors(schoolId),
        fetchBudgetPeriods(schoolId, { yearLabel: year }),
        fetchSchoolUnits(schoolId),
        fetchExpenses(schoolId, {}),
        fetchLineReallocations(schoolId, year),
        fetchRevisions(schoolId, year),
      ]);
      if (b === null) { setError(true); setLoading(false); return; }
      setBudgets(b || []); setChapters(ch || []); setLinePeriods(lp || []); setLineSectors(ls || []);
      setPeriods(pd || []); setUnits(un || []); setExpenses(ex || []);
      setReallocations(rl || []); setRevisions(rv || []);
    } catch { setError(true); }
    setLoading(false);
  }, [schoolId, year]);
  useEffect(() => { load(); }, [load]);

  const loadIntents = useCallback(async () => {
    if (!schoolId) return;
    setIntentsBusy(true);
    try {
      const on = await financeRemoteMode(schoolId);
      setRemoteMode(on);
      if (!on) { setIntents([]); pendingRef.current = new Set(); return; }
      const evs = await fetchBudgetOperations(schoolId, { limit: 200 });
      const parse = (e) => (typeof e.payload === 'object' ? e.payload : (() => { try { return JSON.parse(e.payload || '{}'); } catch { return {}; } })());
      const rows = evs.filter((e) => e.event_type === 'BudgetOperationRequested').map((e) => {
        const p = parse(e); const corr = p.correlation_id || e.correlation_id;
        // `agg` = l'agrégat visé (ici : l'id de la LIGNE). Sans lui, impossible de
        // dire à l'utilisateur QUELLE ligne a une demande en attente — c'est ce qui
        // faisait passer une répartition en attente pour une saisie perdue.
        const { status, resolvedAt } = budgetOperationOutcome(evs, corr);
        return { id: e.id, corr, agg: p.aggregate_id || e.aggregate_id || null,
          op: p.op, target: p.target, at: e.occurred_at, status, resolvedAt };
      }).slice(0, 20);
      setIntents(rows);
      setIntentsAt(Date.now());
      setNowTs(Date.now());
      // Une demande qui vient d'être tranchée par le serveur de l'école a modifié
      // le budget : on recharge les données, sinon l'écran annonce « Appliquée »
      // au-dessus de chiffres périmés.
      const stillPending = new Set(rows.filter((r) => r.status === 'pending').map((r) => r.corr));
      const justResolved = [...pendingRef.current].some((c) => !stillPending.has(c));
      pendingRef.current = stillPending;
      if (justResolved) load();
    } finally {
      setIntentsBusy(false);
    }
  }, [schoolId, load]);
  useEffect(() => { loadIntents(); }, [loadIntents]);

  // Ce qui doit rester à l'écran maintenant : les demandes en attente + les
  // verdicts récents. `nowTs` avance seul pour que les verdicts s'effacent sans
  // qu'on ait à recharger la page.
  const shownIntents = useMemo(() => visibleIntents(intents, nowTs), [intents, nowTs]);
  const hasPendingIntent = useMemo(() => intents.some((i) => i.status === 'pending'), [intents]);

  useEffect(() => {
    if (!remoteMode || shownIntents.length === 0) return undefined;
    const id = setInterval(() => setNowTs(Date.now()), 15000);
    return () => clearInterval(id);
  }, [remoteMode, shownIntents.length]);

  // Tant qu'une demande attend, c'est le serveur de l'école qui tranche : l'écran
  // doit se mettre à jour tout seul, sans exiger un clic sur « Rafraîchir ».
  useEffect(() => {
    if (!remoteMode || !hasPendingIntent) return undefined;
    const id = setInterval(() => { loadIntents(); }, 20000);
    return () => clearInterval(id);
  }, [remoteMode, hasPendingIntent, loadIntents]);

  const annual = useMemo(() => budgets.find((b) => b.tier === 'annual') || null, [budgets]);
  // Chapitres rattachés au budget annuel courant.
  const annualChapters = useMemo(() => (annual ? chapters.filter((c) => c.budget_id === annual.id) : []), [chapters, annual]);
  const idx = useMemo(() => indexAllocations(linePeriods, lineSectors), [linePeriods, lineSectors]);
  const model = useMemo(
    () => (annual ? computeBudget(annual, annualChapters, { periodAllocs: linePeriods, sectorAllocs: lineSectors, periods, expenses }) : null),
    [annual, annualChapters, linePeriods, lineSectors, periods, expenses],
  );
  const chapterById = useMemo(() => new Map(annualChapters.map((c) => [c.id, c])), [annualChapters]);
  const linesSum = useMemo(() => annualChapters.filter(isLine).reduce((s, c) => s + (Number(c.planned_amount) || 0), 0), [annualChapters]);
  const envelope = Number(annual?.envelope_amount) || 0;

  const failToast = (e) => toast.error(e?.message || t('Échec de l’opération — vérifiez votre connexion.', 'Operation failed — check your connection.', 'Error — verifique su conexión.'));

  // Manuel d'emploi en PDF. Généré à la demande (le module jsPDF n'est chargé
  // qu'au clic) pour ne pas alourdir l'ouverture de la page.
  const downloadManual = async () => {
    try {
      const { downloadBudgetManualPdf } = await import('../lib/budgetManualPdf');
      downloadBudgetManualPdf({ schoolName: school?.name || null });
    } catch (e) {
      failToast(e);
    }
  };
  const pendingMsg = t('Demande envoyée · en attente d’application par le serveur de l’école', 'Request sent · awaiting the school server', 'Solicitud enviada · esperando al servidor');

  // Traite un résultat { data, error, pending } : erreur / intention distante (en
  // attente d'application LAN, #6) / écriture directe appliquée. Rafraîchit la vue.
  const afterWrite = async (res, okMsg) => {
    if (res?.error) return failToast(res.error);
    await load();
    if (res?.pending) { await loadIntents(); toast.success(pendingMsg); }
    else if (res?.data) toast.success(okMsg);
  };

  // ── Actions ────────────────────────────────────────────────────────────────
  const saveAnnual = async (data) => {
    const res = await upsertBudget({ ...data, school_id: schoolId });
    setModal(null);
    await afterWrite(res, t('Enregistré', 'Saved', 'Guardado'));
  };

  const saveChapter = async (data) => {
    const parentId = modal?.parent?.id || data.parent_id || null;
    const siblings = annualChapters.filter((c) => (c.parent_id || null) === (parentId || null));
    const position = data.position ?? siblings.length;
    const res = await upsertBudgetChapter({ ...data, position, school_id: schoolId, budget_id: annual.id, parent_id: parentId });
    setModal(null);
    await afterWrite(res, t('Enregistré', 'Saved', 'Guardado'));
  };

  const changeLineStatus = async (line, to) => {
    const res = await upsertBudgetChapter({ ...line, status: to });
    await afterWrite(res, t('Statut mis à jour', 'Status updated', 'Estado actualizado'));
  };

  const removeChapter = async (node, isLineNode) => {
    const msg = isLineNode
      ? t('Supprimer cette ligne, ses répartitions et ses dépenses ?', 'Delete this line, its breakdowns and expenses?', '¿Eliminar esta línea y su contenido?')
      : t('Supprimer cette rubrique et ses lignes ?', 'Delete this category and its lines?', '¿Eliminar esta rúbrica y sus líneas?');
    if (!(await confirm({ tone: 'danger', title: t('Supprimer', 'Delete', 'Eliminar'), message: msg, confirmLabel: t('Supprimer', 'Delete', 'Eliminar') }))) return;
    if (await deleteBudgetChapter(node.id)) { await load(); toast.success(t('Supprimé', 'Deleted', 'Eliminado')); }
    else failToast();
  };

  const closeExercise = async (to) => {
    const res = await upsertBudget({ ...annual, status: to });
    await afterWrite(res, t('Statut mis à jour', 'Status updated', 'Estado actualizado'));
  };

  // Anomalies d'activation d'une ligne (config + plafond annuel) — miroir serveur.
  const lineActivation = useCallback((rawLine) => activationErrors(rawLine, annual, annualChapters, idx), [annual, annualChapters, idx]);

  // Lignes ACTIVES (cibles de réallocation).
  const activeLines = useMemo(() => annualChapters.filter((c) => isLine(c) && c.status === 'active'), [annualChapters]);

  // — Opérations tracées V3 : proposition + décision, appliquées côté serveur —
  const submitRealloc = async ({ sourceChapterId, destChapterId, amount, reason }) => {
    const res = await createLineReallocation({
      sourceChapterId, destChapterId, amount, reason,
      schoolId, expectedVersion: chapterById.get(sourceChapterId)?.version ?? null,
    });
    setOpModal(null);
    await afterWrite(res, t('Réallocation proposée', 'Reallocation proposed', 'Reasignación propuesta'));
  };
  const submitRevision = async ({ newAmount, reason }) => {
    const res = await createRevision({
      annualId: annual.id, newAmount, reason, schoolId, expectedVersion: annual?.version ?? null,
    });
    setOpModal(null);
    await afterWrite(res, t('Révision proposée', 'Revision proposed', 'Revisión propuesta'));
  };
  const decideOp = async ({ decision, note }) => {
    const { kind, request } = decisionOp;
    const fn = kind === 'realloc' ? decideLineReallocation : decideRevision;
    const { error: e } = await fn({ id: request.id, decision, note });
    setDecisionOp(null);
    if (e) return failToast(e);
    await load(); toast.success(t('Décision enregistrée', 'Decision recorded', 'Decisión registrada'));
  };

  const btn = 'px-3 py-1.5 text-sm font-semibold rounded-lg transition-colors';

  if (loading) return <Layout><div className="text-gray-400 text-sm py-24 text-center animate-pulse">{t('Chargement…', 'Loading…', 'Cargando…')}</div></Layout>;
  if (error) return (
    <Layout><div className="max-w-md mx-auto py-24 text-center text-gray-500">
      <div className="text-3xl mb-2">📡</div>
      <p className="font-semibold text-gray-700">{t('Données indisponibles', 'Data unavailable', 'Datos no disponibles')}</p>
      <button onClick={load} className={`${btn} mt-4 text-white bg-indigo-600 hover:bg-indigo-700`}>{t('Réessayer', 'Retry', 'Reintentar')}</button>
    </div></Layout>
  );

  const annualStatusUi = ANNUAL_STATUS_UI[model?.annual.status || 'draft'] || ANNUAL_STATUS_UI.draft;
  const overAllocated = linesSum > envelope;

  return (
    <Layout>
      <div className="max-w-5xl mx-auto">
        {/* En-tête */}
        <div className="flex items-start justify-between mb-4 gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{t('Budgets', 'Budgets', 'Presupuestos')}</h1>
            <p className="text-sm text-gray-500 mt-1">{t('Annuel → rubriques → lignes → périodes & secteurs', 'Annual → categories → lines → periods & sectors', 'Anual → rúbricas → líneas')} — {year || '—'}</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Manuel d'emploi — généré localement (jsPDF), donc disponible aussi
                en LAN hors ligne. Accessible à TOUS, pas seulement à qui gère. */}
            <button className={`${btn} text-gray-700 bg-gray-100 hover:bg-gray-200`} onClick={downloadManual}
              title={t('Télécharger le manuel d’emploi (PDF)', 'Download the user manual (PDF)', 'Descargar el manual (PDF)')}>
              📘 {t('Manuel', 'Manual', 'Manual')}
            </button>
            {annual && (
              <button className={`${btn} text-indigo-700 bg-indigo-50 hover:bg-indigo-100`} onClick={() => setModal({ type: 'periods' })}>
                📅 {t('Périodes', 'Periods', 'Períodos')} {periods.length ? `(${periods.length})` : ''}
              </button>
            )}
            {!annual && canManage && (
              <button className={`${btn} text-white bg-indigo-600 hover:bg-indigo-700`} onClick={() => setModal({ type: 'annual' })}>
                + {t('Créer le budget annuel', 'Create annual budget', 'Crear presupuesto anual')}
              </button>
            )}
          </div>
        </div>

        {/* H3b-4 — bandeau « gouvernance distante » : état des intentions en attente d'application LAN */}
        {remoteMode && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-amber-800">
                🛰️ {t('Gouvernance à distance — les opérations sont appliquées par le serveur de l’école (LAN)', 'Remote governance — operations are applied by the school server (LAN)', 'Gobernanza remota — el servidor de la escuela (LAN) aplica las operaciones')}
              </p>
              <div className="flex items-center gap-2 shrink-0">
                {intentsAt && !intentsBusy && (
                  <span className="text-[11px] text-amber-700/70 tabular-nums hidden sm:inline">
                    {t('à jour à', 'updated at', 'al día a las')} {new Date(intentsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
                <button
                  type="button"
                  onClick={loadIntents}
                  disabled={intentsBusy}
                  aria-busy={intentsBusy}
                  title={t('Recharger l’état des demandes', 'Reload request status', 'Recargar el estado de las solicitudes')}
                  className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-amber-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
                    className={`w-3.5 h-3.5 ${intentsBusy ? 'animate-spin' : ''}`}>
                    <path d="M21 12a9 9 0 1 1-3.5-7.1" /><polyline points="21 3 21 9 15 9" />
                  </svg>
                  {intentsBusy ? t('Mise à jour…', 'Updating…', 'Actualizando…') : t('Rafraîchir', 'Refresh', 'Actualizar')}
                </button>
              </div>
            </div>
            {shownIntents.length > 0 ? (
              <ul className="mt-2 space-y-1">
                {shownIntents.slice(0, 6).map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="flex items-center gap-1.5 min-w-0 text-gray-700">
                      {i.status === 'pending' && (
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse shrink-0" aria-hidden="true" />
                      )}
                      <span className="truncate">{opLabel(t, i.op)} · {i.target}</span>
                    </span>
                    <span className={intentStatusPill(i.status)}>{intentStatusLabel(t, i.status)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-xs text-amber-700/80">{t('Aucune demande en attente.', 'No pending request.', 'Sin solicitudes pendientes.')}</p>
            )}
          </div>
        )}

        {!annual ? (
          <div className="bg-white rounded-xl border border-dashed border-gray-300 p-12 text-center">
            <div className="text-3xl mb-2">🗂️</div>
            <p className="text-gray-600 font-semibold">{t('Aucun budget annuel pour cette année', 'No annual budget for this year', 'Ningún presupuesto anual este año')}</p>
            <p className="text-gray-500 text-sm mt-1">{t('Créez le budget annuel global du complexe pour commencer.', 'Create the global annual budget to start.', 'Cree el presupuesto anual global.')}</p>
          </div>
        ) : (
          <>
            {/* Carte du budget annuel */}
            <div className={`bg-white rounded-2xl border p-5 mb-5 ${overAllocated ? 'border-rose-300' : 'border-gray-200'}`}>
              <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{t('Budget annuel global', 'Global annual budget', 'Presupuesto anual global')}</span>
                    <Badge ui={annualStatusUi} t={t} />
                  </div>
                  <h2 className="font-bold text-gray-900 text-lg">{annual.label}</h2>
                </div>
                <div className="flex flex-wrap gap-1.5 justify-end">
                  {canReqRealloc && activeLines.length >= 2 && (
                    <button className={`${btn} text-purple-700 bg-purple-50 hover:bg-purple-100`} onClick={() => setOpModal({ type: 'realloc' })}>↔ {t('Réallouer', 'Reallocate', 'Reasignar')}</button>
                  )}
                  {canReqRev && (
                    <button className={`${btn} text-purple-700 bg-purple-50 hover:bg-purple-100`} onClick={() => setOpModal({ type: 'revision' })}>↕ {t('Réviser l’annuel', 'Revise annual', 'Revisar anual')}</button>
                  )}
                  {canManage && model.annual.status === 'draft' && (
                    <button className={`${btn} text-gray-600 bg-gray-100 hover:bg-gray-200`} onClick={() => setModal({ type: 'annual', node: annual })}>{t('Modifier', 'Edit', 'Editar')}</button>
                  )}
                  {canClose && model.annual.status === 'active' && (
                    <button className={`${btn} text-slate-700 bg-slate-100 hover:bg-slate-200`} onClick={() => closeExercise('closed')}>{t('Clôturer l’exercice', 'Close exercise', 'Cerrar ejercicio')}</button>
                  )}
                  {canReopen && model.annual.status === 'closed' && (
                    <button className={`${btn} text-emerald-700 bg-emerald-50 hover:bg-emerald-100`} onClick={() => closeExercise('draft')}>{t('Rouvrir', 'Reopen', 'Reabrir')}</button>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
                <Stat label={t('Enveloppe', 'Envelope', 'Envolvente')} value={money(envelope)} tone="text-gray-800" />
                <Stat label={t('Réparti en lignes', 'Allocated to lines', 'En líneas')} value={money(linesSum)} tone={overAllocated ? 'text-rose-600' : 'text-indigo-700'} />
                <Stat label={t('Engagé', 'Committed', 'Comprometido')} value={money(model.annual.consumption.committed)} tone="text-amber-600" />
                <Stat label={t('Disponible', 'Available', 'Disponible')} value={money(model.annual.consumption.available)} tone={model.annual.consumption.depassement ? 'text-rose-600' : 'text-sky-700'} />
              </div>
              <div className="mt-3"><ProgressBar value={envelope > 0 ? Math.round((linesSum / envelope) * 100) : 0} danger={overAllocated} /></div>
              <p className={`text-xs mt-2 ${overAllocated ? 'text-rose-600 font-semibold' : 'text-gray-400'}`}>
                {t('Réparti', 'Allocated', 'Repartido')} {money(linesSum)} / {money(envelope)}
                {overAllocated ? ' — ' + t('les lignes actives ne peuvent dépasser l’enveloppe', 'active lines cannot exceed the envelope', 'las líneas activas no pueden superar') : ''}
              </p>
            </div>

            {periods.length === 0 && (
              <div className="mb-4 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                ⚠ {t('Configurez d’abord les périodes budgétaires de l’année (bouton « Périodes »).', 'Configure the year’s budget periods first (“Periods” button).', 'Configure primero los períodos (botón «Períodos»).')}
              </div>
            )}

            {/* Rubriques + lignes */}
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-bold text-gray-800">{t('Rubriques & lignes budgétaires', 'Categories & budget lines', 'Rúbricas y líneas')}</h3>
              {canManage && <button onClick={() => setModal({ type: 'rubrique' })} className="text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 rounded-lg">+ {t('Rubrique', 'Category', 'Rúbrica')}</button>}
            </div>

            {model.tree.length === 0 ? (
              <div className="bg-white rounded-xl border border-dashed border-gray-300 p-10 text-center">
                <p className="text-gray-500 text-sm">{t('Aucune rubrique. Créez une rubrique (ex. Fonctionnement) puis ses lignes.', 'No category. Create a category (e.g. Operations) then its lines.', 'Sin rúbricas.')}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {model.tree.map((node) => node.isLine
                  ? <LineCard key={node.id} node={node} raw={chapterById.get(node.id)} money={money} t={t} canManage={canManage} canApprove={canApprove}
                      onAlloc={() => setModal({ type: 'alloc', node: chapterById.get(node.id) })} onEdit={() => setModal({ type: 'line', node: chapterById.get(node.id) })}
                      onStatus={changeLineStatus} onRemove={() => removeChapter(node, true)} activation={lineActivation} btn={btn} />
                  : <RubriqueSection key={node.id} node={node} chapterById={chapterById} money={money} t={t} canManage={canManage} canApprove={canApprove}
                      onAddLine={() => setModal({ type: 'line', parent: chapterById.get(node.id) })}
                      onEditRubrique={() => setModal({ type: 'rubrique', node: chapterById.get(node.id) })}
                      onRemoveRubrique={() => removeChapter(node, false)}
                      onAlloc={(raw) => setModal({ type: 'alloc', node: raw })} onEditLine={(raw) => setModal({ type: 'line', node: raw, parent: chapterById.get(node.id) })}
                      onStatus={changeLineStatus} onRemoveLine={(n) => removeChapter(n, true)} activation={lineActivation} btn={btn} />
                )}
              </div>
            )}

            {/* Opérations tracées : réallocations entre lignes + révisions annuelles */}
            <OperationsPanel reallocations={reallocations} revisions={revisions} chapterById={chapterById}
              money={money} t={t} canDecRealloc={canDecRealloc} canDecRev={canDecRev}
              onDecide={(kind, request) => setDecisionOp({ kind, request })} />
          </>
        )}
      </div>

      {/* Modales */}
      {modal?.type === 'annual' && <AnnualBudgetModal budget={modal.node} year={year} onSave={saveAnnual} onClose={() => setModal(null)} />}
      {opModal?.type === 'realloc' && <LineReallocationModal lines={activeLines} onSubmit={submitRealloc} onClose={() => setOpModal(null)} />}
      {opModal?.type === 'revision' && annual && <AnnualRevisionModal annual={annual} onSubmit={submitRevision} onClose={() => setOpModal(null)} />}
      {decisionOp && (
        <OpDecisionModal title={decisionOp.kind === 'realloc' ? t('Décider la réallocation', 'Decide reallocation', 'Decidir reasignación') : t('Décider la révision', 'Decide revision', 'Decidir revisión')}
          onDecide={decideOp} onClose={() => setDecisionOp(null)} />
      )}
      {modal?.type === 'periods' && <BudgetPeriodsModal schoolId={schoolId} year={year} periods={periods} onChange={load} onClose={() => setModal(null)} />}
      {modal?.type === 'rubrique' && <LineFormModal chapter={modal.node} mode="rubrique" onSave={saveChapter} onClose={() => setModal(null)} />}
      {modal?.type === 'line' && (
        <LineFormModal chapter={modal.node} mode="line" parentLabel={modal.parent?.label}
          frozen={!!modal.node && (modal.node.status === 'active' || modal.node.status === 'closed')}
          onSave={saveChapter} onClose={() => setModal(null)} />
      )}
      {modal?.type === 'alloc' && modal.node && (
        <LineAllocationsModal line={modal.node} schoolId={schoolId} periods={periods} units={units}
          linePeriods={linePeriods} lineSectors={lineSectors} intents={intents}
          onChange={load} onClose={() => setModal(null)} />
      )}
      {confirmDialog}
    </Layout>
  );
}

// ── Panneau des opérations tracées (réallocations entre lignes + révisions) ──
function OperationsPanel({ reallocations, revisions, chapterById, money, t, canDecRealloc, canDecRev, onDecide }) {
  if (!reallocations.length && !revisions.length) return null;
  const label = (id) => chapterById.get(id)?.label || '—';
  const OpStatus = ({ s }) => {
    const map = { pending: ['bg-amber-100 text-amber-700', t('En attente', 'Pending', 'Pendiente')], applied: ['bg-emerald-100 text-emerald-700', t('Appliquée', 'Applied', 'Aplicada')], refused: ['bg-rose-100 text-rose-700', t('Refusée', 'Refused', 'Rechazada')] };
    const [cls, txt] = map[s] || map.pending;
    return <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${cls}`}>{txt}</span>;
  };
  const decided = (r) => (r.status === 'pending' ? '—' : (
    <div className="text-[11px] text-gray-500"><div>{r.decided_by || '—'}{r.decided_at ? ` · ${String(r.decided_at).slice(0, 10)}` : ''}</div>{r.decision_note && <div className="italic text-gray-400">{r.decision_note}</div>}</div>
  ));
  return (
    <div className="bg-white rounded-2xl border border-gray-200 mt-5 overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100"><h3 className="text-sm font-bold text-gray-800">{t('Opérations budgétaires', 'Budget operations', 'Operaciones')}</h3></div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[760px]">
          <thead className="bg-gray-50 text-gray-400 text-xs"><tr>
            <th className="text-left px-5 py-2 font-semibold">{t('Opération', 'Operation', 'Operación')}</th>
            <th className="text-left px-4 py-2 font-semibold">{t('Détail', 'Detail', 'Detalle')}</th>
            <th className="text-left px-4 py-2 font-semibold">{t('Avant → Après', 'Before → After', 'Antes → Después')}</th>
            <th className="text-left px-4 py-2 font-semibold">{t('Demandeur / motif', 'Requester / reason', 'Solicitante / motivo')}</th>
            <th className="text-left px-4 py-2 font-semibold">{t('Statut', 'Status', 'Estado')}</th>
            <th className="text-left px-4 py-2 font-semibold">{t('Décision', 'Decision', 'Decisión')}</th>
            <th className="px-4 py-2" />
          </tr></thead>
          <tbody>
            {reallocations.map((r) => (
              <tr key={r.id} className="border-t border-gray-100">
                <td className="px-5 py-2 font-medium text-gray-800">↔ {t('Réallocation', 'Reallocation', 'Reasignación')}</td>
                <td className="px-4 py-2 text-gray-600">{label(r.source_chapter_id)} → {label(r.dest_chapter_id)} · <b>{money(r.amount)}</b></td>
                <td className="px-4 py-2 text-gray-500 tabular-nums">{r.status === 'applied' ? `${money(r.source_before)}→${money(r.source_after)} / ${money(r.dest_before)}→${money(r.dest_after)}` : '—'}</td>
                <td className="px-4 py-2 text-gray-600">{r.requester || '—'}{r.reason ? <div className="text-xs text-gray-400">{r.reason}</div> : null}</td>
                <td className="px-4 py-2"><OpStatus s={r.status} /></td>
                <td className="px-4 py-2">{decided(r)}</td>
                <td className="px-4 py-2 text-right">{r.status === 'pending' && canDecRealloc && <button onClick={() => onDecide('realloc', r)} className="text-[11px] px-2 py-1 rounded bg-indigo-600 text-white hover:bg-indigo-700 font-semibold">{t('Décider', 'Decide', 'Decidir')}</button>}</td>
              </tr>
            ))}
            {revisions.map((r) => (
              <tr key={r.id} className="border-t border-gray-100">
                <td className="px-5 py-2 font-medium text-gray-800">↕ {t('Révision annuelle', 'Annual revision', 'Revisión anual')}</td>
                <td className="px-4 py-2 text-gray-600 tabular-nums">{money(r.old_amount)} → <b>{money(r.new_amount)}</b> <span className={`${r.new_amount - r.old_amount < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>({r.new_amount - r.old_amount >= 0 ? '+' : ''}{money(r.new_amount - r.old_amount)})</span></td>
                <td className="px-4 py-2 text-gray-500 tabular-nums">{t('Initial', 'Initial', 'Inicial')} {money(r.initial_amount)}</td>
                <td className="px-4 py-2 text-gray-600">{r.requester || '—'}{r.reason ? <div className="text-xs text-gray-400">{r.reason}</div> : null}</td>
                <td className="px-4 py-2"><OpStatus s={r.status} /></td>
                <td className="px-4 py-2">{decided(r)}</td>
                <td className="px-4 py-2 text-right">{r.status === 'pending' && canDecRev && <button onClick={() => onDecide('revision', r)} className="text-[11px] px-2 py-1 rounded bg-indigo-600 text-white hover:bg-indigo-700 font-semibold">{t('Décider', 'Decide', 'Decidir')}</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Rubrique (agrégat) + ses lignes ──────────────────────────────────────────
function RubriqueSection({ node, chapterById, money, t, canManage, canApprove, onAddLine, onEditRubrique, onRemoveRubrique, onAlloc, onEditLine, onStatus, onRemoveLine, activation, btn }) {
  const c = node.consumption;
  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-3 flex items-center justify-between border-b border-gray-100 flex-wrap gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-gray-800 truncate">{node.label}</h3>
          <div className="text-xs text-gray-500 tabular-nums">
            {t('Prévu', 'Planned', 'Previsto')} {money(c.ceiling)} · {t('Engagé', 'Committed', 'Comprom.')} {money(c.committed)} · {t('Dispo', 'Avail.', 'Disp.')} <b className={c.available < 0 ? 'text-rose-600' : 'text-sky-700'}>{money(c.available)}</b>
          </div>
        </div>
        {canManage && (
          <div className="flex items-center gap-1.5">
            <button onClick={onAddLine} className="text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 rounded-lg">+ {t('Ligne', 'Line', 'Línea')}</button>
            <button onClick={onEditRubrique} className="text-[11px] text-gray-400 hover:text-gray-700 px-1">✎</button>
            <button onClick={onRemoveRubrique} className="text-[11px] text-rose-400 hover:text-rose-600 px-1">✕</button>
          </div>
        )}
      </div>
      {node.children.length === 0 ? (
        <p className="text-sm text-gray-400 py-6 text-center px-4">{t('Aucune ligne. Ajoutez une ligne (ex. Carburant).', 'No line. Add a line (e.g. Fuel).', 'Sin líneas.')}</p>
      ) : (
        <div className="divide-y divide-gray-100">
          {node.children.map((ln) => (
            <LineCard key={ln.id} node={ln} raw={chapterById.get(ln.id)} money={money} t={t} canManage={canManage} canApprove={canApprove}
              onAlloc={() => onAlloc(chapterById.get(ln.id))} onEdit={() => onEditLine(chapterById.get(ln.id))}
              onStatus={onStatus} onRemove={() => onRemoveLine(ln)} activation={activation} inRubrique btn={btn} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Carte d'une ligne budgétaire ─────────────────────────────────────────────
function LineCard({ node, raw, money, t, canManage, canApprove, onAlloc, onEdit, onStatus, onRemove, activation, inRubrique, btn }) {
  const c = node.consumption;
  const scopeUi = SCOPE_UI[node.scope] || SCOPE_UI.complex;
  const statusUi = STATUS_UI[node.status] || STATUS_UI.draft;
  const errs = node.status === 'draft' && raw ? activation(raw) : [];
  const canActivate = node.status === 'draft' && errs.length === 0;
  const Wrap = inRubrique ? 'div' : 'div';
  return (
    <Wrap className={`${inRubrique ? 'px-5 py-3' : 'bg-white rounded-2xl border border-gray-200 p-5'}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-900 truncate">{node.label}</span>
            <Badge ui={statusUi} t={t} />
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${scopeUi.color}`}>{t(...scopeUi.label)}</span>
          </div>
          <div className="text-xs text-gray-500 mt-0.5 tabular-nums">
            {t('Montant', 'Amount', 'Monto')} {money(c.ceiling)} · {t('Engagé', 'Committed', 'Comprom.')} {money(c.committed)} · {t('Dispo', 'Avail.', 'Disp.')} <b className={c.available < 0 ? 'text-rose-600' : 'text-sky-700'}>{money(c.available)}</b>
          </div>
          <div className="flex items-center gap-3 mt-1 text-[11px]">
            <PctChip label={t('Périodes', 'Periods', 'Períodos')} pct={node.periodPct} />
            {node.scope === 'sectors' && <PctChip label={t('Secteurs', 'Sectors', 'Sectores')} pct={node.sectorPct} />}
          </div>
        </div>
        <div className="w-40 shrink-0">
          <ProgressBar value={c.taux} danger={c.depassement} />
          <div className="text-[11px] text-gray-400 text-right mt-0.5 tabular-nums">{c.taux}%</div>
        </div>
      </div>

      {/* Anomalies bloquant l'activation */}
      {node.status === 'draft' && errs.length > 0 && (
        <div className="mt-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
          {t('À compléter avant activation', 'Complete before activation', 'Completar antes de activar')} : {errs.map((e) => t(...(LINE_ERROR_LABELS[e] || [e]))).join(' · ')}
        </div>
      )}

      {canManage && (
        <div className="flex flex-wrap gap-1.5 mt-2.5">
          {node.status === 'draft' && (
            <>
              <button onClick={onAlloc} className={`${btn} text-indigo-700 bg-indigo-50 hover:bg-indigo-100`}>⚖ {t('Répartir', 'Break down', 'Repartir')}</button>
              {canApprove && (
                <button onClick={() => onStatus(raw, 'active')} disabled={!canActivate}
                  title={canActivate ? '' : t('Complétez la répartition (Σ = 100 %) et respectez l’enveloppe.', 'Complete the breakdown (Σ = 100%) within the envelope.', 'Complete el reparto (Σ = 100%).')}
                  className={`${btn} text-emerald-700 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-40`}>✓ {t('Activer', 'Activate', 'Activar')}</button>
              )}
              <button onClick={onEdit} className={`${btn} text-gray-600 bg-gray-100 hover:bg-gray-200`}>{t('Modifier', 'Edit', 'Editar')}</button>
              <button onClick={onRemove} className={`${btn} text-rose-600 bg-rose-50 hover:bg-rose-100`}>{t('Supprimer', 'Delete', 'Eliminar')}</button>
            </>
          )}
          {node.status === 'active' && (
            <>
              <button onClick={() => onStatus(raw, 'closed')} className={`${btn} text-slate-700 bg-slate-100 hover:bg-slate-200`}>{t('Clôturer', 'Close', 'Cerrar')}</button>
              <span className="text-[11px] text-gray-400 self-center">{t('Montant & répartition verrouillés (réallocation/révision en préparation)', 'Amount & breakdown locked (reallocation/revision coming)', 'Monto y reparto bloqueados')}</span>
            </>
          )}
          {node.status === 'closed' && canReopenLine(canApprove) && (
            <button onClick={() => onStatus(raw, 'active')} className={`${btn} text-emerald-700 bg-emerald-50 hover:bg-emerald-100`}>{t('Rouvrir', 'Reopen', 'Reabrir')}</button>
          )}
        </div>
      )}
    </Wrap>
  );
}
function canReopenLine(canApprove) { return canApprove; }

function PctChip({ label, pct }) {
  const complete = Math.abs((pct || 0) - 100) <= 0.01;
  return (
    <span className={`px-1.5 py-0.5 rounded ${complete ? 'bg-emerald-50 text-emerald-700' : (pct || 0) > 100 ? 'bg-rose-50 text-rose-700' : 'bg-gray-100 text-gray-500'}`}>
      {label} {pct ?? 0}%
    </span>
  );
}

function Stat({ label, value, tone }) {
  return <div><div className={`text-base font-bold ${tone}`}>{value}</div><div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{label}</div></div>;
}
