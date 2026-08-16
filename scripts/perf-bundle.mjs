// ─────────────────────────────────────────────────────────────────────────────
// POIDS DU PREMIER CHARGEMENT — npm run perf:bundle  (après `npm run build`)
// ─────────────────────────────────────────────────────────────────────────────
// Trois chiffres comptent, et un seul est habituellement regardé :
//   1. ce que le navigateur télécharge AVANT d'afficher l'écran de connexion,
//   2. ce que le service worker précache dès la première visite,
//   3. ce qui ne sert jamais mais pèse quand même.
import { readFileSync, statSync, existsSync, readdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

const DIST = new URL('../dist/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
if (!existsSync(join(DIST, 'index.html'))) {
  console.error('dist/ absent — lancez `npm run build` d\'abord.');
  process.exit(1);
}

const ko = (b) => `${Math.round(b / 1024)} Ko`;
const gz = (p) => gzipSync(readFileSync(p), { level: 9 }).length;
const size = (p) => statSync(p).size;

// ── 1. Chemin critique : ce que index.html demande d'emblée ──────────────────
const html = readFileSync(join(DIST, 'index.html'), 'utf8');
const boot = [...html.matchAll(/(?:src|href)="\/(assets\/[^"]+\.(?:js|css))"/g)].map((m) => m[1]);

console.log('── Chemin critique (téléchargé avant le premier écran)\n');
let bootRaw = 0, bootGz = 0;
for (const f of boot) {
  const p = join(DIST, f);
  const r = size(p), g = gz(p);
  bootRaw += r; bootGz += g;
  console.log(`  ${ko(r).padStart(8)}  ${ko(g).padStart(8)} gzip   ${f.replace('assets/', '')}`);
}
console.log(`  ${'─'.repeat(46)}`);
console.log(`  ${ko(bootRaw).padStart(8)}  ${ko(bootGz).padStart(8)} gzip   TOTAL\n`);

// Feuilles de style externes BLOQUANTES : celles chargées en `media="print"`
// (puis basculées en JS) ne bloquent pas le rendu, et le repli <noscript> ne
// s'applique qu'aux navigateurs sans JavaScript.
const withoutNoscript = html.replace(/<noscript>[\s\S]*?<\/noscript>/g, '');
const blocking = [...withoutNoscript.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*>/g)]
  .map((m) => m[0])
  .filter((tag) => /href="https?:\/\//.test(tag) && !/media="print"/.test(tag))
  .map((tag) => (tag.match(/href="([^"]+)"/) || [])[1]);
if (blocking.length) {
  console.log('  ⚠ feuille(s) de style EXTERNE(S) BLOQUANTES, indisponibles hors ligne :');
  for (const u of blocking) console.log(`     ${u}`);
  console.log('');
} else if (/fonts\.googleapis\.com/.test(html)) {
  console.log('  ✓ police externe chargée sans bloquer le rendu (media="print" → all)\n');
}

// ── 2. Précache du service worker ────────────────────────────────────────────
const swPath = join(DIST, 'sw.js');
if (existsSync(swPath)) {
  const urls = [...readFileSync(swPath, 'utf8').matchAll(/url:"([^"]+)"/g)].map((m) => m[1]);
  let raw = 0, g = 0;
  for (const u of urls) {
    const p = join(DIST, u.replace(/^\//, ''));
    if (existsSync(p) && statSync(p).isFile()) { raw += size(p); g += gz(p); }
  }
  console.log(`── Précache du service worker : ${urls.length} fichiers, ${ko(raw)} (${ko(g)} gzip)`);
  console.log('   Téléchargé dès la première visite, quel que soit l\'écran ouvert.\n');
}

// ── 3. Les plus gros morceaux ────────────────────────────────────────────────
const assets = readdirSync(join(DIST, 'assets')).filter((f) => f.endsWith('.js'));
const rows = assets.map((f) => {
  const p = join(DIST, 'assets', f);
  return { f, raw: size(p), g: gz(p), boot: boot.includes(`assets/${f}`) };
}).sort((a, b) => b.raw - a.raw).slice(0, 12);

console.log('── Les 12 plus gros morceaux\n');
for (const r of rows) {
  console.log(`  ${ko(r.raw).padStart(8)}  ${ko(r.g).padStart(8)} gzip   ${r.boot ? '⟵ au boot  ' : '            '}${r.f}`);
}

// ── 4. Dépendances embarquées mais jamais appelées ───────────────────────────
const SUSPECTS = [
  ['html2canvas', 'importé dynamiquement par jsPDF.html() — jamais appelé ici'],
  ['purify.es', 'dépendance de jsPDF.html() — jamais appelée ici'],
  ['index.es', 'canvg / dépendance optionnelle de jsPDF — jamais appelée ici'],
];
console.log('\n── Poids embarqué sans appelant\n');
let dead = 0;
for (const [needle, why] of SUSPECTS) {
  const hit = assets.find((f) => f.startsWith(needle));
  if (!hit) continue;
  const p = join(DIST, 'assets', hit);
  dead += size(p);
  console.log(`  ${ko(size(p)).padStart(8)}  ${hit}\n            ${why}`);
}
if (dead) console.log(`\n  Total : ${ko(dead)} de code jamais exécuté, précaché sur chaque poste.`);
