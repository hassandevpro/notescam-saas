-- supabase_apc_note_max.sql
-- ÉCHELLE D'UNE ÉVALUATION APC — `apc_notes.note_max`
-- ============================================================================
-- Une compétence n'est évaluée QU'UNE FOIS par séquence : la base le garantit
-- déjà par `apc_notes_uniq UNIQUE (eleve_id, competence_id, sequence_id)`. La
-- ligne `apc_notes` EST donc l'évaluation, et c'est elle qui porte son barème.
-- Aucune table d'évaluations multiples n'est créée, aucune clé n'est touchée.
--
-- ── POURQUOI ────────────────────────────────────────────────────────────────
-- Toutes les notes étaient jusqu'ici sur /20, et le moteur les moyennait
-- brutes. Dès que deux compétences n'ont plus le même dénominateur, cette
-- moyenne devient fausse :
--
--     2/3 et 14/20  →  (2 + 14) / 2 = 8      ← FAUX
--     2/3 = 66,67 % · 14/20 = 70 %  →  68,33 %  ≈ 13,67/20   ← juste
--
-- Le moteur normalise désormais chaque note par SON maximum avant d'agréger
-- (cf. core/apcEngine.js, `matiereAverage`).
--
-- ── LES NOTES DÉJÀ EN BASE ──────────────────────────────────────────────────
-- `note_max IS NULL` signifie /20. Ce n'est pas une supposition :
--   • le SEUL chemin d'écriture est l'écran de saisie APC, qui validait par
--     `validateGrade(raw, APC_MAX = 20)` — toute valeur hors [0, 20] était
--     refusée à la frappe — et affichait « M/20 » ;
--   • `dataImport.js` ne touche pas `apc_notes`, aucun import ne contourne ce
--     chemin ;
--   • mesure sur les 1084 notes présentes le 03/10/2026 : minimum 2, maximum
--     19, aucune au-dessus de 20, aucune négative.
-- La colonne est donc laissée à NULL sur l'existant : AUCUNE note n'est
-- réécrite, et le moteur lit NULL comme /20. Un backfill serait une réécriture
-- massive sans bénéfice — on s'en abstient.
--
-- ── PARITÉ LAN ──────────────────────────────────────────────────────────────
-- Le serveur LAN filtre les charges utiles par les colonnes réellement
-- présentes (`pickColumns`) : sans la colonne côté SQLite, `note_max` serait
-- silencieusement avalé au rechargement. Le même ajout est donc fait dans
-- `server/schema.sql` (bases neuves) ET par `ensureColumn` dans `server/db.js`
-- (bases déjà installées).
--
-- Additif, idempotent, réversible (cf. _rollback). À EXÉCUTER dans Supabase.
-- ============================================================================

ALTER TABLE public.apc_notes
  ADD COLUMN IF NOT EXISTS note_max numeric;

COMMENT ON COLUMN public.apc_notes.note_max IS
  'Barème de CETTE évaluation (ex. 3 pour une note sur 3). NULL = /20, barème historique. Le moteur normalise par ce maximum avant toute moyenne.';

-- Garde-fou : un barème nul ou négatif rendrait toute normalisation absurde
-- (division par zéro, proportion négative). NULL reste permis — c'est le /20
-- historique.
ALTER TABLE public.apc_notes DROP CONSTRAINT IF EXISTS apc_notes_note_max_chk;
ALTER TABLE public.apc_notes
  ADD CONSTRAINT apc_notes_note_max_chk
  CHECK (note_max IS NULL OR note_max > 0);

-- Vérification — à lire après exécution.
DO $$
DECLARE v_col boolean; v_chk boolean; v_hors int;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'apc_notes' AND column_name = 'note_max'
  ) INTO v_col;
  SELECT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'apc_notes_note_max_chk'
  ) INTO v_chk;
  SELECT count(*) INTO v_hors FROM public.apc_notes WHERE note_max IS NOT NULL AND note_max <= 0;

  IF NOT v_col THEN RAISE EXCEPTION 'apc_notes.note_max absente'; END IF;
  IF NOT v_chk THEN RAISE EXCEPTION 'garde-fou apc_notes_note_max_chk absent'; END IF;
  IF v_hors > 0 THEN RAISE EXCEPTION '% note(s) avec un barème <= 0', v_hors; END IF;

  RAISE NOTICE 'apc_notes.note_max en place (NULL = /20, aucune note réécrite).';
END $$;
