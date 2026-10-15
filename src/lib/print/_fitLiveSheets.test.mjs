// LE BULLETIN TIENT-IL SUR UNE PAGE, ET À QUEL PRIX ?
//
// `fitLiveSheets` mesure le DOM — intestable sous Node. Mais toute la DÉCISION
// est dans `facteurFit`, qui ne voit que deux nombres : la hauteur mesurée et la
// hauteur utile d'une page. C'est elle qu'on couvre ici.
//
// Les trois réponses possibles, et pourquoi elles comptent :
//
//   null + ça tient déjà  -> on ne touche à rien. Réduire un bulletin qui tient
//                            déjà le rendrait plus petit sans raison.
//   un facteur < 1        -> on réduit : l'école économise une feuille par
//                            bulletin, soit des centaines par trimestre.
//   null + ça déborde     -> on RENONCE. En dessous du plancher de lisibilité,
//                            un bulletin illisible coûte plus cher qu'un
//                            bulletin sur deux pages — et l'écran le signale.
import { facteurFit, MIN_FIT_SCALE } from './fitLiveSheets.js';

let echecs = 0;
const ok = (cond, libelle, obtenu) => {
  if (cond) console.log(`OK   ${libelle}`);
  else { console.log(`KO   ${libelle} (obtenu: ${JSON.stringify(obtenu)})`); echecs++; }
};

// Hauteur utile d'une A4 portrait à 8 mm de marge, en pixels CSS — l'ordre de
// grandeur réel du profil « bulletin ».
const PAGE = 1032;

console.log('\n-- Ce qui tient deja --');
ok(facteurFit(800, PAGE) === null, 'nettement plus court que la page -> aucune reduction', facteurFit(800, PAGE));
ok(facteurFit(PAGE, PAGE) === null, 'exactement la hauteur de la page -> aucune reduction', facteurFit(PAGE, PAGE));
// Tolerance d un pixel : les moteurs de rendu comptent en sous-pixels, et un
// bulletin a 1032,4 px tient encore sur 1032 px.
ok(facteurFit(PAGE + 1, PAGE) === null, 'un pixel de trop -> tolere, aucune reduction', facteurFit(PAGE + 1, PAGE));

console.log('\n-- Ce qu on reduit --');
const s10 = facteurFit(PAGE * 1.10, PAGE);
ok(s10 !== null && s10 < 1, '10 % de trop -> un facteur est propose', s10);
ok(s10 >= MIN_FIT_SCALE, '10 % de trop -> au-dessus du plancher de lisibilite', s10);
ok(Math.abs(PAGE * 1.10 * s10 - PAGE) <= 2,
  'le facteur ramene bien la hauteur a celle de la page', PAGE * 1.10 * s10);

// Le facteur est TRONQUE au millieme, jamais arrondi au-dessus : arrondir vers
// le haut rendrait une feuille d un cheveu trop grande, donc deux pages.
const s = facteurFit(1500, 1000);
ok(s <= 1000 / 1500, 'le facteur est tronque, jamais arrondi vers le haut', s);

console.log('\n-- Ce qu on refuse de reduire --');
// Juste sous le plancher : 1 / 0.85 = 1,176 fois la page.
ok(facteurFit(PAGE / 0.85, PAGE) === null,
  'sous le plancher de lisibilite -> on renonce, le bulletin coulera', facteurFit(PAGE / 0.85, PAGE));
// Juste au-dessus du plancher : doit passer.
const limite = facteurFit(PAGE / 0.87, PAGE);
ok(limite !== null && limite >= MIN_FIT_SCALE,
  'juste au-dessus du plancher -> on reduit encore', limite);
ok(facteurFit(PAGE * 3, PAGE) === null,
  'trois pages de contenu -> on renonce (jamais un bulletin illisible)', facteurFit(PAGE * 3, PAGE));

console.log('\n-- Entrees aberrantes --');
for (const [h, p, libelle] of [
  [0, PAGE, 'hauteur nulle'],
  [-10, PAGE, 'hauteur negative'],
  [NaN, PAGE, 'hauteur NaN'],
  [PAGE * 2, 0, 'page de hauteur nulle'],
  [PAGE * 2, NaN, 'page NaN'],
  [undefined, undefined, 'les deux absentes'],
]) {
  ok(facteurFit(h, p) === null, `${libelle} -> null, aucune transformation posee`, facteurFit(h, p));
}

console.log(echecs === 0 ? '\nTOUS LES TESTS PASSENT' : `\nECHEC : ${echecs}`);
process.exitCode = echecs === 0 ? 0 : 1;
