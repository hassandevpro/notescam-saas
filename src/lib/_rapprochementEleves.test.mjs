// RAPPROCHER DES NOMS SANS MATRICULE — et refuser de parier
//
// Le registre transport de THE GENIUS ne porte aucun matricule. Trois lignes
// disent « HAMZAH », vingt-deux noms reviennent plusieurs fois. Ce qui se
// vérifie ici, c'est surtout ce que le module REFUSE de faire : un homonyme mal
// rattaché facture le transport au mauvais enfant.
//
// Lancer : node --experimental-loader ./scripts/lib/esm-resolve.mjs src/lib/_rapprochementEleves.test.mjs
import {
  normaliser, cleMots, cleClasse, indexerEleves, rapprocher, rapprocherPlan,
} from './rapprochementEleves.js';

let pass = 0, fail = 0;
const ok = (c, label, got) => {
  if (c) { console.log(`✅ ${label}`); pass++; }
  else { console.log(`❌ ${label} (obtenu: ${JSON.stringify(got)})`); fail++; }
};

// ── 1. LA NORMALISATION ────────────────────────────────────────────────────
console.log('\n— Normaliser —');
ok(normaliser('Mbassi  Manda Yannis') === 'MBASSI MANDA YANNIS', 'casse et espaces doubles écrasés');
ok(normaliser('NDÉMAFO SVÈN') === 'NDEMAFO SVEN', 'accents retirés');
ok(normaliser("N'DIAYE") === 'N DIAYE', 'apostrophe devenue espace');
ok(normaliser('KUMA-SIABE') === 'KUMA SIABE', 'tiret aussi');
ok(normaliser('  ') === '' && normaliser(null) === '', 'le vide reste vide, sans lever');
ok(cleMots('NDJOUELA CHLOE') === cleMots('CHLOE NDJOUELA'),
  '« NOM Prénom » et « Prénom NOM » ont la même clé : les deux écritures sont justes');
ok(cleClasse('CE2/BIL') === cleClasse('ce2 bil'), 'CE2/BIL et « ce2 bil » sont la même classe');
ok(cleClasse('CL4') !== cleClasse('CL4/BIL'), 'mais CL4 et CL4/BIL sont deux classes distinctes');

// ── 2. CE QUI EST TROUVÉ ───────────────────────────────────────────────────
console.log('\n— Trouver —');
const BASE = [
  { id: 's1', name: 'MEDJO MANGA WINNIE', matricule: 'M001', className: 'N1' },
  { id: 's2', name: 'Mbassi Manda Yannis', matricule: 'M002', className: 'CE2/BIL' },
  { id: 's3', name: 'CHLOE NDJOUELA', matricule: 'M003', className: 'CE1' },
  // DEUX HOMONYMES EXACTS, dans deux classes différentes.
  { id: 's4', name: 'HAMZAH SHEICK HAMED', matricule: 'M004', className: 'PRE N' },
  { id: 's5', name: 'HAMZAH SHEICK HAMED', matricule: 'M005', className: 'CL3' },
];
const idx = indexerEleves(BASE);
ok(rapprocher({ nom: 'MEDJO MANGA WINNIE' }, idx).eleve.id === 's1', 'un nom identique est trouvé');
ok(rapprocher({ nom: 'mbassi  manda  yannis' }, idx).eleve.id === 's2', 'casse et espaces n’empêchent rien');
{
  const r = rapprocher({ nom: 'NDJOUELA CHLOE' }, idx);
  ok(r.etat === 'trouve' && r.eleve.id === 's3', 'les mots dans l’autre ordre sont trouvés');
  ok(r.passe === 'mots_memes', 'et la passe employée est dite', r.passe);
}

// ── 3. CE QUI EST REFUSÉ — le cœur du module ───────────────────────────────
console.log('\n— Refuser de parier —');
{
  const r = rapprocher({ nom: 'HAMZAH SHEICK HAMED' }, idx);
  ok(r.etat === 'ambigu', 'deux homonymes sans classe → AMBIGU, aucun n’est choisi', r.etat);
  ok(r.candidats.length === 2, 'et les deux candidats sont rendus, pour qu’un humain tranche');
  // La classe départage, et seulement si elle désigne UN seul élève.
  const avecClasse = rapprocher({ nom: 'HAMZAH SHEICK HAMED', classe: 'CL3' }, idx);
  ok(avecClasse.etat === 'trouve' && avecClasse.eleve.id === 's5',
    'la classe du classeur départage deux homonymes', avecClasse.etat);
  const classeInconnue = rapprocher({ nom: 'HAMZAH SHEICK HAMED', classe: 'CM2' }, idx);
  ok(classeInconnue.etat === 'ambigu',
    'une classe qui ne correspond à aucun des deux ne tranche pas : on reste ambigu');
  // AUCUNE passe approchante : « MEDJO MANGA WINNY » n'est pas « WINNIE ».
  ok(rapprocher({ nom: 'MEDJO MANGA WINNY' }, idx).etat === 'absent',
    'un nom simplement RESSEMBLANT n’est jamais rapproché');
  ok(rapprocher({ nom: 'MEDJO MANGA' }, idx).etat === 'absent',
    'un nom incomplet non plus : une quasi-correspondance est pire qu’un rejet');
  ok(rapprocher({ nom: '' }, idx).etat === 'absent', 'un nom vide est absent, pas trouvé');
}

// ── 4. UN PLAN ENTIER ──────────────────────────────────────────────────────
console.log('\n— Un plan entier —');
{
  const LIGNES = [
    { source: { ligne: 7 }, nom: 'MEDJO MANGA WINNIE', classe: 'N1' },
    { source: { ligne: 8 }, nom: 'NDJOUELA CHLOE', classe: 'CE1' },
    // La classe du classeur diverge de celle de la base : juste, mais à vérifier.
    { source: { ligne: 9 }, nom: 'Mbassi Manda Yannis', classe: 'CL6' },
    { source: { ligne: 10 }, nom: 'HAMZAH SHEICK HAMED', classe: V_INCONNUE() },
    { source: { ligne: 11 }, nom: 'TOTO INEXISTANT', classe: 'CL1' },
    // LA MÊME PERSONNE DEUX FOIS : la contrainte UNIQUE ferait échouer la
    // seconde écriture au milieu du lot. On le voit avant.
    { source: { ligne: 12 }, nom: 'MEDJO MANGA WINNIE', classe: 'N1' },
  ];
  const r = rapprocherPlan(LIGNES, BASE);
  ok(r.resume.lignes === 6, 'six lignes lues');
  ok(r.resume.prets === 3, 'trois seulement sont prêtes à écrire', r.resume.prets);
  ok(r.resume.ambigus === 1, 'un ambigu', r.resume.ambigus);
  ok(r.resume.absents === 1, 'un absent', r.resume.absents);
  ok(r.resume.dejaPris === 1, 'et un élève déjà rapproché à une autre ligne', r.resume.dejaPris);
  ok(r.resume.classeDiverge === 1, 'une classe divergente est comptée, sans bloquer', r.resume.classeDiverge);
  ok(r.prets.every((x) => x.student_id), 'chaque ligne prête porte un student_id');
  ok(new Set(r.prets.map((x) => x.student_id)).size === r.prets.length,
    'AUCUN élève n’est pris deux fois dans les lignes prêtes');
  ok(r.aTrancher.every((x) => x.etat && x.source), 'chaque rejet dit son état et sa ligne — c’est la liste à envoyer à l’école');
  ok(r.resume.elevesEnBase === 5, 'et le résumé rappelle la taille de la base');
}

// ── 5. LES REFUS ───────────────────────────────────────────────────────────
console.log('\n— Robustesse —');
ok(rapprocherPlan().resume.lignes === 0, 'aucun argument ne lève pas');
ok(rapprocherPlan([], []).resume.prets === 0, 'listes vides → rien de prêt');
ok(indexerEleves([{ name: 'SANS ID' }]).total === 1 && indexerEleves([{ name: 'SANS ID' }]).parNom.size === 0,
  'un élève sans id est compté mais jamais rapproché : on n’écrit pas sur un id absent');
ok(rapprocherPlan([{ nom: 'MEDJO MANGA WINNIE' }], null).resume.prets === 0, 'une base nulle ne rapproche rien');

function V_INCONNUE() { return 'CM2'; }

console.log(fail === 0 ? '\n✅ Tous les tests passent' : `\n❌ ÉCHEC : ${fail}`);
if (fail > 0) process.exit(1);
