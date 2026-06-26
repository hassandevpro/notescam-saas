// Offline-first school data store.
//
// Write path: IDB immediately (optimistic) → Supabase if online, queue if not.
// Read path:  IDB first (instant) → Supabase refresh if online → IDB updated.
//
// gradeMap key format: "${classId}_${studentId}_${sequence}"
// This is the exact format bulletinEngine expects for allGrades.

import { create } from 'zustand';
import { initDB, classesDB, subjectsDB, studentsDB, gradesDB, syncQueueDB, teachersDB, feesDB, feePaymentsDB, academicPeriodsDB, staffDB, classFeeGridsDB } from '../lib/db';
import { fetchPeriods } from '../lib/academicPeriodsService';
import { deriveActiveSequence } from '../lib/periodLogic';
import {
  fetchClasses, upsertClass, deleteClass as sbDeleteClass,
  fetchSubjects, upsertSubject, deleteSubject as sbDeleteSubject,
  fetchStudents, fetchStudentsByIds, upsertStudent, deleteStudent as sbDeleteStudent,
  fetchGrades, gradeRowsToMap, upsertGradeEntry,
  fetchAbsences, upsertAbsenceEntry,
  fetchTeachers, upsertTeacher, deleteTeacher as sbDeleteTeacher,
  fetchFees, upsertFee, deleteFee as sbDeleteFee,
  fetchFeePayments, insertFeePayment, deleteFeePayment as sbDeleteFeePayment,
  fetchClassFeeGrids, upsertClassFeeGrid, deleteClassFeeGrid as sbDeleteClassFeeGrid,
} from '../lib/schoolService';
import { upsertGradeNotification } from '../lib/notificationsService';
import { moveToTrash, logAction } from '../lib/historyService';
import { collectStudentBundle, hasRealGrades, hasSpecialFields } from '../lib/studentBundle';
import { fetchStaff, upsertStaff, deleteStaff as sbDeleteStaff } from '../lib/staffService';
import { logAssignment } from '../lib/classAssignmentService';
import { flushSyncQueue } from '../lib/sync';
import { backendOnline } from '../lib/edition';
import { uuid } from '../lib/uuid';
import { getNextLevel, computeNextYear, isRepeater } from '../lib/yearEngine';
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

export const useSchoolStore = create((set, get) => ({
  schoolId:   null,
  activeYear: null,
  classes:      [],
  subjects:     [],
  students:     [],
  teachers:     [],
  staff:        [],
  fees:         [],
  feePayments:  [],
  classFeeGrids: [],
  gradeMap:     {},
  academicPeriods: [],
  activeSequence:  null,
  loading:      false,
  error:        null,

  // Called by App once school is known (schoolId + activeYear from authStore).
  // Loads IDB immediately (year-filtered), then refreshes from Supabase if online.
  // teacherId: if set (teacher role), restricts visible classes to those assigned to this teacher.
  init: async (schoolId, activeYear, teacherId) => {
    if (!schoolId) return;
    // Wipe stale data from any previous session immediately — prevents flash of wrong data
    set({ loading: true, error: null, schoolId, activeYear: activeYear || null,
          classes: [], subjects: [], students: [], teachers: [], staff: [], fees: [], feePayments: [], classFeeGrids: [], gradeMap: {},
          academicPeriods: [], activeSequence: null });

    try {
      await initDB();

      const [idbClasses, idbSubjects, idbStudents, idbGrades, idbTeachers, idbStaff, idbFees, idbFeePayments, idbFeeGrids, idbPeriods] = await Promise.all([
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

      set({
        classes:     allClasses,
        subjects:    allSubjects,
        students:    allStudents,
        teachers:    allTeachers,
        staff:       allStaff,
        fees:        allFees,
        feePayments: allFeePayments,
        classFeeGrids: allFeeGrids,
        gradeMap:    buildGradeMap(allGrades),
        academicPeriods: allPeriods,
        activeSequence:  deriveActiveSequence(allPeriods),
        loading:     false,
      });

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

    const [sbSubjects, sbStudents, sbGrades, sbAbsences, sbTeachers, sbStaff, sbFees, sbFeePayments, sbFeeGrids, sbPeriods] = await Promise.all([
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
      gradeMap: newGradeMap,
    });
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

  // ── Academic year promotion ──────────────────────────────────────────────

  promoteYear: async () => {
    const { schoolId, classes, subjects, students, gradeMap } = get();
    const school = useAuthStore.getState().school;
    if (!school?.current_year) return { error: 'Aucune année active définie.' };

    const newYear = computeNextYear(school.current_year);
    const classMapping = new Map(); // oldClassId → newClass | null (diplômés)
    const newClasses   = [];
    const newSubjList  = [];
    const newStudents  = [];

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
        newStudents.push({ ...student, id: uuid(), class_id: rc.id, parent_token: uuid(), created_at: undefined });
        repeatedCount++;
        continue;
      }
      const newCls = classMapping.get(student.class_id);
      if (newCls) {
        // parent_token is UNIQUE — generate a fresh one for the copy instead of
        // reusing the old row's (would violate students_parent_token_idx).
        newStudents.push({ ...student, id: uuid(), class_id: newCls.id, parent_token: uuid(), created_at: undefined });
        promotedCount++;
      } else {
        graduatedCount++; // classe diplômante, élève non redoublant → archivé diplômé
      }
    }

    // 3. Persist to IDB
    if (newClasses.length)   await classesDB.putMany(newClasses);
    if (newSubjList.length)  await subjectsDB.putMany(newSubjList);
    for (const s of newStudents) await studentsDB.put(s);

    // 4. Queue sync operations
    for (const cls of newClasses)  await queueOffline({ table: 'classes',  operation: 'upsert', payload: cls });
    for (const sub of newSubjList) await queueOffline({ table: 'subjects', operation: 'upsert', payload: sub });
    for (const s of newStudents)   await queueOffline({ table: 'students', operation: 'upsert', payload: s });

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

  // --- Classes ---

  addClass: async (classData) => {
    const { schoolId } = get();
    const record = { id: uuid(), school_id: schoolId, ...classData };
    await classesDB.put(record);
    set((s) => ({ classes: [...s.classes, record] }));
    // Fire-and-forget : la donnée est déjà en IDB + state. On ne bloque jamais
    // l'UI sur le réseau ; un échec (ou un offline) la repousse en syncQueue.
    if (backendOnline()) {
      upsertClass(record).then((saved) => { if (!saved) queueOffline({ table: 'classes', operation: 'upsert', payload: record }); });
    } else {
      queueOffline({ table: 'classes', operation: 'upsert', payload: record });
    }
    return record;
  },

  updateClass: async (id, data) => {
    const { classes } = get();
    const record = { ...classes.find((c) => c.id === id), ...data };
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
    if (snapshot) await moveToTrash({ table: 'classes', payload: snapshot });
    await classesDB.delete(id);
    set((s) => ({ classes: s.classes.filter((c) => c.id !== id) }));
    if (backendOnline()) {
      sbDeleteClass(id).then((ok) => { if (!ok) queueOffline({ table: 'classes', operation: 'delete', payload: { id } }); });
    } else {
      queueOffline({ table: 'classes', operation: 'delete', payload: { id } });
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
    const { subjects } = get();
    const record = { ...subjects.find((s) => s.id === id), ...data };
    await subjectsDB.put(record);
    set((s) => ({ subjects: s.subjects.map((x) => (x.id === id ? record : x)) }));
    if (backendOnline()) {
      upsertSubject(record).then((saved) => { if (!saved) queueOffline({ table: 'subjects', operation: 'upsert', payload: record }); });
    } else {
      queueOffline({ table: 'subjects', operation: 'upsert', payload: record });
    }
  },

  deleteSubject: async (id) => {
    const snapshot = get().subjects.find((s) => s.id === id);
    if (snapshot) await moveToTrash({ table: 'subjects', payload: snapshot });
    await subjectsDB.delete(id);
    set((s) => ({ subjects: s.subjects.filter((x) => x.id !== id) }));
    if (backendOnline()) {
      sbDeleteSubject(id).then((ok) => { if (!ok) queueOffline({ table: 'subjects', operation: 'delete', payload: { id } }); });
    } else {
      queueOffline({ table: 'subjects', operation: 'delete', payload: { id } });
    }
  },

  // --- Students ---

  addStudent: async (studentData) => {
    const { schoolId } = get();
    const record = { id: uuid(), school_id: schoolId, ...sanitizeStudent(studentData) };
    await studentsDB.put(record);
    set((s) => ({ students: [...s.students, record] }));
    if (backendOnline()) {
      upsertStudent(record).then((saved) => { if (!saved) queueOffline({ table: 'students', operation: 'upsert', payload: record }); });
    } else {
      queueOffline({ table: 'students', operation: 'upsert', payload: record });
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

  assignStudentToClass: async (studentId, classId, reason) => {
    const { schoolId, classes } = get();
    await get().updateStudent(studentId, { class_id: classId });
    if (backendOnline()) {
      const cls = classes.find((c) => c.id === classId);
      const { user, fullName } = useAuthStore.getState();
      logAssignment({
        school_id:        schoolId,
        student_id:       studentId,
        class_id:         classId,
        class_name:       cls?.name || null,
        assigned_by:      user?.id  || null,
        assigned_by_name: fullName  || null,
        reason:           reason    || null,
      }).catch(() => {});
    }
  },

  bulkAssignToClass: async (studentIds, classId, reason) => {
    const { schoolId, classes } = get();
    const cls = classes.find((c) => c.id === classId);
    const { user, fullName } = useAuthStore.getState();
    for (const studentId of studentIds) {
      await get().updateStudent(studentId, { class_id: classId });
      if (backendOnline()) {
        logAssignment({
          school_id:        schoolId,
          student_id:       studentId,
          class_id:         classId,
          class_name:       cls?.name || null,
          assigned_by:      user?.id  || null,
          assigned_by_name: fullName  || null,
          reason:           reason    || null,
        }).catch(() => {});
      }
    }
  },

  // --- Grades ---

  saveGrade: async (classId, studentId, sequence, scores) => {
    const { schoolId, gradeMap } = get();
    const key    = gradeKey(classId, studentId, sequence);
    const merged = { ...(gradeMap[key] || {}), ...scores };
    const record = { key, class_id: classId, student_id: studentId, sequence, school_id: schoolId, scores: merged };

    await gradesDB.put(record);
    set((s) => ({ gradeMap: { ...s.gradeMap, [key]: merged } }));

    const hasSpecial = Object.keys(scores).some((k) => k.startsWith('__'));
    const hasGrades  = Object.keys(scores).some((k) => !k.startsWith('__'));

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
    };
    await feesDB.put(record);
    set((s) => ({
      fees: existing
        ? s.fees.map((f) => (f.id === existing.id ? record : f))
        : [...s.fees, record],
    }));
    if (backendOnline()) {
      upsertFee(record).then((saved) => { if (!saved) queueOffline({ table: 'student_fees', operation: 'upsert', payload: record }); });
    } else {
      queueOffline({ table: 'student_fees', operation: 'upsert', payload: record });
    }
    return record;
  },

  addPayment: async (studentId, { amount, date, note }) => {
    const { schoolId, activeYear, fees, feePayments } = get();
    const userId = useAuthStore.getState().userId;
    const parsedAmount = parseInt(amount, 10) || 0;
    if (!parsedAmount) return null;

    const record = {
      id:            uuid(),
      school_id:     schoolId,
      student_id:    studentId,
      academic_year: activeYear,
      amount:        parsedAmount,
      date:          date,
      note:          note || '',
      recorded_by:   userId,
      created_at:    new Date().toISOString(),
    };

    const existing = fees.find((f) => f.student_id === studentId && f.academic_year === activeYear);
    const newPaid = (existing?.frais_payes || 0) + parsedAmount;

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
    return record;
  },

  deletePayment: async (paymentId, studentId) => {
    const { feePayments, fees, activeYear } = get();
    const payment = feePayments.find((p) => p.id === paymentId);
    if (!payment) return;

    const existing = fees.find((f) => f.student_id === studentId && f.academic_year === activeYear);
    const newPaid = Math.max(0, (existing?.frais_payes || 0) - payment.amount);
    const remaining = feePayments.filter((p) => p.id !== paymentId && p.student_id === studentId);
    const lastDate = remaining.sort((a, b) => b.date.localeCompare(a.date))[0]?.date ?? null;

    await feePaymentsDB.delete(paymentId);
    set((s) => ({ feePayments: s.feePayments.filter((p) => p.id !== paymentId) }));

    await get().saveFee(studentId, { frais_payes: newPaid, date_dernier_paiement: lastDate });

    if (backendOnline()) {
      sbDeleteFeePayment(paymentId).then((ok) => {
        if (!ok) queueOffline({ table: 'fee_payments', operation: 'delete', payload: { id: paymentId } });
      });
    } else {
      queueOffline({ table: 'fee_payments', operation: 'delete', payload: { id: paymentId } });
    }
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

  // --- Class fee grids (grilles tarifaires) ---

  // Crée / met à jour la grille tarifaire d'une classe pour l'année active.
  // gridData : { class_id, amount_comptant, amount_echelonne, tranches[], notes }
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
      amount_comptant:  parseInt(gridData.amount_comptant, 10)  || 0,
      amount_echelonne: parseInt(gridData.amount_echelonne, 10) || 0,
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
