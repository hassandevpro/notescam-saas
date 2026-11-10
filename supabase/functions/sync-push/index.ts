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
  // Liens familiaux (01/11/2026). Absents de toutes les listes jusqu'ici :
  // les freres et soeurs saisis a l'ecole ne remontaient jamais, sans un mot.
  // Leur id est DETERMINE par la cle naturelle (server/parentIds.js), sinon
  // UNIQUE(parent_user_id, student_id) ferait refuser le lot entier.
  'parent_student_links',
  'schools', 'school_units', 'school_users', 'academic_periods', 'classes', 'subjects',
  'students', 'teachers', 'staff', 'grades', 'student_fees', 'fee_payments',
  'budgets', 'budget_chapters', 'budget_expenses', 'budget_unlock_requests',
  'budget_reallocations', 'budget_revisions',
  'budget_periods', 'budget_line_periods', 'budget_line_sectors', 'budget_line_reallocations',
  'governance_roles', 'user_governance_roles', 'governance_role_history',
  'hr_contracts', 'hr_leaves', 'hr_evaluations', 'hr_attendance', 'hr_career_events',
  'hr_payroll_catalog', 'hr_payroll', 'hr_payroll_items',
  'signalements', 'signalement_comments', 'signalement_history',
  'notifications', 'notification_outbox',
  'assets', 'asset_breakdowns', 'asset_repairs', 'asset_expenses',
  'fee_catalog', 'student_fee_items',
  // Échéances des frais périodiques (cantine mensuelle, transport trimestriel)
  // et arrêtés de caisse. Déclarées synchronisables côté LAN depuis leur
  // création, mais absentes ici : elles ne quittaient jamais l'école.
  'fee_schedule_items', 'cash_sessions',
  // Journal de caisse (entrées, reports, retraits) : sans elle, une dotation
  // saisie en LAN serait écartée ici en silence et le Cloud afficherait les
  // sorties sans les entrées — donc un solde de caisse faux.
  'cash_movements',
  'attendance', 'student_absences', 'student_class_assignments',
  'late_arrivals', 'disciplinary_incidents', 'disciplinary_actions',
  'student_warnings', 'student_detentions', 'parent_meetings', 'exit_permissions',
  'school_messages', 'teacher_notifications', 'sequence_dates', 'timetable_slots',
  // Notes par compétence du primaire. Absentes jusqu'ici : jetées en silence par le `continue` de la
  // boucle ci-dessous. Voir pousserNotePrimaire et supabase_prim_notes_sync.sql.
  'prim_notes',
]);

async function schoolOfToken(token: string): Promise<string | null> {
  if (!token) return null;
  const { data } = await admin.from('school_server_tokens')
    .select('school_id').eq('token_hash', await sha256(token)).is('revoked_at', null).maybeSingle();
  return data?.school_id ?? null;
}
const belongs = (table: string, row: any, schoolId: string) =>
  table === 'schools' ? row.id === schoolId : row.school_id === schoolId;

// ── NOTES DU PRIMAIRE ──────────────────────────────────────────────────────────────
// Le Cloud et l'école n'ont pas tout à fait la même ligne : le Cloud exige `trimestre_id` et
// `date_saisie` (NOT NULL), que l'école ne porte pas (la UA suffit à dériver le trimestre).
// L'identité d'une note est (élève, compétence, critère, UA) et NON son id : une même note
// saisie des deux côtés a deux ids. On fusionne donc par cette clé naturelle, la version la
// plus récente l'emporte (LWW), et quand c'est l'école qui gagne, la ligne du Cloud ADOPTE
// l'id de l'école pour que les deux côtés la nomment pareil. Une compétence inconnue du
// Cloud est REFUSÉE avec un motif lisible (et non perdue en silence) : la ligne reste à
// l'école.
const competenceConnue = new Map<string, boolean>();
async function competenceExiste(id: string): Promise<boolean> {
  if (competenceConnue.has(id)) return competenceConnue.get(id)!;
  const { data } = await admin.from('prim_competences').select('id').eq('id', id).maybeSingle();
  const ok = !!data;
  competenceConnue.set(id, ok);
  return ok;
}
const UUID_RE = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;
// Renvoie 'ok', 'depasse' (le Cloud est plus récent : ce n'est pas un refus) ou un motif de refus.
async function pousserNotePrimaire(row: any, schoolId: string): Promise<string> {
  const ua = Number(row.ua);
  if (!Number.isInteger(ua) || ua < 1 || ua > 8) return 'ua_invalide';
  if (!(await competenceExiste(String(row.competence_id)))) return 'competence_absente_du_cloud';
  const rec: any = {
    ...row,
    ua,
    trimestre_id: ua <= 3 ? 't1' : ua <= 6 ? 't2' : 't3',
    date_saisie: row.date_saisie || row.updated_at || new Date().toISOString(),
    enseignant_id: row.enseignant_id && UUID_RE.test(String(row.enseignant_id)) ? row.enseignant_id : null,
    statut: row.statut === 'absent' ? 'absent' : null,
  };
  const { data: parCle } = await admin.from('prim_notes')
    .select('id, school_id, updated_at, version, device_id')
    .eq('eleve_id', rec.eleve_id).eq('competence_id', rec.competence_id)
    .eq('critere_id', rec.critere_id).eq('ua', ua).maybeSingle();
  if (parCle) {
    if ((parCle as any).school_id !== schoolId) return 'id_appartient_a_une_autre_ecole';
    if (!wins(rec, parCle)) return 'depasse';
    if ((parCle as any).id !== rec.id) {
      // Même note, deux ids : la ligne du Cloud prend l'id de l'école.
      const { error } = await admin.from('prim_notes').update(rec).eq('id', (parCle as any).id);
      return error ? error.message.slice(0, 200) : 'ok';
    }
  }
  const { data: parId } = await admin.from('prim_notes').select('school_id').eq('id', rec.id).maybeSingle();
  if (parId && (parId as any).school_id !== schoolId) return 'id_appartient_a_une_autre_ecole';
  const { error } = await admin.from('prim_notes').upsert(rec, { onConflict: 'id' });
  return error ? error.message.slice(0, 200) : 'ok';
}

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
  // CE QUE LE CLOUD A REFUSÉ, ET POURQUOI.
  //
  // Jusqu'ici cette fonction renvoyait 200 avec un simple compteur `skipped`. Le
  // serveur LAN le lisait comme un succès et PURGEAIT son outbox : une ligne
  // refusée — FK vers une classe absente, CHECK, périmètre — disparaissait de la
  // file pour toujours, sans trace nulle part. C'est le mécanisme par lequel des
  // centaines d'élèves saisis à l'école ne sont jamais arrivés ici.
  //
  // On nomme désormais chaque refus. Le LAN garde ces entrées au lieu de les
  // purger (cf. cloudSync.push) et finit par les mettre en quarantaine AVEC leur
  // motif, au lieu de les perdre en silence.
  const rejected: { table: string; id: string; reason: string }[] = [];
  const MAX_REJECTED = 200;                       // borne la taille de la réponse
  const refuse = (table: string, id: string, reason: string) => {
    skipped++;
    if (rejected.length < MAX_REJECTED) rejected.push({ table, id: String(id), reason });
  };

  for (const ch of changes || []) {
    if (!ALLOWED.has(ch.table)) continue;
    const scopeCol = ch.table === 'schools' ? 'id' : 'school_id';
    const id = ch.row?.id;
    if (!id) continue;

    if (ch.op === 'delete') {
      // On ne supprime que dans le périmètre de l'école, et on trace un tombstone.
      const { data: ex } = await admin.from(ch.table).select(scopeCol).eq('id', id).maybeSingle();
      if (!ex || (ex as any)[scopeCol] !== schoolId) {
        // Déjà absente au Cloud = suppression sans objet : ce n'est pas un refus.
        if (!ex) { skipped++; continue; }
        refuse(ch.table, id, 'hors_perimetre_ecole');
        continue;
      }
      await admin.from(ch.table).delete().eq('id', id);
      await admin.from('sync_tombstones').upsert(
        { school_id: schoolId, tablename: ch.table, row_id: id, deleted_at: new Date().toISOString() },
        { onConflict: 'school_id,tablename,row_id' });
      applied++;
      continue;
    }

    // upsert : périmètre + LWW déterministe (le cloud ne cède que si le
    // changement local gagne selon (updated_at, version, device_id)).
    if (!belongs(ch.table, ch.row, schoolId)) { refuse(ch.table, id, 'hors_perimetre_ecole'); continue; }
    if (ch.table === 'prim_notes') {
      const r = await pousserNotePrimaire(ch.row, schoolId);
      if (r === 'ok') applied++; else if (r === 'depasse') skipped++; else refuse(ch.table, id, r);
      continue;
    }
    const { data: existing } = await admin.from(ch.table)
      .select(`updated_at, version, device_id, ${scopeCol}`).eq('id', id).maybeSingle();
    // DÉFENSE EN PROFONDEUR (L1) : ne JAMAIS écraser une ligne qui appartient à une AUTRE
    // école (collision d'id inter-écoles). Le périmètre de la ligne existante doit être
    // celui du jeton, sinon on refuse (jamais de fuite/écrasement inter-tenant).
    if (existing && (existing as any)[scopeCol] !== schoolId) { refuse(ch.table, id, 'id_appartient_a_une_autre_ecole'); continue; }
    // LWW : le Cloud est plus récent. Ce n'est PAS un refus — la ligne locale est
    // légitimement dépassée, et la purger de la file est le bon comportement.
    if (existing && !wins(ch.row, existing)) { skipped++; continue; }
    const { error } = await admin.from(ch.table).upsert(ch.row, { onConflict: 'id' });
    // On LOGUE l'erreur (au lieu de l'avaler en silence) : une écriture cloud
    // rejetée n'était pas diagnosticable auparavant. La ligne est tout de même
    // ignorée (ne bloque pas le lot), mais l'erreur est désormais visible —
    // et renvoyée au LAN, qui ne la purgera plus de son outbox.
    if (error) { console.log('[sync-push] upsert error', ch.table, id, error.message); refuse(ch.table, id, error.message.slice(0, 200)); continue; }
    applied++;
  }

  return json(200, { applied, skipped, rejected });
});
