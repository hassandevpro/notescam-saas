// Cameroun — système francophone.
// Reflète ce qui existait déjà dans l'app : notes /20, séquences + trimestres,
// cycles Maternelle / Primaire / Secondaire 1er & 2nd cycles.

export const cameroonFr = {
  code: 'cameroon_fr',
  name: 'Cameroun — Francophone',
  flag: '🇨🇲',
  uiLang: 'fr',
  gradingSystem: 'FR_20',
  maxGrade: 20,
  passThreshold: 10,

  // Les `code` correspondent aux IDs internes utilisés par l'app
  // (bulletinEngine, schoolStore, etc.). Ne pas changer sans migration.
  cycles: [
    {
      code: 'maternelle', label: 'Maternelle / Préscolaire',
      levelGroups: [
        { group: 'Préscolaire', items: ['Toute Petite Section', 'Petite Section', 'Moyenne Section', 'Grande Section'] },
      ],
    },
    {
      code: 'primaire', label: 'Primaire',
      levelGroups: [
        { group: 'Francophone', items: ['SIL', 'CP', 'CE1', 'CE2', 'CM1', 'CM2'] },
      ],
    },
    {
      code: 'secondaire', label: 'Secondaire',
      levelGroups: [
        { group: 'Collège',       items: ['6ème', '5ème', '4ème', '3ème'] },
        { group: 'Lycée général', items: ['2nde', '1ère A', '1ère C', '1ère D', 'Terminale A', 'Terminale C', 'Terminale D'] },
        { group: 'Lycée technique', items: ['1ère TI', 'Terminale TI', '1ère TG', 'Terminale TG'] },
      ],
    },
  ],

  // Bulletin / saisie : 6 séquences regroupées en 3 trimestres.
  periods: {
    sequences: [1, 2, 3, 4, 5, 6],
    trimestres: [
      { value: 'trim_1', label: 'Trimestre 1', short: 'T1', seqs: [1, 2] },
      { value: 'trim_2', label: 'Trimestre 2', short: 'T2', seqs: [3, 4] },
      { value: 'trim_3', label: 'Trimestre 3', short: 'T3', seqs: [5, 6] },
    ],
    annuel: { value: 'annuel', label: 'Annuel', seqs: [1, 2, 3, 4, 5, 6] },
  },

  // Classes officielles d'examen (impactent les modèles de bulletin / rapports).
  examClasses: ['CM2', '3e', 'Tle'],

  // Décisions de passage utilisées sur les bulletins annuels.
  passingDecisions: [
    { value: 'admis',       label: 'Admis(e) en classe supérieure' },
    { value: 'redouble',    label: 'Autorisé(e) à redoubler' },
    { value: 'renvoye',     label: 'Exclu(e) de l\'établissement' },
    { value: 'rattrapage',  label: 'Examen de rattrapage' },
  ],

  // Vocabulaire localisé — utilisé par bulletins et UI.
  vocab: {
    student:    'Élève',
    students:   'Élèves',
    class:      'Classe',
    classes:    'Classes',
    subject:    'Matière',
    subjects:   'Matières',
    teacher:    'Enseignant',
    grade:      'Note',
    average:    'Moyenne',
    rank:       'Rang',
    sequence:   'Séquence',
    term:       'Trimestre',
    year:       'Année scolaire',
    passed:     'Admis',
    failed:     'Non admis',
  },

  // Moteur d'évaluation — Cameroun francophone (inchangé). Notes /20.
  evaluation: {
    periodType:     'sequence',           // 6 séquences regroupées en 3 trimestres
    evaluationModel: 'sequentiel',
    subjectTrimestral: 'moyenne_sequences_du_trimestre',
    subjectFinal:    'moyenne_annuelle',  // moyenne des séquences
    termAverage:     'moyenne_ponderee',  // pondérée par coefficient
    annualAverage:   'moyenne_6_sequences',
    coefficients:    { default: true },
    rounding:        { decimals: 2, mode: 'half_up' },
    passThreshold:   10,                   // /20
    promotion:       { rule: 'moyenne_annuelle >= 10' },
    ranking:         { order: 'desc', tie: 'ex_aequo' },
  },
};
