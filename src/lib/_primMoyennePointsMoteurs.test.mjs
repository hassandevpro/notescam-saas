// La règle « moyenne en points » à travers les VRAIS moteurs (rapport de classe ET PV) :
//   node src/lib/_primMoyennePointsMoteurs.test.mjs
// Un seul réglage, `moyennePoints`, doit décider — et le rapport, le PV et (par construction,
// il lit le PV) la feuille de saisie doivent donner le MÊME chiffre pour le MÊME élève.
import { buildClassReport } from './classReportEngine.js';
import { buildClassPv } from './pvEngine.js';
import { nonEvalKey } from '../core/primEngine.js';

let failed = false;
const ok = (cond, msg) => { console.log(`${cond ? '✅' : '❌'} ${msg}`); if (!cond) failed = true; };
const eq = (a, b, msg) => ok(a === b, `${msg}  (${JSON.stringify(a)} attendu ${JSON.stringify(b)})`);

const cls = { id: 'c3', level: 'CM2', name: 'CM2 B' };
// 1A « Lire » : 2 critères de 10 (barème 20). 2A « Compter » : 1 critère de 40.
// Barèmes DIFFÉRENTS et coefficients 2 / 1 : c'est exactement le cas où les deux règles divergent.
const primReferentiel = {
  competences: [
    { id: 'k1', code: '1A', intitule: 'Lire', coefficient: 2, ordre: 1, actif: true },
    { id: 'k2', code: '2A', intitule: 'Compter', coefficient: 1, ordre: 2, actif: true },
  ],
  criteres: [{ id: 'cr1', nom: 'Oral' }, { id: 'cr2', nom: 'Écrit' }],
  baremeCriteres: [
    { niveau_id: 'cm2', competence_id: 'k1', critere_id: 'cr1', points_max: 10, ordre: 1, aptitude: 'apte' },
    { niveau_id: 'cm2', competence_id: 'k1', critere_id: 'cr2', points_max: 10, ordre: 2, aptitude: 'apte' },
    { niveau_id: 'cm2', competence_id: 'k2', critere_id: 'cr1', points_max: 40, ordre: 1, aptitude: 'apte' },
  ],
};
const n = (el, comp, cr, ua, note) => ({ [`${el}_${comp}_${cr}_${ua}`]: { eleve_id: el, competence_id: comp, critere_id: cr, ua, note } });

// e1 : Lire UA1 20/20 + UA2 10/20 ; Compter UA1 10/40.
//   règle historique : Lire = 75 % → 15 ; Compter = 25 % → 5 ; (15×2 + 5×1) ÷ 3 = 11,67
//   règle en points  : T = 20+10+10 = 40 ; S = 20+20+40 = 80 ; 40 × 20 ÷ 80 = 10,00
const students = [
  { id: 'e1', name: 'Abena' }, { id: 'e2', name: 'Biya' }, { id: 'e3', name: 'Chantal' },
  { id: 'e4', name: 'Dikoume' }, { id: 'e5', name: 'Essomba' }, { id: 'e6', name: 'Fotso' },
];
const primNotes = {
  ...n('e1', 'k1', 'cr1', 1, 10), ...n('e1', 'k1', 'cr2', 1, 10), ...n('e1', 'k1', 'cr1', 2, 5), ...n('e1', 'k1', 'cr2', 2, 5),
  ...n('e1', 'k2', 'cr1', 1, 10),
  // e2 : fort en Compter (gros barème), faible en Lire — le classement peut s'inverser.
  ...n('e2', 'k1', 'cr1', 1, 2), ...n('e2', 'k1', 'cr2', 1, 2), ...n('e2', 'k2', 'cr1', 1, 36),
  // e3 : tout juste partout → 20 dans les deux règles.
  ...n('e3', 'k1', 'cr1', 1, 10), ...n('e3', 'k1', 'cr2', 1, 10), ...n('e3', 'k2', 'cr1', 1, 40),
  // e4 : tout à zéro → 0 dans les deux règles.
  ...n('e4', 'k1', 'cr1', 1, 0), ...n('e4', 'k1', 'cr2', 1, 0), ...n('e4', 'k2', 'cr1', 1, 0),
  // e5 : Lire seul (Compter jamais noté) → exclu des deux sommes.
  ...n('e5', 'k1', 'cr1', 1, 10), ...n('e5', 'k1', 'cr2', 1, 5),
  // e6 : rien.
};
const rapport = (moyennePoints, extra = {}) => buildClassReport({
  engine: 'apc_primaire', cls, students, subjects: [], period: { seqs: [1] }, primNotes, primReferentiel, moyennePoints, ...extra,
});
const avgOf = (rep, id) => rep.rows.find((r) => r.student.id === id).avg;

// ── Test 6 : même élève, deux écoles ─────────────────────────────────────────
const ancienne = rapport(false);
const nouvelle = rapport(true);
eq(avgOf(ancienne, 'e1'), 11.67, 'autre école (réglage éteint) : règle historique INCHANGÉE (11,67)');
eq(avgOf(nouvelle, 'e1'), 10, 'Genius (réglage allumé) : 40 × 20 ÷ 80 = 10,00');
eq(avgOf(rapport(undefined), 'e1'), 11.67, 'réglage absent = règle historique (valeur par défaut sûre)');
eq(avgOf(rapport(false), 'e3'), 20, 'e3 tout juste : 20,00 (règle historique)');
eq(avgOf(nouvelle, 'e3'), 20, 'e3 tout juste : 20,00 (en points)');
eq(avgOf(nouvelle, 'e4'), 0, 'e4 tout à zéro : 0,00 — un zéro n’est pas une absence de note');
eq(avgOf(nouvelle, 'e5'), 15, 'e5 : Compter jamais noté → exclu de S : 15 × 20 ÷ 20 = 15,00');
eq(avgOf(nouvelle, 'e6'), null, 'e6 sans aucune note : pas de moyenne, jamais NaN');
ok(nouvelle.rows.every((r) => r.avg === null || Number.isFinite(r.avg)), 'aucune moyenne NaN ni Infinity');

// ── Test 3 : matière non évaluée pour la classe → hors des DEUX sommes ───────
const nonEval = rapport(true, { primNonEvaluees: [nonEvalKey('c3', 'k2', 1)], classId: 'c3' });
eq(avgOf(nonEval, 'e1'), 15, 'Compter non évaluée en UA1 : T = 30, S = 40 → 15,00');

// ── Test 7 : rang et statistiques cohérents sur 6 élèves ─────────────────────
const rang = (rep) => Object.fromEntries(rep.rows.map((r) => [r.student.id, r.rank?.rankN ?? r.rank ?? null]));
const rA = rang(ancienne), rN = rang(nouvelle);
console.log('   rangs historique :', JSON.stringify(rA));
console.log('   rangs en points  :', JSON.stringify(rN));
eq(rN.e3, 1, 'en points : e3 (20,00) premier');
eq(rN.e4, 5, 'en points : e4 (0,00) dernier des classés');
eq(rN.e6, null, 'e6 sans note : hors classement');
// Le classement BOUGE réellement : e2 (fort en Compter, sur 40) passe devant e1 en points.
ok(rA.e1 < rA.e2, 'règle historique : e1 devant e2');
ok(rN.e2 < rN.e1, 'en points : e2 devant e1 — c’est l’impact attendu sur les rangs');
const avgs = nouvelle.rows.map((r) => r.avg).filter((v) => v != null);
eq(avgs.length, 5, '5 élèves notés sur 6');
console.log('   classStats :', JSON.stringify(nouvelle.classStats));
eq(nouvelle.classStats.max, 20, 'stats : moyenne la plus haute = 20,00');
eq(nouvelle.classStats.min, 0, 'stats : moyenne la plus basse = 0,00');

// ── Test 8 : le PV (qui nourrit la feuille de saisie) lit la MÊME règle ───────
// Période `s1` = l'UA 1 seule : Lire 20/20, Compter 10/40 → historique (20×2 + 5) ÷ 3 = 15,00 ;
// en points T = 30, S = 60 → 10,00.
const pv = (moyennePoints) => buildClassPv({
  cls, engine: 'apc_primaire', sys: 'FR', cycle: 'primaire', countryCode: 'CM', schoolYear: '2026-2027',
  period: 's1', students, primReferentiel, primNotes, primNiveauSlug: 'cm2', moyennePoints,
});
const pvOff = pv(false), pvOn = pv(true);
if (!pvOff || !pvOn) {
  ok(false, 'buildClassPv doit rendre un PV primaire');
} else {
  const pavg = (p, id) => p.rows.find((r) => r.id === id)?.avg;
  eq(pavg(pvOff, 'e1'), 15, 'PV, réglage éteint : 15,00 sur l’UA 1 (inchangé)');
  eq(pavg(pvOn, 'e1'), 10, 'PV, réglage allumé : 10,00');
  eq(pavg(pvOn, 'e1'), avgOf(nouvelle, 'e1'), 'le PV et le rapport de classe donnent le même chiffre');
  eq(pavg(pvOn, 'e5'), avgOf(nouvelle, 'e5'), 'idem pour un élève dont une matière n’est pas notée');
  eq(pavg(pvOn, 'e3'), 20, 'PV : e3 = 20,00');
}

process.exit(failed ? 1 : 0);
