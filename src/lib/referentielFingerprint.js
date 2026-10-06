// EMPREINTE DES RÉFÉRENTIELS OFFICIELS — décider s'il faut retélécharger.
//
// Les référentiels nationaux (APC MINESEC, Second cycle, primaire, maternelle)
// sont globaux, en lecture seule, et identiques pour toutes les écoles. Ils
// étaient pourtant retéléchargés EN ENTIER au montage de sept écrans (Dashboard,
// Classes, Bulletins, Reports, TeacherMonitor, PvWorkspace, MinesecBulletinPanel) :
// 176 Ko pour APC, 140 Ko pour le second cycle, 40 Ko pour le primaire — à chaque
// fois, alors que le cache IndexedDB contenait déjà exactement la même chose.
//
// Ici on ne fait QUE trancher : le cache est-il encore bon ?
//   · empreinte distante == empreinte du cache  → on ne télécharge rien ;
//   · différente, ou indéterminable             → fetch complet, inchangé.
// Le cache lui-même reste celui d'avant (apcRefDB, scRefDB, primRefDB, matRefDB) :
// aucun second cache, aucun mécanisme de delta, aucune expiration.
//
// DEUX SORTES D'EMPREINTE, selon ce que la base offre réellement :
//
//   VERSION (APC, second cycle) — exacte.
//     `apc_referentiel_versions` / `sc_referentiel_versions` portent la version
//     active. Les scripts d'import (scripts/import-apc-referentiel.mjs:137,
//     import-sc-referentiel.mjs:100) INSÈRENT une nouvelle ligne à chaque import
//     puis désactivent les précédentes : l'id actif change donc à chaque
//     publication d'un référentiel. C'est une empreinte autoritative.
//
//   COMPTES (primaire, maternelle) — approchée, faute de mieux.
//     Ces deux familles n'ont AUCUNE ligne de version (leurs tables
//     `*_referentiel_versions` sont vides) et AUCUNE de leurs tables ne porte
//     `updated_at` ni `created_at` (vérifié en base le 2026-09-04). Le seul
//     signal distant bon marché est donc le NOMBRE DE LIGNES par table, lu par
//     une requête HEAD (`count: 'exact'`, `head: true`) dont le corps est vide.
//     LIMITE ASSUMÉE : une correction sur place qui ne change aucun compte
//     (renommer une compétence, corriger un coefficient) reste invisible. Toute
//     addition ou suppression, elle, est vue. Il n'existe aujourd'hui aucun
//     rafraîchissement complet périodique dans l'application ; le cas échéant,
//     vider le cache du navigateur reste la porte de sortie.
//
// ÉDITION LAN : aucune empreinte n'est calculée. Le serveur d'école est sur le
// réseau local, il n'y a pas d'egress à économiser, et `localClient` ne sait pas
// répondre à une requête HEAD comptée. On retombe donc sur le comportement
// d'avant, à l'identique.

import { supabase } from './supabase';
import { IS_LAN } from './edition';

// Empreinte par VERSION ACTIVE. `null` = indéterminable → l'appelant retéléchargera.
export async function versionFingerprint(table) {
  if (IS_LAN) return null;
  try {
    const { data, error } = await supabase
      .from(table).select('id').eq('actif', true).order('id', { ascending: true });
    if (error || !Array.isArray(data)) return null;
    // Aucune version active : la table de versions n'est pas alimentée sur ce
    // déploiement. On ne peut rien affirmer → fetch complet (comportement actuel).
    if (!data.length) return null;
    return `v:${data.map((r) => r.id).join(',')}`;
  } catch {
    return null;
  }
}

// Empreinte par NOMBRE DE LIGNES. Une requête HEAD par table, corps vide.
// `null` dès qu'un compte manque — on ne devine pas.
export async function countFingerprint(tables) {
  if (IS_LAN) return null;
  try {
    const counts = await Promise.all(tables.map(async (t) => {
      const { count, error } = await supabase.from(t).select('id', { count: 'exact', head: true });
      return error || typeof count !== 'number' ? null : count;
    }));
    if (counts.some((c) => c === null)) return null;
    return `c:${counts.join(',')}`;
  } catch {
    return null;
  }
}

// Décision commune aux quatre référentiels.
//
//   { changed: false, fingerprint }           → cache à jour, RIEN n'a été téléchargé
//   { changed: true,  fingerprint, data }     → référentiel retéléchargé
//   { changed: true,  fingerprint: null, data: null } → échec : garder le cache
//
// `fingerprint` n'est jamais renvoyé non nul sans `data` correspondante : on ne
// veut pas enregistrer une empreinte pour un contenu qu'on n'a pas reçu.
export async function refreshReferentiel({ cachedFingerprint, fingerprint, fetchAll }) {
  const fp = await fingerprint();
  if (fp != null && cachedFingerprint != null && fp === cachedFingerprint) {
    return { changed: false, fingerprint: fp, data: null };
  }
  const data = await fetchAll();
  return { changed: true, fingerprint: data ? fp : null, data };
}
