-- ============================================================
-- NotesCam — Correctifs schéma DB (à exécuter dans SQL Editor)
-- ============================================================


-- ============================================================
-- 1. GRADES : ajouter updated_at (manquant à la création)
-- ============================================================
ALTER TABLE grades
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Trigger pour mettre à jour updated_at automatiquement
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS grades_updated_at ON grades;
CREATE TRIGGER grades_updated_at
  BEFORE UPDATE ON grades
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ============================================================
-- 2. STUDENTS : supprimer la contrainte unique sur (school_id, reg, year)
--    Les élèves sont identifiés par leur UUID id — reg peut être vide
-- ============================================================
ALTER TABLE students
  DROP CONSTRAINT IF EXISTS students_school_id_reg_year_key;

-- Supprimer aussi d'éventuelles variantes du même nom
ALTER TABLE students
  DROP CONSTRAINT IF EXISTS students_school_id_matricule_key;


-- ============================================================
-- 3. STUDENTS : colonnes Sprint 15 (au cas où pas encore appliqué)
-- ============================================================
ALTER TABLE students
  ADD COLUMN IF NOT EXISTS parent_phone text;


-- ============================================================
-- 4. CLASSES : colonne cycle (Sprint 15)
-- ============================================================
ALTER TABLE classes
  ADD COLUMN IF NOT EXISTS cycle text NOT NULL DEFAULT 'secondaire';


-- ============================================================
-- 5. SCHOOLS : colonnes manquantes (Settings page)
-- ============================================================
ALTER TABLE schools
  ADD COLUMN IF NOT EXISTS division      text,
  ADD COLUMN IF NOT EXISTS subdivision   text,
  ADD COLUMN IF NOT EXISTS address       text,
  ADD COLUMN IF NOT EXISTS phone         text,
  ADD COLUMN IF NOT EXISTS logo_url      text,
  ADD COLUMN IF NOT EXISTS stamp_url     text,
  ADD COLUMN IF NOT EXISTS signature_url text;


-- ============================================================
-- 6. STUDENT_FEES : table Sprint 15 (au cas où pas encore appliqué)
-- ============================================================
CREATE TABLE IF NOT EXISTS student_fees (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id             uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id            uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  academic_year         text NOT NULL,
  frais_annuels         integer NOT NULL DEFAULT 0,
  frais_payes           integer NOT NULL DEFAULT 0,
  date_dernier_paiement date,
  notes                 text,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now(),
  UNIQUE(student_id, academic_year)
);

ALTER TABLE student_fees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fees: lecture par membres" ON student_fees;
CREATE POLICY "fees: lecture par membres"
  ON student_fees FOR SELECT
  USING (school_id IN (
    SELECT school_id FROM school_users
    WHERE user_id = auth.uid() AND active = true
  ));

DROP POLICY IF EXISTS "fees: écriture par admins" ON student_fees;
CREATE POLICY "fees: écriture par admins"
  ON student_fees FOR ALL
  USING (school_id IN (
    SELECT school_id FROM school_users
    WHERE user_id = auth.uid() AND active = true AND role = 'admin'
  ));

DROP TRIGGER IF EXISTS fees_updated_at ON student_fees;
CREATE TRIGGER fees_updated_at
  BEFORE UPDATE ON student_fees
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ============================================================
-- 7. RLS school_users : policy sans récursion infinie
-- ============================================================
DROP POLICY IF EXISTS "school_users: lecture" ON school_users;
CREATE POLICY "school_users: lecture"
  ON school_users FOR SELECT
  USING (user_id = auth.uid());


-- ============================================================
-- 8. GRADES : contrainte unique pour l'upsert onConflict
-- ============================================================
ALTER TABLE grades
  DROP CONSTRAINT IF EXISTS grades_class_student_subject_seq_key;

ALTER TABLE grades
  ADD CONSTRAINT grades_class_student_subject_seq_key
  UNIQUE (class_id, student_id, subject_id, sequence);


-- ============================================================
-- 9. STUDENT_ABSENCES : absences + conduite (séparés des grades)
-- ============================================================
CREATE TABLE IF NOT EXISTS student_absences (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id  uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_id   uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  sequence   integer NOT NULL,
  abs_j      integer NOT NULL DEFAULT 0,
  abs_nj     integer NOT NULL DEFAULT 0,
  conduite   text,   -- 'TB' | 'B' | 'AB' | 'P' | 'M'
  UNIQUE(student_id, sequence)
);

ALTER TABLE student_absences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "absences: lecture par membres" ON student_absences;
CREATE POLICY "absences: lecture par membres"
  ON student_absences FOR SELECT
  USING (school_id IN (
    SELECT school_id FROM school_users
    WHERE user_id = auth.uid() AND active = true
  ));

DROP POLICY IF EXISTS "absences: écriture par membres" ON student_absences;
CREATE POLICY "absences: écriture par membres"
  ON student_absences FOR ALL
  USING (school_id IN (
    SELECT school_id FROM school_users
    WHERE user_id = auth.uid() AND active = true
  ));


-- ============================================================
-- FIN — tous les correctifs sont idempotents (IF NOT EXISTS / IF EXISTS)
-- ============================================================
