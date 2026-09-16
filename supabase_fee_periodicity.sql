-- ════════════════════════════════════════════════════════════════════════════
-- SERVICES SCOLAIRES — B1 : périodicité d'un frais du catalogue
-- ════════════════════════════════════════════════════════════════════════════
-- Le catalogue savait dire « ce frais coûte 15 000 ». Il ne savait pas dire
-- « 15 000 par mois, de septembre à mai, sauf décembre ». La cantine et le
-- transport de THE GENIUS vivent pourtant ainsi, et aucun des deux n'entrait
-- dans le modèle.
--
-- ADDITIVE ET SANS EFFET SUR L'EXISTANT. `periodicity` vaut 'unique' par défaut,
-- ce qui est exactement le comportement d'aujourd'hui : un frais, un montant,
-- une échéance. Aucun frais déjà saisi ne change, aucune année passée n'est
-- réécrite.
--
-- POURQUOI `billing_periods` EST UNE DONNÉE ET NON UN CALCUL. L'état de cantine
-- 2024/2025 facture SEPT, OCT, NOV, JAN, FEV, MAR, AVR, MAI — décembre n'y est
-- pas. Une périodicité « mensuelle » qui déduirait les mois d'elle-même
-- facturerait décembre à chaque élève. Le calcul ne sert qu'à PROPOSER une liste
-- à la création ; c'est la liste enregistrée qui fait foi ensuite.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.fee_catalog
  ADD COLUMN IF NOT EXISTS periodicity     TEXT    NOT NULL DEFAULT 'unique',
  ADD COLUMN IF NOT EXISTS billing_periods TEXT    NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS allow_partial   BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS allow_exemption BOOLEAN NOT NULL DEFAULT TRUE;

-- Le jeu de valeurs est verrouillé : une périodicité inventée ailleurs dans le
-- code ne produirait aucune échéance, en silence. Mieux vaut un refus à l'écriture.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fee_catalog_periodicity_chk') THEN
    ALTER TABLE public.fee_catalog
      ADD CONSTRAINT fee_catalog_periodicity_chk
      CHECK (periodicity IN ('unique', 'mensuel', 'trimestriel', 'annuel'));
  END IF;
END $$;

-- ── Statuts d'un frais attribué à un élève ──────────────────────────────────
-- `status` ne connaissait que 'active' et 'removed'. L'école a besoin de dire
-- qu'un élève est EXEMPTÉ (boursier, enfant du personnel) ou qu'il a ABANDONNÉ
-- le service en cours d'année. Retirer le frais effacerait l'historique ; le
-- laisser actif ferait porter à la famille une dette qu'elle ne doit pas.
--
-- Aucune contrainte CHECK ici : `status` porte déjà des valeurs en production et
-- une contrainte rétroactive refuserait des lignes existantes. Le jeu de valeurs
-- est tenu côté application (feeScheduleEngine.SCHEDULE_STATUS).
COMMENT ON COLUMN public.student_fee_items.status IS
  'active | removed | exempted | abandoned — exempted et abandoned sortent du dû';

-- Contrôle
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'fee_catalog'
  AND column_name IN ('periodicity', 'billing_periods', 'allow_partial', 'allow_exemption')
ORDER BY column_name;
