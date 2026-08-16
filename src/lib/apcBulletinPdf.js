// Impression des bulletins APC officiels (un ou plusieurs élèves).
//
// Passe par le SOCLE D'IMPRESSION (lib/print) : sortie vectorielle, texte
// sélectionnable, mêmes marges et mêmes règles de saut que tous les autres
// documents. La fenêtre d'impression du navigateur permet d'enregistrer au
// format PDF — c'est le même geste que pour les relevés et les procès-verbaux.
//
// (Ce module produisait auparavant un PDF rasterisé via html-to-image → jsPDF :
// une image pleine page par bulletin, lourde et non sélectionnable.)

import { printSheets, PRINT_RESULT, chunk, BATCH_SIZE } from './print';
import { buildTrimesterSheets, assembleTrimester } from './apcBulletinDoc';

export { PRINT_RESULT };

// Statistiques de classe (profil) pour un trimestre : sur les moyennes générales.
export function classStatsFor(referentiel, apcNotes, { classeSlug, trimestreId, students }) {
  const avgs = students
    .map((s) => assembleTrimester(referentiel, apcNotes, { classeSlug, trimestreId, student: s }).moyenneGenerale)
    .filter((v) => v != null);
  if (!avgs.length) return null;
  const sum = avgs.reduce((a, b) => a + b, 0);
  return {
    min: Math.min(...avgs),
    max: Math.max(...avgs),
    avg: Math.round((sum / avgs.length) * 100) / 100,
    count: avgs.length,
    rate: Math.round((avgs.filter((a) => a >= 10).length / avgs.length) * 100),
  };
}

/**
 * Construit et imprime les bulletins APC d'un trimestre.
 *
 * `students` sert au classement et au profil de classe ; `targetStudents`
 * restreint l'impression à un sous-ensemble.
 *
 * Au-delà du seuil du socle, l'appel n'imprime QUE le premier lot et renvoie le
 * reste : l'atelier appelant enchaîne sur un clic de l'utilisateur.
 *
 * @returns {{ result:'printed'|'blocked'|'empty', pages:number, batches:number }}
 */
export async function exportApcTrimesterBulletins(referentiel, apcNotes, {
  classeSlug, trimestreId, classLabel, school, sys = 'FR',
  students, targetStudents, effectif, profPrincipal, teacherByMatiere,
  title, onProgress, batchIndex = 0,
} = {}) {
  const classStats = classStatsFor(referentiel, apcNotes, { classeSlug, trimestreId, students });
  const list = targetStudents?.length ? targetStudents : students;

  // Un élève = 1 à 2 feuilles ; on découpe sur les ÉLÈVES pour ne jamais séparer
  // les pages d'un même bulletin entre deux lots.
  const batches = chunk(list || [], Math.max(1, Math.floor(BATCH_SIZE / 2)));
  const batch = batches[batchIndex] || [];
  if (!batch.length) return { result: PRINT_RESULT.EMPTY, pages: 0, batches: batches.length };

  const sheets = [];
  let done = 0;
  for (const student of batch) {
    sheets.push(...buildTrimesterSheets(referentiel, apcNotes, {
      classeSlug, trimestreId, student, school, sys, classLabel,
      effectif: effectif ?? students.length, profPrincipal, classStats, teacherByMatiere,
    }));
    onProgress?.(++done, batch.length);
  }
  if (!sheets.length) return { result: PRINT_RESULT.EMPTY, pages: 0, batches: batches.length };

  // `fit` : le bulletin officiel est un document d'UNE page par matière-page ;
  // une feuille qui dépasse de peu est ajustée plutôt que renvoyée sur une page
  // presque vide.
  const result = printSheets(sheets, title || `Bulletins APC — ${classLabel || classeSlug} — ${trimestreId}`, { profile: 'bulletin', fit: true });
  return { result, pages: sheets.length, batches: batches.length };
}
