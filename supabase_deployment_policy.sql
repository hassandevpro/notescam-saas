-- supabase_deployment_policy.sql — H1 : politique de déploiement hybride par module.
--
-- Additif et INERTE : ajoute une seule colonne nullable sur `schools`. Une valeur
-- NULL (cas de TOUS les établissements aujourd'hui) = comportement de synchro
-- ACTUEL, strictement inchangé (cf. src/lib/policyEngine.js : défaut = hybride,
-- push+pull pour toutes les tables). Aucune donnée déplacée, aucune RLS modifiée.
--
-- Forme JSON attendue (tous champs facultatifs) — lue par policyEngine :
--   {
--     "finance":   { "execution": "lan",    "governance": "cloud" },
--     "notes":     { "execution": "hybrid" },
--     "bulletins": { "execution": "lan" },
--     "default":   { "execution": "hybrid" }
--   }
--   execution ∈ { 'lan' | 'cloud' | 'hybrid' } ; governance ∈ { 'cloud' | absent }.
--
-- À coller dans Supabase → SQL Editor → Run.

ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS deployment_policy jsonb;

COMMENT ON COLUMN public.schools.deployment_policy IS
  'Politique hybride LAN/Cloud par module (H1). NULL = comportement de synchro actuel (hybride complet).';
