-- Sprint 22 : Décision du Conseil de Classe par élève
-- Ajoute le champ `decision` à student_absences
-- Valeurs : 'admis' | 'redoublant' | 'renvoye' | NULL

ALTER TABLE public.student_absences
  ADD COLUMN IF NOT EXISTS decision text CHECK (decision IN ('admis', 'redoublant', 'renvoye'));
