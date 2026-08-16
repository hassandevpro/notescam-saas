// supabase/functions/notify-dispatch/index.ts
// EXPÉDITEUR unique de notification_outbox (cf. supabase_notification_dispatch.sql).
// Réserve un lot via notification_outbox_claim() (atomique, anti-double-envoi),
// puis traite chaque ligne selon son canal. Aujourd'hui, seul le canal SMS a un
// chemin de traitement réel — email/whatsapp restent non implémentés
// (CHANNEL_IMPLEMENTED côté client) et sont marqués 'skipped' immédiatement
// plutôt que laissés bloqués en 'sending' jusqu'au recyclage anti-orphelin.
//
// ── MAÎTRISE DES COÛTS (cf. supabase_sms_budget.sql) ─────────────────────────
// Le SMS est rare et coûteux (référence : ~20 000 FCFA/an pour ~500 élèves).
// Cette fonction est la SEULE autorité qui connaît la dépense réelle ; elle
// applique donc TOUJOURS ces règles, quel que soit ce que le LAN/client a
// demandé au moment de la mise en file :
//   1. PRIORITÉ — 'normal' n'atteint jamais le SMS (in-app uniquement) ;
//      'important' est dégradé si le budget approche sa limite ; 'urgent'
//      passe tant qu'il reste du budget.
//   2. ANTI-DOUBLON — un message strictement identique (même destinataire,
//      même contenu) déjà ENVOYÉ dans les dernières 24h n'est pas renvoyé.
//   3. REGROUPEMENT — plusieurs messages éligibles pour le MÊME destinataire
//      dans le même lot sont fusionnés en un seul SMS (un seul coût). Le petit
//      délai posé à la mise en file (next_attempt_at ≈ +3 min, cf.
//      notificationService.js/notify.js) laisse une chance à des événements
//      proches dans le temps d'atterrir dans le même lot.
//   4. BUDGET — la dépense (FCFA) est incrémentée atomiquement après chaque
//      envoi réel, jamais estimée à l'avance.
//
// AUCUN FOURNISSEUR SMS N'EST ENCORE CHOISI : sendSms() ci-dessous est le SEUL
// point à modifier pour brancher un vrai fournisseur — tout le reste (claim,
// priorité, budget, anti-doublon, regroupement, statut, backoff) est déjà
// opérationnel et n'a pas besoin d'être retouché.
//
// Auth : secret partagé statique (PAS un JWT Supabase — cette fonction est
// appelée par un scheduler/curl, pas par un navigateur). Header attendu :
//   x-dispatch-secret: <DISPATCH_SECRET>
// Définir le secret : `supabase secrets set DISPATCH_SECRET=<valeur>`.
// Nécessite `[functions.notify-dispatch]\nverify_jwt = false` dans config.toml
// (sinon la passerelle rejette l'appel avant d'atteindre ce code).
//
// Déploiement : supabase functions deploy notify-dispatch
import { createClient } from 'jsr:@supabase/supabase-js@2';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const json = (s: number, b: unknown) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });

const IMPLEMENTED_CHANNELS = ['sms']; // miroir de CHANNEL_IMPLEMENTED (src/lib/notificationEngine.js)
const DEDUP_WINDOW_MS = 24 * 3600_000;

type OutboxRow = {
  id: string;
  school_id: string;
  channel: string;
  address: string | null;
  payload: string | null;
  attempts: number;
  priority: string;
};

type SmsSettings = {
  provider: string | null;
  sender_id: string | null;
  api_key: string | null;
  api_secret: string | null;
  enabled: boolean;
  budget_fcfa: number;
  spent_fcfa: number;
  cost_per_sms_fcfa: number;
  soft_threshold_pct: number;
};

// ── SEUL POINT À BRANCHER quand un fournisseur SMS est choisi ────────────────
// Doit renvoyer { ok:true, ref } en cas de succès, ou { ok:false, error } sinon.
// Ne doit jamais lever — les erreurs réseau/HTTP du fournisseur doivent être
// capturées ici et renvoyées comme { ok:false, error }.
async function sendSms(_args: { to: string; message: string; settings: SmsSettings }): Promise<{ ok: boolean; ref?: string; error?: string }> {
  return { ok: false, error: 'provider_not_wired' };
}

// Backoff simple borné : 2^tentatives minutes, plafonné à 60 min.
function nextAttemptDelayMinutes(attempts: number): number {
  return Math.min(60, Math.pow(2, Math.max(0, attempts - 1)));
}

// Nombre de « segments » SMS (facturation typique par tranche de 160 caractères).
function segments(body: string): number {
  return Math.max(1, Math.ceil((body || '').length / 160));
}

function messageBody(row: OutboxRow): string {
  try {
    const p = row.payload ? JSON.parse(row.payload) : {};
    return p.title ? `${p.title}: ${p.body || ''}`.trim() : (p.body || '');
  } catch { return ''; }
}

// Le SMS part-il compte tenu de la priorité et du budget déjà consommé ?
// 'normal' → jamais. 'important' → dégradé dès le seuil souple franchi.
// 'urgent' → part tant que le budget n'est pas totalement épuisé.
// Renvoie null (autorisé) ou la raison du refus, pour un suivi de statut lisible.
function smsBlockReason(priority: string, settings: SmsSettings): string | null {
  if (priority === 'normal') return 'low_priority';
  const budget = Number(settings.budget_fcfa) || 0;
  const spent = Number(settings.spent_fcfa) || 0;
  if (budget > 0 && spent >= budget) return 'budget_exhausted'; // plus rien ne part, même 'urgent'
  if (priority === 'urgent') return null;
  const softPct = Number(settings.soft_threshold_pct) || 85;
  if (budget > 0 && (spent / budget) * 100 >= softPct) return 'budget_low_priority_reduced';
  return null;
}

async function loadSettings(schoolId: string, cache: Map<string, SmsSettings | null>): Promise<SmsSettings | null> {
  if (cache.has(schoolId)) return cache.get(schoolId)!;
  const { data } = await admin.from('school_sms_settings')
    .select('provider, sender_id, api_key, api_secret, enabled, budget_fcfa, spent_fcfa, cost_per_sms_fcfa, soft_threshold_pct')
    .eq('school_id', schoolId).maybeSingle();
  cache.set(schoolId, data as SmsSettings | null);
  return data as SmsSettings | null;
}

// Un message IDENTIQUE (même destinataire, même contenu) déjà envoyé dans la
// fenêtre récente ne repart pas — évite les doublons entre deux passes de
// dispatch (les doublons DANS le même lot sont déjà fusionnés au regroupement).
async function isDuplicate(row: OutboxRow): Promise<boolean> {
  const since = new Date(Date.now() - DEDUP_WINDOW_MS).toISOString();
  const { data } = await admin.from('notification_outbox')
    .select('id').eq('school_id', row.school_id).eq('channel', 'sms')
    .eq('address', row.address).eq('payload', row.payload)
    .eq('status', 'sent').gt('created_at', since).limit(1);
  return !!(data && data.length);
}

type Outcome = 'sent' | 'skipped' | 'failed';

async function markSkipped(id: string, reason: string): Promise<Outcome> {
  await admin.from('notification_outbox').update({
    status: 'skipped', error: reason, updated_at: new Date().toISOString(),
  }).eq('id', id);
  return 'skipped';
}

async function markSent(id: string, ref: string | undefined): Promise<Outcome> {
  await admin.from('notification_outbox').update({
    status: 'sent', error: null, provider_ref: ref || null, updated_at: new Date().toISOString(),
  }).eq('id', id);
  return 'sent';
}

async function markFailed(id: string, error: string, attempts: number): Promise<Outcome> {
  const delay = nextAttemptDelayMinutes(attempts);
  await admin.from('notification_outbox').update({
    status: 'pending', error,
    next_attempt_at: new Date(Date.now() + delay * 60_000).toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', id);
  return 'failed';
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method' });

  const secret = req.headers.get('x-dispatch-secret') || '';
  const expected = Deno.env.get('DISPATCH_SECRET') || '';
  if (!expected || secret !== expected) return json(401, { error: 'bad_secret' });

  const { data: rows, error } = await admin.rpc('notification_outbox_claim', { p_limit: 50 });
  if (error) return json(400, { error: error.message });

  const claimed = (rows || []) as OutboxRow[];
  let sent = 0, skipped = 0, failed = 0;
  const settingsCache = new Map<string, SmsSettings | null>();

  // ── Passe 1 : classement individuel (canal, adresse, fournisseur, priorité/budget, doublon).
  const eligible: OutboxRow[] = [];
  for (const row of claimed) {
    if (!IMPLEMENTED_CHANNELS.includes(row.channel)) { await markSkipped(row.id, 'channel_not_implemented'); skipped++; continue; }
    if (!row.address) { await markSkipped(row.id, 'no_address'); skipped++; continue; }

    const settings = await loadSettings(row.school_id, settingsCache);
    if (!settings || !settings.enabled || !settings.provider) { await markSkipped(row.id, 'provider_not_configured'); skipped++; continue; }

    const blockReason = smsBlockReason(row.priority, settings);
    if (blockReason) { await markSkipped(row.id, blockReason); skipped++; continue; }
    if (await isDuplicate(row)) { await markSkipped(row.id, 'duplicate'); skipped++; continue; }

    eligible.push(row);
  }

  // ── Passe 2 : regroupement par destinataire — un seul SMS (un seul coût) pour
  // plusieurs informations éligibles au même numéro dans ce lot.
  const groups = new Map<string, OutboxRow[]>();
  for (const row of eligible) {
    const key = `${row.school_id}::${row.address}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }

  for (const group of groups.values()) {
    const settings = settingsCache.get(group[0].school_id)!;
    const bodies = [...new Set(group.map(messageBody).filter(Boolean))]; // dédoublonne le contenu au sein du groupe
    const combined = bodies.join(' | ');
    const cost = (Number(settings.cost_per_sms_fcfa) || 0) * segments(combined);

    const result = await sendSms({ to: group[0].address!, message: combined, settings });
    if (result.ok) {
      await admin.rpc('sms_record_spend', { p_school_id: group[0].school_id, p_amount: cost });
      for (const row of group) await markSent(row.id, result.ref);
      sent += group.length;
    } else {
      for (const row of group) await markFailed(row.id, result.error || 'send_failed', row.attempts);
      failed += group.length;
    }
  }

  return json(200, { claimed: claimed.length, sent, skipped, failed, grouped_sends: groups.size });
});
