// Garde d'idempotence de la promotion d'année (audit C3). Logique PURE, aucune
// dépendance (I/O, store, countries) → testable en Node.
//
// La promotion DUPLIQUE toute la cohorte (classes + matières + élèves + affectations)
// vers `newYear`. Sans garde, la relancer — double-clic, reprise après coupure
// réseau, échec partiel avant le basculement d'année — recrée TOUT en double.
// `promoteYear` appelle donc cette garde AVANT tout travail.

// Vrai dès qu'une classe de `newYear` existe déjà pour l'école → une promotion a
// (au moins partiellement) déjà eu lieu, on la refuse.
// `allClasses` : lecture COMPLÈTE (IDB, toutes années) — les classes de newYear
// ne sont pas dans l'état en mémoire (filtré sur l'année active) tant que l'école
// n'a pas basculé d'année.
export function promotionAlreadyDone(allClasses, schoolId, newYear) {
  if (!newYear) return false;
  return (allClasses || []).some(
    (c) => c && c.school_id === schoolId && c.current_year === newYear,
  );
}
