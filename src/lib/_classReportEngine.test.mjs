// Tests du rapport de classe normalisé, moteur par moteur :
//   node src/lib/_classReportEngine.test.mjs
import { buildClassReport, rankByAverage, subjectAvgForStudent, REPORT_KIND, PRIM_GRADE_MAX } from './classReportEngine.js';

let failed = false;
const ok = (cond, msg) => { console.log(`${cond ? '✅' : '❌'} ${msg}`); if (!cond) failed = true; };
const eq = (a, b, msg) => ok(a === b, `${msg}  (${JSON.stringify(a)} attendu ${JSON.stringify(b)})`);

const students = [{ id: 'e1', name: 'Abena' }, { id: 'e2', name: 'Biya' }, { id: 'e3', name: 'Chantal' }];

// ══ Classement commun ═══════════════════════════════════════════════════════
{
  const r = rankByAverage(students, { e1: 12, e2: 15, e3: 12 });
  eq(r.e2.rankN, 1, 'meilleure moyenne → rang 1');
  eq(r.e1.rankN, 2, 'ex æquo : même rang');
  eq(r.e3.rankN, 2, 'ex æquo : même rang (bis)');
  eq(r.e2.rankD, '1er', 'ordinal français du rang 1');
  eq(r.e1.rankD, '2ème', 'ordinal français du rang 2');
  eq(rankByAverage(students, { e1: null, e2: 10 }).e1, null, 'sans moyenne → hors classement');
  // rankN existe bel et bien : c'est ce que la page affiche dans la pastille.
  ok(Object.values(r).every((x) => x === null || typeof x.rankN === 'number'), 'tout rang porte un rankN numérique');
}

// ══ Moteur historique (classic / sc) ════════════════════════════════════════
{
  const cls = { id: 'c1', level: 'Terminale', name: 'Tle D' };
  const subjects = [
    { id: 'm1', name: 'Maths',   coef: 4, max: 20, class_id: 'c1' },
    { id: 'm2', name: 'Anglais', coef: 2, max: 20, class_id: 'c1' },
  ];
  const gradeMap = {
    c1_e1_1: { m1: 16, m2: 10 }, c1_e1_2: { m1: 14, m2: 12 },
    c1_e2_1: { m1: 8,  m2: 'ABS' },
    c1_e3_1: { m1: '', m2: '' },
  };
  const period = { seqs: [1, 2] };
  const rep = buildClassReport({
    engine: 'sc', cls, students, subjects, period, gradeMap,
    sys: 'FR', gOpts: { useCoef: true, maxScale: 20 }, scaleMax: 20, passThreshold: 10,
  });

  eq(rep.kind, REPORT_KIND.NUMERIC, 'lycée : rapport numérique');
  ok(rep.ready, 'lycée : toujours calculable');
  eq(rep.columns.length, 2, 'colonnes = matières de la classe');
  eq(subjectAvgForStudent('m1', 'e1', 'c1', [1, 2], gradeMap), 15, 'moyenne matière = moyenne des séquences');
  const r1 = rep.rows.find((r) => r.student.id === 'e1');
  eq(r1.scores.m1, 15, 'e1 : Maths (16+14)/2');
  eq(r1.scores.m2, 11, 'e1 : Anglais (10+12)/2');
  eq(r1.avg, 13.67, 'moyenne générale pondérée par coefficient');
  eq(r1.rank.rankN, 1, 'e1 est premier');
  const r3 = rep.rows.find((r) => r.student.id === 'e3');
  eq(r3.avg, null, 'aucune note → aucune moyenne');
  eq(r3.rank, null, 'aucune moyenne → aucun rang');

  eq(rep.classStats.total, 3, 'effectif complet, même sans notes');
  eq(rep.classStats.above, 1, 'un seul élève au-dessus de 10');
  const stM1 = rep.columnStats.find((c) => c.col.id === 'm1');
  eq(stM1.min, 8, 'min de la matière');
  eq(stM1.max, 15, 'max de la matière');
  eq(stM1.total, 2, 'seuls les élèves notés comptent dans la matière');
  eq(rep.distribution.length, 4, 'quatre bandes de distribution');
  eq(rep.distribution[3].label, '15–20', 'bandes calées sur le barème /20');
}

// Barème anglophone : les bandes suivent l'échelle, pas une constante /20.
{
  const rep = buildClassReport({
    engine: 'classic', cls: { id: 'c9' }, students: [{ id: 'e1' }],
    subjects: [{ id: 'm1', name: 'Maths', coef: 1, max: 100, class_id: 'c9' }],
    period: { seqs: [1] }, gradeMap: { c9_e1_1: { m1: 80 } },
    sys: 'EN', gOpts: { maxScale: 100 }, scaleMax: 100, passThreshold: 50,
  });
  eq(rep.distribution[3].label, '75–100', 'échelle /100 → bandes /100');
  eq(rep.classStats.above, 1, '80/100 est au-dessus du seuil 50');
}

// ══ APC premier cycle (collège MINESEC) ═════════════════════════════════════
{
  const cls = { id: 'c2', level: '6ème', name: '6e A' };
  const apcReferentiel = {
    matieres: [{ id: 'mat', nom: 'Mathématiques' }, { id: 'fra', nom: 'Français' }],
    classeMatieres: [
      { classe_id: '6e', matiere_id: 'mat', coefficient: 4 },
      { classe_id: '6e', matiere_id: 'fra', coefficient: 2 },
    ],
    competences: [
      { id: 'k1', classe_id: '6e', trimestre_id: 't1', matiere_id: 'mat', coefficient: 1, ordre: 1 },
      { id: 'k2', classe_id: '6e', trimestre_id: 't1', matiere_id: 'mat', coefficient: 1, ordre: 2 },
      { id: 'k3', classe_id: '6e', trimestre_id: 't1', matiere_id: 'fra', coefficient: 1, ordre: 1 },
      { id: 'k9', classe_id: '5e', trimestre_id: 't1', matiere_id: 'mat', coefficient: 1, ordre: 1 },
    ],
    sequences: [
      { id: 's1', numero: 1, trimestre_id: 't1' }, { id: 's2', numero: 2, trimestre_id: 't1' },
      { id: 's3', numero: 3, trimestre_id: 't2' }, { id: 's4', numero: 4, trimestre_id: 't2' },
    ],
  };
  const apcNotes = {
    e1_k1_s1: { note: 16 }, e1_k1_s2: { note: 14 },   // moyenne compétence = 15
    e1_k2_s1: { note: 11 },
    e1_k3_s1: { note: 8 },
    e2_k1_s1: { note: 10 },
  };
  const rep = buildClassReport({
    engine: 'apc', cls, students, subjects: [], period: { seqs: [1, 2] },
    apcNotes, apcReferentiel, scaleMax: 20, passThreshold: 10,
  });

  eq(rep.kind, REPORT_KIND.NUMERIC, 'APC : rapport numérique');
  ok(rep.ready, 'APC prêt dès que le référentiel est là');
  eq(rep.columns.length, 2, 'colonnes = matières du référentiel pour la 6e (la 5e est exclue)');
  eq(rep.columns.find((c) => c.id === 'mat').coef, 4, 'coefficient lu dans classeMatieres');
  const r1 = rep.rows.find((r) => r.student.id === 'e1');
  eq(r1.scores.mat, 13, 'Maths = moyenne des 2 compétences (15 et 11)');
  eq(r1.scores.fra, 8, 'Français = sa seule compétence');
  eq(r1.avg, 11.33, 'moyenne générale pondérée (13×4 + 8×2)/6');
  ok(r1.cotes.mat, 'une cote est dérivée par matière');
  eq(rep.rows.find((r) => r.student.id === 'e3').avg, null, 'élève sans note APC : aucune moyenne');

  const noRef = buildClassReport({ engine: 'apc', cls, students, subjects: [], period: { seqs: [1] }, apcNotes, apcReferentiel: null, scaleMax: 20, passThreshold: 10 });
  ok(!noRef.ready && noRef.reason === 'referentiel', 'sans référentiel chargé : non prêt, raison explicite');
  const badCls = buildClassReport({ engine: 'apc', cls: { id: 'x', level: 'Terminale' }, students, subjects: [], period: { seqs: [1] }, apcNotes, apcReferentiel, scaleMax: 20, passThreshold: 10 });
  ok(!badCls.ready && badCls.reason === 'classe', 'classe hors premier cycle : non prête');
}

// ══ Primaire APC (MINEDUB) ══════════════════════════════════════════════════
{
  const cls = { id: 'c3', level: 'CM2', name: 'CM2 B' };
  const primReferentiel = {
    competences: [
      { id: 'k1', code: '1A', intitule: 'Lire', coefficient: 2, ordre: 1, actif: true },
      { id: 'k2', code: '2A', intitule: 'Compter', coefficient: 1, ordre: 2, actif: true },
    ],
    criteres: [{ id: 'cr1', nom: 'Oral' }, { id: 'cr2', nom: 'Écrit' }],
    baremeCriteres: [
      { niveau_id: 'cm2', competence_id: 'k1', critere_id: 'cr1', points_max: 10, ordre: 1, aptitude: 'apte' },
      { niveau_id: 'cm2', competence_id: 'k1', critere_id: 'cr2', points_max: 10, ordre: 2, aptitude: 'apte' },
      { niveau_id: 'cm2', competence_id: 'k2', critere_id: 'cr1', points_max: 20, ordre: 1, aptitude: 'apte' },
    ],
  };
  // UA 1-3 = trimestre 1. e1 : 1A à 100 % en UA1 et 50 % en UA2 → 75 % → 7.5/10.
  const primNotes = {
    e1_k1_cr1_1: { eleve_id: 'e1', competence_id: 'k1', critere_id: 'cr1', ua: 1, note: 10 },
    e1_k1_cr2_1: { eleve_id: 'e1', competence_id: 'k1', critere_id: 'cr2', ua: 1, note: 10 },
    e1_k1_cr1_2: { eleve_id: 'e1', competence_id: 'k1', critere_id: 'cr1', ua: 2, note: 5 },
    e1_k1_cr2_2: { eleve_id: 'e1', competence_id: 'k1', critere_id: 'cr2', ua: 2, note: 5 },
    e1_k2_cr1_1: { eleve_id: 'e1', competence_id: 'k2', critere_id: 'cr1', ua: 1, note: 10 },
    e2_k1_cr1_5: { eleve_id: 'e2', competence_id: 'k1', critere_id: 'cr1', ua: 5, note: 10 },  // trimestre 2
  };
  const rep = buildClassReport({
    engine: 'apc_primaire', cls, students, subjects: [], period: { seqs: [1] },
    primNotes, primReferentiel,
  });

  eq(rep.scaleMax, PRIM_GRADE_MAX, 'le carnet primaire note /10, pas /20');
  eq(rep.passThreshold, 5, 'seuil = moitié du barème /10');
  eq(rep.columns.length, 2, 'colonnes = compétences nationales du niveau');
  eq(rep.columns[0].name, '1A — Lire', 'la compétence est libellée code + intitulé');
  const r1 = rep.rows.find((r) => r.student.id === 'e1');
  eq(r1.scores.k1, 7.5, 'compétence 1A : moyenne des pourcentages des UA du trimestre');
  eq(r1.scores.k2, 5, 'compétence 2A : 10/20 → 5/10');
  eq(r1.avg, 6.67, 'moyenne générale pondérée par coefficient de compétence');
  ok(['A+', 'A', 'ECA', 'NA'].includes(r1.cote), 'une cote APC est dérivée');
  eq(rep.rows.find((r) => r.student.id === 'e2').avg, null, 'les UA du trimestre 2 ne fuient pas sur le trimestre 1');

  const annual = buildClassReport({
    engine: 'apc_primaire', cls, students, subjects: [], period: { seqs: [1, 2, 3] }, primNotes, primReferentiel,
  });
  ok(annual.rows.find((r) => r.student.id === 'e2').avg !== null, 'en annuel, les 8 UA sont couvertes');

  const noRef = buildClassReport({ engine: 'apc_primaire', cls, students, subjects: [], period: { seqs: [1] }, primNotes, primReferentiel: null });
  ok(!noRef.ready && noRef.reason === 'referentiel', 'primaire sans référentiel : non prêt');
}

// ══ Maternelle (MINEDUB) ════════════════════════════════════════════════════
{
  const cls = { id: 'c4', level: 'Petite Section', name: 'PS A' };
  const subjects = [
    { id: 's1', name: 'Langage', coef: 1, class_id: 'c4', mat_domaine_id: 'd1' },
    { id: 's2', name: 'Motricité', coef: 1, class_id: 'c4', mat_domaine_id: 'd2' },
  ];
  const matObservations = {
    e1_d1_t1: { niveau_acquis: 'A' },
    e1_d2_t1: { niveau_acquis: 'ECA' },
    e2_d1_t1: { niveau_acquis: 'NA' },
    e2_d1_t2: { niveau_acquis: 'A' },     // progression au 2e trimestre
    e3_d1_t1: { niveau_acquis: '' },      // ligne vide
  };
  const rep = buildClassReport({
    engine: 'maternelle', cls, students, subjects, period: { seqs: [1] }, matObservations,
  });

  eq(rep.kind, REPORT_KIND.ACQUISITION, 'maternelle : rapport d’acquisition, pas de moyennes');
  eq(rep.scaleMax, null, 'aucun barème numérique en préscolaire');
  eq(rep.columns.length, 2, 'colonnes = domaines pédagogiques');
  const r1 = rep.rows.find((r) => r.student.id === 'e1');
  eq(r1.cotes.d1, 'A', 'le niveau d’acquisition est repris tel quel');
  eq(r1.avg, null, 'aucune moyenne');
  eq(r1.rank, null, 'aucun rang — le préscolaire ne classe pas');
  eq(r1.cote, 'A', 'tendance dominante de l’élève');
  eq(rep.rows.find((r) => r.student.id === 'e3').ratedCount, 0, 'observation vide = non évaluée');

  eq(rep.classStats.rated, 3, 'trois observations cotées au trimestre 1');
  eq(rep.classStats.expected, 6, '3 élèves × 2 domaines attendus');
  eq(rep.classStats.counts.A, 1, 'un A au trimestre 1');
  eq(rep.classStats.counts.NA, 1, 'un NA au trimestre 1');
  const d1 = rep.columnStats.find((c) => c.col.id === 'd1');
  eq(d1.rated, 2, 'domaine Langage : deux élèves évalués');
  eq(rep.distribution.map((d) => d.label).join(','), 'A,ECA,NA', 'distribution par niveau d’acquisition');

  // Annuel : le niveau le plus récent fait foi (l'acquisition ne se moyenne pas).
  const annual = buildClassReport({
    engine: 'maternelle', cls, students, subjects, period: { seqs: [1, 2, 3] }, matObservations,
  });
  eq(annual.rows.find((r) => r.student.id === 'e2').cotes.d1, 'A',
    'annuel : le trimestre 2 (A) remplace le trimestre 1 (NA)');
}

console.log(failed ? '\n❌ ÉCHECS' : '\n✅ Tous les tests passent');
process.exit(failed ? 1 : 0);
