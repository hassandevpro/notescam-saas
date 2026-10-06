// BARÈME D'UNE COLONNE DE SAISIE DU PRIMAIRE — logique pure.
//
// Le barème est porté par la NOTE (`prim_notes.points_max`). Une COLONNE de
// l'écran de saisie — un critère sur une unité d'apprentissage — n'a donc pas de
// barème à elle : elle le DÉDUIT de ses notes. Ces deux règles vivaient dans le
// composant, où rien ne pouvait les éprouver ; elles sont ici pour être testées.
//
// Pendant de `baremeFor` / `setBareme` côté premier cycle (ApcCompetenceWorkspace).

// Barème EN VIGUEUR pour une colonne.
//
// Ordre de lecture, et chaque cran a sa raison :
//   1. une note qui porte un barème explicite → c'est lui qui fait foi ;
//   2. une note SANS barème explicite → elle date d'avant la fonction, donc du
//      barème officiel du référentiel ;
//   3. aucune note → le barème que l'enseignant vient de poser sur une colonne
//      encore vide (`pending`), sinon l'officiel.
//
// LE CRAN 3 EST CELUI QUI MANQUAIT. Sans lui, poser un barème sur une colonne
// vide ne se voyait nulle part : la colonne réaffichait l'officiel, et il fallait
// le reposer une deuxième fois une fois les notes saisies.
//
//   notes : [{ note, points_max }] — les notes de la colonne, élève par élève
//           (une entrée absente/nulle = élève non noté)
export function baremeEnVigueur(notes, officiel, pending) {
  for (const r of notes || []) {
    if (r?.points_max != null) {
      const m = Number(r.points_max);
      if (Number.isFinite(m) && m > 0) return m;
    }
    if (r?.note != null && r.note !== '') return Number(officiel);
  }
  const p = Number(pending);
  return Number.isFinite(p) && p > 0 ? p : Number(officiel);
}

// Notes qui DÉPASSERAIENT un nouveau barème. Tant qu'il y en a, le changement
// est refusé : on ne transforme pas en silence un 18/20 en 18/10. L'enseignant
// corrige d'abord, et sait qui corriger — d'où le renvoi des porteurs et non d'un
// simple décompte.
//
//   porteurs : [{ id, name, note }] — un par élève noté
export function notesHorsBareme(porteurs, nouveau) {
  const max = Number(nouveau);
  if (!Number.isFinite(max) || max <= 0) return [];
  return (porteurs || []).filter((p) => {
    if (p?.note == null || p.note === '' || p.note === 'ABS') return false;
    const n = Number(p.note);
    return Number.isFinite(n) && n > max;
  });
}

// Un barème saisi est-il recevable ? Zéro ou négatif ne veut rien dire, et
// au-delà de 200 c'est une faute de frappe (2000 pour 20).
export const baremeRecevable = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 && n <= 200;
};
