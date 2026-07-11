// Corbeille élève — capture/restauration du « bundle » de données liées.
//
// Pourquoi : supprimer un élève déclenche un DELETE physique côté backend, et
// les tables liées (grades, student_fees, fee_payments, student_absences…)
// déclarent toutes `student_id … REFERENCES students(id) ON DELETE CASCADE`
// (Supabase + SQLite LAN). Le cascade efface donc DÉFINITIVEMENT notes, frais
// et paiements. La corbeille ne sauvait que la ligne élève → la restauration
// rendait un élève vide. On capture désormais TOUT ce qui dépend de l'élève
// pour pouvoir le réinjecter à la restauration.
//
// Note : en IDB, les absences/conduite sont fusionnées dans les records `grades`
// sous des clés spéciales `__abs_j__`, `__conduite__`, etc. (cf. schoolStore
// `_refreshFromSupabase`). Capturer les records `grades` suffit donc à conserver
// aussi les absences ; le découpage notes/absences est refait à la restauration.

// Rassemble toutes les lignes liées à un élève à partir des collections fournies.
// Fonction PURE (aucune dépendance IDB / réseau / React) → testable en Node.
//
// @param {string} studentId
// @param {{ grades?: object[], fees?: object[], payments?: object[] }} sources
// @returns {{ grades: object[], fees: object[], payments: object[] }}
export function collectStudentBundle(studentId, { grades = [], fees = [], payments = [] } = {}) {
  const byStudent = (rows) => rows.filter((r) => r && r.student_id === studentId);
  return {
    grades:   byStudent(grades),
    fees:     byStudent(fees),
    payments: byStudent(payments),
  };
}

// Vrai si le bundle ne contient aucune donnée liée (utile pour éviter du travail
// inutile à la restauration).
export function isEmptyBundle(bundle) {
  if (!bundle) return true;
  const { grades = [], fees = [], payments = [] } = bundle;
  return grades.length === 0 && fees.length === 0 && payments.length === 0;
}

// ── Corbeille MATIÈRE ───────────────────────────────────────────────────────
// Supprimer une matière déclenche un DELETE cloud qui efface EN CASCADE toutes
// ses notes (`grades.subject_id … ON DELETE CASCADE`). En IDB, une note vit comme
// une cellule `scores[subject_id]` d'un record `grades` par (classe×élève×séq).
// On capture chaque cellule de la matière pour pouvoir la ré-écrire (cloud + IDB)
// à la restauration. Fonction PURE.
// @returns {{ subjectGrades: {key,class_id,student_id,sequence,subject_id,value}[] }}
export function collectSubjectBundle(subjectId, { grades = [] } = {}) {
  const subjectGrades = [];
  for (const g of grades) {
    const v = g?.scores?.[subjectId];
    if (v === undefined || v === null || v === '') continue;
    subjectGrades.push({
      key: g.key, class_id: g.class_id, student_id: g.student_id,
      sequence: g.sequence, subject_id: subjectId, value: v,
    });
  }
  return { subjectGrades };
}

// ── Corbeille CLASSE ────────────────────────────────────────────────────────
// Supprimer une classe déclenche un DELETE cloud qui efface EN CASCADE ses
// matières ET ses élèves (`subjects.class_id` / `students.class_id … ON DELETE
// CASCADE`), donc, transitivement, les notes, frais et paiements de ces élèves.
// On capture l'ensemble pour une restauration complète. Fonction PURE.
// @returns {{ subjects, students, grades, fees, payments }}
export function collectClassBundle(classId, { subjects = [], students = [], grades = [], fees = [], payments = [] } = {}) {
  const classStudents = students.filter((s) => s && s.class_id === classId);
  const studentIds = new Set(classStudents.map((s) => s.id));
  return {
    subjects: subjects.filter((s) => s && s.class_id === classId),
    students: classStudents,
    grades:   grades.filter((g) => g && g.class_id === classId),
    fees:     fees.filter((f) => f && studentIds.has(f.student_id)),
    payments: payments.filter((p) => p && studentIds.has(p.student_id)),
  };
}

// Vrai si un bundle de classe ne contient aucune donnée dépendante.
export function isEmptyClassBundle(bundle) {
  if (!bundle) return true;
  const { subjects = [], students = [], grades = [], fees = [], payments = [] } = bundle;
  return !subjects.length && !students.length && !grades.length && !fees.length && !payments.length;
}

// Sépare un objet `scores` (record IDB grades) en deux : les vraies notes
// (clés = subject_id) et les champs spéciaux (absences/conduite/conseil, clés
// préfixées par `__`). Reproduit exactement le découpage de schoolStore.saveGrade.
export function splitScores(scores = {}) {
  const grades  = {};
  const special = {};
  for (const [k, v] of Object.entries(scores)) {
    if (k.startsWith('__')) special[k] = v;
    else grades[k] = v;
  }
  return { grades, special };
}

export function hasRealGrades(scores = {}) {
  return Object.keys(scores).some((k) => !k.startsWith('__'));
}

export function hasSpecialFields(scores = {}) {
  return Object.keys(scores).some((k) => k.startsWith('__'));
}
