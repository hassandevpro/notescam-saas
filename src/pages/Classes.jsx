import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useSchoolStore } from '../store/schoolStore';
import { useUiStore } from '../store/uiStore';
import Layout from '../components/Layout';
import Modal from '../components/Modal';
import { useT } from '../lib/i18n';
import { usePlan } from '../lib/plan';
import UpgradeBanner from '../components/UpgradeBanner';
import { useCountry } from '../lib/useCountry';
import { COUNTRIES } from '../countries';
import { resolveClassEngine } from '../core/engineResolver';
import { parseClassName } from '../core/classNameParser';

const SYSTEMS = ['FR', 'EN'];

// Séries officielles du second cycle MINESEC (slug = valeur stockée dans classes.serie).
const SC_SERIES = ['A1', 'A2', 'A3', 'A4', 'A5', 'ABI', 'C', 'D', 'E', 'TI', 'SH', 'AC'];

// Présets proposés dans le sélecteur « Barème » (+ option « Autre… »).
const GRADE_SCALE_PRESETS = [10, 20, 30, 40, 50, 100];

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

// Icône de cycle (emoji) selon le code.
function cycleIcon(code) {
  if (/mat/.test(code)) return '🧸';
  if (/prim/.test(code)) return '✏️';
  if (/sec|college|lycee|esba|bach/.test(code)) return '🎓';
  return '📚';
}

// ── Stepper accessible (effectif) ─────────────────────────────────────────────
function Stepper({ value, onChange, min = 0, max = 200, step = 5, ariaLabel }) {
  const v = value === '' ? '' : Number(value);
  const dec = () => onChange(Math.max(min, (v || 0) - step));
  const inc = () => onChange(Math.min(max, (v || 0) + step));
  return (
    <div className="inline-flex items-stretch rounded-xl border border-slate-200 overflow-hidden" role="group" aria-label={ariaLabel}>
      <button type="button" onClick={dec} aria-label="−" className="px-3 text-slate-500 hover:bg-slate-50 text-lg font-bold">−</button>
      <input type="number" min={min} max={max} value={value} onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
        className="w-16 text-center text-sm font-semibold border-x border-slate-200 focus:outline-none" aria-label={ariaLabel} />
      <button type="button" onClick={inc} aria-label="+" className="px-3 text-slate-500 hover:bg-slate-50 text-lg font-bold">+</button>
    </div>
  );
}

// ── Modale "Nouvelle classe" — expérience orientée métier ─────────────────────
// Sections logiques + cartes visuelles (cycle/niveau) + nom auto + aperçu temps
// réel. Self-contained (overlay propre) pour la mise en page 2 colonnes.
function ClassCreateModal({ onSave, onSaveAnother, onClose, defaultYear, teachers }) {
  const t = useT();
  const country = useCountry();
  const school = useAuthStore((s) => s.school);
  // Modèle de bulletin choisi pour l'établissement (Réglages) — pilote le formulaire.
  const engine = school?.bulletin_engine || 'classic';   // 'classic' | 'apc_minesec' | 'minesec'
  const MODEL_INFO = {
    classic:     { icon: '📄', label: t('Classique', 'Classic'),               desc: t('Notes et moyennes habituelles. Aucun référentiel officiel.', 'Usual marks and averages. No official framework.') },
    apc_minesec: { icon: '🎯', label: t('APC (1er cycle)', 'APC (lower secondary)'), desc: t('Bulletin par compétences MINESEC sur le collège (6e–3e).', 'MINESEC competency report card for lower secondary (6e–3e).') },
    minesec:     { icon: '🏛️', label: t('APC + Second Cycle', 'APC + Upper secondary'), desc: t('APC au collège ET Second Cycle MINESEC au lycée (par séries).', 'APC in lower secondary AND MINESEC upper secondary (by streams).') },
  };
  const model = MODEL_INFO[engine] || MODEL_INFO.classic;
  const CYCLES = country.cycles.map((c) => ({ value: c.code, label: c.label }));
  const isGE = country.code === 'guinea_eq';

  // ── UN SEUL champ obligatoire (le nom) — tout le reste est inféré ou hérité ──
  const [rawName, setRawName]           = useState('');
  const [teacherId, setTeacherId]       = useState('');
  const [maxStudents, setMaxStudents]   = useState('');
  const [advanced, setAdvanced]         = useState(false);   // disclosure réglages avancés
  const [overrides, setOverrides]       = useState({});      // corrections manuelles éventuelles
  const [saving, setSaving]             = useState(false);
  const [customScale, setCustomScale]   = useState(false);
  const [createdCount, setCreatedCount] = useState(0);

  // Inférence temps réel depuis le nom saisi.
  const parsed = useMemo(() => parseClassName(rawName, { school, country }), [rawName, school, country]);

  // Valeurs effectives = inférence, éventuellement corrigée dans les réglages avancés.
  const pick = (key, fallback) => (overrides[key] !== undefined ? overrides[key] : (parsed?.[key] ?? fallback));
  const eff = {
    name:      rawName.trim(),
    cycle:     pick('cycle', 'secondaire'),
    level:     pick('level', ''),
    system:    isGE ? 'ES' : pick('system', 'FR'),
    grade_max: isGE ? null : pick('grade_max', 20),
    serie:     pick('serie', '') || '',
  };
  const setOverride = (key, value) => setOverrides((o) => ({ ...o, [key]: value }));

  // Moteur re-résolu depuis les valeurs EFFECTIVES : une correction de niveau/série
  // dans les réglages avancés rebascule correctement 'sc' | 'apc' | 'classic'.
  const classEngine = resolveClassEngine(school, { level: eff.level, name: eff.name, serie: eff.serie });

  // Ouvre les réglages avancés quand l'inférence est incertaine (niveau non
  // reconnu) ou incomplète (série lycée A1…A5 à préciser).
  useEffect(() => {
    if (parsed && (parsed.confidence === 'low' || parsed.needsSeries)) setAdvanced(true);
  }, [parsed?.confidence, parsed?.needsSeries]);

  const buildPayload = () => {
    const gm = Math.max(1, Math.min(200, Number(eff.grade_max) || 20));
    const payload = {
      name:         eff.name,
      level:        eff.level || '',
      cycle:        eff.cycle,
      system:       eff.system,
      grade_max:    isGE ? null : gm,
      teacher_id:   teacherId || null,
      max_students: maxStudents ? Number(maxStudents) : null,
      serie:        eff.serie,
      // `current_year` volontairement ABSENT : hérité de l'année active (addClass).
    };
    // `serie` n'existe en base que pour le Second Cycle MINESEC.
    if (classEngine !== 'sc' || !payload.serie) delete payload.serie;
    return payload;
  };

  const resetForNext = () => { setRawName(''); setMaxStudents(''); setOverrides({}); setAdvanced(false); setCustomScale(false); };

  const submit = async (another) => {
    if (!eff.name) return;
    setSaving(true);
    if (another) {
      await onSaveAnother(buildPayload());
      setCreatedCount((n) => n + 1);
      resetForNext();
    } else {
      await onSave(buildPayload());
    }
    setSaving(false);
  };

  const teacherName   = teachers.find((tc) => tc.id === teacherId)?.name;
  const sysLabel      = isGE ? 'ES' : eff.system;
  const scaleLabel    = isGE ? `/${country?.geMax || 10}` : `/${eff.grade_max || '—'}`;
  const cycleLabel    = CYCLES.find((c) => c.value === eff.cycle)?.label || eff.cycle;
  const templateLabel = classEngine === 'sc'
    ? `${t('Second Cycle', 'Upper sec.')}${eff.serie ? ` · ${eff.serie.toUpperCase()}` : ` · ${t('série ?', 'stream ?')}`}`
    : classEngine === 'apc'
      ? t('APC (compétences)', 'APC (competencies)')
      : t('Classique', 'Classic');

  const Chip = ({ children, tone = 'slate' }) => (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border ${
      tone === 'indigo' ? 'bg-indigo-50 text-indigo-700 border-indigo-100'
      : tone === 'amber' ? 'bg-amber-50 text-amber-700 border-amber-100'
      : 'bg-white text-slate-600 border-slate-200'}`}>{children}</span>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={t('Nouvelle classe', 'New class')}>
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-md" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[92vh] overflow-hidden flex flex-col" style={{ animation: 'modal-in .18s ease-out' }}>
        <style>{`@keyframes modal-in{from{opacity:0;transform:scale(.97) translateY(-8px)}to{opacity:1;transform:scale(1) translateY(0)}}`}</style>

        {/* En-tête + héritages (année active + modèle établissement) — non éditables */}
        <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-slate-100">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-slate-900">{t('Nouvelle classe', 'New class', 'Nueva clase')}</h2>
            <p className="text-sm text-slate-500 mt-0.5 flex flex-wrap items-center gap-x-1.5">
              <span>{t('Année', 'Year', 'Año')} <strong className="text-slate-700">{defaultYear || '—'}</strong></span>
              <span className="text-slate-300">·</span>
              <span>{model.icon} <strong className="text-slate-700">{model.label}</strong></span>
            </p>
          </div>
          <button onClick={onClose} aria-label={t('Fermer', 'Close')} className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 shrink-0">
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>

        <div className="p-6 overflow-y-auto">
          {/* CHAMP UNIQUE OBLIGATOIRE — le nom pilote toute l'inférence */}
          <label className="form-label" htmlFor="nc-classname">{t('Nom de la classe', 'Class name', 'Nombre de la clase')} *</label>
          <input
            id="nc-classname" type="text" autoFocus required
            className="form-input text-lg font-semibold"
            placeholder={t('Ex : 6ème A · Terminale C · Form 3 Red', 'E.g. Form 3 Red · Terminale C · 6ème A', 'Ej: 6ème A · Terminale C')}
            value={rawName}
            onChange={(e) => setRawName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && eff.name && !saving) { e.preventDefault(); submit(false); } }}
          />
          <p className="text-xs text-slate-400 mt-1">
            {t('Cycle, niveau, série et bulletin sont déduits automatiquement du nom.',
               'Cycle, level, stream and report card are inferred automatically from the name.',
               'El ciclo, el nivel y el boletín se deducen automáticamente del nombre.')}
          </p>

          {/* INFÉRENCE — aperçu temps réel en chips */}
          {parsed && (
            <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50/70 p-3">
              <div className="flex flex-wrap gap-1.5">
                <Chip tone="indigo">{cycleIcon(eff.cycle)} {cycleLabel}</Chip>
                {eff.level ? <Chip>{eff.level}</Chip> : <Chip tone="amber">{t('Niveau ?', 'Level ?', 'Nivel ?')}</Chip>}
                {eff.serie && <Chip>{t('Série', 'Stream')} {eff.serie.toUpperCase()}</Chip>}
                <Chip>{sysLabel} {scaleLabel}</Chip>
                {engine !== 'classic' && <Chip tone="indigo">📋 {templateLabel}</Chip>}
              </div>
              {(classEngine === 'apc' || (classEngine === 'sc' && eff.serie)) && (
                <p className="text-[11px] text-emerald-700 mt-2 inline-flex items-start gap-1">
                  <span>✓</span>
                  <span>{t('Matières, coefficients et groupes officiels créés automatiquement.',
                           'Official subjects, coefficients and groups created automatically.')}</span>
                </p>
              )}
              {parsed.needsSeries && (
                <p className="text-[11px] text-amber-700 mt-2 inline-flex items-start gap-1">
                  <span>⚠️</span>
                  <span>{t('Précisez la série (A1…A5) dans les réglages avancés pour générer les matières.',
                           'Set the exact stream (A1…A5) in advanced settings to generate subjects.')}</span>
                </p>
              )}
              {parsed.confidence === 'low' && !parsed.needsSeries && !eff.level && (
                <p className="text-[11px] text-amber-700 mt-2 inline-flex items-start gap-1">
                  <span>⚠️</span>
                  <span>{t('Niveau non reconnu — vérifiez les réglages avancés.',
                           'Level not recognised — check advanced settings.')}</span>
                </p>
              )}
            </div>
          )}

          {/* 2 CHAMPS OPTIONNELS (maximum) */}
          <div className="grid sm:grid-cols-2 gap-4 mt-5">
            <div>
              <label className="form-label">{t('Titulaire', 'Class teacher', 'Tutor')} <span className="text-slate-400 font-normal normal-case">({t('optionnel', 'optional', 'opcional')})</span></label>
              <select className="form-input" value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
                <option value="">— {t('Aucun', 'None', 'Ninguno')} —</option>
                {teachers.map((tc) => <option key={tc.id} value={tc.id}>{tc.name}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">{t('Effectif max', 'Max enrolment', 'Plazas')} <span className="text-slate-400 font-normal normal-case">({t('optionnel', 'optional', 'opcional')})</span></label>
              <div><Stepper value={maxStudents} onChange={setMaxStudents} min={0} max={200} step={5} ariaLabel={t('Effectif maximum', 'Max enrolment')} /></div>
            </div>
          </div>

          {/* RÉGLAGES AVANCÉS (auto) — repliés, corrigent l'inférence si besoin */}
          <div className="mt-5 border-t border-slate-100 pt-3">
            <button type="button" onClick={() => setAdvanced((v) => !v)}
              className="flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-indigo-700">
              <svg viewBox="0 0 24 24" className={`w-4 h-4 transition-transform ${advanced ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6"/></svg>
              {t('Réglages avancés', 'Advanced settings', 'Ajustes avanzados')}
              <span className="text-xs font-normal text-slate-400">({t('auto — rarement nécessaire', 'auto — rarely needed', 'auto')})</span>
            </button>

            {advanced && (
              <div className="mt-3 space-y-4 rounded-xl border border-slate-100 bg-slate-50/50 p-4">
                {/* Cycle */}
                <div>
                  <label className="form-label">{t('Cycle', 'Cycle', 'Ciclo')}</label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {CYCLES.map((c) => (
                      <button key={c.value} type="button" onClick={() => { setOverride('cycle', c.value); setOverride('level', ''); }} aria-pressed={eff.cycle === c.value}
                        className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg border-2 text-xs font-semibold transition-all ${eff.cycle === c.value ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600 hover:border-indigo-300'}`}>
                        <span>{cycleIcon(c.value)}</span><span className="truncate">{c.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
                {/* Niveau */}
                <div>
                  <label className="form-label">{t('Niveau', 'Level', 'Nivel')}</label>
                  <select className="form-input" value={eff.level || ''} onChange={(e) => setOverride('level', e.target.value)}>
                    <option value="">— {t('Choisir', 'Select', 'Elegir')} —</option>
                    {niveauGroupsForCycle(country, eff.cycle).map((g) => (
                      <optgroup key={g.group} label={g.group}>
                        {g.items.map((n) => <option key={n} value={n}>{n}</option>)}
                      </optgroup>
                    ))}
                  </select>
                </div>
                {/* Série — Second Cycle uniquement */}
                {classEngine === 'sc' && (
                  <div>
                    <label className="form-label">{t('Série (MINESEC)', 'Stream (MINESEC)')}</label>
                    <select className="form-input" value={eff.serie || ''} onChange={(e) => setOverride('serie', e.target.value)}>
                      <option value="">— {t('choisir la série', 'choose stream')} —</option>
                      {SC_SERIES.map((s) => <option key={s} value={s.toLowerCase()}>{s}</option>)}
                    </select>
                  </div>
                )}
                {/* Système + barème — hors Guinée Éq. */}
                {!isGE && (
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className="form-label">{t('Système', 'System', 'Sistema')}</label>
                      <div className="flex gap-2">
                        {SYSTEMS.map((s) => (
                          <button key={s} type="button" onClick={() => setOverride('system', s)} aria-pressed={eff.system === s}
                            className={`flex-1 px-3 py-2 rounded-lg border-2 text-xs font-semibold transition-all ${eff.system === s ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600 hover:border-indigo-300'}`}>{s}</button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="form-label">{t('Barème', 'Scale', 'Escala')}</label>
                      <div className="flex flex-wrap gap-1.5">
                        {GRADE_SCALE_PRESETS.map((n) => (
                          <button key={n} type="button" onClick={() => { setCustomScale(false); setOverride('grade_max', n); }} aria-pressed={!customScale && eff.grade_max === n}
                            className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${!customScale && eff.grade_max === n ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600 hover:border-indigo-300'}`}>/{n}</button>
                        ))}
                        <button type="button" onClick={() => setCustomScale(true)} aria-pressed={customScale}
                          className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${customScale ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600 hover:border-indigo-300'}`}>{t('Autre…', 'Other…', 'Otro…')}</button>
                        {customScale && (
                          <input type="number" min="1" max="200" className="w-20 px-2 py-1.5 rounded-lg border border-indigo-300 text-xs" placeholder="30" value={eff.grade_max || ''}
                            onChange={(e) => setOverride('grade_max', Number(e.target.value) || '')} />
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Pied — actions */}
        <div className="flex flex-wrap items-center justify-end gap-2 px-6 py-4 border-t border-slate-100">
          <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold transition-colors mr-auto">{t('Annuler', 'Cancel', 'Cancelar')}</button>
          {createdCount > 0 && <span className="text-xs text-emerald-600 font-semibold">✓ {createdCount} {t('créée(s)', 'created', 'creada(s)')}</span>}
          <button type="button" disabled={saving || !eff.name} onClick={() => submit(true)}
            className="px-4 py-2.5 rounded-xl border-2 border-indigo-200 text-indigo-700 hover:bg-indigo-50 text-sm font-semibold transition-colors disabled:opacity-40">
            {t('Enregistrer + une autre', 'Save + another', 'Guardar + otra')}
          </button>
          <button type="button" disabled={saving || !eff.name} onClick={() => submit(false)}
            className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors disabled:opacity-40">
            {saving ? t('Enregistrement…', 'Saving…', 'Guardando…') : t('Créer la classe', 'Create class', 'Crear')}
          </button>
        </div>
      </div>
    </div>
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

// Statut métier d'une classe (partagé carte + dashboard).
function classStatus({ studentCount, subjectCount, teacherName }) {
  if (studentCount === 0 || subjectCount === 0) return 'red';
  if (!teacherName) return 'yellow';
  return 'green';
}

function ClassCard({ cls, stats, onEdit, onDuplicate, onDelete, onGo, onConfigureSubjects }) {
  const t = useT();
  const [menu, setMenu] = useState(false);
  const CYCLE_LABELS = {
    secondaire: t('Secondaire', 'Secondary', 'Secundaria'),
    primaire:   t('Primaire',   'Primary',   'Primaria'),
    maternelle: t('Maternelle', 'Nursery',   'Infantil'),
  };
  const { studentCount, subjectCount, teacherName } = stats;
  const cycle = cls.cycle || 'secondaire';
  const theme = CYCLE_THEME[cycle] || CYCLE_THEME.secondaire;
  const sys   = cls.system || 'FR';
  const scale = sys === 'FR' ? '/20' : sys === 'EN' ? '/100' : '/10';
  const max   = cls.max_students || null;
  const pct   = max ? Math.min(100, Math.round((studentCount / max) * 100)) : null;
  const fillColor = pct === null ? 'bg-slate-300' : pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-400' : 'bg-emerald-500';

  const alerts = [];
  if (!teacherName)      alerts.push(t('Aucun titulaire', 'No teacher', 'Sin tutor'));
  if (subjectCount === 0) alerts.push(t('Aucune matière', 'No subjects', 'Sin asignaturas'));
  if (studentCount === 0) alerts.push(t('Aucun élève', 'No students', 'Sin alumnos'));

  const STATUS = {
    green:  { dot: 'bg-emerald-500', cls: 'bg-emerald-50 text-emerald-700', label: t('Opérationnelle', 'Operational', 'Operativa') },
    yellow: { dot: 'bg-amber-500',  cls: 'bg-amber-50 text-amber-700',     label: t('Incomplète', 'Incomplete', 'Incompleta') },
    red:    { dot: 'bg-red-500',    cls: 'bg-red-50 text-red-700',         label: t('Action requise', 'Action required', 'Acción requerida') },
  }[classStatus(stats)];

  const Btn = ({ label, onClick }) => (
    <button onClick={onClick} className="flex-1 text-center text-xs font-semibold text-slate-600 bg-slate-50 hover:bg-indigo-50 hover:text-indigo-700 px-2 py-2 rounded-lg transition-colors">{label}</button>
  );

  return (
    <div className={`bg-white rounded-2xl border shadow-sm hover:shadow-lg transition-all flex flex-col ${theme.border} hover:border-indigo-200`}>
      <div className={`h-1 rounded-t-2xl ${theme.accent}`} />

      {/* En-tête : nom + statut + menu */}
      <div className="px-5 pt-4 pb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-lg font-bold text-slate-900 leading-tight truncate">{cls.name}</h3>
          {cls.level && <p className="text-xs text-slate-400 mt-0.5">{cls.level}</p>}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2 py-1 rounded-full ${STATUS.cls}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${STATUS.dot}`} />{STATUS.label}
          </span>
          <div className="relative">
            <button onClick={() => setMenu((v) => !v)} className="p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100" aria-label={t('Actions', 'Actions')}>
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/></svg>
            </button>
            {menu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
                <div className="absolute right-0 top-full mt-1 z-20 w-40 bg-white rounded-xl shadow-xl border border-slate-100 py-1 text-sm">
                  <button onClick={() => { setMenu(false); onEdit(); }} className="w-full text-left px-3 py-2 hover:bg-slate-50 text-slate-700">{t('Modifier', 'Edit', 'Editar')}</button>
                  <button onClick={() => { setMenu(false); onDuplicate(); }} className="w-full text-left px-3 py-2 hover:bg-slate-50 text-slate-700">{t('Dupliquer', 'Duplicate', 'Duplicar')}</button>
                  {onConfigureSubjects && subjectCount === 0 && (
                    <button onClick={() => { setMenu(false); onConfigureSubjects(); }} className="w-full text-left px-3 py-2 hover:bg-indigo-50 text-indigo-700 font-medium">
                      🎯 {t('Configurer les matières', 'Configure subjects')}
                    </button>
                  )}
                  <div className="border-t border-slate-100 my-1" />
                  <button onClick={() => { setMenu(false); if (window.confirm(t('Supprimer cette classe ?', 'Delete this class?', '¿Eliminar?'))) onDelete(); }} className="w-full text-left px-3 py-2 hover:bg-red-50 text-red-600">{t('Supprimer', 'Delete', 'Eliminar')}</button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Badges cycle + barème */}
      <div className="px-5 flex flex-wrap gap-1.5">
        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded border ${theme.badge}`}>{CYCLE_LABELS[cycle]}</span>
        <span className="text-[11px] font-semibold px-2 py-0.5 rounded border bg-slate-50 text-slate-600 border-slate-100">{t('Barème', 'Scale', 'Escala')} {scale}</span>
      </div>

      {/* Effectif + remplissage */}
      <div className="px-5 py-3 mt-1">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-xl font-bold text-slate-900">{studentCount}{max ? <span className="text-sm font-normal text-slate-400">/{max}</span> : null}</p>
            <p className="text-xs text-slate-400">{t('élève', 'student')}{studentCount !== 1 ? 's' : ''} · {subjectCount} {t('matière', 'subject')}{subjectCount !== 1 ? 's' : ''}</p>
          </div>
          {pct !== null && <span className="text-xs font-bold text-slate-500">{pct}%</span>}
        </div>
        <div className="mt-2 h-2 bg-slate-100 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all ${fillColor}`} style={{ width: `${pct ?? 0}%` }} />
        </div>
      </div>

      {/* Titulaire */}
      <div className="px-5 pb-2 flex items-center gap-2">
        {teacherName ? (
          <>
            <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${theme.avatar}`}><span className="text-[10px] font-bold">{teacherName.slice(0, 2).toUpperCase()}</span></div>
            <span className="text-xs text-slate-700 font-medium truncate">{teacherName}</span>
          </>
        ) : (
          <span className="text-xs text-amber-600 font-medium">⚠ {t('Aucun titulaire assigné', 'No class teacher', 'Sin tutor')}</span>
        )}
      </div>

      {/* Alertes visuelles */}
      {alerts.length > 0 && (
        <div className="px-5 pb-2 flex flex-wrap gap-1.5">
          {alerts.map((a) => <span key={a} className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-600">⚠ {a}</span>)}
        </div>
      )}

      {/* Boutons d'action réels */}
      <div className="px-4 py-3 border-t border-slate-50 flex items-center gap-1.5 mt-auto">
        <Btn label={t('Élèves', 'Students', 'Alumnos')} onClick={() => onGo('students', cls)} />
        <Btn label={t('Notes', 'Grades', 'Notas')} onClick={() => onGo('grades', cls)} />
        <Btn label={t('Bulletins', 'Reports', 'Boletines')} onClick={() => onGo('bulletins', cls)} />
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
  const loadSc      = useSchoolStore((s) => s.loadSc);
  const loadApc     = useSchoolStore((s) => s.loadApc);
  const configureClassSubjects = useSchoolStore((s) => s.configureClassSubjects);

  // Préchauffe les référentiels (cache IDB + refresh cloud) pour l'auto-config des
  // matières à la création : second cycle (minesec) ET premier cycle APC
  // (apc_minesec | minesec). Garantit que le référentiel est prêt avant addClass.
  useEffect(() => {
    const eng = school?.bulletin_engine;
    if (eng === 'minesec') loadSc();
    if (eng === 'minesec' || eng === 'apc_minesec') loadApc();
  }, [school?.bulletin_engine, loadSc, loadApc]);

  const navigate            = useNavigate();
  const setGradesClassId    = useUiStore((s) => s.setGradesClassId);
  const setBulletinsClassId = useUiStore((s) => s.setBulletinsClassId);
  const country             = useCountry();

  const [showForm, setShowForm] = useState(false);
  const [editing,  setEditing]  = useState(null);
  const [search,   setSearch]   = useState('');
  const [cycleF,   setCycleF]   = useState('all');
  const [levelF,   setLevelF]   = useState('all');
  const [statusF,  setStatusF]  = useState('all');
  // Affichage : tableau (par défaut) ou cartes — mémorisé.
  const [view,     setView]     = useState(() => {
    try { return localStorage.getItem('nc_classes_view') || 'table'; } catch { return 'table'; }
  });
  const chooseView = (v) => { setView(v); try { localStorage.setItem('nc_classes_view', v); } catch {} };

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

  // KPIs du tableau de bord
  const kpi = useMemo(() => {
    const titulaires = new Set(classes.map((c) => c.teacher_id).filter(Boolean)).size;
    const alerts = classes.filter((c) => classStatus(classStats[c.id] || {}) !== 'green').length;
    return { classes: classes.length, students: students.length, subjects: subjects.length, titulaires, alerts };
  }, [classes, students, subjects, classStats]);

  const levelOptions = useMemo(() => [...new Set(classes.map((c) => c.level).filter(Boolean))].sort(), [classes]);
  const cycleOptions = country.cycles.map((c) => ({ value: c.code, label: c.label }));

  const filteredClasses = useMemo(() => classes.filter((c) => {
    const q = search.trim().toLowerCase();
    if (q && !(c.name.toLowerCase().includes(q) || (c.level || '').toLowerCase().includes(q))) return false;
    if (cycleF !== 'all' && (c.cycle || 'secondaire') !== cycleF) return false;
    if (levelF !== 'all' && c.level !== levelF) return false;
    if (statusF !== 'all' && classStatus(classStats[c.id] || {}) !== statusF) return false;
    return true;
  }), [classes, search, cycleF, levelF, statusF, classStats]);

  const handleSave = async (form) => {
    if (editing) {
      await updateClass(editing.id, form);
      setEditing((prev) => ({ ...prev, ...form }));
    } else {
      const created = await addClass(form);
      setShowForm(false);
      setEditing(created);
    }
  };

  const handleDelete = async (cls) => {
    await deleteClass(cls.id);
    setEditing(null);
  };

  const handleDuplicate = async (cls) => {
    const { id, created_at, updated_at, ...rest } = cls;
    await addClass({ ...rest, name: `${cls.name} (copie)` });
  };

  // Rattrapage : (re)crée automatiquement les matières d'une classe MINESEC/APC.
  const handleConfigureSubjects = async (cls) => {
    const { created } = await configureClassSubjects(cls);
    window.alert(created > 0
      ? t(`${created} matière(s) ajoutée(s).`, `${created} subject(s) added.`)
      : t('Aucune matière à ajouter (référentiel indisponible ou classe déjà configurée).',
           'No subject to add (framework unavailable or class already configured).'));
  };

  // Navigation contextuelle vers les modules de la classe.
  const onGo = (kind, cls) => {
    if (kind === 'grades')        { setGradesClassId(cls.id); navigate('/app/grades'); }
    else if (kind === 'bulletins'){ setBulletinsClassId(cls.id); navigate('/app/bulletins'); }
    else                          { navigate('/app/students'); }
  };

  return (
    <Layout>
      <div className="max-w-6xl">
        {/* Header */}
        <div className="flex flex-wrap justify-between items-start gap-4 mb-5">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{t('Classes', 'Classes')}</h1>
            <p className="text-sm text-slate-500 mt-1">{t("Pilotez l'état de votre établissement en un coup d'œil.", 'Monitor your school at a glance.', 'Supervise su centro de un vistazo.')}</p>
          </div>
          {classes.length >= f.maxClasses ? (
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2 text-sm text-amber-800">
              <span>{t('Limite Starter atteinte', 'Starter limit reached')} ·{' '}
                <a href="https://wa.me/237670894721?text=Je%20veux%20passer%20au%20plan%20%C3%89cole" target="_blank" rel="noopener noreferrer" className="font-semibold underline text-amber-900">
                  {t('Passer au plan École', 'Upgrade to École plan')}
                </a>
              </span>
            </div>
          ) : (
            <button onClick={() => setShowForm(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold shadow-sm transition-colors">
              + {t('Ajouter une classe', 'Add a class')}
            </button>
          )}
        </div>

        {/* DASHBOARD — KPIs */}
        {classes.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
            {[
              { emoji: '🏫', tone: 'bg-indigo-50', value: kpi.classes, label: t('Classes', 'Classes', 'Clases') },
              { emoji: '👨‍🎓', tone: 'bg-emerald-50', value: kpi.students, label: t('Élèves', 'Students', 'Alumnos') },
              { emoji: '📚', tone: 'bg-sky-50', value: kpi.subjects, label: t('Matières', 'Subjects', 'Asignaturas') },
              { emoji: '👨‍🏫', tone: 'bg-violet-50', value: kpi.titulaires, label: t('Titulaires', 'Class teachers', 'Tutores') },
              { emoji: '⚠️', tone: kpi.alerts ? 'bg-red-50' : 'bg-slate-50', value: kpi.alerts, label: t('Alertes', 'Alerts', 'Alertas') },
            ].map((c) => (
              <div key={c.label} className="bg-white rounded-2xl border border-slate-200/70 p-4 shadow-sm">
                <span className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg ${c.tone}`}>{c.emoji}</span>
                <div className={`text-2xl font-extrabold mt-2 ${c.label === t('Alertes', 'Alerts', 'Alertas') && kpi.alerts ? 'text-red-600' : 'text-slate-900'}`}>{c.value}</div>
                <div className="text-xs text-slate-500">{c.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Modal création classe — expérience orientée métier */}
        {showForm && !editing && (
          <ClassCreateModal
            defaultYear={defaultYear}
            teachers={teachers}
            onSave={handleSave}
            onSaveAnother={async (form) => { await addClass(form); }}
            onClose={() => setShowForm(false)}
          />
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
              {/* Barre de recherche + filtres */}
              <div className="flex flex-wrap items-center gap-2 mb-5">
                <div className="relative flex-1 min-w-[180px] max-w-sm">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                  </svg>
                  <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('Rechercher…', 'Search…', 'Buscar…')}
                    className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
                </div>
                <select value={cycleF} onChange={(e) => setCycleF(e.target.value)} className="text-sm border border-slate-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:border-indigo-400">
                  <option value="all">{t('Tous les cycles', 'All cycles', 'Todos los ciclos')}</option>
                  {cycleOptions.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
                <select value={levelF} onChange={(e) => setLevelF(e.target.value)} className="text-sm border border-slate-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:border-indigo-400">
                  <option value="all">{t('Tous niveaux', 'All levels', 'Todos los niveles')}</option>
                  {levelOptions.map((lv) => <option key={lv} value={lv}>{lv}</option>)}
                </select>
                <select value={statusF} onChange={(e) => setStatusF(e.target.value)} className="text-sm border border-slate-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:border-indigo-400">
                  <option value="all">{t('Tous statuts', 'All statuses', 'Todos los estados')}</option>
                  <option value="green">🟢 {t('Opérationnelle', 'Operational', 'Operativa')}</option>
                  <option value="yellow">🟡 {t('Incomplète', 'Incomplete', 'Incompleta')}</option>
                  <option value="red">🔴 {t('Action requise', 'Action required', 'Acción requerida')}</option>
                </select>
                {/* Bascule d'affichage Tableau / Cartes */}
                <div className="flex rounded-xl border border-slate-200 overflow-hidden text-sm font-semibold ml-auto shrink-0">
                  {[['table', t('Tableau', 'Table', 'Tabla')], ['cards', t('Cartes', 'Cards', 'Tarjetas')]].map(([v, label]) => (
                    <button key={v} type="button" onClick={() => chooseView(v)}
                      className={`px-3 py-2 transition-colors ${view === v ? 'bg-indigo-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

            {filteredClasses.length === 0 ? (
              <div className="bg-white rounded-xl border border-slate-100 p-10 text-center text-sm text-slate-400">
                {t('Aucune classe ne correspond aux filtres.', 'No class matches the filters.', 'Sin resultados.')}
              </div>
            ) : view === 'table' ? (
              /* ── Vue tableau (par défaut) ─────────────────────────────── */
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
                <table className="w-full text-sm border-collapse min-w-[680px]">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wider text-slate-400">
                      <th className="text-left px-4 py-3 font-semibold">{t('Classe', 'Class', 'Clase')}</th>
                      <th className="text-left px-3 py-3 font-semibold">{t('Cycle', 'Cycle', 'Ciclo')}</th>
                      <th className="text-center px-3 py-3 font-semibold">{t('Sys.', 'Sys.', 'Sis.')}</th>
                      <th className="text-center px-3 py-3 font-semibold">{t('Élèves', 'Students', 'Alumnos')}</th>
                      <th className="text-center px-3 py-3 font-semibold">{t('Matières', 'Subjects', 'Asign.')}</th>
                      <th className="text-left px-3 py-3 font-semibold">{t('Titulaire', 'Class teacher', 'Tutor')}</th>
                      <th className="text-center px-3 py-3 font-semibold">{t('Statut', 'Status', 'Estado')}</th>
                      <th className="px-3 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {filteredClasses.map((cls) => {
                      const st = classStats[cls.id] || { studentCount: 0, subjectCount: 0, teacherName: null };
                      const status = classStatus(st);
                      const dot = status === 'green' ? '#10b981' : status === 'yellow' ? '#f59e0b' : '#ef4444';
                      return (
                        <tr key={cls.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="px-4 py-2.5">
                            <button onClick={() => { setEditing(cls); setShowForm(false); }} className="text-left font-semibold text-slate-800 hover:text-indigo-600">
                              {cls.name}
                            </button>
                            {cls.level && cls.level !== cls.name && <div className="text-xs text-slate-400">{cls.level}</div>}
                          </td>
                          <td className="px-3 py-2.5 text-slate-500 capitalize">{cls.cycle || 'secondaire'}</td>
                          <td className="px-3 py-2.5 text-center">
                            <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${cls.system === 'EN' ? 'bg-blue-100 text-blue-700' : cls.system === 'ES' ? 'bg-emerald-100 text-emerald-700' : 'bg-purple-100 text-purple-700'}`}>
                              {cls.system || 'FR'}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-center text-slate-700">{st.studentCount}</td>
                          <td className="px-3 py-2.5 text-center text-slate-700">{st.subjectCount}</td>
                          <td className="px-3 py-2.5 text-slate-500">{st.teacherName || <span className="text-amber-600">—</span>}</td>
                          <td className="px-3 py-2.5 text-center"><span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: dot }} title={status} /></td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center justify-end gap-1">
                              <button onClick={() => onGo('grades', cls)} className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 px-2 py-1 rounded hover:bg-indigo-50">{t('Notes', 'Grades', 'Notas')}</button>
                              <button onClick={() => { setEditing(cls); setShowForm(false); }} title={t('Modifier', 'Edit', 'Editar')} className="p-1.5 rounded hover:bg-slate-100 text-slate-500">✏️</button>
                              <button onClick={() => handleDuplicate(cls)} title={t('Dupliquer', 'Duplicate', 'Duplicar')} className="p-1.5 rounded hover:bg-slate-100 text-slate-500">⧉</button>
                              <button onClick={() => { if (window.confirm(t('Supprimer cette classe ?', 'Delete this class?', '¿Eliminar esta clase?'))) handleDelete(cls); }} title={t('Supprimer', 'Delete', 'Eliminar')} className="p-1.5 rounded hover:bg-red-50 text-slate-400 hover:text-red-600">🗑</button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              /* ── Vue cartes ───────────────────────────────────────────── */
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredClasses.map((cls) => (
                  <ClassCard
                    key={cls.id}
                    cls={cls}
                    stats={classStats[cls.id] || { studentCount: 0, subjectCount: 0, teacherName: null }}
                    onEdit={() => { setEditing(cls); setShowForm(false); }}
                    onDuplicate={() => handleDuplicate(cls)}
                    onDelete={() => handleDelete(cls)}
                    onGo={onGo}
                    onConfigureSubjects={
                      resolveClassEngine(school, cls) !== 'classic'
                        ? () => handleConfigureSubjects(cls)
                        : undefined
                    }
                  />
                ))}
                {/* Carte + ajouter */}
                {!search && cycleF === 'all' && levelF === 'all' && statusF === 'all' && classes.length < f.maxClasses && (
                  <button onClick={() => setShowForm(true)}
                    className="rounded-2xl border-2 border-dashed border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 transition-all flex flex-col items-center justify-center gap-2 py-10 text-slate-400 hover:text-indigo-600 min-h-[200px]">
                    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                    <span className="text-sm font-semibold">{t('Ajouter une classe', 'Add a class')}</span>
                  </button>
                )}
              </div>
            )}
            </>
          )}
      </div>
    </Layout>
  );
}
