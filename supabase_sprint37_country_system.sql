-- Sprint 37 — Système éducatif multi-pays
--
-- Ajoute la colonne `country_system` sur schools pour distinguer les modules
-- pays sans casser l'existant. Les valeurs possibles sont : 'cameroon_fr',
-- 'cameroon_en', 'guinea_eq' (et d'autres pays futurs).
--
-- À exécuter une seule fois dans Supabase (SQL editor).

-- 1. Colonne avec valeur par défaut pour les anciennes écoles.
alter table public.schools
  add column if not exists country_system text;

-- 2. Initialisation rétro-active depuis le champ `language` existant.
update public.schools
   set country_system = case
        when country_system is not null then country_system
        when language = 'anglophone'     then 'cameroon_en'
        when language = 'francophone'    then 'cameroon_fr'
        when language = 'bilingue'       then 'cameroon_fr'
        else 'cameroon_fr'
   end
 where country_system is null;

-- 3. Garde-fou : seules les valeurs reconnues sont autorisées.
alter table public.schools
  drop constraint if exists schools_country_system_chk;
alter table public.schools
  add  constraint schools_country_system_chk
       check (country_system in (
         'cameroon_fr','cameroon_en','guinea_eq',
         'gabon','congo','tchad','rca','senegal'  -- pays prévus ; à étendre librement
       ));

-- 4. Index simple pour les futurs filtres multi-tenant par système.
create index if not exists idx_schools_country_system
  on public.schools (country_system);

-- 5. Vue facultative pour le SuperAdmin.
create or replace view public.v_schools_by_system as
  select country_system, count(*) as nb_schools
    from public.schools
   group by country_system
   order by nb_schools desc;
