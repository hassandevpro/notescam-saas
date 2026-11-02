// OÙ EST LA COLONNE « ÉLÈVE » DANS UNE FEUILLE DE NOTES ? — logique pure.
//
// ── POURQUOI CE MODULE EXISTE ────────────────────────────────────────────────
// Les grilles de saisie par compétences exportent et réimportent un classeur
// dont la PREMIÈRE colonne était le nom de l'élève, en dur : l'import lisait
// `cells[0]` et traitait tout ce qui suit (`j >= 1`) comme des colonnes de
// notes.
//
// L'ajout de la colonne « N° » (demande du 2026-11-01 : le numéro doit « se
// retrouver dans l'export de l'écran de saisie ») déplace le nom en deuxième
// position. Sans ce module, l'import aurait apparié les élèves sur la colonne
// des numéros — aucun nom reconnu, zéro note importée — et aurait pris le nom
// pour une colonne de notes.
//
// DEUX GÉNÉRATIONS DE FICHIERS DOIVENT ENTRER, et c'est tout l'enjeu : les
// classeurs déjà exportés par les versions précédentes (sans N°) comme ceux
// qui sortiront désormais (avec N°). On ne devine donc pas par position : on
// RECONNAÎT l'en-tête de numérotation et on passe à la colonne suivante.
//
// Les feuilles remplies à la main comptent aussi : une secrétaire qui numérote
// sa colonne « No », « n° », « Num », « #' » tombe dans le même cas.

// En-tête d'une colonne de NUMÉROTATION — pas une colonne de données.
// Volontairement étroit : « Note » ou « Niveau » ne doivent pas y entrer, sinon
// une vraie colonne de notes serait prise pour un numéro et jamais importée.
const EN_TETE_NUMERO = /^(n\s*[°ºo]\.?|no\.?|num\.?|num[eé]ro|number|nb|#)$/i;

const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

export const estEnTeteNumero = (h) => EN_TETE_NUMERO.test(norm(h));

/**
 * Index de la colonne qui porte le NOM de l'élève dans une ligne d'en-tête.
 * On saute les colonnes de numérotation placées avant elle ; à défaut d'en-tête
 * exploitable, on retombe sur 0 — le comportement historique.
 * @param {Array} header ligne d'en-tête du classeur
 * @returns {number} index (0 ou plus)
 */
export function indexColonneEleve(header) {
  const h = Array.isArray(header) ? header : [];
  for (let j = 0; j < h.length; j++) {
    if (!estEnTeteNumero(h[j])) return j;
  }
  return 0;
}
