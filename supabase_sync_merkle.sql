-- supabase_sync_merkle.sql
-- Arbre de Merkle ADAPTATIF côté Cloud — miroir EXACT de server/syncMerkle.js.
--
-- Maintient, PAR ÉCOLE et INCRÉMENTALEMENT (triggers), des checksums de partition pour
-- les tables volumineuses/critiques, afin que l'audit hiérarchique LAN ↔ Cloud descende
-- uniquement dans les partitions divergentes (jamais de scan global). Les petites tables
-- restent en contrôle ponctuel (RPC sync_integrity, cf. supabase_sync_integrity.sql).
--
-- FORMULE FIGÉE (doit coïncider bit à bit avec le LAN) :
--   leaf(tbl,id,ver) = mod( (('x'||substr(md5(tbl||':'||id||':'||coalesce(ver,'')),1,15))::bit(60))::bigint , P )
--   P = 2^61-1 = 2305843009213693951 (Mersenne). checksum(partition) = Σ leaf mod P.
--   Tri/agrégat commutatifs → identiques quel que soit l'ordre.
--
-- À coller dans Supabase → SQL Editor → Run. Idempotent. Prérequis : supabase_sync_phase2.sql
-- (colonnes version) + supabase_sync_integrity.sql (RPC sync_integrity pour les petites tables).

-- ── Store de partitions (multi-tenant : partitionné par école) ───────────────────
CREATE TABLE IF NOT EXISTS public.sync_merkle (
  school_id  uuid   NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  scope      text   NOT NULL,   -- 'table' | 'class' | 'student' | 'seq'
  part_key   text   NOT NULL,   -- '<table>' | '<table>|<value>'
  checksum   bigint NOT NULL DEFAULT 0,   -- dans [0, P)
  row_count  bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (school_id, scope, part_key)
);
ALTER TABLE public.sync_merkle ENABLE ROW LEVEL SECURITY; -- service_role uniquement (edge + triggers SECURITY DEFINER)

-- Configuration centralisée (liste explicite + seuil d'auto-promotion) — ajustable sans
-- redéploiement de code. La ligne '__auto__' porte le seuil global.
CREATE TABLE IF NOT EXISTS public.sync_merkle_config (
  table_name text PRIMARY KEY,
  mode       text   NOT NULL DEFAULT 'merkle',   -- 'merkle' | 'config'
  threshold  bigint
);
INSERT INTO public.sync_merkle_config(table_name, mode, threshold)
VALUES ('__auto__', 'config', 100000) ON CONFLICT (table_name) DO NOTHING;

-- ── Leaf hash (IMMUTABLE) ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_merkle_leaf(p_tbl text, p_id text, p_ver text)
RETURNS bigint IMMUTABLE LANGUAGE sql AS $$
  SELECT mod(
    (('x' || substr(md5(p_tbl || ':' || p_id || ':' || coalesce(p_ver, '')), 1, 15))::bit(60))::bigint,
    2305843009213693951::bigint
  );
$$;

-- ── Bump d'une partition (upsert modulaire + purge des partitions vides) ──────────
CREATE OR REPLACE FUNCTION public.sync_merkle_bump(p_sid uuid, p_scope text, p_pk text, p_dh bigint, p_dc int)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pmod bigint := 2305843009213693951;
BEGIN
  INSERT INTO public.sync_merkle(school_id, scope, part_key, checksum, row_count, updated_at)
  VALUES (p_sid, p_scope, p_pk, ((p_dh % pmod) + pmod) % pmod, p_dc, now())
  ON CONFLICT (school_id, scope, part_key) DO UPDATE
    SET checksum   = ((public.sync_merkle.checksum + p_dh) % pmod + pmod) % pmod,
        row_count  = public.sync_merkle.row_count + p_dc,
        updated_at = now();
  -- Purge à l'identique du LAN : partition vidée ⇒ supprimée (sinon divergence artificielle).
  DELETE FROM public.sync_merkle
   WHERE school_id = p_sid AND scope = p_scope AND part_key = p_pk AND row_count = 0 AND checksum = 0;
END $$;

-- ── Application d'une ligne (jsonb) avec un signe (+1 ajout / -1 retrait) ─────────
CREATE OR REPLACE FUNCTION public.sync_merkle_apply_row(p_sid uuid, p_tbl text, p_row jsonb, p_sign int)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE h bigint;
BEGIN
  IF p_sid IS NULL OR p_row->>'id' IS NULL THEN RETURN; END IF;
  h := public.sync_merkle_leaf(p_tbl, p_row->>'id', p_row->>'version');
  PERFORM public.sync_merkle_bump(p_sid, 'table', p_tbl, p_sign * h, p_sign);
  IF (p_row ? 'class_id')   AND coalesce(p_row->>'class_id','')   <> '' THEN PERFORM public.sync_merkle_bump(p_sid, 'class',   p_tbl||'|'||(p_row->>'class_id'),   p_sign*h, p_sign); END IF;
  IF (p_row ? 'student_id') AND coalesce(p_row->>'student_id','') <> '' THEN PERFORM public.sync_merkle_bump(p_sid, 'student', p_tbl||'|'||(p_row->>'student_id'), p_sign*h, p_sign); END IF;
  IF (p_row ? 'sequence')   AND coalesce(p_row->>'sequence','')   <> '' THEN PERFORM public.sync_merkle_bump(p_sid, 'seq',     p_tbl||'|'||(p_row->>'sequence'),   p_sign*h, p_sign); END IF;
END $$;

-- ── Trigger générique (réutilisé par toutes les tables suivies) ──────────────────
CREATE OR REPLACE FUNCTION public.sync_merkle_trg()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE tbl text := TG_TABLE_NAME; ov jsonb; nv jsonb; sid uuid;
BEGIN
  IF TG_OP IN ('DELETE','UPDATE') THEN
    ov := to_jsonb(OLD);
    sid := CASE WHEN tbl = 'schools' THEN (ov->>'id')::uuid ELSE (ov->>'school_id')::uuid END;
    PERFORM public.sync_merkle_apply_row(sid, tbl, ov, -1);
  END IF;
  IF TG_OP IN ('INSERT','UPDATE') THEN
    nv := to_jsonb(NEW);
    sid := CASE WHEN tbl = 'schools' THEN (nv->>'id')::uuid ELSE (nv->>'school_id')::uuid END;
    PERFORM public.sync_merkle_apply_row(sid, tbl, nv, 1);
  END IF;
  RETURN NULL;
END $$;

-- ── Backfill complet d'une table (deploy / promotion / restauration) ─────────────
CREATE OR REPLACE FUNCTION public.sync_merkle_backfill(p_tbl text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  sidcol text := CASE WHEN p_tbl = 'schools' THEN 'id' ELSE 'school_id' END;
  verexpr text;
  d record;
BEGIN
  IF to_regclass('public.'||p_tbl) IS NULL THEN RETURN; END IF;
  DELETE FROM public.sync_merkle WHERE part_key = p_tbl OR part_key LIKE p_tbl || '|%';
  verexpr := CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                                WHERE table_schema='public' AND table_name=p_tbl AND column_name='version')
                  THEN 'version::text' ELSE '''''' END;
  -- Niveau table.
  EXECUTE format(
    'INSERT INTO public.sync_merkle(school_id, scope, part_key, checksum, row_count, updated_at)
     SELECT %I, ''table'', %L, (sum(public.sync_merkle_leaf(%L, id::text, %s)::numeric) %% 2305843009213693951)::bigint, count(*), now()
       FROM public.%I GROUP BY %I',
    sidcol, p_tbl, p_tbl, verexpr, p_tbl, sidcol);
  -- Niveaux de dimension présents.
  FOR d IN SELECT * FROM (VALUES ('class_id','class'), ('student_id','student'), ('sequence','seq')) v(col, scope) LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema='public' AND table_name=p_tbl AND column_name=d.col) THEN
      EXECUTE format(
        'INSERT INTO public.sync_merkle(school_id, scope, part_key, checksum, row_count, updated_at)
         SELECT %I, %L, %L || ''|'' || (%I::text), (sum(public.sync_merkle_leaf(%L, id::text, %s)::numeric) %% 2305843009213693951)::bigint, count(*), now()
           FROM public.%I WHERE %I IS NOT NULL GROUP BY %I, %I',
        sidcol, d.scope, p_tbl, d.col, p_tbl, verexpr, p_tbl, d.col, sidcol, d.col);
    END IF;
  END LOOP;
END $$;

-- ── Promotion : backfill + attache du trigger + enregistrement config ────────────
CREATE OR REPLACE FUNCTION public.sync_merkle_ensure(p_tbl text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF to_regclass('public.'||p_tbl) IS NULL THEN RETURN; END IF;
  PERFORM public.sync_merkle_backfill(p_tbl);
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_sync_merkle_' || p_tbl) THEN
    EXECUTE format('CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.sync_merkle_trg()',
                   'trg_sync_merkle_' || p_tbl, p_tbl);
  END IF;
  INSERT INTO public.sync_merkle_config(table_name, mode) VALUES (p_tbl, 'merkle')
    ON CONFLICT (table_name) DO UPDATE SET mode = 'merkle';
END $$;

-- ── Active les tables EXPLICITES (mêmes que MERKLE_EXPLICIT côté LAN) ─────────────
DO $$
DECLARE t text;
  ex text[] := ARRAY['grades','apc_notes','prim_notes','mat_observations','attendance',
                     'student_absences','fee_payments','student_fees','student_fee_items','budget_expenses'];
BEGIN
  FOREACH t IN ARRAY ex LOOP
    IF to_regclass('public.'||t) IS NOT NULL THEN PERFORM public.sync_merkle_ensure(t); END IF;
  END LOOP;
END $$;

-- ── RPC lues par l'edge sync-verify ──────────────────────────────────────────────
-- Niveau table (une ligne par table suivie) — checksum en TEXTE (précision préservée).
CREATE OR REPLACE FUNCTION public.sync_merkle_tablelevel(p_school uuid)
RETURNS TABLE(tablename text, checksum text, row_count bigint)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT part_key, checksum::text, row_count
    FROM public.sync_merkle WHERE school_id = p_school AND scope = 'table';
$$;

-- Partitions d'un scope pour une table (descente ciblée), option. filtrées à des clés.
CREATE OR REPLACE FUNCTION public.sync_merkle_scope(p_school uuid, p_table text, p_scope text, p_keys text[] DEFAULT NULL)
RETURNS TABLE(part_key text, checksum text, row_count bigint)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT part_key, checksum::text, row_count
    FROM public.sync_merkle
   WHERE school_id = p_school AND scope = p_scope AND part_key LIKE p_table || '|%'
     AND (p_keys IS NULL OR part_key = ANY (SELECT p_table || '|' || k FROM unnest(p_keys) AS k));
$$;

-- ── Réservé aux fonctions edge (service_role) ────────────────────────────────────
REVOKE ALL ON FUNCTION public.sync_merkle_tablelevel(uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_merkle_scope(uuid, text, text, text[]) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_merkle_tablelevel(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_merkle_scope(uuid, text, text, text[]) TO service_role;
