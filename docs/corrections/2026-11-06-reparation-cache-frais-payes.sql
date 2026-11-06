-- RÉPARATION DU CACHE student_fees.frais_payes — DRY-RUN PAR DÉFAUT
-- Audit 2026-11-06 (THE GENIUS 6b68407b-…, Bright Continent a8b8fb00-…).
--
-- RÈGLE : frais_payes = somme nette des lignes fee_payments (contre-passations
-- incluses), pour la même (élève, année). Aucune ligne n'est supprimée ni modifiée.
--
-- NE PAS EXÉCUTER LA PARTIE 2 SANS ACCORD EXPLICITE. Et pas avant que le serveur LAN
-- ne cesse de réécrire l'ancien cache (lignes refusées par le Cloud restées en local,
-- cf. diagnostic-sync-0.3.32-*.txt) : sinon la valeur revient au cycle suivant.
--
-- Fiches SANS aucune ligne (solde importé « opaque ») : EXCLUES de la réparation,
-- listées en partie 1 (« revue_manuelle »). Les écraser à 0 effacerait un solde légitime.

-- ═══ PARTIE 1 — DRY-RUN (lecture seule) : avant / après, une ligne par fiche ═══
WITH net AS (
  SELECT student_id, academic_year, SUM(amount) AS net, COUNT(*) AS nb
  FROM public.fee_payments GROUP BY 1, 2
)
SELECT sf.school_id, sf.id AS fiche, sf.frais_annuels,
       sf.frais_payes AS avant, COALESCE(n.net, 0) AS apres, n.nb AS lignes,
       CASE WHEN n.nb IS NULL THEN 'revue_manuelle (aucune ligne)' ELSE 'a_reparer' END AS decision
FROM public.student_fees sf
LEFT JOIN net n ON n.student_id = sf.student_id
               AND n.academic_year IS NOT DISTINCT FROM sf.academic_year
WHERE sf.school_id IN ('6b68407b-3d2e-426b-81ff-c4e68e66120a',
                       'a8b8fb00-7184-4aec-a39a-3d93a723000a')
  AND COALESCE(sf.frais_payes, 0) <> COALESCE(n.net, 0)
ORDER BY sf.school_id, sf.updated_at DESC;

-- Dénombrement : nombre d'élèves touchés, par école.
-- SELECT sf.school_id, COUNT(*) FROM ... (même jointure) GROUP BY 1;

-- ═══ PARTIE 2 — APPLICATION (À DÉCOMMENTER SEULEMENT SUR ORDRE EXPLICITE) ═══
-- Versionnement : version + 1 et updated_at = now(), pour que la réparation GAGNE
-- à la synchronisation LAN↔Cloud ; device_id marqué 'reparation-2026-11-06' pour la
-- retrouver. Sauvegarde d'abord (table de retour arrière créée dans la même transaction).
--
-- BEGIN;
-- CREATE TABLE IF NOT EXISTS public.backup_frais_payes_20261106 AS
--   SELECT id, school_id, student_id, academic_year, frais_payes, version, updated_at, device_id
--   FROM public.student_fees
--   WHERE school_id IN ('6b68407b-3d2e-426b-81ff-c4e68e66120a','a8b8fb00-7184-4aec-a39a-3d93a723000a');
--
-- WITH net AS (
--   SELECT student_id, academic_year, SUM(amount) AS net
--   FROM public.fee_payments GROUP BY 1, 2
-- )
-- UPDATE public.student_fees sf
--    SET frais_payes = n.net,
--        version     = COALESCE(sf.version, 0) + 1,
--        updated_at  = now(),
--        device_id   = NULL   -- à remplacer par l'identifiant d'appareil retenu avec l'école
--   FROM net n
--  WHERE n.student_id = sf.student_id
--    AND n.academic_year IS NOT DISTINCT FROM sf.academic_year
--    AND sf.school_id IN ('6b68407b-3d2e-426b-81ff-c4e68e66120a','a8b8fb00-7184-4aec-a39a-3d93a723000a')
--    AND sf.frais_payes <> n.net;
-- -- CONTRÔLE : doit renvoyer 0 pour les deux écoles avant COMMIT.
-- -- SELECT COUNT(*) FROM public.student_fees sf JOIN (SELECT student_id, academic_year, SUM(amount) n
-- --   FROM public.fee_payments GROUP BY 1,2) x USING (student_id) WHERE x.academic_year IS NOT DISTINCT FROM sf.academic_year
-- --   AND sf.frais_payes <> x.n;
-- COMMIT;
--
-- RETOUR ARRIÈRE :
--   UPDATE public.student_fees sf SET frais_payes = b.frais_payes, version = sf.version + 1, updated_at = now()
--     FROM public.backup_frais_payes_20261106 b WHERE b.id = sf.id;
