-- Intégrité de la HIÉRARCHIE budgétaire (annual → period → sector) — LAN/SQLite.
-- Appliqué par server/db.js APRÈS l'ajout des colonnes de hiérarchie (ensureColumn),
-- pour fonctionner aussi sur une base existante pré-hiérarchie. Idempotent.
-- Source de vérité unique (réutilisé par scripts/test-budget-hierarchy.mjs).
-- Miroir Cloud/Postgres : supabase_budget_hierarchy_v2.sql.

CREATE INDEX IF NOT EXISTS idx_budgets_parent ON budgets(parent_budget_id);

-- Unicité LOGIQUE des enveloppes (partielle : n'affecte pas les lignes héritées tier=NULL).
CREATE UNIQUE INDEX IF NOT EXISTS budgets_annual_unique ON budgets(school_id, academic_year) WHERE tier='annual';
CREATE UNIQUE INDEX IF NOT EXISTS budgets_period_unique ON budgets(parent_budget_id, academic_period_id) WHERE tier='period';
CREATE UNIQUE INDEX IF NOT EXISTS budgets_sector_unique ON budgets(parent_budget_id, school_unit_id) WHERE tier='sector';

-- Cohérence inter-lignes : parent du bon tier, même école + même année, période/
-- unité du même établissement, pas d'auto-parenté (cycles structurellement impossibles :
-- seuls annual/period peuvent être parents, annual n'a pas de parent).
CREATE TRIGGER IF NOT EXISTS budgets_hier_guard_ins
BEFORE INSERT ON budgets WHEN NEW.tier IS NOT NULL
BEGIN
  SELECT CASE
    WHEN NEW.parent_budget_id IS NOT NULL AND NEW.parent_budget_id = NEW.id
      THEN RAISE(ABORT, 'budget: un budget ne peut etre son propre parent')
    WHEN NEW.tier='period' AND NOT EXISTS (SELECT 1 FROM budgets p
        WHERE p.id=NEW.parent_budget_id AND p.tier='annual'
          AND p.school_id=NEW.school_id AND p.academic_year=NEW.academic_year)
      THEN RAISE(ABORT, 'budget periode: parent doit etre un annuel du meme etablissement et de la meme annee')
    WHEN NEW.tier='period' AND NOT EXISTS (SELECT 1 FROM academic_periods ap
        WHERE ap.id=NEW.academic_period_id AND ap.school_id=NEW.school_id AND ap.school_year=NEW.academic_year)
      THEN RAISE(ABORT, 'budget periode: periode academique hors etablissement ou hors annee')
    WHEN NEW.tier='sector' AND NOT EXISTS (SELECT 1 FROM budgets p
        WHERE p.id=NEW.parent_budget_id AND p.tier='period'
          AND p.school_id=NEW.school_id AND p.academic_year=NEW.academic_year)
      THEN RAISE(ABORT, 'budget secteur: parent doit etre une periode du meme etablissement et de la meme annee')
    WHEN NEW.tier='sector' AND NOT EXISTS (SELECT 1 FROM school_units u
        WHERE u.id=NEW.school_unit_id AND u.school_id=NEW.school_id)
      THEN RAISE(ABORT, 'budget secteur: unite hors etablissement')
  END;
END;

CREATE TRIGGER IF NOT EXISTS budgets_hier_guard_upd
BEFORE UPDATE ON budgets WHEN NEW.tier IS NOT NULL
BEGIN
  SELECT CASE
    WHEN NEW.parent_budget_id IS NOT NULL AND NEW.parent_budget_id = NEW.id
      THEN RAISE(ABORT, 'budget: un budget ne peut etre son propre parent')
    WHEN NEW.tier='period' AND NOT EXISTS (SELECT 1 FROM budgets p
        WHERE p.id=NEW.parent_budget_id AND p.tier='annual'
          AND p.school_id=NEW.school_id AND p.academic_year=NEW.academic_year)
      THEN RAISE(ABORT, 'budget periode: parent doit etre un annuel du meme etablissement et de la meme annee')
    WHEN NEW.tier='period' AND NOT EXISTS (SELECT 1 FROM academic_periods ap
        WHERE ap.id=NEW.academic_period_id AND ap.school_id=NEW.school_id AND ap.school_year=NEW.academic_year)
      THEN RAISE(ABORT, 'budget periode: periode academique hors etablissement ou hors annee')
    WHEN NEW.tier='sector' AND NOT EXISTS (SELECT 1 FROM budgets p
        WHERE p.id=NEW.parent_budget_id AND p.tier='period'
          AND p.school_id=NEW.school_id AND p.academic_year=NEW.academic_year)
      THEN RAISE(ABORT, 'budget secteur: parent doit etre une periode du meme etablissement et de la meme annee')
    WHEN NEW.tier='sector' AND NOT EXISTS (SELECT 1 FROM school_units u
        WHERE u.id=NEW.school_unit_id AND u.school_id=NEW.school_id)
      THEN RAISE(ABORT, 'budget secteur: unite hors etablissement')
  END;
END;

-- Garde d'ACTIVATION : Σ des enfants contrôlée avant de passer 'active'.
--   • activer une période → Σ % secteurs = 100 ET Σ enveloppes de période ≤ annuel ;
--   • activer un annuel   → Σ enveloppes de période ≤ enveloppe annuelle.
CREATE TRIGGER IF NOT EXISTS budgets_activate_guard
BEFORE UPDATE OF status ON budgets
WHEN NEW.status='active' AND OLD.status<>'active' AND NEW.tier IS NOT NULL
BEGIN
  SELECT CASE
    WHEN NEW.tier='period' AND ABS((SELECT COALESCE(SUM(allocation_pct),0)
         FROM budgets s WHERE s.parent_budget_id=NEW.id AND s.tier='sector') - 100) > 0.01
      THEN RAISE(ABORT, 'activation periode: la somme des allocations sectorielles doit etre egale a 100')
    WHEN NEW.tier='period' AND (SELECT COALESCE(SUM(envelope_amount),0)
         FROM budgets pr WHERE pr.parent_budget_id=NEW.parent_budget_id AND pr.tier='period')
         > (SELECT COALESCE(envelope_amount,0) FROM budgets a WHERE a.id=NEW.parent_budget_id)
      THEN RAISE(ABORT, 'activation periode: la somme des enveloppes de periode depasse le budget annuel')
    WHEN NEW.tier='annual' AND (SELECT COALESCE(SUM(envelope_amount),0)
         FROM budgets pr WHERE pr.parent_budget_id=NEW.id AND pr.tier='period')
         > COALESCE(NEW.envelope_amount,0)
      THEN RAISE(ABORT, 'activation annuel: la somme des enveloppes de periode depasse le budget annuel')
  END;
END;
