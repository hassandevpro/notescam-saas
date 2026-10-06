// Tests — GARDE D'ÉDITION SUR LES PANNEAUX DE SYNCHRONISATION.
//
//   node src/components/_syncGuards.test.mjs
//
// Les trois panneaux de synchro (SyncStatePanel, SyncBadge, HybridModeCard)
// sondent des routes servies UNIQUEMENT par le serveur LAN (`/api/…`). En
// édition cloud ces routes n'existent pas : la règle de réécriture de
// vercel.json renvoie index.html, que `.json()` rejette. Un sondage non gardé
// retélécharge donc la page d'accueil toutes les 8 à 10 secondes pour jeter le
// résultat. SyncStatePanel était dans ce cas (constaté le 2026-09-04).
//
// Ce test verrouille l'invariant au niveau de la SOURCE — même approche que
// server/_schema_upgrade.test.mjs, qui lit db.js et schema.sql en texte : il n'y
// a pas de moteur de rendu React dans ce dépôt, et l'invariant à protéger est
// justement syntaxique (c'est le repliage de la constante `IS_LAN` au build qui
// fait disparaître le code, pas un comportement d'exécution).
//
// Vérification complémentaire, à faire après un `npm run build` :
//   grep -ro "/api/sync/health" dist/assets/*.js   → doit renvoyer 0 ligne.
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, p), 'utf8');

let failed = false;
const ok = (cond, msg) => { console.log(`${cond ? '✅' : '❌'} ${msg}`); if (!cond) failed = true; };

// Extrait le corps du `useEffect(...)` qui contient `needle`, par comptage
// d'accolades — un simple `includes` ne dirait pas si le garde est DANS l'effet.
function effectContaining(src, needle) {
  let from = 0;
  for (;;) {
    const start = src.indexOf('useEffect(', from);
    if (start === -1) return null;
    let depth = 0, i = src.indexOf('(', start);
    const open = i;
    for (; i < src.length; i++) {
      if (src[i] === '(') depth++;
      else if (src[i] === ')') { depth--; if (depth === 0) break; }
    }
    const body = src.slice(open, i + 1);
    if (body.includes(needle)) return body;
    from = start + 10;
  }
}

// ── src/lib/edition.js : IS_LAN doit rester une constante de BUILD ───────────
// C'est ce qui permet à Rollup de replier `if (!IS_LAN)` et de supprimer le
// bloc entier du bundle cloud. Une détection à l'exécution (localStorage,
// window.location…) laisserait le code — et la requête — dans le bundle.
{
  const edition = readFileSync(join(here, '..', 'lib', 'edition.js'), 'utf8');
  ok(/export const IS_LAN\s*=\s*import\.meta\.env\.VITE_EDITION\s*===\s*'lan'/.test(edition),
    'IS_LAN est une constante de build dérivée de VITE_EDITION');
  ok(!/localStorage|window\.location|navigator\.userAgent/.test(edition.split('backendOnline')[0]),
    'IS_LAN ne dépend d’aucune détection à l’exécution');
}

// ── Aucune décision d'écriture sur `navigator.onLine` ───────────────────────
// En édition LAN le backend est le serveur de l'école : il répond sans Internet.
// `navigator.onLine` y vaut false sur un poste sans réseau (serveur isolé, Wi-Fi
// coupé) → chaque écriture gardée par lui partait en file d'attente au lieu
// d'être enregistrée (« ça refuse d'enregistrer », constaté le 2026-10-01).
// Seul lib/edition.js a le droit de lire ce drapeau ; tout le reste passe par
// `backendOnline()`.
{
  const srcRoot = join(here, '..');
  const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    return /\.(js|jsx|mjs)$/.test(e.name) ? [p] : [];
  });
  // Les commentaires ne comptent pas : ils EXPLIQUENT justement la règle.
  const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  const guilty = walk(srcRoot).filter((p) => {
    if (/[\\/]lib[\\/]edition\.js$/.test(p)) return false;            // la source unique
    if (/_syncGuards\.test\.mjs$/.test(p)) return false;              // ce fichier
    return /navigator\.onLine/.test(stripComments(readFileSync(p, 'utf8')));
  });
  ok(guilty.length === 0,
    `navigator.onLine n’est lu que dans lib/edition.js (fautifs : ${guilty.map((p) => p.replace(srcRoot, 'src')).join(', ') || 'aucun'})`);
}

// ── Les trois panneaux : même garde, même forme ─────────────────────────────
const PANELS = [
  { file: 'SyncStatePanel.jsx', route: '/api/sync/health',   interval: '10000' },
  { file: 'SyncBadge.jsx',      route: '/api/sync/health',   interval: '10000' },
  { file: 'HybridModeCard.jsx', route: '/api/hybrid/status', interval: '8000' },
];

for (const { file, route, interval } of PANELS) {
  const src = read(file);
  const name = file.replace('.jsx', '');

  ok(/import \{[^}]*\bIS_LAN\b[^}]*\} from '\.\.?\/(?:\.\.\/)?lib\/edition'/.test(src),
    `${name} importe IS_LAN depuis lib/edition`);

  const effect = effectContaining(src, `fetch('${route}')`) || effectContaining(src, 'setInterval');
  ok(effect != null, `${name} : l’effet de sondage est identifiable`);

  if (effect) {
    // Le garde doit précéder tout déclenchement — sinon la 1re requête part.
    const guard = effect.search(/if \(!IS_LAN[^)]*\) return/);
    const firstCall = Math.min(
      ...[effect.indexOf('setInterval'), effect.indexOf(route)].filter((i) => i >= 0),
    );
    ok(guard !== -1, `${name} : l’effet est gardé par « if (!IS_LAN) return »`);
    ok(guard !== -1 && guard < firstCall,
      `${name} : le garde précède le sondage — aucune requête au montage en cloud`);
    ok(effect.includes(`setInterval`) && effect.includes(interval),
      `${name} : la cadence de sondage est inchangée (${interval} ms)`);
    ok(/return \(\) => clearInterval\(/.test(effect),
      `${name} : l’intervalle est nettoyé au démontage`);
    ok(/\}, \[[^\]]*\]\)/.test(effect),
      `${name} : l’effet a une liste de dépendances (pas de ré-exécution à chaque rendu)`);
  }

  ok(/if \(!IS_LAN[^)]*\) return null;/.test(src),
    `${name} : ne rend rien hors édition LAN (aucun état LAN affiché en cloud)`);
}

// ── Le sondage ne doit pas exister ailleurs sans garde ─────────────────────
// Filet : si quelqu'un rajoute un fetch de route LAN dans SyncStatePanel hors
// de l'effet gardé (ex. au clic), ce test ne le verrait pas — mais le bouton
// n'est jamais rendu en cloud puisque le composant renvoie null.
{
  const src = read('SyncStatePanel.jsx');
  const occurrences = (src.match(/fetch\('\/api\//g) || []).length;
  ok(occurrences === 2, `SyncStatePanel : 2 appels /api/ attendus (health + verify), ${occurrences} trouvés`);
  ok(src.indexOf("if (!IS_LAN) return null;") < src.indexOf('<div className="mt-4'),
    'SyncStatePanel : le garde de rendu précède tout le balisage');
}

console.log(failed ? '\n❌ Des tests ont échoué' : '\n✅ Tous les tests passent');
process.exit(failed ? 1 : 0);
