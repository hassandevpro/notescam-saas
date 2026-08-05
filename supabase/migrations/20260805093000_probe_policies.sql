-- SONDE EN LECTURE SEULE — liste les policies réellement présentes sur les
-- tables d'argent. La migration précédente a signalé qu'il en restait de
-- permissives sous des noms non anticipés : sans leurs noms exacts, on ne peut
-- pas les retirer, et un versement resterait effaçable.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename, policyname, cmd, roles::text AS roles
             FROM pg_policies
            WHERE schemaname = 'public'
              AND tablename IN ('fee_payments','student_fees','class_fee_grids','students')
            ORDER BY tablename, cmd, policyname LOOP
    RAISE NOTICE 'POLICY %.% | cmd=% | roles=%', r.tablename, r.policyname, r.cmd, r.roles;
  END LOOP;
END $$;
