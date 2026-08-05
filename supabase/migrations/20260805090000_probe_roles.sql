-- SONDE EN LECTURE SEULE — ne modifie rien.
-- Vérifie les valeurs réelles de school_users.role AVANT de restreindre
-- l'écriture des recettes : restreindre sur une hypothèse fausse bloquerait
-- l'encaissement en production.
DO $$
DECLARE r record; s text := '';
BEGIN
  FOR r IN SELECT role, count(*) AS n, count(*) FILTER (WHERE active) AS actifs
             FROM public.school_users GROUP BY role ORDER BY 2 DESC LOOP
    s := s || format('[%s: %s tot / %s actifs] ', COALESCE(r.role,'NULL'), r.n, r.actifs);
  END LOOP;
  RAISE NOTICE 'ROLES = %', s;

  SELECT count(*) INTO r FROM public.school_users WHERE permissions IS NOT NULL;
  RAISE NOTICE 'COMPTES A PERMISSIONS GRANULAIRES = %', r.count;

  s := '';
  FOR r IN SELECT su.role, count(DISTINCT fp.recorded_by) AS n
             FROM public.fee_payments fp
             JOIN public.school_users su ON su.user_id = fp.recorded_by
            GROUP BY su.role LOOP
    s := s || format('[%s: %s caissiers] ', COALESCE(r.role,'NULL'), r.n);
  END LOOP;
  RAISE NOTICE 'ROLES AYANT DEJA ENCAISSE = %', COALESCE(NULLIF(s,''), 'aucun (recorded_by vide)');
END $$;
