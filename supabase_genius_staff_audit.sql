-- supabase_genius_staff_audit.sql
-- LECTURE SEULE — aucune écriture, aucun DDL.
--
-- État du rattachement sectoriel du PERSONNEL de THE GENIUS, enseignants exclus
-- (ils vivent dans `teachers` et ont fait l'objet de leur propre audit).
--
-- Ce que cette lecture doit établir, avant toute décision :
--   • combien de fiches portent déjà un secteur, et lequel ;
--   • combien sont à NULL — c'est-à-dire « secteur non défini », et non
--     « transverse » : c'est toute la distinction posée par la décision du
--     26/08/2026, NULL n'est pas un secteur ;
--   • comment ces fiches se répartissent par département, pour repérer les
--     fonctions réellement transverses (RAF, comptabilité, direction générale)
--     de celles qui devraient relever d'un secteur.
--
-- Une ligne par personne : la synthèse est calculée à la lecture, pour disposer
-- en même temps du décompte et de la liste nominative des fiches à corriger.

SELECT s.id,
       s.name,
       COALESCE(s.department, '(sans département)') AS department,
       s.sector,
       s.fonction
  FROM public.staff s
 WHERE s.school_id = '6b68407b-3d2e-426b-81ff-c4e68e66120a'
 ORDER BY (s.sector IS NULL) DESC, s.department, s.name;
