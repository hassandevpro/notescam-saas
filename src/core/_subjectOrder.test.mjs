// LA CLASSE, LA SAISIE ET LE BULLETIN LISTENT-ILS LES MATIÈRES PAREIL ?
//
// Défaut rapporté : « le choix de matière dans la modification de la classe, les
// matières qui s'affichent sur le bulletin et à l'entrée des notes : ça doit
// être identique ». Ce ne l'était pas sur l'ORDRE : huit écrans triaient la même
// table `subjects` de cinq façons. Seul le bulletin honorait `position`, la
// colonne qu'écrit « Réorganiser les matières ». L'administration rangeait donc
// les colonnes du bulletin, et la grille de saisie gardait l'ordre des
// coefficients : la colonne que l'on croyait remplir n'était pas la bonne.
//
// Ce test fixe la règle UNIQUE. S'il tombe, c'est qu'un écran est reparti avec
// son propre tri.
import { bySubjectOrder, classSubjectsOf, withoutCompositeParents } from './subjectOrder.js';

let echecs = 0;
const ok = (cond, libelle, obtenu) => {
  if (cond) console.log(`OK   ${libelle}`);
  else { console.log(`KO   ${libelle} (obtenu: ${JSON.stringify(obtenu)})`); echecs++; }
};
const titre = (s) => console.log(`\n-- ${s} --`);
const noms = (l) => l.map((s) => s.name);

titre('position posee : elle commande, le coefficient ne compte plus');
{
  // Exactement le cas de l'ecole : « Reorganiser les matieres » met Francais en
  // premier alors que Mathematiques porte le plus gros coefficient.
  const rows = [
    { id: 'm', class_id: 'c1', name: 'Mathematiques', coef: 6, position: 2 },
    { id: 'f', class_id: 'c1', name: 'Francais',      coef: 4, position: 0 },
    { id: 'a', class_id: 'c1', name: 'Anglais',       coef: 2, position: 1 },
  ];
  const r = noms(classSubjectsOf(rows, 'c1'));
  ok(r.join('|') === 'Francais|Anglais|Mathematiques',
    'l ordre choisi par l ecole est respecte, pas celui des coefficients', r);
}

titre('aucune position : tri historique (coef decroissant, puis nom)');
{
  const rows = [
    { id: 'a', class_id: 'c1', name: 'Anglais',       coef: 2 },
    { id: 'm', class_id: 'c1', name: 'Mathematiques', coef: 6 },
    { id: 'e', class_id: 'c1', name: 'EPS',           coef: 2 },
  ];
  const r = noms(classSubjectsOf(rows, 'c1'));
  ok(r.join('|') === 'Mathematiques|Anglais|EPS',
    'retrocompatible : une ecole qui n a jamais reordonne ne voit rien changer', r);
}

titre('melange : les matieres ordonnees passent AVANT celles sans position');
{
  const rows = [
    { id: 'x', class_id: 'c1', name: 'Informatique',  coef: 9 },            // sans position
    { id: 'f', class_id: 'c1', name: 'Francais',      coef: 1, position: 0 },
    { id: 'y', class_id: 'c1', name: 'Dessin',        coef: 9 },            // sans position
  ];
  const r = noms(classSubjectsOf(rows, 'c1'));
  ok(r[0] === 'Francais', 'la matiere ordonnee vient en tete malgre son coef 1', r);
  ok(r.slice(1).join('|') === 'Dessin|Informatique',
    'les autres gardent coef puis nom entre elles', r);
}

titre('position 0 n est pas « pas de position »');
{
  // Le piege : `a.position ?? 99` et `if (a.position)` traitent 0 comme absent.
  const rows = [
    { id: 'b', class_id: 'c1', name: 'Bbb', coef: 1, position: 5 },
    { id: 'a', class_id: 'c1', name: 'Aaa', coef: 1, position: 0 },
  ];
  ok(noms(classSubjectsOf(rows, 'c1')).join('|') === 'Aaa|Bbb',
    'position 0 est une vraie position, pas un trou', noms(classSubjectsOf(rows, 'c1')));
}

titre('perimetre : seule la classe demandee, et rien n est mute');
{
  const rows = [
    { id: '1', class_id: 'c2', name: 'Zzz', coef: 1 },
    { id: '2', class_id: 'c1', name: 'Aaa', coef: 1 },
    { id: '3', class_id: 'c1', name: 'Bbb', coef: 9 },
  ];
  const avant = rows.map((r) => r.id).join('');
  const r = classSubjectsOf(rows, 'c1');
  ok(r.length === 2 && r.every((s) => s.class_id === 'c1'), 'une seule classe', noms(r));
  ok(rows.map((x) => x.id).join('') === avant,
    'la liste du store n est PAS triee sur place (sinon React ne verrait rien changer)',
    rows.map((x) => x.id).join(''));
  ok(classSubjectsOf(rows, null).length === 0, 'sans classe -> liste vide');
  ok(classSubjectsOf(null, 'c1').length === 0, 'sans matieres -> liste vide, pas une erreur');
}

titre('lignes abimees : on ne jette pas une exception a la figure de l ecole');
{
  const rows = [null, { class_id: 'c1' }, { class_id: 'c1', name: 'Aaa' }];
  let leve = false;
  let r = [];
  try { r = classSubjectsOf(rows, 'c1'); } catch { leve = true; }
  ok(!leve, 'une ligne sans nom ni coef ne fait pas tomber l ecran');
  ok(r.length === 2, 'les lignes de la classe sont rendues telles quelles', r.length);
}

titre('matieres composites : on saisit les feuilles, jamais le parent');
{
  const rows = [
    { id: 'p',  class_id: 'c1', name: 'Mathematiques', coef: 6 },
    { id: 's1', class_id: 'c1', name: 'Algebre',  coef: 3, parent_id: 'p' },
    { id: 's2', class_id: 'c1', name: 'Geometrie', coef: 3, parent_id: 'p' },
    { id: 'f',  class_id: 'c1', name: 'Francais', coef: 4 },
  ];
  const r = noms(withoutCompositeParents(classSubjectsOf(rows, 'c1')));
  ok(!r.includes('Mathematiques'), 'la matiere parente est retiree (sa note est calculee)', r);
  ok(r.includes('Algebre') && r.includes('Geometrie') && r.includes('Francais'),
    'les feuilles et les matieres simples restent', r);
}
{
  const simples = [{ id: 'a', class_id: 'c1', name: 'Aaa', coef: 1 }];
  ok(withoutCompositeParents(simples).length === 1, 'aucun composite -> liste inchangee');
  ok(withoutCompositeParents(null).length === 0, 'liste null -> tableau vide, pas une erreur');
}

titre('le comparateur est utilisable seul (Reports, SubjectTeacherWorkspace)');
{
  const r = [{ name: 'B', coef: 1 }, { name: 'A', coef: 1 }].sort(bySubjectOrder);
  ok(r[0].name === 'A', 'a coef egal, ordre alphabetique', noms(r));
  ok(bySubjectOrder({ position: 1 }, { coef: 99 }) < 0,
    'une position bat n importe quel coefficient');
}

// ── DEUX MATIÈRES AU MÊME RANG ─────────────────────────────────────────────
// Relevé en production le 2026-10-22 : 8 rangs partagés par deux matières
// differentes dans la 5eme de THE GENIUS, 8 dans la 3e de LA REUSSITE. A rangs
// egaux, le comparateur rendait 0 ; `sort` etant stable, l'ordre retombait sur
// celui de la liste RECUE, qui n'est pas le meme d'un ecran a l'autre. Les deux
// matieres pouvaient donc s'echanger entre le bulletin et la grille de saisie.
titre('deux matieres au MEME rang : ordre identique partout');
{
  const chinois = { id: 'z-chinois', class_id: 'c1', name: 'Chinois', coef: 1, position: 1 };
  const etude   = { id: 'a-etude',   class_id: 'c1', name: 'Etude de texte', coef: 2, position: 1 };
  // La MEME paire, dans les deux ordres d'arrivee possibles.
  const vu1 = String(noms(classSubjectsOf([chinois, etude], 'c1')));
  const vu2 = String(noms(classSubjectsOf([etude, chinois], 'c1')));
  ok(vu1 === vu2, 'l ordre d arrivee ne change plus le resultat', [vu1, vu2]);
  // Et le departage reste celui du produit : coefficient d'abord.
  ok(vu1.startsWith('Etude'), 'a rang egal, le coefficient departage', vu1);
  // Coefficient egal : le nom, puis l identifiant. Jamais 0, jamais le hasard.
  const m1 = { id: 'id-2', class_id: 'c1', name: 'Meme nom', coef: 3, position: 4 };
  const m2 = { id: 'id-1', class_id: 'c1', name: 'Meme nom', coef: 3, position: 4 };
  ok(bySubjectOrder(m1, m2) > 0 && bySubjectOrder(m2, m1) < 0,
    'tout egal : l identifiant tranche, et dans les deux sens');
  ok(bySubjectOrder(m1, m1) === 0, 'une matiere comparee a elle-meme vaut 0');
}

console.log(echecs ? `\n${echecs} ECHEC(S)` : '\nTOUT OK');
process.exit(echecs ? 1 : 0);
