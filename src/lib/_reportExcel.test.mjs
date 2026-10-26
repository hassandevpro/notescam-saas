// LE CLASSEUR DU RAPPORT DOIT DIRE CE QUE DIT LA FEUILLE IMPRIMÉE
//
//   node src/lib/_reportExcel.test.mjs
//
// Signalé le 2026-10-26 par l'informaticien de THE GENIUS, photo du papier à
// l'appui : « le fichier importé sur Excel n'affiche pas tous les détails,
// comme celle imprimée ». Quatre choses manquaient — l'en-tête, les chiffres de
// la classe, le barème de chaque matière, et le tableau par matière qui partait
// dans un AUTRE fichier. Ce test les garde.
import { enteteRapport, classementRows, parMatiereRows, rapportComplet } from './reportExcel.js';

let pass = 0, fail = 0;
const ok = (c, label, got) => {
  if (c) { pass++; console.log(`✅ ${label}`); }
  else { fail++; console.log(`❌ ${label}${got === undefined ? '' : ` — obtenu : ${JSON.stringify(got)}`}`); }
};

// Un cas calqué sur la photo : 6ème, séquence 1, 19 élèves, 17 admis, 89 %.
const ARGS = {
  school: { name: 'THE GENIUS INTERNATIONAL COLLEGE', current_year: '2026-2027' },
  classe: { name: '6ème' },
  periode: { label: 'Séquence 1' },
  stats: { total: 19, avg: 13.23, above: 17 },
  scale: 20,
  pass: 10,
  date: '23 octobre 2026',
  colonnes: [
    { id: 'svt', name: 'SVT', max: 20 },
    { id: 'info', name: 'Informatique', max: 10 },   // barème DIFFÉRENT : c'est tout l'enjeu
  ],
  studentResults: [
    { student: { name: 'NDJOCK Michel', matricule: 'G-001' }, avg: 17.05, rank: { rankN: 1 }, appr: { text: 'Très bien' }, scores: { svt: 16, info: 9 } },
    { student: { name: 'FOMO Pamela', matricule: 'G-002' }, avg: 8.09, rank: { rankN: 19 }, appr: { text: 'Insuffisant' }, scores: { svt: 7, info: 4 } },
  ],
  subjectStats: [
    { sub: { name: 'SVT', max: 20, coef: 2 }, avg: 13.42, min: 2, max: 19, passCount: 16, total: 19 },
    { sub: { name: 'Informatique', max: 10, coef: 1 }, avg: 6.1, min: 1, max: 9, passCount: 9, total: 19 },
  ],
};

const plat = (rows) => rows.map((r) => r.join('|')).join('\n');

console.log('\n── 1. L’en-tête dit de quelle classe et de quelle période on parle ──');
const ent = enteteRapport(ARGS);
const entTxt = plat(ent);
ok(entTxt.includes('THE GENIUS INTERNATIONAL COLLEGE'), 'l’établissement');
ok(entTxt.includes('2026-2027'), 'l’année scolaire');
ok(entTxt.includes('6ÈME') && entTxt.includes('SÉQUENCE 1'), 'le titre porte classe et période');
ok(entTxt.includes('Effectif|19'), 'l’effectif');
ok(entTxt.includes('23 octobre 2026'), 'la date');

console.log('\n── 2. Les chiffres de la classe, comme sur le papier ──');
ok(entTxt.includes('Moyenne classe|13.23'), 'la moyenne de classe');
ok(entTxt.includes('Barème|/20'), 'le barème de la moyenne');
ok(entTxt.includes('Taux de réussite|89%'), 'le taux de réussite, calculé (17/19)');
ok(entTxt.includes('Admis|17/19'), 'le nombre d’admis');

console.log('\n── 3. Le barème de CHAQUE matière est dans son en-tête ──');
// Sans lui, la colonne « Informatique » (notée /10) et la colonne « SVT »
// (notée /20) donnent deux suites de nombres indiscernables : un 8 est la
// moyenne sur l’une et un échec sur l’autre.
const clt = classementRows(ARGS);
ok(clt[1].includes('SVT /20'), 'SVT porte son barème', clt[1]);
ok(clt[1].includes('Informatique /10'), 'Informatique porte le sien', clt[1]);
ok(clt[1].includes('Moyenne /20'), 'la moyenne aussi');

console.log('\n── 4. Aucune colonne ni aucun élève perdu ──');
ok(clt.length === 2 + ARGS.studentResults.length, 'une ligne par élève, plus titre et en-tête', clt.length);
ok(clt[1].length === 3 + ARGS.colonnes.length + 3, 'rang, nom, matricule + matières + moyenne, appréciation, décision', clt[1].length);
ok(clt[2][0] === 1 && clt[3][0] === 19, 'les rangs sont ceux du classement');
ok(clt[2].includes(16) && clt[2].includes(9), 'les notes par matière sont présentes', clt[2]);
ok(clt[2].includes('Admis(e)') && clt[3].includes('Ajourné(e)'), 'la décision suit le seuil (10/20)');

console.log('\n── 5. Le second tableau est dans le MÊME classeur ──');
const tout = rapportComplet(ARGS);
const toutTxt = plat(tout);
ok(toutTxt.includes('CLASSEMENT DES ÉLÈVES'), 'le classement y est');
ok(toutTxt.includes('RÉSULTATS PAR MATIÈRE'), 'les résultats par matière AUSSI (ils partaient dans un autre fichier)');
const iClt = tout.findIndex((r) => r[0] === 'CLASSEMENT DES ÉLÈVES');
const iMat = tout.findIndex((r) => r[0] === 'RÉSULTATS PAR MATIÈRE');
ok(iClt > 0 && iMat > iClt, 'dans l’ordre de la page imprimée');
ok(tout[iMat - 1].length === 0, 'une ligne vide sépare les deux tableaux — sinon Excel les trie comme un seul');

console.log('\n── 6. Le tableau par matière porte coefficient, barème et taux ──');
const mat = parMatiereRows(ARGS);
ok(mat[1].includes('Coef') && mat[1].includes('Barème'), 'coefficient et barème en en-tête');
ok(mat[2].includes('/20') && mat[2].includes(2), 'le barème et le coef de SVT', mat[2]);
ok(mat[2].includes('84%'), 'le taux de réussite est calculé (16/19)', mat[2]);
ok(mat.length === 2 + ARGS.subjectStats.length, 'une ligne par matière', mat.length);

console.log('\n── 7. Maternelle : pas de moyenne inventée ──');
// Une case vide sous « Moyenne classe » se lit comme une donnée manquante ;
// en maternelle il n'y a tout simplement pas de moyenne.
const entMat = plat(enteteRapport({ ...ARGS, stats: { total: 12 } }));
ok(!entMat.includes('Moyenne classe'), 'aucune ligne de moyenne sans moyenne');
ok(entMat.includes('Effectif|12'), 'l’effectif reste annoncé');

console.log('\n── 8. Un rapport sans matière ne fabrique pas un tableau vide ──');
const sansMat = rapportComplet({ ...ARGS, subjectStats: [] });
ok(!plat(sansMat).includes('RÉSULTATS PAR MATIÈRE'), 'le second tableau disparaît au lieu d’être vide');

console.log(`\n${pass} réussis · ${fail} échoués`);
process.exit(fail ? 1 : 0);
