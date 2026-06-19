import { useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { useSchoolStore } from '../store/schoolStore';
import { supabase } from '../lib/supabase';
import { useT } from '../lib/i18n';
import { useCountry, defaultSystemForCountry } from '../lib/useCountry';
import LogoMark from './LogoMark';
import { uuid } from '../lib/uuid';
import { copyText } from '../lib/clipboard';

// ── Subject presets ───────────────────────────────────────────────────────────

const PRESETS = {
  // Cameroun Francophone
  secondaire_FR: [
    'Français', 'Anglais', 'Mathématiques', 'Sciences Physiques',
    'SVT', 'Histoire-Géographie', 'Éducation Civique', 'Philosophie',
    'Informatique', 'EPS',
  ],
  // Cameroun Anglophone
  secondaire_EN: [
    'English Language', 'French Language', 'Mathematics', 'Physics & Chemistry',
    'Biology', 'History & Geography', 'Civic Education', 'Literature',
    'Computer Science', 'Physical Education',
  ],
  primaire_FR: [
    'Français', 'Mathématiques', 'Sciences', 'Histoire-Géographie',
    'EPS', 'Anglais', 'Éducation Morale',
  ],
  primaire_EN: [
    'English Language', 'French Language', 'Mathematics', 'General Science',
    'History & Geography', 'Physical Education', 'Religious Studies',
  ],
  maternelle_FR: [
    'Psychomotricité', 'Langage oral', 'Expression artistique',
    'Développement cognitif', 'Éveil scientifique',
  ],
  maternelle_EN: [
    'Motor Skills', 'Oral Language', 'Arts & Crafts',
    'Cognitive Development', 'Science Exploration',
  ],
  // Guinea Ecuatorial — système ES, terminologie MEC.
  secondaire_ES: [
    'Lengua Española', 'Inglés', 'Francés', 'Matemáticas', 'Física y Química',
    'Biología y Geología', 'Historia', 'Geografía',
    'Educación para la Ciudadanía', 'Filosofía', 'Educación Física',
  ],
  primaire_ES: [
    'Lengua Española', 'Matemáticas', 'Ciencias Naturales',
    'Historia y Geografía', 'Educación Física', 'Inglés', 'Religión',
  ],
  maternelle_ES: [
    'Lenguaje Oral', 'Psicomotricidad', 'Educación Artística',
    'Desarrollo Cognitivo', 'Descubrimiento del Entorno',
  ],
};

function getPreset(cycle, system) {
  const key = `${cycle}_${system}`;
  if (PRESETS[key]) return PRESETS[key];
  // Fallback : système ES retombe sur ES si cycle inconnu, sinon FR.
  if (system === 'ES') return PRESETS[`${cycle}_ES`] || PRESETS.secondaire_ES;
  return PRESETS[`${cycle}_FR`] || [];
}

// ── Niveau options ────────────────────────────────────────────────────────────

const LEVELS = {
  // Cameroun
  secondaire_FR: ['6ème', '5ème', '4ème', '3ème', '2nde', '1ère A', '1ère C', '1ère D', 'Terminale A', 'Terminale C', 'Terminale D'],
  secondaire_EN: ['Form 1', 'Form 2', 'Form 3', 'Form 4', 'Form 5', 'Lower Sixth', 'Upper Sixth'],
  primaire_FR:   ['SIL', 'CP', 'CE1', 'CE2', 'CM1', 'CM2'],
  primaire_EN:   ['Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5', 'Class 6'],
  maternelle_FR: ['Toute Petite Section', 'Petite Section', 'Moyenne Section', 'Grande Section'],
  maternelle_EN: ['Nursery 1', 'Nursery 2', 'Kindergarten 1', 'Kindergarten 2'],
  // Guinea Ecuatorial — niveles oficiales MEC.
  secondaire_ES: ['1º ESBA', '2º ESBA', '3º ESBA', '4º ESBA', '1º Bachillerato', '2º Bachillerato'],
  primaire_ES:   ['1º Primaria', '2º Primaria', '3º Primaria', '4º Primaria', '5º Primaria', '6º Primaria'],
  maternelle_ES: ['Inicial 1', 'Inicial 2', 'Inicial 3'],
};

function getLevels(cycle, system) {
  const key = `${cycle}_${system}`;
  if (LEVELS[key]) return LEVELS[key];
  if (system === 'ES') return LEVELS[`${cycle}_ES`] || LEVELS.secondaire_ES;
  return LEVELS[`${cycle}_FR`] || [];
}

// ── Step indicator ────────────────────────────────────────────────────────────

function Steps({ current, total }) {
  return (
    <div className="flex items-center gap-1.5 mb-8">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`h-1.5 rounded-full transition-all duration-300 ${
            i < current
              ? 'bg-brand-500 flex-[2]'
              : i === current
              ? 'bg-brand-400 flex-[2]'
              : 'bg-gray-200 flex-1'
          }`}
        />
      ))}
    </div>
  );
}

// ── Step 1 — Welcome ─────────────────────────────────────────────────────────

function StepWelcome({ school, onNext, onSkip, t }) {
  return (
    <div className="text-center">
      <div className="flex justify-center mb-5">
        <LogoMark size={56} />
      </div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">
        {t('Bienvenue sur NotesCam !', 'Welcome to NotesCam!', '¡Bienvenido a NotesCam!')}
      </h1>
      <p className="text-gray-500 mb-1 text-sm">
        <span className="font-semibold text-gray-700">{school?.name}</span>
      </p>
      <p className="text-gray-400 text-sm mb-8">
        {t(
          'Configurons votre établissement en 3 étapes rapides — moins de 3 minutes.',
          'Let\'s set up your school in 3 quick steps — under 3 minutes.',
          'Configuremos su centro en 3 pasos rápidos — menos de 3 minutos.',
        )}
      </p>

      <div className="grid grid-cols-3 gap-3 mb-8 text-center">
        {[
          { emoji: '🏫', label: t('1 classe', '1 class', '1 clase') },
          { emoji: '📚', label: t('Vos matières', 'Your subjects', 'Sus asignaturas') },
          { emoji: '👨‍🏫', label: t('Code enseignants', 'Teacher code', 'Código de profesores') },
        ].map(({ emoji, label }) => (
          <div key={label} className="bg-gray-50 rounded-xl p-4">
            <div className="text-2xl mb-1">{emoji}</div>
            <div className="text-xs font-semibold text-gray-600">{label}</div>
          </div>
        ))}
      </div>

      <button onClick={onNext} className="btn-primary w-full mb-3">
        {t('Commencer la configuration →', 'Start setup →', 'Comenzar la configuración →')}
      </button>
      <button onClick={onSkip} className="text-sm text-gray-400 hover:text-gray-600 transition-colors">
        {t('Ignorer — je configurerai plus tard', 'Skip — I\'ll set up later', 'Omitir — lo configuraré más tarde')}
      </button>
    </div>
  );
}

// ── Step 2 — First class ──────────────────────────────────────────────────────

function StepClass({ school, onNext, onBack, t, country }) {
  const activeYear = school?.current_year || '';
  const isGE       = country.code === 'guinea_eq';
  const defaultSys = defaultSystemForCountry(country.code);

  const [cycle,   setCycle]   = useState('secondaire');
  const [system,  setSystem]  = useState(defaultSys);
  const [level,   setLevel]   = useState('');
  const [suffix,  setSuffix]  = useState('A');
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');

  const levels = getLevels(cycle, system);

  // Labels de cycle adaptés au pays — Preescolar / Primaria / Secundaria pour GE.
  const cycleLabel = (code) => country.cycles.find((c) => c.code === code)?.label || code;

  const handleNext = async () => {
    if (!level) { setError(t('Choisissez un niveau.', 'Pick a level.', 'Elija un nivel.')); return; }
    setError('');
    setSaving(true);
    try {
      const name = suffix.trim() ? `${level} ${suffix.trim()}` : level;
      const record = {
        id: uuid(),
        school_id: school.id,
        name, level, cycle, system,
        current_year: activeYear,
        teacher_id: null,
        max_students: null,
      };
      const { data, error: sbErr } = await supabase
        .from('classes')
        .insert(record)
        .select()
        .single();
      if (sbErr) throw sbErr;
      useSchoolStore.setState((s) => ({ classes: [...s.classes, data] }));
      onNext(data);
    } catch (err) {
      setError(err.message || t('Erreur lors de la création.', 'Error creating class.', 'Error al crear la clase.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900 mb-1">
        {t('Créez votre première classe', 'Create your first class', 'Cree su primera clase')}
      </h2>
      <p className="text-gray-400 text-sm mb-6">
        {t('Vous pourrez en ajouter d\'autres depuis la page Classes.', 'You can add more later from the Classes page.', 'Podrá añadir más desde la página Clases.')}
      </p>

      {/* Cycle — labels propres au pays (Preescolar/Primaria/Secundaria pour GE) */}
      <div className="mb-4">
        <label className="form-label">{t('Cycle *', 'Cycle *', 'Ciclo *')}</label>
        <div className="flex gap-2">
          {['secondaire', 'primaire', 'maternelle'].map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => { setCycle(v); setLevel(''); }}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold border-2 transition-colors ${
                cycle === v
                  ? 'border-brand-500 bg-brand-50 text-brand-700'
                  : 'border-gray-200 text-gray-500 hover:border-gray-300'
              }`}
            >
              {cycleLabel(v)}
            </button>
          ))}
        </div>
      </div>

      {/* Système — masqué pour Guinea Ecuatorial (forcé sur ES /10) */}
      {!isGE && (
        <div className="mb-4">
          <label className="form-label">{t('Système *', 'System *', 'Sistema *')}</label>
          <div className="flex gap-2">
            {[
              { v: 'FR', label: '🇫🇷 Francophone' },
              { v: 'EN', label: '🇬🇧 Anglophone' },
            ].map(({ v, label }) => (
              <button
                key={v}
                type="button"
                onClick={() => { setSystem(v); setLevel(''); }}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold border-2 transition-colors ${
                  system === v
                    ? 'border-brand-500 bg-brand-50 text-brand-700'
                    : 'border-gray-200 text-gray-500 hover:border-gray-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Level */}
      <div className="mb-4">
        <label className="form-label">{t('Niveau *', 'Level *', 'Nivel *')}</label>
        <select
          className="form-input"
          value={level}
          onChange={(e) => setLevel(e.target.value)}
        >
          <option value="">— {t('Choisir', 'Select', 'Elegir')} —</option>
          {levels.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
      </div>

      {/* Section/letter */}
      <div className="mb-6">
        <label className="form-label">{t('Section (optionnel)', 'Section (optional)', 'Sección (opcional)')}</label>
        <input
          type="text"
          maxLength={4}
          className="form-input"
          placeholder={t('Ex : A, B, C…', 'E.g. A, B, C…', 'Ej.: A, B, C…')}
          value={suffix}
          onChange={(e) => setSuffix(e.target.value)}
        />
        {level && (
          <p className="text-xs text-gray-400 mt-1">
            {t('Nom de la classe :', 'Class name:', 'Nombre de la clase:')} <strong>{suffix.trim() ? `${level} ${suffix.trim()}` : level}</strong>
          </p>
        )}
      </div>

      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

      <div className="flex gap-3">
        <button type="button" onClick={onBack} className="btn-secondary flex-1">
          ← {t('Retour', 'Back', 'Atrás')}
        </button>
        <button type="button" onClick={handleNext} disabled={saving} className="btn-primary flex-1">
          {saving ? t('Création…', 'Creating…', 'Creando…') : t('Suivant →', 'Next →', 'Siguiente →')}
        </button>
      </div>
    </div>
  );
}

// ── Step 3 — Subjects ─────────────────────────────────────────────────────────

function StepSubjects({ cls, onNext, onBack, t }) {
  const preset     = getPreset(cls.cycle, cls.system);
  const defaultMax =
    cls.system === 'EN' ? 100
    : cls.system === 'ES' ? 10
    : 20;

  const [selected,  setSelected]  = useState(new Set(preset.slice(0, 6)));
  const [custom,    setCustom]    = useState('');
  const [extras,    setExtras]    = useState([]);
  const [saving,    setSaving]    = useState(false);
  const [saveError, setSaveError] = useState('');

  const toggle = (name) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(name)) next.delete(name); else next.add(name);
    return next;
  });

  const addExtra = () => {
    const name = custom.trim();
    if (!name || extras.includes(name) || preset.includes(name)) return;
    setExtras((p) => [...p, name]);
    setSelected((p) => { const n = new Set(p); n.add(name); return n; });
    setCustom('');
  };

  const handleNext = async () => {
    if (selected.size === 0) { onNext(); return; }
    setSaveError('');
    setSaving(true);
    try {
      const allNames = [...preset, ...extras].filter((n) => selected.has(n));
      const records = allNames.map((name) => ({
        id: uuid(),
        school_id: cls.school_id,
        class_id: cls.id,
        name, coef: 2, max: defaultMax,
        teacher_id: null,
        category_id: null,
      }));
      const { error: sbErr } = await supabase.from('subjects').insert(records);
      if (sbErr) throw sbErr;
      useSchoolStore.setState((s) => ({ subjects: [...s.subjects, ...records] }));
      onNext();
    } catch (err) {
      setSaveError(err.message || t('Erreur lors de l\'ajout des matières.', 'Error adding subjects.', 'Error al añadir las asignaturas.'));
    } finally {
      setSaving(false);
    }
  };

  const allSubjects = [...preset, ...extras];

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900 mb-1">
        {t('Ajoutez vos matières', 'Add your subjects', 'Añada sus asignaturas')}
      </h2>
      <p className="text-gray-400 text-sm mb-1">
        {t('Pour la classe', 'For class', 'Para la clase')} <strong>{cls.name}</strong>
      </p>
      <p className="text-gray-400 text-sm mb-5">
        {t(`${selected.size} sélectionnée${selected.size > 1 ? 's' : ''}`, `${selected.size} selected`, `${selected.size} seleccionada${selected.size > 1 ? 's' : ''}`)}
      </p>

      <div className="flex flex-wrap gap-2 mb-5">
        {allSubjects.map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => toggle(name)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium border-2 transition-all ${
              selected.has(name)
                ? 'border-brand-500 bg-brand-50 text-brand-700'
                : 'border-gray-200 text-gray-500 hover:border-gray-300'
            }`}
          >
            {selected.has(name) && <span className="mr-1">✓</span>}
            {name}
          </button>
        ))}
      </div>

      {/* Ajout custom */}
      <div className="flex gap-2 mb-6">
        <input
          type="text"
          className="form-input flex-1"
          placeholder={t('Ajouter une matière…', 'Add a subject…', 'Añadir una asignatura…')}
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addExtra())}
        />
        <button
          type="button"
          onClick={addExtra}
          disabled={!custom.trim()}
          className="px-4 py-2 rounded-xl bg-gray-100 text-gray-700 text-sm font-semibold hover:bg-gray-200 disabled:opacity-40 transition-colors"
        >
          +
        </button>
      </div>

      {saveError && <p className="text-red-600 text-sm mb-4">{saveError}</p>}

      <div className="flex gap-3">
        <button type="button" onClick={onBack} className="btn-secondary flex-1">
          ← {t('Retour', 'Back', 'Atrás')}
        </button>
        <button type="button" onClick={handleNext} disabled={saving} className="btn-primary flex-1">
          {saving
            ? t('Ajout des matières…', 'Adding subjects…', 'Añadiendo asignaturas…')
            : selected.size === 0
            ? t('Ignorer →', 'Skip →', 'Omitir →')
            : t('Suivant →', 'Next →', 'Siguiente →')}
        </button>
      </div>
    </div>
  );
}

// ── Step 4 — School code ──────────────────────────────────────────────────────

function StepCode({ school, onNext, onBack, t }) {
  const code = school?.id?.slice(0, 8).toUpperCase() || '—';
  const [copied, setCopied] = useState(false);

  const copy = () => {
    copyText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const waText = encodeURIComponent(
    t(
      `Rejoignez notre établissement sur NotesCam !\n\nCode : ${code}\nInscription : ${window.location.origin}/teacher-signup`,
      `Join our school on NotesCam!\n\nCode: ${code}\nSign up: ${window.location.origin}/teacher-signup`,
      `¡Únase a nuestro centro en NotesCam!\n\nCódigo: ${code}\nRegistro: ${window.location.origin}/teacher-signup`,
    )
  );
  const waLink = `https://wa.me/?text=${waText}`;

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900 mb-1">
        {t('Votre code établissement', 'Your school code', 'Su código de centro')}
      </h2>
      <p className="text-gray-400 text-sm mb-6">
        {t(
          'Partagez ce code à vos enseignants pour qu\'ils rejoignent l\'établissement.',
          'Share this code with your teachers so they can join the school.',
          'Comparta este código con sus profesores para que se unan al centro.',
        )}
      </p>

      <div className="flex items-center justify-between bg-gray-50 border-2 border-dashed border-gray-200 rounded-2xl p-5 mb-4">
        <span className="font-mono text-3xl font-black text-brand-600 tracking-widest">{code}</span>
        <button
          onClick={copy}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold border transition-colors ${
            copied
              ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
              : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
          }`}
        >
          {copied ? (
            <><svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg>{t('Copié !', 'Copied!', '¡Copiado!')}</>
          ) : (
            <><svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>{t('Copier', 'Copy', 'Copiar')}</>
          )}
        </button>
      </div>

      <a
        href={waLink}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-green-500 hover:bg-green-600 text-white font-semibold text-sm transition-colors mb-6"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
        </svg>
        {t('Envoyer le code par WhatsApp', 'Share code via WhatsApp', 'Enviar el código por WhatsApp')}
      </a>

      <p className="text-xs text-gray-400 text-center mb-6">
        {t('Vos enseignants s\'inscrivent sur', 'Teachers sign up at', 'Sus profesores se registran en')}{' '}
        <span className="font-mono text-gray-500">/teacher-signup</span>
        {t(' avec ce code.', ' with this code.', ' con este código.')}
      </p>

      <div className="flex gap-3">
        <button type="button" onClick={onBack} className="btn-secondary flex-1">
          ← {t('Retour', 'Back', 'Atrás')}
        </button>
        <button type="button" onClick={onNext} className="btn-primary flex-1">
          {t('Terminer →', 'Finish →', 'Finalizar →')}
        </button>
      </div>
    </div>
  );
}

// ── Step 5 — Done ─────────────────────────────────────────────────────────────

function StepDone({ classes, subjects, onClose, t }) {
  return (
    <div className="text-center">
      <div className="text-6xl mb-4">🎉</div>
      <h2 className="text-2xl font-bold text-gray-900 mb-2">
        {t('Votre école est prête !', 'Your school is ready!', '¡Su centro está listo!')}
      </h2>
      <p className="text-gray-500 text-sm mb-8">
        {t(
          `${classes.length} classe${classes.length > 1 ? 's' : ''} · ${subjects.length} matière${subjects.length > 1 ? 's' : ''} configurée${subjects.length > 1 ? 's' : ''}.`,
          `${classes.length} class${classes.length > 1 ? 'es' : ''} · ${subjects.length} subject${subjects.length > 1 ? 's' : ''} configured.`,
          `${classes.length} clase${classes.length > 1 ? 's' : ''} · ${subjects.length} asignatura${subjects.length > 1 ? 's' : ''} configurada${subjects.length > 1 ? 's' : ''}.`,
        )}
      </p>

      <div className="grid grid-cols-2 gap-3 mb-8 text-left">
        {[
          { emoji: '👤', label: t('Ajouter des élèves', 'Add students', 'Añadir alumnos'), href: '/app/students' },
          { emoji: '✏️', label: t('Saisir des notes', 'Enter grades', 'Introducir notas'), href: '/app/grades' },
          { emoji: '📄', label: t('Générer des bulletins', 'Generate report cards', 'Generar boletines'), href: '/app/bulletins' },
          { emoji: '💰', label: t('Suivi des frais', 'Track fees', 'Seguimiento de cuotas'), href: '/app/fees' },
        ].map(({ emoji, label, href }) => (
          <a
            key={href}
            href={href}
            onClick={onClose}
            className="flex items-center gap-2.5 bg-gray-50 hover:bg-brand-50 border border-gray-100 hover:border-brand-200 rounded-xl p-3 text-sm font-medium text-gray-700 hover:text-brand-700 transition-colors"
          >
            <span className="text-lg">{emoji}</span>
            <span>{label}</span>
          </a>
        ))}
      </div>

      <button onClick={onClose} className="btn-primary w-full">
        {t('Accéder au tableau de bord', 'Go to dashboard', 'Ir al panel')}
      </button>
    </div>
  );
}

// ── Main wizard ───────────────────────────────────────────────────────────────

const TOTAL_STEPS = 5;

export default function OnboardingWizard({ onClose }) {
  const t          = useT();
  const school     = useAuthStore((s) => s.school);
  const country    = useCountry();
  const classes    = useSchoolStore((s) => s.classes);
  const subjects   = useSchoolStore((s) => s.subjects);

  const [step,        setStep]        = useState(0);
  const [createdCls,  setCreatedCls]  = useState(null);

  const nextStep = () => setStep((s) => Math.min(s + 1, TOTAL_STEPS - 1));
  const prevStep = () => setStep((s) => Math.max(s - 1, 0));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="p-8">
          {step > 0 && step < TOTAL_STEPS - 1 && (
            <Steps current={step} total={TOTAL_STEPS - 1} />
          )}

          {step === 0 && (
            <StepWelcome
              school={school}
              onNext={nextStep}
              onSkip={onClose}
              t={t}
            />
          )}
          {step === 1 && (
            <StepClass
              school={school}
              country={country}
              onNext={(cls) => { setCreatedCls(cls); nextStep(); }}
              onBack={prevStep}
              t={t}
            />
          )}
          {step === 2 && createdCls && (
            <StepSubjects
              cls={createdCls}
              onNext={nextStep}
              onBack={prevStep}
              t={t}
            />
          )}
          {step === 3 && (
            <StepCode
              school={school}
              onNext={nextStep}
              onBack={prevStep}
              t={t}
            />
          )}
          {step === 4 && (
            <StepDone
              classes={classes}
              subjects={subjects}
              onClose={onClose}
              t={t}
            />
          )}
        </div>
      </div>
    </div>
  );
}
