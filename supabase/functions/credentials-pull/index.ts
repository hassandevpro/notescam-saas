// supabase/functions/credentials-pull/index.ts
// Sens Cloud → Local du pont d'identifiants, côté LECTURE.
//
// `credential_outbox` n'est PAS lisible par les clients (RLS : INSERT seulement).
// Le serveur LAN, qui ne détient aucun secret privilégié, tire ses credentials
// par ici : authentification par le JETON SCELLÉ de l'école (même motif que
// publish-server-key / sync-pull), et la requête ne renvoie QUE les lignes de
// l'école liée à ce jeton. Un serveur ne peut donc jamais voir — ni acquitter —
// les credentials d'une autre école, même en falsifiant sa requête.
//
// Le contenu reste CHIFFRÉ (RSA-OAEP pour la clé publique du serveur) : cette
// fonction transporte de l'opaque, elle ne déchiffre rien et ne journalise
// aucun ciphertext.
//
// Deux modes, un seul déploiement :
//   POST {}              → { rows: [...] }   lignes non appliquées (max 200)
//   POST { ack: [id...] } → { acked: n }     marque ces lignes appliquées
//
// Déploiement : supabase functions deploy credentials-pull
import { createClient } from 'jsr:@supabase/supabase-js@2';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const json = (s: number, b: unknown) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });
async function sha256(s: string) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method' });
  const token = (req.headers.get('authorization') || '').replace('Bearer ', '');
  if (!token) return json(400, { error: 'missing' });

  const { data: srv } = await admin.from('school_server_tokens')
    .select('school_id').eq('token_hash', await sha256(token)).is('revoked_at', null).maybeSingle();
  if (!srv) return json(401, { error: 'bad_token' });

  const body = await req.json().catch(() => ({}));
  const ack: unknown = body?.ack;

  // --- Acquittement : borné à l'école du jeton (le filtre school_id est la
  // garantie ; un id appartenant à une autre école est simplement ignoré). ---
  if (Array.isArray(ack)) {
    const ids = ack.filter((v) => typeof v === 'string').slice(0, 500);
    if (!ids.length) return json(200, { acked: 0 });
    const { data, error } = await admin.from('credential_outbox')
      .update({ applied_at: new Date().toISOString() })
      .in('id', ids).eq('school_id', srv.school_id).is('applied_at', null)
      .select('id');
    return error ? json(400, { error: error.message }) : json(200, { acked: data?.length ?? 0 });
  }

  // --- Tirage : uniquement les lignes en attente de CETTE école. ---
  const { data, error } = await admin.from('credential_outbox')
    .select('id, school_id, cloud_user_id, email, ciphertext, created_at')
    .eq('school_id', srv.school_id).is('applied_at', null)
    .order('created_at', { ascending: true }).limit(200);
  return error ? json(400, { error: error.message }) : json(200, { rows: data ?? [] });
});
