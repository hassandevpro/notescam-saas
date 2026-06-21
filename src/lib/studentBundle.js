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
