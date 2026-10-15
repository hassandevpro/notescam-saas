// ACCÈS AUX FICHIERS SERVIS SOUS /files/ — test de bout en bout sur le VRAI
// serveur Fastify, lancé deux fois : protection inactive, puis active.
//
//   node server/_file_access.test.mjs
//
// LE DÉFAUT VERROUILLÉ ICI
// ────────────────────────
// `/files/` était servi par `fastifyStatic` sans aucun `preHandler` : photos
// d'élèves, signatures, cachets et pièces RH étaient téléchargeables par
// quiconque atteignait le serveur sur le réseau de l'école, sans compte.
//
// Deux exigences qui se contredisent en apparence, et que ce test tient
// ensemble :
//   · un visiteur sans jeton ne doit RIEN lire ;
//   · un utilisateur connecté doit continuer à voir les images — or `<img src>`
//     n'envoie pas d'en-tête `Authorization`, seulement des cookies.

import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect } from 'node:net';

// REQUÊTE BRUTE, SANS NORMALISATION.
//
// `fetch` — comme la barre d'adresse d'un navigateur — résout les « .. » du
// chemin AVANT d'émettre : demander `/files/x/../../secret.txt` envoie en
// réalité `/secret.txt`, et ne met donc RIEN à l'épreuve côté serveur. Un
// attaquant, lui, écrit la ligne de requête à la main. C'est ce que fait ceci.
function requeteBrute(port, ligneDeChemin, entetes = {}) {
  return new Promise((resolve, reject) => {
    const s = connect(port, '127.0.0.1');
    let brut = '';
    s.on('connect', () => {
      const h = Object.entries(entetes).map(([k, v]) => `${k}: ${v}\r\n`).join('');
      s.write(`GET ${ligneDeChemin} HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nConnection: close\r\n${h}\r\n`);
    });
    s.on('data', (d) => { brut += d; });
    s.on('error', reject);
    s.on('end', () => {
      const statut = Number(/^HTTP\/1\.\d (\d{3})/.exec(brut)?.[1] || 0);
      resolve({ statut, brut });
    });
  });
}

const __dirname = dirname(fileURLToPath(import.meta.url));

let pass = 0, fail = 0;
const ok = (c, label, got) => {
  if (c) { console.log(`✅ ${label}`); pass++; }
  else { console.log(`❌ ${label}${got === undefined ? '' : ` (obtenu: ${JSON.stringify(got)})`}`); fail++; }
};

// ── Démarrage d'un serveur jetable ──────────────────────────────────────────
async function demarrer({ port, protege }) {
  const dir = mkdtempSync(join(tmpdir(), 'nc-files-'));
  // Un fichier témoin dans le bucket, comme le serait une photo d'élève.
  const bucket = join(dir, 'files', 'school-assets', 'ecole1', 'students');
  mkdirSync(bucket, { recursive: true });
  writeFileSync(join(bucket, 'eleve42.jpg'), 'CONTENU-PHOTO-ELEVE');
  // Et une pièce qui ne doit jamais sortir du dossier de données.
  writeFileSync(join(dir, 'secret.txt'), 'JWT-SECRET-FICTIF');

  const env = {
    ...process.env,
    NOTESCAM_DATA_DIR: dir,
    PORT: String(port),
    HOST: '127.0.0.1',
    NOTESCAM_LICENSE_ENABLED: '0',
  };
  if (protege) env.NOTESCAM_PROTECT_FILES = '1';
  else delete env.NOTESCAM_PROTECT_FILES;

  const srv = spawn(process.execPath, [join(__dirname, 'index.js')], {
    env, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  srv.stdout.on('data', (d) => { log += d; });
  srv.stderr.on('data', (d) => { log += d; });

  const BASE = `http://127.0.0.1:${port}`;
  const t0 = Date.now();
  while (Date.now() - t0 < 30000) {
    try { const r = await fetch(`${BASE}/api/license`); if (r.ok) break; } catch { /* pas encore */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  if (Date.now() - t0 >= 30000) throw new Error('serveur non prêt :\n' + log.slice(-1200));

  const arreter = () => {
    srv.kill();
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* Windows garde parfois un verrou */ }
  };
  return { BASE, arreter, log: () => log };
}

const PHOTO = '/files/school-assets/ecole1/students/eleve42.jpg';

// Crée un compte et renvoie son jeton + le cookie éventuellement posé.
async function creerCompte(BASE, email) {
  const r = await fetch(`${BASE}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'MotDePasse-123', full_name: 'Test' }),
  });
  const j = await r.json();
  const token = j?.data?.session?.access_token || '';
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'MotDePasse-123' }),
  });
  const setCookie = login.headers.get('set-cookie') || '';
  const cookie = /nc_files=([^;]+)/.exec(setCookie)?.[0] || '';
  return { token, cookie, setCookie };
}

// ════════════════════════════════════════════════════════════════════════════
//  PARTIE 1 — PROTECTION INACTIVE (comportement actuel, inchangé)
// ════════════════════════════════════════════════════════════════════════════
{
  console.log('\n── protection inactive (défaut) ──');
  const { BASE, arreter } = await demarrer({ port: 8231, protege: false });
  try {
    const r = await fetch(`${BASE}${PHOTO}`);
    ok(r.status === 200, 'sans protection, la photo reste servie (aucune régression)', r.status);
    ok((await r.text()) === 'CONTENU-PHOTO-ELEVE', 'et son contenu est intact');

    // Le contrôle de chemin, lui, s'applique TOUJOURS. Requête BRUTE : un
    // `fetch` résoudrait les « .. » avant d'émettre et ne testerait rien.
    const t = await requeteBrute(8231, '/files/school-assets/../../secret.txt');
    ok(t.statut === 403, 'une remontée de répertoire est refusée même sans protection', t.statut);
    ok(!t.brut.includes('JWT-SECRET-FICTIF'), 'et le secret ne fuit pas');

    const e = await requeteBrute(8231, '/files/school-assets/%2e%2e%2f%2e%2e%2fsecret.txt');
    ok(e.statut !== 200 && !e.brut.includes('JWT-SECRET-FICTIF'), 'une remontée ENCODÉE est refusée aussi', e.statut);

    const cpt = await creerCompte(BASE, 'a@ecole.test');
    ok(/nc_files=/.test(cpt.setCookie), 'le cookie de fichiers est posé dès maintenant, pour que l’activation ne casse rien');
  } finally { arreter(); }
}

// ════════════════════════════════════════════════════════════════════════════
//  PARTIE 2 — PROTECTION ACTIVE
// ════════════════════════════════════════════════════════════════════════════
{
  console.log('\n── protection active (NOTESCAM_PROTECT_FILES=1) ──');
  const { BASE, arreter } = await demarrer({ port: 8232, protege: true });
  try {
    // ── INTERDIT ────────────────────────────────────────────────────────────
    const anonyme = await fetch(`${BASE}${PHOTO}`);
    ok(anonyme.status === 403, 'un visiteur SANS jeton ne lit pas la photo', anonyme.status);
    const corps = await anonyme.text();
    ok(!corps.includes('CONTENU-PHOTO-ELEVE'), 'et le contenu ne fuit pas dans la réponse de refus');

    const faux = await fetch(`${BASE}${PHOTO}`, { headers: { Authorization: 'Bearer pas.un.jeton' } });
    ok(faux.status === 403, 'un jeton bidon est refusé', faux.status);

    const fauxCookie = await fetch(`${BASE}${PHOTO}`, { headers: { Cookie: 'nc_files=abc.def.ghi' } });
    ok(fauxCookie.status === 403, 'un cookie forgé est refusé', fauxCookie.status);

    const fauxQuery = await fetch(`${BASE}${PHOTO}?t=abc.def.ghi`);
    ok(fauxQuery.status === 403, 'un paramètre ?t= forgé est refusé', fauxQuery.status);

    // Énumération : un chemin inexistant doit répondre comme un chemin existant,
    // pour ne pas révéler quels élèves ont une photo.
    const absent = await fetch(`${BASE}/files/school-assets/ecole1/students/inexistant.jpg`);
    ok(absent.status === anonyme.status,
       'un fichier absent et un fichier présent répondent pareil (pas d’oracle d’énumération)',
       { absent: absent.status, present: anonyme.status });

    // ── AUTORISÉ ────────────────────────────────────────────────────────────
    const cpt = await creerCompte(BASE, 'b@ecole.test');
    ok(!!cpt.token, 'le compte de test a bien un jeton de session');
    ok(/nc_files=/.test(cpt.setCookie), 'la connexion pose le cookie de fichiers');
    ok(/HttpOnly/i.test(cpt.setCookie), 'le cookie est HttpOnly (hors de portée du JavaScript)');
    ok(/SameSite=Strict/i.test(cpt.setCookie), 'le cookie est SameSite=Strict');
    ok(/Path=\/files/i.test(cpt.setCookie), 'le cookie est limité au chemin /files');

    const parCookie = await fetch(`${BASE}${PHOTO}`, { headers: { Cookie: cpt.cookie } });
    ok(parCookie.status === 200, 'AVEC le cookie, la photo s’affiche — c’est le cas de <img src>', parCookie.status);
    ok((await parCookie.text()) === 'CONTENU-PHOTO-ELEVE', 'et le contenu est le bon');

    const parBearer = await fetch(`${BASE}${PHOTO}`, { headers: { Authorization: `Bearer ${cpt.token}` } });
    ok(parBearer.status === 200, 'avec l’en-tête Bearer aussi (appels programmatiques)', parBearer.status);

    const parQuery = await fetch(`${BASE}${PHOTO}?t=${encodeURIComponent(cpt.token)}`);
    ok(parQuery.status === 200, 'avec ?t= aussi (dernier recours)', parQuery.status);

    // ── RÉTABLISSEMENT DU COOKIE sur session déjà ouverte ──────────────────
    const re = await fetch(`${BASE}/api/files/session`, { headers: { Authorization: `Bearer ${cpt.token}` } });
    ok(re.status === 200, 'une session ouverte peut rétablir son cookie', re.status);
    ok(/nc_files=/.test(re.headers.get('set-cookie') || ''), 'et le serveur le repose');

    const sans = await fetch(`${BASE}/api/files/session`);
    ok(sans.status === 401, 'sans session, aucun cookie n’est délivré', sans.status);

    // ── REMONTÉE DE RÉPERTOIRE, même authentifié ──────────────────────────
    for (const chemin of [
      '/files/school-assets/../../secret.txt',
      '/files/school-assets/%2e%2e%2f%2e%2e%2fsecret.txt',
      '/files/school-assets/..%2f..%2fsecret.txt',
      '/files/school-assets/ecole1/..%5c..%5c..%5csecret.txt',
      '/files/school-assets/..%252f..%252fsecret.txt',   // double encodage
      '/files/school-assets/ecole1/../../../notescam.db',
    ]) {
      const r = await requeteBrute(8232, chemin, { Cookie: cpt.cookie });
      ok(r.statut !== 200 && !r.brut.includes('JWT-SECRET-FICTIF'),
         `un utilisateur authentifié ne sort pas du bucket : ${chemin}`, r.statut);
    }

    // ── L'API reste protégée comme avant ──────────────────────────────────
    const putAnonyme = await fetch(`${BASE}/api/files/school-assets/ecole1/intrus.jpg`, {
      method: 'PUT', headers: { 'Content-Type': 'image/jpeg' }, body: 'X',
    });
    ok(putAnonyme.status >= 400, 'un dépôt de fichier anonyme reste refusé', putAnonyme.status);
  } finally { arreter(); }
}

console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} réussis, ${fail} échoués`);
process.exit(fail === 0 ? 0 : 1);
