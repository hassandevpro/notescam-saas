// Couche base de données — `node:sqlite` (DatabaseSync), intégré à Node 24+.
// AUCUN module natif à compiler : packaging .exe trivial. Synchrone par
// design : naturellement sérialisé, ce qui convient à une école.

import { DatabaseSync } from 'node:sqlite';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Emplacement des données : configurable pour l'installation packagée
// (C:\ProgramData\NotesCam). Par défaut, ./server/data en développement.
export const DATA_DIR = process.env.NOTESCAM_DATA_DIR || join(__dirname, 'data');
mkdirSync(DATA_DIR, { recursive: true });

export const DB_PATH = join(DATA_DIR, 'notescam.db');

export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');    // lecteurs concurrents + écriture sûre
db.exec('PRAGMA synchronous = FULL');    // durabilité sur COUPURE SECTEUR (poste LAN
                                         // rural sans onduleur) : une transaction validée
                                         // a bien atteint le disque → l'outbox transactionnel
                                         // du kernel ne peut pas être perdu après un commit.
db.exec('PRAGMA wal_autocheckpoint = 400'); // borne la taille du WAL (checkpoints réguliers)
db.exec('PRAGMA foreign_keys = ON');
db.exec('PRAGMA busy_timeout = 5000');  // attend si un autre process écrit

// Applique le schéma (idempotent : tout est IF NOT EXISTS)
const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

// --- Migrations légères -----------------------------------------------
// `CREATE TABLE IF NOT EXISTS` ne touche pas une table déjà créée : pour
// ajouter une colonne aux bases existantes, on fait un ALTER conditionnel
// (node:sqlite ne connaît pas « ADD COLUMN IF NOT EXISTS »).
function ensureColumn(table, column, ddl) {
  const has = db.prepare(`PRAGMA table_info(${quoteIdent(table)})`).all()
    .some((r) => r.name === column);
  if (!has) db.exec(`ALTER TABLE ${quoteIdent(table)} ADD COLUMN ${ddl}`);
}
ensureColumn('subjects', 'position', 'position INTEGER');   // ordre des matières sur le bulletin
ensureColumn('students', 'photo_url', 'photo_url TEXT');    // photo de l'élève
ensureColumn('students', 'statut_etablissement', 'statut_etablissement TEXT'); // nouveau/ancien dans l'établissement → frais d'inscription
// Frais flexibles : instantané des tranches + mode de paiement figé + ajustements
// (bourses/remises). Sur bases LAN déjà installées, ces colonnes manquaient et
// pickColumns avalait silencieusement les tranches (donnée perdue au rechargement).
ensureColumn('student_fees', 'tranches',     "tranches TEXT NOT NULL DEFAULT '[]'");
ensureColumn('student_fees', 'payment_mode', 'payment_mode TEXT');
ensureColumn('student_fees', 'adjustments',  "adjustments TEXT NOT NULL DEFAULT '[]'");
// Frais d'inscription par classe (facturés en plus aux nouveaux dans l'établissement).
ensureColumn('class_fee_grids', 'amount_inscription', 'amount_inscription INTEGER NOT NULL DEFAULT 0');
ensureColumn('timetable_slots', 'room', 'room TEXT');       // salle du cours (Vue Salle + conflits de salle)
// Affectation des enseignants (titulaire de classe + prof par matière). Absentes
// du 1er schéma LAN -> sans elles, pickColumns avalait teacher_id en silence et
// l'assignation « disparaissait » au rechargement. Voir aussi le garde-fou plus bas.
ensureColumn('classes',  'cycle',        'cycle TEXT');
ensureColumn('classes',  'teacher_id',   'teacher_id TEXT');
ensureColumn('classes',  'max_students', 'max_students INTEGER');
ensureColumn('classes',  'grade_max',    'grade_max INTEGER'); // barème de classe (/10, /20, /30…)
ensureColumn('classes',  'unit_id',      'unit_id TEXT');       // rattachement à une unité pédagogique (complexe scolaire)
// Moteur « officiel » (MINEDUB + MINESEC). Sans ces colonnes, la bascule du moteur
// et la série lycée étaient avalées par pickColumns en LAN : le choix « Officiel
// Cameroun » ne persistait pas et le bulletin ne basculait jamais (bug vécu).
ensureColumn('classes',  'serie',           'serie TEXT');           // série lycée (A, C, D…) — résolution second cycle
ensureColumn('classes',  'bulletin_engine', 'bulletin_engine TEXT'); // surcharge de moteur PAR CLASSE (null = hérite de l'école)
// En-tête officiel bilingue (Cameroun) ou mono-langue selon le choix de l'école.
ensureColumn('schools',  'bulletin_bilingual', 'bulletin_bilingual INTEGER'); // 1/0 (null = bilingue par défaut)
ensureColumn('schools',  'deployment_policy', 'deployment_policy TEXT');      // H1 : politique hybride par module (JSON ; null = comportement actuel)
// Périmètre du surveillant (Vie Scolaire) — miroir des colonnes cloud (arrays → JSON en LAN).
ensureColumn('school_users', 'scope_sections',  'scope_sections TEXT');
ensureColumn('school_users', 'scope_cycles',    'scope_cycles TEXT');
ensureColumn('school_users', 'scope_class_ids', 'scope_class_ids TEXT');
// Séquence (1-6) d'un retard/incident/sanction — alimente le rapport Discipline
// et, pour les sanctions, les compteurs de conduite du bulletin (auto-agrégation).
ensureColumn('late_arrivals',          'sequence_order', 'sequence_order INTEGER');
ensureColumn('disciplinary_incidents', 'sequence_order', 'sequence_order INTEGER');
ensureColumn('disciplinary_actions',   'sequence_order', 'sequence_order INTEGER');
// Conseil de classe (champs spéciaux `__…__`) : le schéma LAN d'origine ne gardait
// qu'abs_j/abs_nj/conduite → décision, tableau d'honneur, avertissements ET
// l'appréciation libre du travail de l'élève étaient avalés en LAN. On ajoute les
// colonnes pour que ces champs persistent hors-ligne comme dans le cloud.
ensureColumn('student_absences', 'th',             'th INTEGER');
ensureColumn('student_absences', 'encouragement',  'encouragement INTEGER');
ensureColumn('student_absences', 'felicitation',   'felicitation INTEGER');
ensureColumn('student_absences', 'aver_travail',   'aver_travail INTEGER NOT NULL DEFAULT 0');
ensureColumn('student_absences', 'blame_travail',  'blame_travail INTEGER NOT NULL DEFAULT 0');
ensureColumn('student_absences', 'exclusions',     'exclusions INTEGER NOT NULL DEFAULT 0');
ensureColumn('student_absences', 'aver_conduite',  'aver_conduite INTEGER NOT NULL DEFAULT 0');
ensureColumn('student_absences', 'blame_conduite', 'blame_conduite INTEGER NOT NULL DEFAULT 0');
ensureColumn('student_absences', 'decision',       'decision TEXT');
ensureColumn('student_absences', 'appreciation',   'appreciation TEXT'); // appréciation libre du travail de l'élève
ensureColumn('subjects', 'teacher_id',   'teacher_id TEXT');
// Matières composites (modèles académiques) — parent + méthode de calcul.
ensureColumn('subjects', 'parent_id',   'parent_id TEXT');
ensureColumn('subjects', 'calc_method', 'calc_method TEXT');
ensureColumn('subjects', 'formula',     'formula TEXT');
// Métadonnées du moteur officiel posées sur les matières auto-configurées
// (NULL = comportement classique inchangé). Sans elles, pickColumns avalerait
// le groupe/charge SC et les liens domaine/compétence au fondamental.
ensureColumn('subjects', 'sc_groupe',          'sc_groupe TEXT');        // 'g1' | 'g2' (bulletin lycée)
ensureColumn('subjects', 'sc_groupe_ordre',    'sc_groupe_ordre INTEGER');
ensureColumn('subjects', 'charge_horaire',     'charge_horaire NUMERIC');
ensureColumn('subjects', 'mat_domaine_id',     'mat_domaine_id TEXT');   // lien matière↔domaine maternelle
ensureColumn('subjects', 'prim_competence_id', 'prim_competence_id TEXT'); // lien matière↔compétence primaire
ensureColumn('schools',  'currency',     "currency TEXT NOT NULL DEFAULT 'XAF'"); // devise officielle (affichage multi-devises)
ensureColumn('schools',  'ge_grade_max', 'ge_grade_max INTEGER');  // barème GE (/10 ou /20) — lu par geGradeMax()
ensureColumn('schools',  'period_mode',  "period_mode TEXT DEFAULT 'auto'"); // pilotage des périodes : 'auto' | 'manual'
ensureColumn('schools',  'grade_entry_mode', "grade_entry_mode TEXT NOT NULL DEFAULT 'principal'"); // 'principal' | 'subject' (enseignant de matière)
ensureColumn('schools',  'bulletin_subject_mode', "bulletin_subject_mode TEXT NOT NULL DEFAULT 'synthetic'"); // 'synthetic' | 'detailed'
ensureColumn('schools',  'budget_validation', 'budget_validation INTEGER NOT NULL DEFAULT 0'); // workflows de validation budgétaire (0=off, comportement Budgets inchangé)
ensureColumn('schools',  'validation_rules',  'validation_rules TEXT'); // barème seuils->rôle validateur (JSON ; null = défaut moteur)
ensureColumn('signalements', 'assigned_department', 'assigned_department TEXT'); // affectation auto du module Reports (dérivée de la catégorie)
ensureColumn('fee_payments', 'student_fee_item_id', 'student_fee_item_id TEXT'); // lien paiement->frais précis (null = paiement global hérité)
// Traçabilité de la CAISSE : qui a encaissé. `recorded_by` (id du compte) était
// déjà écrit par l'app mais pickColumns l'avalait en LAN → l'info était perdue.
// `recorded_by_name` fige le NOM au moment de l'encaissement : un reçu réimprimé
// des années plus tard doit porter le caissier d'origine, même si le compte a été
// renommé ou supprimé.
ensureColumn('fee_payments', 'recorded_by',      'recorded_by TEXT');
ensureColumn('fee_payments', 'recorded_by_name', 'recorded_by_name TEXT');
// Contre-passation : annuler un versement = insérer une ligne négative qui
// pointe l'originale, jamais un DELETE (cf. guardFeePaymentImmutable).
ensureColumn('fee_payments', 'reversal_of', 'reversal_of TEXT');
ensureColumn('fee_payments', 'void_reason', 'void_reason TEXT');
// Numéro séquentiel du reçu : un trou dans la série = une recette escamotée.
ensureColumn('fee_payments', 'receipt_no', 'receipt_no INTEGER');
// Index créé ICI et non dans schema.sql : ce dernier s'exécute AVANT les
// ensureColumn, donc sur une base déjà installée l'index porterait sur une
// colonne inexistante et db.exec ferait échouer TOUT le démarrage du serveur.
db.exec('CREATE INDEX IF NOT EXISTS idx_fee_payments_receipt_no ON fee_payments(school_id, academic_year, receipt_no)');
// Traçabilité de l'INSCRIPTION : qui a enregistré l'élève (même principe).
ensureColumn('students', 'created_by',      'created_by TEXT');
ensureColumn('students', 'created_by_name', 'created_by_name TEXT');
// ARCHIVAGE : sortie d'un élève SANS suppression. Obligatoire dès qu'il porte
// une écriture de caisse — sinon la cascade FK emporterait ses versements.
ensureColumn('students', 'archived_at',      'archived_at TEXT');
ensureColumn('students', 'archived_by',      'archived_by TEXT');
ensureColumn('students', 'archived_by_name', 'archived_by_name TEXT');
ensureColumn('students', 'archive_reason',   'archive_reason TEXT');
ensureColumn('school_users', 'permissions', 'permissions TEXT'); // capacités granulaires d'un compte délégué (JSON ; null = accès par rôle)
// Attributions de gouvernance : fenêtre de validité + statut (Phase 1 rôles).
ensureColumn('user_governance_roles', 'start_date', 'start_date TEXT');
ensureColumn('user_governance_roles', 'end_date',   'end_date TEXT');
ensureColumn('user_governance_roles', 'status',     "status TEXT NOT NULL DEFAULT 'active'");

// Seed du CATALOGUE de rôles de gouvernance pour toute école qui n'en a pas
// encore (miroir de supabase_governance_catalog.sql). Best-effort, idempotent.
seedGovernanceCatalog();
ensureFinanceGrants();
// Patch IDEMPOTENT (écoles déjà seedées) : garantit que fondatrice/coordonnateur
// portent bien les capacités financières complètes (fusion sans doublon, aucun reset).
function ensureFinanceGrants() {
  const PERMS = ['governance.manage', 'governance.view', 'budget.view', 'budget.prepare', 'budget.submit',
    'expense.view', 'expense.prepare', 'expense.submit', 'budget.unlock.request', 'budget.reallocate.request', 'budget.annual.revise.request'];
  const WF = ['budget.validate.sector', 'budget.validate.finance', 'budget.approve', 'budget.close', 'budget.reopen',
    'expense.approve', 'expense.reject', 'expense.pay', 'budget.unlock.decide', 'budget.reallocate.decide', 'budget.annual.revise'];
  try {
    const rows = db.prepare("SELECT id, permissions, workflows FROM governance_roles WHERE code IN ('fondatrice','coordonnateur_general')").all();
    const upd = db.prepare('UPDATE governance_roles SET permissions = ?, workflows = ? WHERE id = ?');
    const merge = (json, add) => {
      let arr = []; try { arr = JSON.parse(json || '[]'); } catch { arr = []; }
      const set = new Set(Array.isArray(arr) ? arr : []);
      let changed = false;
      for (const p of add) if (!set.has(p)) { set.add(p); changed = true; }
      return { json: JSON.stringify([...set]), changed };
    };
    for (const r of rows) {
      const p = merge(r.permissions, PERMS);
      const w = merge(r.workflows, WF);
      if (p.changed || w.changed) upd.run(p.json, w.json, r.id);
    }
  } catch { /* best-effort */ }
}
function seedGovernanceCatalog() {
  const BUDGET_PAGES = ['/app/budgets', '/app/budget-global', '/app/depenses'];
  const DIRECTION = ['/app/groupe', '/app/reports', ...BUDGET_PAGES];
  const SECTOR_PERMS = ['budget.view', 'budget.prepare', 'budget.submit', 'expense.view', 'expense.prepare', 'expense.submit', 'budget.unlock.request'];
  // Capacités financières COMPLÈTES (fondatrice/coordonnateur = équivalent admin sur les finances).
  const FINANCE_PERMS = ['governance.manage', 'governance.view', 'budget.view', 'budget.prepare', 'budget.submit',
    'expense.view', 'expense.prepare', 'expense.submit', 'budget.unlock.request', 'budget.reallocate.request', 'budget.annual.revise.request'];
  const FINANCE_WORKFLOWS = ['budget.validate.sector', 'budget.validate.finance', 'budget.approve', 'budget.close', 'budget.reopen',
    'expense.approve', 'expense.reject', 'expense.pay', 'budget.unlock.decide', 'budget.reallocate.decide', 'budget.annual.revise'];
  const ROLES = [
    // Fondatrice & Coordonnateur : mêmes capacités FINANCIÈRES que l'admin (préparer/
    // soumettre + demandes déblocage/réallocation/révision) EN PLUS de la validation.
    ['fondatrice', 'Fondatrice', 'Autorité suprême du complexe', 100, 'complex', null,
      FINANCE_PERMS, DIRECTION, ['group', 'budget-global'], FINANCE_WORKFLOWS],
    ['coordonnateur_general', 'Coordonnateur Général', 'Direction générale du complexe', 90, 'complex', null,
      FINANCE_PERMS, DIRECTION, ['group', 'budget-global'], FINANCE_WORKFLOWS],
    ['raf', 'Responsable Administratif et Financier (RAF)', 'Gestion administrative et financière', 80, 'complex', null,
      ['governance.view', 'budget.view', 'budget.prepare', 'budget.submit', 'expense.view', 'budget.unlock.request'], DIRECTION, ['group', 'budget-global'],
      ['budget.validate.finance', 'budget.close', 'expense.approve', 'expense.reject', 'expense.pay']],
    ['principal', 'Principal', 'Chef du secteur collège', 60, 'sector', 'college', SECTOR_PERMS, BUDGET_PAGES, ['budget-global'], ['budget.validate.sector']],
    ['directrice_primaire', 'Directrice du primaire', 'Chef du secteur primaire', 60, 'sector', 'primaire', SECTOR_PERMS, BUDGET_PAGES, ['budget-global'], ['budget.validate.sector']],
    ['responsable_maternelle', 'Responsable de la maternelle', 'Chef du secteur maternelle', 60, 'sector', 'maternelle', SECTOR_PERMS, BUDGET_PAGES, ['budget-global'], ['budget.validate.sector']],
    ['vice_principal', 'Vice-principal', 'Adjoint du secteur collège', 50, 'sector', 'college', SECTOR_PERMS, BUDGET_PAGES, ['budget-global'], []],
    ['directrice_adjointe_primaire', 'Directrice adjointe du primaire', 'Adjointe du secteur primaire', 50, 'sector', 'primaire', SECTOR_PERMS, BUDGET_PAGES, ['budget-global'], []],
    ['caissier', 'Caissier', 'Exécute les décaissements', 30, 'complex', null, ['budget.view', 'expense.view'], ['/app/depenses'], [], ['expense.pay']],
  ];
  try {
    const schools = db.prepare('SELECT id FROM schools').all();
    const ins = db.prepare(`INSERT OR IGNORE INTO governance_roles
      (id, school_id, code, name, description, rank, scope, sector, permissions, pages, dashboards, workflows, active, is_system)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1,1)`);
    for (const s of schools) {
      if (db.prepare('SELECT 1 FROM governance_roles WHERE school_id = ? LIMIT 1').get(s.id)) continue;
      for (const r of ROLES) {
        ins.run(randomUUID(), s.id, r[0], r[1], r[2], r[3], r[4], r[5],
          JSON.stringify(r[6]), JSON.stringify(r[7]), JSON.stringify(r[8]), JSON.stringify(r[9]));
      }
    }
  } catch { /* seed best-effort */ }
}
ensureColumn('budget_chapters', 'level', 'level TEXT'); // hiérarchie budget : category|chapter|subchapter (null = déduit de la profondeur)
// Moteur de bulletin de l'établissement : 'classic' | 'officiel' (+ anciens drapeaux
// minesec/minedub/apc… rétro-compatibles). Absente du schéma LAN d'origine → le
// choix « Officiel Cameroun » n'était jamais persisté (avalé par pickColumns).
ensureColumn('schools',  'bulletin_engine', "bulletin_engine TEXT NOT NULL DEFAULT 'classic'");
ensureColumn('schools',  'apc_bulletin_cols', 'apc_bulletin_cols TEXT'); // colonnes du bulletin APC premier cycle (JSON)
ensureColumn('schools',  'establishment_no', 'establishment_no TEXT'); // N° officiel établissement (en-tête bulletin)
ensureColumn('schools',  'bulletin_font',    'bulletin_font TEXT');    // police choisie pour le bulletin
// Relevés de notes — signatures + noms des 2 autorités additionnelles (le chef
// d'établissement réutilise signature_url/stamp_url/director). Sans ces colonnes,
// pickColumns avalerait les champs en silence en LAN.
ensureColumn('schools',  'censeur_signature_url',     'censeur_signature_url TEXT');
ensureColumn('schools',  'censeur_name',              'censeur_name TEXT');
ensureColumn('schools',  'surveillant_signature_url', 'surveillant_signature_url TEXT');
ensureColumn('schools',  'surveillant_name',          'surveillant_name TEXT');
ensureColumn('users',    'cloud_user_id',    'cloud_user_id TEXT');    // pont d'identifiants cloud ↔ local (bases déjà installées)
// Champs « personnel » communs ajoutés aux enseignants : ils sont un sous-type
// du personnel (cf. table `staff`) et portent donc le même socle d'informations.
for (const [col, ddl] of [
  ['matricule', 'matricule TEXT'], ['gender', 'gender TEXT'], ['address', 'address TEXT'],
  ['photo_url', 'photo_url TEXT'], ['fonction', 'fonction TEXT'], ['hire_date', 'hire_date TEXT'],
  ['status', 'status TEXT'], ['documents', 'documents TEXT'],
]) ensureColumn('teachers', col, ddl);

// --- Historisation des affectations élèves (Partie 1) -----------------
// La table student_class_assignments (jadis simple journal) devient la SOURCE
// DE VÉRITÉ des affectations. Colonnes ajoutées (nullables) + identifiant de
// groupe stable + rattachement des données pédagogiques à l'affectation.
ensureColumn('student_class_assignments', 'school_unit_id', 'school_unit_id TEXT'); // établissement du groupe
ensureColumn('student_class_assignments', 'section',        'section TEXT');
ensureColumn('student_class_assignments', 'date_debut',     'date_debut TEXT');
ensureColumn('student_class_assignments', 'date_fin',       'date_fin TEXT');       // NULL = en cours
ensureColumn('student_class_assignments', 'type_transfert', 'type_transfert TEXT'); // initial|changement_*|reconstruit
ensureColumn('student_class_assignments', 'motif_cloture',  'motif_cloture TEXT');
ensureColumn('student_class_assignments', 'commentaire',    'commentaire TEXT');
ensureColumn('student_class_assignments', 'created_at',     'created_at TEXT');
ensureColumn('students', 'group_student_id', 'group_student_id TEXT'); // identité stable au niveau groupe
// Rattachement (nullable, sans FK dure — cohérent avec le reste du schéma LAN).
ensureColumn('grades',           'assignment_id', 'assignment_id TEXT');
ensureColumn('student_absences', 'assignment_id', 'assignment_id TEXT');
ensureColumn('student_fees',     'assignment_id', 'assignment_id TEXT');

// Backfill idempotent : miroir exact de supabase_student_assignments.sql, en
// SQLite (sous-requêtes corrélées pour rester portable). Rejouable à chaque
// démarrage sans doublon (COALESCE + garde NOT EXISTS sur l'affectation en cours).
try {
  db.exec(`
    -- 4. Identifiant de groupe (distinct par élève, randomblob appelé par ligne)
    UPDATE students SET group_student_id = lower(hex(randomblob(16)))
     WHERE group_student_id IS NULL;

    -- 5a. Enrichit les lignes existantes depuis leur classe + date_debut/type
    UPDATE student_class_assignments AS a SET
      class_name     = COALESCE(class_name,     (SELECT c.name    FROM classes c WHERE c.id = a.class_id)),
      section        = COALESCE(section,        (SELECT c.section FROM classes c WHERE c.id = a.class_id)),
      school_unit_id = COALESCE(school_unit_id, (SELECT c.unit_id FROM classes c WHERE c.id = a.class_id)),
      date_debut     = COALESCE(date_debut, assigned_at),
      type_transfert = COALESCE(type_transfert, 'reconstruit');

    -- 5b. Ferme les lignes ayant une ligne postérieure du même élève
    UPDATE student_class_assignments AS a
       SET date_fin = (SELECT MIN(b.assigned_at) FROM student_class_assignments b
                        WHERE b.student_id = a.student_id AND b.assigned_at > a.assigned_at)
     WHERE a.date_fin IS NULL
       AND EXISTS (SELECT 1 FROM student_class_assignments b
                    WHERE b.student_id = a.student_id AND b.assigned_at > a.assigned_at);

    -- 5c. Réconcilie la dernière ligne ouverte si sa classe ≠ source de vérité
    UPDATE student_class_assignments AS a
       SET date_fin = datetime('now')
     WHERE a.date_fin IS NULL
       AND a.class_id IS NOT (SELECT s.class_id FROM students s WHERE s.id = a.student_id);

    -- 5d. Crée l'affectation EN COURS pour tout élève qui n'en a pas
    INSERT INTO student_class_assignments (
      id, school_id, student_id, class_id, class_name, section, school_unit_id,
      date_debut, date_fin, type_transfert, reason, assigned_at, created_at
    )
    SELECT lower(hex(randomblob(16))), s.school_id, s.id, s.class_id,
           (SELECT c.name FROM classes c WHERE c.id = s.class_id),
           (SELECT c.section FROM classes c WHERE c.id = s.class_id),
           (SELECT c.unit_id FROM classes c WHERE c.id = s.class_id),
           COALESCE(s.created_at, datetime('now')), NULL, 'initial',
           'Migration : affectation initiale', datetime('now'), datetime('now')
      FROM students s
     WHERE NOT EXISTS (SELECT 1 FROM student_class_assignments a
                        WHERE a.student_id = s.id AND a.date_fin IS NULL);
  `);
} catch (e) {
  console.warn('[migration] affectations élèves (backfill) :', e.message);
}

// --- Seed du référentiel officiel (MINEDUB + MINESEC) -----------------
// Peuple les tables « référentiel » (cycles/classes/matières/compétences APC,
// séries/coef SC, domaines maternelle, compétences primaire) pour que le moteur
// « Officiel Cameroun » génère les matières et affiche les compétences EN LOCAL,
// sans cloud. Généré par scripts/build-officiel-seed.mjs, rejouable (ON CONFLICT).
try {
  const seed = readFileSync(join(__dirname, 'officiel-seed.sql'), 'utf8');
  db.exec(seed);
} catch (e) {
  console.warn('[seed] référentiel officiel non chargé :', e.message);
}

// --- Synchronisation continue LAN ↔ Cloud (Phase 2) -------------------
// Tables dont les changements sont répliqués vers/depuis le cloud. Chacune
// reçoit updated_at / version / device_id pour la résolution LWW + l'outbox.
export const SYNCED_TABLES = new Set([
  'schools', 'school_units', 'school_users', 'academic_periods', 'classes', 'subjects',
  'students', 'teachers', 'staff', 'grades', 'student_fees', 'fee_payments',
  'class_fee_grids',
  // Module Budgets (prévisionnel) — enveloppe + chapitres/sous-chapitres.
  'budgets', 'budget_chapters',
  // Module Dépenses — exécution budgétaire (rattachée à un budget).
  'budget_expenses',
  // Déblocage de lignes épuisées (demandes + décisions historisées).
  'budget_unlock_requests',
  // Réallocation entre enveloppes + révision du budget annuel (opérations tracées).
  'budget_reallocations', 'budget_revisions',
  // Modèle CIBLE v3 : périodes budgétaires dédiées + allocations par ligne (période/secteur)
  // + réallocation entre lignes (transfert de montant annuel, tracé).
  'budget_periods', 'budget_line_periods', 'budget_line_sectors', 'budget_line_reallocations',
  // Ressources Humaines (satellites du dossier staff ; pas de paie).
  'hr_contracts', 'hr_leaves', 'hr_evaluations', 'hr_attendance', 'hr_career_events',
  // Reports (Signalements) — commentaires + historique.
  'signalement_comments', 'signalement_history',
  // Notifications (moteur multi-canaux ; interne + file d'envoi externe prévue).
  'notifications', 'notification_outbox',
  // Immobilisations (patrimoine) — registre + pannes/réparations/dépenses.
  'assets', 'asset_breakdowns', 'asset_repairs', 'asset_expenses',
  // Catalogue de frais (obligatoires/optionnels) + liste par élève.
  'fee_catalog', 'student_fee_items',
  // Arrêté de caisse : le rapprochement espèces↔écritures doit se répliquer,
  // sinon un contrôle fait en LAN resterait invisible depuis le Cloud.
  'cash_sessions',
  // Gouvernance du complexe — catalogue de rôles + attribution + historique.
  'governance_roles', 'user_governance_roles', 'governance_role_history',
  'attendance', 'student_absences', 'student_class_assignments',
  // Vie scolaire (discipline / surveillant) — uniformité LAN↔Cloud des données élèves.
  'late_arrivals', 'disciplinary_incidents', 'disciplinary_actions',
  'student_warnings', 'student_detentions', 'parent_meetings', 'exit_permissions',
  'school_messages', 'teacher_notifications', 'sequence_dates', 'timetable_slots',
  // Notes du moteur officiel (compétences/observations). Synchro LAN↔LAN OK (même
  // seed = mêmes ids référentiel) ; la synchro LAN↔Cloud des notes reste un
  // chantier à part (les ids de compétences cloud diffèrent du seed local).
  'apc_notes', 'mat_observations', 'prim_notes',
  // Socle P0 — le domaine transverse Signalement suit le même sync LWW Phase 2.
  // (domain_events/audit_events sont append-only : réplication par curseur `seq`,
  //  chantier de sync-pull dédié — cf. docs/ARCHITECTURE_KERNEL.md.)
  'signalements',
]);
for (const t of SYNCED_TABLES) {
  ensureColumn(t, 'updated_at', 'updated_at TEXT');                  // horodatage du dernier changement (LWW)
  ensureColumn(t, 'version',    'version INTEGER NOT NULL DEFAULT 1'); // compteur monotone (départage)
  ensureColumn(t, 'device_id',  'device_id TEXT');                    // origine du changement (anti-écho + départage)
}
// H3-a : réplication du journal d'événements (log shipping par curseur seq).
// `replicated_from` marque un événement TIRÉ du cloud (anti-écho : jamais re-poussé).
// Un événement d'origine locale a la colonne NULL → seul lui est poussé. L'ordre de
// push local s'appuie sur le `rowid` natif (monotone : domain_events est append-only).
ensureColumn('domain_events', 'replicated_from', 'replicated_from TEXT');
// H4 : capacité « accès distant » (gouvernance financière via Internet), PAR COMPTE,
// ORTHOGONALE au rôle. Défaut 0 = AUCUN accès distant (sécurisé par défaut). Le LAN
// re-vérifie ce drapeau avant d'appliquer une décision distante (governanceApply).
ensureColumn('school_users', 'remote_access_allowed', 'remote_access_allowed INTEGER NOT NULL DEFAULT 0');

// Module Dépenses — annulation TRACÉE (statut terminal `cancelled`). Conservée en
// base ; jamais supprimée. Motif obligatoire côté UI + auteur + date.
ensureColumn('budget_expenses', 'cancel_reason', 'cancel_reason TEXT');
ensureColumn('budget_expenses', 'cancelled_by',  'cancelled_by TEXT');
ensureColumn('budget_expenses', 'cancelled_at',  'cancelled_at TEXT');

// Module Budgets — dates réelles d'exercice (Phase D) + mois de début d'année
// scolaire configurable par établissement (défaut septembre).
ensureColumn('budgets', 'start_date', 'start_date TEXT');
ensureColumn('budgets', 'end_date',   'end_date TEXT');
ensureColumn('schools', 'school_year_start_month', 'school_year_start_month INTEGER');

// Module Budgets — HIÉRARCHIE cible (annual → period → sector). Colonnes ajoutées
// aux bases existantes ; les CHECK de forme ne s'appliquent qu'aux bases fraîches/
// réinitialisées, mais les triggers `budgets_hier_guard_*` + index partiels (dans
// schema.sql, idempotents) s'appliquent PARTOUT. Voir supabase_budget_hierarchy_v2.sql.
ensureColumn('budgets', 'tier',               'tier TEXT');
ensureColumn('budgets', 'parent_budget_id',   'parent_budget_id TEXT REFERENCES budgets(id) ON DELETE CASCADE');
ensureColumn('budgets', 'academic_period_id', 'academic_period_id TEXT REFERENCES academic_periods(id) ON DELETE RESTRICT');
ensureColumn('budgets', 'school_unit_id',     'school_unit_id TEXT REFERENCES school_units(id) ON DELETE RESTRICT');
ensureColumn('budgets', 'envelope_amount',    'envelope_amount INTEGER');
ensureColumn('budgets', 'allocation_pct',     'allocation_pct REAL');
ensureColumn('budgets', 'sector_amount',      'sector_amount INTEGER');

// Index + triggers d'intégrité de la HIÉRARCHIE budgétaire — appliqués ICI (après
// l'ajout des colonnes ci-dessus) pour fonctionner aussi sur une base existante
// pré-hiérarchie. DDL idempotente extraite dans server/budget-hierarchy.sql
// (source unique, réutilisée par les tests). Miroir : supabase_budget_hierarchy_v2.sql.
db.exec(readFileSync(join(__dirname, 'budget-hierarchy.sql'), 'utf8'));

// Module Budgets — modèle CIBLE v3 (annuel → rubriques → LIGNES réparties par
// période/secteur). Colonnes ajoutées aux bases existantes + gardes d'intégrité
// (chevauchement de périodes, portée sectorielle, activation Σ=100 par ligne).
// Miroir Cloud : supabase_budget_lines_v3.sql.
ensureColumn('budget_chapters', 'scope',  'scope TEXT');                          // 'complex'|'sectors' (feuilles)
ensureColumn('budget_chapters', 'status', "status TEXT NOT NULL DEFAULT 'draft'"); // draft|active|closed (répartition de la ligne)
ensureColumn('budget_expenses', 'budget_period_id', 'budget_period_id TEXT REFERENCES budget_periods(id) ON DELETE RESTRICT'); // période imputée
ensureColumn('budget_expenses', 'school_unit_id',   'school_unit_id TEXT REFERENCES school_units(id) ON DELETE SET NULL');     // secteur imputé (NULL = Complexe/Global)
db.exec(readFileSync(join(__dirname, 'budget-lines.sql'), 'utf8'));

// Identifiant STABLE de cette installation (origine des changements locaux).
let _deviceId = null;
export function deviceId() {
  if (_deviceId) return _deviceId;
  const p = join(DATA_DIR, 'device-id.key');
  try {
    if (existsSync(p)) _deviceId = readFileSync(p, 'utf8').trim();
    else { _deviceId = randomUUID(); writeFileSync(p, _deviceId, { mode: 0o600 }); }
  } catch { _deviceId = 'device-unknown'; }
  return _deviceId;
}

// --- Introspection : colonnes réelles par table -------------------
// Sert à filtrer les payloads entrants -> on ignore toute clé inconnue
// au lieu de planter (robustesse face aux divergences cloud/LAN).
const _columnsCache = new Map();
export function tableColumns(table) {
  if (_columnsCache.has(table)) return _columnsCache.get(table);
  const rows = db.prepare(`PRAGMA table_info(${quoteIdent(table)})`).all();
  const cols = new Set(rows.map((r) => r.name));
  _columnsCache.set(table, cols);
  return cols;
}

// Liste blanche des tables exposées par l'API générique.
export const ALLOWED_TABLES = new Set([
  'schools', 'school_units', 'school_users', 'classes', 'subjects', 'students', 'grades',
  'teachers', 'staff', 'student_fees', 'fee_payments', 'class_fee_grids',
  'budgets', 'budget_chapters', 'budget_expenses', 'budget_unlock_requests',
  'budget_reallocations', 'budget_revisions',
  'budget_periods', 'budget_line_periods', 'budget_line_sectors', 'budget_line_reallocations',
  'governance_roles', 'user_governance_roles', 'governance_role_history',
  'hr_contracts', 'hr_leaves', 'hr_evaluations', 'hr_attendance', 'hr_career_events',
  'signalement_comments', 'signalement_history',
  'notifications', 'notification_outbox',
  'assets', 'asset_breakdowns', 'asset_repairs', 'asset_expenses',
  'fee_catalog', 'student_fee_items', 'cash_sessions',
  'attendance', 'student_absences',
  'student_class_assignments', 'school_messages', 'teacher_notifications',
  'sequence_dates', 'timetable_slots', 'country_education_config',
  'evaluation_system', 'superadmins', 'academic_periods',
  // Moteur officiel — référentiel (lecture) + notes (lecture/écriture) :
  'apc_referentiel_versions', 'apc_cycles', 'apc_classes', 'apc_trimestres',
  'apc_sequences', 'apc_matieres', 'apc_competences', 'apc_classe_matieres', 'apc_notes',
  'sc_referentiel_versions', 'sc_series', 'sc_groupes', 'sc_matieres', 'sc_serie_matieres',
  'mat_referentiel_versions', 'mat_niveaux', 'mat_domaines', 'mat_observations',
  'prim_referentiel_versions', 'prim_cycles', 'prim_niveaux', 'prim_competences',
  'prim_niveau_competences', 'prim_criteres', 'prim_cote_bareme', 'prim_notes',
  // Socle P0 — outbox d'events, journal d'audit, domaine transverse Signalement.
  'domain_events', 'audit_events', 'signalements',
  // Vie scolaire (surveillant/discipline) — absentes depuis la création du
  // module : toute écriture y échouait en LAN ("Table non autorisée"),
  // silencieusement avalée côté client (vieScolaireService catch+console.error).
  'late_arrivals', 'disciplinary_incidents', 'disciplinary_actions', 'student_warnings',
  'student_detentions', 'parent_meetings', 'exit_permissions', 'discipline_statistics',
]);

// Quote sûr d'un identifiant SQLite (table / colonne) : double les guillemets.
export function quoteIdent(name) {
  return '"' + String(name).replace(/"/g, '""') + '"';
}

// Filtre un objet pour ne garder que les colonnes existantes de la table.
// Ignorer une clé inconnue est volontaire (robustesse face aux divergences
// cloud/LAN), MAIS un silence total cache les vraies dérives de schéma : une
// colonne que le cloud possède et que le schéma LAN a oubliée est « sauvée »
// côté app puis perdue au rechargement (bug vécu sur classes.teacher_id).
// -> on JOURNALISE chaque colonne droppée, une seule fois par (table.colonne),
// pour que toute future divergence saute aux yeux dans les logs serveur.
const _droppedWarned = new Set();
export function pickColumns(table, obj) {
  const cols = tableColumns(table);
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) {
    if (cols.has(k)) out[k] = normalizeValue(v);
    else {
      const sig = `${table}.${k}`;
      if (!_droppedWarned.has(sig)) {
        _droppedWarned.add(sig);
        console.warn(`[schema] colonne inconnue ignorée: ${sig} — le schéma LAN a peut-être divergé du cloud (donnée non persistée).`);
      }
    }
  }
  return out;
}

// SQLite ne connaît ni booléen ni objet : on normalise.
export function normalizeValue(v) {
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v && typeof v === 'object') return JSON.stringify(v);
  if (v === undefined) return null;
  return v;
}

export function getSchool() {
  return db.prepare('SELECT * FROM schools LIMIT 1').get() || null;
}

// Transaction atomique (node:sqlite n'a pas l'API .transaction de better-sqlite3).
export function tx(fn) {
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch { /* déjà rollback */ }
    throw e;
  }
}
