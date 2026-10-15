// Tests du moteur PROGRAMME D'ÉDUCATION BILINGUE SPÉCIAL (premier cycle).
// Exécution : node src/core/_bilEngine.test.mjs
//
// Les tests de référentiel portent sur le VRAI fichier extrait de l'arrêté 239-23,
// pas sur des données inventées : une erreur de transcription les ferait tomber.
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  matieresForBilClasse, assembleBilBulletin, assembleBilAnnual,
  subjectsFromBilReferentiel, bilSerieForClasseSlug, parseNote, subjectMean,
  BIL_SERIE_FR, BIL_SERIE_EN, bilAppreciation, bilProvisoireTexte,
} from './bilEngine.js';
import { multiAvg, fusedG } from './bulletinEngine.js';
import { resolveClassEngine, isBilClasseEnService, BIL_CLASSES_EN_SERVICE } from './engineResolver.js';

let pass = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); console.log('✅ ' + msg); pass++; };
const eq = (a, b, msg) => ok(a === b, `${msg} (${a} === ${b})`);
const near = (a, b, msg) => ok(a !== null && Math.abs(a - b) < 0.011, `${msg} (${a} ≈ ${b})`);

const here = dirname(fileURLToPath(import.meta.url));
const ref = JSON.parse(readFileSync(join(here, '../../examples/bilingue/referentiel-bilingue-special-premier-cycle.json'), 'utf8'));

console.log('\n── 1. Intégrité du référentiel extrait de l\'arrêté ──');
eq(ref.entries.length, 141, '141 entrées');
eq(ref.series.length, 2, 'deux séries (francophone + anglophone)');
ok(ref.series.map((s) => s.id).sort().join() === 'bil_en,bil_fr', 'séries bil_fr et bil_en');

// Totaux de coefficients IMPRIMÉS dans l'arrêté (section I-2, ligne TOTAL GENERAL).
const FR_TOTAL = { '6e': 31, '5e': 31, '4e': 32, '3e': 32 };
for (const [cl, attendu] of Object.entries(FR_TOTAL)) {
  const rows = matieresForBilClasse(ref, { serieId: BIL_SERIE_FR, classeId: cl });
  const somme = rows.reduce((a, r) => a + r.coefficient, 0);
  eq(somme, attendu, `francophone ${cl} : Σcoef = ${attendu} (totaux imprimés)`);
}

console.log('\n── 2. Applicabilité : une matière grisée n\'existe pas ──');
const fr6 = matieresForBilClasse(ref, { serieId: BIL_SERIE_FR, classeId: '6e' });
const fr4 = matieresForBilClasse(ref, { serieId: BIL_SERIE_FR, classeId: '4e' });
const nom = (rows) => rows.map((r) => r.nom);
ok(!nom(fr6).includes('Langue Vivante II (LVII)'), '6e : pas de LVII (cellule grisée)');
ok(nom(fr4).includes('Langue Vivante II (LVII)'), '4e : LVII présente');
ok(nom(fr6).includes('Sciences') && !nom(fr6).includes('SVTEEHB'), '6e : Sciences, pas SVTEEHB');
ok(!nom(fr4).includes('Sciences') && nom(fr4).includes('SVTEEHB'), '4e : SVTEEHB, pas Sciences');
eq(fr6.length, 15, '6e : 15 matières applicables');
eq(fr4.length, 17, '4e : 17 matières applicables');

const en1 = matieresForBilClasse(ref, { serieId: BIL_SERIE_EN, classeId: 'form1' });
const en3 = matieresForBilClasse(ref, { serieId: BIL_SERIE_EN, classeId: 'form3' });
ok(nom(en1).includes('Home Economics') && !nom(en1).includes('Food and Nutrition'), 'Form 1 : Home Economics, pas Food and Nutrition');
ok(!nom(en3).includes('Home Economics') && nom(en3).includes('Food and Nutrition'), 'Form 3 : Food and Nutrition, pas Home Economics');
ok(!nom(en1).includes('Economics') && nom(en3).includes('Economics'), 'Economics : absente en Form 1, présente en Form 3');
eq(en1.reduce((a, r) => a + r.coefficient, 0), 32, 'Form 1 : Σcoef = 32 (recalculé — l\'arrêté n\'imprime pas de total)');
eq(en3.reduce((a, r) => a + r.coefficient, 0), 35, 'Form 3 : Σcoef = 35 (recalculé — l\'arrêté n\'imprime pas de total)');

console.log('\n── 3. Charge horaire ≠ coefficient ──');
const tm = fr6.find((r) => r.nom === 'Travail Manuel (TM)');
eq(tm.coefficient, 1, 'Travail Manuel : coefficient 1');
eq(tm.charge_horaire, 2, 'Travail Manuel : charge horaire 2 h');
ok(tm.coefficient !== tm.charge_horaire, 'les deux ne sont jamais confondus');
const cs3 = en3.find((r) => r.nom === 'Computer Sciences');
eq(cs3.coefficient, 3, 'Computer Sciences passe de 2 (Form 1-2) à 3 (Form 3)');

console.log('\n── 4. Sous-système déduit du slug de classe ──');
eq(bilSerieForClasseSlug('6e'), BIL_SERIE_FR, '6e → francophone');
eq(bilSerieForClasseSlug('3e'), BIL_SERIE_FR, '3e → francophone');
eq(bilSerieForClasseSlug('form1'), BIL_SERIE_EN, 'form1 → anglophone');
eq(bilSerieForClasseSlug('tle'), null, 'tle (second cycle) → aucune série : hors périmètre');
eq(bilSerieForClasseSlug(null), null, 'slug absent → null');

console.log('\n── 5. Lecture des notes : le zéro compte, l\'absence non ──');
eq(parseNote('0'), 0, 'chaîne "0" → 0');
eq(parseNote(0), 0, 'nombre 0 → 0 (robustesse)');
eq(parseNote('12,5'), 12.5, 'virgule décimale acceptée');
eq(parseNote(''), null, 'chaîne vide → non évaluée');
eq(parseNote('ABS'), null, 'ABS → non évaluée');
eq(parseNote(undefined), null, 'absente → non évaluée');
eq(parseNote('abc'), null, 'non numérique → non évaluée');

console.log('\n── 6. Moyenne générale pondérée ──');
// A coef 4 (moyenne 12) · B coef 2 (moyenne 0, réelle) · C coef 1 (non évaluée).
const subjects = [
  { id: 'a', name: 'Matière A', coef: 4, max: 20, bil_domaine: 'Langues', bil_domaine_ordre: 1, position: 0, charge_horaire: 4 },
  { id: 'b', name: 'Matière B', coef: 2, max: 20, bil_domaine: 'Langues', bil_domaine_ordre: 1, position: 1, charge_horaire: 2 },
  { id: 'c', name: 'Matière C', coef: 1, max: 20, bil_domaine: 'Sciences', bil_domaine_ordre: 2, position: 2, charge_horaire: 1 },
];
const allGrades = {
  'cl1_s1_1': { a: '10', b: '0' },
  'cl1_s1_2': { a: '14', b: '0' },
};
const base = { subjects, allGrades, classId: 'cl1', student: { id: 's1' }, serieId: BIL_SERIE_FR, maxScale: 20 };
const t1 = assembleBilBulletin({ ...base, seqs: [1, 2] });

near(t1.domaines[0].rows[0].moyenne, 12, 'A : moyenne (10+14)/2 = 12');
near(t1.domaines[0].rows[1].moyenne, 0, 'B : moyenne 0 — une note nulle reste une note');
eq(t1.domaines[1].rows[0].moyenne, null, 'C : non évaluée');
eq(t1.domaines[1].rows[0].ponderee, null, 'C : points pondérés null, surtout pas 0');

eq(t1.totalCoef, 6, 'Σcoef = 4+2 = 6 — C exclue du DÉNOMINATEUR');
near(t1.totalPoints, 48, 'Σ(M×coef) = 12×4 + 0×2 = 48 — C exclue du NUMÉRATEUR');
near(t1.moyenneGenerale, 8, 'moyenne générale = 48/6 = 8');
// Garde-fou anti-régression : si le 0 de B était écarté, on obtiendrait 12.
ok(t1.moyenneGenerale !== 12, 'le zéro de B n\'est PAS ignoré (sinon 48/4 = 12)');
near(t1.totalPoints / t1.totalCoef, t1.moyenneGenerale, 'totalPoints / totalCoef == moyenne générale imprimée');
eq(t1.totalCoefApplicable, 7, 'Σcoef applicables = 7, distinct des 6 évalués');

console.log('\n── 7. Trimestre incomplet → PROVISOIRE ──');
eq(t1.nbApplicables, 3, '3 matières applicables');
eq(t1.nbEvaluees, 2, '2 matières évaluées');
eq(t1.complet, false, 'bulletin incomplet');
eq(t1.provisoire, true, 'marqué PROVISOIRE');
const plein = assembleBilBulletin({ ...base, allGrades: { 'cl1_s1_1': { a: '10', b: '0', c: '15' }, 'cl1_s1_2': { a: '14', b: '0', c: '15' } }, seqs: [1, 2] });
eq(plein.complet, true, 'toutes notées → complet');
eq(plein.provisoire, false, 'plus de mention PROVISOIRE');
near(plein.moyenneGenerale, (48 + 15) / 7, 'moyenne recalculée avec C : 63/7 = 9');

console.log('\n── 8. Aucune note du tout ──');
const vide = assembleBilBulletin({ ...base, allGrades: {}, seqs: [1, 2] });
eq(vide.totalCoef, 0, 'Σcoef = 0');
eq(vide.moyenneGenerale, null, 'moyenne générale null — jamais 0, jamais NaN');
eq(vide.provisoire, true, 'PROVISOIRE');

console.log('\n── 9. Domaines d\'apprentissage ──');
eq(t1.domaines.length, 2, 'deux domaines');
eq(t1.domaines[0].nom, 'Langues', 'domaine 1 = Langues');
eq(t1.domaines[0].coefSum, 6, 'Langues : Σcoef évalués = 6');
near(t1.domaines[0].moyenne, 8, 'Langues : moyenne de domaine = 48/6 = 8');
eq(t1.domaines[0].chargeSum, 6, 'Langues : Σ charge horaire = 6 h (affichage seul)');

console.log('\n── 10. Bulletin annuel ──');
// A coef 2 noté aux 3 trimestres · B coef 3 noté au seul T1.
const annualGrades = {
  'cl1_s1_1': { a: '10', b: '20' }, 'cl1_s1_2': { a: '12', b: '20' },
  'cl1_s1_3': { a: '14' },          'cl1_s1_4': { a: '16' },
  'cl1_s1_5': { a: '13' },          'cl1_s1_6': { a: '13' },
};
const annualSubjects = [
  { id: 'a', name: 'A', coef: 2, max: 20, bil_domaine: 'D', bil_domaine_ordre: 1, position: 0 },
  { id: 'b', name: 'B', coef: 3, max: 20, bil_domaine: 'D', bil_domaine_ordre: 1, position: 1 },
];
const an = assembleBilAnnual({ ...base, subjects: annualSubjects, allGrades: annualGrades });
near(an.moyennesTrimestres[0], 16.4, 'T1 : (11×2 + 20×3)/5 = 16.4');
near(an.moyennesTrimestres[1], 15, 'T2 : A seule = 15');
near(an.moyennesTrimestres[2], 13, 'T3 : A seule = 13');
const rowA = an.domaines[0].rows.find((r) => r.id === 'a');
const rowB = an.domaines[0].rows.find((r) => r.id === 'b');
near(rowA.moyenne, 13, 'A annuelle = (11+15+13)/3 = 13');
eq(rowA.nbTrimestresEvalues, 3, 'A évaluée aux 3 trimestres');
near(rowB.moyenne, 20, 'B annuelle = 20 — le T2/T3 non évalué ne vaut PAS 0');
eq(rowB.nbTrimestresEvalues, 1, 'B évaluée à 1 seul trimestre');
near(an.moyenneGenerale, 17.2, 'annuelle (subject_mean) = (13×2 + 20×3)/5 = 17.2');
eq(an.provisoire, true, 'annuel PROVISOIRE car B manque en T2/T3');

const anTerm = assembleBilAnnual({ ...base, subjects: annualSubjects, allGrades: annualGrades, mode: 'term_mean' });
near(anTerm.moyenneGenerale, 14.8, 'annuelle (term_mean) = (16.4+15+13)/3 = 14.8');
ok(Math.abs(an.moyenneGenerale - anTerm.moyenneGenerale) > 2, 'les deux méthodes divergent : le choix doit être explicite');

console.log('\n── 11. Matières optionnelles jamais créées d\'office ──');
const form4 = matieresForBilClasse(ref, { serieId: BIL_SERIE_EN, classeId: 'form4' });
let n = 0;
const auto = subjectsFromBilReferentiel(form4, { schoolId: 'e1', classId: 'c1', makeId: () => `id${++n}` });
eq(auto.length, 4, 'Form 4 : seules les 4 matières obligatoires sont créées');
ok(auto.every((s) => s.bil_obligatoire), 'toutes marquées obligatoires');
ok(!auto.map((s) => s.name).includes('Geology'), 'Geology (au choix) non créée automatiquement');
const avecOptions = subjectsFromBilReferentiel(form4, { schoolId: 'e1', classId: 'c1', makeId: () => `id${++n}`, includeOptional: true });
ok(avecOptions.length > auto.length, 'les options ne sont ajoutées que sur demande explicite');
const fr6auto = subjectsFromBilReferentiel(fr6, { schoolId: 'e1', classId: 'c1', makeId: () => `id${++n}` });
eq(fr6auto.length, 15, '6e : les 15 matières sont obligatoires, donc toutes créées');
eq(fr6auto.reduce((a, s) => a + s.coef, 0), 31, '6e : Σcoef des matières créées = 31');

console.log('\n── 12. Barèmes hétérogènes ──');
const sur10 = [{ id: 'x', name: 'X', coef: 1, max: 10, bil_domaine: 'D', bil_domaine_ordre: 1, position: 0 }];
const m10 = subjectMean({ 'cl1_s1_1': { x: '8' } }, 'cl1', 's1', [1], sur10[0], 20);
near(m10, 16, 'une note 8/10 vaut 16/20 — normalisée, pas comptée brute');

console.log('\n── 13. Appréciations dans les deux sous-systèmes ──');
// Régression : `getAppreciation` bascule sur enGrade() quand sys==='EN' — qui
// raisonne en /100 et expose `.txt`, pas `.text`. La colonne « Remark » du
// bulletin anglophone sortait donc VIDE. bilAppreciation lit les bandes du
// barème de l'école sur l'échelle de la classe, et ne traduit que le libellé.
ok(bilAppreciation(18, null, 'FR') === 'Expert', 'FR : 18/20 → Expert');
ok(bilAppreciation(18, null, 'EN') === 'Expert', 'EN : 18/20 → Expert (traduit)');
ok(bilAppreciation(15, null, 'FR') === 'Acquis', 'FR : 15/20 → Acquis');
ok(bilAppreciation(15, null, 'EN') === 'Acquired', 'EN : 15/20 → Acquired, pas vide');
ok(bilAppreciation(5, null, 'EN') === 'Insufficient', 'EN : 5/20 → Insufficient');
eq(bilAppreciation(null, null, 'EN'), '', 'non évaluée → pas d\'appréciation');
const perso = [{ mention: 'Au top', min: 15, max: 20 }, { mention: 'À revoir', min: 0, max: 14.99 }];
eq(bilAppreciation(17, perso, 'EN'), 'Au top', 'barème personnalisé : libellé de l\'école conservé tel quel');

const enBul = assembleBilBulletin({
  ...base, serieId: BIL_SERIE_EN, seqs: [1, 2],
  allGrades: { 'cl1_s1_1': { a: '18', b: '18' }, 'cl1_s1_2': { a: '18', b: '18' } },
});
ok(enBul.domaines[0].rows[0].appreciation === 'Expert', 'bulletin anglophone : la colonne Remark est remplie');
ok(enBul.appreciation !== '', 'bulletin anglophone : appréciation générale remplie');

console.log('\n── 14. Confrontation aux RÈGLES DE CALCUL EXISTANTES ──');
// Question posée : la règle décidée pour ce bulletin — Σ(Moy×Coef)/Σcoef —
// s'écarte-t-elle de celle que la plateforme applique déjà (multiAvg : moyenne
// des moyennes générales de chaque séquence) ?
//
// Réponse démontrable : sur des données COMPLÈTES (chaque matière notée à chaque
// séquence), les deux sont ALGÉBRIQUEMENT identiques —
//   multiAvg = (1/S)·Σ_s [Σ_j note_sj·coef_j / Σcoef]
//            = Σ_j coef_j·(1/S)·Σ_s note_sj / Σcoef
//            = Σ_j coef_j·moyenne_j / Σcoef
// Elles ne divergent que si une matière manque à certaines séquences — c'est-à-dire
// exactement là où le bulletin porte déjà la mention PROVISOIRE.
const complet = [
  { id: 'm1', name: 'M1', coef: 4, max: 20, bil_domaine: 'D', bil_domaine_ordre: 1, position: 0 },
  { id: 'm2', name: 'M2', coef: 3, max: 20, bil_domaine: 'D', bil_domaine_ordre: 1, position: 1 },
  { id: 'm3', name: 'M3', coef: 1, max: 20, bil_domaine: 'E', bil_domaine_ordre: 2, position: 2 },
];
const gComplet = {
  'cl1_s1_1': { m1: '13', m2: '9',    m3: '17' },
  'cl1_s1_2': { m1: '16', m2: '11.5', m3: '8'  },
};
const bil = assembleBilBulletin({ ...base, subjects: complet, allGrades: gComplet, seqs: [1, 2] });
const ref1 = multiAvg(gComplet, 'cl1', 's1', [1, 2], complet, 'FR', { maxScale: 20 });
near(bil.moyenneGenerale, ref1, 'données complètes : la nouvelle règle = multiAvg (règle existante)');

// Les moyennes PAR MATIÈRE coïncident aussi avec fusedG, le fusionneur historique.
const fused = fusedG(gComplet, 'cl1', 's1', [1, 2], complet);
for (const r of bil.domaines.flatMap((d) => d.rows)) {
  near(r.moyenne, parseFloat(fused[r.id]), `moyenne de ${r.nom} identique à fusedG`);
}

// Dès qu'une matière n'est pas notée à TOUTES les séquences, les deux règles
// divergent. ATTENTION — et c'est le point à connaître : une matière notée en
// séquence 1 mais pas en séquence 2 reste « évaluée », donc le bulletin n'est PAS
// marqué PROVISOIRE. La divergence peut donc exister sur un bulletin d'apparence
// complète. Seule une matière SANS AUCUNE note déclenche PROVISOIRE.
const gTrou = { 'cl1_s1_1': { m1: '13', m2: '9', m3: '17' }, 'cl1_s1_2': { m1: '16' } };
const bilTrou = assembleBilBulletin({ ...base, subjects: complet, allGrades: gTrou, seqs: [1, 2] });
const refTrou = multiAvg(gTrou, 'cl1', 's1', [1, 2], complet, 'FR', { maxScale: 20 });
ok(Math.abs(bilTrou.moyenneGenerale - refTrou) > 0.01,
  `séquence manquante : les deux règles divergent (${bilTrou.moyenneGenerale} vs ${refTrou})`);
// CORRIGÉ : ce cas est désormais SIGNALÉ. Il ne l'était pas — un bulletin reposant
// sur une séquence sur deux passait pour définitif.
eq(bilTrou.provisoire, true, 'couverture partielle → bulletin marqué PROVISOIRE');
eq(bilTrou.nbEvaluees, 3, 'les 3 matières restent « évaluées » (au moins une note chacune)');
eq(bilTrou.nbPartielles, 2, '2 matières à couverture partielle');
eq(bilTrou.complet, false, 'donc pas complet');

// Matière SANS AUCUNE note sur la période → là, PROVISOIRE se déclenche.
const gVide = { 'cl1_s1_1': { m1: '13', m2: '9' }, 'cl1_s1_2': { m1: '16', m2: '11.5' } };
const bilVide = assembleBilBulletin({ ...base, subjects: complet, allGrades: gVide, seqs: [1, 2] });
eq(bilVide.provisoire, true, 'matière jamais notée → PROVISOIRE');
eq(bilVide.nbEvaluees, 2, '2 matières évaluées sur 3');
eq(bilVide.totalCoef, 7, 'et son coefficient (1) sort bien du dénominateur');

console.log('\n── 14bis. Les trois situations restent DISTINCTES ──');
// Zéro réel · matière non évaluée · couverture partielle : trois états différents,
// qui ne doivent jamais se confondre.
const troisCas = [
  { id: 'z', name: 'Zéro réel',   coef: 2, max: 20, bil_domaine: 'D', bil_domaine_ordre: 1, position: 0 },
  { id: 'v', name: 'Jamais notée', coef: 2, max: 20, bil_domaine: 'D', bil_domaine_ordre: 1, position: 1 },
  { id: 'p', name: 'Partielle',   coef: 2, max: 20, bil_domaine: 'D', bil_domaine_ordre: 1, position: 2 },
];
const gTrois = { 'cl1_s1_1': { z: '0', p: '14' }, 'cl1_s1_2': { z: '0' } };
const b3 = assembleBilBulletin({ ...base, subjects: troisCas, allGrades: gTrois, seqs: [1, 2] });
const [rz, rv, rp] = b3.domaines[0].rows;
eq(rz.moyenne, 0, 'zéro réel : moyenne 0');
eq(rz.evaluee, true, 'zéro réel : évaluée');
eq(rz.partielle, false, 'zéro réel : couverture complète');
eq(rz.ponderee, 0, 'zéro réel : 0 point pondéré (et non null)');
eq(rv.moyenne, null, 'jamais notée : pas de moyenne');
eq(rv.evaluee, false, 'jamais notée : non évaluée');
eq(rv.ponderee, null, 'jamais notée : points pondérés null (et non 0)');
eq(rp.moyenne, 14, 'partielle : moyenne sur la seule séquence notée');
eq(rp.evaluee, true, 'partielle : évaluée');
eq(rp.partielle, true, 'partielle : signalée comme telle');
eq(rp.nbSeqNotees, 1, 'partielle : 1 séquence notée');
eq(rp.nbSeqAttendues, 2, 'partielle : 2 attendues');
eq(b3.totalCoef, 4, 'Σcoef = 4 : le zéro compte, la non-évaluée est exclue');
eq(b3.totalPoints, 28, 'Σ(M×coef) = 0×2 + 14×2 = 28');
// Le bandeau énonce les DEUX motifs séparément.
const txtFR = bilProvisoireTexte(b3, 'FR');
ok(/1 matière\(s\) non évaluée\(s\)/.test(txtFR), `bandeau : motif « non évaluée » présent`);
ok(/1 matière\(s\) notée\(s\) sur une partie/.test(txtFR), 'bandeau : motif « couverture partielle » présent');
ok(!/[Zz]éro/.test(txtFR), 'bandeau : le zéro réel n\'y figure pas — ce n\'est pas une anomalie');
ok(/PROVISIONAL/.test(bilProvisoireTexte(b3, 'EN')), 'bandeau traduit en anglais');
eq(bilProvisoireTexte({ provisoire: false }, 'FR'), '', 'bulletin complet : aucun bandeau');

console.log('\n── 15. Form 4 / Form 5 : restriction EFFECTIVE, pas seulement documentée ──');
// Une classe hors service ne doit produire AUCUN bulletin se présentant comme
// officiel : le référentiel y est incomplet (matières « au choix »).
eq(isBilClasseEnService('6e'), true, '6e : en service');
eq(isBilClasseEnService('form3'), true, 'Form 3 : en service');
eq(isBilClasseEnService('form4'), false, 'Form 4 : HORS service');
eq(isBilClasseEnService('form5'), false, 'Form 5 : HORS service');
eq(BIL_CLASSES_EN_SERVICE.length, 7, '7 classes en service (6e–3e + Form 1–3)');

const ecoleBil = { bulletin_engine: 'bilingue_special' };
eq(resolveClassEngine(ecoleBil, { level: '6e', name: '6e Bil' }), 'bilingue', '6e → moteur bilingue');
eq(resolveClassEngine(ecoleBil, { level: 'Form 1', name: 'Form 1' }), 'bilingue', 'Form 1 → moteur bilingue');
eq(resolveClassEngine(ecoleBil, { level: 'Form 4', name: 'Form 4' }), 'classic',
  'Form 4 → repli CLASSIQUE, pas de bulletin officiel sur référentiel incomplet');
eq(resolveClassEngine(ecoleBil, { level: 'Form 5', name: 'Form 5' }), 'classic', 'Form 5 → repli classique');
// Le second cycle n'est pas couvert par l'arrêté 239-23 : il garde donc son
// moteur habituel (SC-MINESEC), il ne « retombe » pas en classique — voir 15bis.
eq(resolveClassEngine(ecoleBil, { level: 'Terminale', name: 'Tle A' }), 'sc',
  'second cycle → moteur SC conservé (l\'arrêté bilingue ne le couvre pas)');

console.log('\n── 15bis. Le drapeau est un PROFIL D\'ÉCOLE COMPLET ──');
// RÉGRESSION CONSTATÉE EN RECETTE : `schools.bulletin_engine` vaut pour TOUTE
// l'école. En ne traitant que le premier cycle, le drapeau faisait retomber le
// primaire, la maternelle et le second cycle en 'classic' — leurs bulletins
// officiels DISPARAISSAIENT de l'écran, sans message.
const bilEcole = { bulletin_engine: 'bilingue_special' };
eq(resolveClassEngine(bilEcole, { level: 'PS', name: 'Petite Section' }), 'maternelle',
  'maternelle conservée');
for (const [lvl, nom] of [['SIL', 'SIL'], ['CE1', 'CE1 A'], ['CM2', 'CM2 B']]) {
  eq(resolveClassEngine(bilEcole, { level: lvl, name: nom }), 'apc_primaire',
    `primaire conservé — ${lvl}`);
}
eq(resolveClassEngine(bilEcole, { level: 'Terminale', name: 'Tle C' }), 'sc', 'second cycle conservé');
eq(resolveClassEngine(bilEcole, { level: 'Lower Sixth', name: 'Lower Sixth Science' }), 'sc',
  'second cycle anglophone conservé');
eq(resolveClassEngine(bilEcole, { level: '6e', name: '6e Bil' }), 'bilingue',
  'et le premier cycle part bien sur le programme bilingue');

// Le profil ne diffère de « officiel » QUE sur le premier cycle en service.
const off = { bulletin_engine: 'officiel' };
for (const [lvl, nom] of [['PS', 'PS'], ['CE1', 'CE1'], ['Terminale', 'Tle C']]) {
  ok(resolveClassEngine(bilEcole, { level: lvl, name: nom }) === resolveClassEngine(off, { level: lvl, name: nom }),
    `${lvl} : même moteur qu'une école « officiel »`);
}
ok(resolveClassEngine(bilEcole, { level: '6e', name: '6e' }) !== resolveClassEngine(off, { level: '6e', name: '6e' }),
  '6e : seule différence avec « officiel » — bilingue au lieu d\'APC');

// Non-régression : les écoles déjà configurées ne basculent PAS sur ce moteur.
for (const flag of ['minesec', 'officiel', 'apc_minesec']) {
  ok(resolveClassEngine({ bulletin_engine: flag }, { level: '6e', name: '6e' }) !== 'bilingue',
    `une école « ${flag} » garde son moteur sur la 6e`);
}

console.log(`\n${pass} assertions OK`);
