// Service local de corbeille + journal d'audit.
// 100% côté navigateur (IndexedDB) — survit à un mode hors-ligne complet.
//
// Pourquoi local et pas Supabase ? La corbeille doit fonctionner sans réseau,
// notamment dans les zones rurales ou avec une connexion intermittente. Les
// entrées peuvent être synchronisées plus tard via le syncQueue si nécessaire.

import { trashDB, auditDB } from './db';
import { useAuthStore } from '../store/authStore';

// Logge une action dans le journal d'audit. Silencieux si l'IDB échoue.
export async function logAction({ action, table, target_id, details = {} }) {
  try {
    const { user, fullName, school } = useAuthStore.getState();
    await auditDB.log({
      action,
      table,
      target_id,
      user_id:   user?.id  || null,
      user_name: fullName  || user?.email || 'Anonyme',
      school_id: school?.id || null,
      details,
      at: Date.now(),
    });
  } catch (err) {
    console.warn('audit log failed', err);
  }
}

// Place une ligne supprimée dans la corbeille avant suppression définitive.
// On stocke un instantané intégral pour pouvoir restaurer plus tard.
export async function moveToTrash({ table, payload }) {
  if (!payload) return;
  try {
    const { user, fullName, school } = useAuthStore.getState();
    await trashDB.push({
      table,
      original_id: payload.id || null,
      payload,
      school_id: school?.id || null,
      deleted_by: user?.id  || null,
      deleted_by_name: fullName || user?.email || 'Anonyme',
      deleted_at: Date.now(),
    });
    await logAction({
      action:    'delete',
      table,
      target_id: payload.id || null,
      details:   { name: payload.name || payload.matricule || null },
    });
  } catch (err) {
    console.warn('moveToTrash failed', err);
  }
}

export async function listTrash({ table, schoolId } = {}) {
  let items = await trashDB.getAll();
  if (schoolId) items = items.filter((i) => !i.school_id || i.school_id === schoolId);
  if (table)    items = items.filter((i) => i.table === table);
  return items.sort((a, b) => b.deleted_at - a.deleted_at);
}

export async function purgeTrashItem(id) {
  await trashDB.delete(id);
}

// Restaure un élément de la corbeille. Réinjecte le payload via le store
// adapté à la table — laisse le moteur de sync s'occuper de Supabase.
export async function restoreFromTrash(trashItem, store) {
  if (!trashItem || !store) return;
  const { table, payload, id } = trashItem;
  switch (table) {
    case 'classes':
      await store.addClass(payload); break;
    case 'subjects':
      await store.addSubject(payload); break;
    case 'students':
      await store.addStudent(payload); break;
    case 'teachers':
      await store.addTeacher?.(payload); break;
    default:
      console.warn('restoreFromTrash: unknown table', table);
      return;
  }
  await purgeTrashItem(id);
  await logAction({
    action: 'restore',
    table,
    target_id: payload?.id || null,
    details: { name: payload?.name || null },
  });
}

// Exporte toute la base IndexedDB locale en JSON pour sauvegarde manuelle.
export async function exportLocalBackup(schoolId) {
  const [
    { classesDB, subjectsDB, studentsDB, gradesDB, teachersDB, feesDB, feePaymentsDB },
  ] = await Promise.all([import('./db')]);
  const dump = {
    school_id: schoolId,
    exported_at: new Date().toISOString(),
    classes:       await classesDB.getAll(),
    subjects:      await subjectsDB.getAll(),
    students:      await studentsDB.getAll(),
    grades:        await gradesDB.getAll(),
    teachers:      await teachersDB.getAll(),
    student_fees:  await feesDB.getAll(),
    fee_payments:  await feePaymentsDB.getAll(),
    trash:         await trashDB.getAll(),
    audit_log:     await auditDB.getAll(),
  };
  return dump;
}

// Restaure une sauvegarde JSON exportée précédemment.
// Mode "merge" : ajoute/écrase par clé sans supprimer ce qui existe déjà.
export async function importLocalBackup(json) {
  if (!json || typeof json !== 'object') throw new Error('Sauvegarde invalide');
  const db = await import('./db');
  const map = {
    classes: db.classesDB, subjects: db.subjectsDB, students: db.studentsDB,
    grades: db.gradesDB, teachers: db.teachersDB,
    student_fees: db.feesDB, fee_payments: db.feePaymentsDB,
  };
  for (const [key, store] of Object.entries(map)) {
    if (Array.isArray(json[key]) && json[key].length) {
      await store.putMany(json[key]);
    }
  }
}

export async function listAudit({ schoolId, limit = 500 } = {}) {
  let items = await auditDB.getAll();
  if (schoolId) items = items.filter((i) => !i.school_id || i.school_id === schoolId);
  return items.sort((a, b) => b.at - a.at).slice(0, limit);
}

// Décrit une action dans la langue de l'utilisateur — utilisé par le journal.
export function describeAction(entry, lang = 'fr') {
  const map = {
    fr: {
      create:   'Création',
      update:   'Modification',
      delete:   'Suppression',
      restore:  'Restauration',
      print:    'Impression',
      login:    'Connexion',
      logout:   'Déconnexion',
      validate: 'Validation',
      publish:  'Publication',
    },
    en: {
      create: 'Created', update: 'Updated', delete: 'Deleted', restore: 'Restored',
      print: 'Printed', login: 'Login', logout: 'Logout', validate: 'Validated', publish: 'Published',
    },
    es: {
      create: 'Creación', update: 'Modificación', delete: 'Eliminación', restore: 'Restauración',
      print: 'Impresión', login: 'Conexión', logout: 'Desconexión', validate: 'Validación', publish: 'Publicación',
    },
  };
  return (map[lang] || map.fr)[entry.action] || entry.action;
}

export const TRASH_LABELS = {
  fr: {
    classes:  'Classe',
    subjects: 'Matière',
    students: 'Élève',
    teachers: 'Enseignant',
    grades:   'Notes',
  },
  en: {
    classes:  'Class',  subjects: 'Subject', students: 'Student',
    teachers: 'Teacher', grades:  'Grades',
  },
  es: {
    classes:  'Clase',  subjects: 'Asignatura', students: 'Alumno',
    teachers: 'Profesor', grades: 'Notas',
  },
};
