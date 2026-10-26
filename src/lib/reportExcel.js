// LE CLASSEUR DU RAPPORT DE CLASSE — IL DOIT DIRE CE QUE DIT LA FEUILLE IMPRIMÉE
//
// Signalé par l'informaticien de THE GENIUS le 2026-10-26, photo du document
// papier à l'appui : « le fichier importé sur Excel n'affiche pas tous les
// détails, comme celle imprimée ». C'était exact. Le classeur ne portait qu'un
// tableau nu, et il manquait QUATRE choses visibles sur la page imprimée :
//
//   1. l'EN-TÊTE — établissement, année scolaire, classe, période, effectif,
//      date. Sans lui, un fichier ouvert trois semaines plus tard ne dit plus
//      de quelle classe ni de quelle séquence il parle ;
//   2. les CHIFFRES DE LA CLASSE — moyenne, taux de réussite, admis ;
//   3. le BARÈME DE CHAQUE MATIÈRE. L'en-tête imprimé porte « SVT /20 » ; le
//      classeur n'écrivait que « SVT ». Quand deux matières d'une même classe
//      ne sont pas notées sur la même échelle (le cas au premier cycle), les
//      colonnes de nombres deviennent indiscernables — un 8 vaut la moyenne
//      sur /10 et l'échec sur /20 ;
//   4. le tableau RÉSULTATS PAR MATIÈRE, qui partait dans un AUTRE fichier :
//      la page imprimée porte les deux tableaux, le classeur doit les porter
//      aussi.
//
// Module PUR : aucun import, aucun hook. `t` est injecté (défaut : français),
// donc le module s'exécute tel quel sous node pour les tests.

const fr = (texte) => texte;

// Une ligne vide entre deux blocs : dans un classeur, c'est ce qui sépare deux
// tableaux pour qu'Excel ne les fusionne pas en un seul au tri ou au filtre.
const VIDE = [];

export function enteteRapport({ school, classe, periode, stats, scale, date, effectif, t = fr } = {}) {
  const total = stats?.total ?? effectif ?? '';
  const taux = stats?.above != null && stats?.total
    ? Math.round((stats.above / stats.total) * 100) : null;
  const lignes = [
    [(school?.name || '').toUpperCase()],
    [t('Année scolaire', 'School year', 'Año escolar'), school?.current_year || ''],
    [`${t('RAPPORT DE RÉSULTATS', 'RESULTS REPORT', 'INFORME DE RESULTADOS')} — ${(classe?.name || '').toUpperCase()} — ${String(periode?.label || '').toUpperCase()}`],
    [
      t('Classe', 'Class', 'Curso'), classe?.name || '',
      t('Période', 'Period', 'Período'), periode?.label || '',
      t('Effectif', 'Total', 'Efectivo'), total,
      t('Date', 'Date', 'Fecha'), date || '',
    ],
  ];
  // Ni moyenne ni rang en maternelle : la ligne de statistiques n'aurait aucun
  // sens, et une case vide se lit comme une donnée manquante.
  if (stats && stats.avg !== undefined) {
    lignes.push([
      t('Moyenne classe', 'Class average', 'Media de la clase'), stats?.avg ?? '',
      t('Barème', 'Scale', 'Escala'), scale ? `/${scale}` : '',
      t('Taux de réussite', 'Pass rate', 'Tasa de aprobados'), taux !== null ? `${taux}%` : '',
      t('Admis', 'Passed', 'Aprobados'), stats?.above != null ? `${stats.above}/${total}` : '',
    ]);
  }
  lignes.push(VIDE);
  return lignes;
}

// Le classement, colonne par matière — barème compris dans l'en-tête.
export function classementRows({
  studentResults = [], colonnes = [], scale, pass, apprTxt = (a) => a?.text || a?.g || '', t = fr,
} = {}) {
  const enTete = [
    t('Rang', 'Rank', 'Puesto'),
    t('Nom complet', 'Full name', 'Apellidos y nombre'),
    t('Matricule', 'Student ID', 'Matrícula'),
    ...colonnes.map((c) => (c.max ? `${c.name} /${c.max}` : c.name)),
    scale ? `${t('Moyenne', 'Average', 'Media')} /${scale}` : t('Moyenne', 'Average', 'Media'),
    t('Appréciation', 'Grade', 'Apreciación'),
    t('Décision', 'Decision', 'Decisión'),
  ];
  const lignes = studentResults.map(({ student, avg, rank, appr, scores = {} }) => {
    const decision = avg === null || avg === undefined ? ''
      : (avg >= pass ? t('Admis(e)', 'Passed', 'Aprobado') : t('Ajourné(e)', 'Failed', 'Suspenso'));
    return [
      rank?.rankN ?? '', student?.name || '', student?.matricule || '',
      ...colonnes.map((c) => scores[c.id] ?? ''),
      avg ?? '', apprTxt(appr), decision,
    ];
  });
  return [[t('CLASSEMENT DES ÉLÈVES', 'STUDENT RANKING', 'CLASIFICACIÓN DE LOS ALUMNOS')], enTete, ...lignes];
}

// Le second tableau de la page imprimée, dans le MÊME classeur.
export function parMatiereRows({ subjectStats = [], t = fr } = {}) {
  const enTete = [
    t('Matière', 'Subject', 'Asignatura'),
    t('Barème', 'Scale', 'Escala'),
    t('Coef', 'Coeff', 'Coef'),
    t('Moy. classe', 'Class avg', 'Media clase'),
    'Min', 'Max',
    t('Admis', 'Passed', 'Aprobados'),
    t('Effectif', 'Total', 'Efectivo'),
    t('Taux réussite', 'Pass rate', 'Tasa de aprobados'),
  ];
  const lignes = subjectStats.map(({ sub, avg, min, max, passCount, total }) => [
    sub?.name || '', sub?.max ? `/${sub.max}` : '', sub?.coef ?? '',
    avg ?? '', min ?? '', max ?? '', passCount ?? '', total ?? '',
    total ? `${Math.round((passCount / total) * 100)}%` : '',
  ]);
  return [[t('RÉSULTATS PAR MATIÈRE', 'RESULTS BY SUBJECT', 'RESULTADOS POR ASIGNATURA')], enTete, ...lignes];
}

// La page imprimée, de haut en bas, en une seule feuille.
export function rapportComplet(args) {
  const { subjectStats = [], t = fr } = args || {};
  return [
    ...enteteRapport(args),
    ...classementRows(args),
    ...(subjectStats.length ? [VIDE, ...parMatiereRows({ subjectStats, t })] : []),
  ];
}
