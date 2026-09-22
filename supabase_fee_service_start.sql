-- ════════════════════════════════════════════════════════════════════════════
-- SERVICES SCOLAIRES — B6 : date de souscription AU SERVICE
-- ════════════════════════════════════════════════════════════════════════════
-- Jusqu'ici, les échéances d'un service partaient de la date d'inscription à
-- L'ÉCOLE. Or un élève présent depuis septembre peut prendre la cantine en
-- février : lui facturer septembre parce qu'il était déjà scolarisé revient à
-- lui faire payer des repas qu'il n'a pas pris.
--
-- L'état de cantine de l'école le montre noir sur blanc : « Inscrits le
-- 13/02/2026 », « INSCRIPTION 15/10/25 », « Inscrit pour avril et mai ». La date
-- d'entrée dans un SERVICE est une donnée à part entière, distincte de la date
-- d'entrée dans l'établissement.
--
-- ADDITIVE ET SANS EFFET SUR L'EXISTANT. `started_at` est NULLABLE et vaut NULL
-- pour toutes les souscriptions déjà enregistrées. Le moteur retombe alors sur
-- la date d'inscription scolaire — exactement le comportement d'aujourd'hui.
-- Aucune échéance n'est régénérée, aucun montant n'est retouché, aucune année
-- passée n'est réécrite.
--
-- POURQUOI SUR `student_fee_items` ET PAS AILLEURS. C'est la SOUSCRIPTION : la
-- ligne qui porte déjà le montant figé, la catégorie et le statut de ce service
-- pour cet élève. La placer sur `students` en ferait une date unique pour tous
-- les services (or cantine et transport commencent rarement le même jour) ; sur
-- `fee_catalog`, une date commune à toute l'école ; sur `fee_schedule_items`,
-- une donnée répétée sur chaque période, donc douze occasions de diverger.
--
-- L'unicité (student_id, fee_catalog_id, academic_year) déjà posée sur la table
-- garantit qu'un élève a UNE date par service ET PAR ANNÉE : la cantine
-- 2026/2027 ne réécrit pas la cantine 2025/2026.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.student_fee_items
  ADD COLUMN IF NOT EXISTS started_at TEXT;

COMMENT ON COLUMN public.student_fee_items.started_at IS
  'Date (ISO) d''entrée de l''élève DANS CE SERVICE. NULL = repli sur la date '
  'd''inscription scolaire (comportement antérieur à B6). Aucune période '
  'entièrement écoulée avant cette date n''est facturée ; la période EN COURS à '
  'cette date est due en entier.';

-- Contrôle
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'student_fee_items'
  AND column_name = 'started_at';
