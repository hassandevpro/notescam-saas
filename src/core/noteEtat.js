// LES QUATRE ÉTATS D'UNE CELLULE DE NOTE — logique pure.
//
// ── POURQUOI CE MODULE EXISTE ───────────────────────────────────────────────
//
// Jusqu'ici, l'application ne connaissait QU'UN SEUL état « pas de note » :
// `''`, `null` et `'ABS'` étaient traités identiquement — exclus de la moyenne
// — dans six moteurs et une vingtaine d'endroits. Un élève qui n'avait composé
// à rien n'avait donc pas 0 : il n'avait PAS DE MOYENNE, ou une moyenne calculée
// sur la seule épreuve qu'il avait faite. C'est l'inverse d'une sanction, et
// c'est ce que THE GENIUS a signalé le 2026-10-27.
//
// Mais « case vide » veut dire DEUX choses incompatibles : « l'élève n'a pas
// composé » et « l'enseignante n'a pas encore saisi ». Les confondre mettrait
// 25 zéros dès qu'un enseignant en a saisi 5 sur 30. D'où le découpage :
//
//   vide          l'enseignante n'a pas (encore) saisi   → hors moyenne
//   zéro          la même case, AU MOMENT DU BULLETIN    → compte 0 / max
//   absent        l'enseignante a cliqué « Absent »      → hors moyenne, « Abs »
//   non évaluée   la compétence n'a pas été évaluée      → hors moyenne, « ---- »
//                 dans CETTE classe à CETTE UA
//
// Le passage de `vide` à `zéro` se fait À L'IMPRESSION DU BULLETIN, et nulle
// part ailleurs : l'écran de saisie montre toujours une case vide pour une case
// vide. Décision du responsable, le 2026-10-27.
//
// ── ET POURQUOI C'EST UN RÉGLAGE, PAS UNE RÈGLE ─────────────────────────────
//
// Compter 0 change la moyenne de TOUS les bulletins déjà imprimés, dans toutes
// les écoles. Une école qui a toujours lu ses moyennes comme « sur ce qui a été
// évalué » verrait ses rangs bouger sans avoir rien demandé. `zeroSiManquante`
// est donc éteint par défaut : le comportement historique est intact tant qu'une
// école ne le réclame pas.
//
//   node src/core/_noteEtat.test.mjs

/** Ce qui s'imprime à la place d'une note quand la compétence n'a pas été évaluée. */
export const MARQUE_NON_EVALUEE = '- - - -';
/** Ce qui s'imprime pour une absence justifiée. */
export const MARQUE_ABSENT = 'Abs';

/**
 * État d'une cellule.
 *
 *   cellule   : { note, statut } — `note` brute (nombre, '', null, 'ABS'),
 *               `statut` vaut 'absent' quand l'enseignante l'a déclarée.
 *   contexte  : { nonEvaluee, zeroSiManquante }
 *               `nonEvaluee`      : la compétence n'est pas évaluée ici ;
 *               `zeroSiManquante` : on imprime un bulletin ET l'école le veut.
 *
 * @returns {'note'|'zero'|'absent'|'non_evaluee'|'vide'}
 */
export function etatDeNote(cellule, contexte = {}) {
  // L'ordre compte. « Non évaluée » gagne sur tout : si la compétence n'a pas
  // été évaluée, la question de savoir qui était absent ne se pose plus.
  if (contexte.nonEvaluee) return 'non_evaluee';

  const { note, statut } = cellule || {};
  if (statut === 'absent') return 'absent';
  // `'ABS'` historique : les écoles s'en servaient déjà comme d'une absence, et
  // il a toujours valu « hors moyenne ». On ne le retourne pas en zéro, sinon
  // des bulletins d'il y a deux ans changeraient de moyenne sans un clic.
  if (typeof note === 'string' && note.trim().toUpperCase() === 'ABS') return 'absent';

  const vide = note === null || note === undefined || String(note).trim() === '';
  if (!vide && Number.isFinite(Number(note))) return 'note';
  return contexte.zeroSiManquante ? 'zero' : 'vide';
}

/**
 * Points d'une cellule, pour un total de compétence ou de bulletin.
 *
 * `null` = la cellule ne compte NI au numérateur NI au dénominateur. C'est le
 * point délicat : un zéro doit entrer au dénominateur (0 sur 20, pas 0 sur 0),
 * sans quoi il n'a aucun effet sur la moyenne et tout ce module ne sert à rien.
 *
 * @returns {{ obtenu: number, possible: number } | null}
 */
export function pointsDeNote(etat, note, max) {
  const m = Number(max) || 0;
  if (etat === 'note') return { obtenu: Number(note), possible: m };
  if (etat === 'zero') return { obtenu: 0, possible: m };
  return null;   // absent, non_evaluee, vide
}

/** Ce qui s'écrit dans la case du bulletin. `null` = la note elle-même. */
export function marqueDeNote(etat) {
  if (etat === 'non_evaluee') return MARQUE_NON_EVALUEE;
  if (etat === 'absent') return MARQUE_ABSENT;
  if (etat === 'zero') return '0';
  if (etat === 'vide') return '';
  return null;
}
