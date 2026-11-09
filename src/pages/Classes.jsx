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
// Classement des matieres : meme referentiel que l'emploi du temps, pour qu'une
// matiere n'ait pas deux familles selon l'ecran qui la regarde.
import { CATEGORIES, DEFAULT_CATEGORY } from '../config/timetableConfig';
import { inferCategory } from '../lib/timetableEngine';
import { resolveClassEngine, primaireNiveauSlug } from '../core/engineResolver';
import { modeChange, garde } from '../core/modeEvaluation';
import { classeADesNotes } from '../lib/classeANotes';
import { toast } from '../store/toastStore';

import { programmesParCode, troncsDe } from '../core/primProgramme';
import { lignesEnDouble } from '../core/refClassScope';
import { competenceIdForSubject } from '../core/primCompetenceMatch';
import { competencesForNiveau } from '../core/primEngine';
import { planProgrammeAnglophone, etatProgrammeAnglophone } from '../core/primProgrammeEn';
import { primCompetenceLabel } from '../core/referentielI18n';
import { withLibelles } from '../lib/referentielEcole';
import ChoixClassement from '../components/classes/ChoixClassement';
import { parseClassName } from '../core/classNameParser';
import { headTeacherText } from '../lib/headTeachers';
import { classSubjectsOf } from '../core/subjectOrder';
// CLASSE BILINGUE — une classe qui suit LES DEUX programmes. Demande de THE
// GENIUS (2026-10-19) : ses quatre classes « … BIL » ne portaient que les
// matières francophones, donc les unités d'apprentissage des matières
// anglophones ne pouvaient pas s'y afficher (le périmètre du référentiel se
// déduit des lignes `subjects` — cf. core/refClassScope.js).
import {
  isBilingualClass, mergeBilingualCatalog,
  siblingClassCandidates, defaultSiblingClass, mergeFromSiblingClass,
} from '../core/bilingualSubjects';

const SYSTEMS = ['FR', 'EN'];

// Séries officielles du second cycle MINESEC (slug = valeur stockée dans classes.serie).
// Séries générales franco (A, C, D, E), techniques (TI, TG), puis variantes.
const SC_SERIES = ['A', 'C', 'D', 'E', 'TI', 'TG', 'A1', 'A2', 'A3', 'A4', 'A5', 'ABI', 'SH', 'AC'];

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
  const engine = school?.bulletin_engine || 'classic';   // 'classic' | 'officiel' | (héritage)
  const MODEL_INFO = {
    classic:      { icon: '📄', label: t('Classique', 'Classic'),               desc: t('Notes et moyennes habituelles. Aucun référentiel officiel.', 'Usual marks and averages. No official framework.') },
    officiel:     { icon: '🏛️', label: t('Officiel Cameroun', 'Official Cameroon'), desc: t('MINEDUB (préscolaire + primaire) ET MINESEC (collège APC + lycée par séries) — auto par niveau.', 'MINEDUB (pre-primary + primary) AND MINESEC (lower secondary APC + high school by streams) — auto per level.') },
    // Héritage (drapeaux fragmentés encore acceptés) :
    apc_minesec:  { icon: '🎯', label: t('APC (1er cycle)', 'APC (lower secondary)'), desc: t('Bulletin par compétences MINESEC sur le collège (6e–3e).', 'MINESEC competency report card for lower secondary (6e–3e).') },
    minesec:      { icon: '🏛️', label: t('APC + Second Cycle', 'APC + Upper secondary'), desc: t('APC au collège ET Second Cycle MINESEC au lycée (par séries).', 'APC in lower secondary AND MINESEC upper secondary (by streams).') },
    minedub:      { icon: '🧸', label: t('Fondamental MINEDUB', 'MINEDUB fundamental'), desc: t('Maternelle (domaines) et primaire APC (compétences).', 'Nursery (domains) and primary APC (competencies).') },
    maternelle:   { icon: '🧸', label: t('Maternelle', 'Nursery'), desc: t('Bulletin maternelle par domaines (A / ECA / NA).', 'Nursery report card by domains.') },
    apc_primaire: { icon: '✏️', label: t('Primaire APC', 'Primary APC'), desc: t('Compétences nationales du primaire (SIL–CM2).', 'National primary competencies.') },
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
      // `bilingue` n'est pas une colonne : la page le retire et s'en sert pour
      // compléter la classe avec l'autre programme.
      bilingue,
    };
    // `serie` n'existe en base que pour le Second Cycle MINESEC.
    if (classEngine !== 'sc' || !payload.serie) delete payload.serie;
    return payload;
  };

  // CLASSE BILINGUE à la création. Ce n'est PAS une colonne de `classes` : le
  // drapeau ne sert qu'à poser, juste après la création, le programme de l'autre
  // sous-système (cf. `completerClasseBilingue` et core/bilingualSubjects.js).
  // L'auto-configuration ordinaire pose d'abord le programme du système choisi.
  const [bilingue, setBilingue] = useState(false);

  const resetForNext = () => { setRawName(''); setMaxStudents(''); setOverrides({}); setAdvanced(false); setCustomScale(false); setBilingue(false); };

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

  // CETTE CLASSE SERA-T-ELLE NOTÉE PAR CRITÈRES ?
  //
  // « met le formulaire de création de classe à jour : en créant une classe
  // class 1 ou les autres classes du primaire qui utilisent les critères, on
  // n'a pas besoin de FR/20 ou EN/100 » — responsable, 2026-10-31.
  //
  // En maternelle, au primaire et au premier cycle, la note est portée par les
  // CRITÈRES du référentiel, un barème par épreuve. Le barème de la classe
  // (`grade_max`) n'entre dans aucun de ces calculs. L'annoncer en pastille et
  // le faire choisir dans les réglages ferait croire à un réglage qui n'existe
  // pas — la même erreur que le `/ Max` de l'écran de modification.
  const baremeParCritere = ['maternelle', 'apc_primaire', 'apc'].includes(classEngine);

  // Le barème ne se déduit PAS de la langue (D21). On n'affiche donc un chiffre
  // que si la classe en porte un : « EN /— » ne disait rien à personne, et un
  // barème deviné aurait menti. Hors Guinée Éq., où il vient du réglage d'école.
  const scaleLabel    = isGE
    ? `/${country?.geMax || 10}`
    : (!baremeParCritere && Number(eff.grade_max) > 0 ? `/${Number(eff.grade_max)}` : '');
  const cycleLabel    = CYCLES.find((c) => c.value === eff.cycle)?.label || eff.cycle;
  // LE GABARIT, NOMMÉ POUR CE QU'IL EST. Les deux moteurs du fondamental
  // n'avaient pas de cas ici : une classe de primaire résolue en `apc_primaire`
  // s'annonçait donc « Classique », c'est-à-dire l'inverse de ce qu'elle est.
  const templateLabel = classEngine === 'sc'
    ? `${t('Second Cycle', 'Upper sec.')}${eff.serie ? ` · ${eff.serie.toUpperCase()}` : ` · ${t('série ?', 'stream ?')}`}`
    : classEngine === 'apc'
      ? t('APC (compétences)', 'APC (competencies)')
      : classEngine === 'apc_primaire'
        ? t('Primaire (critères)', 'Primary (criteria)')
        : classEngine === 'maternelle'
          ? t('Maternelle (critères)', 'Nursery (criteria)')
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
                {/* `scaleLabel` est VIDE quand la classe ne fixe aucun barème : on
                    ne laisse pas une espace traîner dans la pastille. */}
                <Chip>{[sysLabel, scaleLabel].filter(Boolean).join(' ')}</Chip>
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

          {/* ── CLASSE BILINGUE — ICI, ET PAS DANS LES RÉGLAGES AVANCÉS ──────
              « Ajoute bilingue au moment de la création de la classe »,
              responsable, 2026-10-31. La case EXISTAIT déjà à la création, mais
              enfermée dans « Réglages avancés » : replié par défaut, et annoncé
              « auto — rarement nécessaire ». Personne ne le dépliait, donc
              personne ne la voyait. Les classes bilingues naissaient
              monolingues, et il fallait rattraper après coup depuis l'écran de
              modification — d'où le bloc de rattrapage qui encombrait celui-ci.

              C'est pourtant la décision la plus structurante du formulaire :
              elle fixe quelles matières la classe porte, donc quelles
              compétences et unités d'apprentissage apparaîtront à la saisie, et
              dans quels groupes le bulletin imprimera. Elle est donc dans le
              corps du formulaire, visible sans rien déplier.

              La garde !isGE est conservée : la Guinée équatoriale n'a pas de
              sous-système anglophone à poser en regard. */}
          {!isGE && (
            <div className="mt-5">
              <label className="flex items-start gap-2.5 cursor-pointer rounded-xl border border-indigo-100 bg-indigo-50/60 px-3 py-2.5">
                <input type="checkbox" className="accent-indigo-600 w-4 h-4 mt-0.5 cursor-pointer"
                  checked={bilingue} onChange={(e) => setBilingue(e.target.checked)} />
                <span>
                  <span className="text-xs font-semibold text-indigo-900">
                    {t('Classe bilingue — poser les deux programmes', 'Bilingual class — set up both programmes')}
                  </span>
                  {/* La parenthèse « (/20 francophone, /100 anglophone) » n'a de
                      sens que si le barème est porté par la matière. Sur une
                      classe à critères, elle annonçait deux nombres qui
                      n'arriveront jamais. */}
                  <span className="block text-[11px] text-indigo-700/80 mt-0.5">
                    {baremeParCritere
                      ? t('Les matières de l’autre sous-système sont ajoutées en plus. Leurs compétences et unités d’apprentissage apparaissent alors à la saisie, avec les barèmes de leurs critères. Tout reste décochable ensuite.',
                          'The other sub-system’s subjects are added as well. Their competencies and learning units then show up in grade entry, with their criteria scales. Everything stays removable afterwards.')
                      : t('Les matières de l’autre sous-système sont ajoutées en plus, avec leur barème (/20 francophone, /100 anglophone). Leurs compétences et unités d’apprentissage apparaissent alors à la saisie. Tout reste décochable ensuite.',
                          'The other sub-system’s subjects are added as well, with their own scale (/20 French, /100 English). Their competencies and learning units then show up in grade entry. Everything stays removable afterwards.')}
                  </span>
                </span>
              </label>
            </div>
          )}

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
                    {/* LE BARÈME NE SE RÈGLE PAS ICI POUR UNE CLASSE À CRITÈRES.
                        Proposer /10 /20 /30 /40 /50 /100 à une Class 1 donnerait
                        six boutons sans effet : le calcul lit les barèmes des
                        critères du référentiel, épreuve par épreuve. On dit donc
                        où il se règle, plutôt que de laisser choisir dans le
                        vide. */}
                    <div>
                      <label className="form-label">{t('Barème', 'Scale', 'Escala')}</label>
                      {baremeParCritere ? (
                        <p className="text-[11px] leading-tight text-slate-500">
                          {t('Porté par les critères du référentiel, un barème par épreuve. Il se règle à la saisie des notes, en tête de chaque colonne.',
                             'Carried by the syllabus criteria, one scale per test. Set it at grade entry, at the top of each column.')}
                        </p>
                      ) : (
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
                      )}
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

// GROUPE OFFICIEL D'UNE MATIÈRE DE SECOND CYCLE (GROUPE 1 / GROUPE 2).
//
// Composant de MODULE, et non défini dans ClassDetailView : une fonction créée à
// chaque rendu est un type de composant neuf à chaque rendu, donc React démonte
// et remonte le <select> — qui se refermerait sous le doigt de l'utilisateur.
//
// « auto » (valeur vide → `null`) rend la décision au référentiel de la série.
// Un ordre posé à la main n'est JAMAIS réécrit par lui : l'enrichissement du
// bulletin ne touche que les matières dont `sc_groupe_ordre` est vide.
// LA CELLULE « COEF » D'UNE MATIÈRE.
//
// Remarque du responsable, 2026-10-31 : « le primaire n'a souvent pas de coef
// mais je vois sur la modification de classe ». Même nature que le barème : au
// PRIMAIRE et en MATERNELLE, le coefficient qui compte est celui de la
// COMPÉTENCE du référentiel (`primEngine` : « moyenne des compétences pondérée
// par coefficient », lu sur `competence.coefficient` / `niveauComp`), et en
// maternelle il vaut 1 en dur (`matEngine`). `subjects.coef` n'entre dans
// aucun de ces deux calculs.
//
// LE PREMIER CYCLE EST LAISSÉ TEL QUEL, et c'est volontaire : son bulletin
// officiel imprime bien une colonne « Coef » et une colonne « M×coef »
// (`BulletinApcOfficial`). Masquer le coef là-bas retirerait un réglage qui sert.
function CelluleCoef({ sub, parReferentiel, onChange, t }) {
  if (parReferentiel) {
    return (
      <div
        className="text-center text-xs text-gray-400 cursor-help"
        title={t(
          'Dans ce système, le coefficient est celui de la compétence du référentiel, pas celui de la matière. Le modifier ici n’aurait aucun effet sur la moyenne.',
          'In this system the coefficient comes from the syllabus competence, not from the subject. Changing it here would not affect the average.',
        )}
      >
        —
      </div>
    );
  }
  return (
    <input
      type="number" min="1" max="20" step="1"
      className="w-full text-center text-sm border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:border-brand-400 focus:ring-1 focus:ring-brand-400/30 bg-white"
      defaultValue={sub.coef}
      onBlur={(e) => {
        const v = Math.max(1, Math.min(20, Number(e.target.value) || 1));
        e.target.value = v;
        if (v !== sub.coef) onChange(sub.id, { coef: v });
      }}
    />
  );
}

// LA CELLULE « / MAX » D'UNE MATIÈRE.
//
// Deux mondes, et il faut le dire plutôt que de l'uniformiser :
//
//   • Systèmes CLASSIQUE et SECOND CYCLE — la note est portée par la matière.
//     Le barème est ici, modifiable ici, et il commande le calcul : la moyenne
//     ramène chaque note sur ce barème (`bulletinEngine.js`, `s.max`).
//
//   • MATERNELLE, PRIMAIRE, PREMIER CYCLE — la note est portée par les CRITÈRES
//     du référentiel. Le carnet de l'école porte un barème par ÉPREUVE (« TIC :
//     Pratique 10 puis Écrite 20 ») qu'un seul nombre sur la matière ne peut pas
//     représenter ; le calcul ne lit donc pas `subjects.max`, et c'est voulu.
//     On ne propose pas une case qui n'aurait pas d'effet : on dit où le barème
//     se règle vraiment — la petite case en tête de colonne, à la saisie des
//     notes, une colonne par critère.
//
// `sub.max` continue d'être écrit par la création de classe pour rester cohérent
// avec les autres classes de l'école ; on l'affiche donc, grisé, pour que
// personne ne croie la valeur perdue.
function CelluleBareme({ sub, parCritere, onChange, t }) {
  if (parCritere) {
    return (
      <div
        className="text-center text-xs text-gray-400 leading-tight cursor-help"
        title={t(
          'Dans ce système, le barème est porté par les critères du référentiel, une colonne par épreuve. Il se règle à la saisie des notes, dans la petite case en tête de chaque colonne.',
          'In this system the scale belongs to the syllabus criteria, one column per test. Set it in the grade entry screen, in the small box at the top of each column.',
        )}
      >
        <span className="block font-medium text-gray-500">
          {t('par critère', 'per criterion')}
        </span>
        <span className="block text-[10px]">
          {t('réglé à la saisie', 'set at grade entry')}
        </span>
      </div>
    );
  }
  return (
    <input
      type="number" min="1" max="200" step="1"
      className="w-full text-center text-sm border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:border-brand-400 focus:ring-1 focus:ring-brand-400/30 bg-white"
      defaultValue={sub.max}
      onBlur={(e) => {
        const v = Math.max(1, Number(e.target.value) || 20);
        e.target.value = v;
        if (v !== sub.max) onChange(sub.id, { max: v });
      }}
    />
  );
}

function GroupeSc({ sub, onChange, t }) {
  return (
    <select
      className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:border-brand-400 bg-white text-gray-700"
      value={sub.sc_groupe_ordre ?? ''}
      aria-label={t('Groupe officiel', 'Official group')}
      title={t('Groupe officiel de l’arrêté. « auto » laisse le référentiel de la série décider.',
               'Official group from the ministerial order. "auto" lets the stream framework decide.')}
      onChange={(e) => onChange(sub.id, {
        sc_groupe_ordre: e.target.value === '' ? null : Number(e.target.value),
      })}
    >
      <option value="">{t('auto', 'auto')}</option>
      <option value="1">{t('Groupe 1', 'Group 1')}</option>
      <option value="2">{t('Groupe 2', 'Group 2')}</option>
    </select>
  );
}

// ── Vue détail / édition d'une classe ────────────────────────────────────────
function ClassDetailView({ cls, teachers, onSave, onCancel, onDelete, schoolLanguage }) {
  const t = useT();
  const country = useCountry();
  // L'école décide du moteur de bulletin de la classe (`school.bulletin_engine`,
  // que `classes.bulletin_engine` peut surcharger) : il faut donc la lire ici
  // pour savoir si cette classe relève du second cycle.
  const school = useAuthStore((s) => s.school);
  const CYCLES = country.cycles.map((c) => ({ value: c.code, label: c.label }));
  const isEN_local = cls.system === 'EN';
  const catalog_local = subjectCatalogForCountry(country.code, isEN_local);
  const subjects      = useSchoolStore((s) => s.subjects);
  const students      = useSchoolStore((s) => s.students);
  const addSubject    = useSchoolStore((s) => s.addSubject);
  const updateSubject = useSchoolStore((s) => s.updateSubject);
  const deleteSubject = useSchoolStore((s) => s.deleteSubject);
  const completerClasseBilingue = useSchoolStore((s) => s.completerClasseBilingue);
  // Sur une classe a moteur officiel, une matiere n'existe vraiment que si elle
  // entre AUSSI au referentiel : sans cela elle n apparait ni a la saisie ni au
  // bulletin, qui lisent le referentiel et non `subjects`.
  const materialiserMatiereOfficielle = useSchoolStore((s) => s.materialiserMatiereOfficielle);

  const isEN     = cls.system === 'EN';

  // Même ordre que le bulletin et que la saisie : c'est ici que l'école choisit
  // ses matières, elle doit les voir rangées comme elles sortiront.
  const classSubjects = classSubjectsOf(subjects, cls.id);

  // ── CLASSE BILINGUE : les deux programmes sur la même classe ──────────────
  //
  // Demande de THE GENIUS : « que les unités d'apprentissage des matières
  // ANGLOPHONES se retrouvent sur les classes bilingues », et « laisse le choix
  // d'ajouter ou de retirer une matière ». Les UA viennent par le chemin qui
  // existe déjà : le périmètre du référentiel national d'une classe se déduit de
  // ses lignes `subjects` (core/refClassScope.js). Poser les matières
  // anglophones sur la classe fait donc entrer leurs compétences et leurs UA.
  //
  // RIEN N'EST POSÉ EN BASE pour marquer une classe bilingue : sa liste de
  // matières EST la marque (`isBilingualClass`). Pas de colonne, pas de
  // migration, pas de valeur de plus dans `classes.system` — donc aucun écran
  // ni aucun moteur ne change de comportement sans qu'on l'ait décidé.
  const catalogueFr = subjectCatalogForCountry(country.code, false);
  const catalogueEn = subjectCatalogForCountry(country.code, true);
  const [bilingue, setBilingue] = useState(() => isBilingualClass(cls, classSubjectsOf(subjects, cls.id)));

  // LA CLASSE JUMELLE. « CE1 BIL = fusion des matières de Class 3 + CE1 »
  // (administrateur de THE GENIUS, 19/10) : on ne copie donc pas un tronc
  // type, mais les matières telles que l'école les a posées sur sa classe
  // jumelle — coefficients, barèmes, et jusqu’aux matières hors référentiel.
  //
  // La correspondance de niveau n’est pas devinée : `defaultSiblingClass`
  // s’appuie sur les slugs du référentiel (Class 3 = CE1), et l’école peut
  // désigner une autre classe si son organisation diffère.
  const toutesClasses = useSchoolStore((st) => st.classes);
  const jumelles = useMemo(() => siblingClassCandidates(cls, toutesClasses), [cls, toutesClasses]);
  const [jumelleId, setJumelleId] = useState(() => defaultSiblingClass(cls, toutesClasses)?.id || '');
  const jumelle = useMemo(() => jumelles.find((c) => c.id === jumelleId) || null, [jumelles, jumelleId]);
  const jumelleSubjects = useMemo(
    () => (jumelle ? classSubjectsOf(subjects, jumelle.id) : []),
    [subjects, jumelle],
  );

  const catalogEntries = useMemo(() => {
    if (!bilingue) {
      // Barème de la CLASSE d'abord (`grade_max`) : une classe anglophone notée /20 ne doit pas
      // créer ses matières à /100 (cas Janus : History, Citizenship). La langue ne sert que de repli.
      const bareme = Number(cls.grade_max) > 0 ? Number(cls.grade_max) : (isEN_local ? 100 : 20);
      return catalog_local.map((name) => ({ name, max: bareme, cote: isEN_local ? 'EN' : 'FR' }));
    }
    // D’abord les matières RÉELLES des deux classes, puis le catalogue du
    // pays pour tout ce que l’école voudrait ajouter en plus.
    const reelles = jumelle
      ? mergeFromSiblingClass({ cls, classSubjects, sibling: jumelle, siblingSubjects: jumelleSubjects })
        .map((e) => ({ name: e.name, max: e.max, cote: e.cote, origine: e.origine }))
      : [];
    const vus = new Set(reelles.map((e) => e.name.toLowerCase()));
    const reste = mergeBilingualCatalog({ cls, catalogueFr, catalogueEn })
      .filter((e) => !vus.has(e.name.toLowerCase()));
    return [...reelles, ...reste];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bilingue, cls.system, catalog_local, catalogueFr, catalogueEn, isEN_local, jumelle, jumelleSubjects, classSubjects]);
  const catalog = useMemo(() => catalogEntries.map((e) => e.name), [catalogEntries]);
  const infoMatiere = useMemo(
    () => new Map(catalogEntries.map((e) => [e.name.toLowerCase(), e])),
    [catalogEntries],
  );
  // Le barème suit la matière, pas la classe : /20 en francophone, /100 en
  // anglophone (décision du responsable, 2026-10-19). En APC le calcul lit de
  // toute façon les barèmes du ministère dans le référentiel.
  const baremeDeLaMatiere = (name, cote) => infoMatiere.get(String(name).toLowerCase())?.max
    ?? (Number(cls.grade_max) > 0 ? Number(cls.grade_max) : (cote === 'EN' || (cls.system || 'FR') === 'EN' ? 100 : 20));

  const studentCount  = students.filter((s) => s.class_id === cls.id).length;
  const teacherCount  = new Set(classSubjects.filter((s) => s.teacher_id).map((s) => s.teacher_id)).size;
  // Aucun lien enseignant du tout : ni titulaire, ni matière affectée à quiconque.
  const noTeacherLink = teacherCount === 0;

  const [form, setForm]         = useState({ ...cls, max_students: cls.max_students ?? '' });
  const isMaternelle  = (form.cycle || cls.cycle || 'secondaire') === 'maternelle';
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);
  const [confirmDel, setConfDel] = useState(false);
  // cote : sur une classe bilingue, une matière HORS RÉFÉRENTIEL doit pouvoir
  // être posée d'un côté ou de l'autre — c'est son barème qui en dépend.
  const [customSubject, setCustomSubject] = useState({
    name: '', coef: 1, category: '', cote: cls.system === 'EN' ? 'EN' : 'FR',
  });

  const set = (field) => (e) => { setSaved(false); setForm((f) => ({ ...f, [field]: e.target.value })); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    // ── GARDE-FOU DU MODE D'ÉVALUATION ───────────────────────────────────────
    // Passer une classe de « compétences » à « matières » (ou l'inverse) alors qu'elle a déjà des notes les
    // ferait disparaître de l'écran : elles restent en base, mais l'autre mode ne les lit pas. On ne convertit
    // et on ne supprime RIEN : le reste du formulaire s'enregistre, le mode reste celui d'avant.
    let moteurChoisi = form.bulletin_engine || null;
    if (cls.id && modeChange(school, cls, moteurChoisi)) {
      const aDesNotes = await classeADesNotes({
        classId: cls.id, studentIds: students.filter((s) => s.class_id === cls.id).map((s) => s.id),
      });
      const g = garde({ change: true, aDesNotes });
      if (g.bloque) {
        moteurChoisi = cls.bulletin_engine || null;
        setForm((f) => ({ ...f, bulletin_engine: moteurChoisi || '' }));
        toast.error(g.raison === 'notes'
          ? t('Ce mode d’évaluation ne peut plus changer : cette classe a déjà des notes. Elles resteraient en base mais ne s’afficheraient plus. Le reste de vos modifications est enregistré.',
              'The evaluation mode can no longer change: this class already has grades. They would stay in the database but no longer show. The rest of your changes is saved.')
          : t('Impossible de vérifier si cette classe a des notes (hors connexion ?). Le mode d’évaluation n’a pas été modifié ; le reste est enregistré.',
              'Could not check whether this class has grades (offline?). The evaluation mode was not changed; the rest is saved.'));
      }
    }
    await onSave({
      ...form,
      teacher_id:   form.teacher_id   || null,
      teacher2_id:  form.teacher2_id  || null,
      // « Hérité de l'école » se stocke NULL, jamais '' : la colonne est lue par
      // `resolveClassEngine`, et une chaîne vide y passerait pour une surcharge
      // posée alors qu'elle n'en est pas une.
      bulletin_engine: moteurChoisi,
      max_students: form.max_students !== '' ? Number(form.max_students) : null,
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  // ── GROUPE OFFICIEL DU SECOND CYCLE ────────────────────────────────────────
  // Sur un bulletin de second cycle, chaque matière appartient au GROUPE 1 ou au
  // GROUPE 2 de l'arrêté, par série. Le référentiel le résout tout seul quand le
  // nom de la matière lui correspond ; quand il n'y arrive pas, la matière
  // s'imprimait sous AUTRES MATIÈRES sans que l'école ait le moindre levier —
  // la colonne `subjects.sc_groupe_ordre` existait (Cloud : supabase_sc_minesec.sql,
  // LAN : server/db.js) mais aucun écran ne la réglait. C'est ce levier.
  //
  // Réservé au second cycle : ailleurs, les groupes ne veulent rien dire.
  const moteurClasse  = resolveClassEngine(school, cls);
  const isSecondCycle = moteurClasse === 'sc';

  // ── PRIMAIRE : LES COMPÉTENCES DU RÉFÉRENTIEL QUE LA CLASSE NE PORTE PAS ───
  //
  // La saisie des notes et le bulletin du primaire (Class 1 A à 6 A, CE1 BIL…) travaillent sur
  // les COMPÉTENCES nationales du niveau ; cette fenêtre ne listait que les lignes `subjects`.
  // Une compétence qu'aucune matière de la classe ne réclame s'affichait donc aux notes et au
  // bulletin sans figurer ici — l'école ne pouvait ni la voir, ni lui donner un enseignant.
  // Mêmes entrées que la saisie : niveau de la classe, compétences masquées exclues, libellés
  // de l'école appliqués, rapprochement matière ↔ compétence identique (primCompetenceMatch).
  const primReferentiel = useSchoolStore((s) => s.primReferentiel);
  const masquesPrim     = useSchoolStore((s) => s.refMasques?.prim);
  const libellesPrim    = useSchoolStore((s) => s.refLibelles?.prim);
  const restoreRefLigne = useSchoolStore((s) => s.restoreRefLigne);
  // Masquage PAR CLASSE d'une compétence nationale (table prim_competences_classe_masquees).
  const masquesClasseMap     = useSchoolStore((s) => s.refMasquesClasse);
  const masquesClasseDispo   = useSchoolStore((s) => s.masquesClasseDispo);
  const masquerCompetenceClasse    = useSchoolStore((s) => s.masquerCompetenceClasse);
  const restaurerCompetenceClasse  = useSchoolStore((s) => s.restaurerCompetenceClasse);
  const addRefLigne     = useSchoolStore((s) => s.addRefLigne);

  // ── CLASSE BILINGUE : LES ONZE COMPÉTENCES, AUSSI EN ANGLAIS (1A-EN … 6B-EN) ──
  // Deux blocs au bulletin (English / French), chacun avec ses notes. Les compétences d'école
  // (Chinois, Economics, Management, Practical Work…) ne sont pas doublées.
  const ajouterProgrammeEn = useSchoolStore((s) => s.ajouterProgrammeAnglophonePrim);
  const [enOccupe, setEnOccupe] = useState(false);
  const [enMessage, setEnMessage] = useState(null);
  const slugPrim = moteurClasse === 'apc_primaire' ? primaireNiveauSlug(cls.level, cls.name) : null;
  // TOUTE classe du primaire peut porter le programme anglophone : une école bilingue (BRIGHT
  // CONTINENT, THE GENIUS) ne met pas « BIL » dans le nom de chacune de ses classes. Le bouton est
  // explicite — rien n'est ajouté tant qu'on ne le demande pas — et le nettoyage des doublons
  // n'est proposé qu'ensuite.
  const classeBilingue = !!slugPrim || bilingue || /\bbil/i.test(cls.name || '');
  const etatEn = useMemo(() => {
    if (!slugPrim || !primReferentiel) return null;
    return etatProgrammeAnglophone(planProgrammeAnglophone({
      competences: competencesForNiveau(primReferentiel, slugPrim), classSubjects,
    }));
  }, [slugPrim, primReferentiel, classSubjects]);
  // ── LES MATIÈRES D'UNE CLASSE DU PRIMAIRE, COMME À LA SAISIE ET AU BULLETIN ──
  //
  // La fenêtre listait les lignes brutes `subjects` (catalogue FR + EN, « Mathematics FR »,
  // « Communicate in French »…), alors que la saisie des notes et le bulletin travaillent sur les
  // COMPÉTENCES : « 1A — Communiquer en français », « CH — Chinois »… On montre donc ICI la même
  // liste, calculée par la même fonction (`primForClass`), avec les mêmes libellés (libellés
  // d'école compris), dans le même ordre. Le programme (Français / English / Autres) se lit
  // comme au carnet (`programmesParCode`) et n'apparaît que sur une classe réellement bilingue.
  const lignesMiroir = useMemo(() => {
    if (moteurClasse !== 'apc_primaire' || !primReferentiel || !slugPrim) return [];
    const sysCls = cls.system || 'FR';
    // TOUT le niveau, masquées comprises : une case décochée doit pouvoir être recochée.
    // Même libellés, même ordre que la saisie (competencesForNiveau trie par `ordre`).
    const duNiveau = competencesForNiveau(primReferentiel, slugPrim);
    const libelles = withLibelles(
      duNiveau.map((c) => ({ ...c, intitule: primCompetenceLabel(c, sysCls) })), libellesPrim,
    );
    const prog = programmesParCode(classSubjects, primReferentiel.competences || [], troncsDe(cls));
    const vals = new Set(prog.values());
    const bilingueProg = vals.has('FR') && vals.has('EN');
    return libelles.map((c) => {
      const nationale = !c.school_id;
      // Les matières de la classe qui réclament la compétence ; la PREMIÈRE la garde (règle du produit).
      const reclamantes = classSubjects.filter((m) => competenceIdForSubject(m, duNiveau) === c.id);
      return {
        c, nationale, reclamantes, matiere: reclamantes[0] || null,
        // Nationale : au programme tant qu'elle n'est masquée NI pour l'école NI pour cette classe.
        // École : au programme de CETTE classe seulement si une de ses matières la porte (primForClass).
        masqueeEcole: nationale && (masquesPrim || []).includes(c.id),
        masqueeClasse: nationale && ((masquesClasseMap || {})[cls.id] || []).includes(c.id),
        coche: nationale
          ? !(masquesPrim || []).includes(c.id) && !((masquesClasseMap || {})[cls.id] || []).includes(c.id)
          : reclamantes.length > 0,
        programme: bilingueProg ? (prog.get(c.code) || 'AUTRE') : null,
      };
    });
  }, [moteurClasse, primReferentiel, slugPrim, cls, classSubjects, masquesPrim, masquesClasseMap, libellesPrim]);

  // ── NETTOYAGE DES LIGNES EN DOUBLE (classe bilingue, programme anglophone EN PLACE) ──
  // Les secondes matières sur une compétence déjà portée sont le tronc de l'autre langue tant que
  // les jumelles 1A-EN…6B-EN ne le remplacent pas : le nettoyage n'est donc proposé qu'ensuite.
  // Un aperçu d'abord, puis la suppression : chaque ligne part à la CORBEILLE (restaurable).
  const doublons = useMemo(() => {
    if (!slugPrim || !primReferentiel || !classeBilingue || !etatEn || etatEn.aFaire !== 0) return [];
    return lignesEnDouble(classSubjects, competencesForNiveau(primReferentiel, slugPrim));
  }, [slugPrim, primReferentiel, classeBilingue, etatEn, classSubjects]);
  const [apercuDoublons, setApercuDoublons] = useState(false);
  const [nettoyageOccupe, setNettoyageOccupe] = useState(false);
  const supprimerDoublons = async () => {
    setNettoyageOccupe(true);
    let n = 0;
    for (const d of doublons) { await deleteSubject(d.subject.id); n += 1; }
    setNettoyageOccupe(false); setApercuDoublons(false);
    setMiroirMessage(t(`${n} ligne(s) en double envoyée(s) à la corbeille.`, `${n} duplicate line(s) moved to the trash.`));
  };

  const [miroirMessage, setMiroirMessage] = useState(null);
  const [nouvelleCompetence, setNouvelleCompetence] = useState('');
  const basculerCompetence = async ({ c, nationale, coche, reclamantes, masqueeEcole }) => {
    setMiroirMessage(null);
    if (nationale) {
      // Masquée pour TOUTE l'école (réglage du référentiel) : la recocher la réaffiche partout, ce qui
      // se confirme. C'est le seul cas où l'on sort du périmètre de CETTE classe.
      if (masqueeEcole) {
        const ok = window.confirm(t(
          `« ${c.code} — ${c.intitule} » est masquée pour TOUTE l'école. La recocher la réaffiche dans toutes les classes. Continuer ?`,
          `“${c.code} — ${c.intitule}” is hidden for the WHOLE school. Checking it shows it again in every class. Continue?`));
        if (!ok) return;
        const r = await restoreRefLigne('prim', c.id);
        if (r?.error) setMiroirMessage(t(`Impossible de réafficher : ${r.error}`, `Could not show: ${r.error}`));
        return;
      }
      // Sinon : le masque est celui de CETTE classe seulement.
      if (!masquesClasseDispo) {
        setMiroirMessage(t(
          'Le masquage par classe n\'est pas encore disponible : la mise à jour du Cloud (migration prim_competences_classe_masquees) doit d\'abord être appliquée.',
          'Per-class hiding is not available yet: the Cloud update (prim_competences_classe_masquees migration) must be applied first.'));
        return;
      }
      const r = coche
        ? await masquerCompetenceClasse(cls.id, c.id)
        : await restaurerCompetenceClasse(cls.id, c.id);
      if (r?.error) setMiroirMessage(t(`Impossible de modifier : ${r.error}`, `Could not change: ${r.error}`));
      return;
    }
    // Compétence d'école : l'activer dans CETTE classe = lui donner une matière porteuse ; la
    // décocher = retirer ses matières porteuses de cette classe (les autres classes ne bougent pas).
    if (coche) { for (const m of reclamantes) await deleteSubject(m.id); } else { await rattacherCompetence(c); }
  };
  const ajouterCompetenceEcole = async () => {
    const nom = nouvelleCompetence.trim();
    if (!nom) return;
    setMiroirMessage(null);
    const r = await addRefLigne('prim', nom);
    const ligne = r?.data || null;
    if (!ligne) { setMiroirMessage(t(`Impossible d'ajouter : ${r?.error || 'refus'}`, `Could not add: ${r?.error || 'refused'}`)); return; }
    await addSubject({ name: nom, coef: 1, max: 20, class_id: cls.id, teacher_id: null, prim_competence_id: ligne.id });
    setNouvelleCompetence('');
  };

  const lancerProgrammeEn = async () => {
    setEnOccupe(true); setEnMessage(null);
    const r = await ajouterProgrammeEn(cls, slugPrim).catch((e) => ({ error: String(e?.message || e) }));
    setEnOccupe(false);
    if (r?.error) {
      setEnMessage({ ton: 'err', texte: r.error === 'offline'
        ? t('Hors ligne : reconnectez-vous pour ajouter le programme anglophone.', 'Offline: reconnect to add the English programme.')
        : t(`Impossible : ${r.error}`, `Could not add: ${r.error}`) });
      return;
    }
    setEnMessage({ ton: r.echecs?.length ? 'err' : 'ok', texte: r.echecs?.length
      ? t(`${r.echecs.length} compétence(s) en échec : ${r.echecs.join(' ; ')}`, `${r.echecs.length} failed: ${r.echecs.join('; ')}`)
      : t(`Programme anglophone ajouté (${r.lignes} compétence(s), ${r.matieres} matière(s)).`, `English programme added (${r.lignes} competencies, ${r.matieres} subjects).`) });
  };

  // Rattacher = créer la ligne de matière portant le lien canonique `prim_competence_id`.
  // Idempotent : une compétence déjà réclamée n'est pas proposée, donc pas recréée.
  const rattacherCompetence = (c) => addSubject({
    name: c.intitule, coef: Number(c.coefficient) > 0 ? Number(c.coefficient) : 1,
    max: baremeDeLaMatiere(c.intitule, cls.system || 'FR'),
    class_id: cls.id, teacher_id: null, prim_competence_id: c.id,
  });

  // LE BARÈME DE CETTE CLASSE EST-IL PORTÉ PAR LA MATIÈRE, OU PAR LES CRITÈRES ?
  //
  // Défaut signalé par le responsable le 2026-10-31 : « quand ce sont les
  // matières qui ont des critères, le barème ne détermine pas comme les matières
  // classiques ». C'est exact, et c'est VOULU côté calcul : en maternelle, au
  // primaire et au premier cycle, le carnet de l'école porte un barème par
  // ÉPREUVE — « TIC : Pratique 10 puis Écrite 20 » — qu'un seul nombre sur la
  // matière ne peut pas représenter. `primEngine.js` et `bilingualSubjects.js`
  // l'écrivent tous deux : « on ne déduit rien de subjects.max ».
  //
  // Le défaut était donc dans CET ÉCRAN, qui offrait une case `/ Max` modifiable
  // là où elle ne commande rien. On tapait 100, on enregistrait, et la saisie
  // continuait sur /20 sans un mot. Une case qui accepte une valeur sans effet
  // est pire qu'une case absente : elle fait croire que le réglage est fait.
  const baremeParCritere = ['maternelle', 'apc_primaire', 'apc'].includes(moteurClasse);

  // Le COEF, lui, ne disparaît qu'en maternelle et au primaire : le premier
  // cycle imprime « Coef » et « M×coef » sur son bulletin officiel.
  const coefParReferentiel = ['maternelle', 'apc_primaire'].includes(moteurClasse);
  const COLS = isSecondCycle
    ? 'grid-cols-[24px_1fr_72px_72px_148px_120px_180px]'
    : 'grid-cols-[24px_1fr_72px_72px_148px_180px]';

  // Subject catalog toggle (live — no form save needed)
  const subjectNameSet = new Set(classSubjects.map((s) => s.name.toLowerCase()));

  const handleToggleSubject = async (name) => {
    const existing = classSubjects.find((s) => s.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      await deleteSubject(existing.id);
    } else {
      await addSubject({ name, coef: 1, max: baremeDeLaMatiere(name), class_id: cls.id, teacher_id: null });
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
              {/* Une classe sans titulaire ET sans matière affectée n'est VISIBLE
                  d'aucun enseignant : le périmètre d'un compte enseignant se
                  déduit de ces deux liens (schoolStore.init). La classe existe,
                  ses élèves aussi, mais personne ne peut saisir. Au fondamental
                  c'est le cas courant — l'institutrice enseigne tous les domaines,
                  donc aucune ligne `subjects` ne porte son nom : le titulariat est
                  alors son SEUL rattachement. On le dit ici, où on le décide. */}
              {!form.teacher_id && noTeacherLink && (
                <p className="mt-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2">
                  {t(
                    'Sans titulaire ni matière affectée, aucun enseignant ne voit cette classe : elle n’apparaît dans la saisie des notes d’aucun compte.',
                    'With no class teacher and no assigned subject, no teacher can see this class: it appears in no account’s grade entry.',
                  )}
                </p>
              )}
            </div>
            {/* SECOND enseignant principal : il s'imprime sur les documents et
                n'ouvre AUCUN droit — dit explicitement sous le champ, sinon
                l'école croira avoir donné un accès à quelqu'un qui ne l'a pas. */}
            <div>
              <label className="form-label">{t('Deuxième enseignant principal', 'Second class teacher')}</label>
              <select className="form-input" value={form.teacher2_id || ''} onChange={set('teacher2_id')}>
                <option value="">{t('Aucun', 'None')}</option>
                {teachers.map((tc) => <option key={tc.id} value={tc.id}>{tc.name}</option>)}
              </select>
              <p className="text-[11px] text-slate-500 mt-1">
                {form.teacher2_id && form.teacher2_id === form.teacher_id
                  ? t('Même enseignant que ci-dessus : son nom ne sera imprimé qu’une fois.',
                      'Same teacher as above: the name will be printed only once.')
                  : t('Son nom figure sur les bulletins et les documents. Il ne donne pas accès à la classe.',
                      'Printed on report cards and documents. Grants no access to the class.')}
              </p>
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
                  {/* LE SOUS-SYSTÈME, ET RIEN QUE LUI. Ce choix dit le PROGRAMME
                      suivi — francophone ou anglophone — et non le barème : celui-ci
                      se règle matière par matière, et la classe le fixe pour son
                      bulletin (`grade_max`), cf. D21. Annoncer « EN — notes sur 100 »
                      ici était faux dès qu'une classe anglophone notait sur /20, ce
                      qui est le cas de FORM1 et FORM2 : le réglage le plus visible
                      de l'écran contredisait le barème réellement appliqué. */}
                  {SYSTEMS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            )}

            {/* ── CE QUE LA CLASSE SAISIT ET IMPRIME ─────────────────────────
                `classes.bulletin_engine` existe depuis toujours (« null = hérite
                de l'école ») et `resolveClassEngine` l'honore en premier — mais
                AUCUN écran ne l'exposait. Une classe du primaire était donc
                routée d'office vers la saisie par COMPÉTENCES, sans retour
                possible : les matières cochées ci-dessous n'étaient alors
                notables nulle part.

                MESURÉ sur CE2 BIL (37 matières, 2026-10-29) : le bulletin
                « Primaire APC officiel » en montre 1 sur 37 ; les formats
                Classique, Moderne et APC les montrent toutes les 37. Les
                matières n'étaient donc pas perdues — elles étaient inatteignables
                depuis la saisie, faute de ce réglage.

                Défaut `null` : aucune classe existante ne change de comportement. */}
            <div className="col-span-2 md:col-span-1">
              <label className="form-label">{t('Saisie et bulletin', 'Entry and report')}</label>
              <select className="form-input" value={form.bulletin_engine || ''} onChange={set('bulletin_engine')}>
                <option value="">{t('Hérité de l’école', 'Inherited from school')}</option>
                <option value="classic">{t('Par matières (classique)', 'By subject (classic)')}</option>
                <option value="officiel">{t('Officiel (par compétences)', 'Official (by competency)')}</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">
                {resolveClassEngine(school, { ...cls, bulletin_engine: form.bulletin_engine || null }) === 'classic'
                  ? t('Les matières cochées ci-dessous se saisissent et s’impriment avec leur coefficient et leur barème.',
                      'The subjects checked below are entered and printed with their coefficient and scale.')
                  : t('Le programme officiel note des COMPÉTENCES : les matières cochées ci-dessous servent alors à choisir les compétences, et n’apparaissent pas une par une. Choisissez « Par matières » pour les saisir et les imprimer telles quelles.',
                      'The official programme grades COMPETENCIES: the subjects checked below then only select competencies and do not appear one by one. Choose “By subject” to enter and print them as they are.')}
              </p>
            </div>
          </div>


          {/* ── Matières ──────────────────────────────────────────── */}
          <div className="mt-6">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-1">
              {t('Matières', 'Subjects')}
            </p>
            <p className="text-xs text-gray-400 mb-3">
              {/* LA LÉGENDE DOIT DIRE CE QUE L'ÉCRAN FAIT VRAIMENT.
                  Elle promettait « modifiez le coefficient et le barème
                  directement » à toutes les classes. Sur une classe au barème
                  par critère, les deux cases ne commandent rien et ne sont plus
                  modifiables : la légende annonçait donc un réglage absent. */}
              {isMaternelle
                ? t('Ajoutez vos domaines de compétences personnalisés.', 'Add your custom competency domains.')
                : coefParReferentiel
                  ? t('Cochez pour activer. Le coefficient et le barème viennent du référentiel : ils se règlent à la saisie des notes, critère par critère.',
                      'Check to activate. Coefficient and scale come from the syllabus: set them at grade entry, criterion by criterion.')
                  : baremeParCritere
                    ? t('Cochez pour activer · modifiez le coefficient directement. Le barème, lui, vient des critères du référentiel.',
                        'Check to activate · edit the coefficient directly. The scale comes from the syllabus criteria.')
                    : t('Cochez pour activer · modifiez le coefficient et le barème directement', 'Check to activate · edit coefficient and max score directly')}
            </p>

            {/* LE BLOC DE RATTRAPAGE BILINGUE A ÉTÉ RETIRÉ D'ICI.
                « ceci ne sert à rien, enlève à écran » puis « bilingue au
                moment de la création de la classe » — responsable, 2026-10-31.

                Il existait parce que la case bilingue était invisible à la
                création, enfermée dans les réglages avancés : il fallait donc
                pouvoir rattraper ensuite. La case est maintenant dans le corps
                du formulaire de création, et ce rattrapage n'a plus d'objet.

                Rien n'est perdu : la liste des matières reste entièrement
                modifiable juste en dessous, case par case, et l'état bilingue
                d'une classe se DÉDUIT de cette liste (isBilingualClass) — il
                n'a jamais été une colonne qu'il aurait fallu pouvoir régler. */}
            {etatEn && classeBilingue && (
              <div className="border border-sky-200 bg-sky-50/70 rounded-xl px-4 py-3 mb-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-sky-900">
                    {t('Programme anglophone de la classe (classes bilingues)', 'English programme of the class (bilingual classes)')}
                    {' '}({etatEn.completes}/{etatEn.total})
                  </p>
                  <button
                    type="button" disabled={enOccupe || etatEn.aFaire === 0} onClick={lancerProgrammeEn}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-50"
                  >
                    {enOccupe ? t('Ajout…', 'Adding…')
                      : etatEn.aFaire === 0 ? t('Déjà ajouté', 'Already added')
                      : t(`Ajouter les ${etatEn.aFaire} compétences en anglais`, `Add the ${etatEn.aFaire} competencies in English`)}
                  </button>
                </div>
                <p className="text-xs text-sky-900/80 mt-1">
                  {t('Chaque compétence nationale (1A, 1B…) est ajoutée en anglais sous le code 1A-EN, 1B-EN…, avec ses propres notes ; le bulletin affiche deux blocs, English et French. Chinois, Economics, Management, Practical Work… ne sont pas doublés.',
                     'Each national competency (1A, 1B…) is added in English as 1A-EN, 1B-EN… with its own grades; the report card shows two blocks, English and French. Chinese, Economics, Management, Practical Work… are not duplicated.')}
                </p>
                {enMessage && (
                  <p className={`text-xs mt-1 font-medium ${enMessage.ton === 'ok' ? 'text-emerald-700' : 'text-rose-700'}`}>{enMessage.texte}</p>
                )}
                {etatEn.aFaire !== 0 && (
                  <p className="text-xs text-sky-900/70 mt-1">
                    {t('Le nettoyage des lignes en double est proposé une fois le programme anglophone ajouté.', 'Duplicate-line cleanup is offered once the English programme is added.')}
                  </p>
                )}
                {doublons.length > 0 && !apercuDoublons && (
                  <button
                    type="button" onClick={() => setApercuDoublons(true)}
                    className="mt-2 text-xs font-semibold px-3 py-1.5 rounded-lg border border-rose-300 bg-white text-rose-700 hover:bg-rose-50"
                  >
                    {t(`Supprimer les ${doublons.length} lignes en double…`, `Delete the ${doublons.length} duplicate lines…`)}
                  </button>
                )}
                {doublons.length > 0 && apercuDoublons && (
                  <div className="mt-2 rounded-lg border border-rose-200 bg-white p-3">
                    <p className="text-xs font-semibold text-rose-800 mb-1">
                      {t(`Ces ${doublons.length} lignes répètent une compétence déjà portée par une autre ligne (conservée). Elles iront à la corbeille :`,
                         `These ${doublons.length} lines repeat a competency already carried by another line (kept). They go to the trash:`)}
                    </p>
                    <ul className="max-h-48 overflow-y-auto text-xs text-gray-700 space-y-0.5">
                      {doublons.map((d) => (
                        <li key={d.subject.id}>
                          <strong>{d.subject.name}</strong>
                          <span className="text-gray-400"> → {t('garde :', 'kept:')} {d.gardee.name}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="flex gap-2 mt-2">
                      <button
                        type="button" disabled={nettoyageOccupe} onClick={supprimerDoublons}
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50"
                      >
                        {nettoyageOccupe ? t('Suppression…', 'Deleting…') : t(`Supprimer ces ${doublons.length} lignes`, `Delete these ${doublons.length} lines`)}
                      </button>
                      <button type="button" onClick={() => setApercuDoublons(false)} className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-300">
                        {t('Annuler', 'Cancel')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {lignesMiroir.length > 0 && (
              <div className="border border-brand-200 rounded-xl overflow-hidden mb-3 bg-white">
                <div className="px-4 py-2.5 bg-brand-50 border-b border-brand-100">
                  <p className="text-sm font-semibold text-brand-900">
                    {t('Matières et compétences de la classe — mêmes noms qu’à la saisie des notes et au bulletin',
                       'Class subjects and competencies — same names as in grade entry and on the report card')}
                    {' '}({lignesMiroir.filter((l) => l.coche).length}/{lignesMiroir.length})
                  </p>
                  <p className="text-xs text-brand-900/70">
                    {t('Cochez pour activer, décochez pour retirer. Décocher une compétence, nationale ou d’école, la retire de CETTE classe seulement : les autres classes ne changent pas.',
                       'Check to enable, uncheck to remove. Unchecking a competency, national or school-defined, removes it from THIS class only: other classes are unchanged.')}
                  </p>
                  {miroirMessage && <p className="text-xs font-medium text-rose-700 mt-1">{miroirMessage}</p>}
                </div>
                {lignesMiroir.map((l, i) => (
                  <div
                    key={l.c.id}
                    className={`grid grid-cols-[24px_64px_1fr_92px_220px] gap-3 items-center px-4 py-2 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} ${l.coche ? '' : 'opacity-60'}`}
                  >
                    <input
                      type="checkbox" className="accent-brand-600 w-4 h-4 cursor-pointer"
                      checked={l.coche} onChange={() => basculerCompetence(l)}
                      aria-label={`${l.c.code} — ${l.c.intitule}`}
                    />
                    <span className="font-mono text-xs font-semibold text-brand-700">{l.c.code}</span>
                    <span className="text-sm text-gray-900">
                      {l.c.intitule}
                      {l.nationale && <span className="ml-2 text-[10px] text-gray-400">{t('nationale', 'national')}</span>}
                      {l.masqueeEcole && <span className="ml-2 text-[10px] font-semibold text-amber-700">{t('masquée pour toute l’école', 'hidden for the whole school')}</span>}
                    </span>
                    <span>
                      {l.programme && (
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${
                          l.programme === 'EN' ? 'bg-sky-50 text-sky-700 border-sky-200'
                            : l.programme === 'FR' ? 'bg-violet-50 text-violet-700 border-violet-200'
                              : 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                          {l.programme === 'EN' ? 'English' : l.programme === 'FR' ? t('Français', 'French') : t('Autres', 'Other')}
                        </span>
                      )}
                    </span>
                    {l.matiere ? (
                      <select
                        className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:border-brand-400 bg-white text-gray-700"
                        value={l.matiere.teacher_id || ''}
                        onChange={(e) => updateSubject(l.matiere.id, { teacher_id: e.target.value || null })}
                      >
                        <option value="">— {t('Aucun', 'None')} —</option>
                        {teachers.map((tc) => <option key={tc.id} value={tc.id}>{tc.name}</option>)}
                      </select>
                    ) : l.coche ? (
                      <button
                        type="button" onClick={() => rattacherCompetence(l.c)}
                        className="text-xs font-semibold px-2 py-1 rounded border border-amber-300 bg-amber-50 hover:bg-amber-100 text-left"
                      >
                        {t('Choisir un enseignant (créer la matière)', 'Pick a teacher (create the subject)')}
                      </button>
                    ) : <span />}
                  </div>
                ))}
                <div className="flex items-center gap-2 px-4 py-3 bg-brand-50/60 border-t border-brand-100">
                  <input
                    type="text" value={nouvelleCompetence}
                    onChange={(e) => setNouvelleCompetence(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') ajouterCompetenceEcole(); }}
                    placeholder={t('Ajouter une compétence ou matière de l’école…', 'Add a school competency or subject…')}
                    className="flex-1 text-sm border border-brand-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-brand-400 bg-white"
                  />
                  <button
                    type="button" onClick={ajouterCompetenceEcole} disabled={!nouvelleCompetence.trim()}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50"
                  >
                    {t('Ajouter', 'Add')}
                  </button>
                </div>
              </div>
            )}

            {/* UNE SEULE LISTE pour le primaire : la liste cochable ci-dessus (mêmes noms que le
                bulletin). Le tableau brut des lignes `subjects` n'est rendu que s'il n'y a pas de
                référentiel à montrer (autres cycles, ou référentiel pas encore chargé). */}
            <div className={lignesMiroir.length > 0 ? 'hidden' : 'border border-gray-200 rounded-xl overflow-hidden'}>
              {/* En-tête tableau */}
              <div className={`grid ${COLS} gap-3 px-4 py-2 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-400 uppercase tracking-wider`}>
                <div />
                <div>{t('Matière', 'Subject')}</div>
                <div className="text-center">Coef</div>
                <div className="text-center">/ Max</div>
                <div>{t('Classement', 'Category')}</div>
                {isSecondCycle && <div>{t('Groupe', 'Group')}</div>}
                <div>{t('Enseignant', 'Teacher')}</div>
              </div>

              {/* Matières du catalogue — masqué pour maternelle */}
              {!isMaternelle && catalog.map((name, i) => {
                const existing = classSubjects.find((s) => s.name.toLowerCase() === name.toLowerCase());
                const checked  = !!existing;
                // Sur une classe bilingue, dire DE QUEL programme vient la
                // matière : « Anglais » (francophone) et « English »
                // (anglophone) sont deux matières différentes, et l'école doit
                // pouvoir les distinguer d'un coup d'œil.
                const cote = bilingue ? infoMatiere.get(name.toLowerCase())?.cote : null;
                return (
                  <div
                    key={name}
                    className={`grid ${COLS} gap-3 items-center px-4 py-2.5 ${
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
                      {cote && (
                        <span className={`ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded align-middle ${
                          cote === 'EN' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                        }`}>
                          {cote}
                        </span>
                      )}
                    </span>
                    {checked ? (
                      <>
                        <CelluleCoef sub={existing} parReferentiel={coefParReferentiel} onChange={updateSubject} t={t} />
                        <CelluleBareme
                          sub={existing} parCritere={baremeParCritere}
                          onChange={updateSubject} t={t}
                        />
                        <ChoixClassement
                          value={existing.category}
                          onChange={(v) => updateSubject(existing.id, { category: v })}
                          subjects={subjects}
                          autoLabel={`${t('auto', 'auto')} (${t(...inferCategory(existing.name).label)})`}
                          t={t}
                        />
                        {isSecondCycle && <GroupeSc sub={existing} onChange={updateSubject} t={t} />}
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
                        {isSecondCycle && <div className="text-xs text-gray-200">—</div>}
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
                    className={`grid ${COLS} gap-3 items-center px-4 py-2.5 ${
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
                    <CelluleCoef sub={sub} parReferentiel={coefParReferentiel} onChange={updateSubject} t={t} />
                    <CelluleBareme sub={sub} parCritere={baremeParCritere} onChange={updateSubject} t={t} />
                    {/* CLASSEMENT de la matière. Tant qu'il est vide, le produit
                        déduit la famille du NOM — c'est ce qui faisait tomber
                        « LMC », « EFPS » ou « Travaux Pratiques » dans « Autre »,
                        sans recours. L'option « auto » affiche donc entre
                        parenthèses ce que la déduction donnerait, pour que le
                        choix soit éclairé plutôt que deviné. */}
                    <ChoixClassement
                      value={sub.category}
                      onChange={(v) => updateSubject(sub.id, { category: v })}
                      subjects={subjects}
                      autoLabel={`${t('auto', 'auto')} (${t(...inferCategory(sub.name).label)})`}
                      t={t}
                    />
                    {isSecondCycle && <GroupeSc sub={sub} onChange={updateSubject} t={t} />}
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
              <div className={`grid ${COLS} gap-3 items-center px-4 py-3 bg-brand-50/60 border-t border-brand-100`}>
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
                    materialiserMatiereOfficielle(cls, customSubject.name.trim(), Number(customSubject.coef) || 1);
                    addSubject({
                      name: customSubject.name.trim(), coef: Number(customSubject.coef) || 1,
                      max: baremeDeLaMatiere(customSubject.name, customSubject.cote),
                      class_id: cls.id, teacher_id: null,
                      category: customSubject.category || null,
                    });
                    setCustomSubject((p2) => ({ name: '', coef: 1, category: '', cote: p2.cote }));
                  }}
                />
                <input
                  type="number" min="1" max="20" step="1"
                  className="w-full text-center text-sm border border-brand-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-brand-400 bg-white"
                  value={customSubject.coef}
                  onChange={(e) => setCustomSubject((p) => ({ ...p, coef: e.target.value }))}
                />
                {bilingue ? (
                  <select
                    className="w-full text-xs border border-brand-200 rounded-lg px-1 py-1.5 focus:outline-none focus:border-brand-400 bg-white text-gray-700"
                    value={customSubject.cote}
                    onChange={(e) => setCustomSubject((prev) => ({ ...prev, cote: e.target.value }))}
                    aria-label={baremeParCritere
                      ? t('Programme', 'Programme')
                      : t('Programme et barème', 'Programme and scale')}
                    title={baremeParCritere
                      ? t('Le programme auquel la matière appartient. Le barème, lui, est porté par les critères du référentiel et se règle à la saisie des notes.',
                          'The programme the subject belongs to. The scale itself comes from the syllabus criteria and is set at grade entry.')
                      : undefined}
                  >
                    {/* LE PROGRAMME COMPTE TOUJOURS ; LE BARÈME, PAS ICI.
                        Remarque du responsable, 2026-10-31 : « en créant une
                        matière il y a toujours FR/20 EN/100 ». Sur une classe au
                        barème par critère — et une CE1 bilingue en est une — ces
                        « /20 » et « /100 » annoncent un réglage qui ne commande
                        rien : le calcul lit les critères du référentiel, pas
                        `subjects.max`. Le côté FR/EN, lui, reste décisif : c'est
                        lui qui dit de quel programme la matière relève, et c'est
                        la puce affichée sur chaque ligne. On garde donc le choix
                        et on retire les deux nombres trompeurs. */}
                    <option value="FR">{baremeParCritere ? 'FR' : 'FR /20'}</option>
                    <option value="EN">{baremeParCritere ? 'EN' : 'EN /100'}</option>
                  </select>
                ) : (
                  <div className="text-center text-xs text-gray-300">{t('auto', 'auto', 'auto')}</div>
                )}
                {/* CLASSEMENT À LA CRÉATION. C'est ici que la matière était
                    perdue : ajoutée sans famille, elle tombait dans « Autre »
                    dès l'emploi du temps, et il fallait deviner qu'on pouvait
                    la reclasser ailleurs. L'option « auto » montre ce que la
                    déduction par le nom donnerait, et se met à jour pendant la
                    frappe — l'école voit donc tout de suite si elle doit
                    trancher elle-même. */}
                <ChoixClassement
                  value={customSubject.category}
                  onChange={(v) => setCustomSubject((prev) => ({ ...prev, category: v || '' }))}
                  subjects={subjects}
                  autoLabel={`${t('auto', 'auto')} (${t(...inferCategory(customSubject.name).label)})`}
                  t={t} dense
                />
                {/* Le GROUPE ne se choisit pas à la création : le référentiel de
                    la série l'essaie d'abord sur le nom, et l'école ne tranche
                    que s'il n'y arrive pas — sur la ligne, juste au-dessus. */}
                {isSecondCycle && (
                  <div className="text-center text-xs text-gray-300">{t('auto', 'auto')}</div>
                )}
                <button
                  type="button"
                  disabled={!customSubject.name.trim()}
                  onClick={() => {
                    if (!customSubject.name.trim()) return;
                    materialiserMatiereOfficielle(cls, customSubject.name.trim(), Number(customSubject.coef) || 1);
                    addSubject({
                      name: customSubject.name.trim(), coef: Number(customSubject.coef) || 1,
                      max: baremeDeLaMatiere(customSubject.name, customSubject.cote),
                      class_id: cls.id, teacher_id: null,
                      category: customSubject.category || null,
                    });
                    setCustomSubject((p2) => ({ name: '', coef: 1, category: '', cote: p2.cote }));
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
  // LE BARÈME NE SE DÉDUIT PLUS DE LA LANGUE (D21) : une classe anglophone du
  // Cameroun note sur /20 comme sa jumelle francophone. La carte annonce donc le
  // SOUS-SYSTÈME, qui est un fait, et non un barème qu'elle devinait — il se lit
  // sur la fiche de la classe, où il vient de `grade_max`.
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

      {/* Badges cycle + sous-système */}
      <div className="px-5 flex flex-wrap gap-1.5">
        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded border ${theme.badge}`}>{CYCLE_LABELS[cycle]}</span>
        <span className="text-[11px] font-semibold px-2 py-0.5 rounded border bg-slate-50 text-slate-600 border-slate-100">{t('Système', 'System', 'Sistema')} {sys}</span>
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
  const completerClasseBilingue = useSchoolStore((s) => s.completerClasseBilingue);
  const updateClass = useSchoolStore((s) => s.updateClass);
  const deleteClass = useSchoolStore((s) => s.deleteClass);
  const loadSc      = useSchoolStore((s) => s.loadSc);
  const loadApc     = useSchoolStore((s) => s.loadApc);
  const loadMat     = useSchoolStore((s) => s.loadMat);
  const loadPrim    = useSchoolStore((s) => s.loadPrim);
  const configureClassSubjects = useSchoolStore((s) => s.configureClassSubjects);

  // Préchauffe les référentiels (cache IDB + refresh cloud) pour l'auto-config des
  // matières à la création. Le mode unifié 'officiel' couvre TOUS les cycles, donc
  // on précharge fondamental (maternelle/primaire) ET secondaire (APC/Second Cycle).
  useEffect(() => {
    const eng = school?.bulletin_engine;
    if (eng === 'minesec' || eng === 'officiel') loadSc();
    if (eng === 'minesec' || eng === 'apc_minesec' || eng === 'officiel') loadApc();
    if (eng === 'minedub' || eng === 'maternelle' || eng === 'officiel') loadMat();
    if (eng === 'minedub' || eng === 'apc_primaire' || eng === 'officiel') loadPrim();
  }, [school?.bulletin_engine, loadSc, loadApc, loadMat, loadPrim]);

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
        // Les DEUX enseignants principaux : la carte et le tableau doivent
        // montrer ce que porteront les documents (src/lib/headTeachers.js).
        teacherName:  headTeacherText(cls, teachers) || null,
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
    // `bilingue` vient de la modale et n'est PAS une colonne de `classes` : il
    // décide seulement si l'on pose, en plus, le programme de l'autre
    // sous-système juste après la création.
    const { bilingue, ...data } = form;
    if (editing) {
      await updateClass(editing.id, data);
      setEditing((prev) => ({ ...prev, ...data }));
    } else {
      const created = await addClass(data);
      if (bilingue && created) {
        await completerClasseBilingue(created, { sibling: defaultSiblingClass(created, classes) });
      }
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

  // Rattrapage : (re)crée automatiquement les matières d'une classe — officielle
  // (MINESEC/APC/MINEDUB) ou classique (tronc commun FR/EN).
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
            onSaveAnother={async (form) => {
              const { bilingue, ...data } = form;
              const cree = await addClass(data);
              if (bilingue && cree) {
                await completerClasseBilingue(cree, { sibling: defaultSiblingClass(cree, classes) });
              }
            }}
            onClose={() => setShowForm(false)}
          />
        )}

        {/* Modal édition classe */}
        {editing && (
          <Modal title={`${t('Modifier', 'Edit')} — ${editing.name}`} onClose={() => setEditing(null)} size="2xl">
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
                      // Officiel (MINESEC/APC/MINEDUB) OU classique FR/EN (tronc
                      // commun). Masqué seulement pour le classique ES (Guinée Éq.,
                      // système propre → pas de tronc commun classique).
                      resolveClassEngine(school, cls) === 'classic' && (cls.system || 'FR') === 'ES'
                        ? undefined
                        : () => handleConfigureSubjects(cls)
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
