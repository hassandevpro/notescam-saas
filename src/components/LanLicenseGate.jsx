// Verrou de licence — édition LAN uniquement.
//
// En cloud, ce composant est un simple passe-plat (zéro impact).
// En LAN, il interroge /api/license au démarrage :
//   - licence non configurée (pas de clé publique) -> passe (install non provisionnée)
//   - déjà activée                                  -> passe
//   - sinon                                          -> écran d'activation bloquant
//
// L'activation est hors-ligne : la clé est vérifiée localement par signature
// Ed25519 côté serveur (aucun appel internet).

import { useState, useEffect } from 'react';

const IS_LAN = import.meta.env.VITE_EDITION === 'lan';

export default function LanLicenseGate({ children }) {
  if (!IS_LAN) return children;       // cloud : aucun verrou
  return <LanGateInner>{children}</LanGateInner>;
}

function LanGateInner({ children }) {
  const [status, setStatus] = useState('loading'); // loading | locked | open

  useEffect(() => {
    let alive = true;
    fetch('/api/license')
      .then((r) => r.json())
      .then(({ data }) => {
        if (!alive) return;
        const enabled   = data?.licensing_enabled;
        const activated = !!data?.activation;
        setStatus(!enabled || activated ? 'open' : 'locked');
      })
      .catch(() => alive && setStatus('open')); // fail-open si serveur muet
    return () => { alive = false; };
  }, []);

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400 text-sm animate-pulse">
        Vérification de la licence…
      </div>
    );
  }
  if (status === 'locked') return <ActivationScreen />;
  return children;
}

function ActivationScreen() {
  const [key, setKey]       = useState('');
  const [busy, setBusy]     = useState(false);
  const [error, setError]   = useState('');
  const [info, setInfo]     = useState(null);

  const activate = async () => {
    setBusy(true); setError(''); setInfo(null);
    try {
      const res = await fetch('/api/license/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ license_key: key.trim() }),
      });
      const json = await res.json();
      if (!res.ok || json?.error) {
        setError(json?.error?.message || 'Clé de licence invalide.');
        return;
      }
      setInfo(json?.data?.payload || {});
      // Recharge pour que l'app reparte avec le plan/expiration activés.
      setTimeout(() => window.location.reload(), 1200);
    } catch {
      setError('Impossible de contacter le serveur local.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-5">
      <div className="bg-white rounded-2xl p-8 sm:p-10 max-w-lg w-full shadow-xl">
        <div className="text-center mb-6">
          <div className="text-4xl mb-3">🔑</div>
          <h1 className="text-xl font-bold text-gray-900">Activation de NotesCam</h1>
          <p className="text-gray-500 text-sm mt-2">
            Cette installation nécessite une clé de licence. Collez la clé fournie
            par votre fournisseur ci-dessous. L'activation est <strong>hors-ligne</strong>.
          </p>
        </div>

        {info ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-center">
            <div className="text-2xl mb-1">✅</div>
            <p className="text-emerald-800 font-semibold text-sm">
              Licence activée{info.school ? ` — ${info.school}` : ''}
            </p>
            <p className="text-emerald-600 text-xs mt-1">Redémarrage de l'application…</p>
          </div>
        ) : (
          <>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1.5">
              Clé de licence
            </label>
            <textarea
              className="form-input w-full font-mono text-xs h-28 resize-none"
              placeholder="Collez ici la clé de licence…"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              disabled={busy}
            />
            {error && (
              <p className="text-red-600 text-sm mt-2 flex items-center gap-1.5">
                <span>⚠️</span> {error}
              </p>
            )}
            <button
              className="btn-primary w-full mt-4 disabled:opacity-50"
              onClick={activate}
              disabled={busy || !key.trim()}
            >
              {busy ? 'Activation…' : 'Activer'}
            </button>
            <p className="text-gray-400 text-xs text-center mt-4">
              Besoin d'une clé ? Contactez votre fournisseur NotesCam.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
