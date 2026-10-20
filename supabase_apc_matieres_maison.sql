-- MATIÈRE MAISON EN PREMIER CYCLE APC — le chaînon qui manque à l'hybride
--
-- ── LE DÉFAUT QUE CETTE MIGRATION FERME ────────────────────────────────────
--
-- Signalé par le responsable : « quand je crée une matière ça ne s'affiche pas
-- pour mettre la note et sur le bulletin », et « on doit pouvoir être libre de
-- créer une matière même si ça ne fait pas partie du référentiel ».
--
-- Une école réglée sur le moteur « officiel » lit son RÉFÉRENTIEL NATIONAL, pas
-- ses lignes `subjects`. Pour le primaire et la maternelle ce n'est pas
-- bloquant : `prim_competences` et `mat_domaines` portent déjà un `school_id`,
-- donc une école y ajoute ses propres lignes, qui se saisissent et s'impriment
-- comme les nationales. `apc_competences` aussi (6 lignes maison existent).
--
-- Le PREMIER CYCLE est le seul à rester bloqué : `apc_competences.matiere_id`
-- est une clé étrangère vers `apc_matieres`, et `apc_matieres` n'a PAS de
-- `school_id`. Une école ne peut donc pas créer une MATIÈRE — seulement une
-- compétence à l'intérieur d'une matière nationale. « Langue Turc », « Étude de
-- texte » ou « Informatique Pratique » n'ont aucun endroit où exister.
--
-- ── CE QUE FAIT CETTE MIGRATION ────────────────────────────────────────────
--
-- Elle applique à `apc_matieres` et `apc_classe_matieres` EXACTEMENT le motif
-- déjà en service sur `apc_competences` : une colonne `school_id` nullable.
--   • `school_id IS NULL`  → ligne NATIONALE, partagée, inchangée ;
--   • `school_id = <école>` → ligne MAISON, visible de cette école seule.
--
-- Rien n'est modifié ni supprimé : toutes les lignes existantes restent
-- nationales (`school_id` à NULL par défaut). Additive et idempotente.
--
-- ── CE QU'ELLE NE FAIT PAS ─────────────────────────────────────────────────
--
-- Elle ne crée aucune matière et ne touche à aucune note. Elle ouvre seulement
-- la possibilité ; le code applicatif décide ensuite quoi en faire.

-- ── 1. La colonne, sur les deux tables ─────────────────────────────────────

ALTER TABLE public.apc_matieres
  ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE;

ALTER TABLE public.apc_classe_matieres
  ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE;

COMMENT ON COLUMN public.apc_matieres.school_id IS
  'NULL = matière nationale du référentiel MINESEC. Renseigné = matière propre à cette école (« maison »), invisible des autres. Même motif que apc_competences.school_id.';

COMMENT ON COLUMN public.apc_classe_matieres.school_id IS
  'NULL = rattachement national (classe × matière). Renseigné = rattachement propre à cette école.';

-- ── 2. Lecture : le national pour tous, le maison pour son école ───────────
--
-- ATTENTION — la policy existante `apc ref read` est `USING (true)` : elle
-- laisse TOUT lire. Les policies permissives se cumulent en OU, donc la laisser
-- en place ferait voir à chaque école les matières maison des 43 autres. On la
-- REMPLACE, on ne l'ajoute pas à côté. C'est le même motif que
-- `apc_competences`, qui a déjà résolu exactement ce problème, et on réutilise
-- son helper `member_of_school` plutôt que de réécrire la condition.
--
-- RLS est DÉJÀ active sur les deux tables (vérifié en production) : les deux
-- lignes ci-dessous sont des no-op, posées pour que le fichier soit rejouable
-- sur une base neuve.

ALTER TABLE public.apc_matieres          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.apc_classe_matieres   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "apc ref read" ON public.apc_matieres;
DROP POLICY IF EXISTS "apc matieres: lecture national + le sien" ON public.apc_matieres;
CREATE POLICY "apc matieres: lecture national + le sien"
  ON public.apc_matieres FOR SELECT TO authenticated
  USING (school_id IS NULL OR public.member_of_school(school_id));

DROP POLICY IF EXISTS "apc ref read" ON public.apc_classe_matieres;
DROP POLICY IF EXISTS "apc classe_matieres: lecture national + le sien" ON public.apc_classe_matieres;
CREATE POLICY "apc classe_matieres: lecture national + le sien"
  ON public.apc_classe_matieres FOR SELECT TO authenticated
  USING (school_id IS NULL OR public.member_of_school(school_id));

-- ── 3. Écriture : UNIQUEMENT ses propres lignes ───────────────────────────
-- Le garde-fou qui compte. `school_id IS NOT NULL` dans le WITH CHECK interdit
-- de fabriquer ou de modifier une ligne NATIONALE : une école ne peut pas
-- toucher au référentiel des autres établissements, même par accident.
-- Condition identique à `apc competences: ecriture des siennes`, déjà en
-- service : l'appartenance suffit, l'écran gère qui a le droit de cliquer
-- (`canManageClassSubjects`, miroir de la policy).

DROP POLICY IF EXISTS "apc matieres: ecriture des siennes" ON public.apc_matieres;
CREATE POLICY "apc matieres: ecriture des siennes"
  ON public.apc_matieres FOR ALL TO authenticated
  USING      (school_id IS NOT NULL AND public.member_of_school(school_id))
  WITH CHECK (school_id IS NOT NULL AND public.member_of_school(school_id));

DROP POLICY IF EXISTS "apc classe_matieres: ecriture des siennes" ON public.apc_classe_matieres;
CREATE POLICY "apc classe_matieres: ecriture des siennes"
  ON public.apc_classe_matieres FOR ALL TO authenticated
  USING      (school_id IS NOT NULL AND public.member_of_school(school_id))
  WITH CHECK (school_id IS NOT NULL AND public.member_of_school(school_id));

-- ── 4. Retrouver ses matières maison rapidement ───────────────────────────

CREATE INDEX IF NOT EXISTS idx_apc_matieres_school
  ON public.apc_matieres (school_id) WHERE school_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_apc_classe_matieres_school
  ON public.apc_classe_matieres (school_id) WHERE school_id IS NOT NULL;

-- ── RETOUR ARRIÈRE ─────────────────────────────────────────────────────────
-- Rendre la lecture ouverte, puis retirer les colonnes :
--   DROP POLICY IF EXISTS "apc matieres: lecture national + le sien" ON public.apc_matieres;
--   CREATE POLICY "apc ref read" ON public.apc_matieres FOR SELECT TO authenticated USING (true);
--   (idem apc_classe_matieres)
--   ALTER TABLE public.apc_matieres        DROP COLUMN IF EXISTS school_id;
--   ALTER TABLE public.apc_classe_matieres DROP COLUMN IF EXISTS school_id;
-- (les matières maison de chaque école disparaissent alors avec la colonne —
--  à n'exécuter que si l'on renonce entièrement à la fonctionnalité).
