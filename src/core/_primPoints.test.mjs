// LES TOTAUX EN POINTS DU CARNET APC PRIMAIRE
//
// Le carnet officiel porte deux lignes de synthèse qui ne se déduisent PAS
// l'une de l'autre :
//
//   « Total obtenu »  = Σ points obtenus / Σ barèmes des évaluations faites
//   « Moyenne »       = `generalAverage`, moyenne des compétences pondérée par
//                       coefficient — inchangée (décision du 2026-10-12)
//
// Ce fichier couvre les TOTAUX. Il vérifie aussi, explicitement, que les deux
// lectures divergent et de combien : c'est une propriété du modèle, pas un
// défaut, et un test qui la fixe empêche qu'on « corrige » l'une pour la faire
// coller à l'autre sans décision.
//
// Les données sont celles du carnet de référence réellement imprimé
// (Bright Continent, Class 2, UA 1) : c'est le seul jeu de données dont on
// connaisse la sortie attendue au centième.
import {
  pointsForPeriod, pointsOverall, pointsAverage, competencePointsTotal,
  generalAverage, PRIM_GRADE_MAX,
} from './primEngine.js';

let echecs = 0;
const ok = (cond, libelle, obtenu) => {
  if (cond) console.log(`OK   ${libelle}`);
  else { console.log(`KO   ${libelle} (obtenu: ${JSON.stringify(obtenu)})`); echecs++; }
};
const titre = (s) => console.log(`\n-- ${s} --`);

// ── Le carnet de référence, compétence par compétence ─────────────────────
// Barèmes réels du référentiel Bright Continent : Oral / Écrit / Pratique /
// Savoir-être, hétérogènes d'une compétence à l'autre.
const CRIT = (o, e, p, s) => [
  { id: 'oral', points_max: o }, { id: 'ecrit', points_max: e },
  { id: 'pratique', points_max: p }, { id: 'savoir_etre', points_max: s },
];
const REF = [
  { code: '1A', crit: CRIT(10, 20, 5, 5), notes: { oral: 6.3, ecrit: 12.7, pratique: 3.2, savoir_etre: 3.13 }, total: 25.33, max: 40 },
  { code: '1B', crit: CRIT(10, 25, 3, 2), notes: { oral: 8, ecrit: 16, pratique: 3, savoir_etre: 2 },          total: 29,    max: 40 },
  { code: '1C', crit: CRIT(10, 20, 5, 5), notes: {},                                                            total: null,  max: null },
  { code: '2A', crit: CRIT(5, 30, 3, 2),  notes: { oral: 5, ecrit: 24, pratique: 3, savoir_etre: 2 },          total: 34,    max: 40 },
  { code: '2B', crit: CRIT(5, 30, 3, 2),  notes: { oral: 4, ecrit: 17, pratique: 3, savoir_etre: 2 },          total: 26,    max: 40 },
  { code: '3A', crit: CRIT(5, 10, 3, 2),  notes: { oral: 3, ecrit: 10, pratique: 3, savoir_etre: 2 },          total: 18,    max: 20 },
  { code: '3B', crit: CRIT(5, 10, 3, 2),  notes: {},                                                            total: null,  max: null },
  { code: '4A', crit: CRIT(5, 10, 3, 2),  notes: {},                                                            total: null,  max: null },
  { code: '5A', crit: CRIT(3, 10, 5, 2),  notes: { oral: 3, ecrit: 2.5, pratique: 1, savoir_etre: 2 },         total: 8.5,   max: 20 },
  { code: '6A', crit: CRIT(3, 5, 10, 2),  notes: { oral: 3, ecrit: 5, pratique: 10, savoir_etre: 2 },          total: 20,    max: 20 },
  { code: '6B', crit: CRIT(3, 10, 5, 2),  notes: { oral: 3, ecrit: 7, pratique: 5, savoir_etre: 2 },           total: 17,    max: 20 },
];

titre('Total par competence, compare au carnet imprime');
for (const c of REF) {
  const t = competencePointsTotal(c.notes, c.crit);
  ok(t.achieved === c.total && t.possible === c.max,
    `${c.code} -> ${c.total === null ? 'non evaluee' : `${c.total} / ${c.max}`}`, t);
}

titre('Total general : « sur 240 et non sur 300 »');
const rows = REF.map((c) => competencePointsTotal(c.notes, c.crit));
const g = pointsOverall(rows);
ok(g.achieved === 177.83, 'total obtenu = 177,83 (le chiffre du carnet)', g.achieved);
ok(g.possible === 240, 'total possible = 240, pas 300', g.possible);
ok(g.evaluees === 8, 'huit competences evaluees', g.evaluees);
ok(g.nonEvaluees === 3, 'trois non evaluees (1C, 3B, 4A), exclues des DEUX totaux', g.nonEvaluees);
ok(Math.abs(g.pct - 74.1) < 0.01, 'pourcentage = 74,10 %', g.pct);

titre('Une competence non evaluee n est jamais un zero');
// Si 1C, 3B et 4A comptaient 0, le denominateur serait 300 et la moyenne
// s effondrerait — c est la faute que le carnet evite explicitement.
const avecZeros = REF.map((c) => (c.total === null
  ? { achieved: 0, possible: 40 }
  : competencePointsTotal(c.notes, c.crit)));
const gz = pointsOverall(avecZeros);
ok(gz.possible === 360 && gz.achieved === 177.83,
  'temoin : les compter 0 change le denominateur (360) et fausse tout', gz);
ok(pointsAverage(g.achieved, g.possible) > pointsAverage(gz.achieved, gz.possible),
  'temoin : les compter 0 ferait chuter le resultat', [pointsAverage(g.achieved, g.possible), pointsAverage(gz.achieved, gz.possible)]);

titre('Note NULLE reellement attribuee vs note ABSENTE');
// 5A du carnet porte un Ecrit a 2,5 et un Pratique a 1 : des notes faibles,
// bien comptees. Un zero explicite doit compter comme un zero.
const zeroExplicite = competencePointsTotal({ oral: 0, ecrit: 0, pratique: 0, savoir_etre: 0 }, CRIT(3, 10, 5, 2));
ok(zeroExplicite.achieved === 0 && zeroExplicite.possible === 20,
  'quatre zeros saisis -> 0 / 20, la competence EST evaluee', zeroExplicite);
const rienSaisi = competencePointsTotal({}, CRIT(3, 10, 5, 2));
ok(rienSaisi.achieved === null && rienSaisi.possible === null,
  'rien saisi -> null, la competence n est PAS evaluee', rienSaisi);
ok(pointsOverall([zeroExplicite]).possible === 20,
  'un zero saisi entre dans le denominateur', pointsOverall([zeroExplicite]));
ok(pointsOverall([rienSaisi]).possible === null,
  'une absence n entre dans aucun des deux', pointsOverall([rienSaisi]));

titre('Les deux lectures divergent, et c est documente');
const moyennePoints = pointsAverage(g.achieved, g.possible, PRIM_GRADE_MAX);
ok(moyennePoints === 14.82, 'le total ramene a /20 donne 14,82 — le chiffre du carnet', moyennePoints);
const moyenneCompetences = generalAverage(
  REF.filter((c) => c.total !== null)
    .map((c) => ({ moyenne: (c.total / c.max) * PRIM_GRADE_MAX, coef: 1 })),
);
ok(moyenneCompetences === 15.08,
  'generalAverage (regle CONSERVEE du bulletin) donne 15,08', moyenneCompetences);
ok(Math.abs(moyenneCompetences - moyennePoints) > 0.2,
  'les deux lectures diffèrent de plus de 0,2 point : propriete du modele, pas un defaut',
  Math.round((moyenneCompetences - moyennePoints) * 100) / 100);

titre('Agregation sur plusieurs UA (extension documentee, hors carnet)');
// Deux UA de la meme competence, barème CHANGEANT entre les deux : l Oral passe
// de /10 a /20. Sommer les points est licite, sommer les notes brutes ne l est pas.
const crit1A = CRIT(10, 20, 5, 5);
const noteAt = (ua, id) => {
  if (ua === 1) return { oral: { note: 8, max: 10 }, ecrit: { note: 10, max: 20 }, pratique: 4, savoir_etre: 5 }[id] ?? null;
  if (ua === 2) return { oral: { note: 16, max: 20 }, ecrit: { note: 15, max: 20 }, pratique: 5, savoir_etre: 5 }[id] ?? null;
  return null;                                     // UA 3 non evaluee
};
const p = pointsForPeriod(noteAt, crit1A, [1, 2, 3]);
ok(p.uasNotees === 2, 'deux UA notees sur trois', p.uasNotees);
ok(p.achieved === 68, 'points obtenus = (8+10+4+5=27) + (16+15+5+5=41) = 68', p.achieved);
ok(p.possible === 90, 'barèmes = (10+20+5+5) + (20+20+5+5) = 90, le barème de CHAQUE evaluation', p.possible);
ok(pointsForPeriod(() => null, crit1A, [1, 2, 3]).achieved === null,
  'aucune UA notee -> null, pas 0', pointsForPeriod(() => null, crit1A, [1, 2, 3]));
ok(pointsForPeriod(noteAt, crit1A, []).achieved === null,
  'periode vide -> null', pointsForPeriod(noteAt, crit1A, []));

titre('Entrees aberrantes');
ok(pointsOverall([]).achieved === null, 'aucune ligne -> null', pointsOverall([]));
ok(pointsOverall(null).achieved === null, 'rows null -> null', pointsOverall(null));
ok(pointsAverage(null, 240) === null, 'total absent -> null', pointsAverage(null, 240));
ok(pointsAverage(100, 0) === null, 'barème nul -> null, jamais une division par zero', pointsAverage(100, 0));
ok(pointsAverage(100, null) === null, 'barème absent -> null', pointsAverage(100, null));

console.log(echecs === 0 ? '\nTOUS LES TESTS PASSENT' : `\nECHEC : ${echecs}`);
process.exitCode = echecs === 0 ? 0 : 1;
