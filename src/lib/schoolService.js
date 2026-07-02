// Supabase CRUD layer for school domain entities.
//
// Required Supabase tables (create via SQL editor or migrations):
//
// classes: id uuid PK, school_id uuid FK(schools), name text, level text,
//          section text, system text ('FR'|'EN'), current_year text, created_at
//
// subjects: id uuid PK, school_id uuid FK, class_id uuid FK(classes),
//           name text, coef int, max int (20=FR / 100=EN), created_at
//
// students: id uuid PK, school_id uuid FK, class_id uuid FK(classes),
//           name text, matricule text, gender text, date_naissance date, created_at
//
// grades: id uuid PK, school_id uuid FK, class_id uuid FK, student_id uuid FK,
//         subject_id uuid FK, sequence int, value text ('ABS' or numeric string),
//         updated_at. UNIQUE(class_id, student_id, subject_id, sequence)
//
// All tables need RLS: auth.uid() → school_users → school_id match.

import { supabase } from './supabase';

// --- Classes ---

export async function fetchClasses(schoolId, year) {
  let q = supabase.from('classes').select('*').eq('school_id', schoolId);
  if (year) q = q.eq('current_year', year);
  const { data, error } = await q.order('name');
  if (error) { console.error('fetchClasses', error); return null; }
  return data;
}

export async function upsertClass(classData) {
  // `serie` (colonne Second Cycle MINESEC) n'existe que si la migration
  // supabase_sc_minesec.sql a été appliquée. On ne l'envoie jamais vide : ça évite
  // l'erreur « Could not find the 'serie' column » pour les classes Classique/APC.
  let payload = classData;
  if (classData && (classData.serie === '' || classData.serie == null)) {
    const { serie, ...rest } = classData;
    payload = rest;
  }
  const { data, error } = await supabase
    .from('classes')
    .upsert(payload, { onConflict: 'id' })
    .select()
    .single();
  if (error) { console.error('upsertClass', error); return null; }
  return data;
}

export async function deleteClass(id) {
  const { error } = await supabase.from('classes').delete().eq('id', id);
  if (error) { console.error('deleteClass', error); return false; }
  return true;
}

// --- Subjects ---

// `classIds` (optionnel) : limite aux matières de ces classes — sert à ne
// charger que l'année active (cf. _refreshFromSupabase) au lieu de toute l'école.
export async function fetchSubjects(schoolId, classIds = null) {
  let q = supabase.from('subjects').select('*').eq('school_id', schoolId);
  if (classIds) q = q.in('class_id', classIds);
  const { data, error } = await q.order('name');
  if (error) { console.error('fetchSubjects', error); return null; }
  return data;
}

export async function upsertSubject(subjectData) {
  const { data, error } = await supabase
    .from('subjects')
    .upsert(subjectData, { onConflict: 'id' })
    .select()
    .single();
  if (error) { console.error('upsertSubject', error); return null; }
  return data;
}

export async function deleteSubject(id) {
  const { error } = await supabase.from('subjects').delete().eq('id', id);
  if (error) { console.error('deleteSubject', error); return false; }
  return true;
}

// --- Students ---

export async function fetchStudents(schoolId, classIds = null) {
  let q = supabase.from('students').select('*').eq('school_id', schoolId);
  if (classIds) q = q.in('class_id', classIds);
  const { data, error } = await q.order('name');
  if (error) { console.error('fetchStudents', error); return null; }
  return data;
}

// Fetch student rows by id, regardless of their current class. Used to rebuild an
// archived year's roster: a promoted student's single row now points to a later
// year's class, so it never comes back from the class-scoped fetch above.
export async function fetchStudentsByIds(schoolId, ids = []) {
  if (!ids.length) return [];
  const { data, error } = await supabase
    .from('students').select('*')
    .eq('school_id', schoolId)
    .in('id', ids);
  if (error) { console.error('fetchStudentsByIds', error); return []; }
  return data || [];
}

function sanitizeStudent(d) {
  return {
    ...d,
    gender: d.gender || null,
    statut: d.statut || null,
  };
}

export async function upsertStudent(studentData) {
  const { data, error } = await supabase
    .from('students')
    .upsert(sanitizeStudent(studentData), { onConflict: 'id' })
    .select()
    .single();
  if (error) { console.error('upsertStudent', error); return null; }
  return data;
}

export async function deleteStudent(id) {
  const { error } = await supabase.from('students').delete().eq('id', id);
  if (error) { console.error('deleteStudent', error); return false; }
  return true;
}

// --- Grades ---
// Supabase stores one row per (class × student × subject × sequence).
// The store uses a gradeMap keyed by "classId_studentId_sequence" for bulletinEngine.

export async function fetchGrades(schoolId, classIds = null) {
  let q = supabase.from('grades').select('*').eq('school_id', schoolId);
  if (classIds) q = q.in('class_id', classIds);
  const { data, error } = await q;
  if (error) { console.error('fetchGrades', error); return null; }
  return data;
}

// Converts Supabase grade rows → gradeMap { "cId_sId_seq": { subId: val } }
export function gradeRowsToMap(rows) {
  const map = {};
  for (const row of rows) {
    const key = `${row.class_id}_${row.student_id}_${row.sequence}`;
    if (!map[key]) map[key] = {};
    map[key][row.subject_id] = row.value;
  }
  return map;
}

// Keys starting with __ are special (absences, conduite, conseil, décision…) —
// JAMAIS des subject_id (UUID). On filtre par le préfixe `__` plutôt que par une
// liste exhaustive : tout nouveau champ spécial (ex. __decision__) est exclu
// automatiquement et ne peut plus être inséré dans `grades.subject_id`.
const isSpecialKey = (k) => k.startsWith('__');

// Converts gradeMap entry → array of upsert-ready rows (filters special keys)
export function gradeEntryToRows(classId, studentId, sequence, scores, schoolId) {
  return Object.entries(scores)
    .filter(([k]) => !isSpecialKey(k))
    .map(([subjectId, value]) => ({
      school_id: schoolId,
      class_id: classId,
      student_id: studentId,
      subject_id: subjectId,
      sequence,
      value: String(value),
    }));
}

export async function upsertGradeEntry(classId, studentId, sequence, scores, schoolId) {
  const rows = gradeEntryToRows(classId, studentId, sequence, scores, schoolId);
  if (rows.length) {
    const { error } = await supabase
      .from('grades')
      .upsert(rows, { onConflict: 'class_id,student_id,subject_id,sequence' });
    if (error) { console.error('upsertGradeEntry', error); return false; }
  }
  return true;
}

export async function deleteGradesForStudent(studentId) {
  const { error } = await supabase.from('grades').delete().eq('student_id', studentId);
  if (error) { console.error('deleteGradesForStudent', error); return false; }
  return true;
}

// --- Student absences (abs_j, abs_nj, conduite) ---

export async function fetchAbsences(schoolId) {
  const { data, error } = await supabase
    .from('student_absences')
    .select('*')
    .eq('school_id', schoolId);
  if (error) { console.error('fetchAbsences', error); return null; }
  return data;
}

export async function upsertAbsenceEntry(classId, studentId, sequence, absData, schoolId) {
  const row = {
    school_id:      schoolId,
    class_id:       classId,
    student_id:     studentId,
    sequence,
    abs_j:          Number(absData.__abs_j__          ?? 0),
    abs_nj:         Number(absData.__abs_nj__         ?? 0),
    conduite:       absData.__conduite__               || null,
    th:             absData.__th__            === 'true',
    encouragement:  absData.__encouragement__ === 'true',
    felicitation:   absData.__felicitation__  === 'true',
    aver_travail:   Number(absData.__aver_travail__   ?? 0),
    blame_travail:  Number(absData.__blame_travail__  ?? 0),
    exclusions:     Number(absData.__exclusions__     ?? 0),
    aver_conduite:  Number(absData.__aver_conduite__  ?? 0),
    blame_conduite: Number(absData.__blame_conduite__ ?? 0),
    decision:       absData.__decision__               || null,
  };
  const { error } = await supabase
    .from('student_absences')
    .upsert(row, { onConflict: 'student_id,sequence' });
  if (error) { console.error('upsertAbsenceEntry', error); return false; }
  return true;
}

// --- Storage (school assets) ---

export async function uploadSchoolAsset(schoolId, file, assetType) {
  const ext  = file.name.split('.').pop() || 'png';
  const path = `${schoolId}/${assetType}.${ext}`;
  const { error: upError } = await supabase.storage
    .from('school-assets')
    .upload(path, file, { upsert: true, contentType: file.type });
  if (upError) return { url: null, error: upError };

  const { data } = supabase.storage.from('school-assets').getPublicUrl(path);
  return { url: data.publicUrl, error: null };
}

// Photo d'élève — même bucket que les assets école, sous-dossier `students/`.
// `file` est attendu déjà redimensionné en JPEG (cf. lib/image.js). Le chemin
// est déterministe (un fichier par élève) : un nouvel upload remplace l'ancien.
// On ajoute `?v=` à l'URL pour casser le cache navigateur après remplacement.
export async function uploadStudentPhoto(schoolId, studentId, file) {
  const path = `${schoolId}/students/${studentId}.jpg`;
  const { error } = await supabase.storage
    .from('school-assets')
    .upload(path, file, { upsert: true, contentType: 'image/jpeg' });
  if (error) { console.error('uploadStudentPhoto', error); return { url: null, error }; }

  const { data } = supabase.storage.from('school-assets').getPublicUrl(path);
  return { url: `${data.publicUrl}?v=${Date.now()}`, error: null };
}

// Supprime le fichier photo du stockage (best-effort). À appeler quand l'admin
// retire la photo d'un élève, pour ne pas laisser de fichier orphelin.
export async function deleteStudentPhoto(schoolId, studentId) {
  const path = `${schoolId}/students/${studentId}.jpg`;
  try {
    await supabase.storage.from('school-assets').remove([path]);
  } catch (e) {
    console.warn('deleteStudentPhoto', e);
  }
}

// --- Year utilities ---

export async function fetchDistinctYears(schoolId) {
  // Pas de .not('current_year','is',null) : l'adaptateur LAN (localClient) ne
  // gère pas l'opérateur `.not` → l'appel levait une TypeError et la page
  // « Années archivées » restait bloquée sur « Chargement… ». Les valeurs nulles
  // sont écartées côté client (filter(Boolean)), ce qui marche cloud ET LAN.
  const { data, error } = await supabase
    .from('classes')
    .select('current_year')
    .eq('school_id', schoolId);
  if (error) { console.error('fetchDistinctYears', error); return []; }
  const years = [...new Set((data || []).map((r) => r.current_year).filter(Boolean))];
  return years.sort().reverse();
}

// --- Teachers ---

export async function fetchTeachers(schoolId) {
  const { data, error } = await supabase
    .from('teachers')
    .select('*')
    .eq('school_id', schoolId)
    .order('name');
  if (error) { console.error('fetchTeachers', error); return null; }
  return data;
}

// Colonnes nullables des enseignants : une chaîne vide est invalide pour la
// colonne `date` (hire_date) côté Postgres — on convertit '' → null. On
// sanitise au point d'écriture pour couvrir TOUS les chemins (formulaire,
// rejeu de la file de sync, import de données), pas seulement le store.
const TEACHER_NULLABLE = [
  'hire_date', 'matricule', 'gender', 'address', 'photo_url',
  'fonction', 'status', 'email', 'phone', 'specialty',
];
function sanitizeTeacher(d) {
  const out = { ...d };
  for (const k of TEACHER_NULLABLE) if (k in out && out[k] === '') out[k] = null;
  return out;
}

export async function upsertTeacher(teacherData) {
  const { data, error } = await supabase
    .from('teachers')
    .upsert(sanitizeTeacher(teacherData), { onConflict: 'id' })
    .select()
    .single();
  if (error) { console.error('upsertTeacher', error); return null; }
  return data;
}

export async function deleteTeacher(id) {
  const { error } = await supabase.from('teachers').delete().eq('id', id);
  if (error) { console.error('deleteTeacher', error); return false; }
  return true;
}

// --- Student fees ---

export async function fetchFees(schoolId, year) {
  let q = supabase.from('student_fees').select('*').eq('school_id', schoolId);
  if (year) q = q.eq('academic_year', year);
  const { data, error } = await q;
  if (error) { console.error('fetchFees', error); return null; }
  return data;
}

export async function upsertFee(feeData) {
  const { data, error } = await supabase
    .from('student_fees')
    .upsert(feeData, { onConflict: 'id' })
    .select()
    .single();
  if (error) { console.error('upsertFee', error); return null; }
  return data;
}

export async function deleteFee(id) {
  const { error } = await supabase.from('student_fees').delete().eq('id', id);
  if (error) { console.error('deleteFee', error); return false; }
  return true;
}

// --- Class fee grids (grilles tarifaires par classe) ---

export async function fetchClassFeeGrids(schoolId, year) {
  let q = supabase.from('class_fee_grids').select('*').eq('school_id', schoolId);
  if (year) q = q.eq('academic_year', year);
  const { data, error } = await q;
  if (error) { console.error('fetchClassFeeGrids', error); return null; }
  return data;
}

export async function upsertClassFeeGrid(grid) {
  const { data, error } = await supabase
    .from('class_fee_grids')
    .upsert(grid, { onConflict: 'id' })
    .select()
    .single();
  if (error) { console.error('upsertClassFeeGrid', error); return null; }
  return data;
}

export async function deleteClassFeeGrid(id) {
  const { error } = await supabase.from('class_fee_grids').delete().eq('id', id);
  if (error) { console.error('deleteClassFeeGrid', error); return false; }
  return true;
}

// --- Fee payments (individual installments) ---

export async function fetchFeePayments(schoolId, year) {
  let q = supabase.from('fee_payments').select('*').eq('school_id', schoolId);
  if (year) q = q.eq('academic_year', year);
  const { data, error } = await q.order('date', { ascending: false });
  if (error) { console.error('fetchFeePayments', error); return null; }
  return data;
}

export async function insertFeePayment(payment) {
  const { data, error } = await supabase.from('fee_payments').insert(payment).select().single();
  if (error) { console.error('insertFeePayment', error); return null; }
  return data;
}

export async function deleteFeePayment(id) {
  const { error } = await supabase.from('fee_payments').delete().eq('id', id);
  if (error) { console.error('deleteFeePayment', error); return false; }
  return true;
}

// --- Timetable ---

export async function fetchTimetableSlots(schoolId, year) {
  let q = supabase.from('timetable_slots').select('*').eq('school_id', schoolId);
  if (year) q = q.eq('academic_year', year);
  const { data, error } = await q.order('day_of_week').order('start_time');
  if (error) { console.error('fetchTimetableSlots', error); return null; }
  return data;
}

export async function upsertTimetableSlot(slotData) {
  const { data, error } = await supabase
    .from('timetable_slots')
    .upsert(slotData, { onConflict: 'id' })
    .select()
    .single();
  if (error) { console.error('upsertTimetableSlot', error); return null; }
  return data;
}

export async function deleteTimetableSlot(id) {
  const { error } = await supabase.from('timetable_slots').delete().eq('id', id);
  if (error) { console.error('deleteTimetableSlot', error); return false; }
  return true;
}
