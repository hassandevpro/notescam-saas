// CONTRÔLE STATIQUE DU TEST pgTAP D'ISOLATION.
//
//   node supabase/tests/database/_isolation_statique.test.mjs
//
// POURQUOI CE FICHIER EXISTE
// --------------------------
// `01_isolation_etablissements.test.sql` ne peut pas être exécuté sur un poste
// de développement sans Postgres : il faut `supabase test db`, donc Docker, ou
// un `psql` sur une base de recette. Ni l'un ni l'autre n'est disponible ici.
//
// Un test qu'on ne peut pas lancer tout de suite échoue d'habitude au premier
// essai pour de mauvaises raisons : un `plan(n)` qui ne correspond pas au nombre
// réel d'assertions, une colonne qui n'existe pas, une transaction mal fermée.
// Ces erreurs-là se détectent SANS Postgres, et c'est ce que fait ce contrôle.
//
// Il ne remplace pas l'exécution réelle. Il garantit seulement que, le jour où
// elle aura lieu, un échec voudra dire « une politique RLS laisse fuir des
// données » et non « le fichier de test était mal écrit ».
//
// Le schéma de référence est `server/schema.sql` : c'est le miroir LAN des
// tables cloud, maintenu en parité par `npm run validate`.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ici = dirname(fileURLToPath(import.meta.url));
const racine = join(ici, '..', '..', '..');
const sql = readFileSync(join(ici, '01_isolation_etablissements.test.sql'), 'utf8');
const schema = readFileSync(join(racine, 'server', 'schema.sql'), 'utf8');

// LE SCHÉMA RÉEL N'EST PAS SEULEMENT DANS schema.sql.
//
// `server/db.js` ajoute des colonnes au démarrage par `ensureColumn(...)` : le
// schéma d'une base installée est donc `schema.sql` PLUS ces ajouts. Un
// vérificateur qui ne lirait que le premier déclarerait manquantes des colonnes
// qui existent — c'est ce qui est arrivé à `school_users.scope_global`, ajoutée
// en `db.js:92` et bien présente côté cloud.
const dbjs = readFileSync(join(racine, 'server', 'db.js'), 'utf8');
const colonnesAjoutees = new Map();   // table -> Set(colonnes)
for (const m of dbjs.matchAll(/ensureColumn\(\s*'(\w+)'\s*,\s*'(\w+)'/g)) {
  if (!colonnesAjoutees.has(m[1])) colonnesAjoutees.set(m[1], new Set());
  colonnesAjoutees.get(m[1]).add(m[2]);
}
for (const m of dbjs.matchAll(/\{\s*table:\s*'(\w+)'\s*,\s*col(?:umn)?:\s*'(\w+)'/g)) {
  if (!colonnesAjoutees.has(m[1])) colonnesAjoutees.set(m[1], new Set());
  colonnesAjoutees.get(m[1]).add(m[2]);
}

let pass = 0, fail = 0;
const ok = (c, label, got) => {
  if (c) { console.log(`✅ ${label}`); pass++; }
  else { console.log(`❌ ${label}${got === undefined ? '' : ` (${got})`}`); fail++; }
};

// ── 1. Le plan annoncé correspond-il aux assertions écrites ? ──────────────
// Une erreur de comptage fait échouer toute la suite avec « planned N but ran M »,
// ce qui masque les vrais résultats.
{
  const plan = Number(/SELECT plan\((\d+)\)/.exec(sql)?.[1] ?? -1);
  const compte = (re) => (sql.match(re) || []).length;
  const assertions =
      compte(/\bSELECT\s+is\(/g)
    + compte(/\bSELECT\s+throws_ok\(/g)
    + compte(/\bSELECT\s+lives_ok\(/g)
    + compte(/\bSELECT\s+tests\.rls_enabled\(/g);

  ok(plan > 0, `un plan est declare (plan(${plan}))`);
  ok(plan === assertions, `plan(${plan}) correspond aux ${assertions} assertions ecrites`,
     `plan=${plan}, assertions=${assertions}`);
}

// ── 2. La transaction est-elle bien fermée ? ──────────────────────────────
// Sans ROLLBACK, le test laisserait deux etablissements fictifs dans la base.
{
  const begins = (sql.match(/^BEGIN;/gm) || []).length;
  const rollbacks = (sql.match(/^ROLLBACK;/gm) || []).length;
  const commits = (sql.match(/^COMMIT;/gm) || []).length;
  ok(begins === 1, `un seul BEGIN (${begins})`);
  ok(rollbacks === 1, `un seul ROLLBACK (${rollbacks})`);
  ok(commits === 0, `AUCUN COMMIT — rien ne doit subsister (${commits})`);
  ok(sql.trimEnd().endsWith('ROLLBACK;'), 'le fichier se termine par ROLLBACK');
  ok(sql.indexOf('SELECT * FROM finish()') < sql.lastIndexOf('ROLLBACK;'),
     'finish() precede le ROLLBACK');
}

// ── 3. Les tables citees existent-elles ? ────────────────────────────────
{
  const tables = new Set();
  for (const m of sql.matchAll(/public\.(\w+)/g)) tables.add(m[1]);
  // `tests.*` sont les aides Basejump, pas des tables metier.
  const metier = [...tables].filter((t) => !['uid', 'get_supabase_uid'].includes(t));
  const absentes = metier.filter((t) => !new RegExp(`CREATE TABLE IF NOT EXISTS ${t}\\b`).test(schema));
  ok(absentes.length === 0, `les ${metier.length} tables citees existent au schema`,
     absentes.join(', '));
}

// ── 4. Les colonnes des INSERT existent-elles ? ─────────────────────────
// C'est l'erreur la plus probable : une colonne NOT NULL oubliee, ou un nom
// qui a change cote cloud sans que le test le suive.
{
  const colonnesDe = (table) => {
    const bloc = new RegExp(`CREATE TABLE IF NOT EXISTS ${table} \\(([\\s\\S]*?)\\n\\);`).exec(schema);
    if (!bloc) return null;
    const cols = new Set();
    for (const ligne of bloc[1].split('\n')) {
      const m = /^\s{2}(\w+)\s+/.exec(ligne);
      if (m && !['PRIMARY', 'FOREIGN', 'UNIQUE', 'CHECK', 'CONSTRAINT'].includes(m[1].toUpperCase())) {
        cols.add(m[1]);
      }
    }
    for (const c of colonnesAjoutees.get(table) || []) cols.add(c);
    return cols;
  };

  const problemes = [];
  for (const m of sql.matchAll(/INSERT INTO public\.(\w+)\s*\(([^)]+)\)/g)) {
    const table = m[1];
    const utilisees = m[2].split(',').map((c) => c.trim());
    const dispo = colonnesDe(table);
    if (!dispo) { problemes.push(`${table}: table introuvable au schema`); continue; }
    for (const c of utilisees) if (!dispo.has(c)) problemes.push(`${table}.${c}`);
  }
  ok(problemes.length === 0, 'toutes les colonnes des INSERT existent au schema',
     problemes.join(', '));
}

// ── 5. Aucune donnee reelle ────────────────────────────────────────────
// Exigence explicite : le test ne doit exposer aucune donnee d'une vraie ecole.
{
  const courriels = [...sql.matchAll(/'([\w.+-]+@[\w.-]+)'/g)].map((m) => m[1]);
  ok(courriels.length > 0, `des comptes de test sont crees (${courriels.length})`);
  const horsNorme = courriels.filter((e) => !e.endsWith('.invalid'));
  ok(horsNorme.length === 0,
     'tous les courriels sont en .invalid (domaine reserve, jamais routable)',
     horsNorme.join(', '));

  // Aucun nom d'etablissement reel de ce depot.
  const reels = ['Genius', 'Retraite', 'Maarif', 'Reussite', 'reussite'];
  const fuites = reels.filter((n) => sql.includes(n));
  ok(fuites.length === 0, 'aucun nom d’etablissement reel n’apparait', fuites.join(', '));

  // Les identifiants sont des UUID fabriques, reconnaissables.
  const uuids = [...sql.matchAll(/'([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})'/gi)]
    .map((m) => m[1]);
  ok(uuids.length >= 10, `des UUID fabriques sont utilises (${uuids.length})`);
  ok(uuids.every((u) => /^(a{8}|b{8}|c0{7}|e0{7}|5 0{7}|50{7}|60{7}|70{7})/.test(u.replace(/\s/g, ''))),
     'et ils sont visiblement artificiels (motifs repetes)',
     uuids.filter((u) => !/^(a{8}|b{8}|c0{7}|e0{7}|50{7}|60{7}|70{7})/.test(u)).join(', '));
}

// ── 6. L'extension de test ne reste pas active ────────────────────────
// Ses auteurs demandent de ne pas la laisser en production. Creee dans la
// transaction, elle disparait au ROLLBACK.
{
  const posExt = sql.indexOf('CREATE EXTENSION IF NOT EXISTS "basejump-supabase_test_helpers"');
  const posBegin = sql.indexOf('BEGIN;');
  const posRollback = sql.lastIndexOf('ROLLBACK;');
  ok(posExt > posBegin && posExt < posRollback,
     'les aides de test sont creees DANS la transaction, donc annulees au ROLLBACK');
  ok(/CREATE EXTENSION IF NOT EXISTS pgtap/.test(sql), 'pgTAP est cree de la meme facon');
}

// ── 7. Les trois tables exigees sont bien couvertes ──────────────────
{
  for (const t of ['students', 'grades', 'fee_payments']) {
    ok(new RegExp(`tests\\.rls_enabled\\('public', '${t}'\\)`).test(sql),
       `${t} — la RLS est verifiee comme ACTIVE`);
    const mentions = (sql.match(new RegExp(`public\\.${t}\\b`, 'g')) || []).length;
    ok(mentions >= 5, `${t} — la table est sollicitee plusieurs fois (${mentions})`);
  }
}

// ── 8. Les deux sens de la frontiere sont testes ─────────────────────
// Une isolation ne vaut que si elle tient en LECTURE et en ECRITURE.
{
  ok(/count\(\*\) FROM public\.students WHERE school_id = 'bbbb/.test(sql),
     'la fuite en LECTURE d’un etablissement vers l’autre est testee');
  ok(/throws_ok\([\s\S]{0,400}INSERT INTO public\.students[\s\S]{0,200}bbbb/.test(sql),
     'la fuite en ECRITURE est testee');
  ok(/UPDATE public\.students[\s\S]{0,200}0{7}b/.test(sql), 'la modification croisee est testee');
  ok(/DELETE FROM public\.students[\s\S]{0,200}0{7}b/.test(sql), 'la suppression croisee est testee');
  ok(/active, scope_global\) VALUES[\s\S]{0,900}false/.test(sql),
     'le cas du compte DESACTIVE est couvert');
  ok(/SET LOCAL ROLE anon/.test(sql), 'le visiteur anonyme est couvert');
  ok(/lives_ok/.test(sql), 'et un cas AUTORISE est verifie (une isolation qui bloque tout serait une panne)');
}

console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} reussis, ${fail} echoues`);
if (fail === 0) {
  console.log('\nLe fichier est coherent. Il reste a l’EXECUTER sur une base de recette :');
  console.log('    supabase test db');
  console.log('Ce controle statique ne prouve PAS que les politiques RLS sont correctes.');
}
process.exit(fail === 0 ? 0 : 1);
