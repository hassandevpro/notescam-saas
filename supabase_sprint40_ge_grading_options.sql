-- Sprint 40 — Options de notation Guinée Équatoriale (décidées par l'admin)
--
-- 1. ge_grade_max     : échelle de notation choisie pour l'école GE (10 ou 20).
-- 2. ge_primary_coef  : true => coefficients utilisés au primaire ; false (défaut)
--                       => toutes les matières du primaire ont le même poids.
--
-- 100 % additif. Défauts = comportement actuel (/10, primaire sans coef) :
-- aucune école existante n'est impactée.
--
-- À exécuter une seule fois dans Supabase (SQL editor).

alter table public.schools
  add column if not exists ge_grade_max integer not null default 10;

alter table public.schools
  add column if not exists ge_primary_coef boolean not null default false;

-- Garde-fou : seules les valeurs 10 ou 20 sont autorisées.
alter table public.schools
  drop constraint if exists schools_ge_grade_max_chk;
alter table public.schools
  add  constraint schools_ge_grade_max_chk check (ge_grade_max in (10, 20));
