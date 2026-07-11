// Logique PURE des périodes académiques — aucune dépendance React / store /
// réseau, pour être testable en isolation (node --test) et réutilisable par le
// hook (useActivePeriod) comme par le store (schoolStore).

// 'YYYY-MM-DD' (UTC), comparable lexicographiquement à teaching_start (ISO date).
export function toDateStr(d) {
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return '';
  return dt.toISOString().slice(0, 10);
}

// L'entier (grades.sequence) de la séquence active, ou null.
export function deriveActiveSequence(periods) {
  const active = (periods || []).find((p) => p.type === 'sequence' && p.status === 'active');
  return active?.sequence_order ?? null;
}

// Vrai si la séquence (par son sequence_order) est VERROUILLÉE (is_locked) pour
// l'année donnée. Le verrou vit dans academic_periods → synchronisé cloud/LAN,
// donc cross-appareil. `is_locked` = « édition matériellement bloquée » : l'écriture
// des notes d'une séquence verrouillée doit être refusée au niveau données, pas
// seulement grisée dans l'UI. (Le `status='closed'` seul NE bloque PAS, par design.)
export function isSequenceLockedByPeriod(periods, sequenceOrder, year = null) {
  if (sequenceOrder == null || sequenceOrder === '') return false;
  const ord = Number(sequenceOrder);
  return (periods || []).some(
    (p) => p && p.type === 'sequence' &&
           Number(p.sequence_order) === ord &&
           (!year || p.school_year === year) &&
           p.is_locked === true,
  );
}

// La séquence dont `teaching_start <= today` la plus récente. Renvoie la ligne
// période, ou null si aucune n'a démarré. Ne dépend QUE des données fournies.
export function computeAutoActive(periods, today = new Date()) {
  const t = toDateStr(today);
  if (!t) return null;
  const started = (periods || [])
    .filter((p) => p.type === 'sequence' && p.teaching_start && p.teaching_start <= t)
    .sort((a, b) => (a.teaching_start < b.teaching_start ? 1 : -1));
  return started[0] || null;
}
