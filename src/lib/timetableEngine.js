// ─────────────────────────────────────────────────────────────────────────────
// EMPLOI DU TEMPS — MOTEUR MÉTIER (pur, sans React, sans I/O)
// ─────────────────────────────────────────────────────────────────────────────
// Toute l'intelligence du planificateur vit ici et est testable en isolation :
//   • catégorisation des matières → couleur automatique
//   • construction de la trame horaire (lignes de la grille)
//   • placement des créneaux dans les cellules (jour × plage)
//   • détection des conflits (enseignant, salle, classe, dépassement horaire)
//   • statistiques du tableau de bord (heures, profs, matières, vides, conflits)
//   • filtrage par vue (Classe / Enseignant / Salle / Matière)
//
// Aucune dépendance UI : les composants consomment ces fonctions et localisent
// eux-mêmes les libellés (les conflits renvoient un `kind` + des données, pas du
// texte traduit).
// ─────────────────────────────────────────────────────────────────────────────

import {
  CATEGORIES,
  DEFAULT_CATEGORY,
  CATEGORY_BY_ID,
  DEFAULT_PERIODS,
  SCHOOL_DAY,
  MAX_SLOT_MINUTES,
  normalizeLabel,
} from '../config/timetableConfig';

export const VIEWS = ['class', 'teacher', 'room', 'subject'];

// ── Temps ──────────────────────────────────────────────────────────────────
export const hhmm = (t) => (t ? String(t).slice(0, 5) : '');

export function toMinutes(t) {
  const m = hhmm(t).match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return NaN;
  return Number(m[1]) * 60 + Number(m[2]);
}

export function durationMinutes(slot) {
  const d = toMinutes(slot.end_time) - toMinutes(slot.start_time);
  return Number.isFinite(d) && d > 0 ? d : 0;
}

// Deux intervalles [aStart,aEnd) et [bStart,bEnd) se chevauchent-ils ?
export function timesOverlap(aStart, aEnd, bStart, bEnd) {
  const as = toMinutes(aStart), ae = toMinutes(aEnd);
  const bs = toMinutes(bStart), be = toMinutes(bEnd);
  if ([as, ae, bs, be].some((n) => !Number.isFinite(n))) return false;
  return as < be && bs < ae;
}

export const slotsOverlap = (a, b) =>
  a.day_of_week === b.day_of_week &&
  timesOverlap(a.start_time, a.end_time, b.start_time, b.end_time);

// ── Catégorie / couleur ──────────────────────────────────────────────────────
// Déduit la catégorie d'un cours à partir du nom de la matière (ou du libellé
// libre). Heuristique par mots-clés : aucune colonne supplémentaire nécessaire.
export function inferCategory(name) {
  const n = normalizeLabel(name);
  if (!n) return DEFAULT_CATEGORY;
  for (const cat of CATEGORIES) {
    if (cat.keywords.some((kw) => n.includes(kw))) return cat;
  }
  return DEFAULT_CATEGORY;
}

// Résout le « titre + enseignant + salle + catégorie/couleur » d'un créneau.
export function decorateSlot(slot, { subjects = [], teachers = [], classes = [] } = {}) {
  const subject = subjects.find((s) => s.id === slot.subject_id) || null;
  const teacher = teachers.find((t) => t.id === slot.teacher_id) || null;
  const cls = classes.find((c) => c.id === slot.class_id) || null;
  const title = subject?.name || slot.label || '—';
  const category = inferCategory(subject?.name || slot.label);
  return {
    ...slot,
    title,
    subjectName: subject?.name || null,
    teacherName: teacher?.name || null,
    className: cls?.name || null,
    room: slot.room || null,
    category,
    color: category.color,
    start: hhmm(slot.start_time),
    end: hhmm(slot.end_time),
  };
}

export const categoryLabel = (id, t) => {
  const c = CATEGORY_BY_ID[id] || DEFAULT_CATEGORY;
  return t(...c.label);
};

// ── Trame horaire (lignes de la grille) ──────────────────────────────────────
// Union des plages par défaut + des plages réellement utilisées par les créneaux,
// dédupliquées et triées. Garantit qu'aucun cours n'est masqué même s'il sort de
// la trame standard, tout en affichant un squelette utile quand la grille est vide.
export function buildTimeRanges(slots = [], periods = DEFAULT_PERIODS) {
  const map = new Map();
  const add = (start, end) => {
    const s = hhmm(start), e = hhmm(end);
    if (!s || !e) return;
    const key = `${s}|${e}`;
    if (!map.has(key)) map.set(key, { start: s, end: e, key });
  };
  periods.forEach((p) => add(p.start, p.end));
  slots.forEach((s) => add(s.start_time, s.end_time));
  return [...map.values()].sort(
    (a, b) => toMinutes(a.start) - toMinutes(b.start) || toMinutes(a.end) - toMinutes(b.end),
  );
}

// Le créneau appartient à la ligne dont la plage contient son heure de début.
export function slotInRange(slot, range) {
  const s = toMinutes(slot.start_time);
  const rs = toMinutes(range.start), re = toMinutes(range.end);
  return s >= rs && s < re;
}

// Construit la grille [range][day] → liste de créneaux (plusieurs = empilés/conflit).
export function buildGrid(slots = [], ranges = [], days = 6) {
  // Chaque créneau est assigné à UNE SEULE plage, sinon il apparaît en double :
  // les plages se chevauchent (période par défaut 07:30-08:30 vs créneau long
  // 07:30-09:30) et toutes deux « contiennent » l'heure de début 07:30.
  // Priorité : la plage exactement égale au créneau (toujours présente, car
  // buildTimeRanges l'ajoute) ; à défaut, la 1re plage (triée) contenant le début.
  const assigned = new Map(); // slot.id → range.key
  for (const s of slots) {
    const exact = ranges.find((r) => r.start === hhmm(s.start_time) && r.end === hhmm(s.end_time));
    const hit = exact || ranges.find((r) => slotInRange(s, r));
    if (hit) assigned.set(s.id, hit.key);
  }
  return ranges.map((range) => ({
    range,
    cells: Array.from({ length: days }, (_, i) => {
      const day = i + 1;
      return slots.filter((s) => s.day_of_week === day && assigned.get(s.id) === range.key);
    }),
  }));
}

// ── Détection des conflits ───────────────────────────────────────────────────
// Renvoie une liste d'objets neutres (sans texte traduit) :
//   { kind:'teacher'|'room'|'class'|'overflow', day, a, b?, entity? }
// `a`/`b` sont les créneaux concernés ; `entity` le nom partagé (prof/salle).
export function detectConflicts(slots = [], ctx = {}) {
  const { teachers = [], classes = [] } = ctx;
  const conflicts = [];
  const nameOfTeacher = (id) => teachers.find((t) => t.id === id)?.name || '—';
  const nameOfClass = (id) => classes.find((c) => c.id === id)?.name || '—';

  // Paires qui se chevauchent (même jour, plages sécantes).
  for (let i = 0; i < slots.length; i++) {
    for (let j = i + 1; j < slots.length; j++) {
      const a = slots[i], b = slots[j];
      if (!slotsOverlap(a, b)) continue;

      if (a.teacher_id && a.teacher_id === b.teacher_id) {
        conflicts.push({ kind: 'teacher', day: a.day_of_week, a, b, entity: nameOfTeacher(a.teacher_id) });
      }
      if (a.room && b.room && normalizeLabel(a.room) === normalizeLabel(b.room)) {
        conflicts.push({ kind: 'room', day: a.day_of_week, a, b, entity: a.room });
      }
      if (a.class_id && a.class_id === b.class_id) {
        conflicts.push({ kind: 'class', day: a.day_of_week, a, b, entity: nameOfClass(a.class_id) });
      }
    }
  }

  // Dépassements horaires (hors bornes journée ou durée déraisonnable).
  for (const s of slots) {
    const start = toMinutes(s.start_time), end = toMinutes(s.end_time);
    const min = toMinutes(SCHOOL_DAY.min), max = toMinutes(SCHOOL_DAY.max);
    const tooLong = end - start > MAX_SLOT_MINUTES;
    if (start < min || end > max || end <= start || tooLong) {
      conflicts.push({ kind: 'overflow', day: s.day_of_week, a: s });
    }
  }
  return conflicts;
}

// Ensemble des ids de créneaux impliqués dans au moins un conflit (→ surlignage).
export function conflictedSlotIds(conflicts = []) {
  const set = new Set();
  for (const c of conflicts) {
    if (c.a?.id) set.add(c.a.id);
    if (c.b?.id) set.add(c.b.id);
  }
  return set;
}

// ── Statistiques du tableau de bord ──────────────────────────────────────────
// `slots`       : créneaux du périmètre courant (toute l'école pour les agrégats).
// `gridSlots`   : créneaux de la grille affichée (classe sélectionnée) → cases vides.
export function computeStats({ slots = [], gridSlots = [], ranges = [], days = 6, conflicts = [] }) {
  const totalMinutes = slots.reduce((acc, s) => acc + durationMinutes(s), 0);
  const teacherIds = new Set(slots.filter((s) => s.teacher_id).map((s) => s.teacher_id));
  const subjectIds = new Set(slots.filter((s) => s.subject_id).map((s) => s.subject_id));

  // Cases libres = (lignes × jours) non occupées par la grille affichée.
  const occupied = new Set();
  for (const s of gridSlots) {
    const r = ranges.find((rg) => slotInRange(s, rg));
    if (r) occupied.add(`${r.key}#${s.day_of_week}`);
  }
  const totalCells = ranges.length * days;
  const freeCells = Math.max(0, totalCells - occupied.size);

  return {
    totalHours: Math.round((totalMinutes / 60) * 10) / 10,
    teacherCount: teacherIds.size,
    subjectCount: subjectIds.size,
    freeCells,
    conflictCount: conflicts.length,
  };
}

// ── Filtrage par vue ─────────────────────────────────────────────────────────
export function filterByView(slots = [], view, entityId) {
  if (!entityId) return view === 'class' ? [] : slots;
  switch (view) {
    case 'class':   return slots.filter((s) => s.class_id === entityId);
    case 'teacher': return slots.filter((s) => s.teacher_id === entityId);
    case 'room':    return slots.filter((s) => normalizeLabel(s.room) === normalizeLabel(entityId));
    case 'subject': return slots.filter((s) => s.subject_id === entityId);
    default:        return slots;
  }
}

// Salles distinctes réellement utilisées (pour le sélecteur de la Vue Salle).
export function distinctRooms(slots = []) {
  const seen = new Map();
  for (const s of slots) {
    if (!s.room) continue;
    const key = normalizeLabel(s.room);
    if (!seen.has(key)) seen.set(key, s.room);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}
