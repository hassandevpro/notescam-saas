// ─────────────────────────────────────────────────────────────────────────────
// <DocumentAssets /> — rendu unifié des éléments graphiques d'un document.
// ─────────────────────────────────────────────────────────────────────────────
// Un seul composant pour TOUS les générateurs PDF NotesCam (carte scolaire,
// diplôme, bulletin…). Il ne contient AUCUNE taille fixe : il s'appuie sur le
// `scale` produit par createDocumentScale (lib/documentScale.js).
//
// Règles appliquées :
//   - Logos : PNG transparents, jamais de rectangle blanc (aucun fond ajouté ;
//     si pas d'URL → rien n'est rendu, pas de cadre vide).
//   - Tampons / cachets : transparence forcée à l'affichage via mix-blend
//     « multiply » (le blanc résiduel d'un scan disparaît sur papier blanc) +
//     léger chevauchement sur la signature.
//   - Signatures : même neutralisation du fond.
//   - Filigrane : logo centré, 40–60 % de la largeur utile, opacité 0.03–0.06.
//
// Utilisation : soit les sous-composants nommés, soit <DocumentAssets part=… />.

import { createDocumentScale } from '../lib/documentScale';

export { createDocumentScale };

// ── Filigrane (logo centré, très basse opacité) ──────────────────────────────
export function DocumentWatermark({ url, scale, opacity }) {
  if (!url) return null;
  const size = scale?.watermark || 0;
  return (
    <img
      src={url}
      crossOrigin="anonymous"
      alt=""
      aria-hidden="true"
      style={{
        position: 'absolute', top: '50%', left: '50%',
        width: size, height: size, objectFit: 'contain',
        transform: 'translate(-50%,-50%)',
        opacity: opacity ?? scale?.watermarkOpacity ?? 0.05,
        pointerEvents: 'none', userSelect: 'none',
      }}
    />
  );
}

// ── Logo (transparent, contain, aucun fond) ──────────────────────────────────
// kind : 'school' (logo) · 'school-sm' (logoSm, en-tête) · 'ministry' (ministryLogo)
export function DocumentLogo({ url, scale, kind = 'school', size, style }) {
  if (!url) return null;
  const dim = size ?? (kind === 'ministry' ? scale?.ministryLogo : kind === 'school-sm' ? scale?.logoSm : scale?.logo);
  return (
    <img
      src={url}
      crossOrigin="anonymous"
      alt=""
      style={{ width: dim, height: dim, objectFit: 'contain', display: 'block', background: 'transparent', ...style }}
    />
  );
}

// ── Signature (fond neutralisé) ──────────────────────────────────────────────
export function DocumentSignature({ url, scale, height, style }) {
  if (!url) return null;
  return (
    <img
      src={url}
      crossOrigin="anonymous"
      alt=""
      style={{
        height: height ?? scale?.signatureHeight, width: 'auto', maxWidth: scale?.signatureWidth,
        objectFit: 'contain', mixBlendMode: 'multiply', background: 'transparent', ...style,
      }}
    />
  );
}

// ── Tampon / cachet (carré, fond neutralisé) ─────────────────────────────────
// fallback : nœud rendu si aucune image (ex. cachet dessiné en SVG).
export function DocumentStamp({ url, scale, size, fallback = null, style }) {
  const dim = size ?? scale?.stamp;
  if (!url) return fallback;
  return (
    <img
      src={url}
      crossOrigin="anonymous"
      alt=""
      style={{ width: dim, height: dim, objectFit: 'contain', mixBlendMode: 'multiply', background: 'transparent', ...style }}
    />
  );
}

// ── Signature scellée : signature + cachet en léger chevauchement ─────────────
export function SealedSignature({ signatureUrl, stampUrl, stampFallback, label, scale, color = '#111', align = 'center' }) {
  return (
    <div style={{ position: 'relative', textAlign: align, minWidth: scale?.signatureWidth }}>
      {/* Cachet en surimpression légère sur la signature (chevauchement) */}
      {(stampUrl || stampFallback) && (
        <div style={{ position: 'absolute', right: '50%', top: -scale?.stamp * 0.18, transform: 'translateX(60%)', opacity: 0.92, pointerEvents: 'none' }}>
          <DocumentStamp url={stampUrl} scale={scale} fallback={stampFallback} />
        </div>
      )}
      <div style={{ height: scale?.signatureHeight, display: 'flex', alignItems: 'flex-end', justifyContent: align === 'center' ? 'center' : align, position: 'relative', zIndex: 1 }}>
        <DocumentSignature url={signatureUrl} scale={scale} />
      </div>
      {label && (
        <div style={{ borderTop: `1.5px solid ${color}`, paddingTop: 4, fontSize: Math.max(10, (scale?.signatureWidth || 120) * 0.06), fontWeight: 700, color, fontStyle: 'italic', position: 'relative', zIndex: 1 }}>
          {label}
        </div>
      )}
    </div>
  );
}

/**
 * Composant unifié. `part` sélectionne l'élément à rendre :
 *   'watermark' | 'logo' | 'logo-sm' | 'ministry' | 'signature' | 'stamp' | 'sealed-signature'
 * `scale` provient de createDocumentScale. `school` fournit les URLs par défaut.
 */
export default function DocumentAssets({ part, scale, school = {}, url, ...rest }) {
  switch (part) {
    case 'watermark':
      return <DocumentWatermark url={url ?? school.logo_url} scale={scale} {...rest} />;
    case 'logo':
      return <DocumentLogo url={url ?? school.logo_url} scale={scale} kind="school" {...rest} />;
    case 'logo-sm':
      return <DocumentLogo url={url ?? school.logo_url} scale={scale} kind="school-sm" {...rest} />;
    case 'ministry':
      return <DocumentLogo url={url ?? school.ministry_logo_url} scale={scale} kind="ministry" {...rest} />;
    case 'signature':
      return <DocumentSignature url={url ?? school.signature_url} scale={scale} {...rest} />;
    case 'stamp':
      return <DocumentStamp url={url ?? school.stamp_url} scale={scale} {...rest} />;
    case 'sealed-signature':
      return <SealedSignature signatureUrl={school.signature_url} stampUrl={school.stamp_url} scale={scale} {...rest} />;
    default:
      return null;
  }
}
