// Générateur de licence INTERACTIF (questions guidées) — pour ne pas retenir
// les options de sign-license.mjs.
//
//   node packaging/license/make-license.mjs       (ou : npm run license)
//
// Demande nom d'école, plan, expiration et empreinte machine, puis affiche la
// clé à coller dans l'écran d'activation. Utilise le même cœur de signature.
//
// Fonctionne au clavier (TTY) comme en entrée redirigée (les réponses peuvent
// être fournies ligne par ligne via un pipe).

import { createInterface } from 'node:readline';
import { stdin as input, stdout as output } from 'node:process';
import { signLicense, PLANS } from './sign-core.mjs';

// File de lignes : robuste au pipe (où toutes les lignes arrivent d'un coup)
// comme au clavier. nextLine() renvoie null en fin d'entrée (EOF).
const rl = createInterface({ input, output: undefined, terminal: false });
const buffer = [];
const waiters = [];
let closed = false;
rl.on('line', (l) => { const w = waiters.shift(); if (w) w(l); else buffer.push(l); });
rl.on('close', () => { closed = true; while (waiters.length) waiters.shift()(null); });
function nextLine() {
  if (buffer.length) return Promise.resolve(buffer.shift());
  if (closed) return Promise.resolve(null);
  return new Promise((res) => waiters.push(res));
}
async function ask(q, def = '') {
  output.write(def ? `${q} [${def}] : ` : `${q} : `);
  const a = await nextLine();
  if (a === null) return null;             // EOF
  return a.trim() || def;
}
const abortIfEof = (v) => { if (v === null) throw new Error('Entrée interrompue.'); return v; };

const isValidDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

try {
  console.log('\n=== Génération d’une clé de licence NotesCam (LAN) ===\n');

  let school = abortIfEof(await ask('Nom de l’école'));
  while (school === '') {
    console.log('  → Le nom est obligatoire.');
    school = abortIfEof(await ask('Nom de l’école'));
  }

  let plan = abortIfEof(await ask(`Plan (${PLANS.join(' / ')})`, 'ecole')).toLowerCase();
  while (!PLANS.includes(plan)) {
    console.log(`  → Plan invalide. Choisis parmi : ${PLANS.join(', ')}`);
    plan = abortIfEof(await ask(`Plan (${PLANS.join(' / ')})`, 'ecole')).toLowerCase();
  }

  let expires = abortIfEof(await ask('Expiration AAAA-MM-JJ (vide = perpétuelle)'));
  while (expires !== '' && !isValidDate(expires)) {
    console.log('  → Date invalide. Format attendu : 2027-12-31 (ou laisse vide).');
    expires = abortIfEof(await ask('Expiration AAAA-MM-JJ (vide = perpétuelle)'));
  }

  const machine = abortIfEof(await ask('Empreinte machine (vide = valable sur tout poste)'));

  const { payload, licenseKey } = signLicense({ school, plan, expires: expires || null, machine: machine || null });

  console.log('\n--- Récapitulatif ---');
  console.log(`  École      : ${payload.school}`);
  console.log(`  Plan       : ${payload.plan}`);
  console.log(`  Expiration : ${payload.expires_at || 'perpétuelle'}`);
  console.log(`  Machine    : ${payload.machine_id ? `🔒 ${payload.machine_id}` : '🔓 non verrouillée (tout poste)'}`);
  console.log('\nClé à fournir à l’école (à coller dans l’écran d’activation) :\n');
  console.log(licenseKey);
  console.log('');
} catch (e) {
  console.error('\n❌ ' + (e?.message || e));
  process.exitCode = 1;
} finally {
  rl.close();
}
