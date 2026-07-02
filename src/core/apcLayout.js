// Planificateur de mise en page du bulletin APC (premier cycle) — moteur d'AUTO-FIT.
//
// Objectif : tenir le bulletin sur 2 PAGES A4 maximum, en remplissant les pages et
// en gardant une lisibilité ≥ 10pt (priorité absolue : aucune police < 10pt).
//
// Algorithme (deux dimensions d'adaptation, jamais la police sous 10pt) :
//   1) Estimer, pour une DENSITÉ donnée (taille de police + interligne + padding),
//      la hauteur de chaque ligne de compétence (avec retour à la ligne) et les
//      hauteurs « fixes » (en-tête, identité, en-tête de colonnes, pied, n° de page).
//   2) Essayer une liste de densités, de la plus AÉRÉE (11pt) à la plus COMPACTE
//      (10pt + interligne/padding resserrés), et retenir la PREMIÈRE qui fait tenir
//      le bulletin sur 2 pages (pied compris). On préfère donc la plus grande police,
//      puis — si besoin — on RESSERRE l'espacement (section 8) plutôt que de réduire
//      la police : aucune densité ne descend sous 10pt.
//   3) Répartir les matières sur les pages : matière entière tant que possible ;
//      report sur la page suivante avant toute coupure ; coupure au niveau compétence
//      seulement en dernier recours (en-tête de colonnes répété + « (suite) »).
//   4) Équilibrer les 2 pages (blanc résiduel égal) pour éviter « 80 % / 20 % ».
//   5) Si même la densité la plus compacte dépasse 2 pages, on RESTE à 10pt et on
//      produit le nombre de pages nécessaire (best-effort — lisibilité avant densité).
//
// Pur (pas de React/DOM) : testable et réutilisable par le rendu écran/PDF.

// Géométrie A4 (mm) — marges réduites pour exploiter toute la surface.
const PAGE_H = 297, MARGIN = 6, PAD = 2;
const USABLE_H = PAGE_H - 2 * MARGIN - 2 * PAD;        // ≈ 281mm
const TABLE_W  = 210 - 2 * MARGIN - 2 * PAD;           // ≈ 194mm
const COMP_COL_W = TABLE_W * 0.42;                     // colonne COMPÉTENCES (large)

// Métriques typographiques approchées (mm). La largeur d'un caractère ne dépend que
// de la police ; la hauteur d'une ligne dépend en plus de l'interligne (facteur lhK).
const charWmm = (pt) => pt * 0.180;                    // largeur moyenne d'un caractère
const BASE_LINE = 0.420;                               // mm/pt à interligne de référence (≈1.18)
const BASE_ROWPAD = 1.4;                               // padding vertical d'une ligne (mm) de référence
const lineHmm = (pt, d) => pt * BASE_LINE * d.lhK;     // interligne effectif (compressé par lhK)
const rowPadMm = (d) => BASE_ROWPAD * d.padK;          // padding vertical effectif

// En-tête de colonnes légèrement plus grand que le corps (lisibilité, section 2 :
// « en-têtes 11–12pt » alors que le corps peut descendre à 10pt).
export const apcHeaderPt = (pt) => Math.min(12, pt + 1);

// Hauteurs des blocs « fixes » (mm) — l'interligne et le padding suivent la densité.
const header1Mm = (d) => 50 + 4 * (lineHmm(d.pt, d) + 1.8 * d.padK);   // officiel + titre + identité (4 lignes)
const contMm    = (d) => lineHmm(d.pt, d) + 3 * d.padK;                // bandeau de continuation
const theadMm   = (d) => lineHmm(apcHeaderPt(d.pt), d) * 2 + 2.5 * d.padK;   // en-tête de colonnes (police +1pt)
const PAGENUM_MM = 5;
// TOTAL + 3 blocs (≈11 lignes) + appréciation + signatures (3 col). Les lignes
// suivent la densité ; le socle « signatures » ne se comprime que modérément.
const footerMm  = (d) => 6 + 11 * (lineHmm(d.pt, d) + 1.1 * d.padK) + 26 * (0.55 + 0.45 * d.padK);

const charsPerLine = (pt) => Math.max(10, Math.floor(COMP_COL_W / charWmm(pt)));
export const apcCompLineCount = (text, pt) =>
  Math.max(1, Math.ceil(String(text || '').length / charsPerLine(pt)));
const compHeight = (c, d) => apcCompLineCount(c?.intitule, d.pt) * lineHmm(d.pt, d) + rowPadMm(d);
const compsOf = (m) => (m.competences && m.competences.length ? m.competences : [{ intitule: '' }]);
const matiereHeight = (m, d) => compsOf(m).reduce((a, c) => a + compHeight(c, d), 0);
const totalMatiereHeight = (matieres, d) => (matieres || []).reduce((a, m) => a + matiereHeight(m, d), 0);

// Densités essayées dans l'ordre : d'abord la plus grande police, puis — à 10pt —
// un resserrement PROGRESSIF de l'interligne (lhK) et du padding (padK). Aucune
// densité ne descend sous 10pt (section 2 & 8).
const ATTEMPTS = [
  { pt: 11,   lhK: 1.00, padK: 1.00 },
  { pt: 10.5, lhK: 1.00, padK: 1.00 },
  { pt: 10,   lhK: 1.00, padK: 1.00 },
  { pt: 10,   lhK: 0.95, padK: 0.55 },   // resserrement 1
  { pt: 10,   lhK: 0.90, padK: 0.30 },   // resserrement 2 (compact mais lisible)
];

// Paramètres de rendu CSS dérivés d'une densité (consommés par le composant écran).
const cssOf = (d) => ({
  fontPt: d.pt,
  lineH: Math.round(1.18 * d.lhK * 100) / 100,   // interligne CSS (unitless)
  cellPadV: Math.round(d.padK * 100) / 100,      // padding vertical de cellule (px, base 1px)
});

// Marque contFromPrev / contToNext sur les chunks d'une même matière répartis sur
// plusieurs pages (pour afficher « (suite) » et répéter le résumé de la matière).
function markContinuations(pages) {
  const seen = new Map();   // matiereId → dernier chunk rencontré
  for (const page of pages) {
    for (const ch of page) {
      const prev = seen.get(ch.m.id);
      if (prev) { prev.contToNext = true; ch.contFromPrev = true; }
      seen.set(ch.m.id, ch);
    }
  }
}

// Empile les matières dans des pages de capacités `caps` (mm). Stratégie (section 3
// « éviter autant que possible la coupure d'une matière ») :
//   1) si la matière entière tient dans la place restante de la page courante → on
//      la pose en entier ;
//   2) sinon, si la page courante a déjà du contenu et que la matière entière tient
//      sur la page SUIVANTE → on la reporte en entier (aucune coupure) ;
//   3) sinon (matière plus haute qu'une page, ou dernière page) → coupure au niveau
//      compétence, en répétant l'en-tête et en marquant « (suite) ».
// Renvoie les pages (tableaux de chunks) ou null si ça déborde au-delà de la
// dernière capacité fournie.
function packInto(matieres, d, caps) {
  const pages = caps.map(() => []);
  const used = caps.map(() => 0);
  let pi = 0;
  const room = () => caps[pi] - used[pi];
  const started = () => pages[pi].length > 0 || used[pi] > 0;

  for (const m of matieres) {
    const comps = compsOf(m);
    const mH = matiereHeight(m, d);

    // 1) tient en entier sur la page courante.
    if (mH <= room()) {
      pages[pi].push({ m, comps: comps.slice(), contFromPrev: false, contToNext: false });
      used[pi] += mH;
      continue;
    }
    // 2) reportable en entier sur la page suivante (évite la coupure).
    if (started() && pi < caps.length - 1 && mH <= caps[pi + 1]) {
      pi += 1;
      pages[pi].push({ m, comps: comps.slice(), contFromPrev: false, contToNext: false });
      used[pi] += mH;
      continue;
    }
    // 3) coupure inévitable → répartition au niveau compétence.
    let k = 0;
    while (k < comps.length) {
      const h = compHeight(comps[k], d);
      if (h > room() && started()) {
        if (pi >= caps.length - 1) return null;   // plus de page disponible
        pi += 1;
      }
      let chunk = pages[pi][pages[pi].length - 1];
      if (!chunk || chunk.m !== m) { chunk = { m, comps: [], contFromPrev: false, contToNext: false }; pages[pi].push(chunk); }
      chunk.comps.push(comps[k]);
      used[pi] += h;
      k += 1;
    }
  }
  markContinuations(pages);
  return pages;
}

// Tente une mise en page lisible sur AU PLUS 2 pages pour une densité donnée.
function planTwoPages(matieres, d) {
  const body1 = USABLE_H - header1Mm(d) - theadMm(d) - PAGENUM_MM;
  // Cas 1 page : le pied doit tenir avec le contenu.
  const onePage = packInto(matieres, d, [body1 - footerMm(d)]);
  if (onePage && onePage.length === 1) return { pages: onePage, footerPageIndex: 0, totalPages: 1 };

  // Cas 2 pages : pied réservé en bas de page 2. On ÉQUILIBRE le remplissage
  // (section 4) : la hauteur cible de matières en page 1 égalise le blanc résiduel
  // des deux zones de matières → évite « page 1 = 80 %, page 2 = 20 % ».
  const body2 = USABLE_H - contMm(d) - theadMm(d) - PAGENUM_MM - footerMm(d);
  const H = totalMatiereHeight(matieres, d);
  // Blanc égal : body1 - m1 == body2 - m2, avec m1 + m2 = H → m1 = (H + body1 - body2)/2.
  // Borné : ≥ (H - body2) pour que le reste tienne en page 2, ≤ body1.
  const balanced = (H + body1 - body2) / 2;
  const page1Target = Math.max(H - body2, Math.min(body1, balanced));
  const two = packInto(matieres, d, [page1Target, body2])   // essai équilibré
    || packInto(matieres, d, [body1, body2]);               // repli glouton (granularité matière)
  if (two && two.length <= 2) return { pages: two, footerPageIndex: 1, totalPages: 2 };
  return null;
}

// Repli (best-effort) : densité la plus compacte à 10pt, autant de pages que
// nécessaire, pied sur la dernière page.
function planUnlimited(matieres, d) {
  const body1 = USABLE_H - header1Mm(d) - theadMm(d) - PAGENUM_MM;
  const bodyC = USABLE_H - contMm(d) - theadMm(d) - PAGENUM_MM;
  // Beaucoup de pages disponibles (borne large).
  const caps = [body1, ...Array(20).fill(bodyC)];
  const packed = packInto(matieres, d, caps) || [[]];
  const pages = packed.filter((p, i) => i === 0 || p.length);   // retire les pages vides en trop
  // Place le pied sur la dernière page si la place reste, sinon page dédiée.
  const lastUsed = pages[pages.length - 1].reduce((a, ch) => a + ch.comps.reduce((s, c) => s + compHeight(c, d), 0), 0);
  const lastCap = pages.length === 1 ? body1 : bodyC;
  let footerPageIndex;
  if (lastUsed + footerMm(d) <= lastCap) {
    footerPageIndex = pages.length - 1;
  } else {
    pages.push([]);
    footerPageIndex = pages.length - 1;
  }
  return { pages, footerPageIndex, totalPages: pages.length };
}

// Point d'entrée : renvoie { fontPt, lineH, cellPadV, pages, footerPageIndex, totalPages }.
//   pages : tableau de pages ; chaque page = liste de chunks { m, comps[],
//           contFromPrev, contToNext }.
//   fontPt / lineH / cellPadV : densité de rendu (police pt, interligne, padding px).
export function planApcLayout(matieres) {
  const list = matieres || [];
  for (const d of ATTEMPTS) {
    const plan = planTwoPages(list, d);
    if (plan) return { ...cssOf(d), ...plan };
  }
  // Aucune densité ne tient sur 2 pages → best-effort à la densité la plus compacte
  // (police toujours ≥ 10pt).
  const dense = ATTEMPTS[ATTEMPTS.length - 1];
  return { ...cssOf(dense), ...planUnlimited(list, dense) };
}
