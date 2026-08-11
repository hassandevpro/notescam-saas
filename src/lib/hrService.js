// Couche CRUD Supabase du module RH. Une fabrique par entité satellite du
// dossier `staff` (contrats, congés, évaluations, présences, historique, paie).
// En LAN, `./supabase` est aliasé vers localClient : mêmes appels. Les colonnes
// inconnues sont filtrées côté serveur (pickColumns), donc l'upsert générique
// ne casse pas si le payload porte des clés d'UI.
import { supabase } from './supabase';
import { uuid } from './uuid';

function makeEntity(table, dateCol = 'created_at') {
  return {
    async fetch(schoolId, staffId) {
      let q = supabase.from(table).select('*').eq('school_id', schoolId);
      if (staffId) q = q.eq('staff_id', staffId);
      const { data, error } = await q.order(dateCol, { ascending: false });
      if (error) { console.error(`fetch ${table}`, error); return null; }
      return data;
    },
    async upsert(row) {
      const payload = { id: row.id || uuid(), ...row, updated_at: new Date().toISOString(), version: (row.version || 0) + 1 };
      const { data, error } = await supabase.from(table).upsert(payload, { onConflict: 'id' }).select().single();
      if (error) { console.error(`upsert ${table}`, error); return null; }
      if (table === 'hr_leaves') notifyLeave(data, row);
      return data;
    },
    async remove(id) {
      const { error } = await supabase.from(table).delete().eq('id', id);
      if (error) { console.error(`delete ${table}`, error); return false; }
      return true;
    },
  };
}

// Notification interne des congés — seul satellite RH qui concerne DEUX parties.
// On distingue la DEMANDE (statut initial `pending` → l'administration) de la
// DÉCISION (transition vers un autre statut → l'agent). Sans `before`, un upsert
// qui ne change pas le statut ne notifie personne : on ne re-notifie pas une
// simple correction de dates. Best-effort, jamais bloquant.
function notifyLeave(data, before) {
  if (!data) return;
  const wasPending = !before?.status || before.status === 'pending';
  const isPending = data.status === 'pending';
  const kind = isPending && wasPending ? 'hr.leave.requested'
    : (!isPending && wasPending ? 'hr.leave.decided' : null);
  if (!kind) return;                       // statut inchangé → rien à annoncer
  import('./notificationProducers.js')
    .then(({ notifySchoolEvent }) => notifySchoolEvent({
      kind, schoolId: data.school_id,
      payload: { staffId: data.staff_id, status: data.status, type: data.type, days: data.days },
    }))
    .catch(() => { /* notification best-effort */ });
}

export const HR_ENTITIES = {
  contracts:   makeEntity('hr_contracts', 'start_date'),
  leaves:      makeEntity('hr_leaves', 'start_date'),
  evaluations: makeEntity('hr_evaluations', 'eval_date'),
  attendance:  makeEntity('hr_attendance', 'att_date'),
  career:      makeEntity('hr_career_events', 'event_date'),
  payroll:     makeEntity('hr_payroll', 'period'),
};

// ── Catalogue de primes/retenues (configuré une fois par l'école) ────────────
// Pas de staff_id (portée école) et ordre croissant par position → la fabrique
// générique (staff_id optionnel, tri décroissant) ne convient pas telle quelle.
export async function fetchPayrollCatalog(schoolId) {
  const { data, error } = await supabase
    .from('hr_payroll_catalog').select('*').eq('school_id', schoolId).order('position', { ascending: true });
  if (error) { console.error('fetchPayrollCatalog', error); return null; }
  return data;
}
export async function upsertPayrollCatalogItem(row) {
  const payload = { id: row.id || uuid(), ...row, updated_at: new Date().toISOString(), version: (row.version || 0) + 1 };
  const { data, error } = await supabase.from('hr_payroll_catalog').upsert(payload, { onConflict: 'id' }).select().single();
  if (error) { console.error('upsertPayrollCatalogItem', error); return null; }
  return data;
}
export async function deletePayrollCatalogItem(id) {
  const { error } = await supabase.from('hr_payroll_catalog').delete().eq('id', id);
  if (error) { console.error('deletePayrollCatalogItem', error); return false; }
  return true;
}

// ── Lignes attachées à UN bulletin (snapshot du catalogue au moment de la
// saisie — indépendant des évolutions futures du catalogue) ──────────────────
export async function fetchPayrollItems(schoolId, payrollId) {
  const { data, error } = await supabase
    .from('hr_payroll_items').select('*').eq('school_id', schoolId).eq('payroll_id', payrollId);
  if (error) { console.error('fetchPayrollItems', error); return null; }
  return data;
}
// Remplace TOUTES les lignes d'un bulletin par la sélection courante (le
// formulaire de bulletin est un tout : pas de fusion incrémentale à gérer).
export async function replacePayrollItems(schoolId, payrollId, items = []) {
  const { error: delErr } = await supabase.from('hr_payroll_items').delete().eq('payroll_id', payrollId);
  if (delErr) { console.error('replacePayrollItems (delete)', delErr); return false; }
  if (!items.length) return true;
  const rows = items.map((it) => ({
    id: uuid(), school_id: schoolId, payroll_id: payrollId,
    catalog_id: it.catalog_id || it.id || null, code: it.code || null,
    kind: it.kind, name: it.name, calc_type: it.calc_type || null,
    rate: it.rate ?? null, base_ref: it.base_ref || null, amount: Number(it.resolved ?? it.amount) || 0,
    updated_at: new Date().toISOString(),
  }));
  const { error: insErr } = await supabase.from('hr_payroll_items').insert(rows);
  if (insErr) { console.error('replacePayrollItems (insert)', insErr); return false; }
  return true;
}
