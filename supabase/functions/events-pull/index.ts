// supabase/functions/events-pull/index.ts
// H3-a — sert au serveur LAN les DOMAIN EVENTS du cloud modifiés depuis son curseur
// `seq` (bigserial monotone). Journal APPEND-ONLY : pas de LWW, pas de tombstones —
// un simple log shipping ordonné par seq, appliqué en idempotent côté LAN (ON CONFLICT
// id DO NOTHING). Authentifié par le JETON SCELLÉ de l'école ; service_role confinée
// au cloud ; périmètre limité à l'école du jeton.
//
// Déploiement : supabase functions deploy events-pull
import { createClient } from 'jsr:@supabase/supabase-js@2';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const json = (s: number, b: unknown) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });
async function sha256(s: string) { const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join(''); }

const PAGE = 1000;

async function schoolOfToken(token: string): Promise<string | null> {
  if (!token) return null;
  const { data } = await admin.from('school_server_tokens')
    .select('school_id').eq('token_hash', await sha256(token)).is('revoked_at', null).maybeSingle();
  return data?.school_id ?? null;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method' });
  const token = (req.headers.get('authorization') || '').replace('Bearer ', '');
  const schoolId = await schoolOfToken(token);
  if (!schoolId) return json(401, { error: 'bad_token' });

  const { since } = await req.json().catch(() => ({}));
  // `since` = dernier seq appliqué localement (numérique). Ordre seq CROISSANT =
  // ordre causal d'une même source préservé.
  let q = admin.from('domain_events').select('*').eq('school_id', schoolId)
    .order('seq', { ascending: true }).limit(PAGE);
  if (since != null && since !== '') q = q.gt('seq', Number(since));
  const { data, error } = await q;
  if (error) return json(400, { error: error.message });

  const events = data || [];
  let cursor: number | null = since != null && since !== '' ? Number(since) : null;
  for (const e of events as Array<{ seq?: number }>) {
    if (e.seq != null && (cursor == null || e.seq > cursor)) cursor = e.seq;
  }
  return json(200, { events, cursor });
});
