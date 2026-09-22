// LES ÉCHÉANCES DE FRAIS SURVIVENT-ELLES VRAIMENT EN ÉDITION LAN ?
//
// Ce fichier n'existe pas par excès de prudence : il existe parce que le défaut
// qu'il couvre s'est produit cette semaine. Huit colonnes du modèle élève
// vivaient au Cloud et pas dans le schéma LAN ; `pickColumns()` et `rawUpsert()`
// ne gardent que les colonnes présentes localement et jettent le reste SANS
// MESSAGE. Les écoles hybrides ont saisi des noms de parents pendant des
// semaines dans le vide.
//
// Une table neuve court exactement le même risque, en pire : si elle manque au
// schéma LAN, aux ALLOWED_TABLES ou aux SYNCED_TABLES, la cantine mensuelle
// d'une école hybride ne s'enregistre pas, ou ne remonte jamais.
//
// On ne teste donc PAS que la table existe — c'est trop faible. On écrit par le
// chemin réel de l'application (runQuery), on relit, on fait descendre du Cloud
// (rawUpsert), et on regarde ce que le serveur AURAIT envoyé au Cloud.
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.NOTESCAM_DATA_DIR = mkdtempSync(join(tmpdir(), 'nc-schedule-'));
process.env.VITE_SUPABASE_URL = 'https://test.supabase.co';

let pass = 0, fail = 0;
const ok = (c, label, got) => {
  if (c) { console.log(`✅ ${label}`); pass++; }
  else { console.log(`❌ ${label} (obtenu: ${JSON.stringify(got)})`); fail++; }
};

const { db, SYNCED_TABLES, ALLOWED_TABLES, tableColumns } = await import('./db.js');
const { runQuery } = await import('./query.js');
const { rawUpsert, syncOnce } = await import('./cloudSync.js');

db.prepare('INSERT INTO schools (id,name) VALUES (?,?)').run('ec', 'ECOLE');
db.prepare('INSERT INTO classes (id,school_id,name) VALUES (?,?,?)').run('cl', 'ec', 'CM2');
db.prepare('INSERT INTO students (id,school_id,class_id,name) VALUES (?,?,?,?)').run('el', 'ec', 'cl', 'NGONO Marie');
db.prepare(`INSERT INTO student_fee_items (id,school_id,student_id,name,academic_year,amount)
            VALUES (?,?,?,?,?,?)`).run('sfi', 'ec', 'el', 'Cantine', '2025-2026', 15000);

// ── 1. La table est-elle DÉCLARÉE partout où il faut ? ─────────────────────
ok(ALLOWED_TABLES.has('fee_schedule_items'),
  '1. table autorisée à l’API locale (sinon l’application ne peut pas l’écrire)');
ok(SYNCED_TABLES.has('fee_schedule_items'),
  '2. table synchronisée (sinon les échéances ne quittent jamais l’école)');

// ── 2. Le chemin RÉEL de l'application ─────────────────────────────────────
const CHAMPS = {
  academic_year: '2025-2026',
  period_key:    '2025-11',
  period_label:  'Novembre 2025',
  amount_due:    15000,
  status:        'due',
};
const ins = runQuery({
  table: 'fee_schedule_items', action: 'insert',
  values: { id: 'ech1', school_id: 'ec', student_id: 'el', student_fee_item_id: 'sfi', ...CHAMPS },
});
ok(!ins.error, '3. l’échéance s’enregistre sans erreur', ins.error);

const relu = db.prepare('SELECT * FROM fee_schedule_items WHERE id = ?').get('ech1');
const perdus = Object.entries(CHAMPS).filter(([k, v]) => relu?.[k] !== v).map(([k]) => k);
ok(perdus.length === 0, '4. TOUS les champs de l’échéance sont relus à l’identique', perdus);

// ── 3. Le rejeu ne duplique pas la dette ───────────────────────────────────
// C'est la garantie qui protège l'élève : ouvrir deux fois sa fiche ne doit pas
// lui facturer novembre deux fois.
runQuery({
  table: 'fee_schedule_items', action: 'upsert', onConflict: 'id',
  values: { id: 'ech1', school_id: 'ec', student_id: 'el', student_fee_item_id: 'sfi', ...CHAMPS },
});
const n = db.prepare('SELECT count(*) n FROM fee_schedule_items WHERE student_fee_item_id = ?').get('sfi').n;
ok(n === 1, '5. rejouer la génération ne crée PAS une seconde échéance de novembre', n);

// ── 4. Un paiement peut viser une période ──────────────────────────────────
const pay = runQuery({
  table: 'fee_payments', action: 'insert',
  values: {
    id: 'p1', school_id: 'ec', student_id: 'el', amount: 5000, date: '2025-11-08',
    student_fee_item_id: 'sfi', fee_schedule_item_id: 'ech1',
  },
});
ok(!pay.error, '6. un versement s’enregistre sur une période précise', pay.error);
const relPay = db.prepare('SELECT fee_schedule_item_id FROM fee_payments WHERE id = ?').get('p1');
ok(relPay?.fee_schedule_item_id === 'ech1',
  '7. et le lien vers la période est conservé (sinon on ne sait plus quel mois est payé)', relPay);

// ── 5. La descente du Cloud conserve l'échéance ────────────────────────────
const descendu = rawUpsert('fee_schedule_items', {
  id: 'ech2', school_id: 'ec', student_id: 'el', student_fee_item_id: 'sfi',
  academic_year: '2025-2026', period_key: '2026-01', period_label: 'Janvier 2026',
  amount_due: 15000, status: 'exempted', updated_at: new Date().toISOString(),
});
ok(descendu, '8. une échéance venue du Cloud est acceptée', descendu);
const dist = db.prepare('SELECT period_key, amount_due, status FROM fee_schedule_items WHERE id = ?').get('ech2');
ok(dist?.period_key === '2026-01' && dist?.amount_due === 15000 && dist?.status === 'exempted',
  '9. la descente conserve la période, le montant ET le statut d’exemption', dist);

// ── 6. La REMONTÉE : ce que le serveur enverrait au Cloud ──────────────────
// Sans ce contrôle, les échéances pourraient s'enregistrer localement et ne
// jamais quitter l'école — le Cloud resterait vide sans que rien ne le signale.
const envoye = [];
const edge = async (path, body) => {
  if (path === 'sync-pull') return { rows: {}, tombstones: [], cursor: null, tomb_cursor: null };
  if (path === 'sync-push') { envoye.push(...body.changes); return { applied: body.changes.length }; }
  throw new Error('chemin inattendu : ' + path);
};
await syncOnce({ edge });
const pousse = envoye.find((c) => c.table === 'fee_schedule_items' && c.row?.id === 'ech1');
ok(!!pousse, '10. l’échéance part bien vers le Cloud', envoye.map((c) => `${c.table}:${c.row?.id}`));
const absents = Object.keys(CHAMPS).filter((k) => !(k in (pousse?.row || {})));
ok(absents.length === 0, '11. et le payload porte TOUS ses champs', absents);


// ── 7. B5 : la DÉCISION posée sur une période tient des deux côtés ─────────
// Exempter ou acter un abandon fait SORTIR une créance du dû. Si ce statut
// s'enregistrait en LAN sans remonter, l'école verrait la famille quitte et le
// Cloud la verrait débitrice — deux vérités pour une même dette.
const maj = runQuery({
  table: 'fee_schedule_items', action: 'update',
  values: { status: 'exempted', updated_at: new Date().toISOString() },
  filters: [{ col: 'id', op: 'eq', val: 'ech1' }, { col: 'school_id', op: 'eq', val: 'ec' }],
});
ok(!maj.error, '12. la décision s’écrit par le chemin réel de l’application', maj.error);
const apresMaj = db.prepare('SELECT status, amount_due FROM fee_schedule_items WHERE id = ?').get('ech1');
ok(apresMaj?.status === 'exempted', '13. et le statut est relu à l’identique', apresMaj);
ok(apresMaj?.amount_due === 15000,
  '14. le montant dû n’est PAS réécrit — une exemption ne réécrit pas l’historique de ce qui était dû', apresMaj);

// LAN → Cloud : ce que le serveur enverrait après la décision.
const envoye2 = [];
const edge2 = async (path, body) => {
  if (path === 'sync-pull') return { rows: {}, tombstones: [], cursor: null, tomb_cursor: null };
  if (path === 'sync-push') { envoye2.push(...body.changes); return { applied: body.changes.length }; }
  throw new Error('chemin inattendu : ' + path);
};
await syncOnce({ edge: edge2 });
const pousse2 = envoye2.find((c) => c.table === 'fee_schedule_items' && c.row?.id === 'ech1');
ok(pousse2?.row?.status === 'exempted',
  '15. LAN → Cloud : la décision REMONTE (sans quoi l’école et le Cloud diraient deux choses)', pousse2?.row?.status);

// Cloud → LAN : une décision prise ailleurs redescend et écrase le statut local.
const redescendu = rawUpsert('fee_schedule_items', {
  id: 'ech1', school_id: 'ec', student_id: 'el', student_fee_item_id: 'sfi',
  academic_year: '2025-2026', period_key: '2025-11', period_label: 'Novembre 2025',
  amount_due: 15000, status: 'abandoned', updated_at: new Date(Date.now() + 60000).toISOString(),
});
ok(redescendu, '16. une décision venue du Cloud est acceptée', redescendu);
const finLocal = db.prepare('SELECT status FROM fee_schedule_items WHERE id = ?').get('ech1');
ok(finLocal?.status === 'abandoned',
  '17. Cloud → LAN : l’état local converge vers la décision distante', finLocal);

// Le cloisonnement par SECTEUR doit connaître cette table : elle porte un élève,
// donc son identité et sa dette. Déclarée synchronisable et écrivable mais
// absente du garde, un compte cloisonné Collège lisait les échéances du Primaire.
const { SCOPED_TABLES } = await import('./scopeGuard.js');
ok(!!SCOPED_TABLES.fee_schedule_items,
  '18. la table est soumise au cloisonnement par secteur', Object.keys(SCOPED_TABLES));
ok(SCOPED_TABLES.fee_schedule_items?.col === 'student_id',
  '19. et rattachée par l’ÉLÈVE, comme le frais attribué dont elle dépend', SCOPED_TABLES.fee_schedule_items);

// ── 8. B6 : la date d'entrée DANS LE SERVICE tient des deux côtés ──────────
// `started_at` est une colonne NEUVE sur une table DÉJÀ INSTALLÉE. Si elle
// manque au schéma LAN, `tableColumns()` la jette SANS MESSAGE : l'école
// saisirait des dates de cantine dans le vide et facturerait septembre à des
// élèves entrés en février. C'est exactement le défaut qui a coûté les
// informations parents de cette école — on le teste donc, on ne le suppose pas.
const colonnes = tableColumns('student_fee_items');
ok(colonnes.has('started_at'),
  '20. la colonne existe côté LAN (sans quoi la synchro l’avalerait en silence)', [...colonnes]);

// ET dans db.js. C'est le garde qui compte vraiment : `CREATE TABLE IF NOT
// EXISTS` ne touche PAS une table déjà installée. Une colonne ajoutée au seul
// schema.sql n’existerait que sur les bases neuves — les écoles en service
// tourneraient sans elle, et la date de cantine partirait à la poubelle à
// chaque enregistrement, sans le moindre message.
const dbSource = readFileSync(new URL('./db.js', import.meta.url), 'utf8');
ok(dbSource.includes("ensureColumn('student_fee_items', 'started_at'"),
  '20b. la colonne est aussi posée par ensureColumn (donc sur les bases DÉJÀ installées)');

// Écriture par le chemin RÉEL de l’application.
const sousc = runQuery({
  table: 'student_fee_items', action: 'upsert', onConflict: 'id',
  values: { id: 'sfi2', school_id: 'ec', student_id: 'el', name: 'Transport',
    academic_year: '2025-2026', amount: 30000, started_at: '2025-11-15' },
});
ok(!sousc.error, '21. une souscription datée s’enregistre sans erreur', sousc.error);
const relue = db.prepare('SELECT started_at, amount FROM student_fee_items WHERE id = ?').get('sfi2');
ok(relue?.started_at === '2025-11-15',
  '22. et la date est relue à l’identique (pas avalée par pickColumns)', relue);

// Deux services du MÊME élève, deux dates distinctes (règle 4 + TEST 17).
runQuery({
  table: 'student_fee_items', action: 'update',
  values: { started_at: '2025-09-01' },
  filters: [{ col: 'id', op: 'eq', val: 'sfi' }, { col: 'school_id', op: 'eq', val: 'ec' }],
});
const deux = db.prepare("SELECT id, started_at FROM student_fee_items WHERE school_id='ec' ORDER BY id").all();
ok(deux.length === 2 && deux[0].started_at === '2025-09-01' && deux[1].started_at === '2025-11-15',
  '23. un même élève porte DEUX dates différentes pour deux services', deux);

// LAN → Cloud (TEST 11).
const envoye3 = [];
const edge3 = async (path, body) => {
  if (path === 'sync-pull') return { rows: {}, tombstones: [], cursor: null, tomb_cursor: null };
  if (path === 'sync-push') { envoye3.push(...body.changes); return { applied: body.changes.length }; }
  throw new Error('chemin inattendu : ' + path);
};
await syncOnce({ edge: edge3 });
const pousse3 = envoye3.find((c) => c.table === 'student_fee_items' && c.row?.id === 'sfi2');
ok(pousse3?.row?.started_at === '2025-11-15',
  '24. TEST 11 — LAN → Cloud : la date d’entrée REMONTE', pousse3?.row?.started_at);

// Cloud → LAN (TEST 12).
const desc = rawUpsert('student_fee_items', {
  id: 'sfi2', school_id: 'ec', student_id: 'el', name: 'Transport',
  academic_year: '2025-2026', amount: 30000, started_at: '2026-01-05',
  updated_at: new Date(Date.now() + 120000).toISOString(),
});
ok(desc, '25. TEST 12 — une souscription datée venue du Cloud est acceptée', desc);
const apresDesc = db.prepare('SELECT started_at FROM student_fee_items WHERE id = ?').get('sfi2');
ok(apresDesc?.started_at === '2026-01-05',
  '26. TEST 12 — Cloud → LAN : l’état local converge vers la date distante', apresDesc);

// TEST 15 — l’immutabilité de la caisse n’est pas entamée : changer la date ne
// touche à AUCUN versement. C'est la règle 5 — modifier la date d'inscription ne
// déplace ni n’annule rien de ce qui a été encaissé.
const versAvant = db.prepare("SELECT id, amount, fee_schedule_item_id FROM fee_payments WHERE id='p1'").get();
runQuery({
  table: 'student_fee_items', action: 'update',
  values: { started_at: '2026-03-01' },
  filters: [{ col: 'id', op: 'eq', val: 'sfi' }, { col: 'school_id', op: 'eq', val: 'ec' }],
});
const versApres = db.prepare("SELECT id, amount, fee_schedule_item_id FROM fee_payments WHERE id='p1'").get();
ok(JSON.stringify(versAvant) === JSON.stringify(versApres),
  '27. TEST 15 — reculer la date d’entrée ne modifie AUCUN versement déjà encaissé', { versAvant, versApres });
const echInchangee = db.prepare('SELECT amount_due FROM fee_schedule_items WHERE id = ?').get('ech1');
ok(echInchangee?.amount_due === 15000,
  '28. TEST 15 — ni le montant d’une échéance existante', echInchangee);
console.log(`\n=== ${fail === 0 ? 'OK' : 'ÉCHEC'} : ${pass} ok, ${fail} ko ===`);
process.exitCode = fail === 0 ? 0 : 1;
