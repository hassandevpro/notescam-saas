// <AssetImg> — image d'asset école : UNE seule URL, choisie AVANT le téléchargement.
// Remplaçant direct de <img src={x.logo_url}/> : <AssetImg src={x.logo_url} .../>.
//
// Auparavant, ce composant affichait d'abord la valeur d'origine puis basculait
// sur une URL signée : le navigateur téléchargeait l'image DEUX fois, et la
// seconde (signée, donc unique) manquait le cache du CDN à tous les coups.
// `assetUrlSync` tranche maintenant dès le premier rendu quand aucune requête
// n'est nécessaire — c'est-à-dire tant que le bucket est public, donc aujourd'hui
// toujours. Le rendu et l'impression restent immédiats : sur bucket public,
// l'URL du premier rendu est EXACTEMENT celle d'avant.
//
// Bucket privé (bascule à venir, cf. BUCKET_PUBLIC dans lib/storage) : l'URL
// signée est résolue une seule fois, avant affichage.

import { useCallback, useEffect, useRef, useState } from 'react';
import { assetUrl, assetUrlSync, signedUrl } from '../lib/storage';

// Hook : valeur stockée (URL publique héritée ou chemin) → { url, onError }.
// `onError` est le filet de sécurité : si le bucket a été passé en privé sans
// que `BUCKET_PUBLIC` ait suivi, l'URL publique échoue et on retente UNE fois
// en signé. Aucun coût dans le cas normal (le gestionnaire n'est jamais appelé).
export function useAssetUrl(stored, ttl = 3600) {
  const [url, setUrl] = useState(() => assetUrlSync(stored));
  const retried = useRef(false);

  useEffect(() => {
    let alive = true;
    retried.current = false;
    const direct = assetUrlSync(stored);
    setUrl(direct);
    // `direct` non nul = rien à résoudre : aucune requête n'est émise.
    if (direct !== null || !stored) return undefined;
    assetUrl(stored, ttl).then((u) => { if (alive) setUrl(u || null); });
    return () => { alive = false; };
  }, [stored, ttl]);

  const onError = useCallback(() => {
    if (retried.current || !stored) return;
    retried.current = true;
    signedUrl(stored, ttl).then((u) => { if (u) setUrl((prev) => (u === prev ? prev : u)); });
  }, [stored, ttl]);

  return { url, onError };
}

// Ancien nom, conservé pour les appelants qui n'ont besoin que de l'URL
// (BulletinPhoto). Même décision, même unique téléchargement.
export function useSignedUrl(stored, ttl = 3600) {
  return useAssetUrl(stored, ttl).url;
}

export default function AssetImg({ src, fallback = null, onError: onErrorProp, ...rest }) {
  const { url, onError } = useAssetUrl(src);
  const handleError = (e) => { onError(); onErrorProp?.(e); };
  if (!url) return fallback;
  return <img src={url} {...rest} onError={handleError} />;
}
