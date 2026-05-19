-- ─── Sprint 33 : Onboarding wizard ──────────────────────────────────────────
-- Run in Supabase SQL Editor

-- 1. Add column — all existing schools default to true (already onboarded)
ALTER TABLE public.schools
ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT true;

-- 2. New schools created after this migration will need onboarding
--    Change the default to false so new signups trigger the wizard
ALTER TABLE public.schools
ALTER COLUMN onboarding_completed SET DEFAULT false;
