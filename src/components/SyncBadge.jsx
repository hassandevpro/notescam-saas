// src/components/SyncBadge.jsx
// Indicateur de SANTÉ DE PARITÉ Cloud ↔ LAN, visible partout (header). Distinct de
// SyncIndicator (file d'écriture hors-ligne du navigateur). Reflète le dernier contrôle
// d'intégrité publié par le serveur :
//   🟢 Cloud = LAN  ·  🟡 Synchronisation…  ·  🔴 Désynchronisation
// Clic → page « Synchronisation » (rapport détaillé). LAN + admin uniquement.
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { IS_LAN } from '../lib/edition';
import { useAuthStore } from '../store/authStore';

export default function SyncBadge() {
  const role = useAuthStore((s) => s.role);
  const [h, setH] = useState(null);
  const timer = useRef(null);
  const navigate = useNavigate();

  const load = () => fetch('/api/sync/health').then((r) => r.json()).then((j) => setH(j.data)).catch(() => setH(null));
  useEffect(() => {
    if (!IS_LAN || role !== 'admin') return;
    load();
    timer.current = setInterval(load, 10000);
    return () => clearInterval(timer.current);
  }, [role]);

  if (!IS_LAN || role !== 'admin' || !h || !h.enabled) return null;

  // Détermine l'état affiché.
  let dot, label, cls;
  if (h.lastVerifyOk === false || h.stuck) { dot = '🔴'; label = 'Désynchronisation'; cls = 'text-red-700 bg-red-50'; }
  else if (h.inFlight || h.lastVerifyOk == null) { dot = '🟡'; label = 'Synchronisation…'; cls = 'text-amber-800 bg-amber-50'; }
  else { dot = '🟢'; label = 'Cloud = LAN'; cls = 'text-green-700 bg-green-50'; }

  return (
    <button
      onClick={() => navigate('/app/synchronisation')}
      title="Ouvrir le rapport de synchronisation"
      className={`hidden sm:flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${cls}`}
    >
      <span aria-hidden>{dot}</span>
      <span>{label}</span>
      {h.pendingEvents > 0 && <span className="text-[10px] font-normal opacity-70">· {h.pendingEvents} en attente</span>}
    </button>
  );
}
