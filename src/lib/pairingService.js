// Interface CLIENT du parcours « Préparer un serveur LAN » (Cloud → Hybride).
// Mince consommateur des RPC SECURITY DEFINER (supabase_lan_pairing.sql) : toute la
// sécurité (admin de l'école, aucun droit ajouté, code usage-unique) vit dans la RPC.
//
// prepare_hybrid : pose deployment_policy=hybride + remote_access sur les décideurs
// DÉJÀ autorisés par le référentiel (aucun octroi) + émet un code d'appairage.
// Le school_id vient de la SESSION (jamais saisi).
import { supabase } from './supabase';

// Prépare l'hybridation de l'école + renvoie un code d'appairage éphémère.
// → { code, expires_at, deciders_enabled, warning }
export async function prepareHybrid(schoolId, ttlMinutes = 30) {
  const { data, error } = await supabase.rpc('prepare_hybrid', {
    p_school: schoolId, p_ttl_minutes: ttlMinutes,
  });
  if (error) throw new Error(error.message);
  return Array.isArray(data) ? data[0] : data; // RETURNS TABLE → 1 ligne
}

// Émet un code supplémentaire sans re-poser la policy (ex. réinstallation).
export async function issuePairingCode(schoolId, ttlMinutes = 30) {
  const { data, error } = await supabase.rpc('issue_pairing_code', {
    p_school: schoolId, p_ttl_minutes: ttlMinutes,
  });
  if (error) throw new Error(error.message);
  return Array.isArray(data) ? data[0] : data;
}

// Révoque tous les codes non consommés de l'école. → nombre révoqué
export async function revokePairingCodes(schoolId) {
  const { data, error } = await supabase.rpc('revoke_pairing_codes', { p_school: schoolId });
  if (error) throw new Error(error.message);
  return data;
}

// Liste les codes émis (RLS : admin de l'école). Le code EN CLAIR n'y figure jamais
// (seulement l'indice + l'état). Sert au suivi/révocation dans l'UI.
export async function listPairingCodes(schoolId) {
  const { data, error } = await supabase
    .from('lan_pairing_codes')
    .select('id, code_hint, created_at, expires_at, used_at, revoked_at')
    .eq('school_id', schoolId)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) throw new Error(error.message);
  return data || [];
}

// Statut lisible d'un code (pour l'UI).
export function codeStatus(row, now = Date.now()) {
  if (row.revoked_at) return 'revoked';
  if (row.used_at) return 'used';
  if (new Date(row.expires_at).getTime() <= now) return 'expired';
  return 'active';
}
