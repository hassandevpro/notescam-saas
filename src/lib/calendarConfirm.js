// Confirmation du calendrier par la direction. La preuve vit dans `schools.calendar_confirmed_at`
// (partagée) ; à défaut (colonne pas encore migrée côté Cloud), un repli par navigateur évite
// de réafficher le bandeau en boucle sans prétendre que c'est partagé.
const cle = (schoolId) => `nc_calendar_confirmed_${schoolId}`;

export function calendrierConfirme(school) {
  if (!school) return true;
  if (school.calendar_confirmed_at) return true;
  try { return localStorage.getItem(cle(school.id)) === '1'; } catch { return false; }
}

/** Mémorise la confirmation sur ce navigateur (repli quand la colonne n'existe pas). */
export function memoriserConfirmationLocale(schoolId) {
  try { localStorage.setItem(cle(schoolId), '1'); } catch { /* ignoré */ }
}
