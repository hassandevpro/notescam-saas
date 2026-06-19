-- supabase_sync_tombstones_rls_fix.sql
-- Correctif : la suppression d'une ligne synchronisée (élève, classe, etc.)
-- échouait avec :
--   « new row violates row-level security policy for table "sync_tombstones" »
--
-- Cause : le trigger AFTER DELETE log_tombstone() insère dans sync_tombstones,
-- table protégée par RLS sans policy pour les rôles applicatifs. Comme la
-- fonction n'était pas SECURITY DEFINER, l'INSERT s'exécutait avec les droits
-- de l'utilisateur courant → refusé par la RLS → DELETE annulé.
--
-- Solution : recréer la fonction en SECURITY DEFINER (elle s'exécute alors pour
-- le compte de son propriétaire, qui contourne la RLS), search_path figé.
--
-- À coller dans Supabase → SQL Editor → Run. Idempotent.

CREATE OR REPLACE FUNCTION public.log_tombstone() RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE sid uuid;
BEGIN
  sid := CASE WHEN TG_TABLE_NAME = 'schools' THEN OLD.id ELSE OLD.school_id END;
  IF sid IS NOT NULL THEN
    INSERT INTO public.sync_tombstones (school_id, tablename, row_id, deleted_at)
    VALUES (sid, TG_TABLE_NAME, OLD.id, now())
    ON CONFLICT (school_id, tablename, row_id) DO UPDATE SET deleted_at = excluded.deleted_at;
  END IF;
  RETURN OLD;
END $$;
