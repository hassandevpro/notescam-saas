-- ============================================================================
-- BRIGHT CONTINENT — espagnol notable en 6e et en 5e, puis report des 12 notes
-- ============================================================================
-- École : a8b8fb00-7184-4aec-a39a-3d93a723000a
--
-- POURQUOI. Le référentiel national ne définit l'espagnol qu'à partir de la 4e
-- (2e langue vivante au programme). Les classes « ESP » de cette école
-- l'enseignent dès la 6e : sans compétence, l'écran APC n'offre même pas la
-- matière, et les 12 notes de séquence 1 (5ème 8, 6ème 4) n'ont nulle part où
-- aller.
--
-- CE QUI EST CRÉÉ : 6 compétences PROPRES À CETTE ÉCOLE (`school_id` renseigné,
-- donc invisibles pour les 43 autres), une par trimestre pour la 6e et la 5e.
-- Les intitulés prolongent le motif du ministère — 50 mots en 3e, 40 en 4e,
-- donc 30 en 5e et 20 en 6e — et reprennent ses thèmes par trimestre.
--
-- CE QUI N'EST PAS TOUCHÉ, ET POURQUOI
--   · `apc_competences` nationales : aucune ligne du ministère n'est modifiée.
--   · `apc_classe_matieres` : cette table n'a PAS de `school_id`. Y ajouter
--     l'espagnol en 6e/5e le poserait pour les 44 écoles. On s'en abstient :
--     `coefFor` (apc_engine.js:188) retombe alors sur
--     `apc_matieres.espagnol.coefficient`, qui vaut déjà **2** — exactement le
--     coefficient que la 4e et la 3e lui donnent. Rien n'est perdu.
--   · `grades` : les 118 notes y restent.
-- ============================================================================

BEGIN;

-- ── 1. Les six compétences de l'école ──────────────────────────────────────
with nouvelles(classe_id, trimestre_id, intitule) as (values
  ('6e','t1','Comprendre et produire des messages écrits d’au moins 20 mots, relatifs à la famille et la société, à l’environnement, la santé et le bien-être.'),
  ('6e','t2','Comprendre et produire des messages écrits d’au moins 20 mots, relatifs à la citoyenneté et à la vie économique'),
  ('6e','t3','Comprendre et produire des messages écrits d’au moins 20 mots, relatifs aux medias et à la communication'),
  ('5e','t1','Comprendre et produire des messages écrits d’au moins 30 mots, relatifs à la famille et la société, à l’environnement, la santé et le bien-être.'),
  ('5e','t2','Comprendre et produire des messages écrits d’au moins 30 mots, relatifs à la citoyenneté et à la vie économique'),
  ('5e','t3','Comprendre et produire des messages écrits d’au moins 30 mots, relatifs aux medias et à la communication')
)
insert into public.apc_competences
  (id, cycle_id, classe_id, trimestre_id, matiere_id, ordre, intitule, actif, school_id)
select gen_random_uuid(), 'premier_cycle', n.classe_id, n.trimestre_id, 'espagnol', 1,
       n.intitule, true, 'a8b8fb00-7184-4aec-a39a-3d93a723000a'
  from nouvelles n;

-- ── 2. Les 12 notes, sur la compétence du trimestre 1 ──────────────────────
with cible as (
  select ac.id as competence_id,
         case ac.classe_id when '6e' then '6ème' when '5e' then '5ème' end as classe_name
    from public.apc_competences ac
   where ac.school_id   = 'a8b8fb00-7184-4aec-a39a-3d93a723000a'
     and ac.matiere_id  = 'espagnol'
     and ac.trimestre_id = 't1'
)
insert into public.apc_notes
  (id, school_id, eleve_id, competence_id, sequence_id, enseignant_id, note, note_max, date_saisie, version)
select gen_random_uuid(), 'a8b8fb00-7184-4aec-a39a-3d93a723000a',
       g.student_id, ci.competence_id, 's1', null, g.value::numeric, null, now(), 1
  from public.grades g
  join public.students st on st.id = g.student_id
  join public.classes  c  on c.id  = st.class_id
  join public.subjects su on su.id = g.subject_id
  join cible ci on ci.classe_name = c.name
 where g.school_id = 'a8b8fb00-7184-4aec-a39a-3d93a723000a'
   and g.sequence = 1
   and su.name = 'Espagnol'
on conflict (eleve_id, competence_id, sequence_id) do nothing;

-- ── AUTO-CONTRÔLE ──────────────────────────────────────────────────────────
-- 6 compétences maison, 128 + 12 = 140 notes APC, et les 118 notes de `grades`
-- intactes. Tout écart annule la transaction entière.
DO $$
DECLARE n_comp int; n_apc int; n_grades int; n_nat int;
BEGIN
  SELECT count(*) INTO n_comp FROM public.apc_competences
   WHERE school_id = 'a8b8fb00-7184-4aec-a39a-3d93a723000a';
  SELECT count(*) INTO n_apc  FROM public.apc_notes
   WHERE school_id = 'a8b8fb00-7184-4aec-a39a-3d93a723000a';
  SELECT count(*) INTO n_grades FROM public.grades
   WHERE school_id = 'a8b8fb00-7184-4aec-a39a-3d93a723000a';
  SELECT count(*) INTO n_nat FROM public.apc_competences
   WHERE school_id IS NULL AND matiere_id = 'espagnol';
  IF n_comp <> 6 OR n_apc <> 140 OR n_grades <> 118 OR n_nat <> 12 THEN
    RAISE EXCEPTION 'Contrôle refusé : maison=% (6), apc_notes=% (140), grades=% (118), national espagnol=% (12)',
      n_comp, n_apc, n_grades, n_nat;
  END IF;
END $$;

COMMIT;
