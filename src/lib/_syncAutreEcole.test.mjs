// UNE ÉCRITURE D'UN AUTRE ÉTABLISSEMENT N'EST PAS UN REFUS DU SERVEUR
//
// ── CE QUE CE TEST EMPÊCHE DE REVENIR ───────────────────────────────────────
//
// Relevé le 2026-10-24. Le responsable a vu, en haut de l'écran :
//
//     subjects · upsert   new row violates row-level security policy
//     classes · upsert    new row violates row-level security policy
//     saisies bloquées · 2 élément(s)
//     « Refusées de façon répétée par le serveur. »
//
// alors que la classe qu'il venait de créer était, elle, bien arrivée au
// serveur (vérifié en base : « Terminale C », 13 matières, le même jour).
//
// LA CAUSE. La file de poussée est propre au NAVIGATEUR, pas à l'établissement.
// Sur un poste où les comptes se succèdent — école de démonstration, école
// réelle, compte de test — les écritures restées en file appartiennent encore à
// l'école PRÉCÉDENTE. La RLS les refuse, et elle a raison : la session en cours
// n'a aucun droit sur cette école. Elles étaient pourtant rejouées jusqu'à
// épuisement des tentatives, puis annoncées comme « refusées de façon répétée
// par le serveur » — ce qui fait craindre une perte là où il n'y a qu'un mauvais
// interlocuteur, et conduit à ressaisir.
//
// LA RÈGLE CARDINALE DU MODULE RESTE ENTIÈRE : rien n'est supprimé. Ces
// écritures sont MISES DE CÔTÉ et repartiront d'elles-mêmes à la prochaine
// session sur leur école.
//
//   node --experimental-loader ./src/lib/_syncBatch.hooks.mjs src/lib/_syncAutreEcole.test.mjs
globalThis.__syncCalls = [];
globalThis.__syncQueue = [];
globalThis.__syncFail = { table: null, rowValue: null };
globalThis.__syncQuarantine = [];

const calls = globalThis.__syncCalls;
const { flushSyncQueue } = await import('./sync.js');

let pass = 0, fail = 0;
const ok = (c, label, got) => {
  if (c) { pass++; console.log(`✅ ${label}`); }
  else { fail++; console.log(`❌ ${label}${got === undefined ? '' : `  (obtenu: ${JSON.stringify(got)})`}`); }
};
const titre = (t) => console.log(`\n-- ${t} --`);

const item = (id, school, table = 'classes') => ({
  id, table, operation: 'upsert',
  payload: { id: `row-${id}`, school_id: school, name: `Objet ${id}` },
});
const reset = (q) => { calls.length = 0; globalThis.__syncQueue = q; };

titre('La file ne rejoue que les écritures de l’école en cours');
{
  reset([item(1, 'ecole-A'), item(2, 'ecole-B'), item(3, 'ecole-A', 'subjects')]);
  const r = await flushSyncQueue({ ecoleCourante: 'ecole-A' });
  ok(r.autreEcole === 1, 'l’écriture de l’autre école est comptée à part', r);
  ok(r.failed === 0, 'et elle n’est PAS comptée comme un échec', r.failed);
  ok(r.synced === 2, 'les deux écritures de l’école en cours sont passées', r.synced);

  const tables = calls.map((c) => c.table).sort();
  ok(tables.join(',') === 'classes,subjects', 'le serveur n’a été appelé que pour l’école en cours', tables);
  ok(calls.every((c) => c.rows === 1),
    'et jamais pour la ligne mise de côté (un seul objet par appel ici)', calls);
}

titre('Rien n’est supprimé : l’écriture mise de côté RESTE en file');
{
  reset([item(1, 'ecole-A'), item(2, 'ecole-B')]);
  await flushSyncQueue({ ecoleCourante: 'ecole-A' });
  const restants = globalThis.__syncQueue;
  ok(restants.length === 1 && restants[0].id === 2,
    'seule l’écriture de l’autre école est encore là', restants.map((x) => x.id));
  ok((restants[0].attempts || 0) === 0,
    'et son compteur de tentatives n’a PAS été entamé — elle ne s’usera pas', restants[0].attempts);
}

titre('De retour sur son école, elle repart seule');
{
  reset([item(2, 'ecole-B')]);
  const r = await flushSyncQueue({ ecoleCourante: 'ecole-B' });
  ok(r.synced === 1 && r.autreEcole === 0, 'elle est poussée sans rien demander à personne', r);
  ok(globalThis.__syncQueue.length === 0, 'et elle sort de la file', globalThis.__syncQueue.length);
}

titre('Sans école fournie, le comportement d’avant est inchangé');
{
  // Le repli compte : un appelant qui ne connaît pas l'école (ou le LAN, où il
  // n'y en a qu'une) ne doit RIEN voir changer.
  reset([item(1, 'ecole-A'), item(2, 'ecole-B')]);
  const r = await flushSyncQueue();
  ok(r.synced === 2 && r.autreEcole === 0, 'tout est rejoué, comme avant', r);
}

titre('Une charge sans school_id est toujours rejouée');
{
  // Référentiel national, tombstone, format ancien : on ne devine pas.
  reset([{ id: 9, table: 'apc_matieres', operation: 'upsert', payload: { id: 'm1', nom: 'Français' } }]);
  const r = await flushSyncQueue({ ecoleCourante: 'ecole-A' });
  ok(r.synced === 1 && r.autreEcole === 0, 'elle part normalement', r);
}

console.log(`\n${pass} réussis, ${fail} échoués`);
process.exit(fail ? 1 : 0);
