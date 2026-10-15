// Test du PROCÈS-VERBAL DE DÉLIBÉRATION : unités d'évaluation par moteur de
// bulletin, assemblage du tableau de classe (notes, moyennes, rang, décision,
// résumé) et rendu de la feuille A4 paysage.
//
//   node src/lib/_pvEngine.test.mjs

import { buildClassPv, pvUnits, pvApplicable } from './pvEngine.js';
import { pvSheetHtml, pvSchoolSummarySheetHtml } from './pvDoc.js';
import { pageMetrics } from './print/printStyles.js';

let failed = 0;
const ok = (c, m) => { if (!c) failed++; console.log(`${c ? '✅' : '❌'} ${m}`); };
const eq = (a, b, m) => ok(a === b, `${m} (${a} ≈ ${b})`);

// ── Unités d'évaluation selon le moteur ──────────────────────────────────────
eq(pvUnits({ engine: 'classic', sys: 'FR', cycle: 'secondaire', period: 't1' }).map((u) => u.label).join(','),
  'S1,S2', 'classique francophone : Trimestre 1 → séquences S1/S2');
eq(pvUnits({ engine: 'classic', sys: 'FR', cycle: 'secondaire', period: 'annuel' }).map((u) => u.label).join(','),
  'T1,T2,T3', 'annuel → trois trimestres (jamais six séquences)');
eq(pvUnits({ engine: 'classic', sys: 'EN', cycle: 'secondaire', period: 't2' }).map((u) => u.label).join(','),
  'Term 2', 'anglophone : un seul term par période');
eq(pvUnits({ engine: 'classic', sys: 'FR', cycle: 'primaire', period: 't1' }).map((u) => u.label).join(','),
  'T1', 'primaire classique trimestriel : une seule unité');
eq(pvUnits({ engine: 'classic', sys: 'FR', cycle: 'primaire', primSequences: true, period: 't1' }).map((u) => u.label).join(','),
  'S1,S2', 'primaire en mode séquences : deux séquences');
eq(pvUnits({ engine: 'apc', sys: 'FR', cycle: 'secondaire', period: 't3' }).map((u) => u.label).join(','),
  'S5,S6', 'APC premier cycle : séquences du trimestre');
eq(pvUnits({ engine: 'apc_primaire', sys: 'FR', cycle: 'primaire', period: 't1' }).map((u) => u.label).join(','),
  'UA1,UA2,UA3', 'primaire APC : unités d’apprentissage');
eq(pvUnits({ engine: 'classic', sys: 'ES', cycle: 'secondaire', countryCode: 'guinea_eq', period: 't2' }).map((u) => u.label).join(','),
  'T2', 'Guinée Éq. : trimestres, pas de séquences');

ok(pvApplicable('classic') && pvApplicable('sc') && pvApplicable('apc') && pvApplicable('apc_primaire'),
  'les quatre moteurs chiffrés sont délibérables');
ok(!pvApplicable('maternelle'), 'la maternelle n’est pas délibérable (pas de moyenne)');

// ── Assemblage d'un PV de classe (moteur classique) ──────────────────────────
const cls = { id: 'c1', name: '6e M1', level: '6e', system: 'FR', cycle: 'secondaire' };
const subjects = [
  { id: 'mat', name: 'Mathématiques', coef: 4, max: 20, position: 0 },
  { id: 'fra', name: 'Français',      coef: 4, max: 20, position: 1 },
  { id: 'ang', name: 'Anglais',       coef: 2, max: 20, position: 2 },
];
const students = [
  { id: 's1', name: 'ABENA Marie', matricule: 'M001' },
  { id: 's2', name: 'BIYA Paul',   matricule: 'M002' },
  { id: 's3', name: 'CHOU Léa',    matricule: 'M003' },
];
const gradeMap = {
  c1_s1_1: { mat: '16', fra: '14', ang: '12' },
  c1_s1_2: { mat: '18', fra: '12', ang: '14' },
  c1_s2_1: { mat: '8',  fra: '9',  ang: '10' },
  c1_s2_2: { mat: '6',  fra: '11', ang: '8'  },
  c1_s3_1: { mat: '12', fra: '12', ang: '12' },   // pas de séquence 2
  c1_s1_3: { mat: '10', fra: '10', ang: '10' },   // séquence 3 → Trimestre 2
};

const pv = buildClassPv({
  cls, engine: 'classic', sys: 'FR', cycle: 'secondaire', schoolYear: '2025-2026',
  period: 't1', students, subjects, gradeMap, opts: { maxScale: 20 }, teacherName: 'M. KAMGA',
});

eq(pv.cols.length, 3, 'une colonne par matière');
eq(pv.rows.length, 3, 'une ligne par élève');

const r1 = pv.rows.find((r) => r.id === 's1');
eq(r1.cells.mat.byUnit.s1, 16, 'note de la séquence 1');
eq(r1.cells.mat.moy, 17, 'moyenne de matière sur le trimestre');
eq(r1.avg, 14.6, 'moyenne générale pondérée par les coefficients');
eq(r1.rank, 1, 'rang du premier');
eq(r1.rankTxt, '1er / 3', 'rang affiché « 1er / effectif »');
eq(r1.decision.text, 'ADMIS(E)', 'décision au-dessus du seuil');

eq(pv.rows.find((r) => r.id === 's2').decision.text, 'AJOURNÉ(E)', 'décision sous le seuil');

const r3 = pv.rows.find((r) => r.id === 's3');
eq(r3.cells.mat.byUnit.s2, null, 'séquence non notée → cellule vide');
eq(r3.cells.mat.moy, 12, 'moyenne calculée sur les seules séquences notées');

eq(pv.rows[0].id, 's1', 'lignes triées par rang (délibération)');
eq(pv.summary.total, 3, 'résumé : effectif');
eq(pv.summary.admis, 2, 'résumé : admis');
eq(pv.summary.ajournes, 1, 'résumé : ajournés');
eq(pv.summary.rate, 67, 'résumé : taux de réussite');

// La séquence 3 appartient au Trimestre 2 : elle ne doit pas fuir dans le T1.
const pvT2 = buildClassPv({ cls, engine: 'classic', sys: 'FR', cycle: 'secondaire', period: 't2', students, subjects, gradeMap, opts: { maxScale: 20 } });
eq(pvT2.rows.find((r) => r.id === 's1').cells.mat.moy, 10, 'le Trimestre 2 isole bien ses séquences');

// Décision explicite du conseil (surcharge de la décision automatique).
const pvOverride = buildClassPv({ cls, engine: 'classic', sys: 'FR', cycle: 'secondaire', period: 't1', students, subjects, gradeMap, opts: { maxScale: 20 }, decisions: { s2: 'ADMIS(E) PAR LE CONSEIL' } });
eq(pvOverride.rows.find((r) => r.id === 's2').decision.text, 'ADMIS(E) PAR LE CONSEIL', 'la décision du conseil prime');

ok(buildClassPv({ cls, engine: 'maternelle', students, subjects, gradeMap }) === null,
  'maternelle → aucun PV produit');
ok(buildClassPv({ cls, engine: 'apc', students, subjects, gradeMap }) === null,
  'APC sans référentiel → aucun PV produit (pas de plantage)');

// ── Rendu de la feuille A4 paysage ───────────────────────────────────────────
const school = {
  id: 'sc1', name: 'Collège Test', current_year: '2025-2026', director: 'M. NDONGO',
  country_code: 'cameroon_fr', email: 'contact@ecole.cm', phone: '+237 600 000 000',
};
const html = pvSheetHtml(pv, { school });
ok(html.includes('PROCÈS-VERBAL DE DÉLIBÉRATION'), 'bandeau de titre');
// La géométrie n'est plus écrite dans la feuille : celle-ci déclare son profil
// de page et le moteur d'impression en dérive le `@page` (cf. docs/PRINT_ENGINE.md,
// et le contrôle « aucune règle @page locale » de scripts/test-print.mjs). On
// vérifie donc le profil déclaré ET qu'il vaut bien une A4 paysage.
ok(html.includes('data-profile="large"'), 'feuille déclarant le profil paysage');
eq(pageMetrics('large').pageW, 297, 'profil « large » = A4 paysage (297mm de large)');
ok(html.includes('Mathématiques') && html.includes('ABENA Marie') && html.includes('M001'), 'matières, élèves et matricules');
ok(html.includes('ADMIS(E)') && html.includes('AJOURNÉ(E)'), 'décisions rendues');
ok(html.includes('Taux de réussite'), 'bloc résumé');
ok(html.includes('Le Président du Jury') && html.includes('Visa et Cachet'), 'trois blocs de signature');
ok(html.includes('M. KAMGA'), 'professeur principal nommé sous sa signature');

const htmlBasic = pvSheetHtml(pv, { school, basic: true });
ok(htmlBasic.includes('MINEDUB'), 'fondamental : tutelle MINEDUB dans l’en-tête');
ok(!html.includes('MINEDUB'), 'secondaire : tutelle MINESEC');
ok(htmlBasic.includes('Directeur / La Directrice'), 'fondamental : signature du directeur');

// Densité : au-delà du seuil de colonnes, le détail par séquence s'efface.
const many = Array.from({ length: 14 }, (_, i) => ({ id: `x${i}`, name: `Matière ${i}`, coef: 1, max: 20 }));
const pvWide = buildClassPv({ cls, engine: 'classic', sys: 'FR', cycle: 'secondaire', period: 't1', students, subjects: many, gradeMap, opts: { maxScale: 20 } });
ok(pvSheetHtml(pvWide, { school }).includes('Détail par séquence masqué'), 'dégradation automatique quand il y a trop de matières');

// ── Une matière DÉCOCHÉE, ou MASQUÉE, n'est pas une colonne du PV ───────────
//
// Le procès-verbal listait les matières du RÉFÉRENTIEL NATIONAL sans lire ni les
// masques de l'école, ni les matières cochées pour la classe. Le conseil
// délibérait donc sur des colonnes que le bulletin n'imprimait pas — et sur des
// matières que l'école avait retirées.
{
  const refApc = {
    matieres: [
      { id: 'francais', nom: 'Français', coefficient: 4 },
      { id: 'anglais', nom: 'Anglais', coefficient: 3 },
      { id: 'informatique', nom: 'Informatique', coefficient: 1 },
    ],
    competences: [
      { id: 'k_fr',  matiere_id: 'francais',     classe_id: '6e', trimestre_id: 't1', intitule: 'Lire' },
      { id: 'k_ang', matiere_id: 'anglais',      classe_id: '6e', trimestre_id: 't1', intitule: 'Speak' },
      { id: 'k_inf', matiere_id: 'informatique', classe_id: '6e', trimestre_id: 't1', intitule: 'Saisir' },
    ],
    sequences: [{ id: 'sq1', trimestre_id: 't1', numero: 1 }, { id: 'sq2', trimestre_id: 't1', numero: 2 }],
    trimestres: [{ id: 't1', numero: 1 }],
    classeMatieres: [],
  };
  const notes = {
    's1|k_fr|sq1':  { note: 14, note_max: 20 },
    's1|k_ang|sq1': { note: 12, note_max: 20 },
    's1|k_inf|sq1': { note: 18, note_max: 20 },
  };
  // Clé de note du moteur APC — même forme que `noteNkey` (eleve|competence|sequence).
  const notesApc = {};
  for (const [k, v] of Object.entries(notes)) notesApc[k.replace(/\|/g, '_')] = v;

  const apcArgs = {
    cls: { id: 'c6', name: '6e M1', level: '6ème' }, engine: 'apc', sys: 'FR',
    cycle: 'secondaire', period: 't1',
    students: [{ id: 's1', name: 'ABEGA Paul', matricule: 'M1' }],
    apcReferentiel: refApc, apcNotes: notesApc, apcClasseSlug: '6e',
  };

  // Témoin : sans aucune matière de classe, le garde-fou ne filtre rien.
  const temoin = buildClassPv({ ...apcArgs, subjects: [] });
  ok(temoin !== null, 'PV APC assemblé');
  ok(temoin.cols.some((c) => c.key === 'informatique'),
    'temoin : sans matieres de classe, le PV garde tout le referentiel');

  // La classe n'enseigne pas l'informatique (case décochée) → plus de colonne.
  const subs = [{ id: 'a', name: 'Français' }, { id: 'b', name: 'Anglais' }];
  const filtre = buildClassPv({ ...apcArgs, subjects: subs });
  ok(!filtre.cols.some((c) => c.key === 'informatique'),
    'la matiere DECOCHEE n est plus une colonne du PV');
  ok(filtre.cols.some((c) => c.key === 'francais') && filtre.cols.some((c) => c.key === 'anglais'),
    'les matieres cochees restent des colonnes');

  // Et une matière MASQUÉE par l'école disparaît aussi.
  const masque = buildClassPv({ ...apcArgs, subjects: subs, apcMasques: ['k_ang'] });
  ok(!masque.cols.some((c) => c.key === 'anglais'),
    'la matiere MASQUEE par l ecole n est plus une colonne du PV');
  ok(masque.cols.some((c) => c.key === 'francais'), 'et le reste est intact');
}

// ── Synthèse d'établissement ─────────────────────────────────────────────────
const sum = pvSchoolSummarySheetHtml([pv, pvT2], { school, periodLabel: 'Trimestre 1', schoolYear: '2025-2026' });
ok(sum.includes('SYNTHÈSE DE L’ÉTABLISSEMENT'), 'page de synthèse de l’établissement');
ok(sum.includes('6e M1'), 'une ligne par classe délibérée');

console.log(failed ? `\n❌ ${failed} test(s) en échec.` : '\n✅ Tous les tests Procès-verbal passent.');
process.exit(failed ? 1 : 0);
