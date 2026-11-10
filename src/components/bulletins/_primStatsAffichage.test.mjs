// LES STATISTIQUES DE PERFORMANCE SE CHOISISSENT : l'école imprime ou non le profil de la classe, la répartition
// par tranche et le rang. Rendu RÉEL des deux dispositions du primaire.
//
//   node --experimental-loader ./scripts/lib/jsx-resolve.mjs src/components/bulletins/_primStatsAffichage.test.mjs
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

const CRITERES = [{ id: 'cr-o', nom: 'Oral' }];
const rows = [{ code: '1A', intitule: 'Compétence 1A', domaine: 'langues', parCritere: { 'cr-o': { note: 10, max: 20 } },
  achieved: 10, possible: 20, cote: 'ECA', nonEvaluee: false }];
const school = { id: 's', name: 'ÉCOLE DE CONTRÔLE', country_code: 'cameroon', current_year: '2026-2027' };
const cls = { id: 'c', name: 'CM1', level: 'CM1', system: 'FR' };
const student = { id: 'e', name: 'ESSOMBA NKOULOU CLAIRE', matricule: 'X-1' };
const texte = (h) => h.replace(/<[^>]*>/g, ' ').replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

const STATS = { premier: 17.5, dernier: 6.2, generale: 11.4, reussis: 5, echoues: 3, reussite: 62 };
const REPART = [{ label: '[10-11.99]', n: 3 }, { label: '[12-13.99]', n: 2 }];

const compact = (extra) => texte(renderToStaticMarkup(createElement(Compact, {
  school, cls, student, sys: 'FR', effectif: 8, periodLabel: 'UA 1', critereColumns: CRITERES, niveauTotal: 300,
  groupes: true, titulaire: 'M.', pt: 9, rows, overall: { achieved: 10, possible: 20, pct: 50, evaluees: 1, nonEvaluees: 0 },
  nonEvalueesCodes: [], moyenneGenerale: 10, coteGenerale: 'ECA', rank: 3, statsClasse: STATS, repartition: REPART,
  repartitionTotal: 5, ...extra,
})));
const detail = (extra) => texte(renderToStaticMarkup(createElement(Detail, {
  school, sys: 'FR', title: 'BULLETIN', student, classLabel: 'CM1', effectif: 8, profPrincipal: '',
  competenceRows: [], moyenneGenerale: 10, coteGenerale: 'ECA', rang: 3,
  classStats: { avg: 11.4, max: 17.5, min: 6.2, reussis: 5, echoues: 3, rate: 62 }, repartition: REPART, ...extra,
})));

test('compact : tout allumé, tout s’imprime', () => {
  const t = compact({});
  assert.ok(t.includes('17,5') || t.includes('17.5'), 'plus haute moyenne');
  assert.match(t, /Réussis : 5/);
  assert.match(t, /\[10-11\.99\]/);
  assert.match(t, /3(er|e)? \/ 8|3 \/ 8/);
});
test('compact : sans statistiques de la classe, ni moyenne la plus haute ni réussis ni échoués', () => {
  const t = compact({ statsClasse: null });
  assert.ok(!/Réussis/.test(t) && !/Échoués/.test(t), 'plus de réussis/échoués');
  assert.ok(!t.includes('17,5') && !t.includes('17.5'), 'plus de plus haute moyenne');
  assert.match(t, /\[10-11\.99\]/, 'la répartition, elle, reste : c’est un autre interrupteur');
});
test('compact : sans répartition, le tableau par tranche disparaît', () => {
  const t = compact({ repartition: [], repartitionTotal: undefined });
  assert.ok(!/\[10-11\.99\]/.test(t));
  assert.match(t, /Réussis : 5/, 'les statistiques restent');
});
test('compact : rang masqué, plus de « 3 / 8 »', () => {
  const t = compact({ masquerRang: true });
  assert.ok(!/3(er|e)? \/ 8/.test(t));
});

test('détaillé : tout allumé, le profil de la classe et le rang sont là', () => {
  const t = detail({});
  assert.match(t, /Profil de la classe/);
  assert.match(t, /Rang 3 \/ 8/);
});
test('détaillé : sans statistiques, le « Profil de la classe » disparaît, le bilan de l’élève reste', () => {
  const t = detail({ masquerStats: true });
  assert.ok(!/Profil de la classe/.test(t) && !/Taux de réussite/.test(t));
  assert.match(t, /Bilan de l.élève/);
  assert.match(t, /Cote générale/);
});
test('détaillé : rang masqué', () => {
  const t = detail({ masquerRang: true });
  assert.ok(!/Rang 3/.test(t) && !/\bRang\b/.test(t));
  assert.match(t, /Profil de la classe/);
});

// ── câblage de l'écran : trois interrupteurs mémorisés sur le poste, aucun réglage d'école ──
const bulletins = readFileSync(new URL('../../pages/Bulletins.jsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
test('Bulletins.jsx : trois interrupteurs, mémorisés localement, branchés sur les DEUX gabarits', () => {
  assert.ok(bulletins.includes("localStorage.getItem('nc_prim_affiche')"));
  assert.ok(bulletins.includes('statsClasse={!primAffiche.stats ? null :'));
  assert.ok(bulletins.includes('masquerRang={primMasquerRang || !primAffiche.rang}'));
  assert.ok(bulletins.includes('masquerStats={!primAffiche.stats}'));
  assert.ok(bulletins.includes('repartition={primAffiche.repartition ? primRepartition : []}'));
  assert.ok(bulletins.includes('primCarnet && primAffiche.repartition ? primRepartition : []'));
  // Le réglage d'ÉCOLE « masquer le rang » l'emporte toujours : un interrupteur ne peut pas le rallumer.
  assert.ok(bulletins.includes('disabled={off} checked={!off && !!primAffiche[key]}'));
});
