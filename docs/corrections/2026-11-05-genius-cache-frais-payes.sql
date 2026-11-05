-- GENIUS (6b68407b-…) — remet le cache student_fees.frais_payes égal à la somme des lignes
-- fee_payments sur 6 fiches où il la dépassait (lignes supprimées hors application sans
-- recalcul du cache). Sauvegarde : sauvegarde-cache-frais-payes-genius-20261105.json.
-- Retour arrière : 2026-11-05-genius-cache-frais-payes-RETOUR-ARRIERE.sql.
-- Ne touche NI aux lignes de paiement, NI au solde importé sans ligne (fiche à 0 ligne exclue).
UPDATE public.student_fees
   SET frais_payes = CASE id
     WHEN '171af5cc-b718-4271-8c67-2457e8fabf18' THEN 50000
     WHEN '2e572b87-0a62-4c93-a4c0-d2b671c33b33' THEN 50000
     WHEN '4c2eb446-6956-4479-8d08-71600a642141' THEN 50000
     WHEN 'acaac41c-964d-4b2c-81ca-424fbb1d4fc4' THEN 130000
     WHEN 'b60844be-94bf-4aaf-ae19-2dabeda83f3e' THEN 210000
     WHEN 'd4588887-e15f-4eaf-8a30-9db0a36ec591' THEN 100000
   END
 WHERE school_id = '6b68407b-3d2e-426b-81ff-c4e68e66120a'
   AND academic_year = '2026-2027'
   AND id IN ('171af5cc-b718-4271-8c67-2457e8fabf18','2e572b87-0a62-4c93-a4c0-d2b671c33b33',
              '4c2eb446-6956-4479-8d08-71600a642141','acaac41c-964d-4b2c-81ca-424fbb1d4fc4',
              'b60844be-94bf-4aaf-ae19-2dabeda83f3e','d4588887-e15f-4eaf-8a30-9db0a36ec591')
   -- garde : n'écrit que si le cache est encore à sa valeur d'avant (rien n'a bougé entre-temps)
   AND frais_payes IN (150000,100000,305000,420000,200000);
