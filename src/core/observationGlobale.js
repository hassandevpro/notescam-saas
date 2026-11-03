// OBSERVATION GÉNÉRALE DE L'ÉLÈVE — maternelle et primaire, saisie dans la page Notes.
//
// Ce que ça résout : le bulletin de maternelle (`BulletinMatOfficial`) imprime
// depuis toujours la ligne « Appréciation générale de l'enseignant(e) », et
// RIEN ne la remplissait — la page Notes n'offrait aucun champ, et l'écran des
// bulletins n'en passait pas la valeur. Le carnet du primaire, lui, la lisait
// déjà (`primAppreciationSaisie`) mais obligeait à passer par les bulletins,
// élève par élève, pour l'écrire.
//
// ── OÙ C'EST STOCKÉ, ET POURQUOI PAS AILLEURS ────────────────────────────────
// Sous la clé spéciale `__appreciation__` du créneau de notes, exactement là où
// l'écran des bulletins l'écrit déjà depuis `AppreciationEditor`. Aucune table
// neuve, aucune migration : le champ voyage par `student_absences` (le canal des
// champs spéciaux), il est donc déjà synchronisé Cloud ET LAN, et déjà lu par
// les carnets en production. Un second emplacement aurait fait deux vérités
// pour une seule ligne de bulletin.
//
// ── L'UNITÉ EST LE TRIMESTRE, PAS L'UA ───────────────────────────────────────
// La saisie de maternelle et du primaire se fait par UA, mais le bulletin se
// tire par trimestre, et c'est lui qui porte cette ligne. Les périodes UA de
// l'écran des bulletins déclarent `seqs: [trimestreOfUA(ua)]` : le créneau de
// stockage EST le numéro de trimestre. Les UA d'un même trimestre partagent
// donc une seule observation — ce que l'écran doit dire, sinon l'enseignante
// croit en écrire une par UA et n'en retrouve qu'une.

import { gradeKey } from '../lib/dataImportCore.js';

// La clé spéciale. Même nom que dans `Bulletins.jsx` — ne pas renommer sans
// migrer les saisies déjà en base.
export const CLE_OBSERVATION = '__appreciation__';

// Longueur au-delà de laquelle la ligne du bulletin risque de déborder : la
// case fait une seule rangée de 34 px sur le modèle maternelle. On AVERTIT,
// on ne tronque pas — c'est l'école qui juge de son texte.
export const LONGUEUR_CONSEILLEE = 180;

const TRIMESTRES = [1, 2, 3];

// Le créneau de notes qui porte l'observation d'un trimestre.
// Renvoie `null` si le trimestre n'est pas 1, 2 ou 3 : mieux vaut pas de champ
// qu'un champ qui écrit dans un créneau inventé.
export function creneauObservation(trimestre) {
  const n = Number(trimestre);
  return TRIMESTRES.includes(n) ? n : null;
}

// La clé de `gradeMap`. Déléguée à `gradeKey` pour qu'il n'y ait qu'un seul
// format de clé dans l'application.
export function cleObservation(classId, studentId, trimestre) {
  const creneau = creneauObservation(trimestre);
  if (!classId || !studentId || creneau === null) return null;
  return gradeKey(classId, studentId, creneau);
}

// Le texte saisi, ou '' — jamais `undefined`, pour qu'un `<textarea>` reste
// contrôlé et qu'un bulletin n'imprime pas « undefined ».
export function lireObservation(gradeMap, classId, studentId, trimestre) {
  const cle = cleObservation(classId, studentId, trimestre);
  if (!cle) return '';
  const val = (gradeMap || {})[cle]?.[CLE_OBSERVATION];
  return typeof val === 'string' ? val : '';
}

// Normalise avant d'écrire : espaces de bord retirés, retours à la ligne
// conservés (une enseignante écrit parfois deux phrases sur deux lignes).
export function normaliserObservation(texte) {
  return String(texte ?? '').replace(/[ \t]+$/gm, '').trim();
}

// Y a-t-il vraiment quelque chose à enregistrer ? Un `onBlur` se déclenche à
// chaque passage de champ, même sans frappe : sans ce garde-fou, une classe de
// 35 élèves produirait 35 écritures et 35 lignes de file de synchronisation
// pour rien.
export function observationAChange(ancien, nouveau) {
  return normaliserObservation(ancien) !== normaliserObservation(nouveau);
}

// Le lot à passer à `saveGrade`. Un objet, pour que l'appelant n'ait pas à
// connaître le nom de la clé spéciale.
export function lotObservation(texte) {
  return { [CLE_OBSERVATION]: normaliserObservation(texte) };
}

// Trop long pour la case du bulletin ? Avertissement, pas blocage.
export function observationTropLongue(texte, limite = LONGUEUR_CONSEILLEE) {
  return normaliserObservation(texte).length > limite;
}

// De quoi afficher « 7 / 35 renseignées » et retrouver les oubliés. L'ordre des
// élèves donné est conservé dans `manquants` : c'est l'ordre de la liste de
// classe, donc celui que l'enseignante a sous les yeux.
export function etatObservations(gradeMap, classId, eleves, trimestre) {
  const liste = Array.isArray(eleves) ? eleves : [];
  const manquants = [];
  let renseignees = 0;
  for (const e of liste) {
    const id = e?.id ?? e;
    if (normaliserObservation(lireObservation(gradeMap, classId, id, trimestre))) renseignees += 1;
    else manquants.push(id);
  }
  return { total: liste.length, renseignees, manquants };
}
