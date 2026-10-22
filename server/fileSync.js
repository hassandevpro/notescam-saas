// server/fileSync.js
// RÉPLICATION DES FICHIERS LAN → Cloud : photos d'élèves, logos, cachets, signatures.
//
// LE TROU QUE CECI COMBLE
// ───────────────────────
// La synchronisation continue répliquait les LIGNES, jamais les FICHIERS. Les deux
// stockages — bucket Supabase côté Cloud, disque `FILES_DIR` côté LAN — n'ont jamais
// été réconciliés (cf. docs/AUDIT_HYBRID_ARCHITECTURE.md, ligne « Storage »). Une
// école LAN voyait donc ses `photo_url` arriver au Cloud en pointant vers des
// fichiers restés sur le PC de l'école. Relevé chez GENIUS : 79 photos référencées
// au Cloud, ZÉRO présente. Les écoles nées dans le Cloud n'avaient pas le problème,
// leur navigateur téléversant directement — ce qui a longtemps masqué le défaut.
//
// `server/fileInventory.js` avait été écrit pour ça : son en-tête annonce trois
// consommateurs, dont « une comparaison d'inventaires avant synchronisation ».
// Seule la sauvegarde existait. Ce module est le consommateur manquant ; il ne
// duplique aucune de ces fonctions, il les assemble.
//
// CE QUI MONTE, ET CE QUI NE MONTE PAS
// ────────────────────────────────────
// On ne téléverse QUE les fichiers RÉFÉRENCÉS par une ligne de la base (`referencesOf`),
// et seulement ceux absents du Cloud. Les orphelins du disque — anciennes photos
// remplacées — restent à l'école : ils ne servent plus rien et feraient payer de la
// bande passante à une connexion qui n'en a pas de trop.
//
// Rien n'est jamais SUPPRIMÉ au Cloud depuis ici. Un fichier disparu du disque de
// l'école (restauration partielle, panne) ne doit pas entraîner la suppression de sa
// copie distante, qui est alors la seule survivante.
//
// SENS UNIQUE, ASSUMÉ. Le LAN est la source des fichiers qu'il produit. La descente
// Cloud → LAN (photo ajoutée depuis l'application cloud) est un second canal, qui
// demande ses propres règles de conflit : il n'est pas traité ici.
//
// BORNÉ. Au plus `MAX_PAR_CYCLE` fichiers par cycle de synchro : une école qui a mille
// photos en retard ne doit pas saturer sa connexion pendant les heures de classe. Le
// reliquat part aux cycles suivants.
//
// BEST-EFFORT. Ce module ne lève jamais vers l'appelant : une panne de réplication de
// fichiers ne doit pas faire échouer la synchronisation des données, qui est le cœur.

import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';
import { db, FILES_DIR } from './db.js';
import { markFileSync } from './syncHealth.js';
import { EDGE_BASE } from './cloudEnv.js';
import { serverToken } from './cloudSync.js';
import { ASSET_BUCKET, listBucketFiles, referencesOf, compareInventories } from './fileInventory.js';

const MAX_PAR_CYCLE = Number(process.env.NOTESCAM_FILES_PAR_CYCLE || 25);
const TAILLE_MAX = Number(process.env.NOTESCAM_FICHIER_MAX_OCTETS || 10 * 1024 * 1024); // 10 Mo

// Transport edge (injectable pour les tests hors-ligne).
async function edgeParDefaut(body) {
  const token = serverToken();
  if (!token) throw new Error('no_server_token');
  const res = await fetch(`${EDGE_BASE}/asset-sync`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = await res.json().catch(() => null);
  if (!res.ok || !j) throw new Error(`asset-sync ${body.action}: ${j?.error || `HTTP ${res.status}`}`);
  return j;
}

// Téléversement effectif vers l'URL signée (injectable pour les tests).
async function televerseParDefaut(signedUrl, contenu, typeMime) {
  const res = await fetch(signedUrl, {
    method: 'PUT',
    headers: { 'Content-Type': typeMime, 'x-upsert': 'true' },
    body: contenu,
  });
  if (!res.ok) throw new Error(`televersement: HTTP ${res.status}`);
}

const MIMES = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  gif: 'image/gif', svg: 'image/svg+xml', pdf: 'application/pdf',
};
function typeMimeDe(chemin) {
  return MIMES[String(chemin).split('.').pop()?.toLowerCase()] || 'application/octet-stream';
}

// Fichiers à monter : RÉFÉRENCÉS en base, PRÉSENTS sur le disque, ABSENTS du Cloud.
// Exporté pour que le diagnostic puisse répondre « combien, et lesquels » sans
// rien téléverser.
export function aMonter(fichiersCloud) {
  const surDisque = new Set(listBucketFiles(FILES_DIR, ASSET_BUCKET));
  // Un même fichier peut être référencé par plusieurs lignes (photo partagée) :
  // on déduplique par chemin, sinon on le téléverserait autant de fois.
  const references = [...new Set(referencesOf(db).map((r) => r.path))];
  const presents = references.filter((p) => surDisque.has(p));
  const cmp = compareInventories(
    presents.map((path) => ({ path })),
    fichiersCloud.map((f) => ({ path: typeof f === 'string' ? f : f.path })),
  );
  return {
    manquants: cmp.onlyLeft,
    references: references.length,
    // Référencé en base mais absent du disque : la photo est cassée des DEUX côtés,
    // et aucun téléversement n'y changera rien. On le compte pour le rapport.
    absentsDuDisque: references.length - presents.length,
  };
}

// Un cycle de réplication. Renvoie toujours un rapport, ne lève jamais.
export async function repliquerFichiers(deps = {}) {
  const edge = deps.edge || edgeParDefaut;
  const televerse = deps.televerse || televerseParDefaut;
  const maxParCycle = deps.maxParCycle ?? MAX_PAR_CYCLE;
  const rapport = { montes: 0, restants: 0, ignores: [], erreurs: [], references: 0, absentsDuDisque: 0 };

  let fichiersCloud;
  try { fichiersCloud = (await edge({ action: 'inventory' })).files || []; }
  // Même une panne se publie : « réplication en échec » doit se voir à l'écran,
  // sinon l'école lit un silence comme un succès — c'est exactement ce qui s'est
  // passé pendant les mois où aucune photo ne montait.
  catch (e) { rapport.erreurs.push(`inventaire: ${e.message}`); markFileSync(rapport); return rapport; }

  let plan;
  try { plan = aMonter(fichiersCloud); }
  catch (e) { rapport.erreurs.push(`plan: ${e.message}`); markFileSync(rapport); return rapport; }
  rapport.references = plan.references;
  rapport.absentsDuDisque = plan.absentsDuDisque;

  const lot = plan.manquants.slice(0, maxParCycle);
  rapport.restants = Math.max(0, plan.manquants.length - lot.length);

  for (const chemin of lot) {
    const complet = join(FILES_DIR, ASSET_BUCKET, chemin.split('/').join(sep));
    try {
      if (!existsSync(complet)) { rapport.ignores.push({ chemin, motif: 'disparu_du_disque' }); continue; }
      const taille = statSync(complet).size;
      // Un fichier vide téléversé écraserait une copie distante valable par du vide.
      if (!taille) { rapport.ignores.push({ chemin, motif: 'fichier_vide' }); continue; }
      if (taille > TAILLE_MAX) { rapport.ignores.push({ chemin, motif: `trop_volumineux_${taille}` }); continue; }
      const { signedUrl } = await edge({ action: 'upload-url', path: chemin });
      await televerse(signedUrl, readFileSync(complet), typeMimeDe(chemin));
      rapport.montes++;
    } catch (e) {
      // Un fichier qui échoue n'arrête pas le lot : les suivants doivent passer,
      // et celui-ci sera retenté au prochain cycle (il restera « manquant »).
      rapport.erreurs.push(`${chemin}: ${e.message}`);
    }
  }

  markFileSync(rapport);
  if (rapport.montes || rapport.erreurs.length) {
    console.log(`[fichiers] ${rapport.montes} téléversé(s), ${rapport.restants} en attente`
      + (rapport.erreurs.length ? `, ${rapport.erreurs.length} en échec` : '')
      + (rapport.absentsDuDisque ? ` — ${rapport.absentsDuDisque} référence(s) sans fichier local` : ''));
  }
  return rapport;
}
