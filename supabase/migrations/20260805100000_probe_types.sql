-- SONDE EN LECTURE SEULE — types des colonnes d'acteur.
-- Enjeu : le trigger fait `NEW.recorded_by := auth.uid()` (uuid). Si la colonne
-- est du texte, ou l'inverse, tout encaissement échouerait. Et si une colonne
-- d'acteur est uuid alors que le LAN y écrit un identifiant non-uuid, le push
-- de synchro serait rejeté pour la table entière.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT table_name, column_name, data_type
             FROM information_schema.columns
            WHERE table_schema='public'
              AND ((table_name='fee_payments' AND column_name IN ('recorded_by','recorded_by_name','reversal_of','receipt_no','student_id'))
                OR (table_name='students'     AND column_name IN ('id','created_by','archived_by'))
                OR (table_name='cash_sessions' AND column_name IN ('cashier_id','validated_by'))
                OR (table_name='school_users' AND column_name IN ('user_id','permissions')))
            ORDER BY table_name, column_name LOOP
    RAISE NOTICE 'TYPE %.% = %', r.table_name, r.column_name, r.data_type;
  END LOOP;

  -- Échantillon réel : à quoi ressemblent les valeurs déjà écrites par l'app ?
  FOR r IN SELECT DISTINCT recorded_by FROM public.fee_payments
            WHERE recorded_by IS NOT NULL LIMIT 3 LOOP
    RAISE NOTICE 'EXEMPLE recorded_by = %', r.recorded_by;
  END LOOP;
END $$;
