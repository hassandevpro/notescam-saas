// Tests de `ficheFraisManquante` : la règle qui ouvre une créance au nom d'un
// élève. Chaque cas correspond à une situation rencontrée en production le
// 2026-11-01 sur THE GENIUS, ou à une faute qu'il faut rendre impossible.
import { planifierFichesManquantes, indexerGrille, REFUS_FICHE } from './ficheFraisManquante.js';

let passed = 0; let failed = 0;
function ok(nom, cond, detail) {
  if (cond) { passed += 1; console.log(`  ok  ${nom}`); }
  else { failed += 1; console.log(`  KO  ${nom}${detail ? ` — ${detail}` : ''}`); }
}
function eq(nom, a, b) { ok(nom, a === b, `attendu ${JSON.stringify(b)}, obtenu ${JSON.stringify(a)}`); }

// La grille réelle de THE GENIUS, telle que le document du coordinateur la
// donne. Elle est ici DONNÉE DE TEST, pas une constante du produit.
const GRILLE = [
  { libelle: 'Crèche', tarif: 180000, classes: ['CRECHES'] },
  { libelle: 'Maternelle, autres', tarif: 210000, classes: ['NURSERY 1 A', 'NURSERY 1 B', 'NURSERY 2 A', 'NURSERY 2 B', 'PRE-MATERNELLE A', 'PRE-MATERNELLE B'] },
  { libelle: 'Primaire bilingue', tarif: 210000, classes: ['SIL BIL', 'CP BIL', 'CE1 BIL', 'CE2 BIL'] },
  { libelle: 'CM2 / Class 6', tarif: 190000, classes: ['CM2', 'Class 6'] },
  { libelle: 'Autres primaires', tarif: 180000, classes: ['SIL', 'CP', 'CE1', 'CE2', 'CM1', 'Class 1 A', 'Class 1 B', 'Class 2', 'Class 3', 'Class 4', 'Class 5'] },
  { libelle: 'Collège', tarif: 190000, classes: ['6eme', '5eme', 'FORM1', 'FORM2'] },
];

console.log('\n§1 — indexerGrille');
{
  const { parClasse, doublons } = indexerGrille(GRILLE);
  eq('28 classes indexées', parClasse.size, 28);
  eq('SIL BIL → 210 000', parClasse.get('SIL BIL').tarif, 210000);
  eq('SIL → 180 000 (et non 210 000 : « SIL » ≠ « SIL BIL »)', parClasse.get('SIL').tarif, 180000);
  eq('CM2 → 190 000', parClasse.get('CM2').tarif, 190000);
  eq('aucun doublon dans la grille réelle', doublons.length, 0);
}
{
  // Une classe citée deux fois : deux tarifs possibles. Signalé, pas arbitré.
  const { doublons } = indexerGrille([
    { libelle: 'A', tarif: 100, classes: ['CE1'] },
    { libelle: 'B', tarif: 200, classes: ['CE1'] },
  ]);
  eq('une classe dans deux lignes est signalée', doublons.length, 1);
}
{
  const { parClasse } = indexerGrille([{ libelle: 'X', tarif: 100, classes: ['  ce1  '] }]);
  ok('la casse et les espaces ne font pas rater une classe', parClasse.has('CE1'));
}

console.log('\n§2 — ne jamais doubler une créance');
{
  const eleves = [
    { id: 'a', nom: 'DEJA PAYANT', classe: 'CE1' },
    { id: 'b', nom: 'SANS FICHE', classe: 'CE1' },
  ];
  const r = planifierFichesManquantes({ eleves, feesExistantes: [{ student_id: 'a' }], grille: GRILLE });
  eq('un seul élève à créer', r.aCreer.length, 1);
  eq('et c’est celui sans fiche', r.aCreer[0].id, 'b');
  eq('l’autre est écarté', r.ecartes[0].refus, REFUS_FICHE.DEJA_LA);
}
{
  // Le vrai danger : relancer le correctif deux fois. La seconde passe doit
  // être un non-événement, pas une deuxième facture.
  const eleves = [{ id: 'a', nom: 'X', classe: 'CE1' }];
  const p1 = planifierFichesManquantes({ eleves, feesExistantes: [], grille: GRILLE });
  const p2 = planifierFichesManquantes({
    eleves,
    feesExistantes: p1.aCreer.map((x) => ({ student_id: x.id })),
    grille: GRILLE,
  });
  eq('première passe : 1 à créer', p1.aCreer.length, 1);
  eq('seconde passe : 0 à créer (idempotent)', p2.aCreer.length, 0);
}

console.log('\n§3 — un élève archivé n’est pas facturé par un correctif');
{
  const eleves = [
    { id: 'a', nom: 'SORTI', classe: 'CE1', archive: '2026-10-07' },
    { id: 'b', nom: 'PRESENT', classe: 'CE1' },
  ];
  const r = planifierFichesManquantes({ eleves, feesExistantes: [], grille: GRILLE });
  eq('seul le présent reçoit une fiche', r.aCreer.length, 1);
  eq('le sorti est écarté', r.ecartes[0].refus, REFUS_FICHE.ARCHIVE);
  eq('et le montant ne le compte pas', r.resume.montant, 180000);
}

console.log('\n§4 — sans ligne de grille, on ne devine pas le tarif');
{
  const eleves = [{ id: 'a', nom: 'X', classe: 'TERMINALE D' }];
  const r = planifierFichesManquantes({ eleves, feesExistantes: [], grille: GRILLE });
  eq('aucune fiche créée', r.aCreer.length, 0);
  eq('motif explicite', r.ecartes[0].refus, REFUS_FICHE.SANS_TARIF);
  eq('montant nul', r.resume.montant, 0);
}
{
  // Grille vide : le correctif ne doit RIEN faire, pas tout facturer à 0.
  const eleves = [{ id: 'a', nom: 'X', classe: 'CE1' }, { id: 'b', nom: 'Y', classe: 'CM2' }];
  const r = planifierFichesManquantes({ eleves, feesExistantes: [], grille: [] });
  eq('grille vide → 0 fiche', r.aCreer.length, 0);
  eq('grille vide → 2 écartés', r.ecartes.length, 2);
}

console.log('\n§5 — le tarif vient de la SECTION, pas d’une moyenne');
{
  const eleves = [
    { id: 'a', nom: 'BILINGUE', classe: 'CP BIL' },
    { id: 'b', nom: 'CLASSIQUE', classe: 'CP' },
    { id: 'c', nom: 'CM2', classe: 'CM2' },
    { id: 'd', nom: 'CRECHE', classe: 'CRECHES' },
  ];
  const r = planifierFichesManquantes({ eleves, feesExistantes: [], grille: GRILLE });
  const par = Object.fromEntries(r.aCreer.map((x) => [x.id, x.frais_annuels]));
  eq('CP BIL → 210 000', par.a, 210000);
  eq('CP → 180 000', par.b, 180000);
  eq('CM2 → 190 000', par.c, 190000);
  eq('CRECHES → 180 000 (et non 210 000 comme le reste de la maternelle)', par.d, 180000);
  eq('montant total', r.resume.montant, 760000);
}

console.log('\n§6 — le cas réel : les 17 fiches de THE GENIUS');
{
  // Les 17 élèves effectivement trouvés sans fiche, avec leur classe réelle.
  const LES_17 = [
    ['CP BIL', 210000], ['CP BIL', 210000], ['SIL BIL', 210000], ['CE1 BIL', 210000],
    ['CE2 BIL', 210000], ['NURSERY 1 B', 210000], ['NURSERY 2 A', 210000],
    ['PRE-MATERNELLE B', 210000], ['CM2', 190000], ['CM2', 190000], ['SIL', 180000],
    ['CE1', 180000], ['CE1', 180000], ['CE2', 180000], ['CM1', 180000],
    ['Class 4', 180000], ['Class 5', 180000],
  ];
  const eleves = LES_17.map(([classe], i) => ({ id: `e${i}`, nom: `ELEVE ${i}`, classe }));
  const r = planifierFichesManquantes({ eleves, feesExistantes: [], grille: GRILLE });
  eq('17 fiches à créer', r.aCreer.length, 17);
  eq('aucun écarté', r.ecartes.length, 0);
  // Le montant que l'audit a calculé par un tout autre chemin (la décomposition
  // ligne par ligne du document). Les deux doivent tomber sur le même nombre.
  eq('montant = 3 320 000, le chiffre de l’audit', r.resume.montant, 3320000);
  ok('chaque fiche porte le tarif de sa classe',
    r.aCreer.every((x, i) => x.frais_annuels === LES_17[i][1]));
  // Et le total attendu après correction, vérifié ici aussi :
  eq('134 580 000 + 3 320 000 = 137 900 000', 134580000 + r.resume.montant, 137900000);
  eq('il restera 50 000 d’écart avec le document', 137950000 - 137900000, 50000);
}

console.log('\n§7 — bouclage et robustesse');
{
  const eleves = [
    { id: 'a', classe: 'CE1' }, { id: 'b', classe: 'INCONNUE' },
    { id: 'c', classe: 'CE1', archive: 'x' }, { id: 'd', classe: 'CE1' },
  ];
  const r = planifierFichesManquantes({ eleves, feesExistantes: [{ student_id: 'd' }], grille: GRILLE });
  ok('tout élève est soit créé soit écarté, avec motif', r.resume.boucle);
  eq('1 créé', r.resume.aCreer, 1);
  eq('3 écartés', r.resume.ecartes, 3);
  eq('un motif par refus', Object.keys(r.resume.parRefus).length, 3);
}
{
  const r = planifierFichesManquantes();
  eq('aucun argument → 0 fiche, pas une exception', r.aCreer.length, 0);
  ok('et le bouclage tient', r.resume.boucle);
}
{
  const r = planifierFichesManquantes({
    eleves: [{ nom: 'SANS ID', classe: 'CE1' }, { id: 'a', classe: 'CE1' }],
    feesExistantes: [], grille: GRILLE,
  });
  eq('un élève sans id est ignoré, pas facturé', r.aCreer.length, 1);
  ok('et le bouclage ne compte que les élèves identifiables', r.resume.boucle);
}
{
  const r = planifierFichesManquantes({
    eleves: [{ id: 'a', classe: 'CE1' }], feesExistantes: [],
    grille: [{ libelle: 'X', tarif: -500, classes: ['CE1'] }],
  });
  eq('un tarif négatif est ramené à 0, jamais à une créance négative', r.aCreer[0].frais_annuels, 0);
}

console.log(`\n=== ${passed} ok, ${failed} ko ===`);
process.exit(failed ? 1 : 0);
