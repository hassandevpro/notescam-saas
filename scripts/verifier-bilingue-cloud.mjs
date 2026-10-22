// Vérifie, EN LECTURE SEULE, que le référentiel bilingue spécial (arrêté
// 239-23/MINESEC du 14 juin 2023) est bien en place dans la base cloud.
//
// À lancer après avoir appliqué, dans cet ordre :
//   node scripts/apply-cloud-sql.mjs --apply supabase_bilingue_special.sql supabase_bilingue_special_data.sql
// puis :
//   node scripts/verifier-bilingue-cloud.mjs
//
// Le jeton est lu dans l'environnement ou dans `.env.local` (gitignoré) ; il
// n'est jamais affiché. Un garde-fou refuse toute requête non strictement
// lecture : ce script ne peut rien modifier, même par accident.
import { readFileSync } from 'node:fs';

try {
  for (const ligne of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const m = ligne.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
} catch { /* pas de .env.local : tout doit venir de l'environnement */ }

const REF = process.env.SUPABASE_PROJECT_REF;
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!TOKEN || !REF) {
  console.error('SUPABASE_ACCESS_TOKEN ou SUPABASE_PROJECT_REF absent — rien n\'a été exécuté.');
  process.exit(1);
}

const INTERDIT = /\b(insert|update|delete|alter|drop|truncate|grant|revoke|create)\b/i;
async function sql(query) {
  if (INTERDIT.test(query)) throw new Error('GARDE-FOU : requête non strictement lecture, refusée.');
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const txt = await res.text();
  let body; try { body = JSON.parse(txt); } catch { body = txt; }
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${JSON.stringify(body).slice(0, 250)}`);
  return body;
}

let ko = 0;
const ok = (vrai, msg) => { console.log(`  ${vrai ? '✅' : '❌'} ${msg}`); if (!vrai) ko++; };

console.log('1) Les cinq tables du référentiel existent et sont remplies');
const ATTENDU = {
  bil_referentiel_versions: 1, bil_series: 2, bil_groupes: 10,
  bil_matieres: 35, bil_serie_matieres: 141,
};
for (const [t, n] of Object.entries(ATTENDU)) {
  try {
    const r = await sql(`SELECT COUNT(*) AS n FROM public.${t}`);
    ok(Number(r[0].n) === n, `${t.padEnd(26)} ${r[0].n} (attendu ${n})`);
  } catch (e) { ok(false, `${t.padEnd(26)} ${e.message.slice(0, 70)}`); }
}

// Les sommes sont le contrôle de recopie : en francophone elles reproduisent
// les lignes TOTAL GENERAL imprimées dans l'arrêté (31, 31, 32, 32).
console.log('\n2) Les sommes de coefficients reproduisent l\'arrêté');
const CIBLE = {
  'bil_fr/6e': 31, 'bil_fr/5e': 31, 'bil_fr/4e': 32, 'bil_fr/3e': 32,
  'bil_en/form1': 32, 'bil_en/form2': 32, 'bil_en/form3': 35,
  'bil_en/form4': 13, 'bil_en/form5': 13,
};
try {
  const r = await sql(`SELECT serie_id, classe_id, SUM(coefficient) AS somme
    FROM public.bil_serie_matieres WHERE actif AND obligatoire GROUP BY 1, 2`);
  const vu = Object.fromEntries(r.map((x) => [`${x.serie_id}/${x.classe_id}`, Number(x.somme)]));
  for (const [k, n] of Object.entries(CIBLE)) {
    ok(vu[k] === n, `${k.padEnd(14)} Σcoef ${vu[k] ?? '—'} (arrêté ${n})`);
  }
} catch (e) { ok(false, e.message.slice(0, 90)); }

console.log('\n3) Une école peut désormais être basculée en bilingue spécial');
try {
  const r = await sql(`SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
    WHERE conname = 'schools_bulletin_engine_chk'`);
  ok(r.length > 0 && /bilingue_special/.test(r[0].def),
     'schools_bulletin_engine_chk accepte « bilingue_special »');
  if (r.length) console.log('     ' + r[0].def.replace(/\s+/g, ' ').slice(0, 190));
} catch (e) { ok(false, e.message.slice(0, 90)); }

console.log('\n4) Les colonnes de regroupement du bulletin sont en place');
try {
  const r = await sql(`SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'subjects'
      AND column_name IN ('bil_domaine', 'bil_domaine_ordre', 'bil_obligatoire', 'charge_horaire')`);
  const vu = new Set(r.map((x) => x.column_name));
  for (const c of ['bil_domaine', 'bil_domaine_ordre', 'bil_obligatoire', 'charge_horaire']) {
    ok(vu.has(c), `subjects.${c}`);
  }
} catch (e) { ok(false, e.message.slice(0, 90)); }

// Une migration additive ne doit RIEN retirer : si un de ces trois nombres a
// baissé, la migration n'est pas en cause seule, mais il faut s'arrêter.
console.log('\n5) Rien d\'autre n\'a bougé');
const AVANT = { ecoles: 44, classes: 284, matieres: 2215 };
try {
  const r = await sql(`SELECT
      (SELECT COUNT(*) FROM public.schools)  AS ecoles,
      (SELECT COUNT(*) FROM public.classes)  AS classes,
      (SELECT COUNT(*) FROM public.subjects) AS matieres`);
  for (const [k, n] of Object.entries(AVANT)) {
    ok(Number(r[0][k]) >= n, `${k.padEnd(9)} ${r[0][k]} (≥ ${n}, relevé avant la migration)`);
  }
} catch (e) { ok(false, e.message.slice(0, 90)); }

console.log(ko === 0
  ? '\n✅ Migration conforme. Le bulletin bilingue spécial peut être activé.'
  : `\n❌ ${ko} contrôle(s) en échec — ne pas activer avant d'avoir regardé.`);
process.exit(ko === 0 ? 0 : 1);
