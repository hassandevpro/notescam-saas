// Génère un thème visuel déterministe par école.
// Même école → même thème (couleurs, forme, en-tête), mais deux écoles
// différentes ne partagent jamais exactement le même style.
//
// Objectif : que les bulletins et cartes scolaires aient une identité visuelle
// propre à chaque établissement, sans coder à la main des centaines de variantes.

const PALETTES = [
  { primary: '#1e3a5f', accent: '#3b82f6', soft: '#e0e7ff', label: 'Indigo' },
  { primary: '#065f46', accent: '#10b981', soft: '#d1fae5', label: 'Émeraude' },
  { primary: '#7c2d12', accent: '#f97316', soft: '#ffedd5', label: 'Orange' },
  { primary: '#6b21a8', accent: '#a855f7', soft: '#f3e8ff', label: 'Violet' },
  { primary: '#9d174d', accent: '#ec4899', soft: '#fce7f3', label: 'Rose' },
  { primary: '#0c4a6e', accent: '#06b6d4', soft: '#cffafe', label: 'Cyan' },
  { primary: '#713f12', accent: '#ca8a04', soft: '#fef3c7', label: 'Or' },
  { primary: '#7f1d1d', accent: '#dc2626', soft: '#fee2e2', label: 'Rouge' },
];

// Hash texte → entier 32-bit (FNV-1a).
function hash32(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

const HEADER_STYLES = ['flat', 'gradient', 'doubleBorder', 'sideBand'];
const CARD_SHAPES   = ['rounded',  'sharp',   'pill',         'cut'];
const WATERMARKS    = [true, false];

// Retourne un thème stable pour cette école.
export function getSchoolTheme(school) {
  const seed = String(school?.id || school?.name || 'default');
  const h    = hash32(seed);

  const palette       = PALETTES[h % PALETTES.length];
  const headerStyle   = HEADER_STYLES[(h >>> 8)  % HEADER_STYLES.length];
  const cardShape     = CARD_SHAPES  [(h >>> 16) % CARD_SHAPES.length];
  const showWatermark = WATERMARKS   [(h >>> 24) % WATERMARKS.length];

  return {
    palette,
    headerStyle,
    cardShape,
    showWatermark,
    // CSS variables injectables sur n'importe quel container.
    cssVars: {
      '--school-primary': palette.primary,
      '--school-accent':  palette.accent,
      '--school-soft':    palette.soft,
    },
  };
}

// ── Police du bulletin ────────────────────────────────────────────────────
// Polices « système » uniquement (aucun téléchargement) : garantit un rendu et
// une impression fidèles même hors-ligne / en édition LAN. `value` est stocké
// dans school.bulletin_font ; `stack` est la pile CSS appliquée au bulletin.
export const BULLETIN_FONTS = [
  { value: 'arial',     label: 'Arial (par défaut)', stack: 'Arial, Helvetica, sans-serif' },
  { value: 'times',     label: 'Times New Roman',    stack: '"Times New Roman", Times, serif' },
  { value: 'georgia',   label: 'Georgia',            stack: 'Georgia, "Times New Roman", serif' },
  { value: 'cambria',   label: 'Cambria',            stack: 'Cambria, Georgia, serif' },
  { value: 'calibri',   label: 'Calibri',            stack: 'Calibri, "Segoe UI", sans-serif' },
  { value: 'verdana',   label: 'Verdana',            stack: 'Verdana, Geneva, sans-serif' },
  { value: 'tahoma',    label: 'Tahoma',             stack: 'Tahoma, Geneva, sans-serif' },
];

const DEFAULT_FONT_STACK = BULLETIN_FONTS[0].stack;

// Pile CSS de police à appliquer au bulletin de cette école.
export function bulletinFontFamily(school) {
  const f = BULLETIN_FONTS.find((x) => x.value === school?.bulletin_font);
  return f ? f.stack : DEFAULT_FONT_STACK;
}

// Construit la chaîne `border-radius` à partir de la forme.
export function shapeToRadius(shape) {
  switch (shape) {
    case 'sharp':   return '4px';
    case 'pill':    return '32px';
    case 'cut':     return '0 24px 0 24px';
    case 'rounded':
    default:        return '14px';
  }
}
