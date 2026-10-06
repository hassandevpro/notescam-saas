-- supabase_fix_classes_with_check.sql
-- CORRECTIF — « new row violates row-level security policy for table "classes" »
-- à la synchronisation, pour tout compte réellement cloisonné.
--
-- ── LE DÉFAUT ───────────────────────────────────────────────────────────────
-- La policy RESTRICTIVE posée par supabase_sector_isolation.sql est :
--
--     USING      (user_scope_allows_class(school_id, id))
--     WITH CHECK (user_scope_allows_class(school_id, id))
--
-- `user_scope_allows_class` détermine le cycle et la section EN RELISANT la
-- table `classes` à partir de l'id reçu :
--
--     SELECT cl.cycle, cl.section INTO ... FROM classes cl WHERE cl.id = p_class;
--     IF NOT FOUND THEN RETURN false; END IF;
--
-- À l'INSERTION, la ligne n'existe pas encore au moment où le WITH CHECK est
-- évalué : le SELECT ne trouve rien, la fonction renvoie false, l'insertion est
-- refusée. Autrement dit : **un compte doté d'un périmètre réel ne peut créer
-- aucune classe.** Hors ligne, la file de synchronisation retente puis abandonne
-- — d'où les « 6 opérations en échec · classes · upsert ».
--
-- Mesuré avant correctif, sur les quatre comptes cloisonnés du projet :
-- `user_scope_allows_class(école, <id neuf>)` renvoie false pour les quatre.
--
-- Le même piège existait à l'UPDATE, dans l'autre sens : le WITH CHECK relisait
-- l'ANCIENNE ligne, si bien qu'on pouvait déplacer une classe HORS de son
-- périmètre sans que la policy s'en aperçoive. Vérifier les colonnes de la ligne
-- proposée referme les deux à la fois.
--
-- `classes` est la SEULE table concernée : les vingt autres policies de
-- cloisonnement passent une clé étrangère (`class_id`, `student_id`) qui désigne
-- une ligne DÉJÀ existante, donc leur relecture aboutit.
--
-- ── CE QUE CE FICHIER FAIT ──────────────────────────────────────────────────
--   §1  `user_scope_allows_class_row(school, class, cycle, section)` — même
--       décision, mais à partir des colonnes REÇUES : aucune relecture, donc
--       utilisable sur une ligne qui n'existe pas encore.
--   §2  `user_scope_allows_class` devient un mince appelant : elle relit la
--       ligne (lecture / USING) puis délègue. Comportement en lecture inchangé.
--   §3  la policy `classes` évalue son WITH CHECK sur les colonnes de la ligne.
--   §4  la traduction des cycles accepte `college` et `lycee` comme secondaire.
--       Ces deux valeurs existent en base (14 classes chez LA RETRAITE, LA
--       RÉUSSITE, MAARIF) mais n'étaient reconnues nulle part : un compte
--       cloisonné sur `{secondaire}` s'en serait trouvé aveugle, exactement
--       comme dans supabase_fix_perimetre_mort.sql. Aucune de ces écoles n'a de
--       compte cloisonné par cycle aujourd'hui — c'est donc une fermeture de
--       piège, pas une correction de panne en cours.
--
-- IDEMPOTENT — rejouable. AUCUNE SUPPRESSION DE DONNÉES.
-- Vérification : supabase_fix_classes_with_check_verify.sql
-- ============================================================================
BEGIN;

-- ── 1. La décision, à partir des colonnes reçues ────────────────────────────
CREATE OR REPLACE FUNCTION public.user_scope_allows_class_row(
  p_school  uuid,
  p_class   uuid,
  p_cycle   text,
  p_section text
)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE s text[]; c text[]; k uuid[]; g boolean; f boolean;
BEGIN
  SELECT su.scope_sections, su.scope_cycles, su.scope_class_ids, su.scope_global, true
    INTO s, c, k, g, f
  FROM school_users su
  WHERE su.user_id = auth.uid() AND su.school_id = p_school AND su.active = true
  LIMIT 1;

  IF NOT coalesce(f, false) THEN RETURN false; END IF;   -- non membre de l'école
  IF coalesce(g, false)     THEN RETURN true;  END IF;   -- GLOBAL explicite

  -- Aucun périmètre posé : compte non configuré, pas un cloisonnement voulu.
  -- (cf. supabase_fix_perimetre_mort.sql)
  IF coalesce(array_length(s, 1), 0) = 0
 AND coalesce(array_length(c, 1), 0) = 0
 AND coalesce(array_length(k, 1), 0) = 0 THEN
    RETURN true;
  END IF;

  IF k IS NOT NULL AND p_class IS NOT NULL AND p_class = ANY(k) THEN RETURN true; END IF;

  IF s IS NOT NULL AND p_section IS NOT NULL AND p_section = ANY(s) THEN RETURN true; END IF;

  IF c IS NOT NULL THEN
    -- `classes.cycle` stocke maternelle|primaire|secondaire, et aussi
    -- college|lycee selon l'écran qui a créé la classe ; le périmètre applicatif
    -- regroupe en fondamental (maternelle+primaire) et secondaire.
    IF p_cycle = ANY(c) THEN RETURN true; END IF;
    IF p_cycle   IN ('maternelle','primaire')          AND 'fondamental' = ANY(c) THEN RETURN true; END IF;
    IF p_cycle   IN ('college','lycee','secondaire')   AND 'secondaire'  = ANY(c) THEN RETURN true; END IF;
    IF p_section IN ('maternelle','primaire')          AND 'fondamental' = ANY(c) THEN RETURN true; END IF;
    IF p_section IN ('premier_cycle','second_cycle','college','lycee')
                                                       AND 'secondaire'  = ANY(c) THEN RETURN true; END IF;
  END IF;

  -- L'enseignant atteint toujours les classes qu'il assure (sans effet sur une
  -- ligne neuve, qu'il n'assure pas encore — ce qui est le comportement voulu).
  IF p_class IS NOT NULL AND public.user_teaches_class(p_school, p_class) THEN RETURN true; END IF;

  RETURN false;
END $$;

REVOKE ALL    ON FUNCTION public.user_scope_allows_class_row(uuid, uuid, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.user_scope_allows_class_row(uuid, uuid, text, text) TO authenticated;


-- ── 2. L'ancienne signature relit la ligne, puis délègue ────────────────────
CREATE OR REPLACE FUNCTION public.user_scope_allows_class(p_school uuid, p_class uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_cycle text; v_section text; v_found boolean := false;
BEGIN
  IF p_class IS NOT NULL THEN
    SELECT cl.cycle, cl.section, true INTO v_cycle, v_section, v_found
      FROM classes cl WHERE cl.id = p_class AND cl.school_id = p_school;
  END IF;

  -- Classe inconnue : on interroge tout de même le périmètre, pour que les
  -- comptes globaux et les comptes sans périmètre gardent leur réponse (c'est
  -- le chemin emprunté par user_scope_allows_student avec un élève absent).
  IF NOT v_found THEN
    RETURN public.user_scope_allows_class_row(p_school, NULL, NULL, NULL);
  END IF;

  RETURN public.user_scope_allows_class_row(p_school, p_class, v_cycle, v_section);
END $$;


-- ── 3. La policy vérifie la ligne PROPOSÉE, pas la ligne en base ────────────
DROP POLICY IF EXISTS "secteur: cloisonnement" ON public.classes;
CREATE POLICY "secteur: cloisonnement" ON public.classes AS RESTRICTIVE FOR ALL TO public
  USING      (public.user_scope_allows_class(school_id, id))
  WITH CHECK (public.user_scope_allows_class_row(school_id, id, cycle, section));

COMMIT;
