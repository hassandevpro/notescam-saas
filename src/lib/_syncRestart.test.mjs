// SURVIE DE LA FILE À UNE COUPURE LONGUE ET À UN REDÉMARRAGE DU NAVIGATEUR.
//
//   node --experimental-loader ./src/lib/_syncBatch.hooks.mjs src/lib/_syncRestart.test.mjs
//
// Ce que ces tests reproduisent, scénario par scénario, c'est la semaine qui a
// coûté des notes à l'école :
//
//   vendredi 17 h   l'enseignant saisit, le serveur est injoignable → en file
//   vendredi 18 h   il ferme le navigateur, éteint le poste
//   samedi, dimanche   rien ; le poste est éteint
//   lundi 7 h 30    il rallume, ouvre NotesCam → l'application démarre avec une
//                   file NON VIDE et vieille de 62 heures
//
// À ce réveil, l'ancien code appelait `pruneExpiredItems()` AVANT la première
// tentative d'envoi : les 62 heures dépassaient le seuil de 48, et la saisie
// était détruite sans avoir jamais été envoyée.
//
// L'ordre des opérations au démarrage est donc une PROPRIÉTÉ DE SÛRETÉ, pas un
// détail d'implémentation. Ces tests la verrouillent.

globalThis.__syncCalls = [];
globalThis.__syncQueue = [];
globalThis.__syncQuarantine = [];
globalThis.__syncFail = { table: null, rowValue: null };

const calls = globalThis.__syncCalls;
const getQueue = () => globalThis.__syncQueue;
const getQuar = () => globalThis.__syncQuarantine;
const setQueue = (q) => { globalThis.__syncQueue = q; };

const { flushSyncQueue, getQueueCount, quarantineUnsendable, exportPendingWrites } =
  await import('./sync.js');

let failed = false;
const ok = (cond, msg) => { console.log(`${cond ? '✅' : '❌'} ${msg}`); if (!cond) failed = true; };
const eq = (a, b, msg) => ok(a === b, `${msg}  (${a} attendu ${b})`);

const HEURE = 60 * 60 * 1000;
const JOUR = 24 * HEURE;

const note = (id, { ageH = 0, eleve = `e${id}`, valeur = '14', attempts } = {}) => ({
  id,
  table: 'grades',
  operation: 'upsert',
  timestamp: Date.now() - ageH * HEURE,
  ...(attempts === undefined ? {} : { attempts }),
  payload: {
    key: `c1_${eleve}_1`, class_id: 'c1', student_id: eleve, sequence: 1,
    school_id: 'sc', scores: { maths: valeur },
  },
});

const reset = () => {
  calls.length = 0;
  globalThis.__syncFail = { table: null, rowValue: null };
  globalThis.__syncQuarantine = [];
};

// Reproduit la séquence de démarrage de l'application (src/App.jsx) :
// on COMPTE, puis on ENVOIE. Rien n'est écarté avant d'avoir essayé.
async function demarrageApplication() {
  const compte = await getQueueCount();
  const r = await flushSyncQueue();
  return { compteAffiche: compte, ...r };
}

// ── 1. LE WEEK-END DE L'ÉCOLE : 62 heures, poste éteint ─────────────────────
{
  reset();
  setQueue([
    note(1, { ageH: 62, eleve: 'e1', valeur: '12' }),
    note(2, { ageH: 62, eleve: 'e2', valeur: '15' }),
    note(3, { ageH: 62, eleve: 'e3', valeur: '09' }),
  ]);

  const r = await demarrageApplication();
  eq(r.compteAffiche, 3, 'au démarrage, les 3 saisies du vendredi sont comptées');
  eq(r.synced, 3, 'elles sont envoyées au serveur, 62 heures plus tard');
  eq(r.failed, 0, 'aucun échec');
  eq(getQueue().length, 0, 'la file est vide, parce que le serveur a confirmé');
  eq(getQuar().length, 0, 'rien n’a été mis de côté');
}

// ── 2. Les vacances : trois semaines, poste éteint ──────────────────────────
// Un trimestre peut se terminer sur un poste qu'on ne rallume qu'à la rentrée.
{
  reset();
  setQueue([note(1, { ageH: 21 * 24 }), note(2, { ageH: 30 * 24 })]);

  const r = await demarrageApplication();
  eq(r.synced, 2, 'une saisie de 30 jours part encore');
  eq(getQueue().length, 0, 'la file se vide normalement');
}

// ── 3. Redémarrages répétés sans réseau : rien ne s'érode ──────────────────
// Le poste est rallumé chaque matin, mais le serveur reste injoignable. La file
// ne doit ni rétrécir, ni vieillir vers sa destruction.
{
  reset();
  globalThis.__syncFail.table = 'grades';     // tout lot échoue
  globalThis.__syncFail.rowValue = '14';      // et chaque ligne aussi
  setQueue([note(1), note(2), note(3), note(4), note(5)]);

  for (let jour = 1; jour <= 10; jour++) {
    const r = await demarrageApplication();
    eq(getQueue().length, 5, `jour ${jour} : les 5 saisies sont toujours là`);
    eq(r.compteAffiche, 5, `jour ${jour} : l’écran annonce bien 5 en attente`);
    if (getQueue().length !== 5) break;
  }

  const tentatives = getQueue().map((i) => i.attempts || 0);
  ok(tentatives.every((n) => n === 10), `chaque saisie a compté ses 10 tentatives  (${tentatives.join(',')})`);
  ok(getQueue().every((i) => i.payload.scores.maths === '14'), 'les notes sont intactes');
}

// ── 4. Le serveur revient : tout part, rien n'a été perdu ──────────────────
// Suite directe du scénario 3 — même file, serveur de nouveau joignable.
{
  globalThis.__syncFail = { table: null, rowValue: null };
  const r = await demarrageApplication();
  eq(r.synced, 5, 'les 5 saisies arrivent enfin, après 10 jours d’échecs');
  eq(getQueue().length, 0, 'la file est vide');
}

// ── 5. Démarrage sur file non vide ET mélangée ─────────────────────────────
// Le cas réel : des saisies neuves, des vieilles, et une que le serveur refuse
// obstinément. Le démarrage ne doit privilégier ni écarter personne.
{
  reset();
  globalThis.__syncFail.rowValue = 'REFUS';
  setQueue([
    note(1, { ageH: 0.1, eleve: 'e1' }),
    note(2, { ageH: 50, eleve: 'e2' }),
    note(3, { ageH: 200, eleve: 'e3', valeur: 'REFUS' }),
    note(4, { ageH: 500, eleve: 'e4' }),
  ]);

  const r = await demarrageApplication();
  eq(r.compteAffiche, 4, 'les 4 saisies sont comptées au démarrage');
  eq(r.synced, 3, '3 passent');
  eq(r.failed, 1, 'la refusée est signalée comme un échec');
  eq(getQueue().length, 1, 'et elle RESTE en file, sans égard pour son âge');
  eq(getQueue()[0].payload.student_id, 'e3', 'c’est bien celle que le serveur refuse');
  eq(getQuar().length, 0, 'rien n’est mis de côté au démarrage');
}

// ── 6. La preuve est disponible dès le démarrage ───────────────────────────
// Un enseignant qui arrive le lundi doit pouvoir produire ce qui n'est pas
// parti, sans attendre une intervention.
{
  const rapport = await exportPendingWrites();
  eq(rapport.counts.queue, 1, 'le rapport voit la saisie bloquée');
  eq(rapport.queue[0].payload.scores.maths, 'REFUS', 'avec son contenu exact');
  ok(typeof rapport.queue[0].last_error === 'string', 'et la raison du blocage');
}

// ── 7. L'écart ne se répare qu'à la demande ───────────────────────────────
{
  reset();
  setQueue([note(9, { ageH: 1000, attempts: 25, valeur: '18' })]);

  const r = await demarrageApplication();
  eq(r.stalled, 1, 'au démarrage, la saisie au plafond est signalée');
  eq(getQueue().length, 1, 'elle reste en file');
  eq(getQuar().length, 0, 'le démarrage ne la met PAS de côté tout seul');

  await quarantineUnsendable();
  eq(getQuar().length, 1, 'il faut une action explicite pour la mettre de côté');
  eq(getQuar()[0].payload.scores.maths, '18', 'et elle y arrive intacte');
}

console.log(failed ? '\n❌ ÉCHEC' : '\n✅ La file survit aux coupures longues et aux redémarrages');
process.exit(failed ? 1 : 0);
