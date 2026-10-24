// LE CÂBLAGE DE L'IMPORT/EXPORT DU SECONDAIRE : TOUT, OU UNE MATIÈRE
//
// ── CE QUE CE TEST EMPÊCHE DE REVENIR ───────────────────────────────────────
//
// Consigne du 2026-10-24 : « dans l'écran de note du secondaire, mets les
// import et export de la même façon que celui du premier cycle, afin que ça
// exporte ou importe la note d'une matière aussi — donc on doit être capable
// d'importer soit toutes les notes de toutes les matières, soit une seule
// matière ».
//
// Avant : l'export ne sortait QUE la classe entière, et l'import écrivait
// toutes les colonnes reconnues (0.3.22 et avant) puis une seule (0.3.23).
// Le premier cycle, lui, travaille matière par matière depuis toujours
// (CompetenceGradeIO est porté par la matière affichée).
//
// La logique d'écriture est prouvée par core/_importUneMatiere.test.mjs ; ici
// on fige que les ÉCRANS l'appellent — la leçon du 2026-10-22, où une
// correction dormait dans le magasin sans qu'aucun écran ne l'appelle.
//
//   node src/components/grades/_importExportPortee.test.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ICI = dirname(fileURLToPath(import.meta.url));
const panneau = readFileSync(join(ICI, 'GradeImportPanel.jsx'), 'utf8');
const ecran   = readFileSync(join(ICI, '..', '..', 'pages', 'Grades.jsx'), 'utf8');

let pass = 0, fail = 0;
const ok = (c, label, got) => {
  if (c) { pass++; console.log(`✅ ${label}`); }
  else { fail++; console.log(`❌ ${label}${got === undefined ? '' : `  (obtenu: ${JSON.stringify(got)})`}`); }
};
const titre = (t) => console.log(`\n-- ${t} --`);

titre('L’IMPORT offre les deux portées, et n’écrit rien sans choix');
{
  ok(/lignesPourMatieres\(/.test(panneau), 'le panneau appelle la règle de périmètre');
  ok(/matieres: matieresVisees/.test(panneau), 'et lui passe le périmètre choisi');
  ok(/value="toutes"/.test(panneau), 'l’option « toutes les matières » est proposée');
  ok(/matieresDuFichier\.length > 1 &&/.test(panneau),
    'mais seulement quand le classeur en porte plus d’une (sinon elle n’a pas de sens)');
  ok(/const toutes {2}= portee === 'toutes'/.test(panneau), 'le mode « toutes » est explicite');
  ok(/matieresVisees = toutes \? matieresDuFichier : \(matiere \? \[matiere\] : \[\]\)/.test(panneau),
    'le périmètre est : toutes, ou la seule choisie, ou RIEN');
  ok(/disabled=\{importing \|\| !matieresVisees\.length \|\| nbNotes === 0\}/.test(panneau),
    'le bouton reste inerte tant que rien n’est choisi, ou qu’il n’y a aucune note à écrire');
  ok(/setPortee\(trouvees\.length === 1 \? trouvees\[0\]\.id : ''\)/.test(panneau),
    'un classeur d’une seule matière la choisit d’office — sans ambiguïté');
  ok(/const nbNotes {3}= aEcrire\.reduce/.test(panneau),
    'le bouton annonce un nombre de NOTES (une ligne en porte plusieurs en mode « toutes »)');
}

titre('L’aperçu montre exactement ce qui sera écrit');
{
  ok(/matieresVisees\.length > 0 && matched\.length > 0/.test(panneau),
    'le tableau n’apparaît qu’une fois le périmètre choisi');
  ok(/matieresVisees\.map\(\(m\) => \(/.test(panneau),
    'et il porte une colonne par matière du périmètre, pas une seule');
}

titre('L’EXPORT sait sortir une seule matière');
{
  ok(/const handleExport = \(matiere = null\) =>/.test(ecran),
    'handleExport accepte une matière (absente = la classe entière, comme avant)');
  ok(/const cols {5}= matiere \? \[matiere\] : classSubjects/.test(ecran),
    'une seule colonne, ou toutes');
  ok(/\.\.\.\(matiere \? \[\] : \[t\('Moyenne', 'Average'\)\]\)/.test(ecran),
    'PAS de colonne Moyenne pour une matière seule : elle vaudrait la note elle-même');
  ok(/matiere \? `_\$\{String\(matiere\.name\)\.replace/.test(ecran),
    'le nom de fichier porte la matière, assaini (un intitulé peut contenir « / »)');

  const boutons = [...ecran.matchAll(/onClick=\{\(\) => handleExport\(([^)]*)\)\}/g)].map((m) => m[1]);
  ok(boutons.filter((b) => b === '').length === 2,
    'les DEUX vues (enseignant et administrateur) gardent l’export complet', boutons);
  ok(boutons.filter((b) => b === 'currentSubject').length === 2,
    'et les deux reçoivent l’export de la matière affichée', boutons);
  ok(/\{currentSubject && \(/.test(ecran),
    'le bouton d’une matière n’apparaît que si une matière est affichée');
}

console.log(`\n${pass} réussis, ${fail} échoués`);
process.exit(fail ? 1 : 0);
