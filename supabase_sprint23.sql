-- Sprint 23 : Statut d'inscription de l'élève
-- Indique si l'élève est nouveau, redoublant ou transféré d'un autre établissement

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS statut text
    CHECK (statut IN ('nouveau', 'redoublant', 'transfere'));
