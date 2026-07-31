-- ============================================================
-- NotesCam SaaS — Sprint 19 : Dates séquences + profil enseignant
-- À coller dans : Supabase → SQL Editor → New query → Run
-- ============================================================


-- ============================================================
-- 1. TABLE sequence_dates — calendrier scolaire par école
-- ============================================================
CREATE TABLE IF NOT EXISTS sequence_dates (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  seq_key       text NOT NULL,   -- 'fr_seq_1'…'fr_seq_6', 'en_term_1'…'en_term_3'
  seq_label     text NOT NULL,
  exam_date     date,
  deadline_date date,            -- date limite saisie des notes
  conseil_date  date,            -- date conseil de classe
  updated_at    timestamptz DEFAULT now(),
  UNIQUE(school_id, seq_key)
);

CREATE INDEX IF NOT EXISTS seq_dates_school_idx ON sequence_dates(school_id);

ALTER TABLE sequence_dates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "seq_dates: lecture membres" ON sequence_dates;
CREATE POLICY "seq_dates: lecture membres"
  ON sequence_dates FOR SELECT
  USING (
    school_id IN (
      SELECT school_id FROM school_users
      WHERE user_id = auth.uid() AND active = true
    )
  );

DROP POLICY IF EXISTS "seq_dates: écriture admin" ON sequence_dates;
CREATE POLICY "seq_dates: écriture admin"
  ON sequence_dates FOR ALL
  USING (
    school_id IN (
      SELECT school_id FROM school_users
      WHERE user_id = auth.uid() AND active = true AND role = 'admin'
    )
  );


-- ============================================================
-- 2. RLS : enseignants peuvent mettre à jour leur propre profil
-- ============================================================
DROP POLICY IF EXISTS "teacher: update own profile" ON teachers;
CREATE POLICY "teacher: update own profile"
  ON teachers FOR UPDATE
  USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());


-- ============================================================
-- 3. RPC update_teacher_profile
--    Met à jour teachers.name + teachers.phone + school_users.full_name
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_teacher_profile(
  p_teacher_id uuid,
  p_name       text,
  p_phone      text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM teachers
    WHERE id = p_teacher_id AND auth_user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Non autorisé';
  END IF;

  UPDATE teachers
    SET name  = p_name,
        phone = NULLIF(TRIM(p_phone), '')
  WHERE id = p_teacher_id;

  UPDATE school_users
    SET full_name = p_name
  WHERE user_id = auth.uid();
END;
$$;


-- ============================================================
-- FIN Sprint 19
-- ============================================================
