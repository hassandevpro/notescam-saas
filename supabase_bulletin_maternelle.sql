-- ════════════════════════════════════════════════════════════════════════════
-- BULLETIN DE MATERNELLE — deux formats (Classique / Enfantin), émojis, visage « non acquis »
-- ════════════════════════════════════════════════════════════════════════════
-- schools.bulletin_mat_format     'classique' | 'enfantin'  → format par défaut de l'école       (NULL = classique)
-- schools.bulletin_mat_emojis     boolean                   → émojis du format Classique          (NULL = jamais choisi)
-- schools.bulletin_mat_visage_na  'encourageant' | 'triste' → visage du niveau « non acquis »     (NULL = défaut du format)
-- classes.bulletin_mat_format     'classique' | 'enfantin'  → format d'UNE classe                 (NULL = défaut de l'école)
--
-- RIEN NE CHANGE POUR LES ÉCOLES EXISTANTES : toutes les colonnes sont NULLABLES et laissées à NULL.
-- NULL partout = l'ancien bulletin de maternelle, lettres seules, à l'identique. À la première ouverture d'un
-- bulletin de maternelle, une école existante est invitée à choisir (afficher les émojis / garder les lettres).
--
-- ⚠ ORDRE : exécuter CE FICHIER sur le Cloud AVANT de distribuer un paquet LAN (sync-push rejette EN ENTIER une
-- ligne portant une colonne inconnue du Cloud). Idempotent : on peut le relancer sans risque.

ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS bulletin_mat_format     text;
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS bulletin_mat_emojis     boolean;
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS bulletin_mat_visage_na  text;
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS bulletin_mat_format     text;

-- Les NOUVELLES écoles naissent avec les émojis activés (format Classique). Un DEFAULT posé APRÈS coup ne touche
-- QUE les lignes futures : les écoles existantes restent à NULL (= jamais choisi = lettres seules, comme avant).
ALTER TABLE public.schools ALTER COLUMN bulletin_mat_emojis SET DEFAULT true;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'schools_bulletin_mat_format_chk') THEN
    ALTER TABLE public.schools ADD CONSTRAINT schools_bulletin_mat_format_chk
      CHECK (bulletin_mat_format IS NULL OR bulletin_mat_format IN ('classique', 'enfantin'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'schools_bulletin_mat_visage_na_chk') THEN
    ALTER TABLE public.schools ADD CONSTRAINT schools_bulletin_mat_visage_na_chk
      CHECK (bulletin_mat_visage_na IS NULL OR bulletin_mat_visage_na IN ('encourageant', 'triste'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'classes_bulletin_mat_format_chk') THEN
    ALTER TABLE public.classes ADD CONSTRAINT classes_bulletin_mat_format_chk
      CHECK (bulletin_mat_format IS NULL OR bulletin_mat_format IN ('classique', 'enfantin'));
  END IF;
END $$;

-- Contrôle : attendu juste après migration → 4 colonnes présentes, 0 école et 0 classe renseignées.
SELECT
  (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public'
     AND (table_name, column_name) IN (('schools','bulletin_mat_format'), ('schools','bulletin_mat_emojis'),
                                       ('schools','bulletin_mat_visage_na'), ('classes','bulletin_mat_format'))) AS colonnes_presentes,
  (SELECT count(*) FROM public.schools WHERE bulletin_mat_format IS NOT NULL OR bulletin_mat_emojis IS NOT NULL
                                           OR bulletin_mat_visage_na IS NOT NULL)                                AS ecoles_renseignees,
  (SELECT count(*) FROM public.classes WHERE bulletin_mat_format IS NOT NULL)                                    AS classes_renseignees;
