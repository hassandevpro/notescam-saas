-- ============================================================================
-- NotesCam — PURGE DES TOMBSTONES (audit 2026-08-03, point §9)
--
-- PROBLÈME : `sync_tombstones` grossit sans limite. Mesuré le 2026-08-03 :
--   16 113 lignes pour 4 écoles seulement, du 2026-06-19 au 2026-08-01
--   → ~35 000 tombstones / école / an → ~3,5 M de lignes à 100 écoles.
--   C'est déjà la 2e table du projet en volume, devant `students`.
--
-- POURQUOI UNE SIMPLE PURGE PAR DATE EST DANGEREUSE
--   Un tombstone est la SEULE trace qu'une ligne a été supprimée au Cloud.
--   Le serveur LAN apprend les suppressions via `tomb_since` (son curseur local).
--   Si on purge un tombstone qu'un LAN n'a pas encore consommé :
--     1. le LAN ne saura JAMAIS que la ligne est supprimée ;
--     2. il a toujours la ligne en base locale ;
--     3. au prochain push il la REMONTE au Cloud → la ligne RESSUSCITE.
--   C'est exactement la famille de bug déjà rencontrée sur La Réussite
--   (purge locale sans vidage de sync_outbox → 421 notes supprimées au Cloud).
--
--   Or le Cloud ne sait PAS où en est chaque LAN : `school_server_tokens` ne
--   contient que (school_id, token_hash, created_at, revoked_at). Le curseur
--   `tomb_at` vit UNIQUEMENT côté LAN. Une purge « > 30 jours » serait donc
--   une purge à l'aveugle.
--
-- SOLUTION EN 3 TEMPS
--   1. sync-pull ENREGISTRE, à chaque appel, le curseur que le LAN lui ENVOIE
--      (= ce que le LAN a prouvé avoir consommé) dans `sync_client_state`.
--   2. La purge ne descend JAMAIS en dessous de ce curseur confirmé, ni en
--      dessous d'un plancher de rétention (30 j par défaut).
--   3. sync-pull REFUSE de servir un LAN dont le curseur est antérieur à ce qui
--      a été purgé (`rebuild_required`) : il ne peut plus être remis à niveau
--      par un pull incrémental, il doit être reconstruit depuis le Cloud.
--
-- ⚠ ORDRE DE DÉPLOIEMENT IMPOSÉ
--   a) exécuter CE fichier ;
--   b) déployer la version patchée de sync-pull (`supabase functions deploy sync-pull`) ;
--   c) laisser TOURNER quelques jours : la purge est INERTE tant qu'une école
--      n'a pas de ligne dans `sync_client_state` (on ne purge jamais une école
--      dont on ignore la position) ;
--   d) seulement ensuite, activer la planification pg_cron (PARTIE 6).
--   Inverser (b) et (a) est sans risque ; activer (d) trop tôt ne fait rien —
--   la fonction refusera simplement de purger. Rien n'est irréversible.
--
-- IDEMPOTENT — rejouable.
-- ============================================================================


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ PARTIE 1 — Position confirmée de chaque serveur LAN                       ║
-- ║                                                                          ║
-- ║ On enregistre le curseur que le client ENVOIE, jamais celui qu'on lui     ║
-- ║ renvoie : si le LAN plante avant d'avoir persisté la réponse, le Cloud    ║
-- ║ le croirait à tort plus avancé qu'il ne l'est → purge prématurée.         ║
-- ║ Le curseur reçu, lui, est une PREUVE de ce qui a déjà été appliqué.       ║
-- ║                                                                          ║
-- ║ Granularité = école : l'architecture prévoit un jeton (donc un serveur    ║
-- ║ LAN) par école — cf. school_server_tokens.                                ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS public.sync_client_state (
  school_id     uuid PRIMARY KEY REFERENCES public.schools(id) ON DELETE CASCADE,
  -- Dernier `tomb_since` reçu = borne CONFIRMÉE consommée par le LAN.
  tomb_cursor   timestamptz,
  last_pull_at  timestamptz NOT NULL DEFAULT now(),
  pull_count    bigint      NOT NULL DEFAULT 0
);

COMMENT ON TABLE public.sync_client_state IS
  'Position de synchro confirmée par chaque serveur LAN. Alimentée par sync-pull. '
  'tomb_cursor = dernier tomb_since REÇU (preuve de consommation), jamais celui renvoyé.';

-- Service_role uniquement (edge functions). RLS active sans policy = tout fermé.
ALTER TABLE public.sync_client_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sync_client_state FROM anon, authenticated;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ PARTIE 2 — Filigrane de purge par école                                   ║
-- ║ Mémorise jusqu'où on a purgé, pour que sync-pull puisse détecter un LAN   ║
-- ║ irrécupérable (curseur antérieur à la purge).                             ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS public.sync_tombstone_gc (
  school_id     uuid PRIMARY KEY REFERENCES public.schools(id) ON DELETE CASCADE,
  -- Tout tombstone `deleted_at <= purged_before` a été supprimé : un LAN dont le
  -- curseur est antérieur ne peut plus être rattrapé par un pull incrémental.
  purged_before timestamptz NOT NULL,
  purged_at     timestamptz NOT NULL DEFAULT now(),
  purged_total  bigint      NOT NULL DEFAULT 0
);

COMMENT ON TABLE public.sync_tombstone_gc IS
  'Filigrane de purge des tombstones. Un LAN dont tomb_since < purged_before a '
  'manqué des suppressions : sync-pull doit lui imposer une reconstruction.';

ALTER TABLE public.sync_tombstone_gc ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sync_tombstone_gc FROM anon, authenticated;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ PARTIE 3 — Index                                                          ║
-- ║ sync-pull filtre (school_id, deleted_at > curseur) et la purge fait de     ║
-- ║ même : sans cet index les deux dégénèrent en seq scan à 3,5 M de lignes.  ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE INDEX IF NOT EXISTS idx_sync_tombstones_school_deleted
  ON public.sync_tombstones (school_id, deleted_at);

ANALYZE public.sync_tombstones;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ PARTIE 4 — La fonction de purge                                           ║
-- ║                                                                          ║
-- ║ Pour CHAQUE école, la borne de purge est le MINIMUM de :                  ║
-- ║   • le curseur confirmé du LAN  (ne jamais dépasser ce qui est consommé)  ║
-- ║   • now() − rétention           (marge si le LAN plante juste après)      ║
-- ║                                                                          ║
-- ║ Une école SANS ligne dans sync_client_state n'est JAMAIS purgée : on      ║
-- ║ ignore sa position, donc on ne prend aucun risque. C'est ce qui rend la   ║
-- ║ fonction inerte tant que sync-pull patché n'est pas déployé.              ║
-- ║                                                                          ║
-- ║ `p_dry_run = true` (DÉFAUT) : ne supprime RIEN, renvoie seulement ce qui  ║
-- ║ serait purgé. Toujours commencer par là.                                  ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE OR REPLACE FUNCTION public.sync_tombstones_gc(
  p_retention_days int     DEFAULT 30,
  p_dry_run        boolean DEFAULT true
)
RETURNS TABLE (
  school_id   uuid,
  cutoff      timestamptz,
  purgeable   bigint,
  purged      bigint,
  raison      text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  r         record;
  v_cutoff  timestamptz;
  v_floor   timestamptz := now() - make_interval(days => greatest(p_retention_days, 1));
  v_count   bigint;
  v_deleted bigint;
BEGIN
  FOR r IN
    SELECT t.school_id AS sid,
           cs.tomb_cursor,
           count(*)     AS nb
      FROM public.sync_tombstones t
      LEFT JOIN public.sync_client_state cs ON cs.school_id = t.school_id
     GROUP BY t.school_id, cs.tomb_cursor
  LOOP
    -- Position du LAN inconnue → on ne purge pas. Jamais.
    IF r.tomb_cursor IS NULL THEN
      school_id := r.sid; cutoff := NULL; purgeable := 0; purged := 0;
      raison    := 'IGNORÉE — aucun pull enregistré (position du LAN inconnue)';
      RETURN NEXT;
      CONTINUE;
    END IF;

    -- Borne = le plus prudent des deux critères.
    v_cutoff := least(r.tomb_cursor, v_floor);

    SELECT count(*) INTO v_count
      FROM public.sync_tombstones
     WHERE sync_tombstones.school_id = r.sid
       AND deleted_at <= v_cutoff;

    IF v_count = 0 THEN
      school_id := r.sid; cutoff := v_cutoff; purgeable := 0; purged := 0;
      raison    := 'RIEN À PURGER';
      RETURN NEXT;
      CONTINUE;
    END IF;

    IF p_dry_run THEN
      school_id := r.sid; cutoff := v_cutoff; purgeable := v_count; purged := 0;
      raison    := format('SIMULATION — %s lignes purgeables (curseur LAN %s, plancher %s)',
                          v_count, r.tomb_cursor, v_floor);
      RETURN NEXT;
      CONTINUE;
    END IF;

    DELETE FROM public.sync_tombstones
     WHERE sync_tombstones.school_id = r.sid
       AND deleted_at <= v_cutoff;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;

    -- Filigrane : ne recule JAMAIS (greatest), sinon on rouvrirait la fenêtre
    -- de résurrection pour un LAN déjà déclaré irrécupérable.
    INSERT INTO public.sync_tombstone_gc AS g (school_id, purged_before, purged_at, purged_total)
    VALUES (r.sid, v_cutoff, now(), v_deleted)
    ON CONFLICT (school_id) DO UPDATE
      SET purged_before = greatest(g.purged_before, EXCLUDED.purged_before),
          purged_at     = now(),
          purged_total  = g.purged_total + EXCLUDED.purged_total;

    school_id := r.sid; cutoff := v_cutoff; purgeable := v_count; purged := v_deleted;
    raison    := 'PURGÉE';
    RETURN NEXT;
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public.sync_tombstones_gc(int, boolean) FROM anon, authenticated;

COMMENT ON FUNCTION public.sync_tombstones_gc(int, boolean) IS
  'Purge les tombstones consommés par le LAN. Ne descend jamais sous le curseur '
  'confirmé ni sous le plancher de rétention. Ignore les écoles sans pull connu. '
  'p_dry_run=true par défaut.';


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ PARTIE 5 — Vue de supervision                                             ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE OR REPLACE VIEW public.v_sync_tombstone_health
WITH (security_invoker = true) AS
SELECT s.id                                   AS school_id,
       s.name                                 AS ecole,
       count(t.*)                             AS tombstones,
       min(t.deleted_at)                      AS plus_ancien,
       max(t.deleted_at)                      AS plus_recent,
       cs.tomb_cursor                         AS curseur_lan,
       cs.last_pull_at                        AS dernier_pull,
       gc.purged_before                       AS purge_jusqu_a,
       gc.purged_total                        AS deja_purge,
       CASE
         WHEN cs.school_id IS NULL              THEN 'jamais synchronisé'
         WHEN cs.last_pull_at < now() - interval '7 days'
                                                THEN 'LAN en retard (>7 j)'
         WHEN gc.purged_before IS NOT NULL
          AND cs.tomb_cursor < gc.purged_before THEN 'RECONSTRUCTION REQUISE'
         ELSE 'ok'
       END                                    AS etat
  FROM public.schools s
  LEFT JOIN public.sync_tombstones   t  ON t.school_id  = s.id
  LEFT JOIN public.sync_client_state cs ON cs.school_id = s.id
  LEFT JOIN public.sync_tombstone_gc gc ON gc.school_id = s.id
 GROUP BY s.id, s.name, cs.school_id, cs.tomb_cursor, cs.last_pull_at,
          gc.purged_before, gc.purged_total;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ PARTIE 6 — Planification (À N'ACTIVER QU'APRÈS VALIDATION)                ║
-- ║ Décommenter seulement quand :                                             ║
-- ║   • sync-pull patché est déployé,                                         ║
-- ║   • v_sync_tombstone_health montre des curseurs LAN à jour,                ║
-- ║   • un dry-run a donné un résultat cohérent.                              ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- CREATE EXTENSION IF NOT EXISTS pg_cron;   -- disponible (1.6.4), non installée
--
-- SELECT cron.schedule(
--   'notescam-tombstone-gc',
--   '30 3 * * 0',                                    -- dimanche 03h30 UTC
--   $$ SELECT public.sync_tombstones_gc(30, false) $$ -- 30 j, exécution réelle
-- );
--
-- Désactivation :  SELECT cron.unschedule('notescam-tombstone-gc');
-- Historique    :  SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;


-- ============================================================================
-- UTILISATION
-- ============================================================================
-- 1) SIMULATION (ne supprime rien) — à lancer en premier, toujours :
--      SELECT * FROM public.sync_tombstones_gc(30, true);
--
-- 2) État de santé par école :
--      SELECT * FROM public.v_sync_tombstone_health ORDER BY tombstones DESC;
--
-- 3) Purge réelle, une fois la simulation validée :
--      SELECT * FROM public.sync_tombstones_gc(30, false);
--
-- 4) Écoles à reconstruire (LAN trop en retard pour être rattrapé) :
--      SELECT ecole, curseur_lan, purge_jusqu_a FROM public.v_sync_tombstone_health
--       WHERE etat = 'RECONSTRUCTION REQUISE';
--
-- ============================================================================
-- LIMITE CONNUE — à ne pas oublier
-- ============================================================================
-- Un LAN qui a PERDU son curseur `tomb_at` mais CONSERVÉ ses données envoie
-- `tomb_since` vide. Le Cloud ne peut pas distinguer ce cas d'une installation
-- neuve, et lui renverra donc les tombstones restants seulement — pas ceux déjà
-- purgés. Les lignes supprimées avant la purge et encore présentes en local
-- pourraient alors ressusciter au push.
--   → Règle d'exploitation : une remise à zéro de LAN doit TOUJOURS être une
--     reconstruction complète depuis le Cloud (procédure Admin existante), et
--     jamais une simple suppression du fichier de curseurs.
--   → Cette règle est déjà celle appliquée sur La Réussite ; elle devient ici
--     une contrainte de correction, pas seulement une bonne pratique.
-- ============================================================================
