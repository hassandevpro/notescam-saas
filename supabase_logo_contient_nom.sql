-- ════════════════════════════════════════════════════════════════════════════
-- « LE LOGO CONTIENT DÉJÀ LE NOM DE L'ÉCOLE » — RÉGLAGE PAR ÉCOLE
-- ════════════════════════════════════════════════════════════════════════════
-- Un logo qui porte le nom de l'école (Bright Continent) le répétait en texte sous lui sur le
-- bulletin. Une image carrée ne se distingue pas d'un blason : l'école le déclare. Cochée, la
-- case supprime le nom écrit (adresse, téléphone et année restent) et agrandit le logo.
--
-- Défaut false : AUCUN bulletin existant ne change tant qu'une école ne coche rien.
--
-- ⚠ ORDRE D'APPLICATION (même règle que supabase_bulletin_accent.sql) : `schools` est synchronisée
-- et le Cloud rejette en entier une ligne portant une colonne inconnue. Donc :
--   1. exécuter CE FICHIER sur le Cloud ;
--   2. vérifier le SELECT de contrôle ;
--   3. seulement ensuite, distribuer un paquet LAN qui porte la colonne.
-- Côté application Cloud, le réglage reste INVISIBLE tant que la colonne n'existe pas.

ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS logo_contient_nom boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.schools.logo_contient_nom IS
  'true = le logo porte deja le nom de l''ecole : le bulletin n''ecrit plus le nom sous le logo.';

-- Contrôle : attendu juste après la migration, ecoles_cochees = 0.
SELECT
  (SELECT count(*) FROM public.schools)                                    AS ecoles_total,
  (SELECT count(*) FROM public.schools WHERE logo_contient_nom IS TRUE)    AS ecoles_cochees;
