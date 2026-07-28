// supabase/functions/sync-pull/index.ts
// Renvoie au serveur LAN les lignes cloud modifiées depuis son curseur + les
// tombstones (suppressions). Authentifié par le JETON SCELLÉ de l'école ;
// service_role confinée au cloud, périmètre limité à l'école du jeton.
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
  'school_messages', 'teacher_notifications', 'sequence_dates', 'timetable_slots',
];
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

  const { since, tomb_since } = await req.json().catch(() => ({}));
  const rows: Record<string, unknown[]> = {};
  let maxCursor = since || '';

  // Drain COMPLET par table (pagination `range`, comme migrate.pullAll) : on ne
  // s'arrête plus à PAGE=1000. Un seul curseur `updated_at` global reste correct
  // car AUCUNE ligne n'est tronquée — les appels suivants (incrémental) ne
  // renvoient donc que les vraies nouveautés (> curseur), sans saut ni perte.
  async function drain(t: string, scopeCol: string): Promise<unknown[]> {
    const out: unknown[] = [];
    for (let from = 0; ; from += PAGE) {
      // Ordre par updated_at seul (certaines tables ont une clé composite, sans
      // colonne `id` → un .order('id') échouerait). `range` suffit à drainer la
      // totalité (comme migrate.pullAll) sur un jeu de données stable pendant le pull.
      let q = admin.from(t).select('*').eq(scopeCol, schoolId)
        .order('updated_at', { ascending: true })
        .range(from, from + PAGE - 1);
      if (since) q = q.gt('updated_at', since);
      const { data, error } = await q;
      if (error) throw new Error(`${t}: ${error.message}`);
      out.push(...(data || []));
      if (!data || data.length < PAGE) break;
    }
    return out;
  }

  try {
    for (const t of TABLES) {
      const scopeCol = t === 'schools' ? 'id' : 'school_id';
      rows[t] = await drain(t, scopeCol);
      for (const r of rows[t] as Array<{ updated_at?: string }>) {
        if (r.updated_at && r.updated_at > maxCursor) maxCursor = r.updated_at;
      }
    }
  } catch (e) {
    return json(400, { error: (e as Error).message });
  }

  // Tombstones : drain complet aussi (pagination par `deleted_at`).
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

  return json(200, { rows, tombstones, cursor: maxCursor || null, tomb_cursor: tombCursor || null });
});
