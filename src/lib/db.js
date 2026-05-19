// IndexedDB — NotesCamDB v5
// Stores: classes, subjects, students, grades, syncQueue, teachers, student_fees, fee_payments
//
// grades.key format : "${classId}_${studentId}_${sequence}"
// This matches bulletinEngine's allGrades key convention exactly.

const DB_NAME = 'NotesCamDB';
const DB_VERSION = 5;

let _db = null;

export async function initDB() {
  if (_db) return _db;

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;

      if (!db.objectStoreNames.contains('classes')) {
        db.createObjectStore('classes', { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains('subjects')) {
        const s = db.createObjectStore('subjects', { keyPath: 'id' });
        s.createIndex('by_class', 'class_id');
      }

      if (!db.objectStoreNames.contains('students')) {
        const s = db.createObjectStore('students', { keyPath: 'id' });
        s.createIndex('by_class', 'class_id');
      }

      // One record per (class × student × sequence), key = "classId_studentId_N"
      // scores field: { [subjectId]: value | 'ABS' }
      if (!db.objectStoreNames.contains('grades')) {
        db.createObjectStore('grades', { keyPath: 'key' });
      }

      // Pending operations to replay against Supabase when back online
      if (!db.objectStoreNames.contains('syncQueue')) {
        db.createObjectStore('syncQueue', { keyPath: 'id', autoIncrement: true });
      }

      if (!db.objectStoreNames.contains('teachers')) {
        db.createObjectStore('teachers', { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains('student_fees')) {
        const s = db.createObjectStore('student_fees', { keyPath: 'id' });
        s.createIndex('by_student', 'student_id');
        s.createIndex('by_school',  'school_id');
      }

      if (!db.objectStoreNames.contains('fee_payments')) {
        const s = db.createObjectStore('fee_payments', { keyPath: 'id' });
        s.createIndex('by_student', 'student_id');
        s.createIndex('by_school',  'school_id');
      }
    };

    req.onsuccess = (e) => {
      _db = e.target.result;
      resolve(_db);
    };

    req.onerror = (e) => reject(e.target.error);
  });
}

async function getDbInstance() {
  if (!_db) await initDB();
  return _db;
}

// --- Low-level helpers ---

async function idbGetAll(store) {
  const db = await getDbInstance();
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readonly').objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

async function idbGetByIndex(store, index, value) {
  const db = await getDbInstance();
  return new Promise((resolve, reject) => {
    const req = db
      .transaction(store, 'readonly')
      .objectStore(store)
      .index(index)
      .getAll(value);
    req.onsuccess = () => resolve(req.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

async function idbPut(store, record) {
  const db = await getDbInstance();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(record);
    tx.oncomplete = () => resolve(true);
    tx.onerror = (e) => reject(e.target.error);
  });
}

async function idbPutMany(store, records) {
  if (!records.length) return true;
  const db = await getDbInstance();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    const os = tx.objectStore(store);
    records.forEach((r) => os.put(r));
    tx.oncomplete = () => resolve(true);
    tx.onerror = (e) => reject(e.target.error);
  });
}

async function idbDelete(store, key) {
  const db = await getDbInstance();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).delete(key);
    tx.oncomplete = () => resolve(true);
    tx.onerror = (e) => reject(e.target.error);
  });
}

async function idbAdd(store, record) {
  const db = await getDbInstance();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).add(record);
    req.onsuccess = () => resolve(req.result);
    tx.onerror = (e) => reject(e.target.error);
  });
}

// --- Public namespaced API ---

export const classesDB = {
  getAll: () => idbGetAll('classes'),
  put: (r) => idbPut('classes', r),
  putMany: (rs) => idbPutMany('classes', rs),
  delete: (id) => idbDelete('classes', id),
};

export const subjectsDB = {
  getAll: () => idbGetAll('subjects'),
  getByClass: (classId) => idbGetByIndex('subjects', 'by_class', classId),
  put: (r) => idbPut('subjects', r),
  putMany: (rs) => idbPutMany('subjects', rs),
  delete: (id) => idbDelete('subjects', id),
};

export const studentsDB = {
  getAll: () => idbGetAll('students'),
  getByClass: (classId) => idbGetByIndex('students', 'by_class', classId),
  put: (r) => idbPut('students', r),
  putMany: (rs) => idbPutMany('students', rs),
  delete: (id) => idbDelete('students', id),
};

export const gradesDB = {
  getAll: () => idbGetAll('grades'),
  // record = { key, class_id, student_id, sequence, school_id, scores }
  put: (r) => idbPut('grades', r),
  putMany: (rs) => idbPutMany('grades', rs),
  delete: (key) => idbDelete('grades', key),
};

export const syncQueueDB = {
  getAll: () => idbGetAll('syncQueue'),
  // op = { table, operation: 'upsert'|'delete', payload }
  push: (op) => idbAdd('syncQueue', { ...op, timestamp: Date.now() }),
  delete: (id) => idbDelete('syncQueue', id),
};

export const teachersDB = {
  getAll: () => idbGetAll('teachers'),
  put: (r) => idbPut('teachers', r),
  putMany: (rs) => idbPutMany('teachers', rs),
  delete: (id) => idbDelete('teachers', id),
};

export const feesDB = {
  getAll: () => idbGetAll('student_fees'),
  put: (r) => idbPut('student_fees', r),
  putMany: (rs) => idbPutMany('student_fees', rs),
  delete: (id) => idbDelete('student_fees', id),
};

export const feePaymentsDB = {
  getAll: () => idbGetAll('fee_payments'),
  put: (r) => idbPut('fee_payments', r),
  putMany: (rs) => idbPutMany('fee_payments', rs),
  delete: (id) => idbDelete('fee_payments', id),
};
