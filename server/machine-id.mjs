// Diagnostic d'empreinte machine — à lancer SUR le serveur de l'école quand une
// clé de licence est refusée (« verrouillée sur une autre machine »).
//
//   sudo -u notescam /opt/notescam/node/bin/node /opt/notescam/app/server/machine-id.mjs
//
// Affiche l'empreinte à faire signer (la 1ʳᵉ) et toutes celles que ce poste
// accepte encore. Si la clé de l'école cite une empreinte présente dans la
// liste « acceptées », c'est le serveur qui est trop vieux : il faut le mettre
// à jour. Si elle n'y figure pas du tout, la clé a bien été émise pour une
// autre machine et il faut la réémettre pour l'empreinte affichée.
//
// Le paramètre optionnel est une clé de licence : on la vérifie alors sur place
// et on dit exactement pourquoi elle passe ou non.

import { machineFingerprints, verifyLicenseKey, licensingEnabled } from './security.js';

const fps = machineFingerprints();

console.log('\n=== Empreinte machine NotesCam ===\n');
console.log(`  À faire signer  : ${fps[0]}`);
if (fps.length > 1) {
  console.log('  Aussi acceptées :');
  for (const fp of fps.slice(1)) console.log(`                    ${fp}`);
}
console.log(`\n  Licence exigée  : ${licensingEnabled() ? 'oui' : 'non (installation non provisionnée)'}`);

const key = process.argv[2];
if (key) {
  const res = verifyLicenseKey(key, { machineIds: fps });
  console.log('\n--- Vérification de la clé fournie ---');
  if (res.ok) {
    console.log(`  ✅ Valide — école « ${res.payload.school} », plan ${res.payload.plan},`);
    console.log(`     expire le ${res.payload.expires_at || 'jamais'}`);
    console.log(`     verrou : ${res.machineId || 'aucun (valable sur tout poste)'}`);
  } else {
    console.log(`  ❌ Refusée — ${res.reason}`);
    if (res.reason === 'machine_mismatch') {
      console.log(`     clé émise pour : ${res.payload?.machine_id}`);
      console.log(`     ce poste       : ${fps.join(', ')}`);
    }
  }
}
console.log('');
