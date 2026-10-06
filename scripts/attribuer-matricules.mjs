// Attribue un matricule aux élèves qui n'en ont pas, dans UNE école.
//
// Le produit ne génère aucun matricule : il est saisi à la main, partout. Quand
// une école en a laissé passer (import partiel, inscription rapide), les fiches
// sans matricule ressortent vides sur les reçus, les bulletins et les listes.
//
// CE QUE CE SCRIPT NE FAIT JAMAIS :
//   • toucher un matricule déjà attribué — un matricule est une identité
//     durable, imprimée sur des pièces déjà remises aux familles ;
//   • réutiliser un numéro existant — la série reprend APRÈS le plus grand
//     numéro déjà pris, jamais à partir d'un compte de lignes ;
//   • s'exécuter sans avoir montré, ligne à ligne, ce qu'il va écrire.
//
// L'ordre d'attribution est CLASSE puis NOM : les numéros se suivent à
// l'intérieur d'une classe, ce qui rend une liste d'appel pointable.
//
// Usage :
//   node scripts/attribuer-matricules.mjs "<école>" [--prefixe s26] [--depart 54] [--apply]
import { readFileSync } from 'node:fs';

const ECOLE = process.argv[2];
const APPLY = process.argv.includes('--apply');
const iPrefixe = process.argv.indexOf('--prefixe');
const PREFIXE = iPrefixe > 0 ? process.argv[iPrefixe + 1] : 's26';
// `--depart` force le premier numéro de la série au lieu de reprendre après le
// plus grand déjà pris. Utile quand des saisies à la main ont propulsé le maximum
// loin devant le bloc régulier : chez BRIGHT CONTINENT, sept numéros tapés au
// clavier (s261001 … s267001) faisaient repartir la série à 7002 alors que le
// bloc lisible s'arrêtait à s260053. Le garde-fou d'unicité reste entier : un
// numéro déjà pris est SAUTÉ, jamais réécrit — un départ mal choisi ne peut donc
// pas voler l'identité d'un élève, il ne peut que laisser des trous.
const iDepart = process.argv.indexOf('--depart');
const DEPART = iDepart > 0 ? parseInt(process.argv[iDepart + 1], 10) : null;
const LARGEUR = 4; // s26 + 4 chiffres = s260029

if (!ECOLE) {
  console.error('Usage : node scripts/attribuer-matricules.mjs "<école>" [--prefixe s26] [--depart 54] [--apply]');
  process.exit(1);
}
if (iDepart > 0 && (!Number.isInteger(DEPART) || DEPART < 1)) {
  console.error('--depart attend un entier ≥ 1.');
  process.exit(1);
}

if (!process.env.SUPABASE_ACCESS_TOKEN) {
  try {
    for (const l of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
      const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] ??= m[2];
    }
  } catch { /* le jeton doit alors venir de l'environnement */ }
}
const REF = process.env.SUPABASE_PROJECT_REF;
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!TOKEN) { console.error('SUPABASE_ACCESS_TOKEN absent — rien exécuté.'); process.exit(1); }

const sql = async (query) => {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status} — ${t.slice(0, 400)}`);
  return JSON.parse(t);
};

const [ecole] = await sql(`SELECT id, name FROM schools WHERE name ILIKE '%${ECOLE.replace(/'/g, "''")}%'`);
if (!ecole) { console.error(`École introuvable : ${ECOLE}`); process.exit(1); }

// Tous les matricules pris, quelle que soit leur forme : c'est contre EUX qu'on
// vérifie l'unicité, pas seulement contre la série en cours.
const pris = new Set((await sql(`SELECT matricule FROM students
  WHERE school_id = '${ecole.id}' AND matricule IS NOT NULL AND trim(matricule) <> ''`))
  .map((r) => r.matricule.trim()));

// Reprise APRÈS le plus grand numéro de la série, et non après le nombre
// d'élèves : si une fiche est supprimée un jour, repartir d'un comptage
// réattribuerait un numéro déjà imprimé sur un reçu.
let suivant = 0;
for (const m of pris) {
  const e = new RegExp(`^${PREFIXE}(\\d+)$`).exec(m);
  if (e) suivant = Math.max(suivant, parseInt(e[1], 10));
}
const maxPris = suivant;
suivant = DEPART ?? suivant + 1;

const sans = await sql(`
  SELECT st.id, st.name, coalesce(c.name, '(sans classe)') AS classe
  FROM students st LEFT JOIN classes c ON c.id = st.class_id
  WHERE st.school_id = '${ecole.id}'
    AND (st.matricule IS NULL OR trim(st.matricule) = '')
  ORDER BY coalesce(c.name, 'zzz'), st.name`);

console.log(`École : ${ecole.name}`);
console.log(`Matricules déjà pris : ${pris.size} — la série « ${PREFIXE} » reprend à ${suivant}`
  + (DEPART ? ` (départ forcé ; le plus grand numéro pris est ${maxPris} — les numéros déjà pris seront sautés)` : '')
  + '\n');
if (!sans.length) { console.log('Aucun élève sans matricule.'); process.exit(0); }

const plan = [];
for (const e of sans) {
  let mat;
  do { mat = `${PREFIXE}${String(suivant++).padStart(LARGEUR, '0')}`; } while (pris.has(mat));
  pris.add(mat);
  plan.push({ ...e, mat });
}

let classeCourante = null;
for (const p of plan) {
  if (p.classe !== classeCourante) { classeCourante = p.classe; console.log(`\n  ── ${classeCourante}`); }
  console.log(`    ${p.mat}  ${p.name}`);
}
console.log(`\n${plan.length} matricule(s) à attribuer : ${plan[0].mat} → ${plan[plan.length - 1].mat}`);

if (!APPLY) { console.log('\n(essai à blanc — rien écrit. Relancer avec --apply)'); process.exit(0); }

// `WHERE ... AND (matricule IS NULL OR trim = '')` : second garde-fou. Si une
// fiche recevait un matricule entre l'affichage et l'écriture, elle serait
// ignorée plutôt qu'écrasée.
const cas = plan.map((p) => `WHEN '${p.id}' THEN '${p.mat}'`).join(' ');
const ids = plan.map((p) => `'${p.id}'`).join(',');
const res = await sql(`
  UPDATE students SET matricule = CASE id ${cas} END,
                      updated_at = now(), version = coalesce(version, 0) + 1
  WHERE id IN (${ids}) AND (matricule IS NULL OR trim(matricule) = '')
  RETURNING matricule, name`);
console.log(`\n${res.length} matricule(s) attribué(s).`);
