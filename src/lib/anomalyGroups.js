// Regroupe les anomalies de relevés pour qu'elles se LISENT.
//
// Avant : une ligne par élève et par anomalie. Une matière jamais notée dans une
// classe de 19 élèves produisait 19 lignes identiques, que personne ne comprenait.
// Ici : UNE ligne par (classe, cause). On y lit tout de suite si c'est toute la
// classe (matière pas encore notée) ou quelques élèves (oublis de saisie).
//
// Fonction pure (aucun import) : testable seule.
//
// anomalies : [{ id, name, classId, className, status: 'blocked'|'warning', issues: [{ code, names? }] }]
// classTotals : { [classId]: effectif }
export function groupAnomalies(anomalies, classTotals = {}) {
  const map = new Map();
  const add = (key, base, student) => {
    if (!map.has(key)) map.set(key, { ...base, students: [] });
    map.get(key).students.push(student);
  };

  for (const a of anomalies || []) {
    const student = { id: a.id, name: a.name };
    for (const iss of a.issues || []) {
      if (iss.code === 'missing_subjects') {
        // Une ligne PAR MATIÈRE : c'est la matière qu'on va aller saisir.
        for (const n of iss.names || []) {
          add(`${a.classId}|subject|${n}`,
            { status: 'warning', classId: a.classId, className: a.className, code: 'missing_subject', subject: n }, student);
        }
      } else {
        add(`${a.classId}|${iss.code}`,
          { status: a.status, classId: a.classId, className: a.className, code: iss.code }, student);
      }
    }
  }

  return [...map.values()]
    .map((g) => {
      const total = classTotals[g.classId] ?? null;
      return { ...g, total, wholeClass: total != null && g.students.length >= total };
    })
    .sort((x, y) =>
      (x.status === 'blocked' ? 0 : 1) - (y.status === 'blocked' ? 0 : 1)
      || (y.wholeClass ? 1 : 0) - (x.wholeClass ? 1 : 0)
      || y.students.length - x.students.length
      || String(x.className).localeCompare(String(y.className)));
}

// Phrase lisible d'un groupe. `t` = useT().
export function describeGroup(g, t) {
  const n = g.students.length;
  const names = g.students.slice(0, 4).map((s) => s.name).join(', ') + (n > 4 ? ` +${n - 4}` : '');
  switch (g.code) {
    case 'missing_subject':
      return g.wholeClass
        ? {
            title: t(`${g.subject} : aucune note pour toute la classe`, `${g.subject}: no grades for the whole class`, `${g.subject}: sin notas en toda la clase`),
            detail: t(`${n} élèves concernés. Ce n'est pas un oubli sur un élève : la matière n'a pas encore été notée.`, `${n} students. Not a single-student slip: the subject has not been graded yet.`, `${n} alumnos.`),
          }
        : {
            title: t(`${g.subject} : ${n} élève(s) sans note`, `${g.subject}: ${n} student(s) without a grade`, `${g.subject}: ${n} alumno(s) sin nota`),
            detail: names,
          };
    case 'no_grades':
      return g.wholeClass
        ? { title: t('Aucune note saisie dans la classe', 'No grades entered in this class', 'Sin notas en la clase'), detail: t(`${n} élèves : pas de relevé à produire tant que les notes ne sont pas saisies.`, `${n} students: no transcript until grades are entered.`, `${n} alumnos.`) }
        : { title: t(`${n} élève(s) sans aucune note`, `${n} student(s) with no grades at all`, `${n} alumno(s) sin notas`), detail: names };
    case 'no_subjects':
      return { title: t('Aucune matière configurée', 'No subjects configured', 'Sin asignaturas'), detail: t('Configurer les matières de la classe.', 'Configure the class subjects.', 'Configurar asignaturas.') };
    case 'no_reference':
      return { title: t('Référentiel officiel indisponible', 'Official curriculum unavailable', 'Referencial no disponible'), detail: t('Chargement en cours ou programme non pris en charge.', 'Still loading or unsupported programme.', '') };
    case 'no_average':
      return { title: t(`${n} élève(s) sans moyenne`, `${n} student(s) without an average`, `${n} sin promedio`), detail: names };
    case 'no_rank':
      return { title: t('Rang non calculé', 'Rank not computed', 'Puesto no calculado'), detail: names };
    default:
      return { title: t('Anomalie', 'Issue', 'Anomalía'), detail: names };
  }
}
