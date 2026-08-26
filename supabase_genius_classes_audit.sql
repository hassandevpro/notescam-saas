-- supabase_genius_classes_audit.sql
-- LECTURE SEULE — aucune écriture, aucun DDL.
--
-- Pourquoi ce second audit : le premier a rendu 0 enseignant classable sur 11.
-- Deux causes opposées produisent ce même résultat, et elles appellent des
-- migrations contraires :
--   (a) les enseignants ne sont rattachés à aucune classe ni matière ;
--   (b) ils le sont, mais les CLASSES elles-mêmes n'ont ni `cycle` ni `section`,
--       donc `class_sector()` rend NULL pour chacune.
--
-- Si c'est (b), le problème dépasse largement les enseignants : `allowsClass()`
-- et les policies de cloisonnement lisent exactement les mêmes colonnes.
--
-- Une ligne par classe : ce qu'elle déclare, le secteur qu'en tire le système,
-- si elle a un titulaire, et combien de ses matières portent un enseignant.

SELECT c.name                                   AS classe,
       c.level,
       c.cycle,
       c.section,
       public.class_sector(c.id)                AS secteur_calcule,
       (c.teacher_id IS NOT NULL)               AS a_un_titulaire,
       (SELECT count(*) FROM public.subjects s WHERE s.class_id = c.id)                        AS nb_matieres,
       (SELECT count(*) FROM public.subjects s WHERE s.class_id = c.id AND s.teacher_id IS NOT NULL) AS nb_matieres_avec_enseignant
  FROM public.classes c
 WHERE c.school_id = '6b68407b-3d2e-426b-81ff-c4e68e66120a'
 ORDER BY (public.class_sector(c.id) IS NULL) DESC, c.name;
