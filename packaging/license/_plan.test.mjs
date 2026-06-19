// Test — normalisation/validation du plan à la signature de licence.
// Vérifie que « Pro » (casse) est corrigé en « pro » et qu'un nom inexistant
// (« Standard ») est rejeté, au lieu d'être signé tel quel puis dégradé en Starter.
//
//   node packaging/license/_plan.test.mjs
import { signLicense, PLANS } from './sign-core.mjs';

let pass = 0, fail = 0;
const ok = (c, label, got) => { if (c) { console.log(`✅ ${label}`); pass++; } else { console.log(`❌ ${label} (obtenu: ${JSON.stringify(got)})`); fail++; } };
const throws = (fn) => { try { fn(); return null; } catch (e) { return e.message; } };

// Casse corrigée : « Pro » → « pro » (signé valide)
const pro = signLicense({ school: 'X', plan: 'Pro' });
ok(pro.payload.plan === 'pro', '« Pro » normalisé en « pro »', pro.payload.plan);

// Espaces + casse mixte
ok(signLicense({ plan: '  Ecole ' }).payload.plan === 'ecole', '«  Ecole  » normalisé en « ecole »');

// Plans canoniques inchangés
for (const p of PLANS) ok(signLicense({ plan: p }).payload.plan === p, `plan « ${p} » accepté`);

// Défaut
ok(signLicense({}).payload.plan === 'ecole', 'plan par défaut = ecole');

// Nom inexistant rejeté (n'est PAS signé silencieusement)
const errStd = throws(() => signLicense({ plan: 'Standard' }));
ok(errStd && /Plan invalide/.test(errStd), '« Standard » rejeté avec message clair', errStd);
const errEmpty = throws(() => signLicense({ plan: 'gold' }));
ok(errEmpty && /Plan invalide/.test(errEmpty), '« gold » rejeté', errEmpty);

console.log(`\n=== ${fail === 0 ? 'OK' : 'ÉCHEC'} : ${pass} ok, ${fail} ko ===`);
process.exit(fail === 0 ? 0 : 1);
