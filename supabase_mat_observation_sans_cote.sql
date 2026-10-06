-- UNE OBSERVATION PEUT EXISTER AVANT SA COTE — `mat_observations.niveau_acquis`
-- ============================================================================
-- LE DÉFAUT QUE CECI CORRIGE, remonté le 2026-10-06 depuis la file de synchro :
--
--   mat_observations · upsert
--   null value in column "niveau_acquis" of relation "mat_observations"
--   violates not-null constraint
--
-- L'écran de saisie maternelle a DEUX champs par domaine : la cote (A/ECA/NA) et
-- l'observation écrite. Il laisse — à raison — saisir l'observation d'abord :
-- l'institutrice rédige son commentaire, puis cote. Mais la ligne qui part alors
-- au Cloud porte `niveau_acquis = NULL`, que la contrainte refuse.
--
-- Conséquence observée : la ligne s'écrit bien en local (IndexedDB), l'écran
-- affiche le commentaire, et l'envoi échoue EN BOUCLE dans la file hors-ligne —
-- sans que rien ne le dise à l'utilisateur. Le même commentaire est rejeté à
-- chaque tentative de synchro, indéfiniment.
--
-- ── POURQUOI RELÂCHER PLUTÔT QUE BLOQUER LA SAISIE ──────────────────────────
-- L'autre correction possible était d'interdire l'observation tant qu'aucune
-- cote n'est posée. C'est le modèle qui a tort, pas l'institutrice : commenter
-- avant d'évaluer est l'ordre naturel du travail, et griser le champ ferait
-- perdre un texte déjà tapé.
--
-- Les lecteurs tolèrent DÉJÀ une cote absente, ce n'est pas une adaptation faite
-- pour l'occasion :
--   • core/matEngine.js `dominantAcquis` ne compte que les cotes valides
--     (`isValidAcquis`) — une ligne sans cote est ignorée dans la tendance ;
--   • BulletinMatOfficial affiche une cellule VIDE quand `niveau` est absent.
-- Une observation sans cote est donc déjà un état représentable de bout en bout.
--
-- La contrainte de DOMAINE reste entière : si une cote est présente, elle vaut
-- toujours 'A', 'ECA' ou 'NA' et rien d'autre.
--
-- ── PARITÉ LAN ──────────────────────────────────────────────────────────────
-- `server/schema.sql` déclarait le même NOT NULL : il est relâché là aussi, et
-- les bases LAN déjà installées sont reconstruites au démarrage (SQLite ne sait
-- pas retirer un NOT NULL par ALTER — cf. server/db.js). Sans cela, la saisie
-- marcherait en Cloud et échouerait en LAN sur exactement le même geste.
--
-- Additif, idempotent, réversible (cf. _rollback). À EXÉCUTER dans Supabase.
-- ============================================================================

ALTER TABLE public.mat_observations
  ALTER COLUMN niveau_acquis DROP NOT NULL;

-- La contrainte de domaine est RÉÉCRITE pour accepter NULL tout en refusant
-- toujours une valeur inventée. Elle est posée NOT VALID : les lignes déjà en
-- base ne sont pas revérifiées (elles satisfont la règle par construction), et
-- la migration ne peut pas échouer sur un héritage.
DO $$
BEGIN
  -- Le CHECK d'origine est inline : son nom est généré par Postgres. On le
  -- retrouve par sa définition plutôt que par un nom qu'on ne contrôle pas.
  PERFORM 1;
  EXECUTE (
    SELECT coalesce(
      string_agg(format('ALTER TABLE public.mat_observations DROP CONSTRAINT %I;', conname), ' '),
      'SELECT 1;')
      FROM pg_constraint
     WHERE conrelid = 'public.mat_observations'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) ILIKE '%niveau_acquis%'
  );

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'mat_observations_niveau_acquis_valide'
       AND conrelid = 'public.mat_observations'::regclass
  ) THEN
    ALTER TABLE public.mat_observations
      ADD CONSTRAINT mat_observations_niveau_acquis_valide
      CHECK (niveau_acquis IS NULL OR niveau_acquis IN ('A', 'ECA', 'NA')) NOT VALID;
  END IF;
END $$;

-- Contrôle : combien d'observations sont écrites sans cote ?
SELECT 'mat_observations' AS table_, count(*) AS total,
       count(*) FILTER (WHERE niveau_acquis IS NULL) AS sans_cote,
       count(*) FILTER (WHERE observation IS NOT NULL AND niveau_acquis IS NULL) AS commentaire_seul
  FROM public.mat_observations;
