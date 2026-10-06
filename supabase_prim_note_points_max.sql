-- ÉCHELLE D'UNE ÉVALUATION DU PRIMAIRE — `prim_notes.points_max`
-- ============================================================================
-- Un critère (Oral, Écrit, Pratique, Savoir-être) n'est évalué QU'UNE FOIS par
-- unité d'apprentissage : la base le garantit déjà par
-- `prim_notes_uniq UNIQUE (eleve_id, competence_id, critere_id, ua)`. La ligne
-- `prim_notes` EST donc l'évaluation, et c'est elle qui porte son barème. Aucune
-- table d'évaluations multiples n'est créée, aucune clé n'est touchée.
--
-- Pendant exact de `apc_notes.note_max` (supabase_apc_note_max.sql) pour le
-- fondamental. Les deux moteurs se comportent désormais pareil : le barème
-- appartient à l'évaluation, pas à la colonne.
--
-- ── POURQUOI ────────────────────────────────────────────────────────────────
-- Le barème de chaque critère venait du référentiel national et ne bougeait
-- pas. L'enseignant qui interroge l'Oral sur 10 devait convertir de tête avant
-- de saisir — conversion fausse une fois sur trois, et invisible ensuite.
--
-- Le total d'une compétence est une SOMME de points, et son pourcentage le
-- rapport de cette somme au total possible. Dès que deux UA du même critère
-- n'ont plus le même dénominateur, il faut additionner les barèmes RÉELS et non
-- celui du référentiel :
--
--     Oral 8/10 (UA1) et 15/20 (UA3)
--       → 23 / (10+20) = 76,7 %                      ← juste
--       → 23 / (20+20) = 57,5 %  (barème officiel)   ← FAUX
--
-- Le moteur somme désormais le barème de chaque note (cf. core/primEngine.js,
-- `primNoteScale` et `competencePointsTotal`), et les moyennes par critère
-- moyennent les PROPORTIONS avant de les réexprimer sur le barème officiel.
--
-- ── LES NOTES DÉJÀ EN BASE ──────────────────────────────────────────────────
-- `points_max IS NULL` signifie « barème officiel du référentiel pour ce
-- critère ». Ce n'est pas une supposition : le SEUL chemin d'écriture est
-- l'écran de saisie primaire, qui validait par
-- `validateGrade(raw, critere.points_max)` — toute valeur hors [0, barème] était
-- refusée à la frappe — et affichait ce barème en en-tête de colonne ;
-- `dataImport.js` ne touche pas `prim_notes`, aucun import ne contourne ce
-- chemin.
-- La colonne est donc laissée à NULL sur l'existant : AUCUNE note n'est
-- réécrite, et le moteur lit NULL comme le barème officiel. Un backfill serait
-- une réécriture massive sans bénéfice — on s'en abstient.
--
-- ── PARITÉ LAN ──────────────────────────────────────────────────────────────
-- Le serveur LAN filtre les charges utiles par les colonnes réellement présentes
-- (`pickColumns`) : sans la colonne côté SQLite, `points_max` serait
-- silencieusement avalé au rechargement. Le même ajout est donc fait dans
-- `server/schema.sql` (bases neuves) ET par `ensureColumn` dans `server/db.js`
-- (bases déjà installées).
--
-- Additif, idempotent, réversible (cf. _rollback). À EXÉCUTER dans Supabase.
-- ============================================================================

ALTER TABLE public.prim_notes
  ADD COLUMN IF NOT EXISTS points_max numeric;

-- Un barème nul ou négatif ne veut rien dire, et 2000 est une faute de frappe
-- pour 20. La contrainte est posée NOT VALID : elle s'applique aux écritures
-- futures sans faire échouer la migration sur d'éventuelles lignes héritées.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'prim_notes_points_max_sain'
       AND conrelid = 'public.prim_notes'::regclass
  ) THEN
    ALTER TABLE public.prim_notes
      ADD CONSTRAINT prim_notes_points_max_sain
      CHECK (points_max IS NULL OR (points_max > 0 AND points_max <= 200)) NOT VALID;
  END IF;
END $$;

-- Contrôle : combien de notes portent déjà un barème explicite ?
SELECT 'prim_notes' AS table_, count(*) AS total,
       count(points_max) AS avec_bareme_explicite
  FROM public.prim_notes;
