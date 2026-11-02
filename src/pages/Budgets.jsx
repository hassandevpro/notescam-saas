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
import { AnnualBudgetModal, unitLabel } from '../components/budgets/BudgetHierarchyModals';
import { lineFullLabel } from '../lib/budgetLabels';
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
import { InlineLoader } from '../components/AppLoader';
import { summarizeBudget, topLines, flattenLines } from '../lib/budgetSummary';
import { countByState, blockerGroups, computeSteps, filterTree, hasActiveFilters, planBulkActivation } from '../lib/budgetLineView';
import { BudgetSteps, BlockersCard, ReadyCard, ListToolbar, HowItWorks } from '../components/budgets/BudgetListTools';
import BulkActivateModal from '../components/budgets/BulkActivateModal';

const Badge = ({ ui, t }) => <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${ui.color}`}>{t(...ui.label)}</span>;

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
const intentStatusPill = (s) => `text-xs font-semibold px-2 py-0.5 rounded-full ${
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
          op: p.op, target: p.target, at: e.occurred_at, status, resolvedAt, data: p.data || null };
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
  // Réparti / activé / dépensable : trois chiffres distincts (voir lib/budgetSummary).
  const summary = useMemo(() => summarizeBudget({ envelope, tree: model?.tree || [] }), [envelope, model]);
  const [showAllTop, setShowAllTop] = useState(false);
  const overTop = useMemo(() => topLines(summary, showAllTop ? 10 : 3), [summary, showAllTop]);

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

  // Ce que la suppression emporte, d'après le schéma : les RÉPARTITIONS (période, secteur) et,
  // pour une ligne active/clôturée, l'historique de ses réallocations sont supprimés ; les
  // DÉPENSES sont CONSERVÉES mais détachées de la ligne (ON DELETE SET NULL) ; supprimer une
  // rubrique supprime ses lignes. On le compte et on le dit, au lieu d'annoncer « ses dépenses ».
  const removeChapter = async (node, isLineNode) => {
    const lineIds = new Set(isLineNode ? [node.id] : flattenLines(node.children || []).map((l) => l.id));
    const nAlloc = linePeriods.filter((a) => lineIds.has(a.budget_chapter_id)).length + lineSectors.filter((a) => lineIds.has(a.budget_chapter_id)).length;
    const exps = expenses.filter((e) => lineIds.has(e.budget_chapter_id));
    const expTotal = exps.reduce((n, e) => n + (Number(e.amount) || 0), 0);
    const hasFinalized = [...lineIds].some((id) => { const c = chapterById.get(id); return c && c.status !== 'draft'; });
    const message = (
      <span className="block space-y-2">
        <span className="block">
          {isLineNode
            ? t(`Cette ligne a ${nAlloc} répartition(s), qui seront supprimées.`, `This line has ${nAlloc} breakdown(s), which will be deleted.`, `Esta línea tiene ${nAlloc} reparto(s), que se eliminarán.`)
            : t(`Cette rubrique contient ${lineIds.size} ligne(s) et ${nAlloc} répartition(s), qui seront supprimées.`, `This category holds ${lineIds.size} line(s) and ${nAlloc} breakdown(s), which will be deleted.`, `Esta rúbrica contiene ${lineIds.size} línea(s) y ${nAlloc} reparto(s), que se eliminarán.`)}
        </span>
        {exps.length > 0 ? (
          <span className="block font-semibold text-rose-700">
            {t(`${exps.length} dépense(s) (${money(expTotal)}) resteront enregistrées mais ne seront plus rattachées à une ligne.`,
               `${exps.length} expense(s) (${money(expTotal)}) will be kept but no longer attached to a line.`,
               `${exps.length} gasto(s) (${money(expTotal)}) se conservarán pero sin línea asociada.`)}
          </span>
        ) : (
          <span className="block">{t('Aucune dépense n’est rattachée.', 'No expense is attached.', 'Ningún gasto asociado.')}</span>
        )}
        {hasFinalized && (
          <span className="block font-semibold text-rose-700">
            {t('Ligne active ou clôturée : l’historique de ses réallocations sera aussi supprimé.', 'Active or closed line: its reallocation history will also be deleted.', 'Línea activa o cerrada: también se eliminará su historial de reasignaciones.')}
          </span>
        )}
      </span>
    );
    if (!(await confirm({ tone: 'danger', title: isLineNode ? t('Supprimer la ligne', 'Delete line', 'Eliminar línea') : t('Supprimer la rubrique', 'Delete category', 'Eliminar rúbrica'), message, confirmLabel: t('Supprimer', 'Delete', 'Eliminar') }))) return;
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

  // ── Liste : état des lignes, recherche, tri, filtres, rubriques repliables ──
  const errsOf = useCallback((n) => ((n.status === 'draft' || n.status == null) && chapterById.get(n.id) ? lineActivation(chapterById.get(n.id)) : []), [chapterById, lineActivation]);
  const allLines = useMemo(() => flattenLines(model?.tree || []), [model]);
  const counts = useMemo(() => countByState(allLines, errsOf), [allLines, errsOf]);
  const { groups: blockerList, todoCount } = useMemo(() => blockerGroups(allLines, errsOf), [allLines, errsOf]);
  const steps = useMemo(() => computeSteps({ periodCount: periods.length, lineCount: counts.all, todoCount: counts.todo, readyCount: counts.ready, activeCount: counts.active }), [periods.length, counts]);
  const [query, setQuery] = useState('');
  const [stateFilter, setStateFilter] = useState('all');
  const [blocker, setBlocker] = useState(null);
  const [sort, setSort] = useState('order');
  const filters = { query, state: stateFilter, blocker, sort };
  const filtersActive = hasActiveFilters(filters);
  const clearFilters = () => { setQuery(''); setStateFilter('all'); setBlocker(null); };
  const visibleTree = useMemo(() => filterTree(model?.tree || [], filters, errsOf), [model, query, stateFilter, blocker, sort, errsOf]); // eslint-disable-line react-hooks/exhaustive-deps

  // Rubriques repliées : retenues par budget dans localStorage (indisponible → tout déplié).
  const collapseKey = annual ? 'nc.budgets.collapsed.' + annual.id : null;
  const [collapsed, setCollapsed] = useState(() => new Set());
  useEffect(() => {
    if (!collapseKey) return;
    try { const raw = localStorage.getItem(collapseKey); setCollapsed(new Set(raw ? JSON.parse(raw) : [])); }
    catch { setCollapsed(new Set()); }
  }, [collapseKey]);
  const persistCollapsed = (next) => { try { if (collapseKey) localStorage.setItem(collapseKey, JSON.stringify([...next])); } catch { /* stockage indisponible : l'état reste en mémoire */ } };
  const toggleCollapsed = (id) => setCollapsed((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); persistCollapsed(n); return n; });
  const rubriqueIds = useMemo(() => (model?.tree || []).filter((n) => !n.isLine).map((n) => n.id), [model]);
  const collapseAll = () => { const n = new Set(rubriqueIds); setCollapsed(n); persistCollapsed(n); };
  const expandAll = () => { const n = new Set(); setCollapsed(n); persistCollapsed(n); };
  // Pendant une recherche ou un filtre, rien n'est replié : on ne cache jamais une correspondance.
  const isCollapsed = (id) => !filtersActive && collapsed.has(id);

  // Ancre vers la carte d'une ligne : dé-filtre et déplie si besoin, puis halo bref.
  const goToLine = (id) => {
    const ln = allLines.find((l) => l.id === id);
    if (filtersActive) clearFilters();
    if (ln?.parentId && collapsed.has(ln.parentId)) { const n = new Set(collapsed); n.delete(ln.parentId); setCollapsed(n); persistCollapsed(n); }
    setTimeout(() => {
      const el = document.getElementById('line-' + id);
      if (!el) return;
      const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      el.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'center' });
      el.classList.add('ring-2', 'ring-rose-400');
      setTimeout(() => el.classList.remove('ring-2', 'ring-rose-400'), 2500);
    }, 60);
  };

  // « Rubrique › Ligne · Secteur » (C2) : treize libellés existent en double.
  const unitNameById = useMemo(() => new Map(units.map((u) => [u.id, unitLabel(t, u)])), [units, t]);
  const lineLabelOf = useCallback((l) => lineFullLabel(l, chapterById, {
    sectorNames: lineSectors.filter((a) => a.budget_chapter_id === l.id).map((a) => unitNameById.get(a.school_unit_id)),
  }), [chapterById, lineSectors, unitNameById]);
  const otherLinesFor = (lineId) => annualChapters
    .filter((c) => isLine(c) && c.id !== lineId && linePeriods.some((a) => a.budget_chapter_id === c.id))
    .map((c) => ({ id: c.id, label: lineLabelOf(c) }));

  // Demandes en attente d'application (gouvernance distante) → badge sur la ligne.
  const pendingAgg = useMemo(() => new Set(intents.filter((i) => i.status === 'pending' && i.agg).map((i) => i.agg)), [intents]);

  // Activation en lot : le plan rejoue le contrôle du moteur ligne après ligne.
  const [bulkOpen, setBulkOpen] = useState(false);
  const bulkDirty = useRef(false);
  const bulkPlan = useMemo(() => (bulkOpen && annual
    ? planBulkActivation({
      candidates: allLines.filter((l) => errsOf(l).length === 0 && l.status === 'draft').map((l) => chapterById.get(l.id)).filter(Boolean),
      annual, chapters: annualChapters, idx,
    })
    : null), [bulkOpen, allLines, errsOf, chapterById, annual, annualChapters, idx]);
  const activateOne = (raw) => upsertBudgetChapter({ ...raw, status: 'active' });
  const closeBulk = () => {
    setBulkOpen(false);
    if (bulkDirty.current) { bulkDirty.current = false; load(); loadIntents(); }   // recharger APRÈS la fermeture : load() affiche le chargement plein page
  };

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
  // Enveloppe d'un budget en brouillon : modifiable directement ; sinon, révision tracée.
  const reviseEnvelope = () => (model?.annual.status === 'draft' && canManage ? setModal({ type: 'annual', node: annual }) : setOpModal({ type: 'revision' }));
  const onReallocFor = canReqRealloc && activeLines.length >= 2 ? () => setOpModal({ type: 'realloc' }) : undefined;
  const onReviseFor = canReqRev ? () => setOpModal({ type: 'revision' }) : undefined;

  if (loading) return <Layout><InlineLoader /></Layout>;
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
                🛰️ {t('Ici, vos modifications sont envoyées au poste de l’école, qui les applique. Elles peuvent mettre quelques minutes à apparaître.', 'Here, your changes are sent to the school workstation, which applies them. They can take a few minutes to appear.', 'Aquí, sus cambios se envían al puesto de la escuela, que los aplica. Pueden tardar unos minutos en aparecer.')}
              </p>
              <div className="flex items-center gap-2 shrink-0">
                {intentsAt && !intentsBusy && (
                  <span className="text-xs text-amber-700/70 tabular-nums hidden sm:inline">
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
            <div className="mt-4 text-left max-w-xl mx-auto"><HowItWorks defaultOpen /></div>
          </div>
        ) : (
          <>
            {/* D1 : sans droit de gérer, on le dit au lieu de masquer les actions en silence. */}
            {!canManage && (
              <div role="status" className="mb-4 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
                {t('Vous consultez ce budget en lecture seule. Pour le modifier, demandez le rôle correspondant à l’administrateur.', 'You are viewing this budget read-only. To change it, ask the administrator for the matching role.', 'Está viendo este presupuesto en solo lectura. Para modificarlo, pida el rol correspondiente al administrador.')}
              </div>
            )}

            <BudgetSteps steps={steps} details={{
              allocation: todoCount > 0 ? t(`${todoCount} à compléter`, `${todoCount} to complete`, `${todoCount} por completar`) : '',
              activation: counts.ready > 0 ? t(`${counts.ready} prêtes`, `${counts.ready} ready`, `${counts.ready} listas`) : '',
              expenses: summary.activeCount > 0 ? t(`${summary.activeCount} lignes actives`, `${summary.activeCount} active lines`, `${summary.activeCount} líneas activas`) : '',
            }} />

            {/* Carte du budget annuel */}
            <div className={`bg-white rounded-2xl border p-5 mb-5 ${overAllocated ? 'border-rose-300' : 'border-gray-200'}`}>
              <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{t('Budget annuel global', 'Global annual budget', 'Presupuesto anual global')}</span>
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
              <div className="mb-3"><HowItWorks /></div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
                <Stat label={t('Enveloppe', 'Envelope', 'Envolvente')} value={money(envelope)} tone="text-gray-800" hint={t('La somme à ne pas dépasser cette année.', 'The sum not to exceed this year.', 'La suma que no se debe superar este año.')} />
                <Stat label={t('Réparti en lignes', 'Allocated to lines', 'En líneas')} value={money(summary.reparti)} tone={overAllocated ? 'text-rose-600' : 'text-indigo-700'} hint={t('Total des montants saisis dans les lignes.', 'Total of the amounts entered in the lines.', 'Total de los montos de las líneas.')} />
                <Stat label={t('Activé', 'Activated', 'Activado')} value={money(summary.activeAmount)} tone="text-emerald-700" hint={t('Total des lignes ouvertes aux dépenses.', 'Total of the lines open to spending.', 'Total de las líneas abiertas al gasto.')} />
                <Stat label={t('Dépensable maintenant', 'Spendable now', 'Gastable ahora')} value={money(summary.spendable)} tone="text-sky-700" hint={t('Ce qui reste sur les lignes activées.', 'What is left on the activated lines.', 'Lo que queda en las líneas activadas.')} />
              </div>
              {summary.activeCount === 0 && (
                <p className="mt-3 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2" role="status">
                  {t('Rien n’est encore dépensable : activez au moins une ligne.', 'Nothing can be spent yet: activate at least one line.', 'Aún no se puede gastar: active al menos una línea.')}
                </p>
              )}
              <div className="mt-3"><ProgressBar value={envelope > 0 ? Math.round((summary.reparti / envelope) * 100) : 0} danger={overAllocated} /></div>
              <p className={`text-xs mt-2 ${overAllocated ? 'text-rose-700 font-semibold' : 'text-gray-500'}`}>
                {t('Réparti', 'Allocated', 'Repartido')} {money(summary.reparti)} / {money(envelope)}
                {' · '}{t('Dépensé ou en cours de validation', 'Spent or pending approval', 'Gastado o en validación')} {money(model.annual.consumption.committed)}
              </p>
              {overAllocated && (
                <div role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
                  <p className="font-semibold">
                    {t(`Les lignes totalisent ${money(summary.overBy)} de plus que l’enveloppe. Réduisez des lignes, ou révisez l’enveloppe.`,
                       `The lines add up to ${money(summary.overBy)} more than the envelope. Reduce some lines, or revise the envelope.`,
                       `Las líneas suman ${money(summary.overBy)} más que la envolvente. Reduzca líneas o revise la envolvente.`)}
                  </p>
                  <ul className="mt-2 space-y-1">
                    {overTop.map((l) => (
                      <li key={l.id} className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="min-w-0">
                          <b className="font-semibold">{l.label}</b>
                          {l.parentLabel && <span className="text-rose-700/80"> · {l.parentLabel}</span>}
                          <span className="tabular-nums"> — {money(l.amount)}</span>
                        </span>
                        <button type="button" onClick={() => goToLine(l.id)} className="text-xs font-semibold underline min-h-9 px-1">
                          {t('Aller à la ligne', 'Go to line', 'Ir a la línea')}
                        </button>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button type="button" onClick={() => setShowAllTop((v) => !v)} className={`${btn} text-rose-800 bg-white border border-rose-200 hover:bg-rose-100`}>
                      {showAllTop ? t('Voir moins', 'Show fewer', 'Ver menos') : t('Voir les plus grosses lignes', 'See the largest lines', 'Ver las líneas más grandes')}
                    </button>
                    {((model.annual.status === 'draft' && canManage) || canReqRev) && (
                      <button type="button" onClick={reviseEnvelope} className={`${btn} text-white bg-rose-600 hover:bg-rose-700`}>
                        {t('Réviser l’enveloppe', 'Revise the envelope', 'Revisar la envolvente')}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Téléphone : le résumé reste visible pendant qu'on parcourt les lignes (sous l'en-tête fixe). */}
            <div className="sm:hidden sticky top-14 z-30 mb-3 rounded-lg border border-gray-200 bg-white/95 backdrop-blur px-3 py-2 flex flex-wrap justify-between gap-x-3 gap-y-0.5 text-xs tabular-nums" aria-label={t('Résumé du budget', 'Budget summary', 'Resumen del presupuesto')}>
              <span>{t('Réparti', 'Allocated', 'Repartido')} <b>{money(summary.reparti)}</b></span>
              <span>{t('Activé', 'Activated', 'Activado')} <b>{money(summary.activeAmount)}</b></span>
              <span>{t('Dépensable', 'Spendable', 'Gastable')} <b>{money(summary.spendable)}</b></span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5">
              <BlockersCard todoCount={todoCount} groups={blockerList} activeBlocker={blocker}
                onPick={(code) => { setBlocker(code); if (code) setStateFilter('all'); }} />
              <ReadyCard readyCount={counts.ready} canApprove={canApprove} canManage={canManage} onOpen={() => setBulkOpen(true)} />
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

            <ListToolbar query={query} onQuery={setQuery} sort={sort} onSort={setSort} state={stateFilter} onState={(v) => { setStateFilter(v); setBlocker(null); }}
              counts={counts} onCollapseAll={collapseAll} onExpandAll={expandAll} />
            {blocker && (
              <p className="mb-2 text-xs text-gray-600">
                {t('Filtre par motif :', 'Reason filter:', 'Filtro por motivo:')} <b>{t(...(LINE_ERROR_LABELS[blocker] || [blocker, blocker, blocker]))}</b>{' '}
                <button type="button" onClick={() => setBlocker(null)} className="underline min-h-9 px-1">{t('Retirer', 'Remove', 'Quitar')}</button>
              </p>
            )}

            {model.tree.length === 0 ? (
              <div className="bg-white rounded-xl border border-dashed border-gray-300 p-10 text-center">
                <p className="text-gray-500 text-sm">{t('Aucune rubrique. Créez une rubrique (ex. Fonctionnement) puis ses lignes.', 'No category. Create a category (e.g. Operations) then its lines.', 'Sin rúbricas.')}</p>
              </div>
            ) : visibleTree.length === 0 ? (
              <div className="bg-white rounded-xl border border-dashed border-gray-300 p-10 text-center" role="status">
                <p className="text-gray-600 text-sm font-semibold">{t('Aucune ligne ne correspond.', 'No line matches.', 'Ninguna línea coincide.')}</p>
                <button type="button" onClick={clearFilters} className={`${btn} mt-3 text-indigo-700 bg-indigo-50 hover:bg-indigo-100`}>{t('Effacer les filtres', 'Clear filters', 'Borrar filtros')}</button>
              </div>
            ) : (
              <div className="space-y-3">
                {visibleTree.map((node) => node.isLine
                  ? <LineCard key={node.id} node={node} raw={chapterById.get(node.id)} money={money} t={t} canManage={canManage} canApprove={canApprove}
                      onAlloc={() => setModal({ type: 'alloc', node: chapterById.get(node.id) })} onEdit={() => setModal({ type: 'line', node: chapterById.get(node.id) })}
                      onStatus={changeLineStatus} onRemove={() => removeChapter(node, true)} activation={lineActivation} btn={btn} onRealloc={onReallocFor} onRevise={onReviseFor}
                      pending={pendingAgg.has(node.id)} />
                  : <RubriqueSection key={node.id} node={node} chapterById={chapterById} money={money} t={t} canManage={canManage} canApprove={canApprove}
                      onAddLine={() => setModal({ type: 'line', parent: chapterById.get(node.id) })}
                      onEditRubrique={() => setModal({ type: 'rubrique', node: chapterById.get(node.id) })}
                      onRemoveRubrique={() => removeChapter(node, false)}
                      onAlloc={(raw) => setModal({ type: 'alloc', node: raw })} onEditLine={(raw) => setModal({ type: 'line', node: raw, parent: chapterById.get(node.id) })}
                      onStatus={changeLineStatus} onRemoveLine={(n) => removeChapter(n, true)} activation={lineActivation} btn={btn} onRealloc={onReallocFor} onRevise={onReviseFor}
                      collapsed={isCollapsed(node.id)} onToggle={() => toggleCollapsed(node.id)} pendingAgg={pendingAgg} />
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
      {opModal?.type === 'realloc' && <LineReallocationModal lines={activeLines} lineLabel={lineLabelOf} onSubmit={submitRealloc} onClose={() => setOpModal(null)} />}
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
          linePeriods={linePeriods} lineSectors={lineSectors} intents={intents} otherLines={otherLinesFor(modal.node.id)}
          onChange={load} onClose={() => setModal(null)} />
      )}
      {bulkOpen && bulkPlan && (
        <BulkActivateModal plan={bulkPlan} remote={remoteMode} labelOf={lineLabelOf} onActivate={activateOne}
          onDone={() => { bulkDirty.current = true; }} onClose={closeBulk} />
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
    return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cls}`}>{txt}</span>;
  };
  const decided = (r) => (r.status === 'pending' ? '—' : (
    <div className="text-xs text-gray-500"><div>{r.decided_by || '—'}{r.decided_at ? ` · ${String(r.decided_at).slice(0, 10)}` : ''}</div>{r.decision_note && <div className="italic text-gray-400">{r.decision_note}</div>}</div>
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
                <td className="px-4 py-2 text-right">{r.status === 'pending' && canDecRealloc && <button onClick={() => onDecide('realloc', r)} className="text-xs px-2 py-1 rounded bg-indigo-600 text-white hover:bg-indigo-700 font-semibold">{t('Décider', 'Decide', 'Decidir')}</button>}</td>
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
                <td className="px-4 py-2 text-right">{r.status === 'pending' && canDecRev && <button onClick={() => onDecide('revision', r)} className="text-xs px-2 py-1 rounded bg-indigo-600 text-white hover:bg-indigo-700 font-semibold">{t('Décider', 'Decide', 'Decidir')}</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Rubrique (agrégat) + ses lignes ──────────────────────────────────────────
// Bouton icône : cible d'au moins 36 px (44 px au toucher), nom accessible obligatoire.
const iconBtn = 'inline-flex items-center justify-center min-h-9 min-w-9 [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11 text-sm text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-lg';

function RubriqueSection({ node, chapterById, money, t, canManage, canApprove, onAddLine, onEditRubrique, onRemoveRubrique, onAlloc, onEditLine, onStatus, onRemoveLine, activation, btn, onRealloc, onRevise, collapsed = false, onToggle, pendingAgg }) {
  const c = node.consumption;
  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-3 flex items-center justify-between border-b border-gray-100 flex-wrap gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-gray-800">
            <button type="button" onClick={onToggle} aria-expanded={!collapsed} aria-controls={`rub-${node.id}`}
              className="flex items-center gap-2 text-left min-h-9 max-w-full">
              <svg aria-hidden="true" className={`w-3.5 h-3.5 shrink-0 transition-transform ${collapsed ? '' : 'rotate-90'}`} viewBox="0 0 20 20" fill="currentColor"><path d="M7 4l6 6-6 6V4z" /></svg>
              <span className="truncate">{node.label}</span>
              <span className="text-xs font-normal text-gray-500 shrink-0">({node.children.length})</span>
              {(pendingAgg?.has(node.id) || node.children.some((c) => pendingAgg?.has(c.id))) && <PendingBadge t={t} />}
            </button>
          </h3>
          <div className="text-xs text-gray-500 tabular-nums">
            {t('Prévu', 'Planned', 'Previsto')} {money(c.ceiling)} · {t('Dépensé ou en cours de validation', 'Spent or pending approval', 'Gastado o en validación')} {money(c.committed)} · {t('Dispo', 'Avail.', 'Disp.')} <b className={c.available < 0 ? 'text-rose-600' : 'text-sky-700'}>{money(c.available)}</b>
          </div>
        </div>
        {canManage && (
          <div className="flex items-center gap-1.5">
            <button onClick={onAddLine} className="text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 rounded-lg">+ {t('Ligne', 'Line', 'Línea')}</button>
            <button type="button" onClick={onEditRubrique} aria-label={t('Modifier la rubrique', 'Edit category', 'Editar rúbrica')} title={t('Modifier la rubrique', 'Edit category', 'Editar rúbrica')} className={iconBtn}><span aria-hidden="true">✎</span></button>
            <button type="button" onClick={onRemoveRubrique} aria-label={t('Supprimer la rubrique', 'Delete category', 'Eliminar rúbrica')} title={t('Supprimer la rubrique', 'Delete category', 'Eliminar rúbrica')} className={`${iconBtn} text-rose-500 hover:text-rose-700`}><span aria-hidden="true">✕</span></button>
          </div>
        )}
      </div>
      {collapsed ? null : node.children.length === 0 ? (
        <p className="text-sm text-gray-400 py-6 text-center px-4">{t('Aucune ligne. Ajoutez une ligne (ex. Carburant).', 'No line. Add a line (e.g. Fuel).', 'Sin líneas.')}</p>
      ) : (
        <div id={`rub-${node.id}`} className="divide-y divide-gray-100">
          {node.children.map((ln) => (
            <LineCard key={ln.id} node={ln} raw={chapterById.get(ln.id)} money={money} t={t} canManage={canManage} canApprove={canApprove}
              onAlloc={() => onAlloc(chapterById.get(ln.id))} onEdit={() => onEditLine(chapterById.get(ln.id))}
              onStatus={onStatus} onRemove={() => onRemoveLine(ln)} activation={activation} inRubrique btn={btn} onRealloc={onRealloc} onRevise={onRevise} pending={pendingAgg?.has(ln.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Carte d'une ligne budgétaire ─────────────────────────────────────────────
function LineCard({ node, raw, money, t, canManage, canApprove, onAlloc, onEdit, onStatus, onRemove, activation, inRubrique, btn, onRealloc, onRevise, pending }) {
  const c = node.consumption;
  const scopeUi = SCOPE_UI[node.scope] || SCOPE_UI.complex;
  const statusUi = STATUS_UI[node.status] || STATUS_UI.draft;
  const errs = node.status === 'draft' && raw ? activation(raw) : [];
  const canActivate = node.status === 'draft' && errs.length === 0;
  const secondary = (
    <>
      <button type="button" onClick={onEdit} className={`${btn} text-gray-600 bg-gray-100 hover:bg-gray-200`}>{t('Modifier', 'Edit', 'Editar')}</button>
      <button type="button" onClick={onRemove} className={`${btn} text-rose-600 bg-rose-50 hover:bg-rose-100`}>{t('Supprimer', 'Delete', 'Eliminar')}</button>
    </>
  );
  const Wrap = inRubrique ? 'div' : 'div';
  return (
    <Wrap id={`line-${node.id}`} className={`scroll-mt-24 transition-shadow ${inRubrique ? 'px-5 py-3' : 'bg-white rounded-2xl border border-gray-200 p-5'}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-900 truncate">{node.label}</span>
            <Badge ui={statusUi} t={t} />
            {pending && <PendingBadge t={t} />}
            <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${scopeUi.color}`}>{t(...scopeUi.label)}</span>
          </div>
          <div className="text-xs text-gray-500 mt-0.5 tabular-nums">
            {t('Montant', 'Amount', 'Monto')} {money(c.ceiling)} · {t('Dépensé ou en cours de validation', 'Spent or pending approval', 'Gastado o en validación')} {money(c.committed)} · {t('Dispo', 'Avail.', 'Disp.')} <b className={c.available < 0 ? 'text-rose-600' : 'text-sky-700'}>{money(c.available)}</b>
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs">
            <PctChip label={t('Périodes', 'Periods', 'Períodos')} pct={node.periodPct} t={t} />
            {node.scope === 'sectors' && <PctChip label={t('Secteurs', 'Sectors', 'Sectores')} pct={node.sectorPct} t={t} />}
          </div>
        </div>
        <div className="w-full sm:w-40 sm:shrink-0">
          <ProgressBar value={c.taux} danger={c.depassement} />
          <div className="text-xs text-gray-400 text-right mt-0.5 tabular-nums">{c.taux}%</div>
        </div>
      </div>

      {/* D4 — motifs de blocage JUSTE au-dessus des boutons, chacun avec son action directe. */}
      {node.status === 'draft' && errs.length > 0 && (
        <div className="mt-2 text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <p className="font-semibold">{t('À compléter avant activation', 'Complete before activation', 'Completar antes de activar')} :</p>
          <ul className="mt-1 space-y-1">
            {errs.map((e) => {
              const act = ERROR_ACTION[e];
              return (
                <li key={e} className="flex items-center justify-between gap-2 flex-wrap">
                  <span>{t(...(LINE_ERROR_LABELS[e] || [e, e, e]))}</span>
                  {canManage && act === 'alloc' && <button type="button" onClick={onAlloc} className="min-h-9 px-2 font-semibold underline">{t('Répartir', 'Break down', 'Repartir')} →</button>}
                  {canManage && act === 'edit' && <button type="button" onClick={onEdit} className="min-h-9 px-2 font-semibold underline">{t('Modifier la ligne', 'Edit the line', 'Editar la línea')} →</button>}
                  {act === 'revise' && onRevise && <button type="button" onClick={onRevise} className="min-h-9 px-2 font-semibold underline">{t('Réviser l’enveloppe', 'Revise the envelope', 'Revisar la envolvente')} →</button>}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {canManage && (
        <div className="flex flex-wrap gap-1.5 mt-2.5">
          {node.status === 'draft' && (
            <>
              <button onClick={onAlloc} className={`${btn} text-indigo-700 bg-indigo-50 hover:bg-indigo-100`}>⚖ {t('Répartir', 'Break down', 'Repartir')}</button>
              {canApprove ? (
                <button onClick={() => onStatus(raw, 'active')} disabled={!canActivate}
                  title={canActivate ? '' : t('Complétez la répartition (Σ = 100 %) et respectez l’enveloppe.', 'Complete the breakdown (Σ = 100%) within the envelope.', 'Complete el reparto (Σ = 100%).')}
                  className={`${btn} text-emerald-700 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-40`}>✓ {t('Activer', 'Activate', 'Activar')}</button>
              ) : (
                <span className="text-xs text-gray-500 self-center">{t('Activation réservée à ceux qui peuvent approuver le budget.', 'Activation is reserved for people who can approve the budget.', 'Activación reservada a quien puede aprobar el presupuesto.')}</span>
              )}
              {/* Actions secondaires : au clic dans un menu sur téléphone, visibles dès sm. */}
              <div className="hidden sm:contents">{secondary}</div>
              <details className="sm:hidden relative">
                <summary className={`${btn} min-h-11 list-none cursor-pointer text-gray-600 bg-gray-100 hover:bg-gray-200 flex items-center`}>{t('Plus d’actions', 'More actions', 'Más acciones')}</summary>
                <div className="absolute z-20 mt-1 flex flex-col gap-1 rounded-lg border border-gray-200 bg-white p-2 shadow-lg min-w-[10rem]">{secondary}</div>
              </details>
            </>
          )}
          {node.status === 'active' && (
            <>
              <button onClick={() => onStatus(raw, 'closed')} className={`${btn} text-slate-700 bg-slate-100 hover:bg-slate-200`}>{t('Clôturer', 'Close', 'Cerrar')}</button>
              <span className="text-xs text-gray-500 self-center flex items-center gap-1 flex-wrap">
                {t('Montant et répartition verrouillés. Pour les changer :', 'Amount and breakdown are locked. To change them:', 'Monto y reparto bloqueados. Para cambiarlos:')}
                {onRealloc && <button type="button" onClick={onRealloc} className="underline font-semibold text-purple-700 min-h-9 px-1">{t('Réallouer', 'Reallocate', 'Reasignar')}</button>}
                {onRealloc && onRevise && t('ou', 'or', 'o')}
                {onRevise && <button type="button" onClick={onRevise} className="underline font-semibold text-purple-700 min-h-9 px-1">{t('Réviser', 'Revise', 'Revisar')}</button>}
                {!onRealloc && !onRevise && t('demandez à un responsable de réallouer ou de réviser.', 'ask a manager to reallocate or revise.', 'pida a un responsable reasignar o revisar.')}
              </span>
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

// Action directe proposée à côté de chaque motif de blocage (D4).
const ERROR_ACTION = {
  amount_missing: 'edit', sector_alloc_on_complex: 'edit',
  period_alloc_missing: 'alloc', period_pct_not_100: 'alloc', period_pct_negative: 'alloc',
  sector_alloc_missing: 'alloc', sector_pct_not_100: 'alloc', sector_pct_negative: 'alloc',
  annual_cap_exceeded: 'revise',
};

// Demande envoyée au poste de l'école, pas encore appliquée (gouvernance distante).
function PendingBadge({ t }) {
  return (
    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 shrink-0">
      <span aria-hidden="true">⏳ </span>{t('En attente d’application', 'Pending', 'Pendiente')}
    </span>
  );
}

function PctChip({ label, pct, t }) {
  const v = Number(pct) || 0;
  const complete = Math.abs(v - 100) <= 0.01;
  const over = v > 100.01;
  const left = Math.round((100 - v) * 100) / 100;
  // Un symbole ET un mot en plus de la couleur : jamais l'état par la couleur seule.
  return (
    <span className={`px-1.5 py-0.5 rounded ${complete ? 'bg-emerald-50 text-emerald-800' : over ? 'bg-rose-50 text-rose-800' : 'bg-gray-100 text-gray-700'}`}>
      <span aria-hidden="true">{complete ? '✓' : over ? '▲' : '…'} </span>{label} {v}%
      {!complete && <> — {over ? t('dépassé', 'over', 'excedido') : t(`${left} % restent`, `${left}% left`, `${left} % restante`)}</>}
    </span>
  );
}

function Stat({ label, value, tone, hint }) {
  return <div><div className={`text-base font-bold ${tone}`}>{value}</div><div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</div>{hint && <div className="text-xs text-gray-500 mt-0.5">{hint}</div>}</div>;
}
