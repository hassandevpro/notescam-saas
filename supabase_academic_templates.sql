-- ============================================================================
-- MODÈLES ACADÉMIQUES — génération atomique d'établissement (Phase 1)
-- ============================================================================
-- 1) Colonnes pour les matières composites (Phase 2, ajoutées dès maintenant) :
--      subjects.parent_id   → matière parente (null = matière principale)
--      subjects.calc_method → 'avg' | 'weighted_avg' | 'weighted_sum' | 'formula'
--      subjects.formula     → formule personnalisée (optionnelle)
--    + schools.bulletin_subject_mode → 'synthetic' (défaut) | 'detailed'
-- 2) RPC apply_academic_template : crée classes + matières en UNE transaction
--    (point #8 : aucun objet partiel en cas d'erreur). Insertions en masse.
--
-- À EXÉCUTER dans l'éditeur SQL Supabase (idempotent).
-- ============================================================================

ALTER TABLE public.subjects ADD COLUMN IF NOT EXISTS parent_id   uuid;
ALTER TABLE public.subjects ADD COLUMN IF NOT EXISTS calc_method text;
ALTER TABLE public.subjects ADD COLUMN IF NOT EXISTS formula     text;
CREATE INDEX IF NOT EXISTS idx_subjects_parent ON public.subjects(parent_id);

ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS bulletin_subject_mode text NOT NULL DEFAULT 'synthetic';

-- ── Génération atomique ─────────────────────────────────────────────────────
-- Les ids des classes/matières sont générés CÔTÉ CLIENT (uuid) afin de relier
-- matières↔classes et composantes↔parent avant l'appel. La fonction force
-- school_id = p_school_id (ignore toute valeur cliente) et exige le rôle admin.
CREATE OR REPLACE FUNCTION public.apply_academic_template(
  p_school_id uuid,
  p_classes   jsonb,
  p_subjects  jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_classes  int := 0;
  v_subjects int := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.school_users
    WHERE user_id = auth.uid() AND school_id = p_school_id
      AND role = 'admin' AND active = true
  ) THEN
    RAISE EXCEPTION 'Non autorisé';
  END IF;

  -- Classes
  INSERT INTO public.classes (id, school_id, name, level, section, system, cycle, current_year, max_students)
  SELECT (r->>'id')::uuid, p_school_id, r->>'name', r->>'level', NULLIF(r->>'section',''),
         COALESCE(NULLIF(r->>'system',''),'FR'), NULLIF(r->>'cycle',''),
         NULLIF(r->>'current_year',''), NULLIF(r->>'max_students','')::int
  FROM jsonb_array_elements(p_classes) AS r;
  GET DIAGNOSTICS v_classes = ROW_COUNT;

  -- Matières (et composantes : mêmes lignes, avec parent_id)
  INSERT INTO public.subjects (id, school_id, class_id, name, coef, max, position, parent_id, calc_method, formula)
  SELECT (r->>'id')::uuid, p_school_id, (r->>'class_id')::uuid, r->>'name',
         COALESCE((r->>'coef')::int, 1), COALESCE((r->>'max')::int, 20),
         NULLIF(r->>'position','')::int, NULLIF(r->>'parent_id','')::uuid,
         NULLIF(r->>'calc_method',''), NULLIF(r->>'formula','')
  FROM jsonb_array_elements(p_subjects) AS r;
  GET DIAGNOSTICS v_subjects = ROW_COUNT;

  RETURN jsonb_build_object('classes', v_classes, 'subjects', v_subjects);
END $$;

GRANT EXECUTE ON FUNCTION public.apply_academic_template(uuid, jsonb, jsonb) TO authenticated;
