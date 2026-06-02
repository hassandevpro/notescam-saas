// Guinea Ecuatorial — sistema educativo en español.
// Notas sobre 10, tres trimestres, decisiones de paso conformes al ministerio.

export const guineaEq = {
  code: 'guinea_eq',
  name: 'Guinea Ecuatorial',
  flag: '🇬🇶',
  uiLang: 'es',
  gradingSystem: 'ES_10',
  maxGrade: 10,
  passThreshold: 5,

  cycles: [
    {
      code: 'maternelle', label: 'Preescolar',
      levelGroups: [
        { group: 'Inicial', items: ['Inicial 1', 'Inicial 2', 'Inicial 3'] },
      ],
    },
    {
      code: 'primaire', label: 'Primaria',
      levelGroups: [
        { group: 'Primaria', items: ['1º Primaria','2º Primaria','3º Primaria','4º Primaria','5º Primaria','6º Primaria'] },
      ],
    },
    {
      code: 'secondaire', label: 'Secundaria y Bachillerato',
      levelGroups: [
        { group: 'ESBA',         items: ['1º ESBA','2º ESBA','3º ESBA','4º ESBA'] },
        { group: 'Bachillerato', items: ['1º Bachillerato','2º Bachillerato'] },
      ],
    },
  ],

  // Tres trimestres oficiales. Una "séquence" interna por trimestre.
  periods: {
    sequences: [1, 2, 3],
    trimestres: [
      { value: 'trim_1', label: 'Primer Trimestre',  short: '1T', seqs: [1] },
      { value: 'trim_2', label: 'Segundo Trimestre', short: '2T', seqs: [2] },
      { value: 'trim_3', label: 'Tercer Trimestre',  short: '3T', seqs: [3] },
    ],
    annuel: { value: 'anual', label: 'Anual', seqs: [1, 2, 3] },
  },

  // Cursos con examen oficial (Reválida).
  examClasses: ['6º Primaria', '4º ESBA', '2º Bachillerato'],

  passingDecisions: [
    { value: 'aprobado',     label: 'Aprobado — pasa al curso siguiente' },
    { value: 'repite',       label: 'Repite el curso' },
    { value: 'expulsado',    label: 'Expulsado del centro' },
    { value: 'recuperacion', label: 'Examen de recuperación' },
  ],

  // Apreciaciones por defecto sobre 10.
  defaultGradeScale: [
    { mention: 'Sobresaliente',           min: 9,    max: 10,   color: '#10B981' },
    { mention: 'Notable',                 min: 7,    max: 8.99, color: '#3B82F6' },
    { mention: 'Bien',                    min: 6,    max: 6.99, color: '#8B5CF6' },
    { mention: 'Suficiente',              min: 5,    max: 5.99, color: '#F59E0B' },
    { mention: 'Insuficiente',            min: 0,    max: 4.99, color: '#EF4444' },
  ],

  vocab: {
    student:    'Alumno',
    students:   'Alumnos',
    class:      'Clase',
    classes:    'Clases',
    subject:    'Asignatura',
    subjects:   'Asignaturas',
    teacher:    'Profesor',
    grade:      'Nota',
    average:    'Media',
    rank:       'Puesto',
    sequence:   'Evaluación',
    term:       'Trimestre',
    year:       'Año escolar',
    passed:     'Aprobado',
    failed:     'No aprobado',
  },

  // Moteur d'évaluation propre à la Guinée Équatoriale (modèle espagnol).
  // Source de vérité applicative ; reflétée dans la table EvaluationSystem.
  // Ne JAMAIS appliquer la formule camerounaise ici.
  evaluation: {
    periodType:     'trimestre',          // 3 trimestres officiels
    evaluationModel: 'continua',          // évaluation continue : une note consolidée par trimestre
    // La répartition contrôle continu / examen n'est pas fixée nationalement :
    // elle est laissée au centre/à l'enseignant. L'app enregistre la note
    // consolidée du trimestre (résultat de l'évaluation continue).
    subjectTrimestral: 'nota_consolidada_continua',
    subjectFinal:    'media_trimestres',  // note finale matière = moyenne des trimestres
    termAverage:     'media_ponderada',   // moyenne du trimestre pondérée par coef
    annualAverage:   'media_3_trimestres',
    coefficients:    { secundaria: true, primaria: 'configurable' }, // cf. ge_primary_coef
    rounding:        { decimals: 2, mode: 'half_up' },
    passThreshold:   5,                    // /10 (= maxScale/2 si /20)
    promotion: {
      primaria:           'media_anual >= aprobado',
      esba_bachillerato:  'promociona con un máximo de 2 asignaturas suspensas, salvo si son Matemáticas y Lengua Española simultáneamente',
      bachillerato_2:     'exige todas las asignaturas aprobadas',
      recuperacion:       'asignaturas suspensas → examen extraordinario de recuperación',
      repeat:             'no cumple condiciones de promoción tras la recuperación',
    },
    ranking:        { order: 'desc', tie: 'ex_aequo' }, // puesto por media, empates ex æquo
    officialExam:   'Selectividad (UNGE) tras 2º Bachillerato',
  },
};
