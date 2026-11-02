// Montant en toutes lettres.  node src/lib/_montantEnLettres.test.mjs
//
// Ce que ces cas protègent : un reçu dont la lettre contredit le chiffre n'a
// plus de valeur probante — c'est précisément le chiffre que la lettre est
// censée verrouiller. Les pièges sont connus et tous français : les accords de
// « vingt » et « cent », l'invariabilité de « mille », et le « un » qui ne se
// dit pas devant mille mais se dit devant million.
import { entierEnLettres, montantEnLettres } from './montantEnLettres.js';

let failed = false;
const ok = (cond, msg, vu) => {
  console.log(`${cond ? '✅' : '❌'} ${msg}${cond ? '' : `  [vu: ${JSON.stringify(vu)}]`}`);
  if (!cond) failed = true;
};
const eq = (n, attendu, msg, opts) => {
  const vu = entierEnLettres(n, opts);
  ok(vu === attendu, msg || `${n} → ${attendu}`, vu);
};

console.log('— Les petits nombres —');
eq(0, 'zéro');
eq(1, 'un');
eq(7, 'sept');
eq(16, 'seize');
eq(17, 'dix-sept');

console.log('\n— 70, 80, 90 : la série qui fait trébucher —');
eq(70, 'soixante-dix');
eq(71, 'soixante et onze', '71 garde son « et » — « soixante et onze »');
eq(77, 'soixante-dix-sept');
eq(80, 'quatre-vingts', '80 PREND SON S : rien ne le suit');
eq(81, 'quatre-vingt-un', '81 le perd, et n’a pas de « et »');
eq(90, 'quatre-vingt-dix', '90 n’a pas de s : « dix » le suit');
eq(91, 'quatre-vingt-onze', '91 n’a pas de « et », contrairement à 71');
eq(99, 'quatre-vingt-dix-neuf');

console.log('\n— 21, 31… le « et » —');
eq(21, 'vingt et un');
eq(31, 'trente et un');
eq(22, 'vingt-deux');

console.log('\n— CENT : s au pluriel seulement s’il finit le nombre —');
eq(100, 'cent', '« cent », jamais « un cent »');
eq(101, 'cent un');
eq(200, 'deux cents', '200 PREND SON S');
eq(201, 'deux cent un', '201 le PERD : « un » le suit');
eq(280, 'deux cent quatre-vingts', 'le s revient sur « vingts », pas sur « cent »');
eq(999, 'neuf cent quatre-vingt-dix-neuf');

console.log('\n— MILLE est invariable, et ne prend pas « un » —');
eq(1000, 'mille', '« mille », jamais « un mille »');
eq(1001, 'mille un');
eq(2000, 'deux mille', 'jamais « deux milles »');
eq(80000, 'quatre-vingt mille', '« vingt » perd son s : « mille » le suit');
eq(200000, 'deux cent mille', '« cent » perd son s de même');

console.log('\n— Les montants de l’école —');
eq(15000, 'quinze mille', 'le tarif plein de la cantine');
eq(7500, 'sept mille cinq cents', 'le demi-mois — et « cents » prend son s');
eq(150000, 'cent cinquante mille', 'une année de cantine');
eq(615000, 'six cent quinze mille', 'la quote-part 2025/2026, écrite à la main par l’école');
eq(861000, 'huit cent soixante et un mille', 'la quote-part à 3 500 — « soixante et un » garde son « et »');
eq(3690000, 'trois millions six cent quatre-vingt-dix mille', 'l’enjeu du tarif');

console.log('\n— Million et milliard : « un » se dit —');
eq(1000000, 'un million', '« un million », contrairement à « mille »');
eq(2000000, 'deux millions');
eq(1000000000, 'un milliard');

console.log('\n— L’accord REVIENT devant million, qui est un nom —');
eq(200000000, 'deux cents millions', '« deux cents millions » garde son s…');
eq(200000, 'deux cent mille', '…mais « deux cent mille » le perd : mille est invariable');
eq(80000000, 'quatre-vingts millions', 'idem pour « vingts » devant millions…');
eq(80000, 'quatre-vingt mille', '…et sans s devant mille');
eq(280000, 'deux cent quatre-vingt mille', 'les deux à la fois, dans le même nombre');

console.log('\n— Le négatif : une contre-passation doit pouvoir s’écrire —');
eq(-15000, 'moins quinze mille', 'un reçu d’annulation reste lisible sur le papier');

console.log('\n— Robustesse : rien ne lève, rien n’invente —');
ok(entierEnLettres(null) === 'zéro', 'null → « zéro »');
ok(entierEnLettres(undefined) === 'zéro', 'undefined → « zéro »');
ok(entierEnLettres('15000') === 'quinze mille', 'une chaîne numérique est acceptée');
ok(entierEnLettres(15000.9) === 'quinze mille',
   '15000,9 est TRONQUÉ, jamais arrondi : la lettre doit dire ce que la caisse a reçu');
ok(entierEnLettres(1e15) === '', 'au-delà du raisonnable, chaîne vide plutôt qu’un charabia');

console.log('\n— La devise s’accorde sur la valeur absolue —');
ok(montantEnLettres(15000) === 'quinze mille francs CFA', 'XAF par défaut');
ok(montantEnLettres(1) === 'un franc CFA', 'singulier à 1');
ok(montantEnLettres(0) === 'zéro franc CFA', 'singulier à 0 aussi');
ok(montantEnLettres(2) === 'deux francs CFA', 'pluriel à partir de 2');
ok(montantEnLettres(-2) === 'moins deux francs CFA', 'le négatif garde le pluriel');
ok(montantEnLettres(5000, { devise: 'EUR' }) === 'cinq mille euros', 'une école hors zone CFA');
ok(montantEnLettres(5000, { devise: 'ZZZ' }) === 'cinq mille ZZZ',
   'devise inconnue : le code est rendu tel quel, jamais « francs CFA » par défaut');

console.log('\n— Anglais et espagnol —');
ok(entierEnLettres(15000, 'en') === 'fifteen thousand', 'EN : 15 000');
ok(entierEnLettres(201, 'en') === 'two hundred and one', 'EN : 201');
ok(montantEnLettres(15000, { langue: 'en' }) === 'fifteen thousand CFA francs', 'EN avec devise');
ok(entierEnLettres(15000, 'es') === 'quince mil', 'ES : 15 000');
ok(entierEnLettres(21, 'es') === 'veintiuno', 'ES : 21 en un mot');
ok(entierEnLettres(100, 'es') === 'cien', 'ES : « cien » seul, pas « ciento »');
ok(entierEnLettres(101, 'es') === 'ciento uno', 'ES : « ciento » dès qu’il est suivi');

console.log(failed ? '\n❌ Montant en lettres KO' : '\n✅ Montant en lettres OK');
process.exit(failed ? 1 : 0);
