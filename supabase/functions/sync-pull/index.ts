// supabase/functions/sync-pull/index.ts
// Renvoie au serveur LAN les lignes cloud modifiées depuis son curseur + les
// tombstones (suppressions). Authentifié par le JETON SCELLÉ de l'école ;
// service_role confinée au cloud, périmètre limité à l'école du jeton.
//
// PAGINATION KEYSET BORNÉE (fix drain d'appairage) :
//   L'ancienne version drainait TOUTE l'école dans UNE seule réponse. Sur un gros
//   établissement (~25 000 lignes) la réponse dépassait les limites → tronquée →
//   `cursor` absent côté client → curseur figé → la boucle de drain de l'appairage
//   (defaultInitialSync) ne convergeait jamais → bascule hybride jamais atteinte.
//   Désormais : au plus MAX_ROWS lignes par appel, avec un curseur KEYSET
//   `(updated_at, id)` PAR TABLE (watermark). Le client rappelle jusqu'à réponse
//   vide. Convergent quel que soit le volume, et correct pour l'incrémental continu.
//
//   Curseur = JSON OPAQUE `{v:2, pos:{table:{u,id}}}` (le client le stocke et le
//   renvoie tel quel — il ne l'interprète pas). Rétro-compatible : un ancien curseur
//   ISO (string) ou null est accepté et migré vers v2 dès la 1re réponse.
//
// Déploiement : supabase functions deploy sync-pull
import { createClient } from 'jsr:@supabase/supabase-js@2';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const json = (s: number, b: unknown) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });
async function sha256(s: string) { const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join(''); }

const TABLES = [
  'schools', 'school_units', 'school_users', 'academic_periods', 'classes', 'subjects',
  'students', 'teachers', 'staff', 'grades', 'student_fees', 'fee_payments',
  'budgets', 'budget_chapters', 'budget_expenses', 'budget_unlock_requests',
  'budget_reallocations', 'budget_revisions',
  'budget_periods', 'budget_line_periods', 'budget_line_sectors', 'budget_line_reallocations',
  'governance_roles', 'user_governance_roles', 'governance_role_history',
  'hr_contracts', 'hr_leaves', 'hr_evaluations', 'hr_attendance', 'hr_career_events',
  'signalement_comments', 'signalement_history',
  'notifications', 'notification_outbox',
  'assets', 'asset_breakdowns', 'asset_repairs', 'asset_expenses',
  'fee_catalog', 'student_fee_items',
  'attendance', 'student_absences', 'student_class_assignments',
  'late_arrivals', 'disciplinary_incidents', 'disciplinary_actions',
  'student_warnings', 'student_detentions', 'parent_meetings', 'exit_permissions',
  'school_messages', 'teacher_notifications', 'sequence_dates', 'timetable_slots',
];
// Toutes ces tables possèdent `id` (uuid) ET `updated_at` → keyset (updated_at, id) uniforme.
const MAX_ROWS = 2000;   // borne dure de la réponse (payload maîtrisé)
const PAGE = 1000;       // pagination des tombstones

type Pos = { u: string | null; id: string | null };

async function schoolOfToken(token: string): Promise<string | null> {
  if (!token) return null;
  const { data } = await admin.from('school_server_tokens')
    .select('school_id').eq('token_hash', await sha256(token)).is('revoked_at', null).maybeSingle();
  return data?.school_id ?? null;
}

// Parse le curseur reçu. Accepte : null, un JSON v2 `{v:2,pos:{...}}`, ou un ancien
// curseur ISO (string) → migré en position legacy {u:iso, id:null} pour toutes les tables.
function parsePos(since: unknown): Record<string, Pos> {
  if (!since) return {};
  if (typeof since === 'object') {
    const o = since as { pos?: Record<string, Pos> };
    return o.pos || {};
  }
  if (typeof since === 'string') {
    const s = since.trim();
    if (s.startsWith('{')) { try { return (JSON.parse(s).pos) || {}; } catch { /* ignore */ } }
    // Legacy : ISO string → borne updated_at pour toutes les tables (id inconnu).
    if (s) { const legacy: Record<string, Pos> = {}; for (const t of TABLES) legacy[t] = { u: s, id: null }; return legacy; }
  }
  return {};
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method' });
  const token = (req.headers.get('authorization') || '').replace('Bearer ', '');
  const schoolId = await schoolOfToken(token);
  if (!schoolId) return json(401, { error: 'bad_token' });

  const body = await req.json().catch(() => ({}));
  const pos = parsePos(body?.since);

  const rows: Record<string, unknown[]> = {};
  let remaining = MAX_ROWS;
  let anyReturned = false;

  try {
    for (const t of TABLES) {
      rows[t] = [];
      if (remaining <= 0) continue;                 // budget épuisé : cette table sera reprise au prochain appel
      const scopeCol = t === 'schools' ? 'id' : 'school_id';
      const p: Pos = pos[t] || { u: null, id: null };

      let q = admin.from(t).select('*').eq(scopeCol, schoolId)
        .not('updated_at', 'is', null)              // le keyset exige updated_at non NULL
        .order('updated_at', { ascending: true }).order('id', { ascending: true })
        .limit(remaining);
      if (p.u != null) {
        // Keyset : (updated_at, id) STRICTEMENT > (p.u, p.id).
        if (p.id != null) q = q.or(`updated_at.gt.${p.u},and(updated_at.eq.${p.u},id.gt.${p.id})`);
        else q = q.gt('updated_at', p.u);           // legacy (id inconnu) : borne updated_at seule
      }
      const { data, error } = await q;
      if (error) throw new Error(`${t}: ${error.message}`);

      const batch = data || [];
      rows[t] = batch;
      if (batch.length) {
        anyReturned = true;
        const last = batch[batch.length - 1] as { updated_at: string; id: string };
        pos[t] = { u: last.updated_at, id: last.id };
        remaining -= batch.length;
      }
    }
  } catch (e) {
    return json(400, { error: (e as Error).message });
  }

  // Tombstones : drain complet par (deleted_at) — lignes minuscules, volume faible.
  const { tomb_since } = body || {};
  const tombstones: unknown[] = [];
  let tombCursor = tomb_since || '';
  for (let from = 0; ; from += PAGE) {
    let tq = admin.from('sync_tombstones').select('*').eq('school_id', schoolId)
      .order('deleted_at', { ascending: true })
      .range(from, from + PAGE - 1);
    if (tomb_since) tq = tq.gt('deleted_at', tomb_since);
    const { data, error } = await tq;
    if (error) return json(400, { error: `sync_tombstones: ${error.message}` });
    tombstones.push(...(data || []));
    for (const t of (data || []) as Array<{ deleted_at?: string }>) {
      if (t.deleted_at && t.deleted_at > tombCursor) tombCursor = t.deleted_at;
    }
    if (!data || data.length < PAGE) break;
  }

  // Curseur v2 OPAQUE. `done` = plus aucune ligne (le client peut aussi s'arrêter sur
  // rows vides). On renvoie TOUJOURS un curseur exploitable (jamais null si progrès).
  return json(200, {
    rows,
    tombstones,
    cursor: JSON.stringify({ v: 2, pos }),
    tomb_cursor: tombCursor || null,
    done: !anyReturned,
  });
});
