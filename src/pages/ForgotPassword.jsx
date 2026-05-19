import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useT } from '../lib/i18n';
import LogoMark from '../components/LogoMark';

export default function ForgotPassword() {
  const t        = useT();
  const [email,      setEmail]      = useState('');
  const [message,    setMessage]    = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage(null);
    setSubmitting(true);

    const redirectTo = `${window.location.origin}/reset-password`;

    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
    setSubmitting(false);

    if (error) {
      setMessage({ type: 'error', text: error.message });
    } else {
      setMessage({
        type: 'success',
        text: t('Email envoyé ! Vérifiez votre boîte mail et cliquez sur le lien de réinitialisation.', 'Email sent! Check your inbox and click the reset link.'),
      });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center p-5">
      <div className="bg-white rounded-2xl p-10 w-full max-w-md shadow-2xl">
        <LogoMark size={44} className="mb-5" />
        <h1 className="text-2xl font-bold text-gray-900 mb-1">{t('Mot de passe oublié', 'Forgot password')}</h1>
        <p className="text-gray-500 mb-6 text-sm">
          {t('Entrez votre email et nous vous enverrons un lien de réinitialisation.', 'Enter your email and we\'ll send you a reset link.')}
        </p>

        {message && (
          <div
            className={`p-3 rounded-lg mb-5 text-sm ${
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
              <label className="form-label" htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                required
                className="form-input"
                placeholder={t('votre@email.cm', 'your@email.com')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <button type="submit" disabled={submitting} className="btn-primary mt-2">
              {submitting ? t('Envoi en cours…', 'Sending…') : t('Envoyer le lien', 'Send reset link')}
            </button>
          </form>
        )}

        <div className="text-center mt-6 text-sm text-gray-500">
          <Link to="/login" className="text-brand-500 font-semibold hover:underline">
            {t('← Retour à la connexion', '← Back to sign in')}
          </Link>
        </div>
      </div>
    </div>
  );
}
