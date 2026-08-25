// Provisioning de comptes du personnel de direction (censeur, surveillant)
// par l'administrateur. Réutilise le motif de Teachers.jsx : un client
// « anonyme » sans persistance crée le compte auth sans déconnecter l'admin,
// puis un RPC SECURITY DEFINER le lie à l'école avec le bon rôle.
import { createClient } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { mirrorPasswordToLan } from './cloudCredentialMirror';
import { IS_LAN } from './edition';

// Client sans persistance de session — crée des comptes sans déconnecter l'admin.
const anonClient = createClient(
  import.meta.env.VITE_SUPABASE_URL || 'https://ltxopwoxvgslsgzixbpx.supabase.co',
  import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx0eG9wd294dmdzbHNneml4YnB4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2MDk5MDEsImV4cCI6MjA5NDE4NTkwMX0.Ti72TVBLtxET3Wmmg3-pzQ0bmXFtf0HvBf7Phl_Hb20',
  { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
);

// Crée (ou réutilise) un compte auth et le lie à l'école avec le rôle donné.
// Lève new Error('EMAIL_IN_USE') si l'email existe avec un autre mot de passe.
export async function createStaffAccount({ email, password, fullName, role, permissions = null }) {
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

  const permJson = permissions && permissions.length ? JSON.stringify(permissions) : null;
  // Appel avec permissions ; repli sans si la RPC ne connaît pas encore le param
  // (migration supabase_staff_permissions.sql non exécutée).
  let rpcError = null;
  ({ error: rpcError } = await supabase.rpc('admin_create_staff_account', {
    p_target_user_id: targetUserId, p_full_name: fullName, p_role: role, p_permissions: permJson,
  }));
  if (rpcError && /p_permissions|does not exist|function/i.test(rpcError.message || '')) {
    ({ error: rpcError } = await supabase.rpc('admin_create_staff_account', {
      p_target_user_id: targetUserId, p_full_name: fullName, p_role: role,
    }));
  }
  if (rpcError) throw rpcError;

  // Sens Cloud → Local : sans ce dépôt, le compte n'existe QUE dans le cloud et
  // son titulaire ne peut ouvrir aucune session sur le serveur LAN de l'école.
  // Après la RPC seulement : la politique RLS exige que la cible soit déjà
  // membre de l'école, et la clé publique du serveur n'est lisible que par un
  // membre. On dépose avec la session du compte créé (anonClient) ; si elle
  // n'existe pas (confirmation d'e-mail exigée), l'admin dépose à sa place.
  // Best-effort : jamais bloquant pour la création du compte.
  await mirrorPasswordToLan(password, { client: anonClient, user: { id: targetUserId, email: mail } })
    .then((r) => (r?.ok ? r : mirrorPasswordToLan(password, { user: { id: targetUserId, email: mail } })))
    .catch(() => {});

  return { email: mail, userId: targetUserId };
}

// Mot de passe lisible à remettre au membre (3 lettres + 4 chiffres + symbole).
export function generatePassword() {
  const U = 'ABCDEFGHJKLMNPQRSTUVWXYZ', l = 'abcdefghijkmnpqrstuvwxyz', D = '23456789', S = '@#!$';
  const p = (s) => s[Math.floor(Math.random() * s.length)];
  return `${p(U)}${p(l)}${p(l)}${p(D)}${p(D)}${p(D)}${p(D)}${p(S)}`;
}

export async function fetchStaff(role) {
  const { data, error } = await supabase.rpc('admin_list_staff', { p_role: role });
  if (error) { console.error('fetchStaff', error); return []; }
  return data || [];
}

// Met à jour les capacités (permissions granulaires) d'un compte délégué existant.
export async function setStaffPermissions(schoolUserId, permissions) {
  const permJson = permissions && permissions.length ? JSON.stringify(permissions) : null;
  const { error } = await supabase.rpc('admin_set_staff_permissions', {
    p_school_user_id: schoolUserId, p_permissions: permJson,
  });
  return { error };
}

// Parse le champ permissions (JSON texte) d'une ligne de compte -> tableau (ou []).
export function parsePermissions(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try { const p = JSON.parse(raw); return Array.isArray(p) ? p : []; } catch { return []; }
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
// `global` : périmètre GLOBAL EXPLICITE (school_users.scope_global). Depuis le
// cloisonnement par secteur, « trois tableaux vides » ne vaut PLUS « tout
// l'établissement » — un compte transversal doit être marqué global de façon
// explicite, sinon il n'accède à rien.
export async function setStaffScope(schoolUserId, { sections = [], cycles = [], classIds = [], global = false }) {
  const { error } = await supabase.rpc('admin_set_staff_scope', {
    p_school_user_id: schoolUserId,
    p_sections:       global ? [] : sections,
    p_cycles:         global ? [] : cycles,
    p_class_ids:      global ? [] : classIds,
    p_global:         !!global,
  });
  return { error };
}

// L'admin redéfinit le mot de passe d'un compte de direction (censeur/surveillant)
// de SON école. RPC SECURITY DEFINER (cloud) / handler local (LAN).
export async function setStaffPassword(schoolUserId, newPassword) {
  const { data: targetEmail, error } = await supabase.rpc('admin_set_staff_password', {
    p_school_user_id: schoolUserId,
    p_new_password:   newPassword,
  });
  if (error) return { error };

  // Sens Cloud → Local : propage le nouveau mot de passe au serveur LAN de
  // l'école, faute de quoi il ne s'applique qu'en ligne et le membre reste
  // bloqué en local. Best-effort — le mot de passe cloud est déjà changé, on ne
  // fait jamais échouer l'opération sur le miroir.
  // En édition LAN, le serveur local vient déjà d'écrire le hash scrypt
  // (rpc.js:admin_set_staff_password) : rien à miroiter, et on évite une
  // requête inutile.
  if (IS_LAN) return { error: null };
  try {
    const { data: su } = await supabase.from('school_users')
      .select('school_id, user_id').eq('id', schoolUserId).maybeSingle();
    // `targetEmail` vient de la RPC (migration supabase_credential_channel_provisioning.sql).
    // Sur un cloud pas encore migré elle ne renvoie rien : sans e-mail, le serveur
    // ne peut que METTRE À JOUR un compte local existant, pas en créer un.
    if (su?.user_id) {
      await mirrorPasswordToLan(newPassword, {
        user: { id: su.user_id, email: targetEmail || null },
        schoolId: su.school_id,
      });
    }
  } catch { /* miroir best-effort */ }

  return { error: null };
}
