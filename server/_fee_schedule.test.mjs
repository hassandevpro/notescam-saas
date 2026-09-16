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
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.NOTESCAM_DATA_DIR = mkdtempSync(join(tmpdir(), 'nc-schedule-'));
process.env.VITE_SUPABASE_URL = 'https://test.supabase.co';

let pass = 0, fail = 0;
const ok = (c, label, got) => {
  if (c) { console.log(`✅ ${label}`); pass++; }
  else { console.log(`❌ ${label} (obtenu: ${JSON.stringify(got)})`); fail++; }
};

const { db, SYNCED_TABLES, ALLOWED_TABLES } = await import('./db.js');
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

console.log(`\n=== ${fail === 0 ? 'OK' : 'ÉCHEC'} : ${pass} ok, ${fail} ko ===`);
process.exitCode = fail === 0 ? 0 : 1;
