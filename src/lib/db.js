// IndexedDB — NotesCamDB v5
// Stores: classes, subjects, students, grades, syncQueue, teachers, student_fees, fee_payments
//
// grades.key format : "${classId}_${studentId}_${sequence}"
// This matches bulletinEngine's allGrades key convention exactly.

const DB_NAME = 'NotesCamDB';
// Bump à 12 : moteur SECOND CYCLE MINESEC — cache du référentiel (`sc_ref`).
// Bump à 13 : moteurs FONDAMENTAL MINEDUB — maternelle (`mat_ref`, `mat_obs`) +
//             primaire APC (`prim_ref`, `prim_notes`).
// Bump à 14 : unités pédagogiques du complexe scolaire (`school_units`).
// Bump à 15 : socle P0 — outbox d'events (`domain_events`), journal d'audit
//             (`audit_events`) et domaine transverse `signalements`. Offline-first :
//             les events/signalements créés hors-ligne survivent et se synchronisent.
const DB_VERSION = 15;

let _db = null;

// Demande au navigateur de garder le storage de l'app de façon persistante.
// Sur Chromium-based & Firefox, cela évite l'éviction silencieuse de IndexedDB
// si la machine manque d'espace. Sans effet ailleurs.
export async function requestPersistentStorage() {
  try {
    if (navigator?.storage?.persist) {
      const granted = await navigator.storage.persist();
      return granted;
    }
  } catch (_) { /* ignored */ }
  return false;
}

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

      // --- v6 ---
      // Corbeille : conserve un instantané des enregistrements supprimés
      // pour permettre une restauration ultérieure.
      // Schema : { id, table, original_id, payload, deleted_at, deleted_by, school_id }
      if (!db.objectStoreNames.contains('trash')) {
        const s = db.createObjectStore('trash', { keyPath: 'id', autoIncrement: true });
        s.createIndex('by_table',  'table');
        s.createIndex('by_school', 'school_id');
      }

      // Journal d'audit : trace les opérations sensibles (créa/modif/suppression
      // de notes, bulletins, utilisateurs, etc.).
      // Schema : { id, action, table, target_id, user_id, user_name, at, details, school_id }
      if (!db.objectStoreNames.contains('audit_log')) {
        const s = db.createObjectStore('audit_log', { keyPath: 'id', autoIncrement: true });
        s.createIndex('by_school', 'school_id');
        s.createIndex('by_action', 'action');
        s.createIndex('by_user',   'user_id');
      }

      // --- v7 ---
      // Périodes académiques : état (upcoming/active/closed) + verrou des séquences.
      // Schema : { id, school_id, school_year, type, parent_id, name, sequence_order,
      //            teaching_start, teaching_end, entry_deadline, status, is_locked,
      //            activated_at, activated_by, closed_at, closed_by, created_at, updated_at }
      if (!db.objectStoreNames.contains('academic_periods')) {
        const s = db.createObjectStore('academic_periods', { keyPath: 'id' });
        s.createIndex('by_school', 'school_id');
      }

      // --- v8 ---
      // Personnel (tous départements). Schema : { id, school_id, matricule,
      // first_name, last_name, name, gender, phone, email, address, photo_url,
      // fonction, department, hire_date, status, documents, auth_user_id, active }
      if (!db.objectStoreNames.contains('staff')) {
        const s = db.createObjectStore('staff', { keyPath: 'id' });
        s.createIndex('by_school',     'school_id');
        s.createIndex('by_department', 'department');
      }

      // --- v9 ---
      // Historique des générations de relevés (centre de production documentaire).
      // Local par poste (aucune table cloud) — suffit pour le suivi direction.
      // Schema : { id, school_id, at, user_name, type, scope, count, status, detail }
      if (!db.objectStoreNames.contains('document_log')) {
        const s = db.createObjectStore('document_log', { keyPath: 'id', autoIncrement: true });
        s.createIndex('by_school', 'school_id');
      }

      // --- v10 ---
      // Grilles tarifaires par classe (frais comptant + échelonné + tranches).
      // Schema : { id, school_id, class_id, academic_year, amount_comptant,
      //            amount_echelonne, tranches:[{id,label,amount,due_date}],
      //            currency, notes, created_at, updated_at }
      if (!db.objectStoreNames.contains('class_fee_grids')) {
        const s = db.createObjectStore('class_fee_grids', { keyPath: 'id' });
        s.createIndex('by_school', 'school_id');
        s.createIndex('by_class',  'class_id');
      }

      // --- v11 (moteur APC_MINISTERIEL_MINESEC) ---
      // Cache du référentiel officiel (lecture seule pour l'école). Un seul
      // enregistrement-blob keyé 'referentiel' :
      //   { id:'referentiel', cycles, classes, trimestres, sequences, matieres,
      //     competences, version }
      if (!db.objectStoreNames.contains('apc_ref')) {
        db.createObjectStore('apc_ref', { keyPath: 'id' });
      }

      // Notes par compétence. keyPath 'id' (uuid) ; `nkey` =
      // `${eleve_id}_${competence_id}_${sequence_id}` pour retrouver/écraser
      // une note existante. Schéma aligné sur les colonnes de la table cloud.
      if (!db.objectStoreNames.contains('apc_notes')) {
        const s = db.createObjectStore('apc_notes', { keyPath: 'id' });
        s.createIndex('by_school',  'school_id');
        s.createIndex('by_student', 'eleve_id');
        s.createIndex('by_nkey',    'nkey', { unique: true });
      }

      // Bulletins APC consolidés (par élève × trimestre).
      if (!db.objectStoreNames.contains('apc_bulletins')) {
        const s = db.createObjectStore('apc_bulletins', { keyPath: 'id' });
        s.createIndex('by_school',  'school_id');
        s.createIndex('by_student', 'eleve_id');
      }

      // --- v12 (moteur SECOND CYCLE MINESEC) ---
      // Cache du référentiel second cycle (séries/groupes/matières/serie_matieres).
      // Un seul blob keyé 'referentiel'.
      if (!db.objectStoreNames.contains('sc_ref')) {
        db.createObjectStore('sc_ref', { keyPath: 'id' });
      }

      // --- v13 (moteurs FONDAMENTAL MINEDUB) ---
      // Cache des référentiels fondamentaux (un blob keyé 'referentiel' chacun).
      if (!db.objectStoreNames.contains('mat_ref')) {
        db.createObjectStore('mat_ref', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('prim_ref')) {
        db.createObjectStore('prim_ref', { keyPath: 'id' });
      }
      // Observations maternelle. keyPath 'id' (uuid) ; `nkey` =
      // `${eleve_id}_${domaine_id}_${trimestre_id}` (retrouve/écrase une obs.).
      if (!db.objectStoreNames.contains('mat_obs')) {
        const s = db.createObjectStore('mat_obs', { keyPath: 'id' });
        s.createIndex('by_school',  'school_id');
        s.createIndex('by_student', 'eleve_id');
        s.createIndex('by_nkey',    'nkey', { unique: true });
      }
      // Notes primaire APC. keyPath 'id' (uuid) ; `nkey` =
      // `${eleve_id}_${competence_id}_${critere_id}_${trimestre_id}`.
      if (!db.objectStoreNames.contains('prim_notes')) {
        const s = db.createObjectStore('prim_notes', { keyPath: 'id' });
        s.createIndex('by_school',  'school_id');
        s.createIndex('by_student', 'eleve_id');
        s.createIndex('by_nkey',    'nkey', { unique: true });
      }

      // --- v14 (complexe scolaire) ---
      // Unités pédagogiques (maternelle/primaire/collège/lycée…) : chacune porte
      // sa propre identité (nom, logo, cachet, signature, directeur, adresse,
      // contacts, devise, couleurs). Schema aligné sur la table cloud school_units.
      if (!db.objectStoreNames.contains('school_units')) {
        const s = db.createObjectStore('school_units', { keyPath: 'id' });
        s.createIndex('by_school', 'school_id');
      }

      // --- v15 (socle P0) ---
      // Outbox durable des Domain Events (append-only). Rejoué + synchronisé.
      if (!db.objectStoreNames.contains('domain_events')) {
        const s = db.createObjectStore('domain_events', { keyPath: 'id' });
        s.createIndex('by_school', 'school_id');
        s.createIndex('by_agg', ['aggregate_type', 'aggregate_id']);
      }
      // Journal d'audit dérivé des events (alimenté par l'abonné « * »).
      if (!db.objectStoreNames.contains('audit_events')) {
        const s = db.createObjectStore('audit_events', { keyPath: 'id' });
        s.createIndex('by_school', 'school_id');
      }
      // Domaine transverse Signalement (PoC socle P0).
      if (!db.objectStoreNames.contains('signalements')) {
        const s = db.createObjectStore('signalements', { keyPath: 'id' });
        s.createIndex('by_school', 'school_id');
        s.createIndex('by_domain', 'domain');
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

async function idbGet(store, key) {
  const db = await getDbInstance();
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readonly').objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result ?? null);
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

// Ajoute plusieurs enregistrements en UNE seule transaction (rapide pour l'import).
async function idbAddMany(store, records) {
  if (!records.length) return true;
  const db = await getDbInstance();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    const os = tx.objectStore(store);
    records.forEach((r) => os.add(r));
    tx.oncomplete = () => resolve(true);
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
  get: (id) => idbGet('students', id),
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
  // Empile plusieurs ops en une transaction (repli offline de l'import).
  pushMany: (ops) => idbAddMany('syncQueue', ops.map((o) => ({ ...o, timestamp: Date.now() }))),
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

export const classFeeGridsDB = {
  getAll: () => idbGetAll('class_fee_grids'),
  getByClass: (classId) => idbGetByIndex('class_fee_grids', 'by_class', classId),
  put: (r) => idbPut('class_fee_grids', r),
  putMany: (rs) => idbPutMany('class_fee_grids', rs),
  delete: (id) => idbDelete('class_fee_grids', id),
};

export const trashDB = {
  getAll: () => idbGetAll('trash'),
  getByTable: (table) => idbGetByIndex('trash', 'by_table', table),
  push: (record) => idbAdd('trash', { ...record, deleted_at: record.deleted_at || Date.now() }),
  delete: (id) => idbDelete('trash', id),
};

export const auditDB = {
  getAll: () => idbGetAll('audit_log'),
  log: (entry) => idbAdd('audit_log', { ...entry, at: entry.at || Date.now() }),
  delete: (id) => idbDelete('audit_log', id),
};

export const academicPeriodsDB = {
  getAll: () => idbGetAll('academic_periods'),
  getBySchool: (schoolId) => idbGetByIndex('academic_periods', 'by_school', schoolId),
  put: (r) => idbPut('academic_periods', r),
  putMany: (rs) => idbPutMany('academic_periods', rs),
  delete: (id) => idbDelete('academic_periods', id),
};

export const staffDB = {
  getAll: () => idbGetAll('staff'),
  getByDepartment: (dep) => idbGetByIndex('staff', 'by_department', dep),
  put: (r) => idbPut('staff', r),
  putMany: (rs) => idbPutMany('staff', rs),
  delete: (id) => idbDelete('staff', id),
};

// --- Moteur APC ---
export const apcRefDB = {
  // Un seul blob de référentiel keyé 'referentiel'.
  get: () => idbGet('apc_ref', 'referentiel'),
  put: (record) => idbPut('apc_ref', { ...record, id: 'referentiel' }),
};

export const apcNotesDB = {
  getAll: () => idbGetAll('apc_notes'),
  getByStudent: (eleveId) => idbGetByIndex('apc_notes', 'by_student', eleveId),
  getByNkey: (nkey) => idbGetByIndex('apc_notes', 'by_nkey', nkey),
  put: (r) => idbPut('apc_notes', r),
  putMany: (rs) => idbPutMany('apc_notes', rs),
  delete: (id) => idbDelete('apc_notes', id),
};

export const apcBulletinsDB = {
  getAll: () => idbGetAll('apc_bulletins'),
  getByStudent: (eleveId) => idbGetByIndex('apc_bulletins', 'by_student', eleveId),
  put: (r) => idbPut('apc_bulletins', r),
  putMany: (rs) => idbPutMany('apc_bulletins', rs),
  delete: (id) => idbDelete('apc_bulletins', id),
};

// --- Moteur SECOND CYCLE MINESEC ---
export const scRefDB = {
  get: () => idbGet('sc_ref', 'referentiel'),
  put: (record) => idbPut('sc_ref', { ...record, id: 'referentiel' }),
};

// --- Moteurs FONDAMENTAL MINEDUB (maternelle + primaire APC) ---
export const matRefDB = {
  get: () => idbGet('mat_ref', 'referentiel'),
  put: (record) => idbPut('mat_ref', { ...record, id: 'referentiel' }),
};
export const matObsDB = {
  getAll: () => idbGetAll('mat_obs'),
  getByStudent: (eleveId) => idbGetByIndex('mat_obs', 'by_student', eleveId),
  getByNkey: (nkey) => idbGetByIndex('mat_obs', 'by_nkey', nkey),
  put: (r) => idbPut('mat_obs', r),
  putMany: (rs) => idbPutMany('mat_obs', rs),
  delete: (id) => idbDelete('mat_obs', id),
};
export const primRefDB = {
  get: () => idbGet('prim_ref', 'referentiel'),
  put: (record) => idbPut('prim_ref', { ...record, id: 'referentiel' }),
};
export const primNotesDB = {
  getAll: () => idbGetAll('prim_notes'),
  getByStudent: (eleveId) => idbGetByIndex('prim_notes', 'by_student', eleveId),
  getByNkey: (nkey) => idbGetByIndex('prim_notes', 'by_nkey', nkey),
  put: (r) => idbPut('prim_notes', r),
  putMany: (rs) => idbPutMany('prim_notes', rs),
  delete: (id) => idbDelete('prim_notes', id),
};

export const schoolUnitsDB = {
  getAll: () => idbGetAll('school_units'),
  getBySchool: (schoolId) => idbGetByIndex('school_units', 'by_school', schoolId),
  put: (r) => idbPut('school_units', r),
  putMany: (rs) => idbPutMany('school_units', rs),
  delete: (id) => idbDelete('school_units', id),
};

export const documentLogDB = {
  getBySchool: (schoolId) => idbGetByIndex('document_log', 'by_school', schoolId),
  // entry = { school_id, user_name, type, scope, count, status, detail }
  log: (entry) => idbAdd('document_log', { ...entry, at: entry.at || Date.now() }),
  delete: (id) => idbDelete('document_log', id),
};

// --- Socle P0 (offline-first) ---------------------------------------------
// Ces stores respectent le contrat de driver du kernel ; ils permettent au
// LocalDriver IndexedDB de faire tourner le même code métier hors-ligne.
export const domainEventsDB = {
  getAll: () => idbGetAll('domain_events'),
  getBySchool: (schoolId) => idbGetByIndex('domain_events', 'by_school', schoolId),
  append: (e) => idbPut('domain_events', e),   // append-only
};
export const auditEventsDB = {
  getBySchool: (schoolId) => idbGetByIndex('audit_events', 'by_school', schoolId),
  append: (e) => idbPut('audit_events', e),
};
export const signalementsDB = {
  getAll: () => idbGetAll('signalements'),
  get: (id) => idbGet('signalements', id),
  getBySchool: (schoolId) => idbGetByIndex('signalements', 'by_school', schoolId),
  put: (r) => idbPut('signalements', r),
  delete: (id) => idbDelete('signalements', id),
};
