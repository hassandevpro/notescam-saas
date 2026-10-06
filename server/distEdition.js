// Édition du `dist/` servi par le serveur LAN — garde-fou de démarrage.
//
// LE DÉFAUT QUE ÇA FERME (constaté le 2026-10-01) : `node server/index.js` sert
// le contenu de `dist/` tel quel, sans savoir comment il a été compilé. Un
// `npm run build` (édition CLOUD) écrase le `dist/` d'un `npm run build:lan`, et
// le serveur LAN se met alors à servir la SPA cloud. Celle-ci embarque le vrai
// client Supabase : elle ne parle JAMAIS à `/api/db`. Symptômes vus par l'école,
// tous les deux sans message clair :
//   • sans Internet → toute écriture (créer une classe…) part en file d'attente
//     et n'est jamais enregistrée : « ça refuse d'enregistrer » ;
//   • avec Internet → les données partent dans le cloud au lieu de la base
//     locale de l'école, et le serveur LAN reste vide.
//
// Reconnaître l'édition :
//   1. `dist/edition.json` — estampille écrite par vite.config.js (source sûre) ;
//   2. repli pour les builds antérieurs à l'estampille : le morceau
//      `assets/vendor-supabase-*.js` n'est émis QUE par le build cloud
//      (vite.config.js ne force ce manualChunk que hors mode `lan`) ;
//   3. sinon « unknown » : on sert (compatibilité) en avertissant dans le log.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/** @returns {'lan'|'cloud'|'unknown'|'absent'} */
export function distEdition(distDir) {
  if (!existsSync(join(distDir, 'index.html'))) return 'absent';

  try {
    const stamp = join(distDir, 'edition.json');
    if (existsSync(stamp)) {
      const { edition } = JSON.parse(readFileSync(stamp, 'utf8'));
      if (edition === 'lan' || edition === 'cloud') return edition;
    }
  } catch { /* estampille illisible : on passe au repli */ }

  try {
    const assets = readdirSync(join(distDir, 'assets'));
    if (assets.some((f) => /^vendor-supabase-.*\.js$/.test(f))) return 'cloud';
  } catch { /* pas de dossier assets : on ne tranche pas */ }

  return 'unknown';
}

// Page servie à la place de la SPA quand le dist est de l'édition cloud. Elle
// remplace un échec silencieux par une consigne exécutable — et surtout, elle
// empêche l'école de saisir des données qui n'iraient pas dans sa base.
export function wrongEditionPage(editionFound = 'cloud') {
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>NotesCam — mauvaise édition installée</title>
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
       background:#f8fafc;color:#0f172a;font:16px/1.6 system-ui,Segoe UI,sans-serif;padding:24px}
  .card{max-width:560px;background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:28px}
  h1{margin:0 0 4px;font-size:20px}
  .tag{display:inline-block;background:#fef3c7;color:#92400e;border-radius:999px;
       padding:2px 10px;font-size:12px;font-weight:700;margin-bottom:14px}
  code{background:#f1f5f9;border-radius:6px;padding:2px 6px;font-size:14px}
  p{margin:12px 0}
</style></head>
<body><div class="card">
  <div class="tag">Édition « ${editionFound} » détectée</div>
  <h1>Ce serveur ne peut pas servir cette application</h1>
  <p>Le serveur local de l'école attend l'application en <strong>édition LAN</strong>.
     Le dossier <code>dist/</code> contient une version <strong>cloud</strong>, qui
     enregistre sur Internet et non dans la base de l'établissement&nbsp;: elle est
     volontairement bloquée pour qu'aucune saisie ne soit perdue.</p>
  <p><strong>Pour rétablir&nbsp;:</strong> recompiler l'application avec
     <code>npm run build:lan</code>, puis relancer le serveur. Sur un poste
     d'école, réinstaller le paquet NotesCam fourni par l'éditeur.</p>
  <p>L'API locale et vos données restent intactes. Aucune donnée n'a été modifiée.</p>
</div></body></html>`;
}
