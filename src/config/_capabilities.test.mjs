// Tests des capacités.  node src/config/_capabilities.test.mjs
import { ALL_CAPS, ACCESS_PRESETS, presetByKey, isPathPermitted, firstPermitted } from './capabilities.js';

let failed = false;
const ok = (cond, msg) => { console.log(`${cond ? '✅' : '❌'} ${msg}`); if (!cond) failed = true; };

ok(ALL_CAPS.length > 20 && ALL_CAPS.includes('/app/budgets'), 'catalogue de capacités peuplé');
ok(ACCESS_PRESETS.length >= 8, 'plusieurs profils (≥ 8)');
ok(presetByKey('raf').caps.includes('/app/budgets') && presetByKey('raf').caps.includes('/app/depenses'), 'profil RAF = finances');
ok(presetByKey('comptable').caps.length === 2, 'profil comptable = frais + catalogue');
ok(presetByKey('personnalise').caps.length === 0, 'profil personnalisé = vide');
ok(ACCESS_PRESETS.every((p) => p.role === 'censeur' || p.role === 'surveillant'), 'rôle de base compatible enum');

// isPathPermitted
ok(isPathPermitted('/app/budgets', null) === true, 'aucune permission = accès total (compte historique)');
ok(isPathPermitted('/app/budgets', ['/app/fees']) === false, 'page non autorisée refusée');
ok(isPathPermitted('/app/fees', ['/app/fees']) === true, 'page autorisée acceptée');
ok(isPathPermitted('/app/students/123', ['/app/students']) === true, 'sous-route (/:id) autorisée par le préfixe');
ok(isPathPermitted('/app/profile', ['/app/fees']) === true, 'profil toujours autorisé');
ok(isPathPermitted('/app', ['/app/fees']) === true, 'accueil toujours autorisé');
ok(firstPermitted(['/app/depenses']) === '/app/depenses', 'repli = première page autorisée');

// REGISTRE DES SERVICES (/app/cantine) — il est entré au catalogue APRÈS la
// création des comptes de l'école : aucune liste enregistrée ne le mentionne.
// Un compte qui porte déjà les frais doit l'avoir à l'ouverture suivante, SANS
// qu'un administrateur rouvre son compte pour cocher une case.
ok(ALL_CAPS.includes('/app/cantine'), 'registre des services délégable (catalogue)');
ok(presetByKey('raf').caps.includes('/app/cantine'), 'profil RAF porte le registre des services');
const RAF_ANCIEN = ['/app/fees', '/app/frais-catalogue', '/app/budgets', '/app/budget-global', '/app/depenses', '/app/caisse'];
ok(isPathPermitted('/app/cantine', RAF_ANCIEN) === true, 'compte RAF DÉJÀ créé : registre ouvert sans rien recocher');
ok(isPathPermitted('/app/cantine', ['/app/fees']) === true, 'qui tient les frais tient le registre');
ok(isPathPermitted('/app/cantine', ['/app/frais-catalogue']) === true, 'catalogue des frais ouvre le registre');
ok(isPathPermitted('/app/cantine', ['/app/budgets', '/app/depenses']) === false, 'un compte BUDGET seul n’obtient pas le registre');
ok(isPathPermitted('/app/cantine', ['/app/students', '/app/grades']) === false, 'un compte pédagogique n’obtient pas le registre');
ok(isPathPermitted('/app/caisse', ['/app/fees']) === false, 'l’implicite ne déborde pas sur le journal de caisse');
ok(isPathPermitted('/app/fees', ['/app/cantine']) === false, 'implication à sens unique');

console.log(failed ? '\n❌ Capabilities KO' : '\n✅ Capabilities OK');
process.exit(failed ? 1 : 0);
