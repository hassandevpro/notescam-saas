-- Remise à zéro de la configuration des frais — BRIGHT CONTINENT BILINGUAL SCHOOL
-- Appliqué au cloud le 2026-08-29. Sauvegarde préalable :
--   ../sauvegarde-catalogue-bright-continent-20260829.json
--
-- On SUPPRIME les lignes student_fees au lieu de remettre frais_payes à 0 :
-- reconcilePaid() (src/lib/feeEngine.js) est monotone et ne fait jamais baisser
-- le cache, donc un poste qui garde une copie locale repousse l'ancien total.
-- Une ligne absente, elle, ne peut pas être « remontée ».
--
-- L'ordre suit les dépendances : les lignes élève d'abord, le catalogue ensuite.
DELETE FROM public.student_fee_items
 WHERE school_id = 'a8b8fb00-7184-4aec-a39a-3d93a723000a';

DELETE FROM public.student_fees
 WHERE school_id = 'a8b8fb00-7184-4aec-a39a-3d93a723000a';

DELETE FROM public.fee_catalog
 WHERE school_id = 'a8b8fb00-7184-4aec-a39a-3d93a723000a';

DELETE FROM public.class_fee_grids
 WHERE school_id = 'a8b8fb00-7184-4aec-a39a-3d93a723000a';

SELECT 'class_fee_grids' AS objet, count(*)::text AS restant FROM public.class_fee_grids WHERE school_id='a8b8fb00-7184-4aec-a39a-3d93a723000a'
UNION ALL SELECT 'fee_catalog', count(*)::text FROM public.fee_catalog WHERE school_id='a8b8fb00-7184-4aec-a39a-3d93a723000a'
UNION ALL SELECT 'student_fee_items', count(*)::text FROM public.student_fee_items WHERE school_id='a8b8fb00-7184-4aec-a39a-3d93a723000a'
UNION ALL SELECT 'student_fees', count(*)::text FROM public.student_fees WHERE school_id='a8b8fb00-7184-4aec-a39a-3d93a723000a'
UNION ALL SELECT 'fee_payments', count(*)::text FROM public.fee_payments WHERE school_id='a8b8fb00-7184-4aec-a39a-3d93a723000a'
UNION ALL SELECT 'compteur recus', coalesce(max(last_no),0)::text FROM public.receipt_counters WHERE school_id='a8b8fb00-7184-4aec-a39a-3d93a723000a'
UNION ALL SELECT 'eleves (intacts)', count(*)::text FROM public.students WHERE school_id='a8b8fb00-7184-4aec-a39a-3d93a723000a'
UNION ALL SELECT 'classes (intactes)', count(*)::text FROM public.classes WHERE school_id='a8b8fb00-7184-4aec-a39a-3d93a723000a';
