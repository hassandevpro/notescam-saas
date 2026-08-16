// supabase/functions/sms-settings/index.ts
// Proxy Cloud pour school_sms_settings, à l'usage du SERVEUR LAN uniquement.
//
// POURQUOI : school_sms_settings contient des identifiants (clé API du
// fournisseur SMS) et est délibérément absente de la synchro LAN (cf.
// supabase_sms_config.sql — la clé ne doit jamais toucher un disque d'école).
// Mais une école en édition LAN doit quand même pouvoir CONFIGURER son
// fournisseur SMS depuis son propre serveur local : ce dernier n'a pas de
// session Supabase (RLS) — seulement son JETON SCELLÉ (school_server_tokens),
// le même que sync-pull/sync-push. Cette fonction lit ce jeton, résout
// l'école, et lit/écrit la table EN SERVICE_ROLE, scopée à cette seule école —
// jamais la clé ne transite ni ne se pose sur le poste LAN au repos (le
// serveur LAN la relaie à la demande, ne la stocke jamais en SQLite).
//
// Auth : même jeton scellé que sync-pull (Authorization: Bearer <token>).
// Nécessite `[functions.sms-settings]\nverify_jwt = false` dans config.toml.
//
// Déploiement : supabase functions deploy sms-settings
import { createClient } from 'jsr:@supabase/supabase-js@2';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const json = (s: number, b: unknown) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });
async function sha256(s: string) { const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join(''); }

async function schoolOfToken(token: string): Promise<string | null> {
  if (!token) return null;
  const { data } = await admin.from('school_server_tokens')
    .select('school_id').eq('token_hash', await sha256(token)).is('revoked_at', null).maybeSingle();
  return data?.school_id ?? null;
}

// Liste blanche stricte : jamais school_id (toujours dérivé du jeton), jamais
// de colonne inconnue acceptée telle quelle depuis le corps de la requête.
const WRITABLE_FIELDS = [
  'provider', 'sender_id', 'api_key', 'api_secret', 'enabled',
  'budget_fcfa', 'spent_fcfa', 'cost_per_sms_fcfa', 'soft_threshold_pct',
];

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method' });
  const token = (req.headers.get('authorization') || '').replace('Bearer ', '');
  const schoolId = await schoolOfToken(token);
  if (!schoolId) return json(401, { error: 'bad_token' });

  const body = await req.json().catch(() => ({}));
  const action = body?.action;

  if (action === 'get') {
    const { data, error } = await admin.from('school_sms_settings').select('*').eq('school_id', schoolId).maybeSingle();
    if (error) return json(400, { error: error.message });
    return json(200, { data });
  }

  if (action === 'set') {
    const updates: Record<string, unknown> = {};
    for (const k of WRITABLE_FIELDS) if (k in (body?.updates || {})) updates[k] = body.updates[k];
    const { data, error } = await admin.from('school_sms_settings')
      .upsert({ school_id: schoolId, ...updates, updated_at: new Date().toISOString() }, { onConflict: 'school_id' })
      .select().single();
    if (error) return json(400, { error: error.message });
    return json(200, { data });
  }

  return json(400, { error: 'unknown_action' });
});
