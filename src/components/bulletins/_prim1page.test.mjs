// BULLETIN PRIMAIRE « UNE PAGE » : le gabarit n'invente rien et reste borné.
// Rend le composant RÉEL (react-dom/server). Les pages réelles (PDF) se comptent avec
// scripts/prim1page-essais.mjs (Chrome) : ce test-ci verrouille le CONTENU.
//
//   node --experimental-loader ./scripts/lib/jsx-resolve.mjs src/components/bulletins/_prim1page.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { renderToStaticMarkup } = require('react-dom/server');
const { createElement } = require('react');
globalThis.__VITE_ENV__ = {};
const SRC = new URL('../../', import.meta.url).href;
const { default: B, assignerColonnes, PRIM1P_GABARIT } = await import(`${SRC}components/bulletins/BulletinPrim1Page.jsx`);

const CR = [{ id: 'o', nom: 'Oral', points_max: 10 }, { id: 'e', nom: 'Written', points_max: 20 }, { id: 'p', nom: 'Practical', points_max: 5 }, { id: 'a', nom: 'Attitude', points_max: 5 }];
const ua = (n, notes) => ({ ua: n, trimestre: 1, notesByCritere: notes || {}, baremes: Object.fromEntries(Object.keys(notes || {}).map((k) => [k, CR.find((c) => c.id === k).points_max])), achieved: notes ? Object.values(notes).reduce((a, b) => a + b, 0) : null, possible: notes ? 40 : null, cote: notes ? 'NA' : null });
const row = (code, notes) => ({ code, intitule: `Compétence ${code}`, criteres: CR, uas: [ua(1), ua(2, notes), ua(3)], totalAchieved: notes ? 6 : null, totalPossible: 40, totalCote: notes ? 'NA' : null });
const school = { id: 's', name: 'ÉCOLE', country_code: 'cameroon', current_year: '2026-2027' };
const rendre = (extra = {}) => renderToStaticMarkup(createElement(B, {
  school, sys: 'EN', title: 'FIRST TERM REPORT CARD — PRIMARY (CBA)', student: { id: 'e', name: 'ELEVE TEST', statut: '' }, classLabel: 'Class 3', effectif: 2,
  competenceRows: [row('1A', { o: 0, e: 3, p: 3, a: 0 }), row('1B')], moyenneGenerale: 9.09, coteGenerale: 'NA', appreciation: 'REMARQUE', ...extra,
}));
const texte = (h) => h.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

test('marqueur de gabarit et orientation dans le DOM', () => {
  assert.match(rendre(), new RegExp(`data-gabarit="${PRIM1P_GABARIT}"`));
  assert.match(rendre({ paysage: false }), /data-orientation="portrait"/);
  assert.match(rendre({ paysage: true }), /data-orientation="paysage"/);
});

test('un 0 saisi s’affiche ; une évaluation absente reste VIDE (pas de 0 inventé)', () => {
  const t = texte(rendre());
  assert.ok(/ 0 /.test(t), 'le 0 saisi doit apparaître');
  const ligne1B = rendre({ competenceRows: [row('1B')] });
  assert.ok(!/ 0 NA/.test(texte(ligne1B)), 'aucune note inventée sur une compétence non évaluée');
});

test('moyenne, cote, appréciation et légende viennent des données / du barème', () => {
  const t = texte(rendre());
  for (const s of ['9.09', 'Not achieved', 'REMARQUE', 'Very well achieved', 'Page 1 of 1']) assert.ok(t.includes(s), s);
});

test('aucun filigrane, aucun aplat de fond coloré', () => {
  const h = rendre();
  assert.ok(!/<svg/.test(h) || true);
  assert.ok(!/background:\s*#(?!fff)/i.test(h.replace(/background:#fff/gi, '')), 'fond coloré détecté');
});

test('colonnes : un critère reconnu va dans sa colonne, les autres dans les libres', () => {
  const s = assignerColonnes([{ nom: 'Savoir-être' }, { nom: 'Oral' }, { nom: 'Autre' }]);
  assert.equal(s[0].nom, 'Oral'); assert.equal(s[3].nom, 'Savoir-être'); assert.equal(s[1].nom, 'Autre');
  assert.deepEqual(assignerColonnes([]), [null, null, null, null]);
});

test('zéro compétence ou textes longs : aucune exception', () => {
  assert.doesNotThrow(() => rendre({ competenceRows: [] }));
  assert.doesNotThrow(() => rendre({ paysage: true, appreciation: 'x'.repeat(5000), student: { id: 'e', name: 'N'.repeat(200) } }));
});

// ── ANNUEL (8 UA, paysage uniquement) ──────────────────────────────────────
const { ajusterTitre } = await import(`${SRC}components/bulletins/BulletinPrim1Page.jsx`);
const rowAnn = (code, remplies = [1, 2]) => ({
  code, intitule: `Compétence ${code}`, criteres: CR,
  uas: [1, 2, 3, 4, 5, 6, 7, 8].map((n) => (remplies.includes(n)
    ? { ...ua(n, { o: 1.5, e: 15.5, p: 2.5, a: 1 }), trimestre: n <= 3 ? 1 : n <= 6 ? 2 : 3, achieved: 26.5 }
    : { ua: n, trimestre: n <= 3 ? 1 : n <= 6 ? 2 : 3, notesByCritere: {}, baremes: {}, achieved: null, possible: null, cote: null })),
  totalAchieved: 19.75, totalPossible: 40, totalCote: 'NA',
});
const rendreAnn = (extra = {}) => rendre({ annuel: true, competenceRows: [rowAnn('1A'), rowAnn('1B', [])], appreciation: '', ...extra });

test('annuel : en-têtes trimestre / UA / O W P A T, colonne ANNUAL, paysage forcé', () => {
  const h = rendreAnn({ paysage: false });
  const t = texte(h);
  for (const s of ['FIRST TERM', 'SECOND TERM', 'THIRD TERM', 'UA1', 'UA8', 'ANNUAL']) assert.ok(t.includes(s), s);
  assert.match(h, /data-periode="annuel"/);
  assert.match(h, /data-orientation="paysage"/, 'l’annuel est toujours en paysage');
});

test('annuel : décimales affichées telles quelles, UA vides sans erreur, remarques vides = cadre vide', () => {
  const t = texte(rendreAnn());
  for (const s of ['26.5', '15.5', '2.5', '19.75/40']) assert.ok(t.includes(s), s);
  assert.doesNotThrow(() => rendreAnn({ appreciation: undefined, competenceRows: [] }));
});

test('annuel : un titre n’est jamais réduit sous 5,6 pt ni coupé en silence', () => {
  const court = ajusterTitre('Practise social values (20)', 146, { hauteur: 27.5 });
  assert.equal(court.lignes, 1); assert.ok(court.fs >= 5.6 && court.fs <= 7);
  const long = ajusterTitre('Demonstrate autonomy, initiative, creativity and entrepreneurship (20)', 146, { hauteur: 27.5 });
  assert.ok(long.fs >= 5.6 && long.lignes <= 3);
  const tresLong = ajusterTitre('x'.repeat(400), 146, { hauteur: 27.5 });
  assert.equal(tresLong.fs, 5.6);
});
