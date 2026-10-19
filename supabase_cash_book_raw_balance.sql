-- ════════════════════════════════════════════════════════════════════════════
-- NotesCam — BALANCE SOURCE ILLISIBLE : la conserver au lieu de la perdre
-- À coller dans : Supabase → SQL Editor → New query → Run. Idempotent.
-- Requiert : supabase_cash_book.sql.
-- Miroir LAN : server/schema.sql + server/db.js (ensureColumn).
-- ════════════════════════════════════════════════════════════════════════════
--
-- LE DÉFAUT CORRIGÉ. `source_balance` est un `bigint` : il ne peut recevoir
-- qu'un nombre. L'importateur n'y écrivait donc la balance du document que si
-- elle était DÉJÀ numérique, et laissait NULL sinon — sans rien dire.
--
-- Conséquence observée sur la reprise du 18/10/2026 : le cahier du primaire
-- porte, pour le bloc du 15/08, la balance « 254 08 » (du TEXTE : il manque un
-- chiffre, le solde recalculé valant 254 080). Les sept lignes du bloc sont
-- entrées en base avec `source_balance = NULL`. L'information « le document est
-- incohérent ici » a donc disparu, et l'écran de caisse ne pouvait rien
-- signaler : le contrôle d'écart ignore les lignes sans balance source.
--
-- CE QUE CETTE MIGRATION FAIT. Elle ajoute UNE colonne texte par table, qui
-- conserve la balance du document TELLE QU'ELLE EST ÉCRITE. Rien n'est converti,
-- rien n'est deviné : « 254 08 » reste « 254 08 ». La valeur numérique validée
-- garde sa colonne à elle (`source_balance`), et reste NULL tant qu'un humain
-- n'a pas tranché. Les deux informations cessent ainsi d'être confondues :
--
--   source_balance_raw = '254 08'   ← ce que le document dit
--   source_balance     =  NULL      ← ce qui a été validé (rien, pour l'instant)
--
-- POURQUOI PAS UNE CONVERSION AUTOMATIQUE. Lire « 254 08 » comme 25408 est une
-- interprétation parmi d'autres (254 080 est bien plus probable au vu du solde
-- recalculé). Inscrire 25408 en base ferait apparaître un écart de 228 672 dont
-- l'origine serait une décision de la machine, pas une donnée de l'école.
--
-- RETOUR ARRIÈRE. Deux instructions, sans perte d'autre chose que la colonne
-- ajoutée :
--   ALTER TABLE public.cash_movements  DROP COLUMN IF EXISTS source_balance_raw;
--   ALTER TABLE public.budget_expenses DROP COLUMN IF EXISTS source_balance_raw;
-- Aucune donnée existante n'est modifiée par cette migration : la retirer
-- ramène exactement à l'état d'avant.

ALTER TABLE public.cash_movements  ADD COLUMN IF NOT EXISTS source_balance_raw text;
ALTER TABLE public.budget_expenses ADD COLUMN IF NOT EXISTS source_balance_raw text;

COMMENT ON COLUMN public.cash_movements.source_balance_raw IS
  'Balance du document d''origine TELLE QU''ÉCRITE, y compris illisible (ex. « 254 08 »). Jamais convertie. source_balance porte la valeur numérique validée, ou NULL si aucune.';
COMMENT ON COLUMN public.budget_expenses.source_balance_raw IS
  'Idem : valeur brute du document. Une valeur ici avec source_balance NULL = ligne EN ATTENTE de validation humaine.';

-- Retrouver les lignes à valider : brute présente, numérique absente.
CREATE INDEX IF NOT EXISTS cash_movements_balance_a_valider_idx
  ON public.cash_movements (school_id)
  WHERE source_balance_raw IS NOT NULL AND source_balance IS NULL;
CREATE INDEX IF NOT EXISTS budget_expenses_balance_a_valider_idx
  ON public.budget_expenses (school_id)
  WHERE source_balance_raw IS NOT NULL AND source_balance IS NULL;


-- ── VÉRIFICATION ────────────────────────────────────────────────────────────
DO $$
DECLARE n int; n_valider int;
BEGIN
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_schema = 'public' AND column_name = 'source_balance_raw'
     AND table_name IN ('cash_movements', 'budget_expenses');
  RAISE NOTICE 'source_balance_raw : % / 2 tables', n;

  SELECT count(*) INTO n_valider FROM public.budget_expenses
   WHERE source_balance_raw IS NOT NULL AND source_balance IS NULL;
  RAISE NOTICE 'dépenses dont la balance source attend une validation : %', n_valider;
  RAISE NOTICE 'Cette migration ne remplit RIEN : seule une reprise relancée renseignera la colonne.';
END $$;
