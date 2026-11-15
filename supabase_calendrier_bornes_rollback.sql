-- Retour arrière de supabase_calendrier_bornes.sql (supprime les dates de début/fin saisies depuis).
ALTER TABLE public.sequence_dates DROP COLUMN IF EXISTS start_date;
ALTER TABLE public.sequence_dates DROP COLUMN IF EXISTS end_date;
ALTER TABLE public.schools DROP COLUMN IF EXISTS calendar_confirmed_at;
