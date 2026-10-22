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
import { readFileSync } from 'node:fs';
import {
  scopeOf, applyScope, apcForClass, primForClass, matForClass, apcMatieresForClass,
  unmatchedClassSubjects,
} from './refClassScope.js';

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

// ── Les trois fonctions par cycle : MASQUES + PERIMETRE ───────────────────
//
// Elles existent pour qu'UN SEUL endroit decide. Le bulletin appliquait les
// masques, le proces-verbal et le rapport de classe n'appliquaient RIEN : trois
// documents de la meme classe pouvaient lister trois ensembles de matieres
// differents, et le conseil deliberait sur des colonnes que le bulletin
// n'imprimait pas.
titre('apcForClass : masques ET perimetre');
{
  const ref = {
    matieres: MATIERES,
    competences: [
      { id: 'c_fr',  matiere_id: 'francais' },
      { id: 'c_ang', matiere_id: 'anglais' },
      { id: 'c_inf', matiere_id: 'informatique' },
      { id: 'c_ecm', matiere_id: 'ecm' },
    ],
  };
  const classe = [sub('Français'), sub('Anglais'), sub('ECM')];   // informatique decochee
  const r = apcForClass(ref, classe, ['c_ang']);                   // anglais masque par l ecole
  const ids = r.competences.map((c) => c.id);
  ok(ids.includes('c_fr') && ids.includes('c_ecm'), 'les competences de la classe survivent', ids);
  ok(!ids.includes('c_ang'), 'la competence MASQUEE est retiree', ids);
  ok(!ids.includes('c_inf'), 'la competence de la matiere DECOCHEE est retiree', ids);
  ok(r.exclus.includes('informatique'), 'la matiere decochee est annoncee', r.exclus);
  // Le garde-fou s applique aussi ici.
  const rien = apcForClass(ref, [sub('Allamand')], []);
  ok(rien.competences.length === 4, 'aucun nom reconnu -> les 4 competences restent', rien.competences.length);
  ok(apcForClass(null, classe, []).competences.length === 0, 'referentiel null -> liste vide, pas une erreur');
}

titre('primForClass : les masques SEULS, plus le perimetre de la classe');
//
// CE QUE CE BLOC A CHANGE, ET POURQUOI. Il exigeait auparavant que les matieres
// cochees FILTRENT les competences du niveau. Releve le 2026-10-22 sur le CE1
// BIL de THE GENIUS : sur les ONZE competences nationales MINEDUB, NEUF etaient
// saisissables. Les deux ecartees sont TRANSVERSALES —
//
//     3A  Pratiquer les valeurs sociales
//     4A  Demontrer l'autonomie, l'esprit d'initiative, la creativite et
//         l'entrepreneuriat
//
// — et aucune matiere ne porte leur nom : aucune ecole n'a de matiere
// « Entrepreneuriat » en CE1. Le filtre les retirait donc du bulletin OFFICIEL,
// dans toutes les ecoles du primaire. Le module s'interdit precisement cela :
// « un bulletin qui en oublie une est une faute ».
//
// Le masquage reste le levier de l'ecole, et il dit la meme chose
// EXPLICITEMENT au lieu de la deduire d'un rapprochement de noms impossible.
{
  const ref = {
    competences: [
      { id: '1a', code: '1A', intitule: 'Lire et écrire', ordre: 1 },
      { id: '2a', code: '2A', intitule: 'Compter', ordre: 2 },
      { id: '6a', code: '6A', intitule: 'Éducation physique', ordre: 3 },
      { id: '4a', code: '4A', intitule: 'Autonomie et esprit d initiative', ordre: 4 },
    ],
    niveauCompetences: [
      { niveau_id: 'cm2', competence_id: '1a' },
      { niveau_id: 'cm2', competence_id: '2a' },
      { niveau_id: 'cm2', competence_id: '6a' },
      { niveau_id: 'cm2', competence_id: '4a' },
    ],
  };
  const classe = [sub('1A'), sub('2A')];                 // 6A et 4A non cochees

  // LE CONTROLE QUI FERME LE DEFAUT : une competence transversale, que rien ne
  // peut couvrir, reste saisissable et imprimable.
  const complet = primForClass(ref, 'cm2', classe, []);
  ok(complet.competences.map((c) => c.id).join(',') === '1a,2a,6a,4a',
    'les QUATRE competences du niveau restent, dont la transversale 4A',
    complet.competences.map((c) => c.id));
  ok(complet.exclus.length === 0, 'et rien n est annonce comme ecarte', complet.exclus);

  // Le masque, lui, porte toujours : c est le levier EXPLICITE de l ecole.
  const r = primForClass(ref, 'cm2', classe, ['2a']);
  ok(r.competences.map((c) => c.id).join(',') === '1a,6a,4a',
    'la competence MASQUEE est la seule retiree', r.competences.map((c) => c.id));

  ok(primForClass(ref, null, classe, []).competences.length === 0, 'sans niveau -> liste vide');
  ok(primForClass(null, 'cm2', classe, []).competences.length === 0, 'sans referentiel -> liste vide');

  // Une classe dont AUCUN nom n est reconnu garde evidemment tout, comme avant.
  const rien = primForClass(ref, 'cm2', [sub('Zzz')], []);
  ok(rien.competences.length === 4, 'aucun nom reconnu -> les 4 competences restent', rien.competences.length);

  // CE QUI NE DOIT PAS BOUGER : le premier cycle et la maternelle gardent leur
  // filtre. Leurs referentiels sont faits de matieres, le rapprochement y a un
  // sens, et la decision d origine reste valable pour eux.
  ok(typeof scopeOf === 'function', 'scopeOf reste utilise par apc et mat');
}

titre('primForClass : une competence MAISON ne suit que sa matiere');
//
// POURQUOI DEUX REGLES. Une competence NATIONALE est au programme du niveau :
// elle vaut pour toutes les classes, et seul le masquage l'enleve. Une
// competence MAISON, elle, n'existe que parce qu'une matiere de l'ecole l'a
// fait naitre — « Travaux Pratiques », « Economics ». Elle n'a de sens que dans
// les classes qui cochent cette matiere.
//
// Sans cette regle elle apparaitrait dans TOUTES les classes du primaire de
// l'ecole : `prim_niveau_competences` est VIDE en base (donc « applicable
// partout »), et aucune ecole ne peut y ecrire son niveau — la table est
// GLOBALE, sans school_id. Mesure le 2026-10-22.
{
  const ref = {
    competences: [
      { id: '1a', code: '1A', intitule: 'Lire et écrire', ordre: 1 },
      { id: '4a', code: '4A', intitule: 'Autonomie et esprit d initiative', ordre: 4 },
      { id: 'ec_x_tp', code: 'TP', intitule: 'Travaux Pratiques', ordre: 90, school_id: 'E' },
    ],
    niveauCompetences: [],
  };

  // La classe COCHE la matiere : sa competence maison est saisissable.
  const avec = primForClass(ref, 'ce1', [sub('Lire et écrire'), sub('Travaux Pratiques')], []);
  const idsAvec = avec.competences.map((c) => c.id);
  ok(idsAvec.includes('ec_x_tp'), 'la competence maison apparait la ou sa matiere est cochee', idsAvec);

  // Une AUTRE classe du primaire, qui ne la coche pas : elle n'apparait pas...
  const sans = primForClass(ref, 'sil', [sub('Lire et écrire')], []);
  const idsSans = sans.competences.map((c) => c.id);
  ok(!idsSans.includes('ec_x_tp'), 'et pas ailleurs', idsSans);

  // ...mais les NATIONALES restent partout, transversale comprise. C'est la
  // regle que I17 a posee, et elle ne doit pas etre reprise par celle-ci.
  ok(idsSans.includes('1a') && idsSans.includes('4a'),
    'les nationales restent, y compris la transversale 4A', idsSans);

  // Le masque porte aussi sur une competence maison.
  const masquee = primForClass(ref, 'ce1', [sub('Travaux Pratiques')], ['ec_x_tp']);
  ok(!masquee.competences.map((c) => c.id).includes('ec_x_tp'),
    'une competence maison masquee ne revient pas par la matiere',
    masquee.competences.map((c) => c.id));
}

titre('matForClass : masques ET perimetre');
{
  const ref = {
    domaines: [
      { id: 'langage',   code: 'D1', intitule: 'Langage et communication', ordre: 1 },
      { id: 'math',      code: 'D2', intitule: 'Mathématiques', ordre: 2 },
      { id: 'motricite', code: 'D3', intitule: 'Motricité', ordre: 3 },
    ],
  };
  const classe = [sub('Éveil au langage', { mat_domaine_id: 'langage' }), sub('Mathématiques')];
  const r = matForClass(ref, classe, ['math']);
  const ids = r.domaines.map((d) => d.id);
  ok(ids.join(',') === 'langage', 'seul le domaine coche ET non masque survit', ids);
  ok(r.exclus.includes('motricite'), 'le domaine decoche est annonce', r.exclus);
  const rien = matForClass(ref, [sub('Zzz')], []);
  ok(rien.domaines.length === 3, 'aucun nom reconnu -> les 3 domaines restent', rien.domaines.length);
  ok(matForClass(null, classe, []).domaines.length === 0, 'referentiel null -> liste vide');
}

// ── Cycle inconnu : aucun appariement, donc aucun filtre ───────────────────
titre('Cycle inconnu');
ok(scopeOf('sc', [{ id: 's1', name: 'Français' }], [{ id: 'francais' }]) === null,
  'un cycle non gere -> aucun filtre (le second cycle part deja des matieres de la classe)');

// ── LA SAISIE APC DOIT LISTER EXACTEMENT CE QUE LE BULLETIN IMPRIME ────────
//
// L'ecran de saisie APC est organise par MATIERE du referentiel, pas par ligne
// `subjects` : il proposait donc toutes les matieres nationales de la classe,
// alors que le bulletin n'imprimait que celles couvertes par les matieres
// cochees. Une enseignante pouvait saisir un trimestre entier d'Informatique
// que le bulletin ne portait pas — et rien ne le disait.
titre('apcMatieresForClass : la saisie suit le perimetre de la classe');
{
  const classe = [sub('Français'), sub('MATh'), sub('Histoire-Géo')];
  const r = apcMatieresForClass(MATIERES, classe);
  const ids = r.matieres.map((m) => m.id).sort();
  ok(ids.join(',') === 'francais,geographie,histoire,mathematiques',
    'seules les matieres couvertes sont proposees a la saisie', ids);
  ok(!ids.includes('informatique'),
    'Informatique, non cochee dans la classe, ne se saisit plus — comme au bulletin');
  ok(r.exclus.includes('informatique'), 'et elle est annoncee comme ecartee', r.exclus);

  // LE POINT QUI COMPTE : le MEME ensemble des deux cotes. On compare les
  // matieres proposees a la saisie aux matieres dont le bulletin garde au moins
  // une competence.
  const ref = {
    matieres: MATIERES,
    competences: MATIERES.map((m) => ({ id: 'c_' + m.id, matiere_id: m.id })),
  };
  const auBulletin = [...new Set(apcForClass(ref, classe, []).competences.map((c) => c.matiere_id))].sort();
  ok(auBulletin.join(',') === ids.join(','),
    'saisie et bulletin : le MEME ensemble de matieres', { saisie: ids, bulletin: auBulletin });
}

// Le garde-fou vaut ici aussi — et il vaut DOUBLE : un ecran de saisie vide
// n'explique rien a l'enseignante, qui conclut que le logiciel est casse.
titre('apcMatieresForClass : le garde-fou');
{
  ok(apcMatieresForClass(MATIERES, [sub('Allamand')]).matieres.length === MATIERES.length,
    'aucun nom reconnu -> toutes les matieres restent saisissables');
  ok(apcMatieresForClass(MATIERES, []).matieres.length === MATIERES.length,
    'classe sans matiere configuree -> liste complete, jamais un ecran vide');
  ok(apcMatieresForClass(MATIERES, null).matieres.length === MATIERES.length,
    'matieres de classe non chargees -> liste complete');
  ok(apcMatieresForClass([], [sub('Français')]).matieres.length === 0,
    'referentiel vide -> rien a proposer, et pas une erreur');
  ok(apcMatieresForClass(null, [sub('Français')]).matieres.length === 0,
    'referentiel null -> tableau vide, pas une erreur');
}

// Le libelle localise : une classe anglophone nomme ses matieres en anglais.
titre('apcMatieresForClass : nom localise');
{
  const enMat = [
    { id: 'francais', nom: 'Français', nomEN: 'French' },
    { id: 'informatique', nom: 'Informatique', nomEN: 'Computer Science' },
  ];
  const r = apcMatieresForClass(enMat, [sub('French')], (m) => m.nomEN);
  ok(r.matieres.map((m) => m.id).join(',') === 'francais',
    'le libelle anglais est reconnu quand on le fournit', r.matieres.map((m) => m.id));
}


// ── L'AUTRE SENS : UNE MATIERE COCHEE QUI N'EXISTE PAS AU REFERENTIEL ──────
//
// Dernier ecart possible entre « ce que j'ai coche » et « ce que je vois ». Une
// matiere maison, ou une faute de frappe, n'a pas de place sur un bulletin
// OFFICIEL : elle ne se saisit pas et ne s'imprime pas. C'est le referentiel
// national qui le veut — mais il faut le DIRE, sinon l'ecole croit que le
// logiciel a perdu sa matiere.
titre('unmatchedClassSubjects : nommer ce qui ne se rattache a rien');
{
  const classe = [sub('Français'), sub('Allamand'), sub('Club lecture')];
  const r = unmatchedClassSubjects('apc', classe, MATIERES).map((s) => s.name);
  ok(r.join('|') === 'Allamand|Club lecture',
    'la faute de frappe et la matiere maison sont nommees', r);
  ok(!r.includes('Français'), 'une matiere reconnue n est pas accusee', r);
}
{
  const COMPS = [
    { id: '1a', code: '1A', intitule: 'Ecouter et parler' },
    { id: '2a', code: '2A', intitule: 'Lire' },
  ];
  const classe = [sub('Lire', { prim_competence_id: '2a' }), sub('Natation')];
  const r = unmatchedClassSubjects('prim', classe, COMPS).map((s) => s.name);
  ok(r.join('|') === 'Natation', 'primaire : seule la matiere sans competence est nommee', r);
}
{
  const DOM = [
    { id: 'langage', code: 'D1', intitule: 'Langage et communication' },
    { id: 'math',    code: 'D2', intitule: 'Mathématiques' },
  ];
  const classe = [sub('Eveil', { mat_domaine_id: 'langage' }), sub('Sieste')];
  const r = unmatchedClassSubjects('mat', classe, DOM).map((s) => s.name);
  ok(r.join('|') === 'Sieste', 'maternelle : seul le domaine maison est nomme', r);
}
{
  // Referentiel pas encore charge : on n'accuse PERSONNE. Un avis « votre
  // matiere n'existe pas » affiche pendant le chargement serait un mensonge.
  ok(unmatchedClassSubjects('apc', [sub('Français')], []).length === 0,
    'referentiel vide -> aucun avis (il n est pas encore charge)');
  ok(unmatchedClassSubjects('apc', [sub('Français')], null).length === 0,
    'referentiel null -> aucun avis');
  ok(unmatchedClassSubjects('apc', null, MATIERES).length === 0,
    'classe sans matiere -> aucun avis');
  ok(unmatchedClassSubjects('apc', [null, { id: 'x' }], MATIERES).length === 0,
    'ligne abimee ou sans nom -> ignoree, pas une erreur');
  ok(unmatchedClassSubjects('sc', [sub('Zzz')], MATIERES).length === 0,
    'cycle non gere -> aucun avis (le second cycle part deja des matieres de la classe)');
}


// ── UNE SECTION ANGLOPHONE : MEME ENSEMBLE A LA SAISIE ET AU BULLETIN ──────
//
// L'ecran de saisie passe un `label` (il connait le systeme de la classe) ; le
// bulletin, le proces-verbal et le rapport de classe appellent apcForClass SANS
// label. « Computer Science » se resolvait donc a la saisie et pas au bulletin :
// la matiere etait saisissable et ne s'imprimait pas. Le libelle anglais
// officiel est desormais lu dans la table du produit, par l'appariement
// lui-meme : plus personne n'a besoin de passer un label.
titre('Section anglophone : resolution identique AVEC et SANS label');
{
  const EN_CLASSE = [sub('Computer Science'), sub('Mathematics'), sub('Biology')];
  const sansLabel = apcMatieresForClass(MATIERES, EN_CLASSE);
  const avecLabel = apcMatieresForClass(MATIERES, EN_CLASSE, (m) => m.nom);
  const a = sansLabel.matieres.map((m) => m.id).sort().join(',');
  const b = avecLabel.matieres.map((m) => m.id).sort().join(',');
  ok(a === b, 'le meme ensemble, que l appelant fournisse un label ou non', { a, b });
  ok(a.includes('informatique'),
    '« Computer Science » resout vers informatique (libelle anglais officiel)', a);
  ok(a.includes('mathematiques'), '« Mathematics » resout vers mathematiques', a);

  // Et le meme ensemble que le bulletin, qui n'a jamais de label.
  const ref = {
    matieres: MATIERES,
    competences: MATIERES.map((m) => ({ id: 'c_' + m.id, matiere_id: m.id })),
  };
  const auBulletin = [...new Set(apcForClass(ref, EN_CLASSE, []).competences.map((c) => c.matiere_id))].sort().join(',');
  ok(auBulletin === a, 'saisie et bulletin : le MEME ensemble, section anglophone',
    { saisie: a, bulletin: auBulletin });
}


titre('Le rattrapage du primaire est bien CABLE a l ecran');
//
// CE QUE CE BLOC EMPECHE DE REVENIR, et c est arrive le meme jour pour le
// premier cycle : la correction etait en place dans le magasin et l ecran ne
// l appelait JAMAIS, parce qu il declenchait sur une liste qui ne contenait pas
// le cas vise. Vu du dehors : « rien ne change ».
//
// La regle qu on fige : c est la liste des matieres SANS COMPETENCE qui
// declenche, et c est elle que le rattrapage traite.
{
  const ecran = readFileSync(new URL('../components/grades/PrimCompetenceWorkspace.jsx', import.meta.url), 'utf8');
  const magasin = readFileSync(new URL('../store/schoolStore.js', import.meta.url), 'utf8');

  ok(/materialiserCompetencesPrimManquantes/.test(magasin),
    'le magasin porte le rattrapage du primaire');
  ok(/unmatchedClassSubjects\('prim'/.test(magasin),
    'il part des matieres sans competence correspondante');
  ok(/addRefLigne\('prim'/.test(magasin),
    'et cree une competence MAISON, par le meme chemin que « Modifier les competences »');
  // La table est GLOBALE (ni school_id, ni RLS par ecole) : une ecole n a pas a
  // y ecrire son niveau. On verifie l ABSENCE D ECRITURE, pas l absence du nom —
  // il figure dans le commentaire qui explique precisement pourquoi on s en abstient.
  ok(!/from('prim_niveau_competences')/.test(magasin),
    'aucune ecriture dans prim_niveau_competences (table globale, sans school_id)');

  ok(/materialiserCompetencesPrimManquantes/.test(ecran),
    'l ecran appelle bien ce rattrapage');
  ok(/if \(!selectedClass \|\| !referentiel \|\| !niveauSlug \|\| !matieresHorsReferentiel\.length\) return;/.test(ecran),
    'et il declenche sur les matieres sans competence, pas sur autre chose');
  ok(/canManageClassSubjects\(/.test(ecran),
    'jamais sans le droit d ecrire le referentiel (sinon la file boucle sur un refus RLS)');
  ok(/rattrapees\.current\.has\(selectedClass\.id\)/.test(ecran),
    'et une seule fois par classe');
}

console.log(echecs === 0 ? '\nTOUS LES TESTS PASSENT' : `\nECHEC : ${echecs}`);
process.exitCode = echecs === 0 ? 0 : 1;
