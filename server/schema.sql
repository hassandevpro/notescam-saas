-- ============================================================
-- NotesCam — Édition LAN (hors-ligne) : schéma SQLite consolidé
--
-- Traduction des 40 fichiers supabase_*.sql Postgres vers SQLite :
--   uuid        -> TEXT  (UUID générés par crypto.randomUUID() côté Node)
--   timestamptz -> TEXT  (ISO-8601)
--   date / time -> TEXT
--   jsonb       -> TEXT  (JSON sérialisé)
--   boolean     -> INTEGER (0 / 1)
--   numeric     -> REAL
--
-- Différences clés avec le cloud :
--   * Pas de RLS  -> l'isolation est imposée par le serveur (authz.js)
--   * Pas de auth.users -> table `users` locale (mot de passe haché scrypt)
--   * Pas de SECURITY DEFINER -> les RPC sont des fonctions Node (rpc.js)
--
-- Mono-établissement : une installation = une école. La colonne school_id
-- est conservée (compat logique métier) mais vaut une constante.
-- ============================================================

PRAGMA foreign_keys = ON;

-- --- Auth locale (remplace auth.users de Supabase) -----------
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,            -- scrypt : salt:hash (hex)
  full_name     TEXT,
  email_confirmed_at TEXT,
  cloud_user_id TEXT,                     -- UID auth.users côté cloud (pont d'identifiants)
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- --- Établissement -------------------------------------------
CREATE TABLE IF NOT EXISTS schools (
  id                 TEXT PRIMARY KEY,
  name               TEXT NOT NULL,
  type               TEXT,
  region             TEXT,
  division           TEXT,
  subdivision        TEXT,
  address            TEXT,
  phone              TEXT,
  director           TEXT,
  email              TEXT,
  current_year       TEXT,
  language           TEXT DEFAULT 'fr',
  country_system     TEXT,                -- 'cameroon_fr' | 'cameroon_en' | 'guinea_eq'
  ge_primary_coef    INTEGER NOT NULL DEFAULT 0,
  grade_scale        TEXT,
  logo_url           TEXT,
  stamp_url          TEXT,
  signature_url      TEXT,
  plan               TEXT NOT NULL DEFAULT 'starter',
  price_per_student  REAL NOT NULL DEFAULT 0,
  license_status     TEXT DEFAULT 'trial',
  license_expires_at TEXT,
  created_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

-- --- Lien utilisateur <-> école + rôle -----------------------
CREATE TABLE IF NOT EXISTS school_users (
  id         TEXT PRIMARY KEY,
  school_id  TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN ('admin','teacher','censeur','surveillant')),
  full_name  TEXT,
  class_id   TEXT,
  active     INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(school_id, user_id)
);

CREATE TABLE IF NOT EXISTS superadmins (
  user_id    TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- --- Classes / matières / élèves -----------------------------
CREATE TABLE IF NOT EXISTS classes (
  id           TEXT PRIMARY KEY,
  school_id    TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  level        TEXT,
  section      TEXT,
  system       TEXT NOT NULL DEFAULT 'FR',
  cycle        TEXT,
  current_year TEXT,
  -- Enseignant titulaire. Pas de FK dure : la sync hors-ligne peut envoyer la
  -- classe avant l'enseignant -> on garde l'id même si la ligne teacher n'est
  -- pas (encore) là, au lieu de rejeter tout l'upsert (FK ON globalement).
  teacher_id   TEXT,
  max_students INTEGER,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS subjects (
  id         TEXT PRIMARY KEY,
  school_id  TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_id   TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  coef       INTEGER NOT NULL DEFAULT 1,
  max        INTEGER NOT NULL DEFAULT 20,
  position   INTEGER,
  teacher_id TEXT,                  -- enseignant de la matière (pas de FK dure, cf. classes)
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS students (
  id             TEXT PRIMARY KEY,
  school_id      TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_id       TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  matricule      TEXT,
  gender         TEXT,
  statut         TEXT,
  date_naissance TEXT,
  parent_token   TEXT,
  photo_url      TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS grades (
  id         TEXT PRIMARY KEY,
  school_id  TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_id   TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  sequence   INTEGER NOT NULL,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(class_id, student_id, subject_id, sequence)
);

-- --- Enseignants ---------------------------------------------
CREATE TABLE IF NOT EXISTS teachers (
  id           TEXT PRIMARY KEY,
  school_id    TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  email        TEXT,
  phone        TEXT,
  specialty    TEXT,
  auth_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  active       INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- --- Personnel (tous départements) ---------------------------
-- Registre unique du personnel : enseignants, administration, surveillance,
-- santé, comptabilité, support. Les ENSEIGNANTS gardent EN PLUS leur profil
-- pédagogique dans `teachers` (matières/classes/titulaire, comptes app) — ils
-- sont un sous-type du personnel. `documents` = JSON [{ name, url }].
CREATE TABLE IF NOT EXISTS staff (
  id            TEXT PRIMARY KEY,
  school_id     TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  matricule     TEXT,
  first_name    TEXT,
  last_name     TEXT,
  name          TEXT NOT NULL,
  gender        TEXT,
  phone         TEXT,
  email         TEXT,
  address       TEXT,
  photo_url     TEXT,
  fonction      TEXT,
  department    TEXT NOT NULL DEFAULT 'administration',
  hire_date     TEXT,
  status        TEXT,
  documents     TEXT,
  auth_user_id  TEXT REFERENCES users(id) ON DELETE SET NULL,
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- --- Frais de scolarité --------------------------------------
CREATE TABLE IF NOT EXISTS student_fees (
  id                    TEXT PRIMARY KEY,
  school_id             TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id            TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  academic_year         TEXT NOT NULL,
  frais_annuels         INTEGER NOT NULL DEFAULT 0,
  frais_payes           INTEGER NOT NULL DEFAULT 0,
  date_dernier_paiement TEXT,
  notes                 TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(student_id, academic_year)
);

CREATE TABLE IF NOT EXISTS fee_payments (
  id            TEXT PRIMARY KEY,
  school_id     TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id    TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  academic_year TEXT,
  amount        INTEGER NOT NULL DEFAULT 0,
  date          TEXT,
  note          TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- --- Assiduité / absences ------------------------------------
CREATE TABLE IF NOT EXISTS attendance (
  id          TEXT PRIMARY KEY,
  school_id   TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id  TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  class_id    TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  subject_id  TEXT REFERENCES subjects(id) ON DELETE SET NULL,
  year_label  TEXT NOT NULL,
  date        TEXT NOT NULL,
  session     TEXT,
  status      TEXT NOT NULL DEFAULT 'absent' CHECK (status IN ('absent','retard','excused')),
  motif       TEXT,
  recorded_by TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS student_absences (
  id         TEXT PRIMARY KEY,
  school_id  TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_id   TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  sequence   INTEGER NOT NULL,
  abs_j      INTEGER NOT NULL DEFAULT 0,
  abs_nj     INTEGER NOT NULL DEFAULT 0,
  conduite   TEXT,
  UNIQUE(student_id, sequence)
);

CREATE TABLE IF NOT EXISTS student_class_assignments (
  id               TEXT PRIMARY KEY,
  school_id        TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id       TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  class_id         TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  class_name       TEXT,
  assigned_by      TEXT,
  assigned_by_name TEXT,
  reason           TEXT,
  assigned_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- --- Messagerie / notifications ------------------------------
CREATE TABLE IF NOT EXISTS school_messages (
  id            TEXT PRIMARY KEY,
  school_id     TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  sender_name   TEXT NOT NULL,
  sender_role   TEXT NOT NULL DEFAULT 'admin',
  to_teacher_id TEXT NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  subject       TEXT,
  body          TEXT NOT NULL,
  read          INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS teacher_notifications (
  id           TEXT PRIMARY KEY,
  school_id    TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  type         TEXT NOT NULL DEFAULT 'grades_saved',
  teacher_name TEXT NOT NULL,
  teacher_id   TEXT REFERENCES teachers(id) ON DELETE SET NULL,
  class_name   TEXT,
  class_id     TEXT REFERENCES classes(id) ON DELETE SET NULL,
  sequence     INTEGER,
  nb_entries   INTEGER NOT NULL DEFAULT 0,
  read         INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- --- Dates de séquences / emploi du temps --------------------
CREATE TABLE IF NOT EXISTS sequence_dates (
  id            TEXT PRIMARY KEY,
  school_id     TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  seq_key       TEXT NOT NULL,
  seq_label     TEXT NOT NULL,
  exam_date     TEXT,
  deadline_date TEXT,
  conseil_date  TEXT,
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(school_id, seq_key)
);

CREATE TABLE IF NOT EXISTS timetable_slots (
  id            TEXT PRIMARY KEY,
  school_id     TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_id      TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  subject_id    TEXT REFERENCES subjects(id) ON DELETE SET NULL,
  teacher_id    TEXT REFERENCES teachers(id) ON DELETE SET NULL,
  day_of_week   INTEGER NOT NULL CHECK (day_of_week BETWEEN 1 AND 6),
  start_time    TEXT NOT NULL,
  end_time      TEXT NOT NULL,
  label         TEXT,
  academic_year TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- --- Périodes académiques (état / métadonnées des séquences) --
-- Couche d'état par-dessus les séquences de notes : `sequence_order` reprend
-- l'entier de grades.sequence (zéro re-clé). status (upcoming|active|closed) =
-- ce qui est affiché par défaut ; is_locked = édition bloquée. Indépendants.
CREATE TABLE IF NOT EXISTS academic_periods (
  id             TEXT PRIMARY KEY,
  school_id      TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  school_year    TEXT NOT NULL,
  type           TEXT NOT NULL CHECK (type IN ('trimestre', 'sequence')),
  parent_id      TEXT REFERENCES academic_periods(id) ON DELETE SET NULL,
  name           TEXT NOT NULL,
  sequence_order INTEGER,                  -- entier de grades.sequence (type='sequence')
  teaching_start TEXT,                      -- ISO date
  teaching_end   TEXT,                      -- fin d'enseignement
  entry_deadline TEXT,                      -- fin de saisie (>= teaching_end)
  status         TEXT NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'active', 'closed')),
  is_locked      INTEGER NOT NULL DEFAULT 0,
  activated_at   TEXT,
  activated_by   TEXT,
  closed_at      TEXT,
  closed_by      TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Au plus UNE séquence active par (école, année) — backstop de la logique app.
CREATE UNIQUE INDEX IF NOT EXISTS academic_periods_one_active_idx
  ON academic_periods (school_id, school_year)
  WHERE status = 'active' AND type = 'sequence';

-- Clé naturelle (idempotence du seed / dédoublonnage).
CREATE UNIQUE INDEX IF NOT EXISTS academic_periods_natural_idx
  ON academic_periods (school_id, school_year, type, sequence_order);

CREATE INDEX IF NOT EXISTS academic_periods_school_year_idx
  ON academic_periods (school_id, school_year);

-- --- Configuration par pays (lecture seule, seedée) ----------
CREATE TABLE IF NOT EXISTS country_education_config (
  country_system    TEXT PRIMARY KEY,
  country_name      TEXT NOT NULL,
  flag              TEXT,
  lang_primary      TEXT NOT NULL,
  lang_secondary    TEXT,
  grading_system    TEXT NOT NULL,
  max_grade         REAL NOT NULL,
  pass_threshold    REAL NOT NULL,
  periods           TEXT NOT NULL DEFAULT '{}',
  grade_scale       TEXT NOT NULL DEFAULT '[]',
  passing_decisions TEXT NOT NULL DEFAULT '[]',
  exam_classes      TEXT NOT NULL DEFAULT '[]',
  levels            TEXT NOT NULL DEFAULT '[]',
  default_subjects  TEXT NOT NULL DEFAULT '[]',
  promotion_rules   TEXT NOT NULL DEFAULT '{}',
  bulletin_template TEXT,
  admin_titles      TEXT NOT NULL DEFAULT '{}',
  document_types    TEXT NOT NULL DEFAULT '[]',
  vocab             TEXT NOT NULL DEFAULT '{}',
  created_at        TEXT DEFAULT (datetime('now')),
  updated_at        TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS evaluation_system (
  country_system        TEXT PRIMARY KEY,
  period_type           TEXT NOT NULL,
  evaluation_model      TEXT NOT NULL,
  subject_formula       TEXT NOT NULL,
  term_formula          TEXT NOT NULL,
  annual_formula        TEXT NOT NULL,
  uses_coefficients     TEXT NOT NULL DEFAULT '{}',
  weighting             TEXT,
  continuous_assessment INTEGER NOT NULL DEFAULT 0,
  exams                 INTEGER NOT NULL DEFAULT 0,
  pass_threshold        REAL NOT NULL,
  grade_max             REAL NOT NULL,
  promotion_rules       TEXT NOT NULL DEFAULT '{}',
  repeat_rules          TEXT NOT NULL DEFAULT '{}',
  ranking_rules         TEXT NOT NULL DEFAULT '{}',
  rounding_rules        TEXT NOT NULL DEFAULT '{}',
  official_exam         TEXT,
  updated_at            TEXT DEFAULT (datetime('now'))
);

-- --- Activation de licence locale (offline) ------------------
CREATE TABLE IF NOT EXISTS license_activation (
  id            INTEGER PRIMARY KEY CHECK (id = 1),
  license_key   TEXT,
  payload       TEXT,                    -- JSON décodé de la clé
  activated_at  TEXT,
  machine_id    TEXT
);

-- --- État de migration Cloud → Local/LAN ---------------------
-- Une seule ligne (id = 1). Sa présence ferme l'assistant de migration
-- (provisioning déjà fait) et trace la provenance des données.
CREATE TABLE IF NOT EXISTS migration_state (
  id          INTEGER PRIMARY KEY CHECK (id = 1),
  source      TEXT,                      -- 'cloud'
  school_id   TEXT,
  cloud_url   TEXT,
  migrated_at TEXT,
  report      TEXT                       -- JSON : counts + intégrité
);

-- --- File de miroir des mots de passe (Local → Cloud) --------
-- Empilée quand le cloud est injoignable au moment d'un login/changement ;
-- rejouée à la reconnexion. Le secret est CHIFFRÉ (AES-256-GCM, clé locale).
CREATE TABLE IF NOT EXISTS pwd_mirror_queue (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  local_user_id TEXT NOT NULL,
  email         TEXT,
  secret        TEXT NOT NULL,           -- mot de passe chiffré (jamais en clair)
  created_at    TEXT NOT NULL
);

-- --- Activation Cloud (Local FIRST → Cloud) ------------------
-- Suit l'assistant « Activer NotesCam Cloud ». Une seule ligne (id = 1).
-- `log` = journal de migration (lignes \n). Permet la REPRISE après interruption.
CREATE TABLE IF NOT EXISTS cloud_activation (
  id          INTEGER PRIMARY KEY CHECK (id = 1),
  phase       TEXT,                      -- 'signup'|'verify'|'provision'|'push'|'done'
  email       TEXT,
  school_id   TEXT,
  started_at  TEXT,
  finished_at TEXT,
  log         TEXT
);

-- Curseur de poussée par table : reprise idempotente après interruption.
CREATE TABLE IF NOT EXISTS cloud_push_state (
  tablename  TEXT PRIMARY KEY,
  pushed     INTEGER NOT NULL DEFAULT 0,
  total      INTEGER NOT NULL DEFAULT 0,
  done       INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT
);

-- --- Sync continue LAN ↔ Cloud (Phase 2) ---------------------
-- Journal des changements locaux à pousser (alimenté par query.js). La sync
-- elle-même écrit SANS réalimenter ce journal (anti-écho).
CREATE TABLE IF NOT EXISTS sync_outbox (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  tablename TEXT NOT NULL,
  row_id    TEXT NOT NULL,
  op        TEXT NOT NULL,            -- 'upsert' | 'delete'
  at        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sync_outbox_at ON sync_outbox (id);

-- Curseurs de tirage (dernier updated_at / tombstone vus côté cloud).
CREATE TABLE IF NOT EXISTS sync_cursor (
  name  TEXT PRIMARY KEY,
  value TEXT
);

-- Index utiles (les requêtes filtrent surtout par classe / élève / école)
CREATE INDEX IF NOT EXISTS idx_subjects_class       ON subjects(class_id);
CREATE INDEX IF NOT EXISTS idx_students_class        ON students(class_id);
CREATE INDEX IF NOT EXISTS idx_grades_class          ON grades(class_id);
CREATE INDEX IF NOT EXISTS idx_grades_student        ON grades(student_id);
CREATE INDEX IF NOT EXISTS idx_fees_student          ON student_fees(student_id);
CREATE INDEX IF NOT EXISTS idx_payments_student      ON fee_payments(student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_student    ON attendance(student_id);
CREATE INDEX IF NOT EXISTS idx_timetable_class       ON timetable_slots(class_id);
CREATE INDEX IF NOT EXISTS idx_school_users_user     ON school_users(user_id);
CREATE INDEX IF NOT EXISTS idx_staff_school          ON staff(school_id);
CREATE INDEX IF NOT EXISTS idx_staff_department      ON staff(department);
