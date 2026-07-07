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
  currency           TEXT NOT NULL DEFAULT 'XAF',  -- devise officielle (affichage)
  language           TEXT DEFAULT 'fr',
  country_system     TEXT,                -- 'cameroon_fr' | 'cameroon_en' | 'guinea_eq'
  ge_primary_coef    INTEGER NOT NULL DEFAULT 0,
  grade_entry_mode   TEXT NOT NULL DEFAULT 'principal', -- 'principal' | 'subject'
  bulletin_engine    TEXT NOT NULL DEFAULT 'classic', -- 'classic' | 'officiel' (+ anciens: minesec/minedub/apc…)
  bulletin_subject_mode TEXT NOT NULL DEFAULT 'synthetic', -- 'synthetic' | 'detailed' (matières composites)
  bulletin_bilingual INTEGER,           -- en-tête officiel bilingue (1/0 ; null = bilingue par défaut)
  grade_scale        TEXT,
  apc_bulletin_cols  TEXT,   -- JSON { cote, minmax, appreciation } — colonnes du bulletin APC (premier cycle)
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

-- --- Unités pédagogiques du complexe scolaire ----------------
-- Une école (complexe) contient 0..N unités (maternelle/primaire/collège/lycée…),
-- chacune avec sa propre identité (nom, logo, cachet, signature, directeur,
-- adresse, contacts, devise, couleurs). Cf. src/lib/schoolIdentity.js.
CREATE TABLE IF NOT EXISTS school_units (
  id               TEXT PRIMARY KEY,
  school_id        TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  section_key      TEXT,   -- 'maternelle'|'primaire'|'premier_cycle'|'second_cycle'|'autre'
  name             TEXT NOT NULL,
  short_name       TEXT,
  logo_url         TEXT,
  stamp_url        TEXT,
  signature_url    TEXT,
  director         TEXT,
  address          TEXT,
  phone            TEXT,
  email            TEXT,
  motto            TEXT,
  establishment_no TEXT,
  color_primary    TEXT,
  color_secondary  TEXT,
  position         INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_school_units_school ON school_units(school_id);

-- --- Classes / matières / élèves -----------------------------
CREATE TABLE IF NOT EXISTS classes (
  id           TEXT PRIMARY KEY,
  school_id    TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  level        TEXT,
  section      TEXT,
  serie        TEXT,   -- série lycée (A, C, D…) — résolution du second cycle MINESEC
  system       TEXT NOT NULL DEFAULT 'FR',
  cycle        TEXT,
  current_year TEXT,
  -- Surcharge de moteur PAR CLASSE (null = hérite de schools.bulletin_engine).
  bulletin_engine TEXT,
  -- Enseignant titulaire. Pas de FK dure : la sync hors-ligne peut envoyer la
  -- classe avant l'enseignant -> on garde l'id même si la ligne teacher n'est
  -- pas (encore) là, au lieu de rejeter tout l'upsert (FK ON globalement).
  teacher_id   TEXT,
  max_students INTEGER,
  -- Rattachement explicite à une unité pédagogique (repli auto par section sinon).
  unit_id      TEXT REFERENCES school_units(id) ON DELETE SET NULL,
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
  parent_id   TEXT,                 -- matière composite : matière parente (null = principale)
  calc_method TEXT,                 -- 'avg' | 'weighted_avg' | 'weighted_sum' | 'formula'
  formula     TEXT,                 -- formule personnalisée (optionnelle)
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
  statut_etablissement TEXT,
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
  tranches              TEXT NOT NULL DEFAULT '[]',  -- instantané [{id,label,amount,due_date}]
  payment_mode          TEXT,                        -- comptant | echelonne | libre
  adjustments           TEXT NOT NULL DEFAULT '[]',  -- bourses/remises [{id,type,label,mode,value}]
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(student_id, academic_year)
);

-- Grilles tarifaires par classe (tarif comptant + échelonné + tranches).
CREATE TABLE IF NOT EXISTS class_fee_grids (
  id               TEXT PRIMARY KEY,
  school_id        TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_id         TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  academic_year    TEXT NOT NULL,
  amount_comptant  INTEGER NOT NULL DEFAULT 0,
  amount_echelonne INTEGER NOT NULL DEFAULT 0,
  amount_inscription INTEGER NOT NULL DEFAULT 0,
  tranches         TEXT NOT NULL DEFAULT '[]',
  currency         TEXT NOT NULL DEFAULT 'FCFA',
  notes            TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(class_id, academic_year)
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
  -- Conseil de classe (champs spéciaux `__…__`) : décision, distinctions,
  -- avertissements/blâmes, exclusions + appréciation libre du travail.
  th             INTEGER,
  encouragement  INTEGER,
  felicitation   INTEGER,
  aver_travail   INTEGER NOT NULL DEFAULT 0,
  blame_travail  INTEGER NOT NULL DEFAULT 0,
  exclusions     INTEGER NOT NULL DEFAULT 0,
  aver_conduite  INTEGER NOT NULL DEFAULT 0,
  blame_conduite INTEGER NOT NULL DEFAULT 0,
  decision       TEXT,
  appreciation   TEXT,
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
  room          TEXT,                  -- salle du cours (Vue Salle + conflits de salle)
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
CREATE INDEX IF NOT EXISTS idx_fee_grids_class        ON class_fee_grids(class_id);
CREATE INDEX IF NOT EXISTS idx_fee_grids_school       ON class_fee_grids(school_id);
CREATE INDEX IF NOT EXISTS idx_attendance_student    ON attendance(student_id);
CREATE INDEX IF NOT EXISTS idx_timetable_class       ON timetable_slots(class_id);
CREATE INDEX IF NOT EXISTS idx_school_users_user     ON school_users(user_id);
CREATE INDEX IF NOT EXISTS idx_staff_school          ON staff(school_id);
CREATE INDEX IF NOT EXISTS idx_staff_department      ON staff(department);

-- ============================================================
-- MOTEUR OFFICIEL CAMEROUN (MINEDUB + MINESEC) — portage LAN
-- ============================================================
-- Réplique en SQLite les tables « référentiel » (globales, lecture seule,
-- peuplées par server/officiel-seed.sql) et « transactionnelles » (par école,
-- synchronisées) du moteur officiel. Le cloud est la source de vérité du schéma :
-- uuid → TEXT, boolean → INTEGER (0/1, compris par SQLite via true/false),
-- numeric → NUMERIC, timestamptz → TEXT. Les colonnes de sync (updated_at,
-- version, device_id) sont ajoutées aux tables transactionnelles comme ailleurs.

-- ── APC premier cycle (collège 6e–3e) : structure + compétences ──────────────
CREATE TABLE IF NOT EXISTS apc_referentiel_versions (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  label       TEXT NOT NULL,
  source      TEXT,
  imported_at TEXT,
  actif       INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS apc_cycles (
  id  TEXT PRIMARY KEY,
  nom TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS apc_classes (
  id       TEXT PRIMARY KEY,
  cycle_id TEXT NOT NULL REFERENCES apc_cycles(id) ON DELETE CASCADE,
  nom      TEXT NOT NULL,
  niveau   INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS apc_trimestres (
  id     TEXT PRIMARY KEY,
  numero INTEGER NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS apc_sequences (
  id           TEXT PRIMARY KEY,
  numero       INTEGER NOT NULL UNIQUE,
  trimestre_id TEXT NOT NULL REFERENCES apc_trimestres(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS apc_matieres (
  id          TEXT PRIMARY KEY,
  nom         TEXT NOT NULL,
  coefficient NUMERIC NOT NULL DEFAULT 1,
  optionnelle INTEGER NOT NULL DEFAULT 0,
  ordre       INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS apc_competences (
  id                     TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  cycle_id               TEXT NOT NULL REFERENCES apc_cycles(id)     ON DELETE CASCADE,
  classe_id              TEXT NOT NULL REFERENCES apc_classes(id)    ON DELETE CASCADE,
  trimestre_id           TEXT NOT NULL REFERENCES apc_trimestres(id) ON DELETE CASCADE,
  matiere_id             TEXT NOT NULL REFERENCES apc_matieres(id)   ON DELETE CASCADE,
  ordre                  INTEGER NOT NULL DEFAULT 1,
  intitule               TEXT NOT NULL,
  coefficient            NUMERIC,
  actif                  INTEGER NOT NULL DEFAULT 1,
  referentiel_version_id TEXT REFERENCES apc_referentiel_versions(id) ON DELETE SET NULL,
  CONSTRAINT apc_competences_uniq UNIQUE (classe_id, trimestre_id, matiere_id, ordre)
);
CREATE TABLE IF NOT EXISTS apc_classe_matieres (
  classe_id   TEXT NOT NULL REFERENCES apc_classes(id)  ON DELETE CASCADE,
  matiere_id  TEXT NOT NULL REFERENCES apc_matieres(id) ON DELETE CASCADE,
  coefficient NUMERIC NOT NULL DEFAULT 1,
  ordre       INTEGER NOT NULL DEFAULT 0,
  optionnelle INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (classe_id, matiere_id)
);

-- ── Second cycle MINESEC (lycée 2nde–Tle par séries) ─────────────────────────
CREATE TABLE IF NOT EXISTS sc_referentiel_versions (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  label       TEXT NOT NULL,
  source      TEXT,
  imported_at TEXT,
  actif       INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS sc_series (
  id          TEXT PRIMARY KEY,
  nom         TEXT NOT NULL,
  categorie   TEXT NOT NULL,
  description TEXT,
  ordre       INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS sc_groupes (
  id    TEXT PRIMARY KEY,
  nom   TEXT NOT NULL,
  ordre INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS sc_matieres (
  id                    TEXT PRIMARY KEY,
  nom                   TEXT NOT NULL,
  code                  TEXT,
  domaine_apprentissage TEXT,
  ordre                 INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS sc_serie_matieres (
  id                     TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  serie_id               TEXT NOT NULL REFERENCES sc_series(id)   ON DELETE CASCADE,
  classe_id              TEXT NOT NULL,
  matiere_id             TEXT NOT NULL REFERENCES sc_matieres(id) ON DELETE CASCADE,
  groupe_id              TEXT NOT NULL REFERENCES sc_groupes(id),
  coefficient            NUMERIC NOT NULL,
  charge_horaire         NUMERIC,
  obligatoire            INTEGER NOT NULL DEFAULT 1,
  actif                  INTEGER NOT NULL DEFAULT 1,
  referentiel_version_id TEXT REFERENCES sc_referentiel_versions(id) ON DELETE SET NULL,
  CONSTRAINT sc_serie_matieres_uniq UNIQUE (serie_id, classe_id, matiere_id)
);

-- ── Maternelle (domaines / observations A·ECA·NA) ────────────────────────────
CREATE TABLE IF NOT EXISTS mat_referentiel_versions (
  id           TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  country_code TEXT NOT NULL DEFAULT 'CM',
  label        TEXT NOT NULL,
  source       TEXT,
  imported_at  TEXT,
  actif        INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS mat_niveaux (
  id           TEXT PRIMARY KEY,
  country_code TEXT NOT NULL DEFAULT 'CM',
  nom          TEXT NOT NULL,
  ordre        INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS mat_domaines (
  id           TEXT PRIMARY KEY,
  country_code TEXT NOT NULL DEFAULT 'CM',
  code         TEXT,
  intitule     TEXT NOT NULL,
  ordre        INTEGER NOT NULL,
  actif        INTEGER NOT NULL DEFAULT 1
);

-- ── Primaire APC (compétences 1A–6B × critères /10) ──────────────────────────
CREATE TABLE IF NOT EXISTS prim_referentiel_versions (
  id           TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  country_code TEXT NOT NULL DEFAULT 'CM',
  label        TEXT NOT NULL,
  source       TEXT,
  imported_at  TEXT,
  actif        INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS prim_cycles (
  id           TEXT PRIMARY KEY,
  country_code TEXT NOT NULL DEFAULT 'CM',
  nom          TEXT NOT NULL,
  ordre        INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS prim_niveaux (
  id           TEXT PRIMARY KEY,
  cycle_id     TEXT NOT NULL REFERENCES prim_cycles(id) ON DELETE CASCADE,
  country_code TEXT NOT NULL DEFAULT 'CM',
  nom          TEXT NOT NULL,
  ordre        INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS prim_competences (
  id           TEXT PRIMARY KEY,
  country_code TEXT NOT NULL DEFAULT 'CM',
  code         TEXT NOT NULL,
  intitule     TEXT NOT NULL,
  domaine      TEXT,
  coefficient  NUMERIC NOT NULL DEFAULT 1,
  ordre        INTEGER NOT NULL,
  actif        INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS prim_niveau_competences (
  niveau_id     TEXT NOT NULL REFERENCES prim_niveaux(id)     ON DELETE CASCADE,
  competence_id TEXT NOT NULL REFERENCES prim_competences(id) ON DELETE CASCADE,
  coefficient   NUMERIC,
  actif         INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (niveau_id, competence_id)
);
CREATE TABLE IF NOT EXISTS prim_criteres (
  id           TEXT PRIMARY KEY,
  country_code TEXT NOT NULL DEFAULT 'CM',
  nom          TEXT NOT NULL,
  poids        NUMERIC NOT NULL DEFAULT 1,
  ordre        INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS prim_cote_bareme (
  id           TEXT PRIMARY KEY,
  country_code TEXT NOT NULL DEFAULT 'CM',
  cote         TEXT NOT NULL,
  libelle      TEXT NOT NULL,
  seuil_min    NUMERIC NOT NULL,
  ordre        INTEGER NOT NULL
);

-- ── Transactionnel officiel (par école, synchronisé LAN↔Cloud) ───────────────
CREATE TABLE IF NOT EXISTS apc_notes (
  id            TEXT PRIMARY KEY,
  school_id     TEXT NOT NULL REFERENCES schools(id)  ON DELETE CASCADE,
  eleve_id      TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  competence_id TEXT NOT NULL REFERENCES apc_competences(id) ON DELETE CASCADE,
  sequence_id   TEXT NOT NULL REFERENCES apc_sequences(id),
  enseignant_id TEXT,
  note          NUMERIC,
  appreciation  TEXT,
  date_saisie   TEXT,
  updated_at    TEXT,
  version       INTEGER NOT NULL DEFAULT 1,
  device_id     TEXT,
  CONSTRAINT apc_notes_uniq UNIQUE (eleve_id, competence_id, sequence_id)
);
CREATE INDEX IF NOT EXISTS idx_apc_notes_school  ON apc_notes(school_id);
CREATE INDEX IF NOT EXISTS idx_apc_notes_student ON apc_notes(eleve_id);

CREATE TABLE IF NOT EXISTS mat_observations (
  id            TEXT PRIMARY KEY,
  school_id     TEXT NOT NULL REFERENCES schools(id)  ON DELETE CASCADE,
  eleve_id      TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  domaine_id    TEXT NOT NULL REFERENCES mat_domaines(id),
  trimestre_id  TEXT NOT NULL REFERENCES apc_trimestres(id),
  niveau_acquis TEXT NOT NULL,
  observation   TEXT,
  enseignant_id TEXT,
  date_saisie   TEXT,
  updated_at    TEXT,
  version       INTEGER NOT NULL DEFAULT 1,
  device_id     TEXT,
  CONSTRAINT mat_observations_uniq UNIQUE (eleve_id, domaine_id, trimestre_id)
);
CREATE INDEX IF NOT EXISTS idx_mat_obs_school  ON mat_observations(school_id);
CREATE INDEX IF NOT EXISTS idx_mat_obs_student ON mat_observations(eleve_id);

CREATE TABLE IF NOT EXISTS prim_notes (
  id            TEXT PRIMARY KEY,
  school_id     TEXT NOT NULL REFERENCES schools(id)  ON DELETE CASCADE,
  eleve_id      TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  competence_id TEXT NOT NULL REFERENCES prim_competences(id),
  critere_id    TEXT NOT NULL REFERENCES prim_criteres(id),
  trimestre_id  TEXT NOT NULL REFERENCES apc_trimestres(id),
  note          NUMERIC,
  enseignant_id TEXT,
  date_saisie   TEXT,
  updated_at    TEXT,
  version       INTEGER NOT NULL DEFAULT 1,
  device_id     TEXT,
  CONSTRAINT prim_notes_uniq UNIQUE (eleve_id, competence_id, critere_id, trimestre_id)
);
CREATE INDEX IF NOT EXISTS idx_prim_notes_school  ON prim_notes(school_id);
CREATE INDEX IF NOT EXISTS idx_prim_notes_student ON prim_notes(eleve_id);
