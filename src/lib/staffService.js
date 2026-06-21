// Couche Supabase pour le module Personnel (table `staff`).
//
// Registre unique du personnel, tous départements confondus :
//   enseignants | administration | surveillance | sante | comptabilite | support
//
// Les ENSEIGNANTS conservent en plus leur profil pédagogique dans `teachers`
// (matières/classes/titulaire, comptes app) — ils sont un sous-type du personnel.
//
// Au build LAN, `./supabase` est aliasé vers localClient (cf. vite.config.js) :
// ces appels passent alors par le serveur Fastify → SQLite, sans changement de code.

import { supabase } from './supabase';

// Départements gérés par le module Personnel (ordre d'affichage des onglets).
export const STAFF_DEPARTMENTS = [
  'enseignants', 'administration', 'surveillance', 'sante', 'comptabilite', 'support',
];

// Convertit les chaînes vides en null pour les colonnes nullables (Postgres
// rejette '' sur une colonne date). `documents` reste un tableau JSON.
const NULLABLE = [
  'matricule', 'first_name', 'last_name', 'gender', 'phone', 'email',
  'address', 'photo_url', 'fonction', 'hire_date', 'status',
];
function sanitizeStaff(d) {
  const out = { ...d };
  for (const k of NULLABLE) if (k in out) out[k] = out[k] || null;
  return out;
}

export async function fetchStaff(schoolId) {
  const { data, error } = await supabase
    .from('staff')
    .select('*')
    .eq('school_id', schoolId)
    .order('name');
  if (error) { console.error('fetchStaff', error); return null; }
  return data;
}

export async function upsertStaff(staffData) {
  const { data, error } = await supabase
    .from('staff')
    .upsert(sanitizeStaff(staffData), { onConflict: 'id' })
    .select()
    .single();
  if (error) { console.error('upsertStaff', error); return null; }
  return data;
}

export async function deleteStaff(id) {
  const { error } = await supabase.from('staff').delete().eq('id', id);
  if (error) { console.error('deleteStaff', error); return false; }
  return true;
}

// Photo d'un membre du personnel — même bucket que les assets école. `folder`
// distingue le sous-dossier (`staff` ou `teachers`) car les enseignants sont eux
// aussi du personnel. `file` est attendu déjà redimensionné en JPEG (lib/image.js).
// Chemin déterministe (un fichier par membre) : un nouvel upload remplace l'ancien.
export async function uploadStaffPhoto(schoolId, staffId, file, folder = 'staff') {
  const path = `${schoolId}/${folder}/${staffId}.jpg`;
  const { error } = await supabase.storage
    .from('school-assets')
    .upload(path, file, { upsert: true, contentType: 'image/jpeg' });
  if (error) { console.error('uploadStaffPhoto', error); return { url: null, error }; }
  const { data } = supabase.storage.from('school-assets').getPublicUrl(path);
  return { url: `${data.publicUrl}?v=${Date.now()}`, error: null };
}

// Pièce jointe (contrat, diplôme…). Stockée sous `${schoolId}/${folder}/${id}/docs/`.
// Le nom de fichier est horodaté pour éviter les collisions ; on renvoie
// { name, url } à pousser dans le tableau `documents`.
export async function uploadStaffDocument(schoolId, staffId, file, folder = 'staff') {
  const safe = (file.name || 'document').replace(/[^\w.\-]+/g, '_');
  const path = `${schoolId}/${folder}/${staffId}/docs/${Date.now()}_${safe}`;
  const { error } = await supabase.storage
    .from('school-assets')
    .upload(path, file, { upsert: true, contentType: file.type || 'application/octet-stream' });
  if (error) { console.error('uploadStaffDocument', error); return { doc: null, error }; }
  const { data } = supabase.storage.from('school-assets').getPublicUrl(path);
  return { doc: { name: file.name || safe, url: data.publicUrl }, error: null };
}

// Normalise le champ `documents` : array (cloud jsonb) ou string JSON (LAN TEXT).
export function parseDocs(v) {
  if (Array.isArray(v)) return v;
  if (!v) return [];
  try { return JSON.parse(v); } catch { return []; }
}
