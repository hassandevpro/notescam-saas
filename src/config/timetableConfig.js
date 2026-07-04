// ─────────────────────────────────────────────────────────────────────────────
// EMPLOI DU TEMPS — CONFIGURATION (source unique de vérité)
// ─────────────────────────────────────────────────────────────────────────────
// Catégories de matières (→ couleurs automatiques), trame horaire par défaut et
// bornes de la journée scolaire. Centralisé ici pour qu'une école puisse adapter
// sa réalité sans toucher à la logique métier (timetableEngine.js) ni à l'UI.
//
// Couleurs : exprimées en HEX et appliquées en `style={{}}` (pas en classes
// Tailwind dynamiques) — sinon le purge JIT de Tailwind 3 les supprimerait du
// bundle. Palette inspirée de Linear / Notion : fonds très clairs, accents nets.
// ─────────────────────────────────────────────────────────────────────────────

// Normalise un libellé pour la comparaison : minuscules + sans accents.
export function normalizeLabel(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

// Catégories ordonnées par priorité de détection (la 1re qui matche gagne).
export const CATEGORIES = [
  {
    id: 'sciences',
    label: ['Sciences', 'Sciences', 'Ciencias'],
    keywords: ['math', 'physique', 'chimie', 'svt', 'science', 'biolog', 'pct', 'pct ', 'geolog', 'technolog', 'statistique'],
    color: { bg: '#ecfdf5', border: '#6ee7b7', text: '#047857', dot: '#10b981' },
  },
  {
    id: 'informatique',
    label: ['Informatique', 'Computing', 'Informática'],
    keywords: ['informatique', 'ntic', 'tic', 'numerique', 'programmation', 'computer', 'algorithm'],
    color: { bg: '#f5f3ff', border: '#c4b5fd', text: '#6d28d9', dot: '#8b5cf6' },
  },
  {
    id: 'langues',
    label: ['Langues', 'Languages', 'Idiomas'],
    keywords: ['anglais', 'english', 'allemand', 'espagnol', 'espanol', 'arabe', 'latin', 'langue', 'francais', 'french'],
    color: { bg: '#eff6ff', border: '#93c5fd', text: '#1d4ed8', dot: '#3b82f6' },
  },
  {
    id: 'litteraire',
    label: ['Littéraire', 'Humanities', 'Letras'],
    keywords: ['histoire', 'geographie', 'geo', 'philo', 'litterature', 'ecm', 'civique', 'morale', 'religion', 'art', 'musique', 'dessin', 'economie'],
    color: { bg: '#fffbeb', border: '#fcd34d', text: '#b45309', dot: '#f59e0b' },
  },
  {
    id: 'eps',
    label: ['EPS', 'PE', 'EF'],
    keywords: ['eps', 'sport', 'education physique', 'gymnastique', 'athletisme'],
    color: { bg: '#fff1f2', border: '#fda4af', text: '#be123c', dot: '#f43f5e' },
  },
];

// Catégorie par défaut (récréations, libellés libres, matières non reconnues).
export const DEFAULT_CATEGORY = {
  id: 'autre',
  label: ['Autre', 'Other', 'Otro'],
  keywords: [],
  color: { bg: '#f8fafc', border: '#cbd5e1', text: '#475569', dot: '#94a3b8' },
};

// Index par id pour les lookups O(1).
export const CATEGORY_BY_ID = Object.fromEntries(
  [...CATEGORIES, DEFAULT_CATEGORY].map((c) => [c.id, c]),
);

// Trame horaire par défaut d'un établissement camerounais type (matin + après-midi
// avec pauses). Sert de squelette de grille même quand aucun cours n'est encore
// posé. Les plages réellement utilisées par les créneaux s'y ajoutent ensuite.
export const DEFAULT_PERIODS = [
  { start: '07:30', end: '09:30' },
  { start: '09:45', end: '11:45' },
  { start: '13:00', end: '15:00' },
  { start: '15:15', end: '17:15' },
];

// Bornes de la journée scolaire → tout créneau qui en sort = « dépassement horaire ».
export const SCHOOL_DAY = { min: '07:00', max: '18:30' };

// Durée maximale plausible d'un cours (minutes) → au-delà = dépassement signalé.
export const MAX_SLOT_MINUTES = 240;
