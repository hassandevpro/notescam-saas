-- Signature du bas de bulletin : « Directeur / Directrice » (directeur PAR SECTION, ex. Genius) ou
-- « Chef d'établissement » (défaut). Drapeau explicite : rien dans les données ne les distingue.
-- Additive, défaut false : aucune école existante ne change d'aspect tant qu'on n'a pas posé le drapeau.
-- À APPLIQUER seulement sur autorisation. Retour arrière : ALTER TABLE public.schools DROP COLUMN director_per_section;
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS director_per_section boolean NOT NULL DEFAULT false;
