import { useState } from 'react';
import { Link, useNavigate, Navigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import { useT } from '../lib/i18n';
import LogoMark from '../components/LogoMark';

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

const REGIONS = [
  'Adamaoua','Centre','Est','Extrême-Nord','Littoral',
  'Nord','Nord-Ouest','Ouest','Sud','Sud-Ouest',
];

function Step({ n, label, active, done }) {
  return (
    <div className={`flex items-center gap-2 text-xs font-semibold ${
      done ? 'text-brand-600' : active ? 'text-slate-800' : 'text-slate-400'
    }`}>
      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
        done ? 'bg-brand-500 text-white' : active ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-400'
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
    { value: 'Public',               label: t('Public', 'Public') },
    { value: 'Privé laïc',           label: t('Privé laïc', 'Secular private') },
    { value: 'Privé confessionnel',  label: t('Privé confessionnel', 'Faith-based private') },
  ];

  const LANGUAGES = [
    { value: 'francophone', label: t('Francophone (Séquences — notes /20)', 'Francophone (Sequences — grades /20)') },
    { value: 'anglophone',  label: t('Anglophone (Terms — notes /100)', 'Anglophone (Terms — grades /100)') },
    { value: 'bilingue',    label: t('Bilingue (Francophone + Anglophone)', 'Bilingual (Francophone + Anglophone)') },
  ];

  const [form, setForm] = useState({
    schoolName: '', schoolType: '', region: '', language: '', director: '',
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
      const { error: rpcError } = await supabase.rpc('signup_school_and_admin', {
        p_school_name:  form.schoolName.trim(),
        p_school_type:  form.schoolType,
        p_region:       form.region,
        p_director:     form.director.trim(),
        p_email:        form.email.trim(),
        p_academic_year: `${currentYear}-${currentYear + 1}`,
        p_full_name:    form.fullName.trim(),
        p_language:     form.language || 'francophone',
      });
      if (rpcError) {
        useAuthStore.setState({ _pendingSignup: false });
        await supabase.auth.signOut();
        throw rpcError;
      }

      useAuthStore.setState({ _pendingSignup: false });
      await useAuthStore.getState().init();
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

  const step1Done = form.schoolName && form.schoolType && form.region && form.language && form.director;

  return (
    <div className="min-h-screen flex items-center justify-center p-4 py-10"
      style={{ background: 'linear-gradient(135deg, #312e81 0%, #5568d3 50%, #764ba2 100%)' }}>

      <div className="w-full max-w-[480px]">
        <div className="bg-white rounded-2xl shadow-card-xl p-8">

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
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">{t("L'établissement", 'The school')}</p>

              <div>
                <label className="form-label">{t("Nom de l'établissement *", 'School name *')}</label>
                <input type="text" required className="form-input" placeholder={t('Ex: Collège Vogt', 'E.g. Vogt College')}
                  value={form.schoolName} onChange={update('schoolName')} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">{t('Type *', 'Type *')}</label>
                  <select required className="form-input" value={form.schoolType} onChange={update('schoolType')}>
                    <option value="">{t('Choisir…', 'Choose…')}</option>
                    {SCHOOL_TYPES.map((st) => <option key={st.value} value={st.value}>{st.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="form-label">{t('Région *', 'Region *')}</label>
                  <select required className="form-input" value={form.region} onChange={update('region')}>
                    <option value="">{t('Choisir…', 'Choose…')}</option>
                    {REGIONS.map((r) => <option key={r}>{r}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="form-label">{t("Système d'enseignement *", 'Teaching system *')}</label>
                <select required className="form-input" value={form.language} onChange={update('language')}>
                  <option value="">{t('Choisir…', 'Choose…')}</option>
                  {LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                </select>
              </div>

              <div>
                <label className="form-label">{t('Directeur / Proviseur *', 'Principal / Head teacher *')}</label>
                <input type="text" required className="form-input" placeholder={t('Ex: M. NGUEMA Paul', 'E.g. Mr. NGUEMA Paul')}
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

            <button type="submit" disabled={submitting} className="btn-primary mt-2">
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
            <Link to="/login" className="text-brand-600 font-semibold hover:text-brand-700 transition-colors">
              {t('Se connecter', 'Sign in')}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
