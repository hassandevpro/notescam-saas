-- Sprint 21 : Décisions du Conseil de Classe
-- Étend student_absences avec les champs conseil de classe

ALTER TABLE public.student_absences
  ADD COLUMN IF NOT EXISTS th              boolean  NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS encouragement   boolean  NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS felicitation    boolean  NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS aver_travail    smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS blame_travail   smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS exclusions      smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS aver_conduite   smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS blame_conduite  smallint NOT NULL DEFAULT 0;
