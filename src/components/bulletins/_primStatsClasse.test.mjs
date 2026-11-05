// LES BULLETINS DU PRIMAIRE SITUENT L'ÉLÈVE DANS SA CLASSE — rendu réel des deux modèles.
//
// Demande du 2026-11-04 : « les bulletins du primaire manquent les stats en bas : le nombre de
// réussis, le nombre d'échoués, la plus grande moyenne, la plus petite, la moyenne générale ».
// Le modèle compact ne les imprimait qu'en mode « carnet », et aucun modèle ne donnait le NOMBRE
// d'élèves réussis ou échoués.
//
//   node --experimental-loader ./scripts/lib/jsx-resolve.mjs src/components/bulletins/_primStatsClasse.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { renderToStaticMarkup } = require('react-dom/server');
const { createElement } = require('react');
globalThis.__VITE_ENV__ = {};

const SRC = new URL('../../', import.meta.url).href;
const { default: BulletinPrimCompact } = await import(`${SRC}components/bulletins/BulletinPrimCompact.jsx`);
const { default: BulletinPrimAnnualUA } = await import(`${SRC}components/bulletins/BulletinPrimAnnualUA.jsx`);

const texte = (html) => html.replace(/<[^>]*>/g, ' ').replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

const school = { id: 's', name: 'ÉCOLE DE CONTRÔLE', country_code: 'cameroon', current_year: '2026-2027' };
const cls = { id: 'c', name: 'CE1', level: 'CE1', system: 'FR' };
const student = { id: 'e', name: 'ESSOMBA NKOULOU CLAIRE', matricule: 'X-1' };
const CRITERES = [{ id: 'cr-o', nom: 'Oral' }, { id: 'cr-e', nom: 'Écrit' }];
const rows = [{ code: '1A', intitule: 'Communiquer en français', domaine: 'langues',
  parCritere: { 'cr-o': { note: 12, max: 20 }, 'cr-e': { note: 14, max: 20 } }, achieved: 26, possible: 40, cote: 'A', nonEvaluee: false }];

const compact = (extra) => texte(renderToStaticMarkup(createElement(BulletinPrimCompact, {
  school, cls, student, sys: 'FR', effectif: 5, periodLabel: 'Trimestre 1', critereColumns: CRITERES, niveauTotal: 300,
  groupes: true, titulaire: 'KONGYUY DELPHINE', pt: 9, rows,
  overall: { achieved: 26, possible: 40, pct: 65, evaluees: 1, nonEvaluees: 0 }, nonEvalueesCodes: [],
  moyenneGenerale: 13, coteGenerale: 'A', rank: 2, ...extra,
})));

const STATS = { premier: 18, dernier: 6, generale: 11.5, reussis: 3, echoues: 2, reussite: null };

test('compact : plus grande moyenne, plus petite, moyenne générale, réussis ET échoués', () => {
  const t = compact({ statsClasse: STATS });
  assert.match(t, /Stats de performance/);
  assert.match(t, /Moy. premier 18 /);
  assert.match(t, /Moy. dernier 6 /);
  assert.match(t, /Moy. générale 11.5 /);
  assert.match(t, /Réussis : 3/);
  assert.match(t, /Échoués : 2/);
});

test('compact : le pourcentage reste propre au modèle papier, et s’ajoute aux effectifs', () => {
  assert.doesNotMatch(compact({ statsClasse: STATS }), /Réussite :/);
  const t = compact({ statsClasse: { ...STATS, reussite: 60 } });
  assert.match(t, /Réussis : 3/);
  assert.match(t, /Réussite : 60 %/);
});

test('compact : sans statistiques de classe, la ligne n’est pas imprimée (pas de zéro inventé)', () => {
  const t = compact({ statsClasse: undefined });
  assert.doesNotMatch(t, /Stats de performance|Réussis|Échoués/);
});

test('compact : une classe sans moyenne imprime QUAND MÊME la ligne, avec des tirets', () => {
  const t = compact({ statsClasse: { premier: null, dernier: null, generale: null, reussis: null, echoues: null, reussite: null, vide: true } });
  assert.match(t, /Stats de performance/);
  assert.match(t, /Moy\. premier —/);
  assert.match(t, /Moy\. dernier —/);
  assert.match(t, /Moy\. générale —/);
  assert.match(t, /Réussis : —/);
  assert.match(t, /Échoués : —/);
  assert.doesNotMatch(t, /Réussis : 0|Échoués : 0/);          // jamais un zéro inventé
});

test('compact : en anglais', () => {
  const t = texte(renderToStaticMarkup(createElement(BulletinPrimCompact, {
    school, cls: { ...cls, system: 'EN' }, student, sys: 'EN', effectif: 5, periodLabel: 'Term 1', critereColumns: CRITERES, niveauTotal: 300,
    groupes: true, titulaire: 'T', pt: 9, rows, overall: { achieved: 26, possible: 40, pct: 65, evaluees: 1, nonEvaluees: 0 },
    nonEvalueesCodes: [], moyenneGenerale: 13, coteGenerale: 'A', rank: 2, statsClasse: STATS,
  })));
  assert.match(t, /Top average 18 /);
  assert.match(t, /Lowest average 6 /);
  assert.match(t, /Passed : 3/);
  assert.match(t, /Failed : 2/);
});

const detaille = (classStats) => texte(renderToStaticMarkup(createElement(BulletinPrimAnnualUA, {
  school, sys: 'FR', title: 'BULLETIN', student, classLabel: 'CE1', effectif: 5, profPrincipal: 'KONGYUY',
  competenceRows: [], moyenneGenerale: 13, coteGenerale: 'A', rang: 2, classStats, appreciation: '',
})));

test('détaillé : le profil de la classe donne tout, y compris le nombre de réussis et d’échoués', () => {
  const t = detaille({ avg: 11.5, min: 6, max: 18, count: 5, reussis: 3, echoues: 2, rate: 60 });
  assert.match(t, /Profil de la classe/);
  assert.match(t, /Moyenne générale 11.5 /);
  assert.match(t, /Moyenne la plus élevée 18 /);
  assert.match(t, /Moyenne la plus faible 6 /);
  assert.match(t, /Élèves ayant réussi 3/);
  assert.match(t, /Élèves en échec 2/);
  assert.match(t, /Taux de réussite 60%/);
});

test('détaillé : sans statistiques, des tirets — jamais un zéro', () => {
  const t = detaille(null);
  assert.doesNotMatch(t, /Élèves ayant réussi \d|Élèves en échec \d/);
  assert.match(t, /Élèves ayant réussi —/);
  assert.match(t, /Moyenne la plus élevée —/);
});
