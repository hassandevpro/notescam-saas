-- ════════════════════════════════════════════════════════════════════════════
-- SAUVEGARDE AUTOMATIQUE + EXPORT / RESTAURATION COMPLÈTE D'UN ÉTABLISSEMENT
-- ════════════════════════════════════════════════════════════════════════════
--
-- RÈGLE DE DÉCOUVERTE (identique à src/lib/backupCore.js et server/rpc.js) :
--   toute table de `public` qui porte une colonne `school_id` fait partie de la
--   sauvegarde de l'école, plus la ligne `schools` elle-même.
-- Aucune liste de tables n'est écrite ici : un module ajouté plus tard (table
-- avec school_id) est sauvegardé sans retoucher ce fichier.
--
-- Exclusions (secrets + mécanique interne) — DOIT rester le miroir exact de
-- EXCLUDED_TABLE_PATTERNS dans src/lib/backupCore.js (vérifié par
-- src/lib/_backupCore.test.mjs).
--
-- CE QUE ÇA PROTÈGE : erreurs humaines (élèves supprimés, notes écrasées,
-- import raté), récupération d'une école d'un jour sur l'autre.
-- CE QUE ÇA NE PROTÈGE PAS : la perte du projet Supabase lui-même — les
-- instantanés vivent dans la même base. Pour ça : sauvegardes Supabase (plan
-- Pro, PITR) ET les exports JSON téléchargés par les écoles.
--
-- Additive et idempotente. Prérequis : public.is_school_admin(uuid).
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Exclusions ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._backup_is_excluded(p_table text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT p_table ~* '(token|secret|password|pwd|pairing|credential|sms_settings)'
      OR p_table ~* '^sync_'
      OR p_table ~* '^school_backups$';
$$;

-- ── 2. Catalogue découvert depuis le schéma réel ───────────────────────────
-- [{ table, scope: 'school_id'|'id', pk: [...], deps: [...], columns: [...] }]
CREATE OR REPLACE FUNCTION public._backup_catalog_internal()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog AS $$
  WITH t AS (
    SELECT c.oid, c.relname::text AS name,
           CASE WHEN c.relname = 'schools' THEN 'id' ELSE 'school_id' END AS scope
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relkind IN ('r', 'p')
       AND NOT c.relispartition
       AND (c.relname = 'schools' OR EXISTS (
             SELECT 1 FROM pg_attribute a
              WHERE a.attrelid = c.oid AND a.attname = 'school_id'
                AND a.attnum > 0 AND NOT a.attisdropped))
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'table', t.name,
           'scope', t.scope,
           'pk', COALESCE((
              SELECT jsonb_agg(a.attname::text ORDER BY k.ord)
                FROM pg_index i
                CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY AS k(attnum, ord)
                JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum
               WHERE i.indrelid = t.oid AND i.indisprimary), '[]'::jsonb),
           'deps', COALESCE((
              SELECT jsonb_agg(DISTINCT r.relname::text)
                FROM pg_constraint f
                JOIN pg_class r ON r.oid = f.confrelid
               WHERE f.conrelid = t.oid AND f.contype = 'f'), '[]'::jsonb),
           -- Colonnes inscriptibles (hors colonnes générées) : la restauration
           -- retire d'une vieille sauvegarde les colonnes disparues depuis.
           'columns', COALESCE((
              SELECT jsonb_agg(a.attname::text ORDER BY a.attnum)
                FROM pg_attribute a
               WHERE a.attrelid = t.oid AND a.attnum > 0 AND NOT a.attisdropped
                 AND a.attgenerated = ''), '[]'::jsonb)
         ) ORDER BY t.name), '[]'::jsonb)
    FROM t;
$$;

-- Point d'entrée client : réservé à l'admin de l'école.
CREATE OR REPLACE FUNCTION public.backup_catalog(p_school uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_school_admin(p_school) THEN
    RAISE EXCEPTION 'Réservé à l''administrateur de l''établissement' USING ERRCODE = '42501';
  END IF;
  RETURN public._backup_catalog_internal();
END $$;

-- ── 3. Instantanés stockés ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.school_backups (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  kind        text NOT NULL DEFAULT 'auto' CHECK (kind IN ('auto', 'manual')),
  counts      jsonb NOT NULL DEFAULT '{}'::jsonb,
  total_rows  integer NOT NULL DEFAULT 0,
  bytes       bigint NOT NULL DEFAULT 0,
  payload     jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS school_backups_school_created_idx
  ON public.school_backups (school_id, created_at DESC);

ALTER TABLE public.school_backups ENABLE ROW LEVEL SECURITY;
-- Lecture : admin de l'école. Aucune écriture directe : uniquement par les
-- fonctions ci-dessous (un instantané falsifié serait restauré tel quel).
DROP POLICY IF EXISTS school_backups_admin_read ON public.school_backups;
CREATE POLICY school_backups_admin_read ON public.school_backups
  FOR SELECT TO authenticated USING (public.is_school_admin(school_id));
REVOKE ALL ON public.school_backups FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.school_backups FROM authenticated;
-- Explicite : ne pas dépendre des privilèges par défaut du projet.
GRANT SELECT ON public.school_backups TO authenticated;

-- Construit et enregistre l'instantané d'UNE école. Rotation par type.
CREATE OR REPLACE FUNCTION public._backup_snapshot(p_school uuid, p_kind text DEFAULT 'auto')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_entry   jsonb;
  v_catalog jsonb := '[]'::jsonb;
  v_excl    jsonb := '[]'::jsonb;
  v_tables  jsonb := '{}'::jsonb;
  v_counts  jsonb := '{}'::jsonb;
  v_rows    jsonb;
  v_n       integer;
  v_total   integer := 0;
  v_payload jsonb;
  v_id      uuid;
  v_keep    integer := CASE WHEN p_kind = 'manual' THEN 5 ELSE 7 END;
BEGIN
  FOR v_entry IN SELECT e FROM jsonb_array_elements(public._backup_catalog_internal()) e LOOP
    IF public._backup_is_excluded(v_entry->>'table') THEN
      v_excl := v_excl || to_jsonb(v_entry->>'table');
      CONTINUE;
    END IF;
    EXECUTE format(
      'SELECT COALESCE(jsonb_agg(to_jsonb(x)), ''[]''::jsonb), count(*)::int FROM public.%I x WHERE x.%I = $1',
      v_entry->>'table', v_entry->>'scope')
      INTO v_rows, v_n USING p_school;
    v_tables  := v_tables  || jsonb_build_object(v_entry->>'table', v_rows);
    v_counts  := v_counts  || jsonb_build_object(v_entry->>'table', v_n);
    v_catalog := v_catalog || jsonb_build_array(jsonb_build_object(
                   'table', v_entry->>'table', 'pk', v_entry->'pk', 'deps', v_entry->'deps'));
    v_total   := v_total + v_n;
  END LOOP;

  v_payload := jsonb_build_object(
    'format', 'notescam-backup', 'version', 1,
    'schoolId', p_school, 'edition', 'cloud', 'createdAt', now(),
    'catalog', v_catalog, 'excluded', v_excl,
    'counts', v_counts, 'totalRows', v_total, 'tables', v_tables);

  INSERT INTO public.school_backups (school_id, kind, counts, total_rows, bytes, payload)
  VALUES (p_school, p_kind, v_counts, v_total, pg_column_size(v_payload), v_payload)
  RETURNING id INTO v_id;

  DELETE FROM public.school_backups b
   WHERE b.school_id = p_school AND b.kind = p_kind
     AND b.id NOT IN (SELECT id FROM public.school_backups
                       WHERE school_id = p_school AND kind = p_kind
                       ORDER BY created_at DESC LIMIT v_keep);
  RETURN v_id;
END $$;

-- Instantané à la demande (admin). Anti-rafale : un par 10 minutes.
CREATE OR REPLACE FUNCTION public.backup_snapshot_now(p_school uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_school_admin(p_school) THEN
    RAISE EXCEPTION 'Réservé à l''administrateur de l''établissement' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.school_backups
              WHERE school_id = p_school AND kind = 'manual'
                AND created_at > now() - interval '10 minutes') THEN
    RAISE EXCEPTION 'Une sauvegarde vient d''être faite : réessayez dans quelques minutes.' USING ERRCODE = 'P0001';
  END IF;
  RETURN public._backup_snapshot(p_school, 'manual');
END $$;

-- Tâche planifiée : toutes les écoles. Une école en échec n'arrête pas les autres.
CREATE OR REPLACE FUNCTION public.backup_snapshot_all()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s record; n integer := 0;
BEGIN
  FOR s IN SELECT id FROM public.schools LOOP
    BEGIN
      PERFORM public._backup_snapshot(s.id, 'auto');
      n := n + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '[backup] école % : %', s.id, SQLERRM;
    END;
  END LOOP;
  RETURN n;
END $$;

REVOKE ALL ON FUNCTION public._backup_catalog_internal() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._backup_snapshot(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.backup_snapshot_all() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.backup_catalog(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.backup_snapshot_now(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.backup_catalog(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.backup_snapshot_now(uuid) TO authenticated;

-- ── 4. Planification nocturne (pg_cron, si disponible) ──────────────────────
-- 02:17 UTC (≈ 03:17 Douala/Libreville) : hors heures de saisie.
-- Si pg_cron n'est pas activé (Dashboard → Database → Extensions), rien ne
-- casse : un AVERTISSEMENT le dit, et les sauvegardes manuelles marchent.
DO $$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[backup] pg_cron indisponible (%). Activez-le puis rejouez ce fichier pour la sauvegarde automatique.', SQLERRM;
    RETURN;
  END;
  BEGIN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'notescam-school-backups';
    PERFORM cron.schedule('notescam-school-backups', '17 2 * * *', 'SELECT public.backup_snapshot_all()');
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[backup] planification pg_cron impossible : %', SQLERRM;
  END;
END $$;
