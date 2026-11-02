// LA COLONNE « N° » EST-ELLE BRANCHÉE SUR L'ORDRE DE LA LISTE DE CLASSE ?
//
// Demande du 2026-11-01, point 3 : « Sur l'écran de saisie des notes du
// primaire, ajoute une colonne N° avant le nom de l'élève. La numérotation suit
// l'ordre de la liste de classe […] la même que celle des listes de classe et
// des bulletins, pour que le numéro soit cohérent partout. […] Vérifie si les
// autres cycles (maternelle, secondaire) ont déjà cette colonne et uniformise. »
//
// L'ordre lui-même est prouvé par core/_ordreClasse.test.mjs. Ici on fige le
// CÂBLAGE — la leçon du 2026-10-22, où une règle correcte dormait dans le
// magasin sans qu'aucun écran ne l'appelle : six surfaces triaient les élèves,
// chacune à sa façon, et deux ordres différents donnent deux numéros différents
// pour le même enfant.
//
//   node src/components/grades/_colonneNumero.test.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ICI = dirname(fileURLToPath(import.meta.url));
const lire = (...p) => readFileSync(join(ICI, ...p), 'utf8');

const prim = lire('PrimCompetenceWorkspace.jsx');
const mat  = lire('MatObservationWorkspace.jsx');
const apc  = lire('ApcCompetenceWorkspace.jsx');
const io   = lire('CompetenceGradeIO.jsx');
const grid = lire('GradeGrid.jsx');
const mob  = lire('MobileEntryList.jsx');
const prof = lire('SubjectTeacherWorkspace.jsx');
const ecran = lire('..', '..', 'pages', 'Grades.jsx');
const liste = lire('..', '..', 'lib', 'studentListDoc.js');

let pass = 0, fail = 0;
const ok = (c, label, got) => {
  if (c) { pass++; console.log(`OK   ${label}`); }
  else { fail++; console.log(`KO   ${label}${got === undefined ? '' : `  (obtenu: ${JSON.stringify(got)})`}`); }
};
const titre = (t) => console.log(`\n-- ${t} --`);

const SURFACES = [
  ['primaire',            prim],
  ['maternelle',          mat],
  ['secondaire APC',      apc],
  ['saisie classique',    ecran],
  ['poste enseignant',    prof],
];

titre('TOUTES les surfaces lisent le MEME ordre');
for (const [nom, src] of SURFACES) {
  ok(/from '(\.\.\/)+core\/ordreClasse'/.test(src), `${nom} : importe core/ordreClasse`);
  ok(/elevesDeClasse\(students, classId\)/.test(src), `${nom} : construit sa liste avec elevesDeClasse`);
  // Le tri maison doit avoir DISPARU : tant qu'il reste, il y a deux ordres
  // possibles et c'est le hasard de l'appel qui tranche.
  ok(!/s\.class_id === classId\)\s*\.?\s*\n?\s*\.sort\(/.test(src)
     && !/class_id === classId\)\.sort\(/.test(src),
    `${nom} : plus aucun tri local sur les élèves`);
}

titre('la liste IMPRIMEE est la reference, et elle delegue au meme module');
{
  ok(/from '\.\.\/core\/ordreClasse'/.test(liste), 'studentListDoc importe core/ordreClasse');
  ok(/const sortByName = \(arr\) => ordonnerEleves\(arr\)/.test(liste),
    'son tri alphabétique est désormais celui du module');
  ok(!/localeCompare\(b\.name \|\| '', undefined, \{ sensitivity: 'base' \}\)/.test(liste),
    'son tri maison a disparu (c’est lui qui divergeait des écrans de saisie)');
}

titre('la colonne N° est affichee, figee, avant le nom');
for (const [nom, src] of [['primaire', prim], ['maternelle', mat], ['secondaire APC', apc]]) {
  ok(/\{t\('N°', 'No\.'\)\}/.test(src), `${nom} : l’en-tête « N° » existe`);
  // Figée : le numéro doit rester lisible quand on défile les colonnes de
  // notes — c’est explicitement demandé.
  ok(/sticky left-0[^>]*w-10[^>]*text-center/.test(src), `${nom} : la colonne N° est figée (sticky left-0)`);
  ok(/sticky left-10/.test(src), `${nom} : la colonne du nom est décalée et reste figée elle aussi`);
  ok(/tabular-nums">\{ri \+ 1\}</.test(src), `${nom} : la cellule porte le rang de la ligne`);
}

titre('les surfaces qui numerotaient DEJA n ont pas regresse');
{
  ok(/<th className="px-3 py-2\.5 text-center font-semibold text-gray-400 w-8">N°<\/th>/.test(grid),
    'la grille classique garde sa colonne N°');
  ok(/tabular-nums">\{i \+ 1\}</.test(grid), 'et son numéro de ligne');
  ok(/tabular-nums">\{i \+ 1\}</.test(mob), 'la saisie sur téléphone numérote ses cartes');
}

titre('l EXPORT porte le numero, et l IMPORT sait le retrouver');
{
  ok(/const header = \[t\('N°', 'No\.'\), t\('Élève', 'Student'\)/.test(io),
    'l’export ouvre la feuille par N° puis Élève');
  ok(/numeroDe\?\.\(s\.id\) \?\? i \+ 1/.test(io), 'la cellule N° vient de la liste de classe');
  ok(/from '\.\.\/\.\.\/lib\/colonneEleve'/.test(io), 'l’import importe la détection de colonne');
  ok(/const nomIdx = indexColonneEleve\(fileHeader\)/.test(io), 'il localise la colonne du nom');
  ok(/String\(cells\[nomIdx\] \|\| ''\)/.test(io), 'et lit le nom à cet index, pas en 0');
  ok(/j > nomIdx && norm\(h\) === norm\(c\.label\)/.test(io),
    'les colonnes de notes sont celles qui SUIVENT le nom');
  ok(/for \(let j = nomIdx \+ 1; j < fileHeader\.length; j\+\+\)/.test(io),
    'le repli positionnel part aussi d’après le nom');
  ok(!/String\(cells\[0\] \|\| ''\)/.test(io), 'plus aucune lecture en dur de la colonne 0');
}

console.log(`\n${fail === 0 ? `TOUS LES CONTROLES PASSENT (${pass})` : `${fail} ECHEC(S) sur ${pass + fail}`}`);
process.exit(fail === 0 ? 0 : 1);
