import { useState, useMemo } from 'react';
import Modal from '../Modal';
import { useT } from '../../lib/i18n';
import { useMoney } from '../../lib/useMoney';
import { buildChapterTree } from '../../lib/budgetEngine';
import { chapterAvailability } from '../../lib/expenseEngine';

// Saisie / modification d'une dépense. Toujours rattachée au budget courant
// (`budget`) ; le chapitre choisi fixe l'imputation. Le secteur est hérité du
// budget (aucune ressaisie). BLOQUE la dépense si la ligne est épuisée / dépassée
// et propose de créer une demande de déblocage.
export default function ExpenseFormModal({
  expense, budget, chapters = [], expenses = [], requests = [], onSave, onRequestUnlock, onClose,
}) {
  const t = useT();
  const money = useMoney();
  const editing = !!expense?.id;

  const [chapterId, setChapterId] = useState(expense?.budget_chapter_id || '');
  const [category, setCategory]   = useState(expense?.category || '');
  const [subcategory, setSub]     = useState(expense?.subcategory || '');
  const [supplier, setSupplier]   = useState(expense?.supplier || '');
  const [amount, setAmount]       = useState(expense?.amount ?? '');
  const [requester, setRequester] = useState(expense?.requester || '');
  const [receipt, setReceipt]     = useState(expense?.receipt || '');
  const [date, setDate]           = useState(expense?.expense_date || new Date().toISOString().slice(0, 10));
  const [notes, setNotes]         = useState(expense?.notes || '');
  const [saving, setSaving]       = useState(false);

  // Uniquement les chapitres de DÉPENSE (une dépense ne s'impute pas sur une recette).
  const depenseChapters = chapters.filter((c) => c.kind === 'depense');
  const tree = buildChapterTree(depenseChapters);

  // Disponible de la ligne choisie (hors dépense en cours d'édition) + contrôle
  // de blocage : une dépense ne peut pas dépasser le disponible.
  const selectedChapter = chapters.find((c) => c.id === chapterId) || null;
  const avail = useMemo(() => (selectedChapter
    ? chapterAvailability(selectedChapter, chapters, expenses, requests, { excludeExpenseId: expense?.id || null })
    : null), [selectedChapter, chapters, expenses, requests, expense?.id]);
  const amt = Number(amount) || 0;
  const exceeds = !!avail && amt > avail.available;
  const exhausted = !!avail && avail.available <= 0;

  const submit = async (e) => {
    e.preventDefault();
    if (!amount || saving || exceeds) return;   // BLOCAGE : dépassement interdit
    setSaving(true);
    await onSave({
      ...expense,
      budget_id: budget.id,                 // rattachement automatique
      sector: budget.sector,                // hérité du budget
      budget_chapter_id: chapterId || null,
      category: category.trim(),
      subcategory: subcategory.trim(),
      supplier: supplier.trim(),
      amount: Number(amount) || 0,
      requester: requester.trim(),
      receipt: receipt.trim(),
      expense_date: date,
      notes: notes.trim(),
    });
    setSaving(false);
  };

  const field = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none';
  const lbl = 'block text-xs font-semibold text-gray-500 mb-1';

  return (
    <Modal title={editing ? t('Modifier la dépense', 'Edit expense', 'Editar gasto')
                          : t('Nouvelle dépense', 'New expense', 'Nuevo gasto')} onClose={onClose} size="lg">
      <form onSubmit={submit} className="space-y-4">
        <div className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
          {t('Budget', 'Budget', 'Presupuesto')} : <b>{budget.label}</b>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className={lbl}>{t('Chapitre budgétaire', 'Budget chapter', 'Capítulo presupuestario')}</label>
            <select className={field} value={chapterId} onChange={(e) => setChapterId(e.target.value)}>
              <option value="">{t('— non imputé —', '— unassigned —', '— sin imputar —')}</option>
              {tree.map((c) => (
                <optgroup key={c.id} label={`${c.code ? c.code + ' ' : ''}${c.label}`}>
                  <option value={c.id}>{c.label}</option>
                  {c.children.map((sc) => (
                    <option key={sc.id} value={sc.id}>&nbsp;&nbsp;↳ {sc.label}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <div>
            <label className={lbl}>{t('Catégorie', 'Category', 'Categoría')}</label>
            <input className={field} value={category} onChange={(e) => setCategory(e.target.value)} />
          </div>
          <div>
            <label className={lbl}>{t('Sous-catégorie', 'Sub-category', 'Subcategoría')}</label>
            <input className={field} value={subcategory} onChange={(e) => setSub(e.target.value)} />
          </div>
          <div>
            <label className={lbl}>{t('Fournisseur', 'Supplier', 'Proveedor')}</label>
            <input className={field} value={supplier} onChange={(e) => setSupplier(e.target.value)} />
          </div>
          <div>
            <label className={lbl}>{t('Demandeur', 'Requester', 'Solicitante')}</label>
            <input className={field} value={requester} onChange={(e) => setRequester(e.target.value)} />
          </div>
          <div>
            <label className={lbl}>{t('Montant', 'Amount', 'Importe')}</label>
            <input className={field} type="number" min="0" step="1" value={amount} autoFocus
              onChange={(e) => setAmount(e.target.value)} placeholder="0" />
          </div>
          {avail && (
            <div className="col-span-2">
              <div className={`text-xs rounded-lg px-3 py-2 border ${
                exceeds ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700'}`}>
                <div className="flex items-center justify-between">
                  <span>{t('Disponible sur la ligne', 'Available on line', 'Disponible en la línea')}</span>
                  <b className="tabular-nums">{money(avail.available)}</b>
                </div>
                {exhausted && (
                  <div className="mt-1 font-semibold">
                    ⛔ {t('Ligne budgétaire épuisée — nouvelle dépense bloquée.', 'Budget line exhausted — new expense blocked.', 'Línea agotada — nuevo gasto bloqueado.')}
                  </div>
                )}
                {exceeds && !exhausted && (
                  <div className="mt-1 font-semibold">
                    ⛔ {t('Montant supérieur au disponible — bloqué.', 'Amount exceeds available — blocked.', 'Importe superior al disponible — bloqueado.')}
                  </div>
                )}
                {exceeds && onRequestUnlock && (
                  <button type="button"
                    onClick={() => onRequestUnlock({ chapter: selectedChapter, amount: amt, shortfall: amt - avail.available })}
                    className="mt-2 text-xs font-semibold text-indigo-600 hover:text-indigo-800 underline">
                    {t('Créer une demande de déblocage', 'Create an unlock request', 'Crear una solicitud de desbloqueo')}
                  </button>
                )}
              </div>
            </div>
          )}
          <div>
            <label className={lbl}>{t('Date', 'Date', 'Fecha')}</label>
            <input className={field} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="col-span-2">
            <label className={lbl}>{t('Justificatif (référence / lien)', 'Receipt (reference / link)', 'Justificante (referencia / enlace)')}</label>
            <input className={field} value={receipt} onChange={(e) => setReceipt(e.target.value)}
              placeholder={t('N° facture, bon, URL…', 'Invoice no., voucher, URL…', 'N.º factura, vale, URL…')} />
          </div>
          <div className="col-span-2">
            <label className={lbl}>{t('Notes', 'Notes', 'Notas')}</label>
            <textarea className={field} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
            {t('Annuler', 'Cancel', 'Cancelar')}
          </button>
          <button type="submit" disabled={!amount || saving || exceeds}
            className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50">
            {saving ? t('Enregistrement…', 'Saving…', 'Guardando…') : t('Enregistrer', 'Save', 'Guardar')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
