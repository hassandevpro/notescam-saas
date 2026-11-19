// COULEURS DES TABLEAUX D'HONNEUR — logique pure (+ un lecteur de logo pour le navigateur).
//
// Ordre de priorité (décision du responsable, 2026-11-18 : couleur PROPRE aux tableaux
// d'honneur) :
//   1. couleurs réglées sur le modèle (personnalisation) ;
//   2. couleurs réglées pour les tableaux d'honneur de l'établissement (honor_options.colors) ;
//   3. couleurs EXTRAITES DU LOGO : dominante (la teinte saturée la plus présente) et accent
//      (la teinte saturée suivante, assez éloignée de la dominante) ;
//   4. bleu nuit et or (modèle de référence) — logo absent ou sans couleur (noir et blanc).
// De la dominante on dérive une version FONCÉE (fonds, textes) et une CLAIRE (pastilles).
// L'OR reste un or métallique : l'accent du logo ne le remplace que s'il est lui-même doré
// (un accent rouge ferait un sceau rouge, illisible comme « or »).

export const DEFAUT = { primaire: '#16306b', accent: '#c9a227' };

export function hexVersRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export const rgbVersHex = (r, g, b) => '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');

export function rgbVersHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}
export function hslVersHex(h, s, l) {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return rgbVersHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}
const hsl = (hex) => { const v = hexVersRgb(hex); return v ? rgbVersHsl(...v) : [0, 0, 0]; };

/** Version de luminosité donnée (0..1), même teinte. */
export function aLuminosite(hex, l, sMin = 0) {
  const [h, s] = hsl(hex);
  return hslVersHex(h, Math.max(s, sMin), l);
}
const ecartTeinte = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

/**
 * Couleurs saillantes d'une image (pixels RGBA à plat) : dominante et accent.
 * Les pixels presque blancs, presque noirs, peu saturés ou transparents sont ignorés :
 * c'est le fond et le texte du logo, pas son identité. Renvoie null si rien de coloré.
 */
export function couleursDuLogo(rgba) {
  const bacs = new Map();   // teinte (pas de 15°) → { n, r, g, b }
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3] < 128) continue;
    const r = rgba[i], g = rgba[i + 1], b = rgba[i + 2];
    const [h, s, l] = rgbVersHsl(r, g, b);
    if (s < 0.35 || l < 0.12 || l > 0.9) continue;
    const k = Math.floor(h / 15);
    const c = bacs.get(k) || { n: 0, r: 0, g: 0, b: 0, h: 0 };
    c.n++; c.r += r; c.g += g; c.b += b; c.h += h;
    bacs.set(k, c);
  }
  const tri = [...bacs.values()].filter((c) => c.n > 0).sort((a, b) => b.n - a.n)
    .map((c) => ({ n: c.n, hex: rgbVersHex(c.r / c.n, c.g / c.n, c.b / c.n), h: c.h / c.n }));
  const total = tri.reduce((a, c) => a + c.n, 0);
  if (!tri.length || total < 50) return null;
  const dominante = tri[0];
  const accent = tri.find((c) => ecartTeinte(c.h, dominante.h) >= 40 && c.n >= total * 0.04) || null;
  return { dominante: dominante.hex, accent: accent?.hex || null };
}

const estDore = (hex) => { const [h, s, l] = hsl(hex); return h >= 35 && h <= 58 && s >= 0.45 && l >= 0.35 && l <= 0.7; };

/**
 * Palette d'un document. `manuel` : { primaire?, accent? } (modèle puis établissement) ;
 * `logo` : sortie de couleursDuLogo (ou null).
 */
export function paletteHonneur({ manuel = null, logo = null } = {}) {
  const prim = (manuel?.primaire && hexVersRgb(manuel.primaire)) ? manuel.primaire
    : logo?.dominante || DEFAUT.primaire;
  const accentSource = (manuel?.accent && hexVersRgb(manuel.accent)) ? manuel.accent : logo?.accent;
  const or = accentSource && (manuel?.accent || estDore(accentSource)) ? accentSource : DEFAUT.accent;
  // Une dominante trop claire (jaune d'un logo) ferait des textes illisibles : la version
  // foncée est plafonnée, la claire reste une teinte de fond.
  return {
    primaire: prim,
    fonce: aLuminosite(prim, Math.min(hsl(prim)[2], 0.24), 0.35),
    moyen: aLuminosite(prim, 0.36, 0.35),
    clair: aLuminosite(prim, 0.93, 0.25),
    or,
    orClair: aLuminosite(or, 0.72, 0.6),
    orFonce: aLuminosite(or, 0.33, 0.6),
    source: manuel?.primaire ? 'manuel' : logo?.dominante ? 'logo' : 'defaut',
  };
}

/** Lit un logo (data-URL ou URL même origine) et en extrait les couleurs. Navigateur seulement. */
export async function lireCouleursLogo(src) {
  if (!src || typeof document === 'undefined') return null;
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image(); i.crossOrigin = 'anonymous';
      i.onload = () => res(i); i.onerror = rej; i.src = src;
    });
    const c = document.createElement('canvas');
    const k = Math.min(1, 160 / Math.max(img.naturalWidth, img.naturalHeight));
    c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return couleursDuLogo(ctx.getImageData(0, 0, c.width, c.height).data);
  } catch { return null; }
}
