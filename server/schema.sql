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
  -- Qui a inscrit cet élève : id du compte + NOM figé au moment de l'inscription
  -- (le nom survit au renommage / à la suppression du compte).
  created_by      TEXT,
  created_by_name TEXT,
  -- ARCHIVAGE : un élève porteur d'écritures de caisse ne se supprime pas, il
  -- sort des listes actives. `archived_at` renseigné = archivé.
  archived_at      TEXT,
  archived_by      TEXT,
  archived_by_name TEXT,
  archive_reason   TEXT,
  sport_aptitude TEXT NOT NULL DEFAULT 'apte', -- carnet MINEDUB primaire : 'apte' | 'inapte' (compétence 6A)
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS grades (
  id         TEXT PRIMARY KEY,
  school_id  TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_id   TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  sequence   INTEGER NOT NULL,
  value      TEXT,               -- nullable : parité Cloud (une note vide = élève absent à l'évaluation) ; sinon le pull LAN rejette ces lignes (NOT NULL)
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
  -- Qui a encaissé : id du compte + NOM figé à l'encaissement. Le reçu réimprimé
  -- doit porter le caissier d'origine, jamais l'utilisateur qui réimprime.
  recorded_by      TEXT,
  recorded_by_name TEXT,
  -- CONTRE-PASSATION : un versement ne se supprime JAMAIS. L'annuler crée une
  -- nouvelle ligne de montant NÉGATIF qui pointe l'originale via `reversal_of`,
  -- avec son motif. Les deux lignes restent visibles et la somme reste juste.
  reversal_of   TEXT REFERENCES fee_payments(id) ON DELETE RESTRICT,
  void_reason   TEXT,
  -- Numéro SÉQUENTIEL par (école, année). C'est lui qui rend visible la recette
  -- escamotée : si le reçu n°47 manque alors que 46 et 48 existent, une somme a
  -- été encaissée puis effacée du système. Attribué par le serveur, jamais par
  -- le client (cf. allocateReceiptNo dans query.js).
  receipt_no    INTEGER,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
-- ⚠ AUCUN INDEX ICI sur une colonne ajoutée par `ensureColumn` (receipt_no,
-- reversal_of, recorded_by…). Ce fichier est exécuté AVANT les ensureColumn :
-- sur une base DÉJÀ INSTALLÉE la colonne n'existe pas encore, `db.exec` lève
-- « no such column » et le serveur ne démarre plus. Ces index sont créés dans
-- server/db.js, après les ensureColumn. Vérifié par _schema_upgrade.test.mjs.

-- --- Arrêté de caisse (rapprochement espèces ↔ écritures) ----------------
-- Un versement immuable ne protège que ce qui a été SAISI. Pour détecter la
-- recette jamais saisie, il faut confronter le tiroir physique aux écritures :
-- c'est l'objet de cette table. Une ligne = un caissier, une journée.
--   expected_cash = fond d'ouverture + encaissements − annulations (recalculé,
--                   jamais cru sur parole : figé ici pour la traçabilité)
--   counted_cash  = ce que le caissier a compté
--   variance      = counted − expected  (>0 : encaissement non saisi)
-- `validated_by` ne peut pas être `cashier_id` : personne ne valide son propre
-- comptage (règle portée par cashSessionEngine.canValidate).
CREATE TABLE IF NOT EXISTS cash_sessions (
  id             TEXT PRIMARY KEY,
  school_id      TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  academic_year  TEXT,
  date           TEXT NOT NULL,
  cashier_id     TEXT,
  cashier_name   TEXT,
  opening_float  INTEGER NOT NULL DEFAULT 0,
  expected_cash  INTEGER NOT NULL DEFAULT 0,
  counted_cash   INTEGER,
  variance       INTEGER NOT NULL DEFAULT 0,
  entry_count    INTEGER NOT NULL DEFAULT 0,
  explanation    TEXT,
  status         TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','declared','validated')),
  declared_at    TEXT,
  validated_by   TEXT,
  validated_by_name TEXT,
  validated_at   TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(school_id, date, cashier_id)
);
CREATE INDEX IF NOT EXISTS idx_cash_sessions_school ON cash_sessions(school_id, date);

-- --- Budgets (prévisionnel) ----------------------------------
-- Enveloppe prévisionnelle : période (annuel/trimestriel/mensuel) + secteur +
-- statut (draft/active/closed). Les chapitres/sous-chapitres portent les montants
-- PRÉVUS. Dépenses réelles & validations = itérations suivantes (modèle extensible).
-- Modèle CIBLE (hiérarchie) : un budget = un NŒUD arborescent typé par `tier`
--   annual  → racine unique par (école, année). Porte `envelope_amount` (plafond).
--   period  → enfant d'un `annual`, rattaché à une `academic_periods`. Porte `envelope_amount`.
--   sector  → enfant d'un `period`, rattaché à une `school_units`. Porte `allocation_pct`
--             (+ `sector_amount` résolu, conservé pour la traçabilité montant ET %).
-- `tier` NULL = ancien budget « à plat » (transitoire : l'app y migre en P4, colonnes
-- héritées retirées en P7). Les contraintes de forme (CHECK) + de cohérence inter-lignes
-- (triggers `budgets_hier_guard_*`) ne s'appliquent QUE lorsque `tier` est renseigné,
-- donc zéro régression pour les lignes héritées.
CREATE TABLE IF NOT EXISTS budgets (
  id             TEXT PRIMARY KEY,
  school_id      TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  academic_year  TEXT NOT NULL,
  -- ── Hiérarchie cible ──────────────────────────────────────────────
  tier               TEXT,                                                  -- annual|period|sector (NULL = hérité)
  parent_budget_id   TEXT REFERENCES budgets(id) ON DELETE CASCADE,         -- annual←period←sector
  academic_period_id TEXT REFERENCES academic_periods(id) ON DELETE RESTRICT, -- enveloppe de période
  school_unit_id     TEXT REFERENCES school_units(id) ON DELETE RESTRICT,   -- allocation secteur
  envelope_amount    INTEGER,                                               -- plafond saisi (annual/period)
  allocation_pct     REAL,                                                  -- % du parent (sector)
  sector_amount      INTEGER,                                               -- montant secteur résolu (traçabilité)
  -- ── Ancien modèle « à plat » (transitoire — retiré en P7) ─────────
  period_type    TEXT DEFAULT 'annuel',            -- LEGACY : annuel|trimestriel|mensuel
  period_ref     INTEGER,                          -- LEGACY
  start_date     TEXT,                             -- date réelle de début d'exercice (Phase D)
  end_date       TEXT,                             -- date réelle de fin d'exercice (inclusive)
  sector         TEXT DEFAULT 'general',           -- LEGACY (remplacé par school_unit_id)
  label          TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'draft',    -- draft|active|closed
  notes          TEXT,
  closed_at      TEXT,
  closed_by      TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
  -- Bornes de valeurs
  CHECK (tier IS NULL OR tier IN ('annual','period','sector')),
  CHECK (allocation_pct IS NULL OR (allocation_pct >= 0 AND allocation_pct <= 100)),
  CHECK (envelope_amount IS NULL OR envelope_amount >= 0),
  CHECK (sector_amount   IS NULL OR sector_amount   >= 0),
  -- Cohérence de FORME par niveau (les liens inter-lignes sont en triggers)
  CHECK (tier IS NULL OR tier <> 'annual' OR (
    parent_budget_id IS NULL AND academic_period_id IS NULL AND school_unit_id IS NULL
    AND envelope_amount IS NOT NULL AND allocation_pct IS NULL AND sector_amount IS NULL)),
  CHECK (tier IS NULL OR tier <> 'period' OR (
    parent_budget_id IS NOT NULL AND academic_period_id IS NOT NULL AND school_unit_id IS NULL
    AND envelope_amount IS NOT NULL AND allocation_pct IS NULL AND sector_amount IS NULL)),
  CHECK (tier IS NULL OR tier <> 'sector' OR (
    parent_budget_id IS NOT NULL AND school_unit_id IS NOT NULL AND academic_period_id IS NULL
    AND allocation_pct IS NOT NULL AND envelope_amount IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_budgets_school ON budgets(school_id, academic_year);
-- NB : les objets qui référencent les colonnes de hiérarchie (idx_budgets_parent,
-- index uniques partiels, triggers budgets_hier_guard_*/budgets_activate_guard)
-- sont créés dans server/db.js APRÈS l'ajout des colonnes aux bases existantes
-- (ensureColumn), pour ne pas échouer au chargement du schéma sur une base
-- pré-hiérarchie. Sur une base fraîche, les colonnes ci-dessus existent déjà et
-- ces objets s'appliquent de la même manière. Voir supabase_budget_hierarchy_v2.sql
-- pour l'équivalent Cloud (Postgres).

CREATE TABLE IF NOT EXISTS budget_chapters (
  id             TEXT PRIMARY KEY,
  school_id      TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  budget_id      TEXT NOT NULL REFERENCES budgets(id) ON DELETE CASCADE, -- CIBLE v3 : rattaché au budget ANNUEL
  parent_id      TEXT REFERENCES budget_chapters(id) ON DELETE CASCADE, -- rubrique→ligne→sous-ligne (NULL = rubrique racine)
  code           TEXT,
  label          TEXT NOT NULL,
  kind           TEXT NOT NULL DEFAULT 'depense',  -- recette|depense (prévisionnel)
  planned_amount INTEGER NOT NULL DEFAULT 0,       -- montant annuel de la LIGNE (feuille)
  -- ── Modèle CIBLE v3 : portée + cycle de vie de la répartition d'une LIGNE ──
  scope          TEXT,                             -- 'complex'|'sectors' (feuilles ; NULL = rubrique / non défini)
  status         TEXT NOT NULL DEFAULT 'draft',    -- draft|active|closed (répartition de la ligne)
  position       INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (scope IS NULL OR scope IN ('complex','sectors')),
  CHECK (status IN ('draft','active','closed'))
);
CREATE INDEX IF NOT EXISTS idx_budget_chapters_budget ON budget_chapters(budget_id);
CREATE INDEX IF NOT EXISTS idx_budget_chapters_parent ON budget_chapters(parent_id);

-- --- Dépenses (exécution budgétaire) -------------------------
-- Toujours rattachée à un budget (budget_id dérivé du chapitre). Le « restant »
-- n'est pas stocké : recalculé (planifié − engagé) — lib/expenseEngine.js.
CREATE TABLE IF NOT EXISTS budget_expenses (
  id                TEXT PRIMARY KEY,
  school_id         TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  budget_id         TEXT NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
  budget_chapter_id TEXT REFERENCES budget_chapters(id) ON DELETE SET NULL,   -- la LIGNE imputée
  -- ── Modèle CIBLE v3 : imputation RÉELLE d'une dépense (≠ allocation prévisionnelle) ──
  budget_period_id  TEXT REFERENCES budget_periods(id) ON DELETE RESTRICT,    -- période imputée
  school_unit_id    TEXT REFERENCES school_units(id) ON DELETE SET NULL,      -- secteur imputé (NULL = Complexe/Global)
  category          TEXT,
  subcategory       TEXT,
  sector            TEXT,                          -- LEGACY (secteur dénormalisé — remplacé par school_unit_id)
  supplier          TEXT,
  amount            INTEGER NOT NULL DEFAULT 0,
  requester         TEXT,
  receipt           TEXT,
  status            TEXT NOT NULL DEFAULT 'draft',  -- draft|submitted|approved|paid|rejected|cancelled
  expense_date      TEXT,
  notes             TEXT,
  created_by        TEXT,
  cancel_reason     TEXT,                            -- annulation tracée : motif (obligatoire côté UI)
  cancelled_by      TEXT,                            -- auteur de l'annulation
  cancelled_at      TEXT,                            -- date de l'annulation
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_budget_expenses_budget  ON budget_expenses(budget_id);
CREATE INDEX IF NOT EXISTS idx_budget_expenses_chapter ON budget_expenses(budget_chapter_id);

-- --- Déblocage de lignes épuisées (demandes + décisions) -----
CREATE TABLE IF NOT EXISTS budget_unlock_requests (
  id                TEXT PRIMARY KEY,
  school_id         TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  budget_id         TEXT NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
  budget_chapter_id TEXT REFERENCES budget_chapters(id) ON DELETE SET NULL,
  requested_amount  INTEGER NOT NULL DEFAULT 0,
  reason            TEXT,
  requester         TEXT,
  requested_by      TEXT,
  status            TEXT NOT NULL DEFAULT 'pending',  -- pending|refused|authorized|increased
  granted_amount    INTEGER,
  decision_note     TEXT,
  decided_by        TEXT,
  decided_by_id     TEXT,
  decided_role      TEXT,
  decided_at        TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_budget_unlocks_budget ON budget_unlock_requests(budget_id);

-- --- Réallocation budgétaire (transfert entre enveloppes de MÊME parent) -----
-- Opération métier DISTINCTE du déblocage de ligne et de la révision annuelle.
-- Déplace un montant d'une enveloppe source vers une destination sœur (secteur↔
-- secteur d'une même période, ou période↔période d'un même annuel). Le total du
-- parent reste INCHANGÉ. Snapshots avant/après conservés (traçabilité immuable).
-- La cohérence « source/dest = enveloppes sœurs » est vérifiée par l'enforcement
-- serveur (RPC cloud / route LAN, P3), pas au niveau schéma (cross-row).
CREATE TABLE IF NOT EXISTS budget_reallocations (
  id                TEXT PRIMARY KEY,
  school_id         TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  academic_year     TEXT NOT NULL,
  source_budget_id  TEXT NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
  dest_budget_id    TEXT NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
  amount            INTEGER NOT NULL DEFAULT 0,
  reason            TEXT,                            -- motif (obligatoire côté UI/RPC)
  receipt           TEXT,                            -- justificatif éventuel
  requester         TEXT,
  requested_by      TEXT,
  status            TEXT NOT NULL DEFAULT 'pending', -- pending|approved|refused|applied
  source_before     INTEGER, source_after INTEGER,  -- snapshot enveloppe source
  dest_before       INTEGER, dest_after   INTEGER,  -- snapshot enveloppe destination
  decision_note     TEXT,
  decided_by        TEXT, decided_by_id TEXT, decided_role TEXT, decided_at TEXT,
  created_by        TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (amount > 0),
  CHECK (source_budget_id <> dest_budget_id),
  CHECK (status IN ('pending','approved','refused','applied'))
);
CREATE INDEX IF NOT EXISTS idx_budget_realloc_school ON budget_reallocations(school_id, academic_year);
CREATE INDEX IF NOT EXISTS idx_budget_realloc_source ON budget_reallocations(source_budget_id);
CREATE INDEX IF NOT EXISTS idx_budget_realloc_dest   ON budget_reallocations(dest_budget_id);

-- --- Révision du BUDGET ANNUEL (opération exceptionnelle, fortement tracée) --
-- Modifie l'enveloppe annuelle (le total global CHANGE, contrairement à la
-- réallocation). Capacité gouvernée par la permission configurable
-- `budget.annual.revise` (aucun rôle codé en dur). Historique immuable :
-- budget initial / avant / variation / nouveau + auteur / valideur / motif.
CREATE TABLE IF NOT EXISTS budget_revisions (
  id                TEXT PRIMARY KEY,
  school_id         TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  academic_year     TEXT NOT NULL,
  annual_budget_id  TEXT NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
  initial_amount    INTEGER,                         -- 1er budget voté (référence permanente)
  old_amount        INTEGER,                         -- enveloppe avant cette révision
  new_amount        INTEGER,                         -- nouvelle enveloppe demandée
  reason            TEXT,                            -- motif OBLIGATOIRE (UI/RPC)
  receipt           TEXT,
  requester         TEXT,
  requested_by      TEXT,
  status            TEXT NOT NULL DEFAULT 'pending', -- pending|approved|refused|applied
  decision_note     TEXT,
  decided_by        TEXT, decided_by_id TEXT, decided_role TEXT, decided_at TEXT,
  created_by        TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (new_amount IS NULL OR new_amount >= 0),
  CHECK (status IN ('pending','approved','refused','applied'))
);
CREATE INDEX IF NOT EXISTS idx_budget_revision_annual ON budget_revisions(annual_budget_id);

-- ============================================================
-- Modèle CIBLE v3 (client 2026-07-24) : annuel global → rubriques → LIGNES
-- porteuses d'un montant annuel, réparties par PÉRIODE (%) et par SECTEUR (%).
-- Périodes = table DÉDIÉE (découplée d'academic_periods / calendrier de notes).
-- Miroir Cloud/Postgres : supabase_budget_lines_v3.sql. Gardes d'intégrité (chevauchement,
-- portée sectorielle, activation Σ=100) dans server/budget-lines.sql.
-- ============================================================

-- --- Périodes budgétaires (configurées UNE FOIS par année) -----
-- Nom libre + dates réelles + description + ordre d'affichage. Nombre libre.
-- Réutilisées par TOUTES les lignes (elles ne recréent jamais leurs périodes).
CREATE TABLE IF NOT EXISTS budget_periods (
  id            TEXT PRIMARY KEY,
  school_id     TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  academic_year TEXT NOT NULL,
  name          TEXT NOT NULL,                    -- libellé (ex. « Premier trimestre »)
  start_date    TEXT NOT NULL,                    -- ISO 'YYYY-MM-DD'
  end_date      TEXT NOT NULL,                    -- inclusive, strictement > start_date
  description   TEXT,
  position      INTEGER NOT NULL DEFAULT 0,       -- ordre d'affichage
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (end_date > start_date)
);
CREATE INDEX IF NOT EXISTS idx_budget_periods_school ON budget_periods(school_id, academic_year);
-- Unicité logique du libellé dans une année.
CREATE UNIQUE INDEX IF NOT EXISTS budget_periods_name_unique ON budget_periods(school_id, academic_year, name);

-- --- Répartition TEMPORELLE d'une ligne (montant annuel → % par période) -----
CREATE TABLE IF NOT EXISTS budget_line_periods (
  id                TEXT PRIMARY KEY,
  school_id         TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  budget_chapter_id TEXT NOT NULL REFERENCES budget_chapters(id) ON DELETE CASCADE, -- la LIGNE (feuille)
  budget_period_id  TEXT NOT NULL REFERENCES budget_periods(id) ON DELETE RESTRICT,
  pct               REAL NOT NULL DEFAULT 0,      -- % du montant annuel de la ligne (saisi)
  amount            INTEGER,                       -- montant dérivé (tracé) — le % reste la vérité
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (pct >= 0 AND pct <= 100),
  CHECK (amount IS NULL OR amount >= 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS budget_line_periods_unique ON budget_line_periods(budget_chapter_id, budget_period_id);
CREATE INDEX IF NOT EXISTS idx_blp_chapter ON budget_line_periods(budget_chapter_id);
CREATE INDEX IF NOT EXISTS idx_blp_period  ON budget_line_periods(budget_period_id);

-- --- Répartition SECTORIELLE d'une ligne (uniquement si portée = 'sectors') ---
CREATE TABLE IF NOT EXISTS budget_line_sectors (
  id                TEXT PRIMARY KEY,
  school_id         TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  budget_chapter_id TEXT NOT NULL REFERENCES budget_chapters(id) ON DELETE CASCADE, -- la LIGNE (feuille)
  school_unit_id    TEXT NOT NULL REFERENCES school_units(id) ON DELETE RESTRICT,
  pct               REAL NOT NULL DEFAULT 0,      -- % du montant annuel de la ligne (saisi)
  amount            INTEGER,                       -- montant dérivé (tracé)
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (pct >= 0 AND pct <= 100),
  CHECK (amount IS NULL OR amount >= 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS budget_line_sectors_unique ON budget_line_sectors(budget_chapter_id, school_unit_id);
CREATE INDEX IF NOT EXISTS idx_bls_chapter ON budget_line_sectors(budget_chapter_id);

-- --- Réallocation entre LIGNES (modèle CIBLE v3) — transfert de montant annuel --
-- Opération TRACÉE distincte de la révision : redistribue l'enveloppe existante
-- entre deux lignes du même budget annuel SANS changer le total annuel. Écrite
-- UNIQUEMENT par les RPC (budgetOps) — jamais par l'API générique (budgetGuard).
CREATE TABLE IF NOT EXISTS budget_line_reallocations (
  id                TEXT PRIMARY KEY,
  school_id         TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  academic_year     TEXT NOT NULL,
  source_chapter_id TEXT NOT NULL REFERENCES budget_chapters(id) ON DELETE CASCADE, -- ligne source
  dest_chapter_id   TEXT NOT NULL REFERENCES budget_chapters(id) ON DELETE CASCADE, -- ligne destination
  amount            INTEGER NOT NULL DEFAULT 0,
  reason            TEXT,
  receipt           TEXT,
  requester         TEXT,
  requested_by      TEXT,
  status            TEXT NOT NULL DEFAULT 'pending',  -- pending|approved|refused|applied
  source_before     INTEGER, source_after INTEGER,   -- montant annuel de la ligne source
  dest_before       INTEGER, dest_after   INTEGER,    -- montant annuel de la ligne destination
  decision_note     TEXT,
  decided_by        TEXT, decided_by_id TEXT, decided_role TEXT, decided_at TEXT,
  created_by        TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (amount > 0),
  CHECK (source_chapter_id <> dest_chapter_id),
  CHECK (status IN ('pending','approved','refused','applied'))
);
CREATE INDEX IF NOT EXISTS idx_blr_school ON budget_line_reallocations(school_id, academic_year);

-- --- Ressources Humaines (satellites du dossier `staff`) -----
-- Pas de paie. Chaque entité est rattachée à un agent (staff_id).
CREATE TABLE IF NOT EXISTS hr_contracts (
  id TEXT PRIMARY KEY, school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  staff_id TEXT NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'cdi', reference TEXT, title TEXT,
  start_date TEXT, end_date TEXT, salary INTEGER, status TEXT NOT NULL DEFAULT 'active',
  document TEXT, notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS hr_leaves (
  id TEXT PRIMARY KEY, school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  staff_id TEXT NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'annuel', start_date TEXT, end_date TEXT, days INTEGER,
  reason TEXT, status TEXT NOT NULL DEFAULT 'pending', decided_by TEXT, decided_at TEXT, notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS hr_evaluations (
  id TEXT PRIMARY KEY, school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  staff_id TEXT NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  eval_date TEXT, period TEXT, evaluator TEXT, score REAL, rating TEXT,
  strengths TEXT, improvements TEXT, comments TEXT, status TEXT NOT NULL DEFAULT 'draft',
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS hr_attendance (
  id TEXT PRIMARY KEY, school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  staff_id TEXT NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  att_date TEXT, status TEXT NOT NULL DEFAULT 'present', check_in TEXT, check_out TEXT, notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS hr_career_events (
  id TEXT PRIMARY KEY, school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  staff_id TEXT NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  event_date TEXT, type TEXT NOT NULL DEFAULT 'autre', title TEXT, description TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_hr_contracts_staff ON hr_contracts(staff_id);
CREATE INDEX IF NOT EXISTS idx_hr_leaves_staff ON hr_leaves(staff_id);
CREATE INDEX IF NOT EXISTS idx_hr_evaluations_staff ON hr_evaluations(staff_id);
CREATE INDEX IF NOT EXISTS idx_hr_attendance_staff ON hr_attendance(staff_id);
CREATE INDEX IF NOT EXISTS idx_hr_career_staff ON hr_career_events(staff_id);

-- --- Gouvernance du complexe (rôles de direction) ------------
-- Rôles cumulables au rôle de base (school_users.role INCHANGÉ). Servent aux
-- workflows de validation à venir. En LAN, l'autorisation d'attribution est
-- portée par le serveur (pas de RLS/RPC SECURITY DEFINER hors-ligne).
CREATE TABLE IF NOT EXISTS user_governance_roles (
  id          TEXT PRIMARY KEY,
  school_id   TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL,
  role        TEXT NOT NULL,
  sector      TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (school_id, user_id, role)
);
CREATE INDEX IF NOT EXISTS idx_ugr_user ON user_governance_roles(school_id, user_id);

-- Catalogue de rôles CONFIGURABLE par école (miroir de supabase_governance_catalog.sql).
-- Le moteur (src/governance/governanceEngine.js) en dérive permissions/menus/dashboards.
CREATE TABLE IF NOT EXISTS governance_roles (
  id          TEXT PRIMARY KEY,
  school_id   TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  code        TEXT NOT NULL,
  name        TEXT NOT NULL,
  description TEXT,
  rank        INTEGER NOT NULL DEFAULT 0,
  scope       TEXT NOT NULL DEFAULT 'complex',
  sector      TEXT,
  permissions TEXT NOT NULL DEFAULT '[]',
  pages       TEXT NOT NULL DEFAULT '[]',
  dashboards  TEXT NOT NULL DEFAULT '[]',
  workflows   TEXT NOT NULL DEFAULT '[]',
  active      INTEGER NOT NULL DEFAULT 1,
  is_system   INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (school_id, code)
);
CREATE INDEX IF NOT EXISTS idx_gov_roles_school ON governance_roles(school_id);

-- Historique des changements de rôle.
CREATE TABLE IF NOT EXISTS governance_role_history (
  id          TEXT PRIMARY KEY,
  school_id   TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL,
  role_code   TEXT NOT NULL,
  action      TEXT NOT NULL,
  sector      TEXT,
  start_date  TEXT,
  end_date    TEXT,
  actor_id    TEXT,
  actor_name  TEXT,
  detail      TEXT NOT NULL DEFAULT '{}',
  at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_gov_hist_school ON governance_role_history(school_id, at);

-- --- Catalogue de frais (obligatoires / optionnels) ----------
-- Configurable par établissement. student_fee_items = liste de frais par élève.
CREATE TABLE IF NOT EXISTS fee_catalog (
  id TEXT PRIMARY KEY, school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL, category TEXT NOT NULL DEFAULT 'autre', amount INTEGER NOT NULL DEFAULT 0,
  academic_year TEXT, level TEXT, class_id TEXT REFERENCES classes(id) ON DELETE SET NULL,
  mandatory INTEGER NOT NULL DEFAULT 0, optional INTEGER NOT NULL DEFAULT 1,
  payment_type TEXT NOT NULL DEFAULT 'unique', start_date TEXT, end_date TEXT,
  active INTEGER NOT NULL DEFAULT 1, position INTEGER NOT NULL DEFAULT 0, notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS student_fee_items (
  id TEXT PRIMARY KEY, school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  fee_catalog_id TEXT REFERENCES fee_catalog(id) ON DELETE SET NULL,
  academic_year TEXT, name TEXT NOT NULL, category TEXT NOT NULL DEFAULT 'autre',
  amount INTEGER NOT NULL DEFAULT 0, mandatory INTEGER NOT NULL DEFAULT 0,
  payment_type TEXT NOT NULL DEFAULT 'unique', status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (student_id, fee_catalog_id, academic_year)
);
CREATE INDEX IF NOT EXISTS idx_fee_catalog_school ON fee_catalog(school_id, academic_year);
CREATE INDEX IF NOT EXISTS idx_student_fee_items_student ON student_fee_items(student_id, academic_year);

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

-- Réglages LOCAUX (clé/valeur) — ex. activation du mode hybride depuis l'app,
-- sans variable d'environnement. Non synchronisé (propre à ce poste).
CREATE TABLE IF NOT EXISTS app_settings (
  key   TEXT PRIMARY KEY,
  value TEXT
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

-- File de REJEU du pull : lignes distantes dont l'upsert a échoué (FK parent
-- absent, dérive de schéma…). Le curseur avance quand même (progrès), mais ces
-- lignes sont REJOUÉES à chaque cycle → aucune perte silencieuse ; un backlog qui
-- ne se draine pas est REMONTÉ dans la santé (badge). Clé métier = (table, row_id).
CREATE TABLE IF NOT EXISTS sync_pull_retry (
  tablename  TEXT NOT NULL,
  row_id     TEXT NOT NULL,
  row_json   TEXT NOT NULL,          -- la ligne distante complète, à ré-appliquer
  attempts   INTEGER NOT NULL DEFAULT 1,
  first_seen TEXT NOT NULL,
  last_at    TEXT,
  last_error TEXT,
  PRIMARY KEY (tablename, row_id)
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
-- Barème OFFICIEL (points) d'un critère pour une sous-compétence, PAR NIVEAU —
-- remplace le poids uniforme /10 : chaque sous-compétence a son propre total de
-- points (ex. 1A = Orale 20 + Écrite 15 + Savoir-être 5 = 40 en SIL/CP), variable
-- par niveau. Compétence '6a' (sport) a DEUX profils, sélectionnés par l'aptitude
-- de l'élève (students.sport_aptitude) — cf. server/db.js/primEngine.js.
CREATE TABLE IF NOT EXISTS prim_bareme_criteres (
  id            TEXT PRIMARY KEY,
  niveau_id     TEXT NOT NULL REFERENCES prim_niveaux(id)     ON DELETE CASCADE,
  competence_id TEXT NOT NULL REFERENCES prim_competences(id) ON DELETE CASCADE,
  critere_id    TEXT NOT NULL REFERENCES prim_criteres(id),
  aptitude      TEXT NOT NULL DEFAULT 'apte', -- 'apte' | 'inapte' ; sans objet hors '6a'
  points_max    NUMERIC NOT NULL,
  ordre         INTEGER NOT NULL,
  CONSTRAINT prim_bareme_criteres_uniq UNIQUE (niveau_id, competence_id, critere_id, aptitude)
);
CREATE INDEX IF NOT EXISTS idx_prim_bareme_lookup ON prim_bareme_criteres(niveau_id, competence_id, aptitude);

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

-- `ua` (Unité d'Apprentissage, 1-8) remplace `trimestre_id` : le référentiel officiel
-- note par UA, pas par trimestre. Le trimestre reste dérivable (ua<=3→t1, <=6→t2,
-- sinon→t3) via primEngine.trimestreOfUA — jamais stocké, pour éviter toute
-- incohérence UA/trimestre.
CREATE TABLE IF NOT EXISTS prim_notes (
  id            TEXT PRIMARY KEY,
  school_id     TEXT NOT NULL REFERENCES schools(id)  ON DELETE CASCADE,
  eleve_id      TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  competence_id TEXT NOT NULL REFERENCES prim_competences(id),
  critere_id    TEXT NOT NULL REFERENCES prim_criteres(id),
  ua            INTEGER NOT NULL CHECK (ua BETWEEN 1 AND 8),
  note          NUMERIC,
  enseignant_id TEXT,
  date_saisie   TEXT,
  updated_at    TEXT,
  version       INTEGER NOT NULL DEFAULT 1,
  device_id     TEXT,
  CONSTRAINT prim_notes_uniq UNIQUE (eleve_id, competence_id, critere_id, ua)
);
CREATE INDEX IF NOT EXISTS idx_prim_notes_school  ON prim_notes(school_id);
CREATE INDEX IF NOT EXISTS idx_prim_notes_student ON prim_notes(eleve_id);

-- ============================================================
-- Socle P0 — Event Store (outbox), Audit Log, domaine Signalement
-- ============================================================
CREATE TABLE IF NOT EXISTS domain_events (
  id             TEXT PRIMARY KEY,
  school_id      TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  aggregate_type TEXT NOT NULL,
  aggregate_id   TEXT,
  event_type     TEXT NOT NULL,
  payload        TEXT NOT NULL DEFAULT '{}',   -- JSON sérialisé
  actor_id       TEXT,
  actor_name     TEXT,
  correlation_id TEXT,
  occurred_at    TEXT,
  seq            INTEGER,
  device_id      TEXT
);
CREATE INDEX IF NOT EXISTS idx_domain_events_school ON domain_events(school_id, seq);
CREATE INDEX IF NOT EXISTS idx_domain_events_agg    ON domain_events(school_id, aggregate_type, aggregate_id);

CREATE TABLE IF NOT EXISTS audit_events (
  id             TEXT PRIMARY KEY,
  school_id      TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  action         TEXT NOT NULL,
  aggregate_type TEXT,
  target_id      TEXT,
  actor_id       TEXT,
  actor_name     TEXT,
  payload        TEXT NOT NULL DEFAULT '{}',
  correlation_id TEXT,
  event_id       TEXT,
  at             TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_events_school ON audit_events(school_id, at);

-- H3-b : registre des DÉCISIONS DISTANTES DÉJÀ TRAITÉES (idempotence + audit
-- d'application). Clé = id de l'événement de décision (Cloud). Toute décision
-- (appliquée OU rejetée) y est inscrite UNE fois → une même décision reçue deux
-- fois (rejeu de sync, reconnexion) n'est jamais ré-appliquée. `result` trace
-- l'issue (applied | rejected_version_conflict | rejected_unauthorized | …).
CREATE TABLE IF NOT EXISTS applied_decisions (
  event_id    TEXT PRIMARY KEY,   -- id de l'événement de décision distant
  expense_id  TEXT,
  decision    TEXT,               -- approve | refuse
  result      TEXT,               -- applied | rejected_*
  applied_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_applied_decisions_expense ON applied_decisions(expense_id);

-- H3b-3 : registre des OPÉRATIONS BUDGÉTAIRES DISTANTES DÉJÀ TRAITÉES (idempotence +
-- audit d'application). Clé = id de l'événement d'intention (BudgetOperationRequested).
-- Chaque intention (appliquée OU rejetée) y est inscrite UNE fois → aucune double
-- création / double activation même en cas de rejeu (reconnexion, reprise). Une
-- intention DIFFÉRÉE (dépendance causale absente) N'Y est PAS inscrite → elle sera
-- réessayée au prochain cycle. `result` trace l'issue
-- (applied | rejected_version_conflict | rejected_unauthorized | rejected_rule | …).
CREATE TABLE IF NOT EXISTS applied_budget_ops (
  event_id     TEXT PRIMARY KEY,   -- id de l'événement d'intention (Cloud)
  op           TEXT,               -- create | modify | allocate | activate | revise | reallocate
  target       TEXT,               -- budget | line | allocation
  aggregate_id TEXT,               -- identité autoritaire de l'agrégat visé (I5)
  result       TEXT,               -- applied | rejected_*
  applied_at   TEXT
);
CREATE INDEX IF NOT EXISTS idx_applied_budget_ops_agg ON applied_budget_ops(aggregate_id);

CREATE TABLE IF NOT EXISTS signalements (
  id             TEXT PRIMARY KEY,
  school_id      TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  reporter_id    TEXT,
  reporter_name  TEXT,
  domain         TEXT NOT NULL,
  title          TEXT NOT NULL,
  description    TEXT DEFAULT '',
  priority       TEXT NOT NULL DEFAULT 'normal',
  status         TEXT NOT NULL DEFAULT 'new',
  assignee_id    TEXT,
  resolution     TEXT,
  correlation_id TEXT,
  created_at     TEXT,
  updated_at     TEXT,
  version        INTEGER NOT NULL DEFAULT 1,
  device_id      TEXT
);
CREATE INDEX IF NOT EXISTS idx_signalements_school ON signalements(school_id, status);
CREATE INDEX IF NOT EXISTS idx_signalements_domain ON signalements(school_id, domain);

-- --- Immobilisations (patrimoine) : registre + journaux -------
CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY, school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  category TEXT NOT NULL DEFAULT 'mobilier', asset_number TEXT, name TEXT NOT NULL, value INTEGER,
  acquisition_date TEXT, status TEXT NOT NULL DEFAULT 'active', location TEXT, serial_number TEXT,
  unit_id TEXT REFERENCES school_units(id) ON DELETE SET NULL, notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS asset_breakdowns (
  id TEXT PRIMARY KEY, school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  date TEXT, description TEXT, severity TEXT, status TEXT NOT NULL DEFAULT 'open', reported_by TEXT, notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS asset_repairs (
  id TEXT PRIMARY KEY, school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  date TEXT, description TEXT, provider TEXT, cost INTEGER, status TEXT NOT NULL DEFAULT 'done', notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS asset_expenses (
  id TEXT PRIMARY KEY, school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  date TEXT, category TEXT, amount INTEGER, supplier TEXT, notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_asset_breakdowns ON asset_breakdowns(asset_id);
CREATE INDEX IF NOT EXISTS idx_asset_repairs ON asset_repairs(asset_id);
CREATE INDEX IF NOT EXISTS idx_asset_expenses ON asset_expenses(asset_id);

-- --- Notifications (moteur multi-canaux ; interne implémenté) -
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY, school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  recipient_id TEXT, recipient_role TEXT, type TEXT NOT NULL DEFAULT 'info',
  title TEXT NOT NULL, body TEXT, link TEXT, read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS notification_outbox (
  id TEXT PRIMARY KEY, school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  notification_id TEXT REFERENCES notifications(id) ON DELETE CASCADE,
  channel TEXT NOT NULL, address TEXT, status TEXT NOT NULL DEFAULT 'pending',
  error TEXT, attempts INTEGER NOT NULL DEFAULT 0, payload TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_notifications_school ON notifications(school_id, recipient_id);
CREATE INDEX IF NOT EXISTS idx_notif_outbox ON notification_outbox(school_id, status);

-- --- Reports (Signalements) : commentaires + historique ------
CREATE TABLE IF NOT EXISTS signalement_comments (
  id TEXT PRIMARY KEY, school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  signalement_id TEXT NOT NULL REFERENCES signalements(id) ON DELETE CASCADE,
  author TEXT, author_id TEXT, body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS signalement_history (
  id TEXT PRIMARY KEY, school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  signalement_id TEXT NOT NULL REFERENCES signalements(id) ON DELETE CASCADE,
  action TEXT NOT NULL, from_status TEXT, to_status TEXT, detail TEXT, actor TEXT, actor_id TEXT,
  at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sig_comments ON signalement_comments(signalement_id);
CREATE INDEX IF NOT EXISTS idx_sig_history ON signalement_history(signalement_id);

-- ============================================================
-- Vie Scolaire (discipline) — miroir LAN de supabase_vie_scolaire.sql
-- Le surveillant : retards, incidents, sanctions, avertissements, retenues,
-- convocations, sorties, conseil de discipline. `recorded_by`/`responsible`
-- pointent vers un compte (users.id) → remappés par l'ETL.
-- ============================================================
CREATE TABLE IF NOT EXISTS late_arrivals (
  id            TEXT PRIMARY KEY,
  school_id     TEXT NOT NULL REFERENCES schools(id)  ON DELETE CASCADE,
  student_id    TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  class_id      TEXT REFERENCES classes(id) ON DELETE SET NULL,
  year_label    TEXT,
  date          TEXT NOT NULL DEFAULT (date('now')),
  arrival_time  TEXT,
  reason        TEXT,
  justified     INTEGER NOT NULL DEFAULT 0,
  justification TEXT,
  validated     INTEGER NOT NULL DEFAULT 0,
  sequence_order INTEGER,
  recorded_by   TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT,
  version       INTEGER NOT NULL DEFAULT 1,
  device_id     TEXT
);
CREATE INDEX IF NOT EXISTS idx_late_arrivals ON late_arrivals(school_id, date);

CREATE TABLE IF NOT EXISTS disciplinary_incidents (
  id            TEXT PRIMARY KEY,
  school_id     TEXT NOT NULL REFERENCES schools(id)  ON DELETE CASCADE,
  student_id    TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  class_id      TEXT REFERENCES classes(id) ON DELETE SET NULL,
  year_label    TEXT,
  incident_type TEXT NOT NULL DEFAULT 'autre',
  custom_type   TEXT,
  date          TEXT NOT NULL DEFAULT (date('now')),
  incident_time TEXT,
  location      TEXT,
  description   TEXT,
  witnesses     TEXT,
  severity      TEXT NOT NULL DEFAULT 'mineur',
  responsible   TEXT,
  decision      TEXT,
  status        TEXT NOT NULL DEFAULT 'ouvert',
  sequence_order INTEGER,
  recorded_by   TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT,
  version       INTEGER NOT NULL DEFAULT 1,
  device_id     TEXT
);
CREATE INDEX IF NOT EXISTS idx_disc_incidents ON disciplinary_incidents(school_id, date);

CREATE TABLE IF NOT EXISTS disciplinary_actions (
  id            TEXT PRIMARY KEY,
  school_id     TEXT NOT NULL REFERENCES schools(id)  ON DELETE CASCADE,
  student_id    TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  class_id      TEXT REFERENCES classes(id) ON DELETE SET NULL,
  incident_id   TEXT REFERENCES disciplinary_incidents(id) ON DELETE SET NULL,
  year_label    TEXT,
  action_type   TEXT NOT NULL DEFAULT 'avertissement_oral',
  date          TEXT NOT NULL DEFAULT (date('now')),
  reason        TEXT,
  duration_days INTEGER,
  start_date    TEXT,
  end_date      TEXT,
  decided_by    TEXT,
  notes         TEXT,
  sequence_order INTEGER,
  recorded_by   TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT,
  version       INTEGER NOT NULL DEFAULT 1,
  device_id     TEXT
);
CREATE INDEX IF NOT EXISTS idx_disc_actions ON disciplinary_actions(school_id, date);

CREATE TABLE IF NOT EXISTS student_warnings (
  id            TEXT PRIMARY KEY,
  school_id     TEXT NOT NULL REFERENCES schools(id)  ON DELETE CASCADE,
  student_id    TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  class_id      TEXT REFERENCES classes(id) ON DELETE SET NULL,
  year_label    TEXT,
  warning_type  TEXT NOT NULL DEFAULT 'oral',
  category      TEXT,
  date          TEXT NOT NULL DEFAULT (date('now')),
  reason        TEXT,
  acknowledged  INTEGER NOT NULL DEFAULT 0,
  recorded_by   TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT,
  version       INTEGER NOT NULL DEFAULT 1,
  device_id     TEXT
);
CREATE INDEX IF NOT EXISTS idx_student_warnings ON student_warnings(school_id, date);

CREATE TABLE IF NOT EXISTS student_detentions (
  id             TEXT PRIMARY KEY,
  school_id      TEXT NOT NULL REFERENCES schools(id)  ON DELETE CASCADE,
  student_id     TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  class_id       TEXT REFERENCES classes(id) ON DELETE SET NULL,
  action_id      TEXT REFERENCES disciplinary_actions(id) ON DELETE SET NULL,
  year_label     TEXT,
  date           TEXT NOT NULL DEFAULT (date('now')),
  start_time     TEXT,
  end_time       TEXT,
  duration_hours NUMERIC,
  task           TEXT,
  supervised_by  TEXT,
  completed      INTEGER NOT NULL DEFAULT 0,
  recorded_by    TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT,
  version        INTEGER NOT NULL DEFAULT 1,
  device_id      TEXT
);
CREATE INDEX IF NOT EXISTS idx_student_detentions ON student_detentions(school_id, date);

CREATE TABLE IF NOT EXISTS parent_meetings (
  id            TEXT PRIMARY KEY,
  school_id     TEXT NOT NULL REFERENCES schools(id)  ON DELETE CASCADE,
  student_id    TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  class_id      TEXT REFERENCES classes(id) ON DELETE SET NULL,
  incident_id   TEXT REFERENCES disciplinary_incidents(id) ON DELETE SET NULL,
  year_label    TEXT,
  target        TEXT NOT NULL DEFAULT 'parent',
  reason        TEXT,
  meeting_date  TEXT,
  meeting_time  TEXT,
  location      TEXT,
  status        TEXT NOT NULL DEFAULT 'planifie',
  outcome       TEXT,
  convened_by   TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT,
  version       INTEGER NOT NULL DEFAULT 1,
  device_id     TEXT
);
CREATE INDEX IF NOT EXISTS idx_parent_meetings ON parent_meetings(school_id, meeting_date);

CREATE TABLE IF NOT EXISTS exit_permissions (
  id             TEXT PRIMARY KEY,
  school_id      TEXT NOT NULL REFERENCES schools(id)  ON DELETE CASCADE,
  student_id     TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  class_id       TEXT REFERENCES classes(id) ON DELETE SET NULL,
  year_label     TEXT,
  exit_type      TEXT NOT NULL DEFAULT 'parentale',
  date           TEXT NOT NULL DEFAULT (date('now')),
  exit_time      TEXT,
  return_time    TEXT,
  reason         TEXT,
  authorized_by  TEXT,
  accompanied_by TEXT,
  returned       INTEGER NOT NULL DEFAULT 0,
  signature      TEXT,
  recorded_by    TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT,
  version        INTEGER NOT NULL DEFAULT 1,
  device_id      TEXT
);
CREATE INDEX IF NOT EXISTS idx_exit_permissions ON exit_permissions(school_id, date);

CREATE TABLE IF NOT EXISTS discipline_statistics (
  id            TEXT PRIMARY KEY,
  school_id     TEXT NOT NULL REFERENCES schools(id)  ON DELETE CASCADE,
  student_id    TEXT REFERENCES students(id) ON DELETE CASCADE,
  class_id      TEXT REFERENCES classes(id) ON DELETE SET NULL,
  incident_id   TEXT REFERENCES disciplinary_incidents(id) ON DELETE SET NULL,
  year_label    TEXT,
  council_date  TEXT,
  members       TEXT,
  summary       TEXT,
  decision      TEXT,
  sanction_type TEXT,
  status        TEXT NOT NULL DEFAULT 'convoque',
  recorded_by   TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT,
  version       INTEGER NOT NULL DEFAULT 1,
  device_id     TEXT
);
CREATE INDEX IF NOT EXISTS idx_discipline_statistics ON discipline_statistics(school_id, council_date);
