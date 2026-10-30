// UNE MATIÈRE COCHÉE DOIT ARRIVER SUR LE BULLETIN, MÊME SI UNE AUTRE OCCUPE
// DÉJÀ SA COMPÉTENCE.
//
// Relevé le 2026-10-29 sur CE2 BIL (THE GENIUS, 37 matières cochées) : le
// rapprochement par mots-clés faisait tomber `Français`, `French` et
// `French Language` sur la seule compétence 1A, et `Mathématiques` avec
// `Mathematics` sur 2A. Sur une classe BILINGUE — deux programmes, deux barèmes
// (/20 et /100) — le programme anglophone disparaissait donc entièrement du
// bulletin et de la saisie. Mesure : 9 compétences atteintes, 3 matières sans
// compétence, 25 matières noyées dans une fusion.
//
// La règle testée ici : la PREMIÈRE matière qui réclame une compétence la garde
// (le squelette ministériel survit) ; chaque suivante reçoit la sienne.
//
// Lancer : node src/core/_primCompetencePropre.test.mjs
import { primSubjectsNeedingOwnCompetence, matSubjectsNeedingOwnDomaine } from './refClassScope.js';

let failed = false;
const ok = (cond, msg, extra) => {
  console.log(`${cond ? '✅' : '❌'} ${msg}${cond || extra === undefined ? '' : ` — ${JSON.stringify(extra)}`}`);
  if (!cond) failed = true;
};

// Les 11 compétences nationales du primaire : leur id EST leur code.
const NAT = ['1a', '1b', '1c', '2a', '2b', '3a', '3b', '4a', '5a', '6a', '6b']
  .map((c) => ({ id: c, code: c.toUpperCase(), intitule: `compétence ${c}` }));
const noms = (l) => l.map((s) => s.name);

// ── La première garde la compétence nationale ────────────────────────────────
{
  const besoin = primSubjectsNeedingOwnCompetence(
    [{ name: 'Français' }, { name: 'French' }, { name: 'French Language' }], NAT,
  );
  ok(noms(besoin).join('|') === 'French|French Language',
    'Français garde 1A ; French et French Language reçoivent la leur', noms(besoin));
}

// ── Une matière qui ne tombe sur rien : inchangé ─────────────────────────────
{
  const besoin = primSubjectsNeedingOwnCompetence(
    [{ name: 'Français' }, { name: 'Chinois' }, { name: 'Practical Work' }], NAT,
  );
  ok(noms(besoin).join('|') === 'Chinois|Practical Work',
    'les matières hors référentiel restent matérialisées comme avant', noms(besoin));
}

// ── Une classe monolingue SANS doublon ne change pas ─────────────────────────
{
  const besoin = primSubjectsNeedingOwnCompetence(
    [{ name: 'Français' }, { name: 'Mathématiques' }, { name: 'EPS' }], NAT,
  );
  ok(besoin.length === 0, 'aucune collision ⇒ rien à matérialiser', noms(besoin));
}

// ── IDEMPOTENCE : une fois la compétence maison créée, plus de collision ─────
// `competenceIdForSubject` teste le LIBELLÉ (étape 2) avant les mots-clés
// (étape 3) : la matière tombe donc sur SA compétence, et non plus sur 1A.
{
  const avecMaison = [...NAT, { id: 'ge:french', code: 'FR', intitule: 'French' }];
  const besoin = primSubjectsNeedingOwnCompetence(
    [{ name: 'Français' }, { name: 'French' }], avecMaison,
  );
  ok(besoin.length === 0, 'rejouer après matérialisation ne recrée rien', noms(besoin));
}

// ── Le lien explicite fait foi, et compte comme une réclamation ──────────────
{
  const besoin = primSubjectsNeedingOwnCompetence(
    [{ name: 'Lecture', prim_competence_id: '1a' }, { name: 'Grammaire' }], NAT,
  );
  ok(noms(besoin).join('|') === 'Grammaire',
    'un prim_competence_id posé prend la compétence ; la suivante a la sienne', noms(besoin));
}

// ── Listes vides : aucun plantage ───────────────────────────────────────────
{
  ok(primSubjectsNeedingOwnCompetence([], NAT).length === 0, 'classe sans matière ⇒ rien');
  ok(primSubjectsNeedingOwnCompetence(null, null).length === 0, 'entrées nulles ⇒ rien');
  ok(primSubjectsNeedingOwnCompetence([{ name: '' }, null], NAT).length === 0,
    'matières sans nom ignorées');
}

// ── Le cas réel : les 37 matières de CE2 BIL ────────────────────────────────
{
  const MATIERES = ['Français', 'Mathématiques', 'Anglais', 'Éveil scientifique / SVT',
    'Histoire-Géographie', 'Éducation Civique et Morale', 'TIC', 'Arts / Dessin', 'EPS',
    'English', 'Mathematics', 'Science', 'Social Studies', 'French', 'Arts', 'Citizenship',
    'Physical Education', 'Computer Studies', 'French Language', 'Music', 'Arts Plastiques',
    'Chemistry', 'Chinois', 'Civic Education', 'Computer Science', 'Économie Générale',
    'Éducation Civique', 'English Language', 'Fine Arts', 'Géographie', 'Informatique',
    'Musique', 'National Language', 'Natural Science', 'Practical Work',
    'Sciences Naturelles', 'Technology'].map((name) => ({ name }));
  const besoin = primSubjectsNeedingOwnCompetence(MATIERES, NAT);
  // 9 compétences nationales sont réclamées : 37 - 9 = 28 matières à matérialiser.
  ok(besoin.length === 28, 'CE2 BIL : 28 matières reçoivent leur propre compétence', besoin.length);
  const total = 9 + besoin.length;
  ok(total === MATIERES.length,
    'au total, UNE ligne par matière cochée — aucune ne disparaît', { total, coches: MATIERES.length });
  ok(!besoin.some((s) => s.name === 'Français'), 'Français garde bien 1A');
  ok(besoin.some((s) => s.name === 'English'), 'English n’est plus noyé dans 1B');
  ok(besoin.some((s) => s.name === 'Mathematics'), 'Mathematics n’est plus noyé dans 2A');
}

// ── MATERNELLE : la même règle, sur les domaines ────────────────────────────
// Elle n'avait AUCUN rattrapage : une matière cochée hors référentiel était
// seulement nommée dans un bandeau, et deux matières sur le même domaine en
// faisaient disparaître une.
{
  const DOM = ['langage_communication', 'prelecture_preecriture', 'prenumeration_logique',
    'psychomotricite', 'decouverte_monde', 'vie_sociale_affective',
    'activites_artistiques', 'autonomie_personnelle']
    .map((id) => ({ id, code: id, intitule: id }));

  // « Français » et « English » tombent tous deux sur langage_communication.
  const besoin = matSubjectsNeedingOwnDomaine(
    [{ name: 'Français' }, { name: 'English' }, { name: 'Mathématiques' }], DOM,
  );
  ok(noms(besoin).join('|') === 'English',
    'maternelle bilingue : Français garde le domaine, English reçoit le sien', noms(besoin));

  const horsRef = matSubjectsNeedingOwnDomaine([{ name: 'Chinois' }], DOM);
  ok(noms(horsRef).join('|') === 'Chinois',
    'maternelle : une matière hors référentiel reçoit son domaine (elle n’en avait aucun)', noms(horsRef));

  const sansDoublon = matSubjectsNeedingOwnDomaine(
    [{ name: 'Langage' }, { name: 'Écriture' }, { name: 'Motricité fine' }], DOM,
  );
  ok(sansDoublon.length === 0, 'maternelle sans collision ⇒ rien à créer', noms(sansDoublon));

  ok(matSubjectsNeedingOwnDomaine([], DOM).length === 0, 'maternelle : classe vide ⇒ rien');
  ok(matSubjectsNeedingOwnDomaine(null, null).length === 0, 'maternelle : entrées nulles ⇒ rien');

  // Idempotence : le domaine maison porte le nom de la matière, et l'étape 2
  // (libellé) passe avant les mots-clés.
  const avecMaison = [...DOM, { id: 'ge:english', code: 'EN', intitule: 'English' }];
  ok(matSubjectsNeedingOwnDomaine([{ name: 'Français' }, { name: 'English' }], avecMaison).length === 0,
    'maternelle : rejouer après création ne recrée rien');
}

console.log(failed ? '\n❌ ÉCHEC' : '\n✅ tout passe');
process.exit(failed ? 1 : 0);
