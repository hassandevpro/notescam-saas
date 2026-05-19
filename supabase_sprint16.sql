-- Sprint 16 — Classes & Matières améliorés
-- Exécuter dans l'éditeur SQL de Supabase

-- 1. Effectif maximum sur les classes
ALTER TABLE classes
  ADD COLUMN IF NOT EXISTS max_students INTEGER;

-- 2. Catégorie sur les matières (référence libre vers subject_categories.id)
ALTER TABLE subjects
  ADD COLUMN IF NOT EXISTS category_id TEXT;

-- 3. Catégories de matières personnalisées sur l'école
ALTER TABLE schools
  ADD COLUMN IF NOT EXISTS subject_categories JSONB DEFAULT '[]'::jsonb;
