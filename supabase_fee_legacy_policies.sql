-- ════════════════════════════════════════════════════════════════════════════
-- RETRAIT DES POLICIES HÉRITÉES SUR LES TABLES D'ARGENT
-- ════════════════════════════════════════════════════════════════════════════
-- supabase_fee_integrity.sql a posé les bonnes policies, mais son bloc de
-- vérification a signalé qu'il en restait de permissives : des policies plus
-- anciennes, sous des noms que la migration ne connaissait pas, subsistaient.
--
-- Or les policies RLS sont PERMISSIVES et se cumulent en OU : tant que
-- « school members can delete fee_payments » existe, l'immuabilité des
-- versements ne vaut rien — n'importe quel membre de l'école peut encore
-- supprimer une recette depuis la console. Le durcissement n'est réellement
-- effectif qu'une fois ces survivantes retirées.
--
-- Noms relevés sur la base de production (pg_policies), pas devinés.
-- Idempotent : réexécutable sans risque.
-- ════════════════════════════════════════════════════════════════════════════

-- ── fee_payments : les deux trous (DELETE, UPDATE) + l'INSERT non scopé ──────
DROP POLICY IF EXISTS "school members can delete fee_payments" ON public.fee_payments;
DROP POLICY IF EXISTS "school members can update fee_payments" ON public.fee_payments;
-- INSERT ouvert à tout membre : court-circuitait la restriction à la caisse.
DROP POLICY IF EXISTS "school members can insert fee_payments" ON public.fee_payments;
-- Doublon de lecture : même périmètre que « fee_payments: lecture membres »,
-- évalué une fois de plus par ligne pour un résultat identique.
DROP POLICY IF EXISTS "school members can read fee_payments"   ON public.fee_payments;

-- ── student_fees : le DÛ d'un élève ─────────────────────────────────────────
DROP POLICY IF EXISTS "student_fees: écriture par admins de l'école" ON public.student_fees;
DROP POLICY IF EXISTS "student_fees: lecture par membres de l'école" ON public.student_fees;

-- ── class_fee_grids : le TARIF d'une classe ─────────────────────────────────
DROP POLICY IF EXISTS "fee managers manage fee grids"  ON public.class_fee_grids;
DROP POLICY IF EXISTS "school members read fee grids"  ON public.class_fee_grids;

-- ── Vérification ────────────────────────────────────────────────────────────
DO $$
DECLARE n_bad int; n_ins int; r record;
BEGIN
  SELECT count(*) INTO n_bad FROM pg_policies
   WHERE schemaname='public' AND tablename='fee_payments' AND cmd IN ('UPDATE','DELETE','ALL');
  SELECT count(*) INTO n_ins FROM pg_policies
   WHERE schemaname='public' AND tablename='fee_payments' AND cmd='INSERT';
  RAISE NOTICE 'fee_payments — UPDATE/DELETE/ALL : % (attendu 0) | INSERT : % (attendu 1)', n_bad, n_ins;
  IF n_bad > 0 THEN
    RAISE EXCEPTION 'Un versement reste effaçable : % policy(ies) permissive(s) subsistent.', n_bad;
  END IF;

  FOR r IN SELECT tablename, count(*) AS n FROM pg_policies
            WHERE schemaname='public' AND tablename IN ('student_fees','class_fee_grids')
            GROUP BY tablename LOOP
    RAISE NOTICE '% — % policies restantes (attendu 2 : lecture + écriture caisse)', r.tablename, r.n;
  END LOOP;
END $$;
