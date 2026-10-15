// GÉNÉRATION EN LOT : CHAQUE ÉLÈVE REÇOIT-IL SES PROPRES DONNÉES ?
//
// La question que ce fichier tranche n'est pas arithmétique, elle est de
// cloisonnement. Un bulletin qui porte la note d'un autre enfant est le pire
// défaut possible d'un logiciel scolaire : il est crédible, il ne lève aucune
// alerte, et c'est le parent qui le découvre.
//
// On génère donc une CLASSE ENTIÈRE et on vérifie que :
//   • chaque élève a bien SES totaux, distincts de ceux des autres ;
//   • aucune valeur d'un élève n'apparaît dans le bulletin d'un autre ;
//   • un élève sans aucune évaluation ne reçoit pas les notes du précédent ;
//   • l'ordre de génération ne change aucun résultat (pas d'état partagé).
//
// Couvre aussi les deux systèmes (francophone / anglophone), puisque les
// libellés de critères viennent du référentiel et transitent par les mêmes
// structures.
import { buildCompactRows } from './primCompactRows.js';
import { generalAverage, primCote, PRIM_COTE_DEFAULT, PRIM_GRADE_MAX } from './primEngine.js';

let echecs = 0;
const ok = (cond, libelle, obtenu) => {
  if (cond) console.log(`OK   ${libelle}`);
  else { console.log(`KO   ${libelle} (obtenu: ${JSON.stringify(obtenu)})`); echecs++; }
};
const titre = (s) => console.log(`\n-- ${s} --`);

const CRIT_FR = [
  { id: 'oral', nom: 'Oral', points_max: 10 },
  { id: 'ecrit', nom: 'Ecrit', points_max: 20 },
  { id: 'pratique', nom: 'Pratique', points_max: 5 },
  { id: 'savoir_etre', nom: 'Savoir-etre', points_max: 5 },
];
const CRIT_EN = [
  { id: 'oral', nom: 'Oral', points_max: 10 },
  { id: 'ecrit', nom: 'Written', points_max: 20 },
  { id: 'pratique', nom: 'Practical', points_max: 5 },
  { id: 'savoir_etre', nom: 'Attitude', points_max: 5 },
];

const mkUa = (n, notes, crit) => {
  const b = Object.fromEntries(crit.map((c) => [c.id, c.points_max]));
  const ids = Object.keys(notes);
  return {
    ua: n, notesByCritere: notes, baremes: b,
    achieved: ids.length ? ids.reduce((a, id) => a + Number(notes[id]), 0) : null,
    possible: ids.length ? ids.reduce((a, id) => a + b[id], 0) : null,
  };
};
const mkRow = (code, uas, crit) => {
  const notees = uas.filter((u) => u.achieved != null);
  const ta = notees.length ? Math.round((notees.reduce((a, u) => a + u.achieved, 0) / notees.length) * 100) / 100 : null;
  const tp = notees.length ? Math.round((notees.reduce((a, u) => a + u.possible, 0) / notees.length) * 100) / 100
    : crit.reduce((a, c) => a + c.points_max, 0);
  const c = ta != null ? primCote(ta, tp, PRIM_COTE_DEFAULT) : null;
  return { code, intitule: 'Competence ' + code, criteres: crit, uas, totalAchieved: ta, totalPossible: tp, totalCote: c ? c.cote : null };
};

// Une classe de 7 eleves, chacun avec un profil DISTINCT et reconnaissable.
// L eleve 5 n a AUCUNE evaluation : c est le piege classique, il doit ressortir
// vide et non porter les notes de l eleve 4.
const CLASSE = (crit) => [
  { id: 'e1', nom: 'ABEGA',    notes: { oral: 9, ecrit: 19, pratique: 5, savoir_etre: 5 } },
  { id: 'e2', nom: 'BELLA',    notes: { oral: 8, ecrit: 16, pratique: 4, savoir_etre: 4 } },
  { id: 'e3', nom: 'CHUKWU',   notes: { oral: 7, ecrit: 13, pratique: 3, savoir_etre: 3 } },
  { id: 'e4', nom: 'DIDI',     notes: { oral: 6, ecrit: 10, pratique: 2, savoir_etre: 2 } },
  { id: 'e5', nom: 'EKO',      notes: null },                                      // rien saisi
  { id: 'e6', nom: 'FOFO',     notes: { oral: 0, ecrit: 0, pratique: 0, savoir_etre: 0 } }, // zero reel
  { id: 'e7', nom: 'GUEMO',    notes: { oral: 10, ecrit: 20, pratique: 5, savoir_etre: 5 } },
].map((e) => ({
  ...e,
  compRows: [
    mkRow('1A', [mkUa(1, e.notes || {}, crit)], crit),
    mkRow('1B', [mkUa(1, e.notes ? { oral: Math.max(0, e.notes.oral - 1), ecrit: e.notes.ecrit } : {}, crit)], crit),
  ],
}));

// « Genere » le lot, comme le fait l ecran pour toute une classe.
function genererLot(eleves) {
  return eleves.map((e) => {
    const c = buildCompactRows(e.compRows);
    const moy = generalAverage(e.compRows
      .filter((r) => r.totalAchieved != null)
      .map((r) => ({ moyenne: (r.totalAchieved / r.totalPossible) * PRIM_GRADE_MAX, coef: 1 })));
    const cg = moy != null ? primCote(moy, PRIM_GRADE_MAX, PRIM_COTE_DEFAULT) : null;
    return { id: e.id, nom: e.nom, ...c, moyenne: moy, cote: cg ? cg.cote : null };
  });
}

titre('Generation en lot : une classe entiere');
const lotFr = genererLot(CLASSE(CRIT_FR));
ok(lotFr.length === 7, 'sept bulletins generes', lotFr.length);
ok(lotFr.every((b) => b.critereColumns.length === 4), 'chacun a ses quatre colonnes', lotFr.map((b) => b.critereColumns.length));

titre('Cloisonnement entre eleves');
// Les totaux doivent etre DISTINCTS pour des profils distincts (e5 et e6 mis a
// part : l un est vide, l autre a zero).
const totauxNotes = lotFr.filter((b) => !['e5'].includes(b.id)).map((b) => b.overall.achieved);
ok(new Set(totauxNotes).size === totauxNotes.length,
  'six profils distincts -> six totaux distincts, aucun recopie', totauxNotes);

const e1 = lotFr.find((b) => b.id === 'e1');
const e7 = lotFr.find((b) => b.id === 'e7');
ok(e1.overall.achieved !== e7.overall.achieved,
  'le meilleur et le premier ne partagent pas leur total', [e1.overall.achieved, e7.overall.achieved]);
// Aucune valeur de e7 ne doit apparaitre dans le bulletin de e1.
const valeursDe = (b) => JSON.stringify(b.rows);
ok(!valeursDe(e1).includes('"note":10,"max":10'),
  'la note parfaite de GUEMO (10/10) n apparait pas chez ABEGA', valeursDe(e1).slice(0, 80));

titre('Eleve sans aucune evaluation');
const e5 = lotFr.find((b) => b.id === 'e5');
ok(e5.overall.achieved === null, 'total null, pas celui de l eleve precedent', e5.overall.achieved);
ok(e5.moyenne === null, 'aucune moyenne', e5.moyenne);
ok(e5.cote === null, 'aucune cote', e5.cote);
ok(e5.nonEvalueesCodes.length === 2, 'ses deux competences sont declarees non evaluees', e5.nonEvalueesCodes);
ok(e5.rows.every((r) => Object.values(r.parCritere).every((v) => v === null)),
  'toutes ses cellules sont vides', e5.rows[0].parCritere);

titre('Eleve a zero reel');
const e6 = lotFr.find((b) => b.id === 'e6');
ok(e6.overall.achieved === 0, 'total 0 — il EST evalue', e6.overall.achieved);
ok(e6.overall.possible > 0, 'et son denominateur est reel', e6.overall.possible);
ok(e6.cote === 'NA', 'cote NA, pas une absence de cote', e6.cote);
ok(e6.nonEvalueesCodes.length === 0, 'aucune competence declaree non evaluee', e6.nonEvalueesCodes);
ok(e5.overall.achieved !== e6.overall.achieved,
  'un eleve VIDE et un eleve a ZERO ne donnent pas le meme bulletin', [e5.overall.achieved, e6.overall.achieved]);

titre('L ordre de generation ne change rien (aucun etat partage)');
const inverse = genererLot([...CLASSE(CRIT_FR)].reverse());
for (const b of lotFr) {
  const autre = inverse.find((x) => x.id === b.id);
  ok(JSON.stringify(b) === JSON.stringify(autre), `${b.nom} : identique quel que soit l ordre`, [b.overall, autre.overall]);
}

titre('Classe anglophone : memes totaux, libelles traduits');
const lotEn = genererLot(CLASSE(CRIT_EN));
ok(lotEn.length === lotFr.length, 'meme nombre de bulletins', lotEn.length);
for (let i = 0; i < lotFr.length; i++) {
  ok(lotFr[i].overall.achieved === lotEn[i].overall.achieved,
    `${lotFr[i].nom} : le total ne depend pas de la langue`, [lotFr[i].overall.achieved, lotEn[i].overall.achieved]);
}
ok(lotEn[0].critereColumns.map((c) => c.nom).join(',') === 'Oral,Written,Practical,Attitude',
  'les colonnes portent les libelles anglophones', lotEn[0].critereColumns.map((c) => c.nom));
ok(lotFr[0].critereColumns.map((c) => c.nom).join(',') === 'Oral,Ecrit,Pratique,Savoir-etre',
  'et les francophones de leur cote', lotFr[0].critereColumns.map((c) => c.nom));

titre('Coherence compacte / detaillee pour le MEME eleve et la MEME periode');
// La vue compacte doit reprendre TEL QUEL le total et la cote du bulletin
// detaille : deux dispositions, une seule verite.
for (const e of CLASSE(CRIT_FR)) {
  const c = buildCompactRows(e.compRows);
  const memeTotal = c.rows.every((r, i) => r.achieved === e.compRows[i].totalAchieved);
  const memeCote  = c.rows.every((r, i) => r.cote === e.compRows[i].totalCote);
  ok(memeTotal && memeCote, `${e.nom} : totaux et cotes identiques entre les deux dispositions`, c.rows.map((r) => [r.achieved, r.cote]));
}

console.log(echecs === 0 ? '\nTOUS LES TESTS PASSENT' : `\nECHEC : ${echecs}`);
process.exitCode = echecs === 0 ? 0 : 1;
