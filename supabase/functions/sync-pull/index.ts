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
  // Journal de caisse (entrées, reports, retraits). Porte `id` + `updated_at`,
  // donc le keyset (updated_at, id) s'applique sans traitement particulier.
  'cash_movements',
  'attendance', 'student_absences', 'student_class_assignments',
  'late_arrivals', 'disciplinary_incidents', 'disciplinary_actions',
  'student_warnings', 'student_detentions', 'parent_meetings', 'exit_permissions',
  'school_messages', 'teacher_notifications', 'sequence_dates', 'timetable_slots',
  // Notes par compétence du primaire (voir sync-push / pousserNotePrimaire).
  'prim_notes',
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

  // ── GARDE ANTI-RÉSURRECTION (cf. supabase_sync_tombstone_gc.sql) ────────────
  // Les tombstones purgés ne peuvent plus être servis. Si le curseur du LAN est
  // antérieur au filigrane de purge, il a définitivement manqué des suppressions :
  // ses lignes locales correspondantes RESSUSCITERAIENT au prochain push. On
  // refuse donc le pull incrémental et on exige une reconstruction complète.
  // (Un pull tronqué en silence est bien pire qu'une erreur explicite.)
  if (tomb_since) {
    const { data: gc } = await admin.from('sync_tombstone_gc')
      .select('purged_before').eq('school_id', schoolId).maybeSingle();
    if (gc?.purged_before && String(tomb_since) < String(gc.purged_before)) {
      return json(409, {
        error: 'rebuild_required',
        reason: 'tombstones_purged',
        tomb_since,
        purged_before: gc.purged_before,
        message: 'Curseur antérieur à la purge des tombstones : des suppressions '
               + 'ont été manquées. Reconstruire le LAN depuis le Cloud.',
      });
    }
  }

  // Position CONFIRMÉE du LAN = le curseur qu'il ENVOIE (preuve de ce qu'il a
  // déjà appliqué), jamais celui qu'on lui renvoie : s'il plante avant de le
  // persister, le Cloud le croirait plus avancé qu'il ne l'est → purge trop
  // agressive. C'est cette valeur qui borne sync_tombstones_gc().
  await admin.from('sync_client_state').upsert({
    school_id: schoolId,
    tomb_cursor: tomb_since || null,
    last_pull_at: new Date().toISOString(),
  }, { onConflict: 'school_id' });

  // ÉTAT DÉCLARÉ PAR LE LAN (file d'envoi, refus, désaccords, dernière erreur).
  // Sert au voyant de l'administrateur EN LIGNE, qui ne peut pas interroger un
  // serveur d'école. Écriture SÉPARÉE et à erreur ignorée, volontairement : tant
  // que supabase_sync_etat_lan.sql n'a pas tourné, ces colonnes n'existent pas, et
  // les mettre dans l'upsert ci-dessus ferait échouer tout tirage. Dans cet ordre-ci
  // (fonction avant migration, ou l'inverse) la synchro ne peut donc pas casser.
  const etat = (body as { etat?: Record<string, unknown> })?.etat;
  if (etat && typeof etat === 'object') {
    const entier = (v: unknown) => (Number.isFinite(Number(v)) ? Math.max(0, Math.trunc(Number(v))) : 0);
    const texte = (v: unknown, n: number) => (typeof v === 'string' && v ? v.slice(0, n) : null);
    const date = (v: unknown) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v : null);
    await admin.from('sync_client_state').update({
      lan_pending: entier(etat.pending),
      lan_quarantined: entier(etat.quarantined),
      lan_conflicts: entier(etat.conflicts),
      lan_last_error: texte(etat.lastError, 200),
      lan_last_error_kind: texte(etat.lastErrorKind, 20),
      lan_last_success_at: date(etat.lastSuccessAt),
      lan_version: texte(etat.version, 20),
    }).eq('school_id', schoolId);   // erreur volontairement ignorée (voir ci-dessus)
  }

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

  // Curseur v2 OPAQUE. On renvoie TOUJOURS un curseur exploitable (jamais null si progrès).
  //
  // `done` = « il ne reste rien à tirer ». Le client (server/cloudSync.js, pull())
  // rappelle tant que `done` est faux. Il valait avant `!anyReturned`, donc vrai
  // seulement sur une page VIDE : chaque changement coûtait un appel de plus, pour
  // apprendre qu'il n'y avait rien derrière. Or le budget MAX_ROWS est partagé entre
  // les tables, chacune interrogée avec `limit(remaining)` : s'il reste du budget
  // à la fin, AUCUNE table n'a été tronquée, donc tout est drainé. Seul un budget
  // épuisé (remaining === 0) laisse peut-être des lignes — et alors on rappelle.
  // Un client qui ne lit pas `done` (anciennes versions) n'est pas concerné.
  return json(200, {
    rows,
    tombstones,
    cursor: JSON.stringify({ v: 2, pos }),
    tomb_cursor: tombCursor || null,
    done: remaining > 0,
  });
});
