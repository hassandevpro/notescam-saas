// src/components/HybridModeCard.jsx
// Encart « Mode hybride (Cloud ↔ LAN) » — édition LAN uniquement, admin.
//
// Active EN QUELQUES CLICS la synchronisation Cloud continue + le drain des
// intentions distantes (gouvernance : Fondatrice à distance → Cloud → LAN →
// application → confirmation), sans variable d'environnement ni lanceur dédié.
// Nécessite que l'école ait d'abord été MIGRÉE depuis le Cloud (jeton scellé).
//
// Auto-masqué en édition cloud et pour les non-admins.
import { useEffect, useState } from 'react';
import { IS_LAN } from '../lib/edition';
import { useAuthStore } from '../store/authStore';

export default function HybridModeCard() {
  const role = useAuthStore((s) => s.role);
  const [st, setSt] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = () => fetch('/api/hybrid/status').then((r) => r.json()).then((j) => setSt(j.data)).catch(() => {});
  useEffect(() => { if (IS_LAN && role === 'admin') load(); }, [role]);

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

  return (
    <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-900">🔗 Mode hybride (Cloud ↔ LAN)</h2>
        {st && (
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
            {enabled ? '● Actif' : '○ Inactif'}
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
      )}

      {err && <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}
    </div>
  );
}
