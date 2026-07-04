import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { mirrorPasswordToLan } from '../lib/cloudCredentialMirror';
import { useT } from '../lib/i18n';
import LogoMark from '../components/LogoMark';

// Récupération de mot de passe par CODE OTP (6 chiffres) envoyé par email —
// gratuit via Supabase (cloud). Deux étapes sur une seule page :
//   1. saisie de l'email  → envoi du code (resetPasswordForEmail)
//   2. saisie du code + nouveau mot de passe → verifyOtp(type:'recovery') + updateUser
// Prérequis : le modèle d'email « Reset Password » de Supabase doit contenir le
// jeton {{ .Token }} (sinon seul le lien magique est envoyé, pas le code).
export default function ForgotPassword() {
  const t        = useT();
  const navigate = useNavigate();

  const [step,       setStep]       = useState('request'); // 'request' | 'verify' | 'done'
  const [email,      setEmail]      = useState('');
  const [code,       setCode]       = useState('');
  const [password,   setPassword]   = useState('');
  const [confirm,    setConfirm]    = useState('');
  const [message,    setMessage]    = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Étape 1 — envoi du code par email.
  const requestCode = async (e) => {
    e.preventDefault();
    setMessage(null); setSubmitting(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
    setSubmitting(false);
    if (error) { setMessage({ type: 'error', text: error.message }); return; }
    setStep('verify');
    setMessage({ type: 'success', text: t(
      'Code envoyé ! Saisissez le code à 6 chiffres reçu par email.',
      'Code sent! Enter the 6-digit code from your email.',
      '¡Código enviado! Introduzca el código de 6 dígitos recibido por correo.',
    ) });
  };

  // Étape 2 — vérification du code puis définition du nouveau mot de passe.
  const verifyAndReset = async (e) => {
    e.preventDefault();
    if (password !== confirm) {
      setMessage({ type: 'error', text: t('Les mots de passe ne correspondent pas.', 'Passwords do not match.', 'Las contraseñas no coinciden.') });
      return;
    }
    if (password.length < 8) {
      setMessage({ type: 'error', text: t('Le mot de passe doit contenir au moins 8 caractères.', 'Password must be at least 8 characters.', 'La contraseña debe tener al menos 8 caracteres.') });
      return;
    }
    setMessage(null); setSubmitting(true);

    const { error: otpErr } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'recovery' });
    if (otpErr) {
      setSubmitting(false);
      setMessage({ type: 'error', text: t('Code invalide ou expiré. Réessayez.', 'Invalid or expired code. Try again.', 'Código no válido o caducado. Inténtelo de nuevo.') });
      return;
    }

    const { error: updErr } = await supabase.auth.updateUser({ password });
    // Sens Cloud → Local : propage le nouveau mot de passe (chiffré) vers un
    // éventuel serveur LAN. Best-effort, no-op silencieux sans serveur LAN.
    if (!updErr) { try { await mirrorPasswordToLan(password); } catch { /* ignore */ } }
    setSubmitting(false);

    if (updErr) { setMessage({ type: 'error', text: updErr.message }); return; }
    setStep('done');
    setMessage({ type: 'success', text: t('Mot de passe mis à jour ! Redirection…', 'Password updated! Redirecting…', '¡Contraseña actualizada! Redirigiendo…') });
    setTimeout(() => navigate('/app'), 1500);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center p-5">
      <div className="bg-white rounded-2xl p-10 w-full max-w-md shadow-2xl">
        <LogoMark size={44} className="mb-5" />
        <h1 className="text-2xl font-bold text-gray-900 mb-1">{t('Mot de passe oublié', 'Forgot password', 'Contraseña olvidada')}</h1>
        <p className="text-gray-500 mb-6 text-sm">
          {step === 'request'
            ? t('Entrez votre email : nous vous enverrons un code à 6 chiffres.', 'Enter your email: we\'ll send you a 6-digit code.', 'Introduzca su correo: le enviaremos un código de 6 dígitos.')
            : t('Saisissez le code reçu et choisissez un nouveau mot de passe.', 'Enter the code you received and choose a new password.', 'Introduzca el código recibido y elija una nueva contraseña.')}
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

        {step === 'request' && (
          <form onSubmit={requestCode} className="space-y-4">
            <div>
              <label className="form-label" htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                required
                className="form-input"
                placeholder={t('votre@email.cm', 'your@email.com', 'su@correo.com')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <button type="submit" disabled={submitting} className="btn-primary mt-2">
              {submitting ? t('Envoi en cours…', 'Sending…', 'Enviando…') : t('Envoyer le code', 'Send code', 'Enviar código')}
            </button>
          </form>
        )}

        {step === 'verify' && (
          <form onSubmit={verifyAndReset} className="space-y-4">
            <input type="email" value={email} readOnly hidden autoComplete="username" />
            <div>
              <label className="form-label">{t('Code à 6 chiffres *', '6-digit code *', 'Código de 6 dígitos *')}</label>
              <input
                type="text"
                required
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                className="form-input tracking-[0.5em] text-center text-lg font-mono"
                placeholder="••••••"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              />
            </div>
            <div>
              <label className="form-label">{t('Nouveau mot de passe *', 'New password *', 'Nueva contraseña *')}</label>
              <input type="password" required minLength={8} className="form-input" autoComplete="new-password"
                placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <div>
              <label className="form-label">{t('Confirmer le mot de passe *', 'Confirm password *', 'Confirmar contraseña *')}</label>
              <input type="password" required minLength={8} className="form-input" autoComplete="new-password"
                placeholder="••••••••" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </div>
            <button type="submit" disabled={submitting} className="btn-primary mt-2">
              {submitting ? t('Validation…', 'Verifying…', 'Validando…') : t('Réinitialiser le mot de passe', 'Reset password', 'Restablecer contraseña')}
            </button>
            <button type="button" onClick={() => { setStep('request'); setMessage(null); setCode(''); }}
              className="w-full text-center text-sm text-gray-500 hover:underline">
              {t('Renvoyer un code', 'Resend a code', 'Reenviar un código')}
            </button>
          </form>
        )}

        <div className="text-center mt-6 text-sm text-gray-500">
          <Link to="/login" className="text-brand-500 font-semibold hover:underline">
            {t('← Retour à la connexion', '← Back to sign in', '← Volver al inicio de sesión')}
          </Link>
        </div>
      </div>
    </div>
  );
}
