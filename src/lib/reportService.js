// Couche données du module Reports. Écrit sur la table `signalements` existante
// (catégorie=domain, gravité=priority, statut=status) + satellites commentaires
// & historique. En LAN, aliasé vers localClient. PAS de notifications.
import { supabase } from './supabase';
import { uuid } from './uuid';
import { resolveAssignment, initialStatus, STATUS } from './reportEngine';
import { notifyRole } from './notificationService';

export async function fetchReports(schoolId) {
  const { data, error } = await supabase
    .from('signalements').select('*').eq('school_id', schoolId).order('created_at', { ascending: false });
  if (error) { console.error('fetchReports', error); return null; }
  return data;
}

async function addHistory({ schoolId, signalementId, action, from_status = null, to_status = null, detail = null, actor = null, actorId = null }) {
  const now = new Date().toISOString();
  const rec = {
    id: uuid(), school_id: schoolId, signalement_id: signalementId, action,
    from_status, to_status, detail, actor, actor_id: actorId, at: now, updated_at: now, version: 1,
  };
  const { error } = await supabase.from('signalement_history').upsert(rec, { onConflict: 'id' });
  if (error) console.error('addHistory', error);
}

// Création d'un report — AFFECTATION AUTOMATIQUE + trace d'historique.
export async function createReport({ schoolId, category, severity = 'normal', title, description = '', reporterName = null, reporterId = null }) {
  const dept = resolveAssignment(category);
  const status = initialStatus(category);
  const now = new Date().toISOString();
  const rec = {
    id: uuid(), school_id: schoolId, domain: category, priority: severity, title,
    description: description || '', status, assigned_department: dept,
    reporter_name: reporterName, reporter_id: reporterId, created_at: now, updated_at: now, version: 1,
  };
  const { data, error } = await supabase.from('signalements').upsert(rec, { onConflict: 'id' }).select().single();
  if (error) { console.error('createReport', error); return null; }
  await addHistory({ schoolId, signalementId: rec.id, action: 'created', to_status: status, detail: dept ? `→ ${dept}` : null, actor: reporterName, actorId: reporterId });
  // Notification interne aux admins (non bloquant ; le canal interne suffit).
  try {
    await notifyRole(schoolId, 'admin', {
      type: 'report_created', title: `Signalement : ${title}`,
      body: `${category}${dept ? ` → ${dept}` : ''}`, link: '/app/signalements',
    });
  } catch (e) { console.warn('notify report_created', e); }
  return data;
}

// Changement de statut — historisé.
export async function changeReportStatus(report, to, { actor = null, actorId = null } = {}) {
  const now = new Date().toISOString();
  const patch = { ...report, status: to, updated_at: now, version: (report.version || 0) + 1 };
  if (to === STATUS.CLOSED) patch.closed_at = now;
  const { data, error } = await supabase.from('signalements').upsert(patch, { onConflict: 'id' }).select().single();
  if (error) { console.error('changeReportStatus', error); return null; }
  await addHistory({ schoolId: report.school_id, signalementId: report.id, action: 'status_changed', from_status: report.status, to_status: to, actor, actorId });
  return data;
}

// Réaffectation manuelle d'un département — historisée.
export async function reassignReport(report, department, { actor = null, actorId = null } = {}) {
  const patch = { ...report, assigned_department: department, updated_at: new Date().toISOString(), version: (report.version || 0) + 1 };
  const { data, error } = await supabase.from('signalements').upsert(patch, { onConflict: 'id' }).select().single();
  if (error) { console.error('reassignReport', error); return null; }
  await addHistory({ schoolId: report.school_id, signalementId: report.id, action: 'reassigned', detail: department, actor, actorId });
  return data;
}

export async function deleteReport(id) {
  const { error } = await supabase.from('signalements').delete().eq('id', id);
  if (error) { console.error('deleteReport', error); return false; }
  return true;
}

// Commentaires
export async function fetchComments(schoolId, signalementId) {
  const { data, error } = await supabase
    .from('signalement_comments').select('*').eq('signalement_id', signalementId).order('created_at', { ascending: true });
  if (error) { console.error('fetchComments', error); return []; }
  return data;
}
export async function addComment({ schoolId, signalementId, body, author = null, authorId = null }) {
  const now = new Date().toISOString();
  const rec = { id: uuid(), school_id: schoolId, signalement_id: signalementId, body, author, author_id: authorId, created_at: now, updated_at: now, version: 1 };
  const { data, error } = await supabase.from('signalement_comments').upsert(rec, { onConflict: 'id' }).select().single();
  if (error) { console.error('addComment', error); return null; }
  await addHistory({ schoolId, signalementId, action: 'commented', actor: author, actorId: authorId });
  return data;
}

// Historique
export async function fetchHistory(schoolId, signalementId) {
  const { data, error } = await supabase
    .from('signalement_history').select('*').eq('signalement_id', signalementId).order('at', { ascending: false });
  if (error) { console.error('fetchHistory', error); return []; }
  return data;
}
