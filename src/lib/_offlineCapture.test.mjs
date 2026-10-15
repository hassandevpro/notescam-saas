// CAPTURE DES ÉCRITURES QUAND LE SERVEUR LOCAL EST INJOIGNABLE.
//
//   node --experimental-loader ./src/lib/_offlineCapture.hooks.mjs src/lib/_offlineCapture.test.mjs
//
// LE DÉFAUT QUE CES TESTS VERROUILLENT
// ────────────────────────────────────
// En édition LAN, `backendOnline()` renvoie TOUJOURS true (edition.js:20) : le
// serveur est sur le réseau local, il n'y a pas d'« hors ligne » au sens du
// navigateur. `saveGrade` prend donc TOUJOURS la branche en ligne, et la
// branche `else { queueOffline(...) }` est du code mort en LAN.
//
// Dans cette branche, l'échec est capté par `.then((ok) => { if (!ok) … })`.
// Cela ne fonctionne que si l'appel RÉSOUT avec une erreur. Si l'appel REJETTE,
// le `.then` ne s'exécute jamais, aucun `.catch` ne le rattrape, et l'écriture
// n'entre JAMAIS dans la file de synchronisation : rien ne la rejouera, et
// personne ne saura qu'elle existe.
//
// Or `apiJson` appelait `await fetch(...)` sans try/catch. Serveur arrêté,
// câble débranché, Wi-Fi tombé : `fetch` rejette, et la note saisie est perdue
// pour la synchronisation — alors que l'écran a affiché qu'elle était
// enregistrée.
//
// RÈGLE VÉRIFIÉE ICI : quelle que soit la panne de transport, un appel au
// serveur local RÉSOUT avec `{ data, error }`. Il ne rejette jamais.

globalThis.__viteEnv = { VITE_LAN_API_BASE: 'http://serveur-ecole.test' };

// Doublures minimales du navigateur. Le stockage de session est réel (une Map),
// pour que la logique d'inactivité de localClient fonctionne normalement.
const store = new Map();
globalThis.sessionStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
globalThis.localStorage = { ...globalThis.sessionStorage };

// `fetch` piloté par le test.
let fetchMode = 'ok';
let fetchCalls = 0;
globalThis.fetch = async () => {
  fetchCalls++;
  if (fetchMode === 'reject-network') {
    // Ce que fait un navigateur quand l'hôte ne répond pas : TypeError.
    throw new TypeError('Failed to fetch');
  }
  if (fetchMode === 'reject-abort') {
    const e = new Error('The user aborted a request.');
    e.name = 'AbortError';
    throw e;
  }
  if (fetchMode === 'http500') {
    return { ok: false, status: 500, json: async () => { throw new Error('corps vide'); } };
  }
  if (fetchMode === 'http401') {
    return { ok: false, status: 401, json: async () => ({ data: null, error: { message: 'non autorise' } }) };
  }
  return { ok: true, status: 200, json: async () => ({ data: [{ id: 'g1' }], error: null }) };
};

const { supabase } = await import('./localClient.js');

let failed = false;
const ok = (cond, msg) => { console.log(`${cond ? '✅' : '❌'} ${msg}`); if (!cond) failed = true; };
const eq = (a, b, msg) => ok(a === b, `${msg}  (${JSON.stringify(a)} attendu ${JSON.stringify(b)})`);

// Rejoue ce que fait `upsertGradeEntry` : un upsert de notes sur la table grades.
const upsertNotes = () => supabase
  .from('grades')
  .upsert([{ class_id: 'c1', student_id: 'e1', subject_id: 'm1', sequence: 1, value: 14 }],
          { onConflict: 'class_id,student_id,subject_id,sequence' });

// Ce que fait `saveGrade` : capter l'échec par `.then`, SANS `.catch`.
// C'est la forme exacte du code appelant — si elle ne voit pas l'échec,
// l'écriture n'est pas mise en file.
async function commeSaveGrade() {
  let miseEnFile = false;
  let rejet = null;
  try {
    await upsertNotes().then(({ error }) => { if (error) miseEnFile = true; });
  } catch (e) {
    rejet = e;           // le `.then` n'a pas vu l'échec : il a REJETÉ
  }
  return { miseEnFile, rejet };
}

const reset = (mode) => { fetchMode = mode; fetchCalls = 0; };

// ── 1. LE CAS QUI A PERDU LES NOTES : serveur injoignable ───────────────────
{
  reset('reject-network');
  const r = await commeSaveGrade();
  eq(r.rejet, null, 'un serveur injoignable ne fait pas REJETER l’appel');
  ok(r.miseEnFile, 'l’échec est vu par l’appelant → l’écriture part en file');
  eq(fetchCalls, 1, 'une seule tentative réseau');
}

// ── 2. Requête interrompue (onglet fermé, navigation) ───────────────────────
{
  reset('reject-abort');
  const r = await commeSaveGrade();
  eq(r.rejet, null, 'une requête interrompue ne fait pas rejeter l’appel');
  ok(r.miseEnFile, 'l’écriture part en file');
}

// ── 3. La forme de la réponse reste celle de Supabase ───────────────────────
// Tout le code applicatif lit `{ data, error }`. Une panne de transport ne doit
// pas produire une troisième forme à gérer ailleurs.
{
  reset('reject-network');
  const res = await upsertNotes();
  ok(res && typeof res === 'object', 'la réponse est un objet');
  eq(res.data, null, 'data vaut null');
  ok(res.error && typeof res.error.message === 'string', 'error porte un message lisible');
  ok(/injoignable|réseau|reseau|serveur/i.test(res.error.message),
     `le message dit que le serveur est injoignable  (reçu : ${res.error?.message})`);
}

// ── 4. Une panne de transport se distingue d'un refus métier ───────────────
// Un refus du serveur (RLS, validation) ne doit pas être rejoué indéfiniment ;
// une panne de transport, si. L'appelant doit pouvoir les distinguer.
{
  reset('reject-network');
  const { error } = await upsertNotes();
  eq(error.offline, true, 'une panne de transport est marquée `offline: true`');

  reset('http401');
  const r2 = await upsertNotes();
  ok(r2.error, 'un refus serveur reste une erreur');
  ok(!r2.error.offline, 'un refus serveur n’est PAS marqué `offline`');
}

// ── 5. Les comportements existants ne changent pas ─────────────────────────
{
  reset('http500');
  const r = await upsertNotes();
  ok(r.error, 'un HTTP 500 sans corps reste une erreur');
  ok(/500/.test(r.error.message), 'le code HTTP est conservé dans le message');
}
{
  reset('ok');
  const r = await upsertNotes();
  eq(r.error, null, 'un succès reste un succès');
  ok(Array.isArray(r.data), 'les données sont renvoyées telles quelles');
}

// ── 6. Une lecture échoue aussi proprement ────────────────────────────────
// `fetchGrades` et les autres lectures passent par le même `apiJson` : une
// panne de transport doit leur rendre `{ data: null, error }`, pas une
// exception qui remonterait jusqu'au rendu React.
{
  reset('reject-network');
  let rejet = null;
  let res = null;
  try { res = await supabase.from('grades').select('*').eq('school_id', 'sc'); }
  catch (e) { rejet = e; }
  eq(rejet, null, 'une lecture ne rejette pas quand le serveur est injoignable');
  ok(res?.error, 'elle renvoie une erreur exploitable');
}

console.log(failed ? '\n❌ ÉCHEC' : '\n✅ Toute panne de transport est captée par l’appelant');
process.exit(failed ? 1 : 0);
