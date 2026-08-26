-- supabase_caissier_pages.sql
-- Le CAISSIER voit les MÊMES ONGLETS que le RAF.
--
-- Pourquoi une migration en plus du seed : `seed_governance_catalog()` est en
-- `ON CONFLICT DO NOTHING` — il n'a jamais corrigé une école déjà amorcée. Toutes
-- les écoles existantes gardent donc un caissier borné à `/app/depenses`.
--
-- UNION, jamais remplacement : on ajoute les pages du RAF sans retirer celles que
-- l'école aurait ajoutées elle-même (le catalogue est éditable par établissement
-- depuis la Phase 2). Les pages du caissier par défaut étant incluses dans celles
-- du RAF, l'union VAUT « exactement comme le RAF » partout où personne n'a
-- personnalisé le rôle — et ne détruit rien là où quelqu'un l'a fait.
--
-- Ce qui n'est PAS touché : `permissions` et `workflows`. Le caissier PAIE
-- (`expense.pay`) et n'approuve pas. Ouvrir un onglet n'ouvre aucun pouvoir : la
-- décision reste gardée par les policies RLS et par la matrice de validation.
--
-- Idempotent. À coller dans Supabase → SQL Editor → Run.

UPDATE public.governance_roles AS c
   SET pages = (
         SELECT jsonb_agg(DISTINCT p)
         FROM jsonb_array_elements(c.pages || r.pages) AS p
       )
  FROM public.governance_roles AS r
 WHERE r.school_id = c.school_id
   AND r.code = 'raf'
   AND c.code = 'caissier'
   AND NOT (c.pages @> r.pages);

-- Contrôle : doit renvoyer 0 ligne (plus aucun caissier en retard sur son RAF).
SELECT c.school_id, c.pages AS pages_caissier, r.pages AS pages_raf
  FROM public.governance_roles c
  JOIN public.governance_roles r
    ON r.school_id = c.school_id AND r.code = 'raf'
 WHERE c.code = 'caissier' AND NOT (c.pages @> r.pages);
