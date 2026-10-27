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
import { buildCompactRows, groupesDe, reperesDeGroupe } from './primCompactRows.js';

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

// ── 4. UNE FAMILLE COUPÉE EN DEUX N'IMPRIME QU'UN BANDEAU ET QU'UN TOTAL ───
//
// LE CAS RÉEL (THE GENIUS, CE2 BIL, relevé le 2026-10-27). Trois compétences
// MAISON — « CH Chinois », « PW Practical Work », « EG Économie Générale » —
// n'ont ni domaine ni numéro dans leur code, donc `groupesDe` les laisse hors
// regroupement, à dessein. Mais leur `ordre` (101, 102, 103) les plaçait entre
// 6A (100) et 6B (110) : la famille 6 n'était plus contiguë. Les deux gabarits
// décidaient alors en regardant la ligne voisine, et imprimaient
// « 6) PRATIQUER LES ACTIVITÉS PHYSIQUES… » DEUX fois, avec le même total.
titre('Une compétence maison intercalée ne dédouble pas le regroupement');
{
  const GENIUS = [
    ligne('1A', 'langues', 36, 40),
    ligne('6A', 'arts_sport', 19, 20),
    ligne('CH', null, 18, 20),   // maison : ni domaine, ni numéro dans le code
    ligne('PW', null, 15, 20),
    ligne('EG', null, 17, 20),
    ligne('6B', 'arts_sport', 17.5, 20),
  ];
  const rows = formeDetaillee(GENIUS);
  const groupes = groupesDe(rows, 'FR');
  const { debut, fin } = reperesDeGroupe(rows, groupes);

  ok(groupes.length === 2, 'deux familles seulement : la 1 et la 6', groupes.length);
  const g6 = groupes.find((g) => g.numero === 6);
  ok(g6 && g6.codes.join(',') === '6A,6B', 'la famille 6 reste 6A + 6B', g6?.codes);

  // Le cœur du défaut : UN bandeau et UN total par famille, pas un par morceau.
  ok(debut.size === groupes.length, 'autant de bandeaux que de familles', debut.size);
  ok(fin.size === groupes.length, 'autant de totaux que de familles', fin.size);

  // Et ils tombent aux bons endroits : le bandeau sur 6A (index 1), le total
  // sur 6B (index 5) — pas sur 6A, qui est la fin du premier morceau.
  ok(debut.get(1) === g6, 'le bandeau de la famille 6 s ouvre sur 6A', [...debut.keys()]);
  ok(fin.get(5) === g6, 'le total de la famille 6 se pose sur 6B', [...fin.keys()]);
  ok(fin.get(1) === undefined, 'aucun total posé sur 6A, qui n est pas la dernière', fin.get(1)?.codes);

  // Les trois maisons restent des lignes visibles, simplement hors famille :
  // on ne les masque pas, on cesse de compter leur voisinage comme une rupture.
  for (const [i, code] of [[2, 'CH'], [3, 'PW'], [4, 'EG']]) {
    ok(debut.get(i) === undefined && fin.get(i) === undefined,
      `« ${code} » ne porte ni bandeau ni total`);
  }
  // Le total de la famille 6 ne compte QUE 6A et 6B : 36.5 / 40.
  ok(g6.achieved === 36.5 && g6.possible === 40, 'famille 6 : 36.5 / 40, les maisons exclues',
    [g6.achieved, g6.possible]);
}

// Non-régression : sur des familles contiguës, les repères sont EXACTEMENT ceux
// que donnait la comparaison avec la ligne voisine.
titre('Sur des familles contiguës, rien ne change');
{
  const rows = formeDetaillee(COMP_ROWS);
  const groupes = groupesDe(rows, 'FR');
  const { debut, fin } = reperesDeGroupe(rows, groupes);
  const groupeDe = new Map();
  for (const g of groupes) for (const code of g.codes) groupeDe.set(code, g);
  // L'ancienne règle, rejouée telle quelle.
  const ancienDebut = (i) => {
    const g = groupeDe.get(rows[i]?.code);
    return !g || groupeDe.get(rows[i - 1]?.code) === g ? null : g;
  };
  const ancienFin = (i) => {
    const g = groupeDe.get(rows[i]?.code);
    return !g || groupeDe.get(rows[i + 1]?.code) === g ? null : g;
  };
  let ecarts = 0;
  rows.forEach((_, i) => {
    if ((debut.get(i) || null) !== ancienDebut(i)) ecarts++;
    if ((fin.get(i) || null) !== ancienFin(i)) ecarts++;
  });
  ok(ecarts === 0, 'mêmes bandeaux et mêmes totaux qu avant sur les 11 compétences', ecarts);
}

// Et le garde-fou de source : plus aucun gabarit ne regarde la ligne voisine.
titre('Les gabarits ne décident plus sur la ligne voisine');
{
  for (const f of ['src/components/bulletins/BulletinPrimCompact.jsx',
    'src/components/bulletins/BulletinPrimAnnualUA.jsx']) {
    const src = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    ok(/reperesDeGroupe\(/.test(src), `${f.split('/').pop()} : les repères viennent du moteur`);
    ok(!/\[i \+ 1\]|\[i - 1\]/.test(src),
      `${f.split('/').pop()} : aucune comparaison avec la ligne voisine`);
  }
  // La cause racine : un `ordre` de ligne maison ne doit plus tomber dans la
  // plage du référentiel national (10 à 110 pour le primaire).
  const store = readFileSync('src/store/schoolStore.js', 'utf8');
  ok(!/ordre:\s*90\s*\+\s*lignes\.length/.test(store),
    'schoolStore : plus de « 90 + lignes.length », qui tombait entre 6A et 6B');
  ok(/Math\.max\(m,\s*Number\(l\.ordre\)/.test(store),
    'schoolStore : une ligne maison se range APRÈS la dernière existante');
}

console.log(`\n${fail ? '❌' : '✅'} Carnet du primaire, deux dispositions : ${pass} contrôle(s) ok, ${fail} ko`);
process.exitCode = fail ? 1 : 0;
