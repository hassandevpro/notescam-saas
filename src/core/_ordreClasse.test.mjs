// LE NUMÉRO D'ORDRE DÉSIGNE-T-IL LE MÊME ÉLÈVE PARTOUT ?
//
// Demande du 2026-11-01 : « ajoute une colonne N° avant le nom de l'élève [à la
// saisie des notes], la numérotation suit l'ordre de la liste de classe […] la
// même que celle des listes de classe et des bulletins, pour que le numéro soit
// cohérent partout ».
//
// Ce qu'on ne pouvait PAS faire sans ce module : la liste imprimée triait avec
// `{ sensitivity: 'base' }` (accents et casse ignorés) et les trois postes de
// saisie avec un `localeCompare` nu. « ÉTOUNDI » et « ETOUNDI » ne tombaient
// donc pas au même rang selon la surface — un numéro affiché à la saisie aurait
// désigné un autre enfant que le même numéro sur la liste de classe.
//
// Ce test fixe l'ordre UNIQUE et sa stabilité. S'il tombe, c'est qu'une surface
// est repartie avec son propre tri, ou qu'un départage a été retiré.
import {
  comparerEleves, ordonnerEleves, elevesDeClasse, numerosDeClasse, elevesNumerotes,
} from './ordreClasse.js';

let echecs = 0;
const ok = (cond, libelle, obtenu) => {
  if (cond) console.log(`OK   ${libelle}`);
  else { console.log(`KO   ${libelle} (obtenu: ${JSON.stringify(obtenu)})`); echecs++; }
};
const titre = (s) => console.log(`\n-- ${s} --`);
const noms = (l) => l.map((s) => s.name);

titre('ordre alphabetique de base');
{
  const l = [
    { id: '3', name: 'NKOULOU Bertrand' },
    { id: '1', name: 'ABDOU Fatima' },
    { id: '2', name: 'MBALLA Jeanne' },
  ];
  const r = noms(ordonnerEleves(l));
  ok(r.join('|') === 'ABDOU Fatima|MBALLA Jeanne|NKOULOU Bertrand', 'les trois noms sont ranges', r);
}

titre('accents et casse ignores — l ordre de la liste imprimee');
{
  // Le cas qui motivait le module : la meme famille saisie deux fois, une fois
  // accentuee, une fois non. Les deux doivent se suivre, et se suivre PAREIL
  // qu on parte de l une ou de l autre.
  const l = [
    { id: 'b', name: 'ETOUNDI Paul',  matricule: 'ELV-002' },
    { id: 'a', name: 'ÉTOUNDI Marie', matricule: 'ELV-001' },
    { id: 'c', name: 'EYENGA Alice',  matricule: 'ELV-003' },
  ];
  const r = noms(ordonnerEleves(l));
  ok(r.join('|') === 'ÉTOUNDI Marie|ETOUNDI Paul|EYENGA Alice',
    'ETOUNDI accentue ou non se rangent ensemble, avant EYENGA', r);
  // Le meme jeu dans l autre sens donne le MEME ordre : c est la definition d un
  // tri deterministe, et c est ce qui rend le numero reportable a la main.
  const r2 = noms(ordonnerEleves([...l].reverse()));
  ok(r2.join('|') === r.join('|'), 'l ordre ne depend pas de l ordre d arrivee des lignes', r2);
}

titre('les chiffres se lisent comme des nombres');
{
  const l = [
    { id: 'a', name: 'ELEVE 10' },
    { id: 'b', name: 'ELEVE 2' },
  ];
  const r = noms(ordonnerEleves(l));
  ok(r.join('|') === 'ELEVE 2|ELEVE 10', 'ELEVE 2 avant ELEVE 10', r);
}

titre('homonymes reels : departage par matricule, puis par identifiant');
{
  // Deux « MOHAMED ALI » dans la meme ecole, c est courant. Sans departage,
  // leur rang s echangeait d un rechargement a l autre et le numero clignotait.
  const l = [
    { id: 'z', name: 'MOHAMED ALI', matricule: 'ELV-050' },
    { id: 'a', name: 'MOHAMED ALI', matricule: 'ELV-012' },
  ];
  const r = ordonnerEleves(l).map((s) => s.matricule);
  ok(r.join('|') === 'ELV-012|ELV-050', 'le matricule departage les homonymes', r);

  const sansMat = [
    { id: 'zzz', name: 'MOHAMED ALI' },
    { id: 'aaa', name: 'MOHAMED ALI' },
  ];
  const r2 = ordonnerEleves(sansMat).map((s) => s.id);
  ok(r2.join('|') === 'aaa|zzz', 'sans matricule, l identifiant departage — jamais le hasard', r2);
  ok(ordonnerEleves([...sansMat].reverse()).map((s) => s.id).join('|') === 'aaa|zzz',
    'et il departage dans le meme sens quel que soit l ordre d entree', null);
}

titre('lignes vides et champs absents ne font pas tomber le tri');
{
  const l = [null, { id: 'b', name: 'BELLO' }, undefined, { id: 'a' }];
  const r = ordonnerEleves(l);
  ok(r.length === 2, 'les lignes nulles sont ecartees', r.length);
  ok(r[0].id === 'a' && r[1].id === 'b', 'un eleve sans nom se range avant, sans planter', noms(r));
}

titre('elevesDeClasse : le filtre vit dans le module');
{
  const l = [
    { id: '1', class_id: 'c2', name: 'ZOA' },
    { id: '2', class_id: 'c1', name: 'MBALLA' },
    { id: '3', class_id: 'c1', name: 'ABDOU' },
  ];
  const r = noms(elevesDeClasse(l, 'c1'));
  ok(r.join('|') === 'ABDOU|MBALLA', 'seuls les eleves de la classe, ordonnes', r);
}

titre('numerosDeClasse : le numero commence a 1 et suit l ordre');
{
  const l = [
    { id: 'c', name: 'NKOULOU' },
    { id: 'a', name: 'ABDOU' },
    { id: 'b', name: 'MBALLA' },
  ];
  const m = numerosDeClasse(l);
  ok(m.get('a') === 1 && m.get('b') === 2 && m.get('c') === 3,
    'ABDOU=1, MBALLA=2, NKOULOU=3', [...m.entries()]);
  ok(m.get('inconnu') === undefined, 'un eleve absent de la classe n a pas de numero', m.get('inconnu'));
}

titre('le numero est celui de la CLASSE, meme quand l affichage est filtre');
{
  // Le piege que le module ferme : numeroter la liste AFFICHEE donnerait 1 au
  // premier eleve d une recherche. Le numero doit venir de la classe entiere.
  const classe = [
    { id: 'a', name: 'ABDOU Fatima' },
    { id: 'b', name: 'MBALLA Jeanne' },
    { id: 'c', name: 'NKOULOU Bertrand' },
  ];
  const m = numerosDeClasse(classe);
  const affiches = classe.filter((s) => s.name.includes('Bertrand'));
  ok(m.get(affiches[0].id) === 3, 'le seul eleve affiche garde son numero 3', m.get(affiches[0].id));
}

titre('elevesNumerotes : chaque eleve porte son numero, l original est intact');
{
  const l = [{ id: 'b', name: 'MBALLA' }, { id: 'a', name: 'ABDOU' }];
  const r = elevesNumerotes(l);
  ok(r[0].numero === 1 && r[0].name === 'ABDOU' && r[1].numero === 2, 'numeros poses dans l ordre', r.map((s) => `${s.numero}:${s.name}`));
  ok(l[0].name === 'MBALLA' && l[0].numero === undefined,
    'la liste d origine n est ni triee en place ni modifiee', l.map((s) => s.name));
}

titre('comparerEleves est utilisable tel quel dans un .sort()');
{
  const r = noms([{ id: '2', name: 'B' }, { id: '1', name: 'A' }].sort(comparerEleves));
  ok(r.join('|') === 'A|B', 'le comparateur est exporte et se branche sur sort()', r);
}

console.log(`\n${echecs === 0 ? 'TOUS LES CONTROLES PASSENT' : `${echecs} ECHEC(S)`}`);
process.exit(echecs === 0 ? 0 : 1);
