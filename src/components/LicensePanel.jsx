// src/components/LicensePanel.jsx
// Carte admin « Licence » — édition LAN uniquement.
// Affiche la licence active (plan, statut, expiration, identifiant machine) et
// permet de la CHANGER en collant une nouvelle clé (re-activation idempotente
// via /api/license/activate). Comble l'absence d'UI de ré-activation une fois la
// machine déjà activée (LanLicenseGate ne montre l'écran que si NON activée).
import { useState, useEffect } from 'react';
import { IS_LAN } from '../lib/edition';
import { useAuthStore } from '../store/authStore';
import { PLAN_META } from '../lib/plan';
import { copyText } from '../lib/clipboard';

export default function LicensePanel() {
  const role = useAuthStore((s) => s.role);
  const [info, setInfo] = useState(null);     // { activation, school, machine_id, licensing_enabled }
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [okMsg, setOkMsg] = useState('');
  const [copied, setCopied] = useState(false);
  const [openForm, setOpenForm] = useState(false);

  useEffect(() => {
    if (!IS_LAN) return;
    fetch('/api/license').then((r) => r.json()).then((j) => setInfo(j?.data || null)).catch(() => {});
  }, []);

  if (!IS_LAN || role !== 'admin') return null;

  const school = info?.school || {};
  const plan = school.plan || '—';
  const planKnown = !!PLAN_META[plan];
  const planLabel = PLAN_META[plan]?.label;

  const copyMachine = async () => {
    if (await copyText(info?.machine_id || '')) { setCopied(true); setTimeout(() => setCopied(false), 1500); }
  };

  const activate = async () => {
    setBusy(true); setError(''); setOkMsg('');
    try {
      const res = await fetch('/api/license/activate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ license_key: key.trim() }),
      });
      const json = await res.json();
      if (!res.ok || json?.error) { setError(json?.error?.message || 'Clé de licence invalide.'); return; }
      setOkMsg('Licence mise à jour. Rechargement…');
      setTimeout(() => window.location.reload(), 1200);
    } catch {
      setError('Impossible de contacter le serveur local.');
    } finally { setBusy(false); }
  };

  return (
    <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-900">🔑 Licence</h2>
        <button className="text-sm font-semibold text-brand-500 hover:underline" onClick={() => setOpenForm((v) => !v)}>
          {openForm ? 'Annuler' : 'Changer la licence'}
        </button>
      </div>

      {/* État courant */}
      <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
        <div className="rounded-lg bg-gray-50 px-3 py-2">
          Plan : <b>{planLabel || plan}</b>
          {!planKnown && plan !== '—' && (
            <span className="ml-1 text-amber-600">⚠ valeur « {plan} » non reconnue → traitée comme Starter</span>
          )}
        </div>
        <div className="rounded-lg bg-gray-50 px-3 py-2">Statut : <b>{school.license_status || '—'}</b></div>
        <div className="rounded-lg bg-gray-50 px-3 py-2">
          Expiration : <b>{school.license_expires_at ? new Date(school.license_expires_at).toLocaleDateString() : 'perpétuelle'}</b>
        </div>
        <div className="rounded-lg bg-gray-50 px-3 py-2">
          Activée : <b>{info?.activation ? 'oui' : 'non'}</b>
        </div>
      </div>

      {/* Identifiant machine (à communiquer pour une clé verrouillée) */}
      {info?.machine_id && (
        <div className="mt-3 flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Machine</span>
          <code className="flex-1 select-all rounded-lg border border-gray-200 bg-white px-3 py-1.5 font-mono text-sm tracking-wider">{info.machine_id}</code>
          <button className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50" onClick={copyMachine}>
            {copied ? 'Copié ✓' : 'Copier'}
          </button>
        </div>
      )}

      {/* Formulaire de changement */}
      {openForm && (
        <div className="mt-4 border-t border-gray-100 pt-4">
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-600">Nouvelle clé de licence</label>
          <textarea
            className="form-input h-24 w-full resize-none font-mono text-xs"
            placeholder="Collez ici la nouvelle clé de licence…"
            value={key} onChange={(e) => setKey(e.target.value)} disabled={busy}
          />
          {error && <p className="mt-2 flex items-center gap-1.5 text-sm text-red-600"><span>⚠️</span> {error}</p>}
          {okMsg && <p className="mt-2 text-sm text-emerald-700">✅ {okMsg}</p>}
          <button className="btn-primary mt-3 w-full disabled:opacity-50" onClick={activate} disabled={busy || !key.trim()}>
            {busy ? 'Activation…' : 'Activer la nouvelle licence'}
          </button>
          <p className="mt-2 text-xs text-gray-400">
            La nouvelle clé remplace l'ancienne (plan, expiration, verrou machine). L'activation est hors-ligne.
          </p>
        </div>
      )}
    </div>
  );
}
