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
    // Les TESTS et leurs chargeurs sont hors périmètre, pas seulement celui-ci :
    // un test qui vérifie la règle doit nommer ce qu'elle interdit. Même
    // exclusion que `lib/_offlineGate.test.mjs`, qui contrôle le MÊME invariant
    // — faute de quoi les deux s'accusent mutuellement. Ces fichiers ne sont
    // jamais compilés dans le bundle, l'invariant porte sur ce qui est livré.
    if (/[\\/]_[^\\/]*\.(test|hooks)\.mjs$/.test(p)) return false;
    return /navigator\.onLine/.test(stripComments(readFileSync(p, 'utf8')));
  });
  ok(guilty.length === 0,
    `navigator.onLine n’est lu que dans lib/edition.js (fautifs : ${guilty.map((p) => p.replace(srcRoot, 'src')).join(', ') || 'aucun'})`);
}

// ── Les trois panneaux : même garde, même forme ─────────────────────────────
const PANELS = [
  { file: 'SyncStatePanel.jsx', route: '/api/sync/health',   interval: '10000' },
  // Le 02/11/2026 le voyant passe de `/api/sync/health` (route admin, appelée par un
  // `fetch` nu → 403 avalé → voyant masqué) à `/api/hybrid/status` via lanFetch.
  { file: 'SyncBadge.jsx',      route: '/api/hybrid/status', interval: '10000' },
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
  // `lanFetch` compte AUSSI : depuis le 02/11/2026 les appels passent par
  // src/lib/lanFetch.js, qui joint le jeton de session. Sans lui, ces deux
  // routes rendaient 403 et le panneau restait muet pour toujours — le motif
  // d'origine (`fetch('/api/`) ne voyait plus rien, alors que l'intention de
  // ce contrôle — deux appels, health et verify — n'a pas changé.
  const occurrences = (src.match(/\b(?:lanFetch|fetch)\('\/api\//g) || []).length;
  ok(occurrences === 2, `SyncStatePanel : 2 appels /api/ attendus (health + verify), ${occurrences} trouvés`);
  ok(src.indexOf("if (!IS_LAN) return null;") < src.indexOf('<div className="mt-4'),
    'SyncStatePanel : le garde de rendu précède tout le balisage');
}

// ── Le voyant LAN ne refait pas l'erreur d'I39 ──────────────────────────────
{
  const src = read('SyncBadge.jsx');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  ok(!/(?<![A-Za-z])fetch\('\/api\//.test(code),
    'SyncBadge : aucun `fetch(\'/api/…\')` nu — le jeton passe par lanFetch (I39 : 403 avalé, voyant masqué)');
  ok(/lanFetch\('\/api\/hybrid\/status'\)/.test(code), 'SyncBadge sonde /api/hybrid/status par lanFetch');
  ok(/statutLan\(/.test(code), 'SyncBadge applique la règle commune (src/lib/syncStatus.js)');
  ok(/catch\([^)]*\)\s*=>\s*setVerdict\(\{\s*niveau: NIVEAUX\.ECHEC/.test(code),
    'SyncBadge : un serveur qui ne répond pas s\'affiche en ÉCHEC, jamais en OK ni en silence');
}

// ── Le voyant Cloud : même règle, jamais de requête en LAN ──────────────────
{
  const src = read('CloudSyncBadge.jsx');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  const effect = effectContaining(code, 'setInterval');
  ok(effect != null, 'CloudSyncBadge : l’effet de sondage est identifiable');
  ok(effect != null && effect.search(/if \(IS_LAN[^)]*\) return/) !== -1
     && effect.search(/if \(IS_LAN[^)]*\) return/) < effect.indexOf('setInterval'),
    'CloudSyncBadge : l’effet est gardé par « if (IS_LAN …) return » AVANT le sondage — aucune requête en LAN');
  ok(/if \(IS_LAN[^)]*\) return null;/.test(code), 'CloudSyncBadge : ne rend rien en édition LAN');
  ok(!/\bfetch\(/.test(code) && !/\/api\//.test(code), 'CloudSyncBadge : aucune route /api/ (c’est Supabase, pas le serveur de l’école)');
  ok(/rpc\('sync_etat_ecole'/.test(code), 'CloudSyncBadge lit la fonction sync_etat_ecole');
  ok(/statutCloud\(/.test(code), 'CloudSyncBadge applique la règle commune');
  ok(/if \(error\) \{ setVerdict\(null\)/.test(code), 'CloudSyncBadge : fonction absente ou refusée → on se tait (pas de faux rouge)');
  ok(/\}, \[[^\]]*\]\)/.test(effect || ''), 'CloudSyncBadge : l’effet a une liste de dépendances');
  ok(/return \(\) => clearInterval\(/.test(effect || ''), 'CloudSyncBadge : l’intervalle est nettoyé au démontage');
}

console.log(failed ? '\n❌ Des tests ont échoué' : '\n✅ Tous les tests passent');
process.exit(failed ? 1 : 0);
