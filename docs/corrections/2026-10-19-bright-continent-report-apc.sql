-- ============================================================================
-- BRIGHT CONTINENT — reporter les notes de séquence 1 sur la PREMIÈRE
-- compétence de chaque matière (moteur APC MINESEC)
-- ============================================================================
-- École : a8b8fb00-7184-4aec-a39a-3d93a723000a · séquence s1 (Trimestre 1)
--
-- POURQUOI. `schools.bulletin_engine = 'officiel'` : les classes 6e–3e sont
-- pilotées par le moteur APC, dont l'écran de saisie et le bulletin officiel
-- lisent `apc_notes` — jamais `grades`. Les 118 notes importées vivaient donc
-- dans `grades`, correctes mais invisibles partout sauf au bulletin
-- « Classique ». Ce script les REPORTE, sans rien retirer de `grades`.
--
-- RÈGLE APPLIQUÉE, telle que demandée : chaque note va sur la PREMIÈRE
-- compétence de sa matière pour (classe, trimestre t1) — « première » = plus
-- petit `ordre`, puis `id` pour départager. Déterministe.
--
-- CE QUI N'EST PAS ÉCRIT, ET POURQUOI
--   · 12 notes d'ESPAGNOL (5ème 8, 6ème 4) : le référentiel national ne définit
--     AUCUNE compétence d'espagnol pour 6e et 5e au trimestre 1. Il n'existe
--     donc pas de « première compétence » où les poser. La 4e et la 3e en ont,
--     et leurs 11 notes passent normalement. Les 12 restent dans `grades`.
--   · 4 notes de 6ème Mathématiques : l'école les a DÉJÀ saisies en APC le
--     15/10, avec exactement les mêmes valeurs (7,5 · 4,5 · 12,5 · 9,5).
--     `ON CONFLICT DO NOTHING` les laisse intactes — on n'écrase jamais une
--     saisie d'enseignant.
--
--   => 106 notes ont une cible, 4 existent déjà, donc 102 lignes créées.
--
-- `note_max` est laissé à NULL : c'est la convention du produit pour le barème
-- /20 (cf. ApcCompetenceWorkspace, « note_max est volontairement stocké NULL
-- pour le barème historique »). Écrire 20 dévierait de ce que l'application
-- elle-même enregistre.
-- ============================================================================

BEGIN;

with corresp(classe_name, apc_classe) as (values
  ('6ème','6e'), ('5ème','5e'), ('4ème Esp','4e'), ('3EME ESP','3e')
),
matiere_map(subject_name, apc_matiere) as (values
  ('Histoire','histoire'),
  ('Géographie','geographie'),
  ('ECM','ecm'),
  ('Éducation Civique','ecm'),
  ('Education à la Citoyenneté et à la Morale','ecm'),
  ('EPS','eps'),
  ('PCT','pct'),
  ('Espagnol','espagnol'),
  ('Mathématiques','mathematiques')
),
premiere as (
  select distinct on (classe_id, matiere_id) classe_id, matiere_id, id as competence_id
    from public.apc_competences
   where trimestre_id = 't1' and school_id is null
   order by classe_id, matiere_id, ordre, id
)
insert into public.apc_notes
  (id, school_id, eleve_id, competence_id, sequence_id, enseignant_id, note, note_max, date_saisie, version)
select gen_random_uuid(),
       'a8b8fb00-7184-4aec-a39a-3d93a723000a',
       g.student_id,
       p.competence_id,
       's1',
       null,
       g.value::numeric,
       null,
       now(),
       1
  from public.grades g
  join public.students st on st.id = g.student_id
  join public.classes  c  on c.id  = st.class_id
  join public.subjects su on su.id = g.subject_id
  join corresp     cr on cr.classe_name  = c.name
  join matiere_map mm on mm.subject_name = su.name
  join premiere    p  on p.classe_id = cr.apc_classe and p.matiere_id = mm.apc_matiere
 where g.school_id = 'a8b8fb00-7184-4aec-a39a-3d93a723000a'
   and g.sequence = 1
on conflict (eleve_id, competence_id, sequence_id) do nothing;

-- AUTO-CONTRÔLE : 26 lignes avant, 102 créées, 128 attendues. Les 118 notes de
-- `grades` doivent être INTACTES. Tout écart annule la transaction entière.
DO $$
DECLARE n_apc int; n_grades int;
BEGIN
  SELECT count(*) INTO n_apc    FROM public.apc_notes WHERE school_id = 'a8b8fb00-7184-4aec-a39a-3d93a723000a';
  SELECT count(*) INTO n_grades FROM public.grades    WHERE school_id = 'a8b8fb00-7184-4aec-a39a-3d93a723000a';
  IF n_apc <> 128 OR n_grades <> 118 THEN
    RAISE EXCEPTION 'Contrôle refusé : apc_notes=% (128 attendu), grades=% (118 attendu)', n_apc, n_grades;
  END IF;
END $$;

COMMIT;
