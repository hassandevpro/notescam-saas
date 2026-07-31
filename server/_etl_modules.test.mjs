// ETL COMPLET — migration des NOUVEAUX MODULES (budgets, gouvernance, RH,
// immobilisations, notifications, vie scolaire, journal d'événements) dans les
// DEUX sens, avec remap des références utilisateur et gestion des colonnes jsonb.
//
// Sans réseau : client Supabase STUB (in-memory) + global.fetch stub (edge).
// Prouve, au-delà du « table marquée terminée » : (a) les lignes migrent vraiment ;
// (b) les références de COMPTE (created_by/user_id/actor_id/recipient_id/…) sont
// remappées cloud↔local ; (c) un NOM ou un id d'agent (staff) n'est jamais remappé ;
// (d) une colonne jsonb (governance_roles.permissions, domain_events.payload) fait
// l'aller-retour objet ↔ TEXT sans corruption.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'nc-etl-'));
process.env.NOTESCAM_DATA_DIR = dir;
process.env.VITE_SUPABASE_URL = 'https://test.supabase.co';

// ── Stub edge (jeton serveur + set-password best-effort) ──
global.fetch = async (url) => {
  const u = String(url);
  if (u.endsWith('/issue-server-token')) return { ok: true, status: 200, json: async () => ({ token: 'TESTTOKEN' }) };
  if (u.endsWith('/set-password')) return { ok: true, status: 200, json: async () => ({ ok: true }) };
  if (u.endsWith('/provision-tenant')) {
    return { ok: true, status: 200, json: async () => ({ server_token: 'TESTTOKEN', map: [
      { local_user_id: null, cloud_user_id: null },
    ] }) };
  }
  throw new Error('fetch inattendu: ' + u);
};

// ── Jeu de données cloud (in-memory) : 2 comptes + tous les modules ──
const DATA = {
  schools: [{ id: 'sch1', name: 'École ETL', current_year: '2025-2026', logo_url: null }],
  school_users: [
    { id: 'su1', school_id: 'sch1', user_id: 'cloud-admin', role: 'admin',   full_name: 'Directrice', active: 1 },
    { id: 'su2', school_id: 'sch1', user_id: 'cloud-fond',  role: 'censeur',  full_name: 'Fondatrice', active: 1 },
  ],
  classes:  [{ id: 'cls1', school_id: 'sch1', name: '6e A', current_year: '2025-2026' }],
  students: [{ id: 'stu1', school_id: 'sch1', class_id: 'cls1', name: 'Paul Mballa', photo_url: null }],
  staff:    [{ id: 'stf1', school_id: 'sch1', name: 'Agent X', department: 'admin', auth_user_id: 'cloud-fond', active: 1 }],
  // Budgets (self-ref parent NULL ; expense.created_by = un compte)
  budgets: [{ id: 'B', school_id: 'sch1', academic_year: '2025-2026', label: 'Annuel', status: 'active', envelope_amount: 100000 }],
  budget_chapters: [{ id: 'L1', school_id: 'sch1', budget_id: 'B', label: 'Ligne 1', kind: 'depense', planned_amount: 500, status: 'draft' }],
  budget_expenses: [{ id: 'e1', school_id: 'sch1', budget_id: 'B', budget_chapter_id: 'L1', amount: 2000, status: 'approved', created_by: 'cloud-fond', requester: 'M. Untel', expense_date: '2026-01-01' }],
  // Gouvernance : permissions/detail jsonb ; user_id/actor_id = comptes
  governance_roles: [{ id: 'gr1', school_id: 'sch1', code: 'fondatrice', name: 'Fondatrice', rank: 100, permissions: ['expense.approve', 'budget.approve'], pages: [], dashboards: [], workflows: [] }],
  user_governance_roles: [{ id: 'ug1', school_id: 'sch1', user_id: 'cloud-fond', role: 'fondatrice' }],
  governance_role_history: [{ id: 'gh1', school_id: 'sch1', user_id: 'cloud-fond', role_code: 'fondatrice', action: 'grant', actor_id: 'cloud-admin', detail: { note: 'attribution' } }],
  // RH : staff_id NE DOIT PAS être remappé (ce n'est pas un compte)
  hr_contracts: [{ id: 'hc1', school_id: 'sch1', staff_id: 'stf1', type: 'cdi', status: 'active' }],
  // Immobilisations
  assets: [{ id: 'a1', school_id: 'sch1', name: 'Ordinateur', category: 'materiel', value: 500000, status: 'active' }],
  // Notifications : recipient_id = un compte
  notifications: [{ id: 'n1', school_id: 'sch1', recipient_id: 'cloud-fond', type: 'info', title: 'Bonjour', read: 0 }],
  // Vie scolaire : recorded_by = un compte
  disciplinary_incidents: [{ id: 'di1', school_id: 'sch1', student_id: 'stu1', incident_type: 'autre', severity: 'mineur', status: 'ouvert', recorded_by: 'cloud-admin' }],
  // Journal d'événements : payload jsonb ; actor_id = un compte
  domain_events: [{ id: 'de1', school_id: 'sch1', aggregate_type: 'expense', aggregate_id: 'e1', event_type: 'ExpenseApproved', payload: { amount: 2000 }, actor_id: 'cloud-fond', occurred_at: '2026-01-01T00:00:00Z' }],
};

function makeBuilder(table) {
  const eqs = [];
  const b = {
    select() { return b; }, range() { return b; }, order() { return b; },
    eq(c, v) { eqs.push([c, v]); return b; }, is() { return b; },
    _match(r) { return eqs.every(([c, v]) => String(r[c]) === String(v)); },
    then(resolve, reject) {
      try { return Promise.resolve({ data: (DATA[table] || []).filter(b._match).slice(), error: null }).then(resolve, reject); }
      catch (e) { return Promise.resolve({ data: null, error: { message: e.message } }).then(resolve, reject); }
    },
  };
  return b;
}
const stubClient = () => ({
  auth: { signInWithPassword: async () => ({ data: { user: { id: 'cloud-admin' }, session: { access_token: 'ADMINJWT' } }, error: null }) },
  from: (t) => makeBuilder(t),
});

const { runMigration } = await import('./migrate.js');
const { db } = await import('./db.js');

let pass = 0; let fail = 0;
const ok = (c, label, got) => { if (c) { console.log(`✅ ${label}`); pass++; } else { console.log(`❌ ${label} (obtenu: ${JSON.stringify(got)})`); fail++; } };
const count = (t) => db.prepare(`SELECT COUNT(*) n FROM "${t}"`).get().n;
const one = (sql, ...a) => db.prepare(sql).get(...a);

// ═══════════════ CLOUD → LAN : migration complète ═══════════════
const res = await runMigration({
  url: 'https://test.supabase.co', anonKey: 'anon',
  email: 'directrice@ecole.cm', password: 'cloudpass', localPassword: 'monpasslocal',
  clientFactory: () => stubClient(),
});

console.log('\n──── Cloud → LAN : les nouveaux modules migrent ────');
ok(res.ok, 'migration : intégrité OK (counts)', res.integrity);
ok(res.integrity?.fkViolations === 0, 'aucune référence FK pendante', res.integrity?.fkViolations);
for (const [t, n] of [['budgets', 1], ['budget_chapters', 1], ['budget_expenses', 1], ['governance_roles', 1],
  ['user_governance_roles', 1], ['governance_role_history', 1], ['hr_contracts', 1], ['assets', 1],
  ['notifications', 1], ['disciplinary_incidents', 1], ['domain_events', 1], ['staff', 1]]) {
  ok(count(t) === n, `${t} : ${n} ligne migrée`, count(t));
}

// Ids locaux des 2 comptes recréés.
const adminLocal = one("SELECT id FROM users WHERE cloud_user_id = 'cloud-admin'")?.id;
const fondLocal  = one("SELECT id FROM users WHERE cloud_user_id = 'cloud-fond'")?.id;
ok(!!adminLocal && !!fondLocal && adminLocal !== fondLocal, '2 comptes locaux distincts recréés');

console.log('\n──── Remap des références UTILISATEUR (cloud → local) ────');
ok(one("SELECT created_by FROM budget_expenses WHERE id='e1'")?.created_by === fondLocal, 'expense.created_by remappé vers le compte local');
ok(one("SELECT requester FROM budget_expenses WHERE id='e1'")?.requester === 'M. Untel', 'expense.requester (un NOM) laissé intact');
ok(one("SELECT user_id FROM user_governance_roles WHERE id='ug1'")?.user_id === fondLocal, 'user_governance_roles.user_id remappé');
ok(one("SELECT actor_id FROM governance_role_history WHERE id='gh1'")?.actor_id === adminLocal, 'governance_role_history.actor_id remappé');
ok(one("SELECT user_id FROM governance_role_history WHERE id='gh1'")?.user_id === fondLocal, 'governance_role_history.user_id remappé');
ok(one("SELECT recipient_id FROM notifications WHERE id='n1'")?.recipient_id === fondLocal, 'notifications.recipient_id remappé');
ok(one("SELECT recorded_by FROM disciplinary_incidents WHERE id='di1'")?.recorded_by === adminLocal, 'disciplinary_incidents.recorded_by remappé');
ok(one("SELECT actor_id FROM domain_events WHERE id='de1'")?.actor_id === fondLocal, 'domain_events.actor_id remappé');
ok(one("SELECT auth_user_id FROM staff WHERE id='stf1'")?.auth_user_id === fondLocal, 'staff.auth_user_id remappé');
// Un id d'agent (staff) N'EST PAS un compte → JAMAIS remappé.
ok(one("SELECT staff_id FROM hr_contracts WHERE id='hc1'")?.staff_id === 'stf1', 'hr_contracts.staff_id (id agent) laissé intact');

console.log('\n──── Colonnes jsonb : aller-retour objet ↔ TEXT ────');
const perms = one("SELECT permissions FROM governance_roles WHERE id='gr1'")?.permissions;
ok(typeof perms === 'string', 'governance_roles.permissions stocké en TEXT côté LAN', typeof perms);
ok(JSON.stringify(JSON.parse(perms)) === JSON.stringify(['expense.approve', 'budget.approve']), 'permissions jsonb → TEXT sans corruption');
const payload = one("SELECT payload FROM domain_events WHERE id='de1'")?.payload;
ok(typeof payload === 'string' && JSON.parse(payload).amount === 2000, 'domain_events.payload jsonb → TEXT sans corruption');

// ═══════════════ LAN → CLOUD : re-push des mêmes modules ═══════════════
// On capture les upserts pour prouver le remap INVERSE (local → cloud) + le
// REPARSE des colonnes jsonb (TEXT LAN → objet) + le best-effort du journal.
console.log('\n──── LAN → Cloud : re-push (remap inverse + jsonb reparse) ────');
const pushed = {};
const pushStub = () => ({
  auth: { signInWithPassword: async () => ({ data: { user: { id: 'cloud-admin' }, session: { access_token: 'JWT' } }, error: null }) },
  from: (t) => ({ upsert: async (batch) => { (pushed[t] = pushed[t] || []).push(...batch); return { error: null }; } }),
});
// Provision : on mappe les comptes locaux → ids cloud (remap inverse).
global.fetch = async (url) => {
  const u = String(url);
  if (u.endsWith('/provision-tenant')) {
    return { ok: true, status: 200, json: async () => ({ server_token: 'TESTTOKEN', map: [
      { local_user_id: adminLocal, cloud_user_id: 'cloud-admin' },
      { local_user_id: fondLocal,  cloud_user_id: 'cloud-fond' },
    ] }) };
  }
  if (u.endsWith('/issue-server-token') || u.endsWith('/set-password')) return { ok: true, status: 200, json: async () => ({ ok: true, token: 'T' }) };
  throw new Error('fetch inattendu: ' + u);
};
const { runCloudActivation } = await import('./activateCloud.js');
const act = await runCloudActivation({
  url: 'https://test.supabase.co', anonKey: 'anon',
  email: 'directrice@ecole.cm', password: 'monpasslocal', clientFactory: () => pushStub(),
});
ok(act.ok, 'activation LAN → Cloud OK');
const exp = (pushed.budget_expenses || [])[0];
ok(exp && exp.created_by === 'cloud-fond', 'push : expense.created_by remappé local → cloud', exp?.created_by);
ok(exp && exp.requester === 'M. Untel', 'push : requester (NOM) intact');
const gr = (pushed.governance_roles || [])[0];
ok(gr && Array.isArray(gr.permissions) && gr.permissions.includes('budget.approve'), 'push : permissions REPARSÉ en tableau pour le jsonb cloud', gr?.permissions);
const de = (pushed.domain_events || [])[0];
ok(de && typeof de.payload === 'object' && de.payload.amount === 2000, 'push : domain_events.payload REPARSÉ en objet', de?.payload);
ok(!('replicated_from' in (de || {})), 'push : colonne LAN-only replicated_from retirée');
ok(one("SELECT staff_id FROM hr_contracts WHERE id='hc1'")?.staff_id === 'stf1' && (pushed.hr_contracts || [])[0]?.staff_id === 'stf1', 'push : hr_contracts.staff_id intact');

console.log(`\n═══════════ ${fail === 0 ? '✅ ETL MODULES OK' : '❌ ÉCHEC'} : ${pass} ok, ${fail} ko ═══════════`);
try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
process.exit(fail ? 1 : 0);
