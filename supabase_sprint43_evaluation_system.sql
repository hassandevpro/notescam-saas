-- Sprint 43 — Table EvaluationSystem (moteur d'évaluation par profil éducatif)
--
-- Stocke, par système éducatif, les règles de calcul académique : type de
-- période, type d'évaluation, formule, coefficients, pondérations, seuils de
-- réussite/redoublement, règles de classement et d'arrondi.
--
-- ⚠️ Source de vérité applicative : le bloc `evaluation` dans
-- `src/countries/<pays>.js` (consommé par `bulletinEngine`). Cette table en est
-- le miroir persistant (SuperAdmin / audit / futures éditions serveur).
--
-- Le système n'applique JAMAIS la formule d'un pays à un autre : chaque profil
-- a sa propre ligne. 100 % additif — à exécuter une fois dans Supabase.

create table if not exists public.evaluation_system (
  country_system    text primary key,          -- 'guinea_eq', 'cameroon_fr', 'cameroon_en'
  period_type       text not null,             -- 'trimestre' | 'sequence' | 'term'
  evaluation_model  text not null,             -- 'continua' | 'sequentiel' | 'term'
  subject_formula   text not null,             -- formule de la note finale par matière
  term_formula      text not null,             -- formule de la moyenne périodique
  annual_formula    text not null,             -- formule de la moyenne annuelle
  uses_coefficients jsonb not null default '{}'::jsonb,  -- coef par cycle
  weighting         text,                      -- description des pondérations
  continuous_assessment boolean not null default false,
  exams             boolean not null default false,
  pass_threshold    numeric not null,          -- seuil de réussite (sur l'échelle du pays)
  grade_max         numeric not null,          -- échelle (10, 20, 100)
  promotion_rules   jsonb not null default '{}'::jsonb,
  repeat_rules      jsonb not null default '{}'::jsonb,
  ranking_rules     jsonb not null default '{}'::jsonb,
  rounding_rules    jsonb not null default '{}'::jsonb,
  official_exam     text,
  updated_at        timestamptz default now()
);

-- ── Guinée Équatoriale (modèle espagnol, évaluation continue) ────────────────
insert into public.evaluation_system (
  country_system, period_type, evaluation_model, subject_formula, term_formula,
  annual_formula, uses_coefficients, weighting, continuous_assessment, exams,
  pass_threshold, grade_max, promotion_rules, repeat_rules, ranking_rules,
  rounding_rules, official_exam
) values (
  'guinea_eq', 'trimestre', 'continua',
  'Nota final de asignatura = media de los tres trimestres.',
  'Media del trimestre ponderada por coeficiente (Secundaria) o simple (Primaria).',
  'Media de los tres trimestres.',
  '{"secundaria": true, "primaria": "configurable (ge_primary_coef)"}'::jsonb,
  'La repartición control continuo / examen no está fijada nacionalmente; se registra la nota consolidada de evaluación continua por trimestre.',
  true, true,
  5, 10,
  '{"primaria":"media anual >= 5","esba_bachillerato":"promociona con un máximo de 2 asignaturas suspensas, salvo Matemáticas y Lengua Española simultáneamente","bachillerato_2":"todas las asignaturas aprobadas"}'::jsonb,
  '{"recuperacion":"examen extraordinario de las asignaturas suspensas","repite":"no cumple promoción tras la recuperación"}'::jsonb,
  '{"order":"desc","tie":"ex_aequo","by":"media"}'::jsonb,
  '{"decimals":2,"mode":"half_up"}'::jsonb,
  'Selectividad (UNGE) tras 2º Bachillerato'
) on conflict (country_system) do nothing;

-- ── Cameroun francophone (/20, séquentiel) ───────────────────────────────────
insert into public.evaluation_system (
  country_system, period_type, evaluation_model, subject_formula, term_formula,
  annual_formula, uses_coefficients, continuous_assessment, exams,
  pass_threshold, grade_max, promotion_rules, ranking_rules, rounding_rules
) values (
  'cameroon_fr', 'sequence', 'sequentiel',
  'Moyenne des séquences pondérée par coefficient.',
  'Moyenne des séquences du trimestre.',
  'Moyenne des 6 séquences.',
  '{"default": true}'::jsonb, true, true,
  10, 20,
  '{"rule":"moyenne annuelle >= 10"}'::jsonb,
  '{"order":"desc","tie":"ex_aequo"}'::jsonb,
  '{"decimals":2,"mode":"half_up"}'::jsonb
) on conflict (country_system) do nothing;

-- ── Cameroun anglophone (/100, terms) ────────────────────────────────────────
insert into public.evaluation_system (
  country_system, period_type, evaluation_model, subject_formula, term_formula,
  annual_formula, uses_coefficients, continuous_assessment, exams,
  pass_threshold, grade_max, promotion_rules, ranking_rules, rounding_rules
) values (
  'cameroon_en', 'term', 'term',
  'Weighted mean by coefficient.',
  'Term average.',
  'Mean of 3 terms.',
  '{"default": true}'::jsonb, true, true,
  50, 100,
  '{"rule":"annual average >= 50"}'::jsonb,
  '{"order":"desc","tie":"ex_aequo"}'::jsonb,
  '{"decimals":2,"mode":"half_up"}'::jsonb
) on conflict (country_system) do nothing;
