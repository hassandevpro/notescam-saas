// Résolveur de doublures pour _syncBatch.test.mjs.
//
//   node --experimental-loader ./src/lib/_syncBatch.hooks.mjs src/lib/_syncBatch.test.mjs
//
// Les hooks de résolution tournent dans un THREAD séparé : ils ne partagent pas
// `globalThis` avec le test. Le code des doublures est donc écrit ici, et il
// dialogue avec le test par des globales qu'il crée lui-même à l'exécution
// (les modules `data:` s'exécutent, eux, dans le thread principal).
const STUBS = {
  './supabase': `
    export const supabase = {
      from(table) {
        return {
          upsert(rows, opts) {
            const arr = Array.isArray(rows) ? rows : [rows];
            globalThis.__syncCalls.push({ kind: 'upsert', table, rows: arr.length, conflict: opts && opts.onConflict });
            const st = globalThis.__syncFail;
            if (st.table === table && arr.length > 1) return Promise.resolve({ error: { message: 'lot refusé' } });
            if (st.rowValue && arr.some((r) => r.value === st.rowValue)) return Promise.resolve({ error: { message: 'ligne invalide' } });
            return Promise.resolve({ error: null });
          },
          delete() {
            return {
              eq(_c, id) { globalThis.__syncCalls.push({ kind: 'delete', table, ids: 1, id }); return Promise.resolve({ error: null }); },
              in(_c, ids) { globalThis.__syncCalls.push({ kind: 'delete', table, ids: ids.length }); return Promise.resolve({ error: null }); },
            };
          },
        };
      },
    };`,
  './db': `
    export const initDB = async () => {};
    export const syncQueueDB = {
      getAll: async () => globalThis.__syncQueue.slice(),
      delete: async (id) => { globalThis.__syncQueue = globalThis.__syncQueue.filter((x) => x.id !== id); },
    };
    export const studentsDB = { get: async () => null, put: async () => {} };`,
  '../store/uiStore': `
    export const useUiStore = { getState: () => ({ decrementPending() {}, setPendingCount() {} }) };`,
};

export async function resolve(specifier, context, next) {
  // Sans filtre sur le parent : `sync.js` importe `schoolService.js`, qui importe
  // lui aussi `./supabase`. Ne remplacer que pour `sync.js` laissait donc passer
  // le vrai client (et son `import.meta.env`, absent hors de Vite).
  if (STUBS[specifier]) {
    return {
      url: `data:text/javascript,${encodeURIComponent(STUBS[specifier])}`,
      shortCircuit: true,
    };
  }
  try {
    return await next(specifier, context);
  } catch (err) {
    if (!specifier.startsWith('.') && !specifier.startsWith('/')) throw err;
    for (const suffix of ['.js', '.jsx', '/index.js']) {
      try { return await next(specifier + suffix, context); } catch { /* candidat suivant */ }
    }
    throw err;
  }
}
