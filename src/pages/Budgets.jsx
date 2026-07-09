// Module BUDGETS (prévisionnel) — 1re tranche.
// Cycle de vie des budgets : création, modification, consultation, clôture.
// PAS de dépenses réelles ni de workflow de validation (itérations suivantes).
//
// Données en Supabase direct (lib/budgetService) — en LAN, aliasé vers le
// serveur local (SQLite). Modèle et logique purs : lib/budgetEngine.
import { useEffect, useMemo, useState, useCallback } from 'react';
import Layout from '../components/Layout';
import { useAuthStore } from '../store/authStore';
import { useT } from '../lib/i18n';
import { useMoney } from '../lib/useMoney';
import {
  fetchBudgets, upsertBudget, deleteBudget,
  fetchBudgetChapters, upsertBudgetChapter, deleteBudgetChapter,
} from '../lib/budgetService';
import {
  buildChapterTree, computeBudgetTotals, chapterRollup,
  canTransition, isBudgetLocked,
} from '../lib/budgetEngine';
import BudgetFormModal from '../components/budgets/BudgetFormModal';
import ChapterFormModal from '../components/budgets/ChapterFormModal';
import { STATUS_UI, SECTOR_LABELS, periodLabel } from '../components/budgets/budgetUi';

function StatusBadge({ status, t }) {
  const ui = STATUS_UI[status] || STATUS_UI.draft;
  return (
    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${ui.color}`}>
      {t(...ui.label)}
    </span>
  );
}

export default function Budgets() {
  const t = useT();
  const money = useMoney();
  const school = useAuthStore((s) => s.school);
  const role = useAuthStore((s) => s.role);
  const fullName = useAuthStore((s) => s.fullName);
  const schoolId = school?.id;
  const activeYear = school?.current_year || '';
  const canManage = role === 'admin';

  const [budgets, setBudgets]   = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [chapters, setChapters] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [budgetModal, setBudgetModal]   = useState(null); // { budget } | { budget: null }
  const [chapterModal, setChapterModal] = useState(null); // { chapter?, parent? }

  const selected = budgets.find((b) => b.id === selectedId) || null;
  const locked = isBudgetLocked(selected);

  // — Chargement des budgets de l'année active —
  const loadBudgets = useCallback(async () => {
    if (!schoolId) return;
    setLoading(true);
    const rows = await fetchBudgets(schoolId, { yearLabel: activeYear }) || [];
    setBudgets(rows);
    setSelectedId((cur) => cur && rows.some((b) => b.id === cur) ? cur : (rows[0]?.id || null));
    setLoading(false);
  }, [schoolId, activeYear]);

  useEffect(() => { loadBudgets(); }, [loadBudgets]);

  // — Chargement des chapitres du budget sélectionné —
  const loadChapters = useCallback(async (budgetId) => {
    if (!schoolId || !budgetId) { setChapters([]); return; }
    const rows = await fetchBudgetChapters(schoolId, { budgetId }) || [];
    setChapters(rows);
  }, [schoolId]);

  useEffect(() => { loadChapters(selectedId); }, [selectedId, loadChapters]);

  const totals = useMemo(() => computeBudgetTotals(chapters), [chapters]);
  const tree = useMemo(() => buildChapterTree(chapters), [chapters]);
  const { amountOf } = useMemo(() => chapterRollup(chapters), [chapters]);

  // — Actions budget —
  const saveBudget = async (data) => {
    const saved = await upsertBudget({ ...data, school_id: schoolId });
    setBudgetModal(null);
    if (saved) { await loadBudgets(); setSelectedId(saved.id); }
  };

  const changeStatus = async (budget, to) => {
    if (!canTransition(budget.status, to)) return;
    const patch = { ...budget, status: to };
    if (to === 'closed') { patch.closed_at = new Date().toISOString(); patch.closed_by = fullName || ''; }
    if (to === 'active') { patch.closed_at = null; patch.closed_by = null; }
    const saved = await upsertBudget(patch);
    if (saved) await loadBudgets();
  };

  const removeBudget = async (budget) => {
    if (!window.confirm(t('Supprimer ce budget et tous ses chapitres ?', 'Delete this budget and all its chapters?', '¿Eliminar este presupuesto y todos sus capítulos?'))) return;
    if (await deleteBudget(budget.id)) {
      setSelectedId(null);
      await loadBudgets();
    }
  };

  // — Actions chapitre —
  const saveChapter = async (data) => {
    const position = data.position ?? chapters.filter((c) => (c.parent_id || null) === (data.parent_id || null)).length;
    const saved = await upsertBudgetChapter({ ...data, position, school_id: schoolId, budget_id: selectedId });
    setChapterModal(null);
    if (saved) await loadChapters(selectedId);
  };

  const removeChapter = async (chapter) => {
    if (!window.confirm(t('Supprimer ce chapitre (et ses sous-chapitres) ?', 'Delete this chapter (and its sub-chapters)?', '¿Eliminar este capítulo (y sus subcapítulos)?'))) return;
    if (await deleteBudgetChapter(chapter.id)) await loadChapters(selectedId);
  };

  const recettes = tree.filter((c) => c.kind === 'recette');
  const depenses = tree.filter((c) => c.kind === 'depense');

  const btn = 'px-3 py-1.5 text-sm font-semibold rounded-lg transition-colors';

  return (
    <Layout>
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{t('Budgets', 'Budgets', 'Presupuestos')}</h1>
            <p className="text-sm text-gray-500 mt-1">
              {t('Budget prévisionnel', 'Forecast budget', 'Presupuesto previsional')} — {activeYear || '—'}
            </p>
          </div>
          {canManage && (
            <button className={`${btn} text-white bg-indigo-600 hover:bg-indigo-700`}
              onClick={() => setBudgetModal({ budget: null })}>
              + {t('Nouveau budget', 'New budget', 'Nuevo presupuesto')}
            </button>
          )}
        </div>

        {loading ? (
          <div className="text-gray-400 text-sm py-16 text-center animate-pulse">{t('Chargement…', 'Loading…', 'Cargando…')}</div>
        ) : budgets.length === 0 ? (
          <div className="bg-white rounded-xl border border-dashed border-gray-300 p-12 text-center">
            <p className="text-gray-500 text-sm">
              {t('Aucun budget pour cette année.', 'No budget for this year.', 'Ningún presupuesto para este año.')}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Liste des budgets */}
            <div className="space-y-2">
              {budgets.map((b) => {
                const active = b.id === selectedId;
                return (
                  <button key={b.id} onClick={() => setSelectedId(b.id)}
                    className={`w-full text-left p-3 rounded-xl border transition-colors ${
                      active ? 'border-indigo-400 bg-indigo-50/50' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-sm text-gray-900 truncate">{b.label}</span>
                      <StatusBadge status={b.status} t={t} />
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {periodLabel(t, b)} · {t(...(SECTOR_LABELS[b.sector] || [b.sector]))}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Détail du budget sélectionné */}
            <div className="lg:col-span-2">
              {selected && (
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  {/* Entête + actions de statut */}
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="font-bold text-gray-900">{selected.label}</h2>
                        <StatusBadge status={selected.status} t={t} />
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {periodLabel(t, selected)} · {t(...(SECTOR_LABELS[selected.sector] || [selected.sector]))}
                      </p>
                      {selected.notes && <p className="text-xs text-gray-400 mt-1">{selected.notes}</p>}
                    </div>
                    {canManage && (
                      <div className="flex flex-wrap gap-1.5 justify-end">
                        {selected.status === 'draft' && (
                          <button className={`${btn} text-emerald-700 bg-emerald-50 hover:bg-emerald-100`}
                            onClick={() => changeStatus(selected, 'active')}>
                            {t('Activer', 'Activate', 'Activar')}
                          </button>
                        )}
                        {selected.status === 'active' && (
                          <button className={`${btn} text-slate-700 bg-slate-100 hover:bg-slate-200`}
                            onClick={() => changeStatus(selected, 'closed')}>
                            {t('Clôturer', 'Close', 'Cerrar')}
                          </button>
                        )}
                        {selected.status === 'closed' && (
                          <button className={`${btn} text-emerald-700 bg-emerald-50 hover:bg-emerald-100`}
                            onClick={() => changeStatus(selected, 'active')}>
                            {t('Rouvrir', 'Reopen', 'Reabrir')}
                          </button>
                        )}
                        {!locked && (
                          <button className={`${btn} text-gray-600 bg-gray-100 hover:bg-gray-200`}
                            onClick={() => setBudgetModal({ budget: selected })}>
                            {t('Modifier', 'Edit', 'Editar')}
                          </button>
                        )}
                        <button className={`${btn} text-rose-600 bg-rose-50 hover:bg-rose-100`}
                          onClick={() => removeBudget(selected)}>
                          {t('Supprimer', 'Delete', 'Eliminar')}
                        </button>
                      </div>
                    )}
                  </div>

                  {locked && (
                    <div className="mb-4 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                      {t('Budget clôturé — lecture seule.', 'Closed budget — read-only.', 'Presupuesto cerrado — solo lectura.')}
                    </div>
                  )}

                  {/* Colonnes Recettes / Dépenses */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <ChapterColumn
                      title={t('Recettes prévues', 'Planned revenue', 'Ingresos previstos')}
                      tone="emerald" tree={recettes} amountOf={amountOf} money={money}
                      canManage={canManage && !locked} t={t}
                      onAdd={() => setChapterModal({ chapter: null, kind: 'recette' })}
                      onAddSub={(p) => setChapterModal({ chapter: null, parent: p })}
                      onEdit={(c) => setChapterModal({ chapter: c })}
                      onRemove={removeChapter}
                    />
                    <ChapterColumn
                      title={t('Dépenses prévues', 'Planned expenses', 'Gastos previstos')}
                      tone="rose" tree={depenses} amountOf={amountOf} money={money}
                      canManage={canManage && !locked} t={t}
                      onAdd={() => setChapterModal({ chapter: null, kind: 'depense' })}
                      onAddSub={(p) => setChapterModal({ chapter: null, parent: p })}
                      onEdit={(c) => setChapterModal({ chapter: c })}
                      onRemove={removeChapter}
                    />
                  </div>

                  {/* Totaux */}
                  <div className="mt-5 pt-4 border-t border-gray-100 grid grid-cols-3 gap-3 text-center">
                    <Total label={t('Recettes', 'Revenue', 'Ingresos')} value={money(totals.recettes)} tone="text-emerald-700" />
                    <Total label={t('Dépenses', 'Expenses', 'Gastos')} value={money(totals.depenses)} tone="text-rose-600" />
                    <Total label={t('Solde prévisionnel', 'Forecast balance', 'Saldo previsional')}
                      value={money(totals.solde)} tone={totals.solde >= 0 ? 'text-emerald-700' : 'text-rose-600'} />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {budgetModal && (
        <BudgetFormModal
          budget={budgetModal.budget} academicYear={activeYear}
          onSave={saveBudget} onClose={() => setBudgetModal(null)}
        />
      )}
      {chapterModal && (
        <ChapterFormModal
          chapter={chapterModal.chapter
            ? chapterModal.chapter
            : chapterModal.kind ? { kind: chapterModal.kind } : null}
          parent={chapterModal.parent}
          onSave={saveChapter} onClose={() => setChapterModal(null)}
        />
      )}
    </Layout>
  );
}

function Total({ label, value, tone }) {
  return (
    <div>
      <div className={`text-lg font-bold ${tone}`}>{value}</div>
      <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{label}</div>
    </div>
  );
}

// Colonne d'une nature (recettes ou dépenses) : chapitres racines + sous-chapitres.
function ChapterColumn({ title, tone, tree, amountOf, money, canManage, t, onAdd, onAddSub, onEdit, onRemove }) {
  const border = tone === 'emerald' ? 'border-emerald-200' : 'border-rose-200';
  const head = tone === 'emerald' ? 'text-emerald-700' : 'text-rose-600';
  return (
    <div className={`rounded-xl border ${border} p-3`}>
      <div className="flex items-center justify-between mb-2">
        <h3 className={`text-xs font-bold uppercase tracking-wide ${head}`}>{title}</h3>
        {canManage && (
          <button className="text-xs font-semibold text-indigo-600 hover:text-indigo-800" onClick={onAdd}>
            + {t('Chapitre', 'Chapter', 'Capítulo')}
          </button>
        )}
      </div>
      {tree.length === 0 ? (
        <p className="text-xs text-gray-400 py-3 text-center">{t('Aucun chapitre.', 'No chapter.', 'Sin capítulos.')}</p>
      ) : (
        <ul className="space-y-1.5">
          {tree.map((c) => (
            <li key={c.id}>
              <ChapterRow chapter={c} amount={amountOf(c)} money={money} canManage={canManage} t={t}
                isParent onEdit={onEdit} onRemove={onRemove} onAddSub={onAddSub} />
              {c.children.length > 0 && (
                <ul className="ml-4 mt-1 space-y-1 border-l border-gray-100 pl-2">
                  {c.children.map((sc) => (
                    <li key={sc.id}>
                      <ChapterRow chapter={sc} amount={amountOf(sc)} money={money} canManage={canManage} t={t}
                        onEdit={onEdit} onRemove={onRemove} />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ChapterRow({ chapter, amount, money, canManage, t, isParent, onEdit, onRemove, onAddSub }) {
  return (
    <div className="flex items-center justify-between gap-2 group">
      <span className={`text-sm truncate ${isParent ? 'font-semibold text-gray-800' : 'text-gray-600'}`}>
        {chapter.code ? <span className="text-gray-400 mr-1">{chapter.code}</span> : null}
        {chapter.label}
      </span>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-sm tabular-nums text-gray-700">{money(amount)}</span>
        {canManage && (
          <span className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
            {isParent && (
              <button className="text-[11px] text-indigo-500 hover:text-indigo-700" title={t('Sous-chapitre', 'Sub-chapter', 'Subcapítulo')}
                onClick={() => onAddSub(chapter)}>＋</button>
            )}
            <button className="text-[11px] text-gray-400 hover:text-gray-700" onClick={() => onEdit(chapter)}>✎</button>
            <button className="text-[11px] text-rose-400 hover:text-rose-600" onClick={() => onRemove(chapter)}>✕</button>
          </span>
        )}
      </div>
    </div>
  );
}
