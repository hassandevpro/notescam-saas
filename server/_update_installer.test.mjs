// Test — MISE À JOUR AUTOMATIQUE LAN (server/updateInstaller.js).
//
// Le serveur d'une école télécharge et exécute un binaire : ce test porte
// d'abord sur les REFUS. Un cas non couvert ici, c'est une école qui installe
// n'importe quoi.
//
//   node server/_update_installer.test.mjs
import { generateKeyPairSync, createHash, sign as cryptoSign } from 'node:crypto';
import { mkdtempSync, writeFileSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'nc-ota-'));
process.env.NOTESCAM_DATA_DIR = dir;
process.env.VITE_SUPABASE_URL = 'https://test.supabase.co';

// Paire de clés de PUBLICATION propre au test (jamais celle de production).
const { publicKey, privateKey } = generateKeyPairSync('ed25519');
process.env.NOTESCAM_RELEASE_PUBKEY = publicKey.export({ format: 'der', type: 'spki' }).toString('base64');

const { db, DATA_DIR } = await import('./db.js');
const { setSetting } = await import('./syncFlag.js');
const { markVerification } = await import('./syncHealth.js');
const m = await import('./updateInstaller.js');

let pass = 0, fail = 0;
const ok = (c, label, got) => { if (c) { console.log(`✅ ${label}`); pass++; } else { console.log(`❌ ${label} (obtenu: ${JSON.stringify(got)})`); fail++; } };
const throws = async (fn, re, label) => {
  let msg = null;
  try { await fn(); } catch (e) { msg = e.message; }
  ok(msg !== null && re.test(msg), label, msg);
};

db.prepare('INSERT INTO schools (id, name) VALUES (?,?)').run('sch1', 'École');

// ── Faux installeur + fausse réponse HTTP ───────────────────────────────────
const PAYLOAD = Buffer.from('MZ faux installeur NotesCam pour test'.repeat(50));
const SHA = createHash('sha256').update(PAYLOAD).digest('hex');
const signFor = (version, sha) => cryptoSign(
  null, Buffer.from(`notescam-release:${version}:${sha}`, 'utf8'), privateKey,
).toString('base64');

const fakeFetch = (body = PAYLOAD, status = 200) => async () => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (h) => (h === 'content-length' ? String(body.length) : null) },
  body: new ReadableStream({ start(c) { c.enqueue(new Uint8Array(body)); c.close(); } }),
});

const release = (over = {}) => ({
  version: '9.9.9', url: 'https://cdn.test/NotesCam-Setup-9.9.9.exe',
  sha256: SHA, signature: signFor('9.9.9', SHA), ...over,
});

// ── Chaîne de confiance : signature ─────────────────────────────────────────
ok(m.releaseSigningConfigured(), 'clé publique de publication configurée');
ok(m.signedPayload('1.2.3', 'ABCD') === 'notescam-release:1.2.3:abcd',
  'le message signé lie la version à l’empreinte (minuscules)');

ok(m.verifyReleaseSignature({ version: '9.9.9', sha256: SHA, signature: signFor('9.9.9', SHA) }).ok,
  'signature valide acceptée');
ok(m.verifyReleaseSignature({ version: '9.9.9', sha256: SHA, signature: signFor('9.9.8', SHA) }).reason === 'bad_signature',
  'signature d’une AUTRE version refusée (pas de rejeu)');
ok(m.verifyReleaseSignature({ version: '9.9.9', sha256: 'deadbeef', signature: signFor('9.9.9', SHA) }).reason === 'bad_signature',
  'signature valide mais empreinte différente : refusée');
ok(m.verifyReleaseSignature({ version: '9.9.9', sha256: SHA, signature: null }).reason === 'missing_signature',
  'publication non signée refusée');
ok(m.verifyReleaseSignature({ version: '9.9.9', sha256: SHA, signature: 'pas-du-base64!!' }).ok === false,
  'signature illisible refusée sans planter');

// ── Téléchargement ──────────────────────────────────────────────────────────
await throws(() => m.downloadRelease({ version: '1', sha256: SHA }), /URL/, 'refus : publication sans URL');
await throws(() => m.downloadRelease({ version: '1', url: 'https://x/y' }), /empreinte/, 'refus : publication sans sha256');
await throws(() => m.downloadRelease(release({ url: 'http://cdn.test/x.exe' })), /https/,
  'refus : URL en http (téléchargement non sécurisé)');
await throws(() => m.downloadRelease(release(), { fetchImpl: fakeFetch(PAYLOAD, 404) }), /HTTP 404/,
  'refus : téléchargement en erreur');

const dl = await m.downloadRelease(release(), { fetchImpl: fakeFetch() });
ok(existsSync(dl.path) && dl.bytes === PAYLOAD.length, 'téléchargement écrit le fichier attendu', dl);
ok(readFileSync(dl.path).equals(PAYLOAD), 'contenu intact');
ok(!existsSync(`${dl.path}.part`), 'aucun fichier temporaire résiduel');
ok(m.sha256File(dl.path) === SHA, 'empreinte du fichier téléchargé');

// Reprise : un fichier déjà intègre n'est pas retéléchargé.
const again = await m.downloadRelease(release(), { fetchImpl: async () => { throw new Error('ne doit pas être appelé'); } });
ok(again.cached === true, 'fichier déjà intègre : pas de nouveau téléchargement', again);

// ── Vérification, et NETTOYAGE en cas de refus ──────────────────────────────
ok(m.verifyDownloaded(release(), dl).signature === 'ok', 'installeur authentique accepté');

const badSha = release({ sha256: 'a'.repeat(64) });
let threwSha = null;
try { m.verifyDownloaded(badSha, dl); } catch (e) { threwSha = e.message; }
ok(/Empreinte invalide/.test(threwSha || ''), 'empreinte différente : refus', threwSha);
ok(!existsSync(dl.path), 'un binaire non conforme est SUPPRIMÉ (rien de douteux ne reste sur le disque)');

const dl2 = await m.downloadRelease(release(), { fetchImpl: fakeFetch() });
let threwSig = null;
try { m.verifyDownloaded(release({ signature: signFor('0.0.1', SHA) }), dl2); } catch (e) { threwSig = e.message; }
ok(/Signature refusée/.test(threwSig || ''), 'signature invalide : refus', threwSig);
ok(!existsSync(dl2.path), 'un binaire mal signé est SUPPRIMÉ');

// Corruption du binaire APRÈS téléchargement (disque, altération) : détectée.
const dl3 = await m.downloadRelease(release(), { fetchImpl: fakeFetch() });
writeFileSync(dl3.path, Buffer.concat([PAYLOAD, Buffer.from('X')]));
let threwCorrupt = null;
try { m.verifyDownloaded(release(), dl3); } catch (e) { threwCorrupt = e.message; }
ok(/Empreinte invalide/.test(threwCorrupt || ''), 'fichier altéré après coup : refus', threwCorrupt);

// ── Installation : passage de relais détaché ────────────────────────────────
const dl4 = await m.downloadRelease(release(), { fetchImpl: fakeFetch() });
let spawned = null;
const spawnImpl = (cmd, args) => { spawned = { cmd, args }; return { pid: 4242, unref() {} }; };
const inst = m.launchInstaller(dl4, { spawnImpl, script: join(dir, 'update.ps1') });
ok(inst.launched && spawned.cmd === 'powershell', 'installation déléguée à PowerShell', spawned?.cmd);
ok(spawned.args.includes('-SetupExe') && spawned.args.includes(dl4.path), 'l’installeur téléchargé est bien passé au script');
ok(spawned.args.includes('-WaitForIdle'), 'le script patiente que l’école ne saisisse plus');
ok(m.handoffRestart().by === 'update-notescam.ps1', 'le redémarrage est confié au script');
// Le script est cherché à l'emplacement d'une INSTALLATION comme à celui du dépôt.
ok(/update-notescam.ps1$/.test(m.resolveInstallerScript()), 'le script d’installation est localisé', m.resolveInstallerScript());
ok(existsSync(m.resolveInstallerScript()), 'et il existe bien dans ce dépôt', m.resolveInstallerScript());

// ── Fenêtre de maintenance ──────────────────────────────────────────────────
const at = (h) => new Date(2026, 0, 15, h, 0, 0);
ok(m.inMaintenanceWindow(at(21), '19-05') === true,  '21 h est dans la fenêtre 19-05');
ok(m.inMaintenanceWindow(at(2),  '19-05') === true,  '2 h aussi (la fenêtre enjambe minuit)');
ok(m.inMaintenanceWindow(at(10), '19-05') === false, '10 h : plein temps scolaire, refus');
ok(m.inMaintenanceWindow(at(10), '8-18')  === true,  'fenêtre classique sans passage de minuit');
ok(m.inMaintenanceWindow(at(10), 'nawak') === true,  'réglage illisible : ne bloque pas');

// ── Serveur au repos ────────────────────────────────────────────────────────
ok(m.serverIdle({ dataDir: join(dir, 'vide') }) === true, 'aucun journal WAL : serveur au repos');
mkdirSync(join(dir, 'busy'), { recursive: true });
writeFileSync(join(dir, 'busy', 'notescam.db-wal'), 'x');
ok(m.serverIdle({ dataDir: join(dir, 'busy'), idleMinutes: 15 }) === false,
  'écriture à l’instant : le serveur travaille, on n’installe pas');
ok(m.serverIdle({ dataDir: join(dir, 'busy'), idleMinutes: 15, now: Date.now() + 20 * 60 * 1000 }) === true,
  '20 min sans écriture : au repos');

// ── Décision automatique : chaque refus a son motif ─────────────────────────
const edgeAvail = async ({ version }) => ({ available: version !== '9.9.9', latest: { version: '9.9.9', mandatory: false, notes: 't' } });
const edgeNone  = async () => ({ available: false, latest: null });

m.setAutoUpdate(false);
ok((await m.autoUpdateTick({ edge: edgeAvail, spawnImpl: () => ({ pid: 1, unref() {} }) })).reason === 'disabled', 'interrupteur coupé : aucune action');
m.setAutoUpdate(true);
ok(m.autoUpdateEnabled(), 'interrupteur rallumé');

ok((await m.autoUpdateTick({ edge: edgeNone, spawnImpl: () => ({ pid: 1, unref() {} }) })).reason === 'up-to-date', 'déjà à jour : aucune action');

// Désynchronisation Cloud/LAN : la garde de parité prime sur tout le reste.
writeFileSync(join(DATA_DIR, 'server-token.key'), 'seal');
setSetting('cloud_sync', '1');
markVerification({ ok: false, at: new Date().toISOString(), mismatches: ['grades'] });
const desync = await m.autoUpdateTick({ edge: edgeAvail, spawnImpl: () => ({ pid: 1, unref() {} }) });
ok(desync.reason === 'parity' && desync.acted === false,
  'désynchro : on ne remplace PAS le binaire tant que les notes ne sont pas remontées', desync);

// Parité rétablie, mais en plein cours → on attend la fenêtre.
markVerification({ ok: true, at: new Date().toISOString(), mismatches: [] });
setSetting('auto_update_window', '19-05');
const daytime = await m.autoUpdateTick({ edge: edgeAvail, now: at(10).getTime(), spawnImpl: () => ({ pid: 1, unref() {} }) });
ok(daytime.reason === 'outside-window', 'en journée : reporté à la fenêtre de maintenance', daytime);

// Édition Linux : rien n'est branché (l'installation passe par le script Windows).
// Sans cette garde, chaque contrôle téléchargerait un installeur pour rien.
ok((await m.autoUpdateTick({ edge: edgeAvail })).reason === 'platform' || process.platform === 'win32',
  'hors Windows : aucune tentative d’installation');
ok(m.registerUpdateHandlers().reason === 'platform' || process.platform === 'win32',
  'hors Windows : les étapes ne sont même pas enregistrées');

// ── Intégration : les 4 étapes enchaînées par applyUpdate ───────────────────
// C'est le test qui dit si la mise à jour est VRAIMENT branchée : avant ce
// module, `applyUpdate` renvoyait `mode:'manual'` avec quatre étapes en attente.
{
  const { applyUpdate } = await import('./updateService.js');
  let launched = null;
  const reg = m.registerUpdateHandlers({
    fetchImpl: fakeFetch(),
    spawnImpl: (cmd, args) => { launched = { cmd, args }; return { pid: 1, unref() {} }; },
    script: join(dir, 'update.ps1'),
  });
  ok(reg.registered === true, 'les quatre étapes sont enregistrées');

  // Manifeste COMPLET, tel que le renvoie l’edge check-update en production.
  const edgeFull = async () => ({ available: true, latest: release() });
  const res = await applyUpdate({ edge: edgeFull });
  ok(res.ok === true && res.mode === 'auto', 'applyUpdate passe en mode AUTO (plus « manual »)', res.mode);
  ok(res.to === '9.9.9' && res.from !== '9.9.9', 'la version cible est celle publiée', { from: res.from, to: res.to });
  ok(['download', 'verifySignature', 'install', 'restart'].every((s) => res.steps[s]?.ok === true),
    'les quatre étapes ont réussi', res.steps);
  ok(res.steps.verifySignature.result.signature === 'ok', 'la signature a bien été vérifiée avant l’installation');
  ok(launched && launched.cmd === 'powershell', 'l’installeur a été lancé', launched?.cmd);

  // Publication SIGNÉE POUR UNE AUTRE VERSION : la chaîne doit casser à l'étape
  // de vérification, et l'installeur ne doit JAMAIS être lancé.
  launched = null;
  const edgeForged = async () => ({ available: true, latest: {
    version: '9.9.9', url: 'https://cdn.test/x.exe', sha256: SHA, signature: signFor('6.6.6', SHA),
  } });
  const bad = await applyUpdate({ edge: edgeForged });
  ok(bad.ok === false && bad.steps.verifySignature.ok === false,
    'publication mal signée : la chaîne casse à la vérification', bad.steps?.verifySignature);
  ok(launched === null, 'AUCUN installeur lancé quand la signature est refusée');
  ok(bad.steps.install === undefined, 'l’étape d’installation n’est même pas atteinte');
}

console.log(`\n=== ${fail === 0 ? 'OK' : 'ÉCHEC'} : ${pass} ok, ${fail} ko ===`);
process.exit(fail === 0 ? 0 : 1);
