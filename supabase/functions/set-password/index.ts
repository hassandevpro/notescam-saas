// supabase/functions/set-password/index.ts
// Réécrit le mot de passe d'un compte de l'école appelante.
//
// La clé service_role vit UNIQUEMENT ici (env de la fonction). Les serveurs
// d'école appellent avec leur JETON propre (scopé à leur école, révocable) :
// un poste compromis ne peut toucher QUE les comptes de SON école.
//
// Déploiement :
//   supabase functions deploy set-password
//   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=...   (déjà dispo par défaut)
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

  const token = (req.headers.get('authorization') || '').replace('Bearer ', '');
  const { cloud_user_id, password } = await req.json().catch(() => ({}));
  if (!token || !cloud_user_id || !password) return json(400, { error: 'missing' });

  // 1) Jeton serveur → école (haché, révocable)
  const { data: srv } = await admin.from('school_server_tokens')
    .select('school_id').eq('token_hash', await sha256(token)).is('revoked_at', null).maybeSingle();
  if (!srv) return json(401, { error: 'bad_token' });

  // 2) La cible doit appartenir à CETTE école
  const { data: member } = await admin.from('school_users')
    .select('user_id').eq('school_id', srv.school_id).eq('user_id', cloud_user_id).maybeSingle();
  if (!member) return json(403, { error: 'not_in_school' });

  // 3) Mise à jour scopée
  const { error } = await admin.auth.admin.updateUserById(cloud_user_id, { password });
  return error ? json(400, { error: error.message }) : json(200, { ok: true });
});
