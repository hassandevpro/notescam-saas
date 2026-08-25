// Test du moteur d'identité élève — normalisation du nom et doublons.
//
// Le cas qui a motivé ce moteur : « Kengne Ngono Gabriella » inscrite le 22/08,
// puis « KENGNE NGONO GABRIELLA » réinscrite le 25/08. Deux dossiers, deux dûs,
// et le MÊME versement de 50 000 saisi deux fois — l'effectif et la caisse
// faussés sans que rien ne le signale.
//
//   node src/lib/_studentIdentity.test.mjs
import {
  normalizeStudentName, duplicateKey, findDuplicateStudents, duplicateWarning,
} from './studentIdentity.js';

let pass = 0, fail = 0;
const ok = (c, label, got) => {
  if (c) { console.log(`✅ ${label}`); pass++; }
  else { console.log(`❌ ${label} (obtenu: ${JSON.stringify(got)})`); fail++; }
};
const t = (fr) => fr;

// ── Normalisation (forme STOCKÉE) ───────────────────────────────────────────
ok(normalizeStudentName('Kengne Ngono Gabriella') === 'KENGNE NGONO GABRIELLA',
  'minuscules -> majuscules', normalizeStudentName('Kengne Ngono Gabriella'));
ok(normalizeStudentName('  MBALLA   Jean  ') === 'MBALLA JEAN',
  'bords coupés et espaces multiples réduits', normalizeStudentName('  MBALLA   Jean  '));
ok(normalizeStudentName('kouamé n\'guessan') === "KOUAMÉ N'GUESSAN",
  'les accents sont CONSERVÉS à l\'affichage', normalizeStudentName('kouamé n\'guessan'));
ok(normalizeStudentName('') === '', 'chaîne vide inchangée');
ok(normalizeStudentName(null) === null, 'null traversé sans lever');

// ── Clé de comparaison (accents ignorés) ────────────────────────────────────
ok(duplicateKey('KOUAMÉ') === duplicateKey('kouame'),
  'accent ignoré pour la comparaison : KOUAMÉ == kouame');
ok(duplicateKey('Kengne  Ngono   Gabriella') === duplicateKey('KENGNE NGONO GABRIELLA'),
  'espaces multiples ignorés pour la comparaison');
ok(duplicateKey('MBALLA JEAN') !== duplicateKey('MBALLA JEANNE'),
  'deux noms réellement différents ne sont pas confondus');

// ── Détection ───────────────────────────────────────────────────────────────
const effectif = [
  { id: 'a', name: 'KENGNE NGONO GABRIELLA', class_id: 'c1' },
  { id: 'b', name: 'MBALLA JEAN',            class_id: 'c1' },
  { id: 'c', name: 'NDIAYE AWA',             class_id: 'c2', archived_at: '2026-08-01' },
];

ok(findDuplicateStudents('Kengne Ngono Gabriella', effectif).length === 1,
  'la réinscription en autre casse est détectée');
ok(findDuplicateStudents('MBALLA Jeanne', effectif).length === 0,
  'un nom proche mais différent ne déclenche rien');
ok(findDuplicateStudents('NDIAYE AWA', effectif).length === 1,
  'un élève ARCHIVÉ compte comme doublon (c\'est ainsi qu\'ils naissent)');
ok(findDuplicateStudents('KENGNE NGONO GABRIELLA', effectif, { excludeId: 'a' }).length === 0,
  'MODIFIER un élève ne le signale pas comme son propre doublon');
ok(findDuplicateStudents('', effectif).length === 0, 'nom vide -> aucun doublon');
ok(findDuplicateStudents('X', []).length === 0, 'effectif vide -> aucun doublon');

// ── Message ─────────────────────────────────────────────────────────────────
const msg = duplicateWarning('kengne ngono gabriella', effectif, {
  classNameOf: (id) => ({ c1: 'FORM1', c2: 'CM2' }[id]), t,
});
ok(msg && msg.includes('KENGNE NGONO GABRIELLA'), 'le message nomme l\'élève déjà inscrit');
ok(msg && msg.includes('FORM1'), 'le message donne la classe, pour trancher sans quitter l\'écran');
ok(duplicateWarning('INCONNU TOTAL', effectif, { t }) === null,
  'aucun doublon -> aucun message (pas de fenêtre inutile)');

const msgArchive = duplicateWarning('NDIAYE AWA', effectif, { t });
ok(msgArchive && msgArchive.includes('archivé'),
  'un homonyme archivé est annoncé comme tel, pas comme une classe');

console.log(`\n=== ${fail === 0 ? 'OK' : 'ÉCHEC'} : ${pass} ok, ${fail} ko ===`);
process.exitCode = fail === 0 ? 0 : 1;
