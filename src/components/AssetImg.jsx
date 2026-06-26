// <AssetImg> — image d'asset école résolue en URL SIGNÉE (sécurité C2).
// Remplaçant direct de <img src={x.logo_url}/> : <AssetImg src={x.logo_url} .../>.
// Résout une URL signée (repli sur la valeur d'origine si non signable), donc
// fonctionne avec le bucket public (aujourd'hui) comme privé (après bascule).

import { useEffect, useState } from 'react';
import { signedUrl } from '../lib/storage';

// Hook : valeur stockée (URL publique héritée ou chemin) → URL prête à afficher.
export function useSignedUrl(stored, ttl = 3600) {
  // Optimiste : on affiche d'abord la valeur d'origine (rendu/impression
  // immédiats, zéro régression tant que le bucket est public), puis on bascule
  // sur l'URL signée dès qu'elle est prête (et après bascule privée).
  const [url, setUrl] = useState(stored || null);
  useEffect(() => {
    let on = true;
    setUrl(stored || null);
    if (!stored) return;
    signedUrl(stored, ttl).then((u) => { if (on && u) setUrl(u); });
    return () => { on = false; };
  }, [stored, ttl]);
  return url;
}

export default function AssetImg({ src, fallback = null, ...rest }) {
  const url = useSignedUrl(src);
  if (!url) return fallback;
  return <img src={url} {...rest} />;
}
