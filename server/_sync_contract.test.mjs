// LE CONTRAT DE SYNCHRONISATION EST-IL LE MÊME DES DEUX CÔTÉS ?
//
// Ce fichier existe à cause d'un défaut réel, trouvé le 18/09/2026 en production.
//
// B1 avait déclaré `fee_schedule_items` synchronisable côté LAN, l'avait placée
// dans PULL_ORDER, et avait écrit un test prouvant que le serveur la POUSSERAIT.
// Ce test passait. Les échéances ne sont pourtant jamais arrivées au Cloud :
// les Edge Functions, elles, ne connaissaient pas la table et la jetaient en
// silence (`if (!ALLOWED.has(ch.table)) continue`).
//
// La leçon n'est pas « il manquait un test » : il y en avait un. C'est qu'il
// testait UN SEUL CÔTÉ d'un contrat qui en a deux. Un test qui simule un Cloud
// acceptant tout ne prouve rien sur le Cloud réel.
//
// Ce fichier vérifie donc les CINQ listes qui doivent s'accorder :
//   server/db.js          SYNCED_TABLES   (ce que le LAN estampille et met en outbox)
//   server/cloudSync.js   PULL_ORDER      (ce que le LAN applique à la descente)
//   sync-push             ALLOWED         (ce que le Cloud accepte)
//   sync-pull             TABLES          (ce que le Cloud renvoie)
//   sync-verify/repair    TABLES          (ce que l'audit et la réparation couvrent)
//
// Et il rejoue un aller-retour complet à travers un Cloud SIMULÉ QUI LIT LA VRAIE
// LISTE des Edge Functions — c'est ce point qui distingue ce test du précédent.
//
// Lancer : node server/_sync_contract.test.mjs
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = dirname(fileURLToPath(import.meta.url));
const RACINE = join(ICI, '..');

process.env.NOTESCAM_DATA_DIR = mkdtempSync(join(tmpdir(), 'nc-contrat-'));
process.env.VITE_SUPABASE_URL = 'https://test.supabase.co';

let pass = 0, fail = 0;
const ok = (c, label, got) => {
  if (c) { console.log(`✅ ${label}`); pass++; }
  else { console.log(`❌ ${label} (obtenu: ${JSON.stringify(got)})`); fail++; }
};

// ── Lecture des cinq listes, depuis les SOURCES ────────────────────────────
const lire = (rel) => readFileSync(join(RACINE, rel), 'utf8');
const listeEntre = (txt, debut, fin = ']') => {
  const i = txt.indexOf(debut);
  if (i < 0) return null;
  const j = txt.indexOf(fin, i);
  if (j < 0) return null;
  return new Set([...txt.slice(i, j).matchAll(/["']([a-z][a-z0-9_]+)["']/g)].map((m) => m[1]));
};

const L = {
  SYNCED_TABLES: listeEntre(lire('server/db.js'), 'export const SYNCED_TABLES = new Set(['),
  PULL_ORDER:    listeEntre(lire('server/cloudSync.js'), 'const PULL_ORDER = ['),
  push_ALLOWED:  listeEntre(lire('supabase/functions/sync-push/index.ts'), 'const ALLOWED = new Set(['),
  pull_TABLES:   listeEntre(lire('supabase/functions/sync-pull/index.ts'), 'const TABLES = ['),
  verify_TABLES: listeEntre(lire('supabase/functions/sync-verify/index.ts'), 'const TABLES = ['),
  repair_TABLES: listeEntre(lire('supabase/functions/sync-repair/index.ts'), 'const TABLES = new Set(['),
};
for (const [nom, set] of Object.entries(L)) {
  ok(set && set.size > 10, `1. liste « ${nom} » lue (${set ? set.size : 'introuvable'} tables)`, set?.size);
}

// ── EXCLUSIONS DOCUMENTÉES ─────────────────────────────────────────────────
// Une table peut légitimement être déclarée côté LAN sans être répliquée, MAIS
// la raison doit être écrite ici. Sans cette liste, ce test serait ingérable —
// avec elle, toute nouvelle divergence est soit justifiée, soit un défaut.
//
// Les trois tables de notes : `server/db.js` le dit explicitement — « la synchro
// LAN↔Cloud des notes reste un chantier à part (les ids de compétences cloud
// diffèrent du seed local) ». Réplique-les et l'on écrase des notes avec des
// références qui ne pointent nulle part. NE PAS les ajouter sans traiter les ids.
const EXCLUSIONS = new Map([
  ['apc_notes',        'ids de référentiel divergents entre seed local et Cloud (db.js)'],
  ['prim_notes',       'idem'],
  ['mat_observations', 'idem'],
  // Configuration tarifaire par classe. La dette de chaque élève est complète
  // sans elle : `student_fees` porte un INSTANTANÉ des tranches (feeEngine.js),
  // et cette table-là se réplique. Reste un écart de CONFIGURATION, traité à part.
  ['class_fee_grids',  'gabarit de tarif ; la dette réelle vit dans student_fees (instantané), qui se réplique'],
  // Parent des signalements. Ses ENFANTS (commentaires, historique) se répliquent
  // déjà et portent une FK vers lui : voir le contrôle dédié plus bas.
  ['signalements',     'écart connu — voir le contrôle « enfant sans parent » ci-dessous'],
]);

// ── ÉCARTS CONNUS, NON ENCORE TRANCHÉS ─────────────────────────────────────
// Différent d'une exclusion : ici, c'est bien un DÉFAUT. Il est inscrit pour
// deux raisons. D'abord parce qu'un test qui échoue en permanence finit par
// être ignoré, et le jour où il signale une vraie régression personne ne le
// regarde. Ensuite parce qu'un défaut inscrit avec sa date et son coût est
// une décision en attente, pas un oubli.
//
// Le cliquet : un écart NON inscrit ici fait ÉCHOUER le test. On ne peut donc
// plus en ajouter un sans l'écrire noir sur blanc.
const GAPS_CONNUS = new Map([
  ['hr_payroll|verify_TABLES',         'paie : montée et descente OK, mais ni auditée ni réparable — 18/09/2026'],
  ['hr_payroll|repair_TABLES',         'idem'],
  ['hr_payroll_catalog|verify_TABLES', 'idem'],
  ['hr_payroll_catalog|repair_TABLES', 'idem'],
  ['hr_payroll_items|verify_TABLES',   'idem'],
  ['hr_payroll_items|repair_TABLES',   'idem'],
  ['signalements|enfant_sans_parent',  'les commentaires et l’historique se répliquent, pas le signalement '
                                     + 'qui les porte ; la FK Cloud refuse alors l’insertion et la ligne est '
                                     + 'perdue (outbox purgée). Trouvé le 18/09/2026, hors périmètre B6.1.'],
]);
const inscrit = (cle) => GAPS_CONNUS.has(cle);

// ── LA RÈGLE ────────────────────────────────────────────────────────────────
const manquantes = (cible) => [...L.SYNCED_TABLES]
  .filter((t) => !EXCLUSIONS.has(t) && !L[cible].has(t)).sort();

for (const cible of ['PULL_ORDER', 'push_ALLOWED', 'pull_TABLES']) {
  const m = manquantes(cible);
  ok(m.length === 0,
    `2. toute table synchronisée côté LAN est connue de « ${cible} »`
    + (m.length ? ` — MANQUANTES : ${m.join(', ')}` : ''), m);
}

// L'audit et la réparation sont le SEUL chemin de rattrapage d'une ligne déjà
// perdue : une table qu'ils ignorent ne pourra jamais être reconstituée.
for (const cible of ['verify_TABLES', 'repair_TABLES']) {
  const m = manquantes(cible).filter((t) => !inscrit(`${t}|${cible}`));
  ok(m.length === 0,
    `3. toute table synchronisée est couverte par « ${cible} », hors écarts inscrits`
    + (m.length ? ` — NOUVELLES MANQUANTES : ${m.join(', ')}` : ''), m);
}

// Symétrie : ce que le Cloud renvoie doit pouvoir être appliqué par le LAN.
const renvoyeNonApplique = [...L.pull_TABLES].filter((t) => !L.PULL_ORDER.has(t)).sort();
ok(renvoyeNonApplique.length === 0,
  '4. rien n’est renvoyé par sync-pull sans figurer dans PULL_ORDER (sinon ignoré en silence)',
  renvoyeNonApplique);

const pousseNonRenvoye = [...L.push_ALLOWED].filter((t) => !L.pull_TABLES.has(t)).sort();
ok(pousseNonRenvoye.length === 0,
  '5. rien ne monte sans pouvoir redescendre (synchro à sens unique = divergence garantie)',
  pousseNonRenvoye);

// L'enfant sans son parent : une FK côté Postgres fait échouer l'insertion, la
// ligne est comptée « skipped » et l'outbox est purgée — le commentaire est perdu.
const enfantsSansParent = ['signalement_comments', 'signalement_history']
  .filter((t) => L.push_ALLOWED.has(t) && !L.push_ALLOWED.has('signalements'));
ok(enfantsSansParent.length === 0 || inscrit('signalements|enfant_sans_parent'),
  '6. aucun enfant ne se réplique sans son parent, hors écarts inscrits'
  + (enfantsSansParent.length ? ' — écart INSCRIT : ' + enfantsSansParent.join(', ') + ' sans « signalements »' : ''),
  enfantsSansParent);

// ── ALLER-RETOUR RÉEL, À TRAVERS LA VRAIE LISTE DU CLOUD ───────────────────
const { db, SYNCED_TABLES } = await import('./db.js');
const { runQuery } = await import('./query.js');
const { rawUpsert, syncOnce } = await import('./cloudSync.js');

const ECOLE = 'ec1', AUTRE = 'ec2';
db.prepare('INSERT INTO schools (id,name) VALUES (?,?)').run(ECOLE, 'ECOLE UNE');
db.prepare('INSERT INTO schools (id,name) VALUES (?,?)').run(AUTRE, 'ECOLE DEUX');
db.prepare('INSERT INTO classes (id,school_id,name) VALUES (?,?,?)').run('cl', ECOLE, 'CM2');
db.prepare('INSERT INTO students (id,school_id,class_id,name) VALUES (?,?,?,?)').run('el', ECOLE, 'cl', 'NGONO Marie');
// Par `runQuery`, et non par un INSERT direct : seul le chemin réel de
// l'application alimente l'outbox. Un INSERT direct aurait créé des lignes que
// la synchro n'a jamais eu à connaître — et le test aurait prouvé le contraire
// de ce qu'il affirme.
for (const [id, annee] of [['sfiA', '2025-2026'], ['sfiB', '2026-2027']]) {
  runQuery({
    table: 'student_fee_items', action: 'insert',
    values: { id, school_id: ECOLE, student_id: 'el', name: 'Cantine',
      academic_year: annee, amount: 15000, started_at: '2025-11-15' },
  });
}

// LE CLOUD SIMULÉ. Il applique la VRAIE liste `ALLOWED` lue dans sync-push, et
// la même règle de périmètre (`belongs`) : une ligne d'une autre école est
// refusée. C'est ce qui donne sa valeur au test — un faux Cloud permissif
// laissait passer exactement le défaut que l'on corrige.
const cloud = new Map();           // `${table}|${id}` -> row
let refusesInconnues = 0, refusesPerimetre = 0, refusesUnicite = 0;

// LES CONTRAINTES D'UNICITÉ SECONDAIRES DU CLOUD, relevées le 21/09/2026 sur le
// projet réel (pg_index). Elles ne sont PAS une formalité : `sync-push` écrit en
// `upsert(row, { onConflict: 'id' })` — il ne connaît donc QUE la clé primaire.
// Une ligne qui entre en collision sur une unicité SECONDAIRE (même couple
// métier, id différent) n'est pas fusionnée : l'INSERT est rejeté par Postgres,
// la ligne est comptée « skipped »… et l'outbox est purgée quand même. Perte
// silencieuse, exactement comme le défaut d'origine, mais par un autre chemin.
//
// Le faux Cloud les applique donc AUSSI. Sans cela, il resterait plus permissif
// que le vrai, et c'est précisément ce qui avait laissé passer le premier défaut.
const UNICITES_CLOUD = {
  fee_schedule_items: ['student_fee_item_id', 'period_key'],
  cash_sessions:      ['school_id', 'date', 'cashier_id'],
};
const cleMetier = (table, row) => {
  const cols = UNICITES_CLOUD[table];
  return cols ? `${table}#${cols.map((c) => row[c]).join('|')}` : null;
};
const edgeReel = (schoolIdDuJeton) => async (path, body) => {
  if (path === 'sync-pull') return { rows: {}, tombstones: [], cursor: null, tomb_cursor: null };
  if (path !== 'sync-push') throw new Error('chemin inattendu : ' + path);
  let applied = 0, skipped = 0;
  for (const ch of body.changes || []) {
    if (!L.push_ALLOWED.has(ch.table)) { refusesInconnues++; continue; }       // le défaut d'origine
    if (ch.row?.school_id !== schoolIdDuJeton) { refusesPerimetre++; skipped++; continue; }
    // Unicité secondaire : le couple métier est-il déjà tenu par un AUTRE id ?
    const cle = cleMetier(ch.table, ch.row);
    if (cle) {
      const detenteur = [...cloud.entries()]
        .find(([k, r]) => k.startsWith(`${ch.table}|`) && cleMetier(ch.table, r) === cle);
      if (detenteur && detenteur[1].id !== ch.row.id) { refusesUnicite++; skipped++; continue; }
    }
    cloud.set(`${ch.table}|${ch.row.id}`, { ...ch.row });
    applied++;
  }
  return { applied, skipped };
};

// Création — tous les états de B4/B5/B6 sur des périodes distinctes.
const ETATS = [
  { id: 'e1', period_key: '2025-11', status: 'due' },
  { id: 'e2', period_key: '2025-12', status: 'exempted' },
  { id: 'e3', period_key: '2026-01', status: 'abandoned' },
  { id: 'e4', period_key: '2026-02', status: 'not_applicable' },
];
for (const e of ETATS) {
  runQuery({
    table: 'fee_schedule_items', action: 'insert',
    values: {
      id: e.id, school_id: ECOLE, student_id: 'el', student_fee_item_id: 'sfiA',
      academic_year: '2025-2026', period_key: e.period_key,
      period_label: e.period_key, amount_due: 15000, status: e.status,
    },
  });
}
// Une échéance d'une AUTRE année scolaire, même élève, même service.
runQuery({
  table: 'fee_schedule_items', action: 'insert',
  values: {
    id: 'e5', school_id: ECOLE, student_id: 'el', student_fee_item_id: 'sfiB',
    academic_year: '2026-2027', period_key: '2026-11', period_label: '2026-11',
    amount_due: 20000, status: 'due',
  },
});
// Un versement rattaché à une période.
runQuery({
  table: 'fee_payments', action: 'insert',
  values: {
    id: 'p1', school_id: ECOLE, student_id: 'el', academic_year: '2025-2026',
    amount: 15000, date: '2025-11-20', student_fee_item_id: 'sfiA', fee_schedule_item_id: 'e1',
  },
});

await syncOnce({ edge: edgeReel(ECOLE) });

ok(refusesInconnues === 0,
  '7. ALLER : aucune ligne rejetée comme « table inconnue » par le Cloud', refusesInconnues);
for (const e of ETATS) {
  ok(cloud.has(`fee_schedule_items|${e.id}`),
    `8. ALLER : l’échéance « ${e.status} » est arrivée au Cloud`, [...cloud.keys()]);
}
ok(cloud.get('fee_schedule_items|e2')?.status === 'exempted',
  '9. ALLER : le statut EXEMPTÉ est conservé, pas ramené à « dû »', cloud.get('fee_schedule_items|e2'));
ok(cloud.get('fee_schedule_items|e3')?.status === 'abandoned', '10. ALLER : ABANDONNÉ conservé');
ok(cloud.get('fee_schedule_items|e4')?.status === 'not_applicable', '11. ALLER : NON APPLICABLE conservé');
ok(cloud.get('fee_payments|p1')?.fee_schedule_item_id === 'e1',
  '12. ALLER : le lien versement → période survit au voyage', cloud.get('fee_payments|p1'));
ok(cloud.get('student_fee_items|sfiA')?.started_at === '2025-11-15',
  '13. ALLER : la date d’entrée dans le service (B6) survit aussi', cloud.get('student_fee_items|sfiA'));

// Isolation par ANNÉE SCOLAIRE : deux années coexistent sans s'écraser.
ok(cloud.get('fee_schedule_items|e5')?.academic_year === '2026-2027'
  && cloud.get('fee_schedule_items|e1')?.academic_year === '2025-2026',
  '14. ISOLATION ANNÉE : deux années du même élève et du même service coexistent',
  [cloud.get('fee_schedule_items|e1')?.academic_year, cloud.get('fee_schedule_items|e5')?.academic_year]);
ok(cloud.get('fee_schedule_items|e5')?.amount_due === 20000,
  '15. ISOLATION ANNÉE : le tarif de l’année suivante n’écrase pas celui de l’année en cours');

// MODIFICATION puis re-synchro : le Cloud suit.
runQuery({
  table: 'fee_schedule_items', action: 'update',
  values: { status: 'exempted', updated_at: new Date(Date.now() + 1000).toISOString() },
  filters: [{ col: 'id', op: 'eq', val: 'e1' }, { col: 'school_id', op: 'eq', val: ECOLE }],
});
await syncOnce({ edge: edgeReel(ECOLE) });
ok(cloud.get('fee_schedule_items|e1')?.status === 'exempted',
  '16. MODIFICATION : la décision prise après coup remonte aussi', cloud.get('fee_schedule_items|e1')?.status);

// IDEMPOTENCE : re-synchroniser sans rien changer ne duplique rien.
const avant = cloud.size;
await syncOnce({ edge: edgeReel(ECOLE) });
ok(cloud.size === avant, '17. IDEMPOTENCE : une synchro à vide n’ajoute aucune ligne', { avant, apres: cloud.size });

// ISOLATION ÉCOLE : une ligne d'une autre école est refusée par le périmètre.
refusesPerimetre = 0;
await edgeReel(ECOLE)('sync-push', {
  changes: [{ table: 'fee_schedule_items', op: 'upsert', row: { id: 'intrus', school_id: AUTRE, period_key: '2025-11' } }],
});
ok(refusesPerimetre === 1 && !cloud.has('fee_schedule_items|intrus'),
  '18. ISOLATION ÉCOLE : une échéance d’une autre école est refusée par le périmètre du jeton',
  { refusesPerimetre, present: cloud.has('fee_schedule_items|intrus') });

// ── RETOUR : Cloud → LAN ───────────────────────────────────────────────────
ok(SYNCED_TABLES.has('fee_schedule_items') && SYNCED_TABLES.has('cash_sessions'),
  '19. RETOUR : les deux tables sont estampillées côté LAN');

const descendue = rawUpsert('fee_schedule_items', {
  id: 'e1', school_id: ECOLE, student_id: 'el', student_fee_item_id: 'sfiA',
  academic_year: '2025-2026', period_key: '2025-11', period_label: 'Novembre 2025',
  amount_due: 15000, status: 'abandoned',
  updated_at: new Date(Date.now() + 600000).toISOString(),
});
ok(descendue, '20. RETOUR : une décision venue du Cloud est acceptée par le LAN', descendue);
ok(db.prepare('SELECT status FROM fee_schedule_items WHERE id = ?').get('e1')?.status === 'abandoned',
  '21. RETOUR : l’état local converge vers la décision distante');

// Pas de doublon : la même ligne redescendue deux fois reste UNE ligne.
rawUpsert('fee_schedule_items', {
  id: 'e1', school_id: ECOLE, student_id: 'el', student_fee_item_id: 'sfiA',
  academic_year: '2025-2026', period_key: '2025-11', period_label: 'Novembre 2025',
  amount_due: 15000, status: 'abandoned', updated_at: new Date(Date.now() + 700000).toISOString(),
});
ok(db.prepare("SELECT count(*) n FROM fee_schedule_items WHERE student_fee_item_id='sfiA' AND period_key='2025-11'").get().n === 1,
  '22. RETOUR : aucune duplication — l’unicité (frais, période) tient à la descente');

// Le PULL_ORDER doit placer l'enfant APRÈS son parent, sinon la FK casse.
const ordre = [...L.PULL_ORDER];
ok(ordre.indexOf('fee_schedule_items') > ordre.indexOf('student_fee_items'),
  '23. RETOUR : PULL_ORDER applique student_fee_items AVANT ses échéances (FK)',
  { parent: ordre.indexOf('student_fee_items'), enfant: ordre.indexOf('fee_schedule_items') });
ok(ordre.indexOf('fee_schedule_items') > ordre.indexOf('students'),
  '24. RETOUR : et les élèves avant tout le reste (FK)');

// ── UNICITÉ SECONDAIRE : LE SECOND CHEMIN DE PERTE ────────────────────────
// Relevé le 21/09/2026 sur le projet réel : `fee_schedule_items` porte
// UNIQUE(student_fee_item_id, period_key) côté Cloud ET côté LAN (schema.sql).
// Les deux schémas s'accordent — donc une échéance née en LAN ne peut pas, à
// elle seule, violer la contrainte en montant. C'est ce que vérifie le 25.
ok(refusesUnicite === 0,
  '25. ALLER : aucune échéance rejetée par une unicité SECONDAIRE du Cloud '
  + '(sync-push écrit onConflict:id — une telle collision serait perdue en silence)',
  refusesUnicite);

// Le 26 démontre le mode de perte qui SUBSISTE : si le Cloud tient déjà le
// couple (frais, période) sous un AUTRE id — un échéancier généré des deux
// côtés — la montée est refusée. Ce n'est pas corrigeable dans le contrat de
// synchro (il faudrait un onConflict par table, ou une génération d'id
// déterministe). On le MESURE pour qu'il soit connu, pas subi.
const avantCollision = cloud.size;
await edgeReel(ECOLE)('sync-push', {
  changes: [{
    table: 'fee_schedule_items', op: 'upsert',
    row: { id: 'jumeau-de-e1', school_id: ECOLE, student_id: 'el',
      student_fee_item_id: 'sfiA', period_key: '2025-11', amount_due: 15000, status: 'due' },
  }],
});
ok(refusesUnicite === 1 && cloud.size === avantCollision,
  '26. ALLER : une échéance jumelle (même frais, même période, autre id) est refusée '
  + 'par le Cloud sans créer de doublon — mode de perte MESURÉ, à traiter par un id déterministe',
  { refusesUnicite, avant: avantCollision, apres: cloud.size });

if (GAPS_CONNUS.size) {
  console.log(`\n── ${GAPS_CONNUS.size} ÉCART(S) INSCRIT(S), en attente de décision ──`);
  for (const [cle, motif] of GAPS_CONNUS) console.log(`   • ${cle} : ${motif}`);
}
console.log(`\n=== ${fail === 0 ? 'OK' : 'ÉCHEC'} : ${pass} ok, ${fail} ko ===`);
process.exitCode = fail === 0 ? 0 : 1;
