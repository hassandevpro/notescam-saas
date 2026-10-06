// LE CONTRAT DÉPLOYÉ EST-IL CELUI QUE L'ON CROIT ?
//
// `server/_sync_contract.test.mjs` compare les listes de tables des SOURCES
// entre elles. C'est nécessaire, et insuffisant : un fichier source corrigé mais
// jamais déployé laisse la production dans l'état exact du défaut. Le test passe,
// la synchro reste cassée.
//
// Ce que ce script a trouvé le 21/09/2026, précisément parce qu'il regarde
// ailleurs que dans les fichiers :
//   • sync-push DÉPLOYÉE connaissait hr_payroll/hr_payroll_catalog/hr_payroll_items ;
//     sync-pull DÉPLOYÉE ne les connaissait PAS. La paie montait au Cloud et n'en
//     redescendait jamais. Aucune source ne le disait : les deux fichiers locaux
//     sont d'accord entre eux.
//   • ni fee_schedule_items ni cash_sessions n'étaient connues des quatre fonctions.
//
// LECTURE SEULE. N'écrit rien, ne déploie rien, ne touche à aucune donnée.
// Il lit le CODE des Edge Functions via l'API Management de Supabase.
//
// Usage (bash) :
//   SUPABASE_ACCESS_TOKEN=sbp_... SUPABASE_PROJECT_REF=... node scripts/audit-contrat-deploye.mjs
// Usage (PowerShell) :
//   $env:SUPABASE_ACCESS_TOKEN="sbp_..."; node scripts/audit-contrat-deploye.mjs
//
// Le jeton n'est JAMAIS écrit ici : un `sbp_…` ouvre l'administration complète
// du compte. Il est lu dans l'environnement, comme pour scripts/apply-cloud-sql.mjs.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const REF = process.env.SUPABASE_PROJECT_REF || 'ltxopwoxvgslsgzixbpx';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN || '';

if (!TOKEN) {
  console.error('SUPABASE_ACCESS_TOKEN absent de l\'environnement — rien n\'a été lu.');
  process.exit(1);
}

// Chaque fonction, son fichier source et la forme exacte de sa liste de tables.
const FONCTIONS = {
  'sync-push':   { src: 'supabase/functions/sync-push/index.ts',   decl: 'const ALLOWED = new Set([' },
  'sync-pull':   { src: 'supabase/functions/sync-pull/index.ts',   decl: 'const TABLES = [' },
  'sync-verify': { src: 'supabase/functions/sync-verify/index.ts', decl: 'const TABLES = [' },
  'sync-repair': { src: 'supabase/functions/sync-repair/index.ts', decl: 'const TABLES = new Set([' },
};

// Extrait les noms de tables d'une déclaration, source locale ou bundle déployé.
// Le bundle est un eszip : le source y figure, transpilé et reformaté (une table
// par ligne). On ne cherche donc pas une égalité de texte — seulement les noms.
const tablesDe = (texte, decl) => {
  const i = texte.indexOf(decl);
  if (i < 0) {
    // Le déployé est reformaté : « new Set([ » peut s'écrire autrement. Repli sur
    // le nom de la constante seul.
    const nom = decl.match(/const (\w+)/)[1];
    const j = texte.indexOf(`const ${nom} =`);
    if (j < 0) return null;
    const fin = texte.indexOf(']', j);
    return fin < 0 ? null : new Set([...texte.slice(j, fin).matchAll(/['"]([a-z][a-z0-9_]+)['"]/g)].map((m) => m[1]));
  }
  const fin = texte.indexOf(']', i);
  return fin < 0 ? null : new Set([...texte.slice(i, fin).matchAll(/['"]([a-z][a-z0-9_]+)['"]/g)].map((m) => m[1]));
};

async function corpsDeploye(slug) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/functions/${slug}/body`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  if (!res.ok) throw new Error(`${slug} : HTTP ${res.status}`);
  // Bundle binaire (~7 Mo) ; le source y est lisible en latin1.
  return Buffer.from(await res.arrayBuffer()).toString('latin1');
}

let ecarts = 0;
const deployees = {};

// Les quatre bundles font ~7 Mo chacun. En série, la lecture dépasse la minute ;
// en parallèle elle tient en quelques secondes.
console.log('Lecture des quatre Edge Functions déployées…');
const corps = Object.fromEntries(await Promise.all(
  Object.keys(FONCTIONS).map(async (slug) => {
    try { return [slug, await corpsDeploye(slug)]; }
    catch (e) { return [slug, e]; }
  }),
));

for (const [slug, { src, decl }] of Object.entries(FONCTIONS)) {
  const locale = tablesDe(readFileSync(join(RACINE, src), 'utf8'), decl);
  const brut = corps[slug];
  if (brut instanceof Error) { console.log(`\n══ ${slug} ══\n  ILLISIBLE : ${brut.message}`); ecarts++; continue; }
  const distante = tablesDe(brut, decl);

  if (!locale || !distante) { console.log(`\n══ ${slug} ══\n  liste introuvable (locale:${!!locale} déployée:${!!distante})`); ecarts++; continue; }
  deployees[slug] = distante;

  const aDeployer = [...locale].filter((t) => !distante.has(t)).sort();
  const perdues   = [...distante].filter((t) => !locale.has(t)).sort();
  console.log(`\n══ ${slug} ══  locale ${locale.size} tables / déployée ${distante.size}`);
  if (!aDeployer.length && !perdues.length) console.log('  ✅ le déployé est à jour');
  if (aDeployer.length) { console.log(`  ⬆️  ABSENTES DU DÉPLOYÉ (un deploy les ajouterait) : ${aDeployer.join(', ')}`); ecarts++; }
  // Le cas grave : le déployé connaît une table que la source a perdue. Déployer
  // ferait RÉGRESSER la production. À traiter avant tout deploy.
  if (perdues.length) { console.log(`  ⛔ PRÉSENTES EN PROD, ABSENTES DE LA SOURCE — un deploy les RETIRERAIT : ${perdues.join(', ')}`); ecarts++; }
}

// ── SYMÉTRIE DU DÉPLOYÉ ────────────────────────────────────────────────────
// Une table qui monte sans pouvoir redescendre diverge à coup sûr : le Cloud
// reçoit, le LAN ne relit jamais, et la moindre modification faite côté web est
// invisible en école. C'est le contrôle qui a révélé l'écart sur la paie.
if (deployees['sync-push'] && deployees['sync-pull']) {
  const montentSeules = [...deployees['sync-push']].filter((t) => !deployees['sync-pull'].has(t)).sort();
  console.log('\n══ SYMÉTRIE EN PRODUCTION ══');
  if (montentSeules.length) {
    console.log(`  ⛔ monte mais ne redescend pas : ${montentSeules.join(', ')}`);
    ecarts++;
  } else console.log('  ✅ tout ce qui monte peut redescendre');
}

console.log(`\n=== ${ecarts === 0 ? 'DÉPLOYÉ CONFORME' : `${ecarts} ÉCART(S)`} ===`);
process.exitCode = ecarts === 0 ? 0 : 1;
