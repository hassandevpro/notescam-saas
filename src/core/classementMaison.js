// UN CLASSEMENT QUE L'ÉCOLE CRÉE ELLE-MÊME — logique pure.
//
// ── CE QUI EST DEMANDÉ ──────────────────────────────────────────────────────
//
// Consigne du responsable, 2026-10-31 : « permet qu'on crée un classement
// directement dans modification de classe ». Les six classements vivaient dans
// `config/timetableConfig.js`, en dur : Sciences, Informatique, Langues,
// Littéraire, EPS, Autre. Une école qui voulait « Langues orientales » pour son
// chinois, ou « Travaux manuels », n'avait que « Autre ».
//
// ── POURQUOI AUCUNE TABLE, AUCUNE COLONNE ──────────────────────────────────
//
// `subjects.category` est déjà du TEXTE LIBRE, déjà synchronisé, présent en LAN
// comme au Cloud. Un classement maison s'y écrit donc tel quel. C'est décisif
// ici : une nouvelle colonne devrait partir au Cloud AVANT tout paquet LAN —
// sinon la poussée de synchronisation rejette la ligne ENTIÈRE (PGRST204) — et
// les écoles ne reçoivent aucune mise à jour automatique. Pour un confort
// d'écran, ce prix-là serait disproportionné.
//
// La contrepartie, assumée : le nom du classement vit dans la clé. Le renommer
// réécrit donc toutes les matières qui le portent (`renommer` plus bas), et un
// classement que plus aucune matière ne porte disparaît de la liste. C'est
// cohérent avec ce qu'il est : un classement existe parce que des matières y
// sont rangées.
//
// ── UN CLASSEMENT MAISON DOIT DIRE À QUELLE FAMILLE IL RESSEMBLE ────────────
//
// Et c'est la vraie raison d'être de ce module. Un classement n'est pas une
// étiquette décorative : `subjectGroup.js` le traduit en l'un des CINQ GROUPES
// IMPRIMÉS du bulletin, et `timetableEngine.js` en tire une couleur. Un
// classement qui ne dirait rien de sa famille retomberait sur l'heuristique du
// NOM de la matière — c'est-à-dire exactement le défaut que `subjectGroup.js` a
// été écrit pour fermer : « je crée une matière Espagnol, je choisis Langue, et
// sur le bulletin elle est dans AUTRES MATIÈRES ».
//
// L'école choisit donc deux choses : le NOM qu'elle veut lire, et la FAMILLE
// dont son classement hérite le comportement. « Langues orientales » ancré sur
// `langues` s'imprime dans LANGUES et prend la couleur des langues.
//
// FORMAT : `x:<famille>:<Nom libre>`
//   x         — préfixe qui distingue un classement maison d'un officiel ;
//   famille   — l'un des six ids de `timetableConfig` ;
//   Nom libre — ce que l'école lit à l'écran et sur le bulletin.
//
// MODULE PUR : aucun React, aucune base. Testé sous Node nu
// (`_classementMaison.test.mjs`) parce qu'il décide où une matière s'imprime.

const PREFIXE = 'x';
const SEP = ':';

// Les familles sur lesquelles un classement maison peut s'ancrer. Volontairement
// passées en paramètre plutôt qu'importées : ce module doit rester éprouvable
// sans tirer la configuration de l'emploi du temps derrière lui.
export const FAMILLES_ANCRAGE = ['sciences', 'informatique', 'langues', 'litteraire', 'eps', 'autre'];

// Un nom de classement acceptable. Les deux-points sont le séparateur de la
// clé : les laisser passer casserait la relecture, on les remplace donc par un
// tiret plutôt que de refuser la saisie de l'école.
export function nettoyerNom(nom) {
  return String(nom ?? '')
    .replace(/:/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40);
}

// Fabrique la clé. Renvoie null si l'école n'a pas donné de nom, ou si la
// famille d'ancrage n'existe pas — on ne pose jamais un classement qui ne
// saurait pas où s'imprimer.
export function encoder(famille, nom) {
  const n = nettoyerNom(nom);
  if (!n) return null;
  if (!FAMILLES_ANCRAGE.includes(famille)) return null;
  return [PREFIXE, famille, n].join(SEP);
}

export function estMaison(id) {
  return typeof id === 'string' && id.startsWith(PREFIXE + SEP);
}

// Relit une clé. Renvoie null pour tout ce qui n'est pas un classement maison
// valide — un classement officiel, une chaîne vide, une donnée abîmée.
export function decoder(id) {
  if (!estMaison(id)) return null;
  const morceaux = String(id).split(SEP);
  // `x`, la famille, puis le nom — qui a pu contenir des séparateurs avant
  // nettoyage sur d'anciennes clés : on recolle tout le reste.
  if (morceaux.length < 3) return null;
  const famille = morceaux[1];
  const nom = nettoyerNom(morceaux.slice(2).join(SEP));
  if (!nom || !FAMILLES_ANCRAGE.includes(famille)) return null;
  return { famille, nom };
}

// La famille dont ce classement hérite le comportement — bulletin ET couleur.
// Pour un classement officiel, c'est lui-même : l'appelant n'a donc pas à
// distinguer les deux cas.
export function familleDe(id) {
  const d = decoder(id);
  return d ? d.famille : id;
}

// Le libellé à afficher. Pour un classement officiel, renvoie null : c'est au
// référentiel de fournir le libellé traduit, pas à ce module.
export function nomDe(id) {
  const d = decoder(id);
  return d ? d.nom : null;
}

// LES CLASSEMENTS MAISON RÉELLEMENT EN USAGE dans une école, dédoublonnés et
// triés par nom. C'est la liste que l'écran propose : elle se DÉDUIT des
// matières, elle n'est stockée nulle part.
//
//   subjects : les lignes `subjects` de l'école (toutes classes confondues —
//              un classement créé en CE1 doit pouvoir servir en CM2)
export function classementsEnUsage(subjects) {
  const vus = new Map();
  for (const s of subjects || []) {
    const d = decoder(s?.category);
    if (!d) continue;
    if (!vus.has(s.category)) vus.set(s.category, { id: s.category, ...d, matieres: 0 });
    vus.get(s.category).matieres += 1;
  }
  return [...vus.values()].sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
}

// RENOMMER un classement : puisque le nom vit dans la clé, renommer est une
// réécriture des matières qui le portent. Renvoie les retouches à appliquer,
// jamais la liste entière — on n'écrit que ce qui change.
//
// Renvoie [] si le nouveau nom est vide, ou identique, ou si la clé de départ
// n'est pas un classement maison.
export function retouchesRenommage(subjects, idAncien, nomNouveau) {
  const d = decoder(idAncien);
  if (!d) return [];
  const idNouveau = encoder(d.famille, nomNouveau);
  if (!idNouveau || idNouveau === idAncien) return [];
  return (subjects || [])
    .filter((s) => s?.category === idAncien && s?.id)
    .map((s) => ({ id: s.id, category: idNouveau }));
}
