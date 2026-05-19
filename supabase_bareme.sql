-- Ajout de la colonne grade_scale dans la table schools
-- Stocke le barème de notation sous forme de tableau JSON
-- Format: [{ id, mention, min, max, couleur, ordre }]

ALTER TABLE schools
  ADD COLUMN IF NOT EXISTS grade_scale JSONB DEFAULT '[]'::jsonb;
