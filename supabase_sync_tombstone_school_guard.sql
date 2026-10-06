-- supabase_sync_tombstone_school_guard.sql
-- Correctif de log_tombstone(), qui faisait échouer DEUX suppressions légitimes.
--
-- 1) « ERROR 42703: record "old" has no field "school_id" » sur toute suppression
--    d'école. La fonction prévoyait pourtant le cas :
--       sid := CASE WHEN TG_TABLE_NAME = 'schools' THEN OLD.id ELSE OLD.school_id END
--    Mais PL/pgSQL résout les références de champ des DEUX branches du CASE à la
--    planification, contre le type réel de la ligne — pas seulement celle qui sera
--    prise. Sur `schools`, OLD.school_id n'existe pas → 42703, branche jamais
--    exécutée ou non. Le DELETE déclencheur était annulé.
--    → On lit la ligne via to_jsonb(OLD) : ->> renvoie NULL sur une clé ABSENTE
--      au lieu d'échouer.
--
-- 2) « ERROR 23503: violates foreign key constraint sync_tombstones_school_id_fkey »
--    une fois (1) corrigé. sync_tombstones.school_id RÉFÉRENCE schools(id) : écrire
--    une pierre tombale pour une école qu'on vient de supprimer est impossible par
--    construction. Et cette FK étant ON DELETE CASCADE, une telle pierre tombale
--    serait de toute façon effacée dans la foulée — elle n'a aucun destinataire.
--    → On ne trace PAS la suppression d'une école. Les pierres tombales de ses
--      lignes filles sont inutiles pour la même raison (cascade), mais leur écriture
--      reste inoffensive puisqu'elle précède la suppression de l'école.
--
-- Comportement INCHANGÉ pour les 38 autres tables répliquées.
--
-- À coller dans Supabase → SQL Editor → Run. Idempotent.
--
-- Diagnostic — tables porteuses du trigger mais sans colonne school_id :
--
--   SELECT c.relname
--     FROM pg_trigger tg
--     JOIN pg_class c ON c.oid = tg.tgrelid
--     JOIN pg_proc  p ON p.oid = tg.tgfoid
--    WHERE p.proname = 'log_tombstone' AND NOT tg.tgisinternal
--      AND NOT EXISTS (SELECT 1 FROM pg_attribute a
--                       WHERE a.attrelid = c.oid AND a.attname = 'school_id'
--                         AND a.attnum > 0 AND NOT a.attisdropped)
--    ORDER BY 1;

CREATE OR REPLACE FUNCTION public.log_tombstone() RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  j   jsonb;
  sid uuid;
  rid uuid;
BEGIN
  -- Suppression d'une école : rien à tracer (cf. point 2 de l'en-tête).
  IF TG_TABLE_NAME = 'schools' THEN
    RETURN OLD;
  END IF;

  j := to_jsonb(OLD);
  BEGIN
    sid := NULLIF(j ->> 'school_id', '')::uuid;
    rid := NULLIF(j ->> 'id', '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN OLD;   -- identifiant non-uuid : rien à tracer, on ne casse pas le DELETE
  END;

  IF sid IS NOT NULL AND rid IS NOT NULL THEN
    INSERT INTO public.sync_tombstones (school_id, tablename, row_id, deleted_at)
    VALUES (sid, TG_TABLE_NAME, rid, now())
    ON CONFLICT (school_id, tablename, row_id) DO UPDATE SET deleted_at = excluded.deleted_at;
  END IF;
  RETURN OLD;
END $$;
