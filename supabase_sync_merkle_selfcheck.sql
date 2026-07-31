-- supabase_sync_merkle_selfcheck.sql
-- GATE DE VALIDATION POSTGRES — à exécuter sur le projet de STAGING (puis prod) APRÈS
-- avoir appliqué supabase_sync_integrity.sql + supabase_sync_merkle.sql.
--
-- Ne modifie AUCUNE donnée. Lève une EXCEPTION (donc échoue visiblement) si :
--   • la formule de checksum côté Postgres ne coïncide PAS bit à bit avec le LAN/JS ;
--   • une fonction/RPC attendue est absente ;
--   • un trigger de maintenance est présent en double.
-- Les valeurs de référence ci-dessous sont calculées côté LAN (server/syncMerkle.js) :
-- si ce script passe, la parité Cloud ↔ LAN est GARANTIE.
--
-- Idempotence : réexécuter supabase_sync_*.sql une 2e fois NE DOIT produire aucune
-- erreur (CREATE OR REPLACE / IF NOT EXISTS / triggers gardés). Ce fichier vérifie en
-- plus qu'aucun objet n'a été dupliqué.

DO $$
DECLARE
  P   bigint := 2305843009213693951;
  v   bigint;
  agg bigint;
  n   int;
  t   text;
  ex  text[] := ARRAY['grades','apc_notes','prim_notes','mat_observations','attendance',
                      'student_absences','fee_payments','student_fees','student_fee_items','budget_expenses'];
BEGIN
  -- (0) Fonctions/RPC présentes.
  FOREACH t IN ARRAY ARRAY['sync_merkle_leaf','sync_merkle_bump','sync_merkle_apply_row',
                           'sync_merkle_trg','sync_merkle_backfill','sync_merkle_ensure',
                           'sync_merkle_tablelevel','sync_merkle_scope','sync_integrity'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = t) THEN
      RAISE EXCEPTION 'SELFCHECK: fonction manquante: %()', t;
    END IF;
  END LOOP;

  -- (1) Parité de la formule leaf (doit être IDENTIQUE au calcul JS).
  v := public.sync_merkle_leaf('grades', '11111111-1111-1111-1111-111111111111', '1');
  IF v <> 397159312308756679 THEN RAISE EXCEPTION 'SELFCHECK parité leaf #1: % (attendu 397159312308756679)', v; END IF;
  v := public.sync_merkle_leaf('grades', '22222222-2222-2222-2222-222222222222', '7');
  IF v <> 729257149346814375 THEN RAISE EXCEPTION 'SELFCHECK parité leaf #2: % (attendu 729257149346814375)', v; END IF;
  -- version NULL doit coïncider avec version '' (coalesce interne).
  v := public.sync_merkle_leaf('grades', '33333333-3333-3333-3333-333333333333', NULL);
  IF v <> 36847763427538883 THEN RAISE EXCEPTION 'SELFCHECK parité leaf #3 (NULL): % (attendu 36847763427538883)', v; END IF;
  IF public.sync_merkle_leaf('grades', '33333333-3333-3333-3333-333333333333', '') <> v THEN
    RAISE EXCEPTION 'SELFCHECK: leaf(NULL) <> leaf('''') — coalesce non conforme';
  END IF;
  v := public.sync_merkle_leaf('fee_payments', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', '3');
  IF v <> 372180021978577521 THEN RAISE EXCEPTION 'SELFCHECK parité leaf #4: % (attendu 372180021978577521)', v; END IF;

  -- (2) Parité de l'AGRÉGAT (somme mod P) sur 3 lignes.
  SELECT (sum(x)::numeric % P)::bigint INTO agg FROM (VALUES
    (public.sync_merkle_leaf('grades', '11111111-1111-1111-1111-111111111111', '1')),
    (public.sync_merkle_leaf('grades', '22222222-2222-2222-2222-222222222222', '7')),
    (public.sync_merkle_leaf('grades', '33333333-3333-3333-3333-333333333333', NULL))
  ) s(x);
  IF agg <> 1163264225083109937 THEN RAISE EXCEPTION 'SELFCHECK parité agrégat: % (attendu 1163264225083109937)', agg; END IF;

  -- (3) Aucun trigger de maintenance en DOUBLE (idempotence des CREATE TRIGGER gardés).
  SELECT count(*) INTO n FROM (
    SELECT tgname FROM pg_trigger WHERE tgname LIKE 'trg_sync_merkle_%' AND NOT tgisinternal
    GROUP BY tgname HAVING count(*) > 1
  ) d;
  IF n > 0 THEN RAISE EXCEPTION 'SELFCHECK: % trigger(s) de maintenance dupliqué(s)', n; END IF;

  -- (4) Les tables explicites présentes portent bien leur trigger (maintenance active).
  FOREACH t IN ARRAY ex LOOP
    IF to_regclass('public.'||t) IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_sync_merkle_'||t AND NOT tgisinternal) THEN
      RAISE EXCEPTION 'SELFCHECK: trigger de maintenance ABSENT sur table suivie: %', t;
    END IF;
  END LOOP;

  RAISE NOTICE 'SELFCHECK MERKLE: OK — parité de formule + intégrité des objets validées.';
END $$;
