// Rendu REACT du bulletin bilingue (secondaire) à partir de fixtures.json (écrit par demo-bilingue-bulletins.mjs),
// pour comparer avant/après une même écran. NC_OUT = dossier de fixtures ET de sortie ; NC_SEC = couleur simulée.
//   node --experimental-loader ./scripts/lib/jsx-resolve.mjs scripts/bulletin-secondaire-react.mjs
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const require = createRequire(import.meta.url);
const { renderToStaticMarkup } = require('react-dom/server');
const { createElement } = require('react');
globalThis.__VITE_ENV__ = {};
const SRC = new URL('../src/', import.meta.url).href;
const OUT = process.env.NC_OUT;
if (process.env.NC_SEC) {
  const acc = await import(`${SRC}core/bulletinAccent.js`).catch(() => null);
  acc?.definirAccentSecondaire?.(process.env.NC_SEC);
}
const { default: Bil, BulletinBilAnnual } = await import(`${SRC}components/bulletins/BulletinBilOfficial.jsx`);
const fx = JSON.parse(readFileSync(join(OUT, 'fixtures.json'), 'utf8'));
let n = 0;
for (const f of fx) {
  const props = { school: f.school, sys: f.sys, title: f.titre, student: f.student, classLabel: f.classLabel, effectif: f.effectif, titulaire: f.titulaire, data: f.data, seqs: f.seqs, maxScale: f.maxScale, decision: f.decision, discipline: f.discipline };
  const C = f.kind === 'annual' ? BulletinBilAnnual : Bil;
  const html = renderToStaticMarkup(createElement(C, props));
  writeFileSync(join(OUT, `react-${f.nom}.html`), html, 'utf8');
  n += 1;
}
console.log(`${n} rendus React écrits dans ${OUT}`);
