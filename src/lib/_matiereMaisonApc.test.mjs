// UNE MATIÈRE MAISON EN PREMIER CYCLE APC — pourquoi ce test existe.
//
// Signalé par le responsable : « quand je crée une matière ça ne s'affiche pas
// pour mettre la note et sur le bulletin », puis la règle : « laisse toutes les
// matières apparaître tant qu'elles sont créées et cochées ».
//
// Une école en moteur OFFICIEL lit son RÉFÉRENTIEL, pas ses lignes `subjects`.
// Le premier cycle était le seul cycle sans échappatoire : `apc_competences`
// porte un `school_id`, mais son `matiere_id` est une clé étrangère vers
// `apc_matieres`, qui n'en avait pas. Une école pouvait ajouter une compétence
// DANS une matière nationale, jamais une MATIÈRE.
//
// Lancer :
//   node --experimental-loader ./src/lib/_matiereMaisonApc.hooks.mjs src/lib/_matiereMaisonApc.test.mjs
import { addMatiereMaisonApc } from './referentielEcole.js';

let pass = 0, fail = 0;
const ok = (c, label, got) => {
  if (c) { pass++; console.log(`✅ ${label}`); }
  else { fail++; console.log(`❌ ${label}` + (got === undefined ? '' : `  (obtenu: ${JSON.stringify(got)})`)); }
};
const titre = (t) => console.log(`
-- ${t} --`);

// ── UNE MATIÈRE MAISON EN PREMIER CYCLE APC ────────────────────────────────
//
// Signalé par le responsable : « quand je crée une matière ça ne s'affiche pas
// pour mettre la note et sur le bulletin ». Sur une école en moteur OFFICIEL,
// les écrans lisent le RÉFÉRENTIEL, pas `subjects` : une matière créée dans
// « Modifier la classe » n'existait donc nulle part. Le premier cycle était le
// seul cycle sans échappatoire, `apc_matieres` n'ayant pas de `school_id`.
//
// CE QUE CE TEST PROTÈGE SURTOUT : les TROIS lignes. Poser la matière sans la
// rattacher à la classe, ou sans compétence, la laisse INVISIBLE — l'écran de
// saisie ne propose que les matières ayant au moins une compétence pour le
// trimestre affiché. Ce serait exactement le défaut qu'on répare, en pire :
// créée, et introuvable.
titre('addMatiereMaisonApc : les trois lignes, et le school_id partout');
{
  globalThis.__ecrits = []; globalThis.__refus = {};
  let n = 0;
  const r = await addMatiereMaisonApc({
    schoolId: 'ecole-1', nom: 'Langue Turc', classeId: '6e',
    trimestres: ['t1', 't2', 't3'], versionId: 'v1', makeId: () => `id${++n}`,
  });
  ok(!r.error, 'la creation aboutit', r.error);

  const tables = globalThis.__ecrits.map((e) => e.table);
  ok(tables.join(',') === 'apc_matieres,apc_classe_matieres,apc_competences',
    'les trois tables sont ecrites, dans cet ordre', tables);

  const mat = globalThis.__ecrits[0].rows[0];
  ok(mat.nom === 'Langue Turc', 'la matiere porte le libelle saisi', mat.nom);
  ok(mat.school_id === 'ecole-1',
    'school_id RENSEIGNE : sans lui la RLS refuse (ce serait une ligne nationale)', mat.school_id);

  const rat = globalThis.__ecrits[1].rows[0];
  ok(rat.classe_id === '6e' && rat.matiere_id === mat.id,
    'le rattachement lie la matiere a la classe', rat);
  ok(rat.school_id === 'ecole-1', 'le rattachement porte aussi son school_id', rat.school_id);

  const comps = globalThis.__ecrits[2].rows;
  ok(comps.length === 3, 'UNE competence par trimestre — sans elles, matiere invisible', comps.length);
  ok(comps.map((c) => c.trimestre_id).join(',') === 't1,t2,t3', 'les trois trimestres', comps.map((c) => c.trimestre_id));
  ok(comps.every((c) => c.matiere_id === mat.id), 'toutes rattachees a la matiere creee');
  ok(comps.every((c) => c.school_id === 'ecole-1'), 'toutes avec le school_id');
  ok(comps.every((c) => c.actif === true), 'actives, sinon fetchReferentiel les ignore');
  ok(comps.every((c) => c.referentiel_version_id === 'v1'),
    'rattachees a la version ACTIVE, sinon fetchReferentiel les filtre', comps[0].referentiel_version_id);
  ok(new Set(comps.map((c) => c.id)).size === 3, 'trois ids distincts');
}

titre('addMatiereMaisonApc : un refus de la base n ecrit pas a moitie');
{
  globalThis.__ecrits = []; globalThis.__refus = { apc_matieres: true };
  const r = await addMatiereMaisonApc({
    schoolId: 'ecole-1', nom: 'X', classeId: '6e', trimestres: ['t1'], makeId: () => 'id1' });
  ok(r.error === 'matiere', 'le refus est remonte', r.error);
  ok(globalThis.__ecrits.length === 0, 'et rien d autre n est ecrit', globalThis.__ecrits.length);

  globalThis.__ecrits = []; globalThis.__refus = { apc_classe_matieres: true };
  const r2 = await addMatiereMaisonApc({
    schoolId: 'ecole-1', nom: 'X', classeId: '6e', trimestres: ['t1'], makeId: () => 'id1' });
  ok(r2.error === 'rattachement', 'refus sur le rattachement', r2.error);
  ok(globalThis.__ecrits.map((e) => e.table).join(',') === 'apc_matieres',
    'la matiere etait deja posee, on ne va pas plus loin', globalThis.__ecrits.map((e) => e.table));
}

titre('addMatiereMaisonApc : parametres manquants -> AUCUNE ecriture');
{
  const cas = [
    [{ schoolId: '', nom: 'X', classeId: '6e', trimestres: ['t1'] }, 'sans ecole'],
    [{ schoolId: 'e', nom: '', classeId: '6e', trimestres: ['t1'] }, 'sans nom'],
    [{ schoolId: 'e', nom: '   ', classeId: '6e', trimestres: ['t1'] }, 'nom blanc'],
    [{ schoolId: 'e', nom: 'X', classeId: '', trimestres: ['t1'] }, 'sans classe'],
    [{ schoolId: 'e', nom: 'X', classeId: '6e', trimestres: [] }, 'sans trimestre'],
  ];
  for (const [args, libelle] of cas) {
    globalThis.__ecrits = []; globalThis.__refus = {};
    const r = await addMatiereMaisonApc({ ...args, makeId: () => 'id1' });
    ok(!!r.error && globalThis.__ecrits.length === 0,
      `${libelle} -> refuse, et aucune ecriture`, { error: r.error, ecrits: globalThis.__ecrits.length });
  }
}


// ── LE DOUBLON NE DOIT PLUS ÊTRE POSSIBLE ──────────────────────────────────
//
// RELEVÉ EN PRODUCTION le 2026-10-21, BRIGHT CONTINENT : 19 lignes maison pour
// 10 noms. « Langue Turc » en trois exemplaires, et SIX notes saisies sur deux
// exemplaires différents — les mêmes six élèves, les mêmes six valeurs, à une
// heure d'intervalle, parce que l'écran montrait l'autre copie après
// rechargement.
//
// La cause : un identifiant tiré AU HASARD à chaque appel, et un garde-fou qui
// ne consultait que le cache du navigateur. Chaque poste au cache en retard
// recréait la matière. Les deux contrôles ci-dessous sont la réparation.
titre('le doublon est impossible : identifiant deterministe');
{
  globalThis.__ecrits = []; globalThis.__refus = {}; globalThis.__existant = {};
  const a = await addMatiereMaisonApc({
    schoolId: 'ecole-1', nom: 'Langue Turc', classeId: '6e', trimestres: ['t1', 't2', 't3'],
  });
  globalThis.__ecrits = [];
  const b = await addMatiereMaisonApc({
    schoolId: 'ecole-1', nom: 'Langue Turc', classeId: '6e', trimestres: ['t1', 't2', 't3'],
  });
  ok(a.matiere.id === b.matiere.id,
    'deux appels, le MEME identifiant de matiere — donc un upsert, pas une 2e ligne',
    [a.matiere.id, b.matiere.id]);
  ok(a.competences.map((c) => c.id).join(',') === b.competences.map((c) => c.id).join(','),
    'et les MEMES identifiants de competences');
  // Un poste différent, même sans cache : mêmes entrées, même résultat.
  const c = await addMatiereMaisonApc({
    schoolId: 'ecole-1', nom: 'langue  turc', classeId: '6e', trimestres: ['t1', 't2', 't3'],
  });
  ok(c.matiere.id === a.matiere.id,
    'la casse et les espaces en trop ne fabriquent pas une matiere de plus', c.matiere.id);
  // Une autre école, ou un autre nom, reste bien distinct.
  const d = await addMatiereMaisonApc({
    schoolId: 'ecole-2', nom: 'Langue Turc', classeId: '6e', trimestres: ['t1'],
  });
  ok(d.matiere.id !== a.matiere.id, 'une autre ecole a sa propre ligne', d.matiere.id);
}

titre('une matiere deja en base est REUTILISEE, jamais doublee');
{
  // Le cas réel : la ligne existe déjà avec un identifiant tiré au hasard (celles
  // que la production porte aujourd'hui). On doit s'y RACCROCHER — sinon les
  // notes déjà saisies dessus seraient orphelines.
  globalThis.__ecrits = []; globalThis.__refus = {};
  globalThis.__existant = {
    apc_matieres: [{ id: '1955b0c8-0040-4e07-aa0e-7e222d357eeb', nom: 'Langue Turc', school_id: 'ecole-1' }],
  };
  const r = await addMatiereMaisonApc({
    schoolId: 'ecole-1', nom: 'Langue Turc', classeId: '3e', trimestres: ['t1', 't2', 't3'],
  });
  ok(!r.error, 'la creation aboutit', r.error);
  ok(r.reutilisee === true, 'la ligne existante est reconnue comme telle');
  ok(r.matiere.id === '1955b0c8-0040-4e07-aa0e-7e222d357eeb',
    'on garde SON identifiant : les notes deja saisies restent rattachees', r.matiere.id);
  const tables = globalThis.__ecrits.map((e) => e.table);
  ok(!tables.includes('apc_matieres'),
    'et on ne reecrit PAS apc_matieres : aucune ligne de plus', tables);
  ok(globalThis.__ecrits[0].rows[0].matiere_id === '1955b0c8-0040-4e07-aa0e-7e222d357eeb',
    'le rattachement pointe vers la ligne existante');
  ok(r.competences.every((c) => c.matiere_id === '1955b0c8-0040-4e07-aa0e-7e222d357eeb'),
    'les competences aussi');
  // Même chose avec une écriture différente du nom.
  globalThis.__ecrits = [];
  const r2 = await addMatiereMaisonApc({
    schoolId: 'ecole-1', nom: 'LANGUE TURC', classeId: '3e', trimestres: ['t1'],
  });
  ok(r2.reutilisee === true && r2.matiere.id === '1955b0c8-0040-4e07-aa0e-7e222d357eeb',
    'la casse differente se raccroche aussi a la ligne existante', r2.matiere.id);
}

titre('une lecture impossible ne doit RIEN ecrire');
{
  // Si on ne peut pas savoir ce que la base contient, créer serait jouer à
  // pile ou face avec un doublon. On s'abstient.
  globalThis.__ecrits = []; globalThis.__refus = {}; globalThis.__existant = {};
  globalThis.__refusLecture = { apc_matieres: true };
  const r = await addMatiereMaisonApc({
    schoolId: 'ecole-1', nom: 'Langue Turc', classeId: '6e', trimestres: ['t1'],
  });
  globalThis.__refusLecture = {};
  ok(r.error === 'lecture', 'la lecture refusee est signalee', r.error);
  ok(globalThis.__ecrits.length === 0, 'et aucune ecriture n a eu lieu', globalThis.__ecrits.length);
}

console.log(fail ? `
❌ ${fail} échec(s) sur ${pass + fail}` : `
✅ Matière maison APC : tout passe (${pass})`);
process.exit(fail ? 1 : 0);
