-- supabase_apc_note_max_rollback.sql
-- Annule supabase_apc_note_max.sql.
--
-- ⚠️ Retirer la colonne SUPPRIME les barèmes saisis depuis l'application du
-- correctif : toute note enregistrée sur une échelle autre que /20 serait
-- relue comme /20, donc faussée. N'exécuter ce rollback que si AUCUNE note
-- ne porte un barème explicite — la requête de contrôle ci-dessous le dit.
--
-- Idempotent.
-- ============================================================================

-- Contrôle préalable : combien de notes perdraient leur barème ?
DO $$
DECLARE v_n int := 0;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'apc_notes' AND column_name = 'note_max'
  ) THEN
    EXECUTE 'SELECT count(*) FROM public.apc_notes WHERE note_max IS NOT NULL AND note_max <> 20'
      INTO v_n;
    IF v_n > 0 THEN
      RAISE EXCEPTION '% note(s) portent un barème autre que /20 : le rollback les fausserait. Les convertir d''abord, ou renoncer.', v_n;
    END IF;
  END IF;
END $$;

ALTER TABLE public.apc_notes DROP CONSTRAINT IF EXISTS apc_notes_note_max_chk;
ALTER TABLE public.apc_notes DROP COLUMN IF EXISTS note_max;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'apc_notes' AND column_name = 'note_max'
  ) THEN
    RAISE EXCEPTION 'la colonne note_max est toujours là';
  END IF;
  RAISE NOTICE 'apc_notes.note_max retirée — toutes les notes redeviennent /20.';
END $$;
