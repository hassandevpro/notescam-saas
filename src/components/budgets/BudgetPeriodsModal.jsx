// Configuration des PÉRIODES budgétaires (modèle CIBLE v3) — UNE SEULE FOIS par
// année, réutilisées par toutes les lignes. Nom libre + dates + description +
// ordre. Nombre libre. Aucune règle métier ici : le serveur valide (chevauchement,
// unicité, dates, verrou d'une période utilisée) et renvoie le message d'erreur.
import { useState } from 'react';
import Modal from '../Modal';
import { useT } from '../../lib/i18n';
import { upsertBudgetPeriod, deleteBudgetPeriod } from '../../lib/budgetPeriodService';
import { toast } from '../../store/toastStore';

const field = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none';
const lbl = 'block text-xs font-semibold text-gray-500 mb-1';
const empty = { id: null, name: '', start_date: '', end_date: '', description: '', position: 0 };

export default function BudgetPeriodsModal({ schoolId, year, periods = [], onChange, onClose }) {
  const t = useT();
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const editing = !!form.id;

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const reset = () => setForm(empty);

  const valid = form.name.trim() && form.start_date && form.end_date && form.end_date > form.start_date;

  const save = async (e) => {
    e.preventDefault();
    if (!valid || saving) return;
    setSaving(true);
    const position = form.position !== '' && form.position != null
      ? Number(form.position)
      : (editing ? form.position : periods.length + 1);
    const { error } = await upsertBudgetPeriod({ ...form, position, school_id: schoolId, academic_year: year });
    setSaving(false);
    if (error) return toast.error(error.message || t('Échec de l’enregistrement', 'Save failed', 'Error al guardar'));
    toast.success(t('Période enregistrée', 'Period saved', 'Período guardado'));
    reset();
    onChange?.();
  };

  const edit = (p) => setForm({ id: p.id, name: p.name || '', start_date: p.start_date || '', end_date: p.end_date || '', description: p.description || '', position: p.position ?? 0 });

  const remove = async (p) => {
    const { ok, error } = await deleteBudgetPeriod(p.id);
    if (!ok) return toast.error(error?.message?.toLowerCase().includes('restrict') || error?.message?.toLowerCase().includes('foreign')
      ? t('Période utilisée par une ligne — retirez d’abord ses allocations.', 'Period used by a line — remove its allocations first.', 'Período usado por una línea.')
      : (error?.message || t('Suppression impossible', 'Delete failed', 'Error al eliminar')));
    toast.success(t('Période supprimée', 'Period deleted', 'Período eliminado'));
    if (form.id === p.id) reset();
    onChange?.();
  };

  const sorted = [...periods].sort((a, b) => (a.position || 0) - (b.position || 0));

  return (
    <Modal title={t('Périodes budgétaires de l’année', 'Budget periods of the year', 'Períodos presupuestarios')} onClose={onClose} size="lg">
      <div className="space-y-4">
        <p className="text-xs text-gray-500">
          {t('Configurez vos périodes une seule fois pour', 'Configure your periods once for', 'Configure sus períodos una vez para')} <b>{year}</b>.
          {' '}{t('Elles seront réutilisées par toutes les lignes budgétaires.', 'They will be reused by all budget lines.', 'Se reutilizarán en todas las líneas.')}
        </p>

        {/* Liste des périodes existantes */}
        {sorted.length > 0 ? (
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-400 text-xs"><tr>
                <th className="text-left px-3 py-2 font-semibold">#</th>
                <th className="text-left px-3 py-2 font-semibold">{t('Nom', 'Name', 'Nombre')}</th>
                <th className="text-left px-3 py-2 font-semibold">{t('Du → au', 'From → to', 'Del → al')}</th>
                <th className="px-3 py-2" />
              </tr></thead>
              <tbody>
                {sorted.map((p) => (
                  <tr key={p.id} className="border-t border-gray-100">
                    <td className="px-3 py-2 text-gray-400 tabular-nums">{p.position || 0}</td>
                    <td className="px-3 py-2">
                      <div className="font-medium text-gray-800">{p.name}</div>
                      {p.description && <div className="text-xs text-gray-400">{p.description}</div>}
                    </td>
                    <td className="px-3 py-2 text-gray-500 tabular-nums whitespace-nowrap">{p.start_date} → {p.end_date}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <button onClick={() => edit(p)} className="text-[11px] text-gray-400 hover:text-gray-700 px-1">✎</button>
                      <button onClick={() => remove(p)} className="text-[11px] text-rose-400 hover:text-rose-600 px-1">✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-gray-400 py-4 text-center">{t('Aucune période configurée.', 'No period configured.', 'Sin períodos.')}</p>
        )}

        {/* Formulaire ajout / édition */}
        <form onSubmit={save} className="border border-gray-200 rounded-xl p-4 space-y-3 bg-gray-50/50">
          <div className="text-xs font-bold text-gray-600">{editing ? t('Modifier la période', 'Edit period', 'Editar período') : t('Ajouter une période', 'Add a period', 'Añadir período')}</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className={lbl}>{t('Nom (libre)', 'Name (free)', 'Nombre')}</label>
              <input className={field} value={form.name} onChange={set('name')} placeholder={t('Premier trimestre', 'First term', 'Primer trimestre')} autoFocus />
            </div>
            <div>
              <label className={lbl}>{t('Début', 'Start', 'Inicio')}</label>
              <input className={field} type="date" value={form.start_date} onChange={set('start_date')} />
            </div>
            <div>
              <label className={lbl}>{t('Fin', 'End', 'Fin')}</label>
              <input className={field} type="date" value={form.end_date} onChange={set('end_date')} />
            </div>
            <div className="sm:col-span-2">
              <label className={lbl}>{t('Description (facultative)', 'Description (optional)', 'Descripción (opcional)')}</label>
              <input className={field} value={form.description} onChange={set('description')} />
            </div>
            <div>
              <label className={lbl}>{t('Ordre d’affichage', 'Display order', 'Orden')}</label>
              <input className={field} type="number" min="0" step="1" value={form.position} onChange={set('position')} />
            </div>
          </div>
          {form.start_date && form.end_date && form.end_date <= form.start_date && (
            <p className="text-xs text-rose-600">{t('La date de fin doit être postérieure au début.', 'End date must be after start.', 'La fecha de fin debe ser posterior.')}</p>
          )}
          <div className="flex justify-end gap-2">
            {editing && <button type="button" onClick={reset} className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">{t('Annuler', 'Cancel', 'Cancelar')}</button>}
            <button type="submit" disabled={!valid || saving} className="px-4 py-1.5 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50">
              {saving ? t('Enregistrement…', 'Saving…', 'Guardando…') : editing ? t('Mettre à jour', 'Update', 'Actualizar') : t('Ajouter', 'Add', 'Añadir')}
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
