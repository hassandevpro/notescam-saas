// supabase/functions/events-push/index.ts
// H3-a — applique dans le cloud les DOMAIN EVENTS émis localement par le serveur LAN.
// Journal APPEND-ONLY : insertion IDEMPOTENTE par `id` (ON CONFLICT DO NOTHING). On NE
// passe PAS par kernel_emit (qui exige auth.uid()) : le service_role insère directement
// en CONSERVANT l'actor_id estampillé à l'origine par le LAN. Confiance = serveur LAN
// de l'école (jeton scellé). Périmètre limité à l'école du jeton.
//
// `seq` n'est JAMAIS envoyé : le cloud l'attribue (bigserial) → son propre ordre.
// `replicated_from` est une colonne LOCALE au LAN (anti-écho) → jamais transmise.
//
// Déploiement : supabase functions deploy events-push
import { createClient } from 'jsr:@supabase/supabase-js@2';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const json = (s: number, b: unknown) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });
async function sha256(s: string) { const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join(''); }

// Colonnes AUTORISÉES à l'insertion cloud (liste blanche → pas d'injection de colonne).
const COLS = new Set([
  'id', 'school_id', 'aggregate_type', 'aggregate_id', 'event_type', 'payload',
  'actor_id', 'actor_name', 'correlation_id', 'occurred_at', 'device_id',
]);

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

  const { events } = await req.json().catch(() => ({ events: [] }));
  let applied = 0, skipped = 0;
  const rows: Record<string, unknown>[] = [];

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  for (const ev of events || []) {
    if (!ev?.id || ev.school_id !== schoolId) { skipped++; continue; } // isolation école
    const row: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(ev)) if (COLS.has(k)) row[k] = v;
    // Robustesse : le LAN estampille parfois un NOM (via expense.created_by) dans un
    // champ uuid → un seul event pourri faisait échouer TOUT le lot (400) et bloquait
    // la réplication du journal. On tolère : un uuid invalide est basculé en texte
    // (actor_name) ou mis à NULL, jamais rejeté.
    if (row.actor_id != null && !(typeof row.actor_id === 'string' && UUID_RE.test(row.actor_id))) {
      if (row.actor_name == null) row.actor_name = String(row.actor_id);
      row.actor_id = null;
    }
    if (row.correlation_id != null && !(typeof row.correlation_id === 'string' && UUID_RE.test(row.correlation_id))) {
      row.correlation_id = null;
    }
    rows.push(row);
  }

  if (rows.length) {
    // Idempotence : ON CONFLICT (id) DO NOTHING (append-only, jamais d'écrasement).
    const { error, count } = await admin.from('domain_events')
      .upsert(rows, { onConflict: 'id', ignoreDuplicates: true, count: 'exact' });
    if (error) {
      // Repli LIGNE-PAR-LIGNE : une ligne défectueuse ne doit pas bloquer les autres
      // (sinon le curseur de push LAN reste coincé et le journal ne remonte jamais).
      for (const r of rows) {
        const { error: e1 } = await admin.from('domain_events')
          .upsert([r], { onConflict: 'id', ignoreDuplicates: true });
        if (e1) skipped++; else applied++;
      }
      return json(200, { applied, skipped, degraded: true });
    }
    applied = count ?? rows.length;
  }
  return json(200, { applied, skipped });
});
