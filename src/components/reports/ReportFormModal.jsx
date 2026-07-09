import { useState } from 'react';
import Modal from '../Modal';
import { useT } from '../../lib/i18n';
import { REPORT_CATEGORIES, REPORT_SEVERITIES, resolveAssignment } from '../../lib/reportEngine';
import { CATEGORY_LABELS, SEVERITY_UI } from './reportUi';

// Création d'un report. Tout utilisateur autorisé peut en créer un.
// L'affectation est calculée AUTOMATIQUEMENT à partir de la catégorie (aperçu).
export default function ReportFormModal({ onSave, onClose }) {
  const t = useT();
  const [category, setCategory] = useState('vie_scolaire');
  const [severity, setSeverity] = useState('normal');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const dept = resolveAssignment(category);

  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim() || saving) return;
    setSaving(true);
    await onSave({ category, severity, title: title.trim(), description: description.trim() });
    setSaving(false);
  };

  const field = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none';
  const lbl = 'block text-xs font-semibold text-gray-500 mb-1';

  return (
    <Modal title={t('Nouveau report', 'New report', 'Nuevo reporte')} onClose={onClose} size="lg">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={lbl}>{t('Catégorie', 'Category', 'Categoría')}</label>
            <select className={field} value={category} onChange={(e) => setCategory(e.target.value)}>
              {REPORT_CATEGORIES.map((c) => <option key={c} value={c}>{t(...(CATEGORY_LABELS[c] || [c]))}</option>)}
            </select>
          </div>
          <div>
            <label className={lbl}>{t('Gravité', 'Severity', 'Gravedad')}</label>
            <select className={field} value={severity} onChange={(e) => setSeverity(e.target.value)}>
              {REPORT_SEVERITIES.map((s) => <option key={s} value={s}>{t(...SEVERITY_UI[s].label)}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className={lbl}>{t('Objet', 'Subject', 'Asunto')}</label>
          <input className={field} value={title} autoFocus onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <label className={lbl}>{t('Description', 'Description', 'Descripción')}</label>
          <textarea className={field} rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="text-xs bg-indigo-50 border border-indigo-100 text-indigo-700 rounded-lg px-3 py-2">
          {t('Affectation automatique', 'Automatic assignment', 'Asignación automática')} :{' '}
          <b>{dept || t('aucune', 'none', 'ninguna')}</b>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
            {t('Annuler', 'Cancel', 'Cancelar')}
          </button>
          <button type="submit" disabled={!title.trim() || saving}
            className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50">
            {saving ? t('Envoi…', 'Sending…', 'Enviando…') : t('Créer', 'Create', 'Crear')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
