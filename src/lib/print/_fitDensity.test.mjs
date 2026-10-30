// LA RECHERCHE DE DENSITÉ — l'invariant qui compte.
//
// Ce test ne vérifie pas que la page est bien remplie : il vérifie qu'elle ne
// DÉBORDE JAMAIS. C'est la seule propriété dont une école paie le prix — un
// bulletin un peu trop aéré coûte un regard, un bulletin sur deux pages coûte
// une feuille par élève et un bloc signatures orphelin.
//
// La recherche est une fonction PURE : elle reçoit une fonction de mesure. On
// lui en donne ici de méchantes — monotones, par paliers, bruitées — parce que
// la vraie, celle du DOM, n'est PAS strictement monotone : un mot qui repasse à
// la ligne fait remonter la feuille d'un cran alors qu'on vient de la
// resserrer.

import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import {
  chercherDensite, chercherReliquat, D_MIN, D_MAX, CIBLE_MIN,
} from './fitDensity.js';
import { facteurFit, MIN_FIT_SCALE } from './fitLiveSheets.js';

const UTILE = 1062; // la zone utile du profil « bulletin », en px

/** Une feuille dont la hauteur croît linéairement avec la densité. */
const lineaire = (bas, haut) => (d) => bas + (haut - bas) * d;

test('une feuille qui tient au plafond garde le plafond', () => {
  const r = chercherDensite(lineaire(600, 1000), { utilePx: UTILE });
  assert.equal(r.d, D_MAX);
  assert.equal(r.etat, 'plafond');
  assert.ok(r.hauteur <= UTILE);
  assert.equal(r.mesures, 1, 'un seul essai doit suffire : c’est le cas courant');
});

test('une feuille trop longue MÊME au plancher est signalée, pas écrasée', () => {
  const r = chercherDensite(lineaire(1400, 2000), { utilePx: UTILE });
  assert.equal(r.d, D_MIN);
  assert.equal(r.etat, 'plancher');
  assert.ok(r.hauteur > UTILE, 'le débordement doit rester visible dans le bilan');
});

test('entre les deux, on trouve la plus grande densité qui tient', () => {
  const mesure = lineaire(800, 1400);     // tient jusqu’à d ≈ 0,4367
  const r = chercherDensite(mesure, { utilePx: UTILE });
  assert.equal(r.etat, 'ajuste');
  assert.ok(r.hauteur <= UTILE, `${r.hauteur} px pour ${UTILE}`);
  // … et on ne s’arrête pas trop tôt : 10 pas de dichotomie sur [0,1] laissent
  // moins d’un millième, soit moins d’un pixel sur la plage complète.
  assert.ok(r.d > 0.43 && r.d <= 0.4367, `densité trouvée : ${r.d}`);
  assert.ok(r.remplissage >= CIBLE_MIN, `remplissage ${(r.remplissage * 100).toFixed(1)} %`);
});

test('LA PAGE N’EST JAMAIS DÉPASSÉE — balayage de 200 feuilles', () => {
  for (let bas = 300; bas <= 1200; bas += 50) {
    for (let haut = bas + 50; haut <= bas + 900; haut += 100) {
      const r = chercherDensite(lineaire(bas, haut), { utilePx: UTILE });
      if (r.etat === 'plancher') {
        assert.equal(r.d, D_MIN, 'au plancher, on rend le plancher');
      } else {
        assert.ok(r.hauteur <= UTILE,
          `[${bas}..${haut}] : ${r.hauteur} px rendus pour ${UTILE} px`);
        assert.ok(r.d >= D_MIN && r.d <= D_MAX, `densité hors bornes : ${r.d}`);
      }
    }
  }
});

test('une hauteur NON monotone ne fait pas déborder non plus', () => {
  // Le reflux du texte : par endroits, resserrer fait GRANDIR la feuille d’un
  // cran. C’est exactement ce que fait un intitulé de compétence qui passe de
  // deux à trois lignes quand la police rétrécit.
  const mechante = (d) => {
    const base = 700 + 500 * d;
    const bosse = Math.sin(d * 37) > 0.7 ? 90 : 0;   // sauts de reflux
    return base + bosse;
  };
  const r = chercherDensite(mechante, { utilePx: UTILE });
  assert.ok(r.hauteur <= UTILE || r.etat === 'plancher',
    `${r.hauteur} px rendus (état ${r.etat})`);
});

test('par paliers — la densité ne change la hauteur que de temps en temps', () => {
  // Les tailles en pt s’arrondissent au pixel : la hauteur réelle avance par
  // marches, pas en pente douce. Une dichotomie naïve peut s’arrêter sur une
  // marche qui dépasse.
  const paliers = (d) => 820 + Math.round(d * 12) * 24;
  const r = chercherDensite(paliers, { utilePx: UTILE });
  assert.ok(r.hauteur <= UTILE, `${r.hauteur} px pour ${UTILE}`);
  assert.equal(r.etat, 'ajuste');
});

test('une mesure absurde ne fait pas tomber la recherche', () => {
  for (const utilePx of [0, -5, NaN, undefined]) {
    const r = chercherDensite(() => 900, { utilePx });
    assert.ok(Number.isFinite(r.d), `densité non finie pour utilePx=${utilePx}`);
  }
});

test('le nombre de mesures reste borné — on imprime, on ne calcule pas', () => {
  const r = chercherDensite(lineaire(800, 1400), { utilePx: UTILE, iterations: 10 });
  // 1 (plafond) + 1 (plancher) + 10 (dichotomie) + au plus 6 de vérification.
  assert.ok(r.mesures <= 18, `${r.mesures} mesures`);
});

// ── LE RELIQUAT : remplir la page quand même le plafond ne suffit pas ────────
//
// Un carnet de quatre compétences au plafond de densité fait 874 px pour 1062
// disponibles : 188 px, soit 5 cm de feuille blanche sous les signatures. Ces
// pixels vont aux ZONES OÙ L'ON ÉCRIT — observations, cadres de signature. La
// recherche doit les distribuer SANS jamais faire déborder la page.

test('le reliquat remplit la page d’un carnet court', () => {
  // Les zones libres rendent la place au pixel : la feuille grandit d’autant.
  const r = chercherReliquat((px) => 874 + px, { utilePx: UTILE, hauteur: 874 });
  assert.equal(r.r, UTILE - 874, 'toute la place restante doit être distribuée');
  assert.ok(r.hauteur <= UTILE);
  assert.equal(r.mesures, 1, 'le cas courant coûte UNE mesure');
  assert.ok(r.remplissage >= CIBLE_MIN, `remplissage ${(r.remplissage * 100).toFixed(1)} %`);
});

test('une page déjà pleine ne reçoit aucun reliquat', () => {
  const r = chercherReliquat(() => { throw new Error('ne doit pas mesurer'); },
    { utilePx: UTILE, hauteur: UTILE - 1 });
  assert.equal(r.r, 0, 'moins de 2 px à distribuer : on ne touche à rien');
  assert.equal(r.mesures, 0);
});

test('des zones libres qui rendent PLUS que demandé ne débordent pas', () => {
  // Cas réel : agrandir une cellule de tableau fait grandir toute la ligne,
  // et un intitulé de cadre repasse à la ligne. La feuille gagne 1,6 px par
  // pixel distribué — poser « la place restante » et s’en aller déborderait.
  const r = chercherReliquat((px) => 874 + px * 1.6, { utilePx: UTILE, hauteur: 874 });
  assert.ok(r.hauteur <= UTILE, `${r.hauteur} px rendus pour ${UTILE}`);
  assert.ok(r.r > 0, 'on distribue quand même ce qui passe');
  assert.ok(r.r < UTILE - 874, 'mais moins que la place brute');
});

test('LE RELIQUAT NE FAIT JAMAIS DÉBORDER — balayage', () => {
  for (let h = 300; h <= UTILE; h += 37) {
    for (const pente of [0.5, 1, 1.3, 2, 3.5]) {
      const r = chercherReliquat((px) => h + px * pente, { utilePx: UTILE, hauteur: h });
      assert.ok(r.hauteur <= UTILE,
        `h=${h} pente=${pente} : ${r.hauteur} px rendus pour ${UTILE}`);
      assert.ok(r.r >= 0, `reliquat négatif : ${r.r}`);
    }
  }
});

test('une zone libre par paliers ne déborde pas non plus', () => {
  // Une case d’observations n’avance pas en pente douce : sa hauteur est
  // arrondie à la ligne de texte.
  const r = chercherReliquat((px) => 900 + Math.ceil(px / 24) * 24,
    { utilePx: UTILE, hauteur: 900 });
  assert.ok(r.hauteur <= UTILE, `${r.hauteur} px pour ${UTILE}`);
});

test('le nombre de mesures du reliquat reste borné', () => {
  const r = chercherReliquat((px) => 800 + px * 1.9, { utilePx: UTILE, hauteur: 800 });
  // 1 (tout) + 6 (dichotomie) + au plus 4 (vérification) + 1 (repli).
  assert.ok(r.mesures <= 12, `${r.mesures} mesures`);
});

// ════════════════════════════════════════════════════════════════════════════
// AU PLANCHER, LE SECOND FILET — « colle le bloc signatures au bulletin »
// ════════════════════════════════════════════════════════════════════════════
//
// LE SYMPTÔME, signalé par l'école et photographié : une page 2 ne portant que
// la barre « Visa du Parent · L'Enseignant(e) · Le Directeur ». Mesuré sur
// l'écran réel : la barre est COLLÉE (écart 0 px entre son bas et le bas de la
// feuille) ; c'est la feuille entière qui dépasse de quelques pour cent, au
// plancher de densité, et Chrome coupe donc juste au-dessus d'elle.
//
// La réduction `zoom` existait déjà pour TOUS les autres modèles de bulletin ;
// le carnet en était le seul exclu, parce qu'il passe par `ajusterDensite` et
// non par `fitLiveSheets`. Ces contrôles gardent le branchement et sa borne.
test('au plancher, une feuille un peu trop haute est RÉDUITE, pas abandonnée', () => {
  // Le cas mesuré : 1 084 px pour 1 043 px visés (hauteur utile moins la
  // réserve de 5 mm). 4 % de trop — très au-dessus du plancher de lisibilité.
  const s = facteurFit(1084, 1043);
  assert.ok(s != null, 'un facteur doit être rendu');
  assert.ok(s >= MIN_FIT_SCALE, `${s} doit rester lisible`);
  assert.ok(1084 * s <= 1043 + 1, `${1084 * s} px après réduction, pour 1043`);
});

test('mais une feuille DEUX fois trop haute n’est pas écrasée', () => {
  // CE1 BIL, 44 matières : 1 416 px mesurés. La réduire ferait 0,73 — sous le
  // plancher. On préfère deux pages lisibles à une page illisible, et l'écran
  // le dit. C'est la règle du dépôt : avertir plutôt qu'écraser.
  assert.equal(facteurFit(1416, 1043), null);
});

test('une feuille qui tient déjà n’est pas réduite du tout', () => {
  assert.equal(facteurFit(1043, 1043), null);
  assert.equal(facteurFit(900, 1043), null);
});

test('le moteur de densité branche bien ce second filet', async () => {
  const src = await readFile(new URL('./fitDensity.js', import.meta.url), 'utf8');
  assert.match(src, /facteurFit\(r\.hauteur, vise\)/,
    'le facteur se calcule sur la hauteur au plancher, et vise la réserve');
  assert.match(src, /el\.style\.setProperty\(FIT_VAR, String\(s\)\)/,
    'et il est posé sur la feuille, pour que `zoom` l’applique');
  // IDEMPOTENCE : sans purge, une feuille redevenue courte garderait le
  // facteur de l'impression d'avant et sortirait rétrécie sans raison.
  assert.ok(src.split('removeProperty(FIT_VAR)').length - 1 >= 2,
    'la réduction est purgée avant chaque mesure ET par la réinitialisation');
});

test('le chrome de l’application ne s’imprime pas', async () => {
  // 64 px volés à CHAQUE bulletin : le conteneur qui aère l'écran gardait son
  // rembourrage sur le papier. `main { padding: 0 }` ne l'atteignait pas — le
  // rembourrage est sur un DIV à l'intérieur de `main`.
  const css = await readFile(new URL('../../styles/bulletin.css', import.meta.url), 'utf8');
  assert.match(css, /main :has\(\.bulletin-layout\)\s*\{[^}]*padding:\s*0\s*!important/,
    'les conteneurs du bulletin perdent leur rembourrage à l’impression');
});
