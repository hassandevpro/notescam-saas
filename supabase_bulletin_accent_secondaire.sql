-- ════════════════════════════════════════════════════════════════════════════
-- COULEUR DU BULLETIN DU SECONDAIRE — un réglage PAR CYCLE
-- ════════════════════════════════════════════════════════════════════════════
--
-- `schools.bulletin_accent`      → primaire / maternelle (vert par défaut)
-- `schools.bulletin_accent_sec`  → secondaire            (bleu d'origine par défaut)
--
-- RIEN NE CHANGE POUR LES ÉCOLES EXISTANTES : colonne NULLABLE, laissée à NULL.
-- NULL (ou #1e3a5f) = les quatre bleus historiques du secondaire, à l'octet près.
--
-- ⚠ ORDRE D'APPLICATION — avant de distribuer un paquet LAN
-- `sync-push` rejette EN ENTIER une ligne `schools` portant une colonne inconnue du
-- Cloud. Donc : 1. exécuter CE FICHIER ; 2. vérifier le SELECT final ; 3. seulement
-- ensuite distribuer le paquet LAN. (Même règle que supabase_bulletin_accent.sql.)

ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS bulletin_accent_sec text;

COMMENT ON COLUMN public.schools.bulletin_accent_sec IS
  'Couleur d''accent (#rrggbb) des bulletins et documents du SECONDAIRE. NULL = bleu d''origine #1e3a5f.';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'schools_bulletin_accent_sec_hex') THEN
    ALTER TABLE public.schools
      ADD CONSTRAINT schools_bulletin_accent_sec_hex
      CHECK (bulletin_accent_sec IS NULL OR bulletin_accent_sec ~* '^#[0-9a-f]{6}$');
  END IF;
END $$;

-- Contrôle : attendu juste après migration → couleurs_choisies = 0.
SELECT
  (SELECT count(*) FROM information_schema.columns
     WHERE table_schema='public' AND table_name='schools' AND column_name='bulletin_accent_sec') AS colonne_presente,
  (SELECT count(*) FROM public.schools)                                                          AS ecoles_total,
  (SELECT count(*) FROM public.schools WHERE bulletin_accent_sec IS NOT NULL)                    AS couleurs_choisies;
