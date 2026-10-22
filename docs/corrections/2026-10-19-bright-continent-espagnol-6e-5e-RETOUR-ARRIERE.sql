-- ============================================================================
-- RETOUR ARRIÈRE de espagnol-6e-5e.sql
-- ============================================================================
-- Retire les 12 notes puis les 6 compétences maison. Ne cible QUE les lignes
-- portant le `school_id` de l'école et la matière espagnol : le référentiel
-- national n'est jamais atteint, et les 128 notes APC d'avant restent.
--
-- Les notes sont supprimées AVANT les compétences, sans compter sur une
-- cascade : on ne suppose rien du comportement de la clé étrangère.
-- ============================================================================

BEGIN;

DELETE FROM public.apc_notes
 WHERE school_id = 'a8b8fb00-7184-4aec-a39a-3d93a723000a'
   AND competence_id IN (
     SELECT id FROM public.apc_competences
      WHERE school_id = 'a8b8fb00-7184-4aec-a39a-3d93a723000a'
        AND matiere_id = 'espagnol');

DELETE FROM public.apc_competences
 WHERE school_id = 'a8b8fb00-7184-4aec-a39a-3d93a723000a'
   AND matiere_id = 'espagnol';

DO $$
DECLARE n_apc int; n_comp int;
BEGIN
  SELECT count(*) INTO n_apc  FROM public.apc_notes          WHERE school_id = 'a8b8fb00-7184-4aec-a39a-3d93a723000a';
  SELECT count(*) INTO n_comp FROM public.apc_competences    WHERE school_id = 'a8b8fb00-7184-4aec-a39a-3d93a723000a';
  IF n_apc <> 128 OR n_comp <> 0 THEN
    RAISE EXCEPTION 'Retour arrière refusé : apc_notes=% (128 attendu), compétences maison=% (0 attendu)', n_apc, n_comp;
  END IF;
END $$;

COMMIT;
