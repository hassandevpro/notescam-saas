-- ============================================================
-- NotesCam — P3 : ENFORCEMENT SERVEUR des dépenses (Cloud / Postgres)
-- À coller dans : Supabase → SQL Editor → New query → Run. Idempotent.
-- Requiert : supabase_budgets.sql, supabase_expenses.sql, supabase_budget_unlocks.sql,
--            supabase_budget_hierarchy_v2.sql, supabase_governance*.sql.
-- ============================================================
--
-- Rend les règles budgétaires impossibles à contourner par APPEL API DIRECT
-- (PostgREST) : un trigger BEFORE INSERT/UPDATE sur budget_expenses recalcule,
-- côté BASE, toute la chaîne (ligne → secteur → période → annuel) + la machine à
-- états + (en mode gouverné) les permissions et le plafond de validation.
--
-- Il REPRODUIT la sémantique du moteur pur P2 (budgetHierarchyEngine.checkExpense)
-- et des moteurs Dépenses/Gouvernance — aucune règle divergente.
--
-- SYNCHRO : la fonction sort immédiatement quand auth.uid() IS NULL (appels
-- service_role de sync-push) → la réplication applique la vérité déjà validée à
-- l'origine sans être re-bloquée. Concurrence : verrou d'avis transactionnel sur
-- la racine annuelle → deux engagements concurrents sur le même annuel se
-- sérialisent (pas de dépassement ni de double dépense simultanés).

-- ── Helper : permission effective de l'acteur courant (mode gouverné) ─────────
-- Miroir de governanceEngine.hasPermission : admin ⇒ tout ; sinon union des
-- permissions + workflows des rôles ACTIFS détenus (catalogue configurable).
CREATE OR REPLACE FUNCTION public.budget_actor_has_perm(p_school uuid, p_perm text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    EXISTS (SELECT 1 FROM school_users su
            WHERE su.user_id = auth.uid() AND su.school_id = p_school
              AND su.role = 'admin' AND COALESCE(su.active, true))
    OR EXISTS (
      SELECT 1
      FROM user_governance_roles ugr
      JOIN governance_roles gr ON gr.school_id = ugr.school_id AND gr.code = ugr.role AND gr.active
      WHERE ugr.school_id = p_school AND ugr.user_id = auth.uid()
        AND (gr.permissions ? p_perm OR gr.workflows ? p_perm)
    );
$$;

-- ── Helper : l'acteur peut-il VALIDER ce montant ? (plafond configurable) ─────
-- Miroir de governanceEngine.canValidateAmount + validationEngine : résout le
-- rôle requis au palier du montant (schools.validation_rules, sinon barème par
-- défaut), puis vérifie que l'acteur détient ce rôle OU l'autorité suprême
-- (rôle transverse 'complex' de rang maximal). Aucun montant codé en dur.
CREATE OR REPLACE FUNCTION public.budget_actor_can_validate(p_school uuid, p_amount bigint)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_rules   jsonb;
  v_tiers   jsonb;
  v_required text;
  v_top     text;
BEGIN
  -- admin ⇒ toujours.
  IF EXISTS (SELECT 1 FROM school_users su WHERE su.user_id = auth.uid()
              AND su.school_id = p_school AND su.role = 'admin' AND COALESCE(su.active, true)) THEN
    RETURN true;
  END IF;

  -- Barème (JSON) : schools.validation_rules -> 'expense'/'default', sinon défaut.
  BEGIN
    SELECT NULLIF(validation_rules, '')::jsonb INTO v_rules FROM schools WHERE id = p_school;
  EXCEPTION WHEN others THEN v_rules := NULL; END;
  v_tiers := COALESCE(v_rules -> 'expense', v_rules -> 'default',
    '[{"under":25000,"role":"raf"},{"under":250000,"role":"coordonnateur_general"},{"under":null,"role":"fondatrice"}]'::jsonb);

  -- Palier applicable : premier (trié par `under` croissant, null en dernier)
  -- dont `under` est null ou > montant.
  SELECT role INTO v_required FROM (
    SELECT t->>'role' AS role,
           CASE WHEN (t->'under') = 'null'::jsonb OR t->>'under' IS NULL THEN NULL ELSE (t->>'under')::numeric END AS under
    FROM jsonb_array_elements(v_tiers) t
  ) q
  WHERE under IS NULL OR p_amount < under
  ORDER BY (under IS NULL), under
  LIMIT 1;

  IF v_required IS NULL THEN RETURN false; END IF;

  -- Autorité suprême = rôle transverse 'complex' de rang maximal (dernier recours).
  SELECT code INTO v_top FROM governance_roles
   WHERE school_id = p_school AND active AND scope = 'complex'
   ORDER BY rank DESC LIMIT 1;

  RETURN EXISTS (
    SELECT 1 FROM user_governance_roles ugr
    JOIN governance_roles gr ON gr.school_id = ugr.school_id AND gr.code = ugr.role AND gr.active
    WHERE ugr.school_id = p_school AND ugr.user_id = auth.uid()
      AND (gr.code = v_required OR (gr.scope = 'complex' AND gr.code = v_top))
  );
END;
$$;

-- ── Trigger principal d'enforcement ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.budget_expense_enforce()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_from text := CASE WHEN TG_OP = 'UPDATE' THEN OLD.status ELSE NULL END;
  v_to   text := NEW.status;
  committing constant text[] := ARRAY['submitted','approved','paid'];
  v_sector budgets%ROWTYPE;
  v_period budgets%ROWTYPE;
  v_annual budgets%ROWTYPE;
  v_amount bigint := COALESCE(NEW.amount, 0);
  v_line numeric; v_sec numeric; v_per numeric; v_ann numeric;
  v_min numeric := NULL; v_level text := NULL;
  v_planned bigint; v_excep bigint; v_used bigint;
  v_perm text;
BEGIN
  -- SYNCHRO / service_role : pas d'utilisateur authentifié → on fait confiance à
  -- la vérité répliquée (déjà validée à son origine). Ne bloque jamais la sync.
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;

  -- 1) Verrou terminal.
  IF TG_OP = 'UPDATE' AND OLD.status IN ('paid','cancelled') THEN
    RAISE EXCEPTION 'Dépense « % » verrouillée (lecture seule).', OLD.status;
  END IF;

  -- 2) Machine à états sur MODIFICATION (mêmes transitions que expenseEngine). À la
  --    création, tout statut initial est toléré hors mode gouverné (comportement
  --    historique) ; en mode gouverné, créer à un statut engageant exige la
  --    permission correspondante (cf. §4).
  IF TG_OP = 'UPDATE' AND v_from IS DISTINCT FROM v_to THEN
    IF NOT (
      (v_from='draft'     AND v_to IN ('submitted','cancelled')) OR
      (v_from='submitted' AND v_to IN ('approved','rejected','draft','cancelled')) OR
      (v_from='approved'  AND v_to IN ('paid','rejected','cancelled')) OR
      (v_from='rejected'  AND v_to IN ('draft'))
    ) THEN
      RAISE EXCEPTION 'Transition de dépense invalide : % → %.', v_from, v_to;
    END IF;
  END IF;

  -- 3) CHAÎNE budgétaire — toujours active si le statut ENGAGE le budget.
  IF v_to = ANY(committing) THEN
    SELECT * INTO v_sector FROM budgets WHERE id = NEW.budget_id;

    -- Ligne (chapitre feuille = point d'imputation) : planifié + exceptionnel − engagé.
    IF NEW.budget_chapter_id IS NOT NULL THEN
      SELECT COALESCE(planned_amount,0) INTO v_planned FROM budget_chapters WHERE id = NEW.budget_chapter_id;
      SELECT COALESCE(SUM(granted_amount),0) INTO v_excep FROM budget_unlock_requests
        WHERE budget_chapter_id = NEW.budget_chapter_id AND status = 'authorized';
      SELECT COALESCE(SUM(amount),0) INTO v_used FROM budget_expenses
        WHERE budget_chapter_id = NEW.budget_chapter_id AND status = ANY(committing) AND id <> NEW.id;
      v_line := v_planned + v_excep - v_used;
      IF v_min IS NULL OR v_line < v_min THEN v_min := v_line; v_level := 'line'; END IF;
    END IF;

    -- Secteur / période / annuel : uniquement pour un budget HIÉRARCHIQUE.
    IF v_sector.tier = 'sector' THEN
      SELECT * INTO v_period FROM budgets WHERE id = v_sector.parent_budget_id;
      SELECT * INTO v_annual FROM budgets WHERE id = v_period.parent_budget_id;
      -- Sérialisation des engagements concurrents sur le même annuel.
      PERFORM pg_advisory_xact_lock(hashtextextended(v_annual.id::text, 0));

      SELECT COALESCE(SUM(amount),0) INTO v_used FROM budget_expenses
        WHERE budget_id = v_sector.id AND status = ANY(committing) AND id <> NEW.id;
      v_sec := COALESCE(v_sector.sector_amount, round(COALESCE(v_period.envelope_amount,0) * COALESCE(v_sector.allocation_pct,0) / 100)) - v_used;
      IF v_min IS NULL OR v_sec < v_min THEN v_min := v_sec; v_level := 'sector'; END IF;

      SELECT COALESCE(SUM(e.amount),0) INTO v_used FROM budget_expenses e
        JOIN budgets s ON s.id = e.budget_id AND s.tier='sector' AND s.parent_budget_id = v_period.id
        WHERE e.status = ANY(committing) AND e.id <> NEW.id;
      v_per := COALESCE(v_period.envelope_amount,0) - v_used;
      IF v_min IS NULL OR v_per < v_min THEN v_min := v_per; v_level := 'period'; END IF;

      SELECT COALESCE(SUM(e.amount),0) INTO v_used FROM budget_expenses e
        JOIN budgets s ON s.id = e.budget_id AND s.tier='sector'
        JOIN budgets p ON p.id = s.parent_budget_id AND p.tier='period' AND p.parent_budget_id = v_annual.id
        WHERE e.status = ANY(committing) AND e.id <> NEW.id;
      v_ann := COALESCE(v_annual.envelope_amount,0) - v_used;
      IF v_min IS NULL OR v_ann < v_min THEN v_min := v_ann; v_level := 'annual'; END IF;
    END IF;

    IF v_min IS NOT NULL AND v_amount > v_min THEN
      RAISE EXCEPTION 'Enveloppe insuffisante (niveau « % ») : demandé %, disponible %.', v_level, v_amount, v_min;
    END IF;
  END IF;

  -- 4) Permissions + plafond — SEULEMENT en mode gouverné (schools.budget_validation=1).
  IF EXISTS (SELECT 1 FROM schools WHERE id = NEW.school_id AND COALESCE(budget_validation,0) = 1) THEN
    -- Préparer : création d'un brouillon ou édition sans changement de statut.
    IF (TG_OP='INSERT' AND v_to='draft') OR (TG_OP='UPDATE' AND v_from IS NOT DISTINCT FROM v_to) THEN
      IF NOT budget_actor_has_perm(NEW.school_id, 'expense.prepare') THEN
        RAISE EXCEPTION 'Permission requise : préparer une dépense (expense.prepare).';
      END IF;
    END IF;
    -- Transition — ou CRÉATION directe — vers un statut engageant → permission
    -- dédiée (+ plafond à l'approbation). Créer d'emblée « approved » exige donc la
    -- même autorité qu'une transition : pas de contournement par insert direct.
    IF (TG_OP='INSERT' AND v_to IN ('submitted','approved','paid','rejected'))
       OR (TG_OP='UPDATE' AND v_from IS DISTINCT FROM v_to AND v_to <> 'cancelled') THEN
      v_perm := CASE v_to WHEN 'submitted' THEN 'expense.submit' WHEN 'approved' THEN 'expense.approve'
                          WHEN 'rejected' THEN 'expense.reject'  WHEN 'paid' THEN 'expense.pay' ELSE NULL END;
      IF v_perm IS NOT NULL AND NOT budget_actor_has_perm(NEW.school_id, v_perm) THEN
        RAISE EXCEPTION 'Permission requise pour « % » : %.', v_to, v_perm;
      END IF;
      IF v_to = 'approved' AND NOT budget_actor_can_validate(NEW.school_id, v_amount) THEN
        RAISE EXCEPTION 'Plafond de validation dépassé pour votre rôle.';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_budget_expense_enforce ON budget_expenses;
CREATE TRIGGER trg_budget_expense_enforce
  BEFORE INSERT OR UPDATE ON budget_expenses
  FOR EACH ROW EXECUTE FUNCTION public.budget_expense_enforce();

-- Hard-delete : interdit sauf brouillon (une dépense engagée s'ANNULE, se trace).
CREATE OR REPLACE FUNCTION public.budget_expense_guard_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN OLD; END IF;          -- sync : autorise
  IF OLD.status <> 'draft' THEN
    RAISE EXCEPTION 'Suppression interdite (statut « % ») : utilisez l''annulation tracée.', OLD.status;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_budget_expense_guard_delete ON budget_expenses;
CREATE TRIGGER trg_budget_expense_guard_delete
  BEFORE DELETE ON budget_expenses
  FOR EACH ROW EXECUTE FUNCTION public.budget_expense_guard_delete();
