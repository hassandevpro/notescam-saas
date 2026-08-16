// Âge d'un évènement en une poignée de caractères (« 5 min », « 3 h », « 2 j »).
// Extrait de NotificationBell pour que la cloche et le centre de notifications
// datent une même ligne de la même façon — deux copies finissaient par diverger.
import { tStatic } from './i18n';

export function timeAgo(dateStr) {
  const ts = new Date(dateStr).getTime();
  if (!Number.isFinite(ts)) return '';
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 1)  return tStatic("À l'instant", 'Just now', 'Ahora mismo');
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs} h`;
  return `${Math.floor(hrs / 24)} ${tStatic('j', 'd', 'd')}`;
}

/** Date complète, pour l'infobulle d'une ligne déjà datée en relatif. */
export function fullDate(dateStr) {
  const d = new Date(dateStr);
  return Number.isFinite(d.getTime()) ? d.toLocaleString() : '';
}
