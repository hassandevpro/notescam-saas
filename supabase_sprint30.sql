-- Sprint 30 : Portail Parents
-- Executer dans Supabase SQL Editor

-- 1. Token unique par élève (lien partageable avec les parents)
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS parent_token uuid DEFAULT gen_random_uuid();
UPDATE public.students SET parent_token = gen_random_uuid() WHERE parent_token IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS students_parent_token_idx ON public.students(parent_token);

-- 2. RPC publique — accès par token uniquement, sans auth requise
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
      SELECT jsonb_build_object('name', name, 'type', type, 'logo_url', logo_url, 'language', language)
        FROM schools WHERE id = v_school_id
    ),
    'fee', (
      SELECT jsonb_build_object(
        'frais_annuels',         frais_annuels,
        'frais_payes',           frais_payes,
        'date_dernier_paiement', date_dernier_paiement
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

-- 3. Accès anonyme (sans authentification)
GRANT EXECUTE ON FUNCTION public.get_parent_portal_data(uuid) TO anon;
