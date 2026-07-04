// Fusionne les traductions turques (appariées par index) dans i18n_tr.js.
// Les clés proviennent de i18n-missing-tr.json (byte-exactes) → aucun risque
// d'erreur de recopie d'apostrophes/points de suspension.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const keys   = JSON.parse(readFileSync(join(__dirname, 'i18n-missing-tr.json'), 'utf8'));
const values = JSON.parse(readFileSync(join(__dirname, 'i18n-tr-values.json'), 'utf8'));

if (keys.length !== values.length) {
  console.error(`ERREUR : ${keys.length} clés mais ${values.length} valeurs. Abandon.`);
  process.exit(1);
}

const trPath = join(__dirname, '..', 'src', 'lib', 'i18n_tr.js');
let src = readFileSync(trPath, 'utf8');

// Construit le bloc d'entrées (JSON.stringify → littéraux JS valides et échappés).
const lines = keys.map((k, i) => `  ${JSON.stringify(k)}: ${JSON.stringify(values[i])},`);
const block = '\n  // === Balayage automatique — toutes pages (parité 100%) ===\n' + lines.join('\n') + '\n';

// Insère avant la dernière accolade fermante de l'objet.
const idx = src.lastIndexOf('\n};');
if (idx === -1) { console.error('Accolade fermante introuvable'); process.exit(1); }
src = src.slice(0, idx) + block + src.slice(idx);
writeFileSync(trPath, src);
console.log(`Injecté ${keys.length} entrées dans src/lib/i18n_tr.js`);
