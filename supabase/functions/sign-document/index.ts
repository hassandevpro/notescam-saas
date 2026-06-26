// supabase/functions/sign-document/index.ts
// Signature/vérification CRYPTOGRAPHIQUE des documents (relevés, diplômes).
//
// Remplace le checksum djb2 (non secret, donc forgeable) par un HMAC-SHA256
// avec un secret côté serveur. Sans le secret, impossible de produire une
// signature valide ⇒ un faux document ne peut pas passer pour « authentique ».
//
// Déploiement :
//   supabase secrets set DOC_SIGNING_SECRET="$(openssl rand -hex 32)"
//   supabase functions deploy sign-document
//
// API (POST JSON) :
//   { "action": "sign",   "core": {sid,n,m,c,y,a,r,d} }  → { sig }     (auth requise)
//   { "action": "verify", "core": {...}, "sig": "..." }  → { valid }   (public)
//
// Le QR encode l'URL /verify/<payload> ; <payload> = base64url({...core, sig}).
// La page /verify appelle action:"verify" → affichage « authentique » fiable.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const SECRET = Deno.env.get('DOC_SIGNING_SECRET') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*',
               'Access-Control-Allow-Headers': 'authorization, content-type' },
  });

// Chaîne canonique — DOIT correspondre à transcriptEngine.canonical (ordre figé).
function canonical(c: Record<string, unknown>) {
  return [c.sid, c.n, c.m, c.c, c.y, c.a, c.r, c.d].map((v) => v ?? '').join('|');
}

async function hmac(msg: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Comparaison à temps constant (anti timing-attack).
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return json(200, {});
  if (req.method !== 'POST') return json(405, { error: 'method' });
  if (!SECRET) return json(500, { error: 'server_misconfigured' });

  const { action, core, sig } = await req.json().catch(() => ({}));
  if (!core || typeof core !== 'object') return json(400, { error: 'missing_core' });

  const expected = await hmac(canonical(core));

  if (action === 'verify') {
    return json(200, { valid: typeof sig === 'string' && safeEqual(sig, expected) });
  }

  if (action === 'sign') {
    // Émission réservée aux utilisateurs authentifiés (membres d'une école).
    const token = (req.headers.get('authorization') || '').replace('Bearer ', '');
    if (!token) return json(401, { error: 'auth_required' });
    const { data: { user } } = await createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    }).auth.getUser();
    if (!user) return json(401, { error: 'invalid_token' });
    return json(200, { sig: expected });
  }

  return json(400, { error: 'bad_action' });
});
