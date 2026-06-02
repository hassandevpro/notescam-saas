// Extract all FR strings from t() calls handling \' escapes.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { join } from 'path';

// Match both t('…') and t("…") with proper handling of escaped quotes.
const FR_RE_SQ = /t\('((?:[^'\\]|\\.)*)'/g;
const FR_RE_DQ = /t\("((?:[^"\\]|\\.)*)"/g;

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, files);
    else if (/\.(jsx?|tsx?)$/.test(name)) files.push(p);
  }
  return files;
}

const all = new Set();
for (const file of walk('./src')) {
  const txt = readFileSync(file, 'utf8');
  for (const re of [FR_RE_SQ, FR_RE_DQ]) {
    let m;
    while ((m = re.exec(txt))) {
      const s = m[1]
        .replace(/\\'/g, "'")
        .replace(/\\"/g, '"')
        .replace(/\\n/g, '\n')
        .replace(/\\\\/g, '\\');
      if (s.length >= 2 && !/^[a-z_]+$/.test(s) && !s.startsWith('./')) {
        all.add(s);
      }
    }
  }
}

const list = [...all].sort();
writeFileSync('./tmp_fr_clean.txt', list.join('\n'));
console.log(`Extracted ${list.length} FR strings`);
