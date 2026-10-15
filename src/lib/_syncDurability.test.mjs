// DURABILITÉ DES ÉCRITURES NON TRANSMISES — tests de non-régression.
//
//   node --experimental-loader ./src/lib/_syncBatch.hooks.mjs src/lib/_syncDurability.test.mjs
//
// CE QUI EST ARRIVÉ À L'ÉCOLE, ET QUE CES TESTS INTERDISENT DÉSORMAIS :
// des enseignants saisissaient des notes sur le poste local le vendredi ;
// `pruneExpiredItems()` supprimait tout élément de file de plus de 48 h, et il
// était appelé au démarrage de l'application AVANT la première tentative
// d'envoi. Le lundi matin, la saisie était détruite sans avoir jamais été
// transmise une seule fois, et sans aucune trace.
//
// L'INVARIANT vérifié ici : une écriture non confirmée par le serveur ne
// disparaît JAMAIS. Elle est envoyée, ou elle reste en file, ou elle est en
// quarantaine — et la somme des trois ne perd rien.
//
// Les modules externes (Supabase, IndexedDB, store d'UI) sont remplacés par des
// doublures : on teste la règle de survie, pas le réseau.

globalThis.__syncCalls = [];
globalThis.__syncQueue = [];
globalThis.__syncQuarantine = [];
globalThis.__syncFail = { table: null, rowValue: null };

const calls = globalThis.__syncCalls;
const setQueue = (q) => { globalThis.__syncQueue = q; };
const getQueue = () => globalThis.__syncQueue;
const getQuar  = () => globalThis.__syncQuarantine;

const {
  flushSyncQueue, quarantineUnsendable, clearSyncQueue,
  getQuarantine, restoreQuarantined, exportPendingWrites, purgeQuarantine,
} = await import('./sync.js');

let failed = false;
const ok = (cond, msg) => { console.log(`${cond ? '✅' : '❌'} ${msg}`); if (!cond) failed = true; };
const eq = (a, b, msg) => ok(a === b, `${msg}  (${a} attendu ${b})`);

const JOUR = 24 * 60 * 60 * 1000;

// Une note saisie il y a `ageJours`, jamais envoyée (attempts absent).
const noteItem = (i, { ageJours = 0, attempts, value = '14' } = {}) => ({
  id: i,
  table: 'grades',
  operation: 'upsert',
  timestamp: Date.now() - ageJours * JOUR,
  ...(attempts === undefined ? {} : { attempts }),
  payload: { key: `c1_e${i}_1`, class_id: 'c1', student_id: `e${i}`, sequence: 1, school_id: 'sc', scores: { m1: value } },
});

const reset = () => {
  calls.length = 0;
  globalThis.__syncFail = { table: null, rowValue: null };
  globalThis.__syncQuarantine = [];
};

// ── 1. LA RÉGRESSION HISTORIQUE : l'âge ne détruit rien ──────────────────────
// Trois semaines hors ligne, zéro tentative. C'est exactement le cas qui
// faisait disparaître les notes du vendredi.
{
  reset();
  setQueue([noteItem(1, { ageJours: 21 }), noteItem(2, { ageJours: 3 }), noteItem(3, { ageJours: 0 })]);

  const bougé = await quarantineUnsendable();
  eq(bougé, 0, 'une saisie jamais envoyée n’est pas écartée, quel que soit son âge');
  eq(getQueue().length, 3, 'les 3 saisies sont toujours en file');
  eq(getQuar().length, 0, 'rien en quarantaine');

  const r = await flushSyncQueue();
  eq(r.synced, 3, 'les 3 saisies partent au serveur, y compris celle de 21 jours');
  eq(getQueue().length, 0, 'file vidée seulement APRÈS confirmation du serveur');
}

// ── 2. Un échec laisse l'élément en file, avec la trace de l'échec ───────────
{
  reset();
  globalThis.__syncFail.rowValue = 'POISON';
  setQueue([noteItem(1, { value: 'POISON' })]);

  const r = await flushSyncQueue();
  eq(r.failed, 1, 'l’échec est bien signalé');
  eq(getQueue().length, 1, 'l’élément en échec RESTE en file');
  eq(getQueue()[0].attempts, 1, 'la tentative est comptée');
  ok(/invalide/.test(getQueue()[0].last_error || ''), 'la raison de l’échec est inscrite sur l’élément');
  ok(getQueue()[0].payload.scores.m1 === 'POISON', 'la note saisie est intacte');
}

// ── 3. Les tentatives s'accumulent, l'élément survit à chaque passage ────────
{
  reset();
  globalThis.__syncFail.rowValue = 'POISON';
  setQueue([noteItem(1, { value: 'POISON' })]);

  for (let i = 0; i < 4; i++) await flushSyncQueue();
  eq(getQueue().length, 1, 'quatre échecs consécutifs ne suppriment pas l’élément');
  eq(getQueue()[0].attempts, 4, 'le compteur reflète les quatre tentatives');
}

// ── 4. Au plafond : plus rejoué, mais toujours là ────────────────────────────
// Ne plus rejouer évite de brûler une requête toutes les 20 s. Ce n'est PAS une
// suppression : l'élément reste en file et est compté séparément.
{
  reset();
  setQueue([noteItem(1, { attempts: 25 }), noteItem(2)]);

  const r = await flushSyncQueue();
  eq(r.stalled, 1, 'l’élément au plafond est compté à part');
  eq(r.synced, 1, 'il ne bloque pas les autres');
  eq(getQueue().length, 1, 'il reste en file après le passage');
  eq(getQueue()[0].attempts, 25, 'et n’a pas été rejoué');
}

// ── 5. La quarantaine déplace, elle ne détruit pas ───────────────────────────
{
  reset();
  setQueue([noteItem(7, { attempts: 25, value: '17' })]);

  const bougé = await quarantineUnsendable();
  eq(bougé, 1, 'l’élément refusé 25 fois est mis de côté');
  eq(getQueue().length, 0, 'il a quitté la file');
  eq(getQuar().length, 1, 'il est en quarantaine, pas détruit');

  const q = (await getQuarantine())[0];
  eq(q.payload.scores.m1, '17', 'la note est conservée telle quelle');
  eq(q.queue_id, 7, 'son identité d’origine est conservée');
  eq(q.reason, 'refus_repete', 'le motif est enregistré');
  ok(typeof q.movedAt === 'number', 'la date de mise de côté est enregistrée');
}

// ── 6. « Vider la file » ne détruit plus rien ───────────────────────────────
// Le bouton de l'UI appelait `clearSyncQueue()`, qui supprimait tout sans
// confirmation. Il déplace désormais.
{
  reset();
  setQueue([noteItem(1), noteItem(2), noteItem(3)]);

  const n = await clearSyncQueue();
  eq(n, 3, 'les 3 saisies sont mises de côté');
  eq(getQueue().length, 0, 'la file est vide');
  eq(getQuar().length, 3, 'et les 3 saisies sont retrouvables en quarantaine');
}

// ── 7. Réinjection : le compteur repart à zéro, la saisie passe ──────────────
// Le motif d'échec a pu être corrigé entre-temps (colonne ajoutée, session
// rouverte). La date de SAISIE, elle, ne doit pas être réécrite.
{
  reset();
  const saisieLe = Date.now() - 10 * JOUR;
  setQueue([{ ...noteItem(1, { attempts: 25 }), timestamp: saisieLe }]);
  await quarantineUnsendable();

  const n = await restoreQuarantined();
  eq(n, 1, 'la saisie est réinjectée en file');
  eq(getQuar().length, 0, 'elle a quitté la quarantaine');
  eq(getQueue().length, 1, 'elle est de retour en file');
  eq(getQueue()[0].attempts, undefined, 'le compteur de tentatives est remis à zéro');
  eq(getQueue()[0].timestamp, saisieLe, 'la date de saisie d’origine est préservée');

  const r = await flushSyncQueue();
  eq(r.synced, 1, 'et elle part au serveur');
}

// ── 8. La preuve : tout ce qui n'est pas arrivé, exportable ─────────────────
{
  reset();
  setQueue([noteItem(1, { value: '11' }), noteItem(2, { attempts: 25, value: '12' })]);
  await quarantineUnsendable();

  const rapport = await exportPendingWrites();
  eq(rapport.counts.queue, 1, 'le rapport compte la file');
  eq(rapport.counts.quarantine, 1, 'le rapport compte la quarantaine');
  eq(rapport.queue[0].payload.scores.m1, '11', 'la note en attente figure dans la preuve');
  eq(rapport.quarantine[0].payload.scores.m1, '12', 'la note mise de côté aussi');
  ok(typeof rapport.generatedAt === 'string', 'le rapport est daté');
}

// ── 9. Un seul destructeur, et il exige des identifiants explicites ─────────
{
  reset();
  setQueue([noteItem(1, { attempts: 25 })]);
  await quarantineUnsendable();

  eq(await purgeQuarantine(), 0, 'sans argument, rien n’est détruit');
  eq(await purgeQuarantine([]), 0, 'avec une liste vide, rien n’est détruit');
  eq(getQuar().length, 1, 'la quarantaine est intacte');

  const ids = getQuar().map((x) => x.id);
  eq(await purgeQuarantine(ids), 1, 'la destruction n’a lieu que sur demande nominative');
  eq(getQuar().length, 0, 'et elle est alors effective');
}

// ── 10. INVARIANT GLOBAL : rien ne se perd sur un parcours complet ──────────
// 55 saisies, dont une que le serveur refuse toujours. À chaque étape,
// file + quarantaine + confirmées = 55.
{
  reset();
  globalThis.__syncFail.rowValue = 'POISON';
  const items = Array.from({ length: 55 }, (_, i) =>
    noteItem(i + 1, { ageJours: 30, value: i === 17 ? 'POISON' : '14' }));
  setQueue(items);

  let confirmées = 0;
  const total = () => getQueue().length + getQuar().length + confirmées;

  for (let passage = 0; passage < 30; passage++) {
    const r = await flushSyncQueue();
    confirmées += r.synced;
    eq(total(), 55, `passage ${passage + 1} : aucune saisie perdue`);
    if (total() !== 55) break;
  }

  await quarantineUnsendable();
  eq(total(), 55, 'après mise en quarantaine : aucune saisie perdue');
  eq(confirmées, 54, '54 saisies sont arrivées au serveur');
  eq(getQuar().length, 1, 'la seule refusée est en quarantaine, pas détruite');
  eq(getQuar()[0].payload.scores.m1, 'POISON', 'et son contenu est intact');
}

console.log(failed ? '\n❌ ÉCHEC' : '\n✅ Toutes les règles de durabilité sont respectées');
process.exit(failed ? 1 : 0);
