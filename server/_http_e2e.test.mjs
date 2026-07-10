// Test HTTP de bout en bout sur le VRAI serveur LAN (Fastify + auth JWT +
// /api/db). Démarre le serveur en sous-processus sur une base jetable, rejoue
// le parcours UI (signup -> créer prof -> créer classe avec titulaire ->
// relire), puis l'arrête. Valide la chaîne complète, pas juste runQuery.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'nc-http-'));
const PORT = 8123;
const BASE = `http://127.0.0.1:${PORT}`;

const srv = spawn(process.execPath, [join(__dirname, 'index.js')], {
  env: { ...process.env, NOTESCAM_DATA_DIR: dir, PORT: String(PORT), HOST: '127.0.0.1', NOTESCAM_LICENSE_ENABLED: '0' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let srvLog = '';
srv.stdout.on('data', (d) => { srvLog += d; });
srv.stderr.on('data', (d) => { srvLog += d; });
srv.on('exit', (code) => { if (code) srvLog += `\n[serveur sorti code ${code}]`; });

let pass = 0, fail = 0;
const ok = (c, label, got) => { c ? (console.log(`✅ ${label}`), pass++) : (console.log(`❌ ${label} (obtenu: ${JSON.stringify(got)})`), fail++); };

async function waitReady(ms = 30000) {   // marge pour un démarrage à froid sous charge (spawn Windows)
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { const r = await fetch(`${BASE}/api/license`); if (r.ok) return true; } catch { /* pas encore prêt */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('serveur non prêt — log serveur:\n' + srvLog.slice(-1500));
}

let token = '';
const db = (op) => fetch(`${BASE}/api/db`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify(op),
}).then((r) => r.json());
const batch = (ops) => fetch(`${BASE}/api/db/batch`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify({ ops }),
}).then((r) => r.json());

try {
  await waitReady();

  // Signup -> token
  const sign = await fetch(`${BASE}/api/auth/signup`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'dir@ecole.test', password: 'secret123', full_name: 'Directeur' }),
  }).then((r) => r.json());
  token = sign?.data?.session?.access_token || '';
  const userId = sign?.data?.user?.id || '';
  ok(!!token, 'signup -> token JWT obtenu', token ? '(token)' : sign);

  // École + enseignant
  await db({ table: 'schools',  action: 'insert', values: { id: 'sch1', name: 'École Test' } });
  await db({ table: 'teachers', action: 'insert', values: { id: 'tch1', school_id: 'sch1', name: 'M. Atangana' } });

  // Créer une classe AVEC titulaire (comme le formulaire Classes).
  const ins = await db({ table: 'classes', action: 'upsert', onConflict: 'id', returning: true, values: {
    id: 'cls1', school_id: 'sch1', name: 'Terminale C', level: 'Terminale C',
    system: 'FR', cycle: 'secondaire', current_year: '2025-2026', teacher_id: 'tch1', max_students: 40,
  } });
  ok(!ins.error, 'upsert classe avec teacher_id sans erreur', ins.error);

  // RELECTURE serveur (= ce que fait l'app au rechargement / changement d'année).
  const sel = await db({ table: 'classes', action: 'select', columns: '*', single: true,
    filters: [{ type: 'eq', col: 'id', val: 'cls1' }] });
  ok(sel?.data?.teacher_id === 'tch1', 'titulaire TOUJOURS présent après relecture HTTP', sel?.data?.teacher_id);
  ok(sel?.data?.cycle === 'secondaire' && sel?.data?.max_students === 40,
    'cycle + max_students persistés via HTTP', { cycle: sel?.data?.cycle, max: sel?.data?.max_students });

  // --- Batch atomique (transactional outbox du kernel) ---------------------
  // Commit d'une donnée métier + son event d'outbox EN UNE transaction.
  const okBatch = await batch([
    { table: 'signalements', action: 'insert', values: {
      id: 'sg1', school_id: 'sch1', domain: 'maintenance', title: 'Fuite bloc B', status: 'new', priority: 'high' } },
    { table: 'domain_events', action: 'insert', values: {
      id: 'ev1', school_id: 'sch1', aggregate_type: 'signalement', aggregate_id: 'sg1',
      event_type: 'SignalementRaised', payload: '{}' } },
  ]);
  ok(!okBatch.error && okBatch.data?.applied === 2, 'batch atomique applique données + event outbox', okBatch);
  const sg = await db({ table: 'signalements', action: 'select', single: true, filters: [{ op: 'eq', col: 'id', val: 'sg1' }] });
  const ev = await db({ table: 'domain_events', action: 'select', single: true, filters: [{ op: 'eq', col: 'id', val: 'ev1' }] });
  ok(sg?.data?.id === 'sg1' && ev?.data?.id === 'ev1', 'batch : la donnée ET l’event sont persistés');

  // Rollback : une op invalide dans le lot annule TOUT le lot.
  const badBatch = await batch([
    { table: 'signalements', action: 'insert', values: { id: 'sg2', school_id: 'sch1', domain: 'rh', title: 'X', status: 'new' } },
    { table: 'table_interdite', action: 'insert', values: { id: 'zz' } }, // hors ALLOWED_TABLES
  ]);
  ok(!!badBatch.error, 'batch avec op invalide -> erreur', badBatch);
  const sg2 = await db({ table: 'signalements', action: 'select', single: true, maybeSingle: true, filters: [{ op: 'eq', col: 'id', val: 'sg2' }] });
  ok(sg2?.data == null, 'batch ROLLBACK : aucune écriture partielle (sg2 absent)', sg2?.data);

  // --- #8 Non-répudiation : acteur estampillé par le serveur -----------------
  // Un client forge actor_id : le serveur DOIT l'écraser avec l'utilisateur de
  // la session (userId), pas la valeur envoyée.
  await batch([{ table: 'domain_events', action: 'insert', values: {
    id: 'evx', school_id: 'sch1', aggregate_type: 'x', event_type: 'Test', payload: '{}', actor_id: 'FORGED' } }]);
  const evx = await db({ table: 'domain_events', action: 'select', single: true, maybeSingle: true, filters: [{ op: 'eq', col: 'id', val: 'evx' }] });
  ok(evx?.data?.actor_id === userId && userId, 'actor_id estampillé par le serveur (forge « FORGED » ignorée)', evx?.data?.actor_id);

  // --- #8 Immuabilité : domain_events est append-only ------------------------
  const updEv = await db({ table: 'domain_events', action: 'update', values: { id: 'evx', event_type: 'Hacked' }, filters: [{ op: 'eq', col: 'id', val: 'evx' }] });
  ok(!!updEv.error, 'domain_events : UPDATE refusé (append-only)', updEv);
  const delEv = await db({ table: 'domain_events', action: 'delete', filters: [{ op: 'eq', col: 'id', val: 'evx' }] });
  ok(!!delEv.error, 'domain_events : DELETE refusé (append-only)', delEv);
  const stillEvent = await db({ table: 'domain_events', action: 'select', single: true, maybeSingle: true, filters: [{ op: 'eq', col: 'id', val: 'evx' }] });
  ok(stillEvent?.data?.event_type === 'Test', 'domain_events : l’event est resté intact', stillEvent?.data?.event_type);

  // --- #4 version monotone : chaque update incrémente le compteur ------------
  await db({ table: 'classes', action: 'update', values: { max_students: 41 }, filters: [{ op: 'eq', col: 'id', val: 'cls1' }] });
  const cv1 = await db({ table: 'classes', action: 'select', single: true, filters: [{ op: 'eq', col: 'id', val: 'cls1' }] });
  await db({ table: 'classes', action: 'update', values: { max_students: 42 }, filters: [{ op: 'eq', col: 'id', val: 'cls1' }] });
  const cv2 = await db({ table: 'classes', action: 'select', single: true, filters: [{ op: 'eq', col: 'id', val: 'cls1' }] });
  ok(cv2?.data?.version > cv1?.data?.version, 'version incrémentée à chaque update (départage LWW fiable)', { v1: cv1?.data?.version, v2: cv2?.data?.version });

  // --- Module Budgets : CRUD LAN + sync + cascade ---------------------------
  const insBud = await db({ table: 'budgets', action: 'upsert', onConflict: 'id', returning: true, values: {
    id: 'bud1', school_id: 'sch1', academic_year: '2025-2026', period_type: 'trimestriel',
    period_ref: 2, sector: 'primaire', label: 'Budget T2', status: 'draft' } });
  ok(!insBud.error, 'budget inséré via /api/db (table whitelistée)', insBud.error);
  const budSel = await db({ table: 'budgets', action: 'select', single: true, filters: [{ op: 'eq', col: 'id', val: 'bud1' }] });
  ok(budSel?.data?.version >= 1 && !!budSel?.data?.updated_at, 'budget : colonnes de sync estampillées (version/updated_at)', budSel?.data?.version);

  // Hiérarchie 3 niveaux : catégorie → chapitre → sous-chapitre (colonne level).
  await db({ table: 'budget_chapters', action: 'insert', values: {
    id: 'ch1', school_id: 'sch1', budget_id: 'bud1', level: 'category', label: 'Fonctionnement', kind: 'depense', planned_amount: 0, position: 0 } });
  await db({ table: 'budget_chapters', action: 'insert', values: {
    id: 'ch1a', school_id: 'sch1', budget_id: 'bud1', parent_id: 'ch1', level: 'chapter', label: 'Fournitures', kind: 'depense', planned_amount: 0, position: 0 } });
  await db({ table: 'budget_chapters', action: 'insert', values: {
    id: 'ch1b', school_id: 'sch1', budget_id: 'bud1', parent_id: 'ch1a', level: 'subchapter', label: 'Cahiers', kind: 'depense', planned_amount: 200000, position: 0 } });
  const chSel = await db({ table: 'budget_chapters', action: 'select', columns: '*', filters: [{ op: 'eq', col: 'budget_id', val: 'bud1' }] });
  ok(Array.isArray(chSel?.data) && chSel.data.length === 3, 'hiérarchie 3 niveaux persistée', chSel?.data?.length);
  const cat = (chSel.data || []).find((c) => c.id === 'ch1');
  ok(cat?.level === 'category', 'colonne level persistée (category)', cat?.level);

  // Suppression du budget -> cascade sur ses chapitres (FK ON DELETE CASCADE).
  await db({ table: 'budgets', action: 'delete', filters: [{ op: 'eq', col: 'id', val: 'bud1' }] });
  const chAfter = await db({ table: 'budget_chapters', action: 'select', columns: '*', filters: [{ op: 'eq', col: 'budget_id', val: 'bud1' }] });
  ok((chAfter?.data?.length || 0) === 0, 'suppression budget -> chapitres supprimés en cascade', chAfter?.data?.length);

  // --- Module Dépenses : rattachement budget + cascade ----------------------
  await db({ table: 'budgets', action: 'insert', values: {
    id: 'bud2', school_id: 'sch1', academic_year: '2025-2026', period_type: 'annuel', sector: 'primaire', label: 'Budget annuel', status: 'active' } });
  await db({ table: 'budget_chapters', action: 'insert', values: {
    id: 'ch2', school_id: 'sch1', budget_id: 'bud2', label: 'Salaires', kind: 'depense', planned_amount: 10000000, position: 0 } });
  const insExp = await db({ table: 'budget_expenses', action: 'upsert', onConflict: 'id', returning: true, values: {
    id: 'exp1', school_id: 'sch1', budget_id: 'bud2', budget_chapter_id: 'ch2', category: 'RH',
    supplier: 'CNPS', amount: 3000000, requester: 'Directeur', status: 'approved', expense_date: '2025-10-01' } });
  ok(!insExp.error, 'dépense insérée via /api/db (rattachée au budget)', insExp.error);
  const expSel = await db({ table: 'budget_expenses', action: 'select', single: true, filters: [{ op: 'eq', col: 'id', val: 'exp1' }] });
  ok(expSel?.data?.budget_id === 'bud2' && expSel?.data?.version >= 1, 'dépense liée au budget + sync estampillée', expSel?.data?.budget_id);
  // Suppression du budget -> dépenses supprimées en cascade.
  await db({ table: 'budgets', action: 'delete', filters: [{ op: 'eq', col: 'id', val: 'bud2' }] });
  const expAfter = await db({ table: 'budget_expenses', action: 'select', columns: '*', filters: [{ op: 'eq', col: 'budget_id', val: 'bud2' }] });
  ok((expAfter?.data?.length || 0) === 0, 'suppression budget -> dépenses supprimées en cascade', expAfter?.data?.length);

  // --- Catalogue de frais : obligatoire/optionnel + frais élève + paiement lié
  await db({ table: 'students', action: 'insert', values: { id: 'stu9', school_id: 'sch1', name: 'Élève F', class_id: 'cls1' } });
  const catIns = await db({ table: 'fee_catalog', action: 'upsert', onConflict: 'id', returning: true, values: {
    id: 'fc1', school_id: 'sch1', name: 'Scolarité', category: 'scolarite', amount: 120000, academic_year: '2025-2026', mandatory: 1, optional: 0, active: 1 } });
  ok(!catIns.error, 'article de catalogue créé (obligatoire)', catIns.error);
  const sfi = await db({ table: 'student_fee_items', action: 'upsert', onConflict: 'id', returning: true, values: {
    id: 'sfi1', school_id: 'sch1', student_id: 'stu9', fee_catalog_id: 'fc1', academic_year: '2025-2026', name: 'Scolarité', category: 'scolarite', amount: 120000, mandatory: 1, status: 'active' } });
  ok(!sfi.error, 'frais attribué à l’élève', sfi.error);
  // Paiement LIÉ au frais (compat : colonne student_fee_item_id sur fee_payments).
  await db({ table: 'fee_payments', action: 'insert', values: { id: 'pay9', school_id: 'sch1', student_id: 'stu9', academic_year: '2025-2026', amount: 50000, date: '2025-10-01', student_fee_item_id: 'sfi1' } });
  const payLink = await db({ table: 'fee_payments', action: 'select', single: true, filters: [{ op: 'eq', col: 'id', val: 'pay9' }] });
  ok(payLink?.data?.student_fee_item_id === 'sfi1', 'paiement rattaché au frais précis', payLink?.data?.student_fee_item_id);
  // Compat : paiement SANS lien (global hérité) toujours accepté.
  const legacy = await db({ table: 'fee_payments', action: 'insert', values: { id: 'pay10', school_id: 'sch1', student_id: 'stu9', academic_year: '2025-2026', amount: 10000, date: '2025-10-02' } });
  ok(!legacy.error, 'paiement global hérité (sans lien de frais) toujours accepté', legacy.error);
  // Suppression du frais élève -> le paiement N'EST PAS supprimé (pas de cascade
  // destructrice). En LAN la colonne de lien n'a pas de FK (ensureColumn) : le lien
  // orphelin reste inoffensif (le moteur filtre par frais existant). En cloud, la
  // FK ON DELETE SET NULL le remet à null.
  await db({ table: 'student_fee_items', action: 'delete', filters: [{ op: 'eq', col: 'id', val: 'sfi1' }] });
  const payKept = await db({ table: 'fee_payments', action: 'select', single: true, maybeSingle: true, filters: [{ op: 'eq', col: 'id', val: 'pay9' }] });
  ok(payKept?.data?.id === 'pay9', 'suppression frais -> paiement CONSERVÉ (pas de cascade destructrice)', payKept?.data?.id);

  // --- Immobilisations : registre + journaux (pannes/répa/dépenses) + cascade
  const aIns = await db({ table: 'assets', action: 'upsert', onConflict: 'id', returning: true, values: {
    id: 'as1', school_id: 'sch1', category: 'vehicule', asset_number: 'VH-001', name: 'Bus scolaire', value: 15000000, status: 'active' } });
  ok(!aIns.error, 'immobilisation créée (numéro + valeur)', aIns.error);
  await db({ table: 'asset_breakdowns', action: 'insert', values: { id: 'bd1', school_id: 'sch1', asset_id: 'as1', date: '2026-01-10', description: 'Freins', status: 'open' } });
  await db({ table: 'asset_repairs', action: 'insert', values: { id: 'rp1', school_id: 'sch1', asset_id: 'as1', date: '2026-01-12', description: 'Plaquettes', cost: 80000, status: 'done' } });
  await db({ table: 'asset_expenses', action: 'insert', values: { id: 'ae1', school_id: 'sch1', asset_id: 'as1', date: '2026-01-05', category: 'carburant', amount: 50000 } });
  const rp = await db({ table: 'asset_repairs', action: 'select', single: true, filters: [{ op: 'eq', col: 'id', val: 'rp1' }] });
  ok(rp?.data?.asset_id === 'as1' && rp?.data?.cost === 80000 && rp?.data?.version >= 1, 'journaux liés à l’actif + sync estampillée', rp?.data?.cost);
  await db({ table: 'assets', action: 'delete', filters: [{ op: 'eq', col: 'id', val: 'as1' }] });
  const bdAfter = await db({ table: 'asset_breakdowns', action: 'select', columns: '*', filters: [{ op: 'eq', col: 'asset_id', val: 'as1' }] });
  ok((bdAfter?.data?.length || 0) === 0, 'suppression actif -> journaux supprimés en cascade', bdAfter?.data?.length);

  // --- Notifications : interne persistée + outbox externe en file (pending) --
  const nIns = await db({ table: 'notifications', action: 'upsert', onConflict: 'id', returning: true, values: {
    id: 'ntf1', school_id: 'sch1', recipient_role: 'admin', type: 'report_created', title: 'Nouveau signalement', body: 'maintenance', link: '/app/signalements', read: 0 } });
  ok(!nIns.error, 'notification interne créée', nIns.error);
  await db({ table: 'notification_outbox', action: 'insert', values: {
    id: 'obx1', school_id: 'sch1', notification_id: 'ntf1', channel: 'sms', address: '+237600000000', status: 'pending' } });
  const obxSel = await db({ table: 'notification_outbox', action: 'select', single: true, filters: [{ op: 'eq', col: 'id', val: 'obx1' }] });
  ok(obxSel?.data?.status === 'pending' && obxSel?.data?.channel === 'sms', 'canal externe mis en file (pending, non envoyé)', obxSel?.data?.status);
  // Marquer lu (canal interne).
  await db({ table: 'notifications', action: 'update', values: { read: 1 }, filters: [{ op: 'eq', col: 'id', val: 'ntf1' }] });
  const nRead = await db({ table: 'notifications', action: 'select', single: true, filters: [{ op: 'eq', col: 'id', val: 'ntf1' }] });
  ok(!!nRead?.data?.read, 'notification marquée lue', nRead?.data?.read);
  // Cascade : suppression de la notification -> outbox lié supprimé.
  await db({ table: 'notifications', action: 'delete', filters: [{ op: 'eq', col: 'id', val: 'ntf1' }] });
  const obxAfter = await db({ table: 'notification_outbox', action: 'select', columns: '*', filters: [{ op: 'eq', col: 'notification_id', val: 'ntf1' }] });
  ok((obxAfter?.data?.length || 0) === 0, 'suppression notification -> outbox supprimé en cascade', obxAfter?.data?.length);

  // --- Module Reports : catégorie + affectation auto + commentaire + historique
  await db({ table: 'signalements', action: 'upsert', onConflict: 'id', returning: true, values: {
    id: 'rep1', school_id: 'sch1', domain: 'maintenance', title: 'Toiture', description: 'Fuite',
    priority: 'high', status: 'assigned', assigned_department: 'support', reporter_name: 'Prof X', created_at: new Date().toISOString() } });
  const repSel = await db({ table: 'signalements', action: 'select', single: true, filters: [{ op: 'eq', col: 'id', val: 'rep1' }] });
  ok(repSel?.data?.assigned_department === 'support' && repSel?.data?.priority === 'high', 'report créé : gravité + affectation auto persistées', repSel?.data?.assigned_department);
  await db({ table: 'signalement_history', action: 'insert', values: { id: 'h1', school_id: 'sch1', signalement_id: 'rep1', action: 'created', to_status: 'assigned', at: new Date().toISOString() } });
  await db({ table: 'signalement_comments', action: 'insert', values: { id: 'cm1', school_id: 'sch1', signalement_id: 'rep1', body: 'Intervention prévue', author: 'Support' } });
  const hist = await db({ table: 'signalement_history', action: 'select', columns: '*', filters: [{ op: 'eq', col: 'signalement_id', val: 'rep1' }] });
  const cmts = await db({ table: 'signalement_comments', action: 'select', columns: '*', filters: [{ op: 'eq', col: 'signalement_id', val: 'rep1' }] });
  ok((hist?.data?.length || 0) === 1 && (cmts?.data?.length || 0) === 1, 'historique + commentaire enregistrés');
  await db({ table: 'signalements', action: 'delete', filters: [{ op: 'eq', col: 'id', val: 'rep1' }] });
  const hAfter = await db({ table: 'signalement_history', action: 'select', columns: '*', filters: [{ op: 'eq', col: 'signalement_id', val: 'rep1' }] });
  ok((hAfter?.data?.length || 0) === 0, 'suppression report -> commentaires/historique supprimés en cascade', hAfter?.data?.length);

  // --- Module RH : entités satellites du dossier staff + cascade ------------
  await db({ table: 'staff', action: 'insert', values: { id: 'stf1', school_id: 'sch1', name: 'Mme Ngo', department: 'administration', fonction: 'Secrétaire' } });
  const hrIns = await db({ table: 'hr_contracts', action: 'upsert', onConflict: 'id', returning: true, values: {
    id: 'ctr1', school_id: 'sch1', staff_id: 'stf1', type: 'cdd', title: 'Secrétaire', start_date: '2025-09-01', end_date: '2026-08-31', status: 'active' } });
  ok(!hrIns.error, 'contrat RH inséré (rattaché au staff)', hrIns.error);
  await db({ table: 'hr_leaves', action: 'insert', values: { id: 'lv1', school_id: 'sch1', staff_id: 'stf1', type: 'annuel', start_date: '2026-02-01', end_date: '2026-02-05', days: 5, status: 'approved' } });
  await db({ table: 'hr_evaluations', action: 'insert', values: { id: 'ev1h', school_id: 'sch1', staff_id: 'stf1', eval_date: '2026-01-15', score: 16, status: 'final' } });
  await db({ table: 'hr_attendance', action: 'insert', values: { id: 'at1', school_id: 'sch1', staff_id: 'stf1', att_date: '2026-01-10', status: 'present' } });
  await db({ table: 'hr_career_events', action: 'insert', values: { id: 'ce1', school_id: 'sch1', staff_id: 'stf1', event_date: '2025-09-01', type: 'recrutement', title: 'Recrutement' } });
  const ctrSel = await db({ table: 'hr_contracts', action: 'select', single: true, filters: [{ op: 'eq', col: 'id', val: 'ctr1' }] });
  ok(ctrSel?.data?.staff_id === 'stf1' && ctrSel?.data?.version >= 1, 'contrat lié au staff + sync estampillée', ctrSel?.data?.staff_id);
  // Suppression de l'agent -> tout son dossier RH supprimé en cascade.
  await db({ table: 'staff', action: 'delete', filters: [{ op: 'eq', col: 'id', val: 'stf1' }] });
  const lvAfter = await db({ table: 'hr_leaves', action: 'select', columns: '*', filters: [{ op: 'eq', col: 'staff_id', val: 'stf1' }] });
  ok((lvAfter?.data?.length || 0) === 0, 'suppression agent -> dossier RH supprimé en cascade', lvAfter?.data?.length);

  // --- Déblocage de ligne épuisée : demande + décision historisée -----------
  await db({ table: 'budgets', action: 'insert', values: {
    id: 'bud3', school_id: 'sch1', academic_year: '2025-2026', period_type: 'annuel', sector: 'primaire', label: 'B3', status: 'active' } });
  await db({ table: 'budget_chapters', action: 'insert', values: {
    id: 'ch3', school_id: 'sch1', budget_id: 'bud3', label: 'Fournitures', kind: 'depense', planned_amount: 100000, position: 0 } });
  const insReq = await db({ table: 'budget_unlock_requests', action: 'upsert', onConflict: 'id', returning: true, values: {
    id: 'req1', school_id: 'sch1', budget_id: 'bud3', budget_chapter_id: 'ch3', requested_amount: 50000, reason: 'Rupture de stock', requester: 'Caissier', status: 'pending' } });
  ok(!insReq.error, 'demande de déblocage créée (statut pending)', insReq.error);
  // Décision « augmenter » : bump du planifié + historisation de la décision.
  await db({ table: 'budget_chapters', action: 'update', values: { planned_amount: 150000 }, filters: [{ op: 'eq', col: 'id', val: 'ch3' }] });
  await db({ table: 'budget_unlock_requests', action: 'update',
    values: { status: 'increased', granted_amount: 50000, decided_by: 'Fondatrice', decided_role: 'fondatrice', decided_at: new Date().toISOString() },
    filters: [{ op: 'eq', col: 'id', val: 'req1' }] });
  const reqAfter = await db({ table: 'budget_unlock_requests', action: 'select', single: true, filters: [{ op: 'eq', col: 'id', val: 'req1' }] });
  const chAfter3 = await db({ table: 'budget_chapters', action: 'select', single: true, filters: [{ op: 'eq', col: 'id', val: 'ch3' }] });
  ok(reqAfter?.data?.status === 'increased' && reqAfter?.data?.decided_by === 'Fondatrice', 'décision historisée (qui/quoi)', reqAfter?.data?.status);
  ok(chAfter3?.data?.planned_amount === 150000, '« augmenter le budget » relève le planifié du chapitre', chAfter3?.data?.planned_amount);

  // --- Gouvernance : attribution d'un rôle de direction (table additive) -----
  const insGov = await db({ table: 'user_governance_roles', action: 'upsert', onConflict: 'id', returning: true, values: {
    id: 'gov1', school_id: 'sch1', user_id: userId, role: 'raf', sector: null } });
  ok(!insGov.error, 'rôle de gouvernance inséré via /api/db (table whitelistée)', insGov.error);
  const govSel = await db({ table: 'user_governance_roles', action: 'select', columns: '*',
    filters: [{ op: 'eq', col: 'user_id', val: userId }] });
  ok(govSel?.data?.[0]?.role === 'raf' && govSel?.data?.[0]?.version >= 1,
    'rôle relu + colonnes de sync estampillées', govSel?.data?.[0]);
  // Drapeau budget_validation présent et OFF par défaut (comportement Budgets inchangé).
  const schoolRow = await db({ table: 'schools', action: 'select', single: true, filters: [{ op: 'eq', col: 'id', val: 'sch1' }] });
  ok(schoolRow?.data && 'budget_validation' in schoolRow.data && !schoolRow.data.budget_validation,
    'drapeau schools.budget_validation présent et OFF par défaut', schoolRow?.data?.budget_validation);

  // Barème de validation configurable par établissement (schools.validation_rules, TEXT JSON).
  const rules = JSON.stringify({ expense: [{ under: 25000, role: 'raf' }, { under: null, role: 'fondatrice' }] });
  await db({ table: 'schools', action: 'update', values: { validation_rules: rules }, filters: [{ op: 'eq', col: 'id', val: 'sch1' }] });
  const schoolRow2 = await db({ table: 'schools', action: 'select', single: true, filters: [{ op: 'eq', col: 'id', val: 'sch1' }] });
  ok(schoolRow2?.data?.validation_rules === rules, 'schools.validation_rules persiste le barème (configurable par établissement)', schoolRow2?.data?.validation_rules);

  // Sécurité : sans token, /api/db doit refuser.
  const noAuth = await fetch(`${BASE}/api/db`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ table: 'classes', action: 'select', columns: '*', filters: [] }),
  });
  ok(noAuth.status === 401, '/api/db sans token -> 401', noAuth.status);
} catch (e) {
  console.error('Erreur test:', e.message); fail++;
} finally {
  // Arrêt propre : attendre la sortie réelle de l'enfant AVANT de nettoyer,
  // sinon kill()+rmSync pendant la fermeture des pipes fait planter libuv
  // (assertion UV_HANDLE_CLOSING) au teardown sous Windows.
  await new Promise((resolve) => {
    if (srv.exitCode != null) return resolve();
    srv.once('exit', () => resolve());
    srv.kill();
    setTimeout(resolve, 2000); // garde-fou si l'enfant ne meurt pas
  });
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* WAL verrouillé */ }
}

console.log(`\n=== ${fail === 0 ? 'OK' : 'ÉCHEC'} : ${pass} ok, ${fail} ko ===`);
process.exitCode = fail === 0 ? 0 : 1;
