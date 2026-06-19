// supabase/functions/publish-server-key/index.ts
// Publie la clé publique RSA d'un serveur LAN dans school_credential_keys.
// L'app cloud l'utilise pour chiffrer les changements de mot de passe destinés à
// ce serveur (sens Cloud → Local). Authentifié par le JETON SCELLÉ de l'école.
//
// Déploiement : supabase functions deploy publish-server-key
import { createClient } from 'jsr:@supabase/supabase-js@2';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const json = (s: number, b: unknown) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });
async function sha256(s: string) { const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join(''); }

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method' });
  const token = (req.headers.get('authorization') || '').replace('Bearer ', '');
  const { public_key } = await req.json().catch(() => ({}));
  if (!token || !public_key) return json(400, { error: 'missing' });

  const { data: srv } = await admin.from('school_server_tokens')
    .select('school_id').eq('token_hash', await sha256(token)).is('revoked_at', null).maybeSingle();
  if (!srv) return json(401, { error: 'bad_token' });

  const { error } = await admin.from('school_credential_keys').upsert(
    { school_id: srv.school_id, public_key, updated_at: new Date().toISOString() },
    { onConflict: 'school_id' });
  return error ? json(400, { error: error.message }) : json(200, { ok: true });
});
