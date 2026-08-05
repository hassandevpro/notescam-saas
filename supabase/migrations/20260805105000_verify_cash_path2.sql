-- VÉRIFICATION FONCTIONNELLE — le durcissement n'a pas cassé la caisse.
-- Tout le test vit dans une sous-transaction qui est TOUJOURS annulée en sortie
-- (RAISE volontaire) : aucune ligne de test ne subsiste, et le nettoyage ne
-- dépend pas d'un DELETE que le durcissement interdit précisément.
DO $$
DECLARE uid uuid; sid uuid; stu uuid; yr text; tid uuid := gen_random_uuid(); no1 int; nb int;
BEGIN
  SELECT fp.recorded_by, fp.school_id, fp.student_id, fp.academic_year
    INTO uid, sid, stu, yr
    FROM public.fee_payments fp
    JOIN public.students s ON s.id = fp.student_id
   WHERE fp.recorded_by IS NOT NULL
   LIMIT 1;
  IF uid IS NULL THEN RAISE NOTICE 'Aucun caissier de référence — test ignoré.'; RETURN; END IF;
  RAISE NOTICE 'Caissier de test = % | année = %', uid, yr;

  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';

    -- 1) ENCAISSER doit continuer de fonctionner.
    BEGIN
      INSERT INTO public.fee_payments (id, school_id, student_id, academic_year, amount, date, note)
      VALUES (tid, sid, stu, yr, 1, CURRENT_DATE, '__verif__');
      SELECT receipt_no INTO no1 FROM public.fee_payments WHERE id = tid;
      RAISE NOTICE 'OK   encaissement accepté — n° de reçu = %', no1;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'ALERTE encaissement REFUSÉ : % (%)', SQLERRM, SQLSTATE;
    END;

    -- 2) L'auteur doit être estampillé depuis le jeton, pas depuis le payload.
    BEGIN
      SELECT count(*) INTO nb FROM public.fee_payments WHERE id = tid AND recorded_by = uid;
      IF nb = 1 THEN RAISE NOTICE 'OK   recorded_by estampillé depuis auth.uid()';
      ELSE RAISE NOTICE 'ALERTE recorded_by non estampillé'; END IF;
    END;

    -- 3) SUPPRIMER doit être refusé.
    BEGIN
      DELETE FROM public.fee_payments WHERE id = tid;
      RAISE NOTICE 'ALERTE : suppression AUTORISÉE — le verrou ne tient pas.';
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'OK   suppression refusée (%)', SQLSTATE;
    END;

    -- 4) MODIFIER doit être refusé.
    BEGIN
      UPDATE public.fee_payments SET amount = 999999 WHERE id = tid;
      RAISE NOTICE 'ALERTE : modification AUTORISÉE — le verrou ne tient pas.';
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'OK   modification refusée (%)', SQLSTATE;
    END;

    -- 5) CONTRE-PASSER (la voie légitime) doit fonctionner…
    BEGIN
      INSERT INTO public.fee_payments (id, school_id, student_id, academic_year, amount, date, note, reversal_of, void_reason)
      VALUES (gen_random_uuid(), sid, stu, yr, -1, CURRENT_DATE, '__verif__', tid, 'vérification');
      RAISE NOTICE 'OK   contre-passation acceptée';
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'ALERTE contre-passation refusée : %', SQLERRM;
    END;

    -- 6) …mais jamais sans motif.
    BEGIN
      INSERT INTO public.fee_payments (id, school_id, student_id, academic_year, amount, date, reversal_of)
      VALUES (gen_random_uuid(), sid, stu, yr, -1, CURRENT_DATE, tid);
      RAISE NOTICE 'ALERTE : annulation SANS MOTIF acceptée.';
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'OK   annulation sans motif refusée';
    END;

    -- 7) Supprimer un élève porteur d'écritures doit être refusé.
    BEGIN
      DELETE FROM public.students WHERE id = stu;
      RAISE NOTICE 'ALERTE : élève porteur d''écritures SUPPRIMÉ.';
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'OK   suppression de l''élève refusée (%)', SQLSTATE;
    END;

    RESET ROLE;
    RAISE EXCEPTION 'FIN_TEST';   -- annule tout ce que ce bloc a écrit
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'FIN_TEST' THEN RAISE NOTICE 'Interruption inattendue : %', SQLERRM; END IF;
  END;

  SELECT count(*) INTO nb FROM public.fee_payments WHERE note = '__verif__';
  RAISE NOTICE 'Lignes de test subsistantes : % (attendu 0)', nb;
END $$;
