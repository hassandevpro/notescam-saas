// Sync engine — rejoue la syncQueue IDB contre Supabase.
//
// Appelé :
//   1. Au démarrage si online + queue non vide
//   2. Sur l'événement window 'online'
//
// Chaque item de la queue : { id, table, operation, payload, timestamp }
//   + après un échec : { attempts, last_error, last_attempt_at }
// - operation 'upsert' : upsert du payload dans la table Supabase
// - operation 'delete' : suppression par payload.id
// - table 'grades'     : payload est un record IDB → convertir en rows individuelles
//
// RÈGLE CARDINALE : ce module ne détruit jamais une écriture non confirmée.
// Un élément sort de la file sur confirmation du serveur, ou part en quarantaine
// (`syncQuarantine`, sans expiration). Seul `purgeQuarantine()` détruit, et il
// n'est appelé que sur demande explicite. Voir le bloc « DURABILITÉ » plus bas :
// la suppression par âge qui existait ici a fait perdre des notes à l'école.

import { syncQueueDB, syncQuarantineDB, studentsDB, feesDB, initDB } from './db';
import { uuid } from './uuid';
import { supabase } from './supabase';
import { gradeEntryToRows, upsertAbsenceEntry, absenceEntryToRow, upsertFee, estDoublonFrais } from './schoolService';
import { useUiStore } from '../store/uiStore';

// Nombre d'opérations en attente (lecture IDB, sans dépendance React)
export async function getQueueCount() {
  await initDB();
  const q = await syncQueueDB.getAll();
  return q.length;
}

async function replayItem(item) {
  const { table, operation, payload } = item;

  if (operation === 'delete') {
    const { error } = await supabase.from(table).delete().eq('id', payload.id);
    if (error) throw error;
    return;
  }

  // upsert
  if (table === 'grades') {
    // payload = { key, class_id, student_id, sequence, school_id, scores }
    const rows = gradeEntryToRows(
      payload.class_id,
      payload.student_id,
      payload.sequence,
      payload.scores,
      payload.school_id
    );
    if (!rows.length) return;
    const { error } = await supabase
      .from('grades')
      .upsert(rows, { onConflict: 'class_id,student_id,subject_id,sequence' });
    if (error) throw error;
  } else if (table === 'apc_notes') {
    // payload = record IDB { id, school_id, eleve_id, competence_id,
    //   sequence_id, …, nkey }. `nkey` est local : on le retire et on upsert
    //   sur le triplet officiel (anti-doublon, comme le chemin online direct).
    const { nkey, ...row } = payload;
    const { error } = await supabase
      .from('apc_notes')
      .upsert(row, { onConflict: 'eleve_id,competence_id,sequence_id' });
    if (error) throw error;
  } else if (table === 'mat_observations') {
    // payload = record IDB { id, school_id, eleve_id, domaine_id, trimestre_id,
    //   …, nkey }. `nkey` est local : on le retire et on upsert sur le triplet
    //   officiel (anti-doublon, comme le chemin online direct — matService.js).
    const { nkey, ...row } = payload;
    const { error } = await supabase
      .from('mat_observations')
      .upsert(row, { onConflict: 'eleve_id,domaine_id,trimestre_id' });
    if (error) throw error;
  } else if (table === 'prim_notes') {
    // payload = record IDB { id, school_id, eleve_id, competence_id, critere_id,
    //   ua, …, nkey }. `nkey` est local : on le retire et on upsert sur le
    //   quadruplet officiel (anti-doublon, comme le chemin online direct — primService.js).
    const { nkey, ...row } = payload;
    const { error } = await supabase
      .from('prim_notes')
      .upsert(row, { onConflict: 'eleve_id,competence_id,critere_id,ua' });
    if (error) throw error;
  } else if (table === 'student_absences') {
    // payload = record IDB { key, class_id, student_id, sequence, school_id, scores }
    // → mappe les clés spéciales (__abs_j__, __conduite__, …) vers les vraies
    //   colonnes. Upserter le record brut écrirait `key`/`scores` (inexistants).
    const ok = await upsertAbsenceEntry(
      payload.class_id,
      payload.student_id,
      payload.sequence,
      payload.scores,
      payload.school_id
    );
    if (!ok) throw new Error('upsertAbsenceEntry failed');
  } else {
    // classes | subjects | students | teachers | staff …
    let p = payload;
    if (table === 'classes' && (p.serie === '' || p.serie == null)) {
      // `serie` (Second Cycle MINESEC) n'existe en base qu'après la migration ;
      // ne jamais l'envoyer vide → évite « Could not find the 'serie' column ».
      const { serie, ...rest } = p;
      p = rest;
    } else if (table === 'students') {
      p = { ...p, gender: p.gender || null, statut: p.statut || null };
    } else if (table === 'teachers' || table === 'staff') {
      // Une chaîne vide est invalide pour la colonne `date` (hire_date) côté
      // Postgres → null. Auto-réparation des anciens éléments mis en file avant
      // l'assainissement (sinon ils échouent indéfiniment à chaque sync).
      p = { ...p };
      if (p.hire_date === '') p.hire_date = null;
    } else if (table === 'subjects' && p.max == null) {
      // `subjects.max` est NOT NULL côté base. La maternelle (évaluée par cotes
      // A/ECA/NA, sans note numérique) matérialisait ses domaines avec max=null →
      // upsert rejeté et bloqué en file. Placeholder /20 jamais lu en maternelle.
      p = { ...p, max: 20 };
    }
    let { error } = await supabase
      .from(table)
      .upsert(p, { onConflict: 'id' });

    // Self-heal : d'anciennes promotions dupliquaient l'élève en réutilisant son
    // parent_token (UNIQUE) → l'upsert restait bloqué en file. On régénère un
    // jeton, on réessaie, puis on répercute le nouveau jeton en IDB.
    if (error && table === 'students' &&
        (error.code === '23505' || /parent_token/i.test(error.message || ''))) {
      const token = uuid();
      p = { ...p, parent_token: token };
      ({ error } = await supabase.from('students').upsert(p, { onConflict: 'id' }));
      if (!error) {
        try {
          const row = await studentsDB.get(p.id);
          if (row) await studentsDB.put({ ...row, parent_token: token });
        } catch { /* IDB best-effort */ }
      }
    }

    // Self-heal : la fiche de frais existe déjà au Cloud sous un AUTRE id.
    // `student_fees` porte UNIQUE(student_id, academic_year) : un poste qui
    // fabrique un uuid neuf (cache vidé, autre navigateur, année active
    // changée) voyait son upsert refusé en 23505 À CHAQUE CYCLE, jusqu'à la
    // quarantaine — le montant dû saisi par la caisse n'arrivait jamais.
    // `upsertFee` écrit dans la ligne existante sans toucher au cache de
    // paiement ; ici on réaligne l'id en IDB pour que la saisie suivante ne
    // rebloque pas la file. Signalé par THE GENIUS le 2026-10-19.
    if (error && table === 'student_fees' && estDoublonFrais(error) &&
        p.student_id && p.academic_year) {
      const saved = await upsertFee(p);
      if (saved) {
        error = null;
        try {
          if (saved.id !== p.id) await feesDB.delete(p.id);
          await feesDB.put(saved);
        } catch { /* IDB best-effort : l'écriture serveur est déjà faite */ }
      }
    }
    if (error) throw error;
  }
}

// ── Rejeu par LOTS ───────────────────────────────────────────────────────────
// Une classe de 55 élèves saisie hors ligne, c'est 55 éléments en file, donc
// 55 allers-retours (≈ 19 s à 350 ms de latence) là où une seule requête suffit :
// PostgREST accepte un tableau de lignes dans un upsert, et c'est déjà ce que
// fait le chemin en ligne (`upsertGradeEntry` envoie toute la grille d'un élève
// en une fois).
//
// Principe : on regroupe les éléments par (table, opération), on envoie un lot,
// et EN CAS D'ÉCHEC on rejoue les éléments du lot un par un. Une seule ligne
// invalide ne peut donc pas bloquer les autres, et le décompte des échecs reste
// exact, élément par élément — comme avant.
const BATCH_ROWS = 500;

const chunk = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

// Tables dont un lot d'upsert est possible : cible de conflit + fabrique de lignes.
const BATCHABLE = {
  grades: {
    conflict: 'class_id,student_id,subject_id,sequence',
    rows: (p) => gradeEntryToRows(p.class_id, p.student_id, p.sequence, p.scores, p.school_id),
  },
  student_absences: {
    conflict: 'student_id,sequence',
    rows: (p) => [absenceEntryToRow(p.class_id, p.student_id, p.sequence, p.scores, p.school_id)],
  },
  apc_notes: {
    conflict: 'eleve_id,competence_id,sequence_id',
    rows: (p) => { const { nkey, ...row } = p; return [row]; },
  },
  mat_observations: {
    conflict: 'eleve_id,domaine_id,trimestre_id',
    rows: (p) => { const { nkey, ...row } = p; return [row]; },
  },
  prim_notes: {
    conflict: 'eleve_id,competence_id,critere_id,ua',
    rows: (p) => { const { nkey, ...row } = p; return [row]; },
  },
};

/** Envoie un groupe d'éléments en une requête. Renvoie false si le lot échoue. */
async function replayBatch(table, items) {
  const spec = BATCHABLE[table];
  if (!spec || items.length < 2) return false;

  const rows = items.flatMap((it) => spec.rows(it.payload) || []);
  if (!rows.length) return true;   // rien à écrire : le lot est « réussi »

  for (const part of chunk(rows, BATCH_ROWS)) {
    const { error } = await supabase.from(table).upsert(part, { onConflict: spec.conflict });
    if (error) {
      console.warn(`[sync] lot ${table} (${part.length} lignes) en échec — reprise élément par élément`, error.message);
      return false;
    }
  }
  return true;
}

/** Supprime plusieurs lignes d'une même table en une requête. */
async function deleteBatch(table, items) {
  if (items.length < 2) return false;
  const ids = items.map((it) => it.payload?.id).filter(Boolean);
  if (ids.length !== items.length) return false;      // payload inattendu : chemin unitaire
  const { error } = await supabase.from(table).delete().in('id', ids);
  if (error) {
    console.warn(`[sync] suppression groupée ${table} en échec — reprise élément par élément`, error.message);
    return false;
  }
  return true;
}

/**
 * Rejoue toutes les opérations en attente.
 * Chaque item réussi est supprimé de la queue et décrémente le compteur UI.
 * Les items en échec restent en queue pour la prochaine tentative.
 *
 * @returns {{ synced: number, failed: number, total: number, failedItems: Array }}
 */
// Inscrit l'échec SUR l'élément, qui reste en file. Best-effort : si la
// réécriture échoue (magasin indisponible, base en cours de migration), on perd
// le compteur — jamais l'écriture. Perdre un compteur fait réessayer une fois de
// trop ; perdre l'écriture fait perdre des notes.
async function markFailed(item, err) {
  try {
    await syncQueueDB.update({
      ...item,
      attempts: (item.attempts || 0) + 1,
      last_error: err?.message ?? String(err),
      last_attempt_at: Date.now(),
    });
  } catch (e) {
    console.warn('[sync] trace d’échec non enregistrée:', e?.message ?? e);
  }
}

export async function flushSyncQueue() {
  await initDB();
  const all = await syncQueueDB.getAll();

  // Un élément que le serveur a refusé MAX_ATTEMPTS fois n'est plus rejoué — il
  // consommerait une requête toutes les 20 s sans jamais passer. Il n'est pour
  // autant ni déplacé ni supprimé : il reste en file, compté à part, et visible.
  // C'est ce comptage séparé qui remplace l'ancienne suppression par âge.
  const queue = all.filter((it) => (it.attempts || 0) < MAX_ATTEMPTS);
  const stalled = all.length - queue.length;

  if (!queue.length) return { synced: 0, failed: 0, total: 0, failedItems: [], stalled };

  let synced = 0;
  let failed = 0;
  const failedItems = [];

  const markSynced = async (items) => {
    for (const it of items) {
      await syncQueueDB.delete(it.id);
      useUiStore.getState().decrementPending();
      synced++;
    }
  };

  // Regroupement par (table, opération), en conservant l'ordre de la file :
  // deux écritures successives sur la même ligne doivent rester dans l'ordre.
  const groups = [];
  for (const item of queue) {
    const last = groups[groups.length - 1];
    if (last && last.table === item.table && last.operation === item.operation) last.items.push(item);
    else groups.push({ table: item.table, operation: item.operation, items: [item] });
  }

  for (const group of groups) {
    const { table, operation, items } = group;

    const batched = operation === 'delete'
      ? await deleteBatch(table, items).catch(() => false)
      : await replayBatch(table, items).catch(() => false);

    if (batched) { await markSynced(items); continue; }

    // Repli unitaire : lot impossible ou lot en échec.
    for (const item of items) {
      try {
        await replayItem(item);
        await syncQueueDB.delete(item.id);
        useUiStore.getState().decrementPending();
        synced++;
      } catch (err) {
        console.error(`[sync] échec ${item.table}/${item.operation} id=${item.id}`, err.message);
        failed++;
        // L'élément RESTE en file. On y inscrit seulement la trace de l'échec :
        // c'est ce compteur — et non l'âge — qui décidera un jour de sa mise de
        // côté, et c'est cette erreur qui s'affichera à l'enseignant.
        await markFailed(item, err);
        failedItems.push({ table: item.table, operation: item.operation, error: err?.message ?? String(err) });
      }
    }
  }

  return { synced, failed, total: queue.length, failedItems, stalled };
}

// ── DURABILITÉ DES ÉCRITURES NON TRANSMISES ─────────────────────────────────
//
// INVARIANT : un élément ne quitte `syncQueue` que de DEUX façons — le serveur
// a confirmé l'écriture, ou l'élément est déplacé en QUARANTAINE. Jamais une
// suppression sèche.
//
// Ce qui existait avant, et ce que ça coûtait :
//   · `pruneExpiredItems()` supprimait tout élément de plus de 48 h, sans
//     trace, et il était appelé AU DÉMARRAGE AVANT la première tentative
//     d'envoi (App.jsx) ainsi qu'AVANT chaque « Réessayer » (Layout.jsx). Des
//     notes saisies vendredi soir sur un poste hors ligne étaient donc
//     détruites à l'ouverture du lundi matin — sans avoir jamais été envoyées
//     une seule fois. C'est la cause de la perte de notes constatée à l'école.
//   · `clearSyncQueue()` détruisait la file entière, derrière un bouton
//     « Vider la file d'attente » sans confirmation.
//
// L'âge d'un élément ne dit RIEN de sa validité : une saisie vieille de deux
// semaines faite sur un poste sans Internet est parfaitement valide et n'a
// jamais eu l'occasion d'échouer. Le seul critère légitime est le nombre
// d'échecs RÉELS d'envoi — un élément que le serveur refuse 25 fois de suite a
// un problème de contenu, pas de connectivité. Même celui-là n'est pas
// supprimé : il part en quarantaine, où il reste consultable et réinjectable.
const MAX_ATTEMPTS = 25;

// Un élément mis de côté garde tout : sa charge utile, sa date de saisie, le
// nombre de tentatives et la dernière erreur. `queue_id` conserve son ancienne
// identité (la clé du magasin de quarantaine est, elle, auto-incrémentée : deux
// mises en quarantaine ne peuvent pas s'écraser l'une l'autre).
function toQuarantine(item, reason) {
  const { id, ...rest } = item;
  return { ...rest, queue_id: id, reason };
}

async function refreshPending() {
  const remaining = await syncQueueDB.getAll();
  useUiStore.getState().setPendingCount(remaining.length);
  return remaining.length;
}

// Déplace des éléments de la file vers la quarantaine. Opération en deux temps
// et dans CET ordre : écrire la copie d'abord, retirer de la file ensuite. Une
// coupure entre les deux laisse un doublon — récupérable — jamais un trou.
async function moveToQuarantine(items, reason) {
  if (!items.length) return 0;
  await syncQuarantineDB.pushMany(items.map((it) => toQuarantine(it, reason)));
  for (const it of items) await syncQueueDB.delete(it.id);
  await refreshPending();
  return items.length;
}

/**
 * Met de côté les éléments que le serveur a refusés de façon répétée.
 * Ne supprime RIEN et ne regarde PAS l'âge des éléments : un élément qui n'a
 * jamais été envoyé reste en file, quel que soit son âge.
 *
 * @returns {number} nombre d'éléments déplacés en quarantaine
 */
export async function quarantineUnsendable() {
  await initDB();
  const queue = await syncQueueDB.getAll();
  const doomed = queue.filter((it) => (it.attempts || 0) >= MAX_ATTEMPTS);
  return moveToQuarantine(doomed, 'refus_repete');
}

/**
 * Vide la file SANS DÉTRUIRE : tout part en quarantaine. C'est ce que fait
 * désormais le bouton de l'UI — le geste reste disponible, son effet n'est plus
 * irréversible.
 *
 * @returns {number} nombre d'éléments mis de côté
 */
export async function clearSyncQueue() {
  await initDB();
  const queue = await syncQueueDB.getAll();
  const n = await moveToQuarantine(queue, 'mise_de_cote_manuelle');
  useUiStore.getState().setIdle();
  return n;
}

/** Éléments en quarantaine (lecture seule). */
export async function getQuarantine() {
  await initDB();
  return syncQuarantineDB.getAll();
}

export async function getQuarantineCount() {
  await initDB();
  const q = await syncQuarantineDB.getAll();
  return q.length;
}

/**
 * Remet des éléments de la quarantaine dans la file, compteur de tentatives
 * remis à zéro (le motif d'échec a pu être corrigé entre-temps : colonne
 * ajoutée, session rouverte, serveur de nouveau joignable).
 *
 * @param {Array<number>} [ids] identifiants à réinjecter ; tous si omis
 * @returns {number} nombre d'éléments réinjectés
 */
export async function restoreQuarantined(ids = null) {
  await initDB();
  const all = await syncQuarantineDB.getAll();
  const wanted = ids ? all.filter((it) => ids.includes(it.id)) : all;
  if (!wanted.length) return 0;
  // Même ordre qu'en quarantaine : écrire d'abord, retirer ensuite.
  await syncQueueDB.pushMany(wanted.map(({ id, queue_id, reason, movedAt, attempts, last_error, last_attempt_at, ...op }) => op));
  await syncQuarantineDB.deleteMany(wanted.map((it) => it.id));
  await refreshPending();
  return wanted.length;
}

/**
 * Rapport complet de tout ce qui n'est pas arrivé au serveur — file + quarantaine.
 * C'est la PREUVE à conserver : un enseignant dont les notes ne sont pas
 * remontées doit pouvoir produire ce qu'il a saisi, sans dépendre du navigateur
 * qui l'a saisi.
 */
export async function exportPendingWrites() {
  await initDB();
  const [queue, quarantine] = await Promise.all([
    syncQueueDB.getAll(),
    syncQuarantineDB.getAll(),
  ]);
  return {
    generatedAt: new Date().toISOString(),
    counts: { queue: queue.length, quarantine: quarantine.length },
    queue,
    quarantine,
  };
}

/**
 * Supprime définitivement des éléments de la quarantaine. Appel EXPLICITE
 * uniquement : aucune minuterie, aucun démarrage et aucun écran ne l'appelle.
 * C'est le seul endroit du moteur de synchronisation qui détruit une écriture.
 */
export async function purgeQuarantine(ids) {
  await initDB();
  if (!Array.isArray(ids) || !ids.length) return 0;
  await syncQuarantineDB.deleteMany(ids);
  return ids.length;
}
