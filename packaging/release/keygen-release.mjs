// Génère la paire de clés Ed25519 des PUBLICATIONS (mises à jour OTA).
//   - Clé PRIVÉE   -> packaging/release/release-private-key.pem  (SECRET, gitignorée)
//   - Clé PUBLIQUE -> server/release-pubkey.txt                  (livrée dans l'app)
//
// Usage :  node packaging/release/keygen-release.mjs
//
// ⚠️ Cette clé est DISTINCTE de celle des licences, et c'est délibéré : elle
//    autorise l'exécution de code sur tous les serveurs d'école. Une compromission
//    de la clé de licence ne doit jamais donner ce pouvoir. Garde-la hors ligne.
//
// ⚠️ Si tu la perds, les écoles déjà déployées refuseront toute mise à jour
//    automatique (elles resteront sur l'installeur manuel) tant qu'elles n'auront
//    pas reçu une build contenant la nouvelle clé publique.

import { generateKeyPairSync } from 'node:crypto';
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here     = dirname(fileURLToPath(import.meta.url));
const privPath = join(here, 'release-private-key.pem');
const pubPath  = join(here, '..', '..', 'server', 'release-pubkey.txt');

if (existsSync(privPath) && !process.argv.includes('--force')) {
  console.error(`Une clé privée de publication existe déjà : ${privPath}`);
  console.error('Relance avec --force pour la remplacer (les écoles déployées refuseront');
  console.error('les mises à jour signées avec la nouvelle clé tant qu’elles n’auront pas');
  console.error('reçu une build contenant la nouvelle clé publique).');
  process.exit(1);
}

mkdirSync(here, { recursive: true });
const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const pubB64  = publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
const privPem = privateKey.export({ format: 'pem', type: 'pkcs8' });

writeFileSync(privPath, privPem);
writeFileSync(pubPath, pubB64 + '\n');

console.log('✔ Clé privée   ->', privPath, '(SECRET — à sauvegarder hors dépôt)');
console.log('✔ Clé publique ->', pubPath, '(livrée dans l’installateur)');
console.log('\nClé publique (base64 SPKI) :\n' + pubB64);
