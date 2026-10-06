// LE RATTRAPAGE DES LIGNES DÉJÀ PERDUES
//
// Corriger les listes des Edge Functions suffit pour les échéances À VENIR.
// Cela ne ramène RIEN de ce qui a déjà été perdu : `push()` purge l'outbox dès
// que `sync-push` répond 200 (server/cloudSync.js), or il répondait 200 tout en
// jetant `fee_schedule_items`. Les échéances créées avant le déploiement du
// 21/09/2026 ne sont donc plus nulle part dans la file d'attente — elles
// n'existent qu'en base LAN, et le Cloud ne les a jamais vues.
//
// Le seul chemin de retour prévu est `autoRepair` : `sync-verify` compare les
// empreintes LAN/Cloud, repère la table divergente, `sync-repair` renvoie les
// lignes cloud autoritaires, et les lignes locales absentes du Cloud sont
// RÉENFILÉES dans l'outbox pour repartir au prochain push.
//
// Ce fichier vérifie que ce chemin fonctionne pour `fee_schedule_items`, et
// qu'il peut être rejoué sans créer de doublon — un rattrapage qui duplique la
// dette d'un élève serait pire que l'absence de rattrapage.
//
// AUCUNE DONNÉE DE PRODUCTION : base temporaire, Cloud simulé qui applique les
// VRAIES listes déployées et les VRAIES contraintes d'unicité du projet.
//
// Lancer : node server/_sync_rattrapage.test.mjs
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = dirname(fileURLToPath(import.meta.url));
const RACINE = join(ICI, '..');

process.env.NOTESCAM_DATA_DIR = mkdtempSync(join(tmpdir(), 'nc-rattrapage-'));
process.env.VITE_SUPABASE_URL = 'https://test.supabase.co';

let pass = 0, fail = 0;
const ok = (c, label, got) => {
  if (c) { console.log(`✅ ${label}`); pass++; }
  else { console.log(`❌ ${label} (obtenu: ${JSON.stringify(got)})`); fail++; }
};

// La liste RÉELLE de sync-repair : si la table n'y est pas, aucun rattrapage
// n'est possible, quoi que fasse le LAN.
const srcRepair = readFileSync(join(RACINE, 'supabase/functions/sync-repair/index.ts'), 'utf8');
const i = srcRepair.indexOf('const TABLES = new Set([');
const REPAIR_TABLES = new Set([...srcRepair.slice(i, srcRepair.indexOf(']', i)).matchAll(/'([a-z][a-z0-9_]+)'/g)].map((m) => m[1]));
ok(REPAIR_TABLES.has('fee_schedule_items'), '1. sync-repair couvre fee_schedule_items (sans quoi rien n’est rattrapable)');
ok(REPAIR_TABLES.has('cash_sessions'), '2. sync-repair couvre cash_sessions');

const { db } = await import('./db.js');
const { runQuery } = await import('./query.js');
const { autoRepair } = await import('./syncRepair.js');

// Le contrôle LAN RÉEL. autoRepair ne répare que ce que verifyIntegrity déclare
// divergent, et verifyIntegrity ne compare que VERIFY_TABLES. Plus bas, `verify`
// est simulé : sans ce contrôle-ci, le test passait alors que la vraie liste
// LAN ignorait fee_schedule_items (trouvé le 22/09/2026, en préparant la 0.2.7).
const { VERIFY_TABLES } = await import('./syncVerify.js');
ok(VERIFY_TABLES.includes('fee_schedule_items'),
  '2b. le contrôle LAN compare fee_schedule_items (sinon autoRepair ne la voit jamais)');
ok(VERIFY_TABLES.includes('cash_sessions'), '2c. le contrôle LAN compare cash_sessions');

const ECOLE = 'ec1';
db.prepare('INSERT INTO schools (id,name) VALUES (?,?)').run(ECOLE, 'ECOLE UNE');
db.prepare('INSERT INTO classes (id,school_id,name) VALUES (?,?,?)').run('cl', ECOLE, 'CM2');
db.prepare('INSERT INTO students (id,school_id,class_id,name) VALUES (?,?,?,?)').run('el', ECOLE, 'cl', 'NGONO Marie');
runQuery({
  table: 'student_fee_items', action: 'insert',
  values: { id: 'sfiA', school_id: ECOLE, student_id: 'el', name: 'Cantine',
    academic_year: '2025-2026', amount: 15000, started_at: '2025-11-15' },
});

// ── L'ÉTAT D'AVANT LE CORRECTIF ────────────────────────────────────────────
// Trois échéances en base LAN, créées par le chemin réel de l'application…
const PERDUES = ['2025-11', '2025-12', '2026-01'];
for (const [n, pk] of PERDUES.entries()) {
  runQuery({
    table: 'fee_schedule_items', action: 'insert',
    values: { id: `perdue${n}`, school_id: ECOLE, student_id: 'el', student_fee_item_id: 'sfiA',
      academic_year: '2025-2026', period_key: pk, period_label: pk, amount_due: 15000, status: 'due' },
  });
}
// …puis l'outbox est VIDÉE, exactement comme l'a fait chaque cycle de synchro
// depuis B1 : le Cloud répondait 200 en jetant la table, et la purge suivait.
db.prepare('DELETE FROM sync_outbox').run();
ok(db.prepare('SELECT count(*) n FROM sync_outbox').get().n === 0,
  '3. point de départ : les échéances sont en base LAN mais PLUS dans l’outbox (la perte historique)');
ok(db.prepare('SELECT count(*) n FROM fee_schedule_items').get().n === 3,
  '4. point de départ : les 3 échéances existent bien côté LAN');

// ── LE CLOUD SIMULÉ ────────────────────────────────────────────────────────
// Vide de fee_schedule_items (il ne les a jamais reçues), et porteur de la
// contrainte UNIQUE(student_fee_item_id, period_key) relevée sur le projet réel.
const cloud = new Map();
let violations = 0;
const cle = (r) => `${r.student_fee_item_id}|${r.period_key}`;
const poser = (row) => {
  const detenteur = [...cloud.values()].find((r) => cle(r) === cle(row) && r.id !== row.id);
  if (detenteur) { violations++; return false; }
  cloud.set(row.id, { ...row });
  return true;
};

// `sync-verify` simulé : compare les empreintes des deux côtés.
const verify = async () => {
  const lan = db.prepare('SELECT count(*) n FROM fee_schedule_items WHERE school_id = ?').get(ECOLE).n;
  const distant = cloud.size;
  const mismatches = lan === distant ? [] : ['fee_schedule_items'];
  return { ok: mismatches.length === 0, mismatches, divergences: mismatches.map((t) => ({ table: t, tableOnly: true })) };
};
// `sync-repair` simulé : renvoie les lignes cloud autoritaires de la table.
let appelsRepair = 0;
const repairEdge = async ({ table }) => {
  appelsRepair++;
  if (!REPAIR_TABLES.has(table)) throw new Error('bad_table');
  return { rows: [...cloud.values()].filter((r) => r.school_id === ECOLE), tombstones: [] };
};
// Le push réel du LAN, à travers la vraie liste ALLOWED de sync-push.
const srcPush = readFileSync(join(RACINE, 'supabase/functions/sync-push/index.ts'), 'utf8');
const j = srcPush.indexOf('const ALLOWED = new Set([');
const PUSH_ALLOWED = new Set([...srcPush.slice(j, srcPush.indexOf(']', j)).matchAll(/'([a-z][a-z0-9_]+)'/g)].map((m) => m[1]));
const sync = async () => {
  const entries = db.prepare('SELECT * FROM sync_outbox ORDER BY id').all();
  for (const e of entries) {
    if (!PUSH_ALLOWED.has(e.tablename)) continue;
    const row = db.prepare(`SELECT * FROM "${e.tablename}" WHERE id = ?`).get(e.row_id);
    if (row) poser(row);
  }
  db.prepare('DELETE FROM sync_outbox').run();
};

// ── PREMIER RATTRAPAGE ─────────────────────────────────────────────────────
const r1 = await autoRepair({ verify, repairEdge, sync });
ok(appelsRepair > 0, '5. le rattrapage a bien interrogé sync-repair', appelsRepair);
ok(cloud.size === 3, '6. RATTRAPAGE : les 3 échéances perdues sont remontées au Cloud', cloud.size);
for (const pk of PERDUES) {
  ok([...cloud.values()].some((r) => r.period_key === pk),
    `7. RATTRAPAGE : l’échéance ${pk} est arrivée`, [...cloud.values()].map((r) => r.period_key));
}
ok(r1.ok, '8. RATTRAPAGE : le rapport d’intégrité est revenu au vert', r1.ok);
ok(violations === 0, '9. RATTRAPAGE : aucune violation d’unicité pendant la remontée', violations);

// ── IDEMPOTENCE : REJOUER NE DOIT RIEN ABÎMER ──────────────────────────────
const empreinte = JSON.stringify([...cloud.entries()].sort());
for (let tour = 1; tour <= 3; tour++) {
  await autoRepair({ verify, repairEdge, sync });
  ok(cloud.size === 3, `10. IDEMPOTENCE (tour ${tour}) : toujours 3 échéances, aucun doublon créé`, cloud.size);
}
ok(JSON.stringify([...cloud.entries()].sort()) === empreinte,
  '11. IDEMPOTENCE : le contenu du Cloud est identique après trois rejeux');
ok(violations === 0, '12. IDEMPOTENCE : aucune violation d’unicité sur les rejeux', violations);

// L'unicité métier tient côté LAN aussi : une échéance par (frais, période).
const doublons = db.prepare(`
  SELECT student_fee_item_id, period_key, count(*) n FROM fee_schedule_items
  GROUP BY student_fee_item_id, period_key HAVING n > 1`).all();
ok(doublons.length === 0, '13. IDEMPOTENCE : aucune échéance dupliquée côté LAN', doublons);
ok([...cloud.values()].length === new Set([...cloud.values()].map(cle)).size,
  '14. IDEMPOTENCE : aucun couple (frais, période) en double côté Cloud');

// ── LE CAS DE LA LIGNE DÉJÀ À JOUR ─────────────────────────────────────────
// Un rattrapage sur une table CONVERGENTE ne doit rien faire du tout : c'est ce
// qui rend l'opération sûre à répéter sur les 6 502 lignes de production.
appelsRepair = 0;
const r2 = await autoRepair({ verify, repairEdge, sync });
ok(r2.ok && appelsRepair === 0,
  '15. une table déjà convergente ne déclenche AUCUN appel de réparation (sûr à rejouer en prod)',
  { ok: r2.ok, appelsRepair });

// ── DE BOUT EN BOUT, AVEC LE CONTRÔLE LAN RÉEL ─────────────────────────────
// Jusqu'ici `verify` était simulé : le test prouvait la mécanique d'autoRepair,
// pas que le chemin réel la déclenche. Ici, `verifyIntegrity` est le VRAI, avec
// sa propre liste et ses propres empreintes ; seul le Cloud est simulé, et il
// calcule ses empreintes avec la formule de la RPC `sync_integrity`
// (md5 de « id:version » trié par id, exactement comme localPlain côté LAN).
const { verifyIntegrity } = await import('./syncVerify.js');
const { createHash } = await import('node:crypto');
const md5 = (s) => createHash('md5').update(s, 'utf8').digest('hex');
const empreinteDe = (lignes) => {
  const tri = [...lignes].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { checksum: md5(tri.map((r) => `${r.id}:${r.version == null ? '' : r.version}`).join(',')), count: tri.length };
};
// Le Cloud simulé : ses échéances sont celles de `cloud`, et pour TOUTE AUTRE
// table il est réputé identique au LAN (empreinte recopiée depuis la base
// locale). Une divergence signalée ne peut donc venir que des échéances.
const edgeVerify = async ({ op, tables }) => {
  if (op !== 'tablelevel') return { parts: {} };
  const plain = {};
  for (const t of tables) {
    if (t === 'fee_schedule_items') {
      plain[t] = empreinteDe([...cloud.values()].filter((r) => r.school_id === ECOLE));
      continue;
    }
    const existe = db.prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?`).get(t);
    const lignes = existe
      ? db.prepare(`SELECT id, version FROM "${t}"${t === 'schools' ? '' : ' WHERE school_id = ?'}`)
        .all(...(t === 'schools' ? [] : [ECOLE]))
      : [];
    plain[t] = existe ? empreinteDe(lignes) : { checksum: null, count: null };
  }
  return { merkle: {}, plain };
};

// Une échéance NEUVE créée en LAN, puis l'outbox purgée : la perte, à nouveau.
runQuery({
  table: 'fee_schedule_items', action: 'insert',
  values: { id: 'perdue3', school_id: ECOLE, student_id: 'el', student_fee_item_id: 'sfiA',
    academic_year: '2025-2026', period_key: '2026-02', period_label: '2026-02', amount_due: 15000, status: 'due' },
});
db.prepare('DELETE FROM sync_outbox').run();

const rapportAvant = await verifyIntegrity({ edge: edgeVerify, promote: false });
ok(rapportAvant.mismatches.includes('fee_schedule_items'),
  '16. BOUT EN BOUT : le contrôle LAN réel VOIT la divergence des échéances', rapportAvant.mismatches);
ok(rapportAvant.mismatches.length === 1,
  '17. BOUT EN BOUT : et il ne signale rien d’autre (aucun faux positif)', rapportAvant.mismatches);

const r3 = await autoRepair({
  verify: () => verifyIntegrity({ edge: edgeVerify, promote: false }), repairEdge, sync,
});
ok(cloud.size === 4, '18. BOUT EN BOUT : l’échéance perdue est remontée par le chemin réel', cloud.size);
ok(r3.ok, '19. BOUT EN BOUT : le rapport d’intégrité repasse au vert', r3.mismatches ?? r3.ok);
ok(violations === 0, '20. BOUT EN BOUT : toujours aucune violation d’unicité', violations);
const apres = await verifyIntegrity({ edge: edgeVerify, promote: false });
ok(apres.ok && apres.mismatches.length === 0,
  '21. BOUT EN BOUT : un contrôle relancé après coup ne trouve plus rien', apres.mismatches);

console.log(`\n=== ${fail === 0 ? 'OK' : 'ÉCHEC'} : ${pass} ok, ${fail} ko ===`);
process.exitCode = fail === 0 ? 0 : 1;
