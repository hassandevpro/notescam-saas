-- LES 41 NOTES DE « FRENCH LANGUAGE » SONT DES COPIES — FORM1, THE GENIUS
--
-- SIGNALEMENT du 2026-10-22 : « un enseignant avec plusieurs matières, quand il
-- entre les notes d'une matière les autres héritent automatiquement », puis
-- « des matières qui se dupliquent à la saisie des notes et sur le bulletin ».
--
-- CE QUI S'EST PASSÉ. FORM1 porte « Français intensif » (coef 5) et « French
-- Language » (coef 4), tenues par le MÊME enseignant (BETEGNE GHISLAIN AIME).
-- Les deux noms passaient par la table d'alias de `src/core/apcMatiereMatch.js`
-- et rendaient les MÊMES matières du référentiel — { francais, french } —
-- parce que la classe est bilingue et que son catalogue porte les deux
-- identifiants, et parce que la boucle ajoutait TOUTES les cibles disponibles
-- au lieu d'une seule par groupe de traduction.
--
-- Conséquences, exactement celles signalées : l'écran de saisie ouvrait une
-- colonne « Français » ET une colonne « French », toutes deux rattachées aux
-- deux matières locales — une note saisie d'un côté se retrouvait de l'autre —
-- et le bulletin imprimait la matière deux fois.
--
-- MESURÉ EN BASE AVANT ÉCRITURE, et c'est ce qui autorise la suppression :
-- les 41 notes de « French Language » sont, élève par élève, IDENTIQUES à
-- celles de « Français intensif » (41 avec jumelle exacte, 0 sans), écrites à
-- 80 ms d'écart pour les 41 élèves. Aucun travail n'est perdu.
--
-- CE QUE CELA CORRIGE : la moyenne de FORM1. La note comptait DEUX fois, avec
-- deux coefficients différents, donc sur 9 points de coefficient au lieu de 5.
--
-- LA CAUSE EST CORRIGÉE DANS LE PRODUIT (groupes de traduction dans
-- `apcMatiereMatch.js`, verrouillés par `_apcMatiereMatch.test.mjs`) : une
-- matière locale ne peut plus couvrir à la fois « Français » et « French ».
-- ⚠️ Tant que ce correctif n'est pas LIVRÉ à l'école, le nettoyage se referait
-- à la prochaine saisie. Appliquer ce SQL sans livrer le code ne tient pas.
--
-- CE QUE CE SQL NE FAIT PAS : il ne touche pas à « Français intensif », qui
-- garde ses 41 notes, ni à aucun coefficient. Il ne supprime pas la LIGNE
-- matière « French Language » — si l'école l'enseigne vraiment, elle a sa place
-- dans la classe ; elle repart simplement sans note.
--
-- RETOUR ARRIÈRE : 2026-10-22-genius-form1-notes-copiees-RETOUR-ARRIERE.sql

BEGIN;

-- Garde-fou : le compte attendu, et la preuve que ce sont bien des copies.
DO $$
DECLARE n int; orphelines int;
BEGIN
  SELECT count(*) INTO n FROM public.grades
   WHERE subject_id = '1cc68fbc-f4bd-4405-a7fd-597160593fb0';
  IF n <> 41 THEN
    RAISE EXCEPTION 'Attendu 41 note(s) sur « French Language », trouvé % — régénérez le lot', n;
  END IF;

  SELECT count(*) INTO orphelines FROM public.grades g
   WHERE g.subject_id = '1cc68fbc-f4bd-4405-a7fd-597160593fb0'
     AND NOT EXISTS (
       SELECT 1 FROM public.grades k
        WHERE k.subject_id = 'aaef1310-c389-117f-abf6-f2a39971f564'
          AND k.student_id = g.student_id AND k.sequence = g.sequence AND k.value = g.value);
  IF orphelines > 0 THEN
    RAISE EXCEPTION '% note(s) de « French Language » n''ont PAS d''équivalent identique sur « Français intensif » : ce ne sont pas des copies, les supprimer perdrait du travail', orphelines;
  END IF;
END $$;

-- La suppression écrit un `sync_tombstones` par ligne (trigger `trg_tomb_grades`),
-- donc le serveur LAN de l'école retirera ces notes à son prochain cycle. Sans
-- cette propagation, l'école garderait ses copies ET les repousserait au Cloud.
DELETE FROM public.grades WHERE subject_id = '1cc68fbc-f4bd-4405-a7fd-597160593fb0';

DO $$
DECLARE g int; c int;
BEGIN
  SELECT count(*) INTO g FROM public.grades WHERE subject_id = 'aaef1310-c389-117f-abf6-f2a39971f564';
  SELECT count(*) INTO c FROM public.grades WHERE subject_id = '1cc68fbc-f4bd-4405-a7fd-597160593fb0';
  RAISE NOTICE 'Français intensif : % note(s) — French Language : % note(s)', g, c;
END $$;

COMMIT;
