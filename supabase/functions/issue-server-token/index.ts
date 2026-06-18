// supabase/functions/issue-server-token/index.ts
// Émet UNE fois un jeton serveur pour l'école de l'admin appelant.
// Authentifiée par le JWT de l'ADMIN (sa session cloud pendant la migration).
// N'expose jamais service_role ; ne renvoie le jeton qu'une seule fois.
//
// Déploiement : supabase functions deploy issue-server-token
import { createClient } from 'jsr:@supabase/supabase-js@2';

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

async function sha256(s: string) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method' });

  const jwt = (req.headers.get('authorization') || '').replace('Bearer ', '');
  const { data: { user } } = await admin.auth.getUser(jwt);
  if (!user) return json(401, { error: 'auth' });

  const { data: m } = await admin.from('school_users')
    .select('school_id').eq('user_id', user.id).eq('role', 'admin').maybeSingle();
  if (!m) return json(403, { error: 'not_admin' });

  const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
  await admin.from('school_server_tokens').upsert({
    school_id: m.school_id,
    token_hash: await sha256(token),
    created_at: new Date().toISOString(),
    revoked_at: null,
  });
  return json(200, { token }); // renvoyé une seule fois, stocké par le serveur école
});
