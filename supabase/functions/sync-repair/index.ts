// supabase/functions/sync-repair/index.ts
// AUTO-RÉPARATION ciblée : renvoie au serveur LAN les lignes CLOUD AUTORITAIRES d'une
// PARTITION précise (une classe, un élève, ou une liste d'ids) — jamais toute la table.
// Le LAN les réconcilie en LWW, re-hashe la partition, et recommence jusqu'à parité.
//
// Authentifié par le JETON SCELLÉ de l'école (même pattern que sync-verify/pull/push) ;
// service_role confiné au Cloud, périmètre limité à l'école du jeton. Volume borné :
// une classe/élève = quelques dizaines à centaines de lignes.
//
// Body : { table, by: 'student'|'class'|'ids', keys: string[] }
// Déploiement : supabase functions deploy sync-repair
import { createClient } from 'jsr:@supabase/supabase-js@2';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const json = (s: number, b: unknown) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });
async function sha256(s: string) { const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join(''); }

// Tables réparables = périmètre répliqué (sécurité : liste blanche).
const TABLES = new Set([
  'schools', 'school_units', 'school_users', 'academic_periods', 'classes', 'subjects',
  'students', 'teachers', 'staff', 'grades', 'student_fees', 'fee_payments',
  'budgets', 'budget_chapters', 'budget_expenses', 'budget_unlock_requests',
  'budget_reallocations', 'budget_revisions', 'budget_periods', 'budget_line_periods',
  'budget_line_sectors', 'budget_line_reallocations', 'governance_roles', 'user_governance_roles',
  'governance_role_history', 'hr_contracts', 'hr_leaves', 'hr_evaluations', 'hr_attendance',
  'hr_career_events', 'signalement_comments', 'signalement_history', 'notifications',
  'notification_outbox', 'assets', 'asset_breakdowns', 'asset_repairs', 'asset_expenses',
  'fee_catalog', 'student_fee_items', 'attendance', 'student_absences', 'student_class_assignments',
  'late_arrivals', 'disciplinary_incidents', 'disciplinary_actions', 'student_warnings',
  'student_detentions', 'parent_meetings', 'exit_permissions', 'school_messages',
  'teacher_notifications', 'sequence_dates', 'timetable_slots',
]);
const BY_COL: Record<string, string> = { student: 'student_id', class: 'class_id', ids: 'id' };
const MAX_KEYS = 5000; // borne dure (une partition reste petite)
const MAX_ALL = 20000; // borne dure de `by:'all'` (petite table de config / table sans dimension)

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

  const { table, by, keys } = await req.json().catch(() => ({}));
  if (!TABLES.has(table)) return json(400, { error: 'bad_table' });
  const scopeCol = table === 'schools' ? 'id' : 'school_id';

  // `by:'tombstones'` — suppressions Cloud pour des ids donnés (correctif M1 : le LAN
  // doit RESPECTER une suppression distante au lieu de ressusciter la ligne).
  if (by === 'tombstones') {
    const k0 = Array.isArray(keys) ? keys.slice(0, MAX_KEYS).map(String) : [];
    if (!k0.length) return json(200, { tombstones: [] });
    const { data, error } = await admin.from('sync_tombstones')
      .select('row_id, deleted_at').eq('school_id', schoolId).eq('tablename', table).in('row_id', k0);
    if (error) return json(400, { error: error.message });
    return json(200, { tombstones: data || [] });
  }

  // `by:'all'` — récupère TOUTE la table (bornée) : indispensable pour révéler les
  // lignes présentes au Cloud mais absentes en LAN sur une table SANS dimension de
  // partition (config, ou table suivie sans classe/élève).
  if (by === 'all') {
    const { data, error } = await admin.from(table).select('*').eq(scopeCol, schoolId).limit(MAX_ALL + 1);
    if (error) return json(400, { error: error.message });
    if ((data || []).length > MAX_ALL) return json(413, { error: 'too_many_rows' });
    return json(200, { rows: data || [] });
  }

  const col = BY_COL[by];
  if (!col) return json(400, { error: 'bad_by' });
  const k = Array.isArray(keys) ? keys.slice(0, MAX_KEYS).map(String) : [];
  if (!k.length) return json(200, { rows: [] });

  const { data, error } = await admin.from(table).select('*').eq(scopeCol, schoolId).in(col, k);
  if (error) return json(400, { error: error.message });
  return json(200, { rows: data || [] });
});
