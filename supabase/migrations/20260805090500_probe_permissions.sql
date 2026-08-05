-- SONDE EN LECTURE SEULE — ne modifie rien.
-- Les permissions granulaires sont ADDITIVES au rôle : un compte `teacher`
-- peut se voir accorder la page Frais. Restreindre l'écriture des recettes au
-- seul couple admin/censeur le priverait d'encaisser. On regarde donc qui
-- porte des permissions, et sous quel rôle.
DO $$
DECLARE r record; s text := '';
BEGIN
  FOR r IN SELECT role, count(*) AS n FROM public.school_users
            WHERE permissions IS NOT NULL GROUP BY role LOOP
    s := s || format('[%s: %s] ', COALESCE(r.role,'NULL'), r.n);
  END LOOP;
  RAISE NOTICE 'ROLES PORTANT DES PERMISSIONS = %', COALESCE(NULLIF(s,''), 'aucun');

  s := '';
  FOR r IN SELECT DISTINCT jsonb_array_elements_text(
                   CASE WHEN jsonb_typeof(permissions::jsonb) = 'array'
                        THEN permissions::jsonb ELSE '[]'::jsonb END) AS p
             FROM public.school_users WHERE permissions IS NOT NULL LIMIT 60 LOOP
    s := s || r.p || ' ';
  END LOOP;
  RAISE NOTICE 'PERMISSIONS DISTINCTES (si tableau) = %', COALESCE(NULLIF(s,''), 'format non-tableau');

  FOR r IN SELECT permissions::text AS p FROM public.school_users
            WHERE permissions IS NOT NULL LIMIT 3 LOOP
    RAISE NOTICE 'EXEMPLE = %', left(r.p, 300);
  END LOOP;

  -- Le point qui décide : un non-admin/censeur peut-il toucher aux frais ?
  SELECT count(*) INTO r FROM public.school_users
   WHERE permissions IS NOT NULL
     AND role NOT IN ('admin','censeur')
     AND permissions::text ILIKE '%fee%';
  RAISE NOTICE 'NON-ADMIN/CENSEUR AVEC ACCES FRAIS = %', r.count;
END $$;
