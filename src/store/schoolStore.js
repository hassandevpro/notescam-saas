// Offline-first school data store.
//
// Write path: IDB immediately (optimistic) → Supabase if online, queue if not.
// Read path:  IDB first (instant) → Supabase refresh if online → IDB updated.
//
// gradeMap key format: "${classId}_${studentId}_${sequence}"
// This is the exact format bulletinEngine expects for allGrades.

import { create } from 'zustand';
import { initDB, classesDB, subjectsDB, studentsDB, gradesDB, syncQueueDB, teachersDB, feesDB } from '../lib/db';
import {
  fetchClasses, upsertClass, deleteClass as sbDeleteClass,
  fetchSubjects, upsertSubject, deleteSubject as sbDeleteSubject,
  fetchStudents, upsertStudent, deleteStudent as sbDeleteStudent,
  fetchGrades, gradeRowsToMap, upsertGradeEntry,
  fetchAbsences, upsertAbsenceEntry,
  fetchTeachers, upsertTeacher, deleteTeacher as sbDeleteTeacher,
  fetchFees, upsertFee, deleteFee as sbDeleteFee,
} from '../lib/schoolService';
import { upsertGradeNotification } from '../lib/notificationsService';
import { logAssignment } from '../lib/classAssignmentService';
import { flushSyncQueue } from '../lib/sync';
import { getNextLevel, computeNextYear } from '../lib/yearEngine';
import { useUiStore } from './uiStore';
import { useAuthStore } from './authStore';

// Throttle : 1 notification max par (classId_sequence) toutes les 2 min
const _gradeNotifLastSent = {};

function uuid() {
  return crypto.randomUUID();
}

async function queueOffline(op) {
  await syncQueueDB.push(op);
  useUiStore.getState().incrementPending();
}

function gradeKey(classId, studentId, sequence) {
  return `${classId}_${studentId}_${sequence}`;
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

export const useSchoolStore = create((set, get) => ({
  schoolId:   null,
  activeYear: null,
  classes:    [],
  subjects:   [],
  students:   [],
  teachers:   [],
  fees:       [],
  gradeMap:   {},
  loading:    false,
  error:      null,

  // Called by App once school is known (schoolId + activeYear from authStore).
  // Loads IDB immediately (year-filtered), then refreshes from Supabase if online.
  // teacherId: if set (teacher role), restricts visible classes to those assigned to this teacher.
  init: async (schoolId, activeYear, teacherId) => {
    if (!schoolId) return;
    // Wipe stale data from any previous session immediately — prevents flash of wrong data
    set({ loading: true, error: null, schoolId, activeYear: activeYear || null,
          classes: [], subjects: [], students: [], teachers: [], fees: [], gradeMap: {} });

    try {
      await initDB();

      const [idbClasses, idbSubjects, idbStudents, idbGrades, idbTeachers, idbFees] = await Promise.all([
        classesDB.getAll(),
        subjectsDB.getAll(),
        studentsDB.getAll(),
        gradesDB.getAll(),
        teachersDB.getAll(),
        feesDB.getAll(),
      ]);

      // Filter by school
      let allClasses  = idbClasses.filter((c) => c.school_id === schoolId);
      let allSubjects = idbSubjects.filter((s) => s.school_id === schoolId);
      let allStudents = idbStudents.filter((s) => s.school_id === schoolId);
      let allGrades   = idbGrades.filter((g) => g.school_id === schoolId);
      const allTeachers = idbTeachers.filter((t) => t.school_id === schoolId);
      const allFees = idbFees.filter((f) => f.school_id === schoolId && (!activeYear || f.academic_year === activeYear));

      // Filter by active year (classes drive the year scope)
      if (activeYear) {
        const yearClasses   = allClasses.filter((c) => c.current_year === activeYear);
        const yearClassIds  = new Set(yearClasses.map((c) => c.id));
        allClasses  = yearClasses;
        allSubjects = allSubjects.filter((s) => yearClassIds.has(s.class_id));
        allStudents = allStudents.filter((s) => yearClassIds.has(s.class_id));
        allGrades   = allGrades.filter((g) => yearClassIds.has(g.class_id));
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
        classes:  allClasses,
        subjects: allSubjects,
        students: allStudents,
        teachers: allTeachers,
        fees:     allFees,
        gradeMap: buildGradeMap(allGrades),
        loading:  false,
      });

      if (navigator.onLine) {
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

    const [sbClasses, sbSubjects, sbStudents, sbGrades, sbAbsences, sbTeachers, sbFees] = await Promise.all([
      fetchClasses(schoolId, year),
      fetchSubjects(schoolId),
      fetchStudents(schoolId),
      fetchGrades(schoolId),
      fetchAbsences(schoolId),
      fetchTeachers(schoolId),
      fetchFees(schoolId, year),
    ]);

    // ── Normalize student genders ────────────────────────────────────────
    const normalizedStudents = sbStudents?.map((s) => ({
      ...s,
      gender: s.gender
        ? (GENDER_MAP[s.gender.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')] ?? s.gender)
        : null,
    })) ?? null;

    // ── Year scope: build filtered collections in local vars ─────────────
    let newClasses  = sbClasses  ?? get().classes;
    const activeClassIds = new Set(newClasses.map((c) => c.id));

    let newSubjects = sbSubjects !== null
      ? sbSubjects.filter((s) => !year || activeClassIds.has(s.class_id))
      : get().subjects;

    let newStudents = normalizedStudents !== null
      ? normalizedStudents.filter((s) => !year || activeClassIds.has(s.class_id))
      : get().students;

    const newTeachers = sbTeachers ?? get().teachers;
    const newFees     = sbFees     ?? get().fees;

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
    if (sbFees             !== null) await feesDB.putMany(sbFees);

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
      ...(sbClasses          !== null && { classes:  newClasses }),
      ...(sbSubjects         !== null && { subjects: newSubjects }),
      ...(normalizedStudents !== null && { students: newStudents }),
      ...(sbTeachers         !== null && { teachers: newTeachers }),
      ...(sbFees             !== null && { fees:     newFees }),
      gradeMap: newGradeMap,
    });
  },

  // ── Academic year promotion ──────────────────────────────────────────────

  promoteYear: async () => {
    const { schoolId, classes, subjects, students } = get();
    const school = useAuthStore.getState().school;
    if (!school?.current_year) return { error: 'Aucune année active définie.' };

    const newYear = computeNextYear(school.current_year);
    const classMapping = new Map(); // oldClassId → newClass | null (diplômés)
    const newClasses   = [];
    const newSubjList  = [];
    const updatedStudents = [];
    let graduatedCount = 0;

    // 1. Build new classes + copy subjects
    for (const cls of classes) {
      const nextLevel = getNextLevel(cls.level, cls.system);
      if (nextLevel === null) {
        // Graduating class — students stay archived with old class_id
        classMapping.set(cls.id, null);
        graduatedCount += students.filter((s) => s.class_id === cls.id).length;
        continue;
      }
      const newCls = {
        id:           uuid(),
        school_id:    schoolId,
        name:         cls.name,
        level:        nextLevel !== undefined ? nextLevel : cls.level,
        section:      cls.section,
        system:       cls.system,
        current_year: newYear,
        teacher_id:   cls.teacher_id,
      };
      classMapping.set(cls.id, newCls);
      newClasses.push(newCls);

      for (const sub of subjects.filter((s) => s.class_id === cls.id)) {
        newSubjList.push({
          id:         uuid(),
          school_id:  schoolId,
          class_id:   newCls.id,
          name:       sub.name,
          coef:       sub.coef,
          max:        sub.max,
          teacher_id: sub.teacher_id,
        });
      }
    }

    // 2. Promote students (graduates stay with old class_id → archived)
    for (const student of students) {
      const newCls = classMapping.get(student.class_id);
      if (newCls) {
        updatedStudents.push({ ...student, class_id: newCls.id });
      }
    }

    // 3. Persist to IDB
    if (newClasses.length)   await classesDB.putMany(newClasses);
    if (newSubjList.length)  await subjectsDB.putMany(newSubjList);
    for (const s of updatedStudents) await studentsDB.put(s);

    // 4. Queue sync operations
    for (const cls of newClasses)      await queueOffline({ table: 'classes',  operation: 'upsert', payload: cls });
    for (const sub of newSubjList)     await queueOffline({ table: 'subjects', operation: 'upsert', payload: sub });
    for (const s of updatedStudents)   await queueOffline({ table: 'students', operation: 'upsert', payload: s });

    // 5. Flush sync immediately if online — ensures Supabase is up-to-date
    //    before _refreshFromSupabase could overwrite our IDB changes.
    if (navigator.onLine) {
      await flushSyncQueue();
    }

    // 6. Update school's current_year in Supabase + authStore
    //    → App.jsx will detect the change and call init(schoolId, newYear)
    const { error } = await useAuthStore.getState().updateSchool({ current_year: newYear });
    if (error) return { error };

    return {
      newYear,
      newClasses:  newClasses.length,
      promoted:    updatedStudents.length,
      graduated:   graduatedCount,
    };
  },

  // --- Classes ---

  addClass: async (classData) => {
    const { schoolId } = get();
    const record = { id: uuid(), school_id: schoolId, ...classData };
    await classesDB.put(record);
    set((s) => ({ classes: [...s.classes, record] }));
    if (navigator.onLine) {
      const saved = await upsertClass(record);
      if (!saved) queueOffline({ table: 'classes', operation: 'upsert', payload: record });
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
    if (navigator.onLine) {
      upsertClass(record).then((saved) => { if (!saved) queueOffline({ table: 'classes', operation: 'upsert', payload: record }); });
    } else {
      queueOffline({ table: 'classes', operation: 'upsert', payload: record });
    }
  },

  deleteClass: async (id) => {
    await classesDB.delete(id);
    set((s) => ({ classes: s.classes.filter((c) => c.id !== id) }));
    if (navigator.onLine) {
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
    if (navigator.onLine) {
      const saved = await upsertSubject(record);
      if (!saved) queueOffline({ table: 'subjects', operation: 'upsert', payload: record });
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
    if (navigator.onLine) {
      upsertSubject(record).then((saved) => { if (!saved) queueOffline({ table: 'subjects', operation: 'upsert', payload: record }); });
    } else {
      queueOffline({ table: 'subjects', operation: 'upsert', payload: record });
    }
  },

  deleteSubject: async (id) => {
    await subjectsDB.delete(id);
    set((s) => ({ subjects: s.subjects.filter((x) => x.id !== id) }));
    if (navigator.onLine) {
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
    if (navigator.onLine) {
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
    if (navigator.onLine) {
      upsertStudent(record).then((saved) => { if (!saved) queueOffline({ table: 'students', operation: 'upsert', payload: record }); });
    } else {
      queueOffline({ table: 'students', operation: 'upsert', payload: record });
    }
  },

  deleteStudent: async (id) => {
    await studentsDB.delete(id);
    set((s) => ({ students: s.students.filter((x) => x.id !== id) }));
    if (navigator.onLine) {
      sbDeleteStudent(id).then((ok) => { if (!ok) queueOffline({ table: 'students', operation: 'delete', payload: { id } }); });
    } else {
      queueOffline({ table: 'students', operation: 'delete', payload: { id } });
    }
  },

  assignStudentToClass: async (studentId, classId, reason) => {
    const { schoolId, classes } = get();
    await get().updateStudent(studentId, { class_id: classId });
    if (navigator.onLine) {
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
      if (navigator.onLine) {
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

    if (navigator.onLine) {
      if (hasGrades) {
        upsertGradeEntry(classId, studentId, sequence, merged, schoolId).then((ok) => {
          if (!ok) queueOffline({ table: 'grades', operation: 'upsert', payload: record });
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
    await teachersDB.put(record);
    set((s) => ({ teachers: [...s.teachers, record] }));
    if (navigator.onLine) {
      upsertTeacher(record).then((saved) => { if (!saved) queueOffline({ table: 'teachers', operation: 'upsert', payload: record }); });
    } else {
      queueOffline({ table: 'teachers', operation: 'upsert', payload: record });
    }
    return record;
  },

  updateTeacher: async (id, data) => {
    const { teachers } = get();
    const record = { ...teachers.find((t) => t.id === id), ...data };
    await teachersDB.put(record);
    set((s) => ({ teachers: s.teachers.map((t) => (t.id === id ? record : t)) }));
    if (navigator.onLine) {
      upsertTeacher(record).then((saved) => { if (!saved) queueOffline({ table: 'teachers', operation: 'upsert', payload: record }); });
    } else {
      queueOffline({ table: 'teachers', operation: 'upsert', payload: record });
    }
  },

  deleteTeacher: async (id) => {
    await teachersDB.delete(id);
    set((s) => ({
      teachers: s.teachers.filter((t) => t.id !== id),
      classes:  s.classes.map((c) => c.teacher_id === id ? { ...c, teacher_id: null } : c),
    }));
    if (navigator.onLine) {
      sbDeleteTeacher(id).then((ok) => { if (!ok) queueOffline({ table: 'teachers', operation: 'delete', payload: { id } }); });
    } else {
      queueOffline({ table: 'teachers', operation: 'delete', payload: { id } });
    }
  },

  // --- Student fees ---

  saveFee: async (studentId, feeData) => {
    const { schoolId, activeYear, fees } = get();
    const existing = fees.find((f) => f.student_id === studentId && f.academic_year === (activeYear || feeData.academic_year));
    const record = {
      id:            existing?.id || crypto.randomUUID(),
      school_id:     schoolId,
      student_id:    studentId,
      academic_year: activeYear || feeData.academic_year,
      frais_annuels: feeData.frais_annuels ?? existing?.frais_annuels ?? 0,
      frais_payes:   feeData.frais_payes   ?? existing?.frais_payes   ?? 0,
      date_dernier_paiement: feeData.date_dernier_paiement ?? existing?.date_dernier_paiement ?? null,
      notes:         feeData.notes ?? existing?.notes ?? null,
    };
    await feesDB.put(record);
    set((s) => ({
      fees: existing
        ? s.fees.map((f) => (f.id === existing.id ? record : f))
        : [...s.fees, record],
    }));
    if (navigator.onLine) {
      upsertFee(record).then((saved) => { if (!saved) queueOffline({ table: 'student_fees', operation: 'upsert', payload: record }); });
    } else {
      queueOffline({ table: 'student_fees', operation: 'upsert', payload: record });
    }
    return record;
  },

  deleteFee: async (id) => {
    await feesDB.delete(id);
    set((s) => ({ fees: s.fees.filter((f) => f.id !== id) }));
    if (navigator.onLine) {
      sbDeleteFee(id).then((ok) => { if (!ok) queueOffline({ table: 'student_fees', operation: 'delete', payload: { id } }); });
    } else {
      queueOffline({ table: 'student_fees', operation: 'delete', payload: { id } });
    }
  },

  // --- Selectors ---

  getClassSubjects: (classId) => get().subjects.filter((s) => s.class_id === classId),
  getClassStudents: (classId) => get().students.filter((s) => s.class_id === classId),
  getGradeEntry:    (classId, studentId, sequence) =>
    get().gradeMap[gradeKey(classId, studentId, sequence)] || {},
}));
