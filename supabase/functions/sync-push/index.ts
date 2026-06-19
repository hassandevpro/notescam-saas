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
  'schools', 'school_users', 'academic_periods', 'classes', 'subjects',
  'students', 'teachers', 'grades', 'student_fees', 'fee_payments',
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

    // upsert : périmètre + LWW (le cloud plus récent n'est pas écrasé).
    if (!belongs(ch.table, ch.row, schoolId)) { skipped++; continue; }
    const { data: existing } = await admin.from(ch.table).select('updated_at').eq('id', id).maybeSingle();
    if (existing && (existing as any).updated_at && ch.row.updated_at &&
        (existing as any).updated_at > ch.row.updated_at) { skipped++; continue; }
    const { error } = await admin.from(ch.table).upsert(ch.row, { onConflict: 'id' });
    if (error) { skipped++; continue; }
    applied++;
  }

  return json(200, { applied, skipped });
});
