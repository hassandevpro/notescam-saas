-- ============================================================================
-- MODÈLES ACADÉMIQUES — IMPORT / FUSION INTELLIGENTE (Phase 3)
-- ============================================================================
-- merge_academic_template : importe un modèle dans un établissement EXISTANT,
-- en UNE transaction (point #8) :
--   * insère les classes nouvelles (p_classes)
--   * insère les matières nouvelles (p_subjects, rattachées aux classes
--     existantes ou nouvelles ; parent_id déjà résolu côté client)
--   * met à jour les matières en conflit (p_updates = [{id,coef,max}]) — optionnel
-- Le diff (doublons/conflits) est calculé côté client (buildMergePlan) ; cette
-- fonction n'écrase QUE ce qui est explicitement listé dans p_updates.
--
-- À EXÉCUTER dans l'éditeur SQL Supabase (idempotent).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.merge_academic_template(
  p_school_id uuid,
  p_classes   jsonb,
  p_subjects  jsonb,
  p_updates   jsonb DEFAULT '[]'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_classes  int := 0;
  v_subjects int := 0;
  v_updated  int := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.school_users
    WHERE user_id = auth.uid() AND school_id = p_school_id
      AND role = 'admin' AND active = true
  ) THEN
    RAISE EXCEPTION 'Non autorisé';
  END IF;

  INSERT INTO public.classes (id, school_id, name, level, section, system, cycle, current_year, max_students)
  SELECT (r->>'id')::uuid, p_school_id, r->>'name', r->>'level', NULLIF(r->>'section',''),
         COALESCE(NULLIF(r->>'system',''),'FR'), NULLIF(r->>'cycle',''),
         NULLIF(r->>'current_year',''), NULLIF(r->>'max_students','')::int
  FROM jsonb_array_elements(COALESCE(p_classes, '[]'::jsonb)) AS r;
  GET DIAGNOSTICS v_classes = ROW_COUNT;

  INSERT INTO public.subjects (id, school_id, class_id, name, coef, max, position, parent_id, calc_method, formula)
  SELECT (r->>'id')::uuid, p_school_id, (r->>'class_id')::uuid, r->>'name',
         COALESCE((r->>'coef')::int, 1), COALESCE((r->>'max')::int, 20),
         NULLIF(r->>'position','')::int, NULLIF(r->>'parent_id','')::uuid,
         NULLIF(r->>'calc_method',''), NULLIF(r->>'formula','')
  FROM jsonb_array_elements(COALESCE(p_subjects, '[]'::jsonb)) AS r;
  GET DIAGNOSTICS v_subjects = ROW_COUNT;

  UPDATE public.subjects s
     SET coef = COALESCE((u->>'coef')::int, s.coef),
         max  = COALESCE((u->>'max')::int, s.max)
  FROM jsonb_array_elements(COALESCE(p_updates, '[]'::jsonb)) AS u
  WHERE s.id = (u->>'id')::uuid AND s.school_id = p_school_id;
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  RETURN jsonb_build_object('classes', v_classes, 'subjects', v_subjects, 'updated', v_updated);
END $$;

GRANT EXECUTE ON FUNCTION public.merge_academic_template(uuid, jsonb, jsonb, jsonb) TO authenticated;
