// Tests du rejeu PAR LOTS de la file de synchronisation :
//   node --experimental-loader ./src/lib/_syncBatch.hooks.mjs src/lib/_syncBatch.test.mjs
//
// Ce qui doit rester vrai après le regroupement :
//   · une classe saisie hors ligne part en UNE requête, pas une par élève ;
//   · un lot en échec est rejoué élément par élément — une ligne invalide ne
//     bloque pas les autres et le décompte des échecs reste exact ;
//   · l'ordre de la file est conservé (deux écritures sur la même ligne) ;
//   · les suppressions sont groupées ;
//   · les tables non groupables passent par le chemin unitaire d'origine.
//
// Les modules externes (Supabase, IndexedDB, store d'UI) sont remplacés par des
// doublures via un résolveur : on teste la logique de regroupement, pas le réseau.

// ── État partagé avec les doublures (voir _syncBatch.hooks.mjs) ──────────────
globalThis.__syncCalls = [];
globalThis.__syncQueue = [];
globalThis.__syncFail = { table: null, rowValue: null };

const calls = globalThis.__syncCalls;
const setQueue = (q) => { globalThis.__syncQueue = q; };
const getQueue = () => globalThis.__syncQueue;

const { flushSyncQueue } = await import('./sync.js');

// ── Utilitaires ──────────────────────────────────────────────────────────────
let failed = false;
const ok = (cond, msg) => { console.log(`${cond ? '✅' : '❌'} ${msg}`); if (!cond) failed = true; };
const eq = (a, b, msg) => ok(a === b, `${msg}  (${a} attendu ${b})`);

const gradeItem = (i, value = '14') => ({
  id: i, table: 'grades', operation: 'upsert',
  payload: { key: `c1_e${i}_1`, class_id: 'c1', student_id: `e${i}`, sequence: 1, school_id: 'sc', scores: { m1: value } },
});
const reset = () => { calls.length = 0; globalThis.__syncFail = { table: null, rowValue: null }; };

// ── 1. Une classe saisie hors ligne = une requête ────────────────────────────
{
  reset();
  setQueue(Array.from({ length: 55 }, (_, i) => gradeItem(i + 1)));
  const r = await flushSyncQueue();
  const upserts = calls.filter((c) => c.kind === 'upsert');
  eq(upserts.length, 1, '55 élèves → 1 seule requête');
  eq(upserts[0].rows, 55, 'les 55 lignes partent ensemble');
  eq(upserts[0].conflict, 'class_id,student_id,subject_id,sequence', 'cible de conflit conservée');
  eq(r.synced, 55, '55 éléments marqués synchronisés');
  eq(r.failed, 0, 'aucun échec');
  eq(getQueue().length, 0, 'file vidée');
}

// ── 2. Lot en échec → reprise élément par élément ────────────────────────────
{
  reset();
  globalThis.__syncFail.table = 'grades';               // tout lot > 1 ligne est refusé
  setQueue(Array.from({ length: 5 }, (_, i) => gradeItem(i + 1)));
  const r = await flushSyncQueue();
  const upserts = calls.filter((c) => c.kind === 'upsert');
  eq(upserts.length, 6, '1 tentative groupée + 5 reprises unitaires');
  eq(r.synced, 5, 'tous les éléments finissent par passer');
  eq(r.failed, 0, 'aucun échec définitif');
  eq(getQueue().length, 0, 'file vidée malgré l’échec du lot');
}

// ── 3. Une ligne invalide ne bloque pas les autres ───────────────────────────
{
  reset();
  globalThis.__syncFail.table = 'grades';
  globalThis.__syncFail.rowValue = 'POISON';
  setQueue([gradeItem(1), gradeItem(2, 'POISON'), gradeItem(3)]);
  const r = await flushSyncQueue();
  eq(r.synced, 2, 'les deux lignes valides passent');
  eq(r.failed, 1, 'la ligne invalide est comptée en échec');
  eq(getQueue().length, 1, 'seul l’élément fautif reste en file');
  eq(r.failedItems[0].table, 'grades', 'la table fautive est remontée');
}

// ── 4. L'ordre de la file est conservé ───────────────────────────────────────
{
  reset();
  setQueue([
    gradeItem(1), gradeItem(2),
    { id: 3, table: 'students', operation: 'upsert', payload: { id: 's1', name: 'A' } },
    gradeItem(4),
  ]);
  const r = await flushSyncQueue();
  const tables = calls.filter((c) => c.kind === 'upsert').map((c) => c.table);
  eq(tables.join(' → '), 'grades → students → grades', 'les groupes gardent l’ordre de la file');
  eq(r.synced, 4, 'tous les éléments synchronisés');
}

// ── 5. Suppressions groupées ─────────────────────────────────────────────────
{
  reset();
  setQueue(Array.from({ length: 4 }, (_, i) => ({
    id: i + 1, table: 'students', operation: 'delete', payload: { id: `s${i + 1}` },
  })));
  const r = await flushSyncQueue();
  const dels = calls.filter((c) => c.kind === 'delete');
  eq(dels.length, 1, '4 suppressions → 1 requête');
  eq(dels[0].ids, 4, 'les 4 identifiants partent ensemble');
  eq(r.synced, 4, 'les 4 suppressions comptent');
}

// ── 6. Un élément isolé garde le chemin unitaire ─────────────────────────────
{
  reset();
  setQueue([gradeItem(1)]);
  const r = await flushSyncQueue();
  eq(calls.filter((c) => c.kind === 'upsert').length, 1, 'un seul élément = une seule requête');
  eq(r.synced, 1, 'élément synchronisé');
}

console.log(failed ? '\n❌ ÉCHECS' : '\n✅ Tous les tests passent');
process.exit(failed ? 1 : 0);
