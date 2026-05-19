-- Sprint 24 — Fix contrainte gender (SQL sans caracteres accentues)
-- Executer dans Supabase SQL Editor

-- 1. Supprimer toute contrainte gender existante
ALTER TABLE students DROP CONSTRAINT IF EXISTS students_gender_check;

-- 2. Normaliser les valeurs existantes (sans accent dans le SQL)
--    Masculin : commence par 'm'
--    Feminin  : commence par 'f'
UPDATE students
SET gender = CASE
  WHEN lower(left(gender, 1)) = 'm' THEN 'Masculin'
  WHEN lower(left(gender, 1)) = 'f' THEN 'Feminin'
  ELSE NULL
END
WHERE gender IS NOT NULL;

-- 3. Recreer la contrainte sans accent (evite tout probleme d'encodage)
ALTER TABLE students
  ADD CONSTRAINT students_gender_check
  CHECK (gender IS NULL OR gender IN ('Masculin', 'Feminin'));
