// NAVIGATION AU CLAVIER DANS UNE GRILLE DE SAISIE — logique pure.
//
// La grille classique (GradeGrid, Grades.jsx) connaît les flèches depuis
// toujours : une colonne de notes, Entrée et ↓ descendent d'un élève. Les
// grilles PAR COMPÉTENCE — primaire et premier cycle — ne les connaissaient
// pas : `onKeyDown` n'y faisait qu'un `blur()` sur Entrée. Or ce sont justement
// elles qui ont DEUX dimensions (élèves × critères) et qui comptent le plus de
// cellules : onze compétences × quatre critères × trente élèves. La saisie s'y
// faisait à la souris, cellule par cellule.
//
// CE QUI REND CE MODULE MOINS ÉVIDENT QU'IL N'EN A L'AIR :
//
//  1. ← et → servent D'ABORD à déplacer le curseur dans le nombre qu'on est en
//     train d'écrire. Les détourner systématiquement rendrait toute correction
//     impossible — impossible de revenir sur le « 1 » de « 15 ». On ne change
//     donc de colonne que si le curseur est DÉJÀ au bord du texte et que rien
//     n'est sélectionné. C'est la règle du tableur, et elle ne s'apprend pas :
//     elle se sent.
//
//  2. Une cellule peut être FERMÉE. Au primaire, « Pratique » n'existe pas pour
//     un élève déclaré inapte en 6A, et une école qui n'évalue qu'à l'écrit a
//     masqué trois critères sur quatre. Sauter sur une cellule désactivée
//     perdrait le focus sans rien dire : on continue donc dans la même
//     direction jusqu'à une cellule ouverte, et on ne bouge pas s'il n'y en a
//     plus. D'où le prédicat `actif` plutôt qu'un simple ±1.
//
//   node src/lib/_gridNavigation.test.mjs

/**
 * Cellule à atteindre, ou `null` quand la touche ne doit PAS être interceptée
 * (le curseur reste dans le champ et la touche fait son travail habituel).
 *
 *   key    : la touche pressée ('Enter', 'ArrowDown', …)
 *   grille : { row, col, rows, cols, actif? }
 *            `actif(row, col)` → false pour une cellule fermée (défaut : tout ouvert)
 *   caret  : { auDebut, aLaFin } — position du curseur DANS le champ, pour ← et →
 *
 * @returns {{ row: number, col: number } | null}
 */
export function celluleSuivante(key, grille, caret = {}) {
  const { row, col, rows, cols } = grille || {};
  if (!Number.isInteger(row) || !Number.isInteger(col)) return null;
  const actif = typeof grille.actif === 'function' ? grille.actif : () => true;

  let dr = 0;
  let dc = 0;
  if (key === 'Enter' || key === 'ArrowDown') dr = 1;
  else if (key === 'ArrowUp') dr = -1;
  // ← et → : seulement au bord du texte, sinon c'est le curseur qui bouge.
  else if (key === 'ArrowLeft') { if (!caret.auDebut) return null; dc = -1; }
  else if (key === 'ArrowRight') { if (!caret.aLaFin) return null; dc = 1; }
  else return null;

  let r = row + dr;
  let c = col + dc;
  while (r >= 0 && r < rows && c >= 0 && c < cols) {
    if (actif(r, c)) return { row: r, col: c };
    r += dr;
    c += dc;
  }
  return null;
}
