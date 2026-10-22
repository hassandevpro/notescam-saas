// LA PASTILLE D'UNE LIGNE MAISON — pourquoi ce test existe.
//
// « Compétences du primaire → Ajouter » échouait TOUJOURS, en LAN comme au
// Cloud : `addRefLigne` envoyait `code: null`, et `prim_competences.code` est
// NOT NULL des deux côtés (schéma LAN `server/schema.sql`, schéma Cloud
// `supabase_apc_primaire.sql`, vérifié aussi sur la base de production). L'école
// voyait « ajout refusé » sans que rien n'explique quoi.
//
// `codeMaison` comble ce trou. Ce qu'il doit tenir :
//   • ne JAMAIS rendre vide — c'est toute la raison d'être de la fonction ;
//   • ne jamais ressembler à un code du ministère (1A…6B commencent par un
//     chiffre) : sinon l'école croirait lire une ligne officielle ;
//   • ne pas répéter une pastille déjà posée dans la même liste.
//
// Lancer :
//   node --experimental-loader ./src/lib/_referentielEcole.hooks.mjs src/lib/_referentielEcole.test.mjs
import { codeMaison, idMaison, withLibelles, addMatiereMaisonApc } from './referentielEcole.js';

let pass = 0, fail = 0;
const ok = (c, label, got) => {
  if (c) { console.log(`✅ ${label}`); pass++; }
  else { console.log(`❌ ${label} (obtenu: ${JSON.stringify(got)})`); fail++; }
};
const titre = (t) => console.log(`
-- ${t} --`);

// ── Un code sort TOUJOURS, quelle que soit l'entrée ─────────────────────────
for (const libelle of ['Lecture à haute voix', 'écriture', '   ', '', null, undefined, '???', '12']) {
  const c = codeMaison(libelle);
  ok(typeof c === 'string' && c.length > 0, `un code non vide pour ${JSON.stringify(libelle)}`, c);
}

// ── Il vient des initiales, en majuscules, sans accent ──────────────────────
ok(codeMaison('Lecture à haute voix') === 'LAH', 'initiales des trois premiers mots', codeMaison('Lecture à haute voix'));
ok(codeMaison('Éveil musical') === 'EM', 'les accents sont dépliés', codeMaison('Éveil musical'));
ok(codeMaison('Lecture') === 'LE', 'un seul mot : deux premières lettres', codeMaison('Lecture'));
ok(codeMaison('   ') === 'EC', 'libellé vide : repli « EC »', codeMaison('   '));

// ── Jamais confondu avec un code du ministère ───────────────────────────────
const MINISTERE = ['1A', '1B', '1C', '2A', '2B', '3A', '3B', '4A', '5A', '6A', '6B'];
const essais = ['Lecture', '1re approche du calcul', '2 roues', 'Éveil', 'Pratiquer le sport'];
ok(essais.every((l) => !MINISTERE.includes(codeMaison(l))),
  'aucun libellé ne produit un code officiel', essais.map((l) => codeMaison(l)));
ok(essais.every((l) => !/^[0-9]/.test(codeMaison(l))),
  'un code maison ne commence jamais par un chiffre', essais.map((l) => codeMaison(l)));

// ── Pas deux fois la même pastille dans la même liste ───────────────────────
ok(codeMaison('Lecture', ['LE']) === 'LE2', 'pastille déjà prise : suffixe 2', codeMaison('Lecture', ['LE']));
ok(codeMaison('Lecture', ['LE', 'LE2']) === 'LE3', 'puis 3', codeMaison('Lecture', ['LE', 'LE2']));
ok(codeMaison('Lecture', ['le']) === 'LE2', 'la casse ne trompe pas la comparaison', codeMaison('Lecture', ['le']));
ok(codeMaison('Lecture', [null, undefined, '']) === 'LE',
  'les lignes sans code ne bloquent rien', codeMaison('Lecture', [null, undefined, '']));

// Une liste entière de lignes maison : autant de pastilles distinctes.
const noms = ['Lecture', 'Lecture', 'Lecture', 'Écriture'];
const codes = [];
for (const n of noms) codes.push(codeMaison(n, codes));
ok(new Set(codes).size === codes.length, 'quatre ajouts, quatre pastilles distinctes', codes);

// ── idMaison, le garde-fou voisin (il nomme la ligne, pas sa pastille) ──────
const ECOLE = 'b0000000-0000-4000-8000-0000000000b1';
ok(idMaison(ECOLE, 'Lecture à haute voix') === 'ec_b00000000000_lecture_a_haute_voix',
  'idMaison : préfixe école + slug du libellé', idMaison(ECOLE, 'Lecture à haute voix'));
ok(idMaison(ECOLE, '') === 'ec_b00000000000_item', 'idMaison : libellé vide reste nommable', idMaison(ECOLE, ''));
ok(idMaison(ECOLE, 'x') !== idMaison('c0000000-0000-4000-8000-0000000000c1', 'x'),
  'deux écoles ne se heurtent pas sur le même libellé', idMaison(ECOLE, 'x'));

// ── RETIRER ET RENOMMER DOIVENT VALOIR DANS L'ÉCRAN DE SAISIE ──────────────
// L'écran de saisie du primaire affichait la liste nationale brute : une
// compétence « retirée » restait une colonne à remplir, et le libellé de
// l'école n'apparaissait pas. Les deux gestes sont la composition exacte que
// `PrimCompetenceWorkspace` applique désormais, et que l'APC et la maternelle
// appliquaient déjà. On la teste ici sur les fonctions réelles.
const NATIONAL = [
  { id: '1a', code: '1A', intitule: 'Communiquer en français' },
  { id: '2a', code: '2A', intitule: 'Utiliser les notions de base en mathématiques' },
  { id: '6b', code: '6B', intitule: 'Pratiquer les activités artistiques' },
];
const vue = (masques, libelles) => withLibelles(NATIONAL.filter((c) => !(masques || []).includes(c.id)), libelles);

ok(vue([], {}).length === 3, 'sans masque ni renommage, la liste est intacte', vue([], {}).length);
ok(vue(['2a'], {}).map((c) => c.id).join(',') === '1a,6b',
  'une compétence RETIRÉE disparaît de la saisie', vue(['2a'], {}).map((c) => c.id));
ok(vue(['1a', '2a', '6b'], {}).length === 0, 'tout retirer ne laisse rien', vue(['1a', '2a', '6b'], {}).length);
ok(vue([], { '1a': 'Communiquer en langue française' })[0].intitule === 'Communiquer en langue française',
  'une compétence RENOMMÉE porte le libellé de l’école', vue([], { '1a': 'X' })[0]);
ok(vue([], { '1a': 'Notre mot' })[0]._override === true,
  'la surcharge est marquée, pour qu’aucune relocalisation ne l’écrase', vue([], { '1a': 'Notre mot' })[0]);
ok(vue([], { '1a': 'Notre mot' })[1].intitule === NATIONAL[1].intitule,
  'renommer l’une ne touche pas les autres', vue([], { '1a': 'Notre mot' })[1].intitule);
ok(vue(['1a'], { '1a': 'Notre mot' }).length === 2,
  'retirée ET renommée : elle reste retirée', vue(['1a'], { '1a': 'Notre mot' }).map((c) => c.id));
ok(NATIONAL[0].intitule === 'Communiquer en français',
  'le référentiel du ministère n’est jamais modifié en place', NATIONAL[0].intitule);


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


console.log(fail ? `\n❌ ${fail} échec(s) sur ${pass + fail}` : `\n✅ Pastille, id et périmètre d'une ligne maison : tout passe (${pass})`);
process.exit(fail ? 1 : 0);
