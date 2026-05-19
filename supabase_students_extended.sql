-- Extension du modèle élève : champs famille, naissance, adresse
-- À exécuter dans Supabase SQL Editor

ALTER TABLE students
  ADD COLUMN IF NOT EXISTS lieu_naissance  TEXT,
  ADD COLUMN IF NOT EXISTS adresse         TEXT,
  ADD COLUMN IF NOT EXISTS contact_urgence TEXT,
  ADD COLUMN IF NOT EXISTS nom_pere        TEXT,
  ADD COLUMN IF NOT EXISTS profession_pere TEXT,
  ADD COLUMN IF NOT EXISTS nom_mere        TEXT,
  ADD COLUMN IF NOT EXISTS profession_mere TEXT,
  ADD COLUMN IF NOT EXISTS tuteur          TEXT;
