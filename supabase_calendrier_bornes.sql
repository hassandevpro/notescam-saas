-- NotesCam — début et fin de chaque période (calendrier scolaire).
-- STATUT : PRÊT, **NON APPLIQUÉ** (autorisation explicite requise, sauvegarde d'abord).
-- Additif : deux colonnes NULLables, aucune donnée touchée, aucune règle modifiée.
-- ORDRE : à appliquer AVANT de livrer un paquet LAN qui porte ces colonnes — la synchro
-- LAN→Cloud enverrait sinon start_date/end_date à une table qui ne les connaît pas.
-- Le client web, lui, retombe sur l'ancien enregistrement si les colonnes manquent.
-- Retour arrière : supabase_calendrier_bornes_rollback.sql
ALTER TABLE public.sequence_dates ADD COLUMN IF NOT EXISTS start_date date;
ALTER TABLE public.sequence_dates ADD COLUMN IF NOT EXISTS end_date   date;
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS calendar_confirmed_at timestamptz;
