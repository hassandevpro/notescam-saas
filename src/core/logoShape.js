// FORME D'UN LOGO D'ÉCOLE — fonctions PURES.
//
// ── LE DÉFAUT, SIGNALÉ LE 2026-11-04 ──────────────────────────────────────
// Une école (hors connexion, serveur LAN) téléverse comme « logo » une BANNIÈRE : le nom de
// l'école en arabe et en français, un médaillon, l'année scolaire — environ 4 fois plus large
// que haute. L'en-tête du bulletin la posait dans une case CARRÉE de 56 px (38 en mode dense,
// 64 dans les documents HTML) avec `object-fit: contain` : l'image tenait donc sur 56 px de
// large et environ 14 px de haut, illisible.
//
// Un logo carré ou presque (médaillon, blason) reste dans sa case. Une bannière doit au
// contraire prendre la LARGEUR de l'en-tête, avec une hauteur bornée : c'est ce que décide
// `logoShape` à partir des dimensions réelles de l'image.

/** Rapport largeur/hauteur à partir duquel un logo est une bannière, pas un blason. */
export const BANNER_RATIO = 2;

export function logoRatio(width, height) {
  const w = Number(width);
  const h = Number(height);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
  return w / h;
}

/** 'banner' | 'square' | null (dimensions inconnues : on garde le comportement historique). */
export function logoShape(width, height) {
  const r = logoRatio(width, height);
  if (r === null) return null;
  return r >= BANNER_RATIO ? 'banner' : 'square';
}

export const isBannerLogo = (width, height) => logoShape(width, height) === 'banner';
