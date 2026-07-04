// Résolution du nom de l'enseignant par matière, pour les bulletins.
//
// Modèle de données : un `subjects` porte `teacher_id` ; un `teachers` porte `name`.
// - SECOND CYCLE : les matières du bulletin SONT des `subjects` → lien direct via
//   teacher_id (teacherIndexById).
// - APC (premier cycle) : les matières viennent du référentiel (pas de `subjects`)
//   → on relie par correspondance de NOM avec les `subjects` de la classe.

export const normName = (s) =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

// { [teacherId]: name } — utilisé par le second cycle (subject.teacher_id direct).
export const teacherIndexById = (teachers) =>
  Object.fromEntries((teachers || []).filter((t) => t && t.id).map((t) => [t.id, t.name || '']));

// Nom de l'enseignant d'une matière `subjects` (second cycle). '' si non assigné.
export const teacherNameForSubject = (teacherById, subject) =>
  (subject?.teacher_id && teacherById?.[subject.teacher_id]) || '';

// APC : { [matiereId]: nom enseignant } en reliant chaque matière du référentiel
// au `subjects` homonyme de la classe (correspondance de nom normalisée).
export function teacherByMatiere(referentielMatieres, subjectsOfClass, teachers) {
  const byId = teacherIndexById(teachers);
  const subByName = new Map(
    (subjectsOfClass || [])
      .filter((s) => s?.teacher_id)
      .map((s) => [normName(s.name), s.teacher_id]),
  );
  const out = {};
  for (const m of referentielMatieres || []) {
    const tid = subByName.get(normName(m.nom));
    if (tid && byId[tid]) out[m.id] = byId[tid];
  }
  return out;
}
