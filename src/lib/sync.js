// Sync engine — rejoue la syncQueue IDB contre Supabase.
//
// Appelé :
//   1. Au démarrage si online + queue non vide
//   2. Sur l'événement window 'online'
//
// Chaque item de la queue : { id, table, operation, payload, timestamp }
// - operation 'upsert' : upsert du payload dans la table Supabase
// - operation 'delete' : suppression par payload.id
// - table 'grades'     : payload est un record IDB → convertir en rows individuelles

import { syncQueueDB, studentsDB, initDB } from './db';
import { supabase } from './supabase';
import { gradeEntryToRows } from './schoolService';
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
  } else {
    // classes | subjects | students
    let p = payload;
    if (table === 'students') {
      p = { ...p, gender: p.gender || null, statut: p.statut || null };
    }
    let { error } = await supabase
      .from(table)
      .upsert(p, { onConflict: 'id' });

    // Self-heal : d'anciennes promotions dupliquaient l'élève en réutilisant son
    // parent_token (UNIQUE) → l'upsert restait bloqué en file. On régénère un
    // jeton, on réessaie, puis on répercute le nouveau jeton en IDB.
    if (error && table === 'students' &&
        (error.code === '23505' || /parent_token/i.test(error.message || ''))) {
      const token = crypto.randomUUID();
      p = { ...p, parent_token: token };
      ({ error } = await supabase.from('students').upsert(p, { onConflict: 'id' }));
      if (!error) {
        try {
          const row = await studentsDB.get(p.id);
          if (row) await studentsDB.put({ ...row, parent_token: token });
        } catch { /* IDB best-effort */ }
      }
    }
    if (error) throw error;
  }
}

/**
 * Rejoue toutes les opérations en attente.
 * Chaque item réussi est supprimé de la queue et décrémente le compteur UI.
 * Les items en échec restent en queue pour le prochain tentative.
 *
 * @returns {{ synced: number, failed: number, total: number, failedItems: Array }}
 */
export async function flushSyncQueue() {
  await initDB();
  const queue = await syncQueueDB.getAll();

  if (!queue.length) return { synced: 0, failed: 0, total: 0, failedItems: [] };

  let synced = 0;
  let failed = 0;
  const failedItems = [];

  for (const item of queue) {
    try {
      await replayItem(item);
      await syncQueueDB.delete(item.id);
      useUiStore.getState().decrementPending();
      synced++;
    } catch (err) {
      console.error(`[sync] échec ${item.table}/${item.operation} id=${item.id}`, err.message);
      failed++;
      failedItems.push({ table: item.table, operation: item.operation, error: err?.message ?? String(err) });
    }
  }

  return { synced, failed, total: queue.length, failedItems };
}

// Supprime tous les items de la queue (utilisé par l'UI pour vider manuellement)
export async function clearSyncQueue() {
  await initDB();
  const queue = await syncQueueDB.getAll();
  for (const item of queue) {
    await syncQueueDB.delete(item.id);
  }
  useUiStore.getState().setPendingCount(0);
  useUiStore.getState().setIdle();
}

// Supprime les items plus vieux que 48h (évite d'accumuler des erreurs indéfiniment)
const PRUNE_AGE_MS = 48 * 60 * 60 * 1000;

export async function pruneExpiredItems() {
  await initDB();
  const queue = await syncQueueDB.getAll();
  const cutoff = Date.now() - PRUNE_AGE_MS;
  let pruned = 0;
  for (const item of queue) {
    if (item.timestamp && item.timestamp < cutoff) {
      await syncQueueDB.delete(item.id);
      pruned++;
    }
  }
  if (pruned > 0) {
    const remaining = await syncQueueDB.getAll();
    useUiStore.getState().setPendingCount(remaining.length);
  }
  return pruned;
}
