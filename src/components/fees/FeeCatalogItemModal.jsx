import { useState } from 'react';
import Modal from '../Modal';
import { useT } from '../../lib/i18n';
import { FEE_CATEGORIES, FEE_PAYMENT_TYPES } from '../../lib/feeCatalogEngine';
import { FEE_CATEGORY_LABELS, PAYMENT_TYPE_LABELS } from './feeCatalogUi';
import { SECTIONS } from '../../core/engineResolver';

// Édition d'un article du catalogue de frais. Champs = spécification complète.
export default function FeeCatalogItemModal({ item, classes = [], academicYear, onSave, onClose }) {
  const t = useT();
  const [f, setF] = useState({
    name: item?.name || '', category: item?.category || 'scolarite',
    amount: item?.amount ?? '', academic_year: item?.academic_year || academicYear || '',
    level: item?.level || '', class_id: item?.class_id || '',
    mandatory: item?.mandatory ?? false, optional: item?.optional ?? true,
    payment_type: item?.payment_type || 'unique',
    start_date: item?.start_date || '', end_date: item?.end_date || '',
    active: item?.active ?? true,
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    if (!f.name.trim() || saving) return;
    setSaving(true);
    await onSave({ ...item, ...f, name: f.name.trim() });
    setSaving(false);
  };

  const fld = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none';
  const lbl = 'block text-xs font-semibold text-gray-500 mb-1';
  const Check = ({ k, label }) => (
    <label className="flex items-center gap-2 text-sm text-gray-700">
      <input type="checkbox" checked={!!f[k]} onChange={(e) => set(k, e.target.checked)} className="w-4 h-4" />
      {label}
    </label>
  );

  return (
    <Modal title={item?.id ? t('Modifier le frais', 'Edit fee', 'Editar tasa') : t('Nouveau frais', 'New fee', 'Nueva tasa')} onClose={onClose} size="lg">
      <form onSubmit={submit} className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className={lbl}>{t('Nom du frais', 'Fee name', 'Nombre')}</label>
          <input className={fld} value={f.name} autoFocus onChange={(e) => set('name', e.target.value)} />
        </div>
        <div>
          <label className={lbl}>{t('Catégorie', 'Category', 'Categoría')}</label>
          <select className={fld} value={f.category} onChange={(e) => set('category', e.target.value)}>
            {FEE_CATEGORIES.map((c) => <option key={c} value={c}>{t(...(FEE_CATEGORY_LABELS[c] || [c]))}</option>)}
          </select>
        </div>
        <div>
          <label className={lbl}>{t('Montant', 'Amount', 'Importe')}</label>
          <input className={fld} type="number" min="0" value={f.amount} onChange={(e) => set('amount', e.target.value)} />
        </div>
        <div>
          <label className={lbl}>{t('Année scolaire', 'School year', 'Año escolar')}</label>
          <input className={fld} value={f.academic_year} onChange={(e) => set('academic_year', e.target.value)} placeholder="2025-2026" />
        </div>
        <div>
          <label className={lbl}>{t('Section concernée', 'Section', 'Sección')}</label>
          <select className={fld} value={f.level} onChange={(e) => set('level', e.target.value)}>
            <option value="">{t('— toutes les sections —', '— all sections —', '— todas —')}</option>
            {SECTIONS.filter((s) => s.key !== 'autre').map((s) => (
              <option key={s.key} value={s.key}>{t(s.fr, s.en, s.es)}</option>
            ))}
          </select>
        </div>
        <div className="col-span-2">
          <label className={lbl}>{t('Classe concernée', 'Class', 'Clase')}</label>
          <select className={fld} value={f.class_id} onChange={(e) => set('class_id', e.target.value)}>
            <option value="">{t('— toutes (selon niveau/école) —', '— all —', '— todas —')}</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className={lbl}>{t('Type de paiement', 'Payment type', 'Tipo de pago')}</label>
          <select className={fld} value={f.payment_type} onChange={(e) => set('payment_type', e.target.value)}>
            {FEE_PAYMENT_TYPES.map((p) => <option key={p} value={p}>{t(...PAYMENT_TYPE_LABELS[p])}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={lbl}>{t('Date de début', 'Start', 'Inicio')}</label>
            <input className={fld} type="date" value={f.start_date} onChange={(e) => set('start_date', e.target.value)} />
          </div>
          <div>
            <label className={lbl}>{t('Date de fin', 'End', 'Fin')}</label>
            <input className={fld} type="date" value={f.end_date} onChange={(e) => set('end_date', e.target.value)} />
          </div>
        </div>
        <div className="col-span-2 flex flex-wrap gap-4 pt-1">
          <Check k="mandatory" label={t('Obligatoire', 'Mandatory', 'Obligatorio')} />
          <Check k="optional" label={t('Optionnel', 'Optional', 'Opcional')} />
          <Check k="active" label={t('Actif', 'Active', 'Activo')} />
        </div>
        <div className="col-span-2 flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">{t('Annuler', 'Cancel', 'Cancelar')}</button>
          <button type="submit" disabled={!f.name.trim() || saving} className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50">
            {saving ? t('Enregistrement…', 'Saving…', 'Guardando…') : t('Enregistrer', 'Save', 'Guardar')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
