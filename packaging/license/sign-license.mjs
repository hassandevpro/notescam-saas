// Signe une clé de licence pour une école (hors-ligne, avec la clé privée).
//
// Usage :
//   node packaging/license/sign-license.mjs --school "Lycée Bilingue" --plan pro --expires 2027-12-31
//   node packaging/license/sign-license.mjs --school "..." --plan ecole --expires 2027-09-30 --machine <empreinte>
//
// Sortie : la clé à coller dans l'écran d'activation de l'école.
// Format : base64url(payload JSON) + "." + base64url(signature Ed25519)

import { createPrivateKey, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

function arg(name, def = null) {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

let priv;
try {
  priv = createPrivateKey(readFileSync(join(here, 'private-key.pem')));
} catch {
  console.error('Clé privée introuvable. Lance d’abord : node packaging/license/keygen.mjs');
  process.exit(1);
}

const payload = {
  school:     arg('school', 'École'),
  plan:       arg('plan', 'ecole'),       // starter | ecole | pro | reseau
  edition:    'lan',
  issued_at:  new Date().toISOString(),
  expires_at: arg('expires', null),       // ISO date ou null = perpétuelle
};
const machine = arg('machine');
if (machine) payload.machine_id = machine;

const b64url = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const payloadBuf = Buffer.from(JSON.stringify(payload), 'utf8');
const signature  = sign(null, payloadBuf, priv);       // Ed25519
const licenseKey = `${b64url(payloadBuf)}.${b64url(signature)}`;

console.log('--- Licence générée ---');
console.log(JSON.stringify(payload, null, 2));
console.log('\nClé à fournir à l’école (à coller dans l’écran d’activation) :\n');
console.log(licenseKey);
