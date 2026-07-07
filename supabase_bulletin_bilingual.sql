-- ============================================================
-- En-tête de bulletin : bilingue ou mono-langue
--
-- Pour les pays officiellement bilingues (Cameroun), l'en-tête du bulletin
-- affiche par défaut les DEUX blocs officiels (République du Cameroun /
-- Republic of Cameroon). Ce réglage permet à l'établissement de n'afficher
-- qu'UN seul bloc, dans la langue de la classe (système anglophone → en-tête
-- anglais, francophone → en-tête français).
--
-- NULL / true  = en-tête bilingue (comportement historique).
-- false        = en-tête mono-langue (selon le système de la classe).
--
-- 100 % additif, rétrocompatible. À exécuter une fois dans Supabase (SQL Editor).
-- ============================================================

ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS bulletin_bilingual boolean;
