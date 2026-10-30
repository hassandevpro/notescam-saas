// LE CARNET PRIMAIRE COMPACT N'INVENTE RIEN.
//
// C'est la règle la plus coûteuse à enfreindre de tout le bulletin : une note
// inventée, une moyenne déduite d'un barème incomplet, un rang affiché alors
// que la classe n'est pas corrigée — et l'école distribue un document faux,
// signé du directeur, à des parents qui n'ont aucun moyen de le vérifier.
//
// Les tests de `primEngine` vérifient les CALCULS. Celui-ci vérifie le
// GABARIT : qu'il affiche ce qu'on lui donne, « — » quand on ne lui donne
// rien, et qu'il ne recalcule jamais rien de son côté. Un gabarit qui
// recalculerait finirait par contredire l'aperçu, le PV et le rapport de
// classe — c'est la règle de tous les bulletins du dépôt.
//
// On rend le composant RÉEL (react-dom/server) : vérifier une copie écrite à
// la main ne prouverait rien sur ce qui s'imprime.
//
//   node --experimental-loader ./scripts/lib/jsx-resolve.mjs src/components/bulletins/_primCompactRendu.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { renderToStaticMarkup } = require('react-dom/server');
const { createElement } = require('react');

// Vu par le loader à la place de `import.meta.env` : ce test mesure un rendu,
// il ne contacte rien.
globalThis.__VITE_ENV__ = {};

const SRC = new URL('../../', import.meta.url).href;
const { default: BulletinPrimCompact } = await import(`${SRC}components/bulletins/BulletinPrimCompact.jsx`);

const CRITERES = [
  { id: 'cr-o', nom: 'Oral' }, { id: 'cr-e', nom: 'Écrit' },
  { id: 'cr-p', nom: 'Pratique' }, { id: 'cr-s', nom: 'Savoir-être' },
];

const DEFS = [
  ['1A', 'Communiquer en français', 'langues'],
  ['1B', 'Communicate in English', 'langues'],
  ['2A', 'Utiliser les notions de base en mathématiques', 'maths_sciences'],
  ['3A', 'Pratiquer les valeurs sociales', 'vie_citoyennete'],
];

const lignes = (notees) => DEFS.map(([code, intitule, domaine], i) => ({
  code, intitule, domaine,
  parCritere: Object.fromEntries(CRITERES.map((c, j) => [c.id,
    notees ? { note: 11 + ((i + j) % 9), max: 20 } : null])),
  achieved: notees ? 52 + i : null,
  possible: notees ? 80 : null,
  cote: notees ? 'A' : null,
  nonEvaluee: false,
}));

const school = { id: 's', name: 'ÉCOLE DE CONTRÔLE', country_code: 'cameroon', current_year: '2026-2027' };
const cls = { id: 'c', name: 'CE1', level: 'CE1', system: 'FR' };
const student = { id: 'e', name: 'ESSOMBA NKOULOU CLAIRE', matricule: 'X-1' };

const rendu = (extra) => renderToStaticMarkup(createElement(BulletinPrimCompact, {
  school, cls, student, sys: 'FR', effectif: 8, periodLabel: 'Trimestre 1',
  critereColumns: CRITERES, niveauTotal: 300, groupes: true,
  titulaire: 'KONGYUY DELPHINE', pt: 9,
  ...extra,
}));

/** Le TEXTE du rendu, balises retirées et espaces normalisés. */
const texte = (html) => html
  .replace(/<[^>]*>/g, ' ')
  .replace(/&#x27;|&#39;/g, "'")
  .replace(/&amp;/g, '&')
  .replace(/\s+/g, ' ')
  .trim();

// ── 1. Rien de saisi : rien d'affiché ──────────────────────────────────────
test('un carnet vierge n’affiche AUCUNE valeur calculée', () => {
  const rows = lignes(false);
  const t = texte(rendu({
    rows,
    overall: { achieved: null, possible: null, pct: null, evaluees: 0, nonEvaluees: rows.length },
    nonEvalueesCodes: rows.map((r) => r.code),
    moyenneGenerale: null, coteGenerale: null, rank: null,
  }));

  // Un nombre à décimales ne peut venir que d'un calcul : note, moyenne,
  // total ou barème. Aucun ne doit apparaître sur un carnet vierge.
  const decimales = t.match(/\d+[.,]\d/g) || [];
  assert.deepEqual(decimales, [], `valeurs calculées sur un bulletin vierge : ${decimales.join(', ')}`);

  // Et surtout, PAS DE ZÉRO : « 0 » affirmerait que l'élève a composé et
  // échoué, là où il n'a simplement pas encore été évalué.
  assert.ok(!/ 0 \/|\/ 0 | 0 \/20/.test(t), 'un zéro a été substitué à une absence de note');

  // La mention provisoire doit nommer les compétences concernées : c'est ce
  // qui explique au parent pourquoi il n'y a pas de total.
  for (const r of rows) assert.ok(t.includes(r.code), `${r.code} absent de la mention provisoire`);
});

test('ni total, ni moyenne, ni cote, ni rang inventés', () => {
  const rows = lignes(false);
  const t = texte(rendu({
    rows,
    overall: { achieved: null, possible: null, pct: null, evaluees: 0, nonEvaluees: rows.length },
    nonEvalueesCodes: rows.map((r) => r.code),
    moyenneGenerale: null, coteGenerale: null, rank: null,
  }));
  // Le rang s'écrit « — / effectif » : l'effectif est une donnée, pas un
  // calcul, et le dénominateur rassure le parent sur le fait que la classe
  // existe bien. Le numérateur, lui, reste vide.
  assert.ok(/— \/ 8/.test(t), 'le rang devrait être « — / 8 »');
  // Le NUMÉRATEUR, et lui seul, doit être vide : « Rang 3 / 8 » serait un
  // rang inventé, « Rang — / 8 » est la bonne écriture.
  assert.ok(!/Rang\s*:?\s*\d/.test(t), 'un rang a été affiché alors qu’il n’y en a pas');
});

// ── 2. Ce qui est affiché est ce qui a été DONNÉ ───────────────────────────
test('le gabarit affiche le total qu’on lui passe, il ne le recalcule pas', () => {
  const rows = lignes(true);
  // Un total VOLONTAIREMENT incohérent avec les lignes : la somme des
  // `achieved` vaut 214, pas 999. Si le gabarit affichait 214, c'est qu'il
  // recalcule — et il finirait par contredire le PV et le rapport de classe.
  const somme = rows.reduce((a, r) => a + r.achieved, 0);
  assert.notEqual(somme, 999, 'prémisse du test');
  const t = texte(rendu({
    rows,
    overall: { achieved: 999, possible: 1280, pct: 78, evaluees: rows.length, nonEvaluees: 0 },
    nonEvalueesCodes: [],
    moyenneGenerale: 13.68, coteGenerale: 'ECA', rank: 3,
  }));
  assert.ok(t.includes('999'), 'le total passé en props doit être affiché tel quel');
  assert.ok(!t.includes(String(somme)), `le gabarit a recalculé le total (${somme})`);
  assert.ok(t.includes('13.68'), 'la moyenne passée en props doit être affichée telle quelle');
  assert.ok(/Rang.{0,20}3 \/ 8/.test(t), 'le rang passé en props doit être affiché');
  assert.ok(t.includes('ECA'), 'la cote passée en props doit être affichée');
});

test('une compétence déclarée non évaluée se distingue d’une note manquante', () => {
  const rows = lignes(true);
  rows[1] = { ...rows[1], nonEvaluee: true, achieved: null, possible: null, cote: null };
  rows[2] = { ...rows[2], achieved: null, possible: null, cote: null };
  const t = texte(rendu({
    rows,
    overall: { achieved: 104, possible: 160, pct: 65, evaluees: 2, nonEvaluees: 1 },
    nonEvalueesCodes: ['1B'],
    moyenneGenerale: 13, coteGenerale: 'A', rank: 3,
  }));
  // « - - - - » = la classe a DÉCLARÉ n'avoir pas évalué ; « — » = rien de
  // saisi. Les deux doivent coexister, sinon le parent ne peut pas les
  // distinguer et l'école ne peut pas se justifier.
  assert.ok(t.includes('- - - -'), 'la marque « non évaluée » doit apparaître');
  assert.ok(t.includes('—'), 'le tiret d’absence doit apparaître aussi');
});

// ── 3. L'école ne fournit rien d'exotique : le gabarit ne doit pas tomber ──
test('des props absentes ou vides ne font pas tomber le rendu', () => {
  for (const extra of [
    { rows: [] },
    { rows: lignes(true), overall: null, nonEvalueesCodes: [] },
    { rows: lignes(true), overall: undefined, critereColumns: [], nonEvalueesCodes: [] },
  ]) {
    const html = rendu({ nonEvalueesCodes: [], ...extra });
    assert.ok(html.length > 0, 'le rendu doit produire quelque chose');
  }
});
