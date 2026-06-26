-- ════════════════════════════════════════════════════════════════════════════
-- FRAIS DE SCOLARITÉ FLEXIBLES — grille tarifaire par classe
-- ════════════════════════════════════════════════════════════════════════════
-- Chaque classe peut définir, pour une année :
--   • un tarif COMPTANT (réduit, payé en une fois) ;
--   • un tarif ÉCHELONNÉ (total) avec une liste de tranches (libellé/montant/date) ;
-- À l'inscription, le comptable fige le mode de paiement de l'élève
-- (student_fees.payment_mode) + un instantané des tranches applicables.
-- Architecture évolutive : student_fees.adjustments (jsonb) accueille les
-- bourses / remises / réductions familiales sans changement de schéma.
--
-- À exécuter UNE fois dans Supabase → SQL Editor → Run.
-- Le LAN (SQLite) se migre seul au démarrage (ensureColumn + CREATE TABLE IF NOT
-- EXISTS dans server/db.js / server/schema.sql).
-- ════════════════════════════════════════════════════════════════════════════

-- 1. Colonnes additionnelles sur student_fees -------------------------------
ALTER TABLE public.student_fees
  ADD COLUMN IF NOT EXISTS tranches     jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS payment_mode text,
  ADD COLUMN IF NOT EXISTS adjustments  jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.student_fees.tranches IS
  'Instantané des tranches applicables à l''élève (figé à l''inscription) : [{id,label,amount,due_date}].';
COMMENT ON COLUMN public.student_fees.payment_mode IS
  'Mode de paiement figé pour l''année : comptant | echelonne | libre (legacy/manuel).';
COMMENT ON COLUMN public.student_fees.adjustments IS
  'Ajustements tarifaires : [{id,type,label,mode:amount|percent,value}] (bourses, remises, réductions familiales…).';

-- 2. Table des grilles tarifaires par classe --------------------------------
CREATE TABLE IF NOT EXISTS public.class_fee_grids (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  class_id         uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  academic_year    text NOT NULL,
  amount_comptant  integer NOT NULL DEFAULT 0,   -- tarif réduit payé en une fois
  amount_echelonne integer NOT NULL DEFAULT 0,   -- total en paiement échelonné
  tranches         jsonb   NOT NULL DEFAULT '[]'::jsonb, -- [{id,label,amount,due_date}]
  currency         text    NOT NULL DEFAULT 'FCFA',
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (class_id, academic_year)
);

-- 3. RLS --------------------------------------------------------------------
ALTER TABLE public.class_fee_grids ENABLE ROW LEVEL SECURITY;

-- Lecture : tout membre actif de l'école.
DROP POLICY IF EXISTS "school members read fee grids" ON public.class_fee_grids;
CREATE POLICY "school members read fee grids"
  ON public.class_fee_grids FOR SELECT
  USING (
    school_id IN (
      SELECT school_id FROM school_users
       WHERE user_id = auth.uid() AND active = true
    )
  );

-- Écriture : admin + censeur (responsable des frais).
DROP POLICY IF EXISTS "fee managers manage fee grids" ON public.class_fee_grids;
CREATE POLICY "fee managers manage fee grids"
  ON public.class_fee_grids FOR ALL
  USING (
    school_id IN (
      SELECT school_id FROM school_users
       WHERE user_id = auth.uid() AND active = true AND role IN ('admin', 'censeur')
    )
  )
  WITH CHECK (
    school_id IN (
      SELECT school_id FROM school_users
       WHERE user_id = auth.uid() AND active = true AND role IN ('admin', 'censeur')
    )
  );

-- 4. Index ------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS class_fee_grids_school_year_idx
  ON public.class_fee_grids (school_id, academic_year);
CREATE INDEX IF NOT EXISTS class_fee_grids_class_idx
  ON public.class_fee_grids (class_id);

-- 5. Colonnes de synchronisation continue (Phase 2) -------------------------
--    Alignées sur supabase_sync_phase2.sql : updated_at / version / device_id
--    + trigger touch_sync_row (réutilise la fonction existante si présente).
ALTER TABLE public.class_fee_grids
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS version    integer     NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS device_id  text;

DO $$
BEGIN
  IF to_regprocedure('public.touch_sync_row()') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_touch_class_fee_grids ON public.class_fee_grids;
    CREATE TRIGGER trg_touch_class_fee_grids
      BEFORE UPDATE ON public.class_fee_grids
      FOR EACH ROW EXECUTE FUNCTION public.touch_sync_row();
  END IF;
END $$;

-- 6. Portail parent : exposer le mode + l'échéancier figé dans le « fee » ----
--    (le portail n'a pas accès aux grilles ; l'instantané tranches suffit au
--    moteur tarifaire pour afficher tranches payées / attendue / retard).
CREATE OR REPLACE FUNCTION public.get_parent_portal_data(p_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id uuid;
  v_class_id   uuid;
  v_school_id  uuid;
BEGIN
  SELECT id, class_id, school_id
    INTO v_student_id, v_class_id, v_school_id
    FROM students
   WHERE parent_token = p_token;

  IF v_student_id IS NULL THEN RETURN NULL; END IF;

  RETURN jsonb_build_object(
    'student', (
      SELECT jsonb_build_object(
        'id',             id,
        'name',           name,
        'matricule',      matricule,
        'gender',         gender,
        'date_naissance', date_naissance
      ) FROM students WHERE id = v_student_id
    ),
    'class', (
      SELECT jsonb_build_object('id', id, 'name', name, 'cycle', cycle, 'system', system)
        FROM classes WHERE id = v_class_id
    ),
    'school', (
      SELECT jsonb_build_object('name', name, 'type', type, 'logo_url', logo_url, 'language', language, 'currency', currency)
        FROM schools WHERE id = v_school_id
    ),
    'fee', (
      SELECT jsonb_build_object(
        'frais_annuels',         frais_annuels,
        'frais_payes',           frais_payes,
        'date_dernier_paiement', date_dernier_paiement,
        'payment_mode',          payment_mode,
        'tranches',              COALESCE(tranches, '[]'::jsonb),
        'adjustments',           COALESCE(adjustments, '[]'::jsonb)
      )
      FROM student_fees WHERE student_id = v_student_id
      ORDER BY created_at DESC LIMIT 1
    ),
    'subjects', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object('id', id, 'name', name, 'coef', coef, 'max', COALESCE("max", 20))
        ORDER BY coef DESC
      )
      FROM subjects WHERE class_id = v_class_id
    ), '[]'::jsonb),
    'grades', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object('subject_id', subject_id, 'sequence', sequence, 'value', value)
      )
      FROM grades WHERE student_id = v_student_id
    ), '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_parent_portal_data(uuid) TO anon;
