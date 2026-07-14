-- ════════════════════════════════════════════════════════════════════════════
-- NotesCam — Phase F : RLS gouvernance + secteur sur le module Budgets
-- (F2.3 : « le filtrage par secteur doit être fait côté base, pas seulement l'UI »)
-- ════════════════════════════════════════════════════════════════════════════
--
-- AVANT : budgets / budget_chapters / budget_expenses / budget_unlock_requests
-- avaient une RLS PERMISSIVE (tout membre de l'école en lecture ET écriture) — la
-- seule protection était l'UI (role==='admin'). Un teacher/censeur pouvait donc
-- écrire par appel API direct.
--
-- APRÈS : accès réservé à l'admin de base OU à un porteur de rôle de gouvernance,
-- ET borné à son SECTEUR (un Principal ne voit/écrit que son secteur). Le
-- filtrage FIN par action (qui approuve quel montant) reste piloté par l'app +
-- le moteur de validation (resolveValidatorRole) — NON dupliqué ici.
--
-- ⚠️⚠️ À TESTER EN STAGING avant production. Une RLS erronée peut verrouiller
-- l'accès. Garde-fou : l'admin de base passe TOUJOURS (has_budget_access +
-- user_covers_sector renvoient true pour lui). ROLLBACK en bas du fichier.
--
-- Idempotent. Requiert supabase_governance.sql (user_governance_roles).
-- ════════════════════════════════════════════════════════════════════════════

-- ── Helpers (SECURITY DEFINER : lisent school_users / user_governance_roles
--    indépendamment de la RLS de ces tables) ──────────────────────────────────

-- Accès au module Budgets : admin de base OU au moins un rôle de gouvernance.
CREATE OR REPLACE FUNCTION public.has_budget_access(p_school uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM school_users
                  WHERE school_id = p_school AND user_id = auth.uid()
                    AND active = true AND role = 'admin')
      OR EXISTS (SELECT 1 FROM user_governance_roles
                  WHERE school_id = p_school AND user_id = auth.uid());
$$;

-- L'utilisateur couvre-t-il ce secteur ?
--   admin OU rôle transverse (fondatrice/coordonnateur/raf/caissier) → TOUS secteurs ;
--   sinon → secteur natif du rôle (surchargé par user_governance_roles.sector).
CREATE OR REPLACE FUNCTION public.user_covers_sector(p_school uuid, p_sector text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; native text;
BEGIN
  IF EXISTS (SELECT 1 FROM school_users
              WHERE school_id = p_school AND user_id = auth.uid()
                AND active = true AND role = 'admin') THEN
    RETURN true;
  END IF;
  FOR r IN SELECT role, sector FROM user_governance_roles
            WHERE school_id = p_school AND user_id = auth.uid() LOOP
    -- Autorité transverse au complexe → couvre tout.
    IF r.role IN ('fondatrice','coordonnateur_general','raf','caissier') THEN
      RETURN true;
    END IF;
    native := CASE r.role
      WHEN 'principal'                     THEN 'college'
      WHEN 'vice_principal'                THEN 'college'
      WHEN 'directrice_primaire'           THEN 'primaire'
      WHEN 'directrice_adjointe_primaire'  THEN 'primaire'
      WHEN 'responsable_maternelle'        THEN 'maternelle'
      ELSE NULL END;
    IF COALESCE(r.sector, native) IS NULL THEN RETURN true; END IF; -- indéterminé → prudence
    IF COALESCE(r.sector, native) = p_sector THEN RETURN true; END IF;
  END LOOP;
  RETURN false;
END $$;

-- ── Policies : remplacent les policies permissives ──────────────────────────

-- BUDGETS (secteur direct)
DROP POLICY IF EXISTS budgets_rw ON budgets;
CREATE POLICY budgets_rw ON budgets FOR ALL
  USING      (public.has_budget_access(school_id) AND public.user_covers_sector(school_id, sector))
  WITH CHECK (public.has_budget_access(school_id) AND public.user_covers_sector(school_id, sector));

-- BUDGET_CHAPTERS (secteur hérité du budget parent)
DROP POLICY IF EXISTS budget_chapters_rw ON budget_chapters;
CREATE POLICY budget_chapters_rw ON budget_chapters FOR ALL
  USING      (public.has_budget_access(school_id)
              AND EXISTS (SELECT 1 FROM budgets b
                           WHERE b.id = budget_chapters.budget_id
                             AND public.user_covers_sector(budget_chapters.school_id, b.sector)))
  WITH CHECK (public.has_budget_access(school_id)
              AND EXISTS (SELECT 1 FROM budgets b
                           WHERE b.id = budget_chapters.budget_id
                             AND public.user_covers_sector(budget_chapters.school_id, b.sector)));

-- BUDGET_EXPENSES (secteur dénormalisé, hérité du budget)
DROP POLICY IF EXISTS budget_expenses_rw ON budget_expenses;
CREATE POLICY budget_expenses_rw ON budget_expenses FOR ALL
  USING      (public.has_budget_access(school_id)
              AND public.user_covers_sector(school_id, COALESCE(sector, 'general')))
  WITH CHECK (public.has_budget_access(school_id)
              AND public.user_covers_sector(school_id, COALESCE(sector, 'general')));

-- BUDGET_UNLOCK_REQUESTS (secteur via budget parent)
DROP POLICY IF EXISTS budget_unlock_rw ON budget_unlock_requests;
CREATE POLICY budget_unlock_rw ON budget_unlock_requests FOR ALL
  USING      (public.has_budget_access(school_id)
              AND EXISTS (SELECT 1 FROM budgets b
                           WHERE b.id = budget_unlock_requests.budget_id
                             AND public.user_covers_sector(budget_unlock_requests.school_id, b.sector)))
  WITH CHECK (public.has_budget_access(school_id)
              AND EXISTS (SELECT 1 FROM budgets b
                           WHERE b.id = budget_unlock_requests.budget_id
                             AND public.user_covers_sector(budget_unlock_requests.school_id, b.sector)));

-- ── Décision 6 : activer le workflow gouverné pour les écoles existantes ────
-- NB : la CHAÎNE de validation des BUDGETS (budgetWorkflow.js) n'est branchée dans
-- Budgets.jsx que si l'on consomme le moteur générique (étape UI restante). Ce
-- drapeau est donc INERTE tant que ce câblage n'est pas fait ; le poser dès à
-- présent est sûr (aucun effet tant que Budgets ne l'importe pas).
UPDATE schools SET budget_validation = true WHERE budget_validation IS DISTINCT FROM true;

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK (revenir au comportement permissif si un problème survient) :
--   DROP POLICY IF EXISTS budgets_rw ON budgets;
--   CREATE POLICY budgets_rw ON budgets FOR ALL
--     USING (school_id IN (SELECT school_id FROM school_users WHERE user_id = auth.uid()))
--     WITH CHECK (school_id IN (SELECT school_id FROM school_users WHERE user_id = auth.uid()));
--   (idem budget_chapters_rw / budget_expenses_rw / budget_unlock_rw)
-- ════════════════════════════════════════════════════════════════════════════
