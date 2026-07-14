-- ============================================================
-- NotesCam — GOUVERNANCE du complexe scolaire
-- À coller dans : Supabase → SQL Editor → New query → Run
-- Idempotent. Requiert supabase_sync_phase2.sql (fonctions de sync).
-- ============================================================
--
-- Rôles de DIRECTION cumulables au rôle de base (school_users.role INCHANGÉ) :
-- fondatrice, coordonnateur_general, responsable_maternelle, directrice_primaire,
-- directrice_adjointe_primaire, principal, vice_principal, raf, caissier.
--
-- Un utilisateur porte donc [role_base, ...roles_gouvernance]. Ces rôles servent
-- aux WORKFLOWS DE VALIDATION à venir (module Budgets → Dépenses). Cette migration
-- est ADDITIVE : elle ne modifie NI l'enum school_users.role NI le module Budgets.

-- 1. Table d'attribution (un compte -> un rôle de gouvernance, éventuellement
--    borné à un secteur pour les chefs de secteur).
CREATE TABLE IF NOT EXISTS user_governance_roles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL,                 -- compte visé (school_users.user_id / auth.users)
  role        text NOT NULL,                 -- id de rôle de gouvernance
  sector      text,                          -- surcharge de périmètre (défaut = secteur natif du rôle)
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz,
  UNIQUE (school_id, user_id, role)
);
CREATE INDEX IF NOT EXISTS ugr_school_idx ON user_governance_roles (school_id);
CREATE INDEX IF NOT EXISTS ugr_user_idx   ON user_governance_roles (school_id, user_id);

-- Liste blanche des rôles (garde-fou côté base).
CREATE OR REPLACE FUNCTION public.is_governance_role(p_role text) RETURNS boolean
  LANGUAGE sql IMMUTABLE AS $$
  SELECT p_role IN ('fondatrice','coordonnateur_general','responsable_maternelle',
    'directrice_primaire','directrice_adjointe_primaire','principal',
    'vice_principal','raf','caissier');
$$;

-- 2. RLS : LECTURE pour les membres de l'école ; ÉCRITURE réservée aux RPC
--    admin (SECURITY DEFINER) -> pas de policy d'écriture = PostgREST direct
--    refusé (un membre ne peut pas s'auto-attribuer « fondatrice »).
ALTER TABLE user_governance_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ugr_select ON user_governance_roles;
CREATE POLICY ugr_select ON user_governance_roles
  FOR SELECT
  USING (school_id IN (SELECT school_id FROM school_users WHERE user_id = auth.uid()));

-- 3. RPC admin : attribuer un rôle de gouvernance.
CREATE OR REPLACE FUNCTION public.admin_assign_governance_role(
  p_user_id uuid, p_role text, p_sector text DEFAULT NULL
) RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_school_id uuid; v_id uuid;
BEGIN
  IF NOT public.is_governance_role(p_role) THEN RAISE EXCEPTION 'Rôle de gouvernance invalide'; END IF;
  SELECT school_id INTO v_school_id FROM school_users
   WHERE user_id = auth.uid() AND active = true AND role = 'admin';
  IF v_school_id IS NULL THEN RAISE EXCEPTION 'Non autorisé'; END IF;

  INSERT INTO user_governance_roles (school_id, user_id, role, sector)
  VALUES (v_school_id, p_user_id, p_role, p_sector)
  ON CONFLICT (school_id, user_id, role) DO UPDATE SET sector = EXCLUDED.sector, updated_at = now()
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- 4. RPC admin : révoquer un rôle.
CREATE OR REPLACE FUNCTION public.admin_revoke_governance_role(p_id uuid)
  RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_school_id uuid;
BEGIN
  SELECT school_id INTO v_school_id FROM school_users
   WHERE user_id = auth.uid() AND active = true AND role = 'admin';
  IF v_school_id IS NULL THEN RAISE EXCEPTION 'Non autorisé'; END IF;
  DELETE FROM user_governance_roles WHERE id = p_id AND school_id = v_school_id;
END $$;

GRANT EXECUTE ON FUNCTION public.admin_assign_governance_role(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revoke_governance_role(uuid)             TO authenticated;

-- 5. Drapeau d'activation des workflows de validation budgétaire.
--    Défaut FALSE -> le module Budgets garde EXACTEMENT son comportement actuel.
ALTER TABLE schools ADD COLUMN IF NOT EXISTS budget_validation boolean NOT NULL DEFAULT false;

-- 6. Colonnes + triggers de synchronisation continue (Phase 2).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['user_governance_roles'] LOOP
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
