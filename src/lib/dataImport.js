// Moteur d'import de données historiques (migration depuis une autre app).
//
// Objectif : reprendre plusieurs années d'historique (élèves, classes, matières,
// notes, frais, personnel) d'un établissement venant d'un autre logiciel.
//
// Pourquoi à ce niveau (et pas en SQL brut ni en `supabase.from()` direct) :
// l'app est offline-first. Le chemin d'écriture canonique est
//   IndexedDB (immédiat) ─► syncQueue ─► flush vers Supabase OU localClient/SQLite.
// En écrivant ici (IDB + syncQueue), l'import :
//   • fonctionne À L'IDENTIQUE en cloud (Supabase) et en LAN (serveur local) ;
//   • reste offline-first (l'import marche sans réseau, la sync se vide ensuite) ;
//   • réutilise gradeEntryToRows / replayItem déjà testés (cf. sync.js).
//
// Modèle NotesCam à connaître pour comprendre le mapping :
//   • L'année scolaire est portée par `classes.current_year`. Chaque année =
//     un jeu de lignes `classes` distinct. La liste des archives = DISTINCT(current_year).
//   • Un élève appartient à UNE classe (FK `class_id` unique) → un même enfant
//     sur 6 ans devient 6 lignes `students` (une par année/classe). C'est voulu.
//   • `grades` n'a pas d'année : (class_id, student_id, subject_id, sequence).
//     L'année vient de la classe. En IDB, 1 enregistrement par (classe,élève,séquence)
//     avec `scores = { [subject_id]: valeur }`.
//   • `student_fees` / `fee_payments` portent `academic_year` explicitement.
//
// L'import NE crée PAS l'école et NE change PAS `school.current_year` : il ajoute
// des lignes rattachées au `school_id` existant. L'admin choisit l'année active
// dans les Paramètres si besoin.
//
// La logique pure (validation + transformation pivot → enregistrements) vit dans
// dataImportCore.js (testable hors navigateur). Ce module ajoute l'IO :
// lecture IDB existante, écriture en lot, empilement syncQueue, flush.
//
// FORMAT PIVOT v1 — voir dataImportCore.js et examples/import-bundle.example.json.

import {
  classesDB, subjectsDB, studentsDB, gradesDB,
  teachersDB, feesDB, feePaymentsDB, syncQueueDB,
} from './db';
import { getQueueCount, flushSyncQueue } from './sync';
import { useUiStore } from '../store/uiStore';
import { validateBundle, buildImportRecords } from './dataImportCore';

export { validateBundle } from './dataImportCore';

// ─────────────────────────────────────────────────────────────────────────────
// Import effectif. Écrit IDB en lot + empile la syncQueue, puis (option) vide la
// file. Idempotent : ré-exécutable sans doublon (réutilise les lignes existantes
// par clé naturelle — classe = année+nom, matière = classe+nom, élève = classe+
// matricule||nom).
//
// @param {object}   bundle              format pivot v1
// @param {object}   opts
// @param {string}   opts.schoolId       école cible (obligatoire)
// @param {boolean}  opts.flush          vider la syncQueue à la fin (défaut: true si en ligne)
// @param {function} opts.onProgress     ({ phase, done, total }) pour l'UI
// @returns {Promise<{ created, reused, queued, sync, warnings }>}
// ─────────────────────────────────────────────────────────────────────────────
export async function importBundle(bundle, { schoolId, flush, onProgress } = {}) {
  if (!schoolId) throw new Error('importBundle : schoolId requis.');
  const check = validateBundle(bundle);
  if (!check.ok) throw new Error('Bundle invalide :\n' + check.errors.join('\n'));

  const progress = (phase, done = 0, total = 0) => { try { onProgress?.({ phase, done, total }); } catch { /* ignore */ } };

  // 1) Lecture des lignes existantes (une seule fois) pour l'idempotence.
  progress('scan');
  const [classes, subjects, students, fees, teachers, payments] = await Promise.all([
    classesDB.getAll(), subjectsDB.getAll(), studentsDB.getAll(), feesDB.getAll(), teachersDB.getAll(), feePaymentsDB.getAll(),
  ]);

  // 2) Transformation pure pivot → enregistrements (FK résolues, idempotence).
  progress('build');
  const { out, reused, warnings } = buildImportRecords(bundle, schoolId, { classes, subjects, students, fees, teachers, payments });

  // 3) Écriture IDB en lot (ordre FK : classes → subjects → students → grades → fees → payments).
  progress('write');
  await teachersDB.putMany(out.teachers);
  await classesDB.putMany(out.classes);
  await subjectsDB.putMany(out.subjects);
  await studentsDB.putMany(out.students);
  await gradesDB.putMany(out.grades);
  await feesDB.putMany(out.fees);
  await feePaymentsDB.putMany(out.payments);

  // 4) Empilement de la syncQueue (replayItem dans sync.js sait traiter chaque table).
  progress('queue');
  const queueAll = async (table, rows, operation = 'upsert') => {
    for (const payload of rows) await syncQueueDB.push({ table, operation, payload });
  };
  await queueAll('teachers',     out.teachers);
  await queueAll('classes',      out.classes);
  await queueAll('subjects',     out.subjects);
  await queueAll('students',     out.students);
  await queueAll('grades',       out.grades);
  await queueAll('student_fees', out.fees);
  await queueAll('fee_payments', out.payments, 'insert');

  const queued =
    out.teachers.length + out.classes.length + out.subjects.length +
    out.students.length + out.grades.length + out.fees.length + out.payments.length;

  // Reflète le nombre d'opérations en attente dans l'indicateur de sync.
  try { useUiStore.getState().setPendingCount(await getQueueCount()); } catch { /* ignore */ }

  // 5) Flush (sync vers Supabase/localClient). Par défaut si en ligne.
  let sync = null;
  const doFlush = flush ?? (typeof navigator !== 'undefined' && navigator.onLine);
  if (doFlush) {
    progress('sync', 0, queued);
    sync = await flushSyncQueue();
    progress('sync', sync.synced, sync.total);
  }

  const created = {
    classes: out.classes.length, subjects: out.subjects.length, students: out.students.length,
    grades: out.grades.length, teachers: out.teachers.length, fees: out.fees.length, payments: out.payments.length,
  };
  progress('done');
  return { created, reused, queued, sync, warnings };
}
