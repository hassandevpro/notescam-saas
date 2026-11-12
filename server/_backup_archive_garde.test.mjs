// GARDES DE L'ARCHIVE COMPLÈTE (.ncbak) : ce qui ne doit JAMAIS arriver à une école qui restaure.
//   node server/_backup_archive_garde.test.mjs
// Tout se passe dans un dossier temporaire ; aucune donnée réelle n'est lue.

import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, cpSync, truncateSync, statSync, openSync, writeSync, closeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const racine = mkdtempSync(join(tmpdir(), 'nc-garde-'));
process.env.NOTESCAM_DATA_DIR = join(racine, 'data-inactif');
mkdirSync(process.env.NOTESCAM_DATA_DIR, { recursive: true });
const { createArchive, restoreArchive, readManifest } = await import('./backupArchive.js');

let pass = 0, fail = 0;
const ok = (c, l, got) => { if (c) { console.log(`✅ ${l}`); pass++; } else { console.log(`❌ ${l}${got === undefined ? '' : ` (obtenu: ${JSON.stringify(got)})`}`); fail++; } };

const dataDir = join(racine, 'src');
mkdirSync(join(dataDir, 'files', 'school-assets', 'e1'), { recursive: true });
writeFileSync(join(dataDir, 'files', 'school-assets', 'e1', 'logo.png'), 'LOGO');
const db = new DatabaseSync(join(dataDir, 'notescam.db'));
db.exec(`CREATE TABLE schools (id TEXT PRIMARY KEY, name TEXT); CREATE TABLE students (id TEXT PRIMARY KEY, school_id TEXT, name TEXT);`);
db.prepare('INSERT INTO schools VALUES (?,?)').run('e1', "École de l'Été 学校");
db.prepare('INSERT INTO students VALUES (?,?,?)').run('s1', 'e1', "N'GUESSAN Ève");
const arch = join(racine, 'a.ncbak');
await createArchive({ db, dataDir, outPath: arch, appVersion: '0.3.33', actor: 'u1' });

const { manifest } = readManifest(arch);
ok(manifest.appVersion === '0.3.33' && manifest.createdBy === 'u1', 'le manifeste porte la version de l’app et l’auteur');
ok(manifest.school?.name === "École de l'Été 学校" && manifest.counts.students === 1, 'le manifeste porte un résumé lisible (école, effectifs)', manifest.counts);

// cible non vide : refus net, rien d'écrit
const pleine = join(racine, 'pleine'); mkdirSync(pleine); writeFileSync(join(pleine, 'ANCIEN.txt'), 'x');
let code = null; try { await restoreArchive({ archivePath: arch, targetDir: pleine }); } catch (e) { code = e.code; }
ok(code === 'TARGET_NOT_EMPTY', 'cible non vide : restauration refusée sans accord explicite', code);
ok(readFileSync(join(pleine, 'ANCIEN.txt'), 'utf8') === 'x', 'et l’ancien contenu est intact');
const r = await restoreArchive({ archivePath: arch, targetDir: pleine, replaceExisting: true });
ok(r.ok && !!r.previous && existsSync(join(r.previous, 'ANCIEN.txt')), 'avec accord explicite : remplacé, ancien contenu MIS DE CÔTÉ (pas supprimé)');

// archive altérée : la cible n'est pas touchée
const alteree = join(racine, 'alt.ncbak'); cpSync(arch, alteree);
const fd = openSync(alteree, 'r+'); writeSync(fd, Buffer.from('ZZZZ'), 0, 4, statSync(alteree).size - 6); closeSync(fd);
const cible2 = join(racine, 'cible2'); mkdirSync(cible2); writeFileSync(join(cible2, 'GARDE.txt'), 'y');
const r2 = await restoreArchive({ archivePath: alteree, targetDir: cible2, replaceExisting: true });
ok(!r2.ok && existsSync(join(cible2, 'GARDE.txt')), 'archive altérée : refusée et la cible existante n’est pas remplacée');

// archive tronquée
const tronq = join(racine, 'tr.ncbak'); cpSync(arch, tronq); truncateSync(tronq, statSync(tronq).size - 3);
const r3 = await restoreArchive({ archivePath: tronq, targetDir: join(racine, 'cible3') });
ok(!r3.ok && !existsSync(join(racine, 'cible3')), 'archive tronquée : refusée, aucune cible créée');

// version : comparaison numérique
const { versionPlusRecente } = await import('./backup.js');
ok(versionPlusRecente('0.3.37', '0.3.9') && !versionPlusRecente('0.3.9', '0.3.37') && !versionPlusRecente('0.3.33', '0.3.33'), 'comparaison de versions numérique (0.3.37 > 0.3.9)');

console.log(`\n${pass} réussis, ${fail} échoués`);
process.exit(fail ? 1 : 0);
