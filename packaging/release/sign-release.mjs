// Signe une PUBLICATION (installeur Windows) et produit la ligne SQL à insérer
// dans `app_releases` — le manifeste que les serveurs LAN interrogent.
//
// Usage :
//   node packaging/release/sign-release.mjs \
//     --file dist-installer/NotesCam-Setup.exe \
//     --version 0.3.0 \
//     --url https://cdn.exemple.cm/notescam/NotesCam-Setup-0.3.0.exe \
//     [--channel stable] [--mandatory] [--notes "Calendrier par tutelle"] [--json]
//
// Ce que le serveur d'école vérifiera, dans cet ordre :
//   1. sha256 du fichier téléchargé == `sha256` du manifeste ;
//   2. signature Ed25519 valide sur « notescam-release:<version>:<sha256> ».
// Lier la version à l'empreinte interdit de rejouer une ancienne signature sur
// un autre binaire.

import { createHash, createPrivateKey, sign as cryptoSign } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

function arg(name, def = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? (process.argv[i + 1] ?? true) : def;
}
const has = (name) => process.argv.includes(`--${name}`);

const file    = arg('file');
const version = arg('version');
const url     = arg('url');
const channel = arg('channel', 'stable');
const notes   = arg('notes', '');
const minVer  = arg('min-version', null);

if (!file || !version || !url) {
  console.error('Usage : node packaging/release/sign-release.mjs --file <installeur> --version <x.y.z> --url <https://…> [--channel stable] [--mandatory] [--notes "…"] [--min-version x.y.z] [--json]');
  process.exit(1);
}
if (!existsSync(file)) { console.error(`Fichier introuvable : ${file}`); process.exit(1); }
if (!/^https:/i.test(url)) { console.error('L’URL doit être en https (le serveur LAN refuse le reste).'); process.exit(1); }
if (!/^\d+\.\d+\.\d+/.test(version)) { console.error('Version attendue au format semver (ex. 0.3.0).'); process.exit(1); }

const privPath = process.env.NOTESCAM_RELEASE_PRIVATE_KEY || join(here, 'release-private-key.pem');
if (!existsSync(privPath)) {
  console.error(`Clé privée de publication introuvable : ${privPath}`);
  console.error('Générez-la une fois : node packaging/release/keygen-release.mjs');
  process.exit(1);
}

const bytes  = readFileSync(file);
const sha256 = createHash('sha256').update(bytes).digest('hex');

// MÊME chaîne que server/updateInstaller.js → signedPayload(). Toute divergence
// ici ferait refuser toutes les mises à jour, en silence.
const payload = `notescam-release:${version}:${sha256}`;

const key = createPrivateKey(readFileSync(privPath));
const signature = cryptoSign(null, Buffer.from(payload, 'utf8'), key).toString('base64');

const release = {
  version, channel, sha256, signature, url,
  mandatory: has('mandatory'),
  notes: notes || null,
  min_version: minVer,
  bytes: bytes.length,
};

if (has('json')) { console.log(JSON.stringify(release, null, 2)); process.exit(0); }

const q = (v) => (v == null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);
console.log(`\n✔ Empreinte  : ${sha256}`);
console.log(`✔ Taille     : ${(bytes.length / 1048576).toFixed(1)} Mo`);
console.log(`✔ Signature  : ${signature}`);
console.log('\n-- À exécuter dans Supabase (SQL Editor) pour publier :');
console.log(`INSERT INTO public.app_releases (version, channel, min_version, sha256, signature, url, mandatory, notes)
VALUES (${q(version)}, ${q(channel)}, ${minVer ? q(minVer) : 'NULL'}, ${q(sha256)}, ${q(signature)}, ${q(url)}, ${release.mandatory}, ${notes ? q(notes) : 'NULL'})
ON CONFLICT (version) DO UPDATE SET
  channel = EXCLUDED.channel, min_version = EXCLUDED.min_version, sha256 = EXCLUDED.sha256,
  signature = EXCLUDED.signature, url = EXCLUDED.url, mandatory = EXCLUDED.mandatory, notes = EXCLUDED.notes;`);
console.log('\n⚠️  Ne publiez la ligne QU’APRÈS avoir mis le fichier en ligne à cette URL exacte.');
