-- ============================================================
-- NotesCam — E6 : OPÉRATIONS budgétaires V3 (Cloud / Postgres)
-- À coller dans : Supabase → SQL Editor → New query → Run. Idempotent.
-- Requiert : supabase_budget_lines_v3.sql, supabase_budget_enforcement_v3.sql,
--            supabase_budget_enforcement_p3.sql (helper budget_actor_has_perm),
--            supabase_sync_phase2.sql.
-- ============================================================
--
-- • RÉALLOCATION entre LIGNES : transfert de montant annuel d'une ligne vers une
--   autre du MÊME budget annuel, SANS changer le total. Respecte les engagements,
--   atomique, historisée (auteur/date/avant-après/motif), via RPC SECURITY DEFINER.
-- • RÉVISION du budget annuel V3 : plancher = max(lignes activées, engagements).
-- • Le GEL E3 (budget_chapter_freeze) est CONTOURNÉ UNIQUEMENT par ces RPC, via un
--   drapeau transactionnel `notescam.budget_op` (impossible à poser en appel API
--   direct → le gel reste effectif pour toute écriture directe).

-- ── 1) Table de réallocation entre lignes ────────────────────────────────────
CREATE TABLE IF NOT EXISTS budget_line_reallocations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id         uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  academic_year     text NOT NULL,
  source_chapter_id uuid NOT NULL REFERENCES budget_chapters(id) ON DELETE CASCADE,
  dest_chapter_id   uuid NOT NULL REFERENCES budget_chapters(id) ON DELETE CASCADE,
  amount            bigint NOT NULL DEFAULT 0,
  reason            text, receipt text, requester text, requested_by text,
  status            text NOT NULL DEFAULT 'pending',
  source_before     bigint, source_after bigint, dest_before bigint, dest_after bigint,
  decision_note     text, decided_by text, decided_by_id text, decided_role text, decided_at timestamptz,
  created_by        text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz,
  CHECK (amount > 0), CHECK (source_chapter_id <> dest_chapter_id),
  CHECK (status IN ('pending','approved','refused','applied'))
);
CREATE INDEX IF NOT EXISTS idx_blr_school ON budget_line_reallocations(school_id, academic_year);

ALTER TABLE budget_line_reallocations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS budget_line_reallocations_ro ON budget_line_reallocations;
-- LECTURE seule (l'écriture passe EXCLUSIVEMENT par les RPC SECURITY DEFINER).
CREATE POLICY budget_line_reallocations_ro ON budget_line_reallocations
  FOR SELECT USING (school_id IN (SELECT school_id FROM school_users WHERE user_id = auth.uid()));

DO $$
BEGIN
  EXECUTE 'ALTER TABLE budget_line_reallocations ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1';
  EXECUTE 'ALTER TABLE budget_line_reallocations ADD COLUMN IF NOT EXISTS device_id text';
  IF to_regprocedure('public.touch_sync_row()') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_touch_blr ON budget_line_reallocations';
    EXECUTE 'CREATE TRIGGER trg_touch_blr BEFORE UPDATE ON budget_line_reallocations FOR EACH ROW EXECUTE FUNCTION public.touch_sync_row()';
  END IF;
  IF to_regprocedure('public.log_tombstone()') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_tomb_blr ON budget_line_reallocations';
    EXECUTE 'CREATE TRIGGER trg_tomb_blr AFTER DELETE ON budget_line_reallocations FOR EACH ROW EXECUTE FUNCTION public.log_tombstone()';
  END IF;
END $$;

-- ── 2) Gel E3 : bypass par drapeau transactionnel pour les RPC autorisés ──────
CREATE OR REPLACE FUNCTION public.budget_chapter_freeze() RETURNS trigger AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF current_setting('notescam.budget_op', true) = '1' THEN RETURN NEW; END IF;   -- RPC autorisé (réallocation/révision)
  IF OLD.scope IS NOT NULL AND OLD.status IN ('active','closed')
     AND (NEW.planned_amount IS DISTINCT FROM OLD.planned_amount OR NEW.scope IS DISTINCT FROM OLD.scope) THEN
    RAISE EXCEPTION 'Ligne active/clôturée : le montant ou la portée ne se modifie pas directement (réallocation / révision).';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── 3) RPC : créer une réallocation entre lignes ─────────────────────────────
CREATE OR REPLACE FUNCTION public.budget_create_line_realloc(
  p_source_chapter_id uuid, p_dest_chapter_id uuid, p_amount bigint, p_reason text, p_receipt text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_src budget_chapters%ROWTYPE; v_dst budget_chapters%ROWTYPE; v_school uuid; v_id uuid;
BEGIN
  SELECT * INTO v_src FROM budget_chapters WHERE id = p_source_chapter_id;
  SELECT * INTO v_dst FROM budget_chapters WHERE id = p_dest_chapter_id;
  IF v_src.id IS NULL OR v_dst.id IS NULL THEN RAISE EXCEPTION 'Ligne introuvable'; END IF;
  v_school := v_src.school_id;
  IF NOT EXISTS (SELECT 1 FROM school_users WHERE user_id = auth.uid() AND school_id = v_school) THEN RAISE EXCEPTION 'Non autorisé'; END IF;
  IF NOT budget_actor_has_perm(v_school, 'budget.reallocate.request') THEN RAISE EXCEPTION 'Permission requise : budget.reallocate.request'; END IF;
  IF v_src.id = v_dst.id THEN RAISE EXCEPTION 'Source et destination identiques'; END IF;
  IF v_src.scope IS NULL OR v_dst.scope IS NULL THEN RAISE EXCEPTION 'La réallocation concerne des lignes budgétaires'; END IF;
  IF v_src.budget_id <> v_dst.budget_id THEN RAISE EXCEPTION 'Les deux lignes doivent appartenir au même budget annuel'; END IF;
  IF COALESCE(p_amount,0) <= 0 THEN RAISE EXCEPTION 'Montant invalide'; END IF;
  IF COALESCE(btrim(p_reason),'') = '' THEN RAISE EXCEPTION 'Motif obligatoire'; END IF;

  v_id := gen_random_uuid();
  INSERT INTO budget_line_reallocations (id, school_id, academic_year, source_chapter_id, dest_chapter_id, amount, reason, receipt, requester, requested_by, status, created_by, created_at, updated_at)
  VALUES (v_id, v_school, COALESCE((SELECT academic_year FROM budgets WHERE id = v_src.budget_id), ''), v_src.id, v_dst.id, p_amount, btrim(p_reason), p_receipt,
          (SELECT full_name FROM school_users WHERE user_id = auth.uid() AND school_id = v_school LIMIT 1), auth.uid()::text, 'pending', auth.uid()::text, now(), now());
  RETURN v_id;
END;
$$;

-- ── 4) RPC : décider (approuver/refuser) une réallocation entre lignes ───────
CREATE OR REPLACE FUNCTION public.budget_decide_line_realloc(p_id uuid, p_decision text, p_note text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r budget_line_reallocations%ROWTYPE; v_src budget_chapters%ROWTYPE; v_dst budget_chapters%ROWTYPE;
        v_amount bigint; v_sb bigint; v_db bigint; v_sa bigint; v_da bigint; v_committed bigint; v_role text; v_name text;
BEGIN
  SELECT * INTO r FROM budget_line_reallocations WHERE id = p_id;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Demande introuvable'; END IF;
  IF NOT EXISTS (SELECT 1 FROM school_users WHERE user_id = auth.uid() AND school_id = r.school_id) THEN RAISE EXCEPTION 'Non autorisé'; END IF;
  IF NOT budget_actor_has_perm(r.school_id, 'budget.reallocate.decide') THEN RAISE EXCEPTION 'Permission requise : budget.reallocate.decide'; END IF;
  IF r.status <> 'pending' THEN RAISE EXCEPTION 'Demande déjà décidée'; END IF;
  SELECT role, full_name INTO v_role, v_name FROM school_users WHERE user_id = auth.uid() AND school_id = r.school_id LIMIT 1;

  IF p_decision <> 'approve' THEN
    UPDATE budget_line_reallocations SET status='refused', decision_note=p_note, decided_by=v_name, decided_by_id=auth.uid()::text, decided_role=v_role, decided_at=now(), updated_at=now() WHERE id = r.id;
    RETURN 'refused';
  END IF;

  SELECT * INTO v_src FROM budget_chapters WHERE id = r.source_chapter_id;
  SELECT * INTO v_dst FROM budget_chapters WHERE id = r.dest_chapter_id;
  IF v_src.id IS NULL OR v_dst.id IS NULL THEN RAISE EXCEPTION 'Ligne introuvable'; END IF;
  v_amount := r.amount; v_sb := COALESCE(v_src.planned_amount,0); v_db := COALESCE(v_dst.planned_amount,0);
  v_sa := v_sb - v_amount; v_da := v_db + v_amount;
  IF v_sa < 0 THEN RAISE EXCEPTION 'Réallocation impossible : montant supérieur à la ligne source'; END IF;
  SELECT COALESCE(SUM(amount),0) INTO v_committed FROM budget_expenses WHERE budget_chapter_id = v_src.id AND status IN ('submitted','approved','paid');
  IF v_sa < v_committed THEN RAISE EXCEPTION 'Réallocation refusée : la ligne source tomberait sous ses engagements (%).', v_committed; END IF;

  PERFORM set_config('notescam.budget_op', '1', true);   -- autorise le contournement du gel (transaction-local)
  UPDATE budget_chapters SET planned_amount = v_sa, updated_at = now() WHERE id = v_src.id;
  UPDATE budget_chapters SET planned_amount = v_da, updated_at = now() WHERE id = v_dst.id;
  UPDATE budget_line_reallocations SET status='applied', source_before=v_sb, source_after=v_sa, dest_before=v_db, dest_after=v_da,
    decision_note=p_note, decided_by=v_name, decided_by_id=auth.uid()::text, decided_role=v_role, decided_at=now(), updated_at=now() WHERE id = r.id;
  RETURN 'applied';
END;
$$;

-- ── 5) Révision annuelle V3 : plancher = max(lignes activées, engagements) ────
CREATE OR REPLACE FUNCTION public.budget_decide_revision(p_id uuid, p_decision text, p_note text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r budget_revisions%ROWTYPE; v_annual budgets%ROWTYPE; v_new bigint; v_lines bigint; v_committed bigint; v_role text; v_name text;
BEGIN
  SELECT * INTO r FROM budget_revisions WHERE id = p_id;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Demande introuvable'; END IF;
  IF NOT EXISTS (SELECT 1 FROM school_users WHERE user_id = auth.uid() AND school_id = r.school_id) THEN RAISE EXCEPTION 'Non autorisé'; END IF;
  IF NOT budget_actor_has_perm(r.school_id, 'budget.annual.revise') THEN RAISE EXCEPTION 'Permission requise : budget.annual.revise'; END IF;
  IF r.status <> 'pending' THEN RAISE EXCEPTION 'Demande déjà décidée'; END IF;
  SELECT role, full_name INTO v_role, v_name FROM school_users WHERE user_id = auth.uid() AND school_id = r.school_id LIMIT 1;

  IF p_decision <> 'approve' THEN
    UPDATE budget_revisions SET status='refused', decision_note=p_note, decided_by=v_name, decided_by_id=auth.uid()::text, decided_role=v_role, decided_at=now(), updated_at=now() WHERE id = r.id;
    RETURN 'refused';
  END IF;

  SELECT * INTO v_annual FROM budgets WHERE id = r.annual_budget_id;
  IF v_annual.id IS NULL OR v_annual.tier <> 'annual' THEN RAISE EXCEPTION 'Budget annuel introuvable'; END IF;
  v_new := r.new_amount;
  SELECT COALESCE(SUM(planned_amount),0) INTO v_lines FROM budget_chapters WHERE budget_id = v_annual.id AND scope IS NOT NULL AND status IN ('active','closed');
  IF v_new < v_lines THEN RAISE EXCEPTION 'Révision refusée : le nouvel annuel (%) est inférieur aux lignes déjà activées (%).', v_new, v_lines; END IF;
  SELECT COALESCE(SUM(e.amount),0) INTO v_committed FROM budget_expenses e JOIN budget_chapters c ON c.id = e.budget_chapter_id AND c.budget_id = v_annual.id WHERE e.status IN ('submitted','approved','paid');
  IF v_new < v_committed THEN RAISE EXCEPTION 'Révision refusée : le nouvel annuel est inférieur aux engagements (%).', v_committed; END IF;

  PERFORM set_config('notescam.budget_op', '1', true);
  UPDATE budgets SET envelope_amount = v_new, updated_at = now() WHERE id = v_annual.id;
  UPDATE budget_revisions SET status='applied', decision_note=p_note, decided_by=v_name, decided_by_id=auth.uid()::text, decided_role=v_role, decided_at=now(), updated_at=now() WHERE id = r.id;
  RETURN 'applied';
END;
$$;
