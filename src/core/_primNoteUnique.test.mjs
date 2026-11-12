// BULLETIN PRIMAIRE « MATIÈRES À NOTE UNIQUE » — moteur de calcul.
//   node --experimental-loader ./scripts/lib/jsx-resolve.mjs src/core/_primNoteUnique.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';

const SRC = new URL('./', import.meta.url).href;
const N = await import(`${SRC}primNoteUnique.js`);
const { buildPrimRanks, PRIM_COTE_DEFAULT } = await import(`${SRC}primEngine.js`);
const { computePrimClassStats } = await import(`${SRC}primClassStats.js`);

// L'élève du bulletin modèle (CM2, 12 matières, 400 points)
const MODELE = [
  ['Communicate in English', 28, 50], ['Langue nationale', 16, 20], ['Sciences et technologies', 31.5, 50],
  ['TIC', 21, 30], ['EPS', 18, 20], ['Activités artistiques', 16.5, 20], ['Dictée-question', 20.5, 40],
  ['Étude de texte', 19, 30], ['Production d’écrits', 20, 30], ['Calcul rapide', 13, 20],
  ['Connaissances générales', 22.5, 40], ['Problème', 34.5, 50],
];
const matieres = (liste) => liste.map(([intitule, a, p]) => ({ intitule, cells: [{ achieved: a, possible: p }] }));

test('bulletin modèle : 260,5 / 400 → 13,03 / 20, cote ECA (et NON 13,55, la moyenne des moyennes)', () => {
  const l = N.lignesNoteUnique(matieres(MODELE), PRIM_COTE_DEFAULT);
  const t = N.totauxNoteUnique(l);
  assert.equal(t.totalNotes, 260.5);
  assert.equal(t.totalBareme, 400);
  assert.equal(t.moyenne, 13.03);
  const moyenneDesMoyennes = l.reduce((s, x) => s + x.sur20, 0) / l.length;
  assert.equal(Math.round(moyenneDesMoyennes * 100) / 100, 13.55, 'l’ancien résultat erroné, que le nouveau calcul ne reprend pas');
  assert.equal(N.moyenneNoteUnique(MODELE.map(([, a, p]) => ({ achieved: a, possible: p }))), 13.03);
  assert.equal(l.length, 12);
});

test('N/20 : arrondi commercial à 2 décimales, comme le modèle', () => {
  const l = N.lignesNoteUnique(matieres(MODELE), PRIM_COTE_DEFAULT);
  assert.deepEqual(l.map((x) => x.sur20), [11.2, 16, 12.6, 14, 18, 16.5, 10.25, 12.67, 13.33, 13, 11.25, 13.8]);
  assert.equal(N.noteSur20(13.565 * 1, 20), 13.57);        // 0,005 monte
  assert.equal(N.noteSur20(1.005, 20), 1.01);              // piège flottant classique
  assert.equal(N.noteSur20(0, 50), 0);
  assert.equal(N.noteSur20(null, 50), null);
  assert.equal(N.noteSur20(5, 0), null);
});

test('cotes : seuils de l’école (A+ 90 %, A 70 %, ECA 50 %), calculées sur note ÷ barème', () => {
  const l = N.lignesNoteUnique(matieres(MODELE), PRIM_COTE_DEFAULT);
  assert.deepEqual(l.map((x) => x.cote), ['ECA', 'A', 'ECA', 'A', 'A+', 'A', 'ECA', 'ECA', 'ECA', 'ECA', 'ECA', 'ECA']);
  // une école qui relève ses seuils obtient d'autres cotes, sans toucher au code
  const exigeant = [{ cote: 'A+', libelle: 'TB', seuil_min: 95 }, { cote: 'A', libelle: 'B', seuil_min: 80 }, { cote: 'ECA', libelle: 'C', seuil_min: 60 }, { cote: 'NA', libelle: 'D', seuil_min: 0 }];
  assert.equal(N.lignesNoteUnique(matieres([['x', 18, 20]]), exigeant)[0].cote, 'A');
});

test('colonne Min–Max : la plage en /20 de la cote', () => {
  assert.equal(N.plageCoteTexte('ECA', PRIM_COTE_DEFAULT), '10–13.99');
  assert.equal(N.plageCoteTexte('A', PRIM_COTE_DEFAULT), '14–17.99');
  assert.equal(N.plageCoteTexte('A+', PRIM_COTE_DEFAULT), '18–20');
  assert.equal(N.plageCoteTexte('NA', PRIM_COTE_DEFAULT), '0–9.99');
  assert.equal(N.plageCoteTexte('??', PRIM_COTE_DEFAULT), '');
});

test('une compétence APC devient une matière : somme des critères, barème total ; aucune ligne ne disparaît', () => {
  const apc = { intitule: 'Compétence 1', cells: [{ achieved: 7, possible: 10 }, { achieved: 12, possible: 20 }] };   // critères / UA
  const nonNotee = { intitule: 'Chinois', cells: [], bareme: 20 };
  const l = N.lignesNoteUnique([apc, nonNotee, { intitule: 'Anglais', cells: [{ achieved: 9, possible: 10 }] }], PRIM_COTE_DEFAULT);
  assert.equal(l.length, 3);
  assert.deepEqual([l[0].note, l[0].bareme, l[0].sur20], [19, 30, 12.67]);
  assert.deepEqual([l[1].note, l[1].bareme, l[1].sur20, l[1].cote, l[1].evaluee], [null, 20, null, null, false]);
  // la matière non notée ne fait pas baisser la moyenne : (19+9) ÷ (40 ÷ 20) = 14
  assert.equal(N.totauxNoteUnique(l).moyenne, 14);
  assert.equal(N.totauxNoteUnique(l).totalBareme, 40);
});

test('contrôle à la main sur trois élèves + statistiques de classe sur la MÊME règle', () => {
  const eleves = {
    a: [[30, 40], [14, 20], [22, 30]],        // 66 / 90 → 14,67
    b: [[20, 40], [10, 20], [15, 30]],        // 45 / 90 → 10
    c: [[38, 40], [19, 20], [28, 30]],        // 85 / 90 → 18,89
  };
  const moy = Object.fromEntries(Object.entries(eleves).map(([k, v]) => [k, N.moyenneNoteUnique(v.map(([a, p]) => ({ achieved: a, possible: p })))]));
  assert.deepEqual(moy, { a: 14.67, b: 10, c: 18.89 });
  const stats = computePrimClassStats(Object.values(moy), 10);
  assert.equal(stats.max, 18.89);
  assert.equal(stats.min, 10);
  assert.equal(stats.avg, 14.52);             // (14,67 + 10 + 18,89) ÷ 3
  assert.equal(stats.reussis, 3);
  assert.equal(stats.rate, 100);
  const rangs = Object.fromEntries(buildPrimRanks(Object.keys(eleves).map((id) => ({ id })), moy).map((r) => [r.id, r.rang]));
  assert.deepEqual(rangs, { c: 1, a: 2, b: 3 });
});

test('ex æquo : même rang, le suivant saute', () => {
  const rangs = Object.fromEntries(buildPrimRanks([{ id: 'x' }, { id: 'y' }, { id: 'z' }], { x: 15, y: 15, z: 12 }).map((r) => [r.id, r.rang]));
  assert.equal(rangs.x, rangs.y);
  assert.equal(rangs.z, 3);
});

test('titre : la période vient des réglages, « Trimestre » n’est jamais codé en dur', () => {
  assert.equal(N.titreNoteUnique({ label: 'Séquence 1' }, 'FR', true), 'BULLETIN DE LA SÉQUENCE 1 / PROGRESS REPORT CARD');
  assert.equal(N.titreNoteUnique({ label: 'Séquence 1' }, 'FR', false), 'BULLETIN DE LA SÉQUENCE 1');
  assert.equal(N.titreNoteUnique({ label: 'Premier trimestre' }, 'FR'), 'BULLETIN — PREMIER TRIMESTRE');
  assert.equal(N.titreNoteUnique({ label: 'Trimestre 2' }, 'FR'), 'BULLETIN DU TRIMESTRE 2');
  assert.equal(N.titreNoteUnique({ label: 'UA 3', ua: 3 }, 'FR'), 'BULLETIN DE L\'UA3');
  assert.equal(N.titreNoteUnique({ label: 'Séquence 2' }, 'EN'), 'SÉQUENCE 2 PROGRESS REPORT CARD'.replace('SÉQUENCE', 'SÉQUENCE'));
  assert.ok(!/trimestre/i.test(N.titreNoteUnique({ label: 'Séquence 4' }, 'FR', true)));
});

test('le format se choisit par classe ; par défaut rien ne change', () => {
  assert.equal(N.classeNoteUnique({ bulletin_format: 'note_unique' }), true);
  for (const c of [null, {}, { bulletin_format: null }, { bulletin_format: '' }, { bulletin_format: 'apc' }]) assert.equal(N.classeNoteUnique(c), false);
});
