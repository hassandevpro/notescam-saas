// SAUVEGARDE → VÉRIFICATION → RESTAURATION, SUR COPIE ISOLÉE.
//
//   node server/_backup_restore.test.mjs
//
// CE QUE CE TEST ÉTABLIT, ET QUE PERSONNE NE SAVAIT
// ─────────────────────────────────────────────────
// `server/backup.js` produit 14 copies par `VACUUM INTO`, toutes les deux
// heures. Aucune n'avait jamais été restaurée, et le serveur n'expose AUCUNE
// route de restauration : `POST /api/backup` et `GET /api/backup/list`
// existent, rien d'autre. Une sauvegarde qu'on n'a jamais restaurée est un
// fichier, pas une sauvegarde.
//
// Ce test fait donc la seule chose qui prouve quelque chose : il écrit une
// LIGNE TÉMOIN, sauvegarde, restaure dans un répertoire ISOLÉ, et vérifie que
// la ligne témoin est là — plus l'intégrité SQLite et la présence des fichiers.
//
// SÛRETÉ. Tout se passe dans des répertoires temporaires. Aucune donnée de
// production n'est lue ni écrite, et `restoreArchive` refuse par construction
// d'écrire dans le répertoire de données actif.

import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, statSync, openSync, writeSync, closeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const racine = mkdtempSync(join(tmpdir(), 'nc-restore-'));
process.env.NOTESCAM_DATA_DIR = join(racine, 'data-inactif');
mkdirSync(process.env.NOTESCAM_DATA_DIR, { recursive: true });

const { createArchive, verifyArchive, restoreArchive, readManifest, isSafeEntryPath } =
  await import('./backupArchive.js');
const { inventory, referencesOf, reconcile, storagePathOf, ASSET_BUCKET } =
  await import('./fileInventory.js');

let pass = 0, fail = 0;
const ok = (c, label, got) => {
  if (c) { console.log(`✅ ${label}`); pass++; }
  else { console.log(`❌ ${label}${got === undefined ? '' : ` (obtenu: ${JSON.stringify(got)})`}`); fail++; }
};

// ── Une école jetable : base + fichiers ────────────────────────────────────
const TEMOIN = `TEMOIN-${Date.now()}`;

function fabriquerEcole(nom) {
  const dataDir = join(racine, nom);
  mkdirSync(join(dataDir, 'files', ASSET_BUCKET, 'ecole1', 'students'), { recursive: true });
  const dbPath = join(dataDir, 'notescam.db');
  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE schools  (id TEXT PRIMARY KEY, name TEXT, logo_url TEXT, stamp_url TEXT, signature_url TEXT);
    CREATE TABLE students (id TEXT PRIMARY KEY, school_id TEXT, name TEXT, photo_url TEXT);
    CREATE TABLE grades   (id TEXT PRIMARY KEY, student_id TEXT, sequence INTEGER, value REAL);
  `);
  db.prepare('INSERT INTO schools (id, name, logo_url) VALUES (?,?,?)')
    .run('ecole1', 'The Genius Test', '/files/school-assets/ecole1/logo.png');
  db.prepare('INSERT INTO students (id, school_id, name, photo_url) VALUES (?,?,?,?)')
    .run('e42', 'ecole1', 'Eleve Temoin', 'ecole1/students/e42.jpg');
  // La LIGNE TÉMOIN : une note, exactement la donnée dont la perte a motivé tout ceci.
  db.prepare('INSERT INTO grades (id, student_id, sequence, value) VALUES (?,?,?,?)')
    .run(TEMOIN, 'e42', 1, 17.5);
  for (let i = 0; i < 500; i++) {
    db.prepare('INSERT INTO grades (id, student_id, sequence, value) VALUES (?,?,?,?)')
      .run(`g${i}`, 'e42', 2, i % 20);
  }

  // Les fichiers : une photo référencée, un logo référencé, un orphelin.
  const bucket = join(dataDir, 'files', ASSET_BUCKET);
  writeFileSync(join(bucket, 'ecole1', 'students', 'e42.jpg'), 'PHOTO-ELEVE-42');
  writeFileSync(join(bucket, 'ecole1', 'logo.png'), 'LOGO-ECOLE');
  writeFileSync(join(bucket, 'ecole1', 'orphelin.png'), 'PLUS-REFERENCE');

  return { dataDir, dbPath, db };
}

const source = fabriquerEcole('data-source');

// ── 1. L'inventaire voit les fichiers et les références ───────────────────
{
  const refs = referencesOf(source.db);
  const fichiers = await inventory(source.dataDir + '/files');
  const rapport = reconcile(refs, fichiers);

  ok(refs.length === 2, `2 références de fichiers en base (${refs.length})`, refs.map((r) => r.path));
  ok(fichiers.length === 3, `3 fichiers sur le disque (${fichiers.length})`);
  ok(rapport.counts.missing === 0, 'aucune référence cassée', rapport.missing);
  ok(rapport.counts.orphans === 1, `1 fichier orphelin détecté (${rapport.counts.orphans})`, rapport.orphans);
  ok(rapport.orphans[0] === 'ecole1/orphelin.png', 'et c’est le bon');
  ok(fichiers.every((f) => typeof f.sha256 === 'string' && f.sha256.length === 64),
     'chaque fichier porte son empreinte sha256');
}

// ── 2. Parité de normalisation entre le serveur et le client ──────────────
// `storagePathOf` (serveur) doit rendre le même chemin que `assetPath` (client,
// src/lib/storage.js) pour la même valeur en base. Deux implémentations qui
// divergeraient compteraient des fichiers manquants qui ne manquent pas.
{
  const cas = [
    ['https://x.supabase.co/storage/v1/object/public/school-assets/ecole1/a.jpg', 'ecole1/a.jpg'],
    ['/files/school-assets/ecole1/b.jpg?v=1760000000000', 'ecole1/b.jpg'],
    ['ecole1/students/c.jpg', 'ecole1/students/c.jpg'],
    ['/files/school-assets//d.jpg', 'd.jpg'],
    ['https://exemple.org/logo-distant.png', null],
    ['data:image/png;base64,AAAA', null],
    ['', null],
    [null, null],
  ];
  let tous = true;
  for (const [entree, attendu] of cas) {
    const obtenu = storagePathOf(entree);
    if (obtenu !== attendu) { tous = false; console.log(`   ↳ ${JSON.stringify(entree)} → ${JSON.stringify(obtenu)} au lieu de ${JSON.stringify(attendu)}`); }
  }
  ok(tous, 'la normalisation serveur rend les mêmes chemins que le client');
}

// ── 3. Création de l'archive ──────────────────────────────────────────────
const archive = join(racine, 'sauvegarde.ncbak');
{
  const r = await createArchive({ db: source.db, dataDir: source.dataDir, outPath: archive });
  ok(existsSync(archive), 'l’archive est écrite');
  ok(statSync(archive).size > 0, 'et elle n’est pas vide');
  const { manifest } = readManifest(archive);
  ok(manifest.entries.length >= 4, `le manifeste liste la base + les 3 fichiers (${manifest.entries.length})`);
  ok(manifest.entries.every((e) => isSafeEntryPath(e.path)), 'aucun chemin d’entrée dangereux');
  ok(!!r, 'createArchive renvoie un résultat');
}

// ── 4. Vérification AVANT de restaurer ───────────────────────────────────
// C'est le contrôle qui manque aujourd'hui : savoir si une sauvegarde est
// lisible SANS avoir à la restaurer.
{
  const v = await verifyArchive(archive);
  ok(v.ok === true, 'l’archive est déclarée saine', v.problems);
  ok((v.problems?.length ?? 0) === 0, 'aucun problème relevé');
}

// ── 5. Une archive ABÎMÉE est refusée ────────────────────────────────────
// Une sauvegarde corrompue doit se signaler elle-même. Sans ce contrôle, on ne
// l'apprendrait qu'au moment de s'en servir, c'est-à-dire trop tard.
{
  const abimee = join(racine, 'abimee.ncbak');
  writeFileSync(abimee, readFileSync(archive));
  // On corrompt un octet au milieu de la zone de données.
  const taille = statSync(abimee).size;
  const fd = openSync(abimee, 'r+');
  writeSync(fd, Buffer.from([0x00]), 0, 1, Math.floor(taille * 0.75));
  closeSync(fd);

  const v = await verifyArchive(abimee);
  ok(v.ok === false, 'une archive corrompue est détectée');
  ok(v.problems.length > 0, 'et le problème est décrit', v.problems?.map((p) => p.kind));

  const tronquee = join(racine, 'tronquee.ncbak');
  writeFileSync(tronquee, readFileSync(archive).subarray(0, Math.floor(taille * 0.5)));
  const v2 = await verifyArchive(tronquee);
  ok(v2.ok === false, 'une archive tronquée est détectée');
  ok(v2.problems.some((p) => p.kind === 'truncated'), 'et identifiée comme tronquée', v2.problems?.map((p) => p.kind));

  const pasUneArchive = join(racine, 'autre.txt');
  writeFileSync(pasUneArchive, 'ceci n’est pas une archive NotesCam');
  let leve = null;
  try { readManifest(pasUneArchive); } catch (e) { leve = e; }
  ok(!!leve && /archive NotesCam/i.test(leve.message), 'un fichier étranger est rejeté avec un message clair');
}

// ── 6. RESTAURATION DANS UN RÉPERTOIRE ISOLÉ ─────────────────────────────
const cible = join(racine, 'restaure');
{
  const r = await restoreArchive({
    archivePath: archive,
    targetDir: cible,
    activeDataDir: process.env.NOTESCAM_DATA_DIR,
  });
  ok(!!r, 'la restauration s’exécute');
  ok(existsSync(join(cible, 'notescam.db')), 'la base est restaurée');
  ok(existsSync(join(cible, 'files', ASSET_BUCKET, 'ecole1', 'students', 'e42.jpg')),
     'la photo de l’élève est restaurée');
  ok(existsSync(join(cible, 'files', ASSET_BUCKET, 'ecole1', 'logo.png')), 'le logo est restauré');
}

// ── 7. LA LIGNE TÉMOIN EST LÀ, ET LA BASE EST SAINE ─────────────────────
// La seule preuve qui compte.
{
  const rdb = new DatabaseSync(join(cible, 'notescam.db'), { readOnly: true });

  const integrite = rdb.prepare('PRAGMA integrity_check').get();
  ok(Object.values(integrite)[0] === 'ok', 'PRAGMA integrity_check répond « ok »', integrite);

  const temoin = rdb.prepare('SELECT * FROM grades WHERE id = ?').get(TEMOIN);
  ok(!!temoin, 'LA LIGNE TÉMOIN EST PRÉSENTE dans la base restaurée');
  ok(temoin?.value === 17.5, 'avec sa valeur exacte', temoin?.value);

  const nb = rdb.prepare('SELECT COUNT(*) c FROM grades').get().c;
  ok(nb === 501, `les 501 notes sont là (${nb})`);

  const eleve = rdb.prepare('SELECT * FROM students WHERE id = ?').get('e42');
  ok(eleve?.photo_url === 'ecole1/students/e42.jpg', 'la référence de photo est conservée');

  rdb.close();
}

// ── 8. Les fichiers restaurés sont ceux d'origine, octet pour octet ──────
{
  const photo = readFileSync(join(cible, 'files', ASSET_BUCKET, 'ecole1', 'students', 'e42.jpg'), 'utf8');
  ok(photo === 'PHOTO-ELEVE-42', 'le contenu de la photo est identique');

  const invSource = await inventory(join(source.dataDir, 'files'));
  const invRestaure = await inventory(join(cible, 'files'));
  ok(invSource.length === invRestaure.length, `même nombre de fichiers (${invSource.length} / ${invRestaure.length})`);
  const empreintes = (inv) => inv.map((f) => `${f.path}:${f.sha256}`).sort().join('|');
  ok(empreintes(invSource) === empreintes(invRestaure),
     'MÊMES chemins et MÊMES empreintes sha256 de part et d’autre');
}

// ── 9. La base restaurée n'a aucune référence cassée ────────────────────
// Une restauration qui rendrait la base sans les fichiers produirait des photos
// cassées partout — c'est précisément ce que fait la sauvegarde actuelle, qui
// ne prend que la base.
{
  const rdb = new DatabaseSync(join(cible, 'notescam.db'), { readOnly: true });
  const rapport = reconcile(referencesOf(rdb), await inventory(join(cible, 'files')));
  ok(rapport.counts.missing === 0, 'aucune photo, logo ou signature manquant après restauration', rapport.missing);
  rdb.close();
}

// ── 10. SÛRETÉ : on ne restaure pas sur le répertoire ACTIF ─────────────
{
  let leve = null;
  try {
    await restoreArchive({
      archivePath: archive,
      targetDir: process.env.NOTESCAM_DATA_DIR,
      activeDataDir: process.env.NOTESCAM_DATA_DIR,
    });
  } catch (e) { leve = e; }
  ok(!!leve, 'restaurer sur le répertoire de données ACTIF est REFUSÉ');
  ok(/isol|actif/i.test(leve?.message || ''), 'avec un message qui dit pourquoi', leve?.message);
  ok(!existsSync(join(process.env.NOTESCAM_DATA_DIR, 'notescam.db')),
     'et rien n’a été écrit dans le répertoire actif');
}

// ── 11. Un chemin d'entrée piégé ne sort pas de la cible ───────────────
{
  const pieges = ['../evade.txt', '/etc/passwd', 'C:\\Windows\\x.txt', 'a/../../b', 'a//b', '..\\x'];
  ok(pieges.every((p) => !isSafeEntryPath(p)), 'tous les chemins piégés sont refusés',
     pieges.filter((p) => isSafeEntryPath(p)));
  ok(isSafeEntryPath('ecole1/students/e42.jpg'), 'et un chemin normal reste accepté');
}

source.db.close();
try { rmSync(racine, { recursive: true, force: true }); } catch { /* verrou Windows */ }

console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} réussis, ${fail} échoués`);
process.exit(fail === 0 ? 0 : 1);
