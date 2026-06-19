import { useState } from 'react';
import { Link, useNavigate, Navigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import { useUiStore } from '../store/uiStore';
import { useT } from '../lib/i18n';
import LogoMark from '../components/LogoMark';
import { COUNTRY_OPTIONS, defaultLangForCountry } from '../countries';

function EyeIcon({ open }) {
  return open ? (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
    </svg>
  ) : (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  );
}

const REGIONS_CM = [
  'Adamaoua','Centre','Est','Extrême-Nord','Littoral',
  'Nord','Nord-Ouest','Ouest','Sud','Sud-Ouest',
];

// Provincias de Guinea Ecuatorial.
const REGIONS_GQ = [
  'Bioko Norte','Bioko Sur','Centro Sur','Kié-Ntem',
  'Litoral','Wele-Nzas','Annobón','Djibloho',
];

function regionsForCountry(country) {
  if (country === 'guinea_eq') return REGIONS_GQ;
  return REGIONS_CM;
}

// Mappe le système éducatif vers la valeur de `language` côté backend
// (compatibilité avec l'ancien schéma — la RPC ne connaît pas encore guinea_eq).
function languageForCountry(country) {
  if (country === 'cameroon_en') return 'anglophone';
  if (country === 'guinea_eq')   return 'francophone'; // valeur sûre pour RPC héritée
  return 'francophone';
}

function Step({ n, label, active, done }) {
  return (
    <div className={`flex items-center gap-2 text-xs font-semibold ${
      done ? 'text-terracotta-600' : active ? 'text-slate-800' : 'text-slate-400'
    }`}>
      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
        done ? 'bg-terracotta-500 text-white' : active ? 'bg-terracotta-100 text-terracotta-700' : 'bg-slate-100 text-slate-400'
      }`}>
        {done ? '✓' : n}
      </span>
      {label}
    </div>
  );
}

export default function Signup() {
  const navigate = useNavigate();
  const t        = useT();
  const session  = useAuthStore((s) => s.session);
  const loading  = useAuthStore((s) => s.loading);

  const SCHOOL_TYPES = [
    { value: 'Public',               label: t('Public', 'Public', 'Público') },
    { value: 'Privé laïc',           label: t('Privé laïc', 'Secular private', 'Privado laico') },
    { value: 'Privé confessionnel',  label: t('Privé confessionnel', 'Faith-based private', 'Privado confesional') },
  ];

  const [form, setForm] = useState({
    schoolName: '', schoolType: '', region: '',
    countrySystem: '',   // 'cameroon_fr' | 'cameroon_en' | 'guinea_eq'
    director: '',
    fullName: '', email: '', password: '',
  });
  const [showPass,    setShowPass]    = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirm,     setConfirm]     = useState('');
  const [message,     setMessage]     = useState(null);
  const [submitting,  setSubmitting]  = useState(false);

  if (!loading && session) {
    return <Navigate to="/app" replace />;
  }

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const handleCountryChange = (e) => {
    const country = e.target.value;
    setForm((prev) => ({
      ...prev,
      countrySystem: country,
      // si l'utilisateur avait déjà choisi une région d'un autre pays, on la reset
      region: regionsForCountry(country).includes(prev.region) ? prev.region : '',
    }));
    // Bascule la langue de l'interface vers celle du pays choisi
    if (country) useUiStore.getState().setLang(defaultLangForCountry(country));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage(null);
    if (form.password !== confirm) {
      setMessage({ type: 'error', text: t('Les mots de passe ne correspondent pas.', 'Passwords do not match.') });
      return;
    }
    setSubmitting(true);
    try {
      useAuthStore.setState({ _pendingSignup: true });

      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: form.email.trim(),
        password: form.password,
      });
      if (authError) throw authError;
      if (!authData.user) throw new Error(t('Création du compte échouée', 'Account creation failed'));

      const currentYear = new Date().getFullYear();
      const country = form.countrySystem || 'cameroon_fr';
      const { error: rpcError } = await supabase.rpc('signup_school_and_admin', {
        p_school_name:  form.schoolName.trim(),
        p_school_type:  form.schoolType,
        p_region:       form.region,
        p_director:     form.director.trim(),
        p_email:        form.email.trim(),
        p_academic_year: `${currentYear}-${currentYear + 1}`,
        p_full_name:    form.fullName.trim(),
        p_language:     languageForCountry(country),
      });
      if (rpcError) {
        useAuthStore.setState({ _pendingSignup: false });
        await supabase.auth.signOut();
        throw rpcError;
      }

      useAuthStore.setState({ _pendingSignup: false });
      await useAuthStore.getState().init();

      // Persiste le système éducatif sur l'école une fois créée.
      // Si la colonne `country_system` n'existe pas encore en DB, l'erreur est
      // silencieusement ignorée — la valeur reste inférée depuis `language`.
      try {
        await useAuthStore.getState().updateSchool({ country_system: country });
      } catch (_) {
        // colonne manquante → no-op
      }
      // Repli local : on garde la trace pour cette session avant que la DB ne porte la colonne.
      try {
        const sid = useAuthStore.getState().school?.id;
        if (sid) localStorage.setItem(`notescam_country_${sid}`, country);
      } catch (_) {}

      navigate('/verify-email', { state: { email: form.email.trim() } });
    } catch (err) {
      useAuthStore.setState({ _pendingSignup: false });
      let msg = err.message || t('Erreur lors de la création du compte', 'Error creating account');
      if (msg.includes('already linked')) msg = t('Ce compte est déjà lié à un établissement. Connectez-vous.', 'This account is already linked to a school. Sign in instead.');
      else if (msg.includes('already registered') || msg.includes('User already registered')) msg = t('Cet email est déjà utilisé.', 'This email is already in use.');
      setMessage({ type: 'error', text: msg });
      setSubmitting(false);
    }
  };

  const step1Done = form.schoolName && form.schoolType && form.region && form.countrySystem && form.director;

  return (
    <div className="auth-page relative min-h-screen flex items-center justify-center p-4 py-10 overflow-hidden bg-gradient-to-br from-terracotta-700 via-terracotta-600 to-ocre-600">
      {/* Décor chaleureux */}
      <div className="absolute -top-24 -left-24 w-96 h-96 bg-ocre-300/30 rounded-full blur-3xl" aria-hidden="true" />
      <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-terracotta-400/40 rounded-full blur-3xl" aria-hidden="true" />
      <div className="absolute inset-0 opacity-[0.06]" aria-hidden="true"
        style={{ backgroundImage: 'radial-gradient(white 1.5px,transparent 1.5px)', backgroundSize: '28px 28px' }} />

      <div className="relative w-full max-w-[480px]">
        {/* Retour à l'accueil */}
        <Link to="/" className="inline-flex items-center gap-1.5 text-white/85 hover:text-white text-sm font-medium mb-4 transition-colors">
          <span aria-hidden="true">←</span> {t("Retour à l'accueil", 'Back to home', 'Volver al inicio')}
        </Link>

        <div className="bg-white rounded-3xl shadow-card-xl p-8">

          {/* Logo + titre */}
          <div className="flex items-center gap-3 mb-6">
            <LogoMark size={44} className="shrink-0" />
            <div>
              <h1 className="text-xl font-bold text-slate-900 leading-tight">{t('Créer un établissement', 'Create a school')}</h1>
              <p className="text-xs text-slate-500 mt-0.5">{t('Plan Starter gratuit — sans engagement', 'Free Starter plan — no commitment')}</p>
            </div>
          </div>

          {/* Indicateurs d'étape */}
          <div className="flex items-center gap-4 mb-6 px-1">
            <Step n="1" label={t('Établissement', 'School')} active={!step1Done} done={!!step1Done} />
            <div className="flex-1 h-px bg-slate-200" />
            <Step n="2" label={t('Votre compte', 'Your account')} active={!!step1Done} done={false} />
          </div>

          {/* Alerte */}
          {message && (
            <div className={`flex items-start gap-2.5 p-3 rounded-xl text-sm mb-5 ${
              message.type === 'error'
                ? 'bg-red-50 text-red-700 border border-red-200'
                : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
            }`}>
              {message.type === 'error' ? '⚠️' : '✓'} {message.text}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Étape 1 */}
            <div className="space-y-3.5">
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                {t("L'établissement", 'The school', 'El centro')}
              </p>

              <div>
                <label className="form-label">
                  {t('Système éducatif *', 'Educational system *', 'Sistema educativo *')}
                </label>
                <select required className="form-input" value={form.countrySystem} onChange={handleCountryChange}>
                  <option value="">{t('Choisir…', 'Choose…', 'Elegir…')}</option>
                  {COUNTRY_OPTIONS.map((c) => (
                    <option key={c.value} value={c.value}>{c.flag} {c.label}</option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-400 mt-1">
                  {t(
                    "Détermine les classes, le système de notation et la langue des bulletins.",
                    'Determines classes, grading system and report card language.',
                    'Determina los cursos, el sistema de notas y el idioma de los boletines.'
                  )}
                </p>
              </div>

              <div>
                <label className="form-label">
                  {t("Nom de l'établissement *", 'School name *', 'Nombre del centro *')}
                </label>
                <input type="text" required className="form-input"
                  placeholder={t('Ex: Collège Vogt', 'E.g. Vogt College', 'Ej: Colegio Español')}
                  value={form.schoolName} onChange={update('schoolName')} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">{t('Type *', 'Type *', 'Tipo *')}</label>
                  <select required className="form-input" value={form.schoolType} onChange={update('schoolType')}>
                    <option value="">{t('Choisir…', 'Choose…', 'Elegir…')}</option>
                    {SCHOOL_TYPES.map((st) => <option key={st.value} value={st.value}>{st.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="form-label">
                    {form.countrySystem === 'guinea_eq'
                      ? t('Provincia *', 'Province *', 'Provincia *')
                      : t('Région *', 'Region *', 'Región *')}
                  </label>
                  <select required className="form-input" value={form.region} onChange={update('region')}
                    disabled={!form.countrySystem}>
                    <option value="">
                      {form.countrySystem
                        ? t('Choisir…', 'Choose…', 'Elegir…')
                        : t('Choisir d\'abord un système', 'Pick a system first', 'Elegir un sistema primero')}
                    </option>
                    {regionsForCountry(form.countrySystem).map((r) => <option key={r}>{r}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="form-label">
                  {t('Directeur / Proviseur *', 'Principal / Head teacher *', 'Director(a) *')}
                </label>
                <input type="text" required className="form-input"
                  placeholder={t('Ex: M. NGUEMA Paul', 'E.g. Mr. NGUEMA Paul', 'Ej: Sr. NGUEMA Paul')}
                  value={form.director} onChange={update('director')} />
              </div>
            </div>

            {/* Étape 2 */}
            <div className="space-y-3.5 pt-1">
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">{t('Votre compte administrateur', 'Your administrator account')}</p>

              <div>
                <label className="form-label">{t('Nom complet *', 'Full name *')}</label>
                <input type="text" required className="form-input" placeholder={t('Ex: Jean MBARGA', 'E.g. Jean MBARGA')}
                  value={form.fullName} onChange={update('fullName')} />
              </div>

              <div>
                <label className="form-label">Email *</label>
                <input type="email" required className="form-input" placeholder="admin@ecole.cm"
                  value={form.email} onChange={update('email')} />
              </div>

              <div>
                <label className="form-label">{t('Mot de passe (min. 8 caractères) *', 'Password (min. 8 characters) *')}</label>
                <div className="relative">
                  <input
                    type={showPass ? 'text' : 'password'}
                    required
                    minLength={8}
                    className="form-input pr-10"
                    placeholder="••••••••"
                    value={form.password}
                    onChange={update('password')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass((v) => !v)}
                    className="absolute inset-y-0 right-3 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
                    tabIndex={-1}
                    aria-label={showPass ? t('Masquer', 'Hide') : t('Afficher', 'Show')}
                  >
                    <EyeIcon open={showPass} />
                  </button>
                </div>
              </div>

              <div>
                <label className="form-label">{t('Confirmer le mot de passe *', 'Confirm password *')}</label>
                <div className="relative">
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    required
                    minLength={8}
                    className={`form-input pr-10 ${confirm && confirm !== form.password ? 'border-red-400 focus:ring-red-300' : ''}`}
                    placeholder="••••••••"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm((v) => !v)}
                    className="absolute inset-y-0 right-3 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
                    tabIndex={-1}
                    aria-label={showConfirm ? t('Masquer', 'Hide') : t('Afficher', 'Show')}
                  >
                    <EyeIcon open={showConfirm} />
                  </button>
                </div>
                {confirm && confirm !== form.password && (
                  <p className="text-xs text-red-500 mt-1">{t('Les mots de passe ne correspondent pas.', 'Passwords do not match.')}</p>
                )}
              </div>
            </div>

            <button type="submit" disabled={submitting}
              className="w-full mt-2 py-3 px-5 bg-terracotta-500 hover:bg-terracotta-600 active:bg-terracotta-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm rounded-xl transition-all duration-150 shadow-lg shadow-terracotta-500/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta-500 focus-visible:ring-offset-2">
              {submitting
                ? <span className="flex items-center justify-center gap-2">
                    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    {t('Création en cours…', 'Creating…')}
                  </span>
                : t('Créer mon compte gratuitement', 'Create my free account')
              }
            </button>
          </form>

          <div className="mt-5 pt-5 border-t border-slate-100 text-center text-sm text-slate-500">
            {t('Déjà un compte ?', 'Already have an account?')}{' '}
            <Link to="/login" className="text-terracotta-600 font-semibold hover:text-terracotta-700 transition-colors">
              {t('Se connecter', 'Sign in')}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
