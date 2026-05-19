-- Fix gender check — DROP d'abord, UPDATE ensuite, ADD à la fin

-- 1. Supprimer l'ancienne contrainte restrictive
ALTER TABLE students DROP CONSTRAINT IF EXISTS students_gender_check;

-- 2. Normaliser toutes les valeurs existantes
UPDATE students
SET gender = CASE
  WHEN lower(gender) IN ('m', 'male', 'masculin', 'garçon', 'garcon', 'h', 'homme') THEN 'Masculin'
  WHEN lower(gender) IN ('f', 'female', 'féminin', 'feminin', 'fille', 'femme')     THEN 'Féminin'
  ELSE NULL
END
WHERE gender IS NOT NULL;

-- 3. Recréer la contrainte avec les valeurs françaises
ALTER TABLE students
  ADD CONSTRAINT students_gender_check
  CHECK (gender IS NULL OR gender IN ('Masculin', 'Féminin'));
