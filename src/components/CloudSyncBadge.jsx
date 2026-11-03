// src/components/CloudSyncBadge.jsx
// Voyant de synchronisation de l'ADMINISTRATEUR EN LIGNE (édition Cloud).
//   ✓ Sync OK  ·  ⏳ En attente  ·  ✕ Échec
//
// Le Cloud ne peut pas interroger le serveur d'une école (derrière un routeur). Il
// montre donc ce que ce serveur LUI A DIT à son dernier appel — file d'envoi, lignes
// refusées, désaccords, dernière erreur — via la fonction sync_etat_ecole
// (supabase_sync_etat_lan.sql). Le verdict vient de src/lib/syncStatus.js, le même
// que celui de l'école : les deux administrateurs lisent la même règle.
//
// Rien ne s'affiche tant que : l'école n'a pas de serveur relié (pas de ligne), ou
// la fonction n'est pas déployée (erreur → on se tait). Un faux rouge « échec »
// parce qu'une migration manque serait pire que pas de voyant.
//
// Édition LAN : ne rend rien et n'émet aucune requête (le serveur de l'école a son
// propre voyant, SyncBadge). IS_LAN est une constante de build : Rollup supprime ce
// fichier du paquet LAN.
import { useEffect, useRef, useState } from 'react';
import { IS_LAN } from '../lib/edition';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import { statutCloud, NIVEAUX } from '../lib/syncStatus';
import SyncVoyant from './SyncVoyant';

export default function CloudSyncBadge() {
  const role = useAuthStore((s) => s.role);
  const schoolId = useAuthStore((s) => s.school?.id);
  const [verdict, setVerdict] = useState(null);
  const timer = useRef(null);

  const load = () => supabase.rpc('sync_etat_ecole', { p_school: schoolId })
    .then(({ data, error }) => {
      if (error) { setVerdict(null); return; }
      setVerdict(statutCloud(Array.isArray(data) ? data[0] : data));
    })
    .catch(() => setVerdict(null));
  useEffect(() => {
    if (IS_LAN || role !== 'admin' || !schoolId) return;
    load();
    timer.current = setInterval(load, 30000);
    return () => clearInterval(timer.current);
  }, [role, schoolId]);

  if (IS_LAN || role !== 'admin' || !verdict) return null;
  if (verdict.niveau === NIVEAUX.INACTIF) return null;

  return <SyncVoyant verdict={verdict} origine="en ligne" />;
}
