-- ============================================================
-- NotesCam — E3 : ENFORCEMENT SERVEUR v3 (Cloud / Postgres)
-- À coller dans : Supabase → SQL Editor → New query → Run. Idempotent.
-- Requiert : supabase_budget_enforcement_p3.sql (helpers budget_actor_has_perm/
--            budget_actor_can_validate), supabase_budget_lines_v3.sql (tables +
--            gardes de forme/activation).
-- ============================================================
--
-- Rend NON contournables par APPEL API DIRECT (PostgREST) les règles du modèle v3 :
--   • dépense : cohérence d'imputation (secteur autorisé / période répartie / ligne
--     active pour engager) + chaîne ligne → période → secteur → annuel ;
--   • activation d'une ligne : configuration complète (déjà en v_lines) + PLAFOND
--     ANNUEL FERME (Σ montants des lignes finalisées + la ligne ≤ enveloppe) ;
--   • gel : montant/portée d'une ligne active/clôturée et ses allocations figés.
--
-- Miroir EXACT du LAN (server/budgetGuard.js + src/lib/budgetLinesEngine.js).
-- Toutes les fonctions SORTENT quand auth.uid() IS NULL (sync service_role) : la
-- réplication applique la vérité déjà validée à l'origine sans être re-bloquée.

-- ── 1) Enforcement des dépenses : v3 (ligne) + legacy (nœud secteur) ──────────
CREATE OR REPLACE FUNCTION public.budget_expense_enforce()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_from text := CASE WHEN TG_OP = 'UPDATE' THEN OLD.status ELSE NULL END;
  v_to   text := NEW.status;
  committing constant text[] := ARRAY['submitted','approved','paid'];
  v_chapter budget_chapters%ROWTYPE;
  v_sector budgets%ROWTYPE;
  v_period budgets%ROWTYPE;
  v_annual budgets%ROWTYPE;
  v_amount bigint := COALESCE(NEW.amount, 0);
  v_line numeric; v_sec numeric; v_per numeric; v_ann numeric;
  v_min numeric := NULL; v_level text := NULL;
  v_planned bigint; v_excep bigint; v_used bigint; v_pct numeric;
  v_perm text;
  v_periods uuid[];
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;

  -- 1) Verrou terminal.
  IF TG_OP = 'UPDATE' AND OLD.status IN ('paid','cancelled') THEN
    RAISE EXCEPTION 'Dépense « % » verrouillée (lecture seule).', OLD.status;
  END IF;

  -- 2) Machine à états sur modification.
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

  IF NEW.budget_chapter_id IS NOT NULL THEN
    SELECT * INTO v_chapter FROM budget_chapters WHERE id = NEW.budget_chapter_id;
  END IF;

  IF v_chapter.scope IS NOT NULL THEN
    -- ══ MODÈLE v3 : la cible est une LIGNE porteuse du montant annuel ══
    SELECT * INTO v_annual FROM budgets WHERE id = v_chapter.budget_id;

    -- 2.4) PÉRIODE dérivée AUTOMATIQUEMENT de la DATE de la dépense (non contournable) :
    -- impose NEW.budget_period_id, rejette si 0 (aucune période) ou >1 (chevauchement).
    IF NEW.expense_date IS NULL THEN RAISE EXCEPTION 'Imputation invalide : date de la dépense requise.'; END IF;
    SELECT array_agg(id) INTO v_periods FROM budget_periods
      WHERE school_id = NEW.school_id AND academic_year = v_annual.academic_year
        AND start_date <= NEW.expense_date::date AND NEW.expense_date::date <= end_date;
    IF v_periods IS NULL OR array_length(v_periods, 1) = 0 THEN
      RAISE EXCEPTION 'Aucune période budgétaire ne couvre cette date. Configurez d''abord les périodes de l''année.';
    ELSIF array_length(v_periods, 1) > 1 THEN
      RAISE EXCEPTION 'Chevauchement de périodes budgétaires sur cette date (erreur de configuration).';
    END IF;
    NEW.budget_period_id := v_periods[1];

    -- 2.5) Cohérence d'imputation — imposée quel que soit le statut (§2 arbitrage).
    IF NEW.budget_period_id IS NULL
       OR NOT EXISTS (SELECT 1 FROM budget_line_periods
                       WHERE budget_chapter_id = NEW.budget_chapter_id AND budget_period_id = NEW.budget_period_id) THEN
      RAISE EXCEPTION 'Imputation invalide : période non répartie sur la ligne.';
    END IF;
    IF NEW.school_unit_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM budget_line_sectors
                        WHERE budget_chapter_id = NEW.budget_chapter_id AND school_unit_id = NEW.school_unit_id) THEN
      RAISE EXCEPTION 'Imputation invalide : secteur non autorisé par la ligne.';
    END IF;

    -- 3) Chaîne budgétaire — active si le statut ENGAGE (ligne active obligatoire).
    IF v_to = ANY(committing) THEN
      IF v_chapter.status <> 'active' THEN
        RAISE EXCEPTION 'Imputation invalide : la ligne n''est pas active (engagement interdit).';
      END IF;
      PERFORM pg_advisory_xact_lock(hashtextextended(v_annual.id::text, 0));

      -- Ligne : planifié + exceptionnel (déblocage) − engagé.
      SELECT COALESCE(SUM(granted_amount),0) INTO v_excep FROM budget_unlock_requests
        WHERE budget_chapter_id = NEW.budget_chapter_id AND status = 'authorized';
      SELECT COALESCE(SUM(amount),0) INTO v_used FROM budget_expenses
        WHERE budget_chapter_id = NEW.budget_chapter_id AND status = ANY(committing) AND id <> NEW.id;
      v_line := COALESCE(v_chapter.planned_amount,0) + v_excep - v_used;
      v_min := v_line; v_level := 'line';

      -- Cellule ligne × période.
      SELECT pct INTO v_pct FROM budget_line_periods
        WHERE budget_chapter_id = NEW.budget_chapter_id AND budget_period_id = NEW.budget_period_id;
      SELECT COALESCE(SUM(amount),0) INTO v_used FROM budget_expenses
        WHERE budget_chapter_id = NEW.budget_chapter_id AND budget_period_id = NEW.budget_period_id
          AND status = ANY(committing) AND id <> NEW.id;
      v_per := round(COALESCE(v_chapter.planned_amount,0) * COALESCE(v_pct,0) / 100) - v_used;
      IF v_per < v_min THEN v_min := v_per; v_level := 'period'; END IF;

      -- Cellule ligne × secteur (imputation sectorielle uniquement ; global = pas de maillon secteur).
      IF NEW.school_unit_id IS NOT NULL THEN
        SELECT pct INTO v_pct FROM budget_line_sectors
          WHERE budget_chapter_id = NEW.budget_chapter_id AND school_unit_id = NEW.school_unit_id;
        SELECT COALESCE(SUM(amount),0) INTO v_used FROM budget_expenses
          WHERE budget_chapter_id = NEW.budget_chapter_id AND school_unit_id = NEW.school_unit_id
            AND status = ANY(committing) AND id <> NEW.id;
        v_sec := round(COALESCE(v_chapter.planned_amount,0) * COALESCE(v_pct,0) / 100) - v_used;
        IF v_sec < v_min THEN v_min := v_sec; v_level := 'sector'; END IF;
      END IF;

      -- Annuel : Σ des dépenses de TOUTES les lignes de cet annuel.
      SELECT COALESCE(SUM(e.amount),0) INTO v_used FROM budget_expenses e
        JOIN budget_chapters c ON c.id = e.budget_chapter_id AND c.budget_id = v_annual.id
        WHERE e.status = ANY(committing) AND e.id <> NEW.id;
      v_ann := COALESCE(v_annual.envelope_amount,0) - v_used;
      IF v_ann < v_min THEN v_min := v_ann; v_level := 'annual'; END IF;

      IF v_amount > v_min THEN
        RAISE EXCEPTION 'Enveloppe insuffisante (niveau « % ») : demandé %, disponible %.', v_level, v_amount, v_min;
      END IF;
    END IF;

  ELSIF v_to = ANY(committing) THEN
    -- ══ LEGACY (nœud secteur, tier=sector) : chaîne P3 inchangée ══
    SELECT * INTO v_sector FROM budgets WHERE id = NEW.budget_id;

    IF NEW.budget_chapter_id IS NOT NULL THEN
      SELECT COALESCE(planned_amount,0) INTO v_planned FROM budget_chapters WHERE id = NEW.budget_chapter_id;
      SELECT COALESCE(SUM(granted_amount),0) INTO v_excep FROM budget_unlock_requests
        WHERE budget_chapter_id = NEW.budget_chapter_id AND status = 'authorized';
      SELECT COALESCE(SUM(amount),0) INTO v_used FROM budget_expenses
        WHERE budget_chapter_id = NEW.budget_chapter_id AND status = ANY(committing) AND id <> NEW.id;
      v_line := v_planned + v_excep - v_used;
      IF v_min IS NULL OR v_line < v_min THEN v_min := v_line; v_level := 'line'; END IF;
    END IF;

    IF v_sector.tier = 'sector' THEN
      SELECT * INTO v_period FROM budgets WHERE id = v_sector.parent_budget_id;
      SELECT * INTO v_annual FROM budgets WHERE id = v_period.parent_budget_id;
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
    IF (TG_OP='INSERT' AND v_to='draft') OR (TG_OP='UPDATE' AND v_from IS NOT DISTINCT FROM v_to) THEN
      IF NOT budget_actor_has_perm(NEW.school_id, 'expense.prepare') THEN
        RAISE EXCEPTION 'Permission requise : préparer une dépense (expense.prepare).';
      END IF;
    END IF;
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

-- (Le trigger trg_budget_expense_enforce existe déjà — supabase_budget_enforcement_p3.sql.
--  CREATE OR REPLACE de la fonction suffit à activer la logique v3.)

-- ── 2) Activation d'une ligne : Σ%=100 (déjà posé) + PLAFOND ANNUEL FERME ─────
CREATE OR REPLACE FUNCTION public.budget_chapter_activate_guard() RETURNS trigger AS $$
DECLARE v_sum bigint; v_env bigint;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;      -- sync service_role : ne bloque pas
  IF NEW.status = 'active' AND (TG_OP = 'INSERT' OR OLD.status <> 'active') THEN
    -- Montant annuel de la ligne défini (parité avec lineAllocationErrors LAN).
    IF NEW.scope IS NOT NULL AND COALESCE(NEW.planned_amount,0) <= 0 THEN
      RAISE EXCEPTION 'activation ligne: le montant annuel de la ligne doit être défini';
    END IF;
    -- Configuration : Σ % temporel = 100 (+ Σ % sectoriel = 100 si portée 'sectors').
    IF ABS(COALESCE((SELECT SUM(pct) FROM budget_line_periods WHERE budget_chapter_id = NEW.id), 0) - 100) > 0.01 THEN
      RAISE EXCEPTION 'activation ligne: la somme des allocations temporelles doit être égale à 100%%';
    END IF;
    IF NEW.scope = 'sectors'
       AND ABS(COALESCE((SELECT SUM(pct) FROM budget_line_sectors WHERE budget_chapter_id = NEW.id), 0) - 100) > 0.01 THEN
      RAISE EXCEPTION 'activation ligne: la somme des allocations sectorielles doit être égale à 100%%';
    END IF;
    -- Plafond annuel ferme : Σ lignes finalisées (active/closed) + celle-ci ≤ enveloppe.
    IF NEW.scope IS NOT NULL THEN
      SELECT COALESCE(SUM(planned_amount),0) INTO v_sum FROM budget_chapters
        WHERE budget_id = NEW.budget_id AND scope IS NOT NULL AND status IN ('active','closed') AND id <> NEW.id;
      SELECT COALESCE(envelope_amount,0) INTO v_env FROM budgets WHERE id = NEW.budget_id;
      IF v_sum + COALESCE(NEW.planned_amount,0) > v_env THEN
        RAISE EXCEPTION 'activation ligne: le budget annuel global serait dépassé (Σ des lignes activées > enveloppe)';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── 3) Gel : montant/portée d'une ligne active/clôturée figés (modif directe interdite) ──
CREATE OR REPLACE FUNCTION public.budget_chapter_freeze() RETURNS trigger AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF OLD.scope IS NOT NULL AND OLD.status IN ('active','closed')
     AND (NEW.planned_amount IS DISTINCT FROM OLD.planned_amount OR NEW.scope IS DISTINCT FROM OLD.scope) THEN
    RAISE EXCEPTION 'Ligne active/clôturée : le montant ou la portée ne se modifie pas directement (réallocation / révision).';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_budget_chapter_freeze ON budget_chapters;
CREATE TRIGGER trg_budget_chapter_freeze
  BEFORE UPDATE ON budget_chapters
  FOR EACH ROW EXECUTE FUNCTION public.budget_chapter_freeze();

-- ── 4) Gel des ALLOCATIONS d'une ligne active/clôturée ───────────────────────
CREATE OR REPLACE FUNCTION public.budget_alloc_freeze() RETURNS trigger AS $$
DECLARE v_chapter uuid; v_status text;
BEGIN
  IF auth.uid() IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  v_chapter := COALESCE(NEW.budget_chapter_id, OLD.budget_chapter_id);
  SELECT status INTO v_status FROM budget_chapters WHERE id = v_chapter;
  IF v_status IN ('active','closed') THEN
    RAISE EXCEPTION 'Ligne active/clôturée : ses allocations ne se modifient pas directement (réallocation / révision).';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_blp_freeze ON budget_line_periods;
CREATE TRIGGER trg_blp_freeze
  BEFORE INSERT OR UPDATE OR DELETE ON budget_line_periods
  FOR EACH ROW EXECUTE FUNCTION public.budget_alloc_freeze();

DROP TRIGGER IF EXISTS trg_bls_freeze ON budget_line_sectors;
CREATE TRIGGER trg_bls_freeze
  BEFORE INSERT OR UPDATE OR DELETE ON budget_line_sectors
  FOR EACH ROW EXECUTE FUNCTION public.budget_alloc_freeze();
