// Saisie / modification d'une dépense — modèle CIBLE v3.
// Imputation = LIGNE budgétaire (active) + SECTEUR concerné OU « Complexe / Global ».
// La PÉRIODE n'est PAS choisie : elle est DÉTERMINÉE AUTOMATIQUEMENT à partir de la
// DATE de la dépense (période dont start_date ≤ date ≤ end_date). Recalculée à chaque
// changement de date. Le disponible affiché vient du moteur pur (maillon contraignant) ;
// le SERVEUR (E3) reste l'autorité finale (il re-dérive et re-valide la période).
import { useEffect, useMemo, useState } from 'react';
import Modal from '../Modal';
import { useT } from '../../lib/i18n';
import { useMoney } from '../../lib/useMoney';
import { indexAllocations, checkExpense, lineSectorIds, resolvePeriodForDate } from '../../lib/budgetLinesEngine';
import { unitLabel } from '../budgets/BudgetHierarchyModals';

const field = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none';
const lbl = 'block text-xs font-semibold text-gray-500 mb-1';

export default function ExpenseFormModalV3({
  expense, lines = [], periods = [], units = [], linePeriods = [], lineSectors = [],
  expenses = [], annual, defaultLineId, onSave, onRequestUnlock, onClose,
}) {
  const t = useT();
  const money = useMoney();
  const editing = !!expense?.id;
  const idx = useMemo(() => indexAllocations(linePeriods, lineSectors), [linePeriods, lineSectors]);

  const [lineId, setLineId] = useState(expense?.budget_chapter_id || defaultLineId || lines[0]?.id || '');
  const [sectorId, setSectorId] = useState(expense?.school_unit_id || ''); // '' = Complexe/Global
  const [category, setCategory] = useState(expense?.category || '');
  const [subcategory, setSub] = useState(expense?.subcategory || '');
  const [supplier, setSupplier] = useState(expense?.supplier || '');
  const [amount, setAmount] = useState(expense?.amount ?? '');
  const [requester, setRequester] = useState(expense?.requester || '');
  const [receipt, setReceipt] = useState(expense?.receipt || '');
  const [date, setDate] = useState(expense?.expense_date || new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState(expense?.notes || '');
  const [saving, setSaving] = useState(false);

  const line = lines.find((l) => l.id === lineId) || null;
  // PÉRIODE dérivée AUTOMATIQUEMENT de la date de la dépense (jamais la date du jour).
  const resolved = useMemo(() => resolvePeriodForDate(periods, date), [periods, date]);
  const periodId = resolved.period?.id || '';
  // Secteurs autorisés par la ligne (+ toujours l'option Complexe/Global).
  const allowedUnitIds = useMemo(() => lineSectorIds(lineId, idx), [lineId, idx]);
  const sectorOptions = useMemo(() => units.filter((u) => allowedUnitIds.has(u.id)), [units, allowedUnitIds]);
  // La ligne est-elle répartie sur la période trouvée ?
  const lineHasPeriod = periodId ? (idx.byLinePeriod.get(lineId) || []).some((a) => a.budget_period_id === periodId) : false;

  useEffect(() => {
    if (sectorId && !allowedUnitIds.has(sectorId)) setSectorId('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineId]);

  const verdict = useMemo(() => {
    if (!line || !periodId) return null;
    return checkExpense({ amount: Number(amount) || 0, line, periodId, sectorId: sectorId || null, annual, idx, expenses, excludeExpenseId: expense?.id || null });
  }, [line, periodId, sectorId, amount, annual, idx, expenses, expense?.id]);

  const amt = Number(amount) || 0;
  const exceeds = !!verdict && !verdict.ok && verdict.blockingLevel !== 'imputation';
  // On peut enregistrer si : ligne + montant + une période UNIQUE couvre la date +
  // la ligne est répartie sur cette période. (Le serveur re-valide de toute façon.)
  const canSubmit = lineId && amount !== '' && amt >= 0 && !!resolved.period && lineHasPeriod && !saving;

  const submit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    const unit = units.find((u) => u.id === sectorId) || null;
    await onSave({
      ...expense,
      budget_id: line.budget_id,
      budget_chapter_id: lineId,
      budget_period_id: periodId,                       // dérivée de la date (le serveur re-dérive)
      school_unit_id: sectorId || null,
      sector: unit ? (unit.section_key || unit.name || null) : null,
      category: category.trim(), subcategory: subcategory.trim(), supplier: supplier.trim(),
      amount: amt, requester: requester.trim(), receipt: receipt.trim(), expense_date: date, notes: notes.trim(),
    });
    setSaving(false);
  };

  const levelLabel = (lvl) => ({
    line: t('la ligne', 'the line', 'la línea'), period: t('la période', 'the period', 'el período'),
    sector: t('l’allocation sectorielle', 'the sector allocation', 'la asignación sectorial'), annual: t('le budget annuel', 'the annual budget', 'el presupuesto anual'),
  }[lvl] || lvl);

  return (
    <Modal title={editing ? t('Modifier la dépense', 'Edit expense', 'Editar gasto') : t('Nouvelle dépense', 'New expense', 'Nuevo gasto')} onClose={onClose} size="lg">
      <form onSubmit={submit} className="space-y-4">
        {lines.length === 0 && (
          <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            {t('Aucune ligne budgétaire active. Activez une ligne dans Budgets pour imputer des dépenses.', 'No active budget line. Activate a line in Budgets to record expenses.', 'Ninguna línea activa.')}
          </p>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label className={lbl}>{t('Ligne budgétaire (obligatoire)', 'Budget line (required)', 'Línea (obligatoria)')}</label>
            <select className={field} value={lineId} onChange={(e) => setLineId(e.target.value)}>
              <option value="">{t('— choisir une ligne —', '— choose a line —', '— elegir línea —')}</option>
              {lines.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
            </select>
          </div>
          <div>
            <label className={lbl}>{t('Date de la dépense (obligatoire)', 'Expense date (required)', 'Fecha (obligatoria)')}</label>
            <input className={field} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label className={lbl}>{t('Période budgétaire (automatique)', 'Budget period (automatic)', 'Período (automático)')}</label>
            {resolved.period ? (
              <div className={`rounded-lg px-3 py-2 text-sm border ${lineHasPeriod ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
                <b>{resolved.period.name}</b>
                {!lineHasPeriod && <div className="text-[11px] mt-0.5">{t('Cette ligne n’est pas répartie sur cette période.', 'This line has no allocation for this period.', 'Sin reparto para este período.')}</div>}
              </div>
            ) : (
              <div className="rounded-lg px-3 py-2 text-sm border bg-rose-50 border-rose-200 text-rose-700">
                {resolved.error === 'overlap'
                  ? t('Chevauchement de périodes sur cette date (erreur de configuration).', 'Overlapping periods on this date (configuration error).', 'Períodos solapados en esta fecha.')
                  : t('Aucune période budgétaire ne couvre cette date. Configurez d’abord les périodes de l’année.', 'No budget period covers this date. Configure the year’s periods first.', 'Ningún período cubre esta fecha. Configure los períodos.')}
              </div>
            )}
          </div>
          <div>
            <label className={lbl}>{t('Secteur imputé', 'Imputed sector', 'Sector imputado')}</label>
            <select className={field} value={sectorId} onChange={(e) => setSectorId(e.target.value)} disabled={!line}>
              <option value="">{t('Complexe / Global', 'Whole complex / Global', 'Complejo / Global')}</option>
              {sectorOptions.map((u) => <option key={u.id} value={u.id}>{unitLabel(t, u)}</option>)}
            </select>
            {line?.scope === 'complex' && <p className="text-[11px] text-gray-400 mt-1">{t('Ligne « tout le complexe » — imputation globale.', 'Complex-wide line — global imputation.', 'Línea global.')}</p>}
          </div>
          <div>
            <label className={lbl}>{t('Montant', 'Amount', 'Importe')}</label>
            <input className={field} type="number" min="0" step="1" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
          </div>
          <div>
            <label className={lbl}>{t('Fournisseur', 'Supplier', 'Proveedor')}</label>
            <input className={field} value={supplier} onChange={(e) => setSupplier(e.target.value)} />
          </div>

          {verdict && (
            <div className="sm:col-span-2">
              <div className={`text-xs rounded-lg px-3 py-2 border ${exceeds ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700'}`}>
                <div className="flex items-center justify-between">
                  <span>{t('Disponible (maillon le plus serré)', 'Available (tightest link)', 'Disponible (eslabón más ajustado)')}</span>
                  <b className="tabular-nums">{money(verdict.available)}</b>
                </div>
                {exceeds && (
                  <div className="mt-1 font-semibold">⛔ {t('Dépasse', 'Exceeds', 'Supera')} {levelLabel(verdict.blockingLevel)} {t('de', 'by', 'en')} {money(verdict.overBy)} — {t('l’engagement sera bloqué.', 'the commitment will be blocked.', 'el compromiso será bloqueado.')}</div>
                )}
                {exceeds && onRequestUnlock && (
                  <button type="button" onClick={() => onRequestUnlock({ chapter: line, amount: amt, shortfall: verdict.overBy })}
                    className="mt-2 text-xs font-semibold text-indigo-600 hover:text-indigo-800 underline">
                    {t('Créer une demande de déblocage', 'Create an unlock request', 'Crear solicitud de desbloqueo')}
                  </button>
                )}
              </div>
            </div>
          )}

          <div>
            <label className={lbl}>{t('Demandeur', 'Requester', 'Solicitante')}</label>
            <input className={field} value={requester} onChange={(e) => setRequester(e.target.value)} />
          </div>
          <div>
            <label className={lbl}>{t('Catégorie', 'Category', 'Categoría')}</label>
            <input className={field} value={category} onChange={(e) => setCategory(e.target.value)} />
          </div>
          <div>
            <label className={lbl}>{t('Sous-catégorie', 'Sub-category', 'Subcategoría')}</label>
            <input className={field} value={subcategory} onChange={(e) => setSub(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label className={lbl}>{t('Justificatif (référence / lien)', 'Receipt (reference / link)', 'Justificante')}</label>
            <input className={field} value={receipt} onChange={(e) => setReceipt(e.target.value)} placeholder={t('N° facture, bon, URL…', 'Invoice no., voucher, URL…', 'N.º factura…')} />
          </div>
          <div className="sm:col-span-2">
            <label className={lbl}>{t('Notes', 'Notes', 'Notas')}</label>
            <textarea className={field} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">{t('Annuler', 'Cancel', 'Cancelar')}</button>
          <button type="submit" disabled={!canSubmit} className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50">
            {saving ? t('Enregistrement…', 'Saving…', 'Guardando…') : t('Enregistrer', 'Save', 'Guardar')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
