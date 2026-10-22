// CHANGER DE MATIÈRE NE DOIT PAS GARDER LA NOTE DE LA PRÉCÉDENTE
//
// ── CE QUE CE TEST EMPÊCHE DE REVENIR ───────────────────────────────────────
//
// Signalement du 2026-10-22, capture d'écran à l'appui : « les 02 matières
// prennent 20 automatique, ce n'est pas bon ». Sur la capture, la matière
// affichée est « Informatique fondamentale et TIC », le champ de l'élève
// affiche 20, et la statistique du même panneau dit « Moy. : 12/20 ». La note
// enregistrée valait donc 12 : c'était le CHAMP qui montrait encore le 20 de
// Mathématiques, saisi juste avant.
//
// LA CAUSE : le champ de note est NON CONTRÔLÉ (`defaultValue`), et
// `defaultValue` ne s'applique qu'au MONTAGE. Les lignes étaient keyées sur le
// seul identifiant d'ÉLÈVE — en changeant de matière, React retrouve les mêmes
// clés, réutilise les mêmes `<input>` du DOM, et ne réapplique pas
// `defaultValue`. Puis `commit` comparait 20 à 12, concluait à un changement, et
// ÉCRIVAIT 20 dans la nouvelle matière au premier `blur`.
//
// ── POURQUOI UN TEST STATIQUE ───────────────────────────────────────────────
//
// Le défaut vit dans la RÉCONCILIATION de React, pas dans une fonction pure :
// le reproduire demanderait un rendu DOM, que ce dépôt n'outille pas. Ce que
// l'on peut verrouiller sans rendu, et qui suffit, c'est l'invariant qui le
// rend impossible : TANT QUE le champ est non contrôlé, la clé de ligne DOIT
// porter l'identifiant de la matière. Le test vérifie donc les deux moitiés
// ensemble — et, si un jour quelqu'un passe le champ en contrôlé, il le dit au
// lieu d'échouer bêtement.
//
//   node src/components/grades/_saisieChangeDeMatiere.test.mjs
import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const ok = (c, label, détail) => {
  if (c) { pass++; console.log(`✅ ${label}`); }
  else { fail++; console.log(`❌ ${label}${détail ? `\n     ${détail}` : ''}`); }
};

// Les DEUX panneaux de saisie d'une note numérique. Ils ont été écrits
// séparément et portaient le même défaut : ils doivent porter la même parade.
const PANNEAUX = [
  ['src/components/grades/GradeGrid.jsx', 'Tableau'],
  ['src/pages/Grades.jsx', 'Saisie rapide'],
];

for (const [chemin, nom] of PANNEAUX) {
  console.log(`\n-- ${nom} (${chemin}) --`);
  const src = readFileSync(new URL(`../../../${chemin}`, import.meta.url), 'utf8');

  const nonControle = /defaultValue=\{displayGrade\(/.test(src);
  ok(true, nonControle
    ? 'le champ de note est non contrôlé : la clé de ligne doit porter la matière'
    : 'le champ de note est devenu CONTRÔLÉ — relire ce test, son invariant a changé');

  // La clé de matière est calculée une fois, avec un repli si l'objet matière
  // n'a pas d'identifiant (le nom suffit à distinguer deux matières à l'écran).
  ok(/const cleMatiere = subject\?\.id \?\? subject\?\.name \?\? '';/.test(src),
    'la clé de matière est dérivée de subject.id, avec repli sur le nom');

  // LE CŒUR : l'identifiant de la matière est dans la clé des lignes d'élèves.
  // Le motif doit accepter les accolades INTERNES d'un gabarit — `${s.id}` — sans
  // s'arrêter à la première : c'est justement la forme que l'on veut voir.
  const clesDeLigne = [...src.matchAll(/<(tr|div) key=\{((?:[^{}]|\$\{[^{}]*\})*)\}/g)].map((m) => m[2]);
  const clesEleve = clesDeLigne.filter((k) => /\bs\.id\b/.test(k));
  ok(clesEleve.length > 0, 'une ligne par élève est bien keyée', `clés vues : ${clesDeLigne.join(' | ')}`);
  ok(clesEleve.length > 0 && clesEleve.every((k) => k.includes('cleMatiere')),
    'CHAQUE ligne d’élève porte la matière dans sa clé',
    `clés d’élève : ${clesEleve.join(' | ')}`);
  // Le défaut exact, nommé : une clé qui ne serait QUE l'élève.
  ok(!/key=\{s\.id\}/.test(src),
    'plus aucune ligne keyée sur le seul élève (c’était le défaut)');

  // L'état par élève parle de la matière affichée : il doit tomber avec elle.
  // Sinon un point « non enregistré » ou un ✓ de Mathématiques s'afficherait en
  // Informatique — un mensonge moins grave que la note, mais un mensonge.
  const reinit = src.match(/if \(matiereAffichee !== cleMatiere\) \{([\s\S]{0,320}?)\n  \}/);
  ok(!!reinit, 'l’état est réinitialisé quand la matière change');
  if (reinit) {
    const corps = reinit[1];
    ok(/setMatiereAffichee\(cleMatiere\)/.test(corps),
      'la garde est refermée (sinon le rendu bouclerait)');
    ok(/setErrors\(new Set\(\)\)/.test(corps), 'les erreurs de l’autre matière sont effacées');
    ok(/setSavedId\(null\)/.test(corps), 'le ✓ « enregistré » de l’autre matière est effacé');
    // `dirty` n'existe que dans le Tableau ; on ne l'exige que là.
    if (/const \[dirty,/.test(src)) {
      ok(/setDirty\(new Set\(\)\)/.test(corps), 'le point « non enregistré » est effacé');
    }
  }
}

// ── Ce qui rendait la note FAUSSE, et pas seulement mal affichée ────────────
// `commit` écrit dès que la valeur du champ diffère de la note stockée. C'est le
// bon comportement — c'est ce qui permet la sauvegarde auto — mais c'est lui qui
// transformait un affichage périmé en écriture. On fige donc sa présence : si
// cette comparaison disparaissait, le test ci-dessus perdrait son enjeu.
{
  console.log('\n-- l’écriture automatique, qui donnait au défaut sa gravité --');
  const grid = readFileSync(new URL('../../../src/components/grades/GradeGrid.jsx', import.meta.url), 'utf8');
  ok(/if \(v !== \(scoresFor\(student\.id\) \?\? ''\)\) \{\s*\n\s*onCommit\(/.test(grid),
    'commit() écrit dès que le champ diffère de la note stockée (sauvegarde auto)');
  ok(/onBlur=\{\(e\) => commit\(/.test(grid),
    'et il s’exécute au blur — donc au premier clic ailleurs');
}

console.log(`\n${fail ? '❌' : '✅'} Saisie / changement de matière : ${pass} contrôle(s) ok, ${fail} ko`);
process.exitCode = fail ? 1 : 0;
