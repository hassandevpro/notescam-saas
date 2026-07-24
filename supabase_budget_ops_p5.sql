-- ============================================================
-- NotesCam — P5 : RÉALLOCATION & RÉVISION budgétaires (Cloud / Postgres)
-- À coller dans : Supabase → SQL Editor → New query → Run. Idempotent.
-- Requiert : supabase_budget_hierarchy_v2.sql, supabase_budget_enforcement_p3.sql
--            (helper budget_actor_has_perm), supabase_governance*.sql.
-- ============================================================
--
-- Miroir Cloud de server/budgetOps.js. Toutes les écritures d'enveloppes passent
-- par ces fonctions SECURITY DEFINER (atomiques) :
--   • permissions de gouvernance imposées côté base (aucune confiance au client) ;
--   • réallocation UNIQUEMENT entre enveloppes SŒURS (même parent, même tier) ;
--   • jamais d'enveloppe rendue < aux engagements déjà comptés ;
--   • historisation avant/après + auteur/date/motif/statut ;
--   • un budget ACTIF ne se modifie pas silencieusement (trigger budget_active_lock) :
--     seules ces RPC (drapeau notescam.apply) peuvent bouger son enveloppe.
--   • RLS : lecture pour les membres, écriture réservée aux RPC (definer).

-- ── Engagé consolidé d'un nœud (sous-arbre) — miroir de nodeConsumption ───────
CREATE OR REPLACE FUNCTION public.budget_committed_subtree(p_budget uuid)
RETURNS bigint LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE b budgets%ROWTYPE; v bigint := 0; committing constant text[] := ARRAY['submitted','approved','paid'];
BEGIN
  SELECT * INTO b FROM budgets WHERE id = p_budget;
  IF b.id IS NULL THEN RETURN 0; END IF;
  IF b.tier = 'sector' THEN
    SELECT COALESCE(SUM(amount),0) INTO v FROM budget_expenses WHERE budget_id = b.id AND status = ANY(committing);
  ELSIF b.tier = 'period' THEN
    SELECT COALESCE(SUM(e.amount),0) INTO v FROM budget_expenses e
      JOIN budgets s ON s.id = e.budget_id AND s.tier='sector' AND s.parent_budget_id = b.id
      WHERE e.status = ANY(committing);
  ELSIF b.tier = 'annual' THEN
    SELECT COALESCE(SUM(e.amount),0) INTO v FROM budget_expenses e
      JOIN budgets s ON s.id = e.budget_id AND s.tier='sector'
      JOIN budgets p ON p.id = s.parent_budget_id AND p.tier='period' AND p.parent_budget_id = b.id
      WHERE e.status = ANY(committing);
  END IF;
  RETURN v;
END; $$;

-- ── Verrou d'un budget ACTIF : pas de modif silencieuse de l'enveloppe ────────
CREATE OR REPLACE FUNCTION public.budget_active_lock() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;                          -- sync service_role
  IF current_setting('notescam.apply', true) = '1' THEN RETURN NEW; END IF; -- appliqué par une RPC P5
  IF OLD.status = 'active' AND OLD.tier IS NOT NULL AND (
       NEW.envelope_amount IS DISTINCT FROM OLD.envelope_amount OR
       NEW.allocation_pct  IS DISTINCT FROM OLD.allocation_pct  OR
       NEW.sector_amount   IS DISTINCT FROM OLD.sector_amount) THEN
    RAISE EXCEPTION 'Budget actif : l''enveloppe se modifie uniquement par réallocation ou révision.';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_budget_active_lock ON budgets;
CREATE TRIGGER trg_budget_active_lock BEFORE UPDATE ON budgets
  FOR EACH ROW EXECUTE FUNCTION public.budget_active_lock();

-- ── RÉALLOCATION : créer ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.budget_create_reallocation(
  p_source_budget_id uuid, p_dest_budget_id uuid, p_amount bigint, p_reason text, p_receipt text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE src budgets%ROWTYPE; dst budgets%ROWTYPE; v_id uuid; v_name text;
BEGIN
  SELECT * INTO src FROM budgets WHERE id = p_source_budget_id;
  SELECT * INTO dst FROM budgets WHERE id = p_dest_budget_id;
  IF src.id IS NULL OR dst.id IS NULL THEN RAISE EXCEPTION 'Enveloppe introuvable'; END IF;
  IF NOT budget_actor_has_perm(src.school_id, 'budget.reallocate.request') THEN
    RAISE EXCEPTION 'Permission requise : budget.reallocate.request'; END IF;
  IF src.id = dst.id THEN RAISE EXCEPTION 'Source et destination identiques'; END IF;
  IF src.tier NOT IN ('period','sector') OR src.tier <> dst.tier THEN
    RAISE EXCEPTION 'Réallocation uniquement entre enveloppes de même niveau'; END IF;
  IF COALESCE(src.parent_budget_id::text,'') <> COALESCE(dst.parent_budget_id::text,'') THEN
    RAISE EXCEPTION 'Les deux enveloppes doivent appartenir au même parent (sœurs)'; END IF;
  IF COALESCE(p_amount,0) <= 0 THEN RAISE EXCEPTION 'Montant invalide'; END IF;
  IF COALESCE(btrim(p_reason),'') = '' THEN RAISE EXCEPTION 'Motif obligatoire'; END IF;

  SELECT full_name INTO v_name FROM school_users WHERE user_id = auth.uid() AND school_id = src.school_id;
  v_id := gen_random_uuid();
  INSERT INTO budget_reallocations (id, school_id, academic_year, source_budget_id, dest_budget_id, amount,
      reason, receipt, requester, requested_by, status, created_by)
    VALUES (v_id, src.school_id, src.academic_year, src.id, dst.id, p_amount, btrim(p_reason), p_receipt,
      v_name, auth.uid()::text, 'pending', auth.uid()::text);
  RETURN v_id;
END; $$;

-- ── RÉALLOCATION : décider (approve → applique atomiquement, refuse) ──────────
CREATE OR REPLACE FUNCTION public.budget_decide_reallocation(p_id uuid, p_decision text, p_note text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r budget_reallocations%ROWTYPE; src budgets%ROWTYPE; dst budgets%ROWTYPE;
  v_field text; v_amount bigint; sb bigint; db_ bigint; sa bigint; da bigint; env bigint; v_name text; v_role text;
BEGIN
  SELECT * INTO r FROM budget_reallocations WHERE id = p_id;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Demande introuvable'; END IF;
  IF NOT budget_actor_has_perm(r.school_id, 'budget.reallocate.decide') THEN
    RAISE EXCEPTION 'Permission requise : budget.reallocate.decide'; END IF;
  IF r.status <> 'pending' THEN RAISE EXCEPTION 'Demande déjà décidée'; END IF;
  SELECT full_name INTO v_name FROM school_users WHERE user_id = auth.uid() AND school_id = r.school_id;
  SELECT role INTO v_role FROM school_users WHERE user_id = auth.uid() AND school_id = r.school_id;

  IF p_decision <> 'approve' THEN
    UPDATE budget_reallocations SET status='refused', decision_note=p_note, decided_by=v_name,
      decided_by_id=auth.uid()::text, decided_role=v_role, decided_at=now() WHERE id=r.id;
    RETURN 'refused';
  END IF;

  SELECT * INTO src FROM budgets WHERE id = r.source_budget_id;
  SELECT * INTO dst FROM budgets WHERE id = r.dest_budget_id;
  v_amount := r.amount;
  IF src.tier = 'sector' THEN
    sb := COALESCE(src.sector_amount,0); db_ := COALESCE(dst.sector_amount,0);
  ELSE
    sb := COALESCE(src.envelope_amount,0); db_ := COALESCE(dst.envelope_amount,0);
  END IF;
  sa := sb - v_amount; da := db_ + v_amount;
  IF sa < 0 THEN RAISE EXCEPTION 'Montant supérieur à l''enveloppe source'; END IF;
  IF sa < budget_committed_subtree(src.id) THEN
    RAISE EXCEPTION 'Réallocation refusée : l''enveloppe source tomberait sous les engagements (%).', budget_committed_subtree(src.id);
  END IF;

  PERFORM set_config('notescam.apply', '1', true);          -- autorise le déplacement d'enveloppe active
  IF src.tier = 'sector' THEN
    SELECT COALESCE(envelope_amount,0) INTO env FROM budgets WHERE id = src.parent_budget_id;
    UPDATE budgets SET sector_amount = sa, allocation_pct = CASE WHEN env>0 THEN round(sa::numeric/env*10000)/100 ELSE 0 END, updated_at = now() WHERE id = src.id;
    UPDATE budgets SET sector_amount = da, allocation_pct = CASE WHEN env>0 THEN round(da::numeric/env*10000)/100 ELSE 0 END, updated_at = now() WHERE id = dst.id;
  ELSE
    UPDATE budgets SET envelope_amount = sa, updated_at = now() WHERE id = src.id;
    UPDATE budgets SET envelope_amount = da, updated_at = now() WHERE id = dst.id;
  END IF;

  UPDATE budget_reallocations SET status='applied', decision_note=p_note, decided_by=v_name,
    decided_by_id=auth.uid()::text, decided_role=v_role, decided_at=now(),
    source_before=sb, source_after=sa, dest_before=db_, dest_after=da WHERE id=r.id;
  RETURN 'applied';
END; $$;

-- ── RÉVISION ANNUELLE : créer ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.budget_create_revision(
  p_annual_budget_id uuid, p_new_amount bigint, p_reason text, p_receipt text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE an budgets%ROWTYPE; v_id uuid; v_old bigint; v_init bigint; v_name text;
BEGIN
  SELECT * INTO an FROM budgets WHERE id = p_annual_budget_id;
  IF an.id IS NULL OR an.tier <> 'annual' THEN RAISE EXCEPTION 'Budget annuel introuvable'; END IF;
  IF NOT budget_actor_has_perm(an.school_id, 'budget.annual.revise.request') THEN
    RAISE EXCEPTION 'Permission requise : budget.annual.revise.request'; END IF;
  IF p_new_amount IS NULL OR p_new_amount < 0 THEN RAISE EXCEPTION 'Nouveau montant invalide'; END IF;
  IF COALESCE(btrim(p_reason),'') = '' THEN RAISE EXCEPTION 'Motif obligatoire'; END IF;

  v_old := COALESCE(an.envelope_amount,0);
  SELECT initial_amount INTO v_init FROM budget_revisions WHERE annual_budget_id = an.id AND status='applied' ORDER BY created_at LIMIT 1;
  v_init := COALESCE(v_init, v_old);
  SELECT full_name INTO v_name FROM school_users WHERE user_id = auth.uid() AND school_id = an.school_id;
  v_id := gen_random_uuid();
  INSERT INTO budget_revisions (id, school_id, academic_year, annual_budget_id, initial_amount, old_amount, new_amount,
      reason, receipt, requester, requested_by, status, created_by)
    VALUES (v_id, an.school_id, an.academic_year, an.id, v_init, v_old, p_new_amount, btrim(p_reason), p_receipt,
      v_name, auth.uid()::text, 'pending', auth.uid()::text);
  RETURN v_id;
END; $$;

-- ── RÉVISION ANNUELLE : décider ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.budget_decide_revision(p_id uuid, p_decision text, p_note text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r budget_revisions%ROWTYPE; an budgets%ROWTYPE; v_sum bigint; v_com bigint; v_name text; v_role text;
BEGIN
  SELECT * INTO r FROM budget_revisions WHERE id = p_id;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Demande introuvable'; END IF;
  IF NOT budget_actor_has_perm(r.school_id, 'budget.annual.revise') THEN
    RAISE EXCEPTION 'Permission requise : budget.annual.revise'; END IF;
  IF r.status <> 'pending' THEN RAISE EXCEPTION 'Demande déjà décidée'; END IF;
  SELECT full_name INTO v_name FROM school_users WHERE user_id = auth.uid() AND school_id = r.school_id;
  SELECT role INTO v_role FROM school_users WHERE user_id = auth.uid() AND school_id = r.school_id;

  IF p_decision <> 'approve' THEN
    UPDATE budget_revisions SET status='refused', decision_note=p_note, decided_by=v_name,
      decided_by_id=auth.uid()::text, decided_role=v_role, decided_at=now() WHERE id=r.id;
    RETURN 'refused';
  END IF;

  SELECT * INTO an FROM budgets WHERE id = r.annual_budget_id;
  IF an.id IS NULL OR an.tier <> 'annual' THEN RAISE EXCEPTION 'Budget annuel introuvable'; END IF;
  SELECT COALESCE(SUM(envelope_amount),0) INTO v_sum FROM budgets WHERE parent_budget_id = an.id AND tier='period';
  IF r.new_amount < v_sum THEN
    RAISE EXCEPTION 'Révision refusée : le nouvel annuel (%) est inférieur aux enveloppes de période réparties (%).', r.new_amount, v_sum;
  END IF;
  v_com := budget_committed_subtree(an.id);
  IF r.new_amount < v_com THEN
    RAISE EXCEPTION 'Révision refusée : le nouvel annuel est inférieur aux engagements (%).', v_com;
  END IF;

  PERFORM set_config('notescam.apply', '1', true);
  UPDATE budgets SET envelope_amount = r.new_amount, updated_at = now() WHERE id = an.id;
  UPDATE budget_revisions SET status='applied', decision_note=p_note, decided_by=v_name,
    decided_by_id=auth.uid()::text, decided_role=v_role, decided_at=now() WHERE id=r.id;
  RETURN 'applied';
END; $$;

-- ── RLS : lecture membres ; écriture réservée aux RPC (definer) ───────────────
-- On remplace les policies FOR ALL par des policies SELECT seules : plus aucune
-- écriture directe (PostgREST) possible → uniquement via les fonctions ci-dessus.
DROP POLICY IF EXISTS budget_reallocations_rw ON budget_reallocations;
DROP POLICY IF EXISTS budget_reallocations_read ON budget_reallocations;
CREATE POLICY budget_reallocations_read ON budget_reallocations FOR SELECT
  USING (school_id IN (SELECT school_id FROM school_users WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS budget_revisions_rw ON budget_revisions;
DROP POLICY IF EXISTS budget_revisions_read ON budget_revisions;
CREATE POLICY budget_revisions_read ON budget_revisions FOR SELECT
  USING (school_id IN (SELECT school_id FROM school_users WHERE user_id = auth.uid()));
