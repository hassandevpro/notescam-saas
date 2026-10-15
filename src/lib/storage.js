// Couche d'accès au stockage `school-assets` — chemin unique pour décider QUELLE
// URL afficher (sécurité C2 : signatures/cachets/photos/docs RH ne doivent pas
// être téléchargeables/énumérables par n'importe qui une fois le bucket privé).
//
// UNE SEULE URL PAR AFFICHAGE (2026-09-04)
// ────────────────────────────────────────
// Jusqu'ici, `AssetImg` affichait d'abord l'URL publique PUIS basculait sur une
// URL signée dès qu'elle arrivait : le navigateur téléchargeait donc l'image
// DEUX fois, et la seconde — signée, donc différente à chaque signature —
// manquait systématiquement le cache du CDN. Sur l'établissement le plus lourd
// (logo 377 Ko + cachet 377 Ko), cela faisait 754 Ko d'origine inutiles à chaque
// ouverture d'écran, et autant par bulletin rendu.
//
// Désormais la décision est prise AVANT le premier rendu, par `assetUrlPlan` :
//   · valeur hors bucket (logo distant, data:)  → telle quelle, aucune requête ;
//   · bucket PUBLIC                             → URL publique, aucune requête ;
//   · bucket PRIVÉ                              → URL signée, une seule fois.
// Le mécanisme d'URL signée reste entier : c'est le jour de la bascule en privé
// qu'il prend le relais, sans autre changement que `BUCKET_PUBLIC` ci-dessous.
//
// `createSignedUrl` fonctionne sur un bucket public ET privé : on peut donc
// migrer les consommateurs AVANT de basculer le bucket, sans rien casser.

import { supabase } from './supabase';

export const ASSET_BUCKET = 'school-assets';
const MARKER = `/${ASSET_BUCKET}/`;

// VISIBILITÉ DES BUCKETS — DÉCLARÉE ICI, JAMAIS SONDÉE.
//
// `storage.buckets` a la RLS active et AUCUNE policy (vérifié le 2026-09-04) :
// un compte `authenticated` ne peut pas lire la visibilité réelle. Une sonde
// réseau est donc impossible — et resterait indésirable, puisqu'il s'agit d'une
// décision d'exploitation qui ne change qu'une fois dans la vie d'un bucket.
//
// C'est la source de vérité CÔTÉ CLIENT. Le jour où un bucket passe en privé,
// basculer sa valeur à `false` ici et redéployer. Entre-temps une valeur périmée
// dégrade sans casser : `AssetImg` retente en signé sur erreur de chargement.
//
// Se tromper n'ouvre aucun accès : viser l'URL publique d'un bucket privé
// échoue, et signer sur un bucket public ne fait que coûter une requête.
export const BUCKET_PUBLIC = Object.freeze({
  'school-assets': true,
  'bulletin-templates': true,
});

export function isPublicBucket(bucket = ASSET_BUCKET) {
  return BUCKET_PUBLIC[bucket] === true;
}

// Sépare la partie « chemin » de son suffixe (`?query` et/ou `#fragment`).
// Le suffixe ne fait JAMAIS partie du chemin remis aux API de stockage — signer
// « photo.jpg?v=1 » ne désigne aucun objet — mais il doit survivre jusqu'à l'URL
// affichée, sans quoi le cache-buster `?v=` posé à l'upload est perdu et le
// navigateur continue de servir l'ancienne photo après un remplacement.
function splitSuffix(value) {
  const i = value.search(/[?#]/);
  return i === -1 ? { base: value, suffix: '' } : { base: value.slice(0, i), suffix: value.slice(i) };
}

// Un chemin extrait d'une URL est encodé ; un chemin déjà brut ne l'est pas.
// Un `%` isolé (nom de fichier exotique) ferait lever decodeURIComponent : on
// préfère alors la valeur telle quelle plutôt que de perdre l'asset.
function safeDecode(path) {
  try { return decodeURIComponent(path); } catch { return path; }
}

// Extrait le chemin de stockage, RELATIF AU BUCKET, depuis une valeur stockée.
// Renvoie null si la valeur n'appartient pas à notre bucket.
//
// Les quatre formes rencontrées en base :
//   1. URL absolue Supabase  `https://…/object/public/school-assets/ecole1/x.jpg`
//   2. URL relative LAN      `/files/school-assets/ecole1/x.jpg?v=176…`
//   3. chemin déjà relatif   `ecole1/students/42.jpg`
//   4. valeur étrangère      logo distant, `data:` → null (affichée telle quelle)
//
// Le cas 2 est celui que produit l'édition LAN (`localClient.getPublicUrl`).
// Il était traité comme le cas 3 : le préfixe `/files/school-assets/` était
// conservé DANS le chemin, puis réappliqué à la construction de l'URL, d'où un
// `/files/school-assets/files/school-assets/…` en 404. La recherche du marqueur
// ne dépend donc plus du schéma : seule compte la présence de `/school-assets/`.
export function assetPath(stored) {
  if (!stored || typeof stored !== 'string') return null;
  const value = stored.trim();
  if (!value) return null;
  // Testé en premier : une image en ligne n'a pas de chemin, et son contenu
  // encodé ne doit jamais être confondu avec un marqueur de bucket.
  if (/^data:/i.test(value)) return null;

  const { base } = splitSuffix(value);
  const i = base.indexOf(MARKER);
  // Un chemin de stockage ne commence JAMAIS par « / » : `createSignedUrl('/x.jpg')`
  // et `createSignedUrl('x.jpg')` désignent deux clés différentes, et la seconde
  // seule existe. Un séparateur doublé en base (« …/school-assets//x.jpg », vu à
  // l'import) doit donc être absorbé ici, sur les DEUX branches.
  const nu = (p) => p.replace(/^\/+/, '');
  if (i !== -1) return nu(safeDecode(base.slice(i + MARKER.length)));  // cas 1 ET 2
  if (/^https?:/i.test(value)) return null;                            // cas 4 : hors bucket
  return nu(base);                                                     // cas 3 : déjà relatif
}

// PURE — quelle stratégie pour cette valeur stockée, sans aucun appel réseau ?
//   { kind: 'as-is',  url }  → utilisable telle quelle
//   { kind: 'public', path } → URL publique à construire (synchrone, hors réseau)
//   { kind: 'sign',   path } → signature nécessaire (bucket privé)
//
// `bucketIsPublic` est un paramètre pour rester testable des deux côtés sans
// toucher à `BUCKET_PUBLIC` : le code applicatif ne le passe jamais.
export function assetUrlPlan(stored, bucketIsPublic = isPublicBucket()) {
  const path = assetPath(stored);
  if (!path) return { kind: 'as-is', url: stored || null };
  if (!bucketIsPublic) return { kind: 'sign', path };
  // Déjà une URL http de NOTRE bucket : on la rend telle quelle, sans la
  // reconstruire. C'est exactement celle que le CDN a déjà en cache — et celle
  // que l'ancien premier rendu utilisait, donc zéro changement observable.
  if (/^https?:/i.test(stored)) return { kind: 'as-is', url: stored };
  // `suffix` est réappliqué à l'URL construite (cache-buster préservé). Il n'est
  // PAS porté par `path`, qui sert aussi de clé de signature et de cache.
  return { kind: 'public', path, suffix: splitSuffix(String(stored).trim()).suffix };
}

function buildPublicUrl(path) {
  try {
    const { data } = supabase.storage.from(ASSET_BUCKET).getPublicUrl(path);
    return data?.publicUrl || null;
  } catch {
    return null;
  }
}

// URL utilisable IMMÉDIATEMENT, sans aucun aller-retour réseau.
// Renvoie `null` — et seulement dans ce cas — quand une signature est requise.
export function assetUrlSync(stored, bucketIsPublic = isPublicBucket()) {
  const plan = assetUrlPlan(stored, bucketIsPublic);
  if (plan.kind === 'as-is') return plan.url;
  if (plan.kind === 'public') {
    const url = buildPublicUrl(plan.path);
    return url ? url + (plan.suffix || '') : stored;
  }
  return null; // 'sign' → passer par assetUrl()
}

// URL à afficher, en une seule requête au plus. C'est l'entrée à utiliser.
export async function assetUrl(stored, ttl = 3600) {
  const direct = assetUrlSync(stored);
  if (direct !== null) return direct;
  return signedUrl(stored, ttl);
}

const _cache = new Map();    // `${path}|${ttl}` → { url, exp }
const _inflight = new Map(); // `${path}|${ttl}` → Promise — déduplique les appels concurrents

// Renvoie une URL SIGNÉE (TTL en secondes). Repli sur `stored` si non gérable.
// Conservée telle quelle pour les appelants qui veulent explicitement une
// signature (idCardService), et utilisée par `assetUrl` sur bucket privé.
export async function signedUrl(stored, ttl = 3600) {
  const path = assetPath(stored);
  if (!path) return stored || null;
  const key = `${path}|${ttl}`;
  const hit = _cache.get(key);
  if (hit && hit.exp > Date.now()) return hit.url;
  // Un même asset demandé par plusieurs composants au même instant (un logo sur
  // 60 bulletins) ne doit produire qu'UNE signature, pas soixante.
  const pending = _inflight.get(key);
  if (pending) return pending;
  const task = (async () => {
    try {
      const { data, error } = await supabase.storage.from(ASSET_BUCKET).createSignedUrl(path, ttl);
      if (error || !data?.signedUrl) return stored;
      _cache.set(key, { url: data.signedUrl, exp: Date.now() + ttl * 1000 * 0.8 });
      return data.signedUrl;
    } catch {
      return stored; // best-effort : ne jamais dégrader l'existant
    } finally {
      _inflight.delete(key);
    }
  })();
  _inflight.set(key, task);
  return task;
}
