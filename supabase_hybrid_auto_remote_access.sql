-- supabase_hybrid_auto_remote_access.sql
-- « Assigner un rôle de gouvernance finance → voir/piloter la finance à distance »
-- SANS étape manuelle. En mode hybride (finance LAN + gouvernance Cloud), la RLS
-- exige school_users.remote_access_allowed=true pour VOIR la finance en ligne. Ce
-- drapeau est séparé du rôle (H4). Ce trigger le pose AUTOMATIQUEMENT dès qu'un
-- compte reçoit un rôle qui détient un droit finance — donc « ajouter fondatrice »
-- suffit désormais pour voir le budget en ligne, sans intervention.
--
-- Ne retire jamais l'accès (additif) : révocation manuelle si besoin. Idempotent.
-- Prérequis : supabase_h4_remote_governance.sql (remote_access_allowed).

CREATE OR REPLACE FUNCTION public.auto_remote_access_on_governance_role()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Le rôle attribué détient-il un droit FINANCE (vue, préparation, décision) ?
  IF EXISTS (
    SELECT 1 FROM public.governance_roles gr
    WHERE gr.school_id = NEW.school_id AND gr.code = NEW.role AND gr.active = true
      AND (gr.permissions)::jsonb ?| ARRAY[
        'budget.view','budget.prepare','budget.approve',
        'expense.view','expense.approve','expense.reject'
      ]
  ) THEN
    -- → le compte peut voir/piloter la finance à distance (mode hybride).
    UPDATE public.school_users
       SET remote_access_allowed = true
     WHERE school_id = NEW.school_id AND user_id = NEW.user_id
       AND remote_access_allowed = false;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_auto_remote_access ON public.user_governance_roles;
CREATE TRIGGER trg_auto_remote_access
  AFTER INSERT OR UPDATE OF role ON public.user_governance_roles
  FOR EACH ROW EXECUTE FUNCTION public.auto_remote_access_on_governance_role();

-- Rattrapage des affectations DÉJÀ existantes (une fois) : tout compte portant un
-- rôle finance obtient l'accès distant.
UPDATE public.school_users su SET remote_access_allowed = true
WHERE remote_access_allowed = false
  AND EXISTS (
    SELECT 1 FROM public.user_governance_roles ugr
      JOIN public.governance_roles gr ON gr.school_id = ugr.school_id AND gr.code = ugr.role AND gr.active = true
    WHERE ugr.school_id = su.school_id AND ugr.user_id = su.user_id
      AND (gr.permissions)::jsonb ?| ARRAY[
        'budget.view','budget.prepare','budget.approve','expense.view','expense.approve','expense.reject'
      ]
  );
