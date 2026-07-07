-- ============================================================
-- NotesCam — Groupe scolaire (complexe) & unités pédagogiques
-- À coller dans : Supabase → SQL Editor → New query → Run
-- Idempotent.
-- ============================================================
--
-- Modèle : la table `schools` EST le complexe scolaire (le groupe). Une école
-- peut désormais contenir plusieurs UNITÉS PÉDAGOGIQUES (maternelle, primaire,
-- collège, lycée…), chacune avec sa propre identité visuelle et administrative :
-- nom, logo, cachet, signature, directeur, adresse, contacts, devise, couleurs.
--
-- Rattachement des classes :
--   • `classes.unit_id` (nullable) = rattachement EXPLICITE à une unité ;
--   • à défaut, l'app rattache la classe à l'unité dont `section_key` correspond
--     à la section pédagogique DÉRIVÉE du niveau de la classe
--     (maternelle / primaire / premier_cycle / second_cycle).
--   → aucune migration des classes existantes n'est requise : sans unité définie,
--     l'identité reste celle de l'école (comportement historique, zéro régression).

CREATE TABLE IF NOT EXISTS school_units (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  -- Section pédagogique représentée par l'unité (repli automatique des classes) :
  -- 'maternelle' | 'primaire' | 'premier_cycle' | 'second_cycle' | 'autre' | NULL.
  section_key   text,
  name          text NOT NULL,
  short_name    text,
  -- Identité visuelle / administrative (surcharge celle de l'école quand renseignée)
  logo_url      text,
  stamp_url     text,
  signature_url text,
  director      text,        -- directeur / responsable de l'unité
  address       text,
  phone         text,
  email         text,
  motto         text,        -- devise (optionnelle)
  establishment_no text,     -- N° officiel de l'unité (facultatif)
  color_primary   text,      -- couleur principale (#RRGGBB)
  color_secondary text,      -- couleur secondaire
  position      integer NOT NULL DEFAULT 0,   -- ordre d'affichage
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz
);

CREATE INDEX IF NOT EXISTS school_units_school_idx ON school_units (school_id);

-- Rattachement explicite d'une classe à une unité pédagogique (nullable).
ALTER TABLE classes ADD COLUMN IF NOT EXISTS unit_id uuid REFERENCES school_units(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS classes_unit_idx ON classes (unit_id);

-- ── RLS : isolation par établissement (même modèle que les autres tables) ──────
ALTER TABLE school_units ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS school_units_rw ON school_units;
CREATE POLICY school_units_rw ON school_units
  FOR ALL
  USING (
    school_id IN (
      SELECT school_id FROM school_users WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    school_id IN (
      SELECT school_id FROM school_users WHERE user_id = auth.uid()
    )
  );

-- Les assets d'unité (logo/cachet/signature) réutilisent le bucket `school-assets`
-- sous le préfixe `${school_id}/units/${unit_id}/…` — aucune table/bucket en plus.
