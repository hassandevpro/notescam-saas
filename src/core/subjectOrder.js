// ORDRE ET PÉRIMÈTRE DES MATIÈRES D'UNE CLASSE — UN SEUL ENDROIT QUI DÉCIDE
//
// ── LE DÉFAUT QUE CE MODULE FERME ──────────────────────────────────────────
//
// « Les matières choisies dans la classe, celles du bulletin et celles de la
// saisie des notes doivent être identiques. » Elles ne l'étaient pas : huit
// écrans partaient de la même table `subjects` et la triaient chacun à sa façon.
// Cinq ordres différents cohabitaient :
//
//   Bulletins.jsx / transcriptReadiness   position, puis coef décroissant, nom
//   Grades.jsx / Classes.jsx / Reports    coef décroissant, nom  (position IGNORÉE)
//   ClassSubjectsEditor / SubjectTeacher   position ?? 99, nom   (coef ignoré)
//   StudentProfile.jsx                     coef décroissant seul (nom ignoré)
//
// Conséquence concrète : « Réorganiser les matières » (le glisser-déposer de
// l'écran Bulletins, qui écrit `subjects.position`) changeait l'ordre du bulletin
// et de lui seul. L'administration rangeait Français en premier sur le bulletin,
// et l'enseignante retrouvait sa grille de saisie dans l'ordre des coefficients.
// Les deux écrans affichaient les mêmes matières, dans deux ordres, et la colonne
// que l'on croyait remplir n'était pas celle que l'on remplissait.
//
// Règle retenue — celle du BULLETIN, car c'est le document qui sort de l'école :
//   1. `position` croissante quand elle est posée (c'est un choix explicite) ;
//   2. les matières sans `position` gardent le tri historique (coef décroissant,
//      puis nom) et passent APRÈS celles qui en ont une.
// Rétrocompatible : une école qui n'a jamais réordonné ne voit rien changer.

/** Comparateur d'affichage des matières. Règle unique du produit. */
export function bySubjectOrder(a, b) {
  const ha = a?.position != null, hb = b?.position != null;
  if (ha && hb) return a.position - b.position;
  if (ha) return -1;
  if (hb) return 1;
  return (b?.coef || 0) - (a?.coef || 0)
    || String(a?.name ?? '').localeCompare(String(b?.name ?? ''));
}

/** Matières d'UNE classe, dans l'ordre du produit. Ne mute pas l'entrée. */
export function classSubjectsOf(subjects, classId) {
  if (!classId) return [];
  return (subjects || [])
    .filter((s) => s && s.class_id === classId)
    .sort(bySubjectOrder);
}

// Matières COMPOSITES : la note de la matière parente est CALCULÉE à partir de
// ses sous-composantes. On saisit donc les feuilles, jamais le parent — sinon
// deux notes concurrentes pour la même ligne de bulletin.
/** Retire les matières parentes d'une liste (saisie des notes). */
export function withoutCompositeParents(list) {
  const rows = list || [];
  const parentIds = new Set(rows.filter((s) => s?.parent_id).map((s) => s.parent_id));
  if (!parentIds.size) return rows;
  return rows.filter((s) => !parentIds.has(s?.id));
}
