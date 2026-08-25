-- supabase_genius_teacher_scope_backfill.sql
-- DONNÉES — donne à chaque compte ENSEIGNANT de THE GENIUS le périmètre
-- sectoriel DÉRIVÉ de ses classes et de ses matières.
--
-- ── POURQUOI CE FICHIER EXISTE ──────────────────────────────────────────────
-- Les policies ne suffisent pas à tenir la règle « aucun enseignant du Collège
-- n'accède au Primaire ». Le backfill de la Phase 2 (supabase_sector_isolation.sql)
-- a posé `scope_global = true` pour tout compte dont les trois tableaux de
-- périmètre étaient vides — c'est-à-dire, en pratique, pour TOUS les enseignants.
-- Or un compte global traverse le cloisonnement par conception. Tant que ces
-- comptes restent globaux, la règle 2 n'est pas tenue, quelles que soient les
-- policies posées.
--
-- Ce fichier corrige la DONNÉE, pas le code. Il est séparé de la migration
-- exprès : c'est le seul geste qui modifie le paramétrage de comptes existants,
-- et il doit être joué en connaissance de cause, après lecture des requêtes A5 et
-- A6 de supabase_genius_role_permissions_verify.sql.
--
-- ── CE QU'IL FAIT, ET SEULEMENT ÇA ──────────────────────────────────────────
--   • pour chaque compte `role = 'teacher'` de THE GENIUS rattaché à une fiche
--     enseignant qui assure au moins une classe ou une matière :
--       scope_cycles ← les cycles dérivés de ses classes ; scope_global ← false ;
--   • il NE TOUCHE PAS un enseignant sans aucune classe ni matière (le priver de
--     périmètre le rendrait aveugle sans qu'on puisse le corriger depuis l'app) ;
--   • il ne touche AUCUN autre rôle, AUCUNE autre école, AUCUN mot de passe,
--     et ne supprime rien.
--
-- ── RETOUR ARRIÈRE ──────────────────────────────────────────────────────────
-- La §1 crée une table de sauvegarde `genius_teacher_scope_backup` contenant
-- l'état exact d'avant. La §4, commentée, la rejoue à l'identique.
-- ============================================================================
BEGIN;

-- ── 1. SAUVEGARDE de l'état d'avant (permet un retour arrière exact) ────────
CREATE TABLE IF NOT EXISTS public.genius_teacher_scope_backup (
  school_user_id  uuid PRIMARY KEY,
  scope_cycles    text[],
  scope_sections  text[],
  scope_class_ids uuid[],
  scope_global    boolean,
  saved_at        timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.genius_teacher_scope_backup
       (school_user_id, scope_cycles, scope_sections, scope_class_ids, scope_global)
SELECT su.id, su.scope_cycles, su.scope_sections, su.scope_class_ids, su.scope_global
  FROM public.school_users su
 WHERE su.school_id = '6b68407b-3d2e-426b-81ff-c4e68e66120a'
   AND su.role = 'teacher'
ON CONFLICT (school_user_id) DO NOTHING;   -- une 2e exécution ne réécrase pas la référence


-- ── 2. Application du périmètre dérivé ──────────────────────────────────────
-- `scope_cycles` parle en fondamental|secondaire (cf. user_scope_allows_class) ;
-- `teacher_sectors` parle en maternelle|primaire|college. La traduction est ici.
DO $$
DECLARE
  v_school uuid := '6b68407b-3d2e-426b-81ff-c4e68e66120a';
  r record;
  v_cycles text[];
  n_ok int := 0;
  n_skip int := 0;
BEGIN
  FOR r IN
    SELECT su.id AS su_id, su.full_name, t.id AS teacher_id
      FROM public.school_users su
      JOIN public.teachers t
        ON t.school_id = su.school_id AND t.auth_user_id = su.user_id
     WHERE su.school_id = v_school AND su.role = 'teacher' AND su.active = true
  LOOP
    SELECT COALESCE(array_agg(DISTINCT c), '{}'::text[]) INTO v_cycles
      FROM (
        SELECT CASE WHEN s = 'college' THEN 'secondaire' ELSE 'fondamental' END AS c
          FROM unnest(public.teacher_sectors(v_school, r.teacher_id)) AS s
      ) q;

    IF array_length(v_cycles, 1) IS NULL THEN
      -- Aucune classe, aucune matière : on ne touche à rien. Le priver de
      -- périmètre le rendrait aveugle, et l'app ne permet pas de le rattraper
      -- sans lui réaffecter d'abord une matière.
      n_skip := n_skip + 1;
      RAISE NOTICE 'IGNORÉ (aucune classe ni matière) : %', r.full_name;
      CONTINUE;
    END IF;

    UPDATE public.school_users
       SET scope_cycles = v_cycles,
           scope_global = false
     WHERE id = r.su_id;
    n_ok := n_ok + 1;
    RAISE NOTICE 'périmètre posé : % -> %', r.full_name, v_cycles;
  END LOOP;

  RAISE NOTICE '── % compte(s) enseignant cloisonné(s), % ignoré(s) ──', n_ok, n_skip;
END $$;

COMMIT;


-- ── 3. CONTRÔLE — à lire après exécution ────────────────────────────────────
-- 3a. Attendu : enseignants_globaux = 0 (hors ceux volontairement ignorés).
SELECT count(*) FILTER (WHERE scope_global) AS enseignants_globaux,
       count(*)                             AS enseignants_total
  FROM school_users
 WHERE school_id = '6b68407b-3d2e-426b-81ff-c4e68e66120a' AND role = 'teacher';

-- 3b. Le détail, compte par compte.
SELECT su.full_name, su.scope_cycles, su.scope_global
  FROM school_users su
 WHERE su.school_id = '6b68407b-3d2e-426b-81ff-c4e68e66120a' AND su.role = 'teacher'
 ORDER BY su.scope_global DESC, su.full_name;

-- 3c. Aucun compte NON enseignant ne doit avoir bougé. Compare à l'instantané A2.
SELECT su.full_name, su.role, su.scope_cycles, su.scope_global
  FROM school_users su
 WHERE su.school_id = '6b68407b-3d2e-426b-81ff-c4e68e66120a' AND su.role <> 'teacher'
 ORDER BY su.role, su.full_name;


-- ── 4. RETOUR ARRIÈRE EXACT (décommenter pour rejouer l'état d'avant) ───────
-- BEGIN;
-- UPDATE public.school_users su
--    SET scope_cycles    = b.scope_cycles,
--        scope_sections  = b.scope_sections,
--        scope_class_ids = b.scope_class_ids,
--        scope_global    = b.scope_global
--   FROM public.genius_teacher_scope_backup b
--  WHERE su.id = b.school_user_id;
-- COMMIT;
