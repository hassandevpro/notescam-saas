-- ════════════════════════════════════════════════════════════════════════════
-- SERVICES SCOLAIRES — B1 : échéances d'un frais périodique
-- ════════════════════════════════════════════════════════════════════════════
-- La seule table nouvelle de tout le chantier. C'est elle qui sait dire
-- « novembre est dû, pour cet élève, à tel montant » — ce qu'aucune table ne
-- savait faire, et sans quoi ni la cantine mensuelle ni le transport trimestriel
-- ne sont représentables.
--
-- CE QUI N'Y FIGURE PAS, ET POURQUOI : le montant PAYÉ. Il se calcule depuis
-- `fee_payments`, comme le fait déjà `paidForItem()`. Deux sources de vérité
-- pour un même montant finissent toujours par diverger — et c'est la caisse qui
-- en paie le prix, en écarts de recouvrement que personne ne sait expliquer.
--
-- L'UNICITÉ (student_fee_item_id, period_key) rend la génération REJOUABLE :
-- relancer l'échéancier d'un élève ne duplique rien. Sans elle, ouvrir deux fois
-- la fiche d'un élève doublerait sa dette de cantine.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.fee_schedule_items (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id            UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id           UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  -- Le frais ATTRIBUÉ dont cette échéance dépend. Sa suppression emporte les
  -- échéances : une échéance orpheline serait une dette sans objet.
  student_fee_item_id  UUID NOT NULL REFERENCES public.student_fee_items(id) ON DELETE CASCADE,
  academic_year        TEXT,
  -- '2025-11' (mois) ou '2025-T1' (trimestre). Triable comme du texte, ce qui
  -- évite de manipuler des dates pour ordonner un échéancier.
  period_key           TEXT NOT NULL,
  -- Libellé FIGÉ à la génération, comme le nom du frais l'est déjà dans
  -- student_fee_items : un relevé réédité deux ans plus tard doit se relire à
  -- l'identique, même si l'école a changé de langue entre-temps.
  period_label         TEXT,
  amount_due           INTEGER NOT NULL DEFAULT 0,
  -- due | partial | paid | exempted | abandoned | not_applicable
  -- 'partial' et 'paid' se DÉDUISENT des paiements ; les trois autres sont posés
  -- à la main et l'emportent sur le calcul (cf. feeScheduleEngine).
  status               TEXT NOT NULL DEFAULT 'due',
  notes                TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  version              INTEGER NOT NULL DEFAULT 1,
  device_id            TEXT,
  UNIQUE (student_fee_item_id, period_key)
);

CREATE INDEX IF NOT EXISTS idx_fee_schedule_student
  ON public.fee_schedule_items (student_id, academic_year);
CREATE INDEX IF NOT EXISTS idx_fee_schedule_school
  ON public.fee_schedule_items (school_id, period_key);

-- ── Le paiement peut viser UNE période ──────────────────────────────────────
-- Jumelle de `student_fee_item_id`, qui existe déjà. Trois cas cohabitent, et
-- c'est voulu : paiement d'un mois précis, paiement d'un service sans précision
-- de mois, paiement global de la scolarité (héritage). Aucun n'est invalidé.
ALTER TABLE public.fee_payments
  ADD COLUMN IF NOT EXISTS fee_schedule_item_id UUID
  REFERENCES public.fee_schedule_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_fee_payments_schedule
  ON public.fee_payments (fee_schedule_item_id);

-- ── Isolation multi-école ───────────────────────────────────────────────────
-- Même forme que les autres tables scolaires : une école ne voit que ses lignes.
ALTER TABLE public.fee_schedule_items ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'fee_schedule_items'
      AND policyname = 'fee_schedule_items_same_school'
  ) THEN
    CREATE POLICY fee_schedule_items_same_school ON public.fee_schedule_items
      FOR ALL
      -- `user_id = auth.uid()`, et NON `id` : c'est la forme employée par toutes
      -- les autres policies de l'école (cf. supabase_fee_catalog.sql). Les deux
      -- colonnes existent, et se tromper ouvrirait ou fermerait la table à tort.
      USING (school_id IN (SELECT school_id FROM public.school_users WHERE user_id = auth.uid()))
      WITH CHECK (school_id IN (SELECT school_id FROM public.school_users WHERE user_id = auth.uid()));
  END IF;
END $$;

-- Contrôle
SELECT
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema='public' AND table_name='fee_schedule_items')            AS colonnes_table,
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema='public' AND table_name='fee_payments'
      AND column_name='fee_schedule_item_id')                                   AS lien_paiement,
  (SELECT count(*) FROM pg_policies
    WHERE schemaname='public' AND tablename='fee_schedule_items')               AS policies;
