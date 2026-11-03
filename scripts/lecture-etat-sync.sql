-- ÉTAT DE LA SYNCHRO, ÉCOLE PAR ÉCOLE — LECTURE SEULE.
--
-- À lancer avec l'outil existant, qui n'exécute rien d'autre que ce fichier :
--   node scripts/apply-cloud-sql.mjs --read scripts/lecture-etat-sync.sql
--
-- Ce fichier n'est PAS une migration : il ne crée, ne modifie et ne supprime
-- rien. Il ne porte donc pas le préfixe `supabase_`, réservé dans ce dépôt à
-- l'historique réel des migrations appliquées en production.
--
-- ── CE QUE CHAQUE COLONNE DIT ──────────────────────────────────────────────
--
-- `dernier_tirage` vient de `sync_client_state.last_pull_at`, écrit par la
-- fonction `sync-pull` À CHAQUE descente réussie. C'est la seule trace qu'un
-- serveur d'école laisse dans le Cloud : si elle date d'hier, l'école n'a pas
-- synchronisé depuis hier, point.
--
-- `depuis` est l'âge de ce tirage. C'est la colonne à lire en premier.
--
-- `curseur_tombes` (`tomb_cursor`) est la borne de suppressions CONFIRMÉE
-- consommée par le LAN. Un curseur très en retard sur `dernier_tirage` signale
-- un serveur qui tire mais ne consomme pas les suppressions.
--
-- `tirages` (`pull_count`) compte les descentes depuis toujours. Comparé entre
-- deux lectures à quelques minutes d'intervalle, il dit si la synchro TOURNE
-- maintenant, pas seulement si elle a tourné un jour.
--
-- `dernier_evenement` et `suppressions_24h` regardent le sens INVERSE
-- (école → Cloud) : si une école pousse, des lignes y apparaissent.
--
-- ── LE PIÈGE À CONNAÎTRE ───────────────────────────────────────────────────
--
-- Dans `syncOnce` (server/cloudSync.js), le pull est joué AVANT le push, et un
-- échec de pull interrompt le cycle. Une école dont `dernier_tirage` est vieux
-- n'a donc pas DEUX pannes (« rien ne descend » + « rien ne remonte ») : elle
-- en a UNE, à la descente. Chercher la cause côté pull d'abord.
--
-- Une école SANS LIGNE dans `sync_client_state` (NULL partout) n'a jamais
-- réussi une seule descente — ce n'est pas la même chose qu'une école en
-- retard, et ce n'est pas forcément une panne : une école qui travaille dans
-- le navigateur n'a pas de serveur LAN et n'apparaîtra jamais ici.

SELECT
  s.name                                                   AS ecole,
  cs.last_pull_at                                          AS dernier_tirage,
  CASE
    WHEN cs.last_pull_at IS NULL THEN 'JAMAIS'
    ELSE date_trunc('second', now() - cs.last_pull_at)::text
  END                                                      AS depuis,
  COALESCE(cs.pull_count, 0)                               AS tirages,
  cs.tomb_cursor                                           AS curseur_tombes,
  (SELECT max(de.occurred_at)
     FROM public.domain_events de
    WHERE de.school_id = s.id)                             AS dernier_evenement,
  (SELECT count(*)
     FROM public.sync_tombstones t
    WHERE t.school_id = s.id
      AND t.deleted_at > now() - interval '24 hours')      AS suppressions_24h,
  CASE
    WHEN cs.last_pull_at IS NULL                          THEN 'jamais synchronisee (serveur LAN absent ?)'
    WHEN cs.last_pull_at > now() - interval '30 minutes'  THEN 'a jour'
    WHEN cs.last_pull_at > now() - interval '6 hours'      THEN 'en retard'
    ELSE                                                        'DECROCHEE'
  END                                                      AS verdict
FROM public.schools s
LEFT JOIN public.sync_client_state cs ON cs.school_id = s.id
ORDER BY cs.last_pull_at DESC NULLS LAST, s.name;
