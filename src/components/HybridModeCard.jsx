// src/components/HybridModeCard.jsx
// Encart « Mode hybride (Cloud ↔ LAN) » — édition LAN uniquement, admin.
//
// Active EN QUELQUES CLICS la synchronisation Cloud continue + le drain des
// intentions distantes (gouvernance : Fondatrice à distance → Cloud → LAN →
// application → confirmation), sans variable d'environnement ni lanceur dédié.
// Nécessite que l'école ait d'abord été MIGRÉE depuis le Cloud (jeton scellé).
//
// L'état affiché reflète le FONCTIONNEMENT RÉEL (santé de synchro vécue par le
// serveur), pas seulement la présence d'une politique :
//   CLOUD · HYBRIDE CONNECTÉ · HYBRIDE INTERNET INDISPONIBLE ·
//   HYBRIDE SYNCHRONISATION EN COURS · HYBRIDE ERREUR DE SYNCHRONISATION.
//
// Auto-masqué en édition cloud et pour les non-admins.
import { useEffect, useRef, useState } from 'react';
import { IS_LAN } from '../lib/edition';
import { useAuthStore } from '../store/authStore';

// Rendu de chaque état : libellé, pastille, couleurs.
const MODES = {
  CLOUD:             { label: 'Cloud',                       dot: '○', badge: 'bg-gray-100 text-gray-600' },
  HYBRIDE_CONNECTED: { label: 'Hybride — connecté',          dot: '●', badge: 'bg-green-100 text-green-700' },
  HYBRIDE_SYNC:      { label: 'Hybride — synchronisation…',  dot: '◍', badge: 'bg-blue-100 text-blue-700' },
  HYBRIDE_OFFLINE:   { label: 'Hybride — Internet indisponible', dot: '◌', badge: 'bg-amber-100 text-amber-800' },
  HYBRIDE_ERROR:     { label: 'Hybride — erreur de synchronisation', dot: '✕', badge: 'bg-red-100 text-red-700' },
};

function timeAgo(iso) {
  if (!iso) return null;
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `il y a ${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `il y a ${m} min`;
  const h = Math.round(m / 60);
  return `il y a ${h} h`;
}

export default function HybridModeCard() {
  const role = useAuthStore((s) => s.role);
  const [st, setSt] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const timer = useRef(null);

  const load = () =>
    fetch('/api/hybrid/status').then((r) => r.json()).then((j) => setSt(j.data)).catch(() => {});

  useEffect(() => {
    if (!IS_LAN || role !== 'admin') return;
    load();
    // Rafraîchit l'état réel : rapide quand l'hybride tourne (voir CONNECTÉ ↔
    // INTERNET INDISPONIBLE ↔ SYNCHRONISATION en direct), plus lent sinon.
    timer.current = setInterval(load, 8000);
    return () => clearInterval(timer.current);
  }, [role]);

  if (!IS_LAN || role !== 'admin') return null;

  const toggle = async (on) => {
    setBusy(true); setErr('');
    try {
      const r = await fetch(`/api/hybrid/${on ? 'enable' : 'disable'}`, { method: 'POST' });
      const j = await r.json();
      if (j.error) { setErr(j.error.message || 'Échec.'); }
      else setSt(j.data);
    } catch (e) { setErr(e.message || 'Erreur réseau.'); }
    finally { setBusy(false); }
  };

  const enabled = st?.enabled;
  const migrated = st?.migrated;
  const mode = st?.mode || (enabled ? 'HYBRIDE_SYNC' : 'CLOUD');
  const m = MODES[mode] || MODES.CLOUD;
  const health = st?.health || {};

  return (
    <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-900">🔗 Mode hybride (Cloud ↔ LAN)</h2>
        {st && (
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${m.badge}`}>
            {m.dot} {m.label}
          </span>
        )}
      </div>

      <p className="text-sm text-gray-600">
        Garde ce serveur local <strong>autoritaire sur la finance</strong> tout en laissant la
        gouvernance (Fondatrice, Coordonnateur…) <strong>décider à distance depuis le Cloud</strong>.
        Le serveur tire les intentions distantes, les re-vérifie, les applique puis confirme au Cloud.
      </p>

      {!migrated ? (
        <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          ⚠️ L'école n'est pas encore <strong>migrée depuis le Cloud</strong>. Lancez d'abord
          l'assistant « Migrer depuis le Cloud » (la synchro hybride a besoin du jeton scellé créé
          à la migration).
        </div>
      ) : (
        <>
          {/* Détail de l'état réel — jamais « opérationnel » par simple présence de policy. */}
          {enabled && (
            <div className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600 space-y-0.5">
              {mode === 'HYBRIDE_CONNECTED' && (
                <div>✅ Dernière synchro réussie {timeAgo(health.lastSuccessAt)} · {health.lastPulled ?? 0} tirée(s) / {health.lastPushed ?? 0} poussée(s).</div>
              )}
              {mode === 'HYBRIDE_SYNC' && (
                <div>🔄 Synchronisation en cours…{health.lastSuccessAt ? ` (dernier succès ${timeAgo(health.lastSuccessAt)})` : ' (premier cycle)'}</div>
              )}
              {mode === 'HYBRIDE_OFFLINE' && (
                <div>📡 Internet indisponible — le travail local continue, la synchro reprendra au retour du réseau.{health.lastSuccessAt ? ` Dernière synchro ${timeAgo(health.lastSuccessAt)}.` : ''}</div>
              )}
              {mode === 'HYBRIDE_ERROR' && (
                <div className="text-red-700">⚠️ Erreur de synchronisation : {health.lastError?.message || 'inconnue'} ({timeAgo(health.lastErrorAt)}).</div>
              )}
              {st?.policy?.finance?.execution === 'lan' && (
                <div className="text-gray-400">Politique Cloud : finance locale + gouvernance distante.</div>
              )}
            </div>
          )}

          <div className="mt-4 flex items-center gap-3 border-t border-gray-100 pt-4">
            {enabled ? (
              <button className="btn-secondary" disabled={busy} onClick={() => toggle(false)}>
                {busy ? '…' : 'Désactiver le mode hybride'}
              </button>
            ) : (
              <button className="btn-primary" disabled={busy} onClick={() => toggle(true)}>
                {busy ? 'Activation…' : 'Activer le mode hybride'}
              </button>
            )}
            <span className="text-xs text-gray-400">
              {enabled
                ? 'Synchronisation Cloud + drain des décisions distantes en cours.'
                : 'La finance reste 100 % locale tant que ce n’est pas activé.'}
            </span>
          </div>
        </>
      )}

      {err && <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}
    </div>
  );
}
