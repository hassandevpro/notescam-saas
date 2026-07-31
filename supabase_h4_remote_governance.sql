-- supabase_h4_remote_governance.sql — H4 : accès distant + RLS Cloud stricte.
--
-- Sépare le DROIT D'ACCÈS À LA FINANCE (has_budget_access) du DROIT D'ACCÈS À
-- DISTANCE (remote_access_allowed, par compte). En mode « finance LAN-first +
-- gouvernance distante » :
--   • la finance devient LECTURE SEULE côté Cloud (aucune mutation directe) ;
--   • la lecture exige EN PLUS la capacité remote_access_allowed ;
--   • sécurise H3-b : la RPC de décision exige aussi remote_access_allowed.
-- Les écoles en mode Cloud/hybride (défaut) NE CHANGENT PAS de comportement.
--
-- Prérequis : supabase_phase_f_budget_rls.sql, supabase_governance_decisions.sql.
-- À coller dans Supabase → SQL Editor → Run. Aucune Edge Function à redéployer.

-- ── 1) Capacité « accès distant » (par compte) ──────────────────────────────
ALTER TABLE public.school_users
  ADD COLUMN IF NOT EXISTS remote_access_allowed boolean NOT NULL DEFAULT false;

-- Le compte courant a-t-il l'accès distant pour cette école ? (défaut : NON)
CREATE OR REPLACE FUNCTION public.has_remote_access(p_school uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM school_users
                  WHERE school_id = p_school AND user_id = auth.uid()
                    AND active = true AND remote_access_allowed = true);
$$;

-- L'école délègue-t-elle la finance en LAN-first + gouvernance distante ?
-- (Lue depuis schools.deployment_policy. NULL/absent → false → comportement actuel.)
CREATE OR REPLACE FUNCTION public.finance_lan_mode(p_school uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT (deployment_policy->'finance'->>'execution') = 'lan'
        AND (deployment_policy->'finance'->>'governance') = 'cloud'
       FROM schools WHERE id = p_school), false);
$$;

-- ── 2) RLS finance : LECTURE gouvernée + gate distant ; ÉCRITURE interdite en
--        mode LAN (aucune mutation Cloud). Deux policies par table :
--    _read  (SELECT) : has_budget_access [AND secteur] AND (NOT lan_mode OR remote)
--    _write (ALL)    : has_budget_access [AND secteur] AND NOT lan_mode
--    → en mode LAN, aucune policy d'écriture ne s'applique (INSERT/UPDATE/DELETE
--      refusés pour tout rôle client ; la synchro service_role n'est pas soumise
--      à la RLS). En mode Cloud/hybride, comportement RW inchangé.

-- BUDGETS (secteur direct)
DROP POLICY IF EXISTS budgets_rw   ON budgets;
DROP POLICY IF EXISTS budgets_read ON budgets;
DROP POLICY IF EXISTS budgets_write ON budgets;
CREATE POLICY budgets_read ON budgets FOR SELECT
  USING (public.has_budget_access(school_id) AND public.user_covers_sector(school_id, sector)
         AND (NOT public.finance_lan_mode(school_id) OR public.has_remote_access(school_id)));
CREATE POLICY budgets_write ON budgets FOR ALL
  USING      (public.has_budget_access(school_id) AND public.user_covers_sector(school_id, sector) AND NOT public.finance_lan_mode(school_id))
  WITH CHECK (public.has_budget_access(school_id) AND public.user_covers_sector(school_id, sector) AND NOT public.finance_lan_mode(school_id));

-- BUDGET_CHAPTERS (secteur hérité du budget parent)
DROP POLICY IF EXISTS budget_chapters_rw    ON budget_chapters;
DROP POLICY IF EXISTS budget_chapters_read  ON budget_chapters;
DROP POLICY IF EXISTS budget_chapters_write ON budget_chapters;
CREATE POLICY budget_chapters_read ON budget_chapters FOR SELECT
  USING (public.has_budget_access(school_id)
         AND EXISTS (SELECT 1 FROM budgets b WHERE b.id = budget_chapters.budget_id
                      AND public.user_covers_sector(budget_chapters.school_id, b.sector))
         AND (NOT public.finance_lan_mode(school_id) OR public.has_remote_access(school_id)));
DROP POLICY IF EXISTS budget_chapters_write ON budget_chapters;
CREATE POLICY budget_chapters_write ON budget_chapters FOR ALL
  USING      (public.has_budget_access(school_id) AND NOT public.finance_lan_mode(school_id)
              AND EXISTS (SELECT 1 FROM budgets b WHERE b.id = budget_chapters.budget_id AND public.user_covers_sector(budget_chapters.school_id, b.sector)))
  WITH CHECK (public.has_budget_access(school_id) AND NOT public.finance_lan_mode(school_id)
              AND EXISTS (SELECT 1 FROM budgets b WHERE b.id = budget_chapters.budget_id AND public.user_covers_sector(budget_chapters.school_id, b.sector)));

-- BUDGET_EXPENSES (opérationnel — jamais projeté en mode LAN ; lecture gouvernée sinon)
DROP POLICY IF EXISTS budget_expenses_rw    ON budget_expenses;
DROP POLICY IF EXISTS budget_expenses_read  ON budget_expenses;
DROP POLICY IF EXISTS budget_expenses_write ON budget_expenses;
CREATE POLICY budget_expenses_read ON budget_expenses FOR SELECT
  USING (public.has_budget_access(school_id) AND public.user_covers_sector(school_id, COALESCE(sector, 'general'))
         AND (NOT public.finance_lan_mode(school_id) OR public.has_remote_access(school_id)));
DROP POLICY IF EXISTS budget_expenses_write ON budget_expenses;
CREATE POLICY budget_expenses_write ON budget_expenses FOR ALL
  USING      (public.has_budget_access(school_id) AND public.user_covers_sector(school_id, COALESCE(sector, 'general')) AND NOT public.finance_lan_mode(school_id))
  WITH CHECK (public.has_budget_access(school_id) AND public.user_covers_sector(school_id, COALESCE(sector, 'general')) AND NOT public.finance_lan_mode(school_id));

-- BUDGET_UNLOCK_REQUESTS (secteur via budget parent)
DROP POLICY IF EXISTS budget_unlock_rw    ON budget_unlock_requests;
DROP POLICY IF EXISTS budget_unlock_read  ON budget_unlock_requests;
DROP POLICY IF EXISTS budget_unlock_write ON budget_unlock_requests;
CREATE POLICY budget_unlock_read ON budget_unlock_requests FOR SELECT
  USING (public.has_budget_access(school_id)
         AND EXISTS (SELECT 1 FROM budgets b WHERE b.id = budget_unlock_requests.budget_id
                      AND public.user_covers_sector(budget_unlock_requests.school_id, b.sector))
         AND (NOT public.finance_lan_mode(school_id) OR public.has_remote_access(school_id)));
DROP POLICY IF EXISTS budget_unlock_write ON budget_unlock_requests;
CREATE POLICY budget_unlock_write ON budget_unlock_requests FOR ALL
  USING      (public.has_budget_access(school_id) AND NOT public.finance_lan_mode(school_id)
              AND EXISTS (SELECT 1 FROM budgets b WHERE b.id = budget_unlock_requests.budget_id AND public.user_covers_sector(budget_unlock_requests.school_id, b.sector)))
  WITH CHECK (public.has_budget_access(school_id) AND NOT public.finance_lan_mode(school_id)
              AND EXISTS (SELECT 1 FROM budgets b WHERE b.id = budget_unlock_requests.budget_id AND public.user_covers_sector(budget_unlock_requests.school_id, b.sector)));

-- STRUCTURE projetée (périodes + allocations par ligne) : lecture gouvernée + gate
-- distant ; écriture interdite en mode LAN. (RLS activée si elle ne l'était pas.)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['budget_periods','budget_line_periods','budget_line_sectors'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    -- IMPORTANT : retirer AUSSI toute ancienne policy permissive `_rw` (FOR ALL,
    -- prédicat « membre de l'école ») — sinon elle se COMBINE EN OU avec _write et
    -- CONTOURNE le verrou finance_lan_mode (faille détectée à la mise en service H4).
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_rw', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_read', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_write', t);
    EXECUTE format($f$CREATE POLICY %I ON public.%I FOR SELECT
      USING (public.has_budget_access(school_id)
             AND (NOT public.finance_lan_mode(school_id) OR public.has_remote_access(school_id)))$f$, t||'_read', t);
    EXECUTE format($f$CREATE POLICY %I ON public.%I FOR ALL
      USING      (public.has_budget_access(school_id) AND NOT public.finance_lan_mode(school_id))
      WITH CHECK (public.has_budget_access(school_id) AND NOT public.finance_lan_mode(school_id))$f$, t||'_write', t);
  END LOOP;
END $$;

-- ── 3) SÉCURISATION de H3-b : la décision distante exige remote_access_allowed ──
-- Le décideur doit disposer de l'accès distant EN PLUS de la permission. (Le LAN
-- re-vérifie ce même drapeau — governanceApply — : double barrière.)
CREATE OR REPLACE FUNCTION public.can_decide_expense(p_school uuid, p_uid uuid, p_decision text)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT
    -- Accès distant OBLIGATOIRE (séparation droit financier / droit d'accès distant).
    EXISTS (SELECT 1 FROM public.school_users
             WHERE school_id = p_school AND user_id = p_uid AND active = true AND remote_access_allowed = true)
    AND (
      EXISTS (SELECT 1 FROM public.school_users
               WHERE school_id = p_school AND user_id = p_uid AND active = true AND role = 'admin')
      OR EXISTS (
        SELECT 1 FROM public.user_governance_roles ugr
          JOIN public.governance_roles gr ON gr.school_id = ugr.school_id AND gr.code = ugr.role
         WHERE ugr.school_id = p_school AND ugr.user_id = p_uid AND gr.active = true
           AND (gr.permissions)::jsonb ? (CASE p_decision WHEN 'approve' THEN 'expense.approve' ELSE 'expense.reject' END)
      )
    );
$$;

-- ── 4) Rôle CONTRÔLEUR préparé (consultation seule) pour les écoles existantes ──
-- Idempotent. Permissions = VUES uniquement (aucun droit d'approbation/mutation).
-- Un droit de décision devra être accordé EXPLICITEMENT (autre rôle), jamais implicite.
INSERT INTO public.governance_roles (school_id, code, name, description, rank, scope, permissions, pages, dashboards, workflows, active, is_system)
SELECT s.id, 'controleur', 'Contrôleur',
       'Consultation et audit à distance (aucune approbation par défaut).',
       70, 'complex',
       '["governance.view","budget.view","expense.view"]'::jsonb,
       '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, true, true
  FROM public.schools s
ON CONFLICT (school_id, code) DO NOTHING;
