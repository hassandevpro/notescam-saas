-- ============================================================
-- NotesCam — CATALOGUE de rôles de gouvernance (Phase 1)
-- À coller dans : Supabase → SQL Editor → New query → Run
-- Idempotent. Requiert supabase_governance.sql (table user_governance_roles).
-- ============================================================
--
-- Rend les rôles de direction CONFIGURABLES en base (par établissement) : plus
-- aucun nom de rôle n'est figé en JS. Le moteur (src/governance/governanceEngine.js)
-- dérive permissions / menus / routes / dashboards / validations de CE catalogue.
-- Les 9 rôles historiques sont insérés comme données initiales (is_system=true).
--
-- Ajoute aussi : dates de validité + statut sur les affectations, et un historique.

-- ── 1. Catalogue de rôles (par école) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS governance_roles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  code        text NOT NULL,                 -- identifiant machine (unique par école)
  name        text NOT NULL,
  description text,
  rank        integer NOT NULL DEFAULT 0,    -- hiérarchie (grand = haut placé)
  scope       text NOT NULL DEFAULT 'complex', -- 'complex' | 'sector'
  sector      text,                          -- secteur natif (rôles de secteur)
  permissions jsonb NOT NULL DEFAULT '[]',   -- clés de permission (consult./prépa.)
  pages       jsonb NOT NULL DEFAULT '[]',   -- routes/menus visibles
  dashboards  jsonb NOT NULL DEFAULT '[]',   -- ids de dashboards associés
  workflows   jsonb NOT NULL DEFAULT '[]',   -- droits d'approbation/validation
  active      boolean NOT NULL DEFAULT true,
  is_system   boolean NOT NULL DEFAULT false, -- rôle amorcé (protégé en Phase 2)
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz,
  UNIQUE (school_id, code)
);
CREATE INDEX IF NOT EXISTS gov_roles_school_idx ON governance_roles (school_id);

-- ── 2. Affectations : dates de validité + statut ────────────────────────────
ALTER TABLE user_governance_roles ADD COLUMN IF NOT EXISTS start_date date;
ALTER TABLE user_governance_roles ADD COLUMN IF NOT EXISTS end_date   date;
ALTER TABLE user_governance_roles ADD COLUMN IF NOT EXISTS status     text NOT NULL DEFAULT 'active';

-- ── 3. Historique des changements de rôle ───────────────────────────────────
CREATE TABLE IF NOT EXISTS governance_role_history (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL,                 -- compte visé
  role_code   text NOT NULL,
  action      text NOT NULL,                 -- assigned | revoked | updated | activated | deactivated
  sector      text,
  start_date  date,
  end_date    date,
  actor_id    uuid,                          -- admin auteur
  actor_name  text,
  detail      jsonb NOT NULL DEFAULT '{}',
  at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gov_hist_school_idx ON governance_role_history (school_id, at);

-- ── 4. RLS : lecture pour les membres ; écriture via RPC uniquement ──────────
ALTER TABLE governance_roles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance_role_history  ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS gov_roles_select ON governance_roles;
CREATE POLICY gov_roles_select ON governance_roles FOR SELECT
  USING (school_id IN (SELECT school_id FROM school_users WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS gov_hist_select ON governance_role_history;
CREATE POLICY gov_hist_select ON governance_role_history FOR SELECT
  USING (school_id IN (SELECT school_id FROM school_users WHERE user_id = auth.uid()));

-- ── 5. Seed : amorce le catalogue d'UNE école avec les 9 rôles système ──────
-- Ne réécrit jamais un rôle déjà présent (ON CONFLICT DO NOTHING) : préserve les
-- éventuelles personnalisations (Phase 2). Réutilisable à la création d'école.
CREATE OR REPLACE FUNCTION public.seed_governance_catalog(p_school_id uuid)
  RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO governance_roles (school_id, code, name, description, rank, scope, sector, permissions, pages, dashboards, workflows, is_system)
  SELECT p_school_id, s.code, s.name, s.description, s.rank, s.scope, s.sector,
         s.permissions::jsonb, s.pages::jsonb, s.dashboards::jsonb, s.workflows::jsonb, true
  FROM (VALUES
    ('fondatrice','Fondatrice','Autorité suprême du complexe',100,'complex',NULL,
      '["governance.manage","governance.view","budget.view","expense.view"]',
      '["/app/groupe","/app/reports","/app/budgets","/app/budget-global","/app/depenses"]',
      '["group","budget-global"]',
      '["budget.validate.sector","budget.validate.finance","budget.approve","budget.close","budget.reopen","expense.approve","expense.reject","budget.unlock.decide"]'),
    ('coordonnateur_general','Coordonnateur Général','Direction générale du complexe',90,'complex',NULL,
      '["governance.manage","governance.view","budget.view","expense.view"]',
      '["/app/groupe","/app/reports","/app/budgets","/app/budget-global","/app/depenses"]',
      '["group","budget-global"]',
      '["budget.validate.sector","budget.validate.finance","budget.approve","budget.close","budget.reopen","expense.approve","expense.reject","budget.unlock.decide"]'),
    ('raf','Responsable Administratif et Financier (RAF)','Gestion administrative et financière',80,'complex',NULL,
      '["governance.view","budget.view","budget.prepare","budget.submit","expense.view","budget.unlock.request"]',
      '["/app/groupe","/app/reports","/app/budgets","/app/budget-global","/app/depenses"]',
      '["group","budget-global"]',
      '["budget.validate.finance","budget.close","expense.approve","expense.reject","expense.pay"]'),
    ('principal','Principal','Chef du secteur collège',60,'sector','college',
      '["budget.view","budget.prepare","budget.submit","expense.view","expense.prepare","expense.submit","budget.unlock.request"]',
      '["/app/budgets","/app/budget-global","/app/depenses"]','["budget-global"]','["budget.validate.sector"]'),
    ('directrice_primaire','Directrice du primaire','Chef du secteur primaire',60,'sector','primaire',
      '["budget.view","budget.prepare","budget.submit","expense.view","expense.prepare","expense.submit","budget.unlock.request"]',
      '["/app/budgets","/app/budget-global","/app/depenses"]','["budget-global"]','["budget.validate.sector"]'),
    ('responsable_maternelle','Responsable de la maternelle','Chef du secteur maternelle',60,'sector','maternelle',
      '["budget.view","budget.prepare","budget.submit","expense.view","expense.prepare","expense.submit","budget.unlock.request"]',
      '["/app/budgets","/app/budget-global","/app/depenses"]','["budget-global"]','["budget.validate.sector"]'),
    ('vice_principal','Vice-principal','Adjoint du secteur collège',50,'sector','college',
      '["budget.view","budget.prepare","budget.submit","expense.view","expense.prepare","expense.submit","budget.unlock.request"]',
      '["/app/budgets","/app/budget-global","/app/depenses"]','["budget-global"]','[]'),
    ('directrice_adjointe_primaire','Directrice adjointe du primaire','Adjointe du secteur primaire',50,'sector','primaire',
      '["budget.view","budget.prepare","budget.submit","expense.view","expense.prepare","expense.submit","budget.unlock.request"]',
      '["/app/budgets","/app/budget-global","/app/depenses"]','["budget-global"]','[]'),
    ('caissier','Caissier','Exécute les décaissements',30,'complex',NULL,
      '["budget.view","expense.view"]','["/app/depenses"]','[]','["expense.pay"]')
  ) AS s(code,name,description,rank,scope,sector,permissions,pages,dashboards,workflows)
  ON CONFLICT (school_id, code) DO NOTHING;
END $$;

-- Amorce toutes les écoles existantes.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM schools LOOP
    PERFORM public.seed_governance_catalog(r.id);
  END LOOP;
END $$;

-- ── 6. RPC admin : attribuer / mettre à jour / révoquer (avec historique) ────
CREATE OR REPLACE FUNCTION public.admin_assign_governance_role(
  p_user_id uuid, p_role text, p_sector text DEFAULT NULL,
  p_start_date date DEFAULT NULL, p_end_date date DEFAULT NULL, p_status text DEFAULT 'active'
) RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_school_id uuid; v_id uuid; v_actor text;
BEGIN
  SELECT school_id, full_name INTO v_school_id, v_actor FROM school_users
   WHERE user_id = auth.uid() AND active = true AND role = 'admin';
  IF v_school_id IS NULL THEN RAISE EXCEPTION 'Non autorisé'; END IF;
  -- Auto-réparation : amorce le catalogue si l'école n'en a pas encore (écoles
  -- créées après la migration). Idempotent (ON CONFLICT DO NOTHING).
  IF NOT EXISTS (SELECT 1 FROM governance_roles WHERE school_id = v_school_id) THEN
    PERFORM public.seed_governance_catalog(v_school_id);
  END IF;
  -- Le rôle doit exister dans le catalogue de l'école (plus de liste blanche figée).
  IF NOT EXISTS (SELECT 1 FROM governance_roles WHERE school_id = v_school_id AND code = p_role) THEN
    RAISE EXCEPTION 'Rôle de gouvernance inconnu : %', p_role;
  END IF;

  INSERT INTO user_governance_roles (school_id, user_id, role, sector, start_date, end_date, status)
  VALUES (v_school_id, p_user_id, p_role, p_sector, p_start_date, p_end_date, COALESCE(p_status,'active'))
  ON CONFLICT (school_id, user_id, role) DO UPDATE
    SET sector = EXCLUDED.sector, start_date = EXCLUDED.start_date,
        end_date = EXCLUDED.end_date, status = EXCLUDED.status, updated_at = now()
  RETURNING id INTO v_id;

  INSERT INTO governance_role_history (school_id, user_id, role_code, action, sector, start_date, end_date, actor_id, actor_name)
  VALUES (v_school_id, p_user_id, p_role, 'assigned', p_sector, p_start_date, p_end_date, auth.uid(), v_actor);
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.admin_revoke_governance_role(p_id uuid)
  RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_school_id uuid; v_actor text; v_row user_governance_roles%ROWTYPE;
BEGIN
  SELECT school_id, full_name INTO v_school_id, v_actor FROM school_users
   WHERE user_id = auth.uid() AND active = true AND role = 'admin';
  IF v_school_id IS NULL THEN RAISE EXCEPTION 'Non autorisé'; END IF;
  SELECT * INTO v_row FROM user_governance_roles WHERE id = p_id AND school_id = v_school_id;
  IF v_row.id IS NULL THEN RETURN; END IF;
  DELETE FROM user_governance_roles WHERE id = p_id AND school_id = v_school_id;
  INSERT INTO governance_role_history (school_id, user_id, role_code, action, sector, actor_id, actor_name)
  VALUES (v_school_id, v_row.user_id, v_row.role, 'revoked', v_row.sector, auth.uid(), v_actor);
END $$;

GRANT EXECUTE ON FUNCTION public.admin_assign_governance_role(uuid, text, text, date, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revoke_governance_role(uuid)                               TO authenticated;
GRANT EXECUTE ON FUNCTION public.seed_governance_catalog(uuid)                                    TO authenticated;

-- ── 7. Colonnes + triggers de synchronisation continue (Phase 2 sync) ───────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['governance_roles','governance_role_history','user_governance_roles'] LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now()', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS device_id text', t);
    IF to_regprocedure('public.touch_sync_row()') IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_touch_%1$s ON public.%1$I', t);
      EXECUTE format('CREATE TRIGGER trg_touch_%1$s BEFORE UPDATE ON public.%1$I FOR EACH ROW EXECUTE FUNCTION public.touch_sync_row()', t);
    END IF;
    IF to_regprocedure('public.log_tombstone()') IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_tomb_%1$s ON public.%1$I', t);
      EXECUTE format('CREATE TRIGGER trg_tomb_%1$s AFTER DELETE ON public.%1$I FOR EACH ROW EXECUTE FUNCTION public.log_tombstone()', t);
    END IF;
  END LOOP;
END $$;
