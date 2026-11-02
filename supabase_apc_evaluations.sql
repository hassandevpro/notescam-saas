-- ============================================================================
-- PREMIER CYCLE — NOMBRE D'ÉVALUATIONS PAR MATIÈRE DANS LE TRIMESTRE
-- ============================================================================
-- Consigne du responsable, 2026-11-01 :
--
--     « Le nombre d'évaluations par trimestre doit être déduit du nombre de
--       compétences (1 compétence → 2 évaluations, 2 → 2, 3 → 3), mais
--       configurable par matière si besoin. »
--
-- La DÉDUCTION est dans le code (`src/core/apcEvaluations.js`) et ne demande
-- aucune donnée : toute école fonctionne sans que cette colonne soit remplie.
-- Celle-ci ne porte que les EXCEPTIONS, matière par matière :
--
--     { "6e|francais": 3, "3e|mathematiques": 4 }
--
-- La clé est « <classe>|<matière> » : la même matière peut légitimement demander
-- deux évaluations en 6e et trois en 3e. Une valeur qui retombe sur la déduction
-- est retirée de l'objet, pour qu'une liste d'exceptions reste lisible.
--
-- POURQUOI UNE COLONNE JSON SUR `schools`, et pas une table. C'est déjà le
-- mécanisme en place pour ce genre de réglage (`apc_bulletin_cols`,
-- `validation_rules`, `deployment_policy`). Une table nouvelle aurait demandé
-- d'être déclarée dans la synchronisation, le Merkle, le scope guard, la
-- politique d'accès et les fonctions Edge — donc un redéploiement et une
-- autorisation de mise en production, pour une préférence de saisie.
--
-- ⛔ ORDRE D'EXÉCUTION — ce fichier D'ABORD, l'application ENSUITE.
-- `schools` est poussée colonne par colonne : une colonne que le Cloud ne
-- connaît pas fait rejeter TOUTE la ligne (PGRST204), donc tout réglage d'école.
--
-- Additif et idempotent : rejouable sans effet.
-- ============================================================================

ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS apc_evaluations text;

COMMENT ON COLUMN public.schools.apc_evaluations IS
  'Premier cycle : nombre d''évaluations par trimestre, par matière. JSON { "<classe>|<matière>": n }. Liste d''exceptions ; vide = nombre déduit du nombre de compétences (core/apcEvaluations.js).';

-- ── Contrôle (lecture seule) ───────────────────────────────────────────────
SELECT
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'schools'
      AND column_name = 'apc_evaluations')            AS colonne_presente,
  (SELECT count(*) FROM public.schools
    WHERE apc_evaluations IS NOT NULL)                AS ecoles_avec_exception;
