-- Sprint 39 — Table CountryEducationConfig
--
-- Stocke, par système éducatif national, l'ensemble des paramètres
-- académiques / administratifs / linguistiques. Permet au SuperAdmin de
-- consulter (et à terme d'éditer côté serveur) la configuration pays sans
-- toucher au code.
--
-- ⚠️ Source de vérité : le code `src/countries/<pays>.js` reste la référence
-- chargée par l'application au runtime. Cette table en est le miroir
-- persistant (audit, SuperAdmin, futures éditions serveur). Les deux doivent
-- rester cohérents lors de l'ajout d'un pays.
--
-- À exécuter une seule fois dans Supabase (SQL editor). 100 % additif :
-- ne modifie aucune donnée existante.

create table if not exists public.country_education_config (
  country_system     text primary key,             -- 'guinea_eq', 'cameroon_fr', …
  country_name       text not null,
  flag               text,
  lang_primary       text not null,                -- 'es' | 'fr' | 'en'
  lang_secondary     text,
  grading_system     text not null,                -- 'ES_10' | 'FR_20' | 'EN_100'
  max_grade          numeric not null,
  pass_threshold     numeric not null,
  periods            jsonb  not null default '{}'::jsonb,   -- trimestres / séquences
  grade_scale        jsonb  not null default '[]'::jsonb,   -- mentions / apreciaciones
  passing_decisions  jsonb  not null default '[]'::jsonb,   -- décisions fin d'année
  exam_classes       jsonb  not null default '[]'::jsonb,   -- classes d'examen officiel
  levels             jsonb  not null default '[]'::jsonb,   -- cycles + niveaux
  default_subjects   jsonb  not null default '[]'::jsonb,   -- matières par défaut
  promotion_rules    jsonb  not null default '{}'::jsonb,   -- promotion / redoublement
  bulletin_template  text,                                  -- modèle de bulletin
  admin_titles       jsonb  not null default '{}'::jsonb,   -- intitulés administratifs
  document_types     jsonb  not null default '[]'::jsonb,   -- documents scolaires
  vocab              jsonb  not null default '{}'::jsonb,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);

-- NB : on n'ajoute PAS de clé étrangère schools.country_system →
-- country_education_config pour ne pas casser d'anciennes écoles dont la valeur
-- (ex. 'gabon') ne serait pas encore seedée. Le garde-fou reste le CHECK
-- défini au sprint 37.

-- ── Seed : Guinée Équatoriale (système réel, vérifié) ────────────────────────
insert into public.country_education_config (
  country_system, country_name, flag, lang_primary, lang_secondary,
  grading_system, max_grade, pass_threshold,
  periods, grade_scale, passing_decisions, exam_classes, levels,
  promotion_rules, bulletin_template, admin_titles, document_types, vocab
) values (
  'guinea_eq', 'Guinea Ecuatorial', '🇬🇶', 'es', null,
  'ES_10', 10, 5,
  '{"trimestres":[{"value":"trim_1","label":"Primer Trimestre","seqs":[1]},{"value":"trim_2","label":"Segundo Trimestre","seqs":[2]},{"value":"trim_3","label":"Tercer Trimestre","seqs":[3]}],"annual":{"value":"anual","label":"Anual","seqs":[1,2,3]}}'::jsonb,
  '[{"mention":"Sobresaliente","min":9,"max":10},{"mention":"Notable","min":7,"max":8.99},{"mention":"Bien","min":6,"max":6.99},{"mention":"Suficiente","min":5,"max":5.99},{"mention":"Insuficiente","min":0,"max":4.99}]'::jsonb,
  '[{"value":"aprobado","label":"Aprobado — pasa al curso siguiente"},{"value":"recuperacion","label":"Examen de recuperación"},{"value":"repite","label":"Repite el curso"},{"value":"expulsado","label":"Expulsado del centro"}]'::jsonb,
  '["6º Primaria","4º ESBA","2º Bachillerato"]'::jsonb,
  '[{"code":"maternelle","label":"Preescolar","items":["Inicial 1","Inicial 2","Inicial 3","Párvulos"]},{"code":"primaire","label":"Primaria","items":["1º Primaria","2º Primaria","3º Primaria","4º Primaria","5º Primaria","6º Primaria"]},{"code":"secondaire","label":"Secundaria y Bachillerato","items":["1º ESBA","2º ESBA","3º ESBA","4º ESBA","1º Bachillerato","2º Bachillerato"]}]'::jsonb,
  '{"promote":"media anual >= 5","retake":"recuperación si 4 <= media < 5","repeat":"media < 4 o suspende recuperación"}'::jsonb,
  'boletin_ge',
  '{"director":"Director / Directora","deputy":"Jefe de Estudios","secretary":"Secretario Académico","teacher":"Profesor / Profesora","tutor":"Tutor / Tutora"}'::jsonb,
  '["Boletín de calificaciones","Certificado de escolaridad","Certificado de asistencia","Ficha individual del alumno","Carné escolar","Acta de evaluación"]'::jsonb,
  '{"student":"Alumno","class":"Clase","subject":"Asignatura","teacher":"Profesor","average":"Media","rank":"Puesto","term":"Trimestre","year":"Año escolar","passed":"Aprobado","failed":"No aprobado"}'::jsonb
) on conflict (country_system) do nothing;

-- ── Seed : Cameroun francophone & anglophone (référence, valeurs résumées) ───
insert into public.country_education_config (
  country_system, country_name, flag, lang_primary, lang_secondary,
  grading_system, max_grade, pass_threshold, bulletin_template
) values
  ('cameroon_fr', 'Cameroun — Francophone', '🇨🇲', 'fr', 'en', 'FR_20', 20, 10, 'classic'),
  ('cameroon_en', 'Cameroon — Anglophone',  '🇨🇲', 'en', 'fr', 'EN_100', 100, 50, 'classic')
on conflict (country_system) do nothing;
