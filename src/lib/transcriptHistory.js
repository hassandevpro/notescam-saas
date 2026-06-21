// Chargement des données d'une année académique donnée (active OU archivée),
// pour le relevé multi-années. Fonctionne en cloud / LAN (schoolService →
// Supabase ou serveur local via alias) et hors-ligne (repli IndexedDB).
//
// La promotion duplique la ligne élève par année (cf. year_promotion_roster_fix) :
// le lien d'un même élève d'une année à l'autre se fait donc par MATRICULE
// (identifiant stable) ou, à défaut, par nom normalisé.

import { backendOnline } from './edition';
import {
  fetchClasses, fetchSubjects, fetchStudents, fetchGrades, gradeRowsToMap, fetchDistinctYears,
} from './schoolService';
import { initDB, classesDB, subjectsDB, studentsDB, gradesDB } from './db';

// Liste de toutes les années présentes (active + archives), récentes d'abord.
export async function listYears(schoolId) {
  if (backendOnline()) {
    return (await fetchDistinctYears(schoolId)) || [];
  }
  await initDB();
  const all = await classesDB.getAll();
  return [...new Set(
    all.filter((c) => c.school_id === schoolId).map((c) => c.current_year).filter(Boolean)
  )].sort().reverse();
}

// Renvoie { classes, subjects, students, gradeMap } pour (schoolId, year).
export async function loadYearAcademics(schoolId, year) {
  if (backendOnline()) {
    const classes = (await fetchClasses(schoolId, year)) || [];
    const classIds = classes.map((c) => c.id);
    if (!classIds.length) return { classes, subjects: [], students: [], gradeMap: {} };
    const [subjects, students, grades] = await Promise.all([
      fetchSubjects(schoolId, classIds),
      fetchStudents(schoolId, classIds),
      fetchGrades(schoolId, classIds),
    ]);
    return {
      classes,
      subjects: subjects || [],
      students: students || [],
      gradeMap: gradeRowsToMap(grades || []),
    };
  }

  // Repli hors-ligne : tout l'historique est présent en IndexedDB.
  await initDB();
  const [allC, allSub, allStud, allGr] = await Promise.all([
    classesDB.getAll(), subjectsDB.getAll(), studentsDB.getAll(), gradesDB.getAll(),
  ]);
  const classes = allC.filter((c) => c.school_id === schoolId && c.current_year === year);
  const classIds = new Set(classes.map((c) => c.id));
  const gradeMap = {};
  for (const g of allGr) {
    if (!classIds.has(g.class_id)) continue;
    gradeMap[`${g.class_id}_${g.student_id}_${g.sequence}`] = g.scores || {};
  }
  return {
    classes,
    subjects: allSub.filter((s) => classIds.has(s.class_id)),
    students: allStud.filter((s) => classIds.has(s.class_id)),
    gradeMap,
  };
}

const norm = (s) => (s || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Retrouve, dans une année chargée, la ligne élève correspondant à `ref`.
export function matchStudent(ref, students) {
  const refMat = (ref.matricule || '').trim();
  if (refMat) {
    const byMat = students.find((s) => (s.matricule || '').trim() === refMat);
    if (byMat) return byMat;
  }
  const refName = norm(ref.name);
  return students.find((s) => norm(s.name) === refName) || null;
}
