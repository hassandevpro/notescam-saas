-- Appliqué au cloud le 2026-08-29. Sauvegarde préalable :
--   ../sauvegarde-paiements-bright-continent-20260829.json
-- Remise à zéro des paiements — BRIGHT CONTINENT BILINGUAL SCHOOL
-- Ce qui est effacé : les encaissements. Ce qui est gardé : les élèves, les
-- frais dus (frais_annuels, tranches) et le catalogue des frais.
DELETE FROM public.fee_payments
 WHERE school_id = 'a8b8fb00-7184-4aec-a39a-3d93a723000a';

UPDATE public.student_fees
   SET frais_payes = 0,
       date_dernier_paiement = NULL
 WHERE school_id = 'a8b8fb00-7184-4aec-a39a-3d93a723000a';

-- La numérotation des reçus repart à 1.
UPDATE public.receipt_counters
   SET last_no = 0
 WHERE school_id = 'a8b8fb00-7184-4aec-a39a-3d93a723000a';

SELECT 'fee_payments restants' AS controle, count(*)::text AS valeur
  FROM public.fee_payments WHERE school_id = 'a8b8fb00-7184-4aec-a39a-3d93a723000a'
UNION ALL
SELECT 'somme frais_payes', coalesce(sum(frais_payes),0)::text
  FROM public.student_fees WHERE school_id = 'a8b8fb00-7184-4aec-a39a-3d93a723000a'
UNION ALL
SELECT 'lignes frais eleves conservees', count(*)::text
  FROM public.student_fees WHERE school_id = 'a8b8fb00-7184-4aec-a39a-3d93a723000a'
UNION ALL
SELECT 'somme frais_annuels (dus, conserves)', coalesce(sum(frais_annuels),0)::text
  FROM public.student_fees WHERE school_id = 'a8b8fb00-7184-4aec-a39a-3d93a723000a'
UNION ALL
SELECT 'compteur recus', coalesce(max(last_no),0)::text
  FROM public.receipt_counters WHERE school_id = 'a8b8fb00-7184-4aec-a39a-3d93a723000a'
UNION ALL
SELECT 'archive deleted_fee_payments', count(*)::text
  FROM public.deleted_fee_payments WHERE school_id = 'a8b8fb00-7184-4aec-a39a-3d93a723000a'
UNION ALL
SELECT 'tombstones fee_payments', count(*)::text
  FROM public.sync_tombstones WHERE school_id = 'a8b8fb00-7184-4aec-a39a-3d93a723000a' AND tablename='fee_payments'
UNION ALL
SELECT 'eleves (intacts)', count(*)::text
  FROM public.students WHERE school_id = 'a8b8fb00-7184-4aec-a39a-3d93a723000a';
