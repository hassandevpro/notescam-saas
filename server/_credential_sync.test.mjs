// Test bout-en-bout — pont d'identifiants, sens CLOUD → LOCAL.
//
// Couvre la chaîne complète telle qu'elle tourne en production :
//   compte cloud → credential_outbox (chiffré RSA) → credentials-pull (jeton
//   scellé) → provisionnement du compte local (scrypt) → CONNEXION LOCALE.
//
// Sans réseau : les fonctions edge sont stubbées (global.fetch) et le cloud est
// un jeu de données en mémoire. La connexion locale, elle, est vérifiée sur le
// VRAI serveur Fastify démarré en sous-processus (motif de _http_e2e.test.mjs) —
// pas sur une réimplémentation de la route.
//
// Exigences couvertes : 1 création · 2 changement · 3 pas de duplication ·
// 4 idempotence · 5 cloisonnement par école · 6 aucun secret en clair ·
// 7 non-régression du sens Local → Cloud.
import { mkdtempSync, rmSync, writeFileSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { publicEncrypt, constants } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'nc-cred-'));
process.env.NOTESCAM_DATA_DIR = dir;
process.env.VITE_SUPABASE_URL = 'https://test.supabase.co'; // EDGE_BASE lu au chargement
process.env.NOTESCAM_LICENSE_ENABLED = '0';

// Jeton scellé de CE serveur : sans lui, syncCloudCredentials ne tire rien.
writeFileSync(join(dir, 'server-token.key'), 'TESTTOKEN');

const ECOLE      = 'sch-genius';
const ECOLE_TIERS = 'sch-autre';

// Mots de passe distinctifs : recherchés tels quels dans les logs, les réponses
// et les fichiers à l'exigence 6.
const P_NOUVEAU  = 'MotDePasseCloud1!';
const P_CHANGE   = 'NouveauMotDePasse2#';
const P_LOCAL    = 'DejaLocal3@';
const P_ETRANGER = 'MotDePasseEtranger4$';
const P_MASSE1   = 'RemiseEnService5!';
const P_MASSE2   = 'RemiseEnService6#';
const P_MASSE3   = 'RemiseEnService7@';
const TOUS_LES_SECRETS = [P_NOUVEAU, P_CHANGE, P_LOCAL, P_ETRANGER, P_MASSE1, P_MASSE2, P_MASSE3];

// --- Capture des logs (exigence 6) ------------------------------------
let logs = '';
for (const niveau of ['log', 'warn', 'error']) {
  const brut = console[niveau].bind(console);
  console[niveau] = (...a) => { logs += a.map(String).join(' ') + '\n'; brut(...a); };
}

// --- Cloud en mémoire + stub des fonctions edge -----------------------
const CLOUD = { outbox: [] };
const setPasswordCalls = [];
let pullCalls = 0, ackCalls = 0;
// Quand true, l'edge renvoie AUSSI les lignes d'une autre école : simule un
// cloud compromis ou bogué, pour éprouver le garde-fou LOCAL (exigence 5b).
let edgeFuite = false;

// Seules les fonctions edge sont simulées : tout le reste (les appels HTTP du
// test vers le vrai serveur local, plus bas) passe par le fetch natif.
const vraiFetch = global.fetch;
global.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (!u.startsWith('https://test.supabase.co')) return vraiFetch(url, opts);
  const body = opts.body ? JSON.parse(opts.body) : {};

  if (u.endsWith('/credentials-pull')) {
    if (Array.isArray(body.ack)) {
      ackCalls++;
      let acked = 0;
      for (const id of body.ack) {
        // Fidèle à l'edge réelle : l'acquittement est borné à l'école du jeton.
        const row = CLOUD.outbox.find((r) => r.id === id && r.school_id === ECOLE && !r.applied_at);
        if (row) { row.applied_at = new Date().toISOString(); acked++; }
      }
      return { ok: true, status: 200, json: async () => ({ acked }) };
    }
    pullCalls++;
    const rows = CLOUD.outbox.filter((r) => !r.applied_at && (edgeFuite || r.school_id === ECOLE));
    return { ok: true, status: 200, json: async () => ({ rows }) };
  }
  if (u.endsWith('/publish-server-key')) return { ok: true, status: 200, json: async () => ({ ok: true }) };
  if (u.endsWith('/set-password')) {
    setPasswordCalls.push({ auth: opts.headers?.Authorization, body });
    return { ok: true, status: 200, json: async () => ({ ok: true }) };
  }
  throw new Error('fetch inattendu: ' + u);
};

// --- Modules (après env + stubs) --------------------------------------
const { credentialPublicKey, syncCloudCredentials, mirrorToCloud } = await import('./authBridge.js');
const { db } = await import('./db.js');
const { hashPassword, verifyPassword } = await import('./security.js');

let pass = 0, fail = 0;
const ok = (c, label, got) => {
  if (c) { console.log(`✅ ${label}`); pass++; }
  else { console.log(`❌ ${label} (obtenu: ${JSON.stringify(got)})`); fail++; }
};
const nbUsers = () => db.prepare('SELECT COUNT(*) n FROM users').get().n;
const userPar = (email) => db.prepare('SELECT * FROM users WHERE email = ?').get(email);

// Dépose une credential chiffrée dans l'outbox cloud, comme le fait l'app.
const PUB = credentialPublicKey();
let seq = 0;
function deposer({ school = ECOLE, cloudUserId, email, plain }) {
  const row = {
    id: `ob${++seq}`, school_id: school, cloud_user_id: cloudUserId, email,
    ciphertext: publicEncrypt(
      { key: PUB, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
      Buffer.from(plain),
    ).toString('base64'),
    applied_at: null,
  };
  CLOUD.outbox.push(row);
  return row;
}

// --- Fixture : l'école et ses appartenances, telles que l'appairage les laisse.
// La synchro descend school_users mais JAMAIS users : les FK pendent (le pull
// initial tourne FK OFF), et aucun membre ne peut se connecter. C'est
// exactement l'état constaté chez THE GENIUS.
db.exec('PRAGMA foreign_keys = OFF');
db.prepare("INSERT INTO schools (id, name) VALUES (?,?)").run(ECOLE, 'THE GENIUS');
db.prepare("INSERT INTO school_users (id, school_id, user_id, role, full_name, active) VALUES (?,?,?,?,?,1)")
  .run('su-raf', ECOLE, 'cloud-raf', 'censeur', 'Responsable Administratif et Financier');
db.prepare("INSERT INTO school_users (id, school_id, user_id, role, full_name, active) VALUES (?,?,?,?,?,1)")
  .run('su-principal', ECOLE, 'cloud-principal', 'censeur', 'Principal');
db.exec('PRAGMA foreign_keys = ON');

ok(db.prepare('PRAGMA foreign_key_check').all().length === 2,
  'état de départ : appartenances synchronisées SANS compte local (FK pendantes)');
ok(nbUsers() === 0, 'état de départ : aucun identifiant de connexion locale', nbUsers());

// ============ TEST 1 : nouveau compte cloud → compte local créé ============
deposer({ cloudUserId: 'cloud-raf', email: 'raf@thegenius.cm', plain: P_NOUVEAU });
let r = await syncCloudCredentials(hashPassword);

ok(r.created === 1 && r.applied === 1, 'nouveau compte cloud : compte local CRÉÉ', r);
const raf = userPar('raf@thegenius.cm');
ok(!!raf, 'compte local présent avec le bon e-mail');
ok(raf && verifyPassword(P_NOUVEAU, raf.password_hash), 'mot de passe cloud ouvre en LOCAL (scrypt)');
ok(raf && raf.cloud_user_id === 'cloud-raf', 'cloud_user_id conservé (pont Local → Cloud)', raf?.cloud_user_id);
ok(raf && raf.id === 'cloud-raf', "l'id local reprend l'id cloud", raf?.id);
ok(db.prepare('PRAGMA foreign_key_check').all().length === 1,
  'la FK school_users → users est résolue : le membre récupère son rôle');
const role = db.prepare('SELECT role FROM school_users WHERE user_id = ?').get('cloud-raf')?.role;
ok(role === 'censeur', 'rôle du membre correctement rattaché au compte créé', role);
ok(CLOUD.outbox[0].applied_at != null, 'ligne outbox acquittée côté cloud');

// ============ TEST 2 : changement de mot de passe d'un compte existant ====
deposer({ cloudUserId: 'cloud-raf', email: 'raf@thegenius.cm', plain: P_CHANGE });
const avant = nbUsers();
r = await syncCloudCredentials(hashPassword);
const raf2 = userPar('raf@thegenius.cm');

ok(r.updated === 1 && r.created === 0, 'compte existant : MISE À JOUR, pas de création', r);
ok(verifyPassword(P_CHANGE, raf2.password_hash), 'le NOUVEAU mot de passe ouvre en local');
ok(!verifyPassword(P_NOUVEAU, raf2.password_hash), "l'ancien mot de passe ne fonctionne plus");
ok(nbUsers() === avant, 'aucun compte supplémentaire créé', nbUsers());

// ============ TEST 3 : compte déjà présent en local → pas de duplication ==
// Cas d'un compte créé localement AVANT l'appairage : même e-mail, pas encore
// rattaché au cloud. Le pont doit le mettre à jour et l'adopter, pas le doubler.
db.prepare('INSERT INTO users (id, email, password_hash, full_name) VALUES (?,?,?,?)')
  .run('local-legacy', 'principal@thegenius.cm', hashPassword('ancienlocal'), 'Principal');
const avant3 = nbUsers();
deposer({ cloudUserId: 'cloud-principal', email: 'principal@thegenius.cm', plain: P_LOCAL });
r = await syncCloudCredentials(hashPassword);
const principal = userPar('principal@thegenius.cm');

ok(nbUsers() === avant3, 'compte local préexistant : AUCUNE duplication', nbUsers());
ok(db.prepare('SELECT COUNT(*) n FROM users WHERE email = ?').get('principal@thegenius.cm').n === 1,
  'un seul compte pour cet e-mail');
ok(verifyPassword(P_LOCAL, principal.password_hash), 'credential mise à jour sur le compte existant');
ok(principal.cloud_user_id === 'cloud-principal', 'compte local antérieur adopté par le cloud', principal.cloud_user_id);
ok(principal.id === 'local-legacy', "l'identifiant local existant est préservé", principal.id);

// ============ TEST 4 : même événement traité deux fois → idempotent =======
const ligne = deposer({ cloudUserId: 'cloud-raf', email: 'raf@thegenius.cm', plain: P_CHANGE });
const avant4 = nbUsers();
const r1 = await syncCloudCredentials(hashPassword);
ligne.applied_at = null;                       // acquittement perdu (réseau coupé)
const r2 = await syncCloudCredentials(hashPassword);

ok(r1.applied === 1 && r2.applied === 1, 'ligne rejouée : retraitée sans erreur', { r1, r2 });
ok(nbUsers() === avant4, 'rejeu : aucun doublon de compte', nbUsers());
ok(verifyPassword(P_CHANGE, userPar('raf@thegenius.cm').password_hash),
  'rejeu : état final identique (idempotent)');
ok(db.prepare('SELECT COUNT(*) n FROM users WHERE cloud_user_id = ?').get('cloud-raf').n === 1,
  'un seul compte local pour ce compte cloud');

// ============ TEST 5 : cloisonnement par école ===========================
// 5a — la ligne d'une AUTRE école ne doit jamais être servie par l'edge.
const avant5 = nbUsers();
deposer({ school: ECOLE_TIERS, cloudUserId: 'cloud-intrus', email: 'intrus@autre.cm', plain: P_ETRANGER });
r = await syncCloudCredentials(hashPassword);
ok(nbUsers() === avant5, "école tierce : aucun compte créé sur ce serveur (filtre du jeton)", nbUsers());
ok(!userPar('intrus@autre.cm'), 'aucun compte pour un membre d’une autre école');

// 5b — défense en profondeur : même si le cloud renvoie la ligne à tort, le
// garde-fou local la rejette.
edgeFuite = true;
r = await syncCloudCredentials(hashPassword);
edgeFuite = false;
ok(nbUsers() === avant5, 'cloud fuyant : le garde-fou LOCAL refuse la ligne étrangère', nbUsers());
ok(!userPar('intrus@autre.cm'), 'toujours aucun compte étranger après fuite simulée');
ok(r.skipped >= 1, 'la ligne étrangère est comptée comme ignorée', r);
ok(CLOUD.outbox.find((x) => x.school_id === ECOLE_TIERS).applied_at == null,
  "la ligne d'une autre école n'est jamais acquittée par ce serveur");

// ============ TEST 5-bis : PROVISIONNEMENT DE MASSE ======================
// Cas de la remise en service des comptes d'une école : PLUSIEURS credentials
// arrivent dans le MÊME tirage. Le serveur doit créer chaque compte, sans
// doublon, sans mélanger les mots de passe, et résoudre chaque FK pendante.
db.exec('PRAGMA foreign_keys = OFF');
for (const [su, uid, nom] of [
  ['su-caisse', 'cloud-caisse', 'Comptable / Caissier'],
  ['su-cens',   'cloud-cens',   'Censeur'],
  ['su-surv',   'cloud-surv',   'Surveillant Général'],
]) {
  db.prepare(`INSERT INTO school_users (id, school_id, user_id, role, full_name, active)
              VALUES (?,?,?,?,?,1)`).run(su, ECOLE, uid, 'censeur', nom);
}
db.exec('PRAGMA foreign_keys = ON');

const fkAvant    = db.prepare('PRAGMA foreign_key_check').all().length;
const usersAvant = nbUsers();
deposer({ cloudUserId: 'cloud-caisse', email: 'caisse@thegenius.cm',      plain: P_MASSE1 });
deposer({ cloudUserId: 'cloud-cens',   email: 'censeur@thegenius.cm',     plain: P_MASSE2 });
deposer({ cloudUserId: 'cloud-surv',   email: 'surveillant@thegenius.cm', plain: P_MASSE3 });

const masse = await syncCloudCredentials(hashPassword);
const fkApres = db.prepare('PRAGMA foreign_key_check').all().length;

ok(masse.created === 3 && masse.applied === 3, '3 comptes provisionnés en UN SEUL tirage', masse);
ok(nbUsers() === usersAvant + 3, 'exactement 3 comptes ajoutés — aucun doublon', nbUsers());
ok(fkApres === fkAvant - 3, '3 FK pendantes résolues d’un coup', { fkAvant, fkApres });
ok(verifyPassword(P_MASSE1, userPar('caisse@thegenius.cm').password_hash)
  && verifyPassword(P_MASSE2, userPar('censeur@thegenius.cm').password_hash)
  && verifyPassword(P_MASSE3, userPar('surveillant@thegenius.cm').password_hash),
  'chaque compte reçoit SON mot de passe (aucun mélange entre lignes)');
ok(db.prepare('SELECT COUNT(*) n FROM users').get().n
  === db.prepare('SELECT COUNT(DISTINCT email) n FROM users').get().n, 'aucun e-mail dupliqué en base');
for (const uid of ['cloud-caisse', 'cloud-cens', 'cloud-surv']) {
  const r = db.prepare('SELECT role FROM school_users WHERE user_id = ?').get(uid);
  const u = db.prepare('SELECT id FROM users WHERE id = ?').get(uid);
  ok(!!r && !!u, `rattachement résolu pour ${uid} (le membre récupère son rôle)`);
}

// Rejeu du LOT ENTIER (acquittement perdu au milieu d'une opération de masse).
for (const r of CLOUD.outbox) if (r.school_id === ECOLE) r.applied_at = null;
await syncCloudCredentials(hashPassword);
ok(nbUsers() === usersAvant + 3, 'rejeu du lot entier : toujours aucun doublon', nbUsers());
ok(db.prepare('PRAGMA foreign_key_check').all().length === fkApres,
  'rejeu du lot entier : aucune FK cassée', db.prepare('PRAGMA foreign_key_check').all().length);

// ============ TEST 7 (partie 1) : Local → Cloud intact ===================
setPasswordCalls.length = 0;
const mres = await mirrorToCloud('cloud-raf', 'raf@thegenius.cm', 'retourAuCloud5!');
ok(setPasswordCalls.some((c) => c.body.cloud_user_id === 'cloud-raf' && c.body.password === 'retourAuCloud5!'),
  'sens Local → Cloud toujours fonctionnel (set-password appelé)', mres);
ok(setPasswordCalls[0]?.auth === 'Bearer TESTTOKEN', 'toujours authentifié par le jeton scellé');

// ============ CONNEXION LOCALE RÉELLE (exigences 1 et 2) =================
// On arrête d'écrire en base, puis on démarre le VRAI serveur sur ces données.
db.close();

const PORT = 8137;
const BASE = `http://127.0.0.1:${PORT}`;
const srv = spawn(process.execPath, [join(__dirname, 'index.js')], {
  env: { ...process.env, NOTESCAM_DATA_DIR: dir, PORT: String(PORT), HOST: '127.0.0.1', NOTESCAM_LICENSE_ENABLED: '0' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let srvLog = '';
srv.stdout.on('data', (d) => { srvLog += d; });
srv.stderr.on('data', (d) => { srvLog += d; });

async function pret(ms = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { const r = await fetch(`${BASE}/api/license`); if (r.ok) return true; } catch { /* pas encore */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('serveur non prêt — log:\n' + srvLog.slice(-1500));
}
const login = (email, password) => fetch(`${BASE}/api/auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
}).then(async (r) => ({ status: r.status, texte: await r.text() }));

let reponses = '';
try {
  await pret();

  const bon = await login('raf@thegenius.cm', P_CHANGE);
  reponses += bon.texte;
  ok(bon.status === 200, 'CONNEXION LOCALE RAF : acceptée par le vrai serveur', bon.status);
  ok(/access_token/.test(bon.texte), 'session locale émise (access_token)');

  const mauvais = await login('raf@thegenius.cm', P_NOUVEAU); // ancien mot de passe
  reponses += mauvais.texte;
  ok(mauvais.status === 401, "l'ancien mot de passe est bien refusé", mauvais.status);

  const p = await login('principal@thegenius.cm', P_LOCAL);
  reponses += p.texte;
  ok(p.status === 200, 'CONNEXION LOCALE Principal : acceptée', p.status);

  const intrus = await login('intrus@autre.cm', P_ETRANGER);
  reponses += intrus.texte;
  ok(intrus.status === 401, "le membre d'une autre école ne peut pas se connecter ici", intrus.status);
} finally {
  // Détacher les flux AVANT de tuer l'enfant : sous Windows, sortir pendant la
  // fermeture des pipes fait planter libuv (UV_HANDLE_CLOSING) et masque le
  // résultat du test derrière un code retour parasite.
  srv.stdout.removeAllListeners('data');
  srv.stderr.removeAllListeners('data');
  srv.kill();
  await new Promise((r) => { srv.on('exit', r); setTimeout(r, 3000); });
}

// ============ TEST 6 : aucun secret en clair =============================
const fuiteDans = (texte) => TOUS_LES_SECRETS.filter((s) => texte.includes(s));

ok(fuiteDans(logs).length === 0, 'aucun mot de passe dans les logs du test', fuiteDans(logs));
ok(fuiteDans(srvLog).length === 0, 'aucun mot de passe dans les logs du serveur', fuiteDans(srvLog));
ok(fuiteDans(reponses).length === 0, 'aucun mot de passe dans les réponses HTTP', fuiteDans(reponses));

const outboxTexte = JSON.stringify(CLOUD.outbox);
ok(fuiteDans(outboxTexte).length === 0, "aucun mot de passe en clair dans l'outbox (RSA-OAEP)", fuiteDans(outboxTexte));

// Tous les fichiers du dossier de données (base, WAL, clés, diagnostics).
const fuitesFichiers = [];
for (const f of readdirSync(dir)) {
  const p = join(dir, f);
  if (!statSync(p).isFile()) continue;
  const brut = readFileSync(p).toString('latin1');
  for (const s of TOUS_LES_SECRETS) if (brut.includes(s)) fuitesFichiers.push(`${f}:${s}`);
}
ok(fuitesFichiers.length === 0, 'aucun mot de passe en clair sur disque (base, WAL, clés)', fuitesFichiers);

ok(pullCalls >= 5 && ackCalls >= 4, 'edge credentials-pull sollicitée en tirage ET en acquittement', { pullCalls, ackCalls });

try { rmSync(dir, { recursive: true, force: true }); } catch { /* verrou Windows résiduel */ }
console.log(`\n=== ${fail === 0 ? 'OK' : 'ÉCHEC'} : ${pass} ok, ${fail} ko ===`);
process.exitCode = fail === 0 ? 0 : 1;
