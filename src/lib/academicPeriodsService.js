// Périodes académiques — couche données + actions (offline-first).
//
// `academic_periods` matérialise les séquences/trimestres avec un état :
//   * status (upcoming|active|closed) = ce qui est affiché par défaut
//   * is_locked                       = édition matériellement bloquée
// Les deux sont INDÉPENDANTS. `sequence_order` reprend l'entier de
// grades.sequence (zéro re-clé sur les notes).
//
// Chemin d'écriture identique au reste de l'app (cf. schoolStore) :
//   IDB d'abord (optimiste) → Supabase si en ligne, sinon syncQueue.
// La syncQueue est FIFO : pour l'activation (clôture puis activation), l'ordre
// est préservé au replay, donc l'index unique partiel n'est jamais violé.

import { supabase } from './supabase';
import { academicPeriodsDB, syncQueueDB } from './db';
import { fetchSequenceDates } from './sequenceDatesService';
import { logAction } from './historyService';
import { useUiStore } from '../store/uiStore';
import { SCHOOL_EVENT } from './notificationRulesSchool';

const TABLE = 'academic_periods';

async function queueOffline(op) {
  await syncQueueDB.push(op);
  useUiStore.getState().incrementPending();
}

// Écriture offline-first d'une ligne période. `p` doit contenir `id`.
// Renvoie le record (avec updated_at rafraîchi).
export async function upsertPeriod(p) {
  const record = { ...p, updated_at: new Date().toISOString() };
  await academicPeriodsDB.put(record);
  if (navigator.onLine) {
    const { error } = await supabase.from(TABLE).upsert(record, { onConflict: 'id' });
    if (error) await queueOffline({ table: TABLE, operation: 'upsert', payload: record });
  } else {
    await queueOffline({ table: TABLE, operation: 'upsert', payload: record });
  }
  return record;
}

// Lecture pour une (école, année). Renvoie [] si hors-ligne / erreur.
export async function fetchPeriods(schoolId, year) {
  let q = supabase.from(TABLE).select('*').eq('school_id', schoolId);
  if (year) q = q.eq('school_year', year);
  const { data, error } = await q;
  if (error) { console.error('fetchPeriods', error); return null; }
  return data;
}

// La séquence active courante d'une (école, année), hors période ciblée.
function currentActiveSequence(periods, schoolYear, excludeId) {
  return (periods || []).find(
    (p) => p.type === 'sequence' && p.status === 'active' &&
           p.school_year === schoolYear && p.id !== excludeId
  ) || null;
}

// Active une période (séquence). Clôture D'ABORD la séquence active courante
// (sans toucher son is_locked), PUIS active la cible — ordre garanti FIFO en
// file de synchro, jamais deux actives simultanées.
export async function activatePeriod(period, userId, allPeriods) {
  const now = new Date().toISOString();
  if (period.type === 'sequence') {
    const prev = currentActiveSequence(allPeriods, period.school_year, period.id);
    if (prev) {
      await upsertPeriod({ ...prev, status: 'closed', closed_at: now, closed_by: userId || null });
    }
  }
  const next = await upsertPeriod({
    ...period, status: 'active', activated_at: now, activated_by: userId || null,
  });
  await logAction({ action: 'update', table: TABLE, target_id: period.id, details: { type: 'activate' } });
  return next;
}

// Clôture une période (status→closed). N'affecte JAMAIS is_locked.
export async function closePeriod(period, userId) {
  const now = new Date().toISOString();
  const rec = await upsertPeriod({ ...period, status: 'closed', closed_at: now, closed_by: userId || null });
  await logAction({ action: 'update', table: TABLE, target_id: period.id, details: { type: 'close' } });
  return rec;
}

// Rouvre une période clôturée : la redevient active (clôture la précédente) et
// la déverrouille, afin que la saisie y soit de nouveau possible.
export async function reopenPeriod(period, userId, allPeriods) {
  const unlocked = { ...period, is_locked: false };
  const rec = await activatePeriod(unlocked, userId, allPeriods);
  await logAction({ action: 'update', table: TABLE, target_id: period.id, details: { type: 'reopen' } });
  return rec;
}

// Verrou — indépendant du status. Bloque matériellement l'édition.
export async function lockPeriod(period, userId) {
  const now = new Date().toISOString();
  const rec = await upsertPeriod({ ...period, is_locked: true, closed_at: period.closed_at || now, closed_by: period.closed_by || userId || null });
  await logAction({ action: 'validate', table: TABLE, target_id: period.id, details: { type: 'lock' } });
  notifyPeriod(SCHOOL_EVENT.PERIOD_LOCKED, period);
  return rec;
}

export async function unlockPeriod(period) {
  const rec = await upsertPeriod({ ...period, is_locked: false });
  await logAction({ action: 'update', table: TABLE, target_id: period.id, details: { type: 'unlock' } });
  notifyPeriod(SCHOOL_EVENT.PERIOD_UNLOCKED, period);
  return rec;
}

// Prévient les enseignants qu'ils peuvent (ou ne peuvent plus) saisir. Le verrou
// est déjà écrit à ce stade : best-effort, jamais bloquant, import dynamique pour
// ne rien charger tant qu'aucune période n'est verrouillée.
function notifyPeriod(kind, period) {
  import('./notificationProducers.js')
    .then(({ notifySchoolEvent }) => notifySchoolEvent({
      kind,
      schoolId: period?.school_id || null,
      payload: { label: period?.name || null },   // `name` = colonne réelle (ex. « Séquence 3 »)
    }))
    .catch(() => { /* notification best-effort */ });
}

// ── Migration / seed ─────────────────────────────────────────────────────────
// Génère, pour (école, année active), les lignes `sequence` (depuis
// country.periods.sequences) et `trimestre` (depuis country.periods.trimestres),
// reliées par parent_id. Idempotent : ne recrée rien si des lignes existent déjà.
// AUCUNE note touchée — grades.sequence reste tel quel.
//
// @returns { skipped } si déjà généré, sinon { created, sequences, trimesters }

// Extrait l'entier final d'un seq_key ('fr_seq_3' → 3, 'en_term_2' → 2).
function seqOrderFromKey(key) {
  const m = String(key || '').match(/(\d+)\s*$/);
  return m ? Number(m[1]) : null;
}

export async function seedPeriods({ school, country, userId, periodMode }) {
  const schoolId = school?.id;
  const year     = school?.current_year;
  if (!schoolId || !year) return { error: 'École ou année active manquante.' };

  // Garde d'idempotence : si des périodes existent déjà pour (école, année),
  // ne rien recréer. En ligne on lit la base, sinon l'IDB.
  let existing = navigator.onLine ? await fetchPeriods(schoolId, year) : null;
  if (existing === null) {
    existing = (await academicPeriodsDB.getBySchool(schoolId)).filter((p) => p.school_year === year);
  }
  if (existing && existing.length > 0) return { skipped: true, existing: existing.length };

  const periods    = country?.periods || {};
  const sequences  = Array.isArray(periods.sequences) ? periods.sequences : [];
  const trimestres = Array.isArray(periods.trimestres) ? periods.trimestres : [];
  if (sequences.length === 0) return { error: 'Aucune séquence définie pour ce pays.' };

  // Pré-remplissage des dates depuis sequence_dates (best-effort, en ligne).
  const dateByOrder = {};
  if (navigator.onLine) {
    try {
      for (const row of await fetchSequenceDates(schoolId)) {
        const ord = seqOrderFromKey(row.seq_key);
        if (ord != null) dateByOrder[ord] = { teaching_end: row.exam_date || null, entry_deadline: row.deadline_date || null };
      }
    } catch { /* best-effort */ }
  }

  // 1. Trimestres (créés d'abord pour disposer de leur id comme parent_id).
  const trimRows = trimestres.map((tr) => ({
    id:             crypto.randomUUID(),
    school_id:      schoolId,
    school_year:    year,
    type:           'trimestre',
    parent_id:      null,
    name:           tr.label || tr.short || tr.value,
    sequence_order: null,
    teaching_start: null, teaching_end: null, entry_deadline: null,
    status:         'upcoming',
    is_locked:      false,
    _seqs:          Array.isArray(tr.seqs) ? tr.seqs : [],
  }));
  const trimIdForSeq = {};
  for (const tr of trimRows) for (const s of tr._seqs) trimIdForSeq[s] = tr.id;

  // 2. Séquences, reliées à leur trimestre.
  const seqRows = sequences.map((order) => ({
    id:             crypto.randomUUID(),
    school_id:      schoolId,
    school_year:    year,
    type:           'sequence',
    parent_id:      trimIdForSeq[order] || null,
    name:           `Séquence ${order}`,
    sequence_order: order,
    teaching_start: null,
    teaching_end:   dateByOrder[order]?.teaching_end   || null,
    entry_deadline: dateByOrder[order]?.entry_deadline || null,
    status:         'upcoming',
    is_locked:      false,
  }));

  // 3. Active initiale : en mode auto, faute de teaching_start, on retombe sur
  //    la 1ère séquence ; en mode manual, on laisse tout en `upcoming`.
  if ((periodMode || 'auto') === 'auto' && seqRows.length) {
    const now = new Date().toISOString();
    seqRows[0].status = 'active';
    seqRows[0].activated_at = now;
    seqRows[0].activated_by = userId || null;
  }

  // 4. Écriture (trimestres puis séquences). On retire le champ interne _seqs.
  for (const tr of trimRows) { const { _seqs, ...row } = tr; await upsertPeriod(row); }
  for (const sq of seqRows)  await upsertPeriod(sq);

  await logAction({ action: 'create', table: TABLE, target_id: `${schoolId}_${year}`,
    details: { type: 'seed', sequences: seqRows.length, trimesters: trimRows.length } });

  return { created: trimRows.length + seqRows.length, sequences: seqRows.length, trimesters: trimRows.length };
}
