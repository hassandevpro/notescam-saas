-- ════════════════════════════════════════════════════════════════════════════
-- ALIGNEMENT DES TYPES D'ACTEUR — colonnes d'auteur en TEXT
-- ════════════════════════════════════════════════════════════════════════════
-- Défaut introduit par supabase_cash_control.sql : `students.archived_by` et les
-- colonnes d'acteur de `cash_sessions` avaient été déclarées `uuid`, alors que
-- `students.created_by` est `text`.
--
-- Pourquoi TEXT et pas uuid : côté LAN, les identifiants de compte sont des TEXT
-- qui ne sont pas nécessairement des uuid (server/schema.sql : users.id TEXT).
-- Une colonne uuid côté Cloud ferait rejeter l'upsert de synchro pour la TABLE
-- ENTIÈRE — plus aucun élève ne remonterait du LAN. C'est le mode de panne déjà
-- rencontré sur school_units/classes/subjects.
--
-- `fee_payments.recorded_by` reste `uuid` : la colonne préexistait sous ce type
-- et contient déjà des uuid valides (auth.uid()).
--
-- Idempotent : réexécutable sans risque. Tables concernées vides ou peu
-- remplies (archivage et arrêtés de caisse viennent d'être introduits).
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.students
  ALTER COLUMN archived_by TYPE text USING archived_by::text;

ALTER TABLE public.cash_sessions
  ALTER COLUMN cashier_id   TYPE text USING cashier_id::text,
  ALTER COLUMN validated_by TYPE text USING validated_by::text;

-- Le trigger assignait auth.uid() (uuid) à une colonne text en s'en remettant
-- au cast implicite de PL/pgSQL. On rend le cast EXPLICITE : ce trigger tourne
-- sur chaque inscription d'élève, il ne doit dépendre d'aucune subtilité de
-- conversion.
CREATE OR REPLACE FUNCTION public.stamp_student_creator()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE uid text := (SELECT auth.uid())::text;
BEGIN
  IF uid IS NOT NULL AND NEW.created_by IS DISTINCT FROM uid THEN
    NEW.created_by := uid;
  END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT table_name, column_name, data_type FROM information_schema.columns
            WHERE table_schema='public'
              AND ((table_name='students' AND column_name IN ('created_by','archived_by'))
                OR (table_name='cash_sessions' AND column_name IN ('cashier_id','validated_by')))
            ORDER BY table_name, column_name LOOP
    RAISE NOTICE 'TYPE %.% = % (attendu text)', r.table_name, r.column_name, r.data_type;
    IF r.data_type <> 'text' THEN
      RAISE EXCEPTION 'Colonne %.% encore en % : le push LAN serait rejeté.', r.table_name, r.column_name, r.data_type;
    END IF;
  END LOOP;
END $$;
