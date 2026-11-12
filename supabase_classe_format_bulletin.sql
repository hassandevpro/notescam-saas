-- ════════════════════════════════════════════════════════════════════════════
-- FORMAT DU BULLETIN PAR CLASSE — « Matières à note unique » (primaire)
-- ════════════════════════════════════════════════════════════════════════════
-- classes.bulletin_format : NULL = format habituel de l'école | 'note_unique'.
-- Colonne NULLABLE, laissée à NULL : AUCUNE classe existante ne change.
--
-- ⚠ ORDRE : exécuter CE FICHIER sur le Cloud AVANT de distribuer un paquet LAN (sync-push rejette en entier une
-- ligne portant une colonne inconnue du Cloud). Puis seulement distribuer.

ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS bulletin_format text;

COMMENT ON COLUMN public.classes.bulletin_format IS
  'Format du bulletin primaire de la classe. NULL = habituel ; note_unique = matieres a note unique (note, bareme, N/20, cote).';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'classes_bulletin_format_chk') THEN
    ALTER TABLE public.classes
      ADD CONSTRAINT classes_bulletin_format_chk CHECK (bulletin_format IS NULL OR bulletin_format IN ('note_unique'));
  END IF;
END $$;

-- Contrôle : attendu juste après migration → colonne_presente = 1, classes_au_format = 0.
SELECT
  (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='classes' AND column_name='bulletin_format') AS colonne_presente,
  (SELECT count(*) FROM public.classes WHERE bulletin_format IS NOT NULL) AS classes_au_format;
