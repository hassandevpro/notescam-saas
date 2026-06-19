// src/components/CloudSyncPanel.jsx
// Bouton « Vérifier la synchronisation (simulation) » — édition LAN, admin.
// Appelle /api/sync/dry-run : le serveur calcule et journalise ce qui SERAIT
// poussé/tiré (décisions LWW) SANS rien écrire. Sert à valider la sync continue
// LAN ↔ Cloud avant de l'activer (NOTESCAM_CLOUD_SYNC=1).
import { useState } from 'react';
import { IS_LAN } from '../lib/edition';
import { useAuthStore } from '../store/authStore';

function authFetch(path) {
  let token = null;
  try { token = JSON.parse(sessionStorage.getItem('nc_lan_session') || 'null')?.access_token || null; } catch { /* ignore */ }
  return fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  }).then((r) => r.json());
}

function PlanList({ title, items, tone }) {
  if (!items?.length) return null;
  return (
    <div>
      <p className={`text-xs font-semibold ${tone}`}>{title} ({items.length})</p>
      <ul className="max-h-28 overflow-auto text-[11px] text-gray-600">
        {items.map((c, i) => <li key={i}>{c.op ? `${c.op} ` : ''}{c.table} · {c.id}</li>)}
      </ul>
    </div>
  );
}

export default function CloudSyncPanel() {
  const role = useAuthStore((s) => s.role);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);

  if (!IS_LAN || role !== 'admin') return null;

  async function run() {
    setBusy(true); setError(null); setReport(null);
    const j = await authFetch('/api/sync/dry-run').catch((e) => ({ error: { message: String(e) } }));
    setBusy(false);
    if (j?.error) return setError(j.error.message);
    setReport(j.data);
  }

  return (
    <>
      <button
        onClick={() => { setOpen(true); }}
        className="fixed bottom-16 right-4 z-40 rounded-full bg-slate-700 px-4 py-2 text-sm font-semibold text-white shadow-lg hover:bg-slate-800">
        🔍 Vérifier la sync
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-1 flex items-center justify-between">
              <h2 className="text-xl font-bold">Vérifier la synchronisation</h2>
              <button className="text-gray-400 hover:text-gray-600" onClick={() => setOpen(false)}>✕</button>
            </div>
            <p className="mb-4 text-sm text-gray-500">
              Simulation : on calcule ce qui serait échangé avec le cloud, <b>sans rien modifier</b>
              (ni en local, ni dans le cloud). Idéal pour valider avant d'activer la synchronisation.
            </p>

            <button className="mb-4 w-full rounded bg-slate-700 py-2 font-semibold text-white disabled:opacity-50"
              disabled={busy} onClick={run}>
              {busy ? 'Analyse en cours…' : 'Lancer la simulation'}
            </button>

            {error && <p className="text-sm text-red-600">⚠ {error}</p>}

            {report && (
              <div className="space-y-3">
                {report.pullError && (
                  <p className="rounded bg-amber-50 p-2 text-xs text-amber-700">
                    Cloud injoignable ({report.pullError}) — seule la poussée est simulée.
                  </p>
                )}
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded bg-slate-50 p-2">⬆ À pousser : <b>{report.pushPlan?.length ?? 0}</b></div>
                  <div className="rounded bg-slate-50 p-2">⬇ À tirer : <b>{report.pullPlan?.apply?.length ?? 0}</b></div>
                </div>
                <PlanList title="Poussées (local → cloud)" items={report.pushPlan} tone="text-sky-700" />
                <PlanList title="Appliquées (cloud → local)" items={report.pullPlan?.apply} tone="text-emerald-700" />
                <PlanList title="Ignorées (local plus récent)" items={report.pullPlan?.keepLocal} tone="text-gray-500" />
                <PlanList title="Suppressions" items={report.pullPlan?.remove?.map((c) => ({ ...c, op: 'delete' }))} tone="text-red-600" />
                <p className="text-[11px] text-gray-400">Journal complet : sync-dryrun.log (dossier de données du serveur).</p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
