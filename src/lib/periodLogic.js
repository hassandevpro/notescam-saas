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
