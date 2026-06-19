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

export default function Login() {
  const t        = useT();
  const navigate = useNavigate();
  const session  = useAuthStore((s) => s.session);
  const loading  = useAuthStore((s) => s.loading);

  const [email,       setEmail]       = useState('');
  const [password,    setPassword]    = useState('');
  const [showPass,    setShowPass]    = useState(false);
  const [message,     setMessage]     = useState(null);
  const [submitting,  setSubmitting]  = useState(false);
  const [unverified,  setUnverified]  = useState(false);
  const [resending,   setResending]   = useState(false);

  if (!loading && session) {
    return <Navigate to="/app" replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage(null);
    setSubmitting(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
      navigate('/app');
    } catch (err) {
      let msg = err.message || t('Erreur de connexion', 'Login error');
      if (msg.includes('Invalid login credentials')) msg = t('Email ou mot de passe incorrect.', 'Incorrect email or password.');
      if (msg.toLowerCase().includes('email not confirmed')) {
        setUnverified(true);
        setMessage(null);
      } else {
        setMessage({ type: 'error', text: msg });
      }
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page relative min-h-screen flex items-center justify-center p-4 overflow-hidden bg-gradient-to-br from-terracotta-700 via-terracotta-600 to-ocre-600">
      {/* Décor chaleureux */}
      <div className="absolute -top-24 -left-24 w-96 h-96 bg-ocre-300/30 rounded-full blur-3xl" aria-hidden="true" />
      <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-terracotta-400/40 rounded-full blur-3xl" aria-hidden="true" />
      <div className="absolute inset-0 opacity-[0.06]" aria-hidden="true"
        style={{ backgroundImage: 'radial-gradient(white 1.5px,transparent 1.5px)', backgroundSize: '28px 28px' }} />

      <div className="relative w-full max-w-[400px]">
        {/* Retour à l'accueil */}
        <Link to="/" className="inline-flex items-center gap-1.5 text-white/85 hover:text-white text-sm font-medium mb-4 transition-colors">
          <span aria-hidden="true">←</span> {t("Retour à l'accueil", 'Back to home')}
        </Link>

        {/* Card */}
        <div className="bg-white rounded-3xl shadow-card-xl p-8">

          {/* Logo mark */}
          <div className="mb-6">
            <LogoMark size={44} className="mb-5" />
            <h1 className="text-2xl font-bold text-slate-900 leading-tight">{t('Bienvenue', 'Welcome')}</h1>
            <p className="text-slate-500 text-sm mt-1">{t('Connectez-vous à votre espace NotesCam', 'Sign in to your NotesCam account')}</p>
          </div>

          {/* Email non confirmé */}
          {unverified && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-5">
              <p className="text-sm text-amber-800 font-semibold mb-1">
                {t('Email non confirmé', 'Email not confirmed')}
              </p>
              <p className="text-xs text-amber-700 mb-3">
                {t(
                  'Vérifiez votre boîte mail et cliquez sur le lien de confirmation.',
                  'Check your inbox and click the confirmation link.'
                )}
              </p>
              <button
                type="button"
                disabled={resending}
                onClick={async () => {
                  if (!email) return;
                  setResending(true);
                  await supabase.auth.resend({ type: 'signup', email: email.trim() });
                  setResending(false);
                  setUnverified(false);
                  setMessage({ type: 'success', text: t('Email renvoyé !', 'Email resent!') });
                }}
                className="text-xs font-semibold text-amber-700 hover:text-amber-900 underline disabled:opacity-50"
              >
                {resending
                  ? t('Envoi…', 'Sending…')
                  : t("Renvoyer l'email de confirmation", 'Resend confirmation email')}
              </button>
            </div>
          )}

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

          {/* Formulaire */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="form-label" htmlFor="email">{t('Adresse email', 'Email address')}</label>
              <input
                id="email"
                type="email"
                required
                autoFocus
                className="form-input"
                placeholder="admin@ecole.cm"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="form-label mb-0" htmlFor="password">{t('Mot de passe', 'Password')}</label>
                <Link to="/forgot-password" className="text-xs text-terracotta-600 hover:text-terracotta-700 font-medium transition-colors">
                  {t('Oublié ?', 'Forgot?')}
                </Link>
              </div>
              <div className="relative">
                <input
                  id="password"
                  type={showPass ? 'text' : 'password'}
                  required
                  className="form-input pr-10"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
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

            <button type="submit" disabled={submitting}
              className="w-full mt-2 py-3 px-5 bg-terracotta-500 hover:bg-terracotta-600 active:bg-terracotta-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm rounded-xl transition-all duration-150 shadow-lg shadow-terracotta-500/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta-500 focus-visible:ring-offset-2">
              {submitting
                ? <span className="flex items-center justify-center gap-2">
                    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    {t('Connexion…', 'Signing in…')}
                  </span>
                : t('Se connecter', 'Sign in')
              }
            </button>
          </form>

          {/* Liens */}
          <div className="mt-6 pt-5 border-t border-slate-100 space-y-2 text-center">
            <p className="text-sm text-slate-500">
              {t('Pas de compte ?', 'No account?')}{' '}
              <Link to="/signup" className="text-terracotta-600 font-semibold hover:text-terracotta-700 transition-colors">
                {t('Créer un établissement', 'Create a school')}
              </Link>
            </p>
            <p className="text-sm text-slate-500">
              {t('Enseignant ?', 'Teacher?')}{' '}
              <Link to="/teacher-signup" className="text-terracotta-600 font-semibold hover:text-terracotta-700 transition-colors">
                {t('Rejoindre un établissement', 'Join a school')}
              </Link>
            </p>
            <p className="text-xs text-slate-400 pt-1">
              <Link to="/terms" className="hover:text-slate-600 transition-colors">
                {t("Conditions d'utilisation", 'Terms of use')}
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
