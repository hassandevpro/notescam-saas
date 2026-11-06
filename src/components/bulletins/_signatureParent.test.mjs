// LA SIGNATURE DU PARENT N'EST IMPRIMÉE QU'UNE FOIS sur le bulletin compact du primaire.
//
// Signalé le 2026-11-05 : « Signature du parent » en haut (ligne des observations) ET « Visa du
// Parent / Tuteur » en bas (bloc des signatures). On garde celle du bas.
//
//   node --experimental-loader ./scripts/lib/jsx-resolve.mjs src/components/bulletins/_signatureParent.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { renderToStaticMarkup } = require('react-dom/server');
const { createElement } = require('react');
globalThis.__VITE_ENV__ = {};

const SRC = new URL('../../', import.meta.url).href;
const { default: BulletinPrimCompact } = await import(`${SRC}components/bulletins/BulletinPrimCompact.jsx`);

const texte = (html) => html.replace(/<[^>]*>/g, ' ').replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const compte = (t, re) => (t.match(re) || []).length;

const school = { id: 's', name: 'ÉCOLE DE CONTRÔLE', country_code: 'cameroon', current_year: '2026-2027' };
const CRITERES = [{ id: 'cr-o', nom: 'Oral' }, { id: 'cr-e', nom: 'Écrit' }];
const rows = [{ code: '1A', intitule: 'Communiquer en français', domaine: 'langues',
  parCritere: { 'cr-o': { note: 12, max: 20 }, 'cr-e': { note: 14, max: 20 } }, achieved: 26, possible: 40, cote: 'A', nonEvaluee: false }];

const rendu = (sys, extra) => texte(renderToStaticMarkup(createElement(BulletinPrimCompact, {
  school, cls: { id: 'c', name: 'CE1', level: 'CE1', system: sys }, student: { id: 'e', name: 'ESSOMBA', matricule: 'X-1' },
  sys, effectif: 5, periodLabel: 'Trimestre 1', critereColumns: CRITERES, niveauTotal: 300, groupes: true,
  titulaire: 'KONGYUY DELPHINE', pt: 9, rows,
  overall: { achieved: 26, possible: 40, pct: 65, evaluees: 1, nonEvaluees: 0 }, nonEvalueesCodes: [],
  moyenneGenerale: 13, coteGenerale: 'A', rank: 2, ...extra,
})));

test('FR : « Signature du parent » n’existe plus ; « Visa du Parent / Tuteur » reste, une fois', () => {
  for (const signatureParent of [true, false, undefined]) {
    const t = rendu('FR', { signatureParent });
    assert.equal(compte(t, /Signature du parent/g), 0, `signatureParent=${signatureParent}`);
    assert.equal(compte(t, /Visa du Parent \/ Tuteur/g), 1, `signatureParent=${signatureParent}`);
  }
});

test('EN : « Parent’s signature » n’existe plus ; « Parent / Guardian » reste, une fois', () => {
  const t = rendu('EN', { signatureParent: true });
  assert.equal(compte(t, /Parent’s signature/g), 0);
  assert.equal(compte(t, /Parent \/ Guardian/g), 1);
});

test('les observations du titulaire gardent leur zone, et la page reste complète', () => {
  const t = rendu('FR', { signatureParent: true });
  assert.match(t, /Observations de l’enseignant/); // libellé du modèle de l’école (0e4e9ae)
  assert.match(t, /L'Enseignant\(e\)/);
});
