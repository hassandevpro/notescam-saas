import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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

export default function TeacherSignup() {
  const navigate  = useNavigate();
  const t         = useT();
  const session   = useAuthStore((s) => s.session);
  const loading   = useAuthStore((s) => s.loading);

  const [form, setForm] = useState({
    schoolCode: '',
    fullName:   '',
    email:      '',
    password:   '',
  });
  const [showPass,    setShowPass]    = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirm,     setConfirm]     = useState('');
  const [message,     setMessage]     = useState(null);
  const [submitting,  setSubmitting]  = useState(false);

  if (!loading && session) {
    navigate('/app', { replace: true });
    return null;
  }

  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

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

      // 1. Création du compte Supabase Auth
      // Si l'email existe déjà (auth créé mais school_users manquant), on se connecte directement
      let userId;
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email:    form.email.trim(),
        password: form.password,
      });

      if (signUpError) {
        const alreadyExists = signUpError.message?.includes('already registered')
          || signUpError.message?.includes('User already registered');

        if (!alreadyExists) throw signUpError;

        // Compte auth existant sans school_users — on se connecte pour compléter
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email:    form.email.trim(),
          password: form.password,
        });
        if (signInError) throw new Error(t('Email déjà utilisé et mot de passe incorrect. Connectez-vous depuis la page de connexion.', 'Email already in use and password is incorrect. Sign in from the login page.'));
        const { data: { user } } = await supabase.auth.getUser();
        userId = user?.id;
      } else {
        if (!signUpData.user) throw new Error(t('Création du compte échouée', 'Account creation failed'));
        userId = signUpData.user.id;
      }

      // 2. RPC : lier le compte à l'école
      const { error: rpcError } = await supabase.rpc('signup_teacher', {
        p_school_code: form.schoolCode.trim().toLowerCase(),
        p_full_name:   form.fullName.trim(),
      });
      if (rpcError) {
        useAuthStore.setState({ _pendingSignup: false });
        // Si "already linked", le compte est déjà correct — juste se connecter
        if (!rpcError.message?.includes('already linked')) {
          await supabase.auth.signOut();
        }
        throw rpcError;
      }

      useAuthStore.setState({ _pendingSignup: false });
      await useAuthStore.getState().init();
      setMessage({ type: 'success', text: t('Compte configuré ! Redirection…', 'Account set up! Redirecting…') });
      setTimeout(() => navigate('/app'), 800);
    } catch (err) {
      useAuthStore.setState({ _pendingSignup: false });
      console.error(err);
      let msg = err.message || t('Erreur lors de la création du compte', 'Error creating account');
      if (msg.includes('already linked')) {
        msg = t('Ce compte est déjà lié à un établissement. Connectez-vous.', 'This account is already linked to a school. Sign in instead.');
      } else if (msg.includes('invalide') || msg.includes('invalid')) {
        msg = t('Code établissement invalide. Vérifiez le code fourni par votre directeur.', 'Invalid school code. Check the code provided by your principal.');
      }
      setMessage({ type: 'error', text: msg });
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center p-5">
      <div className="bg-white rounded-2xl p-10 w-full max-w-md shadow-2xl">
        <div className="flex items-center gap-3 mb-5">
          <LogoMark size={44} />
          <div>
            <p className="text-xl font-bold text-gray-900 leading-tight">NotesCam</p>
            <p className="text-xs text-gray-400">Espace enseignant</p>
          </div>
        </div>
        <h1 className="sr-only">NotesCam</h1>
        <p className="text-gray-500 mb-6 text-sm">{t('Espace enseignant — créez votre compte', 'Teacher portal — create your account')}</p>

        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-sm text-blue-700 mb-6">
          <p className="font-semibold mb-1">{t('Comment trouver le code établissement ?', 'How to find the school code?')}</p>
          <p className="text-xs leading-relaxed">
            {t(
              'Demandez le code à votre directeur ou administrateur. Il le trouve dans',
              'Ask your principal or administrator. They can find it in',
            )}{' '}
            <strong>{t('Paramètres → Code établissement', 'Settings → School code')}</strong> {t('(8 caractères).', '(8 characters).')}
          </p>
        </div>

        {message && (
          <div
            className={`p-3 rounded-lg mb-4 text-sm ${
              message.type === 'error'
                ? 'bg-red-50 text-red-700 border border-red-300'
                : 'bg-green-50 text-green-700 border border-green-300'
            }`}
          >
            {message.text}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="form-label">{t('Code établissement *', 'School code *')}</label>
            <input
              type="text"
              required
              maxLength={8}
              className="form-input font-mono tracking-widest uppercase"
              placeholder="ABCD1234"
              value={form.schoolCode}
              onChange={(e) => setForm((f) => ({ ...f, schoolCode: e.target.value.toUpperCase() }))}
            />
          </div>

          <div>
            <label className="form-label">{t('Votre nom complet *', 'Your full name *')}</label>
            <input
              type="text"
              required
              className="form-input"
              placeholder={t('Ex : Mme NKOA Céleste', 'E.g. Mrs NKOA Céleste')}
              value={form.fullName}
              onChange={update('fullName')}
            />
          </div>

          <div>
            <label className="form-label">Email *</label>
            <input
              type="email"
              required
              className="form-input"
              placeholder="prof@ecole.cm"
              value={form.email}
              onChange={update('email')}
            />
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

          <button type="submit" disabled={submitting} className="btn-primary mt-4">
            {submitting ? t('Création en cours…', 'Creating…') : t('Rejoindre mon établissement', 'Join my school')}
          </button>
        </form>

        <div className="text-center mt-6 text-sm text-gray-500 space-y-1.5">
          <div>
            {t('Déjà un compte ?', 'Already have an account?')}{' '}
            <Link to="/login" className="text-brand-500 font-semibold hover:underline">
              {t('Se connecter', 'Sign in')}
            </Link>
          </div>
          <div>
            {t('Directeur ou administrateur ?', 'Principal or administrator?')}{' '}
            <Link to="/signup" className="text-brand-500 font-semibold hover:underline">
              {t('Créer un établissement', 'Create a school')}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
