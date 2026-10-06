// LE BARÈME D'UNE ÉVALUATION DU PRIMAIRE — `prim_notes.points_max`
//
// L'Oral peut être interrogé sur 10 en UA1 et sur 20 en UA3. Deux choses doivent
// alors rester vraies, et c'est tout l'objet de ce fichier :
//   1. le total possible suit le barème de CHAQUE note, pas celui du référentiel ;
//   2. tout l'historique (aucun barème explicite) calcule exactement comme avant.
//
// Pendant de _apcScales.test.mjs pour le fondamental.
// Lancer : node src/core/_primScales.test.mjs
import {
  primNoteScale, competencePointsTotal, criteresForCompetence, primCote,
} from './primEngine.js';

let pass = 0, fail = 0;
const ok = (c, label, got) => {
  if (c) { console.log(`✅ ${label}`); pass++; }
  else { console.log(`❌ ${label} (obtenu: ${JSON.stringify(got)})`); fail++; }
};
const eq = (a, b, label) => ok(Math.abs(a - b) < 0.011, `${label} (${a} ≈ ${b})`, a);

// ── primNoteScale : accepte le brut ET l'évaluation datée ───────────────────
ok(primNoteScale(8, 20)?.max === 20, 'note brute : barème du référentiel');
ok(primNoteScale(8, 20)?.note === 8, 'note brute : valeur conservée');
ok(primNoteScale({ note: 8, max: 10 }, 20)?.max === 10, 'évaluation datée : SON barème');
ok(primNoteScale({ note: 8, points_max: 10 }, 20)?.max === 10, 'la colonne cloud points_max est lue aussi');
ok(primNoteScale({ note: 8, max: 0 }, 20)?.max === 20, 'barème nul : repli sur le référentiel');
ok(primNoteScale(0, 20)?.note === 0, 'un ZÉRO est une vraie note, pas une absence');
for (const vide of [null, undefined, '', 'ABS']) {
  ok(primNoteScale(vide, 20) === null, `non évaluée : ${JSON.stringify(vide)} → null`);
}

// ── Le total possible suit chaque note ──────────────────────────────────────
const criteres = [
  { id: 'oral',  nom: 'Oral',  points_max: 20, ordre: 1 },
  { id: 'ecrit', nom: 'Écrit', points_max: 15, ordre: 2 },
];

// Tout sur le barème officiel : comportement historique, inchangé.
{
  const t = competencePointsTotal({ oral: 18, ecrit: 12 }, criteres);
  ok(t.achieved === 30 && t.possible === 35, 'historique : 30/35 sur le barème officiel', t);
}

// L'Oral a été interrogé sur 10 : le total possible devient 10 + 15.
{
  const t = competencePointsTotal({ oral: { note: 8, max: 10 }, ecrit: 12 }, criteres);
  ok(t.achieved === 20 && t.possible === 25, 'Oral /10 : le possible suit la note (25)', t);
  eq((t.achieved / t.possible) * 100, 80, 'soit 80 %');
  // Le défaut que ce test verrouille : sommer les barèmes OFFICIELS aurait donné
  // 20/35 = 57,1 %, en défaveur de l'élève alors qu'il a tout bon à l'oral.
  eq((20 / 35) * 100, 57.14, 'témoin : sur le barème officiel, le même élève tombe à 57,1 %');
}

// Un critère non saisi reste exclu du total ET du possible — jamais compté zéro.
{
  const t = competencePointsTotal({ oral: { note: 8, max: 10 } }, criteres);
  ok(t.achieved === 8 && t.possible === 10, 'critère non saisi : exclu des deux sommes', t);
}
ok(competencePointsTotal({}, criteres).achieved === null, 'rien de saisi → achieved null');
ok(competencePointsTotal({ oral: 'ABS' }, criteres).achieved === null, 'ABS seul → achieved null');

// ── La cote suit, puisqu'elle lit un pourcentage ────────────────────────────
{
  const t = competencePointsTotal({ oral: { note: 10, max: 10 }, ecrit: { note: 15, max: 15 } }, criteres);
  ok(primCote(t.achieved, t.possible).cote === 'A+', 'tout juste sur des barèmes réduits → A+');
}
{
  const t = competencePointsTotal({ oral: { note: 5, max: 10 }, ecrit: { note: 7, max: 15 } }, criteres);
  eq((t.achieved / t.possible) * 100, 48, '12/25 = 48 %');
  ok(primCote(t.achieved, t.possible).cote === 'NA', '48 % → NA');
}

// ── Le référentiel reste la source du barème par DÉFAUT ────────────────────
const ref = {
  criteres: [{ id: 'oral', nom: 'Oral' }, { id: 'ecrit', nom: 'Écrit' }],
  baremeCriteres: [
    { niveau_id: 'cm2', competence_id: '1a', critere_id: 'oral',  aptitude: 'apte', points_max: 20, ordre: 1 },
    { niveau_id: 'cm2', competence_id: '1a', critere_id: 'ecrit', aptitude: 'apte', points_max: 15, ordre: 2 },
  ],
};
const cm2 = criteresForCompetence(ref, 'cm2', '1a', 'apte');
ok(cm2.length === 2, 'critères du référentiel chargés', cm2.length);
ok(cm2[0].points_max === 20 && cm2[1].points_max === 15, 'barèmes officiels intacts');
// Une note sans barème propre est lue sur celui du référentiel.
{
  const t = competencePointsTotal({ oral: 18, ecrit: 12 }, cm2);
  ok(t.possible === 35, 'notes sans barème propre : possible = somme des officiels', t);
}

console.log(fail ? `\n❌ ${fail} échec(s) sur ${pass + fail}` : `\n✅ Barèmes primaires : tout passe (${pass})`);
process.exit(fail ? 1 : 0);
