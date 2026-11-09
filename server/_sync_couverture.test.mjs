// Test — AUCUNE TABLE NE PEUT ÊTRE OUBLIÉE PAR LA SYNCHRONISATION.
//
// POURQUOI CE TEST EXISTE, ALORS QUE `_sync_contract.test.mjs` EXISTE DÉJÀ.
// Le contrat recoupe sept listes entre elles et refuse qu'une table de
// `SYNCED_TABLES` manque à l'une d'elles. Mais il PART de `SYNCED_TABLES`.
// Une table qui n'y figure pas n'est réclamée par aucune comparaison : elle
// n'apparaît nulle part, le test passe, et elle n'est répliquée d'aucun côté.
//
// C'est exactement par là que `parent_student_links` est passée. Les frères et
// sœurs saisis à l'école ne remontaient jamais, et RIEN ne le signalait — ni
// une erreur, ni un test, ni un écran. Mesuré le 31/10/2026 : sur 118 tables du
// schéma, 34 n'étaient ni répliquées, ni déclarées locales, ni inscrites nulle
// part.
//
// Ce test-ci part donc du SCHÉMA, pas des listes. Toute table doit être classée
// dans exactement une des trois catégories ci-dessous. Une table neuve non
// classée fait ÉCHOUER le test : c'est le cliquet qui manquait.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (rel) => readFileSync(join(RACINE, rel), 'utf8');

let pass = 0, fail = 0;
const ok = (c, label, got) => {
  if (c) { console.log(`✅ ${label}`); pass++; }
  else { console.log(`❌ ${label} (obtenu: ${JSON.stringify(got)})`); fail++; }
};

// ── Catégorie 1 : RÉPLIQUÉES ──────────────────────────────────────────────
// Lues depuis la source, pas recopiées : une liste recopiée dérive.
const dbjs = lire('server/db.js');
const bloc = dbjs.slice(dbjs.indexOf('export const SYNCED_TABLES = new Set(['));
const SYNCED = new Set([...bloc.slice(0, bloc.indexOf(']);'))
  .matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1]));

// ── Catégorie 2 : LOCALES PAR NATURE ──────────────────────────────────────
// Elles ne doivent JAMAIS quitter le poste. Chacune porte sa raison : sans
// elle, cette liste redeviendrait le tapis sous lequel on pousse les oublis.
// « idem » reprend le motif de l'entrée précédente : lisible à l'écriture, et
// développé ici pour que CHAQUE table porte sa phrase entière — le contrôle 4
// vérifie des motifs, pas des renvois.
const motifs = (paires) => {
  let dernier = '';
  return new Map(paires.map(([t, raison]) => {
    if (String(raison).trim() !== 'idem') dernier = raison;
    return [t, String(raison).trim() === 'idem' ? dernier : raison];
  }));
};

const LOCALES = motifs([
  // Mécanique de synchronisation elle-même — la répliquer serait circulaire.
  ['sync_cursor',       'curseur local de synchronisation'],
  ['sync_outbox',       'file de poussée locale'],
  ['sync_pull_retry',   'file de rejeu locale (orphelins en attente de leur parent)'],
  ['domain_events',     'journal append-only, réplication par curseur seq (chantier dédié)'],
  ['audit_events',      'idem'],
  // État de CE poste : n'a aucun sens ailleurs.
  ['license_activation', 'licence liée à l’empreinte de CETTE machine'],
  ['migration_state',    'état local des migrations de CE poste'],
  ['cloud_activation',   'état du lien cloud de CE poste'],
  ['cloud_push_state',   'curseur de poussée de CE poste'],
  ['pwd_mirror_queue',   'file locale du pont d’identifiants (chiffrée, consommée sur place)'],
  ['applied_decisions',  'journal d’idempotence local (évite de rejouer une décision)'],
  ['applied_budget_ops', 'idem, côté budget'],
  ['app_settings',       'préférences de CE poste (imprimante, affichage)'],
  // Comptes éditeur : hors données d'école.
  ['superadmins',        'comptes éditeur, jamais des données d’établissement'],
  ['users',              'identités : la source est le Cloud, le pont d’identifiants les descend'],
  // Référentiel officiel livré AVEC le paquet (`officiel-seed.sql`) : identique
  // sur tous les postes, versionné par la mise à jour. Le répliquer ferait
  // voyager des lignes que les deux côtés possèdent déjà à l'identique.
  ['country_education_config', 'référentiel livré avec le paquet (seed)'],
  ['evaluation_system',        'idem'],
  ['apc_cycles', 'idem'], ['apc_classes', 'idem'], ['apc_trimestres', 'idem'],
  ['apc_sequences', 'idem'], ['apc_competences', 'idem'], ['apc_referentiel_versions', 'idem'],
  ['mat_referentiel_versions', 'idem'], ['mat_niveaux', 'idem'], ['mat_domaines', 'idem'],
  ['prim_referentiel_versions', 'idem'], ['prim_cycles', 'idem'], ['prim_niveaux', 'idem'],
  ['prim_competences', 'idem'], ['prim_criteres', 'idem'], ['prim_cote_bareme', 'idem'],
  ['prim_bareme_criteres', 'idem'], ['prim_niveau_competences', 'idem'],
  ['sc_series', 'idem'], ['sc_groupes', 'idem'], ['sc_matieres', 'idem'],
  ['sc_serie_matieres', 'idem'], ['sc_referentiel_versions', 'idem'],
  ['bil_series', 'idem'], ['bil_groupes', 'idem'], ['bil_matieres', 'idem'],
  ['bil_serie_matieres', 'idem'], ['bil_referentiel_versions', 'idem'],
]);

// ── Catégorie 3 : À BRANCHER, ET POURQUOI ÇA NE L'EST PAS ENCORE ──────────
//
// Ce sont de VRAIES données d'école qui DOIVENT circuler. Elles sont ici, et
// non dans `LOCALES`, parce qu'une exclusion muette est précisément ce qui a
// coûté les liens de fratrie. Chacune porte son blocage et sa date.
//
// LE BLOCAGE RÉEL, VÉRIFIÉ LE 01/11/2026. Ces tables EXISTENT côté Cloud — la
// première version de cet audit disait le contraire, parce qu'elle n'avait
// cherché que dans « supabase/migrations/ », alors que ce dépôt garde son DDL
// Cloud dans les « supabase_*.sql » de la racine. Ce qui leur manque est plus
// petit, et plus précis :
//
//   1. les colonnes de synchro Phase 2 (updated_at / version / device_id
//      + trigger « touch_sync_row ») ne sont posées sur AUCUNE des onze ;
//   2. elles ne figurent dans aucune des quatre listes des Edge Functions ;
//   3. SIX d'entre elles n'ont pas de colonne « id » du tout — clé primaire
//      composite. Or « rawUpsert » exige un « id », et l'outbox s'indexe sur
//      « row_id ». Elles ne peuvent pas passer dans le moteur actuel sans un
//      identifiant déterminé (UUID v5 de leur clé naturelle, cf.
//      « src/lib/sourceKey.js » — le dépôt a déjà ce motif).
//
// Les points 1 et 2 sont une modification de PRODUCTION (migration Cloud +
// redéploiement des Edge Functions) : ils attendent un accord explicite.
const A_BRANCHER = motifs([
  // Trouvée par `_sync_rattrapage.test.mjs` en branchant les liens, le
  // 01/11/2026 : « no such column: school_id ». Le moteur partitionne tout par
  // école (`WHERE school_id = ?`, sauf `schools`) ; cette table n'a PAS de
  // school_id, et c'est délibéré — supabase_parent_portal.sql le dit : y
  // rattacher un parent à une école lui ouvrirait l'établissement entier via
  // les policies, qui accordent l'accès sur la seule appartenance.
  // Le lien, lui, PORTE school_id : c'est `parent_student_links` qui transporte
  // la fratrie, et elle est branchée. Le compte parent naît au Cloud (RPC
  // admin_create_parent_account) et descend par le pont d'identifiants.
  ['parent_accounts', 'pas de school_id, et volontairement : le moteur partitionne par école. Le lien parent/élève porte l’information et voyage, lui'],
  ['apc_matieres',         'matières propres à l’école (portent school_id) — existe au Cloud ; va avec apc_classe_matieres, qui n’a pas d’id'],
  ['apc_classe_matieres',  'rattachement matière↔classe — clé composite SANS id : identifiant déterminé requis'],
  ['referentiel_libelles', 'libellés choisis par l’école — clé composite SANS id : identifiant déterminé requis'],
  ['deleted_fee_payments', 'paiements annulés — donnée COMPTABLE ; existe au Cloud, manque colonnes de synchro et listes Edge'],
  ['discipline_statistics', 'vie scolaire — existe au Cloud et porte DÉJÀ updated_at/version/device_id ; manque les listes Edge'],
  ['prim_competences_masques', 'compétences masquées — clé composite SANS id : identifiant déterminé requis'],
  ['prim_criteres_masques',    'idem'],
  ['mat_domaines_masques',     'idem'],
  ['apc_competences_masques',  'idem'],
  ['prim_competences_classe_masquees', 'masquage d’une compétence pour UNE classe — réglage d’affichage local comme les masques de l’école, clé composite SANS id : identifiant déterminé requis pour voyager'],
  ['prim_criteres_masques_classe', 'masque des critères par (classe, compétence, critère) — réglage d’affichage local comme ses voisines, clé composite SANS id'],
  ['prim_criteres_masques_init', 'marqueur « classe initialisée » du masque ci-dessus — même nature, même statut local'],
]);

// ── LA RÈGLE ──────────────────────────────────────────────────────────────
const tables = [...new Set([...lire('server/schema.sql')
  .matchAll(/CREATE TABLE IF NOT EXISTS\s+([a-z0-9_]+)/g)].map((m) => m[1]))];

ok(tables.length > 100, `0. schéma lu (${tables.length} tables)`, tables.length);

const classee = (t) => SYNCED.has(t) || LOCALES.has(t) || A_BRANCHER.has(t);
const orphelines = tables.filter((t) => !classee(t)).sort();
ok(orphelines.length === 0,
  '1. toute table du schéma est classée : répliquée, locale, ou à brancher'
  + (orphelines.length ? ` — NON CLASSÉE(S) : ${orphelines.join(', ')}` : ''),
  orphelines);

// Une table ne peut pas être dans deux catégories : le classement doit trancher.
const doubles = tables.filter((t) =>
  [SYNCED.has(t), LOCALES.has(t), A_BRANCHER.has(t)].filter(Boolean).length > 1).sort();
ok(doubles.length === 0,
  '2. aucune table n’est classée deux fois' + (doubles.length ? ` — ${doubles.join(', ')}` : ''),
  doubles);

// Les deux listes manuelles ne doivent pas parler de tables disparues : une
// entrée morte fait croire qu'un sujet est traité alors qu'il n'existe plus.
const connues = new Set(tables);
const fantomes = [...LOCALES.keys(), ...A_BRANCHER.keys()].filter((t) => !connues.has(t)).sort();
ok(fantomes.length === 0,
  '3. aucune entrée ne vise une table absente du schéma'
  + (fantomes.length ? ` — ${fantomes.join(', ')}` : ''), fantomes);

// Chaque motif doit être une phrase, pas un geste. Un « ok » ou un « TODO » ne
// documente rien et rouvrirait la porte que ce test ferme.
const motifsCourts = [...LOCALES, ...A_BRANCHER]
  .filter(([, raison]) => String(raison).trim().length < 12).map(([t]) => t);
ok(motifsCourts.length === 0,
  '4. chaque table non répliquée porte un motif écrit'
  + (motifsCourts.length ? ` — motif trop court : ${motifsCourts.join(', ')}` : ''),
  motifsCourts);

console.log('');
console.log(`   répliquées : ${tables.filter((t) => SYNCED.has(t)).length}`
  + ` · locales : ${tables.filter((t) => LOCALES.has(t)).length}`
  + ` · à brancher : ${tables.filter((t) => A_BRANCHER.has(t)).length}`);
console.log('');
console.log(`=== ${fail ? 'KO' : 'OK'} : ${pass} ok, ${fail} ko ===`);
process.exit(fail ? 1 : 0);
