// Couche d'accès au stockage `school-assets` — chemin unique pour passer des
// URL PUBLIQUES aux URL SIGNÉES (sécurité C2 : signatures/cachets/photos/docs RH
// ne doivent pas être téléchargeables/énumérables par n'importe qui).
//
// Stratégie sans rupture :
//   - `signedUrl(stored)` accepte aussi bien une URL publique héritée qu'un chemin
//     de stockage, en extrait le chemin, et renvoie une URL SIGNÉE à durée limitée.
//   - Si la signature échoue (hors-ligne, asset hors bucket, etc.) on retombe sur
//     la valeur d'origine → AUCUNE régression tant que le bucket est public.
//   - Une fois le bucket passé en privé, ces URL signées prennent le relais.
//
// `createSignedUrl` fonctionne sur un bucket public ET privé : on peut donc
// migrer les consommateurs AVANT de basculer le bucket en privé, sans rien casser.

import { supabase } from './supabase';

export const ASSET_BUCKET = 'school-assets';
const MARKER = `/${ASSET_BUCKET}/`;

// Extrait le chemin de stockage depuis une valeur stockée (URL publique/signée
// ou chemin brut). Renvoie null si la valeur n'appartient pas à notre bucket.
export function assetPath(stored) {
  if (!stored || typeof stored !== 'string') return null;
  if (!/^https?:|^data:/.test(stored)) return stored.replace(/^\/+/, '').split('?')[0]; // déjà un chemin
  const i = stored.indexOf(MARKER);
  if (i === -1) return null; // pas un asset géré (logo distant, etc.)
  return decodeURIComponent(stored.slice(i + MARKER.length).split('?')[0]);
}

const _cache = new Map(); // key `${path}|${ttl}` → { url, exp }

// Renvoie une URL signée (TTL en secondes). Repli sur `stored` si non gérable.
export async function signedUrl(stored, ttl = 3600) {
  const path = assetPath(stored);
  if (!path) return stored || null;
  const key = `${path}|${ttl}`;
  const now = Date.now();
  const hit = _cache.get(key);
  if (hit && hit.exp > now) return hit.url;
  try {
    const { data, error } = await supabase.storage.from(ASSET_BUCKET).createSignedUrl(path, ttl);
    if (error || !data?.signedUrl) return stored;
    _cache.set(key, { url: data.signedUrl, exp: now + ttl * 1000 * 0.8 });
    return data.signedUrl;
  } catch {
    return stored; // best-effort : ne jamais dégrader l'existant
  }
}
