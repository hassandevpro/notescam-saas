// Outil de dev : extrait tous les 1ers arguments des appels t('…') du code
// source, et liste ceux qui manquent au dictionnaire turc (FR_TO_TR).
// Usage : node scripts/i18n-extract.mjs
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, '..', 'src');

function walk(dir) {
  let out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) out = out.concat(walk(p));
    else if (['.js', '.jsx'].includes(extname(p))) out.push(p);
  }
  return out;
}

// Capture le 1er littéral chaîne après t( ou tStatic(
const RE = /\b(?:t|tStatic)\(\s*('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")/g;

const keys = new Set();
for (const file of walk(SRC)) {
  const code = readFileSync(file, 'utf8');
  let m;
  while ((m = RE.exec(code)) !== null) {
    try {
      // eslint-disable-next-line no-eval
      const val = (0, eval)(m[1]);
      if (typeof val === 'string' && val.trim()) keys.add(val);
    } catch { /* littéral non évaluable, ignoré */ }
  }
}

const { FR_TO_TR } = await import('../src/lib/i18n_tr.js');
const { FR_TO_ES } = await import('../src/lib/i18n_es.js');

// Heuristique : on ignore les chaînes « techniques » (pas de lettre) ou qui
// sont visiblement des identifiants/chemins.
const isTranslatable = (s) =>
  /[A-Za-zÀ-ÿ]/.test(s) &&
  !/^[a-z0-9_]+\/[a-z0-9_./-]+$/i.test(s) &&        // chemins type pdfjs-dist/build/pdf.mjs
  !/^[a-z_]+(,\s*[a-z_]+)+$/i.test(s);              // listes de colonnes "id, role, ..."

const missingTr = [...keys].filter((k) => isTranslatable(k) && !(k in FR_TO_TR)).sort();
const missingEs = [...keys].filter((k) => isTranslatable(k) && !(k in FR_TO_ES)).sort();

writeFileSync(join(__dirname, 'i18n-missing-tr.json'), JSON.stringify(missingTr, null, 2));
console.log('Clés t() uniques        :', keys.size);
console.log('Manquantes en TURC      :', missingTr.length);
console.log('Manquantes en ESPAGNOL  :', missingEs.length);
console.log('→ écrit dans scripts/i18n-missing-tr.json');
