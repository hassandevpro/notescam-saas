import { useState, useEffect } from 'react';
import { Link, useLocation, Navigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import LogoMark from '../components/LogoMark';

const RESEND_COOLDOWN = 60; // secondes

export default function VerifyEmail() {
  const location = useLocation();
  const session  = useAuthStore((s) => s.session);
  const loading  = useAuthStore((s) => s.loading);

  const email = location.state?.email ?? '';

  const [cooldown,  setCooldown]  = useState(0);
  const [resending, setResending] = useState(false);
  const [msg,       setMsg]       = useState(null);

  // Démarre le compte à rebours
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((c) => c - 1), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  // Si l'utilisateur confirme son email dans un autre onglet et revient
  if (!loading && session) {
    return <Navigate to="/app" replace />;
  }

  const handleResend = async () => {
    if (!email || cooldown > 0) return;
    setResending(true);
    setMsg(null);
    const { error } = await supabase.auth.resend({ type: 'signup', email });
    setResending(false);
    if (error) {
      setMsg({ type: 'error', text: error.message });
    } else {
      setMsg({ type: 'success', text: 'Email renvoyé !' });
      setCooldown(RESEND_COOLDOWN);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: 'linear-gradient(135deg, #312e81 0%, #5568d3 50%, #764ba2 100%)' }}
    >
      <div className="w-full max-w-[420px]">
        <div className="bg-white rounded-2xl shadow-2xl p-10 text-center">
          <LogoMark size={40} className="mx-auto mb-6" />

          {/* Icône email */}
          <div className="w-16 h-16 bg-brand-50 rounded-2xl flex items-center justify-center mx-auto mb-5">
            <svg className="w-8 h-8 text-brand-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
              <polyline points="22,6 12,13 2,6"/>
            </svg>
          </div>

          <h2 className="text-xl font-bold text-gray-900 mb-2">Vérifiez votre email</h2>
          <p className="text-sm text-gray-500 mb-1">Un email de confirmation a été envoyé à :</p>
          {email && (
            <p className="text-sm font-semibold text-gray-800 mb-5 truncate">{email}</p>
          )}

          <p className="text-xs text-gray-400 leading-relaxed mb-6">
            Cliquez sur le lien dans l'email pour activer votre compte NotesCam.
            Vérifiez vos courriers indésirables (spams) si vous ne le recevez pas.
          </p>

          {/* Feedback */}
          {msg && (
            <div className={`text-sm px-3 py-2 rounded-lg mb-4 ${
              msg.type === 'error'
                ? 'bg-red-50 text-red-700 border border-red-200'
                : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
            }`}>
              {msg.text}
            </div>
          )}

          {/* Renvoyer */}
          {email && (
            <button
              onClick={handleResend}
              disabled={resending || cooldown > 0}
              className="w-full py-2.5 rounded-xl text-sm font-semibold border-2 border-brand-200 text-brand-600 hover:bg-brand-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors mb-4"
            >
              {resending
                ? 'Envoi en cours…'
                : cooldown > 0
                  ? `Renvoyer dans ${cooldown}s`
                  : "Renvoyer l'email de confirmation"}
            </button>
          )}

          <div className="pt-4 border-t border-gray-100 flex flex-col gap-2">
            <Link
              to="/login"
              className="text-sm text-brand-600 font-semibold hover:text-brand-700 transition-colors"
            >
              Se connecter
            </Link>
            <Link
              to="/"
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              Retour à l'accueil
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
