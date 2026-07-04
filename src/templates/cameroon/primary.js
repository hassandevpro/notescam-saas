// Cameroun — École Primaire (francophone). SIL → CM2.
// Les coefficients sont indicatifs ; au primaire ils peuvent être désactivés
// (réglage école ge_primary_coef / matières à poids égal).

const S = (rows) => rows.map(([name, coef, opts = {}]) => ({ name, coef, ...opts }));

// Français composite au primaire (sous-composantes → calcul de la note finale).
const FR_COMPONENTS = [
  { name: 'Lecture', coef: 1 }, { name: 'Écriture', coef: 1 },
  { name: 'Grammaire', coef: 1 }, { name: 'Orthographe', coef: 1 },
  { name: 'Conjugaison', coef: 1 }, { name: 'Vocabulaire', coef: 1 },
  { name: 'Expression écrite', coef: 2 },
];

const PRIMAIRE = S([
  ['Français', 4, { calc_method: 'weighted_avg', components: FR_COMPONENTS }],
  ['Mathématiques', 4],
  ['Anglais', 2],
  ['Sciences et Technologie (SET)', 2],
  ['Histoire-Géographie-EVC', 2],
  ['TIC', 1],
  ['Arts (Musique & Arts plastiques)', 1],
  ['EPS', 1],
  ['Éducation Morale', 1],
]);

const niveau = (name) => ({ name, level: name, cycle: 'primaire', system: 'FR', subjects: PRIMAIRE });

export default {
  id: 'cameroon_primary',
  country: 'cameroon',
  type: 'primary',
  label: { fr: 'Cameroun – École Primaire', en: 'Cameroon – Primary School', es: 'Camerún – Escuela Primaria' },
  description: { fr: 'Premier cycle : SIL, CP, CE1, CE2, CM1, CM2.', en: 'Primary cycle SIL–CM2.', es: 'Ciclo primario SIL–CM2.' },
  defaultSystem: 'FR',
  classes: ['SIL', 'CP', 'CE1', 'CE2', 'CM1', 'CM2'].map(niveau),
};
