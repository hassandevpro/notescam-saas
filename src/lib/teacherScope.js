// Mode 1 « enseignant de matière » : périmètre des matières d'un enseignant.
//
// Le store ne restreint que les CLASSES (schoolStore.init) : la lecture des
// matières reste complète, parce que bulletins, relevés et classements doivent
// afficher TOUTE la classe, quel que soit l'enseignant connecté. Limiter la vue
// à « mes matières » est donc une décision d'ÉCRAN, prise poste de saisie par
// poste de saisie — ce module la centralise pour que tous l'appliquent pareil.
//
// Module PUR (aucun hook, aucun store) : testable par `node`.

import { normName } from './teacherNames.js';

// Réglage d'établissement `schools.grade_entry_mode` :
// 'principal' (défaut historique) : le titulaire saisit toutes les matières de
//   sa classe — rien n'est filtré.
// 'subject' : chaque enseignant ne voit et ne saisit que les matières qui lui
//   sont affectées (subjects.teacher_id).
export function gradeEntryMode(school) {
  return school?.grade_entry_mode === 'subject' ? 'subject' : 'principal';
}

// Vrai quand l'écran doit se limiter aux matières affectées à l'enseignant.
// Admin, censeur et surveillant gardent toujours la vue complète.
export function isSubjectScoped(role, school) {
  return role === 'teacher' && gradeEntryMode(school) === 'subject';
}

// Les lignes `subjects` affectées à l'enseignant — toutes classes, ou une seule.
// Un compte sans fiche enseignant (`teacherId` null) n'a aucune affectation : on
// renvoie [] plutôt que de laisser `teacher_id === null` lui ouvrir les matières
// non affectées.
export function mySubjects(subjects, teacherId, classId = null) {
  if (!teacherId) return [];
  return (subjects || []).filter(
    (s) => s.teacher_id === teacherId && (!classId || s.class_id === classId),
  );
}

// Ids des classes où l'enseignant assure au moins une matière.
export function myClassIds(subjects, teacherId) {
  return new Set(mySubjects(subjects, teacherId).map((s) => s.class_id));
}

// Noms normalisés de mes matières sur une classe. C'est le SEUL lien disponible
// entre une matière du référentiel APC (premier cycle) et la ligne `subjects`
// locale, qui n'en porte pas l'id (voir subjectsFromApcReferentiel) — même
// correspondance que celle utilisée par les bulletins (teacherByMatiere).
export function mySubjectNames(subjects, teacherId, classId) {
  return new Set(mySubjects(subjects, teacherId, classId).map((s) => normName(s.name)));
}
