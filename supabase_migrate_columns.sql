-- NotesCam — Ajout des colonnes manquantes (safe, IF NOT EXISTS)
-- Executer AVANT supabase_seed_demo.sql

ALTER TABLE classes
  ADD COLUMN IF NOT EXISTS section      text,
  ADD COLUMN IF NOT EXISTS current_year text;

ALTER TABLE subjects
  ADD COLUMN IF NOT EXISTS max integer NOT NULL DEFAULT 20;

ALTER TABLE students
  ADD COLUMN IF NOT EXISTS matricule      text,
  ADD COLUMN IF NOT EXISTS gender         text,
  ADD COLUMN IF NOT EXISTS date_naissance date;

-- colonne reg NOT NULL sans defaut — on lui donne un defaut vide
ALTER TABLE students ALTER COLUMN reg SET DEFAULT '';

-- Contrainte gender : remplace l'ancienne par une qui accepte les valeurs francaises
ALTER TABLE students DROP CONSTRAINT IF EXISTS students_gender_check;
ALTER TABLE students
  ADD CONSTRAINT students_gender_check
  CHECK (gender IN ('Masculin', 'Feminin', 'M', 'F', 'Autre'));

-- seq_idx renomme en sequence (ce que l'app attend)
ALTER TABLE grades DROP COLUMN IF EXISTS sequence;
ALTER TABLE grades RENAME COLUMN seq_idx TO sequence;
