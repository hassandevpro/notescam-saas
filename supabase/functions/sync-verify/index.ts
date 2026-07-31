// supabase/functions/sync-verify/index.ts
// Sert l'audit d'intégrité HIÉRARCHIQUE (arbre de Merkle) au serveur LAN.
//
// Authentifié par le JETON SCELLÉ de l'école (comme sync-pull/push) ; school_id résolu
// depuis le jeton. Deux opérations :
//   • { op: 'tablelevel', tables[] } → checksums NIVEAU TABLE :
//       - `merkle` : tables suivies (lecture O(1) de sync_merkle) — RPC sync_merkle_tablelevel.
//       - `plain`  : petites tables → md5 « id:version » à la demande — RPC sync_integrity.
//   • { op: 'scope', table, scope, keys? } → partitions d'un scope (descente ciblée)
//       — RPC sync_merkle_scope.
// Le calcul lourd (agrégats) est fait EN BASE ; l'edge ne fait qu'orchestrer + normaliser.
//
// Déploiement : supabase functions deploy sync-verify
// Prérequis : supabase_sync_merkle.sql + supabase_sync_integrity.sql appliqués.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const json = (s: number, b: unknown) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });
async function sha256(s: string) { const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join(''); }

// Périmètre par défaut (54 tables répliquées) si le client ne précise pas `tables`.
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

  const body = await req.json().catch(() => ({}));
  const op = body?.op || 'tablelevel';

  try {
    if (op === 'tablelevel') {
      const requested: string[] = Array.isArray(body.tables) && body.tables.length ? body.tables : TABLES;
      // Tables suivies (Merkle) + leur checksum niveau table.
      const { data: mk, error: mkErr } = await admin.rpc('sync_merkle_tablelevel', { p_school: schoolId });
      if (mkErr) return json(400, { error: mkErr.message });
      const merkle: Record<string, { checksum: string; count: number }> = {};
      for (const r of (mk || []) as Array<{ tablename: string; checksum: string; row_count: number }>) {
        merkle[r.tablename] = { checksum: r.checksum, count: Number(r.row_count) };
      }
      // Petites tables (non suivies) → md5 « id:version » à la demande.
      const plainTables = requested.filter((t) => !(t in merkle));
      const plain: Record<string, { checksum: string | null; count: number | null }> = {};
      if (plainTables.length) {
        const { data: pl, error: plErr } = await admin.rpc('sync_integrity', { p_school: schoolId, p_tables: plainTables });
        if (plErr) return json(400, { error: plErr.message });
        for (const r of (pl || []) as Array<{ tablename: string; row_count: number | null; checksum: string | null }>) {
          plain[r.tablename] = { checksum: r.checksum, count: r.row_count == null ? null : Number(r.row_count) };
        }
      }
      return json(200, { merkle, plain });
    }

    if (op === 'scope') {
      const table = String(body.table || '');
      const scope = String(body.scope || '');
      const keys = Array.isArray(body.keys) ? body.keys.map(String) : null;
      const { data, error } = await admin.rpc('sync_merkle_scope', { p_school: schoolId, p_table: table, p_scope: scope, p_keys: keys });
      if (error) return json(400, { error: error.message });
      const parts: Record<string, { checksum: string; count: number }> = {};
      const prefix = table + '|';
      for (const r of (data || []) as Array<{ part_key: string; checksum: string; row_count: number }>) {
        parts[r.part_key.startsWith(prefix) ? r.part_key.slice(prefix.length) : r.part_key] = { checksum: r.checksum, count: Number(r.row_count) };
      }
      return json(200, { parts });
    }

    return json(400, { error: 'unknown_op' });
  } catch (e) {
    return json(400, { error: (e as Error).message });
  }
});
