// Test — AUCUNE DÉCISION D'ÉCRITURE SUR `navigator.onLine`.
//
//   node src/lib/_offlineGate.test.mjs
//
// En édition LAN, le backend est le serveur de l'école : il répond SANS Internet.
// Or `navigator.onLine` vaut false sur un poste sans réseau (serveur isolé, Wi-Fi
// coupé, câble débranché) — chaque écriture gardée par ce drapeau partait alors
// en file d'attente au lieu d'être enregistrée, et l'app affichait « Hors ligne ·
// N en attente » sur un serveur parfaitement joignable (constaté le 2026-10-01).
//
// La règle : seul `src/lib/edition.js` lit ce drapeau, derrière `backendOnline()`
// qui renvoie toujours vrai en LAN. Tout le reste du code passe par lui.
//
// Vérification syntaxique assumée — même approche que server/_schema_upgrade.test.mjs :
// il n'y a pas de moteur de rendu React ici, et l'invariant porte justement sur ce
// qui est ÉCRIT dans les sources (c'est le repliage de la constante `IS_LAN` au
// build qui fait disparaître le code mort du bundle).
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, '..');

let failed = false;
const ok = (cond, msg) => { console.log(`${cond ? '✅' : '❌'} ${msg}`); if (!cond) failed = true; };

const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const p = join(dir, e.name);
  if (e.isDirectory()) return walk(p);
  return /\.(js|jsx|mjs)$/.test(e.name) ? [p] : [];
});

// Les commentaires ne comptent pas : ils EXPLIQUENT justement la règle.
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const rel = (p) => p.replace(SRC, 'src').replace(/\\/g, '/');

{
  const guilty = walk(SRC).filter((p) => {
    if (/[\\/]lib[\\/]edition\.js$/.test(p)) return false;      // la source unique
    if (/_offlineGate\.test\.mjs$/.test(p)) return false;       // ce fichier
    return /navigator\.onLine/.test(stripComments(readFileSync(p, 'utf8')));
  });
  ok(guilty.length === 0,
    `navigator.onLine n’est lu que dans lib/edition.js (fautifs : ${guilty.map(rel).join(', ') || 'aucun'})`);
}

// `backendOnline()` doit rester le point de décision, et rendre TOUJOURS vrai en
// LAN — sinon l'invariant ci-dessus ne protège plus rien.
{
  const edition = readFileSync(join(SRC, 'lib', 'edition.js'), 'utf8');
  ok(/export const IS_LAN\s*=\s*import\.meta\.env\.VITE_EDITION\s*===\s*'lan'/.test(edition),
    'IS_LAN reste une constante de BUILD (repliable par Rollup)');
  ok(/export function backendOnline\(\)\s*\{[\s\S]*?if \(IS_LAN\) return true;/.test(edition),
    'backendOnline() renvoie toujours vrai en édition LAN');
}

// Les écritures du store principal passent par ce point de décision.
{
  const store = readFileSync(join(SRC, 'store', 'schoolStore.js'), 'utf8');
  const n = (store.match(/backendOnline\(\)/g) || []).length;
  ok(n > 20, `schoolStore décide ses écritures avec backendOnline() (${n} appels)`);
}

console.log(failed ? '\n❌ Des tests ont échoué' : '\n✅ Tous les tests passent');
process.exit(failed ? 1 : 0);
