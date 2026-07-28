// supabase/functions/redeem-pairing-code/index.ts
// Échange un CODE D'APPAIRAGE (usage unique, éphémère) contre un JETON SCELLÉ borné
// à l'école + le school_id. Seul point du système qui utilise service_role pour
// cela — CONFINÉ au Cloud. Le serveur LAN appelle cette Edge (anon) et ne reçoit
// JAMAIS de service_role ni de secret privilégié.
//
// Auth = le code lui-même (pas de JWT admin) : la validation + le marquage
// « usage unique » sont ATOMIQUES côté SQL (consume_pairing_code, service_role only).
//
// Déploiement : supabase functions deploy redeem-pairing-code
// Prérequis : supabase_lan_pairing.sql appliqué (fonction consume_pairing_code).
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

  const { code, device } = await req.json().catch(() => ({}));
  if (!code || typeof code !== 'string') return json(400, { error: 'code_required' });

  // (1) Consomme le code de façon ATOMIQUE (usage unique) → school_id. La RPC lève
  //     si invalide/expiré/déjà utilisé/révoqué → on renvoie une erreur générique.
  const { data: schoolId, error: cErr } = await admin.rpc('consume_pairing_code', {
    p_code: code.trim(),
    p_device: device ?? null,
  });
  if (cErr || !schoolId) return json(400, { error: cErr?.message || 'invalid_code' });

  // (2) Émet un jeton scellé pour CETTE école (même mécanisme que issue-server-token).
  const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
  const { error: tErr } = await admin.from('school_server_tokens').upsert({
    school_id: schoolId,
    token_hash: await sha256(token),
    created_at: new Date().toISOString(),
    revoked_at: null,
  });
  if (tErr) return json(500, { error: 'token_issue_failed' });

  // (3) Renvoie le jeton (une seule fois) + le school_id + l'URL cloud. Aucun secret
  //     privilégié : le LAN ne voit que ce jeton scellé, révocable côté cloud.
  return json(200, {
    token,
    school_id: schoolId,
    cloud_url: Deno.env.get('SUPABASE_URL') ?? null,
  });
});
