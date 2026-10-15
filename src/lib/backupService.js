// Sauvegarde / restauration — façade navigateur (cloud ET LAN).
//
// Export / import JSON : backupEngine.js via `supabase` (aliasé vers
// localClient en LAN), donc le même code dans les deux éditions.
// Sauvegardes automatiques :
//   • cloud : instantanés nocturnes en base (public.school_backups, pg_cron) ;
//   • LAN   : copies .db du serveur toutes les 2 h (server/backup.js).

import { supabase } from './supabase';
import { IS_LAN } from './edition';
import { exportSchoolData, restoreSchoolData } from './backupEngine';
import { backupFileName, validateBundle } from './backupCore';

export { validateBundle };

export async function exportSchool({ schoolId, onProgress }) {
  return exportSchoolData(supabase, { schoolId, edition: IS_LAN ? 'lan' : 'cloud', onProgress });
}

export function downloadJson(bundle, schoolName) {
  const blob = new Blob([JSON.stringify(bundle)], { type: 'application/json' });
  triggerDownload(blob, backupFileName(schoolName, new Date(bundle.createdAt || Date.now())));
}

function triggerDownload(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export async function readBundleFile(file) {
  const text = await file.text();
  try { return JSON.parse(text); } catch { throw new Error('Fichier illisible : ce n’est pas un JSON valide.'); }
}

export function previewRestore(bundle, { schoolId, mode }) {
  return restoreSchoolData(supabase, bundle, { schoolId, mode, dryRun: true });
}

export function restoreBundle(bundle, { schoolId, mode, onProgress }) {
  return restoreSchoolData(supabase, bundle, { schoolId, mode, onProgress });
}

// ── Sauvegardes automatiques ────────────────────────────────────────────────
function lanToken() {
  try { return JSON.parse(sessionStorage.getItem('nc_lan_session') || 'null')?.access_token || null; } catch { return null; }
}
async function lanFetch(path, { method = 'GET', body } = {}) {
  const token = lanToken();
  const headers = { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) };
  const res = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let json = null;
  try { json = await res.json(); } catch { /* corps vide */ }
  if (!res.ok || json?.error) throw new Error(json?.error?.message || `HTTP ${res.status}`);
  return json?.data;
}

// Liste unifiée : [{ id, at, kind, label, emergency, totalRows, bytes }]
export async function listAutoBackups(schoolId) {
  if (IS_LAN) {
    const rows = await lanFetch('/api/backup/list');
    return (rows || []).map((b) => ({ id: b.file, at: b.at, kind: 'server', label: b.label, emergency: b.emergency, mismatches: b.mismatches }));
  }
  const { data, error } = await supabase
    .from('school_backups')
    .select('id, created_at, kind, total_rows, bytes')
    .eq('school_id', schoolId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []).map((b) => ({ id: b.id, at: b.created_at, kind: b.kind, totalRows: b.total_rows, bytes: b.bytes }));
}

export async function snapshotNow(schoolId) {
  if (IS_LAN) return lanFetch('/api/backup', { method: 'POST', body: {} });
  const { data, error } = await supabase.rpc('backup_snapshot_now', { p_school: schoolId });
  if (error) throw new Error(error.message);
  return data;
}

// Cloud : charge le contenu d'un instantané (même format qu'un export JSON).
export async function loadCloudSnapshot(id) {
  const { data, error } = await supabase.from('school_backups').select('payload').eq('id', id).single();
  if (error) throw new Error(error.message);
  return data.payload;
}

// LAN : télécharge le fichier .db d'une sauvegarde serveur.
export async function downloadServerBackup(file) {
  const token = lanToken();
  const res = await fetch(`/api/backup/file/${encodeURIComponent(file)}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new Error(`Téléchargement impossible (HTTP ${res.status})`);
  triggerDownload(await res.blob(), file);
}

export const scheduleServerRestore = (file) => lanFetch('/api/backup/restore', { method: 'POST', body: { file } });
export const cancelServerRestore = () => lanFetch('/api/backup/restore', { method: 'DELETE' });
export const serverRestoreStatus = () => lanFetch('/api/backup/restore/status');
