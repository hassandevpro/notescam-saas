// Banc de `classementMaison.js` — un classement décide où une matière
// S'IMPRIME sur le bulletin. Ce qui est éprouvé ici n'est pas du confort.
import {
  FAMILLES_ANCRAGE, nettoyerNom, encoder, decoder, estMaison,
  familleDe, nomDe, classementsEnUsage, retouchesRenommage,
} from './classementMaison.js';

let ko = 0;
const ok = (c, libelle, obtenu) => {
  if (c) { console.log(`✅ ${libelle}`); }
  else { console.log(`❌ ${libelle} (obtenu: ${JSON.stringify(obtenu)})`); ko++; }
};

console.log('— 1. Nettoyage du nom —');
ok(nettoyerNom('  Langues   orientales  ') === 'Langues orientales', 'espaces repliés et rognés');
ok(nettoyerNom('Arts: plastiques') === 'Arts- plastiques',
  'les deux-points deviennent un tiret : ils sont le séparateur de la clé',
  nettoyerNom('Arts: plastiques'));
ok(nettoyerNom(null) === '' && nettoyerNom(undefined) === '', 'absence -> chaîne vide, sans lever');
ok(nettoyerNom('x'.repeat(60)).length === 40, 'un nom est borné à 40 caractères');

console.log('\n— 2. Aller-retour de la clé —');
const id = encoder('langues', 'Langues orientales');
ok(id === 'x:langues:Langues orientales', 'la clé porte le préfixe, la famille et le nom', id);
ok(estMaison(id), 'elle se reconnaît comme maison');
ok(!estMaison('langues') && !estMaison('') && !estMaison(null),
  'un classement officiel, une chaîne vide ou null ne sont PAS des classements maison');
ok(decoder(id).famille === 'langues' && decoder(id).nom === 'Langues orientales', 'et se relit entière');

console.log('\n— 3. Ce que le module REFUSE de fabriquer —');
// Un classement sans famille ne saurait pas où s'imprimer : il retomberait sur
// l'heuristique du nom, c'est-à-dire le défaut que subjectGroup.js a fermé.
ok(encoder('inventee', 'Truc') === null, 'une famille inconnue est refusée, pas acceptée en silence');
ok(encoder('langues', '') === null, 'un nom vide est refusé');
ok(encoder('langues', '   ') === null, 'un nom de seuls espaces est refusé');
ok(FAMILLES_ANCRAGE.every((f) => encoder(f, 'Essai')), 'les six familles officielles sont toutes acceptées');

console.log('\n— 4. Relecture d’une clé abîmée —');
ok(decoder('x:langues') === null, 'une clé tronquée -> null');
ok(decoder('x:inventee:Truc') === null, 'une famille devenue inconnue -> null');
ok(decoder('x:langues:') === null, 'un nom vide -> null');
ok(decoder('langues') === null, 'un classement officiel n’est pas décodé ici');
// Une clé écrite avant le nettoyage pourrait porter des deux-points.
ok(decoder('x:langues:Arts:plastiques')?.nom === 'Arts-plastiques',
  'une ancienne clé à deux-points se relit, nom recollé puis nettoyé',
  decoder('x:langues:Arts:plastiques'));

console.log('\n— 5. Famille et libellé, vus par l’appelant —');
ok(familleDe(id) === 'langues', 'un classement maison rend sa famille d’ancrage');
ok(familleDe('sciences') === 'sciences', 'un classement officiel se rend lui-même : l’appelant ne distingue pas');
ok(familleDe('inconnu') === 'inconnu', 'une valeur inconnue traverse telle quelle — au consommateur de trancher');
ok(nomDe(id) === 'Langues orientales', 'le libellé maison est rendu');
ok(nomDe('sciences') === null, 'un officiel ne rend pas de libellé : c’est au référentiel de le traduire');

console.log('\n— 6. Les classements EN USAGE se déduisent des matières —');
const matieres = [
  { id: 's1', name: 'Chinois',  category: 'x:langues:Langues orientales' },
  { id: 's2', name: 'Japonais', category: 'x:langues:Langues orientales' },
  { id: 's3', name: 'Poterie',  category: 'x:eps:Travaux manuels' },
  { id: 's4', name: 'Maths',    category: 'sciences' },
  { id: 's5', name: 'Dessin',   category: null },
  { id: 's6', name: 'Cassé',    category: 'x:inventee:Fantome' },
];
const usage = classementsEnUsage(matieres);
ok(usage.length === 2, 'deux classements maison seulement', usage.map((u) => u.nom));
ok(usage[0].nom === 'Langues orientales' && usage[1].nom === 'Travaux manuels',
  'triés par nom', usage.map((u) => u.nom));
ok(usage[0].matieres === 2, 'et comptés : deux matières dans Langues orientales', usage[0].matieres);
ok(!usage.some((u) => u.nom === 'Fantome'), 'une clé à famille inconnue n’est pas proposée');
ok(classementsEnUsage([]).length === 0 && classementsEnUsage(null).length === 0, 'aucune matière -> aucune liste');

console.log('\n— 7. Renommer réécrit les matières, et elles seules —');
const r = retouchesRenommage(matieres, 'x:langues:Langues orientales', 'Langues asiatiques');
ok(r.length === 2, 'deux matières à réécrire', r);
ok(r.every((x) => x.category === 'x:langues:Langues asiatiques'),
  'la famille d’ancrage est CONSERVÉE : renommer n’est pas reclasser', r);
ok(r.map((x) => x.id).join(',') === 's1,s2', 'et seules celles qui le portaient', r.map((x) => x.id));
ok(retouchesRenommage(matieres, 'x:langues:Langues orientales', 'Langues orientales').length === 0,
  'un nom identique n’écrit rien');
ok(retouchesRenommage(matieres, 'x:langues:Langues orientales', '  ').length === 0, 'un nom vide n’écrit rien');
ok(retouchesRenommage(matieres, 'sciences', 'Exactes').length === 0,
  'on ne renomme pas un classement OFFICIEL : il appartient au référentiel');

console.log(ko === 0 ? '\n✅ Tous les tests passent' : `\n❌ ÉCHEC : ${ko}`);
process.exitCode = ko === 0 ? 0 : 1;
