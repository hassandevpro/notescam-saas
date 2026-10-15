// Service local de corbeille + journal d'audit.
// 100% côté navigateur (IndexedDB) — survit à un mode hors-ligne complet.
//
// Pourquoi local et pas Supabase ? La corbeille doit fonctionner sans réseau,
// notamment dans les zones rurales ou avec une connexion intermittente. Les
// entrées peuvent être synchronisées plus tard via le syncQueue si nécessaire.

import { trashDB, auditDB, syncQueueDB, syncQuarantineDB } from './db';
import { useAuthStore } from '../store/authStore';
import { useUiStore } from '../store/uiStore';

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
// `related` (optionnel) : bundle des lignes dépendantes effacées en cascade par
// le backend (notes, frais, paiements…) — sans lui, la restauration rendrait un
// élève vide (cf. lib/studentBundle.js).
// Rend l'IDENTIFIANT de l'entrée créée dans la corbeille, pour que l'appelant
// puisse la reprendre s'il apprend APRÈS coup que la suppression n'a pas eu lieu
// (cas de l'élève porteur d'écritures de caisse : le serveur refuse, l'app bascule
// sur l'archivage — et la corbeille ne doit pas garder une entrée « supprimé »
// pour un élève qui existe toujours ; la restaurer créerait un doublon).
// Rend `null` si rien n'a été déposé.
export async function moveToTrash({ table, payload, related = null }) {
  if (!payload) return null;
  try {
    const { user, fullName, school } = useAuthStore.getState();
    const trashId = await trashDB.push({
      table,
      original_id: payload.id || null,
      payload,
      related,
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
    return trashId ?? null;
  } catch (err) {
    console.warn('moveToTrash failed', err);
    return null;
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

// Annule toute opération `delete` encore en file de sync pour cette ligne.
// Sans cela, la suppression précédente (mise en file car elle avait échoué côté
// cloud) serait rejouée au prochain flush et re-supprimerait l'élément restauré.
//
// C'est le SEUL endroit, hors du moteur de synchronisation, qui retire une
// opération de la file — et l'opération retirée est une suppression que
// l'utilisateur vient lui-même de révoquer en restaurant la ligne. Aucune
// donnée saisie n'est donc perdue. L'intention annulée est tout de même copiée
// en quarantaine : une suppression révoquée est une décision, et le registre
// des écritures non transmises doit pouvoir en rendre compte.
async function cancelQueuedDelete(table, rowId) {
  if (!table || !rowId) return;
  try {
    const queue = await syncQueueDB.getAll();
    let removed = 0;
    for (const op of queue) {
      if (op.table === table && op.operation === 'delete' && op.payload?.id === rowId) {
        const { id, ...rest } = op;
        try {
          await syncQuarantineDB.push({ ...rest, queue_id: id, reason: 'annule_par_restauration' });
        } catch { /* la trace est best-effort, l'annulation ne doit pas échouer */ }
        await syncQueueDB.delete(op.id);
        removed++;
      }
    }
    if (removed) {
      const remaining = await syncQueueDB.getAll();
      useUiStore.getState().setPendingCount(remaining.length);
    }
  } catch (err) {
    console.warn('cancelQueuedDelete failed', err);
  }
}

// Restaure un élément de la corbeille. Réinjecte le payload via le store
// adapté à la table — laisse le moteur de sync s'occuper de Supabase.
export async function restoreFromTrash(trashItem, store) {
  if (!trashItem || !store) return;
  const { table, payload, related, id } = trashItem;
  // On purge d'abord la suppression en attente, pour qu'elle ne reparte pas
  // au prochain flush et n'efface pas la ligne que l'on vient de recréer.
  await cancelQueuedDelete(table, payload?.id);
  switch (table) {
    case 'classes':
      // Avec bundle : restauration intégrale (classe + matières + élèves + notes +
      // frais + paiements effacés en cascade), SANS auto-config des matières.
      // Sans bundle (anciennes entrées) : simple recréation de la classe.
      if (related) await store.restoreClassBundle?.(payload, related);
      else         await store.addClass(payload);
      break;
    case 'subjects':
      await store.addSubject(payload);
      // Réinjecte les notes de la matière effacées en cascade.
      if (related) await store.restoreSubjectBundle?.(payload.id, related);
      break;
    case 'students':
      await store.addStudent(payload);
      // Réinjecte notes / absences / frais / paiements effacés en cascade lors de
      // la suppression — sinon l'élève reviendrait sans aucune de ses données.
      if (related) await store.restoreStudentBundle?.(payload.id, related);
      break;
    case 'teachers':
      await store.addTeacher?.(payload); break;
    case 'staff':
      await store.addStaff?.(payload); break;
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

// ── `exportLocalBackup` / `importLocalBackup` ONT ÉTÉ RETIRÉES ─────────────
//
// Elles alimentaient l'onglet « Audit & Sauvegardes → Exporter une sauvegarde
// complète », qui annonçait « toutes vos données locales » et énumérait NEUF
// magasins IndexedDB, écrits à la main, sur les VINGT-NEUF que la base compte.
// Ne partaient jamais, entre autres : `apc_notes` (toutes les notes du premier
// cycle), `prim_notes` (tout le primaire APC), `mat_obs`, `staff`,
// `class_fee_grids`, `academic_periods`, `school_units`, `signalements`. Une
// école qui exportait, reformatait son poste et restaurait retrouvait ses élèves
// — sans une seule note, sans personnel. Et l'import était asymétrique : la
// fonction d'export écrivait `trash` et `audit_log`, celle d'import ne les
// relisait pas, sa table de correspondance ne les contenant pas.
//
// La sauvegarde vit désormais dans Paramètres → Sauvegarde & restauration
// (`src/lib/backupCore.js`, `backupEngine.js`, `backupService.js`,
// `server/backup.js`, `supabase_backup_restore.sql`, cf. docs/BACKUP_RESTORE.md).
// Elle ne tient AUCUNE liste de tables : à chaque export, les tables sont
// découvertes dans le schéma réel — toute table portant `school_id` en fait
// partie, en cloud comme en LAN. Un module ajouté demain y entre d'office.
//
// Ne pas les réintroduire ici : deux systèmes de sauvegarde aux couvertures
// différentes, c'est la garantie qu'une école restaurera un jour le mauvais.

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
    staff:    'Personnel',
    grades:   'Notes',
  },
  en: {
    classes:  'Class',  subjects: 'Subject', students: 'Student',
    teachers: 'Teacher', staff: 'Staff', grades:  'Grades',
  },
  es: {
    classes:  'Clase',  subjects: 'Asignatura', students: 'Alumno',
    teachers: 'Profesor', staff: 'Personal', grades: 'Notas',
  },
};
