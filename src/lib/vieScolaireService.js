// Couche CRUD Supabase du module VIE SCOLAIRE (surveillant / discipline).
//
// Tables (cf. supabase_vie_scolaire.sql) :
//   late_arrivals · disciplinary_incidents · disciplinary_actions ·
//   student_warnings · student_detentions · parent_meetings ·
//   exit_permissions · discipline_statistics
//
// Toutes partagent le même socle (school_id, student_id, year_label, date) donc
// on génère fetch/upsert/remove par fabrique. Pattern d'appel en page, comme
// Absences.jsx (Supabase direct — ces écrans sont réservés à la direction/
// surveillant et chargés à la demande, hors du gros schoolStore offline-first).

import { supabase } from './supabase';
import { uuid } from './uuid';

// Fabrique un trio { fetch, upsert, remove } pour une table donnée.
function makeEntity(table) {
  return {
    // Liste les lignes de l'école (filtre année facultatif), triées par date desc.
    async fetch(schoolId, { yearLabel, studentId } = {}) {
      let q = supabase.from(table).select('*').eq('school_id', schoolId);
      if (yearLabel) q = q.eq('year_label', yearLabel);
      if (studentId) q = q.eq('student_id', studentId);
      const { data, error } = await q.order('date', { ascending: false });
      if (error) { console.error(`fetch ${table}`, error); return null; }
      return data;
    },

    // Insert/maj. Génère un id + tampons de synchro si absents.
    async upsert(row) {
      const payload = {
        id: row.id || uuid(),
        ...row,
        updated_at: new Date().toISOString(),
        version: (row.version || 0) + 1,
      };
      const { data, error } = await supabase
        .from(table)
        .upsert(payload, { onConflict: 'id' })
        .select()
        .single();
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

export const lateArrivals    = makeEntity('late_arrivals');
export const incidents       = makeEntity('disciplinary_incidents');
export const actions         = makeEntity('disciplinary_actions');
export const warnings        = makeEntity('student_warnings');
export const detentions      = makeEntity('student_detentions');
export const parentMeetings  = makeEntity('parent_meetings');
export const exitPermissions = makeEntity('exit_permissions');
export const disciplineCouncil = makeEntity('discipline_statistics');

// Regroupé pour l'import unique côté page.
export const vieScolaire = {
  lateArrivals, incidents, actions, warnings, detentions,
  parentMeetings, exitPermissions, disciplineCouncil,
};

// ── Agrégats pour le tableau de bord ─────────────────────────────────────────
// Charge en parallèle tout ce dont le dashboard a besoin pour l'année active.
// Renvoie des tableaux bruts ; l'agrégation (par jour, par classe, récidivistes)
// se fait dans le composant qui connaît le périmètre du surveillant.
export async function fetchVieScolaireSnapshot(schoolId, yearLabel) {
  const [late, inc, act, meet] = await Promise.all([
    lateArrivals.fetch(schoolId, { yearLabel }),
    incidents.fetch(schoolId, { yearLabel }),
    actions.fetch(schoolId, { yearLabel }),
    parentMeetings.fetch(schoolId, { yearLabel }),
  ]);
  return {
    lateArrivals:   late || [],
    incidents:      inc  || [],
    actions:        act  || [],
    parentMeetings: meet || [],
  };
}

// Dossier disciplinaire complet d'un élève (fiche individuelle).
export async function fetchStudentDisciplineFile(schoolId, studentId) {
  const [late, inc, act, warn, det, meet, exits] = await Promise.all([
    lateArrivals.fetch(schoolId, { studentId }),
    incidents.fetch(schoolId, { studentId }),
    actions.fetch(schoolId, { studentId }),
    warnings.fetch(schoolId, { studentId }),
    detentions.fetch(schoolId, { studentId }),
    parentMeetings.fetch(schoolId, { studentId }),
    exitPermissions.fetch(schoolId, { studentId }),
  ]);
  return {
    lateArrivals: late || [], incidents: inc || [], actions: act || [],
    warnings: warn || [], detentions: det || [], parentMeetings: meet || [],
    exitPermissions: exits || [],
  };
}
