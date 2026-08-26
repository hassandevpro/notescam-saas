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

import { db, ensureStrictRoleMatrix } from './db.js';

// Table -> colonne portant le rattachement.
//   kind 'class'        : la colonne est un id de classe (ou `id` pour classes)
//   kind 'student'      : la colonne est un id d'élève, résolu vers sa classe
//   kind 'fee_student'  : idem, mais TRAVERSÉ par le service financier (Phase 3)
//   kind 'fee_class'    : idem par classe (grille tarifaire)
//   kind 'teacher'      : la colonne est un id d'enseignant, secteur DÉRIVÉ
//   kind 'staff_sector' : la colonne EST le secteur, déclaré (peut être NULL)
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

  // ── Vie scolaire (Phase 3) ────────────────────────────────────────────────
  // Ces tables portent un élève mais n'étaient gardées par rien : un surveillant
  // du Collège lisait les retards, incidents, sanctions et convocations du
  // Primaire. Rattachement par ÉLÈVE et non par classe, car `class_id` y est
  // nullable — un élève ayant changé de classe laisserait sinon une ligne
  // orpheline hors cloisonnement.
  attendance:                { kind: 'student', col: 'student_id' },
  late_arrivals:             { kind: 'student', col: 'student_id' },
  student_warnings:          { kind: 'student', col: 'student_id' },
  student_detentions:        { kind: 'student', col: 'student_id' },
  disciplinary_incidents:    { kind: 'student', col: 'student_id' },
  disciplinary_actions:      { kind: 'student', col: 'student_id' },
  exit_permissions:          { kind: 'student', col: 'student_id' },
  parent_meetings:           { kind: 'student', col: 'student_id' },

  // ── Argent (Phase 3) ──────────────────────────────────────────────────────
  // Le service financier TRAVERSE les deux secteurs sur l'argent — par son RÔLE
  // (fees.manage / fees.view), plus par `scope_global` qui lui ouvrait aussi
  // toute la pédagogie. Pour tout autre compte, la règle sectorielle s'applique :
  // sans elle, un compte Collège lirait les frais des élèves du Primaire, donc
  // leurs identités.
  student_fees:              { kind: 'fee_student', col: 'student_id' },
  fee_payments:              { kind: 'fee_student', col: 'student_id' },
  student_fee_items:         { kind: 'fee_student', col: 'student_id' },
  class_fee_grids:           { kind: 'fee_class',   col: 'class_id' },

  // ── Personnel (Phase 3) ───────────────────────────────────────────────────
  teachers:                  { kind: 'teacher',      col: 'id' },
  staff:                     { kind: 'staff_sector', col: 'sector' },
};

// SQLite n'a pas de type tableau : les colonnes de périmètre stockent du JSON.
function toList(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string' && v.trim()) {
    try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; }
  }
  return [];
}

// Écoles déjà passées par la pose de la matrice dans ce processus (cf. loadScope).
const _matrixSeen = new Set();

// Périmètre du compte, ou null s'il n'est membre d'aucune école active.
export function loadScope(userId) {
  if (!userId) return null;
  let row;
  try {
    row = db.prepare(
      `SELECT school_id, role, permissions, scope_sections, scope_cycles, scope_class_ids, scope_global
         FROM school_users WHERE user_id = ? AND active = 1 LIMIT 1`,
    ).get(userId);
  } catch {
    // Base antérieure à la migration (colonne absente) : on relit sans elle et
    // on retombe sur la règle historique « périmètre vide = tout l'établissement ».
    try {
      row = db.prepare(
        `SELECT school_id, role, scope_sections, scope_cycles, scope_class_ids
           FROM school_users WHERE user_id = ? AND active = 1 LIMIT 1`,
      ).get(userId);
      if (row) { row.scope_global = null; row.permissions = null; }
    } catch { return null; }
  }
  // AUCUNE ligne school_users : ce n'est pas un refus. Sur un serveur LAN, le
  // compte créé par /api/auth/signup (l'administrateur qui installe l'école)
  // n'a pas encore de rattachement — le bloquer rendrait l'installation
  // impossible. On retombe donc sur le comportement historique : pas de
  // cloisonnement sectoriel. Le cloisonnement ne s'applique qu'aux comptes
  // RATTACHÉS et porteurs d'un périmètre explicite.
  if (!row) return { schoolId: null, sections: [], cycles: [], classIds: [], global: true, unscoped: true };

  // On pose sur le catalogue de l'école les clés d'autorité de la matrice — si et
  // seulement si elle est durcie. Le drapeau n'arrive pas forcément au démarrage
  // du serveur : il peut descendre du cloud par la synchronisation, ou apparaître
  // au montage d'une sauvegarde restaurée. Sans ce rattrapage, une école durcie
  // entre ces deux moments aurait un catalogue sans `fees.manage` — donc plus de
  // caisse du tout, le durcissement fermant le guichet au lieu de le protéger.
  //
  // On ne cesse de repasser que lorsque la pose ne trouve PLUS RIEN à écrire.
  // Mémoïser sur la tentative serait faux : `runBatch` enveloppe tout le lot dans
  // une transaction, et l'échec d'une opération ultérieure annulerait la pose —
  // on aurait alors une école marquée « traitée » dont le catalogue est resté nu,
  // jusqu'au prochain redémarrage. Le coût d'un repassage est de quelques SELECT
  // sur index, et il s'arrête dès la première requête qui aboutit.
  if (row.school_id && !_matrixSeen.has(row.school_id)) {
    try {
      if (ensureStrictRoleMatrix(row.school_id) === 0) _matrixSeen.add(row.school_id);
    } catch { /* jamais bloquant */ }
  }

  const sections = toList(row.scope_sections);
  const cycles   = toList(row.scope_cycles);
  const classIds = toList(row.scope_class_ids);
  const global = row.scope_global == null
    ? (!sections.length && !cycles.length && !classIds.length)  // base non migrée
    : (row.scope_global === 1 || row.scope_global === true);
  return {
    userId, schoolId: row.school_id, sections, cycles, classIds, global,
    role: row.role || null,
    // Capacités déléguées (tableau JSON de routes) — sert à `canManageStaff`.
    pages: toList(row.permissions),
  };
}

// ── PHASE 3 : autorité par RÔLE, secteurs, personnel ────────────────────────
// Miroir de supabase_genius_role_permissions.sql. Même règle de confinement :
// tout ce qui suit est INERTE tant que `schools.strict_role_enforcement` vaut 0,
// donc pour toute école autre que celle qu'on a explicitement durcie.

// L'école applique-t-elle les permissions strictes ? Colonne éventuellement
// absente (base LAN antérieure) → false, c'est-à-dire le comportement historique.
//
export function strictRoles(schoolId) {
  if (!schoolId) return false;
  try {
    const r = db.prepare('SELECT strict_role_enforcement AS f FROM schools WHERE id = ?').get(schoolId);
    return r?.f === 1 || r?.f === true;
  } catch { return false; }
}

// Permissions apportées par les RÔLES DE GOUVERNANCE du compte : union de
// `permissions` et `workflows` du catalogue de l'école. En LAN, ces colonnes
// sont du TEXT contenant du JSON (SQLite n'a pas de type tableau).
export function govPerms(scope) {
  if (!scope?.userId || !scope.schoolId) return [];
  if (scope._gov) return scope._gov;                    // mémoïsé : appelé par ligne
  let rows = [];
  try {
    rows = db.prepare(
      `SELECT gr.permissions AS p, gr.workflows AS w
         FROM user_governance_roles ugr
         JOIN governance_roles gr
           ON gr.school_id = ugr.school_id AND gr.code = ugr.role AND gr.active = 1
        WHERE ugr.school_id = ? AND ugr.user_id = ?`,
    ).all(scope.schoolId, scope.userId);
  } catch { rows = []; }
  const out = new Set();
  for (const r of rows) { for (const x of toList(r.p)) out.add(x); for (const x of toList(r.w)) out.add(x); }
  scope._gov = [...out];
  return scope._gov;
}

const hasGovPerm = (scope, perm) => govPerms(scope).includes(perm);
const isAdmin    = (scope) => scope?.role === 'admin';

// Autorité d'ÉCRITURE financière — transverse aux deux secteurs.
export function isFinanceOfficer(scope) {
  return isAdmin(scope) || hasGovPerm(scope, 'fees.manage');
}

// Autorité de LECTURE financière transverse. Le Contrôleur s'arrête ici :
// `fees.view` ne donne aucun droit d'écriture (décision de l'établissement).
export function isFinanceReader(scope) {
  return isFinanceOfficer(scope) || hasGovPerm(scope, 'fees.view');
}

// ── Vocabulaire de secteur ──────────────────────────────────────────────────
// Le dépôt manipule quatre vocabulaires (classes.cycle, classes.section,
// scope_cycles, secteur de gouvernance). Ceci est le SEUL point de traduction du
// serveur LAN, miroir exact de `public.class_sector`.
export function classSector(classId, schoolId) {
  if (!classId) return null;
  let cls;
  try {
    cls = db.prepare('SELECT cycle, section FROM classes WHERE id = ? AND school_id = ?')
      .get(classId, schoolId);
  } catch { return null; }
  if (!cls) return null;
  if (['premier_cycle', 'second_cycle'].includes(cls.section)) return 'college';
  if (cls.cycle === 'secondaire') return 'college';
  if (cls.section === 'primaire'   || cls.cycle === 'primaire')   return 'primaire';
  if (cls.section === 'maternelle' || cls.cycle === 'maternelle') return 'maternelle';
  return null;
}

// Secteurs réellement couverts par le périmètre du compte. Dérivés en rejouant
// `allowsClass` sur les classes de l'école : le résultat ne peut donc pas
// diverger du cloisonnement de la Phase 2, et aucune règle n'est réécrite.
export function userSectors(scope) {
  if (!scope?.schoolId) return [];
  if (scope._sectors) return scope._sectors;
  let rows = [];
  try { rows = db.prepare('SELECT id FROM classes WHERE school_id = ?').all(scope.schoolId); }
  catch { rows = []; }
  const out = new Set();
  for (const r of rows) {
    if (!allowsClass(scope, r.id)) continue;
    const s = classSector(r.id, scope.schoolId);
    if (s) out.add(s);
  }
  scope._sectors = [...out];
  return scope._sectors;
}

// Secteurs d'un ENSEIGNANT — DÉRIVÉS de ses classes et de ses matières.
// Décision de l'établissement : aucune saisie supplémentaire sur la fiche.
export function teacherSectors(schoolId, teacherId) {
  if (!teacherId || !schoolId) return [];
  let rows = [];
  try {
    rows = db.prepare(
      `SELECT DISTINCT c.id AS id FROM classes c
        WHERE c.school_id = ?
          AND (c.teacher_id = ?
               OR EXISTS (SELECT 1 FROM subjects s WHERE s.class_id = c.id AND s.teacher_id = ?))`,
    ).all(schoolId, teacherId, teacherId);
  } catch { rows = []; }
  const out = new Set();
  for (const r of rows) { const s = classSector(r.id, schoolId); if (s) out.add(s); }
  return [...out];
}

// Un ENSEIGNANT est-il dans le périmètre du compte ?
export function allowsTeacher(scope, teacherId) {
  if (!scope) return false;
  if (!strictRoles(scope.schoolId)) return true;      // autres écoles : inchangé
  if (!teacherId) return true;
  if (scope.global || isAdmin(scope)) return true;

  // FICHE INEXISTANTE : rien à protéger. C'est le cas d'une CRÉATION, où l'id
  // écrit ne désigne encore aucune ligne. Sans cette sortie, la garde d'écriture
  // refuserait toute création d'enseignant depuis que « secteur indéterminé »
  // n'ouvre plus l'accès. Le DROIT de créer reste vérifié par canManageTeacher,
  // et le SECTEUR imposé par applyPersonnelSector.
  try {
    const existe = db.prepare('SELECT 1 FROM teachers WHERE id = ? AND school_id = ?')
      .get(teacherId, scope.schoolId);
    if (!existe) return true;
  } catch { /* table absente : on continue */ }

  // Un enseignant voit TOUJOURS sa propre fiche (profil, photo, mot de passe).
  try {
    const own = db.prepare('SELECT 1 FROM teachers WHERE id = ? AND school_id = ? AND auth_user_id = ?')
      .get(teacherId, scope.schoolId, scope.userId);
    if (own) return true;
  } catch { /* colonne absente : on continue */ }

  // RH TRANSVERSE : même exception que pour le personnel administratif
  // (`allowsStaff`). L'autorité sur TOUT le personnel ne se laisse pas borner par
  // le périmètre PÉDAGOGIQUE du compte — le RAF est sectoriel côté classes et
  // transverse côté personnel. L'oubli de cette ligne pour le corps enseignant
  // était une incohérence de la Phase 3 : le RAF gérait les agents des deux
  // secteurs mais pas leurs enseignants. Trouvée par le test 36.
  if (hasGovPerm(scope, 'staff.manage.all')) return true;

  // ORDRE DE RÉSOLUTION — le déclaré prime, la dérivation n'est qu'un repli.
  //   1. secteur DÉCLARÉ sur la fiche  → il fait foi, seul ;
  //   2. sinon, secteur DÉRIVÉ de ses classes et matières ;
  //   3. sinon, SECTEUR NON DÉFINI    → aucun périmètre sectoriel ne l'atteint.
  //
  // Le 3 a changé le 26/08/2026. Il rendait l'enseignant visible de TOUS, pour
  // qu'il reste affectable ; mais cela revenait à ce qu'oublier le champ ouvre la
  // fiche à tout le monde. La correction reste possible : l'administrateur et
  // l'autorité RH transverse sont déjà sortis plus haut, et c'est à eux
  // qu'incombe l'affectation.
  const declared = teacherDeclaredSector(scope.schoolId, teacherId);
  const mine = userSectors(scope);
  if (declared) return mine.includes(declared);

  const sectors = teacherSectors(scope.schoolId, teacherId);
  if (!sectors.length) return false;
  return sectors.some((s) => mine.includes(s));
}

// Un membre du PERSONNEL est-il dans le périmètre du compte ?
// `sector` NULL = agent transverse (comptabilité, gardiennage…) : visible de tous,
// ce qui est le comportement d'aujourd'hui — donc zéro régression sur les fiches
// déjà saisies, qui sont toutes à NULL après migration.
export function allowsStaff(scope, sector) {
  if (!scope) return false;
  if (!strictRoles(scope.schoolId)) return true;
  if (scope.global || isAdmin(scope)) return true;
  // RH TRANSVERSE : l'autorité sur tout le personnel ne se laisse pas borner par
  // le périmètre PÉDAGOGIQUE du compte. Le RAF est sectoriel côté classes et
  // transverse côté personnel — exactement comme il l'est côté argent.
  if (hasGovPerm(scope, 'staff.manage.all')) return true;
  // SECTEUR NON DÉFINI. NULL n'est PAS un secteur — et surtout pas « transverse ».
  // Il rendait la fiche visible de tous, ce qui vidait le cloisonnement de son
  // sens : il suffisait d'oublier le champ pour que tout le monde voie la fiche.
  // Décision du 26/08/2026 : une fiche non affectée n'appartient à personne, donc
  // à aucun périmètre sectoriel. Elle reste accessible à qui peut la CORRIGER —
  // l'administrateur et l'autorité RH transverse, tous deux déjà sortis plus haut.
  if (sector == null || sector === '') return false;
  return userSectors(scope).includes(sector);
}

// Secteur DÉCLARÉ d'un enseignant, ou null. Lu à part pour que `allowsTeacher` et
// la garde d'écriture interrogent la même source — deux lectures divergentes
// finiraient par répondre différemment à la même question.
export function teacherDeclaredSector(schoolId, teacherId) {
  if (!teacherId || !schoolId) return null;
  try {
    const r = db.prepare('SELECT sector FROM teachers WHERE id = ? AND school_id = ?')
      .get(teacherId, schoolId);
    const v = r?.sector;
    return v == null || v === '' ? null : v;
  } catch { return null; }   // colonne absente (base pas encore migrée) : repli sur la dérivation
}

// Le compte peut-il ÉCRIRE la fiche d'un ENSEIGNANT ?
//
// L'autorité est la même que pour le personnel administratif — un chef de
// secteur gère les gens de son secteur, qu'ils enseignent ou non. Le PÉRIMÈTRE,
// lui, reste celui d'`allowsTeacher` : le secteur d'un enseignant est DÉRIVÉ de
// ses classes et de ses matières, jamais déclaré. Principal → Collège seulement,
// Directrice du Primaire → Fondamental seulement.
//
// Miroir de la policy permissive « personnel: écriture par autorité RH » du
// cloud, bornée par la restrictive « secteur: cloisonnement » déjà en place.
export function canManageTeacher(scope, teacherId) {
  if (!scope) return false;
  if (!strictRoles(scope.schoolId)) return true;        // autres écoles : inchangé
  if (isAdmin(scope)) return true;

  // Un enseignant modifie TOUJOURS sa propre fiche (profil, photo, mot de passe).
  // Sans cette exception, le durcissement lui retirerait son propre profil —
  // c'est la policy « teacher: update own profile » du cloud.
  if (teacherId) {
    try {
      const own = db.prepare('SELECT 1 FROM teachers WHERE id = ? AND school_id = ? AND auth_user_id = ?')
        .get(teacherId, scope.schoolId, scope.userId);
      if (own) return true;
    } catch { /* colonne absente : on continue */ }
  }

  if (hasGovPerm(scope, 'staff.manage.all')) return true;   // RH transverse
  const bounded = hasGovPerm(scope, 'staff.manage.sector')
    || scope.pages.includes('/app/teachers');
  if (!bounded) return false;
  // Le secteur est vérifié par `allowsTeacher`, appelé juste après par la garde
  // d'écriture. Un seul endroit décide du périmètre, ici on ne décide que du DROIT.
  return true;
}

// Le compte peut-il ÉCRIRE la fiche d'un membre du personnel de ce secteur ?
// « La directrice du primaire et son adjointe gèrent leur personnel, tout comme
//   le principal du collège et son adjoint gèrent le leur. »
export function canManageStaff(scope, sector) {
  if (!scope) return false;
  if (!strictRoles(scope.schoolId)) return true;
  if (isAdmin(scope)) return true;
  if (hasGovPerm(scope, 'staff.manage.all')) return true;   // RH transverse
  const bounded = hasGovPerm(scope, 'staff.manage.sector')
    || scope.pages.includes('/app/personnel');
  if (!bounded) return false;
  if (sector == null || sector === '') return true;         // agent transverse
  return userSectors(scope).includes(sector);
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

// Dispatcher unique : une valeur de rattachement est-elle dans le périmètre ?
// Un seul endroit décide, pour que lecture et écriture ne puissent pas diverger.
function allowsValue(scope, rule, v) {
  switch (rule.kind) {
    case 'class':        return allowsClass(scope, v);
    case 'student':      return allowsStudent(scope, v);
    // Argent : le service financier traverse les deux secteurs, mais UNIQUEMENT
    // sur l'argent — sa pédagogie reste sectorielle (c'est la séparation demandée).
    case 'fee_student':  return allowsStudent(scope, v)
                             || (strictRoles(scope.schoolId) && isFinanceReader(scope));
    case 'fee_class':    return allowsClass(scope, v)
                             || (strictRoles(scope.schoolId) && isFinanceReader(scope));
    case 'teacher':      return allowsTeacher(scope, v);
    case 'staff_sector': return allowsStaff(scope, v);
    default:             return false;
  }
}

// Une ligne déjà lue est-elle autorisée ?
export function rowAllowed(scope, table, row) {
  const rule = SCOPED_TABLES[table];
  if (!rule) return true;
  if (!scope) return false;
  if (scope.unscoped) return true;            // compte non rattaché : cf. loadScope
  // Étanchéité inter-écoles d'abord — vaut AUSSI pour un compte GLOBAL.
  if (row && row.school_id != null && row.school_id !== scope.schoolId) return false;
  return allowsValue(scope, rule, row?.[rule.col]);
}

// ── SECTEUR DU PERSONNEL À L'ÉCRITURE ───────────────────────────────────────
// Le frontend ne décide JAMAIS du secteur d'une fiche de personnel. Il le
// propose ; c'est ici qu'on tranche. Trois règles, posées le 26/08/2026 :
//
//   CRÉATION par un responsable d'UN SEUL secteur  → le serveur IMPOSE le sien.
//   CRÉATION par un responsable de PLUSIEURS       → il choisit, parmi les siens.
//   CRÉATION par l'administrateur (ou l'autorité RH transverse) → il choisit,
//                                                    mais le choix est OBLIGATOIRE.
//
//   MODIFICATION du secteur                        → administrateur uniquement.
//
// La dernière est la plus importante : sans elle, un responsable sectoriel
// déplacerait n'importe qui dans son périmètre d'un simple update, et le
// cloisonnement de lecture ne vaudrait plus rien.
//
// Cette fonction ÉCRIT dans `op.values` — c'est délibéré et c'est le seul endroit
// qui le fait : imposer une valeur après coup, ailleurs, rouvrirait la porte que
// l'on ferme ici.
export const PERSONNEL_SECTORS = ['maternelle', 'primaire', 'college'];
const PERSONNEL_TABLES = new Set(['teachers', 'staff']);

export function applyPersonnelSector(op, scope) {
  if (!PERSONNEL_TABLES.has(op.table)) return;
  if (!scope || scope.unscoped) return;
  if (!strictRoles(scope.schoolId)) return;      // écoles non durcies : inchangé

  const values = op.values == null ? [] : (Array.isArray(op.values) ? op.values : [op.values]);
  if (!values.length) return;

  // Autorité transverse : choisit librement, mais ne peut pas laisser le champ vide.
  const libre = isAdmin(scope) || hasGovPerm(scope, 'staff.manage.all');
  const mine = libre ? PERSONNEL_SECTORS : userSectors(scope);

  const existe = (id) => {
    if (!id) return false;
    try { return !!db.prepare(`SELECT 1 FROM "${op.table}" WHERE id = ? AND school_id = ?`).get(id, scope.schoolId); }
    catch { return false; }
  };

  for (const v of values) {
    if (!v || typeof v !== 'object') continue;
    // Un upsert qui vise une ligne EXISTANTE est une modification, pas une
    // création : lui appliquer l'imposition permettrait de s'approprier une fiche.
    const modification = op.action === 'update' || (op.action === 'upsert' && existe(v.id));

    if (modification) {
      if (!Object.prototype.hasOwnProperty.call(v, 'sector')) continue;   // le secteur n'est pas touché
      if (!isAdmin(scope)) {
        throw new Error('Le secteur de rattachement ne peut être modifié que par un administrateur.');
      }
      if (v.sector != null && v.sector !== '' && !PERSONNEL_SECTORS.includes(v.sector)) {
        throw new Error(`Secteur invalide : ${v.sector}.`);
      }
      continue;
    }

    // CRÉATION.
    if (!libre && mine.length === 1) { v.sector = mine[0]; continue; }     // imposé, quoi qu'ait envoyé le client
    if (!libre && mine.length === 0) {
      throw new Error('Votre périmètre ne couvre aucun secteur : création de personnel impossible.');
    }
    const choisi = v.sector == null || v.sector === '' ? null : v.sector;
    if (!choisi) {
      throw new Error('Secteur de rattachement obligatoire : maternelle, primaire ou secondaire.');
    }
    if (!PERSONNEL_SECTORS.includes(choisi)) throw new Error(`Secteur invalide : ${choisi}.`);
    if (!mine.includes(choisi)) {
      throw new Error('Hors périmètre : vous ne pouvez rattacher cette personne qu’à vos propres secteurs.');
    }
    v.sector = choisi;
  }
}

// GARDE D'ÉCRITURE : refuse insert/upsert/update/delete hors périmètre.
// Lève une erreur -> runQuery la convertit en réponse d'erreur.
// Tables d'ARGENT : leur écriture exige l'autorité financière, pas seulement le
// périmètre. Miroir de `is_school_cashier` → `is_finance_officer` côté Postgres.
const MONEY_TABLES = new Set(['student_fees', 'fee_payments', 'student_fee_items', 'class_fee_grids']);

export function guardScopeWrite(op, ctx) {
  const rule = SCOPED_TABLES[op.table];
  if (!rule) return;
  if (!['insert', 'upsert', 'update', 'delete'].includes(op.action)) return;
  const scope = loadScope(ctx?.userId);
  if (scope?.unscoped) return;                 // compte non rattaché : cf. loadScope

  // ── Autorité par RÔLE — vérifiée AVANT le périmètre ────────────────────────
  // Un compte GLOBAL n'est pas pour autant financier : sans ce contrôle placé
  // avant le court-circuit `isGlobal`, il suffirait d'un périmètre global pour
  // encaisser. C'est précisément l'écart que la Phase 3 ferme.
  if (strictRoles(scope?.schoolId)) {
    // Secteur du personnel : imposé ou validé AVANT tout contrôle de périmètre —
    // sinon une création par un responsable sectoriel serait refusée pour un champ
    // que le serveur s'apprêtait justement à remplir lui-même.
    applyPersonnelSector(op, scope);
    if (MONEY_TABLES.has(op.table) && !isFinanceOfficer(scope)) {
      throw new Error('Gestion des frais réservée au service financier (caisse, RAF, contrôle).');
    }
    // Les ENSEIGNANTS : même autorité que le personnel administratif. Sans ce
    // contrôle, n'importe quel membre de l'école pouvait écrire dans `teachers`
    // côté LAN — le cloud, lui, le réservait déjà aux administrateurs. C'est
    // aussi ce qui ouvre la gestion du corps enseignant aux chefs de secteur,
    // bornée à LEUR secteur par `allowsTeacher` un peu plus bas.
    if (op.table === 'teachers') {
      const refus = 'Gestion du corps enseignant réservée à la direction du secteur.';
      if (['insert', 'upsert'].includes(op.action)) {
        // CRÉER un enseignant exige l'autorité, sans exception possible : la
        // dispense « sa propre fiche » ne s'applique qu'à une fiche existante.
        if (!canManageTeacher(scope, null)) throw new Error(refus);
      } else {
        // Sur un update/delete, les valeurs écrites ne portent PAS l'id — c'est
        // la ligne VISÉE qu'il faut interroger, sinon on refuserait à un
        // enseignant la modification de sa propre fiche (bug trouvé par le test).
        for (const key of matchedRowKeys(op, rule)) {
          if (!canManageTeacher(scope, key)) throw new Error(refus);
        }
      }
    }
    // Le personnel : autorité TRANSVERSE (admin, RH) d'abord — sinon un
    // administrateur se ferait refuser une écriture de masse par la lecture
    // préalable de `matchedRowKeys`, qui refuse par prudence.
    if (op.table === 'staff' && !isAdmin(scope) && !hasGovPerm(scope, 'staff.manage.all')) {
      const values = op.values == null ? [] : (Array.isArray(op.values) ? op.values : [op.values]);
      for (const v of values) {
        if (!canManageStaff(scope, v?.sector ?? null)) {
          throw new Error('Hors périmètre : ce personnel relève d’un autre secteur.');
        }
      }
      if (['update', 'delete'].includes(op.action)) {
        for (const key of matchedRowKeys(op, rule)) {
          if (!canManageStaff(scope, key)) {
            throw new Error('Hors périmètre : ce personnel relève d’un autre secteur.');
          }
        }
      }
    }
  }

  if (isGlobal(scope)) return;

  // Valeurs écrites : la cible doit être dans le périmètre.
  const values = op.values == null ? [] : (Array.isArray(op.values) ? op.values : [op.values]);
  for (const v of values) {
    if (v && Object.prototype.hasOwnProperty.call(v, rule.col)) {
      if (!allowsValue(scope, rule, v[rule.col])) {
        throw new Error('Hors périmètre : cette donnée appartient à un autre secteur.');
      }
    }
  }

  // Lignes VISÉES par un update/delete : aucune ne doit sortir du périmètre.
  if (['update', 'delete'].includes(op.action)) {
    const ids = matchedRowKeys(op, rule);
    for (const key of ids) {
      if (!allowsValue(scope, rule, key)) {
        throw new Error('Hors périmètre : cette donnée appartient à un autre secteur.');
      }
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
