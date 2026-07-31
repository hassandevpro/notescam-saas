// Test bout-en-bout — H3-a : réplication du journal domain_events LAN ↔ Cloud.
//
// Sans réseau : « cloud » en mémoire + transport edge INJECTÉ. Base jetable via
// NOTESCAM_DATA_DIR. Vérifie : push/pull, idempotence (double application = 1 ligne),
// anti-écho (event tiré non re-poussé), doublons (id déjà présent), ordre (seq/rowid
// croissant), coupure Internet (pull KO → push continue, curseur pull figé), reprise
// après synchronisation interrompue (curseur non avancé → ré-application = no-op).
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'nc-evsync-'));
process.env.NOTESCAM_DATA_DIR = dir;
process.env.VITE_SUPABASE_URL = 'https://test.supabase.co';

const { db } = await import('./db.js');
const { syncEventsOnce } = await import('./eventSync.js');

let pass = 0, fail = 0;
const ok = (c, label, got) => { if (c) { console.log(`✅ ${label}`); pass++; } else { console.log(`❌ ${label} (obtenu: ${JSON.stringify(got)})`); fail++; } };

// --- « Cloud » en mémoire (journal append-only, seq attribué à l'insertion) ----
const cloud = { events: [], seq: 0 };
function cloudInsert(ev) { // idempotent par id
  if (cloud.events.some((e) => e.id === ev.id)) return false;
  cloud.seq += 1;
  cloud.events.push({ ...ev, seq: cloud.seq });
  return true;
}
// Contrôle des pannes de transport pour le scénario « coupure ».
const net = { pullDown: false, pushDown: false };
const edge = async (path, body) => {
  if (path === 'events-pull') {
    if (net.pullDown) throw new Error('events-pull: HTTP 503');
    const since = body.since != null && body.since !== '' ? Number(body.since) : 0;
    const evs = cloud.events.filter((e) => e.seq > since).sort((a, b) => a.seq - b.seq);
    let cursor = since || null;
    for (const e of evs) if (cursor == null || e.seq > cursor) cursor = e.seq;
    return { events: evs, cursor };
  }
  if (path === 'events-push') {
    if (net.pushDown) throw new Error('events-push: HTTP 503');
    let applied = 0;
    for (const ev of body.events || []) if (ev.school_id === 'sch1' && cloudInsert(ev)) applied++;
    return { applied };
  }
  throw new Error('path inattendu ' + path);
};

// --- Seed local : école + 3 événements d'ORIGINE LOCALE -----------------------
db.prepare('INSERT INTO schools (id, name) VALUES (?,?)').run('sch1', 'École');
const seedLocal = (id, type, n) => db.prepare(
  `INSERT INTO domain_events (id, school_id, aggregate_type, aggregate_id, event_type, payload, occurred_at)
   VALUES (?,?,?,?,?,?,?)`,
).run(id, 'sch1', 'expense', `agg${n}`, type, JSON.stringify({ n }), `2026-07-2${n}T00:00:00.000Z`);
seedLocal('e1', 'ExpenseSubmitted', 1);
seedLocal('e2', 'ExpenseApproved', 2);
seedLocal('e3', 'ExpensePaid', 3);

// ── DRY-RUN : ne pousse rien, n'avance aucun curseur ──────────────────────────
const dry = await syncEventsOnce({ edge, dryRun: true });
ok(dry.pushPlan.length === 3, 'dry-run : 3 events locaux SERAIENT poussés', dry.pushPlan.length);
ok(cloud.events.length === 0, 'dry-run : AUCUN envoi cloud', cloud.events.length);
ok(!db.prepare("SELECT 1 FROM sync_cursor WHERE name='event_push_rowid'").get(), 'dry-run : curseur push NON créé');

// ── Run 1 : PUSH des 3 events locaux (pull vide d'abord) ──────────────────────
const r1 = await syncEventsOnce({ edge });
ok(r1.pushed === 3 && r1.pulled === 0, 'run1 : 3 poussés, 0 tirés', r1);
ok(cloud.events.length === 3, 'run1 : 3 events dans le cloud', cloud.events.length);
ok([...cloud.events].every((e, i, a) => i === 0 || a[i - 1].seq < e.seq), 'run1 : seq cloud croissant (ordre préservé)');
const pushCursor1 = db.prepare("SELECT value FROM sync_cursor WHERE name='event_push_rowid'").get()?.value;
ok(pushCursor1 != null, 'run1 : curseur push avancé', pushCursor1);

// ── Le cloud émet 2 décisions (origine cloud) ─────────────────────────────────
cloudInsert({ id: 'c1', school_id: 'sch1', aggregate_type: 'expense', aggregate_id: 'agg1', event_type: 'ExpenseApprovalGranted', payload: { decision: 'approve' } });
cloudInsert({ id: 'c2', school_id: 'sch1', aggregate_type: 'expense', aggregate_id: 'agg2', event_type: 'ExpenseApprovalRefused', payload: { decision: 'refuse' } });

// ── Run 2 : PULL (idempotence des échos + application des 2 décisions) + anti-écho ──
const r2 = await syncEventsOnce({ edge });
ok(r2.pulled === 5, 'run2 : 5 events tirés (3 échos + 2 décisions)', r2.pulled);
ok(r2.applied === 2, 'run2 : seules 2 NOUVELLES lignes appliquées (échos ignorés = idempotence)', r2.applied);
ok(db.prepare("SELECT COUNT(*) n FROM domain_events WHERE id IN ('c1','c2')").get().n === 2, 'run2 : c1 & c2 présents localement');
ok(db.prepare("SELECT replicated_from FROM domain_events WHERE id='c1'").get().replicated_from === 'cloud', 'run2 : c1 estampillé origine cloud');
ok(r2.pushed === 0, 'run2 : ANTI-ÉCHO — rien à re-pousser (échos exclus, décisions cloud exclues)', r2.pushed);
ok(cloud.events.filter((e) => e.id === 'c1').length === 1, 'run2 : c1 non dupliqué côté cloud (pas de renvoi)');
const totalCloudAfterR2 = cloud.events.length;

// ── Run 3 : rien de neuf → pull/push = 0 (curseurs stables) ───────────────────
const r3 = await syncEventsOnce({ edge });
ok(r3.pulled === 0 && r3.pushed === 0, 'run3 : plus rien à synchroniser', r3);

// ── Reprise après synchronisation INTERROMPUE : curseur pull remis en arrière ──
// (simule un crash entre l'application et l'avancement du curseur)
db.prepare("UPDATE sync_cursor SET value='0' WHERE name='event_pull_seq'").run();
const localBefore = db.prepare('SELECT COUNT(*) n FROM domain_events').get().n;
const r4 = await syncEventsOnce({ edge });
const localAfter = db.prepare('SELECT COUNT(*) n FROM domain_events').get().n;
ok(r4.applied === 0, 'reprise : ré-application = 0 (ON CONFLICT DO NOTHING)', r4.applied);
ok(localAfter === localBefore, 'reprise : aucun doublon local créé', { localBefore, localAfter });
ok(cloud.events.length === totalCloudAfterR2, 'reprise : aucun doublon cloud créé', cloud.events.length);

// ── Coupure Internet : PULL en panne, PUSH doit continuer ─────────────────────
seedLocal('e4', 'ExpenseSubmitted', 4);
const pullSeqBefore = db.prepare("SELECT value FROM sync_cursor WHERE name='event_pull_seq'").get()?.value;
net.pullDown = true;
const r5 = await syncEventsOnce({ edge });
net.pullDown = false;
ok(!!r5.pullError, 'coupure : erreur de pull remontée', r5.pullError);
ok(r5.pushed === 1, 'coupure : PUSH continue malgré le pull KO (e4 envoyé)', r5.pushed);
ok(!r5.pushError, 'coupure : pas d’erreur de push');
const pullSeqAfter = db.prepare("SELECT value FROM sync_cursor WHERE name='event_pull_seq'").get()?.value;
ok(pullSeqAfter === pullSeqBefore, 'coupure : curseur PULL NON avancé (pull en échec)', { pullSeqBefore, pullSeqAfter });
ok(cloud.events.some((e) => e.id === 'e4'), 'coupure : e4 bien arrivé au cloud');

// ── Doublon explicite : le cloud renvoie un id déjà local → pas de 2e insertion ──
const dupBefore = db.prepare('SELECT COUNT(*) n FROM domain_events').get().n;
db.prepare("UPDATE sync_cursor SET value='0' WHERE name='event_pull_seq'").run(); // re-tire tout
const r6 = await syncEventsOnce({ edge });
const dupAfter = db.prepare('SELECT COUNT(*) n FROM domain_events').get().n;
ok(dupAfter === dupBefore, 'doublons : aucun id ré-inséré même en re-tirant tout le journal', { dupBefore, dupAfter });

console.log(`\n=== ${fail === 0 ? 'OK' : 'ÉCHEC'} : ${pass} ok, ${fail} ko ===`);
process.exit(fail ? 1 : 0);
