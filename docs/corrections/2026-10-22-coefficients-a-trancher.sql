-- SEPT COEFFICIENTS QUE LE DÉDOUBLONNAGE N'A PAS TRANCHÉS
--
-- ⚠️  NON APPLIQUÉ. Ce fichier est une PROPOSITION. Rien ne doit en partir vers
--     la production avant que l'école ait dit quel coefficient elle veut.
--
-- D'OÙ VIENT LA QUESTION. Le 2026-10-22, 34 matières de classe en double ont été
-- fusionnées (`2026-10-22-matieres-doublons.sql`). Dans sept cas, les deux
-- copies ne portaient PAS le même coefficient. Le dédoublonnage a gardé celui de
-- la ligne conservée — celle qui portait les notes — et n'a touché à aucun
-- coefficient : changer un coefficient change une MOYENNE, et personne ne l'avait
-- demandé.
--
-- Les deux valeurs sont donc connues, et c'est l'école qui tranche. Le
-- coefficient en vigueur AUJOURD'HUI est celui marqué « gardé ».
--
--   ÉCOLE    CLASSE      MATIÈRE              GARDÉ   AUTRE COPIE
--   goudja   5ème B      Anglais                3         4
--   goudja   6ème A      Anglais                3         4
--   goudja   Form 1 A    Biology                3         2
--   goudja   Form 1 A    Physical Education     2         1
--   GENIUS   5eme        Étude de texte         2         1
--   GENIUS   5eme        Histoire               2         1
--   GENIUS   5eme        SVT                    2         1
--
-- CE QU'ON PEUT DIRE SANS L'ÉCOLE, et rien de plus :
--   · chez goudja, « Anglais » à 4 serait cohérent avec Français et
--     Mathématiques, tous deux à 4 dans les deux classes — mais la ligne qui
--     portait les notes disait 3 ;
--   · chez GENIUS, le référentiel APC du premier cycle donne 2 à SVT comme à
--     Histoire ; les valeurs gardées (2) sont donc les plus plausibles, et
--     c'est pour cela qu'aucune ligne de ce fichier n'est indispensable.
--
-- L'ÉCOLE PEUT LE FAIRE SEULE, et c'est préférable : « Modifier la classe » →
-- le coefficient de la matière. Ce fichier n'existe que pour le cas où elle
-- demanderait qu'on le fasse à sa place, sur plusieurs classes à la fois.
--
-- POUR APPLIQUER : décommenter SEULEMENT les lignes que l'école a validées.

BEGIN;

-- goudja · 5ème B · Anglais : 3 → 4
-- UPDATE public.subjects SET coef = 4 WHERE id = 'edd0bad6-14c1-4611-94d1-6e6a82d60adf';

-- goudja · 6ème A · Anglais : 3 → 4
-- UPDATE public.subjects SET coef = 4 WHERE id = 'c60d43ac-4a36-4fc8-b609-de59ef4abfdd';

-- goudja · Form 1 A · Biology : 3 → 2
-- UPDATE public.subjects SET coef = 2 WHERE id = '41731fe9-ed6a-4a80-8339-67c878c6677a';

-- goudja · Form 1 A · Physical Education : 2 → 1
-- UPDATE public.subjects SET coef = 1 WHERE id = '733517de-40a4-4ab8-ad4a-30d884750ec0';

-- THE GENIUS · 5eme · Étude de texte : 2 → 1
-- UPDATE public.subjects SET coef = 1 WHERE id = '2ca0d1d8-36ef-cea4-d151-58d1a60d079c';

-- THE GENIUS · 5eme · Histoire : 2 → 1
-- UPDATE public.subjects SET coef = 1 WHERE id = '8c8ffabc-7c1a-42d3-9ba7-76a0f1c9df6d';

-- THE GENIUS · 5eme · SVT : 2 → 1
-- UPDATE public.subjects SET coef = 1 WHERE id = 'ffde423f-d691-c7d0-03b5-5bcee617aba8';

COMMIT;

-- ── RETOUR ARRIÈRE ─────────────────────────────────────────────────────────
-- Les coefficients EN VIGUEUR au 2026-10-22, après dédoublonnage. Exécuter ce
-- lot remet exactement l'état d'aujourd'hui, quelle que soit la ligne appliquée.
--
--   UPDATE public.subjects SET coef = 3 WHERE id = 'edd0bad6-14c1-4611-94d1-6e6a82d60adf';
--   UPDATE public.subjects SET coef = 3 WHERE id = 'c60d43ac-4a36-4fc8-b609-de59ef4abfdd';
--   UPDATE public.subjects SET coef = 3 WHERE id = '41731fe9-ed6a-4a80-8339-67c878c6677a';
--   UPDATE public.subjects SET coef = 2 WHERE id = '733517de-40a4-4ab8-ad4a-30d884750ec0';
--   UPDATE public.subjects SET coef = 2 WHERE id = '2ca0d1d8-36ef-cea4-d151-58d1a60d079c';
--   UPDATE public.subjects SET coef = 2 WHERE id = '8c8ffabc-7c1a-42d3-9ba7-76a0f1c9df6d';
--   UPDATE public.subjects SET coef = 2 WHERE id = 'ffde423f-d691-c7d0-03b5-5bcee617aba8';
--
-- ATTENTION : une moyenne déjà imprimée et remise à un parent ne se rattrape
-- pas par un retour arrière. Si des bulletins sont sortis, le changement de
-- coefficient doit être une décision assumée de l'école, pas une correction.
