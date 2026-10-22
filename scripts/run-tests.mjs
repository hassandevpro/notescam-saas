// scripts/run-tests.mjs
// Lanceur UNIQUE de tous les tests colocalisés `_*.test.mjs` du dépôt.
//
//   npm test                  → tout
//   npm test -- --filter sync → seuls les chemins contenant « sync »
//   npm test -- --serie       → séquentiel (sortie lisible pour diagnostiquer)
//
// Pourquoi ce script : les 176 tests n'étaient atteignables que par 5 scripts
// partiels (`test:sync-batch`, `test:bilingue`…). Sans commande unique, aucune
// preuve de non-régression reproductible avant une livraison.
//
// Trois conventions du dépôt sont respectées :
//   - `packaging/` est EXCLU : il contient des copies figées des sources livrées
//     (899 fichiers de test dupliqués), pas les tests du code courant ;
//   - un test flanqué d'un `_<nom>.hooks.mjs` tourne AVEC ce loader (doublures) ;
//   - sinon on tente `node` nu, puis on réessaie avec `scripts/lib/esm-resolve.mjs`
//     si l'échec est une résolution de module (imports sans extension, « à la Vite »).
import { spawn } from 'node:child_process';
import { readdir, access, readFile } from 'node:fs/promises';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RACINES = ['src', 'server', 'supabase'];
const EXCLUS  = new Set(['node_modules', 'dist', 'packaging', '.git']);
const TIMEOUT = 180_000;

const args      = process.argv.slice(2);
const filtre    = args.includes('--filter') ? args[args.indexOf('--filter') + 1] : null;
const enSerie   = args.includes('--serie');
const PARALLELE = enSerie ? 1 : 4;

async function existe(p) { try { await access(p); return true; } catch { return false; } }

async function trouverTests(dir, acc = []) {
  let entrees;
  try { entrees = await readdir(join(ROOT, dir), { withFileTypes: true }); } catch { return acc; }
  for (const e of entrees) {
    if (EXCLUS.has(e.name)) continue;
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) await trouverTests(rel, acc);
    else if (/^_.*\.test\.mjs$/.test(e.name)) acc.push(rel);
  }
  return acc;
}

function lancer(fichier, loader) {
  const argv = loader ? ['--experimental-loader', loader, fichier] : [fichier];
  return new Promise((resolve) => {
    const t0 = Date.now();
    const p = spawn(process.execPath, argv, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { err += d; });
    const minuteur = setTimeout(() => { p.kill('SIGKILL'); err += `\n[run-tests] delai depasse (${TIMEOUT} ms)`; }, TIMEOUT);
    p.on('close', (code) => {
      clearTimeout(minuteur);
      resolve({ code, out, err, ms: Date.now() - t0 });
    });
  });
}

// Une résolution ESM ratée n'est pas un échec de test : c'est le dépôt qui
// importe sans extension. On réessaie alors avec le résolveur « à la Vite ».
const estResolution = (r) => /ERR_MODULE_NOT_FOUND|Cannot find module/.test(r.err);

// Convention du depot : chaque test documente sa commande dans son en-tete, par
// ex. « node --experimental-loader ./src/lib/_syncBatch.hooks.mjs src/lib/… ».
// Ce loader-la fait foi : il n est pas toujours le frere du test (_syncRestart et
// _syncDurability empruntent celui de _syncBatch).
async function loaderDocumente(fichier) {
  try {
    const tete = (await readFile(join(ROOT, fichier), 'utf8')).slice(0, 2000);
    const m = tete.match(/--experimental-loader\s+(\S+)/);
    return m ? m[1] : null;
  } catch { return null; }
}

async function executer(fichier) {
  const documente = await loaderDocumente(fichier);
  if (documente) return { fichier, loader: documente, ...(await lancer(fichier, documente)) };

  const hooks = join(dirname(fichier), `_${basename(fichier).replace(/^_/, '').replace('.test.mjs', '')}.hooks.mjs`);
  if (await existe(join(ROOT, hooks))) {
    return { fichier, loader: hooks, ...(await lancer(fichier, `./${hooks}`)) };
  }
  let r = await lancer(fichier, null);
  if (r.code !== 0 && estResolution(r)) {
    const r2 = await lancer(fichier, './scripts/lib/esm-resolve.mjs');
    if (r2.code === 0) return { fichier, loader: 'esm-resolve', ...r2 };
    return { fichier, loader: 'esm-resolve', ...r2 };
  }
  return { fichier, loader: null, ...r };
}

const tests = (await Promise.all(RACINES.map((r) => trouverTests(r))))
  .flat()
  .filter((f) => !filtre || f.includes(filtre))
  .sort();

if (!tests.length) {
  console.error(filtre ? `Aucun test ne correspond a « ${filtre} ».` : 'Aucun test trouve.');
  process.exit(1);
}

console.log(`${tests.length} test(s) — ${PARALLELE} en parallele\n`);

const resultats = [];
const file = [...tests];
await Promise.all(Array.from({ length: PARALLELE }, async () => {
  while (file.length) {
    const f = file.shift();
    const r = await executer(f);
    resultats.push(r);
    console.log(`${r.code === 0 ? '  ok ' : '  KO '} ${f}${r.loader ? ' [loader]' : ''} (${r.ms} ms)`);
  }
}));

// ── Cliquet des echecs connus ────────────────────────────────────────────
// Meme principe que `server/_sync_contract.test.mjs` : un echec INSCRIT ici ne
// fait pas echouer la suite, mais tout echec NON inscrit la fait echouer. La CI
// reste donc verte sur un defaut deja identifie et documente, tout en bloquant
// la moindre regression nouvelle.
//
// Un echec inscrit qui se met a PASSER est signale lui aussi : il faut alors le
// retirer de cette liste, sinon le cliquet se desserre en silence.
//
// Chaque entree porte sa reference dans PROJECT_STATUS.md. Ne rien ajouter ici
// sans y ouvrir le blocage correspondant.
//
// VIDE depuis le 2026-10-19 : B2 est clos. Les deux tests inscrits ici
// (_importStudents, _studentFieldsIO) extraient les fonctions internes
// d exportCsv.js en decoupant son texte d une declaration `function` a la
// suivante ; une `export function` glissee entre les deux faisait embarquer le
// mot-cle `export` dans `new Function`. La borne de fin reconnait desormais
// toute declaration de premier niveau, et le `return` colle au corps est pose
// sur sa propre ligne (il tombait dans un commentaire final). Les deux passent.
const ECHECS_CONNUS = {};

const ko       = resultats.filter((r) => r.code !== 0);
const inattendus = ko.filter((r) => !(r.fichier in ECHECS_CONNUS));
const connus     = ko.filter((r) => r.fichier in ECHECS_CONNUS);
const gueris     = resultats.filter((r) => r.code === 0 && r.fichier in ECHECS_CONNUS);

if (inattendus.length) {
  console.log(`\n${'='.repeat(70)}\nECHECS INATTENDUS (${inattendus.length})\n${'='.repeat(70)}`);
  for (const r of inattendus) {
    console.log(`\n--- ${r.fichier} (code ${r.code}) ---`);
    const details = (r.err || r.out).trim().split('\n').slice(-18).join('\n');
    console.log(details || '(aucune sortie)');
  }
}

if (connus.length) {
  console.log(`\nEchecs CONNUS, tolerés (${connus.length}) — voir PROJECT_STATUS.md :`);
  for (const r of connus) console.log(`  · ${r.fichier} — ${ECHECS_CONNUS[r.fichier]}`);
}

if (gueris.length) {
  console.log(`\nATTENTION — ces tests passent alors qu ils sont inscrits comme connus :`);
  for (const r of gueris) console.log(`  · ${r.fichier} → retirer de ECHECS_CONNUS`);
}

const ms = resultats.reduce((s, r) => s + r.ms, 0);
console.log(`\n=== ${resultats.length - ko.length} ok, ${ko.length} ko (dont ${connus.length} connu(s)) — ${(ms / 1000).toFixed(1)} s cumulees ===`);
process.exit(inattendus.length ? 1 : 0);
