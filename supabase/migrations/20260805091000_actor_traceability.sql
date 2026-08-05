-- ════════════════════════════════════════════════════════════════════════════
-- TRAÇABILITÉ DE L'AUTEUR — inscription d'un élève & encaissement d'un versement
-- ════════════════════════════════════════════════════════════════════════════
-- « Qui a fait ça ? » sur les deux gestes qui engagent l'argent et l'effectif :
--   • students.created_by / created_by_name  → qui a inscrit l'élève
--   • fee_payments.recorded_by / _name       → qui a encaissé le versement
--
-- Deux colonnes et non une : l'ID sert aux jointures/audits, le NOM est FIGÉ au
-- moment du geste. Un reçu réimprimé trois ans plus tard doit porter le caissier
-- d'origine — même si ce compte a été renommé, changé de rôle ou supprimé.
--
-- PARITÉ DE SCHÉMA OBLIGATOIRE : ces colonnes existent aussi côté LAN
-- (server/schema.sql + ensureColumn dans server/db.js). Une colonne présente en
-- LAN mais absente ici fait rejeter l'upsert sync-push pour TOUTE la table —
-- les paiements LAN ne remonteraient plus au Cloud. Exécuter cette migration
-- AVANT de déployer la version applicative correspondante.
--
-- Idempotent : réexécutable sans risque.
-- ════════════════════════════════════════════════════════════════════════════

-- --- Inscription d'un élève ------------------------------------------------
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS created_by      text,
  ADD COLUMN IF NOT EXISTS created_by_name text;

COMMENT ON COLUMN public.students.created_by IS
  'Compte ayant inscrit l''élève (school_users.id / auth uid). NULL = inscription antérieure à la traçabilité.';
COMMENT ON COLUMN public.students.created_by_name IS
  'Nom de l''auteur de l''inscription, figé au moment du geste (survit au renommage/suppression du compte).';

-- --- Encaissement d'un versement -------------------------------------------
-- `recorded_by` peut déjà exister (l'app l'écrivait) : ADD COLUMN IF NOT EXISTS
-- le laisse alors intact.
ALTER TABLE public.fee_payments
  ADD COLUMN IF NOT EXISTS recorded_by      text,
  ADD COLUMN IF NOT EXISTS recorded_by_name text;

COMMENT ON COLUMN public.fee_payments.recorded_by IS
  'Compte ayant encaissé le versement (school_users.id / auth uid). NULL = encaissement antérieur à la traçabilité.';
COMMENT ON COLUMN public.fee_payments.recorded_by_name IS
  'Nom du caissier, figé à l''encaissement — c''est CE nom qu''imprime le reçu, jamais celui de l''utilisateur qui réimprime.';

-- --- Consultation ----------------------------------------------------------
-- Un versement se relit toujours par élève ; l'index par caissier sert aux
-- contrôles de caisse (« tous les encaissements de X sur la journée »).
CREATE INDEX IF NOT EXISTS idx_fee_payments_recorded_by
  ON public.fee_payments (school_id, recorded_by, date);
