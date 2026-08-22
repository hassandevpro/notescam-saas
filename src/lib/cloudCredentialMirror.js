// src/lib/cloudCredentialMirror.js
// Sens Cloud → Local du pont d'identifiants : quand un utilisateur change son mot
// de passe dans l'app CLOUD, on chiffre le nouveau mot de passe avec la clé
// PUBLIQUE du serveur LAN de son école et on le dépose dans `credential_outbox`.
// Seul ce serveur (clé privée locale) peut le déchiffrer, le re-hacher (scrypt)
// et l'appliquer → le même mot de passe ouvre en local.
//
// Sans serveur LAN pour l'école (pas de clé publiée) → no-op silencieux.
// Best-effort : n'interrompt JAMAIS le changement de mot de passe.
//
// RSA-OAEP avec SHA-256 (doit correspondre au décryptage serveur, authBridge.js).

import { supabase } from './supabase';
import { IS_LAN } from './edition';

function pemToDer(pem) {
  const b64 = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}
function abToB64(buf) {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

// `opts` permet de couvrir les deux appelants sans dupliquer la logique :
//   • rien           → l'utilisateur courant change SON mot de passe (Forgot/Reset) ;
//   • { client }     → une autre session Supabase que celle de l'app (client sans
//                      persistance qui vient de créer un compte du personnel) ;
//   • { user }       → cible explicite { id, email } quand l'appelant la connaît
//                      déjà (l'admin qui réinitialise le mot de passe d'un membre) ;
//   • { schoolId }   → évite une requête d'appartenance quand l'école est connue.
export async function mirrorPasswordToLan(plaintext, opts = {}) {
  // En édition LAN, le serveur local gère déjà la conservation du mot de passe.
  if (IS_LAN || !plaintext || !globalThis.crypto?.subtle) return { skipped: true };
  const client = opts.client || supabase;
  try {
    const user = opts.user || (await client.auth.getUser()).data?.user;
    if (!user?.id) return { skipped: true };

    // École de l'utilisateur.
    let schoolId = opts.schoolId;
    if (!schoolId) {
      const { data: membership } = await client
        .from('school_users').select('school_id').eq('user_id', user.id).limit(1).maybeSingle();
      schoolId = membership?.school_id;
    }
    if (!schoolId) return { skipped: true };

    // Clé publique du serveur LAN de cette école (publiée par publish-server-key).
    const { data: keyRow } = await client
      .from('school_credential_keys').select('public_key').eq('school_id', schoolId).maybeSingle();
    if (!keyRow?.public_key) return { skipped: true }; // pas de serveur LAN → rien à faire

    const key = await crypto.subtle.importKey(
      'spki', pemToDer(keyRow.public_key),
      { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt']);
    const ct = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, key, new TextEncoder().encode(plaintext));

    const { error } = await client.from('credential_outbox').insert({
      school_id: schoolId, cloud_user_id: user.id, email: user.email, ciphertext: abToB64(ct),
    });
    if (error) throw error;
    return { ok: true };
  } catch (e) {
    console.warn('[credential-mirror] non propagé:', e?.message || e);
    return { ok: false };
  }
}
