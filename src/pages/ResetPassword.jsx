import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useT } from '../lib/i18n';
import LogoMark from '../components/LogoMark';

export default function ResetPassword() {
  const navigate = useNavigate();
  const t        = useT();

  const [ready,      setReady]      = useState(false);  // true once Supabase fires PASSWORD_RECOVERY
  const [password,   setPassword]   = useState('');
  const [confirm,    setConfirm]    = useState('');
  const [message,    setMessage]    = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Supabase fires PASSWORD_RECOVERY when user arrives from the reset email link.
  // The client exchanges the token automatically; we just wait for the event.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setReady(true);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password !== confirm) {
      setMessage({ type: 'error', text: t('Les mots de passe ne correspondent pas.', 'Passwords do not match.') });
      return;
    }
    if (password.length < 8) {
      setMessage({ type: 'error', text: t('Le mot de passe doit contenir au moins 8 caractères.', 'Password must be at least 8 characters.') });
      return;
    }

    setMessage(null);
    setSubmitting(true);

    const { error } = await supabase.auth.updateUser({ password });
    setSubmitting(false);

    if (error) {
      setMessage({ type: 'error', text: error.message });
    } else {
      setMessage({ type: 'success', text: t('Mot de passe mis à jour ! Redirection…', 'Password updated! Redirecting…') });
      setTimeout(() => navigate('/app'), 1500);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center p-5">
      <div className="bg-white rounded-2xl p-10 w-full max-w-md shadow-2xl">
        <LogoMark size={44} className="mb-5" />
        <h1 className="text-2xl font-bold text-gray-900 mb-1">{t('Nouveau mot de passe', 'New password')}</h1>
        <p className="text-gray-500 mb-6 text-sm">
          {t('Choisissez un nouveau mot de passe sécurisé.', 'Choose a new secure password.')}
        </p>

        {!ready && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700">
            {t('Vérification du lien de réinitialisation en cours…', 'Verifying reset link…')}
            <p className="text-xs mt-1 text-amber-600">
              {t(
                'Si cette page reste bloquée, le lien a peut-être expiré. Recommencez depuis',
                'If this page stays stuck, the link may have expired. Start again from',
              )}{' '}
              <a href="/forgot-password" className="underline font-semibold">
                {t('mot de passe oublié', 'forgot password')}
              </a>.
            </p>
          </div>
        )}

        {ready && (
          <>
            {message && (
              <div
                className={`p-3 rounded-lg mb-4 text-sm ${
                  message.type === 'error'
                    ? 'bg-red-50 text-red-700 border border-red-200'
                    : 'bg-green-50 text-green-700 border border-green-200'
                }`}
              >
                {message.text}
              </div>
            )}

            {message?.type !== 'success' && (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="form-label">{t('Nouveau mot de passe *', 'New password *')}</label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    className="form-input"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <div>
                  <label className="form-label">{t('Confirmer le mot de passe *', 'Confirm password *')}</label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    className="form-input"
                    placeholder="••••••••"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                  />
                </div>
                <button type="submit" disabled={submitting} className="btn-primary mt-2">
                  {submitting ? t('Mise à jour…', 'Updating…') : t('Enregistrer le nouveau mot de passe', 'Save new password')}
                </button>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}
