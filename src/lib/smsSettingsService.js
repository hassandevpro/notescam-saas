// Config fournisseur SMS + suivi de statut, par école. Table Cloud-only
// (school_sms_settings), volontairement absente de la synchro LAN — cf.
// supabase_sms_config.sql. Toujours via le vrai client Supabase (src/lib/supabase.js
// n'est jamais aliasé en LAN), donc identique en édition Cloud et LAN.
import { supabase } from './supabase';

export async function fetchSmsSettings(schoolId) {
  if (!schoolId) return null;
  const { data, error } = await supabase
    .from('school_sms_settings').select('*').eq('school_id', schoolId).maybeSingle();
  if (error) { console.error('fetchSmsSettings', error); return null; }
  return data;
}

export async function updateSmsSettings(schoolId, updates) {
  if (!schoolId) return { error: 'École introuvable' };
  const { data, error } = await supabase
    .from('school_sms_settings')
    .upsert({ school_id: schoolId, ...updates, updated_at: new Date().toISOString() }, { onConflict: 'school_id' })
    .select().single();
  if (error) { console.error('updateSmsSettings', error); return { error: error.message }; }
  return { data };
}

export async function fetchSmsOutboxStatus(schoolId, limit = 20) {
  if (!schoolId) return [];
  const { data, error } = await supabase
    .from('notification_outbox').select('id, address, status, error, attempts, priority, created_at, updated_at')
    .eq('school_id', schoolId).eq('channel', 'sms')
    .order('created_at', { ascending: false }).limit(limit);
  if (error) { console.error('fetchSmsOutboxStatus', error); return []; }
  return data || [];
}

// Remet le compteur de dépense à zéro (ex. nouvelle année scolaire / nouvelle enveloppe).
export async function resetSmsSpend(schoolId) {
  return updateSmsSettings(schoolId, { spent_fcfa: 0 });
}

// Masque un numéro pour l'affichage (garde les 3 derniers chiffres).
export function maskPhone(address) {
  if (!address) return '—';
  const s = String(address);
  return s.length <= 4 ? s : `${'•'.repeat(s.length - 3)}${s.slice(-3)}`;
}
