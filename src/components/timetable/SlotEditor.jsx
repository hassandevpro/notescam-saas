import { useState } from 'react';
import { getLang } from '../../lib/i18n';
import { inferCategory, categoryLabel } from '../../lib/timetableEngine';

const DAYS_FR = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const DAYS_EN = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAYS_ES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const daysFor = (l) => (l === 'en' ? DAYS_EN : l === 'es' ? DAYS_ES : DAYS_FR);

const EMPTY = { day_of_week: 1, start_time: '07:30', end_time: '09:30', subject_id: '', label: '', teacher_id: '', room: '' };

// ── Éditeur de créneau ───────────────────────────────────────────────────────
// Formulaire d'ajout/édition d'un cours, avec aperçu live de la catégorie/couleur
// déduite et du champ « salle » (alimente la Vue Salle + les conflits de salle).
export default function SlotEditor({ initial, subjects, teachers, rooms = [], onSave, onClose, t }) {
  const DAYS = daysFor(getLang());
  const [form, setForm] = useState({ ...EMPTY, ...initial });
  const [saving, setSaving] = useState(false);
  const set = (f) => (e) => setForm((p) => ({ ...p, [f]: e.target.value }));

  const invalid = form.start_time >= form.end_time;
  const subjectName = subjects.find((s) => s.id === form.subject_id)?.name;
  const cat = inferCategory(subjectName || form.label);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (invalid) return;
    setSaving(true);
    await onSave({
      ...form,
      day_of_week: Number(form.day_of_week),
      subject_id:  form.subject_id || null,
      teacher_id:  form.teacher_id || null,
      room:        form.room?.trim() || null,
      label:       form.subject_id ? null : (form.label || null),
    });
    setSaving(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Aperçu live de la couleur catégorie */}
      <div
        className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold"
        style={{ backgroundColor: cat.color.bg, borderColor: cat.color.border, color: cat.color.text }}
      >
        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: cat.color.dot }} />
        {subjectName || form.label || t('Nouveau cours', 'New course')}
        <span className="ml-auto text-[11px] uppercase tracking-wide opacity-80">{categoryLabel(cat.id, t)}</span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="form-label">{t('Jour', 'Day')}</label>
          <select className="form-input" value={form.day_of_week} onChange={set('day_of_week')}>
            {DAYS.map((d, i) => <option key={i + 1} value={i + 1}>{d}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">{t('Heure début', 'Start time')}</label>
          <input type="time" required className="form-input" value={form.start_time} onChange={set('start_time')} />
        </div>
        <div>
          <label className="form-label">{t('Heure fin', 'End time')}</label>
          <input type="time" required className="form-input" value={form.end_time} onChange={set('end_time')} />
          {invalid && <p className="text-xs text-red-500 mt-1">{t('Heure de fin invalide', 'Invalid end time')}</p>}
        </div>

        <div className="col-span-2">
          <label className="form-label">{t('Matière', 'Subject')}</label>
          <select className="form-input" value={form.subject_id} onChange={set('subject_id')}>
            <option value="">{t('— Autre (texte libre) —', '— Other (free text) —')}</option>
            {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        {!form.subject_id && (
          <div className="col-span-2">
            <label className="form-label">{t('Libellé', 'Label')}</label>
            <input type="text" className="form-input" placeholder={t('Sport, Récréation…', 'Sport, Break…')}
              value={form.label} onChange={set('label')} />
          </div>
        )}

        <div>
          <label className="form-label">{t('Enseignant', 'Teacher')}</label>
          <select className="form-input" value={form.teacher_id} onChange={set('teacher_id')}>
            <option value="">{t('— Aucun —', '— None —')}</option>
            {teachers.map((tc) => <option key={tc.id} value={tc.id}>{tc.name}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">{t('Salle', 'Room')}</label>
          <input type="text" className="form-input" list="tt-rooms" placeholder={t('Salle 12, Labo…', 'Room 12, Lab…')}
            value={form.room} onChange={set('room')} />
          <datalist id="tt-rooms">
            {rooms.map((r) => <option key={r} value={r} />)}
          </datalist>
        </div>
      </div>

      <div className="flex gap-3 pt-1">
        <button type="submit" disabled={saving || invalid} className="btn-primary"
          style={{ width: 'auto', paddingLeft: '2rem', paddingRight: '2rem' }}>
          {saving ? t('Enregistrement…', 'Saving…') : t('Enregistrer', 'Save')}
        </button>
        <button type="button" onClick={onClose} className="btn-secondary">{t('Annuler', 'Cancel')}</button>
      </div>
    </form>
  );
}
