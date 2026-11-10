// « APPRÉCIATION » ET « OBSERVATIONS DE L'ENSEIGNANT(E) » : deux cases, deux sources, jamais mêlées.
//
// Le défaut : le texte saisi par l'enseignant(e) s'imprimait dans la case « Appréciation » et la case
// « Observations » restait vide. On rend les gabarits RÉELS (react-dom/server).
//
//   node --experimental-loader ./scripts/lib/jsx-resolve.mjs src/components/bulletins/_primObservations.test.mjs
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
const { default: Detail } = await import(`${SRC}components/bulletins/BulletinPrimAnnualUA.jsx`);

const CRITERES = [{ id: 'cr-o', nom: 'Oral' }, { id: 'cr-e', nom: 'Écrit' }];
const rows = ['1A', '1B', '2A'].map((code, i) => ({
  code, intitule: `Compétence ${code}`, domaine: 'langues',
  parCritere: Object.fromEntries(CRITERES.map((c) => [c.id, { note: 10 + i, max: 20 }])),
  achieved: 20, possible: 40, cote: 'ECA', nonEvaluee: false,
}));
const school = { id: 's', name: 'ÉCOLE DE CONTRÔLE', country_code: 'cameroon', current_year: '2026-2027' };
const cls = { id: 'c', name: 'CM1', level: 'CM1', system: 'FR' };
const student = { id: 'e', name: 'ESSOMBA NKOULOU CLAIRE', matricule: 'X-1' };
const texte = (h) => h.replace(/<[^>]*>/g, ' ').replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

const compact = (extra) => texte(renderToStaticMarkup(createElement(Compact, {
  school, cls, student, sys: 'FR', effectif: 8, periodLabel: 'UA 1',
  critereColumns: CRITERES, niveauTotal: 300, groupes: true, titulaire: 'KONGYUY DELPHINE', pt: 9,
  rows, overall: { achieved: 60, possible: 120, pct: 50, evaluees: 3, nonEvaluees: 0 }, nonEvalueesCodes: [],
  moyenneGenerale: 10, coteGenerale: 'ECA', rank: 3, ...extra,
})));

const OBS = 'Travail en progrès – des efforts sont attendus dans toutes les matières.';

test('compact : l’observation saisie va dans « Observations », l’appréciation reste automatique', () => {
  const t = compact({ appreciationGenerale: 'En cours d’acquisition', observations: OBS });
  assert.match(t, /Appréciation En cours d’acquisition/, 'la case Appréciation porte le libellé de la cote');
  assert.ok(t.includes(`Observations de l’enseignant(e) ${OBS}`), 'la case Observations porte le texte saisi');
  // Le texte saisi ne se retrouve JAMAIS dans la case Appréciation.
  const apprec = t.slice(t.indexOf('Appréciation'), t.indexOf('Observations de l’enseignant(e)'));
  assert.ok(!apprec.includes('Travail en progrès'), 'l’observation ne doit pas déborder dans la case Appréciation');
  assert.equal(t.split(OBS).length - 1, 1, 'le texte n’est imprimé qu’une seule fois');
});

test('compact : sans observation saisie, aucun texte d’observation n’est inventé', () => {
  const t = compact({ appreciationGenerale: 'Acquis' });
  assert.match(t, /Appréciation Acquis/);
  assert.ok(!t.includes('Travail en progrès'));
});

test('compact : sans cote (rien de noté), aucune appréciation inventée, mais l’observation s’imprime', () => {
  const t = compact({ appreciationGenerale: '', observations: OBS });
  assert.ok(!t.includes('Appréciation En cours'), 'aucune appréciation sans cote');
  assert.ok(t.includes(OBS), 'l’observation s’imprime quand même');
});

test('compact en anglais : « Class teacher’s remarks »', () => {
  const t = compact({ sys: 'EN', appreciationGenerale: 'In progress', observations: 'Encouraging progress in English.' });
  assert.match(t, /Appreciation In progress/);
  assert.ok(t.includes('Class teacher’s remarks Encouraging progress in English.'));
});

test('détaillé : deux lignes distinctes, Appréciation puis Observations', () => {
  const t = texte(renderToStaticMarkup(createElement(Detail, {
    school, sys: 'FR', title: 'BULLETIN', student, classLabel: 'CM1', effectif: 8, profPrincipal: '',
    competenceRows: [], moyenneGenerale: 10, coteGenerale: 'ECA', rang: 3,
    appreciation: 'En cours d’acquisition', observations: OBS,
  })));
  assert.match(t, /Appréciation : En cours d’acquisition/);
  assert.ok(t.includes(`Observations de l’enseignant(e) : ${OBS}`));
  const apprec = t.slice(t.indexOf('Appréciation :'), t.indexOf('Observations de l’enseignant(e)'));
  assert.ok(!apprec.includes('Travail en progrès'));
});

// ── Le CÂBLAGE de l'écran des bulletins (le store ne tourne pas hors navigateur : on lit le source) ──
const bulletins = readFileSync(new URL('../../pages/Bulletins.jsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
test('Bulletins.jsx : l’appréciation ne lit JAMAIS la saisie ; l’observation la lit', () => {
  assert.ok(bulletins.includes("const primAppreciationFor = (student, d) => d?.appreciationGenerale || '';"),
    'l’appréciation doit venir de la cote générale seule');
  assert.ok(!/primAppreciationFor[^\n]*__appreciation__/.test(bulletins));
  assert.equal((bulletins.match(/observations=\{primObservationFor\(student\.id\)\}/g) || []).length, 2,
    'les DEUX dispositions (compacte et détaillée) reçoivent l’observation');
  assert.ok(bulletins.includes('period?.ua != null\n    ? creneauObservationUA(period.ua)'),
    'l’éditeur écrit dans le créneau de l’UA affichée');
});
