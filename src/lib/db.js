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
// Bump à 17 : magasin `bareme_notes` (surcharge de barème par niveau).
// Bump à 18 : ce magasin est RETIRÉ — le barème est porté par la note elle-même
//             (`prim_notes.points_max`, `apc_notes.note_max`), pas par le niveau.
// Bump à 20 : magasin `syncQuarantine` — destination de toute écriture que la
//             file ne parvient pas à transmettre. Rien n'y expire : c'est ce
//             magasin qui remplace la suppression silencieuse par âge.
const DB_VERSION = 20;

// Magasins dont CE bundle a besoin. Sert uniquement au repli de retour arrière
// ci-dessous (`openExisting`) : il faut pouvoir dire si une base plus récente
// porte encore tout ce que cette version sait lire. À tenir à jour avec
// `onupgradeneeded` — un magasin oublié ici ne casse rien, il rend seulement le
// contrôle moins strict.
const REQUIRED_STORES = [
  'academic_periods', 'apc_bulletins', 'apc_notes', 'apc_ref', 'audit_events',
  'audit_log', 'bil_ref', 'class_fee_grids', 'classes', 'document_log',
  'domain_events', 'fee_payments', 'grades', 'mat_obs', 'mat_ref', 'prim_notes',
  'prim_ref', 'sc_ref', 'school_units', 'signalements', 'staff',
  'student_class_assignments', 'student_fees', 'students', 'subjects',
  'syncQuarantine', 'syncQueue', 'teachers', 'trash',
];

let _db = null;

// ── RETOUR ARRIÈRE : une base plus récente que le bundle ─────────────────────
//
// LE DÉFAUT QUE CECI CORRIGE. `indexedDB.open(nom, version)` ÉCHOUE — et ne se
// contente pas d'avertir — quand la base déjà présente porte une version
// SUPÉRIEURE à celle demandée. Le navigateur lève `VersionError`.
//
// C'est exactement ce que produit un retour arrière du déploiement. Le passage
// de la 18 à la 20 (magasin `syncQuarantine`, 15/10/2026) a fait monter toutes
// les bases locales à 20. Revenir à un bundle antérieur, par un rollback Vercel
// fait dans l'urgence, lui ferait demander la 18 : `initDB` rejetait, et plus
// AUCUNE page ne s'ouvrait — pour tous les utilisateurs déjà passés, y compris
// hors ligne. Le geste réflexe en cas d'incident était donc celui qui cassait
// tout, et il ne se serait vu qu'après coup.
//
// Une version supérieure n'ajoute presque jamais que des magasins : un bundle
// plus ancien y retrouve les siens et fonctionne. On réouvre donc SANS imposer
// de version — ce qui prend la base telle qu'elle est — et on ne refuse que si
// un magasin nécessaire manque réellement (cas d'une SUPPRESSION de magasin,
// comme `bareme_notes` retiré en v18). Le refus porte alors un message qui dit
// quoi faire, au lieu d'un `VersionError` nu.
//
// Aucune écriture, aucune migration, aucune donnée touchée : on se contente
// d'ouvrir ce qui existe.
function openExisting() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME);   // sans version : celle en place
    req.onsuccess = (e) => {
      const db = e.target.result;
      const manquants = REQUIRED_STORES.filter((s) => !db.objectStoreNames.contains(s));
      if (manquants.length) {
        db.close();
        reject(new Error(
          `Base locale en version ${db.version}, incompatible avec cette version de `
          + `l'application (prévue pour la ${DB_VERSION}) : il y manque ${manquants.join(', ')}. `
          + 'Revenez à une version plus récente de NotesCam — vos données locales sont intactes.',
        ));
        return;
      }
      console.warn(
        `[db] base locale en version ${db.version}, bundle prévu pour la ${DB_VERSION} — `
        + 'ouverture en l’état (retour arrière de déploiement). Tous les magasins requis sont présents.',
      );
      _db = db;
      resolve(db);
    };
    req.onerror = (e) => reject(e.target.error);
  });
}

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

      // --- v16 (historisation des affectations élèves) ---
      // Source de vérité des affectations : une ligne par période d'affectation
      // (date_fin=null = en cours). Schéma aligné sur la table cloud
      // student_class_assignments. Périmètre ÉCOLE (jamais filtré par année).
      if (!db.objectStoreNames.contains('student_class_assignments')) {
        const s = db.createObjectStore('student_class_assignments', { keyPath: 'id' });
        s.createIndex('by_school',  'school_id');
        s.createIndex('by_student', 'student_id');
      }

      // --- v18 (le barème vit sur la note) ---
      // `bareme_notes` portait une surcharge de barème PAR NIVEAU. Le barème est
      // désormais porté par la NOTE elle-même (`prim_notes.points_max`, pendant de
      // `apc_notes.note_max`) : l'Oral peut être noté /10 sur une unité
      // d'apprentissage et /20 sur la suivante, ce que la surcharge par niveau ne
      // savait pas exprimer. Le magasin est donc retiré.
      //
      // Il n'a existé qu'en v17, jamais déployée : rien à reprendre, et le `contains`
      // couvre les deux cas (base neuve qui ne l'a jamais eu, base en v17 qui l'a).
      if (db.objectStoreNames.contains('bareme_notes')) {
        db.deleteObjectStore('bareme_notes');
      }

      // --- v19 (Programme d'Éducation Bilingue Spécial, premier cycle) ---
      // Cache du référentiel de l'arrêté 239-23 (séries/domaines/matières/
      // serie_matieres). Un seul blob keyé 'referentiel', comme sc_ref. Magasin
      // DISTINCT de sc_ref : les deux arrêtés ont leur propre cycle de vie.
      if (!db.objectStoreNames.contains('bil_ref')) {
        db.createObjectStore('bil_ref', { keyPath: 'id' });
      }

      // --- v20 (QUARANTAINE : une écriture non transmise ne doit JAMAIS être
      //          détruite) ---
      // `syncQueue` perdait ses éléments de plus de 48 h, sans trace et AVANT
      // toute tentative d'envoi : des notes saisies vendredi soir hors ligne
      // disparaissaient à l'ouverture du lundi matin. Ce magasin est la
      // destination de tout ce que la file ne peut pas transmettre — il n'a
      // aucune expiration et rien ne le vide automatiquement.
      if (!db.objectStoreNames.contains('syncQuarantine')) {
        const s = db.createObjectStore('syncQuarantine', { keyPath: 'id', autoIncrement: true });
        s.createIndex('by_table', 'table');
        s.createIndex('by_reason', 'reason');
      }
    };

    req.onsuccess = (e) => {
      _db = e.target.result;
      resolve(_db);
    };

    // Base plus récente que ce bundle (retour arrière) : on réouvre en l'état
    // plutôt que d'échouer. Voir `openExisting` ci-dessus.
    req.onerror = (e) => {
      const err = e.target.error;
      if (err?.name === 'VersionError') { openExisting().then(resolve, reject); return; }
      reject(err);
    };
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

// Supprime plusieurs clés en UNE transaction. Utilisé par la réconciliation du
// cache (élagage des lignes absentes du jeu cloud autoritatif) — cf. schoolStore.
async function idbDeleteMany(store, keys) {
  if (!keys.length) return true;
  const db = await getDbInstance();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    const os = tx.objectStore(store);
    keys.forEach((k) => os.delete(k));
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
  deleteMany: (ids) => idbDeleteMany('classes', ids),
};

export const subjectsDB = {
  getAll: () => idbGetAll('subjects'),
  getByClass: (classId) => idbGetByIndex('subjects', 'by_class', classId),
  put: (r) => idbPut('subjects', r),
  putMany: (rs) => idbPutMany('subjects', rs),
  delete: (id) => idbDelete('subjects', id),
  deleteMany: (ids) => idbDeleteMany('subjects', ids),
};

export const studentsDB = {
  getAll: () => idbGetAll('students'),
  get: (id) => idbGet('students', id),
  getByClass: (classId) => idbGetByIndex('students', 'by_class', classId),
  put: (r) => idbPut('students', r),
  putMany: (rs) => idbPutMany('students', rs),
  delete: (id) => idbDelete('students', id),
  deleteMany: (ids) => idbDeleteMany('students', ids),
};

export const assignmentsDB = {
  getAll: () => idbGetAll('student_class_assignments'),
  getByStudent: (studentId) => idbGetByIndex('student_class_assignments', 'by_student', studentId),
  put: (r) => idbPut('student_class_assignments', r),
  putMany: (rs) => idbPutMany('student_class_assignments', rs),
  delete: (id) => idbDelete('student_class_assignments', id),
  deleteMany: (ids) => idbDeleteMany('student_class_assignments', ids),
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
  // `timestamp` est posé par défaut mais JAMAIS écrasé : un élément réinjecté
  // depuis la quarantaine doit garder sa date de SAISIE, pas celle de sa
  // réinjection — c'est cette date qui prouve quand l'enseignant a noté.
  push: (op) => idbAdd('syncQueue', { timestamp: Date.now(), ...op }),
  // Empile plusieurs ops en une transaction (repli offline de l'import).
  pushMany: (ops) => idbAddMany('syncQueue', ops.map((o) => ({ timestamp: Date.now(), ...o }))),
  delete: (id) => idbDelete('syncQueue', id),
  // Réécrit un élément EN PLACE (même `id`) : sert à mémoriser le nombre de
  // tentatives et la dernière erreur. Sans cette trace, « 48 h » était le seul
  // critère disponible pour décider du sort d'un élément — un critère qui ne dit
  // rien de la raison de l'échec.
  update: (item) => idbPut('syncQueue', item),
};

// QUARANTAINE — tout ce que la file ne peut pas transmettre.
//
// Aucune expiration, aucun vidage automatique : c'est la contrepartie de la
// suppression par âge qui faisait disparaître des notes. Un élément n'en sort
// que sur action explicite (réinjection dans la file, ou purge demandée après
// export). `movedAt` et `reason` servent au rapport remis à l'enseignant.
export const syncQuarantineDB = {
  getAll: () => idbGetAll('syncQuarantine'),
  push: (item) => idbAdd('syncQuarantine', { ...item, movedAt: Date.now() }),
  pushMany: (items) => idbAddMany('syncQuarantine', items.map((i) => ({ ...i, movedAt: Date.now() }))),
  delete: (id) => idbDelete('syncQuarantine', id),
  deleteMany: (ids) => idbDeleteMany('syncQuarantine', ids),
};

export const teachersDB = {
  getAll: () => idbGetAll('teachers'),
  put: (r) => idbPut('teachers', r),
  putMany: (rs) => idbPutMany('teachers', rs),
  delete: (id) => idbDelete('teachers', id),
  deleteMany: (ids) => idbDeleteMany('teachers', ids),
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
  deleteMany: (ids) => idbDeleteMany('staff', ids),
};

// --- Moteur APC ---
export const apcRefDB = {
  // UN BLOB PAR ÉCOLE. Il n'y en avait qu'un, keyé 'referentiel' : un responsable
  // membre de plusieurs écoles voyait donc le référentiel de la précédente —
  // matières maison comprises — tant que l'empreinte ne bougeait pas. Relevé le
  // 2026-10-22. La clé sans école reste lue en REPLI pour ne pas jeter le cache
  // des installations existantes au premier chargement.
  cle: (schoolId) => (schoolId ? `referentiel:${schoolId}` : 'referentiel'),
  get: (schoolId) => idbGet('apc_ref', apcRefDB.cle(schoolId)),
  put: (record, schoolId) => idbPut('apc_ref', { ...record, id: apcRefDB.cle(schoolId) }),
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

// --- Moteur PROGRAMME BILINGUE SPECIAL (premier cycle) ---
export const bilRefDB = {
  get: () => idbGet('bil_ref', 'referentiel'),
  put: (record) => idbPut('bil_ref', { ...record, id: 'referentiel' }),
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
  deleteMany: (ids) => idbDeleteMany('school_units', ids),
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
