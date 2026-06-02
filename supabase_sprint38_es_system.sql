-- Sprint 38 — Système éducatif équato-guinéen (ES)
--
-- Autorise la valeur 'ES' dans la colonne `system` de la table `classes`
-- (notes /10, 3 trimestres officiels, apreciaciones Sobresaliente/Notable/Bien/
-- Suficiente/Insuficiente, seuil de réussite 5/10).
--
-- À exécuter une seule fois dans Supabase (SQL editor).

-- 1. Mise à jour de la contrainte CHECK sur classes.system pour accepter 'ES'.
alter table public.classes
  drop constraint if exists classes_system_check;

alter table public.classes
  add constraint classes_system_check
  check (system in ('FR', 'EN', 'ES'));

-- 2. Mise à jour défaut (optionnel — laisser FR par défaut pour ne pas casser
-- les nouvelles classes camerounaises créées hors form).
-- alter table public.classes alter column system set default 'FR';

-- 3. Index pour requêtes filtrées par système.
create index if not exists idx_classes_system
  on public.classes (system);
