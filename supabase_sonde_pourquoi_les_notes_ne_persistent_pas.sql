-- ============================================================================
-- POURQUOI UNE NOTE DU PRIMAIRE NE PERSISTE PAS — SONDE, LECTURE SEULE
-- ============================================================================
-- Aucun INSERT, UPDATE, DELETE, ALTER. Rejouable sans effet. À lancer dans le SQL
-- Editor de Supabase (tout sélectionner, ou rien, puis Run).
--
-- CE QU'ELLE RÉPOND. L'application écrit une note avec
--   upsert(..., { onConflict: 'eleve_id,competence_id,critere_id,ua' })
-- et une colonne `points_max`. Si l'UN des deux manque sur CE projet, PostgreSQL
-- refuse l'écriture entière :
--   • contrainte absente      → 42P10 « no unique or exclusion constraint matching
--                               the ON CONFLICT specification »
--   • colonne absente         → 42703 « column points_max does not exist »
-- Jusqu'au 2026-11-05, ce refus n'était signalé QUE dans la console du navigateur :
-- la note s'affichait, puis disparaissait au rafraîchissement suivant. C'est
-- exactement « j'ajoute les notes ici, ça ne persiste pas ».
--
-- ⚠️ LA CONTRAINTE HISTORIQUE PORTAIT SUR `trimestre_id`, PAS SUR `ua`. Avec
-- celle-là, les trois UA d'un même trimestre se télescopent : saisir UA2 ÉCRASE
-- UA1. Les notes ne « disparaissent » pas par hasard — elles sont remplacées.
--
-- LA SUITE À DONNER, selon le résultat de la ligne « VERDICT » :
--   • « tout est en place »        → la cause est ailleurs ; lancer
--     supabase_diagnostic_notes_prim_bright_continent.sql (blocs A bis et C).
--   • « contrainte sur ua ABSENTE » → appliquer supabase_prim_bareme_ua.sql.
--   • « points_max ABSENTE »        → appliquer supabase_prim_note_points_max.sql.
-- Dans les deux derniers cas : SAUVEGARDER D'ABORD (export CSV daté, cf.
-- supabase_extract_notes_bright_continent.sql), puis appliquer, puis relancer cette sonde.
-- ============================================================================

-- ── 1. LE VERDICT, EN UNE LIGNE ────────────────────────────────────────────
WITH etat AS (
  SELECT
    EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'prim_notes'
               AND column_name = 'points_max')                               AS a_points_max,
    EXISTS (SELECT 1 FROM pg_constraint c
             WHERE c.conrelid = 'public.prim_notes'::regclass
               AND c.contype IN ('u', 'p')
               AND (SELECT array_agg(a.attname ORDER BY a.attname)
                      FROM unnest(c.conkey) k
                      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k)
                   = ARRAY['competence_id','critere_id','eleve_id','ua'])     AS cle_sur_ua,
    EXISTS (SELECT 1 FROM pg_constraint c
             WHERE c.conrelid = 'public.prim_notes'::regclass
               AND c.contype IN ('u', 'p')
               AND (SELECT array_agg(a.attname ORDER BY a.attname)
                      FROM unnest(c.conkey) k
                      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k)
                   = ARRAY['competence_id','critere_id','eleve_id','trimestre_id']) AS cle_sur_trimestre
)
SELECT
  CASE
    WHEN NOT a_points_max AND NOT cle_sur_ua
      THEN 'BLOQUÉ : points_max ABSENTE **et** contrainte sur ua ABSENTE → aucune note ne peut etre ecrite. Appliquer supabase_prim_bareme_ua.sql PUIS supabase_prim_note_points_max.sql.'
    WHEN NOT a_points_max
      THEN 'BLOQUÉ : colonne points_max ABSENTE → toute ecriture de note est refusee (42703). Appliquer supabase_prim_note_points_max.sql.'
    WHEN NOT cle_sur_ua AND cle_sur_trimestre
      THEN 'BLOQUÉ : la contrainte porte sur trimestre_id, pas sur ua → upsert refuse (42P10), et les trois UA d un trimestre se telescopent. Appliquer supabase_prim_bareme_ua.sql.'
    WHEN NOT cle_sur_ua
      THEN 'BLOQUÉ : aucune contrainte unique (eleve_id, competence_id, critere_id, ua) → upsert refuse (42P10). Appliquer supabase_prim_bareme_ua.sql.'
    ELSE 'TOUT EST EN PLACE : la cause du non-enregistrement est ailleurs. Lancer supabase_diagnostic_notes_prim_bright_continent.sql (blocs A bis et C).'
  END                                    AS verdict,
  a_points_max                           AS colonne_points_max_presente,
  cle_sur_ua                             AS contrainte_sur_ua_presente,
  cle_sur_trimestre                      AS ancienne_contrainte_trimestre_presente
  FROM etat;


-- ── 2. LE DÉTAIL : les contraintes réellement posées sur prim_notes ────────
SELECT c.conname AS contrainte,
       CASE c.contype WHEN 'p' THEN 'cle primaire' WHEN 'u' THEN 'unique'
                      WHEN 'c' THEN 'verification' WHEN 'f' THEN 'cle etrangere' ELSE c.contype::text END AS nature,
       pg_get_constraintdef(c.oid) AS definition
  FROM pg_constraint c
 WHERE c.conrelid = 'public.prim_notes'::regclass
 ORDER BY c.contype, c.conname;


-- ── 3. LES COLONNES, pour voir d'un coup ce que le schéma porte ────────────
SELECT column_name AS colonne, data_type AS type, is_nullable AS nullable, column_default AS defaut
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'prim_notes'
 ORDER BY ordinal_position;


-- ── 4. LES UA SE TÉLESCOPENT-ELLES DÉJÀ ? ──────────────────────────────────
-- Avec l'ancienne contrainte (sur trimestre_id), une classe ne peut avoir QU'UNE
-- UA renseignée par trimestre et par critère. Si la ligne ci-dessous montre des
-- trimestres à une seule UA là où l'école a saisi plusieurs UA, les notes des
-- autres UA ont été écrasées — et non perdues par l'application.
WITH ecole AS (SELECT id FROM public.schools WHERE name ILIKE '%bright continent%')
SELECT n.trimestre_id                        AS trimestre,
       count(DISTINCT n.ua)                  AS ua_distinctes,
       array_agg(DISTINCT n.ua ORDER BY n.ua) AS lesquelles,
       count(*)                              AS lignes
  FROM public.prim_notes n
  JOIN ecole e ON e.id = n.school_id
 GROUP BY n.trimestre_id
 ORDER BY n.trimestre_id;
