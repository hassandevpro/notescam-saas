-- Sprint 26: permission impression bulletins par enseignant
-- Executer dans Supabase SQL Editor

ALTER TABLE teachers
  ADD COLUMN IF NOT EXISTS can_print_bulletin boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN teachers.can_print_bulletin IS
  'Controle par admin — si false, l''enseignant ne peut pas imprimer les bulletins.';
