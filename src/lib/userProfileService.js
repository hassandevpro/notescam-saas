// Profil utilisateur — couche d'accès Supabase pour le compte connecté.
//
// Les écritures sur `school_users` étant révoquées en direct (cf.
// supabase_security_hardening.sql), tout passe par des RPC SECURITY DEFINER
// définies dans supabase_user_profile.sql : un utilisateur ne peut modifier que
// SON propre profil. La photo est stockée dans le bucket `school-assets`
// (sous-dossier `<school_id>/users/`), recadrée et compressée côté client.

import { supabase } from './supabase';
import { ASSET_BUCKET } from './storage';
import { resizeImageToSquare, validateImageFile } from './image';

// Met à jour le nom complet + le téléphone du compte connecté.
export async function updateMyProfile({ fullName, phone }) {
  const { error } = await supabase.rpc('update_my_profile', {
    p_full_name: fullName ?? '',
    p_phone: phone ?? '',
  });
  if (error) console.error('updateMyProfile', error);
  return { error };
}

// Téléverse une nouvelle photo de profil. `file` est validé puis recadré/
// compressé en JPEG carré avant l'upload. Chemin déterministe (un fichier par
// compte) : un nouvel upload remplace l'ancien. `?v=` casse le cache navigateur.
export async function uploadMyPhoto(userId, schoolId, file) {
  const check = validateImageFile(file);
  if (!check.ok) return { url: null, error: new Error(check.error) };

  let blob;
  try {
    blob = await resizeImageToSquare(file, 400, 0.82);
  } catch (e) {
    console.error('uploadMyPhoto/resize', e);
    return { url: null, error: e };
  }

  const path = `${schoolId}/users/${userId}.jpg`;
  const { error: upErr } = await supabase.storage
    .from(ASSET_BUCKET)
    .upload(path, blob, { upsert: true, contentType: 'image/jpeg' });
  if (upErr) { console.error('uploadMyPhoto/upload', upErr); return { url: null, error: upErr }; }

  const { data } = supabase.storage.from(ASSET_BUCKET).getPublicUrl(path);
  const url = `${data.publicUrl}?v=${Date.now()}`;

  const { error } = await supabase.rpc('set_my_photo', { p_photo_url: url });
  if (error) { console.error('uploadMyPhoto/rpc', error); return { url: null, error }; }
  return { url, error: null };
}

// Retire la photo de profil (fichier + référence en base, best-effort).
export async function removeMyPhoto(userId, schoolId) {
  const path = `${schoolId}/users/${userId}.jpg`;
  try {
    await supabase.storage.from(ASSET_BUCKET).remove([path]);
  } catch (e) {
    console.warn('removeMyPhoto/storage', e);
  }
  const { error } = await supabase.rpc('set_my_photo', { p_photo_url: null });
  if (error) console.error('removeMyPhoto/rpc', error);
  return { error };
}

// Horodate la dernière connexion (best-effort, sans bloquer le flux d'auth).
export async function touchLastLogin() {
  try {
    await supabase.rpc('touch_my_last_login');
  } catch (e) {
    console.warn('touchLastLogin', e);
  }
}
