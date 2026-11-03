// LECTEUR SQL NEUTRE — exécute un fichier .sql et affiche le résultat en tableau.
//
// Pourquoi il existe à côté de `apply-cloud-sql.mjs --read` : ce dernier applique
// une SYNTHÈSE CODÉE EN DUR (audit des secteurs, comptage des enseignants de THE
// GENIUS) qui ne correspond qu'aux requêtes pour lesquelles il a été écrit. Lancé
// sur une autre requête, il affiche une synthèse qui n'a RIEN à voir avec les
// lignes lues — le 2026-11-03 il a répondu « Enseignants de THE GENIUS : 44 » à
// une requête sur l'état de la synchro. Un outil qui raconte autre chose que ce
// qu'on lui demande est pire qu'un outil absent.
//
// Celui-ci ne sait rien du métier : il exécute, il affiche, il se tait.
//
// Le jeton n'est JAMAIS écrit ici : il vient de l'environnement
// (SUPABASE_ACCESS_TOKEN), avec repli sur `.env.local` (gitignoré).
//
//   SUPABASE_ACCESS_TOKEN=sbp_... node scripts/lire-sql.mjs <fichier.sql>
//
// REFUSE tout fichier contenant une instruction d'écriture : ce lecteur n'est pas
// un chemin détourné pour appliquer une migration. Pour écrire, il y a
// `apply-cloud-sql.mjs --apply`, qui se voit dans un journal.

import { readFileSync } from 'node:fs';

try {
  for (const ligne of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const m = ligne.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
} catch { /* pas de .env.local */ }

const REF = process.env.SUPABASE_PROJECT_REF || '';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN || '';
const fichier = process.argv[2];

if (!TOKEN) { console.error('SUPABASE_ACCESS_TOKEN absent — rien exécuté.'); process.exit(1); }
if (!REF)   { console.error('SUPABASE_PROJECT_REF absent — rien exécuté.'); process.exit(1); }
if (!fichier) { console.error('Usage : node scripts/lire-sql.mjs <fichier.sql>'); process.exit(1); }

const query = readFileSync(fichier, 'utf8');

// Garde-fou : on retire d'abord les commentaires, sinon le mot « CREATE » écrit
// dans une explication ferait refuser une lecture parfaitement inoffensive.
const nu = query.replace(/--[^\n]*/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');
const interdit = /\b(INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|CREATE|GRANT|REVOKE|COMMIT|BEGIN)\b/i.exec(nu);
if (interdit) {
  console.error(`Ce fichier contient « ${interdit[0]} » : ce lecteur n'exécute que des lectures.`);
  console.error('Pour appliquer une migration : node scripts/apply-cloud-sql.mjs --apply <fichier.sql>');
  process.exit(1);
}

const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query }),
});
const txt = await res.text();
let rows; try { rows = JSON.parse(txt); } catch { rows = txt; }
if (!res.ok) {
  console.error(`HTTP ${res.status} — ${typeof rows === 'string' ? rows.slice(0, 500) : JSON.stringify(rows).slice(0, 500)}`);
  process.exit(1);
}
if (!Array.isArray(rows)) { console.log(JSON.stringify(rows, null, 1)); process.exit(0); }
if (!rows.length) { console.log('(aucune ligne)'); process.exit(0); }

// Tableau aligné : les colonnes larges se lisent mal autrement.
const cols = Object.keys(rows[0]);
const cell = (v) => (v === null || v === undefined ? '—' : String(v));
const w = cols.map((c) => Math.max(c.length, ...rows.map((r) => cell(r[c]).length)));
const ligne = (vals) => '  ' + vals.map((v, i) => v.padEnd(w[i])).join('  ');
console.log('');
console.log(ligne(cols));
console.log('  ' + w.map((n) => '─'.repeat(n)).join('  '));
for (const r of rows) console.log(ligne(cols.map((c) => cell(r[c]))));
console.log(`\n  ${rows.length} ligne(s). Rien n'a été modifié.\n`);
