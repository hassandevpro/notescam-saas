import { useState } from 'react';
import Modal from '../Modal';
import { useT } from '../../lib/i18n';
import { sanitizeRecord } from './hrEntities';

// Modal générique : rend les champs d'une entité RH à partir de son descripteur.
export default function HrRecordModal({ tab, record, onSave, onClose }) {
  const t = useT();
  const editing = !!record?.id;
  const [values, setValues] = useState(() => {
    const init = {};
    for (const f of tab.fields) init[f.key] = record?.[f.key] ?? '';
    return init;
  });
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setValues((s) => ({ ...s, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    await onSave({ ...record, ...sanitizeRecord(tab.fields, values) });
    setSaving(false);
  };

  const field = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none';
  const lbl = 'block text-xs font-semibold text-gray-500 mb-1';

  return (
    <Modal
      title={`${editing ? t('Modifier', 'Edit', 'Editar') : t('Ajouter', 'Add', 'Añadir')} — ${t(...tab.label)}`}
      onClose={onClose} size="lg"
    >
      <form onSubmit={submit} className="grid grid-cols-2 gap-3">
        {tab.fields.map((f) => (
          <div key={f.key} className={f.type === 'textarea' ? 'col-span-2' : ''}>
            <label className={lbl}>{t(...f.label)}</label>
            {f.type === 'select' ? (
              <select className={field} value={values[f.key] ?? ''} onChange={(e) => set(f.key, e.target.value)}>
                {f.options.map((o) => <option key={o.value} value={o.value}>{t(...o.label)}</option>)}
              </select>
            ) : f.type === 'textarea' ? (
              <textarea className={field} rows={2} value={values[f.key] ?? ''} onChange={(e) => set(f.key, e.target.value)} />
            ) : (
              <input className={field} type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : f.type === 'time' ? 'time' : 'text'}
                value={values[f.key] ?? ''} onChange={(e) => set(f.key, e.target.value)} />
            )}
          </div>
        ))}
        <div className="col-span-2 flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
            {t('Annuler', 'Cancel', 'Cancelar')}
          </button>
          <button type="submit" disabled={saving}
            className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50">
            {saving ? t('Enregistrement…', 'Saving…', 'Guardando…') : t('Enregistrer', 'Save', 'Guardar')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
