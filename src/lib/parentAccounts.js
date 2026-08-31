// Approvisionnement des COMPTES PARENTS par l'établissement.
//
// Même motif que src/lib/staffAccounts.js, pour la même raison : un client
// « anonyme » sans persistance de session crée le compte auth sans déconnecter
// la personne du secrétariat, puis une RPC SECURITY DEFINER pose l'identité et
// le rattachement.
//
// La différence tient en une ligne, et c'est la plus importante du fichier :
// `admin_create_parent_account` n'écrit PAS dans `school_users`. Un parent n'y
// entre jamais — c'est ce qui l'empêche d'hériter des droits du personnel, car
// toutes les policies de la base accordent l'accès sur cette appartenance sans
// regarder le rôle.
import { createClient } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { mirrorPasswordToLan } from './cloudCredentialMirror';

const anonClient = createClient(
  import.meta.env.VITE_SUPABASE_URL || 'https://ltxopwoxvgslsgzixbpx.supabase.co',
  import.meta.env.VITE_SUPABASE_ANON_KEY || '',
  { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
);

/**
 * Crée (ou réutilise) un compte auth, en fait un compte PARENT, et le rattache
 * à un élève. Lève Error('EMAIL_IN_USE') si l'e-mail existe avec un autre mot
 * de passe, et remonte telle quelle l'erreur du serveur si le compte visé
 * appartient au personnel ou si l'élève est hors du secteur de l'appelant.
 */
export async function createParentAccount({
  email, password, fullName, phone = null,
  studentId, relationship = 'tuteur', isPrimary = false,
}) {
  const mail = String(email || '').trim();
  const { data: signUpData, error: signUpError } = await anonClient.auth.signUp({ email: mail, password });

  let targetUserId;
  if (signUpError) {
    if (/already registered|User already registered/i.test(signUpError.message || '')) {
      const { data: signInData, error: signInError } =
        await anonClient.auth.signInWithPassword({ email: mail, password });
      if (signInError) throw new Error('EMAIL_IN_USE');
      targetUserId = signInData.user?.id;
    } else {
      throw signUpError;
    }
  } else {
    if (!signUpData.user) throw new Error('SIGNUP_FAILED');
    targetUserId = signUpData.user.id;
  }

  const { error: acctError } = await supabase.rpc('admin_create_parent_account', {
    p_user_id: targetUserId, p_full_name: fullName, p_phone: phone, p_email: mail,
  });
  if (acctError) throw acctError;

  if (studentId) {
    const { error: linkError } = await linkParentToStudent(targetUserId, studentId, relationship, isPrimary);
    if (linkError) throw linkError;
  }

  // Sens Cloud → LAN : sans ce dépôt, le compte n'existerait que dans le cloud
  // et le parent ne pourrait pas ouvrir de session sur le serveur de l'école.
  // Best-effort, jamais bloquant.
  await mirrorPasswordToLan(password, { client: anonClient, user: { id: targetUserId, email: mail } })
    .then((r) => (r?.ok ? r : mirrorPasswordToLan(password, { user: { id: targetUserId, email: mail } })))
    .catch(() => {});

  return { email: mail, userId: targetUserId };
}

// Rattache un compte parent EXISTANT à un élève. Le contrôle de secteur est fait
// côté serveur (user_scope_allows_student) : un responsable du Collège ne peut
// pas rattacher un parent à un élève du Primaire.
export async function linkParentToStudent(parentUserId, studentId, relationship = 'tuteur', isPrimary = false) {
  const { data, error } = await supabase.rpc('admin_link_parent_student', {
    p_parent_user_id: parentUserId,
    p_student_id: studentId,
    p_relationship: relationship,
    p_is_primary: isPrimary,
  });
  return { data, error };
}

// Révoque un rattachement. Le lien n'est jamais supprimé : `active` passe à
// false, avec la date et l'auteur — « qui a vu quoi, jusqu'à quand » reste
// établissable, comme pour les contre-passations de caisse.
export async function revokeParentLink(linkId) {
  const { error } = await supabase.rpc('admin_revoke_parent_link', { p_link_id: linkId });
  return { error };
}

// Comptes parents rattachés à un élève (fiche élève, côté personnel).
export async function fetchParentLinks(studentId) {
  const { data, error } = await supabase.rpc('admin_list_parent_links', { p_student_id: studentId });
  if (error) { console.error('fetchParentLinks', error); return []; }
  return data || [];
}

// Mot de passe lisible à remettre à la famille (3 lettres + 4 chiffres + symbole).
export function generateParentPassword() {
  const U = 'ABCDEFGHJKLMNPQRSTUVWXYZ', l = 'abcdefghijkmnpqrstuvwxyz', D = '23456789', S = '@#!$';
  const p = (s) => s[Math.floor(Math.random() * s.length)];
  return `${p(U)}${p(l)}${p(l)}${p(D)}${p(D)}${p(D)}${p(D)}${p(S)}`;
}
