-- ============================================================================
-- Rattacher les 6 compétences maison à la version ACTIVE du référentiel
-- ============================================================================
-- `src/lib/apcService.js:42` ne charge que les compétences dont le
-- `referentiel_version_id` figure parmi les versions actives :
--     compQ.in('referentiel_version_id', activeVersionIds)
-- Les six lignes créées avec ce champ à NULL existaient donc en base sans
-- jamais être chargées par l'application — matière absente de l'écran, notes
-- invisibles. Ce champ n'est pas décoratif, il conditionne le chargement.
--
-- Le même oubli touche le produit lui-même : `contexteApc`
-- (ApcCompetenceWorkspace:282) ne transmet pas ce champ, donc toute compétence
-- ajoutée par une école en premier cycle subit exactement le même sort. Corrigé
-- séparément côté code.
--
-- Une seule version active : 9abce227-12a3-48a4-8479-ec262dcf6175
-- (« MINESEC — Référentiel APC Premier cycle (6e–3e) »).
-- ============================================================================

BEGIN;

UPDATE public.apc_competences
   SET referentiel_version_id = '9abce227-12a3-48a4-8479-ec262dcf6175'
 WHERE school_id  = 'a8b8fb00-7184-4aec-a39a-3d93a723000a'
   AND matiere_id = 'espagnol'
   AND referentiel_version_id IS NULL;

DO $$
DECLARE n int; n_nul int;
BEGIN
  SELECT count(*) INTO n FROM public.apc_competences
   WHERE school_id = 'a8b8fb00-7184-4aec-a39a-3d93a723000a'
     AND referentiel_version_id = '9abce227-12a3-48a4-8479-ec262dcf6175';
  SELECT count(*) INTO n_nul FROM public.apc_competences
   WHERE school_id = 'a8b8fb00-7184-4aec-a39a-3d93a723000a'
     AND referentiel_version_id IS NULL;
  IF n <> 6 OR n_nul <> 0 THEN
    RAISE EXCEPTION 'Contrôle refusé : rattachées=% (6 attendu), restées NULL=% (0 attendu)', n, n_nul;
  END IF;
END $$;

COMMIT;
