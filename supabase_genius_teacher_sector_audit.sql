-- supabase_genius_teacher_sector_audit.sql
-- LECTURE SEULE — aucune écriture, aucune table créée, aucun DDL.
--
-- Classe chaque enseignant de THE GENIUS d'après le secteur de ses classes, sans
-- rien décider ni rien modifier. Sert à établir le rapport AVANT migration :
-- combien de maternelle / primaire / collège, combien sans classe, et surtout
-- QUELS enseignants chevauchent plusieurs secteurs — les seuls cas que la
-- migration ne tranchera pas d'elle-même.
--
-- Le secteur est calculé par `public.class_sector()` (§ supabase_genius_role_permissions.sql),
-- la même fonction que celle qui gouverne le cloisonnement. On mesure donc bien ce
-- que le système appliquera, pas une approximation.
--
-- Un enseignant « intervient » dans une classe s'il en est TITULAIRE
-- (classes.teacher_id) ou s'il y assure une MATIÈRE (subjects.teacher_id) — la
-- définition exacte de `teacherSectors()` côté serveur LAN.

SELECT t.id,
       t.name,
       COALESCE(sec.secteurs, ARRAY[]::text[])        AS secteurs,
       COALESCE(array_length(sec.secteurs, 1), 0)     AS nb_secteurs
  FROM public.teachers t
  LEFT JOIN LATERAL (
       SELECT array_agg(DISTINCT q.s ORDER BY q.s) AS secteurs
         FROM (
              SELECT public.class_sector(c.id) AS s
                FROM public.classes c
               WHERE c.school_id = t.school_id
                 AND (c.teacher_id = t.id
                      OR EXISTS (SELECT 1
                                   FROM public.subjects sub
                                  WHERE sub.class_id = c.id
                                    AND sub.teacher_id = t.id))
              ) q
        WHERE q.s IS NOT NULL
       ) sec ON TRUE
 WHERE t.school_id = '6b68407b-3d2e-426b-81ff-c4e68e66120a'
 ORDER BY nb_secteurs DESC, t.name;
