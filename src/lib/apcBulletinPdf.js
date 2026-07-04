// Export PDF des bulletins APC officiels (un ou plusieurs élèves).
// Réutilise le pipeline partagé HTML→PNG→jsPDF (exportTranscriptsPdf).

import { exportTranscriptsPdf } from './transcriptPdf';
import { buildTrimesterSheets, assembleTrimester } from './apcBulletinDoc';

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

// students = liste d'élèves de la classe (pour le classement & le profil).
// targetStudents = sous-ensemble à imprimer (défaut : tous).
export async function exportApcTrimesterBulletins(referentiel, apcNotes, {
  classeSlug, trimestreId, classLabel, school, sys = 'FR',
  students, targetStudents, effectif, profPrincipal, teacherByMatiere, fileName, mode = 'save', onProgress,
} = {}) {
  const classStats = classStatsFor(referentiel, apcNotes, { classeSlug, trimestreId, students });
  const list = targetStudents?.length ? targetStudents : students;
  const sheets = [];
  for (const student of list) {
    sheets.push(...buildTrimesterSheets(referentiel, apcNotes, {
      classeSlug, trimestreId, student, school, sys, classLabel,
      effectif: effectif ?? students.length, profPrincipal, classStats, teacherByMatiere,
    }));
  }
  if (!sheets.length) return;
  await exportTranscriptsPdf(sheets, {
    fileName: fileName || `bulletins_apc_${classLabel || classeSlug}_${trimestreId}.pdf`,
    mode, onProgress,
  });
}
