// THÈME ET MISE EN PAGE DES DOCUMENTS DE CLASSE (PV, rapports) — un seul endroit.
//
// Couleurs : sobres, lisibles en noir et blanc. Un en-tête gris clair, un texte presque noir, des filets fins
// gris, UN seul accent (le titre du document). Aucun aplat, aucun dégradé. Une école peut les changer en
// posant `school.document_theme = { accent, headerBg, text, line, zebra }` (valeurs #rgb / #rrggbb) ;
// une valeur invalide est ignorée, jamais recopiée dans le HTML.
//
// Mise en page : `dispositionMatieres(n)` décide, d'après le NOMBRE de colonnes de matières, de l'orientation,
// de la taille de police (jamais sous 7 pt), du texte vertical des en-têtes étroits et du découpage en bandes
// de colonnes — pour que le titre d'une matière ne déborde JAMAIS de sa case.

export const THEME_DEFAUT = Object.freeze({
  accent: '#1F2A44',    // titre du document uniquement
  headerBg: '#F2F2F2',  // fond d'en-tête de tableau
  text: '#222222',
  line: '#999999',      // filets fins
  zebra: '#FAFAFA',     // lignes paires (impaires : blanc)
});

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

export function themeOf(school) {
  const perso = school?.document_theme;
  const out = { ...THEME_DEFAUT };
  if (perso && typeof perso === 'object') {
    for (const k of Object.keys(THEME_DEFAUT)) if (HEX.test(String(perso[k] || ''))) out[k] = String(perso[k]);
  }
  return out;
}

export const POLICE_MIN_PT = 7;
export const MATIERES_PAYSAGE_DES = 8;   // au-delà : A4 paysage
export const MATIERES_PAR_BANDE = 16;    // au-delà : le tableau est coupé en bandes (N° + nom répétés)
export const MATIERES_VERTICAL_DES = 11; // au-delà : titres de matière en texte vertical

/**
 * @param n nombre de matières (colonnes)
 * @returns { paysage, policePt, vertical, bandes: [[debut, fin[], ...] }
 */
export function dispositionMatieres(n) {
  const nb = Math.max(0, Number(n) || 0);
  const policePt = Math.max(POLICE_MIN_PT, Math.min(9, 9 - Math.max(0, nb - MATIERES_PAYSAGE_DES) * 0.25));
  const nbBandes = Math.max(1, Math.ceil(nb / MATIERES_PAR_BANDE));
  const taille = Math.ceil(nb / nbBandes) || 0;      // bandes équilibrées
  const bandes = [];
  for (let d = 0; d < nb; d += taille) bandes.push([d, Math.min(nb, d + taille)]);
  if (!bandes.length) bandes.push([0, 0]);
  return {
    paysage: nb > MATIERES_PAYSAGE_DES,
    policePt,
    vertical: nb > MATIERES_VERTICAL_DES,
    bandes,
  };
}

// ── Abréviations d'intitulés (légende sous le tableau) ──────────────────────────
// Une école peut imposer les siennes : `school.document_abbrev = { 'Éducation à la citoyenneté': 'Citoy.' }`.
const MOTS = new Map([['education', 'Éduc.'], ['éducation', 'Éduc.'], ['mathématiques', 'Maths'], ['mathematics', 'Maths'],
  ['technologie', 'Techno.'], ['technology', 'Techno.'], ['informatique', 'Info.'], ['langue', 'Lg.'], ['language', 'Lang.'],
  ['sciences', 'Sc.'], ['science', 'Sc.'], ['physique', 'Phys.'], ['géographie', 'Géo.'], ['histoire', 'Hist.'],
  ['citoyenneté', 'Citoy.'], ['citizenship', 'Citiz.'], ['literature', 'Lit.'], ['littérature', 'Litt.']]);

const LIAISONS = new Set(['à', 'a', 'la', 'le', 'les', 'de', 'du', 'des', 'et', 'and', 'of', 'the', '&', '/']);

export function abreger(nom, school = null, max = 12) {
  const n = String(nom ?? '').trim();
  const perso = school?.document_abbrev;
  if (perso && typeof perso === 'object' && typeof perso[n] === 'string' && perso[n].trim()) return perso[n].trim();
  if (n.length <= max) return n;
  const mots = n.split(/\s+/).filter((m, i) => i === 0 || !LIAISONS.has(m.toLowerCase())).map((m) => MOTS.get(m.toLowerCase()) || m);
  let court = mots.join(' ');
  if (court.length > max) court = mots.map((m, i) => (i === 0 ? m : (m.length > 3 ? `${m[0].toUpperCase()}.` : m))).join(' ');
  if (court.length > max) court = `${court.slice(0, max - 1).trimEnd()}.`;
  return court;
}

/** Légende « Abrév. = intitulé complet » pour les seuls intitulés abrégés (dédoublonnés). */
export function legendeAbreviations(noms, school = null, max = 12) {
  const vus = new Map();
  for (const nom of noms || []) {
    const a = abreger(nom, school, max);
    if (a !== String(nom).trim() && !vus.has(a)) vus.set(a, String(nom).trim());
  }
  return [...vus].map(([abrege, complet]) => ({ abrege, complet }));
}
