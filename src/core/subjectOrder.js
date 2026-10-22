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

// ── POURQUOI UN DÉPARTAGE JUSQU'AU BOUT ────────────────────────────────────
//
// RELEVÉ EN PRODUCTION le 2026-10-22 : 8 rangs partagés par DEUX matières
// différentes dans la 5eme de THE GENIUS (Chinois et « Étude de texte » tous
// deux au rang 1, Géographie et SVT au rang 8…), 8 de même dans la 3e de LA
// RÉUSSITE. Le glisser-déposer de « Réorganiser les matières » n'interdit pas
// deux fois le même rang, et l'auto-configuration en pose un par matière du
// référentiel — deux séries peuvent donc se retrouver sur la même échelle.
//
// À rangs égaux, le comparateur rendait 0. `Array.sort` étant stable, l'ordre
// retombait alors sur celui de la liste REÇUE — qui n'est pas le même selon
// l'écran (le magasin, un filtre, une requête triée par nom). Les deux matières
// pouvaient donc s'échanger entre le bulletin et la grille de saisie : le
// défaut même que ce module a été écrit pour fermer, revenu par la porte des
// ex æquo.
//
// Le départage continue donc sur le coefficient, le nom, puis l'identifiant —
// arbitraire mais IDENTIQUE partout, ce qui est tout ce qu'on demande ici.
// Reste à l'école de corriger ses rangs : ce comparateur rend l'ordre stable,
// il ne devine pas celui qu'elle voulait.
const departage = (a, b) => (b?.coef || 0) - (a?.coef || 0)
  || String(a?.name ?? '').localeCompare(String(b?.name ?? ''))
  || String(a?.id ?? '').localeCompare(String(b?.id ?? ''));

/** Comparateur d'affichage des matières. Règle unique du produit. */
export function bySubjectOrder(a, b) {
  const ha = a?.position != null, hb = b?.position != null;
  if (ha && hb) return (a.position - b.position) || departage(a, b);
  if (ha) return -1;
  if (hb) return 1;
  return departage(a, b);
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
