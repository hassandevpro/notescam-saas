// BARÈMES DE SAISIE DU PRIMAIRE — ce que l'enseignant change, et ce qui ne doit
// PAS changer : le total et la cote restent des ratios, donc justes.
//
// Lancer : node src/core/_baremeOverride.test.mjs
import {
  baremeKey, baremeIndex, rescaleNote, applyPrimBareme, primOfficialMax,
  BAREME_MIN, BAREME_MAX,
} from './baremeOverride.js';
import { criteresForCompetence, competencePointsTotal, primCote } from './primEngine.js';

let pass = 0, fail = 0;
const ok = (c, label, got) => {
  if (c) { console.log(`✅ ${label}`); pass++; }
  else { console.log(`❌ ${label} (obtenu: ${JSON.stringify(got)})`); fail++; }
};

// ── Index ───────────────────────────────────────────────────────────────────
const rows = [
  { engine: 'prim', niveau_slug: 'cm2', competence_id: '1a', critere_id: 'oral',  points_max: 10 },
  { engine: 'prim', niveau_slug: 'cm2', competence_id: '1a', critere_id: 'ecrit', points_max: 30 },
  // Lignes à ignorer : le barème officiel doit reprendre la main.
  { engine: 'prim', niveau_slug: 'cm2', competence_id: '2a', critere_id: 'oral',  points_max: 0 },
  { engine: 'prim', niveau_slug: 'cm2', competence_id: '2b', critere_id: 'oral',  points_max: 2000 },
  { engine: 'prim', niveau_slug: 'cm2', competence_id: '2c', critere_id: 'oral',  points_max: null },
  // Le premier cycle a son propre mécanisme (apc_notes.note_max) : une ligne APC
  // qui traînerait ici ne doit RIEN surcharger côté primaire.
  { engine: 'apc',  niveau_slug: '6e',  competence_id: 'c-dictee', critere_id: '', points_max: 10 },
];
const idx = baremeIndex(rows);
ok(idx['p:cm2:1a:oral'] === 10, 'surcharge indexée sur (niveau, compétence, critère)');
ok(idx['p:cm2:1a:ecrit'] === 30, 'deux critères de la même compétence sont indépendants');
ok(Object.keys(idx).length === 2, 'barème 0, 2000, vide ou moteur APC : ligne ignorée', Object.keys(idx));
ok(baremeKey({ niveauSlug: 'sil', competenceId: '2b', critereId: 'ecrit' }) === 'p:sil:2b:ecrit', 'clé');
ok(BAREME_MIN === 1 && BAREME_MAX === 200, 'bornes de sûreté');

// ── Conversion des notes déjà saisies ───────────────────────────────────────
ok(rescaleNote('16', 20, 10) === '8', '16/20 converti en 8/10');
ok(rescaleNote('8', 10, 20) === '16', '8/10 converti en 16/20');
ok(rescaleNote('ABS', 20, 10) === 'ABS', 'ABS survit à la conversion');
ok(rescaleNote('', 20, 10) === '', 'cellule vide survit à la conversion');
ok(Number(rescaleNote('20', 20, 7)) <= 7, 'la conversion ne dépasse jamais le nouveau barème');

// ── Application au référentiel ──────────────────────────────────────────────
const primRef = {
  criteres: [{ id: 'oral', nom: 'Oral' }, { id: 'ecrit', nom: 'Écrit' }],
  baremeCriteres: [
    { niveau_id: 'cm2', competence_id: '1a', critere_id: 'oral',  aptitude: 'apte', points_max: 20, ordre: 1 },
    { niveau_id: 'cm2', competence_id: '1a', critere_id: 'ecrit', aptitude: 'apte', points_max: 15, ordre: 2 },
    // Un AUTRE niveau, même compétence, même critère : ne doit PAS être touché.
    { niveau_id: 'sil', competence_id: '1a', critere_id: 'oral',  aptitude: 'apte', points_max: 20, ordre: 1 },
  ],
};
ok(applyPrimBareme(primRef, {}) === primRef, 'sans surcharge : MÊME référence (pas de recalcul inutile)');
const refB = applyPrimBareme(primRef, idx);
ok(refB !== primRef, 'le référentiel est décoré quand une surcharge existe');

const crit = criteresForCompetence(refB, 'cm2', '1a', 'apte');
ok(crit.find((c) => c.id === 'oral').points_max === 10, 'Oral passe de /20 à /10');
ok(crit.find((c) => c.id === 'ecrit').points_max === 30, 'Écrit passe de /15 à /30');
ok(primOfficialMax(crit.find((c) => c.id === 'oral')) === 20, 'le barème OFFICIEL reste lisible (retour possible)');

const sil = criteresForCompetence(refB, 'sil', '1a', 'apte');
ok(sil.find((c) => c.id === 'oral').points_max === 20, 'le SIL garde son barème officiel : la surcharge est par niveau');
ok(primOfficialMax(sil.find((c) => c.id === 'oral')) === 20, 'colonne intacte : officiel == courant');

// ── Le total et la cote suivent le barème saisi ─────────────────────────────
const total = competencePointsTotal({ oral: 8, ecrit: 24 }, crit);
ok(total.achieved === 32 && total.possible === 40, 'total calculé sur le barème saisi (40 points)', total);
ok(primCote(total.achieved, total.possible).cote === 'A', '32/40 = 80 % → cote A');
// Sur le barème officiel, 32/35 = 91 % donnerait A+ : la surcharge change bien le
// résultat, ce qui est exactement l'effet attendu.
ok(primCote(32, 35).cote === 'A+', 'témoin : sur le barème officiel, 32/35 = A+');

// Un critère non saisi n'est JAMAIS compté 0 — ni ses points dans le possible.
const partiel = competencePointsTotal({ oral: 5 }, crit);
ok(partiel.achieved === 5 && partiel.possible === 10,
   'critère non saisi : exclu du total ET du possible', partiel);

console.log(fail ? `\n❌ ${fail} échec(s) sur ${pass + fail}` : `\n✅ Tous les tests de barème passent (${pass})`);
process.exit(fail ? 1 : 0);
