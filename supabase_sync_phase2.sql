-- supabase_sync_phase2.sql
-- Socle cloud de la synchronisation continue LAN ↔ Cloud (Phase 2).
--   1. Colonnes de sync (updated_at / version / device_id) sur les tables répliquées.
--   2. Trigger BEFORE UPDATE : rafraîchit updated_at + incrémente version à chaque modif.
--   3. Table sync_tombstones + trigger AFTER DELETE : trace les suppressions pour
--      que le serveur LAN puisse les répliquer (pull).
--
-- À coller dans Supabase → SQL Editor → Run.

-- Tables répliquées (mêmes que SYNCED_TABLES côté serveur LAN).
DO $$
DECLARE
  t text;
  synced text[] := ARRAY[
    'schools','school_users','academic_periods','classes','subjects',
    'students','teachers','grades','student_fees','fee_payments',
    'attendance','student_absences','student_class_assignments',
    'school_messages','teacher_notifications','sequence_dates','timetable_slots'];
BEGIN
  FOREACH t IN ARRAY synced LOOP
    IF to_regclass('public.'||t) IS NULL THEN CONTINUE; END IF;   -- table absente -> on ignore
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now()', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS device_id text', t);
  END LOOP;
END $$;

-- 2. updated_at auto + version++ à chaque UPDATE.
CREATE OR REPLACE FUNCTION public.touch_sync_row() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  NEW.version := COALESCE(OLD.version, 0) + 1;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

-- 3. Tombstones (suppressions répliquées).
CREATE TABLE IF NOT EXISTS public.sync_tombstones (
  school_id  uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  tablename  text NOT NULL,
  row_id     uuid NOT NULL,
  deleted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (school_id, tablename, row_id)
);
CREATE INDEX IF NOT EXISTS idx_sync_tombstones_pull ON public.sync_tombstones (school_id, deleted_at);
ALTER TABLE public.sync_tombstones ENABLE ROW LEVEL SECURITY; -- service_role uniquement (fonctions edge)

CREATE OR REPLACE FUNCTION public.log_tombstone() RETURNS trigger AS $$
DECLARE sid uuid;
BEGIN
  sid := CASE WHEN TG_TABLE_NAME = 'schools' THEN OLD.id ELSE OLD.school_id END;
  IF sid IS NOT NULL THEN
    INSERT INTO public.sync_tombstones (school_id, tablename, row_id, deleted_at)
    VALUES (sid, TG_TABLE_NAME, OLD.id, now())
    ON CONFLICT (school_id, tablename, row_id) DO UPDATE SET deleted_at = excluded.deleted_at;
  END IF;
  RETURN OLD;
END $$ LANGUAGE plpgsql;

-- Attache les deux triggers à chaque table répliquée.
DO $$
DECLARE
  t text;
  synced text[] := ARRAY[
    'schools','school_users','academic_periods','classes','subjects',
    'students','teachers','grades','student_fees','fee_payments',
    'attendance','student_absences','student_class_assignments',
    'school_messages','teacher_notifications','sequence_dates','timetable_slots'];
BEGIN
  FOREACH t IN ARRAY synced LOOP
    IF to_regclass('public.'||t) IS NULL THEN CONTINUE; END IF;   -- table absente -> on ignore
    EXECUTE format('DROP TRIGGER IF EXISTS trg_touch_%1$s ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER trg_touch_%1$s BEFORE UPDATE ON public.%1$I FOR EACH ROW EXECUTE FUNCTION public.touch_sync_row()', t);
    EXECUTE format('DROP TRIGGER IF EXISTS trg_tomb_%1$s ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER trg_tomb_%1$s AFTER DELETE ON public.%1$I FOR EACH ROW EXECUTE FUNCTION public.log_tombstone()', t);
  END LOOP;
END $$;
