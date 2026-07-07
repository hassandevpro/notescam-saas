// Génère server/officiel-seed.sql (SQLite) à partir des fichiers référentiel
// canoniques supabase_*.sql (Postgres). Le seed peuple les tables « référentiel »
// du moteur officiel en LAN : cycles/classes/matières/compétences (APC collège),
// séries/coef (SC lycée), niveaux/domaines (maternelle), compétences/critères
// (primaire). Source de vérité = les .sql racine ; ce script est un outil DEV,
// le seed produit est committé et embarqué avec le serveur (chargé au boot).
//
// Transformations appliquées (minimales, sûres) :
//   • on ne garde QUE les `INSERT INTO public.<table référentiel>` ;
//   • `INTO public.` → `INTO ` (les .sql n'ont qu'un `public.` par INSERT) ;
//   • on LAISSE `true`/`false` (SQLite les comprend → 1/0 ; les convertir en
//     aveugle corromprait les intitulés anglais contenant « true ») ;
//   • on LAISSE `ON CONFLICT … DO UPDATE SET … EXCLUDED.…` (SQLite l'accepte) ;
//   • les `UPDATE … referentiel_versions SET actif = false` sont ÉCARTÉS (sinon,
//     rejoué à chaque boot, il désactiverait la version puis l'INSERT DO NOTHING
//     laisserait le référentiel sans version active).
// Les colonnes id des tables à PK uuid omises dans l'INSERT (apc_competences,
// sc_serie_matieres) sont fournies par un DEFAULT SQLite (cf. schema.sql).

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT  = join(ROOT, 'server', 'officiel-seed.sql');

// Ordre = dépendances FK (parents avant enfants), toutes tables confondues.
const SOURCES = [
  'supabase_apc_minesec.sql',        // apc_cycles/classes/trimestres/sequences/matieres
  'supabase_apc_referentiel_data.sql', // apc_referentiel_versions/competences/classe_matieres
  'supabase_sc_minesec.sql',         // sc_groupes/series
  'supabase_sc_referentiel_data.sql', // sc_series(ext)/matieres/version/serie_matieres
  'supabase_maternelle.sql',         // mat_niveaux/domaines
  'supabase_apc_primaire.sql',       // prim_cycles/niveaux/competences/criteres/cote_bareme
];

// Tables référentiel à embarquer (les transactionnelles apc_notes/… sont exclues).
const WHITELIST = new Set([
  'apc_referentiel_versions', 'apc_cycles', 'apc_classes', 'apc_trimestres',
  'apc_sequences', 'apc_matieres', 'apc_competences', 'apc_classe_matieres',
  'sc_referentiel_versions', 'sc_series', 'sc_groupes', 'sc_matieres', 'sc_serie_matieres',
  'mat_referentiel_versions', 'mat_niveaux', 'mat_domaines',
  'prim_referentiel_versions', 'prim_cycles', 'prim_niveaux', 'prim_competences',
  'prim_niveau_competences', 'prim_criteres', 'prim_cote_bareme',
]);

// Découpe un script SQL en instructions, en respectant : commentaires `-- …`,
// chaînes '…' (échappement ''), et dollar-quotes $tag$ … $tag$ (blocs DO/RLS).
function splitStatements(sql) {
  const out = [];
  let buf = '';
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    // Commentaire ligne
    if (c === '-' && sql[i + 1] === '-') {
      const nl = sql.indexOf('\n', i);
      i = nl === -1 ? sql.length : nl;
      continue;
    }
    // Chaîne simple quote (avec '' échappé)
    if (c === "'") {
      buf += c;
      for (i++; i < sql.length; i++) {
        buf += sql[i];
        if (sql[i] === "'") {
          if (sql[i + 1] === "'") { buf += sql[++i]; continue; }
          break;
        }
      }
      continue;
    }
    // Dollar-quote $tag$ … $tag$
    if (c === '$') {
      const m = /^\$[a-zA-Z0-9_]*\$/.exec(sql.slice(i));
      if (m) {
        const tag = m[0];
        const end = sql.indexOf(tag, i + tag.length);
        const stop = end === -1 ? sql.length : end + tag.length;
        buf += sql.slice(i, stop);
        i = stop - 1;
        continue;
      }
    }
    if (c === ';') { out.push(buf.trim()); buf = ''; continue; }
    buf += c;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

const header = `-- ============================================================
-- SEED du moteur officiel Cameroun (référentiel MINEDUB + MINESEC).
-- GÉNÉRÉ par scripts/build-officiel-seed.mjs — NE PAS ÉDITER À LA MAIN.
-- Rejouable (INSERT … ON CONFLICT). Chargé au boot par server/db.js.
-- ============================================================
`;

const chunks = [header];
const counts = {};

for (const file of SOURCES) {
  const sql = readFileSync(join(ROOT, file), 'utf8');
  for (const stmt of splitStatements(sql)) {
    const m = /^INSERT\s+INTO\s+public\.([a-z_]+)/i.exec(stmt);
    if (!m) continue;
    const table = m[1];
    if (!WHITELIST.has(table)) continue;
    const converted = stmt.replace(/\bINTO\s+public\./i, 'INTO ');
    chunks.push(converted + ';');
    // Comptage approximatif des lignes VALUES (parenthèses de tête de tuple).
    const rows = (converted.match(/\n\s*\(/g) || []).length || 1;
    counts[table] = (counts[table] || 0) + rows;
  }
}

writeFileSync(OUT, chunks.join('\n\n') + '\n', 'utf8');

console.log(`Seed écrit : ${OUT}`);
for (const t of Object.keys(counts).sort()) console.log(`  ${t.padEnd(26)} ~${counts[t]} ligne(s)`);
