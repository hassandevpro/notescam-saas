// Mesure la forme RÉELLE d'un logo à son chargement (voir core/logoShape.js).
//
//   const { banner, onLoad } = useLogoShape(school.logo_url);
//   <AssetImg src={url} onLoad={onLoad} … />        // dans la case carrée, comme avant
//   {banner && <bannière pleine largeur />}          // dès que l'image se révèle large
//
// Tant que l'image n'est pas chargée, `banner` vaut false : l'en-tête garde son rendu
// historique, aucun logo carré ne change d'un pixel.
import { useCallback, useEffect, useState } from 'react';
import { isBannerLogo } from '../core/logoShape';

export function useLogoShape(src) {
  const [banner, setBanner] = useState(false);
  // Un autre logo (autre école, autre unité) repart de zéro.
  useEffect(() => { setBanner(false); }, [src]);
  const onLoad = useCallback((e) => {
    const img = e?.target;
    if (img && isBannerLogo(img.naturalWidth, img.naturalHeight)) setBanner(true);
  }, []);
  return { banner, onLoad };
}
