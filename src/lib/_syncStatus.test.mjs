// Test — la règle « synchro OK / en attente / échec » (src/lib/syncStatus.js).
//
//   node src/lib/_syncStatus.test.mjs
//
// Horloge injectée : on joue des scénarios d'école sans attendre. Chaque cas est un
// moment de la vie d'un administrateur qui lève les yeux sur le voyant.
import { statutLan, statutCloud, NIVEAUX as N, SEUIL_FRAIS_MS, SEUIL_ECHEC_MS } from './syncStatus.js';

let pass = 0, fail = 0;
const ok = (c, label, got) => { if (c) { console.log(`✅ ${label}`); pass++; } else { console.log(`❌ ${label} (obtenu: ${JSON.stringify(got)})`); fail++; } };

const NOW = Date.parse('2026-11-02T10:00:00.000Z');
const ilYA = (ms) => new Date(NOW - ms).toISOString();
const s = (n) => n * 1000, min = (n) => n * 60_000;

const lan = (o = {}) => ({
  enabled: true, migrated: true, mode: 'HYBRIDE_CONNECTED', pending: 0, quarantined: 0, conflits: { aArbitrer: 0, total: 0 },
  health: { inFlight: false, lastSuccessAt: ilYA(s(20)), lastError: null, startedAt: ilYA(min(60)), lastPulled: 2, lastPushed: 3, lastMismatches: [] },
  ...o,
});
const avec = (h, o = {}) => lan({ ...o, health: { ...lan().health, ...h } });

console.log('── LAN');
ok(statutLan(lan(), NOW).niveau === N.OK, 'tout va bien → OK');
ok(statutLan(lan({ pending: 12 }), NOW).niveau === N.ATTENTE, '12 lignes à envoyer → EN ATTENTE');
ok(/12 lignes/.test(statutLan(lan({ pending: 12 }), NOW).libelle), 'et le libellé dit combien', statutLan(lan({ pending: 12 }), NOW).libelle);
ok(statutLan(lan({ pending: 1 }), NOW).libelle.includes('1 ligne à'), 'singulier : « 1 ligne à envoyer »', statutLan(lan({ pending: 1 }), NOW).libelle);
ok(statutLan(avec({ inFlight: true }), NOW).niveau === N.ATTENTE, 'cycle en cours → EN ATTENTE (pas OK)');
ok(statutLan(lan({ conflits: { aArbitrer: 2, total: 2 } }), NOW).niveau === N.ATTENTE, '2 désaccords à trancher → EN ATTENTE');
ok(statutLan(avec({ lastSuccessAt: ilYA(SEUIL_FRAIS_MS + s(10)) }), NOW).niveau === N.ATTENTE, 'dernier succès > 3 min → EN ATTENTE (retard)');
ok(statutLan(avec({ lastSuccessAt: ilYA(SEUIL_FRAIS_MS - s(10)) }), NOW).niveau === N.OK, 'dernier succès < 3 min → OK');

ok(statutLan(lan({ quarantined: 3 }), NOW).niveau === N.ECHEC, '3 lignes refusées par le Cloud (quarantaine) → ÉCHEC');
ok(statutLan(lan({ quarantined: 3 }), NOW).details.some((d) => /restent à l’école/.test(d)), 'et on rassure : elles restent à l’école');
ok(statutLan(avec({ lastError: { kind: 'error', message: 'sync-push: bad_token' } }), NOW).niveau === N.ECHEC, 'erreur du Cloud (jeton) → ÉCHEC');
ok(statutLan(avec({ lastError: { kind: 'error', message: 'sync-push: bad_token' } }), NOW).details.includes('sync-push: bad_token'), 'et le message technique est montré');
ok(statutLan(lan({ mode: 'HYBRIDE_MISMATCH', health: { ...lan().health, lastMismatches: ['students'] } }), NOW).niveau === N.ECHEC, 'données divergentes → ÉCHEC');
ok(statutLan(avec({ divergenceAlert: { streak: 12 } }), NOW).niveau === N.ECHEC, 'alerte de divergence persistante → ÉCHEC');

console.log('── LAN : coupure d\'Internet');
const hors = (depuis) => avec({ lastError: { kind: 'network', message: 'fetch failed' }, lastSuccessAt: ilYA(depuis) });
ok(statutLan(hors(min(2)), NOW).niveau === N.ATTENTE, 'Internet coupé depuis 2 min → EN ATTENTE, pas panne');
ok(statutLan(hors(SEUIL_ECHEC_MS - s(30)), NOW).niveau === N.ATTENTE, 'coupé depuis 14,5 min → encore EN ATTENTE');
ok(statutLan(hors(SEUIL_ECHEC_MS + s(30)), NOW).niveau === N.ECHEC, 'coupé depuis 15,5 min → ÉCHEC : l\'admin doit le savoir');
ok(statutLan(avec({ lastError: { kind: 'network', message: 'x' }, lastSuccessAt: ilYA(min(2)) }, { pending: 40 }), NOW).details.some((d) => /40 lignes en attente/.test(d)), 'la file en attente est chiffrée pendant la coupure');

console.log('── LAN : démarrage sans succès');
const neuf = (demarreIl, err) => avec({ lastSuccessAt: null, startedAt: ilYA(demarreIl), lastError: err || null });
ok(statutLan(neuf(s(20)), NOW).niveau === N.ATTENTE, 'serveur démarré il y a 20 s, aucun cycle encore → EN ATTENTE');
ok(/premier cycle/.test(statutLan(neuf(s(20)), NOW).libelle), 'et le libellé dit « premier cycle »', statutLan(neuf(s(20)), NOW).libelle);
ok(statutLan(neuf(min(2), { kind: 'network', message: 'x' }), NOW).niveau === N.ATTENTE, 'rallumé sans Internet depuis 2 min → EN ATTENTE (pas « en échec depuis toujours »)');
ok(statutLan(neuf(min(300), { kind: 'network', message: 'x' }), NOW).niveau === N.ECHEC, 'tourne depuis 5 h sans JAMAIS avoir synchronisé → ÉCHEC');

console.log('── LAN : non en service');
ok(statutLan(null, NOW).niveau === N.INACTIF, 'pas d\'état → inactif');
ok(statutLan(lan({ migrated: false }), NOW).libelle === 'Non relié au Cloud', 'non migré → « Non relié au Cloud » (le composant se masque)');
ok(statutLan(lan({ enabled: false }), NOW).niveau === N.INACTIF, 'synchro désactivée → inactif, jamais un faux vert');
ok(statutLan(lan({ enabled: false, pending: 500 }), NOW).niveau === N.INACTIF, 'désactivée avec une file → toujours inactif (pas de verdict trompeur)');

console.log('── LAN : priorités');
ok(statutLan(avec({ lastError: { kind: 'error', message: 'boom' } }, { pending: 50, conflits: { aArbitrer: 1, total: 1 } }), NOW).niveau === N.ECHEC, 'échec l\'emporte sur attente');
ok(statutLan(lan({ quarantined: 1, pending: 9 }), NOW).niveau === N.ECHEC, 'quarantaine l\'emporte sur file en attente');

console.log('── Cloud (ce que le serveur de l\'école a DIT)');
const cloud = (o = {}) => ({ last_pull_at: ilYA(s(20)), lan_pending: 0, lan_quarantined: 0, lan_conflicts: 0,
  lan_last_error: null, lan_last_error_kind: null, lan_last_success_at: ilYA(s(20)), lan_version: '0.3.30', ...o });
ok(statutCloud(cloud(), NOW).niveau === N.OK, 'vu il y a 20 s, rien en file → OK');
ok(statutCloud(null, NOW).niveau === N.INACTIF, 'aucune ligne (pas de serveur relié) → inactif, le composant se masque');
ok(statutCloud({ last_pull_at: null }, NOW).niveau === N.INACTIF, 'ligne sans date → inactif');
ok(statutCloud(cloud({ lan_pending: 8 }), NOW).niveau === N.ATTENTE, '8 lignes pas encore montées depuis l\'école → EN ATTENTE');
ok(statutCloud(cloud({ lan_conflicts: 1 }), NOW).niveau === N.ATTENTE, 'désaccord à trancher à l\'école → EN ATTENTE');
ok(statutCloud(cloud({ last_pull_at: ilYA(SEUIL_FRAIS_MS + s(30)) }), NOW).niveau === N.ATTENTE, 'serveur silencieux depuis 3,5 min → EN ATTENTE');
ok(statutCloud(cloud({ last_pull_at: ilYA(SEUIL_ECHEC_MS + s(30)) }), NOW).niveau === N.ECHEC, 'serveur silencieux depuis 15,5 min → ÉCHEC (injoignable)');
ok(statutCloud(cloud({ lan_quarantined: 4 }), NOW).niveau === N.ECHEC, 'lignes refusées → ÉCHEC');
ok(statutCloud(cloud({ lan_last_error: 'sync-push: bad_token', lan_last_error_kind: 'error' }), NOW).niveau === N.ECHEC, 'erreur déclarée par l\'école → ÉCHEC');
ok(statutCloud(cloud({ lan_last_error: 'fetch failed', lan_last_error_kind: 'network' }), NOW).niveau === N.ATTENTE, 'difficultés réseau déclarées → EN ATTENTE');
ok(statutCloud(cloud({ lan_pending: null, lan_quarantined: null, lan_conflicts: null, lan_version: null }), NOW).niveau === N.OK,
  'ancien serveur d\'école qui ne déclare PAS son état (colonnes nulles) → jugé sur sa seule présence, sans planter');
ok(statutCloud(cloud(), NOW).details.some((d) => /0\.3\.30/.test(d)), 'la version du serveur d\'école est montrée');

console.log('── Les deux éditions lisent la MÊME règle');
{
  // Même situation vue des deux côtés : 8 lignes en file, serveur vivant.
  const a = statutLan(lan({ pending: 8 }), NOW).niveau, b = statutCloud(cloud({ lan_pending: 8 }), NOW).niveau;
  ok(a === b && a === N.ATTENTE, 'file de 8 : EN ATTENTE des deux côtés', { a, b });
  const c = statutLan(lan({ quarantined: 2 }), NOW).niveau, d = statutCloud(cloud({ lan_quarantined: 2 }), NOW).niveau;
  ok(c === d && c === N.ECHEC, 'lignes refusées : ÉCHEC des deux côtés', { c, d });
  const e = statutLan(lan(), NOW).niveau, f = statutCloud(cloud(), NOW).niveau;
  ok(e === f && e === N.OK, 'rien à signaler : OK des deux côtés', { e, f });
}

console.log(`\n=== ${fail === 0 ? 'OK' : 'ÉCHEC'} : ${pass} ok, ${fail} ko ===`);
process.exit(fail === 0 ? 0 : 1);
