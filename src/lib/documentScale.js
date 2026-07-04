// ─────────────────────────────────────────────────────────────────────────────
// DocumentScaleManager — moteur de dimensionnement des éléments graphiques.
// ─────────────────────────────────────────────────────────────────────────────
// AUCUNE taille fixe (80/100/120px…) dans les documents : toutes les dimensions
// (logo, logo ministère, tampon/cachet, signature, filigrane, médaille, badge,
// ornement) sont calculées en proportion de la PAGE, selon :
//   - la catégorie du document (prestige / standard / compact),
//   - l'orientation (portrait / paysage),
//   - la largeur et la hauteur de page.
//
// Unité-agnostique : passez pageWidth/pageHeight en px (documents capturés via
// html-to-image : carte, diplôme) ou en mm (feuilles HTML : bulletin, relevé).
// Le manager rend des nombres dans la MÊME unité.

// Fractions de la LARGEUR de page par catégorie. Règle métier :
//   prestige  → logos / tampons / signatures BEAUCOUP plus grands (diplômes).
//   standard  → taille intermédiaire (bulletins, relevés, procès-verbaux).
//   compact   → taille réduite (cartes scolaires / élèves).
const RATIOS = {
  prestige: { logo: 0.12,  logoSm: 0.058, ministryLogo: 0.05,  stamp: 0.12,  signatureW: 0.22, signatureH: 0.05,  watermark: 0.52, medal: 0.12, badge: 0.044, ornament: 0.115, opacity: 0.04 },
  standard: { logo: 0.10,  logoSm: 0.075, ministryLogo: 0.06,  stamp: 0.058, signatureW: 0.20, signatureH: 0.043, watermark: 0.48, medal: 0.10, badge: 0.045, ornament: 0.10,  opacity: 0.05 },
  compact:  { logo: 0.12,  logoSm: 0.07,  ministryLogo: 0.097, stamp: 0.076, signatureW: 0.17, signatureH: 0.045, watermark: 0.35, medal: 0.09, badge: 0.04,  ornament: 0.09,  opacity: 0.05 },
};

// Dimensions A4 en pixels (≈96 dpi) — base pour les gabarits HTML qui rendent
// leurs images en px (relevés, palmarès, listes, PV). Le ratio reste cohérent
// avec une page en mm (mêmes fractions de largeur).
export const A4_PX = { w: 794, h: 1123 };
export function pageDimsPx(orientation = 'portrait') {
  return orientation === 'landscape' ? { pageWidth: A4_PX.h, pageHeight: A4_PX.w } : { pageWidth: A4_PX.w, pageHeight: A4_PX.h };
}

// Type de document → catégorie. Étendre ici ne touche aucun générateur.
const TYPE_CATEGORY = {
  // Prestige
  diploma: 'prestige', certificate: 'prestige', honor: 'prestige', award: 'prestige',
  major: 'prestige', excellence: 'prestige', merit: 'prestige', distinction: 'prestige',
  // Standard
  bulletin: 'standard', report: 'standard', transcript: 'standard', releve: 'standard',
  pv: 'standard', conseil: 'standard', minutes: 'standard',
  // Compact
  idcard: 'compact', studentcard: 'compact', card: 'compact', badge: 'compact',
};

export const DOCUMENT_CATEGORIES = ['prestige', 'standard', 'compact'];

export function documentCategory(docType) {
  return TYPE_CATEGORY[String(docType || '').toLowerCase()] || 'standard';
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * Construit la table des dimensions pour un document.
 * @param {object} o
 * @param {string} [o.docType]      ex. 'diploma' | 'bulletin' | 'idcard'
 * @param {('prestige'|'standard'|'compact')} [o.category]  prioritaire sur docType
 * @param {('portrait'|'landscape')} [o.orientation='portrait']
 * @param {number} o.pageWidth      largeur de page (px ou mm)
 * @param {number} o.pageHeight     hauteur de page (px ou mm)
 * @returns dimensions (même unité que pageWidth)
 */
export function createDocumentScale({ docType, category, orientation = 'portrait', pageWidth, pageHeight } = {}) {
  const cat = category || documentCategory(docType);
  const r = RATIOS[cat] || RATIOS.standard;
  const W = Number(pageWidth) || 0;
  const H = Number(pageHeight) || 0;
  // La largeur sert de base. La hauteur borne le filigrane (jamais plus haut que
  // ~70 % de la page) pour rester centré sans déborder en paysage.
  const px = (frac) => Math.round(W * frac);
  const watermark = Math.round(Math.min(W * r.watermark, H * 0.7));

  return {
    category: cat,
    orientation,
    pageWidth: W,
    pageHeight: H,

    logo:         clamp(px(r.logo), 24, W),         // logo établissement (mis en avant)
    logoSm:       clamp(px(r.logoSm), 16, W),        // logo en-tête (sceau)
    ministryLogo: clamp(px(r.ministryLogo), 16, W),  // armoiries / logo ministère
    stamp:        clamp(px(r.stamp), 24, W),         // tampon / cachet (carré)
    signatureWidth:  clamp(px(r.signatureW), 40, W),
    signatureHeight: clamp(px(r.signatureH), 18, H),
    watermark,                                       // filigrane (largeur)
    watermarkOpacity: r.opacity,                     // 0.03–0.06
    medal:    clamp(px(r.medal), 40, W),             // médaille / rosette
    badge:    clamp(px(r.badge), 18, W),             // pastille d'icône
    ornament: clamp(px(r.ornament), 30, W),          // laurier / ornement d'angle
  };
}

export default createDocumentScale;
