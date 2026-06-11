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
import { getQueueCount } from './sync';
import { supabase } from './supabase';
import { gradeEntryToRows } from './schoolService';
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

  // Progression 0→100 % (en plus du nom de phase) pour la barre de chargement.
  const report = (phase, pct) => {
    try { onProgress?.({ phase, pct: Math.max(0, Math.min(100, Math.round(pct))) }); } catch { /* ignore */ }
  };

  // 1) Lecture des lignes existantes (une seule fois) pour l'idempotence.
  report('scan', 3);
  const [classes, subjects, students, fees, teachers, payments] = await Promise.all([
    classesDB.getAll(), subjectsDB.getAll(), studentsDB.getAll(), feesDB.getAll(), teachersDB.getAll(), feePaymentsDB.getAll(),
  ]);

  // 2) Transformation pure pivot → enregistrements (FK résolues, idempotence).
  report('build', 8);
  const { out, reused, warnings } = buildImportRecords(bundle, schoolId, { classes, subjects, students, fees, teachers, payments });

  // 3) Écriture IDB en lot (8 → 35 %), ordre FK respecté.
  const writeSteps = [
    [teachersDB,    out.teachers],
    [classesDB,     out.classes],
    [subjectsDB,    out.subjects],
    [studentsDB,    out.students],
    [gradesDB,      out.grades],
    [feesDB,        out.fees],
    [feePaymentsDB, out.payments],
  ];
  const totalLocal = writeSteps.reduce((n, [, rows]) => n + rows.length, 0) || 1;
  let written = 0;
  report('write', 9);
  for (const [store, rows] of writeSteps) {
    await store.putMany(rows);
    written += rows.length;
    report('write', 9 + 26 * (written / totalLocal));
  }
  const queued = totalLocal;

  // 4) Sync (35 → 100 %). En ligne : upsert par lots (rapide). Sinon : empilage
  //    en file pour une sync ultérieure.
  // En LAN, le serveur local (localhost) est TOUJOURS joignable même si le poste
  // n'a pas Internet → on ne se fie pas à navigator.onLine, on sync directement.
  const isLan   = import.meta.env.VITE_EDITION === 'lan';
  const online  = isLan || (typeof navigator !== 'undefined' && navigator.onLine);
  const doFlush = flush ?? online;
  let sync = null;

  if (doFlush && online) {
    sync = await syncImportBatched(out, report);
  } else {
    report('queue', 92);
    await enqueueImport(out);
    report('queue', 100);
  }
  try { useUiStore.getState().setPendingCount(await getQueueCount()); } catch { /* ignore */ }

  const created = {
    classes: out.classes.length, subjects: out.subjects.length, students: out.students.length,
    grades: out.grades.length, teachers: out.teachers.length, fees: out.fees.length, payments: out.payments.length,
  };
  report('done', 100);
  return { created, reused, queued, sync, warnings };
}

// Aplatit `out` en tables prêtes à upserter (cloud Supabase OU localClient/LAN).
// Les notes (1 enregistrement = 1 séquence avec map de scores) sont déployées en
// lignes par matière via gradeEntryToRows (même conversion que la sync normale).
function importTables(out) {
  const gradeRows = [];
  for (const g of out.grades) {
    gradeRows.push(...gradeEntryToRows(g.class_id, g.student_id, g.sequence, g.scores, g.school_id));
  }
  const studentRows = out.students.map((s) => ({ ...s, gender: s.gender || null, statut: s.statut || null }));
  return [
    { table: 'teachers',     rows: out.teachers,  onConflict: 'id' },
    { table: 'classes',      rows: out.classes,   onConflict: 'id' },
    { table: 'subjects',     rows: out.subjects,  onConflict: 'id' },
    { table: 'students',     rows: studentRows,   onConflict: 'id' },
    { table: 'grades',       rows: gradeRows,     onConflict: 'class_id,student_id,subject_id,sequence' },
    { table: 'student_fees', rows: out.fees,      onConflict: 'id' },
    { table: 'fee_payments', rows: out.payments,  onConflict: 'id' },
  ];
}

const SYNC_CHUNK = 500;

// Sync rapide par lots de SYNC_CHUNK lignes (≈1 requête / 500 lignes au lieu de
// 1 requête / ligne). Si un lot échoue, la table bascule en syncQueue (repli :
// nouvel essai automatique plus tard), sans interrompre l'import.
async function syncImportBatched(out, report) {
  const tables = importTables(out);
  const total  = tables.reduce((n, t) => n + t.rows.length, 0) || 1;
  let done = 0, synced = 0, failed = 0;
  const failedTables = new Set();

  for (const { table, rows, onConflict } of tables) {
    for (let i = 0; i < rows.length; i += SYNC_CHUNK) {
      const batch = rows.slice(i, i + SYNC_CHUNK);
      try {
        const { error } = await supabase.from(table).upsert(batch, { onConflict });
        if (error) throw error;
        synced += batch.length;
      } catch (err) {
        console.error(`[import] lot ${table} échoué — repli en file`, err?.message ?? err);
        failed += batch.length;
        failedTables.add(table);
      }
      done += batch.length;
      report('sync', 35 + 64 * (done / total));
    }
  }

  // Repli : ré-empile les tables en échec (upsert idempotent au prochain flush).
  if (failedTables.size) await enqueueImport(out, failedTables);
  return { synced, failed, total };
}

// Empile les enregistrements dans la syncQueue (format attendu par replayItem),
// en UNE transaction. @param only  Set de tables serveur à empiler (défaut: toutes).
async function enqueueImport(out, only = null) {
  const map = [
    ['teachers',     out.teachers, 'upsert'],
    ['classes',      out.classes,  'upsert'],
    ['subjects',     out.subjects, 'upsert'],
    ['students',     out.students, 'upsert'],
    ['grades',       out.grades,   'upsert'],
    ['student_fees', out.fees,     'upsert'],
    ['fee_payments', out.payments, 'insert'],
  ];
  const ops = [];
  for (const [table, rows, operation] of map) {
    if (only && !only.has(table)) continue;
    for (const payload of rows) ops.push({ table, operation, payload });
  }
  if (ops.length) await syncQueueDB.pushMany(ops);
}
