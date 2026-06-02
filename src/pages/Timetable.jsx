import { useEffect, useState, useMemo } from 'react';
import { useAuthStore }   from '../store/authStore';
import { useSchoolStore } from '../store/schoolStore';
import { useUiStore }     from '../store/uiStore';
import { useT, getLang }  from '../lib/i18n';
import Layout             from '../components/Layout';
import Modal              from '../components/Modal';
import { usePlan }        from '../lib/plan';
import UpgradeBanner      from '../components/UpgradeBanner';
import {
  fetchTimetableSlots,
  upsertTimetableSlot,
  deleteTimetableSlot,
} from '../lib/schoolService';

const DAYS_FR = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const DAYS_EN = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAYS_ES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

const daysFor = (lang) => (lang === 'en' ? DAYS_EN : lang === 'es' ? DAYS_ES : DAYS_FR);

const EMPTY_FORM = {
  day_of_week: 1,
  start_time: '07:30',
  end_time: '09:30',
  subject_id: '',
  label: '',
  teacher_id: '',
};

// ── Slot card ─────────────────────────────────────────────────────────────────
function SlotCard({ slot, subjects, teachers, classes, onEdit, onDelete, showClass }) {
  const sub     = subjects.find((s) => s.id === slot.subject_id);
  const teacher = teachers.find((t) => t.id === slot.teacher_id);
  const cls     = classes.find((c) => c.id === slot.class_id);
  const title   = sub?.name || slot.label || '—';

  return (
    <div className="group relative bg-white rounded-xl border border-gray-100 shadow-sm p-3 hover:border-brand-200 hover:shadow transition-all">
      <p className="text-[10px] font-mono text-gray-400 mb-1">
        {slot.start_time?.slice(0, 5)} – {slot.end_time?.slice(0, 5)}
      </p>
      <p className="text-sm font-bold text-gray-900 leading-tight">{title}</p>
      {showClass && cls && (
        <p className="text-xs text-indigo-600 font-medium mt-0.5">{cls.name}</p>
      )}
      {teacher && (
        <p className="text-xs text-gray-500 mt-0.5 truncate">{teacher.name}</p>
      )}
      {onEdit && (
        <div className="absolute top-2 right-2 hidden group-hover:flex gap-1">
          <button
            onClick={() => onEdit(slot)}
            className="w-6 h-6 flex items-center justify-center rounded-lg bg-gray-100 hover:bg-brand-100 text-gray-500 hover:text-brand-700 transition-colors"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/>
            </svg>
          </button>
          <button
            onClick={() => onDelete(slot.id)}
            className="w-6 h-6 flex items-center justify-center rounded-lg bg-gray-100 hover:bg-red-100 text-gray-500 hover:text-red-600 transition-colors"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd"/>
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

// ── Slot modal ────────────────────────────────────────────────────────────────
function SlotModal({ initial, subjects, teachers, onSave, onClose, t }) {
  const lang = getLang();
  const DAYS = daysFor(lang);
  const [form, setForm] = useState({ ...EMPTY_FORM, ...initial });
  const [saving, setSaving] = useState(false);
  const set = (f) => (e) => setForm((p) => ({ ...p, [f]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.start_time >= form.end_time) return;
    setSaving(true);
    await onSave({
      ...form,
      day_of_week: Number(form.day_of_week),
      subject_id:  form.subject_id || null,
      teacher_id:  form.teacher_id || null,
      label:       form.subject_id ? null : (form.label || null),
    });
    setSaving(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="form-label">{t('Jour', 'Day')}</label>
          <select className="form-input" value={form.day_of_week} onChange={set('day_of_week')}>
            {DAYS.map((d, i) => (
              <option key={i + 1} value={i + 1}>{d}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="form-label">{t('Heure début', 'Start time')}</label>
          <input type="time" required className="form-input" value={form.start_time} onChange={set('start_time')} />
        </div>
        <div>
          <label className="form-label">{t('Heure fin', 'End time')}</label>
          <input type="time" required className="form-input" value={form.end_time} onChange={set('end_time')} />
          {form.start_time >= form.end_time && (
            <p className="text-xs text-red-500 mt-1">{t('Heure de fin invalide', 'Invalid end time')}</p>
          )}
        </div>
        <div className="col-span-2">
          <label className="form-label">{t('Matière', 'Subject')}</label>
          <select className="form-input" value={form.subject_id} onChange={set('subject_id')}>
            <option value="">{t('— Autre (texte libre) —', '— Other (free text) —')}</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        {!form.subject_id && (
          <div className="col-span-2">
            <label className="form-label">{t('Libellé', 'Label')}</label>
            <input type="text" className="form-input" placeholder={t('Sport, Récréation…', 'Sport, Break…')}
              value={form.label} onChange={set('label')} />
          </div>
        )}
        <div className="col-span-2">
          <label className="form-label">{t('Enseignant', 'Teacher')}</label>
          <select className="form-input" value={form.teacher_id} onChange={set('teacher_id')}>
            <option value="">{t('— Aucun —', '— None —')}</option>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex gap-3 pt-1">
        <button type="submit" disabled={saving || form.start_time >= form.end_time} className="btn-primary" style={{ width: 'auto', paddingLeft: '2rem', paddingRight: '2rem' }}>
          {saving ? t('Enregistrement…', 'Saving…') : t('Enregistrer', 'Save')}
        </button>
        <button type="button" onClick={onClose} className="btn-secondary">{t('Annuler', 'Cancel')}</button>
      </div>
    </form>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function Timetable() {
  const t         = useT();
  const { f }     = usePlan();
  const lang      = getLang();
  const DAYS      = daysFor(lang);

  const role      = useAuthStore((s) => s.role);
  const school    = useAuthStore((s) => s.school);
  const teacherId = useAuthStore((s) => s.teacherId);
  const viewYear  = useUiStore((s) => s.viewYear);
  const activeYear = viewYear ?? school?.current_year;

  const classes   = useSchoolStore((s) => s.classes);
  const subjects  = useSchoolStore((s) => s.subjects);
  const teachers  = useSchoolStore((s) => s.teachers);

  const [slots,          setSlots]          = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [selectedClass,  setSelectedClass]  = useState('');
  const [activeDay,      setActiveDay]      = useState(1);
  const [showModal,      setShowModal]      = useState(false);
  const [editSlot,       setEditSlot]       = useState(null);
  const [defaultDay,     setDefaultDay]     = useState(1);
  const [confirmDelId,   setConfirmDelId]   = useState(null);

  const isAdmin = role === 'admin';

  useEffect(() => {
    if (!school?.id || !activeYear) return;
    setLoading(true);
    fetchTimetableSlots(school.id, activeYear).then((data) => {
      setSlots(data || []);
      setLoading(false);
    });
  }, [school?.id, activeYear]);

  // Auto-select first class
  useEffect(() => {
    if (isAdmin && classes.length > 0 && !selectedClass) {
      setSelectedClass(classes[0].id);
    }
  }, [classes, isAdmin, selectedClass]);

  const classSubjects = useMemo(
    () => subjects.filter((s) => s.class_id === selectedClass),
    [subjects, selectedClass],
  );

  // Slots filtered and grouped by day
  const filteredSlots = useMemo(() => {
    if (role === 'teacher') return slots.filter((s) => s.teacher_id === teacherId);
    return slots.filter((s) => s.class_id === selectedClass);
  }, [slots, role, teacherId, selectedClass]);

  const slotsByDay = useMemo(() => {
    const map = {};
    for (let d = 1; d <= 6; d++) map[d] = [];
    filteredSlots.forEach((s) => {
      if (map[s.day_of_week]) map[s.day_of_week].push(s);
    });
    return map;
  }, [filteredSlots]);

  const openAdd = (day) => {
    setEditSlot(null);
    setDefaultDay(day);
    setShowModal(true);
  };

  const openEdit = (slot) => {
    setEditSlot(slot);
    setShowModal(true);
  };

  const handleSave = async (form) => {
    const payload = {
      ...(editSlot?.id ? { id: editSlot.id } : {}),
      school_id:    school.id,
      class_id:     isAdmin ? selectedClass : (editSlot?.class_id || ''),
      academic_year: activeYear,
      ...form,
    };
    const saved = await upsertTimetableSlot(payload);
    if (saved) {
      setSlots((prev) => {
        const without = prev.filter((s) => s.id !== saved.id);
        return [...without, saved].sort((a, b) =>
          a.day_of_week !== b.day_of_week
            ? a.day_of_week - b.day_of_week
            : a.start_time.localeCompare(b.start_time),
        );
      });
    }
    setShowModal(false);
  };

  const handleDelete = async (id) => {
    const ok = await deleteTimetableSlot(id);
    if (ok) setSlots((prev) => prev.filter((s) => s.id !== id));
    setConfirmDelId(null);
  };

  if (!f.hasTimetable) {
    return <Layout><UpgradeBanner requiredPlan="pro" featureName={t('Emploi du temps', 'Timetable')} /></Layout>;
  }

  // ── Empty state ──
  if (!loading && isAdmin && classes.length === 0) {
    return (
      <Layout>
        <div className="max-w-3xl">
          <h1 className="text-xl font-bold text-gray-900 mb-6">{t('Emploi du temps', 'Timetable')}</h1>
          <p className="text-gray-500">{t('Créez d\'abord des classes pour configurer l\'emploi du temps.', 'Create classes first to set up the timetable.')}</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-6xl">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <h1 className="text-xl font-bold text-gray-900">{t('Emploi du temps', 'Timetable')}</h1>
          {isAdmin && (
            <div className="flex items-center gap-3 flex-wrap">
              <select
                className="form-input text-sm"
                value={selectedClass}
                onChange={(e) => setSelectedClass(e.target.value)}
                style={{ width: 'auto', minWidth: '160px' }}
              >
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Day tabs (mobile) */}
        <div className="flex gap-1 mb-4 overflow-x-auto pb-1 lg:hidden">
          {DAYS.map((d, i) => (
            <button
              key={i}
              onClick={() => setActiveDay(i + 1)}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                activeDay === i + 1
                  ? 'bg-brand-600 text-white'
                  : 'bg-white text-gray-500 border border-gray-200 hover:border-brand-300'
              }`}
            >
              {d.slice(0, 3)}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-gray-400 animate-pulse text-sm">{t('Chargement…', 'Loading…')}</p>
        ) : (
          <>
            {/* Desktop grid */}
            <div className="hidden lg:grid grid-cols-6 gap-3">
              {DAYS.map((dayLabel, i) => {
                const day = i + 1;
                const daySlots = slotsByDay[day] || [];
                return (
                  <div key={day} className="flex flex-col gap-2">
                    <div className="text-xs font-bold text-gray-500 uppercase tracking-widest pb-1 border-b border-gray-100">
                      {dayLabel}
                    </div>
                    {daySlots.map((slot) => (
                      <SlotCard
                        key={slot.id}
                        slot={slot}
                        subjects={subjects}
                        teachers={teachers}
                        classes={classes}
                        showClass={role === 'teacher'}
                        onEdit={isAdmin ? openEdit : null}
                        onDelete={isAdmin ? setConfirmDelId : null}
                      />
                    ))}
                    {daySlots.length === 0 && (
                      <p className="text-xs text-gray-300 text-center py-4">
                        {t('Vide', 'Empty')}
                      </p>
                    )}
                    {isAdmin && (
                      <button
                        onClick={() => openAdd(day)}
                        className="mt-1 w-full py-2 text-xs font-medium text-gray-400 border border-dashed border-gray-200 rounded-xl hover:border-brand-300 hover:text-brand-600 transition-colors"
                      >
                        + {t('Ajouter', 'Add')}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Mobile: single day view */}
            <div className="lg:hidden space-y-3">
              {(slotsByDay[activeDay] || []).map((slot) => (
                <SlotCard
                  key={slot.id}
                  slot={slot}
                  subjects={subjects}
                  teachers={teachers}
                  classes={classes}
                  showClass={role === 'teacher'}
                  onEdit={isAdmin ? openEdit : null}
                  onDelete={isAdmin ? setConfirmDelId : null}
                />
              ))}
              {(slotsByDay[activeDay] || []).length === 0 && (
                <p className="text-gray-400 text-sm text-center py-8">
                  {t('Aucun créneau ce jour.', 'No slots this day.')}
                </p>
              )}
              {isAdmin && (
                <button
                  onClick={() => openAdd(activeDay)}
                  className="w-full py-3 text-sm font-medium text-brand-600 border-2 border-dashed border-brand-200 rounded-xl hover:bg-brand-50 transition-colors"
                >
                  + {t('Ajouter un créneau', 'Add slot')}
                </button>
              )}
            </div>
          </>
        )}

        {/* Delete confirm */}
        {confirmDelId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
            <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
              <p className="text-gray-900 font-semibold mb-4">
                {t('Supprimer ce créneau ?', 'Delete this slot?')}
              </p>
              <div className="flex gap-3">
                <button onClick={() => handleDelete(confirmDelId)}
                  className="btn-primary bg-red-500 hover:bg-red-600 border-red-500" style={{ width: 'auto', paddingLeft: '1.5rem', paddingRight: '1.5rem' }}>
                  {t('Supprimer', 'Delete')}
                </button>
                <button onClick={() => setConfirmDelId(null)} className="btn-secondary">
                  {t('Annuler', 'Cancel')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Add / Edit modal */}
        {showModal && (
          <Modal
            title={editSlot ? t('Modifier le créneau', 'Edit slot') : t('Nouveau créneau', 'New slot')}
            onClose={() => setShowModal(false)}
          >
            <SlotModal
              initial={editSlot
                ? {
                    day_of_week: editSlot.day_of_week,
                    start_time:  editSlot.start_time?.slice(0, 5) || '07:30',
                    end_time:    editSlot.end_time?.slice(0, 5)   || '09:30',
                    subject_id:  editSlot.subject_id || '',
                    label:       editSlot.label || '',
                    teacher_id:  editSlot.teacher_id || '',
                  }
                : { ...EMPTY_FORM, day_of_week: defaultDay }
              }
              subjects={isAdmin ? classSubjects : subjects}
              teachers={teachers}
              onSave={handleSave}
              onClose={() => setShowModal(false)}
              t={t}
            />
          </Modal>
        )}
      </div>
    </Layout>
  );
}
