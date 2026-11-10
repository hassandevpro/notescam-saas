// LE BULLETIN « CLASSIQUE PAR MATIÈRES » : MATIÈRE | Barème | Note | Cote, sans code, sans « U.A. », sans « Écrit ».
// Les deux autres formats (critères en colonnes, une ligne par épreuve) ne bougent pas. Rendu RÉEL des gabarits,
// sur l'exemple de l'école : AKATEU MEGNE INDIRA FALIDA, 260,5 / 400, moyenne 13,03.
//
//   node --experimental-loader ./scripts/lib/jsx-resolve.mjs src/components/bulletins/_primFormatMatieres.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { renderToStaticMarkup } = require('react-dom/server');
const { createElement } = require('react');
globalThis.__VITE_ENV__ = {};

const SRC = new URL('../../', import.meta.url).href;
const { default: Compact } = await import(`${SRC}components/bulletins/BulletinPrimCompact.jsx`);

const MATIERES = [
  ['1B', 'Communicate in English', 28, 50], ['1C', 'Langue nationale', 16, 20], ['2B', 'Sciences et technologie', 31.5, 50],
  ['5A', 'TIC', 21, 30], ['6A', 'Sport', 18, 20], ['6B', 'Activités artistiques', 16.5, 20],
  ['DQ', 'Dictée-Question', 20.5, 40], ['EDT', 'Étude de texte', 19, 30], ['PDE', 'Production d’écrits', 20, 30],
  ['CR', 'Calcul rapide', 13, 20], ['CG', 'Connaissances générales', 22.5, 40], ['PR2', 'Problème', 34.5, 50],
];
const CRITERES = [{ id: 'cr-e', nom: 'Écrit' }];
const rows = MATIERES.map(([code, intitule, note, max]) => ({
  code, intitule, domaine: 'langues', parCritere: { 'cr-e': { note, max } },
  achieved: note, possible: max, cote: note / max >= 0.75 ? 'A' : 'ECA', nonEvaluee: false,
  epreuves: [{ id: `${code}-e`, nom: 'Écrit', max, note }],
}));
const BAREME = [{ cote: 'A+', seuil_min: 90, libelle: 'Très bien acquis' }, { cote: 'A', seuil_min: 75, libelle: 'Acquis' },
  { cote: 'ECA', seuil_min: 55, libelle: 'En cours d’acquisition' }, { cote: 'NA', seuil_min: 0, libelle: 'Non acquis' }];
const school = { id: 's', name: 'ÉCOLE DE CONTRÔLE', country_code: 'cameroon', current_year: '2026-2027' };
const cls = { id: 'c', name: 'CM1', level: 'CM1', system: 'FR' };
const student = { id: 'e', name: 'AKATEU MEGNE INDIRA FALIDA', matricule: 'X-1' };
const texte = (h) => h.replace(/<[^>]*>/g, ' ').replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

const rendre = (extra) => renderToStaticMarkup(createElement(Compact, {
  school, cls, student, sys: 'FR', effectif: 8, periodLabel: 'Trimestre 1', critereColumns: CRITERES, niveauTotal: 400,
  groupes: false, titulaire: 'M.', pt: 9, rows, coteBareme: BAREME,
  overall: { achieved: 260.5, possible: 400, pct: 65.1, evaluees: 12, nonEvaluees: 0 }, nonEvalueesCodes: [],
  moyenneGenerale: 13.03, coteGenerale: 'ECA', rank: 3, ...extra,
}));
const CODES = /(^|[^A-Za-zÀ-ÿ])(1B|1C|2B|5A|6A|6B|DQ|EDT|PDE|CR|CG|PR2)(?![A-Za-zÀ-ÿ0-9])/;
const entetes = (h) => [...h.matchAll(/<th[^>]*>(.*?)<\/th>/g)].map((m) => texte(m[1]));

test('mode 3 : colonnes MATIÈRE | Barème | Note | Cote, aucun code, aucun « Écrit », aucune colonne U.A.', () => {
  const h = rendre({ disposition: 'matieres' });
  const th = entetes(h).slice(0, 4);
  assert.deepEqual(th, ['MATIÈRE', 'Barème', 'Note', 'Cote']);
  const t = texte(h);
  assert.ok(!/Écrit/.test(t), 'le mot « Écrit » n’apparaît nulle part');
  assert.ok(!/U\.A\./.test(t), 'aucune colonne U.A.');
  assert.ok(!/Compétence/i.test(t), 'plus de « COMPÉTENCES »');
  const corps = t.slice(t.indexOf('MATIÈRE'), t.indexOf('Échelle'));
  assert.ok(!CODES.test(corps), `aucun code de matière dans le tableau : ${corps.match(CODES)}`);
  for (const [, nom] of MATIERES) assert.ok(corps.includes(nom), `la matière « ${nom} » s'affiche`);
});

test('mode 3 : mêmes totaux et même moyenne que les autres modes, sans regroupement par défaut', () => {
  const t = texte(rendre({ disposition: 'matieres' }));
  assert.match(t, /TOTAL GÉNÉRAL 400(\.00)? 260\.5(0)?/, 'Barème puis Note au total général');
  assert.match(t, /13\.03 \/ 20/, 'la moyenne est celle qu’on lui donne');
  assert.ok(!/\d\) /.test(t.slice(t.indexOf('MATIÈRE'), t.indexOf('TOTAL GÉNÉRAL'))), 'aucune ligne « 1) INTITULÉ »');
});

test('mode 3 : sans échelle de cotes, la colonne Cote disparaît', () => {
  const h = rendre({ disposition: 'matieres', coteBareme: [] });
  assert.deepEqual(entetes(h).slice(0, 3), ['MATIÈRE', 'Barème', 'Note']);
});

test('mode 3 en anglais : SUBJECT | Out of | Mark | Grade', () => {
  const h = rendre({ disposition: 'matieres', sys: 'EN' });
  assert.deepEqual(entetes(h).slice(0, 4), ['SUBJECT', 'Out of', 'Mark', 'Grade']);
});

test('mode 3 : les groupes sont une option, sans numéro', () => {
  const t = texte(rendre({ disposition: 'matieres', groupes: true }));
  const corps = t.slice(t.indexOf('MATIÈRE'), t.indexOf('TOTAL GÉNÉRAL'));
  assert.ok(/Total: /.test(corps), 'une ligne de groupe apparaît');
  assert.ok(!/\b[1-6]\) /.test(corps), 'sans numéro de groupe');
});

test('mode 2 (une ligne par épreuve) reste identique : Comp. · COMPÉTENCES · U.A. · Bar. · Note · Cote', () => {
  const h = rendre({ disposition: 'epreuves' });
  assert.deepEqual(entetes(h).slice(0, 6), ['Comp.', 'COMPÉTENCES', 'U.A.', 'Bar.', 'Note', 'Cote']);
  assert.match(texte(h), /DQ/);
});

test('mode 1 (critères en colonnes) reste disponible : les critères de l’école sont les colonnes', () => {
  const quatre = [{ id: 'cr-o', nom: 'Oral' }, { id: 'cr-e', nom: 'Écrit' }, { id: 'cr-p', nom: 'Pratique' }, { id: 'cr-s', nom: 'Savoir-être' }];
  const t = texte(rendre({ disposition: 'criteres', critereColumns: quatre }));
  for (const n of ['Oral', 'Écrit', 'Pratique', 'Savoir-être']) assert.ok(t.includes(n), n);
});

const bulletins = readFileSync(new URL('../../pages/Bulletins.jsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const reglages = readFileSync(new URL('../../pages/Settings.jsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
test('câblage : « carnet_matieres » est un réglage d’école, imprimé en vue compacte', () => {
  assert.ok(bulletins.includes("school?.prim_bulletin_mode === 'carnet_matieres'"));
  assert.ok(bulletins.includes("disposition={primMatieres ? 'matieres' : primEpreuves ? 'epreuves' : 'criteres'}"));
  assert.ok(bulletins.includes('(primEpreuves || primMatieres) && primLayoutPref'));
  assert.ok(reglages.includes("['carnet', 'carnet_epreuves', 'carnet_matieres'].includes"), 'la valeur survit à l’enregistrement');
  assert.ok(reglages.includes("value: 'carnet_matieres'"));
});
