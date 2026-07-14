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

console.log(failed ? '\n❌ Capabilities KO' : '\n✅ Capabilities OK');
process.exit(failed ? 1 : 0);
