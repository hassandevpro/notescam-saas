// LE NOM ANGLAIS DES RÉGIONS DU CAMEROUN, POUR L'EN-TÊTE OFFICIEL
//
// ── CE QUE CE MODULE CORRIGE ───────────────────────────────────────────────
//
// L'en-tête officiel du Cameroun est BILINGUE : un bloc français et un bloc
// anglais, côte à côte. Les deux lisaient `schools.region` et
// `schools.division` TELS QU'ILS SONT STOCKÉS — c'est-à-dire en français. Le
// bloc anglais imprimait donc, relevé sur un rapport de THE GENIUS :
//
//     Regional Delegation Ouest
//     Divisional Delegation Mifi
//
// Deux fautes dans deux lignes : le nom de la région n'était pas traduit, et il
// manquait la préposition. L'en-tête officiel anglais s'écrit :
//
//     Regional Delegation for the West
//     Divisional Delegation for Mifi
//
// LA RÉGION SE TRADUIT, LE DÉPARTEMENT NON. Les dix régions ont un nom anglais
// officiel ; les cinquante-huit départements sont des noms propres (Mifi,
// Wouri, Mfoundi…) qui ne se traduisent pas. D'où une table pour les premières,
// et rien pour les seconds.
//
// LE FRANÇAIS N'EST PAS TOUCHÉ, ET C'EST DÉLIBÉRÉ. Le bloc français écrit
// « Délégation Régionale Ouest » là où l'usage officiel dit « Délégation
// Régionale de l'Ouest ». Corriger demanderait l'article de chaque région
// (de l'Ouest, du Centre, du Nord…) ET de chaque département (de la Mifi, du
// Wouri…) : cinquante-huit articles qu'aucune donnée ne porte et qu'il faudrait
// deviner. Une erreur de genre sur un document officiel est pire que l'absence
// d'article. À reprendre le jour où l'on saisira l'article avec le nom.

// Nom anglais officiel, par région, clé normalisée.
// La valeur anglaise est aussi acceptée en entrée : une école qui a déjà saisi
// « North West » ne doit pas voir sa région disparaître.
const REGIONS_EN = {
  adamaoua: 'Adamawa',      adamawa: 'Adamawa',
  centre: 'Centre',
  est: 'East',              east: 'East',
  extremenord: 'Far North', farnorth: 'Far North',
  littoral: 'Littoral',
  nord: 'North',            north: 'North',
  nordouest: 'North West',  northwest: 'North West',
  ouest: 'West',            west: 'West',
  sud: 'South',             south: 'South',
  sudouest: 'South West',   southwest: 'South West',
};

// Casse, accents, traits d'union et espaces retirés : « Extrême-Nord »,
// « extreme nord » et « EXTREMENORD » sont la même région.
const cle = (s) => String(s ?? '')
  .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '');

/**
 * Nom anglais d'une région camerounaise.
 * Une région inconnue est rendue TELLE QUELLE : mieux vaut « Regional
 * Delegation for the Ouest » qu'une ligne vide ou un tiret sur un document
 * officiel — l'école voit alors quoi corriger dans son profil.
 */
export function regionEn(region) {
  if (!region) return '';
  return REGIONS_EN[cle(region)] || String(region);
}
