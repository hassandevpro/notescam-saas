// src/components/SyncBadge.jsx
// Voyant de synchronisation de l'ADMINISTRATEUR, dans l'en-tête — édition LAN.
//   ✓ Sync OK  ·  ⏳ En attente  ·  ✕ Échec
// Clic → détail, puis page « Synchronisation » (journal, désaccords à trancher).
//
// La règle de décision est dans src/lib/syncStatus.js (pure, testée) ; l'affichage
// dans SyncVoyant.jsx. Ce fichier ne fait que SONDER le serveur de l'école.
// Pendant en édition Cloud : CloudSyncBadge.jsx.
//
// Ce que ce voyant ne savait pas dire avant le 02/11/2026, et que la règle commune
// dit désormais : des lignes qui attendent d'être envoyées, des lignes que le Cloud
// refuse (mises de côté), Internet coupé depuis longtemps, un désaccord à trancher.
// L'ancienne version ne regardait que la parité Cloud = LAN du dernier contrôle.
//
// LE SONDAGE PASSE PAR lanFetch, et c'est obligatoire. L'ancienne version appelait
// `/api/sync/health` avec un `fetch` nu : route réservée à l'administrateur local,
// donc 403, avalé par un `.catch` — le voyant restait masqué sans une erreur. C'est
// le défaut I39, corrigé ailleurs et resté ici.
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { IS_LAN } from '../lib/edition';
import { lanFetch } from '../lib/lanFetch';
import { useAuthStore } from '../store/authStore';
import { statutLan, NIVEAUX } from '../lib/syncStatus';
import SyncVoyant from './SyncVoyant';

export default function SyncBadge() {
  const role = useAuthStore((s) => s.role);
  const [verdict, setVerdict] = useState(null);
  const timer = useRef(null);
  const navigate = useNavigate();

  const load = () => lanFetch('/api/hybrid/status')
    .then((st) => setVerdict(statutLan(st)))
    // Le serveur de l'école ne répond pas : on ne SAIT rien — on ne dit surtout pas « OK ».
    .catch(() => setVerdict({ niveau: NIVEAUX.ECHEC, libelle: 'Le serveur de l’école ne répond pas', details: [] }));
  useEffect(() => {
    if (!IS_LAN || role !== 'admin') return;
    load();
    timer.current = setInterval(load, 10000);
    return () => clearInterval(timer.current);
  }, [role]);

  if (!IS_LAN || role !== 'admin' || !verdict) return null;
  // École non reliée au Cloud : rien à surveiller, un voyant gris permanent serait du bruit.
  if (verdict.niveau === NIVEAUX.INACTIF && verdict.libelle === 'Non relié au Cloud') return null;

  return (
    <SyncVoyant
      verdict={verdict}
      origine="école"
      actionLabel="Détail, journal et désaccords →"
      onAction={() => navigate('/app/synchronisation')}
    />
  );
}
