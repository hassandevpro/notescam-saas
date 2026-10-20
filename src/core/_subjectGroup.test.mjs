// « JE CHOISIS LANGUE ET LE BULLETIN RANGE EN AUTRES MATIERES »
//
// Defaut rapporte : une matiere « Espagnol » creee avec le classement
// « Langue » s'imprimait sous AUTRES MATIERES. L'ecole POSE un classement
// (`subjects.category`) ; l'emploi du temps l'honorait depuis toujours, le
// bulletin ne l'a jamais lu : il rangeait par une heuristique sur le NOM.
// Le menu « Classement » n'avait donc aucun effet sur le document qui sort de
// l'etablissement.
//
// Ce test tient DEUX choses : le choix de l'ecole passe devant, et le repli par
// le nom ne perd rien de ce qu'il classait deja.
import {
  APC_GROUPS, APC_GROUP_KEYS, subjectGroupKey, subjectGroupFromName, groupSubjects,
} from './subjectGroup.js';
// Les noms OFFICIELS du referentiel MINESEC, pour l audit : aucun ne doit
// tomber dans le fourre-tout « AUTRES MATIERES ».
import { APC_MATIERE_EN } from './referentielI18n.js';

let echecs = 0;
const ok = (cond, libelle, obtenu) => {
  if (cond) console.log(`OK   ${libelle}`);
  else { console.log(`KO   ${libelle} (obtenu: ${JSON.stringify(obtenu)})`); echecs++; }
};
const titre = (s) => console.log(`\n-- ${s} --`);

titre('LE DEFAUT RAPPORTE : Espagnol classe en Langue');
{
  // Le cas exact, sous les noms qu'une ecole ecrit reellement.
  for (const nom of ['Espagnol', 'Español', 'Esp', 'ESP', 'LV2', 'Espanol']) {
    const g = subjectGroupKey({ name: nom, category: 'langues' });
    ok(g === 'LANGUES', `« ${nom} » classe en Langue -> LANGUES`, g);
  }
  // Et le nom le plus exotique possible : le classement doit suffire.
  ok(subjectGroupKey({ name: 'LMC', category: 'langues' }) === 'LANGUES',
    'un nom que AUCUNE liste de mots-cles ne connait suit quand meme son classement');
}

titre('Le classement choisi decide, pour les cinq familles');
{
  const cas = [
    ['langues', 'LANGUES'],
    ['sciences', 'SCIENCES_EXACTES'],
    ['informatique', 'SCIENCES_EXACTES'],
    ['eps', 'ARTS_SPORTS'],
    ['autre', 'AUTRES'],
  ];
  for (const [cat, attendu] of cas) {
    const g = subjectGroupKey({ name: 'Zzz Inconnue', category: cat });
    ok(g === attendu, `classement « ${cat} » -> ${attendu}`, g);
  }
  // Le choix PRIME sur le nom, meme quand le nom dit autre chose. Une ecole qui
  // range « Mathematiques » en Autre doit l'obtenir : c'est sa decision.
  ok(subjectGroupKey({ name: 'Mathematiques', category: 'autre' }) === 'AUTRES',
    'le choix prime sur le nom, meme a contre-courant');
  ok(subjectGroupKey({ name: 'Zumba', category: 'eps' }) === 'ARTS_SPORTS',
    'une matiere maison rangee en EPS tombe avec les sports');
}

titre('« Litteraire » est le seul cas ambigu : le nom tranche');
{
  // Dans l'emploi du temps, « litteraire » reunit l'histoire-geo-philo ET les
  // arts (ses mots-cles portent « art », « musique », « dessin »), que le
  // bulletin separe en DEUX groupes. On laisse donc le nom choisir.
  ok(subjectGroupKey({ name: 'Histoire', category: 'litteraire' }) === 'SCIENCES_HUMAINES',
    'Histoire classee litteraire -> sciences humaines');
  ok(subjectGroupKey({ name: 'Musique', category: 'litteraire' }) === 'ARTS_SPORTS',
    'Musique classee litteraire -> arts et sports');
  ok(subjectGroupKey({ name: 'Zzz', category: 'litteraire' }) === 'SCIENCES_HUMAINES',
    'un nom inconnu classe litteraire retombe sur les sciences humaines');
}

titre('Sans classement, le repli par le nom — inchange');
{
  // Ces classements marchaient AVANT ce correctif. Aucun ne doit regresser :
  // unifier les deux tables de mots-cles les aurait fait tomber en AUTRES.
  const attendus = {
    SCIENCES_EXACTES: ['Mathematiques', 'Physique', 'SVT', 'Informatique', 'Technologie', 'Chemistry'],
    LANGUES: ['Francais', 'Anglais', 'Allemand', 'Latin', 'Litterature', 'Spanish'],
    SCIENCES_HUMAINES: ['Histoire', 'Geographie', 'ECM', 'Philosophie', 'Droit', 'Juridique', 'Economie'],
    ARTS_SPORTS: ['EPS', 'Musique', 'Dessin', 'Arts plastiques', 'Fine Arts'],
    AUTRES: ['Zumba'],
  };
  for (const [groupe, noms] of Object.entries(attendus)) {
    for (const nom of noms) {
      const g = subjectGroupFromName(nom);
      ok(g === groupe, `« ${nom} » -> ${groupe}`, g);
    }
  }
}

titre('AUCUNE matiere OFFICIELLE ne doit tomber en AUTRES');
{
  // Audit qui a trouve le vrai fond du probleme : en passant TOUS les noms du
  // referentiel MINESEC dans l heuristique, 20 des 56 tombaient en AUTRES —
  // dont PCT, ECM, EAC et toutes les langues hors des cinq listees. Ce test est
  // la pour qu un nom officiel ne reparte jamais dans le fourre-tout.
  const officiels = [];
  for (const [id, en] of Object.entries(APC_MATIERE_EN)) { officiels.push(id); officiels.push(en); }
  officiels.push('ECM', 'EPS', 'PCT', 'SVTEEHB', 'ESF', 'Travail manuel',
    'Langues nationales', 'Cultures nationales', 'Education artistique');
  const perdus = [...new Set(officiels)].filter((n) => subjectGroupFromName(n) === 'AUTRES');
  ok(perdus.length === 0, `les ${new Set(officiels).size} noms officiels sont tous classes`, perdus);
}

titre('Les manques releves par l audit, un par un');
{
  const cas = [
    // Les SIGLES : ecrits en entier ils passaient, abreges non.
    ['PCT', 'SCIENCES_EXACTES'], ['ECM', 'SCIENCES_HUMAINES'],
    ['EAC', 'ARTS_SPORTS'], ['ESF', 'SCIENCES_HUMAINES'],
    // Les LANGUES au-dela des cinq qui etaient listees.
    ['grec', 'LANGUES'], ['Greek', 'LANGUES'], ['italien', 'LANGUES'],
    ['chinois', 'LANGUES'], ['Chinese', 'LANGUES'], ['portugais', 'LANGUES'],
    ['Cultures nationales', 'LANGUES'], ['National Cultures', 'LANGUES'],
    // Les DEUX fautes d ecriture : `manuelle?` exigeait deux « l », donc
    // « Travail manuel » n a jamais ete reconnu ; `morale` ne pouvait pas
    // reconnaitre l anglais « Moral Education ».
    ['Travail manuel', 'ARTS_SPORTS'], ['Manual Labour', 'ARTS_SPORTS'],
    ['Citizenship and Moral Education', 'SCIENCES_HUMAINES'],
  ];
  for (const [nom, attendu] of cas) {
    const g = subjectGroupFromName(nom);
    ok(g === attendu, `« ${nom} » -> ${attendu}`, g);
  }
  // Les sigles sont bornes : ils ne doivent pas mordre dans un autre mot.
  ok(subjectGroupFromName('Impact social') === 'SCIENCES_HUMAINES',
    'un sigle borne ne se declenche pas au milieu d un mot (pct dans « impact »)',
    subjectGroupFromName('Impact social'));
}

titre('Le repli reconnait enfin l espagnol ecrit a l espagnole');
{
  // La table du bulletin connaissait « espagnol » mais pas « espanol » : un
  // hispanophone qui ecrit « Español » tombait en AUTRES, sans recours.
  ok(subjectGroupFromName('Español') === 'LANGUES', 'Español -> LANGUES');
  ok(subjectGroupFromName('Espanol') === 'LANGUES', 'Espanol -> LANGUES');
  ok(subjectGroupFromName('Esp') === 'LANGUES', 'Esp (mot entier) -> LANGUES');
  // Sans confondre avec l EPS, qui n est pas la meme chose.
  ok(subjectGroupFromName('EPS') === 'ARTS_SPORTS', 'EPS reste dans les sports, pas en langues');
  ok(subjectGroupFromName('Esperance et citoyennete') !== 'LANGUES',
    'un mot qui COMMENCE par esp n est pas pris pour de l espagnol',
    subjectGroupFromName('Esperance et citoyennete'));
}

titre('Donnees abimees : on ne perd pas le classement, et rien ne casse');
{
  ok(subjectGroupKey({ name: 'Mathematiques', category: 'inconnue' }) === 'SCIENCES_EXACTES',
    'un classement inconnu retombe sur le nom, pas sur AUTRES');
  ok(subjectGroupKey({ name: 'Mathematiques', category: '' }) === 'SCIENCES_EXACTES',
    'classement vide = l option « auto » du menu -> le nom');
  ok(subjectGroupKey({ name: 'Mathematiques', category: null }) === 'SCIENCES_EXACTES',
    'classement null -> le nom');
  ok(subjectGroupKey({}) === 'AUTRES', 'ligne sans nom ni classement -> AUTRES, pas une erreur');
  ok(subjectGroupKey(null) === 'AUTRES', 'ligne null -> AUTRES, pas une erreur');
}

titre('groupSubjects : les cinq groupes, dans l ordre d impression');
{
  const g = groupSubjects([
    { id: '1', name: 'Esp', category: 'langues' },
    { id: '2', name: 'Mathematiques' },
    null,
    { id: '3', name: 'Zumba' },
  ]);
  ok(Object.keys(g).join(',') === APC_GROUP_KEYS.join(','),
    'les cinq cles sont presentes, dans l ordre d APC_GROUPS', Object.keys(g));
  ok(g.LANGUES.map((s) => s.id).join() === '1', 'Esp classe en Langue est dans LANGUES', g.LANGUES);
  ok(g.SCIENCES_EXACTES.map((s) => s.id).join() === '2', 'Mathematiques dans les sciences exactes');
  ok(g.AUTRES.map((s) => s.id).join() === '3', 'Zumba dans AUTRES');
  ok(Object.values(g).flat().length === 3, 'la ligne null est ignoree, pas comptee', Object.values(g).flat().length);
  ok(groupSubjects(null) && Object.keys(groupSubjects(null)).length === 5,
    'liste null -> cinq groupes vides, pas une erreur');
  ok(APC_GROUPS.every((x) => x.key && x.label.includes('/')),
    'chaque groupe garde son libelle bilingue « FR / EN »');
}

console.log(echecs ? `\n${echecs} ECHEC(S)` : '\nTOUT OK');
process.exit(echecs ? 1 : 0);
