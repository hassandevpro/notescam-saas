// supabase/functions/provision-tenant/index.ts
// Provision du tenant lors de l'activation Cloud (scénario LOCAL FIRST).
//
// Crée/retrouve l'école (id PRÉSERVÉ → aucun doublon), crée les comptes auth
// manquants pour le personnel, pose les memberships, émet un jeton serveur scellé.
// service_role vit UNIQUEMENT ici. Authentifiée par le JWT de l'admin (issu de
// son inscription cloud). Idempotente → sûre en cas de reprise.
//
// Déploiement : supabase functions deploy provision-tenant
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

// Retrouve un compte auth par e-mail (sinon le crée, e-mail confirmé).
async function ensureAuthUser(email: string): Promise<string | null> {
  if (!email) return null;
  // listUsers est paginé ; pour une école, une page suffit largement.
  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const found = list?.users?.find((u) => (u.email || '').toLowerCase() === email.toLowerCase());
  if (found) return found.id;
  const { data, error } = await admin.auth.admin.createUser({
    email, email_confirm: true, password: crypto.randomUUID() + crypto.randomUUID(),
  });
  return error ? null : (data.user?.id ?? null);
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method' });

  const jwt = (req.headers.get('authorization') || '').replace('Bearer ', '');
  const { data: { user: caller } } = await admin.auth.getUser(jwt);
  if (!caller) return json(401, { error: 'auth' });

  const { school, admin_email, members } = await req.json().catch(() => ({}));
  if (!school?.id || !admin_email) return json(400, { error: 'missing' });

  // L'appelant doit être l'admin déclaré, et le tenant doit être NEUF ou déjà le
  // sien (anti-détournement d'un school_id existant appartenant à autrui).
  if ((caller.email || '').toLowerCase() !== String(admin_email).toLowerCase())
    return json(403, { error: 'caller_not_admin' });
  const { data: existing } = await admin.from('school_users').select('user_id').eq('school_id', school.id);
  if (existing?.length && !existing.some((m) => m.user_id === caller.id))
    return json(409, { error: 'school_already_owned' });

  // École (id préservé). On retire les clés nulles : une école locale ancienne
  // peut envoyer null sur des colonnes devenues NOT NULL DEFAULT côté cloud
  // (ex. ge_grade_max) ; un null explicite court-circuite le DEFAULT de Postgres.
  {
    const schoolRow = Object.fromEntries(
      Object.entries(school).filter(([, v]) => v !== null && v !== undefined),
    );
    const { error } = await admin.from('schools').upsert(schoolRow, { onConflict: 'id' });
    if (error) return json(400, { error: 'school: ' + error.message });
  }

  // Comptes + memberships.
  const map: Array<{ local_user_id: string; cloud_user_id: string }> = [];
  for (const m of members || []) {
    const isAdmin = (m.email || '').toLowerCase() === String(admin_email).toLowerCase();
    const cloudId = isAdmin ? caller.id : await ensureAuthUser(m.email);
    if (!cloudId) continue;
    map.push({ local_user_id: m.local_user_id, cloud_user_id: cloudId });
    await admin.from('school_users').upsert({
      id: m.membership_id, school_id: school.id, user_id: cloudId,
      role: m.role || (isAdmin ? 'admin' : 'teacher'), full_name: m.full_name ?? null,
      class_id: m.class_id ?? null, active: true,
    }, { onConflict: 'school_id,user_id' });
  }

  // Jeton serveur scellé (pont d'identifiants Local ↔ Cloud).
  const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
  await admin.from('school_server_tokens').upsert({
    school_id: school.id, token_hash: await sha256(token), created_at: new Date().toISOString(), revoked_at: null,
  });

  return json(200, { server_token: token, map });
});
