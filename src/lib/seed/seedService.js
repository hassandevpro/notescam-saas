// Écriture / suppression des données de DÉMONSTRATION. Réservé au mode DEV.
//
// Sécurité de suppression : chaque enregistrement inséré est consigné dans un
// REGISTRE local (localStorage). « Supprimer toutes les données de démo » ne
// supprime QUE les id consignés → ne touche JAMAIS les données réelles.
import { supabase } from '../supabase';

const REG_KEY = 'notescam_seed_registry_v1';
const isDev = () => { try { return !!import.meta.env?.DEV; } catch { return false; } };

function loadReg() { try { return JSON.parse(localStorage.getItem(REG_KEY) || '[]'); } catch { return []; } }
function saveReg(r) { try { localStorage.setItem(REG_KEY, JSON.stringify(r)); } catch { /* quota */ } }

export function hasDemoData() { return loadReg().length > 0; }
export function demoCount() { return loadReg().length; }

// Insère un lot ; en cas d'échec (ex. localClient sans insert-tableau), repli
// ligne à ligne pour n'ignorer que les lignes fautives.
async function insertChunk(table, chunk, reg) {
  let n = 0;
  try {
    const { error } = await supabase.from(table).insert(chunk);
    if (!error) { for (const row of chunk) reg.push({ t: table, id: row.id }); return chunk.length; }
  } catch { /* repli ci-dessous */ }
  for (const row of chunk) {
    try {
      const { error } = await supabase.from(table).insert(row);
      if (!error) { reg.push({ t: table, id: row.id }); n++; }
    } catch { /* ligne ignorée */ }
  }
  return n;
}

// Écrit un dataset généré (ordre FK respecté). onProgress(table, ok, total).
export async function writeSeed({ records, order }, onProgress) {
  if (!isDev()) throw new Error('Seed Data est réservé au mode Développement.');
  const reg = loadReg();
  const results = {};
  for (const table of order) {
    const rows = records[table] || [];
    let ok = 0;
    for (let i = 0; i < rows.length; i += 200) ok += await insertChunk(table, rows.slice(i, i + 200), reg);
    results[table] = ok;
    saveReg(reg);              // persistance incrémentale (résiste à une interruption)
    onProgress?.(table, ok, rows.length);
  }
  return results;
}

// Supprime EXACTEMENT les enregistrements consignés (ordre inverse). Jamais les
// données réelles. Idempotent : vide le registre à la fin.
export async function deleteAllDemo(onProgress) {
  if (!isDev()) throw new Error('Seed Data est réservé au mode Développement.');
  const reg = loadReg();
  const byTable = {};
  for (const { t, id } of reg) (byTable[t] || (byTable[t] = [])).push(id);
  const tables = [...new Set(reg.map((x) => x.t))].reverse();  // inverse des dépendances FK
  let deleted = 0;
  for (const table of tables) {
    const ids = byTable[table];
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200);
      try {
        const { error } = await supabase.from(table).delete().in('id', chunk);
        if (error) throw error;
        deleted += chunk.length;
      } catch {
        for (const id of chunk) { try { await supabase.from(table).delete().eq('id', id); deleted++; } catch { /* ignore */ } }
      }
    }
    onProgress?.(table, ids.length);
  }
  saveReg([]);
  return deleted;
}
