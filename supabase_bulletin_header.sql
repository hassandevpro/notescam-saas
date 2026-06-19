-- En-tête de bulletin par pays + numéro d'établissement + police.
-- À exécuter dans l'éditeur SQL Supabase. Idempotent.
--
-- - establishment_no : numéro officiel de l'établissement, affiché sous les
--   officiels de délégation dans l'en-tête du bulletin.
-- - bulletin_font    : police choisie pour le bulletin (clé de BULLETIN_FONTS,
--   ex. 'arial', 'times', 'georgia'…). NULL => Arial par défaut.
--
-- L'en-tête officiel (République / ministère / délégations) est désormais
-- hérité du pays choisi à la configuration (colonne existante country_system) ;
-- aucune nouvelle colonne n'est requise pour cela.

ALTER TABLE schools ADD COLUMN IF NOT EXISTS establishment_no text;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS bulletin_font    text;
