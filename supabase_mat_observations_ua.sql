-- LA MATERNELLE COTE PAR UNITÉ D'APPRENTISSAGE — `mat_observations.ua`
-- ============================================================================
-- DEMANDE DU RESPONSABLE (2026-11-01) :
--
--   « Aujourd'hui la maternelle saisit les notes par Trimestre 1, 2, 3. Elle
--     doit utiliser les mêmes critères que le primaire : UA1 à UA8. »
--     Trimestre 1 = UA1·UA2·UA3 · Trimestre 2 = UA4·UA5·UA6 · Trimestre 3 = UA7·UA8
--
-- L'identité d'une observation passe donc de (élève, domaine, TRIMESTRE) à
-- (élève, domaine, UA). C'est exactement la bascule que `prim_notes` a faite
-- avant elle, et ce fichier en reprend la forme.
--
-- ── CE QUI SE CASSERAIT SANS LE CHANGEMENT DE CLÉ ───────────────────────────
-- L'ancienne contrainte `UNIQUE (eleve_id, domaine_id, trimestre_id)` n'autorise
-- qu'UNE observation par trimestre. Or un trimestre compte jusqu'à TROIS UA :
-- la deuxième serait refusée par la base. Et le client, qui écrit en upsert sur
-- (élève, domaine, UA), recevrait « there is no unique or exclusion constraint
-- matching the ON CONFLICT specification » — la saisie repartirait en file à
-- chaque cycle, indéfiniment, sans que rien ne le dise à l'institutrice.
-- C'est le défaut vécu sur `prim_notes` le 2026-09-28 (8 écritures bloquées,
-- 25 tentatives pour la plus ancienne). On ne le refait pas une seconde fois.
--
-- ── `trimestre_id` RESTE, ET RESTE NOT NULL ─────────────────────────────────
-- Elle porte une clé étrangère vers `apc_trimestres`, qui ne compte que trois
-- lignes : on ne peut ni y écrire « ua5 » ni la vider. Elle est désormais
-- DÉRIVÉE de l'UA (ua<=3 → t1, <=6 → t2, sinon t3) et écrite par le client
-- (`matService.buildObsRecord`), jamais saisie — une incohérence UA/trimestre
-- est donc impossible. Tous les lecteurs par trimestre continuent de lire.
--
-- ── LES TROIS COLONNES D'HISTORIQUE ─────────────────────────────────────────
-- `ancienne_periode`, `ua_migre_le`, `ua_migre_par` sont exigées par la
-- procédure de migration dictée le 2026-11-01 : « conservation de la valeur et
-- de l'ancienne période […] pour pouvoir revenir en arrière ». Elles sont
-- renseignées par `scripts/migrer-maternelle-ua.mjs`, et vides pour toute
-- observation saisie directement sur une UA.
--
-- CE FICHIER NE DÉPLACE AUCUNE OBSERVATION. Il ouvre la place ; le rattachement
-- des observations déjà saisies (T1→UA1, T2→UA2) est un geste séparé, avec
-- audit préalable, dry-run, arbitrage des conflits et journal — et il attend
-- l'autorisation explicite du responsable.
--
-- ── ORDRE D'EXÉCUTION, ET LA FENÊTRE QU'IL FAUT CONNAÎTRE ───────────────────
--  1. CE SQL au Cloud ;
--  2. puis le déploiement de l'application (Vercel) ;
--  3. puis seulement la migration des données.
--
-- Entre 1 et 2, un onglet encore ouvert sur la version précédente écrit en
-- upsert sur l'ancienne clé, qui n'existe plus : son enregistrement échoue et
-- PART EN FILE HORS-LIGNE (`sendOrQueue`), d'où il repartira après rechargement.
-- Rien n'est perdu ; la fenêtre ne concerne que la saisie maternelle en cours.
-- L'inverse (déployer avant ce SQL) serait pire : le client écrirait une colonne
-- `ua` que le Cloud ignore, et PostgREST rejetterait la LIGNE ENTIÈRE (PGRST204).
--
-- ⛔ CONDITION DE DISTRIBUTION LAN. Un paquet LAN portant la colonne `ua` ne
-- doit PAS partir avant que ce SQL ait tourné au Cloud : `mat_observations` est
-- synchronisée et `sync-push` filtre les TABLES, pas les colonnes — une colonne
-- inconnue du Cloud fait rejeter la ligne entière. Même condition que
-- `supabase_bulletin_accent.sql`.
--
-- Additif, idempotent, réversible (cf. _rollback). À EXÉCUTER dans Supabase.
-- ============================================================================

-- 1) Les colonnes. `smallint` suffit (1-8) ; le CHECK est posé NOT VALID pour
--    que la migration ne puisse pas échouer sur un héritage (les lignes déjà en
--    base ont `ua IS NULL`, qui satisfait la règle).
ALTER TABLE public.mat_observations
  ADD COLUMN IF NOT EXISTS ua               smallint,
  ADD COLUMN IF NOT EXISTS ancienne_periode text,
  ADD COLUMN IF NOT EXISTS ua_migre_le      timestamptz,
  ADD COLUMN IF NOT EXISTS ua_migre_par     text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'mat_observations_ua_valide'
       AND conrelid = 'public.mat_observations'::regclass
  ) THEN
    ALTER TABLE public.mat_observations
      ADD CONSTRAINT mat_observations_ua_valide
      CHECK (ua IS NULL OR (ua >= 1 AND ua <= 8)) NOT VALID;
  END IF;
END $$;

-- 2) LA NOUVELLE CLÉ, POSÉE AVANT QUE L'ANCIENNE NE TOMBE. Dans cet ordre, la
--    table n'est à aucun instant sans garde-fou d'unicité sur l'identité d'une
--    observation. `ua IS NULL` n'entre pas dans l'index (NULL est distinct de
--    NULL en Postgres) : les lignes pas encore rattachées ne se gênent pas.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'mat_observations_uniq_ua'
       AND conrelid = 'public.mat_observations'::regclass
  ) THEN
    ALTER TABLE public.mat_observations
      ADD CONSTRAINT mat_observations_uniq_ua UNIQUE (eleve_id, domaine_id, ua);
  END IF;
END $$;

-- 3) L'ANCIENNE CLÉ TOMBE. Son nom peut varier d'une base à l'autre (contrainte
--    nommée dans le SQL d'origine, ou index généré) : on la retrouve par SA
--    DÉFINITION, pas par un nom qu'on ne contrôle pas. On ne touche qu'à la
--    contrainte portant exactement (eleve_id, domaine_id, trimestre_id).
DO $$
DECLARE
  n text;
BEGIN
  FOR n IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'public.mat_observations'::regclass
       AND contype = 'u'
       AND pg_get_constraintdef(oid) ILIKE 'UNIQUE (eleve_id, domaine_id, trimestre_id)%'
  LOOP
    EXECUTE format('ALTER TABLE public.mat_observations DROP CONSTRAINT %I;', n);
    RAISE NOTICE 'contrainte retirée : %', n;
  END LOOP;
END $$;

-- ── CONTRÔLES (lecture seule) ───────────────────────────────────────────────
-- Ce que l'on doit lire après exécution :
--   • colonnes_posees = 4
--   • cle_ua = 1 et cle_trimestre = 0
--   • sans_ua = le nombre d'observations qui attendent la migration
SELECT
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'mat_observations'
      AND column_name IN ('ua', 'ancienne_periode', 'ua_migre_le', 'ua_migre_par')) AS colonnes_posees,
  (SELECT count(*) FROM pg_constraint
    WHERE conrelid = 'public.mat_observations'::regclass AND contype = 'u'
      AND pg_get_constraintdef(oid) ILIKE 'UNIQUE (eleve_id, domaine_id, ua)%') AS cle_ua,
  (SELECT count(*) FROM pg_constraint
    WHERE conrelid = 'public.mat_observations'::regclass AND contype = 'u'
      AND pg_get_constraintdef(oid) ILIKE 'UNIQUE (eleve_id, domaine_id, trimestre_id)%') AS cle_trimestre,
  (SELECT count(*) FROM public.mat_observations) AS observations,
  (SELECT count(*) FROM public.mat_observations WHERE ua IS NULL) AS sans_ua;

-- Répartition des observations qui attendent le rattachement, par école et par
-- ancienne période : c'est l'audit préalable demandé, en une requête.
SELECT e.name AS ecole, o.trimestre_id AS ancienne_periode,
       count(*) AS observations,
       count(o.niveau_acquis) AS avec_cote,
       count(DISTINCT o.eleve_id) AS eleves,
       count(DISTINCT o.domaine_id) AS domaines
  FROM public.mat_observations o
  JOIN public.schools e ON e.id = o.school_id
 WHERE o.ua IS NULL
 GROUP BY 1, 2
 ORDER BY 1, 2;
