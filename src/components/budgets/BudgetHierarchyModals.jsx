// Modales du modèle budgétaire. Ne contient plus que ce qui sert au modèle CIBLE
// v3 : `AnnualBudgetModal` (créer/modifier le budget annuel global) et le helper
// `unitLabel`. Les anciennes modales par NŒUD (PeriodEnvelopeModal /
// SectorAllocationModal) ont été retirées en E7 (modèle period/sector legacy
// remplacé par les allocations par ligne — voir LineAllocationsModal).
import { useState } from 'react';
import Modal from '../Modal';
import { useT } from '../../lib/i18n';
import { UNIT_SECTION_LABELS } from './budgetUi';

const field = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none';
const lbl = 'block text-xs font-semibold text-gray-500 mb-1';

// Nom lisible d'une unité (section_key traduit, sinon nom libre).
export function unitLabel(t, unit) {
  if (!unit) return '';
  return unit.name || (unit.section_key ? t(...(UNIT_SECTION_LABELS[unit.section_key] || [unit.section_key])) : '');
}

// ── Budget ANNUEL GLOBAL ──────────────────────────────────────────────────────
export function AnnualBudgetModal({ budget, year, onSave, onClose }) {
  const t = useT();
  const editing = !!budget?.id;
  const [label, setLabel] = useState(budget?.label || t('Budget annuel', 'Annual budget', 'Presupuesto anual'));
  const [amount, setAmount] = useState(budget?.envelope_amount ?? '');
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!label.trim() || amount === '' || Number(amount) < 0 || saving) return;
    setSaving(true);
    await onSave({ ...budget, tier: 'annual', academic_year: year, label: label.trim(), envelope_amount: Number(amount) });
    setSaving(false);
  };

  return (
    <Modal title={editing ? t('Modifier le budget annuel', 'Edit annual budget', 'Editar presupuesto anual')
                          : t('Créer le budget annuel', 'Create annual budget', 'Crear presupuesto anual')} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-xs text-gray-500">{t('Enveloppe globale de référence pour l’année', 'Reference global envelope for the year', 'Envolvente global de referencia')} <b>{year}</b>.</p>
        <div>
          <label className={lbl}>{t('Libellé', 'Label', 'Etiqueta')}</label>
          <input className={field} value={label} autoFocus onChange={(e) => setLabel(e.target.value)} />
        </div>
        <div>
          <label className={lbl}>{t('Montant global (plafond)', 'Global amount (ceiling)', 'Monto global (tope)')}</label>
          <input className={field} type="number" min="0" step="1" value={amount} placeholder="0" onChange={(e) => setAmount(e.target.value)} />
        </div>
        <Actions saving={saving} disabled={!label.trim() || amount === ''} onClose={onClose} t={t} />
      </form>
    </Modal>
  );
}

function Actions({ saving, disabled, onClose, t }) {
  return (
    <div className="flex justify-end gap-2 pt-1">
      <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
        {t('Annuler', 'Cancel', 'Cancelar')}
      </button>
      <button type="submit" disabled={disabled || saving}
        className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50">
        {saving ? t('Enregistrement…', 'Saving…', 'Guardando…') : t('Enregistrer', 'Save', 'Guardar')}
      </button>
    </div>
  );
}
