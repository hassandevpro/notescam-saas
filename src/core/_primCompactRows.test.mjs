// LES LIGNES DU BULLETIN COMPACT DISENT-ELLES LA VÉRITÉ ?
//
// Ce que ce fichier couvre, et pourquoi chaque cas compte :
//
//   UA seule          la maille du carnet officiel. Le couple « note /barème »
//                     doit être celui de l'évaluation, pas celui du référentiel.
//   Trimestre complet trois UA notées : la cellule doit rester comparable au
//                     barème d'UNE UA, sinon l'école lit « 48 /60 » là où elle
//                     attend « 16 /20 ».
//   Trimestre INCOMPLET  une seule UA sur trois notée. Les deux autres ne
//                     doivent compter NULLE PART — ni en note, ni en barème.
//   Note nulle vs absente  un 0 saisi est une évaluation ; une case vide n'en
//                     est pas une. Les confondre fait échouer un élève sur un
//                     programme qu'on ne lui a pas enseigné.
//   Barème changeant  l'Oral interrogé /10 puis /20 : moyenner les notes brutes
//                     n'aurait aucun sens sans moyenner aussi les barèmes.
//   Annuel            huit UA, même règle.
//   Cloisonnement     la fonction ne voit QU'UN élève : aucune donnée d'un autre
//                     ne peut entrer dans son bulletin.
//
// Ce qui N'EST PAS couvert ici, et ne peut pas l'être sous Node : le rendu
// visuel, la pagination A4 et la concordance pixel entre aperçu et PDF. Ces
// points demandent un navigateur — ils sont signalés comme non vérifiés.
import {
  buildCompactRows, critereColumnsOf, critereCellValue,
} from './primCompactRows.js';

let echecs = 0;
const ok = (cond, libelle, obtenu) => {
  if (cond) console.log(`OK   ${libelle}`);
  else { console.log(`KO   ${libelle} (obtenu: ${JSON.stringify(obtenu)})`); echecs++; }
};
const titre = (s) => console.log(`\n-- ${s} --`);

const CRIT = [
  { id: 'oral', nom: 'Oral', points_max: 10 },
  { id: 'ecrit', nom: 'Écrit', points_max: 20 },
  { id: 'pratique', nom: 'Pratique', points_max: 5 },
  { id: 'savoir_etre', nom: 'Savoir-être', points_max: 5 },
];
// Fabrique une UA : notes + barèmes effectifs, et le total de l'UA.
const ua = (n, notes, baremes) => {
  const b = { ...Object.fromEntries(CRIT.map((c) => [c.id, c.points_max])), ...(baremes || {}) };
  const ids = Object.keys(notes);
  const achieved = ids.reduce((a, id) => a + Number(notes[id]), 0);
  const possible = ids.reduce((a, id) => a + Number(b[id]), 0);
  return {
    ua: n, notesByCritere: notes, baremes: b,
    achieved: ids.length ? Math.round(achieved * 100) / 100 : null,
    possible: ids.length ? possible : null,
  };
};
const ligne = (code, uas, totalAchieved, totalPossible, cote) => ({
  code, intitule: `Compétence ${code}`, criteres: CRIT, uas,
  totalAchieved, totalPossible, totalCote: cote,
});

// ── Colonnes ───────────────────────────────────────────────────────────────
titre('Colonnes de criteres');
const cols = critereColumnsOf([ligne('1A', [], null, 40, null)]);
ok(cols.length === 4, 'quatre colonnes, dans l ordre du referentiel', cols.map((c) => c.id));
ok(cols[0].id === 'oral' && cols[3].id === 'savoir_etre', 'ordre preserve', cols.map((c) => c.id));
ok(cols[1].nom === 'Écrit', 'le libelle du critere est reporte', cols[1].nom);
// Referentiel a 3 criteres : on ne fige pas quatre colonnes.
const trois = critereColumnsOf([{ criteres: CRIT.slice(0, 3), uas: [] }]);
ok(trois.length === 3, 'un referentiel a 3 criteres donne 3 colonnes', trois.length);
ok(critereColumnsOf([]).length === 0, 'aucune ligne -> aucune colonne', critereColumnsOf([]));
ok(critereColumnsOf(null).length === 0, 'entree null -> aucune colonne', critereColumnsOf(null));

// ── UA seule : la maille du carnet ─────────────────────────────────────────
titre('UA seule : note et bareme de l evaluation');
// L Ecrit est interroge sur 25 alors que le referentiel dit 20.
const r1A = ligne('1A', [ua(1, { oral: 6.3, ecrit: 16, pratique: 3.2, savoir_etre: 3.13 }, { ecrit: 25 })], 28.63, 45, 'IP');
ok(critereCellValue(r1A, 'oral').note === 6.3, 'la note est reportee telle quelle', critereCellValue(r1A, 'oral'));
const ecrit = critereCellValue(r1A, 'ecrit');
ok(ecrit.note === 16 && ecrit.max === 25,
  'le bareme affiche est celui de l EVALUATION (25), pas du referentiel (20)', ecrit);

// ── Trimestre complet : la cellule reste a l echelle d une UA ──────────────
titre('Trimestre complet (3 UA)');
const r3 = ligne('2A', [
  ua(1, { oral: 8, ecrit: 10, pratique: 4, savoir_etre: 5 }),
  ua(2, { oral: 6, ecrit: 14, pratique: 5, savoir_etre: 5 }),
  ua(3, { oral: 10, ecrit: 12, pratique: 3, savoir_etre: 4 }),
], 27, 40, 'A');
const o3 = critereCellValue(r3, 'oral');
ok(o3.note === 8 && o3.max === 10,
  'Oral : moyenne (8+6+10)/3 = 8 sur 10, et NON 24 sur 30', o3);
ok(critereCellValue(r3, 'ecrit').note === 12, 'Ecrit : (10+14+12)/3 = 12', critereCellValue(r3, 'ecrit'));

// ── Trimestre INCOMPLET ────────────────────────────────────────────────────
titre('Trimestre incomplet : les UA non notees ne comptent nulle part');
const rInc = ligne('2B', [
  ua(1, { oral: 7, ecrit: 15, pratique: 4, savoir_etre: 5 }),
  ua(2, {}),   // non evaluee
  ua(3, {}),   // non evaluee
], 31, 40, 'A');
const oInc = critereCellValue(rInc, 'oral');
ok(oInc.note === 7 && oInc.max === 10,
  'une seule UA notee sur trois -> sa note et son bareme, pas une moyenne sur 3', oInc);

// ── Note nulle vs note absente ─────────────────────────────────────────────
titre('Zero saisi vs case vide');
const rZero = ligne('3A', [ua(1, { oral: 0, ecrit: 0, pratique: 0, savoir_etre: 0 })], 0, 40, 'NA');
const z = critereCellValue(rZero, 'oral');
ok(z !== null && z.note === 0 && z.max === 10, 'un zero saisi est une EVALUATION : 0 /10', z);
const rVide = ligne('3B', [ua(1, {})], null, null, null);
ok(critereCellValue(rVide, 'oral') === null, 'une case vide -> null, la cellule affichera « — »', critereCellValue(rVide, 'oral'));
// Chaine vide : certains imports historiques ecrivent '' au lieu de null.
const rChaine = ligne('3B', [{ ua: 1, notesByCritere: { oral: '' }, baremes: { oral: 10 } }], null, null, null);
ok(critereCellValue(rChaine, 'oral') === null, 'une chaine vide compte comme une absence', critereCellValue(rChaine, 'oral'));

// ── Bareme changeant d une UA a l autre ────────────────────────────────────
titre('Bareme qui change entre deux UA');
const rVar = ligne('5A', [
  ua(1, { oral: 8 }, { oral: 10 }),
  ua(2, { oral: 16 }, { oral: 20 }),
], 12, 15, 'A');
const v = critereCellValue(rVar, 'oral');
ok(v.note === 12 && v.max === 15,
  'notes ET baremes moyennes : 12 /15 — un 8/10 et un 16/20 valent tous deux 80 %', v);
ok(Math.abs((v.note / v.max) - 0.8) < 0.001, 'le ratio affiche vaut bien 80 %', v.note / v.max);

// ── Synthese : « sur 240 et non sur 300 » ──────────────────────────────────
titre('Synthese d un bulletin provisoire');
const bulletin = [
  ligne('1A', [ua(1, { oral: 6.3, ecrit: 12.7, pratique: 3.2, savoir_etre: 3.13 })], 25.33, 40, 'IP'),
  ligne('1B', [ua(1, { oral: 8, ecrit: 16, pratique: 3, savoir_etre: 2 })], 29, 40, 'A'),
  ligne('1C', [ua(1, {})], null, 40, null),      // non evaluee
  ligne('3A', [ua(1, { oral: 3, ecrit: 10, pratique: 3, savoir_etre: 2 })], 18, 20, 'A+'),
  ligne('3B', [ua(1, {})], null, 20, null),      // non evaluee
];
const out = buildCompactRows(bulletin);
ok(out.rows.length === 5, 'cinq lignes rendues', out.rows.length);
ok(out.overall.achieved === 72.33, 'total obtenu = 25,33 + 29 + 18 = 72,33', out.overall.achieved);
ok(out.overall.possible === 100, 'total possible = 40 + 40 + 20 = 100 (les non evaluees exclues)', out.overall.possible);
ok(out.overall.evaluees === 3 && out.overall.nonEvaluees === 2, 'trois evaluees, deux non', out.overall);
ok(out.nonEvalueesCodes.join(',') === '1C,3B', 'les codes non evalues sont nommes pour la mention provisoire', out.nonEvalueesCodes);

titre('Une competence non evaluee n affiche pas de bareme');
const nonEval = out.rows.find((r) => r.code === '1C');
ok(nonEval.achieved === null, 'total null', nonEval.achieved);
ok(nonEval.possible === null,
  'bareme null aussi : « — /40 » ferait croire a une competence ratee', nonEval.possible);
ok(nonEval.cote === null, 'aucune cote', nonEval.cote);

titre('Annuel : huit UA, meme regle');
const rAn = ligne('6A', [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ua(n, { oral: 8, ecrit: 16, pratique: 4, savoir_etre: 4 })), 32, 40, 'A');
const oAn = critereCellValue(rAn, 'oral');
ok(oAn.note === 8 && oAn.max === 10, 'huit UA identiques -> la valeur d une UA', oAn);

titre('Cloisonnement et entrees aberrantes');
// La fonction ne recoit QUE les lignes d un eleve : aucune structure ne permet
// qu une note d un autre eleve y entre.
const vide = buildCompactRows([]);
ok(vide.rows.length === 0 && vide.overall.achieved === null, 'aucune ligne -> synthese vide, pas de 0', vide.overall);
ok(buildCompactRows(null).rows.length === 0, 'entree null -> aucune ligne', buildCompactRows(null).rows.length);
const sansUas = buildCompactRows([{ code: '1A', intitule: 'x', criteres: CRIT }]);
ok(sansUas.rows[0].achieved === null, 'ligne sans UA -> non evaluee, pas 0', sansUas.rows[0]);
ok(critereCellValue({}, 'oral') === null, 'ligne vide -> null', critereCellValue({}, 'oral'));
ok(critereCellValue(null, 'oral') === null, 'ligne null -> null', critereCellValue(null, 'oral'));

console.log(echecs === 0 ? '\nTOUS LES TESTS PASSENT' : `\nECHEC : ${echecs}`);
process.exitCode = echecs === 0 ? 0 : 1;
