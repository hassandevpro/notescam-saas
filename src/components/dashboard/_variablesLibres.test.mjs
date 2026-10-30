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
      // `({ school, … })` — l'accolade n'est PAS forcément fermée sur la même
      // ligne : `.map(({ cls, subs, studs,` continue plus bas. Exiger le `}`
      // faisait passer six déclarations RÉELLES pour des variables libres.
      || new RegExp(`\\(\\s*\\{[^)]*\\b${nom}\\b`).test(l)
      || new RegExp(`function\\s+[A-Za-z0-9_$]*\\s*\\([^)]*\\b${nom}\\b`).test(l)
      // PARAMÈTRE DE FONCTION FLÉCHÉE : `(cls) =>`, `(cls, i) =>`, `cls =>`.
      // C'est la forme de loin la plus courante pour `cls` (`classes.map(…)`),
      // et le détecteur ne la connaissait pas — il n'avait jamais eu à la
      // connaître, `school` n'étant jamais un paramètre de callback.
      //
      // LE `=>` EST OBLIGATOIRE DANS LE MOTIF. Sans lui, `bulletinScale(cls,`
      // passerait pour une déclaration et le détecteur deviendrait aveugle à
      // la faute même qu'il est là pour voir. L'auto-vérification le prouve.
      || new RegExp(`\\(\\s*${nom}\\s*(?:,[^)]*)?\\)\\s*=>`).test(l)
      || new RegExp(`(^|[^A-Za-z0-9_$.])${nom}\\s*=>`).test(l)
      // DESTRUCTURATION ÉTALÉE SUR PLUSIEURS LIGNES : une ligne qui n'est QUE
      // des noms séparés par des virgules est la suite d'un `({` ouvert plus
      // haut — `  school, cls, student, subjects, subjectGrades,` dans
      // `BulletinClassic`. Le nom peut être N'IMPORTE OÙ dans cette liste, pas
      // seulement en fin de ligne.
      //
      // Aucune parenthèse n'est admise dans le motif, et c'est ce qui le rend
      // sûr : `bulletinScale(cls, sys, …)` en porte, donc il ne peut pas se
      // faire prendre pour une déclaration.
      || new RegExp(`^[A-Za-z0-9_$,\\s]*\\b${nom}\\b[A-Za-z0-9_$,\\s]*$`).test(l)
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


// ── « cls », LA SECONDE VARIABLE LIBRE DE LA MÊME PASSE ─────────────────────
//
// Le 2026-10-30, le responsable signale : « le rapport ne s'ouvre pas ». Mesuré
// sur l'édition LAN montée, compte administrateur, /app/reports :
//
//     ReferenceError: cls is not defined
//     at Ha (Reports-tPP_kFQD.js:266:7206)
//
// `Reports.jsx` l.896 appelait `bulletinScale(cls, sys, geGradeMax(school))`
// alors que le nom local de la classe choisie y est `selectedClass`. La ligne
// vient de `e442496`, « la passe du 2026-10-26 » — LA MÊME que celle qui a
// laissé `school` libre dans AcademicBlocks. Elle a donc laissé DEUX variables
// libres, et ce test n'en surveillait qu'UNE.
//
// L'écran Rapports était mort depuis la 0.3.26, pour TOUS les rôles : la ligne
// s'exécute dans le corps du composant, sans condition. Personne ne l'avait vu
// parce que les 224 tests ne rendent aucun composant, et que la passe précédente
// avait été jugée refermée sur `school`.
//
// LA LEÇON, et c'est elle qui justifie ce bloc : un détecteur réglé sur UN nom
// ne couvre pas une faute de COPIE, qui déplace un identifiant quelconque. On
// surveille donc chaque nom que cette passe a promené.
const NOMS_PROMENES = ['school', 'cls'];
titre('Aucun écran ne lit « cls » sans le recevoir');
for (const rel of ECRANS) {
  const libres = librePour(readFileSync(join(SRC, rel), 'utf8'), 'cls');
  ok(libres.length === 0, `${rel} — « cls » toujours dans sa portée`,
     libres.length ? libres.map((x) => `${x.bloc}() l.${x.ligne} : ${x.texte}`) : undefined);
}
ok(NOMS_PROMENES.length === 2, 'les deux noms de la passe du 26/10 sont surveillés');

titre('AUTO-VÉRIFICATION : le détecteur refuse le source fautif de Reports');
{
  // Le source tel qu'il était, réduit à l'essentiel.
  const fautif = [
    "export default function Reports() {",
    "  const selectedClass = classes.find((c) => c.id === classId) || null;",
    "  const sys = selectedClass?.system || 'FR';",
    "  const maxScale = bulletinScale(cls, sys, geGradeMax(school)).maxScale;",
    "  return maxScale;",
    "}",
  ].join('\n');
  const vus = librePour(fautif, 'cls');
  ok(vus.length === 1 && vus[0].bloc === 'Reports',
     'le détecteur voit « cls » libre dans Reports', vus);

  // Et il ne crie PAS là où `cls` est un paramètre — le cas NORMAL, de loin le
  // plus fréquent : sans cette garantie, le test hurlerait sur tout le dépôt.
  const innocent = [
    "export function computeClassReport(cls, period, ctx) {",
    "  return bulletinScale(cls, cls?.system, 20).maxScale;",
    "}",
  ].join('\n');
  ok(librePour(innocent, 'cls').length === 0,
     "il ne confond pas un paramètre `cls` avec une variable libre");
}

console.log(`\n=== ${pass} réussi(s), ${fail} échoué(s) ===`);
process.exit(fail ? 1 : 0);
