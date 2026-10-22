// Test — DESCENTE de `school_users` quand le compte `users` référencé n'existe pas
// localement (server/cloudSync.adaptRemoteRow + authBridge.applyCredential).
//
// Incident terrain (école GENIUS, 0.3.14) : « [sync] upsert school_users ignoré:
// FOREIGN KEY constraint failed », répété à chaque cycle, indéfiniment. `users`
// n'est jamais répliqué — les identifiants passent par le canal chiffré de
// credentials — mais `school_users.user_id` porte une FK vers `users(id)` et le
// Cloud y met SON identifiant. Deux cas, tous deux vérifiés ici.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.NOTESCAM_DATA_DIR = mkdtempSync(join(tmpdir(), 'nc-sufk-'));
process.env.VITE_SUPABASE_URL = 'https://test.supabase.co';

const { db } = await import('./db.js');
const { adaptRemoteRow } = await import('./cloudSync.js');
const { hashPassword, verifyPassword } = await import('./security.js');

let pass = 0, fail = 0;
const ok = (c, label, got) => { if (c) { console.log(`✅ ${label}`); pass++; } else { console.log(`❌ ${label} (obtenu: ${JSON.stringify(got)})`); fail++; } };

db.prepare('INSERT INTO schools (id, name) VALUES (?,?)').run('sch1', 'GENIUS');

// ── CAS 1 : école migrée — le compte existe en LOCAL sous un id local, le Cloud
//    référence son id cloud. La montée remappait local→cloud ; rien ne faisait
//    l'inverse à la descente. ────────────────────────────────────────────────────
db.prepare('INSERT INTO users (id, email, password_hash, cloud_user_id) VALUES (?,?,?,?)')
  .run('local-123', 'raf@thegenius.cm', hashPassword('motdepasse'), 'cloud-abc');
{
  const distant = { id: 'm1', school_id: 'sch1', user_id: 'cloud-abc', role: 'censeur', full_name: 'RAF' };
  const adapte = adaptRemoteRow('school_users', distant);
  ok(adapte.user_id === 'local-123', 'C1 : user_id cloud remappé vers l\'id LOCAL', adapte.user_id);
  db.prepare('INSERT INTO school_users (id, school_id, user_id, role, full_name) VALUES (?,?,?,?,?)')
    .run(adapte.id, adapte.school_id, adapte.user_id, adapte.role, adapte.full_name);
  ok(!!db.prepare("SELECT 1 FROM school_users WHERE id='m1'").get(), 'C1 : l\'appartenance s\'applique (plus de FK en échec)', null);
  ok(db.prepare("SELECT count(*) n FROM users").get().n === 1, 'C1 : aucun compte parasite créé', db.prepare('SELECT count(*) n FROM users').get().n);
}

// ── CAS 2 : membre créé au Cloud dont le mot de passe n'a JAMAIS été défini.
//    Aucune ligne credential_outbox → aucun compte local → FK en échec perpétuel. ─
{
  const distant = { id: 'm2', school_id: 'sch1', user_id: 'cloud-xyz', role: 'surveillant', full_name: 'Surveillant Primaire' };
  const adapte = adaptRemoteRow('school_users', distant);
  ok(adapte.user_id === 'cloud-xyz', 'C2 : user_id conservé (compte matérialisé sous cet id)', adapte.user_id);
  const u = db.prepare("SELECT * FROM users WHERE id='cloud-xyz'").get();
  ok(!!u, 'C2 : compte EN ATTENTE créé', null);
  ok(verifyPassword('', u.password_hash) === false && verifyPassword('motdepasse', u.password_hash) === false,
     'C2 : AUCUN mot de passe ne permet de se connecter', u.password_hash);
  db.prepare('INSERT INTO school_users (id, school_id, user_id, role, full_name) VALUES (?,?,?,?,?)')
    .run(adapte.id, adapte.school_id, adapte.user_id, adapte.role, adapte.full_name);
  ok(!!db.prepare("SELECT 1 FROM school_users WHERE id='m2'").get(), 'C2 : l\'appartenance s\'applique, le rôle descend', null);
  ok(db.prepare("SELECT role FROM school_users WHERE id='m2'").get().role === 'surveillant', 'C2 : rôle correct', null);
}

// ── CAS 2b : la credential finit par arriver → le compte en attente est COMPLÉTÉ
//    (vraie adresse + mot de passe), sinon la personne n'aurait jamais pu se
//    connecter : elle aurait dû saisir l'adresse de remplacement.
{
  const { publicEncrypt, constants } = await import('node:crypto');
  const { applyCloudCredentials, credentialPublicKey } = await import('./authBridge.js');

  const avant = db.prepare("SELECT email FROM users WHERE id='cloud-xyz'").get().email;
  ok(/@en-attente\.local$/.test(avant), 'C2b : adresse de remplacement avant la credential', avant);

  const chiffre = publicEncrypt(
    { key: credentialPublicKey(), padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
    Buffer.from('MotDePasseReel!'),
  ).toString('base64');

  const ligne = { id: 'co1', school_id: 'sch1', cloud_user_id: 'cloud-xyz',
    email: 'surveillant.primaire@thegenius.cm', ciphertext: chiffre };
  let acquitte = null;
  const supa = { from: () => ({
    select: () => ({ eq: () => ({ is: () => ({ data: [ligne], error: null }) }) }),
    update: () => ({ eq: (_c, id) => { acquitte = id; return { data: null, error: null }; } }),
  }) };

  const r = await applyCloudCredentials(supa, 'sch1', hashPassword);
  const u = db.prepare("SELECT * FROM users WHERE id='cloud-xyz'").get();
  ok(r.applied === 1, 'C2b : credential appliquée', r);
  ok(u.email === 'surveillant.primaire@thegenius.cm', 'C2b : VRAIE adresse substituée au marqueur', u.email);
  ok(verifyPassword('MotDePasseReel!', u.password_hash) === true, 'C2b : la personne peut enfin se connecter', null);
  ok(acquitte === 'co1', 'C2b : ligne acquittée au Cloud', acquitte);
  ok(!!db.prepare("SELECT 1 FROM school_users WHERE id='m2'").get(), 'C2b : son appartenance est toujours là', null);
}

// ── CAS 3 : l'adresse est déjà prise par un AUTRE compte → on n'y touche pas.
//    `users.email` est UNIQUE : un UPDATE aveugle échouerait et ferait perdre le
//    mot de passe tout juste reçu.
{
  const { publicEncrypt, constants } = await import('node:crypto');
  const { applyCloudCredentials, credentialPublicKey } = await import('./authBridge.js');
  db.prepare('INSERT INTO users (id, email, password_hash) VALUES (?,?,?)')
    .run('autre-local', 'autre@thegenius.cm', hashPassword('x'));
  const adapte = adaptRemoteRow('school_users', { id: 'm3', school_id: 'sch1', user_id: 'cloud-dbl', role: 'admin' });
  ok(adapte.user_id === 'cloud-dbl', 'C3 : compte en attente créé pour le 3e membre', adapte.user_id);

  const chiffre = publicEncrypt(
    { key: credentialPublicKey(), padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
    Buffer.from('Autre!'),
  ).toString('base64');
  const supa = { from: () => ({
    select: () => ({ eq: () => ({ is: () => ({ data: [{ id: 'co2', school_id: 'sch1', cloud_user_id: 'cloud-dbl', email: 'autre@thegenius.cm', ciphertext: chiffre }], error: null }) }) }),
    update: () => ({ eq: () => ({ data: null, error: null }) }),
  }) };
  await applyCloudCredentials(supa, 'sch1', hashPassword);
  const u = db.prepare("SELECT * FROM users WHERE id='cloud-dbl'").get();
  ok(/@en-attente\.local$/.test(u.email), 'C3 : adresse NON écrasée (déjà prise ailleurs)', u.email);
  ok(verifyPassword('Autre!', u.password_hash) === true, 'C3 : le mot de passe est tout de même appliqué', null);
  ok(db.prepare("SELECT count(*) n FROM users WHERE email='autre@thegenius.cm'").get().n === 1, "C3 : pas de doublon d'adresse", null);
}

// ── CAS 4 : ALLER-RETOUR. Une ligne remappée à la descente doit repartir au Cloud
//    avec l'identifiant CLOUD. Sans cela on réparait la FK locale en cassant celle
//    du Cloud (`school_users.user_id` → `auth.users`) à la première modification.
{
  const { adaptLocalRow } = await import('./cloudSync.js');
  const descendue = adaptRemoteRow('school_users', { id: 'm1', school_id: 'sch1', user_id: 'cloud-abc', role: 'censeur' });
  ok(descendue.user_id === 'local-123', 'C4 : descente → id local', descendue.user_id);
  const remontee = adaptLocalRow('school_users', descendue);
  ok(remontee.user_id === 'cloud-abc', 'C4 : remontée → id cloud (aller-retour stable)', remontee.user_id);

  // Membre créé EN LOCAL après l'appairage : même traduction attendue.
  const localePure = adaptLocalRow('school_users', { id: 'm9', school_id: 'sch1', user_id: 'local-123', role: 'admin' });
  ok(localePure.user_id === 'cloud-abc', 'C4 : membre créé en local poussé avec son id cloud', localePure.user_id);

  // Compte en attente : aucun id cloud distinct, rien à traduire.
  const attente = adaptLocalRow('school_users', { id: 'm2', school_id: 'sch1', user_id: 'cloud-xyz', role: 'surveillant' });
  ok(attente.user_id === 'cloud-xyz', 'C4 : compte en attente inchangé', attente.user_id);

  // Les autres tables ne sont pas touchées.
  const autre = adaptLocalRow('grades', { id: 'g1', user_id: 'local-123' });
  ok(autre.user_id === 'local-123', 'C4 : aucune autre table remappée', autre.user_id);
}

console.log(`\n=== ${pass} ok, ${fail} ko ===`);
process.exit(fail ? 1 : 0);
