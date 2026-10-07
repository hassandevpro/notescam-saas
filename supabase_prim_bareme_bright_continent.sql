-- BARÈME DU PRIMAIRE — Class 1 à 6, 11 compétences, 300 points
-- ============================================================================
-- SOURCE : le relevé de notes papier de BRIGHT CONTINENT BILINGUAL SCHOOL,
-- Class 1, relu ligne par ligne par l'établissement. L'école applique le MÊME
-- barème aux six niveaux : « à toutes les classes 1 à 6 ».
--
-- Maximums imprimés (Oral + Écrit + Pratique + Savoir-être = Total) :
--   1A  10 + 20 +  5 +  5  =   40
--   1B  10 + 25 +  3 +  2  =   40
--   1C  10 +  6 +  2 +  2  =   20
--   2A   5 + 30 +  3 +  2  =   40
--   2B   5 + 30 +  3 +  2  =   40
--   3A   5 + 10 +  3 +  2  =   20
--   3B   5 + 10 +  3 +  2  =   20
--   4A   5 + 10 +  3 +  2  =   20
--   5A   3 + 10 +  5 +  2  =   20
--   6A   3 +  5 + 10 +  2  =   20
--   6B   3 + 10 +  5 +  2  =   20
--                                              TOTAL GÉNÉRAL = 300
--
-- ── CE FICHIER REMPLACE DEUX AUTRES ─────────────────────────────────────────
-- Il rend caducs supabase_prim_bareme_classes_2_4.sql (qui propageait l'ancien
-- barème à 280 points, incomplet) et supabase_prim_bareme_cm1_cm2.sql. Les deux
-- sont supprimés du dépôt : laisser traîner un fichier qui écrit un barème
-- concurrent sur les mêmes niveaux est un piège, pas une sauvegarde.
--
-- Pour mémoire, le relevé CM1 lu séparément donnait des valeurs DIFFÉRENTES —
-- 1A=30 (8/15/5/2), 1B=30 (12/15/—/3), 3B=40 (5/30/3/2), 5A=20 (3/10/5/2),
-- lui aussi à 300 points. L'école a tranché pour un barème unique ; ces valeurs
-- sont conservées ici au cas où CM1/CM2 devraient un jour s'en écarter.
--
-- ── CE QUI CHANGE PAR RAPPORT AU SEED NATIONAL ──────────────────────────────
-- Le seed d'origine (supabase_prim_bareme_ua.sql) ne couvrait que SIL et CP, et
-- totalisait 280 : ses compétences 1A, 1B et 2A n'avaient aucune ligne
-- « pratique ». C'étaient exactement les 20 points manquants. Le relevé de
-- l'école les porte toutes les trois, et le compte tombe sur 300.
-- CE1, CE2, CM1 et CM2 n'avaient AUCUNE ligne : l'écran de saisie n'y affichait
-- pas une seule colonne.
--
-- ── PROFIL « INAPTE » DE 6A ─────────────────────────────────────────────────
-- Un élève dispensé de sport n'est pas noté sur la Pratique. Le relevé ne porte
-- pas ce profil : les valeurs (8 + 10 + 2 = 20) sont REPRISES DU SEED NATIONAL,
-- pas inventées, et conservent le même total que le profil apte. À corriger si
-- l'établissement en a un différent.
--
-- Additif, idempotent (ON CONFLICT DO UPDATE). Ne touche ni classes, ni élèves,
-- ni notes. À EXÉCUTER dans Supabase.
-- ============================================================================

INSERT INTO public.prim_bareme_criteres (id, niveau_id, competence_id, critere_id, aptitude, points_max, ordre) VALUES
  ('bc1-sil-1a-o-a','sil','1a','oral','apte',10,1),
  ('bc1-sil-1a-e-a','sil','1a','ecrit','apte',20,2),
  ('bc1-sil-1a-p-a','sil','1a','pratique','apte',5,3),
  ('bc1-sil-1a-s-a','sil','1a','savoir_etre','apte',5,4),
  ('bc1-sil-1b-o-a','sil','1b','oral','apte',10,1),
  ('bc1-sil-1b-e-a','sil','1b','ecrit','apte',25,2),
  ('bc1-sil-1b-p-a','sil','1b','pratique','apte',3,3),
  ('bc1-sil-1b-s-a','sil','1b','savoir_etre','apte',2,4),
  ('bc1-sil-1c-o-a','sil','1c','oral','apte',10,1),
  ('bc1-sil-1c-e-a','sil','1c','ecrit','apte',6,2),
  ('bc1-sil-1c-p-a','sil','1c','pratique','apte',2,3),
  ('bc1-sil-1c-s-a','sil','1c','savoir_etre','apte',2,4),
  ('bc1-sil-2a-o-a','sil','2a','oral','apte',5,1),
  ('bc1-sil-2a-e-a','sil','2a','ecrit','apte',30,2),
  ('bc1-sil-2a-p-a','sil','2a','pratique','apte',3,3),
  ('bc1-sil-2a-s-a','sil','2a','savoir_etre','apte',2,4),
  ('bc1-sil-2b-o-a','sil','2b','oral','apte',5,1),
  ('bc1-sil-2b-e-a','sil','2b','ecrit','apte',30,2),
  ('bc1-sil-2b-p-a','sil','2b','pratique','apte',3,3),
  ('bc1-sil-2b-s-a','sil','2b','savoir_etre','apte',2,4),
  ('bc1-sil-3a-o-a','sil','3a','oral','apte',5,1),
  ('bc1-sil-3a-e-a','sil','3a','ecrit','apte',10,2),
  ('bc1-sil-3a-p-a','sil','3a','pratique','apte',3,3),
  ('bc1-sil-3a-s-a','sil','3a','savoir_etre','apte',2,4),
  ('bc1-sil-3b-o-a','sil','3b','oral','apte',5,1),
  ('bc1-sil-3b-e-a','sil','3b','ecrit','apte',10,2),
  ('bc1-sil-3b-p-a','sil','3b','pratique','apte',3,3),
  ('bc1-sil-3b-s-a','sil','3b','savoir_etre','apte',2,4),
  ('bc1-sil-4a-o-a','sil','4a','oral','apte',5,1),
  ('bc1-sil-4a-e-a','sil','4a','ecrit','apte',10,2),
  ('bc1-sil-4a-p-a','sil','4a','pratique','apte',3,3),
  ('bc1-sil-4a-s-a','sil','4a','savoir_etre','apte',2,4),
  ('bc1-sil-5a-o-a','sil','5a','oral','apte',3,1),
  ('bc1-sil-5a-e-a','sil','5a','ecrit','apte',10,2),
  ('bc1-sil-5a-p-a','sil','5a','pratique','apte',5,3),
  ('bc1-sil-5a-s-a','sil','5a','savoir_etre','apte',2,4),
  ('bc1-sil-6a-o-a','sil','6a','oral','apte',3,1),
  ('bc1-sil-6a-e-a','sil','6a','ecrit','apte',5,2),
  ('bc1-sil-6a-p-a','sil','6a','pratique','apte',10,3),
  ('bc1-sil-6a-s-a','sil','6a','savoir_etre','apte',2,4),
  ('bc1-sil-6b-o-a','sil','6b','oral','apte',3,1),
  ('bc1-sil-6b-e-a','sil','6b','ecrit','apte',10,2),
  ('bc1-sil-6b-p-a','sil','6b','pratique','apte',5,3),
  ('bc1-sil-6b-s-a','sil','6b','savoir_etre','apte',2,4),
  ('bc1-sil-6a-o-i','sil','6a','oral','inapte',8,1),
  ('bc1-sil-6a-e-i','sil','6a','ecrit','inapte',10,2),
  ('bc1-sil-6a-s-i','sil','6a','savoir_etre','inapte',2,4),
  ('bc1-cp-1a-o-a','cp','1a','oral','apte',10,1),
  ('bc1-cp-1a-e-a','cp','1a','ecrit','apte',20,2),
  ('bc1-cp-1a-p-a','cp','1a','pratique','apte',5,3),
  ('bc1-cp-1a-s-a','cp','1a','savoir_etre','apte',5,4),
  ('bc1-cp-1b-o-a','cp','1b','oral','apte',10,1),
  ('bc1-cp-1b-e-a','cp','1b','ecrit','apte',25,2),
  ('bc1-cp-1b-p-a','cp','1b','pratique','apte',3,3),
  ('bc1-cp-1b-s-a','cp','1b','savoir_etre','apte',2,4),
  ('bc1-cp-1c-o-a','cp','1c','oral','apte',10,1),
  ('bc1-cp-1c-e-a','cp','1c','ecrit','apte',6,2),
  ('bc1-cp-1c-p-a','cp','1c','pratique','apte',2,3),
  ('bc1-cp-1c-s-a','cp','1c','savoir_etre','apte',2,4),
  ('bc1-cp-2a-o-a','cp','2a','oral','apte',5,1),
  ('bc1-cp-2a-e-a','cp','2a','ecrit','apte',30,2),
  ('bc1-cp-2a-p-a','cp','2a','pratique','apte',3,3),
  ('bc1-cp-2a-s-a','cp','2a','savoir_etre','apte',2,4),
  ('bc1-cp-2b-o-a','cp','2b','oral','apte',5,1),
  ('bc1-cp-2b-e-a','cp','2b','ecrit','apte',30,2),
  ('bc1-cp-2b-p-a','cp','2b','pratique','apte',3,3),
  ('bc1-cp-2b-s-a','cp','2b','savoir_etre','apte',2,4),
  ('bc1-cp-3a-o-a','cp','3a','oral','apte',5,1),
  ('bc1-cp-3a-e-a','cp','3a','ecrit','apte',10,2),
  ('bc1-cp-3a-p-a','cp','3a','pratique','apte',3,3),
  ('bc1-cp-3a-s-a','cp','3a','savoir_etre','apte',2,4),
  ('bc1-cp-3b-o-a','cp','3b','oral','apte',5,1),
  ('bc1-cp-3b-e-a','cp','3b','ecrit','apte',10,2),
  ('bc1-cp-3b-p-a','cp','3b','pratique','apte',3,3),
  ('bc1-cp-3b-s-a','cp','3b','savoir_etre','apte',2,4),
  ('bc1-cp-4a-o-a','cp','4a','oral','apte',5,1),
  ('bc1-cp-4a-e-a','cp','4a','ecrit','apte',10,2),
  ('bc1-cp-4a-p-a','cp','4a','pratique','apte',3,3),
  ('bc1-cp-4a-s-a','cp','4a','savoir_etre','apte',2,4),
  ('bc1-cp-5a-o-a','cp','5a','oral','apte',3,1),
  ('bc1-cp-5a-e-a','cp','5a','ecrit','apte',10,2),
  ('bc1-cp-5a-p-a','cp','5a','pratique','apte',5,3),
  ('bc1-cp-5a-s-a','cp','5a','savoir_etre','apte',2,4),
  ('bc1-cp-6a-o-a','cp','6a','oral','apte',3,1),
  ('bc1-cp-6a-e-a','cp','6a','ecrit','apte',5,2),
  ('bc1-cp-6a-p-a','cp','6a','pratique','apte',10,3),
  ('bc1-cp-6a-s-a','cp','6a','savoir_etre','apte',2,4),
  ('bc1-cp-6b-o-a','cp','6b','oral','apte',3,1),
  ('bc1-cp-6b-e-a','cp','6b','ecrit','apte',10,2),
  ('bc1-cp-6b-p-a','cp','6b','pratique','apte',5,3),
  ('bc1-cp-6b-s-a','cp','6b','savoir_etre','apte',2,4),
  ('bc1-cp-6a-o-i','cp','6a','oral','inapte',8,1),
  ('bc1-cp-6a-e-i','cp','6a','ecrit','inapte',10,2),
  ('bc1-cp-6a-s-i','cp','6a','savoir_etre','inapte',2,4),
  ('bc1-ce1-1a-o-a','ce1','1a','oral','apte',10,1),
  ('bc1-ce1-1a-e-a','ce1','1a','ecrit','apte',20,2),
  ('bc1-ce1-1a-p-a','ce1','1a','pratique','apte',5,3),
  ('bc1-ce1-1a-s-a','ce1','1a','savoir_etre','apte',5,4),
  ('bc1-ce1-1b-o-a','ce1','1b','oral','apte',10,1),
  ('bc1-ce1-1b-e-a','ce1','1b','ecrit','apte',25,2),
  ('bc1-ce1-1b-p-a','ce1','1b','pratique','apte',3,3),
  ('bc1-ce1-1b-s-a','ce1','1b','savoir_etre','apte',2,4),
  ('bc1-ce1-1c-o-a','ce1','1c','oral','apte',10,1),
  ('bc1-ce1-1c-e-a','ce1','1c','ecrit','apte',6,2),
  ('bc1-ce1-1c-p-a','ce1','1c','pratique','apte',2,3),
  ('bc1-ce1-1c-s-a','ce1','1c','savoir_etre','apte',2,4),
  ('bc1-ce1-2a-o-a','ce1','2a','oral','apte',5,1),
  ('bc1-ce1-2a-e-a','ce1','2a','ecrit','apte',30,2),
  ('bc1-ce1-2a-p-a','ce1','2a','pratique','apte',3,3),
  ('bc1-ce1-2a-s-a','ce1','2a','savoir_etre','apte',2,4),
  ('bc1-ce1-2b-o-a','ce1','2b','oral','apte',5,1),
  ('bc1-ce1-2b-e-a','ce1','2b','ecrit','apte',30,2),
  ('bc1-ce1-2b-p-a','ce1','2b','pratique','apte',3,3),
  ('bc1-ce1-2b-s-a','ce1','2b','savoir_etre','apte',2,4),
  ('bc1-ce1-3a-o-a','ce1','3a','oral','apte',5,1),
  ('bc1-ce1-3a-e-a','ce1','3a','ecrit','apte',10,2),
  ('bc1-ce1-3a-p-a','ce1','3a','pratique','apte',3,3),
  ('bc1-ce1-3a-s-a','ce1','3a','savoir_etre','apte',2,4),
  ('bc1-ce1-3b-o-a','ce1','3b','oral','apte',5,1),
  ('bc1-ce1-3b-e-a','ce1','3b','ecrit','apte',10,2),
  ('bc1-ce1-3b-p-a','ce1','3b','pratique','apte',3,3),
  ('bc1-ce1-3b-s-a','ce1','3b','savoir_etre','apte',2,4),
  ('bc1-ce1-4a-o-a','ce1','4a','oral','apte',5,1),
  ('bc1-ce1-4a-e-a','ce1','4a','ecrit','apte',10,2),
  ('bc1-ce1-4a-p-a','ce1','4a','pratique','apte',3,3),
  ('bc1-ce1-4a-s-a','ce1','4a','savoir_etre','apte',2,4),
  ('bc1-ce1-5a-o-a','ce1','5a','oral','apte',3,1),
  ('bc1-ce1-5a-e-a','ce1','5a','ecrit','apte',10,2),
  ('bc1-ce1-5a-p-a','ce1','5a','pratique','apte',5,3),
  ('bc1-ce1-5a-s-a','ce1','5a','savoir_etre','apte',2,4),
  ('bc1-ce1-6a-o-a','ce1','6a','oral','apte',3,1),
  ('bc1-ce1-6a-e-a','ce1','6a','ecrit','apte',5,2),
  ('bc1-ce1-6a-p-a','ce1','6a','pratique','apte',10,3),
  ('bc1-ce1-6a-s-a','ce1','6a','savoir_etre','apte',2,4),
  ('bc1-ce1-6b-o-a','ce1','6b','oral','apte',3,1),
  ('bc1-ce1-6b-e-a','ce1','6b','ecrit','apte',10,2),
  ('bc1-ce1-6b-p-a','ce1','6b','pratique','apte',5,3),
  ('bc1-ce1-6b-s-a','ce1','6b','savoir_etre','apte',2,4),
  ('bc1-ce1-6a-o-i','ce1','6a','oral','inapte',8,1),
  ('bc1-ce1-6a-e-i','ce1','6a','ecrit','inapte',10,2),
  ('bc1-ce1-6a-s-i','ce1','6a','savoir_etre','inapte',2,4),
  ('bc1-ce2-1a-o-a','ce2','1a','oral','apte',10,1),
  ('bc1-ce2-1a-e-a','ce2','1a','ecrit','apte',20,2),
  ('bc1-ce2-1a-p-a','ce2','1a','pratique','apte',5,3),
  ('bc1-ce2-1a-s-a','ce2','1a','savoir_etre','apte',5,4),
  ('bc1-ce2-1b-o-a','ce2','1b','oral','apte',10,1),
  ('bc1-ce2-1b-e-a','ce2','1b','ecrit','apte',25,2),
  ('bc1-ce2-1b-p-a','ce2','1b','pratique','apte',3,3),
  ('bc1-ce2-1b-s-a','ce2','1b','savoir_etre','apte',2,4),
  ('bc1-ce2-1c-o-a','ce2','1c','oral','apte',10,1),
  ('bc1-ce2-1c-e-a','ce2','1c','ecrit','apte',6,2),
  ('bc1-ce2-1c-p-a','ce2','1c','pratique','apte',2,3),
  ('bc1-ce2-1c-s-a','ce2','1c','savoir_etre','apte',2,4),
  ('bc1-ce2-2a-o-a','ce2','2a','oral','apte',5,1),
  ('bc1-ce2-2a-e-a','ce2','2a','ecrit','apte',30,2),
  ('bc1-ce2-2a-p-a','ce2','2a','pratique','apte',3,3),
  ('bc1-ce2-2a-s-a','ce2','2a','savoir_etre','apte',2,4),
  ('bc1-ce2-2b-o-a','ce2','2b','oral','apte',5,1),
  ('bc1-ce2-2b-e-a','ce2','2b','ecrit','apte',30,2),
  ('bc1-ce2-2b-p-a','ce2','2b','pratique','apte',3,3),
  ('bc1-ce2-2b-s-a','ce2','2b','savoir_etre','apte',2,4),
  ('bc1-ce2-3a-o-a','ce2','3a','oral','apte',5,1),
  ('bc1-ce2-3a-e-a','ce2','3a','ecrit','apte',10,2),
  ('bc1-ce2-3a-p-a','ce2','3a','pratique','apte',3,3),
  ('bc1-ce2-3a-s-a','ce2','3a','savoir_etre','apte',2,4),
  ('bc1-ce2-3b-o-a','ce2','3b','oral','apte',5,1),
  ('bc1-ce2-3b-e-a','ce2','3b','ecrit','apte',10,2),
  ('bc1-ce2-3b-p-a','ce2','3b','pratique','apte',3,3),
  ('bc1-ce2-3b-s-a','ce2','3b','savoir_etre','apte',2,4),
  ('bc1-ce2-4a-o-a','ce2','4a','oral','apte',5,1),
  ('bc1-ce2-4a-e-a','ce2','4a','ecrit','apte',10,2),
  ('bc1-ce2-4a-p-a','ce2','4a','pratique','apte',3,3),
  ('bc1-ce2-4a-s-a','ce2','4a','savoir_etre','apte',2,4),
  ('bc1-ce2-5a-o-a','ce2','5a','oral','apte',3,1),
  ('bc1-ce2-5a-e-a','ce2','5a','ecrit','apte',10,2),
  ('bc1-ce2-5a-p-a','ce2','5a','pratique','apte',5,3),
  ('bc1-ce2-5a-s-a','ce2','5a','savoir_etre','apte',2,4),
  ('bc1-ce2-6a-o-a','ce2','6a','oral','apte',3,1),
  ('bc1-ce2-6a-e-a','ce2','6a','ecrit','apte',5,2),
  ('bc1-ce2-6a-p-a','ce2','6a','pratique','apte',10,3),
  ('bc1-ce2-6a-s-a','ce2','6a','savoir_etre','apte',2,4),
  ('bc1-ce2-6b-o-a','ce2','6b','oral','apte',3,1),
  ('bc1-ce2-6b-e-a','ce2','6b','ecrit','apte',10,2),
  ('bc1-ce2-6b-p-a','ce2','6b','pratique','apte',5,3),
  ('bc1-ce2-6b-s-a','ce2','6b','savoir_etre','apte',2,4),
  ('bc1-ce2-6a-o-i','ce2','6a','oral','inapte',8,1),
  ('bc1-ce2-6a-e-i','ce2','6a','ecrit','inapte',10,2),
  ('bc1-ce2-6a-s-i','ce2','6a','savoir_etre','inapte',2,4),
  ('bc1-cm1-1a-o-a','cm1','1a','oral','apte',10,1),
  ('bc1-cm1-1a-e-a','cm1','1a','ecrit','apte',20,2),
  ('bc1-cm1-1a-p-a','cm1','1a','pratique','apte',5,3),
  ('bc1-cm1-1a-s-a','cm1','1a','savoir_etre','apte',5,4),
  ('bc1-cm1-1b-o-a','cm1','1b','oral','apte',10,1),
  ('bc1-cm1-1b-e-a','cm1','1b','ecrit','apte',25,2),
  ('bc1-cm1-1b-p-a','cm1','1b','pratique','apte',3,3),
  ('bc1-cm1-1b-s-a','cm1','1b','savoir_etre','apte',2,4),
  ('bc1-cm1-1c-o-a','cm1','1c','oral','apte',10,1),
  ('bc1-cm1-1c-e-a','cm1','1c','ecrit','apte',6,2),
  ('bc1-cm1-1c-p-a','cm1','1c','pratique','apte',2,3),
  ('bc1-cm1-1c-s-a','cm1','1c','savoir_etre','apte',2,4),
  ('bc1-cm1-2a-o-a','cm1','2a','oral','apte',5,1),
  ('bc1-cm1-2a-e-a','cm1','2a','ecrit','apte',30,2),
  ('bc1-cm1-2a-p-a','cm1','2a','pratique','apte',3,3),
  ('bc1-cm1-2a-s-a','cm1','2a','savoir_etre','apte',2,4),
  ('bc1-cm1-2b-o-a','cm1','2b','oral','apte',5,1),
  ('bc1-cm1-2b-e-a','cm1','2b','ecrit','apte',30,2),
  ('bc1-cm1-2b-p-a','cm1','2b','pratique','apte',3,3),
  ('bc1-cm1-2b-s-a','cm1','2b','savoir_etre','apte',2,4),
  ('bc1-cm1-3a-o-a','cm1','3a','oral','apte',5,1),
  ('bc1-cm1-3a-e-a','cm1','3a','ecrit','apte',10,2),
  ('bc1-cm1-3a-p-a','cm1','3a','pratique','apte',3,3),
  ('bc1-cm1-3a-s-a','cm1','3a','savoir_etre','apte',2,4),
  ('bc1-cm1-3b-o-a','cm1','3b','oral','apte',5,1),
  ('bc1-cm1-3b-e-a','cm1','3b','ecrit','apte',10,2),
  ('bc1-cm1-3b-p-a','cm1','3b','pratique','apte',3,3),
  ('bc1-cm1-3b-s-a','cm1','3b','savoir_etre','apte',2,4),
  ('bc1-cm1-4a-o-a','cm1','4a','oral','apte',5,1),
  ('bc1-cm1-4a-e-a','cm1','4a','ecrit','apte',10,2),
  ('bc1-cm1-4a-p-a','cm1','4a','pratique','apte',3,3),
  ('bc1-cm1-4a-s-a','cm1','4a','savoir_etre','apte',2,4),
  ('bc1-cm1-5a-o-a','cm1','5a','oral','apte',3,1),
  ('bc1-cm1-5a-e-a','cm1','5a','ecrit','apte',10,2),
  ('bc1-cm1-5a-p-a','cm1','5a','pratique','apte',5,3),
  ('bc1-cm1-5a-s-a','cm1','5a','savoir_etre','apte',2,4),
  ('bc1-cm1-6a-o-a','cm1','6a','oral','apte',3,1),
  ('bc1-cm1-6a-e-a','cm1','6a','ecrit','apte',5,2),
  ('bc1-cm1-6a-p-a','cm1','6a','pratique','apte',10,3),
  ('bc1-cm1-6a-s-a','cm1','6a','savoir_etre','apte',2,4),
  ('bc1-cm1-6b-o-a','cm1','6b','oral','apte',3,1),
  ('bc1-cm1-6b-e-a','cm1','6b','ecrit','apte',10,2),
  ('bc1-cm1-6b-p-a','cm1','6b','pratique','apte',5,3),
  ('bc1-cm1-6b-s-a','cm1','6b','savoir_etre','apte',2,4),
  ('bc1-cm1-6a-o-i','cm1','6a','oral','inapte',8,1),
  ('bc1-cm1-6a-e-i','cm1','6a','ecrit','inapte',10,2),
  ('bc1-cm1-6a-s-i','cm1','6a','savoir_etre','inapte',2,4),
  ('bc1-cm2-1a-o-a','cm2','1a','oral','apte',10,1),
  ('bc1-cm2-1a-e-a','cm2','1a','ecrit','apte',20,2),
  ('bc1-cm2-1a-p-a','cm2','1a','pratique','apte',5,3),
  ('bc1-cm2-1a-s-a','cm2','1a','savoir_etre','apte',5,4),
  ('bc1-cm2-1b-o-a','cm2','1b','oral','apte',10,1),
  ('bc1-cm2-1b-e-a','cm2','1b','ecrit','apte',25,2),
  ('bc1-cm2-1b-p-a','cm2','1b','pratique','apte',3,3),
  ('bc1-cm2-1b-s-a','cm2','1b','savoir_etre','apte',2,4),
  ('bc1-cm2-1c-o-a','cm2','1c','oral','apte',10,1),
  ('bc1-cm2-1c-e-a','cm2','1c','ecrit','apte',6,2),
  ('bc1-cm2-1c-p-a','cm2','1c','pratique','apte',2,3),
  ('bc1-cm2-1c-s-a','cm2','1c','savoir_etre','apte',2,4),
  ('bc1-cm2-2a-o-a','cm2','2a','oral','apte',5,1),
  ('bc1-cm2-2a-e-a','cm2','2a','ecrit','apte',30,2),
  ('bc1-cm2-2a-p-a','cm2','2a','pratique','apte',3,3),
  ('bc1-cm2-2a-s-a','cm2','2a','savoir_etre','apte',2,4),
  ('bc1-cm2-2b-o-a','cm2','2b','oral','apte',5,1),
  ('bc1-cm2-2b-e-a','cm2','2b','ecrit','apte',30,2),
  ('bc1-cm2-2b-p-a','cm2','2b','pratique','apte',3,3),
  ('bc1-cm2-2b-s-a','cm2','2b','savoir_etre','apte',2,4),
  ('bc1-cm2-3a-o-a','cm2','3a','oral','apte',5,1),
  ('bc1-cm2-3a-e-a','cm2','3a','ecrit','apte',10,2),
  ('bc1-cm2-3a-p-a','cm2','3a','pratique','apte',3,3),
  ('bc1-cm2-3a-s-a','cm2','3a','savoir_etre','apte',2,4),
  ('bc1-cm2-3b-o-a','cm2','3b','oral','apte',5,1),
  ('bc1-cm2-3b-e-a','cm2','3b','ecrit','apte',10,2),
  ('bc1-cm2-3b-p-a','cm2','3b','pratique','apte',3,3),
  ('bc1-cm2-3b-s-a','cm2','3b','savoir_etre','apte',2,4),
  ('bc1-cm2-4a-o-a','cm2','4a','oral','apte',5,1),
  ('bc1-cm2-4a-e-a','cm2','4a','ecrit','apte',10,2),
  ('bc1-cm2-4a-p-a','cm2','4a','pratique','apte',3,3),
  ('bc1-cm2-4a-s-a','cm2','4a','savoir_etre','apte',2,4),
  ('bc1-cm2-5a-o-a','cm2','5a','oral','apte',3,1),
  ('bc1-cm2-5a-e-a','cm2','5a','ecrit','apte',10,2),
  ('bc1-cm2-5a-p-a','cm2','5a','pratique','apte',5,3),
  ('bc1-cm2-5a-s-a','cm2','5a','savoir_etre','apte',2,4),
  ('bc1-cm2-6a-o-a','cm2','6a','oral','apte',3,1),
  ('bc1-cm2-6a-e-a','cm2','6a','ecrit','apte',5,2),
  ('bc1-cm2-6a-p-a','cm2','6a','pratique','apte',10,3),
  ('bc1-cm2-6a-s-a','cm2','6a','savoir_etre','apte',2,4),
  ('bc1-cm2-6b-o-a','cm2','6b','oral','apte',3,1),
  ('bc1-cm2-6b-e-a','cm2','6b','ecrit','apte',10,2),
  ('bc1-cm2-6b-p-a','cm2','6b','pratique','apte',5,3),
  ('bc1-cm2-6b-s-a','cm2','6b','savoir_etre','apte',2,4),
  ('bc1-cm2-6a-o-i','cm2','6a','oral','inapte',8,1),
  ('bc1-cm2-6a-e-i','cm2','6a','ecrit','inapte',10,2),
  ('bc1-cm2-6a-s-i','cm2','6a','savoir_etre','inapte',2,4)
ON CONFLICT (niveau_id, competence_id, critere_id, aptitude)
  DO UPDATE SET points_max = EXCLUDED.points_max, ordre = EXCLUDED.ordre;

-- ── Contrôle : la migration ÉCHOUE si un niveau ne tombe pas sur 300 ────────
-- Un barème faux ne se voit pas sur un bulletin : il fausse silencieusement
-- toutes les cotes de l'année. La vérification est donc faite par la base, pas
-- laissée à la relecture d'un humain.
DO $$
DECLARE n record; v_total numeric; v_nb integer;
BEGIN
  FOR n IN SELECT unnest(ARRAY['sil','cp','ce1','ce2','cm1','cm2']) AS niveau LOOP
    SELECT coalesce(sum(points_max),0), count(DISTINCT competence_id)
      INTO v_total, v_nb
      FROM public.prim_bareme_criteres
     WHERE niveau_id = n.niveau AND aptitude = 'apte';
    IF v_nb <> 11 THEN
      RAISE EXCEPTION '% : % competences au lieu de 11.', upper(n.niveau), v_nb;
    END IF;
    IF v_total <> 300 THEN
      RAISE EXCEPTION '% : total %, attendu 300 (ecart %).', upper(n.niveau), v_total, v_total - 300;
    END IF;
    RAISE NOTICE '% : 11 competences, total 300. OK', upper(n.niveau);
  END LOOP;
  RAISE NOTICE 'Les six niveaux (Class 1 a 6) portent le barème officiel de l''ecole.';
END $$;

-- Le détail, à relire après exécution.
SELECT niveau_id, competence_id,
       sum(points_max)                                                  AS total,
       string_agg(critere_id || ':' || points_max, ' + ' ORDER BY ordre) AS repartition
  FROM public.prim_bareme_criteres
 WHERE aptitude = 'apte'
 GROUP BY niveau_id, competence_id
 ORDER BY CASE niveau_id WHEN 'sil' THEN 1 WHEN 'cp' THEN 2 WHEN 'ce1' THEN 3
                         WHEN 'ce2' THEN 4 WHEN 'cm1' THEN 5 ELSE 6 END, competence_id;
