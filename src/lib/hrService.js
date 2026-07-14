// Couche CRUD Supabase du module RH. Une fabrique par entité satellite du
// dossier `staff` (contrats, congés, évaluations, présences, historique).
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
      return data;
    },
    async remove(id) {
      const { error } = await supabase.from(table).delete().eq('id', id);
      if (error) { console.error(`delete ${table}`, error); return false; }
      return true;
    },
  };
}

export const HR_ENTITIES = {
  contracts:   makeEntity('hr_contracts', 'start_date'),
  leaves:      makeEntity('hr_leaves', 'start_date'),
  evaluations: makeEntity('hr_evaluations', 'eval_date'),
  attendance:  makeEntity('hr_attendance', 'att_date'),
  career:      makeEntity('hr_career_events', 'event_date'),
};
