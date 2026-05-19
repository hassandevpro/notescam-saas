-- ============================================================
-- NotesCam — Colonnes manquantes sur la table schools
-- À coller dans : Supabase → SQL Editor → New query → Run
-- ============================================================

ALTER TABLE schools
  ADD COLUMN IF NOT EXISTS division      text,
  ADD COLUMN IF NOT EXISTS subdivision   text,
  ADD COLUMN IF NOT EXISTS address       text,
  ADD COLUMN IF NOT EXISTS phone         text,
  ADD COLUMN IF NOT EXISTS logo_url      text,
  ADD COLUMN IF NOT EXISTS stamp_url     text,
  ADD COLUMN IF NOT EXISTS signature_url text;
