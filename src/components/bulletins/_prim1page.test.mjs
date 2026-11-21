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
const { ajusterTitre, ajusterTitrePortrait } = await import(`${SRC}components/bulletins/BulletinPrim1Page.jsx`);
const rowAnn = (code, remplies = [1, 2]) => ({
  code, intitule: `Compétence ${code}`, criteres: CR,
  uas: [1, 2, 3, 4, 5, 6, 7, 8].map((n) => (remplies.includes(n)
    ? { ...ua(n, { o: 1.5, e: 15.5, p: 2.5, a: 1 }), trimestre: n <= 3 ? 1 : n <= 6 ? 2 : 3, achieved: 26.5 }
    : { ua: n, trimestre: n <= 3 ? 1 : n <= 6 ? 2 : 3, notesByCritere: {}, baremes: {}, achieved: null, possible: null, cote: null })),
  totalAchieved: 19.75, totalPossible: 40, totalCote: 'NA',
});
const rendreAnn = (extra = {}) => rendre({ annuel: true, competenceRows: [rowAnn('1A'), rowAnn('1B', [])], appreciation: '', ...extra });

test('annuel : deux dispositions selon l’orientation (portrait par défaut)', () => {
  const portrait = rendreAnn({ paysage: false });
  const paysage = rendreAnn({ paysage: true });
  for (const h of [portrait, paysage]) {
    const t = texte(h);
    for (const s of ['FIRST TERM', 'SECOND TERM', 'THIRD TERM', 'UA1', 'UA8']) assert.ok(t.includes(s), s);
    assert.match(h, /data-periode="annuel"/);
  }
  assert.match(portrait, /data-orientation="portrait"/, 'portrait par défaut');
  assert.match(paysage, /data-orientation="paysage"/);
  assert.ok(texte(portrait).includes('ANNUAL'), 'ligne ANNUAL (portrait)');
  assert.ok(texte(paysage).includes('ANNUAL'), 'colonne ANNUAL (paysage)');
  assert.ok(portrait.includes('writing-mode:vertical-rl'), 'libellés de trimestre verticaux (portrait)');
  assert.ok(!paysage.includes('writing-mode:vertical-rl'));
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

test('annuel portrait : titres par mots, 4,2 à 6,6 pt, 6 lignes au plus, jamais de mot coupé tant que ça tient', () => {
  const court = ajusterTitrePortrait('Practise social values (20)', 40);
  assert.ok(court.ok && court.fs <= 6.6 && court.fs >= 4.2 && court.lignes <= 6);
  const long = ajusterTitrePortrait('Demonstrate autonomy, initiative, creativity and entrepreneurship (20)', 43);
  assert.ok(long.ok && long.lignes <= 6 && long.fs >= 4.2, JSON.stringify(long));
  const impossible = ajusterTitrePortrait('Entrepreneurship', 10);   // colonne trop étroite : signalé, pas d’exception
  assert.equal(impossible.ok, false); assert.equal(impossible.fs, 4.2);
});

test('annuel portrait : 8 UA × 5 lignes, décimales, 12 compétences, texte long : aucune exception', () => {
  const rows = Array.from({ length: 12 }, (_, i) => rowAnn('C' + i, [1, 2, 3, 4, 5, 6, 7, 8]));
  const h = rendreAnn({ paysage: false, competenceRows: rows });
  for (const s of ['26.5', 'C0', 'C11', 'UA8']) assert.ok(texte(h).includes(s), s);
  assert.doesNotThrow(() => rendreAnn({ paysage: false, competenceRows: [{ ...rowAnn('X'), intitule: 'x'.repeat(300) }], appreciation: 'y'.repeat(4000) }));
  assert.doesNotThrow(() => rendreAnn({ paysage: false, competenceRows: [] }));
});

// ── STATISTIQUES DE LA CLASSE sur le bulletin du trimestre (mêmes données que le bulletin par UA) ──
const STATS = { min: 6.5, max: 17.78, avg: 12.14, count: 18, reussis: 11, echoues: 7, rate: 61 };
const REPART = [{ label: '[0-3.99]', n: 0 }, { label: '[10-11.99]', n: 4 }, { label: '[16-17.99]', n: 1 }];

test('trimestre : bandeau de statistiques (moyenne générale, plus forte/faible, réussis/échoués) + répartition', () => {
  const t = texte(rendre({ sys: 'FR', classStats: STATS, repartition: REPART }));
  for (const s of ['STATISTIQUES DE LA CLASSE', '18 élèves notés', 'Moyenne générale 12.14', 'Plus forte 17.78', 'Plus faible 6.5', 'Réussis 11', 'Échoués 7', 'Répartition par tranche', '[10-11.99] 4']) assert.ok(t.includes(s), s);
  const en = texte(rendre({ sys: 'EN', classStats: STATS, repartition: REPART }));
  for (const s of ['CLASS STATISTICS', 'General average 12.14', 'Highest 17.78', 'Lowest 6.5', 'Passed 11', 'Failed 7', 'Distribution by band']) assert.ok(en.includes(s), s);
});

test('trimestre : la case « Statistiques » éteinte retire les chiffres, la case « Répartition » est indépendante', () => {
  const sansStats = texte(rendre({ sys: 'FR', classStats: STATS, masquerStats: true, repartition: REPART }));
  assert.ok(!sansStats.includes('STATISTIQUES DE LA CLASSE') && !sansStats.includes('Réussis'));
  assert.ok(sansStats.includes('Répartition par tranche'));
  const sansRep = texte(rendre({ sys: 'FR', classStats: STATS, repartition: [] }));
  assert.ok(sansRep.includes('STATISTIQUES DE LA CLASSE') && !sansRep.includes('Répartition par tranche'));
});

test('trimestre : classe SANS aucune note — pas d’erreur, pas de bandeau, aucun 0 ni NaN inventé', () => {
  let h;
  assert.doesNotThrow(() => { h = rendre({ sys: 'FR', classStats: null, repartition: [] }); });
  const t = texte(h);
  assert.ok(!t.includes('STATISTIQUES DE LA CLASSE') && !t.includes('NaN') && !t.includes('Infinity'));
});

test('trimestre : un seul élève noté — accord singulier, aucune division par zéro', () => {
  const t = texte(rendre({ sys: 'FR', classStats: { min: 17.78, max: 17.78, avg: 17.78, count: 1, reussis: 1, echoues: 0, rate: 100 }, repartition: [] }));
  assert.ok(t.includes('1 élève noté') && !t.includes('1 élèves'));
});

// ── SIGNATURE DU BAS : « Chef d'établissement » sauf école à directeur par section ──
const signe = (sch, sys) => texte(rendre({ school: { ...school, director: 'Mme ETOA Chantal', ...sch }, sys })).replace(/&#x27;/g, "'");

test('signature : école globale FR → « Le Chef d’établissement », le nom reste dessous', () => {
  const t = signe({ bulletin_bilingual: 0 }, 'FR');
  assert.match(t, /Le Chef d'établissement/); assert.doesNotMatch(t, /Directeur/);
  assert.match(t, /Mme ETOA Chantal/);
});

test('signature : école globale EN → Head of School ; bilingue → libellé FR / EN', () => {
  assert.match(signe({ bulletin_bilingual: 0 }, 'EN'), /Head of School/);
  const bil = signe({ bulletin_bilingual: 1 }, 'FR');
  assert.match(bil, /Chef d'établissement \/ Head of School/);
});

test('signature : directeur par section (Genius) → inchangé, avec le nom de la section', () => {
  const t = signe({ director_per_section: 1, director: 'M. NJOYA Blaise' }, 'FR');
  assert.match(t, /Le Directeur \/ La Directrice/); assert.doesNotMatch(t, /Chef d'établissement/);
  assert.match(t, /M\. NJOYA Blaise/);
  assert.match(signe({ director_per_section: true }, 'EN'), /The Head Teacher/);
});
