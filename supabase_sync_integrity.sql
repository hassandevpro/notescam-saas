-- supabase_sync_integrity.sql
-- Contrôle d'intégrité Cloud ↔ LAN (vérification post-appairage / post-synchro).
--
-- Fournit la RPC `sync_integrity(school, tables[])` qui calcule, POUR CHAQUE table
-- répliquée et POUR UNE école, un triplet comparable au serveur LAN :
--   • row_count   — nombre de lignes ;
--   • checksum    — md5 de la liste « id:version » TRIÉE par id (ordre-octet) ;
--   • max_updated — epoch (secondes) du dernier updated_at.
--
-- POURQUOI ce checksum et pas un hash de toutes les colonnes :
--   Postgres et SQLite formatent différemment dates / flottants / JSON. Un hash de
--   contenu complet produirait des divergences PERMANENTES (faux échecs) même quand
--   les données sont logiquement identiques. Le couple (id, version) est piloté par
--   la couche de synchro (LWW) et se sérialise à l'identique des deux moteurs : le
--   checksum détecte précisément les lignes manquantes/en trop ET la non-convergence
--   (versions différentes), qui sont exactement les écarts que l'on veut bloquer.
--
--   L'ordre de tri est forcé en COLLATE "C" (ordre des octets) pour COÏNCIDER avec
--   le `ORDER BY id` de SQLite (collation BINARY par défaut). Sans cela, une collation
--   linguistique Postgres réordonnerait les UUID et casserait le checksum.
--
-- Sécurité : SECURITY DEFINER, réservée à service_role (appelée par l'Edge sync-verify,
-- qui a déjà résolu l'école à partir du jeton scellé). format(%I) + to_regclass
-- neutralisent toute injection via le tableau de noms de tables.
--
-- À coller dans Supabase → SQL Editor → Run. Prérequis : supabase_sync_phase2.sql.

CREATE OR REPLACE FUNCTION public.sync_integrity(p_school uuid, p_tables text[])
RETURNS TABLE(tablename text, row_count bigint, checksum text, max_updated bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t          text;
  scope_col  text;
  q          text;
BEGIN
  FOREACH t IN ARRAY p_tables LOOP
    tablename   := t;
    row_count   := NULL;
    checksum    := NULL;
    max_updated := NULL;

    -- Table absente du Cloud : on le signale explicitement (jamais silencieux).
    IF to_regclass('public.' || t) IS NULL THEN
      checksum := 'absent';
      RETURN NEXT;
      CONTINUE;
    END IF;

    scope_col := CASE WHEN t = 'schools' THEN 'id' ELSE 'school_id' END;

    -- Empty table : string_agg -> NULL -> coalesce vers md5('') pour rester comparable
    -- au serveur LAN (qui hashe la chaîne vide de la même façon).
    q := format(
      'SELECT count(*)::bigint,
              coalesce(md5(string_agg(id::text || '':'' || coalesce(version::text, ''''), '','' ORDER BY (id::text) COLLATE "C")), md5('''')),
              floor(extract(epoch FROM max(updated_at)))::bigint
         FROM public.%I
        WHERE %I = $1',
      t, scope_col);

    BEGIN
      EXECUTE q INTO row_count, checksum, max_updated USING p_school;
    EXCEPTION WHEN others THEN
      -- Ex. colonne version/updated_at absente sur une table : on n'interrompt PAS
      -- tout le contrôle, on marque cette table en erreur pour l'affichage.
      row_count   := NULL;
      max_updated := NULL;
      checksum    := 'error:' || SQLERRM;
    END;

    RETURN NEXT;
  END LOOP;
END $$;

-- Réservé aux fonctions Edge (service_role). Personne d'autre ne doit l'appeler.
REVOKE ALL ON FUNCTION public.sync_integrity(uuid, text[]) FROM public;
REVOKE ALL ON FUNCTION public.sync_integrity(uuid, text[]) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_integrity(uuid, text[]) TO service_role;
