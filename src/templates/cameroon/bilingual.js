// Cameroun — Enseignement Bilingue. Sous-système francophone (6e–3e + lycée A/C)
// ET sous-système anglophone (Form 1–5 + Lower/Upper Sixth Arts/Science).
// Chaque classe porte son `system` (FR ou EN) → les barèmes /20 (FR) et /100
// (EN) sont gérés automatiquement par le reste de l'app.

const S = (rows) => rows.map(([name, coef, opts = {}]) => ({ name, coef, ...opts }));

// Sous-composantes des matières composites (langues). La note finale est la
// moyenne pondérée des composantes ; celles-ci ne comptent pas séparément dans
// la moyenne générale (même principe que les modèles « général » / « primaire »).
const FR_COMPONENTS = [
  { name: 'Grammaire', coef: 1 }, { name: 'Orthographe', coef: 1 },
  { name: 'Conjugaison', coef: 1 }, { name: 'Vocabulaire', coef: 1 },
  { name: 'Expression écrite', coef: 2 }, { name: 'Expression orale', coef: 1 },
  { name: 'Lecture', coef: 1 },
];
const ANGLAIS_COMPONENTS = [
  { name: 'Grammar', coef: 2 }, { name: 'Vocabulary', coef: 1 },
  { name: 'Reading', coef: 1 }, { name: 'Writing', coef: 2 }, { name: 'Listening & Speaking', coef: 1 },
];
const ENGLISH_COMPONENTS = [
  { name: 'Grammar', coef: 2 }, { name: 'Comprehension', coef: 2 },
  { name: 'Essay / Composition', coef: 2 }, { name: 'Vocabulary', coef: 1 }, { name: 'Dictation', coef: 1 },
];
const FRENCH_COMPONENTS = [
  { name: 'Grammaire', coef: 2 }, { name: 'Vocabulaire', coef: 1 },
  { name: 'Compréhension', coef: 1 }, { name: 'Expression écrite', coef: 2 },
];
const FR     = { calc_method: 'weighted_avg', components: FR_COMPONENTS };
const ANG    = { calc_method: 'weighted_avg', components: ANGLAIS_COMPONENTS };
const ENG    = { calc_method: 'weighted_avg', components: ENGLISH_COMPONENTS };
const FRENCH = { calc_method: 'weighted_avg', components: FRENCH_COMPONENTS };

// ── Sous-système francophone ────────────────────────────────────────────────
const COLLEGE_FR = S([
  ['Français', 4, FR], ['Anglais', 4, ANG], ['Mathématiques', 4], ['SVTEEHB', 2],
  ['Sciences Physiques', 2], ['Histoire-Géographie', 2], ['ECM', 1], ['Informatique', 2], ['EPS', 2],
]);
const SERIE_A = S([
  ['Français', 4, FR], ['Anglais', 3, ANG], ['Histoire-Géographie', 3], ['Littérature', 3],
  ['Mathématiques', 2], ['Philosophie', 4], ['ECM', 1], ['EPS', 1],
]);
const SERIE_C = S([
  ['Mathématiques', 6], ['Sciences Physiques', 5], ['SVT', 4], ['Français', 3, FR],
  ['Anglais', 2, ANG], ['Informatique', 2], ['ECM', 1], ['EPS', 1],
]);

// ── Sous-système anglophone (barème /100) ───────────────────────────────────
const FORM_LOWER = S([
  ['English Language', 4, ENG], ['French', 3, FRENCH], ['Mathematics', 4], ['Biology', 2],
  ['Physics', 2], ['Chemistry', 2], ['History', 2], ['Geography', 2],
  ['Citizenship', 1], ['Computer Science', 2], ['Physical Education', 1],
]);
const SIXTH_ARTS = S([
  ['English Literature', 4], ['French', 3, FRENCH], ['History', 4], ['Geography', 4],
  ['Philosophy', 3], ['Citizenship', 1], ['Physical Education', 1],
]);
const SIXTH_SCIENCE = S([
  ['Mathematics', 5], ['Physics', 5], ['Chemistry', 4], ['Biology', 4],
  ['Computer Science', 2], ['Citizenship', 1], ['Physical Education', 1],
]);

const fr = (name, level, subjects, section = null) => ({ name, level, section, cycle: 'secondaire', system: 'FR', subjects });
const en = (name, level, subjects, section = null) => ({ name, level, section, cycle: 'secondaire', system: 'EN', subjects });

export default {
  id: 'cameroon_bilingual',
  country: 'cameroon',
  type: 'bilingual',
  label: { fr: 'Cameroun – Bilingue', en: 'Cameroon – Bilingual', es: 'Camerún – Bilingüe' },
  description: { fr: 'Sous-systèmes francophone (/20) et anglophone (/100).', en: 'French (/20) and English (/100) sub-systems.', es: 'Subsistemas francófono y anglófono.' },
  defaultSystem: 'FR',
  classes: [
    // Francophone
    fr('Sixième', '6e', COLLEGE_FR), fr('Cinquième', '5e', COLLEGE_FR),
    fr('Quatrième', '4e', COLLEGE_FR), fr('Troisième', '3e', COLLEGE_FR),
    fr('Seconde A', 'Seconde A', SERIE_A, 'A'), fr('Seconde C', 'Seconde C', SERIE_C, 'C'),
    fr('Première A', 'Première A', SERIE_A, 'A'), fr('Première C', 'Première C', SERIE_C, 'C'),
    fr('Terminale A', 'Terminale A', SERIE_A, 'A'), fr('Terminale C', 'Terminale C', SERIE_C, 'C'),
    // Anglophone
    en('Form 1', 'Form 1', FORM_LOWER), en('Form 2', 'Form 2', FORM_LOWER),
    en('Form 3', 'Form 3', FORM_LOWER), en('Form 4', 'Form 4', FORM_LOWER), en('Form 5', 'Form 5', FORM_LOWER),
    en('Lower Sixth Arts', 'Lower Sixth', SIXTH_ARTS, 'Arts'),
    en('Lower Sixth Science', 'Lower Sixth', SIXTH_SCIENCE, 'Science'),
    en('Upper Sixth Arts', 'Upper Sixth', SIXTH_ARTS, 'Arts'),
    en('Upper Sixth Science', 'Upper Sixth', SIXTH_SCIENCE, 'Science'),
  ],
};
