// UNE MATIÈRE COCHÉE DANS LA CLASSE DOIT ÊTRE SAISISSABLE
//
// ── CE QUE CE TEST EMPÊCHE DE REVENIR ───────────────────────────────────────
//
// Signalement du 2026-10-22 : « les matières créées sont différentes des
// matières disponibles dans la liste déroulante pour ajouter les notes ».
//
// Relevé le même jour sur la 5ème de BRIGHT CONTINENT : 14 matières cochées,
// dont SIX impossibles à noter — Espagnol, Etude de texte, Expression Écrite,
// Expression Orale, Informatique Pratique, SVTEEHB. Et sur THE GENIUS, Chinois
// en 5eme comme en 6eme. Au total 12 classes de 6 écoles.
//
// Les cas ci-dessous sont RELEVÉS EN PRODUCTION, pas inventés.
//
//   node src/core/_apcRattrapage.test.mjs
import { readFileSync } from 'node:fs';
import { manquesPourClasse } from './apcRattrapage.js';

let pass = 0, fail = 0;
const ok = (c, label, got) => {
  if (c) { pass++; console.log(`✅ ${label}`); }
  else { fail++; console.log(`❌ ${label}${got === undefined ? '' : `  (obtenu: ${JSON.stringify(got)})`}`); }
};
const titre = (t) => console.log(`\n-- ${t} --`);

// Catalogue national APC, tel qu'il est en base : les langues optionnelles et
// SVTEEHB n'existent QU'EN 4e/3e ; le 6e/5e a « Sciences ».
const MATIERES = [
  { id: 'francais', nom: 'Français' }, { id: 'anglais', nom: 'Anglais' },
  { id: 'mathematiques', nom: 'Mathématiques' }, { id: 'informatique', nom: 'Informatique' },
  { id: 'histoire', nom: 'Histoire' }, { id: 'geographie', nom: 'Géographie' },
  { id: 'ecm', nom: 'Education à la Citoyenneté et à la Morale' },
  { id: 'eps', nom: 'EPS' }, { id: 'sciences', nom: 'Sciences' },
  { id: 'svteehb', nom: 'SVTEEHB' }, { id: 'pct', nom: 'PCT' },
  { id: 'espagnol', nom: 'Espagnol' }, { id: 'chinois', nom: 'Chinois' },
  // Matières MAISON de l'école, créées depuis une autre classe.
  { id: 'ec_x_etude', nom: 'Etude de texte', school_id: 'E' },
  { id: 'ec_x_orale', nom: 'Expression Orale', school_id: 'E' },
  // Celles-ci sont nées en 4ème — relevé en base : chaque matière maison n'est
  // attachée qu'au seul niveau où on l'a créée.
  { id: 'ec_x_ecrite', nom: 'Expression Ecrite', school_id: 'E' },
  { id: 'ec_x_infopra', nom: 'Informatique Pratique', school_id: 'E' },
];
const RATTACHEMENTS = [
  // 6e et 5e : le tronc commun seulement.
  ...['francais', 'anglais', 'mathematiques', 'informatique', 'histoire', 'geographie', 'ecm', 'eps', 'sciences']
    .flatMap((id) => [{ classe_id: '6e', matiere_id: id }, { classe_id: '5e', matiere_id: id }]),
  // 4e et 3e : plus les langues optionnelles, PCT et SVTEEHB.
  ...['francais', 'anglais', 'mathematiques', 'informatique', 'histoire', 'geographie', 'ecm', 'eps',
    'svteehb', 'pct', 'espagnol', 'chinois']
    .flatMap((id) => [{ classe_id: '4e', matiere_id: id }, { classe_id: '3e', matiere_id: id }]),
  // Les matières maison sont nées en 3ème : elles n'existent qu'à ce niveau.
  { classe_id: '3e', matiere_id: 'ec_x_etude' },
  { classe_id: '3e', matiere_id: 'ec_x_orale' },
  { classe_id: '4e', matiere_id: 'ec_x_ecrite' },
  { classe_id: '4e', matiere_id: 'ec_x_infopra' },
];
const sujet = (name, i) => ({ id: `s${i}`, name, class_id: 'C' });
const manques = (noms, classeId) => manquesPourClasse({
  subjects: noms.map(sujet), matieres: MATIERES, classeMatieres: RATTACHEMENTS, classeId,
});

titre('BRIGHT CONTINENT 5ème — le cas signalé');
{
  // Les 14 matières cochées, relevées en base le 2026-10-22.
  const { creer, rattacher } = manques([
    'Anglais', 'Éducation Civique', 'EPS', 'Espagnol', 'Etude de texte',
    'Expression Ecrite', 'Expression Orale', 'Géographie', 'Histoire',
    'Informatique', 'Informatique Pratique', 'Mathématiques', 'SVTEEHB', 'Travaux Pratiques',
  ], '5e');

  const aRattacher = [...rattacher.keys()].sort();
  ok(aRattacher.includes('espagnol'), 'Espagnol est RATTACHÉ à la 5ème (il n’existait qu’en 4e/3e)', aRattacher);
  ok(aRattacher.includes('svteehb'), 'SVTEEHB aussi', aRattacher);
  ok(aRattacher.includes('ec_x_etude'), '« Etude de texte », née en 3ème, est rattachée à la 5ème', aRattacher);
  ok(aRattacher.includes('ec_x_orale'), '« Expression Orale » aussi', aRattacher);

  // ON NE CRÉE JAMAIS CE QUI EXISTE : ce serait le doublon qu'on retire par
  // ailleurs. Espagnol national reste UNE seule matière.
  const aCreer = creer.map((s) => s.name).sort();
  ok(!aCreer.includes('Espagnol'), 'Espagnol n’est PAS recréé en matière maison', aCreer);
  ok(!aCreer.includes('Etude de texte'), '« Etude de texte » n’est pas recréée non plus', aCreer);

  // Ce qui n'existe nulle part est bien créé.
  ok(aRattacher.includes('ec_x_ecrite') && aRattacher.includes('ec_x_infopra'),
    '« Expression Écrite » et « Informatique Pratique », nées en 4ème, sont rattachées', aRattacher);
  ok(aCreer.length === 1 && aCreer[0] === 'Travaux Pratiques',
    'seul le nom VRAIMENT inconnu du référentiel est créé', aCreer);

  // Et ce qui marchait déjà n'est pas touché.
  ok(!aRattacher.includes('anglais') && !aRattacher.includes('mathematiques'),
    'les matières déjà rattachées sont laissées tranquilles', aRattacher);
  ok(!aCreer.includes('Anglais'), 'ni recréées', aCreer);
}

titre('THE GENIUS 5eme et 6eme — Chinois');
{
  for (const niveau of ['5e', '6e']) {
    const { creer, rattacher } = manques(['Mathématiques', 'Chinois'], niveau);
    ok(rattacher.has('chinois'), `Chinois est rattaché à la ${niveau}`, [...rattacher.keys()]);
    ok(!creer.length, `et rien n’est créé en ${niveau}`, creer.map((s) => s.name));
  }
}

titre('Une classe dont tout est déjà rattaché ne déclenche rien');
{
  const { creer, rattacher } = manques(['Anglais', 'Mathématiques', 'Histoire', 'EPS'], '5e');
  ok(creer.length === 0 && rattacher.size === 0, 'aucun geste — c’est le cas normal',
    { creer: creer.length, rattacher: rattacher.size });
}

titre('Les alias font foi, comme à l’affichage');
{
  // « SVT » désigne SVTEEHB : il ne doit SURTOUT pas devenir une matière maison
  // « SVT » à côté de la nationale.
  const { creer, rattacher } = manques(['SVT'], '5e');
  ok(rattacher.has('svteehb'), '« SVT » rattache SVTEEHB', [...rattacher.keys()]);
  ok(!creer.length, 'et ne crée pas une matière « SVT »', creer.map((s) => s.name));

  // Une ligne locale qui couvre DEUX matières officielles les rattache toutes
  // les deux — c'est légitime, « Histoire-Géo » est une seule ligne pour deux.
  const hg = manquesPourClasse({
    subjects: [sujet('Histoire-Géographie', 1)], matieres: MATIERES,
    classeMatieres: [], classeId: '5e',
  });
  ok(hg.rattacher.has('histoire') && hg.rattacher.has('geographie'),
    '« Histoire-Géographie » en rattache deux', [...hg.rattacher.keys()]);
}

titre('Deux lignes locales pour la même matière ne rattachent qu’une fois');
{
  const { rattacher } = manques(['Espagnol', 'espagnol'], '5e');
  ok(rattacher.size === 1, 'un seul rattachement', [...rattacher.keys()]);
}

titre('Cas limites : on ne décide rien sans de quoi décider');
{
  ok(manques([], '5e').creer.length === 0, 'aucune matière cochée : rien à faire');
  const sansNiveau = manquesPourClasse({
    subjects: [sujet('Espagnol', 1)], matieres: MATIERES, classeMatieres: RATTACHEMENTS, classeId: null,
  });
  ok(sansNiveau.creer.length === 0 && sansNiveau.rattacher.size === 0,
    'niveau inconnu : aucun geste, plutôt qu’un geste au hasard');
  const sansRef = manquesPourClasse({
    subjects: [sujet('Espagnol', 1)], matieres: [], classeMatieres: [], classeId: '5e',
  });
  ok(sansRef.creer.length === 1 && sansRef.rattacher.size === 0,
    'référentiel vide : rien à rattacher, la matière est à créer');
}

// ── LE CALCUL DOIT ÊTRE CELUI QUI DÉCLENCHE ───────────────────────────────
//
// CE QUE CE CONTRÔLE EMPÊCHE DE REVENIR, et c'est arrivé le 2026-10-22 : la
// correction du rattachement était en place dans le magasin et ne partait
// JAMAIS. L'écran déclenchait le rattrapage sur `matieresHorsReferentiel`, qui
// ne compte que les noms ne correspondant À RIEN — donc zéro pour « Espagnol »
// ou « Etude de texte ». Du dehors : « rien ne change ».
//
// La règle que l'on fige : le déclencheur pose la MÊME question que le
// rattrapage, avec la MÊME fonction.
titre('L’écran déclenche sur le vrai manque, pas sur un sous-ensemble');
{
  const src = readFileSync(new URL('../components/grades/ApcCompetenceWorkspace.jsx', import.meta.url), 'utf8');
  ok(/manquesPourClasse/.test(src), 'l’écran utilise manquesPourClasse');
  ok(/const aRattraper = manques\.creer\.length \+ manques\.rattacher\.size;/.test(src),
    'il compte les DEUX manques : à créer ET à rattacher');
  ok(/if \(!selectedClass \|\| !referentiel \|\| !aRattraper\) return;/.test(src),
    'et c’est ce total qui garde le rattrapage');
  ok(!/!matieresHorsReferentiel\.length\) return;/.test(src),
    'le garde-fou ne repose plus sur les seuls noms inconnus (c’était le défaut)');
}


console.log(`\n${fail ? '❌' : '✅'} Rattrapage des matières de classe : ${pass} contrôle(s) ok, ${fail} ko`);
process.exitCode = fail ? 1 : 0;
