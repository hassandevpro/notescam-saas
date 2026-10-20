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


console.log(fail ? `
❌ ${fail} échec(s) sur ${pass + fail}` : `
✅ Matière maison APC : tout passe (${pass})`);
process.exit(fail ? 1 : 0);
