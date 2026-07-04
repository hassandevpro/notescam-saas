-- ════════════════════════════════════════════════════════════════════════════
-- DEVISE DE L'ÉTABLISSEMENT (multi-devises)
-- ════════════════════════════════════════════════════════════════════════════
-- Devise officielle de l'école, utilisée à l'AFFICHAGE de toutes les sommes
-- (frais, paiements, reçus, rapports, exports). Les montants restent stockés
-- bruts : changer la devise n'altère jamais les montants historiques.
--
-- Liste des devises gérée côté app (src/lib/currency.js) — extensible sans
-- migration. Défaut 'XAF' (Franc CFA Afrique Centrale) = comportement actuel.
--
-- À exécuter UNE fois dans Supabase → SQL Editor. Le LAN se migre seul.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'XAF';

COMMENT ON COLUMN public.schools.currency IS
  'Devise officielle de l''établissement (code ISO 4217 : XAF, XOF, EUR, USD…). Affichage uniquement.';
