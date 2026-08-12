-- ============================================================
-- NotesCam — Bulletin de paie : décompte des jours + taille de police
-- À coller dans : Supabase → SQL Editor → New query → Run. Idempotent.
-- Requiert supabase_hr_payroll.sql + supabase_hr_payroll_catalog.sql.
-- ============================================================
--
-- `worked_days` reproduit le décompte « 30,00 j × 2 500,00 » de la ligne
-- SALAIRE DE BASE du bulletin légal (le taux journalier en découle :
-- salaire de base ÷ jours, calculé à l'affichage, jamais stocké).
-- `payslip_font_size` : taille d'impression du bulletin, choisie par
-- l'établissement (small|normal|large|xlarge ; NULL = normal).

ALTER TABLE public.hr_payroll ADD COLUMN IF NOT EXISTS worked_days numeric;
ALTER TABLE public.schools    ADD COLUMN IF NOT EXISTS payslip_font_size text;
