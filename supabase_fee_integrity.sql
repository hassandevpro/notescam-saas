-- ════════════════════════════════════════════════════════════════════════════
-- INTÉGRITÉ DES RECETTES — immuabilité des versements + RLS par rôle
-- ════════════════════════════════════════════════════════════════════════════
-- Ferme les trois failles critiques de l'audit de détournement :
--
--   1. SUPPRESSION D'UN VERSEMENT. Le geste était à un clic et effaçait sa
--      propre preuve : encaisser, remettre le reçu, supprimer la ligne, garder
--      l'argent. UPDATE et DELETE deviennent impossibles ; annuler passe par une
--      CONTRE-PASSATION (ligne négative portant `reversal_of` + `void_reason`).
--
--   2. GARDE PAR RÔLE COSMÉTIQUE. La policy était `FOR ALL` sur la simple
--      appartenance à l'école. La clé anon étant dans le navigateur, n'importe
--      quel compte actif — un enseignant — pouvait écrire ou supprimer un
--      paiement depuis la console. L'écriture est désormais réservée aux rôles
--      qui tiennent la caisse.
--
--   3. AUTEUR DÉCLARATIF. `recorded_by` venait du client, donc falsifiable : on
--      pouvait signer un encaissement du nom d'un collègue. Il est maintenant
--      estampillé par un trigger depuis auth.uid().
--
-- SYNCHRO LAN : les fonctions edge utilisent la service_role, qui contourne la
-- RLS et pour laquelle auth.uid() est NULL — les triggers laissent donc passer
-- les valeurs venues du LAN sans les écraser. Rien de la synchro ne casse.
--
-- Idempotent : réexécutable sans risque.
-- PRÉREQUIS : supabase_actor_traceability.sql (colonnes recorded_by/_name).
-- ════════════════════════════════════════════════════════════════════════════


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 1 — CONTRE-PASSATION : le schéma qui rend l'annulation traçable          ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

ALTER TABLE public.fee_payments
  ADD COLUMN IF NOT EXISTS reversal_of uuid REFERENCES public.fee_payments(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS void_reason text;

COMMENT ON COLUMN public.fee_payments.reversal_of IS
  'Versement annulé par cette ligne (montant négatif). NULL = encaissement normal.';
COMMENT ON COLUMN public.fee_payments.void_reason IS
  'Motif de l''annulation — obligatoire dès que reversal_of est renseigné.';

-- Une annulation sans motif n'est pas une annulation : c'est une disparition.
ALTER TABLE public.fee_payments DROP CONSTRAINT IF EXISTS fee_payments_reversal_needs_reason;
ALTER TABLE public.fee_payments ADD CONSTRAINT fee_payments_reversal_needs_reason
  CHECK (reversal_of IS NULL OR nullif(btrim(void_reason), '') IS NOT NULL) NOT VALID;
-- NOT VALID : n'invalide pas d'éventuelles lignes historiques ; toute NOUVELLE
-- ligne est contrôlée. Passer en VALIDATE après vérification du stock existant :
--   ALTER TABLE public.fee_payments VALIDATE CONSTRAINT fee_payments_reversal_needs_reason;

CREATE INDEX IF NOT EXISTS idx_fee_payments_reversal_of
  ON public.fee_payments (reversal_of) WHERE reversal_of IS NOT NULL;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 2 — NON-RÉPUDIATION : l'auteur vient du jeton, pas du payload            ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE OR REPLACE FUNCTION public.stamp_fee_payment_actor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- auth.uid() NULL ⇒ écriture service_role (synchro LAN) : on conserve la
  -- valeur d'origine, qui a déjà été estampillée par le serveur LAN.
  IF auth.uid() IS NOT NULL THEN
    NEW.recorded_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stamp_fee_payment_actor ON public.fee_payments;
CREATE TRIGGER trg_stamp_fee_payment_actor
  BEFORE INSERT ON public.fee_payments
  FOR EACH ROW EXECUTE FUNCTION public.stamp_fee_payment_actor();

-- Même principe pour l'auteur d'une inscription.
CREATE OR REPLACE FUNCTION public.stamp_student_creator()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NEW.created_by IS DISTINCT FROM auth.uid() THEN
    NEW.created_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stamp_student_creator ON public.students;
CREATE TRIGGER trg_stamp_student_creator
  BEFORE INSERT ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.stamp_student_creator();


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 3 — QUI TIENT LA CAISSE : appartenance À L'ÉCOLE *ET* rôle               ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- `auth.uid()` est encapsulé dans un SELECT : sans cela PostgreSQL réévalue la
-- fonction POUR CHAQUE LIGNE (cf. audit d'échelle 100+ écoles).

CREATE OR REPLACE FUNCTION public.is_school_cashier(p_school_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.school_users
    WHERE user_id = (SELECT auth.uid())
      AND school_id = p_school_id
      AND active = true
      AND role IN ('admin', 'censeur')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_school_member(p_school_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.school_users
    WHERE user_id = (SELECT auth.uid())
      AND school_id = p_school_id
      AND active = true
  );
$$;

REVOKE ALL ON FUNCTION public.is_school_cashier(uuid) FROM public;
REVOKE ALL ON FUNCTION public.is_school_member(uuid)  FROM public;
GRANT EXECUTE ON FUNCTION public.is_school_cashier(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_school_member(uuid)  TO authenticated;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 4 — fee_payments : LECTURE membres · ÉCRITURE caisse · JAMAIS d'effacement║
-- ╚══════════════════════════════════════════════════════════════════════════╝

ALTER TABLE public.fee_payments ENABLE ROW LEVEL SECURITY;

-- L'ancienne policy `FOR ALL` couvrait aussi UPDATE et DELETE : la retirer est
-- l'essentiel du correctif.
DROP POLICY IF EXISTS "fee_payments: members"            ON public.fee_payments;
DROP POLICY IF EXISTS "payments: lecture par membres"    ON public.fee_payments;
DROP POLICY IF EXISTS "payments: écriture par admins"    ON public.fee_payments;
DROP POLICY IF EXISTS "Members read fee_payments"        ON public.fee_payments;
DROP POLICY IF EXISTS "Admins write fee_payments"        ON public.fee_payments;

CREATE POLICY "fee_payments: lecture membres"
  ON public.fee_payments FOR SELECT
  USING (public.is_school_member(school_id));

CREATE POLICY "fee_payments: encaissement caisse"
  ON public.fee_payments FOR INSERT
  WITH CHECK (public.is_school_cashier(school_id));

-- AUCUNE policy UPDATE ni DELETE : en RLS, ce qui n'est pas autorisé est refusé.
-- Le REVOKE ci-dessous est la seconde ceinture (une vieille migration rejouée
-- qui recréerait une policy permissive ne suffirait pas à rouvrir la faille).
REVOKE UPDATE, DELETE ON public.fee_payments FROM authenticated, anon;

-- NOTE — la suppression d'un ÉLÈVE efface toujours ses paiements par cascade FK
-- (une cascade s'exécute au nom du propriétaire de la table et ne repasse ni par
-- la RLS ni par les GRANT). L'app en garde un instantané en corbeille, mais le
-- chemin reste ouvert : à traiter séparément (passer la FK en ON DELETE RESTRICT
-- et archiver l'élève au lieu de le supprimer).


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 5 — LE DÛ : student_fees & class_fee_grids réservés à la caisse          ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- Baisser le tarif d'une classe puis le remettre en place est le détournement le
-- plus rentable et le plus discret : le dû suit, l'élève paraît soldé, l'écart
-- part en poche. L'écriture est donc réservée aux mêmes rôles que la caisse.

ALTER TABLE public.student_fees    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_fee_grids ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "student_fees: members"          ON public.student_fees;
DROP POLICY IF EXISTS "fees: lecture par membres"      ON public.student_fees;
DROP POLICY IF EXISTS "fees: écriture par admins"      ON public.student_fees;
DROP POLICY IF EXISTS "student_fees: lecture membres"  ON public.student_fees;
DROP POLICY IF EXISTS "student_fees: écriture caisse"  ON public.student_fees;

CREATE POLICY "student_fees: lecture membres"
  ON public.student_fees FOR SELECT
  USING (public.is_school_member(school_id));

CREATE POLICY "student_fees: écriture caisse"
  ON public.student_fees FOR ALL
  USING (public.is_school_cashier(school_id))
  WITH CHECK (public.is_school_cashier(school_id));

DROP POLICY IF EXISTS "class_fee_grids: members"          ON public.class_fee_grids;
DROP POLICY IF EXISTS "grids: lecture par membres"        ON public.class_fee_grids;
DROP POLICY IF EXISTS "grids: écriture par admins"        ON public.class_fee_grids;
DROP POLICY IF EXISTS "class_fee_grids: lecture membres"  ON public.class_fee_grids;
DROP POLICY IF EXISTS "class_fee_grids: écriture caisse"  ON public.class_fee_grids;

CREATE POLICY "class_fee_grids: lecture membres"
  ON public.class_fee_grids FOR SELECT
  USING (public.is_school_member(school_id));

CREATE POLICY "class_fee_grids: écriture caisse"
  ON public.class_fee_grids FOR ALL
  USING (public.is_school_cashier(school_id))
  WITH CHECK (public.is_school_cashier(school_id));


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 6 — VÉRIFICATION (à lire après exécution)                                ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
DO $$
DECLARE n_write int; n_upd int;
BEGIN
  SELECT count(*) INTO n_upd FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'fee_payments'
     AND cmd IN ('UPDATE', 'DELETE', 'ALL');
  SELECT count(*) INTO n_write FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'fee_payments' AND cmd = 'INSERT';

  RAISE NOTICE 'fee_payments — policies INSERT : % (attendu 1)', n_write;
  RAISE NOTICE 'fee_payments — policies UPDATE/DELETE/ALL : % (attendu 0)', n_upd;
  IF n_upd > 0 THEN
    RAISE WARNING 'Une policy permissive subsiste sur fee_payments : un versement reste effaçable.';
  END IF;
END $$;
