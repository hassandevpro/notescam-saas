-- ============================================================
-- NotesCam SaaS — Période académique active unique
-- À coller dans : Supabase → SQL Editor → New query → Run
--
-- Introduit `academic_periods` : une couche d'état/métadonnées par-dessus les
-- séquences de notes existantes. Chaque ligne `type='sequence'` porte
-- `sequence_order` = l'entier déjà utilisé dans `grades.sequence` (zéro re-clé).
--   * status (upcoming|active|closed) = ce qui est affiché par défaut
--   * is_locked                       = édition matériellement bloquée
-- Les deux sont INDÉPENDANTS : une séquence `closed` reste éditable tant que
-- `is_locked = false`.
-- ============================================================

-- ============================================================
-- 1. TABLE academic_periods
-- ============================================================
CREATE TABLE IF NOT EXISTS public.academic_periods (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id      uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  school_year    text NOT NULL,
  type           text NOT NULL CHECK (type IN ('trimestre', 'sequence')),
  parent_id      uuid REFERENCES academic_periods(id) ON DELETE SET NULL,
  name           text NOT NULL,
  sequence_order integer,                  -- entier de grades.sequence (pour type='sequence')
  teaching_start date,
  teaching_end   date,                     -- fin d'enseignement
  entry_deadline date,                     -- fin de saisie (>= teaching_end)
  status         text NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'active', 'closed')),
  is_locked      boolean NOT NULL DEFAULT false,
  activated_at   timestamptz,
  activated_by   uuid,
  closed_at      timestamptz,
  closed_by      uuid,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- Au plus UNE séquence active par (école, année) — backstop de la logique applicative.
CREATE UNIQUE INDEX IF NOT EXISTS academic_periods_one_active_idx
  ON public.academic_periods (school_id, school_year)
  WHERE status = 'active' AND type = 'sequence';

-- Clé naturelle (idempotence du seed / dédoublonnage).
CREATE UNIQUE INDEX IF NOT EXISTS academic_periods_natural_idx
  ON public.academic_periods (school_id, school_year, type, sequence_order);

-- Lecture.
CREATE INDEX IF NOT EXISTS academic_periods_school_year_idx
  ON public.academic_periods (school_id, school_year);

-- ============================================================
-- 2. RLS — calquée sur sequence_dates (sprint 19)
-- ============================================================
ALTER TABLE public.academic_periods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "academic_periods: lecture membres" ON public.academic_periods;
CREATE POLICY "academic_periods: lecture membres"
  ON public.academic_periods FOR SELECT
  USING (
    school_id IN (
      SELECT school_id FROM school_users
      WHERE user_id = auth.uid() AND active = true
    )
  );

DROP POLICY IF EXISTS "academic_periods: écriture admin" ON public.academic_periods;
CREATE POLICY "academic_periods: écriture admin"
  ON public.academic_periods FOR ALL
  USING (
    school_id IN (
      SELECT school_id FROM school_users
      WHERE user_id = auth.uid() AND active = true AND role = 'admin'
    )
  );

-- ============================================================
-- 3. Réglage établissement : mode de pilotage des périodes
--    'auto'   = la séquence active suit la date (teaching_start)
--    'manual' = l'admin fixe l'active, l'auto-switch est ignoré
-- ============================================================
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS period_mode text DEFAULT 'auto';

-- ============================================================
-- FIN
-- ============================================================
