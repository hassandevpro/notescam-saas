// Cameroon — Anglophone (English-speaking) system.
// Grades /100, three Terms per academic year.

export const cameroonEn = {
  code: 'cameroon_en',
  name: 'Cameroon — Anglophone',
  flag: '🇨🇲',
  uiLang: 'en',
  gradingSystem: 'EN_100',
  maxGrade: 100,
  passThreshold: 50,

  cycles: [
    {
      code: 'maternelle', label: 'Nursery / Pre-school',
      levelGroups: [
        { group: 'Nursery', items: ['Nursery 1', 'Nursery 2'] },
      ],
    },
    {
      code: 'primaire', label: 'Primary',
      levelGroups: [
        { group: 'Anglophone', items: ['Class 1','Class 2','Class 3','Class 4','Class 5','Class 6'] },
      ],
    },
    {
      code: 'secondaire', label: 'Secondary & High School',
      levelGroups: [
        { group: 'Secondary',   items: ['Form 1','Form 2','Form 3','Form 4','Form 5'] },
        { group: 'High School', items: ['Lower Sixth','Upper Sixth'] },
      ],
    },
  ],

  periods: {
    sequences: [1, 2, 3],
    trimestres: [
      { value: 'term_1', label: 'Term 1', short: 'T1', seqs: [1] },
      { value: 'term_2', label: 'Term 2', short: 'T2', seqs: [2] },
      { value: 'term_3', label: 'Term 3', short: 'T3', seqs: [3] },
    ],
    annuel: { value: 'annual', label: 'Annual', seqs: [1, 2, 3] },
  },

  examClasses: ['Class 6', 'Form 5', 'Upper Sixth'],

  passingDecisions: [
    { value: 'promoted',   label: 'Promoted to next class' },
    { value: 'repeat',     label: 'Allowed to repeat the class' },
    { value: 'dismissed',  label: 'Dismissed from the school' },
    { value: 'resit',      label: 'Resit examination required' },
  ],

  vocab: {
    student:    'Student',
    students:   'Students',
    class:      'Class',
    classes:    'Classes',
    subject:    'Subject',
    subjects:   'Subjects',
    teacher:    'Teacher',
    grade:      'Grade',
    average:    'Average',
    rank:       'Rank',
    sequence:   'Sequence',
    term:       'Term',
    year:       'Academic Year',
    passed:     'Promoted',
    failed:     'Not Promoted',
  },

  // Evaluation engine — Cameroon anglophone (unchanged). Marks /100.
  evaluation: {
    periodType:     'term',               // 3 terms
    evaluationModel: 'term',
    subjectTrimestral: 'term_mark',
    subjectFinal:    'annual_average',
    termAverage:     'weighted_mean',     // weighted by coefficient
    annualAverage:   'mean_3_terms',
    coefficients:    { default: true },
    rounding:        { decimals: 2, mode: 'half_up' },
    passThreshold:   50,                   // /100
    promotion:       { rule: 'annual_average >= 50' },
    ranking:         { order: 'desc', tie: 'ex_aequo' },
  },

  // Official bulletin header, inherited from the COUNTRY chosen at setup.
  // Bilingual (EN primary + FR secondary) — Cameroon specificity.
  officials: {
    primary: {
      republic:    'REPUBLIC OF CAMEROON',
      motto:       'Peace – Work – Fatherland',
      ministry:    'Ministry of Secondary Education (MINESEC)',
      delegations: ['Regional Delegation {region}', 'Divisional Delegation {division}'],
      ministryBasic:    'Ministry of Basic Education (MINEDUB)',
      delegationsBasic: ['Regional Delegation of Basic Education {region}', 'Divisional Delegation of Basic Education {division}'],
      estLabel:    'School No.:',
    },
    secondary: {
      republic:    'RÉPUBLIQUE DU CAMEROUN',
      motto:       'Paix – Travail – Patrie',
      ministry:    'Ministère des Enseignements Secondaires (MINESEC)',
      delegations: ['Délégation Régionale {region}', 'Délégation Départementale {division}'],
      ministryBasic:    "Ministère de l'Éducation de Base (MINEDUB)",
      delegationsBasic: ["Délégation Régionale de l'Éducation de Base {region}", "Délégation Départementale de l'Éducation de Base {division}"],
      estLabel:    'Établissement N° :',
    },
  },
};
