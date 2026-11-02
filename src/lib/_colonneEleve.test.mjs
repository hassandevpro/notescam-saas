// LA COLONNE « N° » À L'EXPORT CASSE-T-ELLE L'IMPORT ?
//
// L'export des grilles par compétences porte désormais le numéro de la liste de
// classe en première colonne (demande du 2026-11-01). L'import, lui, lisait le
// nom de l'élève en `cells[0]` et prenait tout le reste pour des notes.
//
// Ce test fige les deux choses qui doivent rester vraies en même temps :
//   • un classeur NEUF (N° · Élève · colonnes…) s'importe ;
//   • un classeur ANCIEN (Élève · colonnes…) s'importe aussi — les écoles
//     réutilisent les fichiers de l'an dernier, et un import silencieusement
//     vide est le pire des résultats.
//
//   node src/lib/_colonneEleve.test.mjs
import { indexColonneEleve, estEnTeteNumero } from './colonneEleve.js';

let echecs = 0;
const ok = (cond, libelle, obtenu) => {
  if (cond) console.log(`OK   ${libelle}`);
  else { console.log(`KO   ${libelle} (obtenu: ${JSON.stringify(obtenu)})`); echecs++; }
};
const titre = (s) => console.log(`\n-- ${s} --`);

titre('le classeur NEUF : N° puis Eleve');
{
  const h = ['N°', 'Élève', 'Langage', 'Pré-numération'];
  ok(indexColonneEleve(h) === 1, 'le nom est en colonne 1', indexColonneEleve(h));
}

titre('le classeur ANCIEN : Eleve en premier (compatibilite)');
{
  const h = ['Élève', 'Langage', 'Pré-numération'];
  ok(indexColonneEleve(h) === 0, 'le nom reste en colonne 0', indexColonneEleve(h));
}

titre('les formes de numerotation ecrites a la main');
{
  for (const v of ['N°', 'n°', 'No', 'no.', 'NO.', 'Num', 'numéro', 'Numero', 'Number', '#', ' N° ']) {
    ok(estEnTeteNumero(v), `« ${v} » est reconnu comme une numerotation`, v);
  }
}

titre('ce qui ne DOIT PAS passer pour une numerotation');
{
  // Si l un de ces en-tetes etait pris pour un numero, la colonne serait sautee
  // et les notes qu elle porte ne seraient jamais importees.
  for (const v of ['Note', 'Notes', 'Niveau', 'Nom', 'Élève', 'Moyenne', 'M/20', 'Cote', 'Nombre de notes', '']) {
    ok(!estEnTeteNumero(v), `« ${v} » n est PAS une numerotation`, v);
  }
}

titre('en-tete inutilisable : on retombe sur le comportement historique');
{
  ok(indexColonneEleve(null) === 0, 'en-tete absent → colonne 0', indexColonneEleve(null));
  ok(indexColonneEleve([]) === 0, 'en-tete vide → colonne 0', indexColonneEleve([]));
  // Une feuille qui ne contiendrait QUE des colonnes de numerotation n a pas de
  // nom a apparier : on rend 0 plutot que de sortir du tableau.
  ok(indexColonneEleve(['N°', 'No']) === 0, 'que des numeros → colonne 0', indexColonneEleve(['N°', 'No']));
}

titre('plusieurs colonnes de numerotation avant le nom');
{
  const h = ['N°', '#', 'Élève', 'Langage'];
  ok(indexColonneEleve(h) === 2, 'on saute les deux et on trouve le nom en 2', indexColonneEleve(h));
}

console.log(`\n${echecs === 0 ? 'TOUS LES CONTROLES PASSENT' : `${echecs} ECHEC(S)`}`);
process.exit(echecs === 0 ? 0 : 1);
