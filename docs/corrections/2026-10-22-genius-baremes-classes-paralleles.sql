-- DEUX CLASSES DU MÊME NIVEAU, DEUX BARÈMES — THE GENIUS
--
-- ⚠️  NON APPLIQUÉ. Proposition : c'est l'école qui dit sur quel barème elle
--     note son primaire anglophone et sa maternelle. Rien ne part sans sa
--     réponse.
--
-- RELEVÉ EN PRODUCTION le 2026-10-22, école `6b68407b-…` :
--
--   CLASSE          SYSTÈME  grade_max (classe)  barème des matières  ÉLÈVES  NOTES
--   Class 1 A         EN           /20                  /100            22      0
--   Class 1 B         EN           /100                 /100            23      0
--   NURSERY 1 A       FR           /20                  /20             38      0
--   NURSERY 1 B       EN           /100                 /100            37      0
--
-- TROIS ÉCARTS, et ils ne se corrigent pas de la même façon.
--
-- 1. Class 1 A se CONTREDIT ELLE-MÊME. `classes.grade_max = 20` décide de la
--    moyenne générale imprimée, mais ses douze matières sont toutes notées
--    /100. Une note de 80/100 saisie dans cette classe ressortirait rapportée à
--    une échelle /20 : l'élève afficherait 80 sur un bulletin qui annonce /20.
--    C'est le seul des trois écarts qui est un DÉFAUT, pas un choix — les deux
--    nombres doivent s'accorder, quel que soit celui que l'école retient.
--
-- 2. Class 1 A et Class 1 B, mêmes élèves de même niveau, ne sortent pas sur la
--    même échelle. Les moyennes ne sont pas comparables, et le tableau
--    d'honneur du niveau non plus. L'école doit choisir UNE échelle pour
--    Class 1 — /100 est celle de ses six classes anglophones (Class 1 B à
--    Class 6, toutes à /100 sauf Class 2 et Class 3, à /20 : à vérifier aussi).
--
-- 3. NURSERY 1 A est déclarée FRANCOPHONE (`system = 'FR'`, /20) et NURSERY 1 B
--    ANGLOPHONE (/100). Ce n'est peut-être PAS une erreur : une école bilingue
--    ouvre couramment une section de chaque côté sur un même niveau. À
--    confirmer avant de toucher quoi que ce soit — aligner les deux
--    supprimerait une distinction que l'école a peut-être voulue.
--
-- LE MOMENT EST FAVORABLE : ces quatre classes portent ZÉRO note. Changer
-- l'échelle maintenant ne touche aucune saisie. Après les premières notes, le
-- même changement déplacerait des moyennes déjà vues par des parents.
--
-- POUR APPLIQUER : décommenter SEULEMENT ce que l'école a validé.

BEGIN;

-- HYPOTHÈSE A — Class 1 suit ses sœurs anglophones : tout en /100.
--   Corrige du même coup la contradiction interne de Class 1 A.
-- UPDATE public.classes SET grade_max = 100 WHERE id = 'fff0dea2-8a34-49ac-a0d2-4b2818455290';  -- Class 1 A

-- HYPOTHÈSE B — Class 1 reste en /20 : il faut alors ramener SES MATIÈRES à /20,
--   sinon la contradiction se déplace sans disparaître.
-- UPDATE public.classes  SET grade_max = 20 WHERE id = 'd9155c1f-843c-41cc-9288-0b06e3236a60';  -- Class 1 B
-- UPDATE public.subjects SET max = 20, max_grade = 20
--   WHERE class_id IN ('fff0dea2-8a34-49ac-a0d2-4b2818455290', 'd9155c1f-843c-41cc-9288-0b06e3236a60');

-- NURSERY 1 — à ne décommenter QUE si l'école confirme que les deux sections
--   sont du même côté linguistique. Sinon, l'écart est volontaire : ne rien faire.
-- UPDATE public.classes SET system = 'EN', grade_max = 100 WHERE id = 'e22ee7ff-99dd-4d99-9ecb-dc8aeae9e97b';  -- NURSERY 1 A

COMMIT;

-- ── RETOUR ARRIÈRE ─────────────────────────────────────────────────────────
-- État EN VIGUEUR au 2026-10-22, à remettre tel quel :
--
--   UPDATE public.classes SET grade_max = 20            WHERE id = 'fff0dea2-8a34-49ac-a0d2-4b2818455290';
--   UPDATE public.classes SET grade_max = 100           WHERE id = 'd9155c1f-843c-41cc-9288-0b06e3236a60';
--   UPDATE public.classes SET system = 'FR', grade_max = 20 WHERE id = 'e22ee7ff-99dd-4d99-9ecb-dc8aeae9e97b';
--   UPDATE public.classes SET grade_max = 100           WHERE id = 'a35c0204-5993-4420-b454-6da82502b2ca';
--   UPDATE public.subjects SET max = 100, max_grade = 100
--     WHERE class_id IN ('fff0dea2-8a34-49ac-a0d2-4b2818455290', 'd9155c1f-843c-41cc-9288-0b06e3236a60');
--
-- (Les douze matières de chacune des deux Class 1 sont actuellement à /100 ;
--  NURSERY 1 A à /20, NURSERY 1 B à /100.)
