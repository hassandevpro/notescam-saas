// supabase/functions/sync-push/index.ts
// Applique dans le cloud les changements locaux du serveur LAN, avec résolution
// LWW côté serveur (un changement local n'écrase le cloud que s'il est au moins
// aussi récent). Authentifié par le JETON SCELLÉ ; périmètre = école du jeton.
//
// Déploiement : supabase functions deploy sync-push
import { createClient } from 'jsr:@supabase/supabase-js@2';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const json = (s: number, b: unknown) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });
async function sha256(s: string) { const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join(''); }

const ALLOWED = new Set([
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
]);

async function schoolOfToken(token: string): Promise<string | null> {
  if (!token) return null;
  const { data } = await admin.from('school_server_tokens')
    .select('school_id').eq('token_hash', await sha256(token)).is('revoked_at', null).maybeSingle();
  return data?.school_id ?? null;
}
const belongs = (table: string, row: any, schoolId: string) =>
  table === 'schools' ? row.id === schoolId : row.school_id === schoolId;

// Comparateur LWW DÉTERMINISTE, identique au serveur LAN (server/cloudSync.js
// remoteWins) : updated_at, puis version, puis device_id. Corrige la divergence
// de la revue P0 #4 (le Cloud ne comparait que updated_at → ties non déterministes
// et résolution incohérente entre les deux côtés). `wins(a,b)` = a doit écraser b.
function wins(a: any, b: any): boolean {
  if (!b) return true;
  if (!a) return false;
  const at = Date.parse(a.updated_at || 0) || 0;
  const bt = Date.parse(b.updated_at || 0) || 0;
  if (at !== bt) return at > bt;
  const av = a.version || 0, bv = b.version || 0;
  if (av !== bv) return av > bv;
  return String(a.device_id || '') > String(b.device_id || '');
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method' });
  const token = (req.headers.get('authorization') || '').replace('Bearer ', '');
  const schoolId = await schoolOfToken(token);
  if (!schoolId) return json(401, { error: 'bad_token' });

  const { changes } = await req.json().catch(() => ({ changes: [] }));
  let applied = 0, skipped = 0;

  for (const ch of changes || []) {
    if (!ALLOWED.has(ch.table)) continue;
    const scopeCol = ch.table === 'schools' ? 'id' : 'school_id';
    const id = ch.row?.id;
    if (!id) continue;

    if (ch.op === 'delete') {
      // On ne supprime que dans le périmètre de l'école, et on trace un tombstone.
      const { data: ex } = await admin.from(ch.table).select(scopeCol).eq('id', id).maybeSingle();
      if (!ex || (ex as any)[scopeCol] !== schoolId) { skipped++; continue; }
      await admin.from(ch.table).delete().eq('id', id);
      await admin.from('sync_tombstones').upsert(
        { school_id: schoolId, tablename: ch.table, row_id: id, deleted_at: new Date().toISOString() },
        { onConflict: 'school_id,tablename,row_id' });
      applied++;
      continue;
    }

    // upsert : périmètre + LWW déterministe (le cloud ne cède que si le
    // changement local gagne selon (updated_at, version, device_id)).
    if (!belongs(ch.table, ch.row, schoolId)) { skipped++; continue; }
    const { data: existing } = await admin.from(ch.table)
      .select('updated_at, version, device_id').eq('id', id).maybeSingle();
    if (existing && !wins(ch.row, existing)) { skipped++; continue; }
    const { error } = await admin.from(ch.table).upsert(ch.row, { onConflict: 'id' });
    // On LOGUE l'erreur (au lieu de l'avaler en silence) : une écriture cloud
    // rejetée n'était pas diagnosticable auparavant. La ligne est tout de même
    // ignorée (ne bloque pas le lot), mais l'erreur est désormais visible.
    if (error) { console.log('[sync-push] upsert error', ch.table, id, error.message); skipped++; continue; }
    applied++;
  }

  return json(200, { applied, skipped });
});
