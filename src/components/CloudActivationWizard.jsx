// src/components/CloudActivationWizard.jsx
// Assistant « Activer NotesCam Cloud » (scénario LOCAL FIRST).
// Visible uniquement en édition LAN, pour l'admin. Pilote les endpoints serveur
// /api/activate-cloud/* (l'ETL réel tourne côté serveur, qui a SQLite + supabase-js).
//
// Étapes : 1 compte cloud · 2 vérification e-mail · 3 analyse · 4 tenant ·
//          5 migration · 6 activation. Barre de progression + journal + reprise.
import { useState, useEffect, useRef } from 'react';
import { IS_LAN } from '../lib/edition';
import { useAuthStore } from '../store/authStore';

const STEPS = ['Compte Cloud', 'Vérification', 'Analyse', 'Tenant', 'Migration', 'Activation'];

// Session LAN (même clé que localClient) → Bearer token pour les endpoints admin.
function authFetch(path, body) {
  let token = null;
  try { token = JSON.parse(sessionStorage.getItem('nc_lan_session') || 'null')?.access_token || null; } catch { /* ignore */ }
  return fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).then((r) => r.json());
}

export default function CloudActivationWizard() {
  const role = useAuthStore((s) => s.role);
  const user = useAuthStore((s) => s.user);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({ email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState({ pct: 0, log: '', tables: [] });
  const [resumable, setResumable] = useState(false);
  const pollRef = useRef(null);

  useEffect(() => { if (user?.email) setForm((f) => ({ ...f, email: f.email || user.email })); }, [user]);

  // À l'ouverture : reprise éventuelle d'une activation interrompue.
  useEffect(() => {
    if (!open) return;
    authFetch('/api/activate-cloud/status').then((j) => {
      const ph = j?.data?.state?.phase;
      if (ph && ph !== 'done') { setResumable(true); setStep(ph === 'verify' ? 1 : 4); }
      if (ph === 'done') setStep(5);
    }).catch(() => {});
  }, [open]);

  if (!IS_LAN || role !== 'admin') return null;

  function pollStatus() {
    clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      const j = await authFetch('/api/activate-cloud/status').catch(() => null);
      const push = j?.data?.push || [];
      const total = push.reduce((a, t) => a + t.total, 0) || 1;
      const pushed = push.reduce((a, t) => a + t.pushed, 0);
      setProgress({ pct: Math.round(100 * pushed / total), log: j?.data?.state?.log || '', tables: push });
    }, 1500);
  }

  async function doSignup() {
    setBusy(true); setError(null);
    const j = await authFetch('/api/activate-cloud/signup', form);
    setBusy(false);
    if (j?.error) return setError(j.error.message);
    setStep(1);
  }

  async function doVerify() {
    setBusy(true); setError(null);
    const j = await authFetch('/api/activate-cloud/verify', form);
    setBusy(false);
    if (j?.error) return setError(j.error.message);
    if (!j?.data?.confirmed) return setError("E-mail pas encore vérifié. Cliquez le lien reçu, puis réessayez.");
    setStep(2);
  }

  async function doRun() {
    setBusy(true); setError(null); setStep(4);
    pollStatus();
    const j = await authFetch('/api/activate-cloud/run', form);
    clearInterval(pollRef.current);
    setBusy(false);
    if (j?.error) { setError(j.error.message); return; }
    setProgress((p) => ({ ...p, pct: 100 }));
    setStep(5);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-40 rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-lg hover:bg-sky-700">
        ☁ Activer NotesCam Cloud
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-1 flex items-center justify-between">
              <h2 className="text-xl font-bold">Activer NotesCam Cloud</h2>
              <button className="text-gray-400 hover:text-gray-600" onClick={() => setOpen(false)}>✕</button>
            </div>
            <p className="mb-4 text-sm text-gray-500">
              Mettez votre établissement local dans le cloud sans le recréer : vos identifiants
              et vos données sont conservés.
            </p>

            <ol className="mb-5 flex gap-1 text-[11px]">
              {STEPS.map((s, i) => (
                <li key={s} className={`flex-1 rounded px-1 py-1 text-center ${i <= step ? 'bg-sky-600 text-white' : 'bg-gray-100 text-gray-400'}`}>{s}</li>
              ))}
            </ol>

            {resumable && step < 4 && (
              <div className="mb-3 rounded bg-amber-50 p-2 text-xs text-amber-700">
                Une activation a été interrompue. Vous pouvez la reprendre : elle ne re-poussera
                pas les données déjà migrées.
              </div>
            )}

            {step === 0 && (
              <div className="space-y-3">
                <input className="w-full rounded border px-3 py-2" placeholder="E-mail (compte cloud)"
                  value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                <input className="w-full rounded border px-3 py-2" type="password"
                  placeholder="Mot de passe (le même qu'en local pour le conserver)"
                  value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
                <button className="w-full rounded bg-sky-600 py-2 font-semibold text-white disabled:opacity-50"
                  disabled={busy || !form.email || !form.password} onClick={doSignup}>
                  {busy ? '…' : 'Créer le compte Cloud'}
                </button>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-3">
                <p className="text-sm">Un e-mail de vérification a été envoyé à <b>{form.email}</b>.
                  Cliquez le lien, puis revenez ici.</p>
                <button className="w-full rounded bg-sky-600 py-2 font-semibold text-white disabled:opacity-50"
                  disabled={busy} onClick={doVerify}>{busy ? '…' : "J'ai vérifié mon e-mail"}</button>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-3">
                <p className="text-sm">Prêt à migrer toutes vos données vers le cloud
                  (écoles, comptes, classes, matières, élèves, notes, paiements, périodes, paramètres).</p>
                <button className="w-full rounded bg-sky-600 py-2 font-semibold text-white"
                  onClick={doRun}>Démarrer la migration</button>
              </div>
            )}

            {(step === 4 || (busy && step >= 2)) && (
              <div className="space-y-3">
                <div className="h-3 w-full overflow-hidden rounded bg-gray-100">
                  <div className="h-full bg-sky-600 transition-all" style={{ width: `${progress.pct}%` }} />
                </div>
                <p className="text-center text-sm">{progress.pct}% — migration en cours…</p>
                {progress.log && (
                  <pre className="max-h-32 overflow-auto rounded bg-gray-50 p-2 text-[10px] text-gray-600">{progress.log}</pre>
                )}
              </div>
            )}

            {step === 5 && (
              <div className="space-y-3">
                <p className="font-semibold text-emerald-700">✅ NotesCam Cloud activé.</p>
                <p className="text-sm text-gray-600">Vos données sont dans le cloud, sans doublon.
                  Les mots de passe du personnel se synchroniseront à leur prochaine connexion locale.</p>
                {progress.log && (
                  <pre className="max-h-40 overflow-auto rounded bg-gray-50 p-2 text-[10px] text-gray-600">{progress.log}</pre>
                )}
                <button className="w-full rounded bg-sky-600 py-2 font-semibold text-white" onClick={() => setOpen(false)}>Terminer</button>
              </div>
            )}

            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
          </div>
        </div>
      )}
    </>
  );
}
