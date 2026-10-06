// BARÈMES DE SAISIE PERSONNALISÉS — ce que l'enseignant change, et ce qui ne doit
// PAS changer : le bulletin reste sur le barème officiel.
//
// Lancer : node src/core/_baremeOverride.test.mjs
import {
  APC_NOTE_MAX, baremeKey, baremeIndex, apcNoteMax, toApc20, rescaleNote,
  applyApcBareme, applyPrimBareme,
} from './baremeOverride.js';
import { competencesFor, matiereAverage } from './apcEngine.js';
import { criteresForCompetence, competencePointsTotal, primCote } from './primEngine.js';

let pass = 0, fail = 0;
const ok = (c, label, got) => {
  if (c) { console.log(`✅ ${label}`); pass++; }
  else { console.log(`❌ ${label} (obtenu: ${JSON.stringify(got)})`); fail++; }
};

// ── Index ───────────────────────────────────────────────────────────────────
const rows = [
  { engine: 'apc',  niveau_slug: '6e',  competence_id: 'c-dictee', critere_id: null,     points_max: 10 },
  { engine: 'prim', niveau_slug: 'cm2', competence_id: '1a',       critere_id: 'oral',   points_max: 10 },
  { engine: 'prim', niveau_slug: 'cm2', competence_id: '1a',       critere_id: 'ecrit',  points_max: 30 },
  // Lignes corrompues : ignorées, le barème officiel reprend la main.
  { engine: 'apc',  niveau_slug: '6e',  competence_id: 'c-zero',   critere_id: null,     points_max: 0 },
  { engine: 'apc',  niveau_slug: '6e',  competence_id: 'c-enorme', critere_id: null,     points_max: 2000 },
  { engine: 'apc',  niveau_slug: '6e',  competence_id: 'c-vide',   critere_id: null,     points_max: null },
];
const idx = baremeIndex(rows);
ok(idx['a:c-dictee'] === 10, 'APC : surcharge indexée sur l’id de compétence');
ok(idx['p:cm2:1a:oral'] === 10, 'PRIM : surcharge indexée sur (niveau, compétence, critère)');
ok(Object.keys(idx).length === 3, 'barème 0, 2000 ou vide : ligne ignorée', Object.keys(idx));
ok(baremeKey({ engine: 'apc', competenceId: 'x' }) === 'a:x', 'clé APC');
ok(baremeKey({ engine: 'prim', niveauSlug: 'sil', competenceId: '2b', critereId: 'ecrit' }) === 'p:sil:2b:ecrit', 'clé PRIM');

// ── Remise à l'échelle /20 (APC) ────────────────────────────────────────────
ok(apcNoteMax({}) === APC_NOTE_MAX, 'sans surcharge : barème officiel /20');
ok(apcNoteMax({ note_max: 10 }) === 10, 'avec surcharge : /10');
ok(apcNoteMax({ note_max: 0 }) === 20, 'surcharge absurde ignorée');
ok(toApc20(7, { note_max: 10 }) === 14, '7/10 vaut 14/20');
ok(toApc20(14, {}) === 14, 'sans surcharge, la note passe telle quelle');
ok(toApc20('ABS', { note_max: 10 }) === 'ABS', 'ABS ne se convertit pas');
ok(toApc20(null, { note_max: 10 }) === null, 'vide ne se convertit pas');
ok(toApc20(13, { note_max: 30 }) === 8.67, 'barème PLUS GRAND que /20 : 13/30 = 8,67/20');

// ── Conversion des notes déjà saisies ───────────────────────────────────────
ok(rescaleNote('16', 20, 10) === '8', '16/20 converti en 8/10');
ok(rescaleNote('8', 10, 20) === '16', '8/10 converti en 16/20');
ok(rescaleNote('ABS', 20, 10) === 'ABS', 'ABS survit à la conversion');
ok(rescaleNote('', 20, 10) === '', 'cellule vide survit à la conversion');
ok(Number(rescaleNote('20', 20, 7)) <= 7, 'la conversion ne dépasse jamais le nouveau barème');

// ── APC : la moyenne matière reste sur /20 ──────────────────────────────────
const competences = [
  { id: 'c-dictee', classe_id: '6e', trimestre_id: 't1', matiere_id: 'francais', ordre: 1, intitule: 'Dictée' },
  { id: 'c-lecture', classe_id: '6e', trimestre_id: 't1', matiere_id: 'francais', ordre: 2, intitule: 'Lecture' },
];
const ref = { competences, matieres: [{ id: 'francais', nom: 'Français' }], classeMatieres: [] };
const refB = applyApcBareme(ref, idx);
ok(refB !== ref, 'le référentiel est décoré quand une surcharge existe');
ok(applyApcBareme(ref, {}) === ref, 'sans surcharge : MÊME référence (pas de recalcul inutile)');

const comps = competencesFor(refB.competences, { classeId: '6e', trimestreId: 't1', matiereId: 'francais' });
ok(comps.find((c) => c.id === 'c-dictee').note_max === 10, 'la compétence surchargée porte note_max');
ok(comps.find((c) => c.id === 'c-lecture').note_max === undefined, 'la compétence non surchargée reste intacte');
// Dictée 7/10 (=14/20) et Lecture 16/20 → (14+16)/2 = 15
ok(matiereAverage({ 'c-dictee': 7, 'c-lecture': 16 }, comps) === 15,
   'moyenne matière : la note /10 est ramenée à /20 AVANT la moyenne',
   matiereAverage({ 'c-dictee': 7, 'c-lecture': 16 }, comps));
// Sans la remise à l'échelle, la même saisie donnerait (7+16)/2 = 11,5 : le
// défaut que ce test verrouille.
ok(matiereAverage({ 'c-dictee': 7, 'c-lecture': 16 }, competences) === 11.5,
   'témoin : sans surcharge appliquée, la même saisie vaut 11,5');

// ── PRIMAIRE : le total et la cote suivent le barème saisi ──────────────────
const primRef = {
  criteres: [{ id: 'oral', nom: 'Oral' }, { id: 'ecrit', nom: 'Écrit' }],
  baremeCriteres: [
    { niveau_id: 'cm2', competence_id: '1a', critere_id: 'oral',  aptitude: 'apte', points_max: 20, ordre: 1 },
    { niveau_id: 'cm2', competence_id: '1a', critere_id: 'ecrit', aptitude: 'apte', points_max: 15, ordre: 2 },
  ],
};
const primRefB = applyPrimBareme(primRef, idx);
ok(applyPrimBareme(primRef, {}) === primRef, 'PRIM sans surcharge : MÊME référence');
const crit = criteresForCompetence(primRefB, 'cm2', '1a', 'apte');
ok(crit.find((c) => c.id === 'oral').points_max === 10, 'Oral passe de /20 à /10');
ok(crit.find((c) => c.id === 'ecrit').points_max === 30, 'Écrit passe de /15 à /30');
const total = competencePointsTotal({ oral: 8, ecrit: 24 }, crit);
ok(total.achieved === 32 && total.possible === 40, 'total calculé sur le barème saisi (40 points)', total);
ok(primCote(total.achieved, total.possible).cote === 'A', '32/40 = 80 % → cote A');
// Le barème officiel aurait donné 32/35 = 91 % (cote A+) : la surcharge change
// bien le résultat, ce qui est exactement l'effet attendu.
ok(primCote(32, 35).cote === 'A+', 'témoin : sur le barème officiel, 32/35 = A+');

console.log(fail ? `
❌ ${fail} échec(s) sur ${pass + fail}` : `
✅ Tous les tests de barème passent (${pass})`);
process.exit(fail ? 1 : 0);
