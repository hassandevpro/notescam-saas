// RÉGLAGES DU TABLEAU D'HONNEUR — droits, validation et journal, sur le vrai serveur SQLite.
//
//   1. L'administrateur change le seuil : écrit ET journalisé (avant → après, auteur).
//   2. Un enseignant tente de le changer par une requête forgée : refusé, rien d'écrit.
//   3. Une valeur hors 0–20 est refusée par le serveur.
//   4. Une écriture qui ne change rien au seuil ne journalise rien.
//   5. Le chemin en LOT (runBatch) journalise aussi, dans la même transaction.
//
// Lancer : node server/_honorAudit.test.mjs
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.NOTESCAM_DATA_DIR = mkdtempSync(join(tmpdir(), 'nc-honor-audit-'));
const { db } = await import('./db.js');
const { runQuery, runBatch } = await import('./query.js');

let pass = 0, fail = 0;
const ok = (c, label, got) => { c ? (console.log(`✅ ${label}`), pass++) : (console.log(`❌ ${label}${got !== undefined ? ` (obtenu: ${JSON.stringify(got)})` : ''}`), fail++); };

db.prepare("INSERT INTO schools (id, name) VALUES ('e1', 'École Test')").run();
for (const [id, nom, role] of [['u-admin', 'Directrice Test', 'admin'], ['u-prof', 'Prof Test', 'teacher']]) {
  db.prepare('INSERT INTO users (id, email, password_hash, full_name) VALUES (?,?,?,?)').run(id, `${id}@t.test`, 'x', nom);
  db.prepare("INSERT INTO school_users (id, school_id, user_id, role, active) VALUES (?, 'e1', ?, ?, 1)").run(`su-${id}`, id, role);
}
const maj = (values, userId) => runQuery({ table: 'schools', action: 'update', values, filters: [{ col: 'id', op: 'eq', val: 'e1' }] }, { userId });
const audits = () => db.prepare("SELECT * FROM audit_events WHERE action = 'honor_settings_changed' ORDER BY at").all();
const seuil = () => db.prepare("SELECT honor_min_avg AS v FROM schools WHERE id = 'e1'").get().v;

let r = maj({ honor_min_avg: 14 }, 'u-admin');
ok(!r.error && seuil() === 14, '1. administrateur : seuil 14 écrit', r.error);
let a = audits();
ok(a.length === 1 && a[0].actor_id === 'u-admin' && a[0].actor_name === 'Directrice Test', '1. journalisé avec son auteur', a[0]);
ok(JSON.parse(a[0]?.payload || '{}').honor_min_avg?.apres === 14 && JSON.parse(a[0].payload).honor_min_avg.avant === null, '1. avant → après', a[0]?.payload);

r = maj({ honor_min_avg: 8 }, 'u-prof');
ok(!!r.error && seuil() === 14 && audits().length === 1, '2. enseignant : refusé, seuil inchangé, rien journalisé', r.error);

r = maj({ honor_min_avg: 25 }, 'u-admin');
ok(!!r.error && /0 à 20/.test(r.error.message) && seuil() === 14, '3. 25/20 refusé par le serveur', r.error);
r = maj({ honor_min_avg: -1 }, 'u-admin');
ok(!!r.error && seuil() === 14, '3. −1 refusé');

r = maj({ honor_min_avg: 14, name: 'École Test' }, 'u-admin');
ok(!r.error && audits().length === 1, '4. même valeur : rien de journalisé');
r = maj({ name: 'École Test 2' }, 'u-admin');
ok(!r.error && audits().length === 1, '4. autre paramètre seul : rien de journalisé');

r = runBatch([{ table: 'schools', action: 'update', values: { honor_options: '{"excludeSanctioned":true}' }, filters: [{ col: 'id', op: 'eq', val: 'e1' }] }], { userId: 'u-admin' });
a = audits();
ok(!r.error && a.length === 2 && JSON.parse(a[1].payload).honor_options?.apres === '{"excludeSanctioned":true}', '5. lot : options journalisées', r.error || a);

console.log(`\n=== ${fail === 0 ? 'OK' : 'ÉCHEC'} : ${pass} ok, ${fail} ko ===`);
process.exitCode = fail === 0 ? 0 : 1;

// 6. Le chemin en LOT garde aussi les paramètres de l'établissement.
{
  const r6 = runBatch([{ table: 'schools', action: 'update', values: { honor_min_avg: 5 }, filters: [{ col: 'id', op: 'eq', val: 'e1' }] }], { userId: 'u-prof' });
  const ok6 = !!r6.error && seuil() === 14 && audits().length === 2;
  console.log(`${ok6 ? '✅' : '❌'} 6. enseignant par le chemin en LOT : refusé aussi${ok6 ? '' : ` (obtenu: ${JSON.stringify(r6)} seuil=${seuil()})`}`);
  if (!ok6) process.exitCode = 1;
}
