// Lists FR strings used in t() that don't have a Spanish translation yet.
// Outputs to ./tmp_missing.txt for further processing.

import { readFileSync, writeFileSync } from 'fs';
import { FR_TO_ES } from '../src/lib/i18n_es.js';

const all = readFileSync('./tmp_fr_clean.txt', 'utf8')
  .split('\n').filter(Boolean);

const missing = all.filter((s) => !FR_TO_ES[s]);

console.log(`Total FR strings    : ${all.length}`);
console.log(`Translated          : ${all.length - missing.length}`);
console.log(`Missing translations: ${missing.length}`);

writeFileSync('./tmp_missing.txt', missing.join('\n'));
