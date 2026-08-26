// Applique un ou plusieurs fichiers .sql au projet Supabase via l'API Management.
//
// Le jeton n'est JAMAIS écrit dans ce fichier : il est lu dans l'environnement
// (SUPABASE_ACCESS_TOKEN). Un jeton `sbp_…` ouvre l'administration COMPLÈTE du
// compte — il n'a rien à faire dans un dépôt.
//
// Deux temps, volontairement :
//   --check   n'exécute AUCUN fichier ; affiche l'école ciblée et l'état actuel
//             des deux objets que les migrations vont toucher.
//   --apply   exécute les fichiers passés en argument, l'un après l'autre.
//
// Usage (PowerShell) :
//   $env:SUPABASE_ACCESS_TOKEN="sbp_..."
//   node scripts/apply-cloud-sql.mjs --check
//   node scripts/apply-cloud-sql.mjs --apply supabase_caissier_pages.sql supabase_creche_cycle.sql
//
// Usage (bash) :
//   SUPABASE_ACCESS_TOKEN=sbp_... node scripts/apply-cloud-sql.mjs --check

import { readFileSync } from 'node:fs';

const REF = process.env.SUPABASE_PROJECT_REF || 'ltxopwoxvgslsgzixbpx';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN || '';
const GENIUS = '6b68407b-3d2e-426b-81ff-c4e68e66120a';

if (!TOKEN) {
  console.error('SUPABASE_ACCESS_TOKEN absent de l\'environnement — rien n\'a été exécuté.');
  process.exit(1);
}

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const txt = await res.text();
  let body; try { body = JSON.parse(txt); } catch { body = txt; }
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${typeof body === 'string' ? body.slice(0, 400) : JSON.stringify(body).slice(0, 400)}`);
  return body;
}

const table = (rows) => {
  if (!Array.isArray(rows) || !rows.length) return '  (aucune ligne)';
  return rows.map((r) => '  ' + Object.entries(r).map(([k, v]) => `${k}=${v === null ? 'NULL' : v}`).join('  ')).join('\n');
};

const args = process.argv.slice(2);
const mode = args[0];
const fichiers = args.slice(1);

if (mode === '--check') {
  console.log(`Projet : ${REF}\n`);
  console.log('— Écoles —');
  console.log(table(await sql('SELECT id, name, strict_role_enforcement FROM public.schools ORDER BY name;')));
  console.log('\n— Onglets du Caissier vs ceux du RAF (école THE GENIUS) —');
  console.log(table(await sql(
    `SELECT code, pages::text AS pages FROM public.governance_roles
      WHERE school_id = '${GENIUS}' AND code IN ('caissier','raf') ORDER BY code;`)));
  console.log('\n— Classes d\'accueil pré-scolaire —');
  console.log(table(await sql(
    `SELECT name, cycle, section FROM public.classes
      WHERE school_id = '${GENIUS}'
        AND (name ILIKE '%creche%' OR name ILIKE '%crèche%' OR name ILIKE '%garderie%' OR name ILIKE '%nursery%');`)));
  console.log('\nRien n\'a été modifié. Pour appliquer :');
  console.log('  node scripts/apply-cloud-sql.mjs --apply supabase_caissier_pages.sql supabase_creche_cycle.sql');
  process.exit(0);
}

if (mode === '--read') {
  // LECTURE : exécute un fichier .sql et rend le résultat brut, plus — pour
  // l'audit des secteurs — la synthèse que la migration devra justifier.
  const f = fichiers[0];
  if (!f) { console.error('Usage : --read <fichier.sql>'); process.exit(1); }
  const rows = await sql(readFileSync(f, 'utf8'));
  if (!Array.isArray(rows)) { console.log(JSON.stringify(rows, null, 1)); process.exit(0); }

  // Deux formes d'audit, reconnues à leurs colonnes — la synthèse n'a de sens
  // que si elle correspond à ce qui a été lu.
  if (rows.length && Object.prototype.hasOwnProperty.call(rows[0], 'sector')) {
    const parSecteur = new Map(), parDept = new Map();
    for (const r of rows) {
      const sec = r.sector || '(non défini)';
      parSecteur.set(sec, (parSecteur.get(sec) || 0) + 1);
      const k = `${r.department} — ${r.sector || '(non défini)'}`;
      parDept.set(k, (parDept.get(k) || 0) + 1);
    }
    console.log(`Projet : ${REF}`);
    console.log(`Personnel de THE GENIUS (hors enseignants) : ${rows.length}\n`);
    console.log('— Par secteur —');
    for (const [k, n] of [...parSecteur].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${k}`);
    console.log('\n— Par département × secteur —');
    for (const [k, n] of [...parDept].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${k}`);
    const nuls = rows.filter((r) => !r.sector);
    console.log(`\n— Secteur NON DÉFINI : ${nuls.length} —`);
    for (const r of nuls) console.log(`  ${r.name}  [${r.department}${r.fonction ? ' / ' + r.fonction : ''}]  ${r.id}`);
    console.log('\nAucune donnée modifiée.');
    process.exit(0);
  }

  const clef = (r) => (r.nb_secteurs === 0 ? 'sans classe' : (r.secteurs || []).join(' + '));
  const parCat = new Map();
  for (const r of rows) parCat.set(clef(r), (parCat.get(clef(r)) || 0) + 1);

  console.log(`Projet : ${REF}`);
  console.log(`Enseignants de THE GENIUS : ${rows.length}\n`);
  console.log('— Répartition —');
  for (const [k, n] of [...parCat].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${k}`);

  const ambigus = rows.filter((r) => r.nb_secteurs > 1);
  console.log(`\n— Cas AMBIGUS (multi-secteur) : ${ambigus.length} —`);
  for (const r of ambigus) console.log(`  ${r.name}  →  ${(r.secteurs || []).join(' + ')}   [${r.id}]`);

  const sansClasse = rows.filter((r) => r.nb_secteurs === 0);
  console.log(`\n— Sans aucune classe ni matière : ${sansClasse.length} —`);
  for (const r of sansClasse) console.log(`  ${r.name}   [${r.id}]`);

  console.log('\nAucune donnée modifiée.');
  process.exit(0);
}

if (mode !== '--apply' || !fichiers.length) {
  console.error('Usage : --check   |   --read <fichier.sql>   |   --apply <fichier.sql> [autre.sql ...]');
  process.exit(1);
}

for (const f of fichiers) {
  process.stdout.write(`\n=== ${f} `);
  const contenu = readFileSync(f, 'utf8');
  try {
    const r = await sql(contenu);
    console.log('=== OK');
    console.log(table(r));
  } catch (e) {
    console.log('=== ÉCHEC');
    console.error('  ' + e.message);
    process.exit(1);
  }
}
console.log('\nTerminé. Relancez --check pour constater le nouvel état.');
