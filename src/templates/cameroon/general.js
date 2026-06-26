// Cameroun — Enseignement Général (francophone). Collège (6e–3e) + Lycée
// (séries A littéraire / C scientifique). Coefficients officiels indicatifs :
// l'établissement peut les ajuster après génération (point #6).

const S = (rows) => rows.map(([name, coef, opts = {}]) => ({ name, coef, ...opts }));

// Sous-composantes du Français (matière composite) — la note finale est la
// moyenne pondérée des composantes ; elles ne comptent pas séparément dans la
// moyenne générale (point #4).
const FR_COMPONENTS = [
  { name: 'Grammaire', coef: 1 }, { name: 'Orthographe', coef: 1 },
  { name: 'Conjugaison', coef: 1 }, { name: 'Vocabulaire', coef: 1 },
  { name: 'Expression écrite', coef: 2 }, { name: 'Expression orale', coef: 1 },
  { name: 'Lecture', coef: 1 },
];

// Premier cycle (collège) — tronc commun.
const COLLEGE = S([
  ['Français', 4, { calc_method: 'weighted_avg', components: FR_COMPONENTS }],
  ['Anglais', 4],
  ['Mathématiques', 4],
  ['SVTEEHB', 2],
  ['Sciences Physiques', 2],
  ['Histoire-Géographie', 2],
  ['ECM', 1],
  ['Informatique', 2],
  ['Langue Vivante 2', 2],
  ['EPS', 2],
  ['Travaux Manuels', 1],
]);

// Second cycle — Série A (littéraire).
const SERIE_A = [
  ['Français', 4], ['Anglais', 3], ['Langue Vivante 2', 3], ['Histoire-Géographie', 3],
  ['Littérature', 3], ['Mathématiques', 2], ['SVT', 2], ['ECM', 1], ['EPS', 1],
];
// Second cycle — Série C (scientifique, maths/physique).
const SERIE_C = [
  ['Mathématiques', 6], ['Sciences Physiques', 5], ['SVT', 4], ['Français', 3],
  ['Anglais', 2], ['Histoire-Géographie', 2], ['Informatique', 2], ['ECM', 1], ['EPS', 1],
];
// Second cycle — Série D (sciences naturelles, biologie/SVT dominantes).
const SERIE_D = [
  ['SVT', 6], ['Sciences Physiques', 4], ['Mathématiques', 4], ['Français', 3],
  ['Anglais', 2], ['Histoire-Géographie', 2], ['Informatique', 2], ['ECM', 1], ['EPS', 1],
];
// Second cycle — Série E (mathématiques et technologie).
const SERIE_E = [
  ['Mathématiques', 6], ['Sciences Physiques', 5], ['Technologie', 4], ['Français', 2],
  ['Anglais', 2], ['Informatique', 2], ['ECM', 1], ['EPS', 1],
];

const lycee = (name, section, rows) => ({
  name, level: name, section, cycle: 'secondaire', system: 'FR', subjects: S(rows),
});

export default {
  id: 'cameroon_general',
  country: 'cameroon',
  type: 'general',
  label: { fr: 'Cameroun – Enseignement Général', en: 'Cameroon – General Education', es: 'Camerún – Educación General' },
  description: { fr: 'Collège (6e–3e) et Lycée (séries A & C).', en: 'Lower & upper secondary (A & C streams).', es: 'Secundaria (series A y C).' },
  defaultSystem: 'FR',
  classes: [
    { name: 'Sixième',   level: '6e', cycle: 'secondaire', system: 'FR', subjects: COLLEGE },
    { name: 'Cinquième', level: '5e', cycle: 'secondaire', system: 'FR', subjects: COLLEGE },
    { name: 'Quatrième', level: '4e', cycle: 'secondaire', system: 'FR', subjects: COLLEGE },
    { name: 'Troisième', level: '3e', cycle: 'secondaire', system: 'FR', subjects: COLLEGE },
    lycee('Seconde A',   'A', SERIE_A),
    lycee('Seconde C',   'C', SERIE_C),
    lycee('Première A',  'A', SERIE_A),
    lycee('Première C',  'C', SERIE_C),
    lycee('Première D',  'D', SERIE_D),
    lycee('Première E',  'E', SERIE_E),
    lycee('Terminale A', 'A', [...SERIE_A, ['Philosophie', 4]]),
    lycee('Terminale C', 'C', [...SERIE_C, ['Philosophie', 2]]),
    lycee('Terminale D', 'D', [...SERIE_D, ['Philosophie', 2]]),
    lycee('Terminale E', 'E', [...SERIE_E, ['Philosophie', 2]]),
  ],
};
