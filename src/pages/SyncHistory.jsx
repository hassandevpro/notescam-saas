// src/pages/SyncHistory.jsx
// Page « Synchronisation » — historique permanent des synchronisations Cloud ↔ LAN +
// santé + rapport en direct. Chaque ligne du journal : Date/Heure, Utilisateur, Serveur,
// Version, Temps, Lignes, Tables, État, Hash + « Voir le rapport ». Réutilise
// SyncStatePanel (santé + rapport auto + bouton Forcer un contrôle / Réparer).
import { useEffect, useState } from 'react';
import SyncStatePanel from '../components/SyncStatePanel';

const KIND = {
  sync: { label: 'Synchronisation', badge: 'bg-blue-100 text-blue-700' },
  verify: { label: 'Contrôle', badge: 'bg-gray-100 text-gray-700' },
  repair: { label: 'Réparation', badge: 'bg-amber-100 text-amber-800' },
  'auto-repair': { label: 'Auto-réparation', badge: 'bg-amber-100 text-amber-800' },
  error: { label: 'Erreur', badge: 'bg-red-100 text-red-700' },
  rollback: { label: 'Rollback', badge: 'bg-purple-100 text-purple-700' },
};
const dt = (iso) => (iso ? new Date(iso).toLocaleString('fr-FR') : '—');
const ms = (v) => (v == null ? '—' : v < 1000 ? `${v} ms` : `${(v / 1000).toFixed(1)} s`);

function ReportModal({ entry, onClose }) {
  const r = entry.report;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-2xl overflow-auto rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-bold">Rapport de synchronisation — {dt(entry.at)}</h3>
          <button className="text-gray-400 hover:text-gray-700" onClick={onClose}>✕</button>
        </div>
        {!r ? <p className="text-sm text-gray-500">Aucun rapport détaillé pour cette entrée.</p> : (
          <div className="space-y-3 text-sm">
            <div className={`rounded-lg px-3 py-2 font-bold ${r.ok ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
              {r.ok ? '✅ Synchronisation validée à 100 %' : `❌ Synchronisation incomplète — ${(r.mismatchLabels || r.mismatches || []).join(', ')}`}
            </div>
            {r.dashboard && (
              <div className="grid grid-cols-2 gap-1.5">
                {r.dashboard.map((m) => (
                  <div key={m.key} className={`flex justify-between rounded px-2 py-1 ${m.match ? 'bg-green-50' : 'bg-red-50'}`}>
                    <span>{m.match ? '✔' : '✕'} {m.label}</span>
                    <span className="font-semibold tabular-nums">{m.kind === 'identical' ? (m.match ? 'identiques' : 'divergentes') : `${m.lan ?? '—'} / ${m.cloud ?? '—'}`}</span>
                  </div>
                ))}
              </div>
            )}
            {r.globalChecksum && <div className="rounded bg-gray-50 px-2 py-1 font-mono text-xs">🔑 {r.globalChecksum.lan}{r.globalChecksum.match ? ' = ' : ' ≠ '}{r.globalChecksum.cloud}</div>}
          </div>
        )}
      </div>
    </div>
  );
}

export default function SyncHistory() {
  const [rows, setRows] = useState([]);
  const [sel, setSel] = useState(null);
  const load = () => fetch('/api/sync/audit?limit=200').then((r) => r.json()).then((j) => setRows(j.data || [])).catch(() => {});
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, []);

  return (
    <div className="mx-auto max-w-5xl p-4">
      <h1 className="mb-1 text-2xl font-bold text-gray-900">🔄 Synchronisation</h1>
      <p className="mb-4 text-sm text-gray-500">État en direct, rapport automatique et journal permanent des synchronisations Cloud ↔ LAN.</p>

      <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <SyncStatePanel />
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-2 shadow-sm">
        <h2 className="px-3 py-2 text-sm font-bold text-gray-900">Journal des synchronisations</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="px-2 py-1 text-left">Date / Heure</th>
                <th className="px-2 py-1 text-left">Type</th>
                <th className="px-2 py-1 text-left">Utilisateur</th>
                <th className="px-2 py-1 text-left">Serveur</th>
                <th className="px-2 py-1 text-left">Version</th>
                <th className="px-2 py-1 text-right">Temps</th>
                <th className="px-2 py-1 text-right">Lignes</th>
                <th className="px-2 py-1 text-right">Tables</th>
                <th className="px-2 py-1 text-center">État</th>
                <th className="px-2 py-1 text-left">Hash</th>
                <th className="px-2 py-1"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => {
                const k = KIND[e.kind] || { label: e.kind, badge: 'bg-gray-100 text-gray-600' };
                const okState = e.ok == null ? null : !!e.ok;
                return (
                  <tr key={e.id} className="border-t border-gray-100">
                    <td className="px-2 py-1 whitespace-nowrap">{dt(e.at)}</td>
                    <td className="px-2 py-1"><span className={`rounded-full px-2 py-0.5 ${k.badge}`}>{k.label}</span></td>
                    <td className="px-2 py-1 text-gray-500">{e.actor ? String(e.actor).slice(0, 8) : '—'}</td>
                    <td className="px-2 py-1 font-mono text-gray-400">{e.device ? String(e.device).slice(0, 8) : '—'}</td>
                    <td className="px-2 py-1 text-gray-500">{e.app_version || '—'}</td>
                    <td className="px-2 py-1 text-right">{ms(e.duration_ms)}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{e.rows ?? '—'}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{e.tables ?? '—'}</td>
                    <td className="px-2 py-1 text-center">{okState == null ? '—' : okState ? <span className="text-green-600 font-bold">✔</span> : <span className="text-red-600 font-bold">✕</span>}</td>
                    <td className="px-2 py-1 font-mono text-gray-400">{e.hash ? e.hash.slice(0, 10) : '—'}</td>
                    <td className="px-2 py-1 text-right">{e.report ? <button className="text-blue-600 hover:underline" onClick={() => setSel(e)}>Voir le rapport</button> : null}</td>
                  </tr>
                );
              })}
              {!rows.length && <tr><td colSpan={11} className="px-3 py-6 text-center text-gray-400">Aucune synchronisation enregistrée pour l’instant.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {sel && <ReportModal entry={sel} onClose={() => setSel(null)} />}
    </div>
  );
}
