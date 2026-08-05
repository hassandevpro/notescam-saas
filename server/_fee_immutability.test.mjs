// Immuabilité des RECETTES côté serveur LAN — sur une vraie base SQLite jetable.
//
// Le verrou applicatif (store) ne suffit pas : le serveur LAN expose une API
// générique /api/db, atteignable par n'importe quel client. Ce test vérifie que
// la couche qui la sert refuse elle-même toute altération d'un versement, et
// qu'elle estampille le caissier depuis le JETON — pas depuis le payload.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'nc-fee-'));
process.env.NOTESCAM_DATA_DIR = dir;
process.env.VITE_SUPABASE_URL = 'https://test.supabase.co';

const { db } = await import('./db.js');
const { runQuery } = await import('./query.js');

let pass = 0, fail = 0;
const ok = (c, label, got) => { if (c) { console.log(`✅ ${label}`); pass++; } else { console.log(`❌ ${label} (obtenu: ${JSON.stringify(got)})`); fail++; } };

db.prepare('INSERT INTO schools (id, name) VALUES (?,?)').run('sch1', 'École');
db.prepare('INSERT INTO classes (id, school_id, name) VALUES (?,?,?)').run('cls1', 'sch1', 'CM2');
db.prepare('INSERT INTO students (id, school_id, class_id, name) VALUES (?,?,?,?)').run('stu1', 'sch1', 'cls1', 'NGONO Marie');

const CAISSIER = 'user-atangana';
const VOLEUR   = 'user-mballa';

// ── Encaissement normal ─────────────────────────────────────────────────────
const ins = runQuery({
  table: 'fee_payments', action: 'insert',
  values: { id: 'pay1', school_id: 'sch1', student_id: 'stu1', amount: 150000, date: '2026-02-01' },
}, { userId: CAISSIER });
ok(!ins.error, 'encaissement accepté', ins.error);

const row = () => db.prepare('SELECT * FROM fee_payments WHERE id = ?').get('pay1');
ok(row()?.amount === 150000, 'versement enregistré à 150 000', row()?.amount);

// ── Non-répudiation : le caissier vient du jeton ─────────────────────────────
ok(row()?.recorded_by === CAISSIER, 'recorded_by estampillé depuis le jeton', row()?.recorded_by);

// Tentative d'usurpation : le payload prétend un autre auteur.
runQuery({
  table: 'fee_payments', action: 'insert',
  values: { id: 'pay2', school_id: 'sch1', student_id: 'stu1', amount: 20000, date: '2026-02-02',
            recorded_by: CAISSIER },   // ← forgé : c'est VOLEUR qui écrit
}, { userId: VOLEUR });
const forged = db.prepare('SELECT recorded_by FROM fee_payments WHERE id = ?').get('pay2');
ok(forged?.recorded_by === VOLEUR, 'payload forgé ignoré : l\'auteur reste celui du jeton', forged?.recorded_by);

// ── LE point : on ne peut ni effacer, ni retoucher un versement ──────────────
const del = runQuery({ table: 'fee_payments', action: 'delete', filters: [{ col: 'id', op: 'eq', val: 'pay1' }] }, { userId: CAISSIER });
ok(!!del.error, 'suppression d\'un versement REFUSÉE', del.error);
ok(!!row(), 'le versement est toujours là après la tentative de suppression');

const upd = runQuery({ table: 'fee_payments', action: 'update', values: { amount: 1 }, filters: [{ col: 'id', op: 'eq', val: 'pay1' }] }, { userId: CAISSIER });
ok(!!upd.error, 'modification d\'un versement REFUSÉE', upd.error);
ok(row()?.amount === 150000, 'le montant est intact après la tentative de modification', row()?.amount);

// ── La voie légitime : la contre-passation ──────────────────────────────────
const rev = runQuery({
  table: 'fee_payments', action: 'insert',
  values: { id: 'rev1', school_id: 'sch1', student_id: 'stu1', amount: -150000, date: '2026-02-03',
            reversal_of: 'pay1', void_reason: 'Chèque sans provision' },
}, { userId: CAISSIER });
ok(!rev.error, 'contre-passation acceptée', rev.error);

const total = db.prepare('SELECT COALESCE(SUM(amount),0) AS s FROM fee_payments WHERE student_id = ?').get('stu1');
ok(total.s === 20000, 'solde après annulation = 20 000 (150 000 − 150 000 + 20 000)', total.s);

const kept = db.prepare('SELECT COUNT(*) AS n FROM fee_payments WHERE student_id = ?').get('stu1');
ok(kept.n === 3, 'les 3 écritures coexistent : rien n\'a été effacé', kept.n);

const revRow = db.prepare('SELECT * FROM fee_payments WHERE id = ?').get('rev1');
ok(revRow?.reversal_of === 'pay1', 'la contre-passation pointe le versement annulé');
ok(revRow?.void_reason === 'Chèque sans provision', 'le motif est conservé');

// ── Règle de SIGNE (miroir de la contrainte Postgres fee_payments_amount_sign) ─
// Sans elle, un « versement négatif » sans lien ni motif serait une annulation
// déguisée : l'argent sort des totaux sans laisser de justification.
const negNoLink = runQuery({
  table: 'fee_payments', action: 'insert',
  values: { id: 'bad1', school_id: 'sch1', student_id: 'stu1', amount: -5000, date: '2026-02-06' },
}, { userId: CAISSIER });
ok(!!negNoLink.error, 'montant négatif sans contre-passation REFUSÉ', negNoLink.error);

const zero = runQuery({
  table: 'fee_payments', action: 'insert',
  values: { id: 'bad2', school_id: 'sch1', student_id: 'stu1', amount: 0, date: '2026-02-06' },
}, { userId: CAISSIER });
ok(!!zero.error, 'versement à zéro REFUSÉ', zero.error);

const noMotif = runQuery({
  table: 'fee_payments', action: 'insert',
  values: { id: 'bad3', school_id: 'sch1', student_id: 'stu1', amount: -1000, date: '2026-02-06', reversal_of: 'pay2' },
}, { userId: CAISSIER });
ok(!!noMotif.error, 'contre-passation sans motif REFUSÉE', noMotif.error);

const posReversal = runQuery({
  table: 'fee_payments', action: 'insert',
  values: { id: 'bad4', school_id: 'sch1', student_id: 'stu1', amount: 1000, date: '2026-02-06', reversal_of: 'pay2', void_reason: 'x' },
}, { userId: CAISSIER });
ok(!!posReversal.error, 'contre-passation à montant positif REFUSÉE', posReversal.error);

// ── Numérotation SÉQUENTIELLE des reçus ─────────────────────────────────────
// C'est ce qui rend visible la recette encaissée puis escamotée : un numéro
// manquant dans la série est un trou que l'on peut constater.
const nos = db.prepare('SELECT id, receipt_no FROM fee_payments ORDER BY receipt_no').all();
ok(nos.every((r) => r.receipt_no != null), 'chaque écriture reçoit un numéro de reçu');
ok(nos.map((r) => r.receipt_no).join(',') === '1,2,3', 'série continue 1,2,3 attribuée par le serveur', nos.map((r) => r.receipt_no));

// Le client ne choisit pas son numéro : la valeur imposée est ignorée…
runQuery({
  table: 'fee_payments', action: 'insert',
  values: { id: 'pay9', school_id: 'sch1', student_id: 'stu1', amount: 1000, date: '2026-02-04', academic_year: null },
}, { userId: CAISSIER });
const pay9 = db.prepare('SELECT receipt_no FROM fee_payments WHERE id = ?').get('pay9');
ok(pay9?.receipt_no === 4, 'le numéro suivant est attribué par le serveur', pay9?.receipt_no);

// …mais un numéro venu de la SYNCHRO (déjà attribué en LAN) est conservé : le
// reçu papier déjà remis doit continuer de correspondre.
runQuery({
  table: 'fee_payments', action: 'insert',
  values: { id: 'paySync', school_id: 'sch1', student_id: 'stu1', amount: 500, date: '2026-02-05', receipt_no: 77 },
}, { userId: CAISSIER });
const synced = db.prepare('SELECT receipt_no FROM fee_payments WHERE id = ?').get('paySync');
ok(synced?.receipt_no === 77, 'numéro venu de la synchro préservé', synced?.receipt_no);

// ── L'élève porteur d'écritures ne se supprime pas ──────────────────────────
const delStu = runQuery({ table: 'students', action: 'delete', filters: [{ col: 'id', op: 'eq', val: 'stu1' }] }, { userId: CAISSIER });
ok(!!delStu.error, 'suppression d\'un élève porteur d\'écritures REFUSÉE', delStu.error);
ok(!!db.prepare('SELECT id FROM students WHERE id = ?').get('stu1'), 'l\'élève est toujours là');
ok(db.prepare('SELECT COUNT(*) AS n FROM fee_payments WHERE student_id = ?').get('stu1').n === 5,
   'aucun versement emporté par la tentative de suppression');

// Un élève SANS écriture reste supprimable normalement.
db.prepare('INSERT INTO students (id, school_id, class_id, name) VALUES (?,?,?,?)').run('stu2', 'sch1', 'cls1', 'Sans versement');
const delFree = runQuery({ table: 'students', action: 'delete', filters: [{ col: 'id', op: 'eq', val: 'stu2' }] }, { userId: CAISSIER });
ok(!delFree.error, 'élève sans écriture : suppression toujours possible', delFree.error);

// Best-effort : sous Windows, SQLite garde le fichier ouvert et rmSync lève
// EPERM. Le dossier est de toute façon dans le temp du système.
try { rmSync(dir, { recursive: true, force: true }); } catch { /* handle encore ouvert */ }
console.log(`\n${fail ? '❌' : '✅'} ${pass} réussis, ${fail} échoués`);
process.exit(fail ? 1 : 0);
