// E2E « niveau données » du transfert : rejoue via l'API du serveur LAN (mêmes
// requêtes que le front en LAN) en utilisant les moteurs PURS, puis vérifie.
import { buildTransfer, resolveTransferType } from '../src/core/transferEngine.js';
import { computeTransferFeePatch } from '../src/lib/feeEngine.js';
import { randomUUID } from 'node:crypto';

const BASE = 'http://localhost:8090';
let TOKEN = '';

async function login() {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'test@notescam.local', password: 'test1234' }),
  });
  const j = await r.json();
  TOKEN = j.data.session.access_token;
}
async function db(op) {
  const r = await fetch(`${BASE}/api/db`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify(op),
  });
  const j = await r.json();
  if (j.error) throw new Error(JSON.stringify(j.error));
  return j.data;
}
const selectOne = async (table, filters) => (await db({ table, action: 'select', columns: '*', filters }))?.[0] || null;
const upsert = (table, values) => db({ table, action: 'upsert', values, onConflict: 'id' });

const assert = (cond, msg) => { if (!cond) { console.error('❌ ÉCHEC :', msg); process.exitCode = 1; } else console.log('✅', msg); };

async function main() {
  await login();

  // 1. État initial
  const current = await selectOne('student_class_assignments', [
    { col: 'student_id', op: 'eq', val: 'stu-1' }, { col: 'date_fin', op: 'is', val: null },
  ]);
  const oldClass = await selectOne('classes', [{ col: 'id', op: 'eq', val: current.class_id }]);
  const newClass = await selectOne('classes', [{ col: 'id', op: 'eq', val: 'cls-5a' }]);
  const fee      = await selectOne('student_fees', [{ col: 'student_id', op: 'eq', val: 'stu-1' }]);
  const oldGrid  = await selectOne('class_fee_grids', [{ col: 'class_id', op: 'eq', val: 'cls-6a' }]);
  const newGrid  = await selectOne('class_fee_grids', [{ col: 'class_id', op: 'eq', val: 'cls-5a' }]);
  console.log('\nDépart : classe', oldClass.name, '| frais', fee.frais_annuels, '| payé', fee.frais_payes, '| mode', fee.payment_mode, '\n');

  // 2. Calcul PUR du transfert (comme le store)
  const type = resolveTransferType(oldClass, newClass);
  const { closedRow, newRow, noop } = buildTransfer({
    current, newClass, student: { id: 'stu-1', school_id: 'sch-test' }, schoolId: 'sch-test',
    type, commentaire: 'Test E2E redoublement', userId: 'u-test', userName: 'Test Admin', newId: randomUUID(),
  });
  assert(!noop, 'transfert non-op = false');
  assert(type === 'changement_niveau', `type détecté = changement_niveau (obtenu ${type})`);

  // parseJsonArray : le serveur LAN renvoie les JSON en CHAÎNE
  const feeParsed = { ...fee, tranches: JSON.parse(fee.tranches || '[]'), adjustments: JSON.parse(fee.adjustments || '[]') };
  const gridParsed = (g) => ({ ...g, tranches: JSON.parse(g.tranches || '[]') });
  const { patch } = computeTransferFeePatch({ fee: feeParsed, newGrid: gridParsed(newGrid), oldGrid: gridParsed(oldGrid), assignmentId: newRow.id });

  // 3. Persiste via l'API (séquentiel : clôture puis ouverture) — sérialise les JSON
  await upsert('student_class_assignments', closedRow);
  await upsert('student_class_assignments', newRow);
  const feeRow = { ...feeParsed, ...patch, tranches: JSON.stringify(patch.tranches), adjustments: JSON.stringify(patch.adjustments) };
  await upsert('student_fees', feeRow);

  // 4. Relecture + vérifications
  const all = await db({ table: 'student_class_assignments', action: 'select', columns: '*', filters: [{ col: 'student_id', op: 'eq', val: 'stu-1' }] });
  const open = all.filter((a) => !a.date_fin);
  const closed = all.filter((a) => a.date_fin);
  const feeAfter = await selectOne('student_fees', [{ col: 'student_id', op: 'eq', val: 'stu-1' }]);
  const adjAfter = JSON.parse(feeAfter.adjustments || '[]');

  console.log('\n--- Après transfert ---');
  console.log('affectations :', all.length, '| en cours :', open.length, '| clôturées :', closed.length);
  console.log('frais :', feeAfter.frais_annuels, '| payé :', feeAfter.frais_payes, '| remises :', adjAfter.map((a) => a.mode), '| assignment_id lié :', feeAfter.assignment_id === newRow.id, '\n');

  assert(open.length === 1, 'exactement UNE affectation en cours');
  assert(open[0].class_id === 'cls-5a', 'affectation en cours = 5e A');
  assert(open[0].type_transfert === 'changement_niveau', 'type de la nouvelle affectation = changement_niveau');
  assert(open[0].commentaire === 'Test E2E redoublement', 'commentaire enregistré');
  assert(closed.length === 1 && closed[0].class_id === 'cls-6a', 'ancienne affectation 6e A clôturée (jamais supprimée)');
  assert(!!closed[0].date_fin && !!closed[0].motif_cloture, 'ancienne affectation a date_fin + motif_cloture');
  assert(feeAfter.frais_annuels === 80000, 'frais recalculés selon la grille 5e A (80000)');
  assert(Number(feeAfter.frais_payes) === 20000, 'paiements préservés (frais_payes = 20000)');
  assert(adjAfter.length === 1 && adjAfter[0].mode === 'percent', 'remise % conservée, remise fixe retirée');
  assert(feeAfter.assignment_id === newRow.id, 'ligne de frais rattachée à la nouvelle affectation');

  console.log('\n' + (process.exitCode ? '=== DES VÉRIFS ONT ÉCHOUÉ ===' : '=== TOUTES LES VÉRIFS PASSENT ==='));
}
main().catch((e) => { console.error('ERREUR', e); process.exit(1); });
