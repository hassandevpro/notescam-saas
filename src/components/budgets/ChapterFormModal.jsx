import { useState } from 'react';
import Modal from '../Modal';
import { useT } from '../../lib/i18n';
import { BUDGET_CHAPTER_KINDS } from '../../lib/budgetEngine';
import { KIND_LABELS } from './budgetUi';

// Création / modification d'un chapitre budgétaire OU d'un sous-chapitre.
// `parent` (facultatif) = chapitre parent quand on ajoute un sous-chapitre :
// la nature (recette/dépense) est alors héritée du parent.
export default function ChapterFormModal({ chapter, parent, onSave, onClose }) {
  const t = useT();
  const editing = !!chapter?.id;
  const isSub = !!parent || !!chapter?.parent_id;

  const [kind, setKind]       = useState(chapter?.kind || parent?.kind || 'depense');
  const [code, setCode]       = useState(chapter?.code || '');
  const [label, setLabel]     = useState(chapter?.label || '');
  const [amount, setAmount]   = useState(chapter?.planned_amount ?? '');
  const [saving, setSaving]   = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!label.trim() || saving) return;
    setSaving(true);
    await onSave({
      ...chapter,
      parent_id: chapter?.parent_id || parent?.id || null,
      kind: isSub ? (parent?.kind || chapter?.kind || 'depense') : kind,
      code: code.trim(),
      label: label.trim(),
      planned_amount: Number(amount) || 0,
    });
    setSaving(false);
  };

  const field = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none';

  const title = editing
    ? t('Modifier le chapitre', 'Edit chapter', 'Editar capítulo')
    : isSub
      ? t('Nouveau sous-chapitre', 'New sub-chapter', 'Nuevo subcapítulo')
      : t('Nouveau chapitre', 'New chapter', 'Nuevo capítulo');

  return (
    <Modal title={title} onClose={onClose} size="sm">
      <form onSubmit={submit} className="space-y-4">
        {!isSub && (
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">
              {t('Nature', 'Type', 'Naturaleza')}
            </label>
            <div className="flex gap-2">
              {BUDGET_CHAPTER_KINDS.map((k) => (
                <button
                  key={k} type="button" onClick={() => setKind(k)}
                  className={`flex-1 px-3 py-2 text-sm rounded-lg border transition-colors ${
                    kind === k
                      ? k === 'recette' ? 'bg-emerald-600 text-white border-emerald-600'
                                        : 'bg-rose-600 text-white border-rose-600'
                      : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {t(...KIND_LABELS[k])}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">
              {t('Code', 'Code', 'Código')}
            </label>
            <input className={field} value={code} onChange={(e) => setCode(e.target.value)}
              placeholder={t('opt.', 'opt.', 'opc.')} />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-semibold text-gray-500 mb-1">
              {t('Libellé', 'Label', 'Etiqueta')}
            </label>
            <input className={field} value={label} autoFocus
              onChange={(e) => setLabel(e.target.value)} />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1">
            {t('Montant prévu', 'Planned amount', 'Importe previsto')}
          </label>
          <input
            className={field} type="number" min="0" step="1" value={amount}
            onChange={(e) => setAmount(e.target.value)} placeholder="0"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
            {t('Annuler', 'Cancel', 'Cancelar')}
          </button>
          <button type="submit" disabled={!label.trim() || saving}
            className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50">
            {saving ? t('Enregistrement…', 'Saving…', 'Guardando…')
                    : t('Enregistrer', 'Save', 'Guardar')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
