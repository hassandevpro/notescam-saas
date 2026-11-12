// La COULEUR D'ACCENT d'un bulletin, et ses variantes.
//
// Moteur PUR : aucun DOM, aucun store → testable sous Node.
//
// ── POURQUOI CE MODULE EXISTE ──────────────────────────────────────────────
//
// Le gabarit du carnet primaire portait son vert en dur :
//   ACCENT '#047857' · TH_BG '#d1fae5' · TH_TXT '#065f46'
// Ce vert est celui de THE GENIUS, l'école sur le modèle de laquelle le carnet
// a été dessiné. Ce n'est ni une couleur du ministère, ni une couleur de
// NotesCam : c'est la couleur d'UNE école, imposée aux quarante-trois autres.
//
// Une école choisit donc son accent, et les quatre teintes du bulletin s'en
// DÉDUISENT. On ne lui demande pas quatre couleurs : personne ne sait choisir
// quatre verts qui s'accordent, et trois écoles sur quatre produiraient un
// bulletin illisible. Elle en choisit UNE, la seule qu'elle connaisse — celle
// de son logo.
//
// ── CE QUI EST GARANTI ─────────────────────────────────────────────────────
//
// Le texte reste lisible quelle que soit la couleur choisie : les fonds sont
// des mélanges avec du BLANC (donc toujours clairs), et le texte posé dessus
// est une version assombrie de l'accent (donc toujours foncée). Une école qui
// choisit un jaune vif obtient un fond crème et un texte brun, pas du jaune
// sur du jaune.

/** L'accent par défaut — le vert du carnet MINEDUB, conservé tel quel. */
export const ACCENT_DEFAUT = '#047857';

/** Un hex #rgb ou #rrggbb, sinon null. */
export function parseHex(v) {
  const s = String(v ?? '').trim();
  const m3 = /^#?([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(s);
  if (m3) return [0, 1, 2].map((i) => parseInt(m3[i + 1] + m3[i + 1], 16));
  const m6 = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(s);
  if (m6) return [0, 1, 2].map((i) => parseInt(m6[i + 1], 16));
  return null;
}

const clamp = (n) => Math.max(0, Math.min(255, Math.round(n)));
const toHex = (rgb) => `#${rgb.map((c) => clamp(c).toString(16).padStart(2, '0')).join('')}`;

/** Mélange vers le blanc. `p` = part de blanc (0 = couleur pure, 1 = blanc). */
function versBlanc(rgb, p) {
  return rgb.map((c) => c + (255 - c) * p);
}

/** Mélange vers le noir. `p` = part de noir. */
function versNoir(rgb, p) {
  return rgb.map((c) => c * (1 - p));
}

/**
 * Luminance relative (WCAG 2.1), pour vérifier les contrastes.
 * @returns {number} 0 (noir) à 1 (blanc)
 */
export function luminance(rgb) {
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Rapport de contraste WCAG entre deux couleurs (1 à 21). */
export function contraste(rgbA, rgbB) {
  const a = luminance(rgbA);
  const b = luminance(rgbB);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Les teintes d'un bulletin, déduites d'un seul accent.
 *
 * @param {string} base  couleur choisie par l'école (#rrggbb). Invalide ou
 *                       absente → `ACCENT_DEFAUT`, sans message : un bulletin
 *                       ne doit jamais refuser de s'imprimer pour une couleur.
 * @returns {{ accent, bandeau, tint, tintFort, texte, bordure, surAccent }}
 *   accent    — bandeaux pleins (titre), filets
 *   bandeau   — texte posé SUR l'accent (blanc ou noir, selon le contraste)
 *   tint      — fond clair des en-têtes de tableau
 *   tintFort  — fond un peu plus soutenu (TOTAL GÉNÉRAL)
 *   texte     — texte posé sur `tint` / `tintFort`
 *   bordure   — filets du tableau
 */
export function teintesBulletin(base) {
  const rgb = parseHex(base) || parseHex(ACCENT_DEFAUT);
  const accent = toHex(rgb);

  // Un accent très clair (jaune, cyan) donnerait un bandeau illisible en blanc.
  // On choisit donc la couleur du texte du bandeau par le CONTRASTE réel, au
  // lieu de supposer que tout accent est foncé.
  const blanc = [255, 255, 255];
  const noir = [17, 17, 17];
  const surAccent = contraste(rgb, blanc) >= contraste(rgb, noir) ? '#ffffff' : '#111111';

  // 86 % de blanc : assez teinté pour se voir à l'impression, assez clair pour
  // qu'un texte foncé s'y lise.
  const tint = versBlanc(rgb, 0.86);
  const tintFort = versBlanc(rgb, 0.74);

  // ── LE TEXTE S'ASSOMBRIT JUSQU'À ÊTRE LISIBLE ────────────────────────────
  //
  // Un assombrissement FIXE ne marche pas. Mesuré par le test : à 45 % de noir,
  // un accent jaune vif (#fde047) donne un texte à 4,07 de contraste sur son
  // propre fond clair — sous le seuil WCAG AA de 4,5, c'est-à-dire un en-tête
  // que personne ne lit sur une photocopie. Un vert foncé, lui, est largement
  // au-dessus dès 45 %.
  //
  // On assombrit donc PAR PALIERS jusqu'à ce que le contraste soit atteint sur
  // le PLUS SOMBRE des deux fonds (`tintFort`, le plus exigeant). La couleur
  // garde sa teinte — un bulletin rouge reste rouge — elle ne fait que
  // descendre en clarté juste assez.
  const CIBLE = 5.0;   // marge au-dessus des 4,5 de WCAG AA
  let texte = versNoir(rgb, 0.45);
  for (let p = 0.45; p <= 0.95 && contraste(texte, tintFort) < CIBLE; p += 0.05) {
    texte = versNoir(rgb, p);
  }

  return {
    accent,
    bandeau: accent,
    surAccent,
    tint: toHex(tint),
    tintFort: toHex(tintFort),
    texte: toHex(texte),
    bordure: toHex(versBlanc(rgb, 0.45)),
  };
}

/**
 * L'accent d'une école, lu sur ses paramètres.
 *
 * `schools.bulletin_accent` est NULLABLE et vide chez toutes les écoles
 * existantes : le repli sur `ACCENT_DEFAUT` garantit qu'aucun bulletin déjà
 * imprimé ne change d'aspect tant que l'école n'a rien choisi.
 */
export function accentDeLEcole(school) {
  return parseHex(school?.bulletin_accent) ? String(school.bulletin_accent).trim() : ACCENT_DEFAUT;
}

/** Raccourci : les teintes d'une école. */
export function teintesDeLEcole(school) {
  return teintesBulletin(accentDeLEcole(school));
}

/**
 * Quelques accents proposés à l'école. Ce n'est PAS une liste fermée — le
 * sélecteur accepte n'importe quelle couleur — mais un point de départ : une
 * directrice qui veut « le bleu de l'uniforme » n'a pas à connaître le code
 * hexadécimal de sa charte. Les sept passent le contrôle de contraste de
 * `_bulletinAccent.test.mjs`.
 */
export const ACCENTS_SUGGERES = [
  { hex: ACCENT_DEFAUT, fr: 'Vert MINEDUB', en: 'MINEDUB green', es: 'Verde MINEDUB' },
  { hex: '#1d4ed8', fr: 'Bleu', en: 'Blue', es: 'Azul' },
  { hex: '#0f766e', fr: 'Sarcelle', en: 'Teal', es: 'Verde azulado' },
  { hex: '#6d28d9', fr: 'Violet', en: 'Purple', es: 'Morado' },
  { hex: '#b91c1c', fr: 'Rouge', en: 'Red', es: 'Rojo' },
  { hex: '#92400e', fr: 'Brun', en: 'Brown', es: 'Marrón' },
  { hex: '#334155', fr: 'Ardoise', en: 'Slate', es: 'Pizarra' },
];

// ════════════════════════════════════════════════════════════════════════════
// COULEUR DU BULLETIN SECONDAIRE — un réglage PAR CYCLE
// ════════════════════════════════════════════════════════════════════════════
//
// Le primaire/maternelle lit `schools.bulletin_accent` (vert par défaut). Le
// secondaire lit `schools.bulletin_accent_sec` (bleu par défaut). Même sélecteur,
// même moteur de teintes, deux valeurs.
//
// ── LE DÉFAUT EST LE BLEU ACTUEL, À L'OCTET PRÈS ────────────────────────────
// Les modèles du secondaire écrivaient leurs bleus en dur (#1e3a5f, #eef2f7,
// #dde7f3, #f4f7fb). Ils ne sont PAS déductibles d'un seul accent par
// `teintesBulletin` (le bleu #eef2f7 n'est pas 86 % de blanc sur #1e3a5f). Donc :
//   · accent non choisi (ou choisi = le bleu d'origine) → ces quatre valeurs
//     exactes : les PDF des écoles existantes ne changent pas d'un pixel ;
//   · accent choisi → teintes déduites de l'accent, comme au primaire.
// Les documents ne contiennent plus aucune couleur de cycle écrite en dur : ils
// demandent leur palette à `paletteSecondaire()`.

/** Le bleu d'origine du secondaire. */
export const ACCENT_SECONDAIRE_DEFAUT = '#1e3a5f';

/** Les quatre bleus historiques — rendus tels quels tant que l'école n'a rien choisi. */
const PALETTE_SECONDAIRE_ORIGINE = Object.freeze({
  personnalisee: false,
  accent: '#1e3a5f',
  surAccent: '#ffffff',
  th: '#eef2f7',        // en-têtes de colonnes, lignes TOTAL, titres de blocs
  groupe: '#dde7f3',    // ligne de groupe / domaine
  sous: '#f4f7fb',      // sous-total
  texte: '#1e3a5f',     // texte d'accent posé sur `th` (PV)
  bordure: '#9ca3af',
});

/** L'accent secondaire CHOISI par l'école, ou null (= bleu d'origine). */
export function accentSecondaireChoisi(valeur) {
  const rgb = parseHex(valeur);
  if (!rgb) return null;
  const hex = toHex(rgb);
  return hex === ACCENT_SECONDAIRE_DEFAUT ? null : hex;
}

/**
 * La palette du secondaire.
 * @param {string|null|undefined} valeur  `schools.bulletin_accent_sec`
 */
export function paletteSecondaire(valeur) {
  const choisi = accentSecondaireChoisi(valeur);
  if (!choisi) return PALETTE_SECONDAIRE_ORIGINE;
  const t = teintesBulletin(choisi);
  return Object.freeze({
    personnalisee: true,
    accent: t.accent,
    surAccent: t.surAccent,
    th: t.tint,
    groupe: t.tintFort,
    sous: toHex(versBlanc(parseHex(choisi), 0.92)),
    texte: t.texte,
    bordure: t.bordure,
  });
}

/**
 * La palette COURANTE du secondaire, tenue à jour par le store d'authentification
 * à chaque changement de fiche école. Les modèles de document (React comme
 * HTML imprimé) la lisent ici : un seul point d'entrée, aucun paramètre à
 * propager dans quarante appels.
 */
let _courante = PALETTE_SECONDAIRE_ORIGINE;
export function definirAccentSecondaire(valeur) { _courante = paletteSecondaire(valeur); }
export const PAL_SEC = () => _courante;

/** Couleur du texte posé SUR un accent, écrite comme les modèles l'écrivaient (`#fff`) : le rendu par défaut reste identique à l'octet. */
export function texteSurAccent(accent) {
  const c = teintesBulletin(accent).surAccent;
  return c === '#ffffff' ? '#fff' : c;
}

/**
 * Le texte blanc posé sur cet accent est-il lisible ? (avertissement du réglage)
 * Les modèles basculent d'eux-mêmes en noir si besoin (`surAccent`), mais une
 * couleur très claire donne une barre de titre noire sur pastel : on prévient.
 */
export function blancIllisibleSur(valeur) {
  const rgb = parseHex(valeur);
  return !!rgb && contraste(rgb, [255, 255, 255]) < 3;
}
