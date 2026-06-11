import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useSchoolStore } from '../store/schoolStore';
import Layout from '../components/Layout';
import Modal from '../components/Modal';
import { useT } from '../lib/i18n';
import { usePlan } from '../lib/plan';
import UpgradeBanner from '../components/UpgradeBanner';
import { useCountry, defaultSystemForCountry } from '../lib/useCountry';
import { COUNTRIES } from '../countries';

const SYSTEMS = ['FR', 'EN'];

// Le Cameroun est bilingue : à la création d'une classe on propose les niveaux
// francophones ET anglophones quel que soit le système de l'école (ceux de sa
// propre langue d'abord). Hors Cameroun (Guinée Éq.), on garde uniquement les
// niveaux du pays.
const CAMEROON_CODES = new Set(['cameroon_fr', 'cameroon_en']);

function niveauGroupsForCycle(country, cycleCode) {
  const own = country?.cycles?.find((c) => c.code === cycleCode)?.levelGroups || [];
  if (!CAMEROON_CODES.has(country?.code)) return own;
  const otherCode = country.code === 'cameroon_fr' ? 'cameroon_en' : 'cameroon_fr';
  const other = COUNTRIES[otherCode]?.cycles?.find((c) => c.code === cycleCode)?.levelGroups || [];
  const seen = new Set(own.map((g) => g.group));
  return [...own, ...other.filter((g) => !seen.has(g.group))];
}

// Tous les niveaux anglophones (Nursery, Class, Form, Sixth), dérivés de la
// config EN -> sert à basculer automatiquement la classe en notation /100 (EN)
// quand on en choisit un, même dans une école francophone.
const EN_NIVEAUX = new Set(
  (COUNTRIES.cameroon_en?.cycles || []).flatMap((c) => c.levelGroups.flatMap((g) => g.items)),
);

const SUBJECT_CATALOG = [
  // Langues
  'Français', 'Anglais', 'Espagnol', 'Allemand', 'Arabe', 'Latin',
  'LMC', 'Langue Nationale',
  // Sciences
  'Mathématiques', 'Sciences Physiques', 'Chimie',
  'Sciences Naturelles', 'SVT', 'Biologie',
  // Sciences humaines
  'Histoire-Géographie', 'Histoire', 'Géographie',
  'Éducation Civique', 'ECMC', 'Philosophie',
  // Techniques & Pro
  'Informatique', 'Technologie', 'Comptabilité',
  'Économie Générale', 'Gestion', 'EFPS',
  // Arts & Sport
  'EPS', 'Arts Plastiques', 'Musique',
  // Autre
  'Religion', 'Travaux Pratiques',
];

const SUBJECT_CATALOG_EN = [
  // Languages
  'English Language', 'French Language', 'Spanish', 'German', 'Arabic', 'Latin',
  'National Language',
  // Sciences
  'Mathematics', 'Physics', 'Chemistry', 'Physics & Chemistry',
  'Natural Science', 'Biology', 'Computer Science',
  // Humanities
  'History & Geography', 'History', 'Geography',
  'Civic Education', 'Economics', 'Philosophy',
  // Technical & Vocational
  'Technology', 'Accounting', 'General Economics', 'Management',
  // Arts & Sport
  'Physical Education', 'Fine Arts', 'Music',
  // Other
  'Religious Studies', 'Practical Work',
];

// Catálogo de asignaturas para Guinea Ecuatorial — terminología oficial MEC.
const SUBJECT_CATALOG_ES = [
  // Lenguas
  'Lengua Española', 'Francés', 'Inglés', 'Lengua Nacional',
  // Ciencias exactas
  'Matemáticas', 'Física', 'Química', 'Física y Química',
  'Biología y Geología', 'Ciencias Naturales', 'Informática',
  // Ciencias humanas
  'Historia', 'Geografía', 'Historia y Geografía',
  'Educación para la Ciudadanía', 'Filosofía', 'Economía',
  // Técnicas
  'Tecnología', 'Contabilidad', 'Gestión',
  // Artes y deportes
  'Educación Física', 'Educación Artística', 'Música',
  // Otros
  'Religión', 'Trabajos Prácticos',
];

function subjectCatalogForCountry(countryCode, isEN) {
  if (countryCode === 'guinea_eq') return SUBJECT_CATALOG_ES;
  return isEN ? SUBJECT_CATALOG_EN : SUBJECT_CATALOG;
}

const EMPTY_FORM = {
  name: '', level: '', system: 'FR',
  cycle: 'secondaire', current_year: '', teacher_id: '', max_students: '',
};

// ── Formulaire compact (création) ────────────────────────────────────────────
function ClassForm({ onSave, onCancel, defaultYear, teachers }) {
  const t = useT();
  const country = useCountry();
  // Cycles dynamiques selon le pays — labels venant du registre countries/*.
  const CYCLES = country.cycles.map((c) => ({ value: c.code, label: c.label }));

  const isGE = country.code === 'guinea_eq';
  const [form, setForm] = useState({
    ...EMPTY_FORM,
    current_year: defaultYear,
    system: defaultSystemForCountry(country.code),
  });
  const [saving, setSaving] = useState(false);

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleCycleChange = (e) => {
    const cycle = e.target.value;
    setForm((f) => ({ ...f, cycle, level: '', name: '' }));
  };

  const handleNiveauChange = (e) => {
    const niveau = e.target.value;
    setForm((f) => {
      const nameIsAuto = f.name === '' || f.name === f.level;
      // Guinea Ecuatorial : système toujours ES, jamais d'autobascule EN.
      if (isGE) {
        return { ...f, level: niveau, name: nameIsAuto ? niveau : f.name, system: 'ES' };
      }
      // Cameroun : le système suit la langue du niveau choisi (anglophone -> EN
      // /100, francophone -> FR /20), même dans une école francophone. L'admin
      // peut corriger via le sélecteur « Système de notation » (toujours affiché).
      const autoSystem = EN_NIVEAUX.has(niveau) ? 'EN' : 'FR';
      return {
        ...f,
        level: niveau,
        name: nameIsAuto ? niveau : f.name,
        ...(niveau ? { system: autoSystem } : {}),
      };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    await onSave({
      ...form,
      teacher_id:   form.teacher_id   || null,
      max_students: form.max_students ? Number(form.max_students) : null,
    });
    setSaving(false);
  };

  return (
    <form onSubmit={handleSubmit} className="pb-2">

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {/* 1. Cycle en premier — détermine les options de niveau */}
        <div>
          <label className="form-label">{t('Cycle *', 'Cycle *')}</label>
          <select required className="form-input" value={form.cycle} onChange={handleCycleChange}>
            {CYCLES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
        {/* 2. Niveau — auto-remplit le nom — options venant du pays */}
        <div>
          <label className="form-label">{t('Niveau', 'Level')}</label>
          <select className="form-input" value={form.level} onChange={handleNiveauChange}>
            <option value="">— {t('Choisir', 'Select')} —</option>
            {niveauGroupsForCycle(country, form.cycle).map((g) => (
              <optgroup key={g.group} label={g.group}>
                {g.items.map((n) => <option key={n} value={n}>{n}</option>)}
              </optgroup>
            ))}
          </select>
        </div>
        {/* 3. Nom — pré-rempli depuis le niveau, éditable pour distinguer A/B */}
        <div>
          <label className="form-label">
            {t('Nom de la classe *', 'Class name *')}
            {form.level && form.name === form.level && (
              <span className="ml-1 text-gray-400 font-normal normal-case">
                — {t('ajoutez A, B… si besoin', 'add A, B… if needed')}
              </span>
            )}
          </label>
          <input type="text" required className="form-input"
            placeholder={t('Ex : Terminale TI A', 'E.g. Form 4 Science A')}
            value={form.name} onChange={set('name')} />
        </div>
        {!isGE && (
          <div>
            <label className="form-label">{t('Système de notation *', 'Grading system *')}</label>
            <select required className="form-input" value={form.system} onChange={set('system')}>
              {SYSTEMS.map((s) => (
                <option key={s} value={s}>{s === 'FR' ? t('FR — notes sur 20', 'FR — grades out of 20') : t('EN — notes sur 100', 'EN — grades out of 100')}</option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="form-label">{t('Année scolaire', 'Academic year')}</label>
          <input type="text" className="form-input" placeholder="2025-2026"
            value={form.current_year} onChange={set('current_year')} />
        </div>
        <div>
          <label className="form-label">{t('Effectif maximum', 'Maximum enrolment')}</label>
          <input type="number" min="1" max="200" className="form-input" placeholder="Ex : 40"
            value={form.max_students} onChange={set('max_students')} />
        </div>
        <div>
          <label className="form-label">{t('Enseignant titulaire', 'Class teacher')}</label>
          <select className="form-input" value={form.teacher_id} onChange={set('teacher_id')}>
            <option value="">— {t('Aucun', 'None')} —</option>
            {teachers.map((tc) => <option key={tc.id} value={tc.id}>{tc.name}</option>)}
          </select>
        </div>
      </div>
      <div className="flex gap-3 mt-5">
        <button type="submit" disabled={saving} className="btn-primary"
          style={{ width: 'auto', paddingLeft: '2rem', paddingRight: '2rem' }}>
          {saving ? t('Enregistrement…', 'Saving…') : t('Enregistrer', 'Save')}
        </button>
        <button type="button" onClick={onCancel} className="btn-secondary">{t('Annuler', 'Cancel')}</button>
      </div>
    </form>
  );
}

// ── Vue détail / édition d'une classe ────────────────────────────────────────
function ClassDetailView({ cls, teachers, onSave, onCancel, onDelete, schoolLanguage }) {
  const t = useT();
  const country = useCountry();
  const CYCLES = country.cycles.map((c) => ({ value: c.code, label: c.label }));
  const isEN_local = cls.system === 'EN';
  const catalog_local = subjectCatalogForCountry(country.code, isEN_local);
  const subjects      = useSchoolStore((s) => s.subjects);
  const students      = useSchoolStore((s) => s.students);
  const addSubject    = useSchoolStore((s) => s.addSubject);
  const updateSubject = useSchoolStore((s) => s.updateSubject);
  const deleteSubject = useSchoolStore((s) => s.deleteSubject);

  const isEN     = cls.system === 'EN';
  const catalog  = catalog_local;

  const classSubjects = subjects
    .filter((s) => s.class_id === cls.id)
    .sort((a, b) => b.coef - a.coef || a.name.localeCompare(b.name));
  const studentCount  = students.filter((s) => s.class_id === cls.id).length;
  const teacherCount  = new Set(classSubjects.filter((s) => s.teacher_id).map((s) => s.teacher_id)).size;

  const [form, setForm]         = useState({ ...cls, max_students: cls.max_students ?? '' });
  const isMaternelle  = (form.cycle || cls.cycle || 'secondaire') === 'maternelle';
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);
  const [confirmDel, setConfDel] = useState(false);
  const [customSubject, setCustomSubject] = useState({ name: '', coef: 1 });

  const set = (field) => (e) => { setSaved(false); setForm((f) => ({ ...f, [field]: e.target.value })); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    await onSave({
      ...form,
      teacher_id:   form.teacher_id   || null,
      max_students: form.max_students !== '' ? Number(form.max_students) : null,
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  // Subject catalog toggle (live — no form save needed)
  const subjectNameSet = new Set(classSubjects.map((s) => s.name.toLowerCase()));

  const handleToggleSubject = async (name) => {
    const existing = classSubjects.find((s) => s.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      await deleteSubject(existing.id);
    } else {
      const max = (cls.system || 'FR') === 'EN' ? 100 : 20;
      await addSubject({ name, coef: 1, max, class_id: cls.id, teacher_id: null });
    }
  };

  return (
    <div className="space-y-5 mb-6">

      {/* ── Informations de base ─────────────────────────────────── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="mb-5">
          <h2 className="text-lg font-semibold text-gray-900">{t('Modifier la classe', 'Edit class')}</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {t('Mettre à jour', 'Update')} <strong>{cls.name}</strong>
            {cls.current_year ? ` (${cls.current_year})` : ''}
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">{t('Informations de base', 'Basic information')}</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="col-span-2 md:col-span-1">
              <label className="form-label">{t('Nom de la classe *', 'Class name *')}</label>
              <input type="text" required className="form-input" value={form.name} onChange={set('name')} />
            </div>
            <div>
              <label className="form-label">{t('Niveau', 'Level')}</label>
              <select className="form-input" value={form.level || ''} onChange={set('level')}>
                <option value="">— {t('Choisir', 'Select')} —</option>
                {niveauGroupsForCycle(country, form.cycle).map((g) => (
                  <optgroup key={g.group} label={g.group}>
                    {g.items.map((n) => <option key={n} value={n}>{n}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>
            <div>
              <label className="form-label">{t('Effectif maximum', 'Maximum enrolment')}</label>
              <input type="number" min="1" max="200" className="form-input" placeholder="Ex : 40"
                value={form.max_students} onChange={set('max_students')} />
            </div>
            <div>
              <label className="form-label">{t('Enseignant titulaire', 'Class teacher')}</label>
              <select className="form-input" value={form.teacher_id || ''} onChange={set('teacher_id')}>
                <option value="">{t('Aucun enseignant assigné', 'No teacher assigned')}</option>
                {teachers.map((tc) => <option key={tc.id} value={tc.id}>{tc.name}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">{t('Cycle', 'Cycle')}</label>
              <select className="form-input" value={form.cycle || 'secondaire'} onChange={set('cycle')}>
                {CYCLES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            {schoolLanguage === 'bilingue' && (
              <div>
                <label className="form-label">{t('Système de notation', 'Grading system')}</label>
                <select className="form-input" value={form.system || 'FR'} onChange={set('system')}>
                  {SYSTEMS.map((s) => (
                    <option key={s} value={s}>{s === 'FR' ? t('FR — notes sur 20', 'FR — grades out of 20') : t('EN — notes sur 100', 'EN — grades out of 100')}</option>
                  ))}
                </select>
              </div>
            )}
          </div>


          {/* ── Matières ──────────────────────────────────────────── */}
          <div className="mt-6">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-1">
              {t('Matières', 'Subjects')}
            </p>
            <p className="text-xs text-gray-400 mb-3">
              {isMaternelle
                ? t('Ajoutez vos domaines de compétences personnalisés.', 'Add your custom competency domains.')
                : t('Cochez pour activer · modifiez le coefficient et le barème directement', 'Check to activate · edit coefficient and max score directly')}
            </p>
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              {/* En-tête tableau */}
              <div className="grid grid-cols-[24px_1fr_72px_72px_180px] gap-3 px-4 py-2 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                <div />
                <div>{t('Matière', 'Subject')}</div>
                <div className="text-center">Coef</div>
                <div className="text-center">/ Max</div>
                <div>{t('Enseignant', 'Teacher')}</div>
              </div>

              {/* Matières du catalogue — masqué pour maternelle */}
              {!isMaternelle && catalog.map((name, i) => {
                const existing = classSubjects.find((s) => s.name.toLowerCase() === name.toLowerCase());
                const checked  = !!existing;
                return (
                  <div
                    key={name}
                    className={`grid grid-cols-[24px_1fr_72px_72px_180px] gap-3 items-center px-4 py-2.5 ${
                      i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'
                    } ${checked ? '' : 'opacity-50 hover:opacity-80'} transition-opacity`}
                  >
                    <input
                      type="checkbox"
                      className="accent-brand-600 w-4 h-4 cursor-pointer"
                      checked={checked}
                      onChange={() => handleToggleSubject(name)}
                    />
                    <span className={`text-sm truncate ${checked ? 'font-medium text-gray-900' : 'text-gray-500'}`}>
                      {name}
                    </span>
                    {checked ? (
                      <>
                        <input
                          type="number" min="1" max="20" step="1"
                          className="w-full text-center text-sm border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:border-brand-400 focus:ring-1 focus:ring-brand-400/30 bg-white"
                          defaultValue={existing.coef}
                          onBlur={(e) => {
                            const v = Math.max(1, Math.min(20, Number(e.target.value) || 1));
                            e.target.value = v;
                            if (v !== existing.coef) updateSubject(existing.id, { coef: v });
                          }}
                        />
                        <input
                          type="number" min="1" max="200" step="1"
                          className="w-full text-center text-sm border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:border-brand-400 focus:ring-1 focus:ring-brand-400/30 bg-white"
                          defaultValue={existing.max}
                          onBlur={(e) => {
                            const v = Math.max(1, Number(e.target.value) || 20);
                            e.target.value = v;
                            if (v !== existing.max) updateSubject(existing.id, { max: v });
                          }}
                        />
                        <select
                          className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:border-brand-400 bg-white text-gray-700"
                          value={existing.teacher_id || ''}
                          onChange={(e) => updateSubject(existing.id, { teacher_id: e.target.value || null })}
                        >
                          <option value="">— {t('Aucun', 'None')} —</option>
                          {teachers.map((tc) => <option key={tc.id} value={tc.id}>{tc.name}</option>)}
                        </select>
                      </>
                    ) : (
                      <>
                        <div className="text-center text-xs text-gray-200">—</div>
                        <div className="text-center text-xs text-gray-200">—</div>
                        <div className="text-xs text-gray-200">—</div>
                      </>
                    )}
                  </div>
                );
              })}

              {/* Matières hors catalogue (ou toutes pour maternelle) */}
              {classSubjects
                .filter((s) => isMaternelle || !catalog.some((n) => n.toLowerCase() === s.name.toLowerCase()))
                .map((sub, i) => (
                  <div
                    key={sub.id}
                    className={`grid grid-cols-[24px_1fr_72px_72px_180px] gap-3 items-center px-4 py-2.5 ${
                      (catalog.length + i) % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="accent-brand-600 w-4 h-4 cursor-pointer"
                      checked
                      onChange={() => deleteSubject(sub.id)}
                    />
                    <span className="text-sm font-medium text-gray-900 truncate">{sub.name}</span>
                    <input
                      type="number" min="1" max="20" step="1"
                      className="w-full text-center text-sm border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:border-brand-400 focus:ring-1 focus:ring-brand-400/30 bg-white"
                      defaultValue={sub.coef}
                      onBlur={(e) => {
                        const v = Math.max(1, Math.min(20, Number(e.target.value) || 1));
                        e.target.value = v;
                        if (v !== sub.coef) updateSubject(sub.id, { coef: v });
                      }}
                    />
                    <input
                      type="number" min="1" max="200" step="1"
                      className="w-full text-center text-sm border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:border-brand-400 focus:ring-1 focus:ring-brand-400/30 bg-white"
                      defaultValue={sub.max}
                      onBlur={(e) => {
                        const v = Math.max(1, Number(e.target.value) || 20);
                        e.target.value = v;
                        if (v !== sub.max) updateSubject(sub.id, { max: v });
                      }}
                    />
                    <select
                      className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:border-brand-400 bg-white text-gray-700"
                      value={sub.teacher_id || ''}
                      onChange={(e) => updateSubject(sub.id, { teacher_id: e.target.value || null })}
                    >
                      <option value="">— {t('Aucun', 'None')} —</option>
                      {teachers.map((tc) => <option key={tc.id} value={tc.id}>{tc.name}</option>)}
                    </select>
                  </div>
                ))}

              {/* Ligne ajout matière personnalisée */}
              <div className="grid grid-cols-[24px_1fr_72px_72px_180px] gap-3 items-center px-4 py-3 bg-brand-50/60 border-t border-brand-100">
                <div className="text-brand-400 text-lg font-bold text-center leading-none">+</div>
                <input
                  type="text"
                  placeholder={t('Matière personnalisée…', 'Custom subject…', 'Asignatura personalizada…')}
                  className="text-sm border border-brand-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-brand-400 bg-white placeholder:text-gray-400"
                  value={customSubject.name}
                  onChange={(e) => setCustomSubject((p) => ({ ...p, name: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter') return;
                    e.preventDefault();
                    if (!customSubject.name.trim()) return;
                    const max = (cls.system || 'FR') === 'EN' ? 100 : 20;
                    addSubject({ name: customSubject.name.trim(), coef: Number(customSubject.coef) || 1, max, class_id: cls.id, teacher_id: null });
                    setCustomSubject({ name: '', coef: 1 });
                  }}
                />
                <input
                  type="number" min="1" max="20" step="1"
                  className="w-full text-center text-sm border border-brand-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-brand-400 bg-white"
                  value={customSubject.coef}
                  onChange={(e) => setCustomSubject((p) => ({ ...p, coef: e.target.value }))}
                />
                <div className="text-center text-xs text-gray-300">{t('auto', 'auto', 'auto')}</div>
                <button
                  type="button"
                  disabled={!customSubject.name.trim()}
                  onClick={() => {
                    if (!customSubject.name.trim()) return;
                    const max = (cls.system || 'FR') === 'EN' ? 100 : 20;
                    addSubject({ name: customSubject.name.trim(), coef: Number(customSubject.coef) || 1, max, class_id: cls.id, teacher_id: null });
                    setCustomSubject({ name: '', coef: 1 });
                  }}
                  className="px-3 py-1.5 bg-brand-500 hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-lg transition-colors"
                >
                  {t('Ajouter', 'Add')}
                </button>
              </div>
            </div>
          </div>

          <div className="flex gap-3 mt-6 items-center">
            <button type="button" onClick={onCancel} className="btn-secondary">{t('Annuler', 'Cancel')}</button>
            <button type="submit" disabled={saving} className="btn-primary"
              style={{ width: 'auto', paddingLeft: '2rem', paddingRight: '2rem' }}>
              {saving ? t('Enregistrement…', 'Saving…') : t('Enregistrer les modifications', 'Save changes')}
            </button>
            {saved && <span className="text-sm text-emerald-600 font-medium">{t('Modifications enregistrées', 'Changes saved')}</span>}
          </div>
        </form>
      </div>

      {/* ── Statistiques ────────────────────────────────────────── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-base font-semibold text-gray-900 mb-4">{t('Statistiques', 'Statistics')}</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
          {[
            {
              label: t('Année scolaire', 'Academic year'),
              value: cls.current_year || '—',
              badge: cls.current_year ? t('Actuelle', 'Current') : null,
            },
            { label: t('Matières configurées', 'Subjects configured'), value: classSubjects.length },
            { label: t('Enseignants assignés', 'Teachers assigned'),  value: teacherCount },
            {
              label: t('Élèves inscrits', 'Students enrolled'),
              value: cls.max_students
                ? `${studentCount} / ${cls.max_students}`
                : studentCount,
              badge: cls.max_students && studentCount >= cls.max_students ? t('Complet', 'Full') : null,
            },
          ].map(({ label, value, badge }) => (
            <div key={label}>
              <p className="text-xs text-gray-500 mb-1">{label}</p>
              <div className="flex items-center gap-2">
                <p className="text-lg font-bold text-gray-900">{value}</p>
                {badge && (
                  <span className="text-xs text-emerald-600 font-semibold bg-emerald-50 px-1.5 py-0.5 rounded">
                    {badge}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Zone de danger ──────────────────────────────────────── */}
      <div className="bg-white rounded-xl shadow-sm border border-red-100 p-6">
        <h3 className="text-base font-semibold text-red-600 mb-3">{t('Zone de danger', 'Danger zone')}</h3>
        {!confirmDel ? (
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-gray-800">{t('Supprimer la classe', 'Delete class')}</p>
              <p className="text-xs text-gray-500 mt-1">
                {t(
                  "La suppression d'une classe désinscrira automatiquement tous les élèves et supprimera les matières et notes associées. Cette action est irréversible.",
                  "Deleting a class will automatically unenrol all students and remove associated subjects and grades. This action is irreversible."
                )}
              </p>
            </div>
            <button
              onClick={() => setConfDel(true)}
              className="shrink-0 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition-colors"
            >
              {t('Supprimer la classe', 'Delete class')}
            </button>
          </div>
        ) : (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center justify-between gap-4">
            <p className="text-sm text-red-700 font-medium">
              {t('Confirmer la suppression de', 'Confirm deletion of')} <strong>{cls.name}</strong> ?
            </p>
            <div className="flex gap-2 shrink-0">
              <button
                onClick={() => onDelete(cls)}
                className="px-4 py-1.5 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700"
              >
                {t('Oui, supprimer', 'Yes, delete')}
              </button>
              <button onClick={() => setConfDel(false)} className="btn-secondary">{t('Annuler', 'Cancel')}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Carte classe ──────────────────────────────────────────────────────────────
const CYCLE_THEME = {
  secondaire: {
    accent:     'bg-brand-600',
    border:     'border-brand-100',
    hover:      'hover:border-brand-300 hover:shadow-brand-50',
    badge:      'bg-brand-50 text-brand-700 border-brand-100',
    avatar:     'bg-brand-100 text-brand-700',
    editBtn:    'text-brand-600 hover:text-brand-800 hover:bg-brand-50',
  },
  primaire: {
    accent:     'bg-emerald-500',
    border:     'border-emerald-100',
    hover:      'hover:border-emerald-300',
    badge:      'bg-emerald-50 text-emerald-700 border-emerald-100',
    avatar:     'bg-emerald-100 text-emerald-700',
    editBtn:    'text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50',
  },
  maternelle: {
    accent:     'bg-rose-400',
    border:     'border-rose-100',
    hover:      'hover:border-rose-300',
    badge:      'bg-rose-50 text-rose-700 border-rose-100',
    avatar:     'bg-rose-100 text-rose-700',
    editBtn:    'text-rose-500 hover:text-rose-700 hover:bg-rose-50',
  },
};

function ClassCard({ cls, studentCount, subjectCount, teacherName, onEdit }) {
  const t = useT();
  const CYCLE_LABELS = {
    secondaire: t('Secondaire', 'Secondary'),
    primaire:   t('Primaire',   'Primary'),
    maternelle: t('Maternelle', 'Nursery'),
  };
  const cycle = cls.cycle || 'secondaire';
  const theme = CYCLE_THEME[cycle] || CYCLE_THEME.secondaire;
  const sys   = cls.system || 'FR';
  const max   = cls.max_students || null;
  const pct   = max ? Math.min(100, Math.round((studentCount / max) * 100)) : null;
  const capacityColor = pct === null ? null : pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-400' : 'bg-emerald-400';

  return (
    <div className={`bg-white rounded-xl border shadow-sm hover:shadow-md transition-all flex flex-col ${theme.border} ${theme.hover}`}>
      {/* Barre d'accent colorée */}
      <div className={`h-1 rounded-t-xl ${theme.accent}`} />

      {/* En-tête carte */}
      <div className="px-5 pt-4 pb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-lg font-bold text-gray-900 leading-tight truncate">{cls.name}</h3>
          {cls.level && (
            <p className="text-xs text-gray-400 mt-0.5">{cls.level}</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${
            sys === 'EN' ? 'bg-blue-50 text-blue-700 border-blue-100'
            : sys === 'ES' ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
            : 'bg-purple-50 text-purple-700 border-purple-100'
          }`}>
            {sys === 'FR' ? '/20' : sys === 'EN' ? '/100' : '/10'}
          </span>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${theme.badge}`}>
            {CYCLE_LABELS[cycle]}
          </span>
        </div>
      </div>

      {/* Stats */}
      <div className="px-5 py-3 border-t border-gray-50 grid grid-cols-2 gap-3">
        <div>
          <p className="text-xl font-bold text-gray-900">
            {studentCount}
            {max ? <span className="text-sm font-normal text-gray-400">/{max}</span> : null}
          </p>
          <p className="text-xs text-gray-400">{t('élève', 'student')}{studentCount !== 1 ? 's' : ''}</p>
          {max && (
            <div className="mt-1.5 h-1.5 bg-gray-100 rounded-full overflow-hidden w-full">
              <div className={`h-full rounded-full transition-all ${capacityColor}`} style={{ width: `${pct}%` }} />
            </div>
          )}
        </div>
        <div>
          <p className="text-xl font-bold text-gray-900">{subjectCount}</p>
          <p className="text-xs text-gray-400">{t('matière', 'subject')}{subjectCount !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {/* Enseignant */}
      <div className="px-5 py-3 border-t border-gray-50 flex items-center gap-2">
        {teacherName ? (
          <>
            <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${theme.avatar}`}>
              <span className="text-[10px] font-bold">
                {teacherName.slice(0, 2).toUpperCase()}
              </span>
            </div>
            <span className="text-xs text-gray-700 font-medium truncate">{teacherName}</span>
          </>
        ) : (
          <span className="text-xs text-amber-600 font-medium flex items-center gap-1">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {t('Aucun enseignant assigné', 'No teacher assigned')}
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="px-4 py-3 border-t border-gray-50 flex items-center gap-1 mt-auto">
        <button
          onClick={onEdit}
          className={`flex-1 text-center text-xs font-semibold px-2 py-1.5 rounded-lg transition-colors ${theme.editBtn}`}
        >
          {t('Modifier', 'Edit')}
        </button>
        <Link
          to={`/app/grades`}
          className="flex-1 text-center text-xs font-semibold text-gray-500 hover:text-gray-700 hover:bg-gray-50 px-2 py-1.5 rounded-lg transition-colors"
        >
          {t('Notes', 'Grades')}
        </Link>
        <Link
          to={`/app/bulletins`}
          className="flex-1 text-center text-xs font-semibold text-gray-500 hover:text-gray-700 hover:bg-gray-50 px-2 py-1.5 rounded-lg transition-colors"
        >
          {t('Bulletins', 'Report cards')}
        </Link>
      </div>
    </div>
  );
}

// ── Page principale ───────────────────────────────────────────────────────────
export default function Classes() {
  const t = useT();
  const { f } = usePlan();
  const school        = useAuthStore((s) => s.school);
  const schoolLanguage = school?.language || 'francophone';
  const classes     = useSchoolStore((s) => s.classes);
  const teachers    = useSchoolStore((s) => s.teachers);
  const subjects    = useSchoolStore((s) => s.subjects);
  const students    = useSchoolStore((s) => s.students);
  const addClass    = useSchoolStore((s) => s.addClass);
  const updateClass = useSchoolStore((s) => s.updateClass);
  const deleteClass = useSchoolStore((s) => s.deleteClass);

  const [showForm, setShowForm] = useState(false);
  const [editing,  setEditing]  = useState(null);
  const [search,   setSearch]   = useState('');

  const defaultYear = school?.current_year || '';

  // Données agrégées par classe
  const classStats = useMemo(() => {
    const map = {};
    classes.forEach((cls) => {
      map[cls.id] = {
        studentCount: students.filter((s) => s.class_id === cls.id).length,
        subjectCount: subjects.filter((s) => s.class_id === cls.id).length,
        teacherName:  teachers.find((t) => t.id === cls.teacher_id)?.name || null,
      };
    });
    return map;
  }, [classes, students, subjects, teachers]);

  const totalStudents     = students.length;
  const classesNoTeacher  = classes.filter((c) => !c.teacher_id).length;

  const filteredClasses = search.trim()
    ? classes.filter((c) => {
        const q = search.trim().toLowerCase();
        return (
          c.name.toLowerCase().includes(q) ||
          (c.level   || '').toLowerCase().includes(q) ||
          (c.section || '').toLowerCase().includes(q)
        );
      })
    : classes;

  const handleSave = async (form) => {
    if (editing) {
      await updateClass(editing.id, form);
      setEditing((prev) => ({ ...prev, ...form }));
    } else {
      const created = await addClass(form);
      setShowForm(false);
      // Ouvre directement la vue détail pour configurer matières + coefs
      setEditing(created);
    }
  };

  const handleDelete = async (cls) => {
    await deleteClass(cls.id);
    setEditing(null);
  };

  return (
    <Layout>
      <div className="max-w-5xl">
        {/* Header */}
        <div className="flex flex-wrap justify-between items-start gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t('Classes', 'Classes')}</h1>
            <p className="text-sm text-gray-500 mt-1">
              {classes.length} {t('classe', 'class')}{classes.length !== 1 ? 's' : ''} · {totalStudents} {t('élève', 'student')}{totalStudents !== 1 ? 's' : ''}
            </p>
          </div>
          {classes.length >= f.maxClasses ? (
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2 text-sm text-amber-800">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-amber-500 shrink-0">
                <path fillRule="evenodd" d="M10 1a4.5 4.5 0 0 0-4.5 4.5V9H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-.5V5.5A4.5 4.5 0 0 0 10 1Zm3 8V5.5a3 3 0 1 0-6 0V9h6Z" clipRule="evenodd" />
              </svg>
              <span>{t('Limite Starter atteinte', 'Starter limit reached')} ·{' '}
                <a href="https://wa.me/237670894721?text=Je%20veux%20passer%20au%20plan%20%C3%89cole" target="_blank" rel="noopener noreferrer" className="font-semibold underline text-amber-900">
                  {t('Passer au plan École', 'Upgrade to École plan')}
                </a>
              </span>
            </div>
          ) : (
            <button onClick={() => setShowForm(true)} className="btn-primary"
              style={{ width: 'auto', paddingLeft: '1.5rem', paddingRight: '1.5rem' }}>
              + {t('Ajouter une classe', 'Add a class')}
            </button>
          )}
        </div>

        {/* Alerte enseignants manquants */}
        {!editing && classesNoTeacher > 0 && classes.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-5 flex items-center gap-3 text-sm">
            <svg className="w-4 h-4 text-amber-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-amber-800">
              <strong>{classesNoTeacher}</strong> {t('classe', 'class')}{classesNoTeacher > 1 ? 's' : ''} {t('sans enseignant titulaire assigné — cliquez sur la carte pour modifier.', 'without a class teacher assigned — click a card to edit.')}
            </span>
          </div>
        )}

        {/* Modal création classe */}
        {showForm && !editing && (
          <Modal title={t('Nouvelle classe', 'New class')} onClose={() => setShowForm(false)} size="md">
            <ClassForm
              defaultYear={defaultYear}
              teachers={teachers}
              onSave={handleSave}
              onCancel={() => setShowForm(false)}
            />
          </Modal>
        )}

        {/* Modal édition classe */}
        {editing && (
          <Modal title={`${t('Modifier', 'Edit')} — ${editing.name}`} onClose={() => setEditing(null)} size="xl">
            <ClassDetailView
              cls={editing}
              teachers={teachers}
              onSave={handleSave}
              onCancel={() => setEditing(null)}
              onDelete={handleDelete}
              schoolLanguage={schoolLanguage}
            />
          </Modal>
        )}

        {/* Grille de cartes */}
        {classes.length === 0 ? (
            <div className="bg-white rounded-xl p-12 text-center shadow-sm border border-gray-100">
              <div className="text-5xl mb-4">🏫</div>
              <p className="text-gray-700 font-semibold mb-1">{t('Aucune classe configurée', 'No class configured')}</p>
              <p className="text-gray-400 text-sm mb-5">{t('Commencez par créer vos classes pour organiser les élèves et les matières.', 'Start by creating your classes to organise students and subjects.')}</p>
              <button onClick={() => setShowForm(true)} className="btn-primary"
                style={{ width: 'auto', paddingLeft: '1.5rem', paddingRight: '1.5rem' }}>
                + {t('Créer la première classe', 'Create the first class')}
              </button>
            </div>
          ) : (
            <>
              {/* Barre de recherche */}
              <div className="relative mb-5">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                </svg>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t('Rechercher une classe…', 'Search a class…')}
                  className="w-full pl-9 pr-8 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:border-brand-400 focus:ring-1 focus:ring-brand-300"
                />
                {search && (
                  <button onClick={() => setSearch('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredClasses.length === 0 && (
                <div className="col-span-full bg-white rounded-xl border border-gray-100 p-10 text-center text-sm text-gray-400">
                  {t('Aucune classe ne correspond à votre recherche.', 'No class matches your search.')}
                </div>
              )}
              {filteredClasses.map((cls) => {
                const s = classStats[cls.id] || { studentCount: 0, subjectCount: 0, teacherName: null };
                return (
                  <ClassCard
                    key={cls.id}
                    cls={cls}
                    studentCount={s.studentCount}
                    subjectCount={s.subjectCount}
                    teacherName={s.teacherName}
                    onEdit={() => { setEditing(cls); setShowForm(false); }}
                  />
                );
              })}

              {/* Carte + ajouter */}
              {!search && classes.length < f.maxClasses && (
                <button
                  onClick={() => setShowForm(true)}
                  className="rounded-xl border-2 border-dashed border-gray-200 hover:border-brand-300 hover:bg-brand-50 transition-all flex flex-col items-center justify-center gap-2 py-10 text-gray-400 hover:text-brand-600 min-h-[200px]"
                >
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                  <span className="text-sm font-semibold">{t('Ajouter une classe', 'Add a class')}</span>
                </button>
              )}
            </div>
            </>
          )}
      </div>
    </Layout>
  );
}
