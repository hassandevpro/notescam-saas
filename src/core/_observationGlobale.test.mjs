// Tests de l'OBSERVATION GÉNÉRALE (maternelle + primaire).
// `node src/core/_observationGlobale.test.mjs`

import {
  CLE_OBSERVATION, LONGUEUR_CONSEILLEE,
  creneauObservation, cleObservation, lireObservation,
  normaliserObservation, observationAChange, lotObservation,
  observationTropLongue, etatObservations,
} from './observationGlobale.js';
import { gradeKey } from '../lib/dataImportCore.js';

let failed = false;
const ok = (cond, msg) => { console.log(`${cond ? '✅' : '❌'} ${msg}`); if (!cond) failed = true; };

// ── Le créneau ───────────────────────────────────────────────────────────────
ok(creneauObservation(1) === 1 && creneauObservation(2) === 2 && creneauObservation(3) === 3,
  'les trois trimestres donnent leur propre créneau');
ok(creneauObservation('2') === 2, 'un trimestre en chaîne est accepté (vient d’un <select>)');
ok(creneauObservation(0) === null && creneauObservation(4) === null,
  'hors 1-3 : aucun créneau, donc aucune écriture au hasard');
ok(creneauObservation(undefined) === null && creneauObservation(null) === null,
  'absent : aucun créneau');

// ── La clé ───────────────────────────────────────────────────────────────────
ok(cleObservation('c1', 'e1', 2) === gradeKey('c1', 'e1', 2),
  'la clé est CELLE de gradeKey — un seul format de clé dans l’application');
ok(cleObservation('c1', 'e1', 2) === 'c1_e1_2', 'format attendu classe_eleve_trimestre');
ok(cleObservation('', 'e1', 1) === null, 'sans classe : pas de clé');
ok(cleObservation('c1', '', 1) === null, 'sans élève : pas de clé');
ok(cleObservation('c1', 'e1', 9) === null, 'trimestre invalide : pas de clé');

// Toutes les UA d'un trimestre partagent une clé — c'est l'intention, pas un défaut.
ok(cleObservation('c1', 'e1', 1) === cleObservation('c1', 'e1', 1),
  'UA1, UA2 et UA3 (trimestre 1) écrivent au même endroit');

// ── La lecture ───────────────────────────────────────────────────────────────
const MAP = {
  c1_e1_1: { [CLE_OBSERVATION]: 'Élève appliqué.', math: 14 },
  c1_e2_1: { math: 12 },                               // noté, mais aucune observation
  c1_e3_1: { [CLE_OBSERVATION]: '   ' },               // saisie vide
  c1_e4_2: { [CLE_OBSERVATION]: 'Au trimestre 2.' },
};
ok(lireObservation(MAP, 'c1', 'e1', 1) === 'Élève appliqué.', 'lit le texte saisi');
ok(lireObservation(MAP, 'c1', 'e2', 1) === '', 'créneau noté sans observation : chaîne vide');
ok(lireObservation(MAP, 'c1', 'e9', 1) === '', 'créneau absent : chaîne vide');
ok(lireObservation(MAP, 'c1', 'e1', 3) === '', 'autre trimestre : chaîne vide, pas de fuite');
ok(lireObservation(MAP, 'c1', 'e4', 2) === 'Au trimestre 2.', 'chaque trimestre a la sienne');
ok(lireObservation(undefined, 'c1', 'e1', 1) === '', 'gradeMap absente : chaîne vide, pas d’exception');
ok(typeof lireObservation(MAP, 'c1', 'e9', 1) === 'string',
  'jamais undefined — le <textarea> doit rester contrôlé');
// Une valeur non textuelle en base ne doit pas remonter telle quelle.
ok(lireObservation({ c1_e1_1: { [CLE_OBSERVATION]: 42 } }, 'c1', 'e1', 1) === '',
  'valeur non textuelle en base : ignorée, pas imprimée');

// ── Normalisation ────────────────────────────────────────────────────────────
ok(normaliserObservation('  bon travail  ') === 'bon travail', 'espaces de bord retirés');
ok(normaliserObservation('une ligne\nune autre') === 'une ligne\nune autre',
  'les retours à la ligne sont CONSERVÉS');
ok(normaliserObservation('fin   \nsuite') === 'fin\nsuite', 'espaces en fin de ligne retirés');
ok(normaliserObservation(null) === '' && normaliserObservation(undefined) === '',
  'null / undefined deviennent la chaîne vide');
ok(normaliserObservation('   ') === '', 'une saisie d’espaces seuls vaut vide');

// ── Le garde-fou d'écriture ──────────────────────────────────────────────────
ok(observationAChange('', 'Bien') === true, 'un texte neuf doit être écrit');
ok(observationAChange('Bien', 'Bien') === false, 'texte identique : aucune écriture');
ok(observationAChange('Bien', ' Bien ') === false,
  'un simple espace ajouté ne déclenche PAS une écriture (onBlur se répète)');
ok(observationAChange('Bien', '') === true, 'effacer est un changement — on doit pouvoir vider');
ok(observationAChange(undefined, '') === false, 'rien vers rien : aucune écriture');

// ── Le lot envoyé au store ───────────────────────────────────────────────────
const lot = lotObservation('  Progrès nets.  ');
ok(Object.keys(lot).length === 1 && lot[CLE_OBSERVATION] === 'Progrès nets.',
  'le lot porte la seule clé spéciale, normalisée');
ok(CLE_OBSERVATION === '__appreciation__',
  'la clé est bien celle que les bulletins lisent déjà en production');
ok(lotObservation('')[CLE_OBSERVATION] === '', 'vider envoie une chaîne vide, pas undefined');

// ── Avertissement de longueur ────────────────────────────────────────────────
ok(observationTropLongue('a'.repeat(LONGUEUR_CONSEILLEE)) === false, 'à la limite : pas d’alerte');
ok(observationTropLongue('a'.repeat(LONGUEUR_CONSEILLEE + 1)) === true, 'au-delà : alerte');
ok(observationTropLongue(`  ${'a'.repeat(LONGUEUR_CONSEILLEE)}  `) === false,
  'les espaces de bord ne comptent pas dans la longueur');

// ── L'état de la classe ──────────────────────────────────────────────────────
const classe = [{ id: 'e1' }, { id: 'e2' }, { id: 'e3' }, { id: 'e9' }];
const etat = etatObservations(MAP, 'c1', classe, 1);
ok(etat.total === 4, 'total = effectif de la classe');
ok(etat.renseignees === 1, 'une seule observation réelle (e3 n’a que des espaces)');
ok(etat.manquants.join(',') === 'e2,e3,e9',
  'les manquants sortent dans l’ordre de la liste de classe');
ok(etatObservations(MAP, 'c1', [], 1).total === 0, 'classe vide : total 0, aucune exception');
ok(etatObservations(MAP, 'c1', undefined, 1).total === 0, 'liste absente : total 0');
ok(etatObservations(MAP, 'c1', classe, 9).renseignees === 0,
  'trimestre invalide : rien de renseigné, aucune exception');
// Accepte aussi une liste d'identifiants nus.
ok(etatObservations(MAP, 'c1', ['e1', 'e2'], 1).renseignees === 1,
  'une liste d’identifiants nus est acceptée');

console.log(failed ? '\n❌ ÉCHEC' : '\n✅ Tous les contrôles passent');
process.exit(failed ? 1 : 0);
