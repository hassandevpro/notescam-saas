-- Intégrité du modèle budgétaire CIBLE v3 (lignes + allocations période/secteur) — LAN/SQLite.
-- Appliqué par server/db.js APRÈS l'ajout des colonnes (ensureColumn), pour fonctionner
-- aussi sur une base existante. Idempotent. Source de vérité unique réutilisée par
-- scripts/test-budget-periods.mjs et scripts/test-budget-lines.mjs.
-- Miroir Cloud/Postgres : supabase_budget_lines_v3.sql.

-- ── 1) budget_periods : pas de chevauchement de dates dans une même (école, année) ──
-- Deux périodes se chevauchent si  NEW.start < autre.end  ET  NEW.end > autre.start.
-- Les intervalles jointifs (fin d'une = début de l'autre) ne se chevauchent PAS.
CREATE TRIGGER IF NOT EXISTS budget_periods_no_overlap_ins
BEFORE INSERT ON budget_periods
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM budget_periods p
     WHERE p.school_id = NEW.school_id AND p.academic_year = NEW.academic_year AND p.id <> NEW.id
       AND NEW.start_date < p.end_date AND NEW.end_date > p.start_date
  ) THEN RAISE(ABORT, 'periode budgetaire: chevauchement de dates avec une periode existante') END;
END;

CREATE TRIGGER IF NOT EXISTS budget_periods_no_overlap_upd
BEFORE UPDATE ON budget_periods
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM budget_periods p
     WHERE p.school_id = NEW.school_id AND p.academic_year = NEW.academic_year AND p.id <> NEW.id
       AND NEW.start_date < p.end_date AND NEW.end_date > p.start_date
  ) THEN RAISE(ABORT, 'periode budgetaire: chevauchement de dates avec une periode existante') END;
END;

-- ── 2) budget_line_sectors : réservé aux lignes de portée 'sectors' + unité de l'école ──
-- `scope IS NOT 'sectors'` (comparaison null-safe SQLite) → rejette aussi scope NULL/'complex'.
CREATE TRIGGER IF NOT EXISTS budget_line_sectors_guard_ins
BEFORE INSERT ON budget_line_sectors
BEGIN
  SELECT CASE
    WHEN (SELECT scope FROM budget_chapters WHERE id = NEW.budget_chapter_id) IS NOT 'sectors'
      THEN RAISE(ABORT, 'allocation sectorielle: la ligne doit avoir la portee secteurs')
    WHEN NOT EXISTS (SELECT 1 FROM school_units u WHERE u.id = NEW.school_unit_id AND u.school_id = NEW.school_id)
      THEN RAISE(ABORT, 'allocation sectorielle: unite hors etablissement')
  END;
END;

CREATE TRIGGER IF NOT EXISTS budget_line_sectors_guard_upd
BEFORE UPDATE ON budget_line_sectors
BEGIN
  SELECT CASE
    WHEN (SELECT scope FROM budget_chapters WHERE id = NEW.budget_chapter_id) IS NOT 'sectors'
      THEN RAISE(ABORT, 'allocation sectorielle: la ligne doit avoir la portee secteurs')
    WHEN NOT EXISTS (SELECT 1 FROM school_units u WHERE u.id = NEW.school_unit_id AND u.school_id = NEW.school_id)
      THEN RAISE(ABORT, 'allocation sectorielle: unite hors etablissement')
  END;
END;

-- ── 3) budget_line_periods : la période doit être de la même école + même année que le budget ──
CREATE TRIGGER IF NOT EXISTS budget_line_periods_guard_ins
BEFORE INSERT ON budget_line_periods
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM budget_periods p
      JOIN budget_chapters c ON c.id = NEW.budget_chapter_id
      JOIN budgets b        ON b.id = c.budget_id
     WHERE p.id = NEW.budget_period_id
       AND p.school_id = NEW.school_id
       AND p.academic_year = b.academic_year
  ) THEN RAISE(ABORT, 'allocation temporelle: periode hors etablissement ou hors annee du budget') END;
END;

CREATE TRIGGER IF NOT EXISTS budget_line_periods_guard_upd
BEFORE UPDATE ON budget_line_periods
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM budget_periods p
      JOIN budget_chapters c ON c.id = NEW.budget_chapter_id
      JOIN budgets b        ON b.id = c.budget_id
     WHERE p.id = NEW.budget_period_id
       AND p.school_id = NEW.school_id
       AND p.academic_year = b.academic_year
  ) THEN RAISE(ABORT, 'allocation temporelle: periode hors etablissement ou hors annee du budget') END;
END;

-- ── 4) Garde d'ACTIVATION d'une LIGNE : Σ % temporel = 100 (+ Σ % sectoriel = 100 si portée 'sectors') ──
-- Le logiciel ne répartit jamais le reste : impossible d'activer tant que Σ ≠ 100.
CREATE TRIGGER IF NOT EXISTS budget_chapter_activate_guard
BEFORE UPDATE OF status ON budget_chapters
WHEN NEW.status = 'active' AND OLD.status <> 'active'
BEGIN
  SELECT CASE
    WHEN ABS((SELECT COALESCE(SUM(pct),0) FROM budget_line_periods WHERE budget_chapter_id = NEW.id) - 100) > 0.01
      THEN RAISE(ABORT, 'activation ligne: la somme des allocations temporelles doit etre egale a 100')
    WHEN NEW.scope = 'sectors'
     AND ABS((SELECT COALESCE(SUM(pct),0) FROM budget_line_sectors WHERE budget_chapter_id = NEW.id) - 100) > 0.01
      THEN RAISE(ABORT, 'activation ligne: la somme des allocations sectorielles doit etre egale a 100')
  END;
END;
