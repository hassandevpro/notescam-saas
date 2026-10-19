-- supabase_sync_signalements.sql
-- Rattache `signalements` au périmètre de la synchronisation continue LAN ↔ Cloud,
-- et unifie la convention de nom de ses déclencheurs.
--
-- LE DÉFAUT QUE CECI ACCOMPAGNE
-- `signalements` figurait depuis l'origine dans SYNCED_TABLES côté LAN (server/db.js) :
-- toute écriture locale alimentait donc l'outbox et partait au Cloud… où `sync-push`
-- l'écartait en silence, la table étant absente de sa liste blanche
-- (`if (!ALLOWED.has(ch.table)) continue`). Dans l'autre sens, `signalements` manquait
-- de PULL_ORDER alors que ses deux ENFANTS — `signalement_comments` et
-- `signalement_history` — y étaient : un commentaire distant descendait donc vers un
-- signalement inexistant en LAN, et échouait sur sa clé étrangère à chaque cycle.
--
-- Le module ne traversait en réalité dans AUCUN sens, sans le moindre message.
--
-- L'essentiel du correctif est CÔTÉ CODE (les cinq listes : SYNCED_TABLES, PULL_ORDER,
-- sync-push, sync-pull, sync-verify/repair). Ce fichier ne fait que du ménage SQL.
--
-- CE QU'IL RESTE À FAIRE ICI
-- `supabase_signalement.sql` posait déjà les deux déclencheurs de réplication, mais
-- sous une convention de nom PROPRE À CE MODULE (`trg_signalements_touch` /
-- `trg_signalements_tombstone`), alors que toutes les autres tables répliquées suivent
-- celle de `supabase_sync_phase2.sql` (`trg_touch_<table>` / `trg_tomb_<table>`).
--
-- Conséquence : une première version de ce fichier, qui créait aveuglément la paire
-- « phase 2 », a produit QUATRE déclencheurs sur la table. Sans dommage — les deux
-- `touch_sync_row` lisent `COALESCE(OLD.version,0)+1`, donc calculent la MÊME valeur
-- (la version avance de 1, pas de 2 : aucune divergence de Merkle), et les deux
-- `log_tombstone` s'écrasent par `ON CONFLICT DO UPDATE`. Mais c'est deux fois le
-- travail à chaque écriture, et un piège pour qui lira la table plus tard.
--
-- On garde donc la convention commune et on retire la paire spécifique au module.
--
-- Additive et idempotente : relançable sans effet de bord. Aucune donnée n'est touchée ;
-- les seuls DROP portent sur des déclencheurs STRICTEMENT redondants, recréés à
-- l'identique sous leur nom commun juste en dessous.
-- À coller dans Supabase → SQL Editor → Run.

DO $$
BEGIN
  IF to_regclass('public.signalements') IS NULL THEN
    RAISE NOTICE 'public.signalements absente — rien à faire.';
    RETURN;
  END IF;

  -- Filet : la table est censée déjà porter les colonnes de synchro.
  ALTER TABLE public.signalements ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
  ALTER TABLE public.signalements ADD COLUMN IF NOT EXISTS version    integer     NOT NULL DEFAULT 1;
  ALTER TABLE public.signalements ADD COLUMN IF NOT EXISTS device_id  text;

  -- Paire au nom spécifique au module (supabase_signalement.sql) : redondante.
  DROP TRIGGER IF EXISTS trg_signalements_touch     ON public.signalements;
  DROP TRIGGER IF EXISTS trg_signalements_tombstone ON public.signalements;

  -- Convention commune à toutes les tables répliquées (supabase_sync_phase2.sql).
  DROP TRIGGER IF EXISTS trg_touch_signalements ON public.signalements;
  CREATE TRIGGER trg_touch_signalements BEFORE UPDATE ON public.signalements
    FOR EACH ROW EXECUTE FUNCTION public.touch_sync_row();

  DROP TRIGGER IF EXISTS trg_tomb_signalements ON public.signalements;
  CREATE TRIGGER trg_tomb_signalements AFTER DELETE ON public.signalements
    FOR EACH ROW EXECUTE FUNCTION public.log_tombstone();
END $$;

-- Contrôle : EXACTEMENT deux déclencheurs doivent rester, aux noms communs.
SELECT tgname FROM pg_trigger
 WHERE tgrelid = 'public.signalements'::regclass AND NOT tgisinternal
 ORDER BY tgname;
