-- ============================================================================
-- supabase_sync_etat_lan.sql — le voyant « synchro OK / en attente / échec »
-- de l'administrateur EN LIGNE.
--
-- POURQUOI. L'administrateur d'une école voit, sur son serveur d'école, l'état de
-- la synchronisation. En ligne il ne voyait rien : le Cloud ne peut pas interroger
-- un serveur derrière un routeur. Le serveur de l'école DIT donc son état au Cloud
-- à chaque tirage (corps de l'appel sync-pull, champ `etat`), et sync-pull le range
-- dans `sync_client_state`. Cette migration ajoute les colonnes qui le reçoivent et
-- UNE fonction de lecture, réservée à l'administrateur de l'école.
--
-- ADDITIVE ET IDEMPOTENTE. Aucune donnée existante n'est touchée ; colonnes nulles
-- tant qu'un serveur d'école n'a pas la version qui envoie son état.
--
-- ORDRE DE DÉPLOIEMENT : sans importance. La fonction sync-pull range l'état par une
-- écriture SÉPARÉE à erreur ignorée : exécutée avant ce fichier, elle ne casse rien ;
-- ce fichier exécuté avant elle non plus.
--
-- SÉCURITÉ. `sync_client_state` reste fermée (RLS sans policy, REVOKE) : seules les
-- fonctions Edge (service_role) y écrivent. La lecture passe par sync_etat_ecole(),
-- SECURITY DEFINER, qui exige is_school_admin(p_school) — un administrateur ne lit
-- que SON école, un enseignant, un parent ou un anonyme ne lisent rien.
--
-- RETOUR ARRIÈRE (aucune donnée métier n'est en jeu) :
--   DROP FUNCTION IF EXISTS public.sync_etat_ecole(uuid);
--   ALTER TABLE public.sync_client_state
--     DROP COLUMN IF EXISTS lan_pending,  DROP COLUMN IF EXISTS lan_quarantined,
--     DROP COLUMN IF EXISTS lan_conflicts, DROP COLUMN IF EXISTS lan_last_error,
--     DROP COLUMN IF EXISTS lan_last_error_kind, DROP COLUMN IF EXISTS lan_last_success_at,
--     DROP COLUMN IF EXISTS lan_version;
-- ============================================================================

ALTER TABLE public.sync_client_state
  ADD COLUMN IF NOT EXISTS lan_pending          integer,      -- lignes en file d'envoi à l'école
  ADD COLUMN IF NOT EXISTS lan_quarantined      integer,      -- lignes que le Cloud a refusées et qui sont mises de côté
  ADD COLUMN IF NOT EXISTS lan_conflicts        integer,      -- désaccords en attente d'arbitrage
  ADD COLUMN IF NOT EXISTS lan_last_error       text,         -- dernier message d'erreur (tronqué à 200)
  ADD COLUMN IF NOT EXISTS lan_last_error_kind  text,         -- 'network' | 'error'
  ADD COLUMN IF NOT EXISTS lan_last_success_at  timestamptz,  -- dernier cycle réussi, selon l'école
  ADD COLUMN IF NOT EXISTS lan_version          text;         -- version de NotesCam sur le serveur d'école

COMMENT ON COLUMN public.sync_client_state.lan_pending IS
  'Déclaré par le serveur d''école à chaque sync-pull. Valeur NULL = ce serveur ne déclare pas encore son état.';

CREATE OR REPLACE FUNCTION public.sync_etat_ecole(p_school uuid)
RETURNS TABLE (
  last_pull_at         timestamptz,
  lan_pending          integer,
  lan_quarantined      integer,
  lan_conflicts        integer,
  lan_last_error       text,
  lan_last_error_kind  text,
  lan_last_success_at  timestamptz,
  lan_version          text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.last_pull_at, s.lan_pending, s.lan_quarantined, s.lan_conflicts,
         s.lan_last_error, s.lan_last_error_kind, s.lan_last_success_at, s.lan_version
    FROM public.sync_client_state s
   WHERE s.school_id = p_school
     AND public.is_school_admin(p_school);
$$;

REVOKE ALL ON FUNCTION public.sync_etat_ecole(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.sync_etat_ecole(uuid) TO authenticated;

-- Contrôle : les 7 colonnes et la fonction existent.
DO $$
DECLARE manquantes int;
BEGIN
  SELECT 7 - COUNT(*) INTO manquantes FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'sync_client_state' AND column_name LIKE 'lan\_%';
  IF manquantes <> 0 THEN RAISE EXCEPTION 'sync_client_state : % colonne(s) lan_* manquante(s)', manquantes; END IF;
  IF to_regprocedure('public.sync_etat_ecole(uuid)') IS NULL THEN
    RAISE EXCEPTION 'sync_etat_ecole(uuid) absente';
  END IF;
END $$;
