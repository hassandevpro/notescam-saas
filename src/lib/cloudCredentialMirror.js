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

export async function mirrorPasswordToLan(plaintext) {
  // En édition LAN, le serveur local gère déjà la conservation du mot de passe.
  if (IS_LAN || !plaintext || !globalThis.crypto?.subtle) return { skipped: true };
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { skipped: true };

    // École de l'utilisateur.
    const { data: membership } = await supabase
      .from('school_users').select('school_id').eq('user_id', user.id).limit(1).maybeSingle();
    const schoolId = membership?.school_id;
    if (!schoolId) return { skipped: true };

    // Clé publique du serveur LAN de cette école (publiée par publish-server-key).
    const { data: keyRow } = await supabase
      .from('school_credential_keys').select('public_key').eq('school_id', schoolId).maybeSingle();
    if (!keyRow?.public_key) return { skipped: true }; // pas de serveur LAN → rien à faire

    const key = await crypto.subtle.importKey(
      'spki', pemToDer(keyRow.public_key),
      { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt']);
    const ct = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, key, new TextEncoder().encode(plaintext));

    await supabase.from('credential_outbox').insert({
      school_id: schoolId, cloud_user_id: user.id, email: user.email, ciphertext: abToB64(ct),
    });
    return { ok: true };
  } catch (e) {
    console.warn('[credential-mirror] non propagé:', e?.message || e);
    return { ok: false };
  }
}
