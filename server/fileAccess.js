// AUTORISATION DE LECTURE DES FICHIERS SERVIS SOUS /files/.
//
// LE DÉFAUT CORRIGÉ
// ─────────────────
// `server/index.js` enregistre `fastifyStatic` sur le préfixe `/files/` sans
// aucun `preHandler`. Les ÉCRITURES sont protégées (PUT et DELETE sur
// `/api/files/` exigent un jeton), mais toute LECTURE était ouverte : photos
// d'élèves, signatures, cachets et pièces RH étaient téléchargeables par
// quiconque atteignait le serveur sur le réseau de l'école, sans compte, en
// devinant ou en énumérant une URL.
//
// POURQUOI UN COOKIE, ET PAS SEULEMENT UN EN-TÊTE
// ───────────────────────────────────────────────
// Les images sont affichées par `<img src>`, qui n'envoie AUCUN en-tête
// `Authorization`. Protéger `/files/` par le seul Bearer casserait donc tous
// les affichages. Trois porteurs sont acceptés, par ordre de préférence :
//
//   1. un COOKIE `nc_files`, posé à la connexion, limité au chemin /files,
//      `HttpOnly` (inaccessible au JavaScript) et `SameSite=Strict` — c'est le
//      seul porteur qu'un `<img>` transmet tout seul ;
//   2. l'en-tête `Authorization: Bearer`, pour les appels programmatiques
//      (fetch, génération de PDF côté serveur, outils de diagnostic) ;
//   3. un paramètre `?t=` en dernier recours, pour les contextes qui ne portent
//      ni cookie ni en-tête.
//
// Le jeton de fichiers est DISTINCT du jeton de session et vit 12 heures, là où
// la session vit 30 jours : même recopiée dans un historique de navigateur ou
// un journal d'accès, une URL de fichier ne livre pas la session de son porteur.
// Un jeton de session reste néanmoins accepté — sans quoi tout utilisateur déjà
// connecté avant la mise à jour verrait ses images disparaître.
//
// DÉSACTIVÉ PAR DÉFAUT
// ────────────────────
// `NOTESCAM_PROTECT_FILES=1` active la protection. Tant que la variable est
// absente, le comportement est EXACTEMENT celui d'aujourd'hui : c'est une
// modification de production, elle demande une décision, et elle s'annule en
// retirant une ligne de `/etc/notescam/notescam.env`.

import { signToken, verifyToken } from './security.js';

export const FILE_COOKIE = 'nc_files';
export const FILE_TOKEN_TTL = 12 * 60 * 60;   // secondes
const SCOPE = 'files';

/** La protection est-elle active ? Défaut : non. */
export function protectFilesEnabled(env = process.env) {
  const v = String(env.NOTESCAM_PROTECT_FILES ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'oui' || v === 'yes';
}

// Analyse d'un en-tête Cookie. Volontairement sans dépendance : une ligne
// d'en-tête, découpée sur « ; » puis sur le premier « = ».
export function parseCookies(header) {
  const out = {};
  if (!header || typeof header !== 'string') return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i === -1) continue;
    const k = part.slice(0, i).trim();
    if (!k) continue;
    try { out[k] = decodeURIComponent(part.slice(i + 1).trim()); }
    catch { out[k] = part.slice(i + 1).trim(); }
  }
  return out;
}

/** Jeton de lecture de fichiers pour cet utilisateur. */
export function issueFileToken(userId) {
  if (!userId) return null;
  return signToken({ sub: userId, scope: SCOPE }, FILE_TOKEN_TTL);
}

/**
 * En-tête Set-Cookie du jeton de fichiers.
 *
 * `HttpOnly` : le JavaScript de la page n'y accède pas, donc une faille XSS ne
 * l'exfiltre pas. `Path=/files` : il n'est transmis qu'aux requêtes de fichiers,
 * jamais aux appels d'API. Pas de `Secure` : le serveur d'école est en HTTP sur
 * le réseau local, et marquer `Secure` empêcherait le navigateur d'envoyer le
 * cookie — donc casserait tous les affichages.
 */
export function fileCookieHeader(token, { ttl = FILE_TOKEN_TTL } = {}) {
  if (!token) return `${FILE_COOKIE}=; Path=/files; HttpOnly; SameSite=Strict; Max-Age=0`;
  return `${FILE_COOKIE}=${encodeURIComponent(token)}; Path=/files; HttpOnly; SameSite=Strict; Max-Age=${ttl}`;
}

// Un chemin de fichier ne doit jamais sortir du bucket. `fastifyStatic` refuse
// déjà la remontée, mais le contrôle est refait ici : c'est la porte d'entrée,
// et une défense qui dépend d'une bibliothèque tierce se vérifie aussi soi-même.
// Le chemin est examiné DÉCODÉ : « %2e%2e%2f » est une remontée déguisée.
export function isSafeFilePath(urlPath) {
  if (typeof urlPath !== 'string' || !urlPath) return false;
  let p = urlPath;
  for (let i = 0; i < 3; i++) {                 // double, triple encodage
    try { const d = decodeURIComponent(p); if (d === p) break; p = d; }
    catch { return false; }                     // encodage invalide : on refuse
  }
  if (p.includes('\0')) return false;
  const normalise = p.replace(/\\/g, '/');      // antislash Windows
  for (const seg of normalise.split('/')) {
    if (seg === '..') return false;
  }
  return true;
}

/**
 * Cette requête peut-elle lire ce fichier ?
 * LECTURE SEULE : ne modifie ni la requête ni la réponse.
 *
 * @returns {{ allowed: boolean, reason: string, userId: string|null, via: string|null }}
 */
export function authorizeFileRequest(req, { enabled = protectFilesEnabled() } = {}) {
  const url = req?.url || '';
  const chemin = url.split('?')[0];

  // Le contrôle de chemin s'applique TOUJOURS, protection active ou non : une
  // remontée de répertoire n'est jamais un usage légitime.
  if (!isSafeFilePath(chemin)) {
    return { allowed: false, reason: 'chemin_invalide', userId: null, via: null };
  }

  if (!enabled) return { allowed: true, reason: 'protection_desactivee', userId: null, via: null };

  const essais = [];
  const cookies = parseCookies(req?.headers?.cookie);
  if (cookies[FILE_COOKIE]) essais.push(['cookie', cookies[FILE_COOKIE]]);

  const h = req?.headers?.authorization || '';
  if (h.startsWith('Bearer ')) essais.push(['bearer', h.slice(7)]);

  const q = url.indexOf('?');
  if (q !== -1) {
    const t = new URLSearchParams(url.slice(q + 1)).get('t');
    if (t) essais.push(['query', t]);
  }

  if (!essais.length) return { allowed: false, reason: 'aucun_jeton', userId: null, via: null };

  for (const [via, token] of essais) {
    const payload = verifyToken(token);
    // `verifyToken` contrôle la signature ET l'expiration. On accepte le jeton
    // de fichiers (scope) comme le jeton de session (sans scope), pour ne pas
    // casser l'affichage des utilisateurs connectés avant la mise à jour.
    if (payload?.sub) return { allowed: true, reason: 'autorise', userId: payload.sub, via };
  }
  return { allowed: false, reason: 'jeton_invalide', userId: null, via: null };
}

/**
 * `preHandler` Fastify pour le préfixe /files/.
 * Répond 403 sans divulguer si le fichier existe — un refus ne doit pas servir
 * d'oracle d'énumération.
 */
export function filesPreHandler(req, reply, done) {
  const r = authorizeFileRequest(req);
  if (r.allowed) return done();
  reply.code(403).send({ error: { message: 'Accès refusé', reason: r.reason } });
}
