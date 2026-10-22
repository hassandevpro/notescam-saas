// LE CARNET DU PRIMAIRE DOIT ÊTRE LE MÊME DANS LES DEUX DISPOSITIONS.
//
// ── CE QUE CE TEST EMPÊCHE DE REVENIR ───────────────────────────────────────
//
// `schools.prim_bulletin_mode = 'carnet'` ajoute cinq blocs au bulletin du
// primaire (les six regroupements officiels, le travail académique, les stats
// de performance, la répartition par tranche de moyenne, la signature du
// parent). Ils n'étaient câblés que sur la disposition COMPACTE.
//
// Or le choix de disposition est AUTOMATIQUE par défaut : une période d'UNE
// unité d'apprentissage → compacte, un trimestre (UA1-3) → détaillée. L'école
// qui cochait « carnet » obtenait donc son carnet sur une UA et le perdait en
// imprimant son trimestre — même réglage, même classe, deux bulletins
// différents, et rien à l'écran pour l'expliquer.
//
// DEUX PROPRIÉTÉS SONT VERROUILLÉES ICI :
//   1. les deux gabarits reçoivent les MÊMES props de carnet depuis l'écran,
//      et les mentions du conseil de classe sont lues en UN seul endroit ;
//   2. les regroupements calculés sur la forme DÉTAILLÉE d'une ligne donnent
//      exactement ceux de sa forme COMPACTE — mêmes familles, mêmes totaux,
//      mêmes moyennes. Sans cela, un parent pourrait lire deux totaux de
//      groupe différents pour le même enfant sur le même trimestre.
//
//   node src/core/_carnetPrimaire.test.mjs
import { readFileSync } from 'node:fs';
import { buildCompactRows, groupesDe } from './primCompactRows.js';

let pass = 0, fail = 0;
const ok = (c, label, got) => {
  if (c) { pass++; console.log(`✅ ${label}`); }
  else { fail++; console.log(`❌ ${label}` + (got === undefined ? '' : `  (obtenu: ${JSON.stringify(got)})`)); }
};
const titre = (t) => console.log(`\n-- ${t} --`);

// ── 1. CÂBLAGE : les deux gabarits, les mêmes props ────────────────────────
titre('Les deux dispositions reçoivent les blocs du carnet');
{
  const compact = readFileSync('src/components/bulletins/BulletinPrimCompact.jsx', 'utf8');
  const detail  = readFileSync('src/components/bulletins/BulletinPrimAnnualUA.jsx', 'utf8');
  const ecran   = readFileSync('src/pages/Bulletins.jsx', 'utf8');

  for (const [nom, src] of [['compacte', compact], ['détaillée', detail]]) {
    ok(/from '\.\.\/\.\.\/core\/primCompactRows'/.test(src),
      `disposition ${nom} : les regroupements viennent du moteur, pas d'un calcul local`);
    for (const prop of ['mentions', 'repartition', 'groupes']) {
      ok(new RegExp(`\\b${prop}\\b`).test(src), `disposition ${nom} : accepte « ${prop} »`);
    }
  }

  // L'écran doit passer les trois props aux DEUX gabarits. On compte les
  // occurrences : une seule signifierait qu'un des deux a été oublié.
  for (const prop of ['mentions=', 'repartition=', 'groupes=']) {
    const n = (ecran.match(new RegExp(prop.replace('=', '\\s*='), 'g')) || []).length;
    ok(n >= 2, `Bulletins.jsx : « ${prop} » passé aux deux gabarits`, `${n} occurrence(s)`);
  }

  // UNE seule lecture des mentions du conseil de classe, appelée deux fois.
  ok((ecran.match(/const primMentionsFor\s*=/g) || []).length === 1,
    'Bulletins.jsx : les mentions sont lues par UNE fonction');
  ok((ecran.match(/primMentionsFor\(student\)/g) || []).length === 2,
    'Bulletins.jsx : cette fonction sert aux DEUX dispositions');
  ok(!/mentions=\{!primCarnet \? undefined : \(\(\) =>/.test(ecran),
    'Bulletins.jsx : plus d\'expression recopiée dans le JSX');
  // Le réglage reste celui de l'école, jamais son nom. On contrôle le CODE,
  // commentaires retirés : citer l'école modèle dans un commentaire est utile,
  // c'est la comparer dans une condition qui serait le défaut.
  const code = ecran.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  ok(/prim_bulletin_mode === 'carnet'/.test(ecran),
    'Bulletins.jsx : le carnet vient du réglage de l\'école');
  ok(!/GENIUS/i.test(code),
    'Bulletins.jsx : aucun nom d\'école en dur dans le code');
}

// ── 2. MÊMES REGROUPEMENTS SUR LES DEUX FORMES DE LIGNE ────────────────────
// Les onze compétences nationales, avec les domaines RÉELS de la production,
// une non évaluée (4A) et une compétence maison numérotée (1D).
const CRITERES = [{ id: 'oral', nom: 'Oral', points_max: 20 }];
const ligne = (code, domaine, achieved, possible) => ({
  code, intitule: code, domaine, criteres: CRITERES,
  uas: achieved == null ? [] : [{
    ua: 1, trimestre: 1, notesByCritere: { oral: achieved }, baremes: { oral: possible },
    achieved, possible, cote: null,
  }],
  totalAchieved: achieved, totalPossible: possible, totalCote: null,
});

const COMP_ROWS = [
  ligne('1A', 'langues', 36, 40),
  ligne('1B', 'langues', 34, 40),
  ligne('1C', 'langues', 38, 40),
  ligne('1D', 'langues', 18, 20),          // maison, numérotée → rejoint le groupe 1
  ligne('2A', 'maths_sciences', 28, 30),
  ligne('2B', 'maths_sciences', 27, 30),
  ligne('3A', 'vie_citoyennete', 19, 20),
  ligne('4A', 'autonomie', null, 20),      // NON évaluée
  ligne('5A', 'tic', 20, 20),
  ligne('6A', 'arts_sport', 19, 20),
  ligne('6B', 'arts_sport', 17.5, 20),
];

// Ce que fait le gabarit DÉTAILLÉ : il réduit la ligne complète aux quatre
// champs dont les regroupements ont besoin. Même règle que `buildCompactRows`
// pour une compétence non évaluée : pas de barème compté.
const formeDetaillee = (rows) => rows.map((r) => ({
  code: r.code, domaine: r.domaine ?? null,
  achieved: r.totalAchieved ?? null,
  possible: r.totalAchieved == null ? null : (r.totalPossible ?? null),
}));

for (const sys of ['FR', 'EN']) {
  titre(`Les mêmes six regroupements en ${sys}, quelle que soit la disposition`);
  const gCompact = groupesDe(buildCompactRows(COMP_ROWS).rows, sys);
  const gDetail  = groupesDe(formeDetaillee(COMP_ROWS), sys);

  ok(gCompact.length === 6, 'disposition compacte : six regroupements', gCompact.length);
  ok(gDetail.length === 6, 'disposition détaillée : six regroupements', gDetail.length);
  ok(JSON.stringify(gCompact) === JSON.stringify(gDetail),
    'les deux dispositions donnent EXACTEMENT les mêmes groupes',
    { compact: gCompact.map((g) => [g.numero, g.achieved, g.moyenne]), detail: gDetail.map((g) => [g.numero, g.achieved, g.moyenne]) });

  // Et les nombres sont ceux du carnet imprimé, pas seulement « les mêmes ».
  const g1 = gDetail.find((g) => g.numero === 1);
  ok(g1 && g1.codes.join(',') === '1A,1B,1C,1D', 'le groupe 1 porte 1A, 1B, 1C et la maison 1D', g1?.codes);
  ok(g1 && g1.achieved === 126 && g1.possible === 140, 'groupe 1 : 126 / 140', [g1?.achieved, g1?.possible]);
  ok(g1 && g1.moyenne === 18, 'groupe 1 : moyenne 18 sur 20', g1?.moyenne);

  // Une compétence non évaluée ne vaut pas zéro : son groupe reste vide.
  const g4 = gDetail.find((g) => g.numero === 4);
  ok(g4 && g4.achieved === null && g4.moyenne === null,
    'le groupe de la compétence non évaluée ne vaut pas 0', [g4?.achieved, g4?.moyenne]);
}

// ── 3. CARNET ÉTEINT : le bulletin ne bouge pas ────────────────────────────
titre('Sans le réglage, rien ne s ajoute');
{
  // `groupes` à faux ⇒ aucun regroupement calculé : c'est ce que les deux
  // gabarits font (`avecGroupes ? groupesDe(...) : []`). Le contrôle porte
  // donc sur la présence de ce garde-fou dans les deux fichiers.
  for (const f of ['src/components/bulletins/BulletinPrimCompact.jsx',
    'src/components/bulletins/BulletinPrimAnnualUA.jsx']) {
    const src = readFileSync(f, 'utf8');
    ok(/avecGroupes\s*\?\s*groupesDe\(/.test(src.replace(/\s+/g, ' ')),
      `${f.split('/').pop()} : aucun regroupement calculé quand le carnet est éteint`);
    ok(/groupes:\s*avecGroupes\s*=\s*false/.test(src),
      `${f.split('/').pop()} : le carnet est ÉTEINT par défaut`);
  }
}

console.log(`\n${fail ? '❌' : '✅'} Carnet du primaire, deux dispositions : ${pass} contrôle(s) ok, ${fail} ko`);
process.exitCode = fail ? 1 : 0;
