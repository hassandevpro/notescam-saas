-- GARDE-FOU : supprimer une ligne fee_payments retire son montant du cache
-- student_fees.frais_payes.
--
-- DÉFAUT CORRIGÉ (audit GENIUS, 2026-11-05) : des lignes de paiement ont été supprimées
-- hors application (nettoyage de doublons / imports) sans toucher au cache. Le cache est
-- ensuite resté trop haut — jusqu'à « Payé intégral » à tort — car la réconciliation
-- client (`reconcilePaid`) est MONOTONE : elle relève le cache, ne le baisse jamais.
--
-- On RETRANCHE le montant supprimé plutôt que de recalculer depuis les lignes, pour ne
-- pas écraser le « socle opaque » (solde importé sans ligne de paiement, cf.
-- feeEngine.derivePaid). Une ligne négative (contre-passation) supprimée relève le cache :
-- l'arithmétique reste algébrique.
--
-- Additive et idempotente. Ne supprime ni ne modifie aucune donnée existante.
CREATE OR REPLACE FUNCTION public.fee_cache_on_payment_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.student_fees
     SET frais_payes = GREATEST(0, COALESCE(frais_payes, 0) - COALESCE(OLD.amount, 0))
   WHERE student_id = OLD.student_id
     AND academic_year IS NOT DISTINCT FROM OLD.academic_year;
  RETURN OLD;
END
$$;

DROP TRIGGER IF EXISTS trg_fee_cache_on_payment_delete ON public.fee_payments;
CREATE TRIGGER trg_fee_cache_on_payment_delete
  AFTER DELETE ON public.fee_payments
  FOR EACH ROW EXECUTE FUNCTION public.fee_cache_on_payment_delete();

-- RETOUR ARRIÈRE :
--   DROP TRIGGER IF EXISTS trg_fee_cache_on_payment_delete ON public.fee_payments;
--   DROP FUNCTION IF EXISTS public.fee_cache_on_payment_delete();
