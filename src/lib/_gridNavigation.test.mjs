// LA SAISIE AU CLAVIER DOIT RESTER PLUS RAPIDE QUE LA SOURIS.
//
// Ce test verrouille les deux règles qu'on casse sans s'en rendre compte :
// ← et → ne volent pas le curseur au milieu d'un nombre, et le focus ne tombe
// jamais sur une cellule fermée.
//
//   node src/lib/_gridNavigation.test.mjs
import { readFileSync } from 'node:fs';
import { celluleSuivante } from './gridNavigation.js';

let pass = 0, fail = 0;
const ok = (c, label, got) => {
  if (c) { pass++; console.log(`✅ ${label}`); }
  else { fail++; console.log(`❌ ${label}` + (got === undefined ? '' : `  (obtenu: ${JSON.stringify(got)})`)); }
};
const titre = (t) => console.log(`\n-- ${t} --`);

// Une classe de 3 élèves × 4 critères (Oral, Écrit, Pratique, Savoir-être).
const G = { rows: 3, cols: 4 };
const de = (row, col, extra = {}) => ({ ...G, row, col, ...extra });

// ── 1. DESCENDRE ET MONTER DANS LA COLONNE ─────────────────────────────────
titre('Entrée et les flèches verticales avancent d un élève');
{
  ok(JSON.stringify(celluleSuivante('ArrowDown', de(0, 1))) === '{"row":1,"col":1}',
    '↓ descend d une ligne, même colonne', celluleSuivante('ArrowDown', de(0, 1)));
  ok(JSON.stringify(celluleSuivante('Enter', de(0, 1))) === '{"row":1,"col":1}',
    'Entrée fait la même chose que ↓ — c est le geste le plus courant');
  ok(JSON.stringify(celluleSuivante('ArrowUp', de(2, 3))) === '{"row":1,"col":3}',
    '↑ remonte d une ligne');
  ok(celluleSuivante('ArrowDown', de(2, 0)) === null,
    'au DERNIER élève, ↓ ne sort pas de la grille', celluleSuivante('ArrowDown', de(2, 0)));
  ok(celluleSuivante('ArrowUp', de(0, 0)) === null, 'au PREMIER élève, ↑ non plus');
}

// ── 2. LA RÈGLE QUI SE SENT : ← et → appartiennent d abord au curseur ──────
titre('← et → ne changent de colonne qu au bord du texte');
{
  // L'enseignante écrit « 15 » et veut corriger le « 1 » : ← doit rester dans
  // le champ. C'est le cas qui rendrait la fonctionnalité détestable.
  ok(celluleSuivante('ArrowLeft', de(0, 2), { auDebut: false }) === null,
    'curseur AU MILIEU d un nombre : ← reste dans le champ');
  ok(celluleSuivante('ArrowRight', de(0, 2), { aLaFin: false }) === null,
    'curseur AU MILIEU d un nombre : → reste dans le champ');

  ok(JSON.stringify(celluleSuivante('ArrowLeft', de(0, 2), { auDebut: true })) === '{"row":0,"col":1}',
    'curseur au DÉBUT : ← passe au critère précédent');
  ok(JSON.stringify(celluleSuivante('ArrowRight', de(0, 2), { aLaFin: true })) === '{"row":0,"col":3}',
    'curseur à la FIN : → passe au critère suivant');

  ok(celluleSuivante('ArrowLeft', de(0, 0), { auDebut: true }) === null,
    'au PREMIER critère, ← ne sort pas de la grille');
  ok(celluleSuivante('ArrowRight', de(0, 3), { aLaFin: true }) === null,
    'au DERNIER critère, → ne sort pas de la grille');
  // Un champ vide est à la fois au début et à la fin : les deux doivent passer.
  ok(celluleSuivante('ArrowRight', de(1, 1), { auDebut: true, aLaFin: true }) !== null,
    'un champ VIDE laisse passer → du premier coup');
}

// ── 3. ON NE POSE JAMAIS LE FOCUS SUR UNE CELLULE FERMÉE ───────────────────
titre('Une cellule fermée est enjambée, pas sélectionnée');
{
  // Élève inapte en 6A : « Pratique » (colonne 2) lui est fermée.
  const sansPratique = de(0, 1, { actif: (r, c) => c !== 2 });
  ok(JSON.stringify(celluleSuivante('ArrowRight', sansPratique, { aLaFin: true })) === '{"row":0,"col":3}',
    '→ enjambe la colonne fermée et atteint la suivante',
    celluleSuivante('ArrowRight', sansPratique, { aLaFin: true }));

  // Une école qui n'évalue qu'à l'écrit : seule la colonne 1 reste ouverte.
  const ecritSeul = de(0, 1, { actif: (r, c) => c === 1 });
  ok(celluleSuivante('ArrowRight', ecritSeul, { aLaFin: true }) === null,
    'plus aucune colonne ouverte à droite : on ne bouge pas');
  ok(JSON.stringify(celluleSuivante('ArrowDown', ecritSeul)) === '{"row":1,"col":1}',
    'mais ↓ continue de descendre dans la colonne ouverte');

  // Une ligne entière fermée au milieu de la colonne.
  const trou = de(0, 0, { actif: (r) => r !== 1 });
  ok(JSON.stringify(celluleSuivante('ArrowDown', trou)) === '{"row":2,"col":0}',
    '↓ enjambe un élève dont la cellule est fermée', celluleSuivante('ArrowDown', trou));
}

// ── 4. CE QU ON NE TOUCHE SURTOUT PAS ──────────────────────────────────────
titre('Les autres touches ne sont pas interceptées');
{
  for (const k of ['Tab', 'Escape', 'Backspace', 'a', '5', ',', 'Home', 'End', 'PageDown']) {
    if (celluleSuivante(k, de(1, 1), { auDebut: true, aLaFin: true }) !== null) {
      fail++; console.log(`❌ « ${k} » ne doit pas être interceptée`);
    }
  }
  ok(true, 'Tab, Échap, Retour arrière, chiffres, Home/End, PageDown passent au champ');
  // Tab reste la navigation NATIVE du navigateur : on ne la réimplémente pas,
  // sinon on casse l'ordre de tabulation et l'accessibilité.
  ok(celluleSuivante('Tab', de(0, 0)) === null, 'Tab en particulier reste au navigateur');
}

// ── 5. ENTRÉES ABERRANTES ──────────────────────────────────────────────────
titre('Une grille mal formée ne jette pas');
{
  ok(celluleSuivante('ArrowDown', null) === null, 'grille absente');
  ok(celluleSuivante('ArrowDown', {}) === null, 'grille sans coordonnées');
  ok(celluleSuivante('ArrowDown', de(0, 0, { rows: 0, cols: 0 })) === null, 'grille vide');
  ok(celluleSuivante('ArrowDown', de(0, 0)) !== undefined, 'jamais `undefined` — toujours null ou une cible');
}

// ── 6. CÂBLAGE : les deux grilles par compétence s en servent ──────────────
titre('Les grilles par compétence sont bien câblées');
{
  for (const f of ['PrimCompetenceWorkspace', 'ApcCompetenceWorkspace']) {
    const src = readFileSync(`src/components/grades/${f}.jsx`, 'utf8');
    ok(src.includes('celluleSuivante'), `${f} : importe la navigation`);
    ok(/auDebut:/.test(src) && /aLaFin:/.test(src),
      `${f} : lit la position du curseur — sans elle, ← et → voleraient le curseur`);
    ok(/selectionStart/.test(src), `${f} : la position vient du champ lui-même`);
  }
}

console.log(`\n${fail ? '❌' : '✅'} Navigation au clavier : ${pass} contrôle(s) ok, ${fail} ko`);
process.exitCode = fail ? 1 : 0;
