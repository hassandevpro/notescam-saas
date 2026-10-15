// UNE MATIÈRE DÉCOCHÉE DISPARAÎT-ELLE DU BULLETIN OFFICIEL ?
//
// Défaut rapporté le 15/10/2026 : « les matières qui ne sont pas cochées mais
// apparaissent sur le bulletin ». Les bulletins officiels (APC 6e–3e, primaire,
// maternelle) listent le RÉFÉRENTIEL NATIONAL, pas les matières de la classe :
// décocher dans l'écran Classes n'avait donc aucun effet sur eux.
//
// CE QUE CE TEST PROTÈGE SURTOUT, ce n'est pas le filtrage — c'est le GARDE-FOU.
// Filtrer un bulletin officiel par les noms de matières d'une classe peut, si la
// résolution échoue, rendre un bulletin VIDE. Un bulletin qui porte une matière
// en trop est un défaut ; un bulletin qui en oublie est une faute. Les cas
// « rien ne doit être filtré » sont donc aussi nombreux ici que les cas positifs.
import { scopeOf, applyScope } from './refClassScope.js';

let echecs = 0;
const ok = (cond, libelle, obtenu) => {
  if (cond) console.log(`OK   ${libelle}`);
  else { console.log(`KO   ${libelle} (obtenu: ${JSON.stringify(obtenu)})`); echecs++; }
};
const titre = (s) => console.log(`\n-- ${s} --`);

// ── APC 6e–3e : matières du référentiel MINESEC ────────────────────────────
const MATIERES = [
  { id: 'francais',   nom: 'Français' },
  { id: 'anglais',    nom: 'Anglais' },
  { id: 'mathematiques', nom: 'Mathématiques' },
  { id: 'svteehb',    nom: 'SVTEEHB' },
  { id: 'histoire',   nom: 'Histoire' },
  { id: 'geographie', nom: 'Géographie' },
  { id: 'informatique', nom: 'Informatique' },
  { id: 'ecm',        nom: 'ECM' },
];
const sub = (name, extra = {}) => ({ id: 's_' + name, name, ...extra });

titre('APC : la classe fait foi');
{
  // Une 6e qui n'enseigne PAS l'informatique : la case est décochée, donc la
  // matière n'existe pas dans `subjects`.
  const classe = [sub('Français'), sub('Anglais'), sub('MATh'), sub('SVT'), sub('Histoire-Géo'), sub('Éducation Civique')];
  const scope = scopeOf('apc', classe, MATIERES);
  ok(scope !== null, 'un perimetre est calcule');
  ok(scope.ids.has('francais') && scope.ids.has('anglais'), 'les noms exacts sont reconnus', [...scope.ids]);
  ok(scope.ids.has('mathematiques'), '« MATh » -> maths (casse et abreviation)', [...scope.ids]);
  ok(scope.ids.has('svteehb'), '« SVT » -> SVTEEHB (alias)', [...scope.ids]);
  ok(scope.ids.has('histoire') && scope.ids.has('geographie'),
    '« Histoire-Geo » couvre les DEUX matieres officielles', [...scope.ids]);
  ok(scope.ids.has('ecm'), '« Education Civique » -> ECM (alias)', [...scope.ids]);
  // LE CŒUR DU DÉFAUT : l'informatique décochée ne doit PAS être au périmètre.
  ok(!scope.ids.has('informatique'), 'la matiere DECOCHEE n est pas au perimetre', [...scope.ids]);
  ok(scope.exclus.includes('informatique'), 'et elle est annoncee comme ecartee', scope.exclus);
  ok(scope.exclus.length === 1, 'une seule matiere ecartee', scope.exclus);
}

titre('APC : le filtre porte sur les COMPETENCES, via leur matiere');
{
  const classe = [sub('Français'), sub('Mathématiques')];
  const scope = scopeOf('apc', classe, MATIERES);
  const competences = [
    { id: 'c1', matiere_id: 'francais',     intitule: 'Lire' },
    { id: 'c2', matiere_id: 'mathematiques',        intitule: 'Calculer' },
    { id: 'c3', matiere_id: 'informatique', intitule: 'Saisir un texte' },
  ];
  const gardees = applyScope(scope, competences, (c) => c.matiere_id);
  ok(gardees.length === 2, 'deux competences gardees', gardees.map((c) => c.id));
  ok(!gardees.some((c) => c.matiere_id === 'informatique'),
    'aucune competence de la matiere decochee ne survit', gardees.map((c) => c.id));
}

// ── LE GARDE-FOU ───────────────────────────────────────────────────────────
titre('Garde-fou : on ne vide JAMAIS un bulletin');
{
  // Aucun nom reconnaissable : plutot que de tout ecarter, on ne filtre rien.
  const inconnus = [sub('Allamand'), sub('Matière 1'), sub('Zzz')];
  ok(scopeOf('apc', inconnus, MATIERES) === null,
    'aucune matiere reconnue -> AUCUN filtre (et non un bulletin vide)');
  ok(scopeOf('apc', [], MATIERES) === null, 'classe sans matiere -> aucun filtre');
  ok(scopeOf('apc', null, MATIERES) === null, 'classSubjects null -> aucun filtre');
  ok(scopeOf('apc', [sub('Français')], []) === null, 'referentiel vide -> aucun filtre');
  ok(scopeOf('apc', [sub('Français')], null) === null, 'referentiel null -> aucun filtre');
  ok(scopeOf('apc', [{ id: 'x' }], MATIERES) === null, 'matiere sans nom -> ignoree, donc aucun filtre');
}
{
  // `applyScope(null, …)` doit rendre la liste INCHANGEE : c'est le chemin par
  // defaut, celui qui rend le module sur a brancher partout.
  const items = [{ id: 'a' }, { id: 'b' }];
  ok(applyScope(null, items).length === 2, 'perimetre null -> liste inchangee');
  ok(applyScope(undefined, items).length === 2, 'perimetre undefined -> liste inchangee');
  ok(applyScope({ ids: null }, items).length === 2, 'perimetre sans ids -> liste inchangee');
  ok(applyScope(null, null).length === 0, 'liste null -> tableau vide, pas une erreur');
}
{
  // UNE SEULE matiere reconnue suffit a declencher le filtre : c'est le cas
  // limite a connaitre, et la raison pour laquelle l'ecran doit AFFICHER
  // `exclus`. Une ecole qui n'a configure qu'une matiere verra les autres
  // ecartees — et l'ecran le lui dira, au lieu qu'elle le decouvre a l'impression.
  const scope = scopeOf('apc', [sub('Français'), sub('Allamand')], MATIERES);
  ok(scope !== null, 'une seule matiere reconnue -> le filtre s applique');
  ok(scope.ids.size === 1, 'perimetre reduit a cette matiere', [...scope.ids]);
  ok(scope.exclus.length === 7, 'et les 7 autres sont ANNONCEES comme ecartees', scope.exclus.length);
}

// ── Primaire : le lien explicite fait foi ──────────────────────────────────
titre('Primaire : prim_competence_id fait foi, le nom en second');
{
  const COMPS = [
    { id: '1a', code: '1A', intitule: 'Lire et écrire' },
    { id: '2a', code: '2A', intitule: 'Compter' },
    { id: '6a', code: '6A', intitule: 'Éducation physique' },
  ];
  const classe = [
    sub('Peu importe le nom', { prim_competence_id: '1a' }),   // lien explicite
    sub('2A'),                                                  // par le code
  ];
  const scope = scopeOf('prim', classe, COMPS);
  ok(scope !== null, 'un perimetre est calcule');
  ok(scope.ids.has('1a'), 'le lien explicite est suivi, meme contre le nom', [...scope.ids]);
  ok(scope.ids.has('2a'), 'le code « 2A » est reconnu', [...scope.ids]);
  ok(!scope.ids.has('6a'), 'la competence decochee est hors perimetre', [...scope.ids]);
  ok(scope.exclus.join(',') === '6a', 'elle est annoncee comme ecartee', scope.exclus);
  // Un lien explicite vers une competence ABSENTE du referentiel charge ne doit
  // pas inventer un perimetre.
  const fantome = scopeOf('prim', [sub('X', { prim_competence_id: 'inexistante' })], COMPS);
  ok(fantome === null, 'lien explicite vers une competence inconnue -> aucun filtre');
}

// ── Maternelle : mat_domaine_id fait foi ───────────────────────────────────
titre('Maternelle : mat_domaine_id fait foi');
{
  const DOM = [
    { id: 'langage', code: 'D1', intitule: 'Langage et communication' },
    { id: 'math',    code: 'D2', intitule: 'Mathématiques' },
    { id: 'motricite', code: 'D3', intitule: 'Motricité' },
  ];
  const classe = [
    sub('Éveil au langage', { mat_domaine_id: 'langage' }),
    sub('Mathématiques'),
  ];
  const scope = scopeOf('mat', classe, DOM);
  ok(scope !== null, 'un perimetre est calcule');
  ok(scope.ids.has('langage'), 'le lien explicite est suivi', [...scope.ids]);
  ok(scope.ids.has('math'), 'l intitule exact est reconnu', [...scope.ids]);
  ok(!scope.ids.has('motricite'), 'le domaine decoche est hors perimetre', [...scope.ids]);
  ok(applyScope(scope, DOM).length === 2, 'applique : 2 domaines sur 3', applyScope(scope, DOM).map((d) => d.id));
}

// ── Cycle inconnu : aucun appariement, donc aucun filtre ───────────────────
titre('Cycle inconnu');
ok(scopeOf('sc', [{ id: 's1', name: 'Français' }], [{ id: 'francais' }]) === null,
  'un cycle non gere -> aucun filtre (le second cycle part deja des matieres de la classe)');

console.log(echecs === 0 ? '\nTOUS LES TESTS PASSENT' : `\nECHEC : ${echecs}`);
process.exitCode = echecs === 0 ? 0 : 1;
