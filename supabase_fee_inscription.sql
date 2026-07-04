-- ════════════════════════════════════════════════════════════════════════════
-- FRAIS D'INSCRIPTION par classe
-- ════════════════════════════════════════════════════════════════════════════
-- Ajoute un montant de frais d'inscription à la grille tarifaire de chaque classe.
-- Ces frais sont facturés EN PLUS de la scolarité (comptant ou échelonné), une
-- seule fois, aux seuls élèves « nouveaux dans l'établissement »
-- (students.statut = 'nouveau_etablissement'). Voir inscriptionApplies() côté app.
--
-- Idempotent : réexécutable sans risque.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.class_fee_grids
  ADD COLUMN IF NOT EXISTS amount_inscription integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.class_fee_grids.amount_inscription IS
  'Frais d''inscription facturés en plus de la scolarité aux élèves nouveaux dans l''établissement.';

-- Statut ÉTABLISSEMENT de l'élève (dimension indépendante du statut de classe) :
-- 'nouveau' ⇒ frais d'inscription dus ; 'ancien' ⇒ non. Permet « nouveau dans
-- l'établissement » ET « redoublant » simultanément.
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS statut_etablissement text;

COMMENT ON COLUMN public.students.statut_etablissement IS
  'Nouveau/ancien dans l''établissement — pilote les frais d''inscription (indépendant de students.statut).';
