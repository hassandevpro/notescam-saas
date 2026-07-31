// src/components/SyncStatePanel.jsx
// « Rapport de synchronisation » (LAN, admin). AUTOMATIQUE : après chaque synchro
// (initiale ou incrémentale), le serveur compare Cloud ↔ LAN et publie un rapport que
// ce composant affiche EN CONTINU (polling /api/sync/health), sans action technique.
// Contenu : classes, élèves, enseignants, matières, utilisateurs, notes, bulletins,
// absences, budgets, dépenses, paiements + EMPREINTE GLOBALE, avec le verdict
// « Synchronisation validée à 100 % » ou « Synchronisation incomplète » (+ tables).
// Un bouton permet en plus de FORCER un contrôle approfondi à la demande.
import { useEffect, useRef, useState } from 'react';

const nf = (n) => (n == null ? '—' : Number(n).toLocaleString('fr-FR'));
const ms = (v) => (v == null ? '—' : v < 1000 ? `${v} ms` : `${(v / 1000).toFixed(1)} s`);
const ageTxt = (v) => {
  if (v == null) return '—';
  const s = Math.round(v / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min` : `${Math.round(m / 60)} h`;
};
const STUCK_LABEL = {
  cycle_en_cours_trop_long: 'cycle bloqué (en cours trop long)',
  aucun_succes: 'aucune synchro réussie',
  succes_trop_ancien: 'dernière synchro trop ancienne',
  backlog_non_draine: 'file d’attente non drainée',
};

function MetricRow({ m }) {
  const good = m.match;
  const value = m.kind === 'identical' ? (good ? 'identiques' : 'divergentes') : `${nf(m.lan)} / ${nf(m.cloud)}`;
  return (
    <div className={`flex items-center justify-between rounded-lg px-3 py-1.5 text-sm ${good ? 'bg-green-50' : 'bg-red-50'}`}>
      <span className="font-medium text-gray-700"><span className={good ? 'text-green-600' : 'text-red-600'}>{good ? '✔' : '✕'}</span> {m.label}</span>
      <span className={`font-semibold tabular-nums ${good ? 'text-green-700' : 'text-red-700'}`}>{value}</span>
    </div>
  );
}

function Divergence({ d }) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs">
      <div className="font-semibold text-red-800">✕ {d.label}</div>
      {d.tableOnly || !d.classes?.length ? (
        <div className="text-red-700">Divergence au niveau de la table.</div>
      ) : (
        <ul className="mt-1 space-y-0.5 text-red-700">
          {d.classes.map((c) => (
            <li key={c.class_id}>
              Classe <code>{c.class_id}</code>
              {c.students?.length ? <> · élèves : {c.students.map((s) => <code key={s} className="ml-1">{s}</code>)}</> : null}
              {c.sequences?.length ? <> · séquences : {c.sequences.join(', ')}</> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Le rapport de synchronisation lui-même (utilisé pour l'auto-rapport ET le contrôle forcé).
function Report({ r, auto }) {
  const plain = r.mismatches?.filter((t) => !(r.divergences || []).some((d) => d.table === t)) || [];
  const gc = r.globalChecksum;
  return (
    <div className="space-y-3">
      {r.ok ? (
        <div className="rounded-lg bg-green-100 px-3 py-2 text-sm font-bold text-green-800">✅ Synchronisation validée à 100 % — Cloud et poste local identiques.</div>
      ) : (
        <div className="rounded-lg bg-red-100 px-3 py-2 text-sm text-red-800">
          <div className="font-bold">❌ Synchronisation incomplète — {r.mismatches.length} table(s) concernée(s).</div>
          <div className="mt-1 text-xs">Tables : <strong>{(r.mismatchLabels?.length ? r.mismatchLabels : r.mismatches).join(', ')}</strong></div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {r.dashboard.map((m) => <MetricRow key={m.key} m={m} />)}
      </div>

      {gc && (
        <div className={`flex items-center justify-between rounded-lg px-3 py-1.5 text-xs ${gc.match ? 'bg-green-50' : 'bg-red-50'}`}>
          <span className="font-semibold text-gray-700">🔑 Empreinte globale</span>
          <span className={`font-mono ${gc.match ? 'text-green-700' : 'text-red-700'}`}>{gc.lan}{gc.match ? ' = ' : ' ≠ '}{gc.cloud}</span>
        </div>
      )}

      {r.divergences?.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-semibold text-gray-700">Divergences localisées :</div>
          {r.divergences.map((d) => <Divergence key={d.table} d={d} />)}
        </div>
      )}
      {plain.length > 0 && (
        <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">Tables de configuration divergentes : <strong>{plain.join(', ')}</strong></div>
      )}
      <p className="text-[11px] text-gray-400">
        {auto ? 'Rapport automatique après la dernière synchro' : 'Contrôle approfondi'} · {r.at ? new Date(r.at).toLocaleString('fr-FR') : ''}
        {r.summary?.scopesCompared != null && !r.ok ? ` · ${r.summary.scopesCompared} partition(s) inspectée(s)` : ''}
      </p>
    </div>
  );
}

export default function SyncStatePanel() {
  const [health, setHealth] = useState(null);
  const [forced, setForced] = useState(null); // contrôle à la demande (prioritaire s'il existe)
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const timer = useRef(null);

  const loadHealth = () => fetch('/api/sync/health').then((r) => r.json()).then((j) => setHealth(j.data)).catch(() => {});
  useEffect(() => { loadHealth(); timer.current = setInterval(loadHealth, 10000); return () => clearInterval(timer.current); }, []);

  const run = async () => {
    setBusy(true); setErr('');
    try {
      const r = await fetch('/api/sync/verify');
      const j = await r.json();
      if (j.error) { setErr(j.error.message || 'Contrôle impossible.'); }
      else { setForced(j.data); loadHealth(); }
    } catch (e) { setErr(e.message || 'Cloud injoignable.'); }
    finally { setBusy(false); }
  };

  // Rapport à afficher : le contrôle forcé (le plus frais) sinon l'auto-rapport publié
  // par le serveur après chaque synchro.
  const auto = !forced;
  const active = forced || health?.lastReport || null;

  return (
    <div className="mt-4 border-t border-gray-100 pt-4">
      {/* ── Santé de synchronisation ── */}
      <div className="mb-3">
        <h3 className="text-sm font-bold text-gray-900">📡 Santé de synchronisation</h3>
        {health && (
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-lg bg-gray-50 px-3 py-2 text-center">
              <div className="text-[11px] text-gray-500">Événements en attente</div>
              <div className={`text-lg font-bold ${health.pendingEvents > 0 ? 'text-amber-600' : 'text-gray-800'}`}>{nf(health.pendingEvents)}</div>
            </div>
            <div className="rounded-lg bg-gray-50 px-3 py-2 text-center">
              <div className="text-[11px] text-gray-500">Temps moyen réplication</div>
              <div className="text-lg font-bold text-gray-800">{ms(health.avgReplicationMs)}</div>
            </div>
            <div className="rounded-lg bg-gray-50 px-3 py-2 text-center">
              <div className="text-[11px] text-gray-500">Dernière synchro</div>
              <div className="text-lg font-bold text-gray-800">{health.lastSuccessAgeMs == null ? '—' : ageTxt(health.lastSuccessAgeMs)}</div>
            </div>
            <div className={`rounded-lg px-3 py-2 text-center ${health.stuck ? 'bg-red-100' : 'bg-green-50'}`}>
              <div className="text-[11px] text-gray-500">État</div>
              <div className={`text-sm font-bold ${health.stuck ? 'text-red-700' : 'text-green-700'}`}>{health.stuck ? '⚠ Bloquée' : health.inFlight ? '↻ En cours' : '● OK'}</div>
            </div>
          </div>
        )}
        {health?.stuck && (
          <div className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">Synchronisation bloquée : {STUCK_LABEL[health.stuckReason] || health.stuckReason}. Le travail local continue.</div>
        )}
      </div>

      {/* ── Rapport de synchronisation (AUTOMATIQUE) ── */}
      <div className="flex items-center justify-between border-t border-gray-100 pt-3">
        <h3 className="text-sm font-bold text-gray-900">🧾 Rapport de synchronisation</h3>
        <button className="btn-secondary text-xs" disabled={busy} onClick={run}>{busy ? 'Contrôle…' : 'Forcer un contrôle'}</button>
      </div>
      <p className="mt-1 text-xs text-gray-500">Publié automatiquement après chaque synchronisation. Le contrôle est hiérarchique (Merkle) : instantané, sans rescan complet.</p>

      {err && <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">⚠️ {err}</div>}

      <div className="mt-3">
        {active ? <Report r={active} auto={auto} />
          : <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-500">En attente de la première synchronisation…</div>}
      </div>
    </div>
  );
}
