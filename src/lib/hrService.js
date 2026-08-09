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
