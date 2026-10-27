// LA VARIABLE LIBRE : « school is not defined », et la page blanche
//
// ── CE QUE CE TEST EMPÊCHE DE REVENIR ───────────────────────────────────────
//
// Le 2026-10-27, l'école envoie le rapport de panne que l'écran d'erreur (D24)
// venait d'ajouter :
//
//     Serveur : 0.3.25
//     Erreur  : school is not defined
//     at Ps (Dashboard-KK9sTTpl.js:1:27494)  at Array.map
//
// `ClassTable` (AcademicBlocks.jsx) appelait `geGradeMax(school)` alors qu'il ne
// reçoit QUE `classStats` : `school` y était une VARIABLE LIBRE, héritée de la
// passe D21 bis qui avait porté la même ligne dans neuf fichiers. Tout compte
// administrateur ouvrant /app tombait dessus — c'est son écran d'accueil.
//
// ── POURQUOI RIEN NE L'A VU ─────────────────────────────────────────────────
//
// `npm run build:lan` sort en 0 : Rollup ne signale pas une variable libre, il
// SUPPOSE un global. Le dépôt n'a pas de linter, donc pas de `no-undef`. Et les
// 208 tests ne rendent aucun composant : la faute n'existe qu'au rendu de
// celui-là. Trois filets, trois mailles trop larges, et un seul chemin vers le
// défaut : l'écran d'accueil de l'administrateur.
//
// Ce test est le quatrième filet, et le seul qui coûte zéro dépendance : il lit
// le source, découpe chaque fichier en blocs de premier niveau, et vérifie
// qu'aucun bloc ne LIT `school` sans le DÉCLARER. Les chaînes de caractères et
// les commentaires sont retirés avant l'analyse — sans quoi « Previous school »
// ou « school calendar » feraient hurler le test à tort, et un test qui crie
// pour rien finit ignoré.
//
// Il se termine par une AUTO-VÉRIFICATION : on lui donne le source fautif tel
// qu'il était, et on exige qu'il le refuse. Un détecteur qu'on n'a jamais vu
// détecter n'est pas un détecteur.
//
//   node src/components/dashboard/_variablesLibres.test.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ICI = dirname(fileURLToPath(import.meta.url));
const SRC = join(ICI, '..', '..');

let pass = 0, fail = 0;
const ok = (c, label, got) => {
  if (c) { pass++; console.log(`✅ ${label}`); }
  else { fail++; console.log(`❌ ${label}${got === undefined ? '' : `  (obtenu: ${JSON.stringify(got)})`}`); }
};
const titre = (t) => console.log(`\n-- ${t} --`);

// ── Retire commentaires et littéraux de chaîne, en GARDANT les ${…} des
//    gabarits : c'est du code, et `${geGradeMax(school)}` doit rester visible.
function sansTexte(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')          // /* … */
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')       // // …  (sans casser http://)
    // Gabarits : on ne GARDE que les ${…}, qui sont du code. Le texte autour
    // est de la traduction — c'est lui qui faisait hurler le test sur
    // « school calendar » et « Previous school ».
    .replace(/`(?:[^`\\]|\\.)*`/g, (g) => (g.match(/\$\{[^{}]*\}/g) || []).join(' ') || '""')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""');
}

// ── Découpe en blocs de PREMIER NIVEAU (colonne 0) ──────────────────────────
const DEBUT = /^(export\s+)?(default\s+)?(async\s+)?function\s+([A-Za-z0-9_$]+)|^(export\s+)?(default\s+)?const\s+([A-Za-z0-9_$]+)\s*=/;

function librePour(src, nom) {
  const lignes = sansTexte(src).split('\n');

  // Déclaré au ras du module (import, const de fichier) : vaut partout.
  const auModule = lignes.some((l) => (
    new RegExp(`^import\\s[^;]*\\b${nom}\\b`).test(l)
    || new RegExp(`^(const|let|var)\\s+(\\{[^}]*\\b${nom}\\b[^}]*\\}|${nom}\\b)`).test(l)
  ));
  if (auModule) return [];

  const blocs = [];
  lignes.forEach((l, i) => {
    const m = l.match(DEBUT);
    if (m) blocs.push({ nom: m[4] || m[7], debut: i, fin: lignes.length });
  });
  blocs.forEach((b, i) => { if (blocs[i + 1]) b.fin = blocs[i + 1].debut; });

  // `nom:` n'est JAMAIS une lecture : c'est une clé d'objet (`{ school: … }`)
  // ou un renommage de destructuration (`{ school: ecole }`), qui déclare autre
  // chose. Sans cette exception, `bodyHtmlFor({ school: classIdentity(…) })`
  // passait pour une variable libre.
  const lecture = new RegExp(`(^|[^A-Za-z0-9_$.])${nom}(?!\\s*:)([^A-Za-z0-9_$]|$)`);
  const trouves = [];
  for (const b of blocs) {
    const corps = lignes.slice(b.debut, b.fin);
    const i = corps.findIndex((l) => lecture.test(l));
    if (i < 0) continue;
    // Déclaré dans le bloc : paramètre, destructuration, const/let.
    const declare = corps.slice(0, i + 1).some((l) => (
      new RegExp(`^\\s*${nom}\\s*[,}:=]`).test(l)                       // prop sur sa ligne
      || new RegExp(`(const|let|var)\\s+\\{[^}]*\\b${nom}\\b`).test(l)  // const { school }
      || new RegExp(`(const|let|var)\\s+${nom}\\b`).test(l)             // const school
      || new RegExp(`\\(\\s*\\{[^)]*\\b${nom}\\b[^)]*\\}`).test(l)      // ({ school, … })
      || new RegExp(`function\\s+[A-Za-z0-9_$]*\\s*\\([^)]*\\b${nom}\\b`).test(l)
    ));
    if (!declare) trouves.push({ bloc: b.nom, ligne: b.debut + i + 1, texte: corps[i].trim().slice(0, 90) });
  }
  return trouves;
}

// ── Les écrans qui lisent le barème d'école. `school` y circule en prop, donc
//    c'est exactement là qu'il peut manquer sans que rien ne le dise. ───────
const ECRANS = [
  'components/dashboard/AcademicBlocks.jsx',
  'components/dashboard/TeacherDashboard.jsx',
  'pages/Bulletins.jsx',
  'pages/StudentProfile.jsx',
  'pages/ParentPortal.jsx',
  'pages/Reports.jsx',
  'pages/Dashboard.jsx',
  'pages/ConseilDeClasse.jsx',
  'pages/AcademicYear.jsx',
  'pages/Grades.jsx',
  'pages/Subjects.jsx',
];

titre('Aucun écran ne lit « school » sans le recevoir');
for (const rel of ECRANS) {
  const libres = librePour(readFileSync(join(SRC, rel), 'utf8'), 'school');
  ok(libres.length === 0, `${rel} — « school » toujours dans sa portée`,
     libres.length ? libres.map((x) => `${x.bloc}() l.${x.ligne} : ${x.texte}`) : undefined);
}

titre('Le barème du tableau de bord vient du hook, pas du tableau');
{
  const src = readFileSync(join(SRC, 'components/dashboard/AcademicBlocks.jsx'), 'utf8');
  const hook = src.slice(src.indexOf('export function useAcademicStats'), src.indexOf('export function AcademicsStats'));
  const table = src.slice(src.indexOf('export function ClassTable'));
  ok(/bulletinScale\(cls, sys, geGradeMax\(school\)\)/.test(hook),
     'useAcademicStats calcule le barème, là où `school` existe');
  ok(/maxScale, passThreshold \}/.test(hook) || /maxScale, passThreshold/.test(hook),
     'il le pose sur la ligne de statistiques');
  ok(!/geGradeMax/.test(table),
     'ClassTable ne cherche plus `school` — il lit ce que la ligne porte');
  ok(/maxScale: max, passThreshold: pass/.test(table),
     'ClassTable prend le barème dans la ligne');
}

titre('AUTO-VÉRIFICATION : le détecteur refuse bien le source fautif');
{
  // Le source tel qu'il était le 2026-10-27, réduit à l'essentiel.
  const fautif = [
    "export function useAcademicStats({ school, classes }) {",
    "  const classStats = classes.map((cls) => ({ cls, sys: cls.system }));",
    "  return { classStats };",
    "}",
    "",
    "export function ClassTable({ classStats }) {",
    "  return classStats.map(({ cls, sys }) => {",
    "    const { maxScale } = bulletinScale(cls, sys, geGradeMax(school));",
    "    return maxScale;",
    "  });",
    "}",
  ].join('\n');
  const vus = librePour(fautif, 'school');
  ok(vus.length === 1 && vus[0].bloc === 'ClassTable',
     'le détecteur voit la variable libre de ClassTable', vus);

  // Et il ne crie PAS sur un texte anglais qui contient le mot.
  const innocent = [
    "export function EditForm({ student }) {",
    "  return <label>{t('Ancien établissement', 'Previous school')}</label>;",
    "}",
  ].join('\n');
  ok(librePour(innocent, 'school').length === 0,
     "il ne confond pas le mot « school » d'une traduction avec du code");
}

console.log(`\n=== ${pass} réussi(s), ${fail} échoué(s) ===`);
process.exit(fail ? 1 : 0);
