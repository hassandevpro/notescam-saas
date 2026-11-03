// FEUILLE DE NOTES À REMPLIR À LA MAIN — logique PURE (ni React, ni DOM).
//
// Ce que c'est. Le document que l'enseignant a réellement sous les yeux pendant
// qu'il corrige : une grille papier, un élève par ligne, une colonne par épreuve,
// le barème écrit en tête de colonne. Il la remplit au stylo en salle des
// professeurs, puis la recopie dans l'application. Les écoles la fabriquaient
// elles-mêmes — photographiées le 2026-11-01 : une grille « compétence 1a … 6b »
// avec oral/écrit/total et les barèmes sur5/sur2/sur20, et une grille de matières
// avec Total, Moyenne et Rang. L'application savait tout afficher à l'écran et
// n'imprimait rien de tel.
//
// Deux usages, un seul gabarit :
//   • VIERGE  — les cases sont vides, on écrit dedans. C'est le cas qui a été
//               demandé, et c'est le défaut.
//   • REMPLIE — les notes déjà saisies sont imprimées, pour relire et corriger.
//
// Ce module ne sait QUE découper : il reçoit des groupes de colonnes et des
// élèves, il rend des PAGES prêtes à poser sur du papier. Il ne connaît ni les
// compétences du primaire, ni les matières du secondaire — chaque écran lui
// présente ses propres colonnes.

// ── Capacités d'une page A4 paysage ──────────────────────────────────────────
//
// Mesures du gabarit `styles/feuilleNotes.css` : 277 mm utiles en largeur, une
// colonne de note à 11 mm minimum (deux chiffres et une virgule, écrits à la
// main), et 95 mm réservés au N° et au nom. Soit 16 colonnes confortables. En
// hauteur : 190 mm utiles, une ligne à 7,5 mm pour qu'on puisse écrire dedans
// sans déborder — 25 lignes, plus l'en-tête.
//
// Ces nombres sont des DÉFAUTS, pas des vérités : l'appelant les change (une
// école qui accepte des cases plus serrées en met davantage).
export const COLONNES_PAR_PAGE = 16;
export const LIGNES_PAR_PAGE   = 25;

const entier = (v, defaut) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : defaut;
};

// ── Découpe des COLONNES ─────────────────────────────────────────────────────
//
// UN GROUPE NE SE COUPE JAMAIS EN DEUX. Sur la feuille photographiée, la
// compétence « 1a » porte ses quatre épreuves et son total côte à côte : séparer
// « oral » de son « total » sur deux feuilles rendrait la colonne total
// inutilisable — on ne peut pas additionner ce qu'on ne voit pas.
//
// Un groupe PLUS LARGE que la page part donc seul sur sa page, débordement
// assumé et signalé (`deborde`), plutôt que coupé en silence.
export function paginerGroupes(groupes, maxColonnes = COLONNES_PAR_PAGE) {
  const max = entier(maxColonnes, COLONNES_PAR_PAGE);
  const pages = [];
  let courante = [];
  let largeur = 0;

  for (const g of groupes || []) {
    const cols = Array.isArray(g.colonnes) ? g.colonnes : [];
    const n = cols.length;
    if (n === 0) continue;

    // Groupe plus large que la page : il prend une page pour lui seul.
    if (n > max) {
      if (courante.length) { pages.push(courante); courante = []; largeur = 0; }
      pages.push([{ ...g, colonnes: cols, deborde: true }]);
      continue;
    }

    if (largeur + n > max && courante.length) {
      pages.push(courante);
      courante = [];
      largeur = 0;
    }
    courante.push({ ...g, colonnes: cols, deborde: false });
    largeur += n;
  }
  if (courante.length) pages.push(courante);
  return pages;
}

// ── Découpe des LIGNES ───────────────────────────────────────────────────────
//
// Les numéros ne repartent pas de 1 à chaque page : le N° imprimé est celui de
// la LISTE DE CLASSE, appelé à l'oral et recopié sur les bulletins. Une feuille
// dont la deuxième page renumérote à partir de 1 fait saisir les notes du mauvais
// élève.
export function paginerEleves(eleves, maxLignes = LIGNES_PAR_PAGE) {
  const max = entier(maxLignes, LIGNES_PAR_PAGE);
  const liste = Array.isArray(eleves) ? eleves : [];
  if (liste.length === 0) return [[]];
  const pages = [];
  for (let i = 0; i < liste.length; i += max) pages.push(liste.slice(i, i + max));
  return pages;
}

// ── Lignes vides de fin ──────────────────────────────────────────────────────
//
// POURQUOI DES LIGNES SANS NOM. Une classe bouge : trois inscriptions arrivent
// après l'édition de la feuille, et l'enseignant doit pouvoir les ajouter au
// stylo plutôt que réimprimer. Elles portent un numéro vide, pas la suite des
// numéros de la classe : écrire « 36 » d'avance affirmerait un rang que
// l'inscription réelle ne confirmera pas.
function lignesVierges(n) {
  return Array.from({ length: n }, (_, i) => ({
    id:      `__vide_${i}`,
    numero:  '',
    nom:     '',
    vide:    true,
    cellules: {},
  }));
}

// ── Construction de la feuille ───────────────────────────────────────────────
//
// @param groupes      [{ id, label, colonnes: [{ id, label, bareme }] }]
// @param eleves       [{ id, numero, nom }] — DÉJÀ dans l'ordre de la liste de classe
// @param valeur       (eleveId, colonneId) => string — lue seulement si !vierge
// @param vierge       true (défaut) = cases vides, à remplir à la main
// @param lignesVides  lignes sans nom ajoutées en fin de dernière page
// @param maxColonnes / maxLignes  capacités de la page
//
// @returns { pages: [{ no, total, groupes, colonnes, lignes, suite }] }
//   `colonnes` = les colonnes de la page à plat (ordre d'impression)
//   `suite`    = true si la page reprend les MÊMES colonnes que la précédente
//                (découpe en hauteur) — l'en-tête y ajoute « suite ».
export function construireFeuille({
  groupes = [],
  eleves = [],
  valeur = null,
  vierge = true,
  lignesVides = 0,
  maxColonnes = COLONNES_PAR_PAGE,
  maxLignes = LIGNES_PAR_PAGE,
} = {}) {
  const pagesCol = paginerGroupes(groupes, maxColonnes);
  const pagesLig = paginerEleves(eleves, maxLignes);
  const vides    = Math.max(0, Math.floor(Number(lignesVides) || 0));

  // Aucune colonne à imprimer : une feuille sans colonne n'est pas une feuille.
  if (pagesCol.length === 0) return { pages: [] };

  const pages = [];
  // L'ORDRE DE PARCOURS. Les colonnes d'abord, les élèves ensuite : on imprime
  // la feuille « compétences 1a–3b » pour toute la classe, PUIS la feuille
  // « 4–6b ». C'est l'ordre des deux feuilles photographiées, et c'est celui du
  // geste — un enseignant corrige une épreuve pour tout le monde, pas un élève
  // sur toutes les épreuves.
  for (const groupesPage of pagesCol) {
    const colonnes = groupesPage.flatMap((g) =>
      g.colonnes.map((c) => ({ ...c, groupeId: g.id, groupeLabel: g.label })));

    pagesLig.forEach((tranche, i) => {
      const lignes = tranche.map((e) => ({
        id:     e.id,
        numero: e.numero ?? '',
        nom:    e.nom ?? '',
        vide:   false,
        cellules: vierge || !valeur
          ? {}
          : Object.fromEntries(colonnes.map((c) => [c.id, valeur(e.id, c.id) ?? ''])),
      }));
      // Les lignes vides ne vont qu'au BAS DE LA DERNIÈRE page de la classe :
      // les semer entre deux tranches couperait la liste en deux.
      if (i === pagesLig.length - 1 && vides > 0) lignes.push(...lignesVierges(vides));

      pages.push({ groupes: groupesPage, colonnes, lignes, suite: i > 0 });
    });
  }

  return {
    pages: pages.map((p, i) => ({ ...p, no: i + 1, total: pages.length })),
  };
}

// ── Total de points d'un groupe ──────────────────────────────────────────────
//
// Ce que la feuille écrit sous le nom de la compétence : « /20 », la somme des
// barèmes de ses épreuves. Null dès qu'une colonne n'a pas de barème — un total
// partiel serait lu comme le total réel.
export function totalBareme(groupe) {
  const cols = (groupe?.colonnes || []).filter((c) => !c.calculee);
  if (cols.length === 0) return null;
  let somme = 0;
  for (const c of cols) {
    const n = Number(c.bareme);
    if (!Number.isFinite(n) || n <= 0) return null;
    somme += n;
  }
  return somme;
}
