// LE LOGO DE L'ÉCOLE DANS L'EN-TÊTE DU BULLETIN — une bannière ne doit plus tenir dans 56 px.
//
// Défaut signalé le 2026-11-04 : le logo d'une école hors connexion (une bannière ≈ 850 × 215
// portant le nom de l'école en arabe et en français) s'imprimait minuscule, posé dans une case
// carrée de 56 px. La forme de l'image n'est connue qu'à son chargement (`onLoad`) : on ne
// peut donc pas la tester au rendu serveur. On garde ici ce qui se tient : le rendu initial
// reste celui d'avant pour tous les logos, et le câblage de la bannière est en place.
//
//   node --experimental-loader ./scripts/lib/jsx-resolve.mjs src/components/bulletins/_logoEntete.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const lire = (p) => readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const parts = lire('./bulletinOfficialParts.jsx');

test('le logo carré garde sa case d’avant : le rendu initial de l’en-tête ne change pas', () => {
  // Avant le chargement, `banner` vaut false : la case carrée est rendue exactement comme avant.
  assert.match(parts, /: \{ width: logoPx, height: logoPx, objectFit: 'contain', display: 'block', margin: sideBySide \? 0 : '0 auto 2px', flexShrink: 0 \}\} \/>/);
  assert.match(parts, /const logoPx    = vars \? \(nomDansLogo \? 'calc\(var\(--nc-logo\) \* 1\.8\)' : 'calc\(var\(--nc-logo\) \* 1\.6\)'\) : dense \? \(nomDansLogo \? 88 : 80\) : 56;/);
  assert.match(parts, /const sideBySide = \(dense \|\| vars\) && !banner;/);
  assert.match(parts, /const centerW   = bilingual \? \(banner \? '46%' : '34%'\) : '50%';/);
  assert.match(parts, /const sideW     = bilingual \? \(banner \? '27%' : '33%'\) : '50%';/);
});

test('une bannière reste DANS la colonne centrale, entre les deux blocs des ministères', () => {
  // Une seule image, dans la cellule du centre ; aucune rangée de bannière au-dessus du tableau.
  assert.equal((parts.match(/<AssetImg src=\{school\.logo_url\}/g) || []).length, 1, 'une seule image de logo dans l’en-tête');
  assert.match(parts, /\{ width: '100%', height: 'auto', maxHeight: bannerMax, objectFit: 'contain', display: 'block', margin: '0 auto 2px' \}/);
  const iImg = parts.indexOf('<AssetImg src={school.logo_url}');
  const iBlocDroit = parts.indexOf('{bilingual && blocks[1] && <Block b={blocks[1]} />}');
  const iBlocGauche = parts.indexOf('{blocks[0] && <Block b={blocks[0]} />}');
  assert.ok(iBlocGauche < iImg && iImg < iBlocDroit, 'le logo est entre le bloc de gauche et le bloc de droite');
  assert.match(parts, /const bannerMax = vars \? 'calc\(var\(--nc-logo\) \* 1\.9\)' : dense \? 64 : 100;/);
});

test('avec une bannière, le nom de l’école n’est pas répété en texte ; l’année et le téléphone restent', () => {
  assert.match(parts, /\{!nomDansLogo && \(\n\s+<strong style=\{\{ fontSize: vars \? 'var\(--nc-head\)'/);
  assert.match(parts, /yearLbl\} : <strong>\{school\?\.current_year/);   // l'année du système reste imprimée
  assert.match(parts, /school\.phone/);                                   // le téléphone aussi
});

test('la forme est mesurée sur l’image chargée, par la fonction pure testée', () => {
  assert.match(parts, /useLogoShape\(school\?\.logo_url\)/);
  assert.match(parts, /onLoad=\{onLogoLoad\}/);
  const hook = lire('../useLogoShape.js');
  assert.match(hook, /isBannerLogo\(img\.naturalWidth, img\.naturalHeight\)/);
  assert.match(hook, /useEffect\(\(\) => \{ setBanner\(false\); \}, \[src\]\)/);   // un autre logo repart de zéro
});

test('le bulletin primaire générique et les documents HTML ne figent plus un carré', () => {
  const bul = lire('../../pages/Bulletins.jsx');
  assert.match(bul, /useLogoShape\(school\?\.logo_url\)/);
  assert.match(bul, /maxWidth: 260, maxHeight: 90, width: 'auto', height: 'auto'/);
  const doc = lire('../../lib/officialDocHeader.js');
  assert.match(doc, /max-width:100%;max-height:64px;width:auto;height:auto/);
  assert.doesNotMatch(doc, /width:64px;height:64px;object-fit:contain/);
});
