// « MATHS » MERITE-T-IL SON GROUPE OFFICIEL ?
//
// Les bulletins du SECOND CYCLE (GROUPE 1 / GROUPE 2 de l'arrete) et du
// PROGRAMME BILINGUE SPECIAL partent des lignes `subjects` de la classe, puis
// vont chercher au referentiel national le GROUPE, le COEFFICIENT et la CHARGE
// HORAIRE de chaque matiere. Ce rapprochement exigeait l'egalite EXACTE du nom.
//
// Or les ecoles ecrivent « Maths », « S.V.T », « Philo », « Hist-Geo ». Aucun ne
// tombait sur sa ligne : la matiere perdait son groupe (elle atterrissait sous
// AUTRES MATIERES), son coefficient officiel et sa charge — sur un bulletin
// OFFICIEL, sans que rien ne le signale.
//
// CE QUE CE TEST PROTEGE SURTOUT, c'est le refus de deviner. Sur un document
// officiel, une matiere visiblement rangee a part est un defaut qui se voit et
// se corrige ; une matiere glissee dans le MAUVAIS groupe reglementaire est une
// faute qui ne se voit pas. Les cas « on ne place rien » sont donc aussi
// nombreux ici que les cas positifs.
import {
  matchRefRow, unmatchedAgainstRef, normName, looseKey,
  estLangueVivante, matchLangueVivanteSlot, resolveRefRow,
} from './refNameMatch.js';

let echecs = 0;
const ok = (cond, libelle, obtenu) => {
  if (cond) console.log(`OK   ${libelle}`);
  else { console.log(`KO   ${libelle} (obtenu: ${JSON.stringify(obtenu)})`); echecs++; }
};
const titre = (s) => console.log(`\n-- ${s} --`);

// Referentiel de serie, tel qu'il arrive de `matieresForSerieClasse`.
const REF = [
  { nom: 'Mathématiques', groupe_ordre: 1, coefficient: 7 },
  { nom: 'Physique', groupe_ordre: 1, coefficient: 4 },
  { nom: 'SVT', groupe_ordre: 1, coefficient: 4 },
  { nom: 'Philosophie', groupe_ordre: 2, coefficient: 3 },
  { nom: 'Histoire-Géographie', groupe_ordre: 2, coefficient: 3 },
  { nom: 'Informatique', groupe_ordre: 2, coefficient: 2 },
  { nom: 'Français', groupe_ordre: 2, coefficient: 3 },
  { nom: 'Éducation Civique', groupe_ordre: 2, coefficient: 1 },
  { nom: 'Arts Plastiques', groupe_ordre: 2, coefficient: 1 },
];
const nomTrouve = (n, rows = REF) => matchRefRow(n, rows)?.nom ?? null;

titre('Nom exact : ce qui marchait doit marcher encore');
{
  for (const n of ['Mathématiques', 'mathematiques', 'MATHÉMATIQUES', '  Physique  ', 'SVT']) {
    const r = nomTrouve(n);
    ok(r !== null, `« ${n} » trouve sa ligne`, r);
  }
  ok(nomTrouve('Français') === 'Français', 'les accents ne genent pas');
  ok(nomTrouve('Francais') === 'Français', 'ni leur absence');
}

titre('LE DEFAUT RAPPORTE : les abreviations que les ecoles ecrivent');
{
  const cas = [
    ['Maths', 'Mathématiques'],          // le `s` du pluriel cassait le prefixe
    ['MATH', 'Mathématiques'],
    ['S.V.T', 'SVT'],                     // ponctuation
    ['s.v.t.', 'SVT'],
    ['Philo', 'Philosophie'],
    ['Info', 'Informatique'],
    ['Hist-Géo', 'Histoire-Géographie'],  // mot a mot, chaque mot abrege
    ['Histoire et Geographie', 'Histoire-Géographie'],
    ['Art Plastique', 'Arts Plastiques'], // singulier/pluriel sur deux mots
  ];
  for (const [local, attendu] of cas) {
    const r = nomTrouve(local);
    ok(r === attendu, `« ${local} » -> « ${attendu} »`, r);
  }
}

titre('LE GARDE-FOU : on ne place QUE si c est sur');
{
  // Ambiguite : deux candidats plausibles, on ne tranche pas.
  const amb = [{ nom: 'Sciences Physiques' }, { nom: 'Sciences de la Vie' }];
  ok(matchRefRow('Sciences', amb) === null,
    'deux candidats -> on ne place rien, plutot que de deviner', nomTrouve('Sciences', amb));
  ok(matchRefRow('Sci', amb) === null, 'abreviation ambigue -> rien');
  ok(matchRefRow('Sciences P', amb)?.nom === 'Sciences Physiques',
    'desambiguisee, elle se place');

  // Trop court : « Ma » ou « Ar » designerait n importe quoi.
  ok(matchRefRow('Ma', REF) === null, 'moins de 4 caracteres -> rien');
  ok(matchRefRow('Ar', REF) === null, 'deux lettres -> rien, meme avec Arts Plastiques');
  // Un mot de 2 lettres dans un nom compose ne suffit pas non plus.
  ok(matchRefRow('Ed Civique', REF) === null,
    '« Ed » est trop court pour engager « Education » sur un document officiel',
    nomTrouve('Ed Civique'));

  // Matiere maison : elle doit rester dehors.
  for (const n of ['Zumba', 'Club echecs', 'Atelier robotique', 'Chorale']) {
    ok(matchRefRow(n, REF) === null, `« ${n} » reste hors referentiel`, nomTrouve(n));
  }
}

titre('Entrees abimees : rien ne casse, rien ne se place par accident');
{
  ok(matchRefRow('', REF) === null, 'nom vide -> rien');
  ok(matchRefRow(null, REF) === null, 'nom null -> rien');
  ok(matchRefRow('   ', REF) === null, 'nom blanc -> rien');
  ok(matchRefRow('Maths', []) === null, 'referentiel vide -> rien');
  ok(matchRefRow('Maths', null) === null, 'referentiel null -> rien, pas une erreur');
  let leve = false;
  try { matchRefRow('Maths', [null, undefined, { nom: 'Mathématiques' }]); } catch { leve = true; }
  ok(!leve, 'des lignes de referentiel abimees ne font pas tomber le bulletin');
  ok(matchRefRow('Maths', [null, { nom: 'Mathématiques' }])?.nom === 'Mathématiques',
    'et la bonne ligne est quand meme trouvee');
}

titre('Le groupe officiel suit bien la ligne trouvee');
{
  // C est tout l enjeu : le groupe, le coefficient et la charge viennent de la
  // ligne. Se tromper de ligne, c est se tromper de GROUPE REGLEMENTAIRE.
  ok(matchRefRow('Maths', REF).groupe_ordre === 1, 'Maths -> GROUPE 1');
  ok(matchRefRow('Maths', REF).coefficient === 7, 'Maths -> coefficient 7');
  ok(matchRefRow('Philo', REF).groupe_ordre === 2, 'Philo -> GROUPE 2');
  ok(matchRefRow('Hist-Géo', REF).coefficient === 3, 'Hist-Geo -> coefficient 3');
}

titre('unmatchedAgainstRef : nommer ce qui restera hors groupe');
{
  const classe = [
    { name: 'Maths' }, { name: 'Philo' }, { name: 'Zumba' }, { name: 'Club echecs' },
  ];
  const dehors = unmatchedAgainstRef(classe, REF).map((s) => s.name);
  ok(dehors.join('|') === 'Zumba|Club echecs',
    'seules les matieres hors referentiel sont nommees', dehors);
  // Referentiel pas encore charge : on n accuse PERSONNE. Un avis « votre
  // matiere est hors referentiel » pendant le chargement serait un mensonge.
  ok(unmatchedAgainstRef(classe, []).length === 0, 'referentiel vide -> aucun avis');
  ok(unmatchedAgainstRef(classe, null).length === 0, 'referentiel null -> aucun avis');
  ok(unmatchedAgainstRef(null, REF).length === 0, 'classe vide -> aucun avis');
  ok(unmatchedAgainstRef([null, { name: '' }, {}], REF).length === 0,
    'lignes sans nom -> ignorees, pas accusees');
}

titre('Les deux normalisations, pour elles-memes');
{
  ok(normName('  Éducation   Civique ') === 'education civique',
    'normName : minuscules, accents, espaces reduits', normName('  Éducation   Civique '));
  ok(looseKey('S.V.T') === 'svt', 'looseKey : plus aucune ponctuation', looseKey('S.V.T'));
  ok(looseKey('Hist-Géo') === 'histgeo', 'looseKey : ni tiret ni accent', looseKey('Hist-Géo'));
  ok(normName(null) === '' && looseKey(null) === '', 'null -> chaine vide, pas une erreur');
}

titre('LE CRENEAU « LANGUE VIVANTE » : ce qu aucun nom ne pouvait rapprocher');
{
  // Signale par le responsable : « j ai choisi Langue comme classement pour
  // allemand et espagnol mais je les vois toujours a Autres ». L arrete ne
  // nomme PAS la langue : il ouvre un creneau « Langue vivante II » que l ecole
  // remplit. « Espagnol » ne pouvait donc tomber sur aucune ligne, par aucune
  // regle de nom — et le classement pedagogique n y change rien, puisque les
  // GROUPE 1 / 2 viennent de l arrete.
  const A4 = [
    { nom: 'Philosophie', groupe_ordre: 1, coefficient: 4, charge_horaire: 4 },
    { nom: 'Langue vivante II', groupe_ordre: 1, coefficient: 3, charge_horaire: 3 },
    { nom: 'Mathématiques', groupe_ordre: 2, coefficient: 2, charge_horaire: 2 },
  ];
  for (const n of ['Espagnol', 'Allemand', 'ESPAGNOL', 'Espagnol LV2', 'Italien', 'Chinois', 'Arabe']) {
    const r = resolveRefRow(n, A4);
    ok(r?.nom === 'Langue vivante II', `« ${n} » prend le creneau Langue vivante II`, r?.nom);
    ok(r?.groupe_ordre === 1, `« ${n} » herite du GROUPE 1 de l arrete`, r?.groupe_ordre);
    ok(r?.coefficient === 3, `« ${n} » herite du coefficient 3`, r?.coefficient);
  }
  // Le nom passe TOUJOURS avant le creneau : une matiere qui a sa propre ligne
  // ne doit pas se faire absorber.
  ok(resolveRefRow('Philo', A4)?.nom === 'Philosophie',
    'une matiere nommee au referentiel garde SA ligne, pas le creneau');
  ok(resolveRefRow('Zumba', A4) === null, 'une matiere maison reste dehors');
}

titre('Serie A5 : DEUX creneaux, et c est sans consequence');
{
  // Releve dans supabase_sc_referentiel_data.sql : les 15 lignes « Langue
  // vivante » du referentiel se resument a UN triplet (g1, coef 3, charge 3).
  // Savoir si l espagnol occupe le creneau II ou le III ne change donc rien aux
  // trois seules choses que l enrichissement recopie.
  const A5 = [
    { nom: 'Langue vivante II', groupe_ordre: 1, coefficient: 3, charge_horaire: 3 },
    { nom: 'Langue vivante III', groupe_ordre: 1, coefficient: 3, charge_horaire: 3 },
  ];
  for (const n of ['Espagnol', 'Allemand']) {
    const r = resolveRefRow(n, A5);
    ok(r !== null, `« ${n} » est place malgre les deux creneaux`, r?.nom);
    ok(r.groupe_ordre === 1 && r.coefficient === 3, `« ${n} » : groupe et coef corrects`);
  }
}

titre('LE GARDE-FOU : des creneaux qui divergent -> on ne place rien');
{
  // Si un referentiel futur distinguait les creneaux, la regle doit se
  // desactiver d elle-meme plutot que de choisir a la place de l ecole.
  const divergents = [
    { nom: 'Langue vivante II', groupe_ordre: 1, coefficient: 3, charge_horaire: 3 },
    { nom: 'Langue vivante III', groupe_ordre: 2, coefficient: 1, charge_horaire: 1 },
  ];
  ok(matchLangueVivanteSlot('Espagnol', divergents) === null,
    'creneaux divergents -> aucun placement, le menu « Groupe » prend le relais');
  // Serie sans creneau de langue vivante : rien a remplir.
  ok(matchLangueVivanteSlot('Espagnol', [{ nom: 'Mathématiques', groupe_ordre: 1 }]) === null,
    'serie sans creneau -> rien');
  ok(matchLangueVivanteSlot('Espagnol', []) === null, 'referentiel vide -> rien');
  ok(matchLangueVivanteSlot('Espagnol', null) === null, 'referentiel null -> rien, pas une erreur');
}

titre('estLangueVivante : la liste est volontairement courte');
{
  for (const n of ['Allemand', 'Espagnol', 'Italien', 'Chinois', 'Arabe', 'Portugais', 'Russe', 'German', 'Spanish'])
    ok(estLangueVivante(n), `« ${n} » est une langue vivante posee par l ecole`);
  // Celles-ci portent leur PROPRE ligne au referentiel : elles se rapprochent
  // deja par le nom et n ont rien a faire dans un creneau.
  for (const n of ['Latin', 'Grec', 'Anglais', 'Français', 'Littérature', 'Langues nationales'])
    ok(!estLangueVivante(n), `« ${n} » n est PAS un remplissage de creneau`);
  ok(!estLangueVivante('Zumba'), 'une matiere maison non plus');
  ok(!estLangueVivante(''), 'nom vide -> non');
  ok(!estLangueVivante(null), 'nom null -> non, pas une erreur');
}

titre('unmatchedAgainstRef tient compte du creneau');
{
  const A4 = [
    { nom: 'Philosophie', groupe_ordre: 1, coefficient: 4, charge_horaire: 4 },
    { nom: 'Langue vivante II', groupe_ordre: 1, coefficient: 3, charge_horaire: 3 },
  ];
  const dehors = unmatchedAgainstRef(
    [{ name: 'Philo' }, { name: 'Espagnol' }, { name: 'Allemand' }, { name: 'Zumba' }], A4,
  ).map((s) => s.name);
  ok(dehors.join('|') === 'Zumba',
    'l espagnol et l allemand ne sont PLUS annonces comme hors referentiel', dehors);
}


titre('PREMIER CYCLE BILINGUE : le meme creneau, sous un autre nom');
{
  // C EST LE CAS REELLEMENT SIGNALE. Le responsable voyait allemand et espagnol
  // en AUTRES sur une classe de 6e-3e. J avais d abord conclu au second cycle :
  // c etait faux. Le programme bilingue special couvre AUSSI le premier cycle,
  // et son referentiel (arrete 239-23) ouvre lui aussi un creneau generique,
  // ecrit « Langue Vivante II (LVII) ».
  //
  // Le bilingue range par `domaine_ordre` et non par `groupe_ordre` : une
  // empreinte qui ne regarderait que le second cycle laisserait le garde-fou
  // aveugle sur ce bulletin-la.
  const BIL = [
    { nom: 'Français', domaine_ordre: 1, coefficient: 4, charge_horaire: 4 },
    { nom: 'Langue Vivante II (LVII)', domaine_ordre: 2, coefficient: 2, charge_horaire: 2 },
    { nom: 'Mathématiques', domaine_ordre: 3, coefficient: 4, charge_horaire: 4 },
  ];
  for (const n of ['Espagnol', 'Allemand', 'Italien', 'Chinois']) {
    const r = resolveRefRow(n, BIL);
    ok(r?.nom === 'Langue Vivante II (LVII)', `« ${n} » prend le creneau LVII du bilingue`, r?.nom);
    ok(r?.domaine_ordre === 2, `« ${n} » herite du domaine 2`, r?.domaine_ordre);
    ok(r?.coefficient === 2, `« ${n} » herite du coefficient 2`, r?.coefficient);
  }
  ok(resolveRefRow('Maths', BIL)?.nom === 'Mathématiques',
    'une matiere nommee au referentiel bilingue garde SA ligne');
  ok(resolveRefRow('Zumba', BIL) === null, 'une matiere maison reste sous AUTRES MATIERES');

  // Le garde-fou doit voir la divergence sur `domaine_ordre` AUSSI.
  const divergentsBil = [
    { nom: 'Langue Vivante II (LVII)', domaine_ordre: 2, coefficient: 2, charge_horaire: 2 },
    { nom: 'Langue Vivante III', domaine_ordre: 5, coefficient: 1, charge_horaire: 1 },
  ];
  ok(matchLangueVivanteSlot('Espagnol', divergentsBil) === null,
    'creneaux bilingues divergents -> aucun placement');
}


console.log(echecs ? `\n${echecs} ECHEC(S)` : '\nTOUT OK');
process.exit(echecs ? 1 : 0);
