import { useState } from 'react';
import Modal from '../Modal';
import { useT } from '../../lib/i18n';
import {
  BUDGET_PERIOD_TYPES, BUDGET_SECTORS, periodRefOptions,
} from '../../lib/budgetEngine';
import { PERIOD_TYPE_LABELS, SECTOR_LABELS } from './budgetUi';

// Création / modification de l'ENTÊTE d'un budget (période + secteur + libellé).
// La gestion des chapitres se fait ensuite dans le détail du budget.
export default function BudgetFormModal({ budget, academicYear, onSave, onClose }) {
  const t = useT();
  const editing = !!budget?.id;

  const [label, setLabel]           = useState(budget?.label || '');
  const [periodType, setPeriodType] = useState(budget?.period_type || 'annuel');
  const [periodRef, setPeriodRef]   = useState(budget?.period_ref || '');
  const [sector, setSector]         = useState(budget?.sector || 'general');
  const [notes, setNotes]           = useState(budget?.notes || '');
  const [saving, setSaving]         = useState(false);

  const refOptions = periodRefOptions(periodType);

  const submit = async (e) => {
    e.preventDefault();
    if (!label.trim() || saving) return;
    setSaving(true);
    await onSave({
      ...budget,
      academic_year: budget?.academic_year || academicYear,
      label: label.trim(),
      period_type: periodType,
      period_ref: refOptions.length ? Number(periodRef) || refOptions[0] : null,
      sector,
      notes: notes.trim(),
    });
    setSaving(false);
  };

  const field = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none';

  return (
    <Modal
      title={editing ? t('Modifier le budget', 'Edit budget', 'Editar presupuesto')
                     : t('Nouveau budget', 'New budget', 'Nuevo presupuesto')}
      onClose={onClose}
    >
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1">
            {t('Libellé', 'Label', 'Etiqueta')}
          </label>
          <input
            className={field} value={label} autoFocus
            onChange={(e) => setLabel(e.target.value)}
            placeholder={t('Budget prévisionnel', 'Forecast budget', 'Presupuesto previsional')}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">
              {t('Période', 'Period', 'Período')}
            </label>
            <select
              className={field} value={periodType}
              onChange={(e) => { setPeriodType(e.target.value); setPeriodRef(''); }}
            >
              {BUDGET_PERIOD_TYPES.map((p) => (
                <option key={p} value={p}>{t(...PERIOD_TYPE_LABELS[p])}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">
              {periodType === 'trimestriel' ? t('Trimestre', 'Quarter', 'Trimestre')
                : periodType === 'mensuel' ? t('Mois', 'Month', 'Mes')
                : t('Rang', 'Rank', 'Rango')}
            </label>
            <select
              className={field} value={periodRef} disabled={!refOptions.length}
              onChange={(e) => setPeriodRef(e.target.value)}
            >
              {!refOptions.length && <option value="">—</option>}
              {refOptions.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1">
            {t('Secteur', 'Sector', 'Sector')}
          </label>
          <select className={field} value={sector} onChange={(e) => setSector(e.target.value)}>
            {BUDGET_SECTORS.map((s) => (
              <option key={s} value={s}>{t(...(SECTOR_LABELS[s] || [s]))}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1">
            {t('Notes', 'Notes', 'Notas')}
          </label>
          <textarea
            className={field} rows={2} value={notes}
            onChange={(e) => setNotes(e.target.value)}
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
