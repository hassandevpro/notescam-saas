-- ════════════════════════════════════════════════════════════════════════════
-- ACTIVATION PILOTE — Gouvernance financière distante (architecture hybride H1→H7)
-- École : MAARIF SCHOOL OF CAMEROON (369fa0e3-318f-4130-94b3-6f14d007ca85)
-- Décidé par Hassan le 2026-07-27. Idempotent. Portée = cette seule école.
--
-- Ce que ça fait :
--   1. Autorité d'approbation : ajoute au rôle `fondatrice` les droits de DÉCISION
--      (expense.approve/reject, budget.approve, budget.annual.revise,
--      budget.reallocate.decide) — absents du catalogue en prod, sinon l'applicateur
--      LAN rejetterait toute décision en `rejected_unauthorized`.
--   2. Accès distant : remote_access_allowed=true pour les 3 comptes fondatrice.
--   3. Politique de déploiement : finance LAN-first + gouvernance déléguée au Cloud.
--      Les modules NON-finance (notes, frais, …) restent HYBRIDES = comportement
--      actuel inchangé (policyEngine : pas de clé `default` ⇒ fallback hybride).
--
-- Tables synchronisées (governance_roles / school_users / schools) ⇒ ces réglages
-- se répliquent au LAN pilote au prochain drain (NOTESCAM_CLOUD_SYNC=1).
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;

-- 1. Autorité d'approbation sur le rôle fondatrice (union idempotente).
UPDATE governance_roles
SET permissions = (
  SELECT jsonb_agg(DISTINCT p ORDER BY p)
  FROM jsonb_array_elements_text(
    permissions || '["expense.approve","expense.reject","budget.approve","budget.annual.revise","budget.reallocate.decide"]'::jsonb
  ) AS p
)
WHERE school_id = '369fa0e3-318f-4130-94b3-6f14d007ca85'
  AND code = 'fondatrice';

-- 2. Accès distant pour les décideurs (les 3 comptes fondatrice de l'école).
UPDATE school_users
SET remote_access_allowed = true
WHERE school_id = '369fa0e3-318f-4130-94b3-6f14d007ca85'
  AND user_id IN (
    SELECT user_id FROM user_governance_roles
    WHERE school_id = '369fa0e3-318f-4130-94b3-6f14d007ca85'
      AND role = 'fondatrice'
  );

-- 3. Politique de déploiement : finance LAN-first + gouvernance distante ; le reste
--    reste hybride (inchangé). Activation minimale conforme au point 2 de la recette.
UPDATE schools
SET deployment_policy = '{"finance":{"execution":"lan","governance":"cloud"}}'::jsonb
WHERE id = '369fa0e3-318f-4130-94b3-6f14d007ca85';

COMMIT;
