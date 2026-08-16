// Producteur de NOTIFICATIONS INTERNES à partir des faits finance (couche I/O).
//
// Rôle : fournir au mapper PUR (notificationRules.js) le contexte qu'il ne peut
// pas deviner — devise, barème de validation, mode de gouvernance, acteur — puis
// envoyer sur le canal interne. Aucune règle métier ici.
//
// ── VALABLE EN LAN, EN CLOUD ET EN HYBRIDE ───────────────────────────────────
// Un SEUL code sert les trois éditions, parce que les trois entrées nécessaires
// vivent dans `schools` des DEUX côtés :
//   • Cloud : colonnes natives ;
//   • LAN   : mêmes colonnes posées par ensureColumn (server/db.js:70 et :108) ;
//   • l'accès passe par `./supabase`, aliasé vers localClient en LAN (Vite).
// Donc `currency`, `validation_rules` et `deployment_policy` se lisent
// identiquement partout, et la notification écrite en LAN remonte au Cloud comme
// n'importe quel état (`notifications` ∈ SYNCED_TABLES + ALLOWED_TABLES).
//
// ── NON-DOUBLON EN HYBRIDE (le point subtil) ─────────────────────────────────
// En gouvernance financière distante, le serveur LAN notifie DÉJÀ les 3 moments
// (server/governanceApply.js : demande d'approbation aux décideurs distants,
// sort de la dépense au demandeur, verdict d'opération budgétaire au décideur).
// Si on notifiait aussi ici, la fondatrice recevrait deux fois la même chose.
// D'où `remoteGovernance` transmis au mapper, qui rend muette la règle
// « dépense soumise ». ATTENTION : on ne peut PAS réutiliser
// `budgetRemote.financeRemoteMode()` pour ça — elle court-circuite à `false` dès
// qu'on est en édition LAN (son rôle est de décider s'il faut ÉMETTRE UNE
// INTENTION, ce qui n'a de sens que côté Cloud). Ici la question est
// différente : « cette école est-elle gouvernée à distance ? », et la réponse
// doit être la MÊME sur les deux éditions. On relit donc la politique
// directement, comme le fait déjà le serveur (server/budgetGuard.js:33).
//
// GARANTIES (identiques à emitFinanceEvent, dont ce module est le prolongement) :
// fire-and-forget, ne lève jamais, n'ajoute aucune latence au chemin d'écriture.
import { supabase } from './supabase';
import { useAuthStore } from '../store/authStore';
import { governanceChannel } from './policyEngine';
import { financeNotification } from './notificationRules';
import { schoolNotification, SCHOOL_EVENT } from './notificationRulesSchool';
import { notify } from './notificationService';

// Contexte par école — stable sur une session, relu si l'école change.
const _ctxCache = new Map();
// Résolutions d'identité (classe→titulaire, agent→compte) — stables, mises en cache.
const _classCache = new Map();
const _staffCache = new Map();
const _deptCache = new Map();

export function clearNotificationCtxCache() {
  _ctxCache.clear(); _classCache.clear(); _staffCache.clear(); _deptCache.clear();
}

async function loadSchoolCtx(schoolId) {
  if (_ctxCache.has(schoolId)) return _ctxCache.get(schoolId);
  // Défauts sûrs : si la lecture échoue (offline, colonne pas encore migrée), le
  // mapper retombe sur le barème par défaut du moteur de validation et la devise
  // par défaut — on notifie quand même plutôt que de perdre l'information.
  let ctx = { currency: undefined, validationRules: null, remoteGovernance: false };
  try {
    const { data } = await supabase
      .from('schools').select('currency, validation_rules, deployment_policy')
      .eq('id', schoolId).maybeSingle();
    ctx = {
      currency: data?.currency || undefined,
      validationRules: data?.validation_rules ?? null,
      remoteGovernance: governanceChannel(data?.deployment_policy, 'finance') === 'cloud',
    };
  } catch { /* contexte par défaut */ }
  _ctxCache.set(schoolId, ctx);
  return ctx;
}

// Transforme un fait finance en notification interne. Ne jamais `await` :
// l'écriture métier a déjà réussi et été renvoyée à l'appelant.
export function notifyFromFinanceEvent(event) {
  try {
    const st = (typeof useAuthStore.getState === 'function' ? useAuthStore.getState() : null) || {};
    const schoolId = event?.schoolId || st.school?.id || null;
    if (!schoolId || !event?.eventType) return;
    const actorId = st.user?.id || null;

    loadSchoolCtx(schoolId)
      .then((base) => {
        const desc = financeNotification(event, { ...base, actorId });
        if (!desc) return null;                       // règle muette = choix, pas oubli
        return notify({ schoolId, ...desc });
      })
      .catch((e) => console.warn('[notify-finance] notification best-effort ignorée —', event?.eventType, e?.message));
  } catch (e) {
    console.warn('[notify-finance] notification ignorée —', e?.message);
  }
}

// ── Vie de l'établissement (périodes / RH / signalements / discipline) ───────
//
// Ces modules n'ont pas de bus d'événements : le branchement se fait à leur point
// d'écriture. La RÉSOLUTION d'identité vit ici (le mapper reste pur) et suit les
// chaînes réelles du schéma :
//   classe    → classes.teacher_id → teachers.auth_user_id
//   agent RH  → staff.auth_user_id
// Un maillon absent (classe sans titulaire, agent sans compte) ⇒ pas de
// destinataire ⇒ le mapper se tait. C'est voulu : mieux vaut ne rien envoyer que
// diffuser une information disciplinaire ou RH à tout l'établissement.

// classe → { classTeacherUserId, className }. Deux lectures, mises en cache.
async function resolveClass(classId) {
  if (!classId) return {};
  if (_classCache.has(classId)) return _classCache.get(classId);
  let out = {};
  try {
    const { data: cls } = await supabase
      .from('classes').select('name, teacher_id').eq('id', classId).maybeSingle();
    out.className = cls?.name || null;
    if (cls?.teacher_id) {
      const { data: th } = await supabase
        .from('teachers').select('auth_user_id').eq('id', cls.teacher_id).maybeSingle();
      out.classTeacherUserId = th?.auth_user_id || null;
    }
  } catch { /* hors ligne : pas de résolution, donc pas de notification */ }
  _classCache.set(classId, out);
  return out;
}

// département → comptes des agents qui y travaillent. Rendu possible par le fait
// que `signalements.assigned_department` et `staff.department` partagent le même
// vocabulaire (cf. reportEngine.DEFAULT_ASSIGNMENT ⊂ staffService.STAFF_DEPARTMENTS).
// Liste vide = personne du département n'a de compte → le mapper replie sur admin.
async function resolveDepartmentUsers(schoolId, department) {
  if (!schoolId || !department) return {};
  const key = `${schoolId}:${department}`;
  if (_deptCache.has(key)) return _deptCache.get(key);
  let out = { departmentUserIds: [] };
  try {
    const { data } = await supabase
      .from('staff').select('auth_user_id')
      // `active` est boolean au Cloud et INTEGER en LAN : on passe `true`, comme
      // partout ailleurs (cf. auth.js) — better-sqlite3 le lie à 1.
      .eq('school_id', schoolId).eq('department', department).eq('active', true);
    out = { departmentUserIds: (data || []).map((r) => r.auth_user_id).filter(Boolean) };
  } catch { /* hors ligne : repli admin via le mapper */ }
  _deptCache.set(key, out);
  return out;
}

// agent RH → compte utilisateur (null si l'agent n'a pas d'accès à l'app).
async function resolveStaffUser(staffId) {
  if (!staffId) return {};
  if (_staffCache.has(staffId)) return _staffCache.get(staffId);
  let out = {};
  try {
    const { data } = await supabase
      .from('staff').select('auth_user_id, name').eq('id', staffId).maybeSingle();
    out = { staffUserId: data?.auth_user_id || null, staffName: data?.name || null };
  } catch { /* idem */ }
  _staffCache.set(staffId, out);
  return out;
}

// Émet une notification de vie scolaire. Fire-and-forget, ne lève jamais.
// `payload.classId` / `payload.staffId` déclenchent la résolution correspondante.
export function notifySchoolEvent({ kind, schoolId = null, payload = {} } = {}) {
  try {
    const st = (typeof useAuthStore.getState === 'function' ? useAuthStore.getState() : null) || {};
    const sid = schoolId || st.school?.id || null;
    if (!sid || !kind) return;
    const actorId = st.user?.id || null;

    Promise.all([
      resolveClass(payload.classId),
      resolveStaffUser(payload.staffId),
      resolveDepartmentUsers(sid, payload.department),
    ])
      .then(([cls, stf, dept]) => {
        const resolved = { ...cls, ...stf, ...dept };
        const full = { kind, payload: { ...payload, className: payload.className || cls.className, staffName: payload.staffName || stf.staffName } };
        const desc = schoolNotification(full, { resolved, actorId });
        if (!desc) return null;
        return notify({ schoolId: sid, ...desc });
      })
      .catch((e) => console.warn('[notify-school] notification best-effort ignorée —', kind, e?.message));
  } catch (e) {
    console.warn('[notify-school] notification ignorée —', e?.message);
  }
}

// Un même motif (même titre — « Absence signalée », « Incident disciplinaire
// grave »…) a-t-il déjà été mis en file/envoyé au MÊME numéro AUJOURD'HUI ?
// Cas concret : un élève absent sur plusieurs séances/matières le même jour
// déclenche un `notifyParent` par séance (cf. Absences.jsx) — sans ce garde-fou,
// ce serait un SMS par séance au lieu d'un seul « votre enfant a été marqué
// absent aujourd'hui ». Basé sur le TITRE (stable par type d'événement) et non
// le corps exact, contrairement au dédoublonnage 24h de l'edge notify-dispatch
// qui, lui, ne bloque qu'un contenu strictement identique.
async function alreadyNotifiedToday(schoolId, phone, title) {
  const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
  const { data } = await supabase.from('notification_outbox')
    .select('payload').eq('school_id', schoolId).eq('channel', 'sms').eq('address', phone)
    .in('status', ['pending', 'sent']).gte('created_at', startOfDay.toISOString()).limit(20);
  return (data || []).some((r) => {
    try { return JSON.parse(r.payload || '{}').title === title; } catch { return false; }
  });
}

// ── Notifications PARENT (SMS uniquement) ───────────────────────────────────
// Les parents n'ont pas de compte applicatif (ParentPortal = lien à jeton, pas
// de session) : un envoi 'internal' sans recipient_id/role connu diffuserait
// par erreur à TOUTE l'école (cf. isNotificationForMe — id ET role nuls =
// diffusion). On cible donc UNIQUEMENT le canal SMS, jamais l'interne, ici.
// `priority` doit être 'important' ou 'urgent' (cf. maîtrise des coûts,
// supabase_sms_budget.sql) — 'normal' n'atteindrait de toute façon jamais le
// SMS (filtré par externalHandler avant même la mise en file).
// Fire-and-forget, ne lève jamais.
export function notifyParent({ schoolId, studentId, priority = 'important', type = 'info', title, body = '', link = null }) {
  if (!schoolId || !studentId || !title) return;
  supabase.from('students').select('parent_phone').eq('id', studentId).maybeSingle()
    .then(async ({ data }) => {
      const phone = data?.parent_phone;
      if (!phone) return null;
      // 'urgent' n'est JAMAIS supprimé par ce garde-fou : un second incident
      // grave le même jour doit quand même alerter le parent.
      if (priority !== 'urgent' && await alreadyNotifiedToday(schoolId, phone, title)) return null;
      return notify({ schoolId, recipients: [{ phone }], channels: ['sms'], priority, type, title, body, link });
    })
    .catch((e) => console.warn('[notify-parent] notification best-effort ignorée —', type, e?.message));
}

export { SCHOOL_EVENT };
