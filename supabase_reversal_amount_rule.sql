-- ════════════════════════════════════════════════════════════════════════════
-- RÈGLE DE SIGNE DES VERSEMENTS — débloquer la contre-passation
-- ════════════════════════════════════════════════════════════════════════════
-- La base portait une contrainte `fee_payments_amount_check` interdisant les
-- montants négatifs. Elle datait d'un modèle où un versement ne pouvait
-- qu'entrer. Elle rendait la CONTRE-PASSATION impossible — donc l'annulation
-- d'un encaissement retombait sur la suppression, exactement ce que l'on vient
-- d'interdire. Sans ce correctif, l'annulation n'existe plus du tout.
--
-- La nouvelle règle dit le modèle au lieu de le contraindre à moitié :
--   • un encaissement (reversal_of NULL) est strictement POSITIF ;
--   • une contre-passation (reversal_of renseigné) est strictement NÉGATIVE.
-- Elle interdit donc aussi le « versement négatif » sans lien vers l'écriture
-- annulée — une annulation déguisée, sans motif ni traçabilité.
--
-- Idempotent : réexécutable sans risque.
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE n_bad int; c record;
BEGIN
  -- Retire toute contrainte de montant héritée, quel que soit son nom.
  FOR c IN SELECT conname FROM pg_constraint
            WHERE conrelid = 'public.fee_payments'::regclass
              AND contype = 'c'
              AND pg_get_constraintdef(oid) ILIKE '%amount%'
              AND conname <> 'fee_payments_amount_sign' LOOP
    EXECUTE format('ALTER TABLE public.fee_payments DROP CONSTRAINT %I', c.conname);
    RAISE NOTICE 'Contrainte de montant retirée : %', c.conname;
  END LOOP;

  -- Combien de lignes existantes ne respecteraient pas la nouvelle règle ?
  SELECT count(*) INTO n_bad FROM public.fee_payments
   WHERE NOT ((reversal_of IS NULL AND amount > 0) OR (reversal_of IS NOT NULL AND amount < 0));
  RAISE NOTICE 'Lignes hors de la nouvelle règle de signe : %', n_bad;

  ALTER TABLE public.fee_payments DROP CONSTRAINT IF EXISTS fee_payments_amount_sign;
  ALTER TABLE public.fee_payments ADD CONSTRAINT fee_payments_amount_sign
    CHECK ((reversal_of IS NULL AND amount > 0) OR (reversal_of IS NOT NULL AND amount < 0))
    NOT VALID;

  IF n_bad = 0 THEN
    ALTER TABLE public.fee_payments VALIDATE CONSTRAINT fee_payments_amount_sign;
    RAISE NOTICE 'Règle de signe VALIDÉE sur tout le stock.';
  ELSE
    -- NOT VALID : la règle s'applique pleinement aux écritures FUTURES ; on ne
    -- rejette pas rétroactivement des lignes historiques (montants à 0 hérités
    -- d'imports, par exemple), qu'il ne serait de toute façon pas question de
    -- supprimer pour satisfaire une contrainte.
    RAISE WARNING 'Règle posée en NOT VALID : % ligne(s) historique(s) hors règle.', n_bad;
  END IF;
END $$;
