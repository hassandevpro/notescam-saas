// Génère la paire de clés Ed25519 de l'éditeur (une seule fois).
//   - Clé PRIVÉE  -> packaging/license/private-key.pem  (SECRET, gitignorée)
//   - Clé PUBLIQUE -> server/license-pubkey.txt          (livrée dans l'app)
//
// Usage :  node packaging/license/keygen.mjs
//
// ⚠️ Sauvegarde la clé privée hors du dépôt. Si tu la perds, tu ne pourras
//    plus signer de nouvelles licences (les écoles déjà activées continuent).

import { generateKeyPairSync } from 'node:crypto';
import { writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here     = dirname(fileURLToPath(import.meta.url));
const privPath = join(here, 'private-key.pem');
const pubPath  = join(here, '..', '..', 'server', 'license-pubkey.txt');

if (existsSync(privPath) && !process.argv.includes('--force')) {
  console.error(`Une clé privée existe déjà : ${privPath}`);
  console.error('Relance avec --force pour la remplacer (invalide toutes les licences existantes).');
  process.exit(1);
}

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const pubB64  = publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
const privPem = privateKey.export({ format: 'pem', type: 'pkcs8' });

writeFileSync(privPath, privPem);
writeFileSync(pubPath, pubB64 + '\n');

console.log('✔ Clé privée   ->', privPath, '(SECRET — à sauvegarder hors dépôt)');
console.log('✔ Clé publique ->', pubPath, '(livrée dans l’installateur)');
console.log('\nClé publique (base64 SPKI) :\n' + pubB64);
