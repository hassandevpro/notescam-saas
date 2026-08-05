-- ════════════════════════════════════════════════════════════════════════════
-- CONTRÔLE DE CAISSE — fermeture des deux derniers contournements
-- ════════════════════════════════════════════════════════════════════════════
-- Après l'immuabilité des versements (supabase_fee_integrity.sql), il restait
-- deux chemins :
--
--   A. SUPPRIMER L'ÉLÈVE. La cascade FK students → fee_payments emportait ses
--      versements. Une cascade s'exécute au nom du propriétaire de la table et
--      ne repasse ni par la RLS ni par les GRANT : elle doit donc être bloquée
--      par la CONTRAINTE elle-même (ON DELETE RESTRICT). Sortie légitime :
--      l'archivage (students.archived_at), qui n'efface rien.
--
--   B. NE JAMAIS SAISIR L'ENCAISSEMENT. Aucune donnée à protéger : une recette
--      qui n'a jamais été écrite ne laisse pas de trace. Deux dispositifs :
--        • numéro de reçu SÉQUENTIEL → un reçu remis au parent mais absent de la
--          base fait un TROU visible dans la série ;
--        • arrêté de caisse (cash_sessions) → l'espèce physique comptée est
--          confrontée au total des écritures du caissier ce jour-là.
--
-- Idempotent : réexécutable sans risque.
-- PRÉREQUIS : supabase_actor_traceability.sql, puis supabase_fee_integrity.sql.
-- ════════════════════════════════════════════════════════════════════════════


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ A — L'élève porteur d'écritures ne s'efface plus                        ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS archived_at      timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by      uuid,
  ADD COLUMN IF NOT EXISTS archived_by_name text,
  ADD COLUMN IF NOT EXISTS archive_reason   text;

COMMENT ON COLUMN public.students.archived_at IS
  'Élève sorti des listes actives sans être supprimé. Obligatoire dès qu''il porte une écriture de caisse.';

CREATE INDEX IF NOT EXISTS idx_students_active
  ON public.students (school_id, class_id) WHERE archived_at IS NULL;

-- La FK devient RESTRICT : PostgreSQL refuse lui-même la suppression d'un élève
-- dont des versements dépendent. C'est le seul verrou qu'une cascade ne peut
-- pas contourner, puisque c'est la cascade que l'on retire.
DO $$
DECLARE fk_name text; n_orphans int;
BEGIN
  -- Des versements ORPHELINS existent : leur élève a déjà été supprimé, la
  -- cascade a emporté la ligne élève et laissé la recette rattachée à un id
  -- qui n'existe plus. C'est exactement le dégât que cette migration empêche
  -- désormais — mais il est déjà fait, et on ne peut pas le défaire : ces
  -- écritures ne doivent surtout pas être supprimées pour « faire propre ».
  SELECT count(*) INTO n_orphans
    FROM public.fee_payments fp
   WHERE fp.student_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.students s WHERE s.id = fp.student_id);
  RAISE NOTICE 'Versements ORPHELINS (élève déjà supprimé) : %', n_orphans;

  SELECT conname INTO fk_name
    FROM pg_constraint
   WHERE conrelid = 'public.fee_payments'::regclass
     AND contype = 'f'
     AND confrelid = 'public.students'::regclass
   LIMIT 1;

  IF fk_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.fee_payments DROP CONSTRAINT %I', fk_name);
  END IF;

  -- NOT VALID : la contrainte s'applique PLEINEMENT aux opérations futures —
  -- l'action ON DELETE RESTRICT est installée et bloque dès maintenant la
  -- suppression d'un élève porteur de versements. Seule la revalidation du
  -- STOCK existant est différée, sinon les orphelins hérités feraient échouer
  -- la migration et le verrou ne serait jamais posé.
  ALTER TABLE public.fee_payments
    ADD CONSTRAINT fee_payments_student_id_fkey
    FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE RESTRICT
    NOT VALID;

  RAISE NOTICE 'fee_payments.student_id → ON DELETE RESTRICT (ancienne contrainte : %)', COALESCE(fk_name, 'aucune');
  IF n_orphans = 0 THEN
    -- Rien à hériter : on valide tout de suite, la contrainte devient pleine.
    ALTER TABLE public.fee_payments VALIDATE CONSTRAINT fee_payments_student_id_fkey;
    RAISE NOTICE 'Aucun orphelin : contrainte VALIDÉE sur le stock existant.';
  ELSE
    RAISE WARNING 'Contrainte posée en NOT VALID à cause de % orphelin(s). Les rattacher à un élève (ou les archiver) puis : ALTER TABLE public.fee_payments VALIDATE CONSTRAINT fee_payments_student_id_fkey;', n_orphans;
  END IF;
END $$;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ B1 — Numéro de reçu SÉQUENTIEL : rendre visible la recette escamotée     ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

ALTER TABLE public.fee_payments
  ADD COLUMN IF NOT EXISTS receipt_no integer;

COMMENT ON COLUMN public.fee_payments.receipt_no IS
  'Numéro séquentiel par (école, année). Un trou dans la série = une recette encaissée puis effacée.';

CREATE INDEX IF NOT EXISTS idx_fee_payments_receipt_no
  ON public.fee_payments (school_id, academic_year, receipt_no);

-- Compteur dédié : un MAX(receipt_no)+1 sous forte concurrence attribuerait deux
-- fois le même numéro. Le upsert ... RETURNING verrouille la ligne de compteur
-- le temps de la transaction, ce qui sérialise proprement les attributions.
CREATE TABLE IF NOT EXISTS public.receipt_counters (
  school_id     uuid NOT NULL,
  academic_year text NOT NULL DEFAULT '',
  last_no       integer NOT NULL DEFAULT 0,
  PRIMARY KEY (school_id, academic_year)
);
ALTER TABLE public.receipt_counters ENABLE ROW LEVEL SECURITY;
-- Aucune policy : la table n'est touchée QUE par le trigger SECURITY DEFINER.

CREATE OR REPLACE FUNCTION public.allocate_receipt_no()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE next_no integer;
BEGIN
  -- Déjà numéroté ⇒ ligne venue de la synchro LAN : on ne renumérote pas, sinon
  -- le reçu papier déjà remis ne correspondrait plus à la base.
  IF NEW.receipt_no IS NOT NULL THEN
    INSERT INTO public.receipt_counters (school_id, academic_year, last_no)
    VALUES (NEW.school_id, COALESCE(NEW.academic_year, ''), NEW.receipt_no)
    ON CONFLICT (school_id, academic_year)
    DO UPDATE SET last_no = GREATEST(receipt_counters.last_no, EXCLUDED.last_no);
    RETURN NEW;
  END IF;

  INSERT INTO public.receipt_counters (school_id, academic_year, last_no)
  VALUES (NEW.school_id, COALESCE(NEW.academic_year, ''), 1)
  ON CONFLICT (school_id, academic_year)
  DO UPDATE SET last_no = receipt_counters.last_no + 1
  RETURNING last_no INTO next_no;

  NEW.receipt_no := next_no;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_allocate_receipt_no ON public.fee_payments;
CREATE TRIGGER trg_allocate_receipt_no
  BEFORE INSERT ON public.fee_payments
  FOR EACH ROW EXECUTE FUNCTION public.allocate_receipt_no();

-- ⚠ LIMITE ASSUMÉE — mode HYBRIDE (LAN + Cloud encaissant tous les deux).
-- Le LAN numérote de son côté (server/query.js) et le Cloud ici : deux systèmes
-- qui allouent en parallèle peuvent produire un doublon. Le compteur ci-dessus
-- absorbe les numéros venus du LAN (GREATEST) pour limiter la dérive, mais il
-- n'y a délibérément AUCUN index unique : il ferait échouer le push de synchro
-- pour toute la table, ce qui serait bien pire qu'un doublon. En pratique une
-- école encaisse d'un seul côté ; l'écran de contrôle signale les doublons.


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ B2 — Arrêté de caisse : confronter le tiroir aux écritures               ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS public.cash_sessions (
  id                uuid PRIMARY KEY,
  school_id         uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  academic_year     text,
  date              date NOT NULL,
  cashier_id        uuid,
  cashier_name      text,
  opening_float     integer NOT NULL DEFAULT 0,
  expected_cash     integer NOT NULL DEFAULT 0,
  counted_cash      integer,
  variance          integer NOT NULL DEFAULT 0,
  entry_count       integer NOT NULL DEFAULT 0,
  explanation       text,
  status            text NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open', 'declared', 'validated')),
  declared_at       timestamptz,
  validated_by      uuid,
  validated_by_name text,
  validated_at      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz,
  version           integer,
  device_id         text,
  UNIQUE (school_id, date, cashier_id)
);

CREATE INDEX IF NOT EXISTS idx_cash_sessions_school ON public.cash_sessions (school_id, date DESC);

-- Personne ne valide son propre comptage : c'est ce qui sépare un contrôle
-- d'une auto-déclaration. Contrainte de TABLE, donc invérifiable côté client.
ALTER TABLE public.cash_sessions DROP CONSTRAINT IF EXISTS cash_sessions_no_self_validation;
ALTER TABLE public.cash_sessions ADD CONSTRAINT cash_sessions_no_self_validation
  CHECK (validated_by IS NULL OR validated_by IS DISTINCT FROM cashier_id);

-- Un écart non nul doit être justifié pour que la journée soit close.
ALTER TABLE public.cash_sessions DROP CONSTRAINT IF EXISTS cash_sessions_variance_explained;
ALTER TABLE public.cash_sessions ADD CONSTRAINT cash_sessions_variance_explained
  CHECK (status = 'open' OR variance = 0 OR nullif(btrim(explanation), '') IS NOT NULL);

ALTER TABLE public.cash_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cash_sessions: lecture membres" ON public.cash_sessions;
DROP POLICY IF EXISTS "cash_sessions: écriture caisse" ON public.cash_sessions;

-- Lecture ouverte aux membres : un arrêté de caisse est une pièce de contrôle,
-- pas un secret. C'est même le but qu'il soit consultable.
CREATE POLICY "cash_sessions: lecture membres"
  ON public.cash_sessions FOR SELECT
  USING (public.is_school_member(school_id));

CREATE POLICY "cash_sessions: écriture caisse"
  ON public.cash_sessions FOR ALL
  USING (public.is_school_cashier(school_id))
  WITH CHECK (public.is_school_cashier(school_id));

-- Un arrêté VALIDÉ ne se réécrit pas : sinon le contrôle se défait après coup.
CREATE OR REPLACE FUNCTION public.freeze_validated_cash_session()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'validated' AND auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'Arrêté de caisse déjà validé : il ne peut plus être modifié.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_freeze_validated_cash_session ON public.cash_sessions;
CREATE TRIGGER trg_freeze_validated_cash_session
  BEFORE UPDATE ON public.cash_sessions
  FOR EACH ROW EXECUTE FUNCTION public.freeze_validated_cash_session();


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ C — VÉRIFICATION                                                         ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
DO $$
DECLARE rule text; n_gap int;
BEGIN
  SELECT confdeltype INTO rule FROM pg_constraint
   WHERE conrelid = 'public.fee_payments'::regclass AND contype = 'f'
     AND confrelid = 'public.students'::regclass LIMIT 1;
  RAISE NOTICE 'FK fee_payments→students : % (attendu « r » = RESTRICT)', rule;
  IF rule IS DISTINCT FROM 'r' THEN
    RAISE WARNING 'La cascade est encore active : supprimer un élève emporterait ses versements.';
  END IF;

  SELECT count(*) INTO n_gap FROM public.fee_payments WHERE receipt_no IS NULL;
  RAISE NOTICE 'Versements sans numéro de reçu (antérieurs à la numérotation) : %', n_gap;
END $$;
