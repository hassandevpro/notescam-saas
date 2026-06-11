// Signe une clé de licence pour une école (hors-ligne, avec la clé privée).
//
// Usage :
//   node packaging/license/sign-license.mjs --school "Lycée Bilingue" --plan pro --expires 2027-12-31
//   node packaging/license/sign-license.mjs --school "..." --plan ecole --expires 2027-09-30 --machine <empreinte>
//
// Variante interactive (questions guidées) : node packaging/license/make-license.mjs
//
// Sortie : la clé à coller dans l'écran d'activation de l'école.
// Format : base64url(payload JSON) + "." + base64url(signature Ed25519)

import { signLicense } from './sign-core.mjs';

function arg(name, def = null) {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

let result;
try {
  result = signLicense({
    school:  arg('school', 'École'),
    plan:    arg('plan', 'ecole'),
    expires: arg('expires'),
    machine: arg('machine'),
  });
} catch (e) {
  console.error(e.message);
  process.exit(1);
}

const { payload, licenseKey } = result;
console.log('--- Licence générée ---');
console.log(JSON.stringify(payload, null, 2));
console.log(payload.machine_id
  ? `\n🔒 Verrouillée sur la machine : ${payload.machine_id} (activable sur ce poste uniquement)`
  : '\n🔓 Non verrouillée : activable sur n’importe quelle machine. Pour verrouiller,'
    + '\n   relance avec --machine <identifiant affiché sur l’écran d’activation de l’école>.');
console.log('\nClé à fournir à l’école (à coller dans l’écran d’activation) :\n');
console.log(licenseKey);
