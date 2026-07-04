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
import {
  decorateSlot, detectConflicts, conflictedSlotIds, buildTimeRanges, buildGrid,
  computeStats, filterByView, distinctRooms,
} from '../lib/timetableEngine';
import TimetableDashboard from '../components/timetable/TimetableDashboard';
import ConflictBanner     from '../components/timetable/ConflictBanner';
import ViewSwitcher       from '../components/timetable/ViewSwitcher';
import TimetableGrid      from '../components/timetable/TimetableGrid';
import SlotEditor         from '../components/timetable/SlotEditor';
import TimetablePrint     from '../components/timetable/TimetablePrint';
import '../styles/timetable.css';

const DAYS_FR = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const DAYS_EN = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAYS_ES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const DAYS_TR = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
const daysFor = (l) => (l === 'en' ? DAYS_EN : l === 'es' ? DAYS_ES : l === 'tr' ? DAYS_TR : DAYS_FR);

// Colonnes réelles de timetable_slots → on n'envoie JAMAIS les champs décorés
// (title, color, category…) au backend (Supabase rejette les colonnes inconnues).
const DB_COLUMNS = [
  'id', 'school_id', 'class_id', 'academic_year', 'day_of_week',
  'start_time', 'end_time', 'subject_id', 'teacher_id', 'label', 'room',
];
const toPayload = (slot) => {
  const out = {};
  for (const k of DB_COLUMNS) if (slot[k] !== undefined) out[k] = slot[k];
  return out;
};

export default function Timetable() {
  const t          = useT();
  const { f }      = usePlan();
  const DAYS       = daysFor(getLang());

  const role       = useAuthStore((s) => s.role);
  const school     = useAuthStore((s) => s.school);
  const teacherId  = useAuthStore((s) => s.teacherId);
  const viewYear   = useUiStore((s) => s.viewYear);
  const activeYear = viewYear ?? school?.current_year;

  const classes    = useSchoolStore((s) => s.classes);
  const subjects   = useSchoolStore((s) => s.subjects);
  const teachers   = useSchoolStore((s) => s.teachers);

  const isManager  = role === 'admin' || role === 'censeur';

  const [slots,        setSlots]        = useState([]);   // BRUT (colonnes réelles)
  const [loading,      setLoading]      = useState(true);
  const [view,         setView]         = useState(isManager ? 'class' : 'teacher');
  const [entityId,     setEntityId]     = useState('');
  const [showModal,    setShowModal]    = useState(false);
  const [editSlot,     setEditSlot]     = useState(null);
  const [defaultCell,  setDefaultCell]  = useState(null);
  const [confirmDelId, setConfirmDelId] = useState(null);

  // ── Chargement des créneaux de l'école pour l'année active ─────────────────
  useEffect(() => {
    if (!school?.id || !activeYear) return;
    setLoading(true);
    fetchTimetableSlots(school.id, activeYear).then((data) => {
      setSlots(data || []);
      setLoading(false);
    });
  }, [school?.id, activeYear]);

  const ctx = useMemo(() => ({ subjects, teachers, classes }), [subjects, teachers, classes]);

  // Décoration (titre, couleur, noms) — uniquement pour le rendu.
  const decorated = useMemo(() => slots.map((s) => decorateSlot(s, ctx)), [slots, ctx]);

  // Conflits calculés à l'échelle de TOUTE l'école (prof/salle se chevauchent
  // entre classes : c'est là qu'ils se voient).
  const conflicts   = useMemo(() => detectConflicts(slots, ctx), [slots, ctx]);
  const conflictIds = useMemo(() => conflictedSlotIds(conflicts), [conflicts]);

  // Vues disponibles selon le rôle.
  const views = isManager ? ['class', 'teacher', 'room', 'subject'] : ['teacher'];

  // Entités du sélecteur selon la vue.
  const rooms = useMemo(() => distinctRooms(slots), [slots]);
  const subjectsInUse = useMemo(() => {
    const map = new Map();
    for (const s of slots) {
      if (!s.subject_id) continue;
      const name = subjects.find((x) => x.id === s.subject_id)?.name;
      if (name && !map.has(s.subject_id)) map.set(s.subject_id, name);
    }
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [slots, subjects]);

  const entities = useMemo(() => {
    if (view === 'class')   return classes.map((c) => ({ id: c.id, name: c.name }));
    if (view === 'teacher') return teachers.map((tc) => ({ id: tc.id, name: tc.name }));
    if (view === 'room')    return rooms.map((r) => ({ id: r, name: r }));
    if (view === 'subject') return subjectsInUse;
    return [];
  }, [view, classes, teachers, rooms, subjectsInUse]);

  // Sélection courante : teacher non-manager = soi-même ; sinon 1re entité.
  useEffect(() => {
    if (!isManager) { setEntityId(teacherId || ''); return; }
    if (entities.length === 0) { setEntityId(''); return; }
    if (!entities.some((e) => e.id === entityId)) setEntityId(entities[0].id);
  }, [view, entities, isManager, teacherId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Données dérivées de la vue ──────────────────────────────────────────────
  const filtered = useMemo(
    () => filterByView(decorated, view, entityId),
    [decorated, view, entityId],
  );
  const ranges = useMemo(() => buildTimeRanges(filtered), [filtered]);
  const grid   = useMemo(() => buildGrid(filtered, ranges, 6), [filtered, ranges]);
  const stats  = useMemo(
    () => computeStats({ slots, gridSlots: filtered, ranges, days: 6, conflicts }),
    [slots, filtered, ranges, conflicts],
  );

  // Édition possible pour les managers ; ajout de cellule seulement en Vue Classe
  // (besoin d'un class_id non ambigu).
  const editable = isManager;
  const canAdd   = isManager && view === 'class' && !!entityId;
  const showClass = view !== 'class';

  // Classe concernée par l'édition (cours existant → sa classe ; sinon classe sélectionnée en Vue Classe).
  const selectedClassId = editSlot?.class_id || (view === 'class' ? entityId : null);

  // Matières proposées dans l'éditeur. MÊME source que « Gestion des Matières »
  // (store `subjects`, table officielle) — aucune seconde source.
  // On propose en priorité les matières de la classe ; si la classe n'en a
  // aucune (ou class_id non concordant), on se rabat sur TOUTES les matières du
  // système au lieu d'afficher un menu vide.
  const editorSubjects = useMemo(() => {
    const classSubs = selectedClassId ? subjects.filter((s) => s.class_id === selectedClassId) : [];
    const base = classSubs.length ? classSubs : subjects;
    // Dédoublonnage par NOM : le repli « toutes les matières » répète le même
    // intitulé une fois par classe (Géo, Géo…). On garde une entrée par nom.
    const seen = new Set();
    const list = [];
    for (const s of base) {
      const key = (s.name || '').trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      list.push(s);
    }
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [selectedClassId, subjects]);

  // ── Mutations ───────────────────────────────────────────────────────────────
  const persist = async (payload) => {
    const saved = await upsertTimetableSlot(payload);
    if (saved) {
      setSlots((prev) => {
        const without = prev.filter((s) => s.id !== saved.id);
        return [...without, saved];
      });
    }
    return saved;
  };

  const handleMove = async (decoratedSlot, day, range) => {
    const raw = slots.find((s) => s.id === decoratedSlot.id);
    if (!raw) return;
    await persist(toPayload({ ...raw, day_of_week: day, start_time: range.start, end_time: range.end }));
  };

  const handleSave = async (form) => {
    const base = editSlot
      ? { ...editSlot }
      : { school_id: school.id, class_id: entityId, academic_year: activeYear };
    await persist(toPayload({ ...base, ...form }));
    setShowModal(false);
  };

  const handleDelete = async (id) => {
    const ok = await deleteTimetableSlot(id);
    if (ok) setSlots((prev) => prev.filter((s) => s.id !== id));
    setConfirmDelId(null);
  };

  const openAdd = (day, range) => {
    setEditSlot(null);
    setDefaultCell({ day_of_week: day, start_time: range.start, end_time: range.end });
    setShowModal(true);
  };
  const openEdit = (decoratedSlot) => {
    const raw = slots.find((s) => s.id === decoratedSlot.id) || decoratedSlot;
    setEditSlot(raw);
    setShowModal(true);
  };

  // ── Plan / garde-fous ───────────────────────────────────────────────────────
  if (!f.hasTimetable) {
    return <Layout><UpgradeBanner requiredPlan="pro" featureName={t('Emploi du temps', 'Timetable')} /></Layout>;
  }
  if (!loading && isManager && classes.length === 0) {
    return (
      <Layout>
        <div className="max-w-3xl">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">{t('Emploi du temps', 'Timetable')}</h1>
          <p className="text-gray-500">{t("Créez d'abord des classes pour configurer l'emploi du temps.", 'Create classes first to set up the timetable.')}</p>
        </div>
      </Layout>
    );
  }

  // En-tête imprimable.
  const entityName = entities.find((e) => e.id === entityId)?.name || '';
  const viewLabel = {
    class: t('Classe', 'Class'), teacher: t('Enseignant', 'Teacher'),
    room: t('Salle', 'Room'), subject: t('Matière', 'Subject'),
  }[view];
  const printTitle = entityName || t('Emploi du temps', 'Timetable');
  const printSubtitle = `${viewLabel}${activeYear ? '' : ''}`;

  return (
    <Layout>
      {/* Rendu PDF (masqué à l'écran) */}
      <TimetablePrint
        slots={filtered}
        ranges={ranges}
        dayLabels={DAYS}
        title={printTitle}
        subtitle={printSubtitle}
        year={activeYear}
        school={school}
        showClass={showClass}
        t={t}
      />

      <div className="max-w-7xl tt-screen">
        {/* En-tête */}
        <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t('Emploi du temps', 'Timetable')}</h1>
            <p className="text-sm text-gray-500 mt-1">
              {t('Planificateur scolaire — glissez-déposez les cours, détectez les conflits.',
                 'School planner — drag & drop courses, detect conflicts.')}
            </p>
          </div>
          <button
            onClick={() => window.print()}
            disabled={filtered.length === 0}
            className="btn-secondary inline-flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ width: 'auto' }}
            title={t('Imprimer / Exporter en PDF', 'Print / Export to PDF')}
          >
            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5 4a2 2 0 00-2 2v3a2 2 0 002 2h1v2a1 1 0 001 1h6a1 1 0 001-1v-2h1a2 2 0 002-2V6a2 2 0 00-2-2H5zm10 7V6H5v5h10zm-2 1H7v2h6v-2z" clipRule="evenodd"/></svg>
            {t('Imprimer / PDF', 'Print / PDF')}
          </button>
        </div>

        {/* Tableau de bord */}
        <TimetableDashboard stats={stats} t={t} />

        {/* Bandeau conflits */}
        <ConflictBanner conflicts={conflicts} dayLabels={DAYS} t={t} />

        {/* Sélecteur de vue + entité */}
        <div className="mb-4">
          <ViewSwitcher
            views={views}
            view={view}
            onViewChange={setView}
            entities={isManager ? entities : []}
            entityId={entityId}
            onEntityChange={setEntityId}
            entityPlaceholder={view === 'room' && rooms.length === 0 ? t('Aucune salle', 'No room') : undefined}
            t={t}
          />
        </div>

        {/* Grille */}
        {loading ? (
          <p className="text-gray-400 animate-pulse text-sm py-10 text-center">{t('Chargement…', 'Loading…')}</p>
        ) : ranges.length === 0 && filtered.length === 0 && !canAdd ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white py-16 text-center">
            <p className="text-slate-400 text-sm">{t('Aucun cours pour cette sélection.', 'No courses for this selection.')}</p>
          </div>
        ) : (
          <TimetableGrid
            grid={grid}
            dayLabels={DAYS}
            editable={editable}
            conflictedIds={conflictIds}
            showClass={showClass}
            onMove={handleMove}
            onEdit={openEdit}
            onDelete={isManager ? setConfirmDelId : undefined}
            onAdd={canAdd ? openAdd : () => {}}
            t={t}
          />
        )}

        {/* Légende des catégories */}
        <p className="mt-3 text-[11px] text-slate-400">
          {t('Couleurs automatiques par catégorie de matière.', 'Automatic colours by subject category.')}
        </p>

        {/* Confirmation suppression */}
        {confirmDelId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
            <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
              <p className="text-gray-900 font-semibold mb-4">{t('Supprimer ce cours ?', 'Delete this course?')}</p>
              <div className="flex gap-3">
                <button onClick={() => handleDelete(confirmDelId)}
                  className="btn-primary bg-red-500 hover:bg-red-600 border-red-500" style={{ width: 'auto', paddingLeft: '1.5rem', paddingRight: '1.5rem' }}>
                  {t('Supprimer', 'Delete')}
                </button>
                <button onClick={() => setConfirmDelId(null)} className="btn-secondary">{t('Annuler', 'Cancel')}</button>
              </div>
            </div>
          </div>
        )}

        {/* Éditeur de créneau */}
        {showModal && (
          <Modal
            title={editSlot ? t('Modifier le cours', 'Edit course') : t('Nouveau cours', 'New course')}
            onClose={() => setShowModal(false)}
          >
            <SlotEditor
              initial={editSlot
                ? {
                    day_of_week: editSlot.day_of_week,
                    start_time:  (editSlot.start_time || '07:30').slice(0, 5),
                    end_time:    (editSlot.end_time   || '09:30').slice(0, 5),
                    subject_id:  editSlot.subject_id || '',
                    label:       editSlot.label || '',
                    teacher_id:  editSlot.teacher_id || '',
                    room:        editSlot.room || '',
                  }
                : { day_of_week: 1, start_time: '07:30', end_time: '09:30', subject_id: '', label: '', teacher_id: '', room: '', ...defaultCell }
              }
              subjects={editorSubjects}
              teachers={teachers}
              rooms={rooms}
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
