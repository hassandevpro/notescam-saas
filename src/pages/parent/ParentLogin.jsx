import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { useT } from '../../lib/i18n';
import LogoMark from '../../components/LogoMark';

// PORTE D'ENTRÉE DE L'ESPACE PARENT — /parent
//
// Un lien général, le même pour toutes les familles, qu'un établissement peut
// afficher sur son site ou envoyer par WhatsApp : le parent s'y connecte avec
// SES identifiants. À ne pas confondre avec /parent/:token, le portail public
// par jeton (un lien par élève, sans compte), qui continue d'exister en
// parallèle pour les familles non équipées.
//
// Cette page ne décide de RIEN : elle authentifie, puis laisse la redirection
// au contexte réel du compte. Un membre du personnel qui se tromperait de porte
// est envoyé vers son application, pas vers l'espace parent.
export default function ParentLogin() {
  const t = useT();
  const navigate = useNavigate();
  const session = useAuthStore((s) => s.session);
  const role    = useAuthStore((s) => s.role);
  const loading = useAuthStore((s) => s.loading);

  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Déjà connecté : chacun chez soi.
  if (!loading && session) {
    return <Navigate to={role === 'parent' ? '/app/parent' : '/app'} replace />;
  }

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { error: err } = await supabase.auth.signInWithPassword({
        email: email.trim(), password,
      });
      if (err) throw err;
      // Le store recharge le contexte (getCurrentUserContext) et détermine seul
      // s'il s'agit d'un parent. On vise /app/parent ; ProtectedRoute renverra
      // un membre du personnel vers son accueil.
      navigate('/app/parent', { replace: true });
    } catch (err) {
      const msg = err.message || '';
      setError(/Invalid login credentials/i.test(msg)
        ? t('Email ou mot de passe incorrect.', 'Incorrect email or password.', 'Correo o contraseña incorrectos.')
        : msg);
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-brand-700 via-brand-600 to-brand-500">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-7">
        <div className="flex flex-col items-center mb-6">
          <LogoMark className="w-12 h-12 mb-3" />
          <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-widest">
            {t('Espace Parent', 'Parent area', 'Espacio de padres')}
          </p>
          <h1 className="text-lg font-bold text-gray-900">
            {t('Suivre mes enfants', 'Follow my children', 'Seguir a mis hijos')}
          </h1>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1" htmlFor="pl-email">
              {t('Adresse e-mail', 'Email address', 'Correo electrónico')}
            </label>
            <input
              id="pl-email" type="email" autoComplete="username" required
              value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1" htmlFor="pl-pass">
              {t('Mot de passe', 'Password', 'Contraseña')}
            </label>
            <input
              id="pl-pass" type="password" autoComplete="current-password" required
              value={password} onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{error}</p>
          )}

          <button type="submit" disabled={submitting} className="btn-primary w-full disabled:opacity-50">
            {submitting
              ? t('Connexion…', 'Signing in…', 'Conectando…')
              : t('Se connecter', 'Sign in', 'Entrar')}
          </button>
        </form>

        <p className="text-[11px] text-gray-400 text-center mt-5 leading-relaxed">
          {t("Votre compte est créé par l'établissement. Si vous n'en avez pas encore, contactez le secrétariat.",
             'Your account is created by the school. If you do not have one yet, contact the school office.',
             'Su cuenta la crea el centro. Si aún no tiene una, contacte con la secretaría.')}
        </p>
      </div>
    </div>
  );
}
