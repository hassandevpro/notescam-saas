// Provisioning de comptes du personnel de direction (censeur, surveillant)
// par l'administrateur. Réutilise le motif de Teachers.jsx : un client
// « anonyme » sans persistance crée le compte auth sans déconnecter l'admin,
// puis un RPC SECURITY DEFINER le lie à l'école avec le bon rôle.
import { createClient } from '@supabase/supabase-js';
import { supabase } from './supabase';

// Client sans persistance de session — crée des comptes sans déconnecter l'admin.
const anonClient = createClient(
  import.meta.env.VITE_SUPABASE_URL || 'https://ltxopwoxvgslsgzixbpx.supabase.co',
  import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx0eG9wd294dmdzbHNneml4YnB4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2MDk5MDEsImV4cCI6MjA5NDE4NTkwMX0.Ti72TVBLtxET3Wmmg3-pzQ0bmXFtf0HvBf7Phl_Hb20',
  { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
);

// Crée (ou réutilise) un compte auth et le lie à l'école avec le rôle donné.
// Lève new Error('EMAIL_IN_USE') si l'email existe avec un autre mot de passe.
export async function createStaffAccount({ email, password, fullName, role }) {
  const mail = email.trim();
  const { data: signUpData, error: signUpError } = await anonClient.auth.signUp({ email: mail, password });

  let targetUserId;
  if (signUpError) {
    if (/already registered|User already registered/i.test(signUpError.message || '')) {
      const { data: signInData, error: signInError } = await anonClient.auth.signInWithPassword({ email: mail, password });
      if (signInError) throw new Error('EMAIL_IN_USE');
      targetUserId = signInData.user?.id;
    } else {
      throw signUpError;
    }
  } else {
    if (!signUpData.user) throw new Error('SIGNUP_FAILED');
    targetUserId = signUpData.user.id;
  }

  const { error: rpcError } = await supabase.rpc('admin_create_staff_account', {
    p_target_user_id: targetUserId,
    p_full_name:      fullName,
    p_role:           role,
  });
  if (rpcError) throw rpcError;
  return { email: mail };
}

export async function fetchStaff(role) {
  const { data, error } = await supabase.rpc('admin_list_staff', { p_role: role });
  if (error) { console.error('fetchStaff', error); return []; }
  return data || [];
}

export async function setStaffActive(schoolUserId, active) {
  const { error } = await supabase.rpc('admin_set_staff_active', {
    p_school_user_id: schoolUserId,
    p_active:         active,
  });
  return { error };
}

// L'admin définit le PÉRIMÈTRE vie scolaire d'un surveillant/censeur : sections,
// cycles et/ou classes accessibles (tableaux vides = tout l'établissement).
// RPC admin_set_staff_scope (migration supabase_vie_scolaire.sql).
export async function setStaffScope(schoolUserId, { sections = [], cycles = [], classIds = [] }) {
  const { error } = await supabase.rpc('admin_set_staff_scope', {
    p_school_user_id: schoolUserId,
    p_sections:       sections,
    p_cycles:         cycles,
    p_class_ids:      classIds,
  });
  return { error };
}

// L'admin redéfinit le mot de passe d'un compte de direction (censeur/surveillant)
// de SON école. RPC SECURITY DEFINER (cloud) / handler local (LAN).
export async function setStaffPassword(schoolUserId, newPassword) {
  const { error } = await supabase.rpc('admin_set_staff_password', {
    p_school_user_id: schoolUserId,
    p_new_password:   newPassword,
  });
  return { error };
}
