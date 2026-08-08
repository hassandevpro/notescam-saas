// Offline-first school data store.
//
// Write path: IDB immediately (optimistic) → Supabase if online, queue if not.
// Read path:  IDB first (instant) → Supabase refresh if online → IDB updated.
//
// gradeMap key format: "${classId}_${studentId}_${sequence}"
// This is the exact format bulletinEngine expects for allGrades.

import { create } from 'zustand';
import { initDB, classesDB, subjectsDB, studentsDB, gradesDB, syncQueueDB, teachersDB, feesDB, feePaymentsDB, academicPeriodsDB, staffDB, classFeeGridsDB, apcRefDB, apcNotesDB, scRefDB, matRefDB, matObsDB, primRefDB, primNotesDB, schoolUnitsDB, assignmentsDB } from '../lib/db';
import { fetchSchoolUnits, upsertSchoolUnit, deleteSchoolUnit as sbDeleteSchoolUnit } from '../lib/schoolUnitService';
import { fetchReferentiel, fetchApcNotes, upsertApcNote, buildNoteRecord, noteNkey } from '../lib/apcService';
import { fetchScReferentiel } from '../lib/scService';
import { fetchMatReferentiel, fetchMatObservations, upsertMatObservation, buildObsRecord, obsNkey } from '../lib/matService';
import { fetchPrimReferentiel, fetchPrimNotes, upsertPrimNote, buildPrimNoteRecord, primNkey } from '../lib/primService';
import { buildSubjectsForClass } from '../lib/scAutoConfig';
import { buildSubjectsForApcClass } from '../lib/apcAutoConfig';
import { buildSubjectsForMatClass } from '../lib/matAutoConfig';
import { buildSubjectsForPrimClass } from '../lib/primAutoConfig';
import { buildSubjectsForClassicClass } from '../core/classicSubjects';
import { resolveClassEngine } from '../core/engineResolver';
import { filterClassesByScope, isGlobalScope } from '../core/surveillantScope';
import { fetchPeriods } from '../lib/academicPeriodsService';
import { deriveActiveSequence, isSequenceLockedByPeriod, anySequenceLockedThisYear } from '../lib/periodLogic';
import { isSequenceLocked as isClassSequenceLocked } from '../lib/lockService';
import { toast } from './toastStore';
import { tStatic } from '../lib/i18n';
import {
  fetchClasses, upsertClass, deleteClass as sbDeleteClass,
  fetchSubjects, upsertSubject, deleteSubject as sbDeleteSubject,
  fetchStudents, fetchStudentsByIds, upsertStudent, deleteStudent as sbDeleteStudent,
  fetchGrades, gradeRowsToMap, upsertGradeEntry,
  fetchAbsences, upsertAbsenceEntry,
  fetchTeachers, upsertTeacher, deleteTeacher as sbDeleteTeacher,
  fetchFees, upsertFee, deleteFee as sbDeleteFee,
  // `deleteFeePayment` n'est plus importé : un versement ne se supprime plus
  // (contre-passation obligatoire, cf. reversePayment).
  fetchFeePayments, insertFeePayment,
  fetchClassFeeGrids, upsertClassFeeGrid, deleteClassFeeGrid as sbDeleteClassFeeGrid,
  fetchAssignments, upsertAssignments,
} from '../lib/schoolService';
import { upsertGradeNotification } from '../lib/notificationsService';
import { moveToTrash, logAction } from '../lib/historyService';
// Audit SERVEUR des mouvements d'argent (append-only, acteur estampillé par
// kernel_emit côté Cloud). Complète logAction, qui n'est que local.
import { emitFinanceEvent } from '../domains/finance/emit';
import { AGGREGATE as FIN_AGG, EVT as FIN_EVT } from '../domains/finance/events';
import { collectStudentBundle, collectSubjectBundle, collectClassBundle, hasRealGrades, hasSpecialFields } from '../lib/studentBundle';
import { sumPaidForStudent, derivePaid, reconcilePaid, computeTransferFeePatch } from '../lib/feeEngine';
import { retentionDecision, RETENTION, splitArchived, archiveFields, unarchiveFields } from '../lib/studentRetention';
import { expectedCash, reconcile, requiresExplanation, canValidate, SESSION_STATUS } from '../lib/cashSessionEngine';
import { fetchCashSessions, upsertCashSession } from '../lib/cashSessionService';
import { fetchStaff, upsertStaff, deleteStaff as sbDeleteStaff } from '../lib/staffService';
import { buildTransfer, resolveTransferType } from '../core/transferEngine';
import { flushSyncQueue } from '../lib/sync';
import { backendOnline } from '../lib/edition';
import { uuid } from '../lib/uuid';
import { getNextLevel, computeNextYear, isRepeater, lastSequenceFor } from '../lib/yearEngine';
import { promotionAlreadyDone } from '../lib/promotionGuard';
import { useUiStore } from './uiStore';
import { useAuthStore } from './authStore';

// Throttle : 1 notification max par (classId_sequence) toutes les 2 min
const _gradeNotifLastSent = {};

async function queueOffline(op) {
  await syncQueueDB.push(op);
  useUiStore.getState().incrementPending();
}

function gradeKey(classId, studentId, sequence) {
  return `${classId}_${studentId}_${sequence}`;
}

// Le serveur LAN renvoie les colonnes jsonb comme CHAÎNES JSON (alors que
// Supabase les renvoie déjà désérialisées). On normalise donc les champs JSON
// à l'entrée du store pour que le reste de l'app voie TOUJOURS des tableaux.
function parseJsonArray(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string' && v.trim()) {
    try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; }
  }
  return [];
}
function coerceFeeRow(f) {
  return { ...f, tranches: parseJsonArray(f?.tranches), adjustments: parseJsonArray(f?.adjustments) };
}
function coerceGridRow(g) {
  return { ...g, tranches: parseJsonArray(g?.tranches) };
}

// Converts empty strings to null for date/nullable columns so Postgres doesn't reject them.
// Only sanitizes fields that are explicitly present in data — never adds null overrides for
// absent fields, which would wipe existing values when doing a partial update (e.g. class_id only).
const NULLABLE_STUDENT_FIELDS = [
  'date_naissance', 'gender', 'statut', 'matricule', 'parent_phone', 'lieu_naissance',
  'adresse', 'contact_urgence', 'nom_pere', 'profession_pere',
  'nom_mere', 'profession_mere', 'tuteur',
];
const GENDER_MAP = { m: 'Masculin', masculin: 'Masculin', male: 'Masculin', garcon: 'Masculin', h: 'Masculin', homme: 'Masculin', f: 'Feminin', feminin: 'Feminin', female: 'Feminin', fille: 'Feminin', femme: 'Feminin' };

function sanitizeStudent(data) {
  const out = { ...data };
  for (const key of NULLABLE_STUDENT_FIELDS) {
    if (key in out) out[key] = out[key] || null;
  }
  if ('gender' in out && out.gender) {
    out.gender = GENDER_MAP[out.gender.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')] ?? out.gender;
  }
  return out;
}

function buildGradeMap(records) {
  const map = {};
  for (const r of records) {
    map[r.key] = r.scores;
  }
  return map;
}

function normalizeGender(s) {
  return {
    ...s,
    gender: s.gender
      ? (GENDER_MAP[s.gender.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')] ?? s.gender)
      : null,
  };
}

// Rebuild an archived year's roster when the class-scoped fetch comes back empty.
// Older promotions moved each student's single row forward (its class_id now points
// to a later year's class), so the past year shows no students even though their
// grades still reference (student_id, archived class_id). We recover the roster by
// taking the canonical student row from `pool` and pinning class_id back to the
// archived class. No DB write — the override lives only in the in-memory view.
// Students that still have their own row for this year are kept as-is, so years
// promoted by the fixed code (which duplicates rows per year) are a no-op here.
function reconstructRoster(roster, grades, pool, classIds) {
  if (!grades?.length || !pool?.length) return roster;
  const present  = new Set(roster.map((s) => s.id));
  const byId     = new Map(pool.map((s) => [s.id, s]));
  const archived = new Map(); // student_id → archived class_id (first seen)
  for (const g of grades) {
    if (classIds.has(g.class_id) && !present.has(g.student_id) && !archived.has(g.student_id)) {
      archived.set(g.student_id, g.class_id);
    }
  }
  if (archived.size === 0) return roster;
  const extra = [];
  for (const [sid, cid] of archived) {
    const base = byId.get(sid);
    if (base) extra.push({ ...base, class_id: cid });
  }
  return extra.length ? [...roster, ...extra] : roster;
}

// ── Gel de configuration (audit C2) ─────────────────────────────────────────
// Une classe est FIGÉE quand un de ses bulletins est déjà verrouillé. On refuse
// alors les modifications de matières qui affectent le calcul — sinon elles
// réécriraient rétroactivement un bulletin verrouillé (les NOTES sont déjà gelées
// par C6 ; restent coef/barème/structure).
//
// Le gel est PRÉCIS PAR CLASSE (ne pas sur-bloquer une classe créée après un
// verrou, donc sans bulletin verrouillé) :
//   1. verrou par classe (validation admin explicite) sur une séquence de la classe ;
//   2. OU verrou de période (academic_periods.is_locked, synchronisé) ET la classe
//      a effectivement des notes dans cette séquence verrouillée.
function isClassConfigFrozen(state, classId) {
  const { academicPeriods, activeYear, schoolId, classes, gradeMap } = state;
  const cls = classes.find((c) => c.id === classId);
  const maxSeq = cls ? lastSequenceFor(cls) : 6;

  // 1) Verrou par classe.
  for (let s = 1; s <= maxSeq; s++) {
    if (isClassSequenceLocked(schoolId, classId, s)) return true;
  }

  // 2) Verrou de période + la classe a des notes dans la séquence verrouillée.
  if (anySequenceLockedThisYear(academicPeriods, activeYear)) {
    const lockedOrders = new Set(
      (academicPeriods || [])
        .filter((p) => p && p.type === 'sequence' && (!activeYear || p.school_year === activeYear) && p.is_locked === true)
        .map((p) => Number(p.sequence_order)),
    );
    const prefix = classId + '_';
    for (const key of Object.keys(gradeMap || {})) {
      if (!key.startsWith(prefix)) continue;
      const seq = Number(key.slice(key.lastIndexOf('_') + 1));
      if (lockedOrders.has(seq)) return true;
    }
  }
  return false;
}

// Champs d'une matière qui changent une moyenne / un rang. Le nom, l'enseignant,
// la catégorie et la POSITION (ordre d'affichage, purement cosmétique — le calcul
// somme les matières quel que soit l'ordre) NE sont PAS ici : ils restent
// modifiables même figé.
// Normalise '' / undefined → null pour comparer sans faux positif (formulaires).
const _normCalc = (v) => (v === '' || v === undefined ? null : v);

const SUBJECT_CALC_NUM   = ['coef', 'max'];
const SUBJECT_CALC_OTHER = ['parent_id', 'calc_method'];
function changesSubjectCalc(existing, data) {
  for (const k of SUBJECT_CALC_NUM) {
    if (k in data && Number(data[k] ?? 0) !== Number(existing?.[k] ?? 0)) return true;
  }
  for (const k of SUBJECT_CALC_OTHER) {
    if (k in data && _normCalc(data[k]) !== _normCalc(existing?.[k])) return true;
  }
  return false;
}

// Champs d'une CLASSE qui rescalent les moyennes ou changent le moteur de bulletin
// (barème de sortie, système, cycle, série, moteur). Le nom, la section, le prof
// principal NE sont PAS ici : modifiables même figé.
const CLASS_CALC_NUM   = ['grade_max'];
const CLASS_CALC_OTHER = ['system', 'cycle', 'serie', 'bulletin_engine'];
function changesClassCalc(existing, data) {
  for (const k of CLASS_CALC_NUM) {
    // grade_max peut être absent (défaut système) : ne compte que si les deux
    // côtés sont définis et diffèrent numériquement.
    if (k in data && data[k] != null && existing?.[k] != null && Number(data[k]) !== Number(existing[k])) return true;
  }
  for (const k of CLASS_CALC_OTHER) {
    if (k in data && _normCalc(data[k]) !== _normCalc(existing?.[k])) return true;
  }
  return false;
}

export const useSchoolStore = create((set, get) => ({
  schoolId:   null,
  activeYear: null,
  classes:      [],
  subjects:     [],
  students:     [],
  // Élèves ARCHIVÉS (sortis des listes actives, jamais supprimés) : ils portent
  // des écritures de caisse, donc leur ligne doit survivre.
  archivedStudents: [],
  // Arrêtés de caisse (rapprochement espèces ↔ écritures), chargés à la demande.
  cashSessions: [],
  teachers:     [],
  staff:        [],
  fees:         [],
  feePayments:  [],
  classFeeGrids: [],
  schoolUnits:  [],
  assignments:  [],   // affectations historisées (source de vérité ; students.class_id = cache courant)
  gradeMap:     {},
  academicPeriods: [],
  activeSequence:  null,
  // Moteur APC (chargé à la demande par l'écran de saisie quand l'école est en
  // bulletin_engine='apc_minesec'). `apcReferentiel` = blob officiel (cache IDB
  // → refresh cloud) ; `apcNotes` = { [nkey]: record }.
  apcReferentiel: null,
  apcNotes:     {},
  // Moteur SECOND CYCLE MINESEC : référentiel séries/coefficients/groupes (cache
  // IDB → refresh cloud), chargé à la demande par Classes/Grades.
  scReferentiel: null,
  // Moteurs FONDAMENTAL MINEDUB : référentiels + transactionnel chargés à la
  // demande par les écrans de saisie. `matObservations`/`primNotes` = { [nkey]: record }.
  matReferentiel:  null,
  matObservations: {},
  primReferentiel: null,
  primNotes:       {},
  loading:      false,
  error:        null,

  // Called by App once school is known (schoolId + activeYear from authStore).
  // Loads IDB immediately (year-filtered), then refreshes from Supabase if online.
  // teacherId: if set (teacher role), restricts visible classes to those assigned to this teacher.
  init: async (schoolId, activeYear, teacherId) => {
    if (!schoolId) return;
    // Wipe stale data from any previous session immediately — prevents flash of wrong data
    set({ loading: true, error: null, schoolId, activeYear: activeYear || null,
          classes: [], subjects: [], students: [], archivedStudents: [], teachers: [], staff: [], fees: [], feePayments: [], classFeeGrids: [], schoolUnits: [], assignments: [], gradeMap: {},
          academicPeriods: [], activeSequence: null });

    try {
      await initDB();

      const [idbClasses, idbSubjects, idbStudents, idbGrades, idbTeachers, idbStaff, idbFees, idbFeePayments, idbFeeGrids, idbPeriods, idbUnits, idbAssignments] = await Promise.all([
        classesDB.getAll(),
        subjectsDB.getAll(),
        studentsDB.getAll(),
        gradesDB.getAll(),
        teachersDB.getAll(),
        staffDB.getAll().catch(() => []),
        feesDB.getAll(),
        feePaymentsDB.getAll().catch(() => []),
        classFeeGridsDB.getAll().catch(() => []),
        academicPeriodsDB.getAll().catch(() => []),
        schoolUnitsDB.getAll().catch(() => []),
        assignmentsDB.getAll().catch(() => []),
      ]);

      // Filter by school
      let allClasses  = idbClasses.filter((c) => c.school_id === schoolId);
      let allSubjects = idbSubjects.filter((s) => s.school_id === schoolId);
      let allStudents = idbStudents.filter((s) => s.school_id === schoolId);
      let allGrades   = idbGrades.filter((g) => g.school_id === schoolId);
      const allTeachers = idbTeachers.filter((t) => t.school_id === schoolId);
      const allStaff    = idbStaff.filter((s) => s.school_id === schoolId);
      const allFees        = idbFees.filter((f) => f.school_id === schoolId && (!activeYear || f.academic_year === activeYear)).map(coerceFeeRow);
      const allFeePayments = idbFeePayments.filter((p) => p.school_id === schoolId && (!activeYear || p.academic_year === activeYear));
      const allFeeGrids    = idbFeeGrids.filter((g) => g.school_id === schoolId && (!activeYear || g.academic_year === activeYear)).map(coerceGridRow);
      const allPeriods     = idbPeriods.filter((p) => p.school_id === schoolId && (!activeYear || p.school_year === activeYear));
      // Unités pédagogiques : périmètre ÉCOLE (jamais filtrées par année ni par
      // rôle) — elles définissent l'identité des documents pour tout le monde.
      const allUnits       = (idbUnits || []).filter((u) => u.school_id === schoolId);
      // Affectations : périmètre ÉCOLE, toutes années (c'est l'historique). Jamais
      // filtrées par année/rôle. students.class_id reste le cache de la classe courante.
      const allAssignments = (idbAssignments || []).filter((a) => a.school_id === schoolId);

      // Filter by active year (classes drive the year scope)
      if (activeYear) {
        const yearClasses   = allClasses.filter((c) => c.current_year === activeYear);
        const yearClassIds  = new Set(yearClasses.map((c) => c.id));
        const studentPool   = allStudents; // school-scoped, before the year filter
        allClasses  = yearClasses;
        allSubjects = allSubjects.filter((s) => yearClassIds.has(s.class_id));
        allGrades   = allGrades.filter((g) => yearClassIds.has(g.class_id));
        allStudents = allStudents.filter((s) => yearClassIds.has(s.class_id));
        // Recover archived rosters emptied by an older promotion (see helper).
        allStudents = reconstructRoster(allStudents, allGrades, studentPool, yearClassIds);
      }

      // Teacher scope: keep only classes where teacher is the titulaire (class.teacher_id)
      // or where at least one subject is assigned to this teacher (subject.teacher_id)
      if (teacherId) {
        const teacherClassIds = new Set([
          ...allClasses.filter((c) => c.teacher_id === teacherId).map((c) => c.id),
          ...allSubjects.filter((s) => s.teacher_id === teacherId).map((s) => s.class_id),
        ]);
        // Always restrict — if no classes assigned yet, teacher sees empty (message shown in UI)
        allClasses  = allClasses.filter((c) => teacherClassIds.has(c.id));
        allSubjects = allSubjects.filter((s) => teacherClassIds.has(s.class_id));
        allStudents = allStudents.filter((s) => teacherClassIds.has(s.class_id));
        allGrades   = allGrades.filter((g) => teacherClassIds.has(g.class_id));
      }

      // Surveillant scope: restrict to the sections/cycles/classes assigned to
      // this supervisor (empty scope = whole establishment). Admin/censeur keep all.
      const { role: _role, scope: _scope } = useAuthStore.getState();
      if (_role === 'surveillant' && !isGlobalScope(_scope)) {
        const scopeIds = new Set(filterClassesByScope(_scope, allClasses).map((c) => c.id));
        allClasses  = allClasses.filter((c) => scopeIds.has(c.id));
        allSubjects = allSubjects.filter((s) => scopeIds.has(s.class_id));
        allStudents = allStudents.filter((s) => scopeIds.has(s.class_id));
        allGrades   = allGrades.filter((g) => scopeIds.has(g.class_id));
      }

      // Un élève ARCHIVÉ conserve toutes ses données mais sort des listes
      // actives (classes, notes, bulletins, effectifs). Il reste joignable par
      // `archivedStudents` — jamais supprimé, donc ses écritures de caisse
      // restent rattachées à un élève existant.
      const { active: liveStudents, archived: archivedList } = splitArchived(allStudents);

      set({
        classes:     allClasses,
        subjects:    allSubjects,
        students:    liveStudents,
        archivedStudents: archivedList,
        teachers:    allTeachers,
        staff:       allStaff,
        fees:        allFees,
        feePayments: allFeePayments,
        classFeeGrids: allFeeGrids,
        schoolUnits: allUnits,
        assignments: allAssignments,
        gradeMap:    buildGradeMap(allGrades),
        academicPeriods: allPeriods,
        activeSequence:  deriveActiveSequence(allPeriods),
        loading:     false,
      });

      // Auto-guérison du cache frais_payes depuis les lignes de paiement (offline-first).
      get().reconcileFeesPaid();

      if (backendOnline()) {
        get()._refreshFromSupabase(schoolId, activeYear);
      }
    } catch (err) {
      console.error('schoolStore.init', err);
      set({ loading: false, error: err.message });
    }
  },

  _refreshFromSupabase: async (schoolId, activeYear) => {
    const year      = activeYear ?? get().activeYear;
    const teacherId = useAuthStore.getState().teacherId;

    // Perf : on récupère d'abord les classes de l'année active, puis on limite
    // notes / matières / élèves à CES classes (`.in('class_id', …)`). Sans ce
    // périmètre, chaque rafraîchissement tirait TOUTE l'école, toutes années
    // confondues → consulter une archive (ou simplement recharger) devenait très
    // lent sur une base avec plusieurs années d'historique importé. L'IDB reste
    // alimentée par fusion, donc les années déjà consultées restent en cache.
    const sbClasses = await fetchClasses(schoolId, year);
    const scopeIds  = (sbClasses ?? get().classes).map((c) => c.id);

    const [sbSubjects, sbStudents, sbGrades, sbAbsences, sbTeachers, sbStaff, sbFees, sbFeePayments, sbFeeGrids, sbPeriods, sbUnits, sbAssignments] = await Promise.all([
      fetchSubjects(schoolId, scopeIds),
      fetchStudents(schoolId, scopeIds),
      fetchGrades(schoolId, scopeIds),
      fetchAbsences(schoolId),
      fetchTeachers(schoolId),
      fetchStaff(schoolId).catch(() => null),
      fetchFees(schoolId, year),
      fetchFeePayments(schoolId, year).catch(() => null),
      fetchClassFeeGrids(schoolId, year).catch(() => null),
      fetchPeriods(schoolId, year).catch(() => null),
      fetchSchoolUnits(schoolId).catch(() => null),
      fetchAssignments(schoolId).catch(() => null),
    ]);

    // ── Normalize student genders ────────────────────────────────────────
    const normalizedStudents = sbStudents?.map(normalizeGender) ?? null;

    // ── Year scope: build filtered collections in local vars ─────────────
    let newClasses  = sbClasses  ?? get().classes;
    const activeClassIds = new Set(newClasses.map((c) => c.id));

    let newSubjects = sbSubjects !== null
      ? sbSubjects.filter((s) => !year || activeClassIds.has(s.class_id))
      : get().subjects;

    let newStudents = normalizedStudents !== null
      ? normalizedStudents.filter((s) => !year || activeClassIds.has(s.class_id))
      : get().students;

    // Recover an archived year whose roster came back empty because students were
    // promoted forward: their rows now point to a later year's class, so fetch them
    // by id and pin them back to the archived class via grades (see reconstructRoster).
    if (year && normalizedStudents !== null && sbGrades?.length) {
      const present = new Set(newStudents.map((s) => s.id));
      const missingIds = [...new Set(
        sbGrades
          .filter((g) => activeClassIds.has(g.class_id) && !present.has(g.student_id))
          .map((g) => g.student_id)
      )];
      if (missingIds.length) {
        const moved = (await fetchStudentsByIds(schoolId, missingIds)).map(normalizeGender);
        if (moved.length) {
          await studentsDB.putMany(moved); // cache canonical rows so offline archive view works
          newStudents = reconstructRoster(newStudents, sbGrades, moved, activeClassIds);
        }
      }
    }

    const newTeachers     = sbTeachers     ?? get().teachers;
    const newStaff        = sbStaff        ?? get().staff;
    const newFees         = sbFees !== null ? sbFees.map(coerceFeeRow) : get().fees;
    const newFeePayments  = sbFeePayments  ?? get().feePayments;
    const newFeeGrids     = sbFeeGrids !== null ? sbFeeGrids.map(coerceGridRow) : get().classFeeGrids;
    const newPeriods      = sbPeriods !== null
      ? sbPeriods.filter((p) => !year || p.school_year === year)
      : get().academicPeriods;
    const newUnits        = sbUnits ?? get().schoolUnits;
    // Affectations : périmètre école, toutes années — jamais filtrées par rôle/année.
    const newAssignments  = sbAssignments !== null
      ? sbAssignments.filter((a) => a.school_id === schoolId)
      : get().assignments;

    // ── Teacher scope: filter BEFORE touching state ──────────────────────
    // Build class set from both class.teacher_id and subject.teacher_id
    if (teacherId) {
      const allSubs = sbSubjects ?? get().subjects;
      const teacherClassIds = new Set([
        ...newClasses.filter((c) => c.teacher_id === teacherId).map((c) => c.id),
        ...allSubs.filter((s) => s.teacher_id === teacherId).map((s) => s.class_id),
      ]);
      newClasses  = newClasses.filter((c) => teacherClassIds.has(c.id));
      newSubjects = newSubjects.filter((s) => teacherClassIds.has(s.class_id));
      newStudents = newStudents.filter((s) => teacherClassIds.has(s.class_id));
    }

    // ── Surveillant scope (mirrors init) ─────────────────────────────────
    const svRole  = useAuthStore.getState().role;
    const svScope = useAuthStore.getState().scope;
    if (svRole === 'surveillant' && !isGlobalScope(svScope)) {
      const scopeIds = new Set(filterClassesByScope(svScope, newClasses).map((c) => c.id));
      newClasses  = newClasses.filter((c) => scopeIds.has(c.id));
      newSubjects = newSubjects.filter((s) => scopeIds.has(s.class_id));
      newStudents = newStudents.filter((s) => scopeIds.has(s.class_id));
    }

    // ── Persist full (unfiltered) data to IDB ────────────────────────────
    if (sbClasses          !== null) await classesDB.putMany(sbClasses);
    if (sbSubjects         !== null) await subjectsDB.putMany(sbSubjects);
    if (normalizedStudents !== null) await studentsDB.putMany(normalizedStudents);
    if (sbTeachers         !== null) await teachersDB.putMany(sbTeachers);
    if (sbStaff            !== null) await staffDB.putMany(sbStaff);
    if (sbFees             !== null) await feesDB.putMany(newFees);
    if (sbFeePayments      !== null) await feePaymentsDB.putMany(sbFeePayments);
    if (sbFeeGrids         !== null) await classFeeGridsDB.putMany(newFeeGrids);
    if (sbPeriods          !== null) await academicPeriodsDB.putMany(sbPeriods);
    if (sbUnits            !== null) await schoolUnitsDB.putMany(sbUnits);
    if (sbAssignments      !== null) await assignmentsDB.putMany(sbAssignments);

    // ── Réconciliation du cache IDB (anti-orphelins) ─────────────────────
    // `putMany` n'écrit qu'en UPSERT : sans élagage, les lignes supprimées côté
    // cloud (nettoyages / re-seeds) restaient indéfiniment en cache et étaient
    // PEINTES au rechargement AVANT le refresh réseau → flash de compteurs
    // gonflés (ex. 650 matières au lieu de 221, 52 classes au lieu de 29). On
    // retire ici les lignes de CETTE école absentes du jeu autoritatif, en
    // respectant le périmètre du fetch pour ne jamais toucher les archives
    // d'autres années gardées volontairement en cache offline :
    //   - école entière           : teachers / staff / units / assignments ;
    //   - année active (current_year) : classes (fetchClasses est scopé année) ;
    //   - orphelins de classe disparue OU retirés de l'année active : subjects /
    //     students (les autres années, portées par des classes encore vivantes,
    //     restent en cache). Best-effort : n'échoue jamais un refresh réussi.
    try {
      const idOf = (r) => r.id;
      const prune = async (store, cached, isStale) => {
        const ids = cached.filter(isStale).map(idOf);
        if (ids.length) await store.deleteMany(ids);
      };
      if (sbTeachers !== null) { const keep = new Set(sbTeachers.map(idOf)); await prune(teachersDB, await teachersDB.getAll(), (r) => r.school_id === schoolId && !keep.has(r.id)); }
      if (sbStaff    !== null) { const keep = new Set(sbStaff.map(idOf));    await prune(staffDB,    await staffDB.getAll(),    (r) => r.school_id === schoolId && !keep.has(r.id)); }
      if (sbUnits    !== null) { const keep = new Set(sbUnits.map(idOf));    await prune(schoolUnitsDB, await schoolUnitsDB.getAll(), (r) => r.school_id === schoolId && !keep.has(r.id)); }
      if (sbAssignments !== null) { const keep = new Set(sbAssignments.map(idOf)); await prune(assignmentsDB, await assignmentsDB.getAll(), (r) => r.school_id === schoolId && !keep.has(r.id)); }
      if (sbClasses  !== null) { const keep = new Set(sbClasses.map(idOf));  await prune(classesDB,  await classesDB.getAll(),  (r) => r.school_id === schoolId && (!year || r.current_year === year) && !keep.has(r.id)); }
      // Sous-collections : après réconciliation des classes. Un subject/student qui
      // pointe vers une classe DISPARUE est un orphelin (quel que soit son année) ;
      // sinon, il n'est élagué que s'il appartient à l'année active et manque du fetch.
      const liveClassIds = new Set((await classesDB.getAll()).filter((c) => c.school_id === schoolId).map(idOf));
      if (sbSubjects !== null) {
        const keep = new Set(sbSubjects.map(idOf));
        await prune(subjectsDB, await subjectsDB.getAll(),
          (r) => r.school_id === schoolId && (!liveClassIds.has(r.class_id) || (activeClassIds.has(r.class_id) && !keep.has(r.id))));
      }
      if (normalizedStudents !== null) {
        const keep = new Set(normalizedStudents.map(idOf));
        await prune(studentsDB, await studentsDB.getAll(),
          (r) => r.school_id === schoolId && (!liveClassIds.has(r.class_id) || (activeClassIds.has(r.class_id) && !keep.has(r.id))));
      }
    } catch (e) { console.warn('[store] élagage cache IDB ignoré:', e?.message); }

    // ── Grades ────────────────────────────────────────────────────────────
    const { gradeMap } = get();
    let newGradeMap = gradeMap;

    if (sbGrades !== null) {
      const yearGrades = sbGrades.filter((g) => !year || activeClassIds.has(g.class_id));
      const gMap = gradeRowsToMap(yearGrades);

      if (sbAbsences) {
        for (const row of sbAbsences) {
          const key = `${row.class_id}_${row.student_id}_${row.sequence}`;
          if (!gMap[key]) gMap[key] = {};
          if (row.abs_j          != null) gMap[key]['__abs_j__']         = String(row.abs_j);
          if (row.abs_nj         != null) gMap[key]['__abs_nj__']        = String(row.abs_nj);
          if (row.conduite       != null) gMap[key]['__conduite__']      = String(row.conduite);
          if (row.th)                     gMap[key]['__th__']            = 'true';
          if (row.encouragement)          gMap[key]['__encouragement__'] = 'true';
          if (row.felicitation)           gMap[key]['__felicitation__']  = 'true';
          if (row.aver_travail)           gMap[key]['__aver_travail__']  = String(row.aver_travail);
          if (row.blame_travail)          gMap[key]['__blame_travail__'] = String(row.blame_travail);
          if (row.exclusions)             gMap[key]['__exclusions__']    = String(row.exclusions);
          if (row.aver_conduite)          gMap[key]['__aver_conduite__'] = String(row.aver_conduite);
          if (row.blame_conduite)         gMap[key]['__blame_conduite__']= String(row.blame_conduite);
          if (row.decision)               gMap[key]['__decision__']      = String(row.decision);
          if (row.appreciation)           gMap[key]['__appreciation__']  = String(row.appreciation);
        }
      }

      if (yearGrades.length > 0 || (sbAbsences?.length ?? 0) > 0 || Object.keys(gradeMap).length === 0) {
        const idbRecords = Object.entries(gMap).map(([key, scores]) => {
          const [classId, studentId, seq] = key.split('_');
          return { key, class_id: classId, student_id: studentId, sequence: Number(seq), school_id: schoolId, scores };
        });
        await gradesDB.putMany(idbRecords);
        newGradeMap = gMap;
      }
    }

    // ── Single atomic state update — no intermediate unfiltered state ─────
    set({
      ...(sbClasses          !== null && { classes:     newClasses }),
      ...(sbSubjects         !== null && { subjects:    newSubjects }),
      ...(normalizedStudents !== null && { students:    newStudents }),
      ...(sbTeachers         !== null && { teachers:    newTeachers }),
      ...(sbStaff            !== null && { staff:       newStaff }),
      ...(sbFees             !== null && { fees:        newFees }),
      ...(sbFeePayments      !== null && { feePayments: newFeePayments }),
      ...(sbFeeGrids         !== null && { classFeeGrids: newFeeGrids }),
      ...(sbPeriods          !== null && { academicPeriods: newPeriods, activeSequence: deriveActiveSequence(newPeriods) }),
      ...(sbUnits            !== null && { schoolUnits: newUnits }),
      ...(sbAssignments      !== null && { assignments: newAssignments }),
      gradeMap: newGradeMap,
    });

    // Réconcilie le cache frais_payes avec les lignes de paiement fraîchement
    // synchronisées (moment autoritatif : fees + payments à jour depuis le cloud).
    if (sbFees !== null || sbFeePayments !== null) get().reconcileFeesPaid();
  },

  // Recharge les périodes académiques (IDB → état) et recalcule activeSequence.
  // Appelé après une action admin (activer/clôturer/verrouiller) ou une synchro.
  _refreshAcademicPeriods: async () => {
    const { schoolId, activeYear } = get();
    if (!schoolId) return;
    const all = await academicPeriodsDB.getBySchool(schoolId).catch(() => []);
    const periods = all.filter((p) => !activeYear || p.school_year === activeYear);
    set({ academicPeriods: periods, activeSequence: deriveActiveSequence(periods) });
  },

  // ── Moteur APC (compétences) ───────────────────────────────────────────────
  // Charge le référentiel officiel + les notes de l'école (IDB d'abord, puis
  // refresh cloud si online). Appelé par l'écran de saisie APC à son montage.
  loadApc: async () => {
    const { schoolId } = get();
    if (!schoolId) return;
    await initDB();

    // 1) Cache IDB immédiat
    const [cachedRef, idbNotes] = await Promise.all([
      apcRefDB.get().catch(() => null),
      apcNotesDB.getAll().catch(() => []),
    ]);
    const notesMap = {};
    for (const n of (idbNotes || []).filter((n) => n.school_id === schoolId)) notesMap[n.nkey] = n;
    set({ apcReferentiel: cachedRef || null, apcNotes: notesMap });

    // 2) Refresh cloud (best-effort)
    if (!backendOnline()) return;
    const [ref, notes] = await Promise.all([fetchReferentiel(), fetchApcNotes(schoolId)]);
    if (ref) {
      const blob = { ...ref, id: 'referentiel' };
      await apcRefDB.put(blob).catch(() => {});
      set({ apcReferentiel: blob });
    }
    if (notes) {
      const fresh = {};
      const records = notes.map((n) => ({ ...n, nkey: noteNkey(n.eleve_id, n.competence_id, n.sequence_id) }));
      for (const n of records) fresh[n.nkey] = n;
      await apcNotesDB.putMany(records).catch(() => {});
      set({ apcNotes: fresh });
    }
  },

  // Enregistre/écrase une note de compétence (write IDB → cloud sinon queue).
  // Réutilise l'id existant (via nkey) pour rester idempotent online/offline.
  saveApcNote: async ({ eleveId, competenceId, sequenceId, note, appreciation }) => {
    const { schoolId, apcNotes } = get();
    if (!schoolId) return;
    const teacherId = useAuthStore.getState().teacherId || null;
    const nkey = noteNkey(eleveId, competenceId, sequenceId);
    const existing = apcNotes[nkey];
    const record = buildNoteRecord({
      id: existing?.id, schoolId, eleveId, competenceId, sequenceId,
      enseignantId: teacherId, note, appreciation,
    });

    await apcNotesDB.put(record);
    set({ apcNotes: { ...get().apcNotes, [nkey]: record } });

    if (backendOnline()) {
      upsertApcNote(record).then((ok) => {
        if (!ok) queueOffline({ table: 'apc_notes', operation: 'upsert', payload: record });
      });
    } else {
      queueOffline({ table: 'apc_notes', operation: 'upsert', payload: record });
    }
  },

  // ── Moteur SECOND CYCLE MINESEC ────────────────────────────────────────────
  // Charge le référentiel (séries/coefficients/groupes). IDB d'abord, puis refresh
  // cloud. Appelé par Classes (auto-config) et le routage des bulletins.
  loadSc: async () => {
    await initDB();
    const cached = await scRefDB.get().catch(() => null);
    if (cached) set({ scReferentiel: cached });
    if (!backendOnline()) return cached || null;
    const ref = await fetchScReferentiel();
    if (ref) {
      const blob = { ...ref, id: 'referentiel' };
      await scRefDB.put(blob).catch(() => {});
      set({ scReferentiel: blob });
      return blob;
    }
    return get().scReferentiel;
  },

  // ── Moteur MATERNELLE (domaines / observations A·ECA·NA) ───────────────────
  loadMat: async () => {
    const { schoolId } = get();
    if (!schoolId) return;
    await initDB();
    const [cachedRef, idbObs] = await Promise.all([
      matRefDB.get().catch(() => null),
      matObsDB.getAll().catch(() => []),
    ]);
    const obsMap = {};
    for (const o of (idbObs || []).filter((o) => o.school_id === schoolId)) obsMap[o.nkey] = o;
    set({ matReferentiel: cachedRef || null, matObservations: obsMap });

    if (!backendOnline()) return;
    const [ref, obs] = await Promise.all([fetchMatReferentiel(), fetchMatObservations(schoolId)]);
    if (ref) {
      const blob = { ...ref, id: 'referentiel' };
      await matRefDB.put(blob).catch(() => {});
      set({ matReferentiel: blob });
    }
    if (obs) {
      const fresh = {};
      const records = obs.map((o) => ({ ...o, nkey: obsNkey(o.eleve_id, o.domaine_id, o.trimestre_id) }));
      for (const o of records) fresh[o.nkey] = o;
      await matObsDB.putMany(records).catch(() => {});
      set({ matObservations: fresh });
    }
  },

  // Enregistre/écrase une observation (niveau A·ECA·NA + texte). IDB → cloud/queue.
  saveMatObservation: async ({ eleveId, domaineId, trimestreId, niveauAcquis, observation }) => {
    const { schoolId, matObservations } = get();
    if (!schoolId) return;
    const teacherId = useAuthStore.getState().teacherId || null;
    const nkey = obsNkey(eleveId, domaineId, trimestreId);
    // L'état mémoire peut être désynchronisé d'IDB (rechargement partiel, onglet
    // resté ouvert pendant un changement de schéma…) : sans ce filet, un id neuf
    // serait généré pour un nkey déjà présent en IDB → rejet silencieux par
    // l'index unique 'by_nkey' (la note « disparaît » sans erreur visible).
    const existing = matObservations[nkey] || (await matObsDB.getByNkey(nkey).catch(() => []))[0];
    const record = buildObsRecord({
      id: existing?.id, schoolId, eleveId, domaineId, trimestreId,
      enseignantId: teacherId, niveauAcquis, observation,
    });
    await matObsDB.put(record);
    set({ matObservations: { ...get().matObservations, [nkey]: record } });
    if (backendOnline()) {
      upsertMatObservation(record).then((ok) => {
        if (!ok) queueOffline({ table: 'mat_observations', operation: 'upsert', payload: record });
      });
    } else {
      queueOffline({ table: 'mat_observations', operation: 'upsert', payload: record });
    }
  },

  // ── Moteur PRIMAIRE APC (compétences × critères /10) ───────────────────────
  loadPrim: async () => {
    const { schoolId } = get();
    if (!schoolId) return;
    await initDB();
    const [cachedRef, idbNotes] = await Promise.all([
      primRefDB.get().catch(() => null),
      primNotesDB.getAll().catch(() => []),
    ]);
    const notesMap = {};
    for (const n of (idbNotes || []).filter((n) => n.school_id === schoolId)) notesMap[n.nkey] = n;
    set({ primReferentiel: cachedRef || null, primNotes: notesMap });

    if (!backendOnline()) return;
    const [ref, notes] = await Promise.all([fetchPrimReferentiel(), fetchPrimNotes(schoolId)]);
    if (ref) {
      const blob = { ...ref, id: 'referentiel' };
      await primRefDB.put(blob).catch(() => {});
      set({ primReferentiel: blob });
    }
    if (notes) {
      const fresh = {};
      const records = notes.map((n) => ({ ...n, nkey: primNkey(n.eleve_id, n.competence_id, n.critere_id, n.ua) }));
      for (const n of records) fresh[n.nkey] = n;
      await primNotesDB.putMany(records).catch(() => {});
      set({ primNotes: fresh });
    }
  },

  // Enregistre/écrase une note (compétence × critère × UA 1-8). IDB → cloud/queue.
  savePrimNote: async ({ eleveId, competenceId, critereId, ua, note }) => {
    const { schoolId, primNotes } = get();
    if (!schoolId) return;
    const teacherId = useAuthStore.getState().teacherId || null;
    const nkey = primNkey(eleveId, competenceId, critereId, ua);
    // Filet anti-désynchronisation mémoire/IDB — voir commentaire équivalent
    // dans saveMatObservation (même bug : un id neuf sur un nkey déjà en IDB
    // se fait rejeter par l'index unique 'by_nkey', la note « disparaît »).
    const existing = primNotes[nkey] || (await primNotesDB.getByNkey(nkey).catch(() => []))[0];
    const record = buildPrimNoteRecord({
      id: existing?.id, schoolId, eleveId, competenceId, critereId, ua,
      enseignantId: teacherId, note,
    });
    await primNotesDB.put(record);
    set({ primNotes: { ...get().primNotes, [nkey]: record } });
    if (backendOnline()) {
      upsertPrimNote(record).then((ok) => {
        if (!ok) queueOffline({ table: 'prim_notes', operation: 'upsert', payload: record });
      });
    } else {
      queueOffline({ table: 'prim_notes', operation: 'upsert', payload: record });
    }
  },

  // ── Academic year promotion ──────────────────────────────────────────────

  promoteYear: async () => {
    const { schoolId, classes, subjects, students, gradeMap } = get();
    const school = useAuthStore.getState().school;
    if (!school?.current_year) return { error: 'Aucune année active définie.' };

    const newYear = computeNextYear(school.current_year);

    // Garde d'idempotence (C3) : refuse si l'année cible a déjà des classes
    // (double-clic, reprise après coupure, échec partiel avant le basculement
    // d'année) — sinon toute la cohorte serait dupliquée. Lecture COMPLÈTE IDB :
    // les classes de newYear ne sont pas dans l'état en mémoire (filtré année active).
    const existingAll = await classesDB.getAll();
    if (promotionAlreadyDone(existingAll, schoolId, newYear)) {
      return { error: `L'année ${newYear} existe déjà : promotion déjà effectuée.`, alreadyDone: true };
    }

    const classMapping = new Map(); // oldClassId → newClass | null (diplômés)
    const newClasses     = [];
    const newSubjList    = [];
    const newStudents    = [];
    const newAssignments = []; // affectations INITIALES des promus (coordination modèle C5)

    // Affectation initiale d'un élève promu/redoublant dans sa nouvelle classe —
    // même patron que addStudent (moteur transferEngine, current=null → 'initial').
    // Sans elle, un élève promu n'aurait aucune affectation courante (source de
    // vérité C5) → transferts / roster / recalcul de frais cassés après promotion.
    const { user: promoter, fullName: promoterName } = useAuthStore.getState();
    const buildInitialAssignment = (ns, cls) => buildTransfer({
      current: null, newClass: cls, student: ns, schoolId, newId: uuid(),
      userId: promoter?.id, userName: promoterName,
    }).newRow;

    // Copie les matières d'une ancienne classe vers une nouvelle classe.
    const copySubjects = (oldClassId, newClassId) => {
      for (const sub of subjects.filter((s) => s.class_id === oldClassId)) {
        newSubjList.push({
          id: uuid(), school_id: schoolId, class_id: newClassId,
          name: sub.name, coef: sub.coef, max: sub.max, teacher_id: sub.teacher_id,
        });
      }
    };

    // Classe « de redoublement » créée à la demande : même niveau/nom que
    // l'ancienne, dans la nouvelle année. Une seule par ancienne classe.
    const repeatClassByOldId = new Map();
    const ensureRepeatClass = (cls) => {
      if (repeatClassByOldId.has(cls.id)) return repeatClassByOldId.get(cls.id);
      const rc = {
        id: uuid(), school_id: schoolId, name: cls.name, level: cls.level,
        section: cls.section, system: cls.system, current_year: newYear, teacher_id: cls.teacher_id,
        cycle: cls.cycle, grade_max: cls.grade_max,
      };
      repeatClassByOldId.set(cls.id, rc);
      newClasses.push(rc);
      copySubjects(cls.id, rc.id);
      return rc;
    };

    // 1. Build new classes + copy subjects (cohorte qui monte)
    for (const cls of classes) {
      const nextLevel = getNextLevel(cls.level, cls.system);
      if (nextLevel === null) {
        // Graduating class — students stay archived with old class_id
        classMapping.set(cls.id, null);
        continue;
      }
      // nextLevel undefined = niveau inconnu/ambigu → on garde le niveau actuel.
      const promotedLevel = nextLevel !== undefined ? nextLevel : cls.level;
      // Quand le nom était auto-rempli depuis le niveau (ex. classe « CP »), il
      // doit suivre la promotion (« CE1 ») ; un nom personnalisé (« CP A ») est conservé.
      const nameWasAuto = !cls.name || cls.name === cls.level;
      const newCls = {
        id:           uuid(),
        school_id:    schoolId,
        name:         nameWasAuto ? promotedLevel : cls.name,
        level:        promotedLevel,
        section:      cls.section,
        system:       cls.system,
        current_year: newYear,
        teacher_id:   cls.teacher_id,
      };
      classMapping.set(cls.id, newCls);
      newClasses.push(newCls);
      copySubjects(cls.id, newCls.id);
    }

    // 2. Promote students — DUPLICATE the row per year, exactly like classes &
    //    subjects above. The old row stays in its old class so the archived year
    //    keeps its full roster (and its grades, fees, photos); a fresh copy with a
    //    new id joins the new class. Graduates get no copy (cycle finished) — their
    //    original row stays archived in the graduating class.
    //
    //    Redoublants (décision annuelle 'redoublant' saisie au Conseil de classe)
    //    NE montent PAS : ils sont dupliqués dans une classe de redoublement au
    //    même niveau (créée à la demande), même s'ils étaient en classe diplômante.
    let promotedCount = 0, repeatedCount = 0, graduatedCount = 0;
    for (const student of students) {
      if (isRepeater(student, classes, gradeMap)) {
        const oldCls = classes.find((c) => c.id === student.class_id);
        if (!oldCls) continue;
        const rc = ensureRepeatClass(oldCls);
        const ns = { ...student, id: uuid(), class_id: rc.id, parent_token: uuid(), created_at: undefined };
        newStudents.push(ns);
        newAssignments.push(buildInitialAssignment(ns, rc));
        repeatedCount++;
        continue;
      }
      const newCls = classMapping.get(student.class_id);
      if (newCls) {
        // parent_token is UNIQUE — generate a fresh one for the copy instead of
        // reusing the old row's (would violate students_parent_token_idx).
        const ns = { ...student, id: uuid(), class_id: newCls.id, parent_token: uuid(), created_at: undefined };
        newStudents.push(ns);
        newAssignments.push(buildInitialAssignment(ns, newCls));
        promotedCount++;
      } else {
        graduatedCount++; // classe diplômante, élève non redoublant → archivé diplômé
      }
    }

    // 3. Persist to IDB
    if (newClasses.length)     await classesDB.putMany(newClasses);
    if (newSubjList.length)    await subjectsDB.putMany(newSubjList);
    for (const s of newStudents) await studentsDB.put(s);
    if (newAssignments.length) await assignmentsDB.putMany(newAssignments);

    // 4. Queue sync operations
    for (const cls of newClasses)  await queueOffline({ table: 'classes',  operation: 'upsert', payload: cls });
    for (const sub of newSubjList) await queueOffline({ table: 'subjects', operation: 'upsert', payload: sub });
    for (const s of newStudents)   await queueOffline({ table: 'students', operation: 'upsert', payload: s });
    for (const a of newAssignments) await queueOffline({ table: 'student_class_assignments', operation: 'upsert', payload: a });

    // 5. Flush sync immediately if online — ensures Supabase is up-to-date
    //    before _refreshFromSupabase could overwrite our IDB changes.
    if (backendOnline()) {
      await flushSyncQueue();
    }

    // 6. Update school's current_year in Supabase + authStore
    //    → App.jsx will detect the change and call init(schoolId, newYear)
    const { error } = await useAuthStore.getState().updateSchool({ current_year: newYear });
    if (error) return { error };

    return {
      newYear,
      newClasses:  newClasses.length,
      promoted:    promotedCount,
      repeated:    repeatedCount,
      graduated:   graduatedCount,
    };
  },

  // --- Unités pédagogiques (complexe scolaire) ---
  // Offline-first, même patron que les classes : IDB + state immédiats, puis
  // cloud (ou file de sync). Périmètre ÉCOLE, hors année.

  addUnit: async (unitData) => {
    const { schoolId, schoolUnits } = get();
    const record = {
      id: uuid(), school_id: schoolId,
      position: unitData.position ?? schoolUnits.length,
      ...unitData,
    };
    await schoolUnitsDB.put(record);
    set((s) => ({ schoolUnits: [...s.schoolUnits, record] }));
    if (backendOnline()) {
      upsertSchoolUnit(record).then((saved) => { if (!saved) queueOffline({ table: 'school_units', operation: 'upsert', payload: record }); });
    } else {
      queueOffline({ table: 'school_units', operation: 'upsert', payload: record });
    }
    return record;
  },

  updateUnit: async (id, data) => {
    const { schoolUnits } = get();
    const record = { ...schoolUnits.find((u) => u.id === id), ...data };
    await schoolUnitsDB.put(record);
    set((s) => ({ schoolUnits: s.schoolUnits.map((u) => (u.id === id ? record : u)) }));
    if (backendOnline()) {
      upsertSchoolUnit(record).then((saved) => { if (!saved) queueOffline({ table: 'school_units', operation: 'upsert', payload: record }); });
    } else {
      queueOffline({ table: 'school_units', operation: 'upsert', payload: record });
    }
  },

  deleteUnit: async (id) => {
    const snapshot = get().schoolUnits.find((u) => u.id === id);
    if (snapshot) await moveToTrash({ table: 'school_units', payload: snapshot });
    await schoolUnitsDB.delete(id);
    set((s) => ({ schoolUnits: s.schoolUnits.filter((u) => u.id !== id) }));
    // Les classes rattachées gardent leur unit_id (FK ON DELETE SET NULL côté
    // cloud). En local, on nettoie la référence pour rester cohérent.
    const orphans = get().classes.filter((c) => c.unit_id === id);
    for (const c of orphans) await get().updateClass(c.id, { unit_id: null });
    if (backendOnline()) {
      sbDeleteSchoolUnit(id).then((ok) => { if (!ok) queueOffline({ table: 'school_units', operation: 'delete', payload: { id } }); });
    } else {
      queueOffline({ table: 'school_units', operation: 'delete', payload: { id } });
    }
  },

  // --- Classes ---

  addClass: async (classData) => {
    const { schoolId } = get();
    // Année scolaire HÉRITÉE de l'année active de l'établissement — jamais saisie
    // au formulaire. Un `current_year` explicite (ex. duplication) reste prioritaire.
    const activeYear = useAuthStore.getState().school?.current_year || null;
    const record = { id: uuid(), school_id: schoolId, current_year: activeYear, ...classData };
    await classesDB.put(record);
    set((s) => ({ classes: [...s.classes, record] }));
    // Fire-and-forget : la donnée est déjà en IDB + state. On ne bloque jamais
    // l'UI sur le réseau ; un échec (ou un offline) la repousse en syncQueue.
    if (backendOnline()) {
      upsertClass(record).then((saved) => { if (!saved) queueOffline({ table: 'classes', operation: 'upsert', payload: record }); });
    } else {
      queueOffline({ table: 'classes', operation: 'upsert', payload: record });
    }
    // Auto-configuration des matières selon le moteur de la classe (no-op si non
    // concerné) : SECOND CYCLE (série), PREMIER CYCLE APC (6e–3e), MATERNELLE
    // (PS/MS/GS → domaines) ou PRIMAIRE APC (SIL…CM2 → compétences nationales).
    await get().autoConfigSecondCycle(record);
    await get().autoConfigApc(record);
    await get().autoConfigMat(record);
    await get().autoConfigPrim(record);
    // Monde CLASSIQUE : tronc commun par niveau/section (no-op si un moteur
    // officiel a déjà configuré la classe, ou si elle a déjà des matières).
    await get().autoConfigClassic(record);
    return record;
  },

  // Crée les `subjects` d'une classe de PREMIER CYCLE APC depuis le référentiel
  // (matières + coef par classe). No-op si la classe n'est pas résolue 'apc' ou si
  // elle a déjà des matières. Renvoie { created }.
  autoConfigApc: async (cls) => {
    const school = useAuthStore.getState().school;
    if (resolveClassEngine(school, cls) !== 'apc') return { created: 0 };
    let ref = get().apcReferentiel;
    if (!ref) { await get().loadApc(); ref = get().apcReferentiel; }
    const subs = buildSubjectsForApcClass({ referentiel: ref, school, cls, makeId: uuid });
    if (!subs.length) return { created: 0 };
    // Ne pas dupliquer si la classe a déjà des matières.
    const existing = get().subjects.filter((s) => s.class_id === cls.id);
    if (existing.length) return { created: 0, skipped: 'already_configured' };

    await subjectsDB.putMany(subs);
    set((s) => ({ subjects: [...s.subjects, ...subs] }));
    for (const sub of subs) {
      if (backendOnline()) {
        upsertSubject(sub).then((saved) => { if (!saved) queueOffline({ table: 'subjects', operation: 'upsert', payload: sub }); });
      } else {
        queueOffline({ table: 'subjects', operation: 'upsert', payload: sub });
      }
    }
    return { created: subs.length };
  },

  // Crée les `subjects` (domaines) d'une classe MATERNELLE depuis le référentiel
  // MINEDUB. No-op si la classe n'est pas résolue 'maternelle' ou déjà configurée.
  autoConfigMat: async (cls) => {
    const school = useAuthStore.getState().school;
    if (resolveClassEngine(school, cls) !== 'maternelle') return { created: 0 };
    let ref = get().matReferentiel;
    if (!ref) { await get().loadMat(); ref = get().matReferentiel; }
    const subs = buildSubjectsForMatClass({ referentiel: ref, school, cls, makeId: uuid });
    if (!subs.length) return { created: 0 };
    const existing = get().subjects.filter((s) => s.class_id === cls.id);
    if (existing.length) return { created: 0, skipped: 'already_configured' };

    await subjectsDB.putMany(subs);
    set((s) => ({ subjects: [...s.subjects, ...subs] }));
    for (const sub of subs) {
      if (backendOnline()) {
        upsertSubject(sub).then((saved) => { if (!saved) queueOffline({ table: 'subjects', operation: 'upsert', payload: sub }); });
      } else {
        queueOffline({ table: 'subjects', operation: 'upsert', payload: sub });
      }
    }
    return { created: subs.length };
  },

  // Crée les `subjects` (compétences nationales) d'une classe PRIMAIRE APC depuis
  // le référentiel MINEDUB. No-op si non résolue 'apc_primaire' ou déjà configurée.
  autoConfigPrim: async (cls) => {
    const school = useAuthStore.getState().school;
    if (resolveClassEngine(school, cls) !== 'apc_primaire') return { created: 0 };
    let ref = get().primReferentiel;
    if (!ref) { await get().loadPrim(); ref = get().primReferentiel; }
    const subs = buildSubjectsForPrimClass({ referentiel: ref, school, cls, makeId: uuid });
    if (!subs.length) return { created: 0 };
    const existing = get().subjects.filter((s) => s.class_id === cls.id);
    if (existing.length) return { created: 0, skipped: 'already_configured' };

    await subjectsDB.putMany(subs);
    set((s) => ({ subjects: [...s.subjects, ...subs] }));
    for (const sub of subs) {
      if (backendOnline()) {
        upsertSubject(sub).then((saved) => { if (!saved) queueOffline({ table: 'subjects', operation: 'upsert', payload: sub }); });
      } else {
        queueOffline({ table: 'subjects', operation: 'upsert', payload: sub });
      }
    }
    return { created: subs.length };
  },

  // Crée les `subjects` officiels d'une classe de second cycle depuis le
  // référentiel MINESEC. No-op si l'école n'est pas en 'minesec' ou si la classe
  // n'est pas un niveau lycée avec série. Renvoie { created }.
  autoConfigSecondCycle: async (cls) => {
    const school = useAuthStore.getState().school;
    // Résolu PAR CLASSE : marche pour 'minesec' comme pour le mode unifié 'officiel'.
    if (resolveClassEngine(school, cls) !== 'sc' || !cls?.serie) return { created: 0 };
    const ref = get().scReferentiel || await get().loadSc();
    const subs = buildSubjectsForClass({ referentiel: ref, school, cls, makeId: uuid });
    if (!subs.length) return { created: 0 };
    // Ne pas dupliquer si la classe a déjà des matières.
    const existing = get().subjects.filter((s) => s.class_id === cls.id);
    if (existing.length) return { created: 0, skipped: 'already_configured' };

    await subjectsDB.putMany(subs);
    set((s) => ({ subjects: [...s.subjects, ...subs] }));
    for (const sub of subs) {
      if (backendOnline()) {
        upsertSubject(sub).then((saved) => { if (!saved) queueOffline({ table: 'subjects', operation: 'upsert', payload: sub }); });
      } else {
        queueOffline({ table: 'subjects', operation: 'upsert', payload: sub });
      }
    }
    return { created: subs.length };
  },

  // Crée un tronc commun de `subjects` pour une classe du MONDE CLASSIQUE
  // (notes/20 FR, /100 EN). No-op si la classe n'est pas résolue 'classic' (un
  // moteur officiel s'en charge), si le système est ES (Guinée Éq.), ou si la
  // classe a déjà des matières. Renvoie { created }.
  autoConfigClassic: async (cls) => {
    const school = useAuthStore.getState().school;
    if (resolveClassEngine(school, cls) !== 'classic') return { created: 0 };
    const subs = buildSubjectsForClassicClass({ school, cls, makeId: uuid });
    if (!subs.length) return { created: 0 };
    // Ne pas dupliquer si la classe a déjà des matières.
    const existing = get().subjects.filter((s) => s.class_id === cls.id);
    if (existing.length) return { created: 0, skipped: 'already_configured' };

    await subjectsDB.putMany(subs);
    set((s) => ({ subjects: [...s.subjects, ...subs] }));
    for (const sub of subs) {
      if (backendOnline()) {
        upsertSubject(sub).then((saved) => { if (!saved) queueOffline({ table: 'subjects', operation: 'upsert', payload: sub }); });
      } else {
        queueOffline({ table: 'subjects', operation: 'upsert', payload: sub });
      }
    }
    return { created: subs.length };
  },

  // Re-déclenche l'auto-configuration des matières pour une classe existante
  // (rattrapage si le référentiel n'était pas chargé à la création). Idempotent :
  // ne fait rien si la classe a déjà des matières. Renvoie { created }.
  configureClassSubjects: async (cls) => {
    const r1 = await get().autoConfigSecondCycle(cls);
    const r2 = await get().autoConfigApc(cls);
    const r3 = await get().autoConfigMat(cls);
    const r4 = await get().autoConfigPrim(cls);
    const r5 = await get().autoConfigClassic(cls);
    return { created: (r1?.created || 0) + (r2?.created || 0) + (r3?.created || 0) + (r4?.created || 0) + (r5?.created || 0) };
  },

  updateClass: async (id, data) => {
    const state = get();
    const existing = state.classes.find((c) => c.id === id);
    // Gel C2 : le barème de sortie / le système / le moteur d'une classe rescalent
    // les moyennes → refusés si un bulletin de la classe est déjà verrouillé.
    if (existing && changesClassCalc(existing, data) && isClassConfigFrozen(state, id)) {
      toast.error(tStatic(
        'Configuration figée : une séquence de cette classe est verrouillée. Déverrouillez pour changer barème / système.',
        'Configuration frozen: a sequence of this class is locked. Unlock to change scale / system.',
        'Configuración bloqueada: una secuencia de esta clase está bloqueada. Desbloquee para cambiar escala / sistema.',
      ));
      return { error: 'frozen', locked: true };
    }
    const record = { ...existing, ...data };
    await classesDB.put(record);
    set((s) => ({ classes: s.classes.map((c) => (c.id === id ? record : c)) }));
    if (backendOnline()) {
      upsertClass(record).then((saved) => { if (!saved) queueOffline({ table: 'classes', operation: 'upsert', payload: record }); });
    } else {
      queueOffline({ table: 'classes', operation: 'upsert', payload: record });
    }
  },

  deleteClass: async (id) => {
    const snapshot = get().classes.find((c) => c.id === id);

    // Le DELETE cloud efface EN CASCADE les matières ET les élèves de la classe
    // — donc, transitivement, leurs notes, frais et paiements (cf. collectClassBundle).
    // On capture TOUT depuis l'IDB (source complète, toutes années) AVANT toute
    // suppression, pour permettre une restauration intégrale depuis la corbeille.
    const [allSubjects, allStudents, allGrades, allFees, allPayments] = await Promise.all([
      subjectsDB.getAll(),
      studentsDB.getAll(),
      gradesDB.getAll(),
      feesDB.getAll(),
      feePaymentsDB.getAll().catch(() => []),
    ]);
    const bundle = collectClassBundle(id, {
      subjects: allSubjects, students: allStudents, grades: allGrades, fees: allFees, payments: allPayments,
    });

    if (snapshot) await moveToTrash({ table: 'classes', payload: snapshot, related: bundle });

    // Nettoie l'IDB en cohérence avec le cascade backend : sans cela, matières,
    // élèves, notes, frais et paiements resteraient en cache local en pointant vers
    // une classe supprimée (orphelins ressurgissant via reconstructRoster, etc.).
    await classesDB.delete(id);
    for (const sub of bundle.subjects) await subjectsDB.delete(sub.id);
    for (const st  of bundle.students) await studentsDB.delete(st.id);
    for (const g   of bundle.grades)   await gradesDB.delete(g.key);
    for (const f   of bundle.fees)     await feesDB.delete(f.id);
    for (const p   of bundle.payments) await feePaymentsDB.delete(p.id);

    const subjIds  = new Set(bundle.subjects.map((s) => s.id));
    const studIds  = new Set(bundle.students.map((s) => s.id));
    const feeIds   = new Set(bundle.fees.map((f) => f.id));
    const payIds   = new Set(bundle.payments.map((p) => p.id));
    const gradeKys = new Set(bundle.grades.map((g) => g.key));
    set((s) => {
      const gradeMap = { ...s.gradeMap };
      for (const k of gradeKys) delete gradeMap[k];
      return {
        classes:     s.classes.filter((c) => c.id !== id),
        subjects:    s.subjects.filter((x) => !subjIds.has(x.id)),
        students:    s.students.filter((x) => !studIds.has(x.id)),
        fees:        s.fees.filter((f) => !feeIds.has(f.id)),
        feePayments: s.feePayments.filter((p) => !payIds.has(p.id)),
        gradeMap,
      };
    });

    if (backendOnline()) {
      sbDeleteClass(id).then((ok) => { if (!ok) queueOffline({ table: 'classes', operation: 'delete', payload: { id } }); });
    } else {
      queueOffline({ table: 'classes', operation: 'delete', payload: { id } });
    }
  },

  // Restaure une classe supprimée + tout son contenu (matières, élèves, notes,
  // frais, paiements) effacé en cascade. Insère la classe SANS auto-configuration
  // des matières (sinon des matières neuves feraient doublon avec celles du bundle
  // et casseraient le lien notes↔matière) puis réinjecte le bundle. Réécrit l'IDB
  // + pousse vers le backend (ou la queue offline), comme restoreStudentBundle.
  restoreClassBundle: async (classPayload, related) => {
    if (!classPayload) return;
    const { schoolId, activeYear } = get();
    const { subjects = [], students = [], grades = [], fees = [], payments = [] } = related || {};

    // --- Classe (insertion « nue », pas d'autoConfig) ---
    await classesDB.put(classPayload);
    set((s) => ({ classes: s.classes.some((c) => c.id === classPayload.id) ? s.classes : [...s.classes, classPayload] }));
    if (backendOnline()) {
      upsertClass(classPayload).then((ok) => { if (!ok) queueOffline({ table: 'classes', operation: 'upsert', payload: classPayload }); });
    } else {
      queueOffline({ table: 'classes', operation: 'upsert', payload: classPayload });
    }

    // --- Matières ---
    if (subjects.length) {
      await subjectsDB.putMany(subjects);
      set((s) => {
        const byId = new Map(s.subjects.map((x) => [x.id, x]));
        for (const sub of subjects) byId.set(sub.id, sub);
        return { subjects: [...byId.values()] };
      });
      for (const sub of subjects) {
        if (backendOnline()) upsertSubject(sub).then((ok) => { if (!ok) queueOffline({ table: 'subjects', operation: 'upsert', payload: sub }); });
        else queueOffline({ table: 'subjects', operation: 'upsert', payload: sub });
      }
    }

    // --- Élèves ---
    if (students.length) {
      await studentsDB.putMany(students);
      set((s) => {
        const byId = new Map(s.students.map((x) => [x.id, x]));
        for (const st of students) byId.set(st.id, st);
        return { students: [...byId.values()] };
      });
      for (const st of students) {
        if (backendOnline()) upsertStudent(st).then((ok) => { if (!ok) queueOffline({ table: 'students', operation: 'upsert', payload: st }); });
        else queueOffline({ table: 'students', operation: 'upsert', payload: st });
      }
    }

    // --- Notes + absences (records IDB portant les deux, cf. restoreStudentBundle) ---
    if (grades.length) {
      await gradesDB.putMany(grades);
      set((s) => {
        const gradeMap = { ...s.gradeMap };
        for (const g of grades) gradeMap[g.key] = g.scores;
        return { gradeMap };
      });
      for (const g of grades) {
        const scores = g.scores || {};
        if (backendOnline()) {
          if (hasRealGrades(scores))    upsertGradeEntry(g.class_id, g.student_id, g.sequence, scores, schoolId).then((ok) => { if (!ok) queueOffline({ table: 'grades', operation: 'upsert', payload: g }); });
          if (hasSpecialFields(scores)) upsertAbsenceEntry(g.class_id, g.student_id, g.sequence, scores, schoolId).then((ok) => { if (!ok) queueOffline({ table: 'student_absences', operation: 'upsert', payload: g }); });
        } else {
          queueOffline({ table: 'grades', operation: 'upsert', payload: g });
        }
      }
    }

    // --- Frais ---
    if (fees.length) {
      await feesDB.putMany(fees);
      set((s) => {
        const byId = new Map(s.fees.map((f) => [f.id, f]));
        for (const f of fees) if (!activeYear || f.academic_year === activeYear) byId.set(f.id, f);
        return { fees: [...byId.values()] };
      });
      for (const f of fees) {
        if (backendOnline()) upsertFee(f).then((ok) => { if (!ok) queueOffline({ table: 'student_fees', operation: 'upsert', payload: f }); });
        else queueOffline({ table: 'student_fees', operation: 'upsert', payload: f });
      }
    }

    // --- Paiements : réinsérés tels quels (pas via addPayment, qui recalculerait
    //     frais_payes et fausserait le total déjà restauré ci-dessus). ---
    if (payments.length) {
      await feePaymentsDB.putMany(payments);
      set((s) => {
        const byId = new Map(s.feePayments.map((p) => [p.id, p]));
        for (const p of payments) if (!activeYear || p.academic_year === activeYear) byId.set(p.id, p);
        return { feePayments: [...byId.values()] };
      });
      for (const p of payments) {
        if (backendOnline()) insertFeePayment(p).then((ok) => { if (!ok) queueOffline({ table: 'fee_payments', operation: 'insert', payload: p }); });
        else queueOffline({ table: 'fee_payments', operation: 'insert', payload: p });
      }
    }
  },

  // --- Subjects ---

  addSubject: async (subjectData) => {
    const { schoolId } = get();
    const record = { id: uuid(), school_id: schoolId, ...subjectData };
    await subjectsDB.put(record);
    set((s) => ({ subjects: [...s.subjects, record] }));
    // Fire-and-forget : voir addClass — jamais de blocage UI sur le réseau.
    if (backendOnline()) {
      upsertSubject(record).then((saved) => { if (!saved) queueOffline({ table: 'subjects', operation: 'upsert', payload: record }); });
    } else {
      queueOffline({ table: 'subjects', operation: 'upsert', payload: record });
    }
    return record;
  },

  updateSubject: async (id, data) => {
    const state = get();
    const existing = state.subjects.find((s) => s.id === id);
    // Gel C2 : refuse un changement de coef/barème/structure sur une classe figée.
    if (existing && changesSubjectCalc(existing, data) && isClassConfigFrozen(state, existing.class_id)) {
      toast.error(tStatic(
        'Configuration figée : une séquence de cette classe est verrouillée. Déverrouillez pour changer coefficient / barème / structure.',
        'Configuration frozen: a sequence of this class is locked. Unlock to change coefficient / scale / structure.',
        'Configuración bloqueada: una secuencia de esta clase está bloqueada. Desbloquee para cambiar coeficiente / escala / estructura.',
      ));
      return { error: 'frozen', locked: true };
    }
    const record = { ...existing, ...data };
    await subjectsDB.put(record);
    set((s) => ({ subjects: s.subjects.map((x) => (x.id === id ? record : x)) }));
    if (backendOnline()) {
      upsertSubject(record).then((saved) => { if (!saved) queueOffline({ table: 'subjects', operation: 'upsert', payload: record }); });
    } else {
      queueOffline({ table: 'subjects', operation: 'upsert', payload: record });
    }
  },

  deleteSubject: async (id) => {
    const state = get();
    const snapshot = state.subjects.find((s) => s.id === id);

    // Gel C2 : supprimer une matière change la structure/les moyennes des bulletins
    // déjà verrouillés de cette classe → refusé tant qu'une séquence est verrouillée.
    if (snapshot && isClassConfigFrozen(state, snapshot.class_id)) {
      toast.error(tStatic(
        'Suppression impossible : une séquence de cette classe est verrouillée. Déverrouillez d\'abord.',
        'Cannot delete: a sequence of this class is locked. Unlock it first.',
        'No se puede eliminar: una secuencia de esta clase está bloqueada. Desbloquéela primero.',
      ));
      return { error: 'frozen', locked: true };
    }

    // Le DELETE cloud efface EN CASCADE toutes les notes de la matière
    // (`grades.subject_id … ON DELETE CASCADE`). On capture ces notes AVANT
    // suppression pour que la corbeille puisse les restaurer (cf. collectSubjectBundle).
    const allGrades = await gradesDB.getAll();
    const bundle = collectSubjectBundle(id, { grades: allGrades });

    if (snapshot) await moveToTrash({ table: 'subjects', payload: snapshot, related: bundle });

    // Retire la cellule de cette matière des records de notes IDB + gradeMap, en
    // cohérence avec le cascade cloud (le bundle permet la restauration).
    if (bundle.subjectGrades.length) {
      const affectedKeys = new Set(bundle.subjectGrades.map((c) => c.key));
      const updated = [];
      for (const g of allGrades) {
        if (!affectedKeys.has(g.key)) continue;
        const scores = { ...(g.scores || {}) };
        delete scores[id];
        updated.push({ ...g, scores });
      }
      if (updated.length) {
        await gradesDB.putMany(updated);
        set((s) => {
          const gradeMap = { ...s.gradeMap };
          for (const rec of updated) gradeMap[rec.key] = rec.scores;
          return { gradeMap };
        });
      }
    }

    await subjectsDB.delete(id);
    set((s) => ({ subjects: s.subjects.filter((x) => x.id !== id) }));
    if (backendOnline()) {
      sbDeleteSubject(id).then((ok) => { if (!ok) queueOffline({ table: 'subjects', operation: 'delete', payload: { id } }); });
    } else {
      queueOffline({ table: 'subjects', operation: 'delete', payload: { id } });
    }
  },

  // Restaure les notes d'une matière supprimée (effacées en cascade). La ligne
  // matière est déjà recréée par addSubject (même id) via restoreFromTrash ; ici on
  // réinjecte chaque cellule de note dans les records IDB + gradeMap et on pousse
  // vers le backend (ou la queue offline).
  restoreSubjectBundle: async (subjectId, related) => {
    const cells = related?.subjectGrades || [];
    if (!cells.length) return;
    const { schoolId } = get();

    // Réécrit l'IDB : fusionne chaque cellule dans le record de notes existant
    // (ou un record neuf si le cascade l'avait entièrement effacé).
    const all = await gradesDB.getAll();
    const byKey = new Map(all.map((g) => [g.key, g]));
    const affectedKeys = new Set(cells.map((c) => c.key));
    for (const cell of cells) {
      const base = byKey.get(cell.key) || {
        key: cell.key, class_id: cell.class_id, student_id: cell.student_id,
        sequence: cell.sequence, school_id: schoolId, scores: {},
      };
      byKey.set(cell.key, { ...base, scores: { ...(base.scores || {}), [subjectId]: cell.value } });
    }
    const updated = [...affectedKeys].map((k) => byKey.get(k));
    await gradesDB.putMany(updated);
    set((s) => {
      const gradeMap = { ...s.gradeMap };
      for (const rec of updated) gradeMap[rec.key] = rec.scores;
      return { gradeMap };
    });

    // Pousse chaque cellule vers le cloud (le cascade l'y avait effacée).
    for (const cell of cells) {
      const payload = {
        key: cell.key, class_id: cell.class_id, student_id: cell.student_id,
        sequence: cell.sequence, school_id: schoolId, scores: { [subjectId]: cell.value },
      };
      if (backendOnline()) {
        upsertGradeEntry(cell.class_id, cell.student_id, cell.sequence, { [subjectId]: cell.value }, schoolId)
          .then((ok) => { if (!ok) queueOffline({ table: 'grades', operation: 'upsert', payload }); });
      } else {
        queueOffline({ table: 'grades', operation: 'upsert', payload });
      }
    }
  },

  // --- Students ---

  addStudent: async (studentData) => {
    const { schoolId } = get();
    const { userId, fullName } = useAuthStore.getState();
    const record = {
      id: uuid(), school_id: schoolId,
      ...sanitizeStudent(studentData),
      // Auteur de l'INSCRIPTION, figé ici (l'import/la restauration passent leur
      // propre valeur, qui l'emporte : on ne réécrit pas l'auteur d'origine).
      created_by:      studentData.created_by      ?? userId ?? null,
      created_by_name: studentData.created_by_name ?? fullName ?? null,
      created_at:      studentData.created_at      ?? new Date().toISOString(),
    };
    await studentsDB.put(record);
    set((s) => ({ students: [...s.students, record] }));
    if (backendOnline()) {
      upsertStudent(record).then((saved) => { if (!saved) queueOffline({ table: 'students', operation: 'upsert', payload: record }); });
    } else {
      queueOffline({ table: 'students', operation: 'upsert', payload: record });
    }

    // Affectation INITIALE : tout élève placé dans une classe reçoit sa 1re ligne
    // d'affectation (source de vérité). Réutilise le moteur (current=null → 'initial').
    const newClass = record.class_id ? get().classes.find((c) => c.id === record.class_id) : null;
    if (newClass) {
      const { user, fullName } = useAuthStore.getState();
      const { newRow } = buildTransfer({
        current: null, newClass, student: record, schoolId, newId: uuid(),
        userId: user?.id, userName: fullName,
      });
      await assignmentsDB.put(newRow);
      set((s) => ({ assignments: [...s.assignments, newRow] }));
      if (backendOnline()) {
        upsertAssignments([newRow]).then((ok) => { if (!ok) queueOffline({ table: 'student_class_assignments', operation: 'upsert', payload: newRow }); });
      } else {
        queueOffline({ table: 'student_class_assignments', operation: 'upsert', payload: newRow });
      }
    }
    return record;
  },

  updateStudent: async (id, data) => {
    const { students } = get();
    const record = { ...students.find((s) => s.id === id), ...sanitizeStudent(data) };
    await studentsDB.put(record);
    set((s) => ({ students: s.students.map((x) => (x.id === id ? record : x)) }));
    if (backendOnline()) {
      upsertStudent(record).then((saved) => { if (!saved) queueOffline({ table: 'students', operation: 'upsert', payload: record }); });
    } else {
      queueOffline({ table: 'students', operation: 'upsert', payload: record });
    }
  },

  // ARCHIVAGE — retire l'élève des listes actives SANS toucher à une seule de ses
  // lignes. C'est la seule sortie possible dès qu'il porte une écriture de caisse.
  archiveStudent: async (id, reason) => {
    const { students } = get();
    const student = students.find((x) => x.id === id);
    if (!student) return null;
    const { userId, fullName } = useAuthStore.getState();
    const record = {
      ...student,
      ...archiveFields({ at: new Date().toISOString(), actorId: userId, actorName: fullName, reason }),
    };

    await studentsDB.put(record);
    set((s) => ({
      students:         s.students.filter((x) => x.id !== id),
      archivedStudents: [...s.archivedStudents.filter((x) => x.id !== id), record],
    }));

    if (backendOnline()) {
      upsertStudent(record).then((saved) => { if (!saved) queueOffline({ table: 'students', operation: 'upsert', payload: record }); });
    } else {
      queueOffline({ table: 'students', operation: 'upsert', payload: record });
    }

    logAction({ action: 'archive', table: 'students', target_id: id,
      details: { name: student.name, matricule: student.matricule, reason: record.archive_reason } });
    return record;
  },

  // Remet un élève archivé dans les listes actives.
  restoreArchivedStudent: async (id) => {
    const { archivedStudents } = get();
    const student = archivedStudents.find((x) => x.id === id);
    if (!student) return null;
    const record = { ...student, ...unarchiveFields() };

    await studentsDB.put(record);
    set((s) => ({
      archivedStudents: s.archivedStudents.filter((x) => x.id !== id),
      students:         [...s.students.filter((x) => x.id !== id), record],
    }));

    if (backendOnline()) {
      upsertStudent(record).then((saved) => { if (!saved) queueOffline({ table: 'students', operation: 'upsert', payload: record }); });
    } else {
      queueOffline({ table: 'students', operation: 'upsert', payload: record });
    }

    logAction({ action: 'restore', table: 'students', target_id: id, details: { name: student.name } });
    return record;
  },

  // Retire un élève de l'établissement.
  //
  // Renvoie { action: 'archive' | 'delete', trail } — l'appelant DOIT lire
  // `action` pour informer l'utilisateur : dès qu'une écriture de caisse existe,
  // l'élève est ARCHIVÉ et non supprimé. Sans cette bascule, supprimer l'élève
  // effaçait ses versements par cascade FK — le contournement qui restait ouvert
  // une fois les versements rendus immuables.
  deleteStudent: async (id) => {
    const snapshot = get().students.find((x) => x.id === id);

    // Capture le bundle complet AVANT toute suppression : le DELETE backend
    // efface notes/frais/paiements en cascade (cf. lib/studentBundle.js). On lit
    // depuis l'IDB, source complète (absences fusionnées dans les notes ; frais et
    // paiements de toutes les années, pas seulement l'année courante en mémoire).
    const [allGrades, allFees, allPayments] = await Promise.all([
      gradesDB.getAll(),
      feesDB.getAll(),
      feePaymentsDB.getAll().catch(() => []),
    ]);
    const bundle = collectStudentBundle(id, { grades: allGrades, fees: allFees, payments: allPayments });

    // Verdict de rétention : de l'argent est passé ⇒ on n'efface rien.
    const decision = retentionDecision(id, allPayments);
    if (decision.action === RETENTION.ARCHIVE) {
      await get().archiveStudent(id, 'Sortie de l’établissement (écritures de caisse conservées)');
      return decision;
    }

    if (snapshot) await moveToTrash({ table: 'students', payload: snapshot, related: bundle });

    // Supprime la ligne élève + toutes ses lignes liées en IDB, pour rester
    // cohérent avec le backend (qui les efface en cascade). Sans ce nettoyage,
    // des notes/frais/paiements orphelins resteraient en cache local.
    await studentsDB.delete(id);
    for (const g of bundle.grades)   await gradesDB.delete(g.key);
    for (const f of bundle.fees)     await feesDB.delete(f.id);
    for (const p of bundle.payments) await feePaymentsDB.delete(p.id);

    set((s) => {
      const gradeMap = { ...s.gradeMap };
      for (const g of bundle.grades) delete gradeMap[g.key];
      return {
        students:    s.students.filter((x) => x.id !== id),
        fees:        s.fees.filter((f) => f.student_id !== id),
        feePayments: s.feePayments.filter((p) => p.student_id !== id),
        gradeMap,
      };
    });

    if (backendOnline()) {
      sbDeleteStudent(id).then((ok) => { if (!ok) queueOffline({ table: 'students', operation: 'delete', payload: { id } }); });
    } else {
      queueOffline({ table: 'students', operation: 'delete', payload: { id } });
    }
    return decision;
  },

  // Réinjecte les données liées à un élève restauré depuis la corbeille
  // (notes, absences, frais, paiements). L'élève lui-même est déjà recréé par
  // addStudent (cf. historyService.restoreFromTrash). On réécrit l'IDB + on
  // pousse vers le backend (ou la queue offline) en réutilisant exactement les
  // chemins de saveGrade / saveFee / addPayment, pour que l'élève retrouve TOUTES
  // ses données — y compris dans le cloud et en LAN où le cascade les avait effacées.
  restoreStudentBundle: async (studentId, related) => {
    if (!related) return;
    const { schoolId, activeYear } = get();
    const { grades = [], fees = [], payments = [] } = related;

    // --- Notes + absences (les records IDB contiennent les deux) ---
    const gradeRecords = grades.filter((g) => g.student_id === studentId);
    if (gradeRecords.length) {
      await gradesDB.putMany(gradeRecords);
      set((s) => {
        const gradeMap = { ...s.gradeMap };
        for (const g of gradeRecords) gradeMap[g.key] = g.scores;
        return { gradeMap };
      });
      for (const g of gradeRecords) {
        const scores = g.scores || {};
        if (backendOnline()) {
          if (hasRealGrades(scores)) {
            upsertGradeEntry(g.class_id, studentId, g.sequence, scores, schoolId)
              .then((ok) => { if (!ok) queueOffline({ table: 'grades', operation: 'upsert', payload: g }); });
          }
          if (hasSpecialFields(scores)) {
            upsertAbsenceEntry(g.class_id, studentId, g.sequence, scores, schoolId)
              .then((ok) => { if (!ok) queueOffline({ table: 'student_absences', operation: 'upsert', payload: g }); });
          }
        } else {
          queueOffline({ table: 'grades', operation: 'upsert', payload: g });
        }
      }
    }

    // --- Frais ---
    const feeRecords = fees.filter((f) => f.student_id === studentId);
    if (feeRecords.length) {
      await feesDB.putMany(feeRecords);
      set((s) => {
        const byId = new Map(s.fees.map((f) => [f.id, f]));
        for (const f of feeRecords) {
          if (!activeYear || f.academic_year === activeYear) byId.set(f.id, f);
        }
        return { fees: [...byId.values()] };
      });
      for (const f of feeRecords) {
        if (backendOnline()) {
          upsertFee(f).then((ok) => { if (!ok) queueOffline({ table: 'student_fees', operation: 'upsert', payload: f }); });
        } else {
          queueOffline({ table: 'student_fees', operation: 'upsert', payload: f });
        }
      }
    }

    // --- Paiements : réinsérés tels quels, SANS repasser par addPayment (qui
    //     recalculerait frais_payes et fausserait le total déjà restauré ci-dessus). ---
    const paymentRecords = payments.filter((p) => p.student_id === studentId);
    if (paymentRecords.length) {
      await feePaymentsDB.putMany(paymentRecords);
      set((s) => {
        const byId = new Map(s.feePayments.map((p) => [p.id, p]));
        for (const p of paymentRecords) {
          if (!activeYear || p.academic_year === activeYear) byId.set(p.id, p);
        }
        return { feePayments: [...byId.values()] };
      });
      for (const p of paymentRecords) {
        if (backendOnline()) {
          insertFeePayment(p).then((ok) => { if (!ok) queueOffline({ table: 'fee_payments', operation: 'insert', payload: p }); });
        } else {
          queueOffline({ table: 'fee_payments', operation: 'insert', payload: p });
        }
      }
    }
  },

  // Affectation HISTORISÉE : ferme l'affectation en cours (date_fin + motif) et en
  // ouvre une nouvelle (moteur transferEngine, jamais d'UPDATE aveugle de class_id).
  // `opts` : { type, motif, commentaire } ; rétro-compat : une chaîne = commentaire.
  // students.class_id reste synchronisé comme CACHE de la classe courante.
  assignStudentToClass: async (studentId, classId, opts = {}) => {
    const o = typeof opts === 'string' ? { commentaire: opts } : (opts || {});
    const { schoolId, classes, students } = get();
    const newClass = classes.find((c) => c.id === classId);
    if (!newClass) return;
    const student = students.find((s) => s.id === studentId) || { id: studentId, school_id: schoolId };
    const current = get().getCurrentAssignment(studentId);
    const oldClass = current ? classes.find((c) => c.id === current.class_id) : null;
    const type = o.type || resolveTransferType(oldClass, newClass);
    const { user, fullName } = useAuthStore.getState();

    const { closedRow, newRow, noop } = buildTransfer({
      current, newClass, student, schoolId, type,
      motif: o.motif, commentaire: o.commentaire,
      userId: user?.id, userName: fullName, newId: uuid(),
    });
    if (noop) return;

    // 1. Persiste les lignes d'affectation (IDB + cloud/queue). L'upsert d'une
    //    ligne existante (closedRow) et l'insert de la nouvelle passent par le
    //    même chemin générique (onConflict:id) — y compris via la file offline.
    // ORDRE IMPORTANT : fermer AVANT d'ouvrir. Deux lignes date_fin=null pour le
    // même élève violeraient l'index unique partiel (sca_one_current_per_student).
    const rows = closedRow ? [closedRow, newRow] : [newRow];
    for (const r of rows) await assignmentsDB.put(r);
    set((s) => {
      const ids = new Set(rows.map((r) => r.id));
      return { assignments: [...s.assignments.filter((a) => !ids.has(a.id)), ...rows] };
    });
    const queueRows = () => rows.forEach((r) =>
      queueOffline({ table: 'student_class_assignments', operation: 'upsert', payload: r }));
    if (backendOnline()) {
      (async () => {
        // Séquentiel : clôture d'abord, ouverture ensuite.
        let ok = closedRow ? await upsertAssignments([closedRow]) : true;
        if (ok) ok = await upsertAssignments([newRow]);
        if (!ok) queueRows();
      })();
    } else {
      queueRows();
    }

    // 2. Met à jour le cache classe courante (source de vérité = l'affectation).
    const oldClassId = current?.class_id || null;
    await get().updateStudent(studentId, { class_id: classId });

    // 3. Recalcule le plan de frais selon la grille de la nouvelle classe
    //    (paiements préservés, remises % reportées) et rattache la ligne à la
    //    nouvelle affectation. No-op si tarif identique ou saisie manuelle.
    await get().recalcFeesAfterTransfer(studentId, newRow.id, oldClassId);
  },

  bulkAssignToClass: async (studentIds, classId, opts = {}) => {
    for (const studentId of studentIds) {
      await get().assignStudentToClass(studentId, classId, opts);
    }
  },

  // Affectation EN COURS d'un élève (date_fin null) ou null.
  getCurrentAssignment: (studentId) =>
    get().assignments.find((a) => a.student_id === studentId && !a.date_fin) || null,

  // Historique complet des affectations d'un élève, du plus ancien au plus récent.
  getAssignmentHistory: (studentId) =>
    get().assignments
      .filter((a) => a.student_id === studentId)
      .sort((a, b) => new Date(a.date_debut || a.assigned_at || 0) - new Date(b.date_debut || b.assigned_at || 0)),

  // --- Grades ---

  saveGrade: async (classId, studentId, sequence, scores, opts = {}) => {
    const { schoolId, gradeMap, academicPeriods, activeYear } = get();

    const hasSpecial = Object.keys(scores).some((k) => k.startsWith('__'));
    const hasGrades  = Object.keys(scores).some((k) => !k.startsWith('__'));

    // ── Enforcement du verrou (C6/I6) ────────────────────────────────────────
    // On REFUSE d'écrire de VRAIES notes dans une séquence verrouillée. Deux
    // sources : le verrou de PÉRIODE (academic_periods.is_locked, synchronisé →
    // cross-appareil, couvre aussi une année clôturée-verrouillée) et le verrou
    // par CLASSE (validation admin). Les champs spéciaux (__abs__/__conduite__/
    // __decision__ du Conseil) restent autorisés : le conseil suit la validation.
    // Refus silencieux au niveau données (renvoie { locked }) — l'UI grise déjà la
    // saisie ; ceci ferme les contournements (import de masse, rendu obsolète,
    // autre appareil ayant posé le verrou entre-temps).
    if (hasGrades) {
      const periodLocked = isSequenceLockedByPeriod(academicPeriods, sequence, activeYear);
      const classLocked  = isClassSequenceLocked(schoolId, classId, sequence);
      if (periodLocked || classLocked) {
        // opts.silent : l'appelant agrège lui-même le résultat (ex. import de masse
        // → un seul récapitulatif au lieu d'un toast par élève).
        if (!opts.silent) {
          toast.error(tStatic(
            'Séquence verrouillée — saisie refusée. Déverrouillez d\'abord.',
            'Sequence locked — entry refused. Unlock it first.',
            'Secuencia bloqueada — captura rechazada. Desbloquéela primero.',
          ));
        }
        return { error: 'locked', locked: true, scope: periodLocked ? 'period' : 'class' };
      }
    }

    const key    = gradeKey(classId, studentId, sequence);
    const merged = { ...(gradeMap[key] || {}), ...scores };
    const record = { key, class_id: classId, student_id: studentId, sequence, school_id: schoolId, scores: merged };

    await gradesDB.put(record);
    set((s) => ({ gradeMap: { ...s.gradeMap, [key]: merged } }));

    if (backendOnline()) {
      if (hasGrades) {
        // On n'écrit QUE les matières modifiées (`scores`, le delta), jamais toute
        // la ligne (`merged`). En mode « enseignant de matière », la RLS rejette
        // les notes des matières non affectées : ré-upserter `merged` ferait
        // échouer la sauvegarde. Le delta est aussi plus correct/rapide en Mode 2.
        upsertGradeEntry(classId, studentId, sequence, scores, schoolId).then((ok) => {
          if (!ok) queueOffline({ table: 'grades', operation: 'upsert', payload: { ...record, scores } });
        });
      }
      if (hasSpecial) {
        upsertAbsenceEntry(classId, studentId, sequence, merged, schoolId).then((ok) => {
          if (!ok) queueOffline({ table: 'student_absences', operation: 'upsert', payload: record });
        });
      }

      // Notif admin — upsert (1 ligne max par enseignant/classe/séquence), throttle 30 min
      if (hasGrades) {
        const { role, fullName, school, user } = useAuthStore.getState();
        if (role === 'teacher' && school?.id) {
          const notifKey = `${classId}_${sequence}`;
          const lastSent = _gradeNotifLastSent[notifKey] ?? 0;
          if (Date.now() - lastSent > 1_800_000) {
            _gradeNotifLastSent[notifKey] = Date.now();
            const className  = get().classes.find((c) => c.id === classId)?.name || '?';
            const teacherRec = get().teachers.find((t) => t.auth_user_id === user?.id);
            upsertGradeNotification({
              school_id:    school.id,
              type:         'grades_saved',
              teacher_name: fullName || 'Enseignant',
              teacher_id:   teacherRec?.id || null,
              class_name:   className,
              class_id:     classId,
              sequence,
            }).catch(() => {});
          }
        }
      }
    } else {
      queueOffline({ table: 'grades', operation: 'upsert', payload: record });
    }
  },

  deleteGradeEntry: async (classId, studentId, sequence) => {
    const key = gradeKey(classId, studentId, sequence);
    await gradesDB.delete(key);
    set((s) => {
      const { [key]: _, ...rest } = s.gradeMap;
      return { gradeMap: rest };
    });
  },

  // --- Teachers ---

  addTeacher: async (teacherData) => {
    const { schoolId } = get();
    const record = { id: uuid(), school_id: schoolId, ...teacherData };
    // Une chaîne vide est invalide pour une colonne `date` (Postgres) → null.
    if (record.hire_date === '') record.hire_date = null;
    await teachersDB.put(record);
    set((s) => ({ teachers: [...s.teachers, record] }));
    if (backendOnline()) {
      upsertTeacher(record).then((saved) => { if (!saved) queueOffline({ table: 'teachers', operation: 'upsert', payload: record }); });
    } else {
      queueOffline({ table: 'teachers', operation: 'upsert', payload: record });
    }
    return record;
  },

  updateTeacher: async (id, data) => {
    const { teachers } = get();
    const record = { ...teachers.find((t) => t.id === id), ...data };
    // Une chaîne vide est invalide pour une colonne `date` (Postgres) → null.
    if (record.hire_date === '') record.hire_date = null;
    await teachersDB.put(record);
    set((s) => ({ teachers: s.teachers.map((t) => (t.id === id ? record : t)) }));
    if (backendOnline()) {
      upsertTeacher(record).then((saved) => { if (!saved) queueOffline({ table: 'teachers', operation: 'upsert', payload: record }); });
    } else {
      queueOffline({ table: 'teachers', operation: 'upsert', payload: record });
    }
  },

  deleteTeacher: async (id) => {
    const snapshot = get().teachers.find((t) => t.id === id);
    if (snapshot) await moveToTrash({ table: 'teachers', payload: snapshot });
    await teachersDB.delete(id);
    set((s) => ({
      teachers: s.teachers.filter((t) => t.id !== id),
      classes:  s.classes.map((c) => c.teacher_id === id ? { ...c, teacher_id: null } : c),
    }));
    if (backendOnline()) {
      sbDeleteTeacher(id).then((ok) => { if (!ok) queueOffline({ table: 'teachers', operation: 'delete', payload: { id } }); });
    } else {
      queueOffline({ table: 'teachers', operation: 'delete', payload: { id } });
    }
  },

  // --- Staff (personnel — tous départements) ---

  addStaff: async (staffData) => {
    const { schoolId } = get();
    const record = { id: uuid(), school_id: schoolId, active: 1, ...staffData };
    await staffDB.put(record);
    set((s) => ({ staff: [...s.staff, record] }));
    if (backendOnline()) {
      upsertStaff(record).then((saved) => { if (!saved) queueOffline({ table: 'staff', operation: 'upsert', payload: record }); });
    } else {
      queueOffline({ table: 'staff', operation: 'upsert', payload: record });
    }
    return record;
  },

  updateStaff: async (id, data) => {
    const { staff } = get();
    const record = { ...staff.find((m) => m.id === id), ...data };
    await staffDB.put(record);
    set((s) => ({ staff: s.staff.map((m) => (m.id === id ? record : m)) }));
    if (backendOnline()) {
      upsertStaff(record).then((saved) => { if (!saved) queueOffline({ table: 'staff', operation: 'upsert', payload: record }); });
    } else {
      queueOffline({ table: 'staff', operation: 'upsert', payload: record });
    }
  },

  deleteStaff: async (id) => {
    const snapshot = get().staff.find((m) => m.id === id);
    if (snapshot) await moveToTrash({ table: 'staff', payload: snapshot });
    await staffDB.delete(id);
    set((s) => ({ staff: s.staff.filter((m) => m.id !== id) }));
    if (backendOnline()) {
      sbDeleteStaff(id).then((ok) => { if (!ok) queueOffline({ table: 'staff', operation: 'delete', payload: { id } }); });
    } else {
      queueOffline({ table: 'staff', operation: 'delete', payload: { id } });
    }
  },

  // --- Student fees ---

  saveFee: async (studentId, feeData) => {
    const { schoolId, activeYear, fees } = get();
    const existing = fees.find((f) => f.student_id === studentId && f.academic_year === (activeYear || feeData.academic_year));
    const record = {
      id:            existing?.id || uuid(),
      school_id:     schoolId,
      student_id:    studentId,
      academic_year: activeYear || feeData.academic_year,
      frais_annuels: feeData.frais_annuels ?? existing?.frais_annuels ?? 0,
      frais_payes:   feeData.frais_payes   ?? existing?.frais_payes   ?? 0,
      date_dernier_paiement: feeData.date_dernier_paiement ?? existing?.date_dernier_paiement ?? null,
      notes:         feeData.notes         ?? existing?.notes         ?? null,
      tranches:      feeData.tranches      ?? existing?.tranches      ?? [],
      payment_mode:  feeData.payment_mode  ?? existing?.payment_mode  ?? null,
      adjustments:   feeData.adjustments   ?? existing?.adjustments   ?? [],
      // Rattachement à l'affectation en cours (traçabilité du contexte tarifaire).
      assignment_id: feeData.assignment_id ?? existing?.assignment_id ?? null,
    };
    // Changer le DÛ d'un élève est un levier de détournement (baisser le dû,
    // encaisser le vrai montant, en déclarer moins) : on ne trace donc PAS les
    // simples mises à jour de `frais_payes` (routine d'encaissement, déjà tracée
    // par addPayment), mais on trace tout changement du montant exigible.
    const dueChanged = existing && Number(existing.frais_annuels || 0) !== Number(record.frais_annuels || 0);

    await feesDB.put(record);
    set((s) => ({
      fees: existing
        ? s.fees.map((f) => (f.id === existing.id ? record : f))
        : [...s.fees, record],
    }));

    if (dueChanged) {
      logAction({ action: 'update', table: 'student_fees', target_id: record.id,
        details: { student_id: studentId, from: existing.frais_annuels, to: record.frais_annuels } });
      emitFinanceEvent({
        aggregateType: FIN_AGG.STUDENT_FEE, aggregateId: record.id, correlationId: record.id,
        schoolId, eventType: FIN_EVT.STUDENT_FEE_CHANGED,
        payload: { student_id: studentId, from: existing.frais_annuels, to: record.frais_annuels },
      });
    }
    if (backendOnline()) {
      upsertFee(record).then((saved) => { if (!saved) queueOffline({ table: 'student_fees', operation: 'upsert', payload: record }); });
    } else {
      queueOffline({ table: 'student_fees', operation: 'upsert', payload: record });
    }
    return record;
  },

  addPayment: async (studentId, { amount, date, note, student_fee_item_id = null }) => {
    const { schoolId, activeYear, fees, feePayments } = get();
    const { userId, fullName } = useAuthStore.getState();
    const parsedAmount = parseInt(amount, 10) || 0;
    // Strictement positif : un montant négatif ne peut naître que d'une
    // contre-passation (reversePayment), jamais d'une saisie de guichet — sinon
    // on pourrait « annuler » une recette en la saisissant à l'envers, sans motif
    // ni lien vers l'écriture d'origine.
    if (parsedAmount <= 0) return null;

    const record = {
      id:            uuid(),
      school_id:     schoolId,
      student_id:    studentId,
      academic_year: activeYear,
      amount:        parsedAmount,
      date:          date,
      note:          note || '',
      // Caissier FIGÉ à l'encaissement : le reçu réimprimé porte ce nom-là, pas
      // celui de l'utilisateur qui réimprime (cf. receiptDoc.cashierName).
      recorded_by:   userId,
      recorded_by_name: fullName || null,
      // Lien optionnel vers un frais précis du catalogue (null = paiement global).
      student_fee_item_id: student_fee_item_id || null,
      created_at:    new Date().toISOString(),
    };

    // frais_payes est DÉRIVÉ des lignes de paiement (source de vérité), jamais
    // incrémenté en aveugle — sinon 2 versements concurrents (hors-ligne / LWW)
    // s'écrasent. On préserve le socle opaque importé (cf. feeEngine.derivePaid).
    const existing = fees.find((f) => f.student_id === studentId && f.academic_year === activeYear);
    const rowsBefore = sumPaidForStudent(feePayments, studentId, activeYear);
    const newPaid = derivePaid(existing?.frais_payes, rowsBefore, rowsBefore + parsedAmount);

    await feePaymentsDB.put(record);
    set((s) => ({ feePayments: [record, ...s.feePayments] }));

    await get().saveFee(studentId, { frais_payes: newPaid, date_dernier_paiement: date });

    if (backendOnline()) {
      insertFeePayment(record).then((saved) => {
        if (!saved) queueOffline({ table: 'fee_payments', operation: 'insert', payload: record });
      });
    } else {
      queueOffline({ table: 'fee_payments', operation: 'insert', payload: record });
    }

    // TRACE (les deux journaux, best-effort, hors du chemin d'écriture) :
    //   • logAction  → journal local, instantané, fonctionne hors-ligne ;
    //   • emitFinanceEvent → audit SERVEUR non-répudiable (kernel_emit estampille
    //     l'acteur depuis auth.uid()), append-only, répliqué.
    logAction({ action: 'create', table: 'fee_payments', target_id: record.id,
      details: { student_id: studentId, amount: parsedAmount, date, note: record.note } });
    emitFinanceEvent({
      aggregateType: FIN_AGG.FEE_PAYMENT, aggregateId: record.id, correlationId: record.id,
      schoolId, eventType: FIN_EVT.FEE_PAYMENT_RECORDED,
      payload: { student_id: studentId, amount: parsedAmount, date, academic_year: activeYear },
    });
    return record;
  },

  // ── ARRÊTÉ DE CAISSE ──────────────────────────────────────────────────────
  // Le caissier déclare ce qu'il a COMPTÉ ; le système recalcule l'attendu à
  // partir des écritures et fige l'écart. L'attendu n'est jamais accepté depuis
  // l'UI : sinon un caissier déclarerait un attendu sur mesure et l'écart
  // tomberait toujours à zéro.
  declareCashSession: async ({ date, openingFloat = 0, countedCash, explanation = null }) => {
    const { schoolId, activeYear, feePayments, cashSessions } = get();
    const { userId, fullName } = useAuthStore.getState();
    if (countedCash == null || countedCash === '') return null;

    const exp = expectedCash(feePayments, { cashierId: userId, date, openingFloat });
    const rec = reconcile({ counted: countedCash, expected: exp.expected });
    if (requiresExplanation(rec.variance) && !String(explanation || '').trim()) return null;

    const existing = cashSessions.find((s) => s.date === date && s.cashier_id === userId);
    // Un arrêté déjà VALIDÉ par un tiers ne se réécrit pas : ce serait défaire
    // le contrôle après coup.
    if (existing?.status === SESSION_STATUS.VALIDATED) return null;

    const record = {
      id: existing?.id || uuid(),
      school_id: schoolId,
      academic_year: activeYear,
      date,
      cashier_id: userId,
      cashier_name: fullName || null,
      opening_float: parseInt(openingFloat, 10) || 0,
      expected_cash: rec.expected,
      counted_cash:  rec.counted,
      variance:      rec.variance,
      entry_count:   exp.count,
      explanation:   String(explanation || '').trim() || null,
      status:        SESSION_STATUS.DECLARED,
      declared_at:   new Date().toISOString(),
      validated_by: null, validated_by_name: null, validated_at: null,
    };

    set((s) => ({
      cashSessions: [...s.cashSessions.filter((x) => x.id !== record.id), record],
    }));
    const saved = await upsertCashSession(record);
    if (!saved) queueOffline({ table: 'cash_sessions', operation: 'upsert', payload: record });

    logAction({ action: 'validate', table: 'cash_sessions', target_id: record.id,
      details: { date, expected: rec.expected, counted: rec.counted, variance: rec.variance } });
    emitFinanceEvent({
      aggregateType: FIN_AGG.CASH_SESSION, aggregateId: record.id, correlationId: record.id,
      schoolId, eventType: FIN_EVT.CASH_SESSION_DECLARED,
      payload: { date, expected: rec.expected, counted: rec.counted, variance: rec.variance, entries: exp.count },
    });
    return record;
  },

  // Contrôle par un TIERS. `canValidate` refuse que le caissier valide son
  // propre comptage — c'est ce qui distingue un contrôle d'une auto-déclaration.
  validateCashSession: async (sessionId) => {
    const { schoolId, cashSessions } = get();
    const { userId, fullName } = useAuthStore.getState();
    const session = cashSessions.find((s) => s.id === sessionId);
    if (!session || !canValidate(session, userId)) return null;

    const record = {
      ...session,
      status: SESSION_STATUS.VALIDATED,
      validated_by: userId,
      validated_by_name: fullName || null,
      validated_at: new Date().toISOString(),
    };
    set((s) => ({ cashSessions: s.cashSessions.map((x) => (x.id === sessionId ? record : x)) }));
    const saved = await upsertCashSession(record);
    if (!saved) queueOffline({ table: 'cash_sessions', operation: 'upsert', payload: record });

    logAction({ action: 'validate', table: 'cash_sessions', target_id: sessionId,
      details: { date: session.date, cashier: session.cashier_name, variance: session.variance } });
    emitFinanceEvent({
      aggregateType: FIN_AGG.CASH_SESSION, aggregateId: sessionId, correlationId: sessionId,
      schoolId, eventType: FIN_EVT.CASH_SESSION_VALIDATED,
      payload: { date: session.date, cashier_id: session.cashier_id, variance: session.variance },
    });
    return record;
  },

  loadCashSessions: async ({ from = null, to = null } = {}) => {
    const { schoolId, activeYear } = get();
    if (!schoolId) return [];
    const rows = await fetchCashSessions(schoolId, { from, to, year: activeYear });
    set({ cashSessions: rows });
    return rows;
  },

  // CONTRE-PASSATION — annule un versement SANS jamais l'effacer.
  //
  // Une suppression pure laissait le détournement invisible : encaisser, remettre
  // le reçu, supprimer la ligne, garder l'argent — et plus aucune trace qu'un
  // versement avait existé. Ici, l'écriture d'origine reste intacte et une
  // SECONDE ligne, de montant négatif, la neutralise en portant son motif et son
  // auteur. Les deux restent lisibles, et `frais_payes` retombe juste tout seul
  // (il est dérivé de la somme des lignes).
  //
  // Renvoie la ligne d'annulation, ou null si l'opération est refusée.
  reversePayment: async (paymentId, studentId, reason) => {
    const { schoolId, activeYear, fees, feePayments } = get();
    const { userId, fullName } = useAuthStore.getState();
    const payment = feePayments.find((p) => p.id === paymentId);
    if (!payment) return null;
    const motif = String(reason || '').trim();
    if (!motif) return null;                       // le motif n'est pas décoratif : c'est la pièce justificative
    if (payment.reversal_of) return null;          // on n'annule pas une annulation
    if (feePayments.some((p) => p.reversal_of === paymentId)) return null; // déjà annulé
    // Le recalcul de `frais_payes` ci-dessous raisonne sur l'année ACTIVE : annuler
    // un versement d'une année close fausserait le total mis en cache de cette
    // année-là. On refuse plutôt que de corrompre un exercice clos.
    if (payment.academic_year && payment.academic_year !== activeYear) return null;

    const amount = -Math.abs(Number(payment.amount) || 0);
    if (!amount) return null;

    const record = {
      id:            uuid(),
      school_id:     schoolId,
      student_id:    studentId,
      academic_year: payment.academic_year || activeYear,
      amount,
      date:          new Date().toISOString().slice(0, 10),  // date de l'ANNULATION, pas du versement
      note:          `Annulation — ${motif}`,
      recorded_by:   userId,
      recorded_by_name: fullName || null,
      student_fee_item_id: payment.student_fee_item_id || null,
      reversal_of:   paymentId,
      void_reason:   motif,
      created_at:    new Date().toISOString(),
    };

    // Même dérivation que pour un encaissement : la ligne négative entre dans la
    // somme, donc `frais_payes` se corrige sans soustraction en aveugle.
    const existing = fees.find((f) => f.student_id === studentId && f.academic_year === activeYear);
    const rowsBefore = sumPaidForStudent(feePayments, studentId, activeYear);
    const newPaid = derivePaid(existing?.frais_payes, rowsBefore, rowsBefore + amount);

    await feePaymentsDB.put(record);
    set((s) => ({ feePayments: [record, ...s.feePayments] }));

    await get().saveFee(studentId, { frais_payes: newPaid });

    if (backendOnline()) {
      insertFeePayment(record).then((saved) => {
        if (!saved) queueOffline({ table: 'fee_payments', operation: 'insert', payload: record });
      });
    } else {
      queueOffline({ table: 'fee_payments', operation: 'insert', payload: record });
    }

    logAction({ action: 'void', table: 'fee_payments', target_id: paymentId,
      details: { student_id: studentId, amount: payment.amount, reason: motif, reversal_id: record.id } });
    emitFinanceEvent({
      aggregateType: FIN_AGG.FEE_PAYMENT, aggregateId: paymentId, correlationId: paymentId,
      schoolId, eventType: FIN_EVT.FEE_PAYMENT_REVERSED,
      payload: { student_id: studentId, reversed_amount: payment.amount, reason: motif, reversal_id: record.id },
    });
    return record;
  },

  deleteFee: async (id) => {
    await feesDB.delete(id);
    set((s) => ({ fees: s.fees.filter((f) => f.id !== id) }));
    if (backendOnline()) {
      sbDeleteFee(id).then((ok) => { if (!ok) queueOffline({ table: 'student_fees', operation: 'delete', payload: { id } }); });
    } else {
      queueOffline({ table: 'student_fees', operation: 'delete', payload: { id } });
    }
  },

  // Réconciliation du cache frais_payes à partir des lignes fee_payments (source
  // de vérité). MONOTONE : ne fait que corriger une sous-évaluation (lost-update /
  // LWW cross-appareil), jamais diminuer → préserve les soldes importés opaques et
  // les suppressions déjà répercutées. N'écrit (IDB + cloud) que les fiches ayant
  // réellement dérivé. Appelée après chaque chargement (init + refresh).
  reconcileFeesPaid: async () => {
    const { fees, feePayments, activeYear } = get();
    if (!fees.length) return;
    // Index paiements → somme par (élève × année), une seule passe (évite l'O(n²)).
    const paidByKey = new Map();
    for (const p of feePayments) {
      if (!p) continue;
      const k = `${p.student_id}::${p.academic_year || activeYear || ''}`;
      paidByKey.set(k, (paidByKey.get(k) || 0) + (parseInt(p.amount, 10) || 0));
    }
    const drifted = [];
    const nextFees = fees.map((f) => {
      const rowsSum   = paidByKey.get(`${f.student_id}::${f.academic_year || activeYear || ''}`) || 0;
      const corrected = reconcilePaid(f.frais_payes, rowsSum);
      if (corrected !== (f.frais_payes || 0)) {
        const rec = { ...f, frais_payes: corrected };
        drifted.push(rec);
        return rec;
      }
      return f;
    });
    if (!drifted.length) return;
    set({ fees: nextFees });
    await feesDB.putMany(drifted);
    for (const rec of drifted) {
      if (backendOnline()) upsertFee(rec).then((ok) => { if (!ok) queueOffline({ table: 'student_fees', operation: 'upsert', payload: rec }); });
      else queueOffline({ table: 'student_fees', operation: 'upsert', payload: rec });
    }
  },

  // --- Class fee grids (grilles tarifaires) ---

  // Crée / met à jour la grille tarifaire d'une classe pour l'année active.
  // gridData : { class_id, amount_comptant, amount_echelonne, amount_inscription, tranches[], notes }
  saveClassFeeGrid: async (gridData) => {
    const { schoolId, activeYear, classFeeGrids } = get();
    const year = activeYear || gridData.academic_year;
    const existing = classFeeGrids.find(
      (g) => g.class_id === gridData.class_id && g.academic_year === year
    );
    const record = {
      id:               existing?.id || uuid(),
      school_id:        schoolId,
      class_id:         gridData.class_id,
      academic_year:    year,
      amount_comptant:   parseInt(gridData.amount_comptant, 10)   || 0,
      amount_echelonne:  parseInt(gridData.amount_echelonne, 10)  || 0,
      amount_inscription: parseInt(gridData.amount_inscription, 10) || 0,
      tranches:         Array.isArray(gridData.tranches) ? gridData.tranches : (existing?.tranches ?? []),
      currency:         gridData.currency ?? existing?.currency ?? 'XAF',
      notes:            gridData.notes ?? existing?.notes ?? null,
    };
    await classFeeGridsDB.put(record);
    set((s) => ({
      classFeeGrids: existing
        ? s.classFeeGrids.map((g) => (g.id === existing.id ? record : g))
        : [...s.classFeeGrids, record],
    }));
    if (backendOnline()) {
      upsertClassFeeGrid(record).then((saved) => { if (!saved) queueOffline({ table: 'class_fee_grids', operation: 'upsert', payload: record }); });
    } else {
      queueOffline({ table: 'class_fee_grids', operation: 'upsert', payload: record });
    }

    // Le tarif d'une classe commande le dû de TOUS ses élèves : le baisser puis
    // le remettre en place est le détournement le plus rentable et le plus
    // discret. On journalise l'avant/après de chaque montant.
    const changed = !existing
      || existing.amount_comptant   !== record.amount_comptant
      || existing.amount_echelonne  !== record.amount_echelonne
      || existing.amount_inscription !== record.amount_inscription;
    if (changed) {
      const before = existing
        ? { comptant: existing.amount_comptant, echelonne: existing.amount_echelonne, inscription: existing.amount_inscription }
        : null;
      const after = { comptant: record.amount_comptant, echelonne: record.amount_echelonne, inscription: record.amount_inscription };
      logAction({ action: existing ? 'update' : 'create', table: 'class_fee_grids', target_id: record.id,
        details: { class_id: record.class_id, before, after } });
      emitFinanceEvent({
        aggregateType: FIN_AGG.FEE_GRID, aggregateId: record.id, correlationId: record.id,
        schoolId, eventType: FIN_EVT.FEE_GRID_CHANGED,
        payload: { class_id: record.class_id, academic_year: year, before, after },
      });
    }
    return record;
  },

  deleteClassFeeGrid: async (id) => {
    await classFeeGridsDB.delete(id);
    set((s) => ({ classFeeGrids: s.classFeeGrids.filter((g) => g.id !== id) }));
    if (backendOnline()) {
      sbDeleteClassFeeGrid(id).then((ok) => { if (!ok) queueOffline({ table: 'class_fee_grids', operation: 'delete', payload: { id } }); });
    } else {
      queueOffline({ table: 'class_fee_grids', operation: 'delete', payload: { id } });
    }
  },

  // Fige le mode de paiement d'un élève à l'inscription et applique la grille de
  // sa classe : copie le total dû (comptant ou échelonné) + un INSTANTANÉ des
  // tranches (pour qu'une modif ultérieure de la grille ne perturbe pas l'élève).
  // Les paiements déjà saisis (frais_payes) sont PRÉSERVÉS. mode null = repasse
  // en saisie libre (déblocage admin).
  setStudentPaymentMode: async (studentId, mode) => {
    const { classFeeGrids, students, activeYear } = get();
    const student = students.find((s) => s.id === studentId);
    const grid = classFeeGrids.find(
      (g) => g.class_id === student?.class_id && g.academic_year === (activeYear || g.academic_year)
    );

    const patch = { payment_mode: mode };
    if (mode === 'comptant') {
      patch.frais_annuels = grid?.amount_comptant ?? 0;
      patch.tranches = grid?.amount_comptant
        ? [{ id: 'comptant', label: 'Paiement comptant', amount: grid.amount_comptant, due_date: grid?.tranches?.[0]?.due_date || null }]
        : [];
    } else if (mode === 'echelonne') {
      patch.frais_annuels = grid?.amount_echelonne ?? 0;
      // Instantané profond des tranches de la grille.
      patch.tranches = (grid?.tranches ?? []).map((t) => ({ ...t }));
    }
    // mode 'libre' / null : on ne touche ni au total ni aux tranches (saisie manuelle).
    return get().saveFee(studentId, patch);
  },

  // Recalcul des frais après un TRANSFERT (Étape 3). Applique la grille de la
  // NOUVELLE classe (student.class_id déjà mis à jour), en préservant les
  // paiements (frais_payes, dérivés des lignes de paiement) et en reportant les
  // remises en POURCENTAGE (les remises en montant fixe sont retirées → à
  // re-saisir sur le nouveau tarif ; défaut validé par l'établissement).
  //   - `oldClassId` : classe d'avant (pour ne rien toucher si le tarif est identique).
  //   - `assignmentId` : nouvelle affectation, rattachée à la ligne de frais.
  // Ne recalcule QUE les modes pilotés par la grille ('comptant'/'echelonne') ;
  // 'libre'/null (saisie manuelle) → on ne réécrit aucun montant.
  recalcFeesAfterTransfer: async (studentId, assignmentId, oldClassId) => {
    const { fees, activeYear, classFeeGrids, students } = get();
    const fee = fees.find((f) => f.student_id === studentId && (!activeYear || f.academic_year === activeYear));
    if (!fee) return; // aucun frais pour l'année → rien à recalculer

    const gridFor = (classId) => classFeeGrids.find(
      (g) => g.class_id === classId && (!activeYear || g.academic_year === activeYear)
    ) || null;
    const student = students.find((s) => s.id === studentId);

    // Décision PURE (feeEngine) : nouveau total/tranches, report des remises %,
    // paiements préservés. patch=null si rien à recalculer.
    const { patch } = computeTransferFeePatch({
      fee,
      newGrid: gridFor(student?.class_id),
      oldGrid: oldClassId ? gridFor(oldClassId) : null,
      assignmentId,
    });
    if (patch) await get().saveFee(studentId, patch);
  },

  // --- Selectors ---

  // Grille tarifaire applicable à une classe pour l'année active (ou null).
  getClassFeeGrid: (classId) => {
    const { classFeeGrids, activeYear } = get();
    return classFeeGrids.find(
      (g) => g.class_id === classId && (!activeYear || g.academic_year === activeYear)
    ) || null;
  },

  getClassSubjects: (classId) => get().subjects.filter((s) => s.class_id === classId),
  getClassStudents: (classId) => get().students.filter((s) => s.class_id === classId),
  getGradeEntry:    (classId, studentId, sequence) =>
    get().gradeMap[gradeKey(classId, studentId, sequence)] || {},
}));
