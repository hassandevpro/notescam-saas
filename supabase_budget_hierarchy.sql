-- ============================================================
-- NotesCam — Budgets : hiérarchie Catégorie → Chapitre → Sous-chapitre
-- À coller dans : Supabase → SQL Editor → New query → Run. Idempotent.
-- ============================================================
--
-- La hiérarchie repose sur `budget_chapters.parent_id` (déjà présent). On ajoute
-- un cache de NIVEAU (`level`) : 'category' | 'chapter' | 'subchapter'. NULL =
-- l'app le déduit de la profondeur → AUCUNE migration destructive, les anciens
-- chapitres à 2 niveaux continuent de fonctionner.

ALTER TABLE budget_chapters ADD COLUMN IF NOT EXISTS level text; -- category|chapter|subchapter (facultatif)

-- Backfill par profondeur (récursif) — purement indicatif, l'app sait déduire.
WITH RECURSIVE depth AS (
  SELECT id, 0 AS d FROM budget_chapters WHERE parent_id IS NULL
  UNION ALL
  SELECT c.id, depth.d + 1 FROM budget_chapters c JOIN depth ON c.parent_id = depth.id
)
UPDATE budget_chapters b SET level =
  CASE WHEN depth.d = 0 THEN 'category' WHEN depth.d = 1 THEN 'chapter' ELSE 'subchapter' END
FROM depth WHERE depth.id = b.id AND b.level IS NULL;
