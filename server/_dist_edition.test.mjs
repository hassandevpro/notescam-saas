// Test — RECONNAISSANCE DE L'ÉDITION DU dist/ SERVI (server/distEdition.js).
//
//   node server/_dist_edition.test.mjs
//
// Le serveur LAN ne doit jamais servir une SPA d'édition cloud : elle parle à
// Supabase et non à /api/db, donc sans Internet l'école ne peut rien enregistrer
// (symptôme du 2026-10-01 : « quand j'ai créé une classe ça refuse d'enregistrer »,
// après un `npm run build` qui avait écrasé le `dist/` du `npm run build:lan`).
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { distEdition, wrongEditionPage } from './distEdition.js';

let pass = 0, fail = 0;
const ok = (c, label, got) => { c ? (console.log(`✅ ${label}`), pass++) : (console.log(`❌ ${label} (obtenu: ${JSON.stringify(got)})`), fail++); };

// Fabrique un dist/ jetable. `stamp` = contenu de edition.json, `assets` = noms.
function makeDist({ stamp = null, assets = [], indexHtml = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'nc-dist-'));
  if (indexHtml) writeFileSync(join(dir, 'index.html'), '<!doctype html><title>x</title>');
  mkdirSync(join(dir, 'assets'), { recursive: true });
  for (const a of assets) writeFileSync(join(dir, 'assets', a), '//');
  if (stamp != null) writeFileSync(join(dir, 'edition.json'), stamp);
  return dir;
}

const dirs = [];
const dist = (opts) => { const d = makeDist(opts); dirs.push(d); return d; };

try {
  // 1. Estampille — source de vérité
  ok(distEdition(dist({ stamp: '{"edition":"lan"}' })) === 'lan', 'edition.json lan -> lan');
  ok(distEdition(dist({ stamp: '{"edition":"cloud"}' })) === 'cloud', 'edition.json cloud -> cloud');

  // 2. L'estampille PRIME sur l'heuristique (un build LAN n'a pas ce morceau,
  //    mais si un résidu traîne dans assets/ on ne doit pas se tromper).
  ok(distEdition(dist({ stamp: '{"edition":"lan"}', assets: ['vendor-supabase-abc123.js'] })) === 'lan',
    'estampille lan + résidu vendor-supabase -> lan (l’estampille prime)');

  // 3. Repli pour les builds antérieurs à l'estampille
  ok(distEdition(dist({ assets: ['vendor-supabase-D2gm834s.js', 'index-x.js'] })) === 'cloud',
    'sans estampille, vendor-supabase-*.js -> cloud');
  ok(distEdition(dist({ assets: ['index-x.js', 'vendor-react-y.js'] })) === 'unknown',
    'sans estampille ni vendor-supabase -> unknown (servi, avec avertissement)');

  // 4. Estampille illisible : on retombe sur l'heuristique, jamais d'exception
  ok(distEdition(dist({ stamp: '{pas du json', assets: ['vendor-supabase-z.js'] })) === 'cloud',
    'estampille illisible -> repli heuristique');

  // 5. dist/ absent
  ok(distEdition(dist({ indexHtml: false })) === 'absent', 'sans index.html -> absent');
  ok(distEdition(join(tmpdir(), 'nc-dist-inexistant-xyz')) === 'absent', 'dossier inexistant -> absent');

  // 6. La page de blocage dit QUOI FAIRE (c'est tout son intérêt)
  const page = wrongEditionPage('cloud');
  ok(/npm run build:lan/.test(page), 'la page de blocage donne la commande de recompilation');
  ok(/<!doctype html>/i.test(page) && /charset="utf-8"/.test(page), 'la page de blocage est un document HTML complet');
} finally {
  for (const d of dirs) { try { rmSync(d, { recursive: true, force: true }); } catch { /* ignore */ } }
}

console.log(`\n=== ${fail === 0 ? 'OK' : 'KO'} : ${pass} ok, ${fail} ko ===`);
process.exit(fail ? 1 : 0);
