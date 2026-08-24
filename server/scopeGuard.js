// server/scopeGuard.js
// Cloisonnement par SECTEUR (Collège / Primaire) côté serveur LAN.
//
// Miroir exact des prédicats SQL `user_scope_allows_class` / `_student`
// (supabase_sector_isolation.sql). Sans lui, un utilisateur sectoriel
// contournerait le cloisonnement en appelant directement /api/db — le filtrage
// du front (schoolStore) ne protège rien.
//
// Règle : le périmètre GLOBAL est EXPLICITE (school_users.scope_global). Il
// n'est jamais déduit du rôle. Un compte sans périmètre et non global ne voit
// aucune donnée pédagogique.
//
// Les tables NON listées ici (référentiels, paramètres d'école, budgets,
// gouvernance, RH…) ne portent pas de donnée d'élève et restent hors
// cloisonnement — le filtrage par école suffit.

import { db } from './db.js';

// Table -> colonne portant le rattachement.
//   kind 'class'   : la colonne est un id de classe (ou `id` pour classes)
//   kind 'student' : la colonne est un id d'élève, résolu vers sa classe
export const SCOPED_TABLES = {
  classes:                   { kind: 'class',   col: 'id' },
  students:                  { kind: 'class',   col: 'class_id' },
  subjects:                  { kind: 'class',   col: 'class_id' },
  grades:                    { kind: 'class',   col: 'class_id' },
  student_absences:          { kind: 'class',   col: 'class_id' },
  timetable_slots:           { kind: 'class',   col: 'class_id' },
  student_class_assignments: { kind: 'class',   col: 'class_id' },
  apc_notes:                 { kind: 'student', col: 'eleve_id' },
  prim_notes:                { kind: 'student', col: 'eleve_id' },
  mat_observations:          { kind: 'student', col: 'eleve_id' },
  // Finances : même règle unique. RAF / Caisse / Contrôle traversent les deux
  // secteurs parce que LEUR COMPTE est global, pas parce que la table serait
  // exemptée. Sinon un compte sectoriel lirait les frais des élèves de l'autre
  // secteur — donc leurs identifiants.
  student_fees:              { kind: 'student', col: 'student_id' },
  fee_payments:              { kind: 'student', col: 'student_id' },
};

// SQLite n'a pas de type tableau : les colonnes de périmètre stockent du JSON.
function toList(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string' && v.trim()) {
    try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; }
  }
  return [];
}

// Périmètre du compte, ou null s'il n'est membre d'aucune école active.
export function loadScope(userId) {
  if (!userId) return null;
  let row;
  try {
    row = db.prepare(
      `SELECT school_id, scope_sections, scope_cycles, scope_class_ids, scope_global
         FROM school_users WHERE user_id = ? AND active = 1 LIMIT 1`,
    ).get(userId);
  } catch {
    // Base antérieure à la migration (colonne absente) : on relit sans elle et
    // on retombe sur la règle historique « périmètre vide = tout l'établissement ».
    try {
      row = db.prepare(
        `SELECT school_id, scope_sections, scope_cycles, scope_class_ids
           FROM school_users WHERE user_id = ? AND active = 1 LIMIT 1`,
      ).get(userId);
      if (row) row.scope_global = null;
    } catch { return null; }
  }
  // AUCUNE ligne school_users : ce n'est pas un refus. Sur un serveur LAN, le
  // compte créé par /api/auth/signup (l'administrateur qui installe l'école)
  // n'a pas encore de rattachement — le bloquer rendrait l'installation
  // impossible. On retombe donc sur le comportement historique : pas de
  // cloisonnement sectoriel. Le cloisonnement ne s'applique qu'aux comptes
  // RATTACHÉS et porteurs d'un périmètre explicite.
  if (!row) return { schoolId: null, sections: [], cycles: [], classIds: [], global: true, unscoped: true };

  const sections = toList(row.scope_sections);
  const cycles   = toList(row.scope_cycles);
  const classIds = toList(row.scope_class_ids);
  const global = row.scope_global == null
    ? (!sections.length && !cycles.length && !classIds.length)  // base non migrée
    : (row.scope_global === 1 || row.scope_global === true);
  return { schoolId: row.school_id, sections, cycles, classIds, global };
}

export const isGlobal = (scope) => !scope || scope.global === true;

// La classe est-elle dans le périmètre ? Même arbre de décision que le SQL.
export function allowsClass(scope, classId) {
  if (!scope) return false;
  if (!classId) return scope.global;
  if (scope.global) {
    // GLOBAL borne quand même à SON école : un jeton ne doit jamais lire la
    // classe d'un autre établissement (cas d'un serveur hébergeant plusieurs
    // écoles, ou d'une base résiduelle). Défense en profondeur.
    try {
      return !!db.prepare('SELECT 1 FROM classes WHERE id = ? AND school_id = ?')
        .get(classId, scope.schoolId);
    } catch { return false; }
  }
  if (scope.classIds.includes(classId)) return true;

  let cls;
  try {
    // La classe DOIT appartenir à l'école du compte — sinon un cycle homonyme
    // ('secondaire' ailleurs) suffirait à faire passer une donnée étrangère.
    cls = db.prepare('SELECT cycle, section FROM classes WHERE id = ? AND school_id = ?')
      .get(classId, scope.schoolId);
  } catch { return false; }
  if (!cls) return false;

  if (cls.section && scope.sections.includes(cls.section)) return true;
  if (scope.cycles.length) {
    if (scope.cycles.includes(cls.cycle)) return true;
    if (['maternelle', 'primaire'].includes(cls.cycle) && scope.cycles.includes('fondamental')) return true;
    if (['maternelle', 'primaire'].includes(cls.section) && scope.cycles.includes('fondamental')) return true;
    if (['premier_cycle', 'second_cycle'].includes(cls.section) && scope.cycles.includes('secondaire')) return true;
  }
  return false;
}

export function allowsStudent(scope, studentId) {
  if (!scope) return false;
  if (!studentId) return scope.global;
  let st;
  try {
    st = db.prepare('SELECT class_id FROM students WHERE id = ? AND school_id = ?')
      .get(studentId, scope.schoolId);
  } catch { return false; }
  if (!st) return false;                       // élève d'une autre école
  return allowsClass(scope, st.class_id);
}

// Ids de classes visibles — sert à filtrer une lecture en une seule passe.
export function allowedClassIds(scope) {
  if (!scope || scope.global) return null;   // null = aucune restriction
  let rows = [];
  try { rows = db.prepare('SELECT id FROM classes WHERE school_id = ?').all(scope.schoolId); }
  catch { return []; }
  return rows.map((r) => r.id).filter((id) => allowsClass(scope, id));
}

// Une ligne déjà lue est-elle autorisée ?
export function rowAllowed(scope, table, row) {
  const rule = SCOPED_TABLES[table];
  if (!rule) return true;
  if (!scope) return false;
  if (scope.unscoped) return true;            // compte non rattaché : cf. loadScope
  // Étanchéité inter-écoles d'abord — vaut AUSSI pour un compte GLOBAL.
  if (row && row.school_id != null && row.school_id !== scope.schoolId) return false;
  const v = row?.[rule.col];
  return rule.kind === 'class' ? allowsClass(scope, v) : allowsStudent(scope, v);
}

// GARDE D'ÉCRITURE : refuse insert/upsert/update/delete hors périmètre.
// Lève une erreur -> runQuery la convertit en réponse d'erreur.
export function guardScopeWrite(op, ctx) {
  const rule = SCOPED_TABLES[op.table];
  if (!rule) return;
  if (!['insert', 'upsert', 'update', 'delete'].includes(op.action)) return;
  const scope = loadScope(ctx?.userId);
  if (isGlobal(scope)) return;

  // Valeurs écrites : la cible doit être dans le périmètre.
  const values = op.values == null ? [] : (Array.isArray(op.values) ? op.values : [op.values]);
  for (const v of values) {
    if (v && Object.prototype.hasOwnProperty.call(v, rule.col)) {
      const ok = rule.kind === 'class' ? allowsClass(scope, v[rule.col]) : allowsStudent(scope, v[rule.col]);
      if (!ok) throw new Error('Hors périmètre : cette donnée appartient à un autre secteur.');
    }
  }

  // Lignes VISÉES par un update/delete : aucune ne doit sortir du périmètre.
  if (['update', 'delete'].includes(op.action)) {
    const ids = matchedRowKeys(op, rule);
    for (const key of ids) {
      const ok = rule.kind === 'class' ? allowsClass(scope, key) : allowsStudent(scope, key);
      if (!ok) throw new Error('Hors périmètre : cette donnée appartient à un autre secteur.');
    }
  }
}

// Clés de rattachement des lignes que l'op va toucher (lecture préalable).
function matchedRowKeys(op, rule) {
  const eqs = (op.filters || []).filter((f) => f.op === 'eq' && f.col === 'id');
  try {
    if (eqs.length) {
      const row = db.prepare(`SELECT ${rule.col} AS k FROM ${op.table} WHERE id = ?`).get(eqs[0].val);
      return row ? [row.k] : [];
    }
    // Filtre non trivial : on relit toutes les lignes de la table concernée par
    // le filtre `id in (...)` s'il existe, sinon on refuse par prudence.
    const inIds = (op.filters || []).find((f) => f.op === 'in' && f.col === 'id');
    if (inIds && Array.isArray(inIds.val) && inIds.val.length) {
      const ph = inIds.val.map(() => '?').join(',');
      return db.prepare(`SELECT ${rule.col} AS k FROM ${op.table} WHERE id IN (${ph})`)
        .all(...inIds.val).map((r) => r.k);
    }
  } catch { /* table sans colonne id : on retombe sur le refus prudent */ }
  throw new Error('Hors périmètre : écriture de masse interdite à un compte sectoriel.');
}
