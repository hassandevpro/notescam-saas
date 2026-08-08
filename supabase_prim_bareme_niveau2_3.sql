-- supabase_prim_bareme_niveau2_3.sql
-- Barème officiel Niveaux II et III (CE1, CE2, CM1, CM2) — carnet MINEDUB,
-- "Bulletin francophones.pdf". Complète supabase_prim_bareme_ua.sql (déjà
-- appliqué : table prim_bareme_criteres, colonnes ua/sport_aptitude, seuils
-- de cote) avec le barème de ces 4 niveaux, absent jusqu'ici (seul Niveau I —
-- SIL/CP — avait été seedé).
--
-- Les 4 niveaux partagent EXACTEMENT le même barème (vérifié page par page du
-- PDF officiel). Vérifié par recoupement : somme des critères d'une
-- sous-compétence = son total annoncé ; somme des sous-compétences = total de
-- la compétence nationale (C1=80, C2=80, C3=40, C4=20, C5=40, C6=40).
--
-- Idempotent (ON CONFLICT DO UPDATE). À coller dans Supabase → SQL Editor → Run.

INSERT INTO public.prim_bareme_criteres (id, niveau_id, competence_id, critere_id, aptitude, points_max, ordre) VALUES
  -- ── CE1 ──
  ('n23-ce1-1a-oral','ce1','1a','oral','apte',12,1), ('n23-ce1-1a-ecrit','ce1','1a','ecrit','apte',15,2), ('n23-ce1-1a-se','ce1','1a','savoir_etre','apte',3,3),
  ('n23-ce1-1b-oral','ce1','1b','oral','apte',12,1), ('n23-ce1-1b-ecrit','ce1','1b','ecrit','apte',15,2), ('n23-ce1-1b-se','ce1','1b','savoir_etre','apte',3,3),
  ('n23-ce1-1c-oral','ce1','1c','oral','apte',10,1), ('n23-ce1-1c-ecrit','ce1','1c','ecrit','apte',6,2), ('n23-ce1-1c-pratique','ce1','1c','pratique','apte',2,3), ('n23-ce1-1c-se','ce1','1c','savoir_etre','apte',2,4),
  ('n23-ce1-2a-oral','ce1','2a','oral','apte',8,1), ('n23-ce1-2a-ecrit','ce1','2a','ecrit','apte',28,2), ('n23-ce1-2a-se','ce1','2a','savoir_etre','apte',4,3),
  ('n23-ce1-2b-oral','ce1','2b','oral','apte',6,1), ('n23-ce1-2b-ecrit','ce1','2b','ecrit','apte',7,2), ('n23-ce1-2b-pratique','ce1','2b','pratique','apte',20,3), ('n23-ce1-2b-se','ce1','2b','savoir_etre','apte',7,4),
  ('n23-ce1-3a-oral','ce1','3a','oral','apte',3,1), ('n23-ce1-3a-ecrit','ce1','3a','ecrit','apte',8,2), ('n23-ce1-3a-pratique','ce1','3a','pratique','apte',5,3), ('n23-ce1-3a-se','ce1','3a','savoir_etre','apte',4,4),
  ('n23-ce1-3b-oral','ce1','3b','oral','apte',3,1), ('n23-ce1-3b-ecrit','ce1','3b','ecrit','apte',9,2), ('n23-ce1-3b-pratique','ce1','3b','pratique','apte',5,3), ('n23-ce1-3b-se','ce1','3b','savoir_etre','apte',3,4),
  ('n23-ce1-4a-oral','ce1','4a','oral','apte',5,1), ('n23-ce1-4a-ecrit','ce1','4a','ecrit','apte',2,2), ('n23-ce1-4a-pratique','ce1','4a','pratique','apte',11,3), ('n23-ce1-4a-se','ce1','4a','savoir_etre','apte',2,4),
  ('n23-ce1-5a-oral','ce1','5a','oral','apte',4,1), ('n23-ce1-5a-ecrit','ce1','5a','ecrit','apte',10,2), ('n23-ce1-5a-pratique','ce1','5a','pratique','apte',20,3), ('n23-ce1-5a-se','ce1','5a','savoir_etre','apte',6,4),
  ('n23-ce1-6a-oral-a','ce1','6a','oral','apte',2,1), ('n23-ce1-6a-ecrit-a','ce1','6a','ecrit','apte',2,2), ('n23-ce1-6a-pratique-a','ce1','6a','pratique','apte',12,3), ('n23-ce1-6a-se-a','ce1','6a','savoir_etre','apte',4,4),
  ('n23-ce1-6a-oral-i','ce1','6a','oral','inapte',3,1), ('n23-ce1-6a-ecrit-i','ce1','6a','ecrit','inapte',15,2), ('n23-ce1-6a-se-i','ce1','6a','savoir_etre','inapte',2,3),
  ('n23-ce1-6b-oral','ce1','6b','oral','apte',2,1), ('n23-ce1-6b-ecrit','ce1','6b','ecrit','apte',4,2), ('n23-ce1-6b-pratique','ce1','6b','pratique','apte',12,3), ('n23-ce1-6b-se','ce1','6b','savoir_etre','apte',2,4),
  -- ── CE2 (identique à CE1) ──
  ('n23-ce2-1a-oral','ce2','1a','oral','apte',12,1), ('n23-ce2-1a-ecrit','ce2','1a','ecrit','apte',15,2), ('n23-ce2-1a-se','ce2','1a','savoir_etre','apte',3,3),
  ('n23-ce2-1b-oral','ce2','1b','oral','apte',12,1), ('n23-ce2-1b-ecrit','ce2','1b','ecrit','apte',15,2), ('n23-ce2-1b-se','ce2','1b','savoir_etre','apte',3,3),
  ('n23-ce2-1c-oral','ce2','1c','oral','apte',10,1), ('n23-ce2-1c-ecrit','ce2','1c','ecrit','apte',6,2), ('n23-ce2-1c-pratique','ce2','1c','pratique','apte',2,3), ('n23-ce2-1c-se','ce2','1c','savoir_etre','apte',2,4),
  ('n23-ce2-2a-oral','ce2','2a','oral','apte',8,1), ('n23-ce2-2a-ecrit','ce2','2a','ecrit','apte',28,2), ('n23-ce2-2a-se','ce2','2a','savoir_etre','apte',4,3),
  ('n23-ce2-2b-oral','ce2','2b','oral','apte',6,1), ('n23-ce2-2b-ecrit','ce2','2b','ecrit','apte',7,2), ('n23-ce2-2b-pratique','ce2','2b','pratique','apte',20,3), ('n23-ce2-2b-se','ce2','2b','savoir_etre','apte',7,4),
  ('n23-ce2-3a-oral','ce2','3a','oral','apte',3,1), ('n23-ce2-3a-ecrit','ce2','3a','ecrit','apte',8,2), ('n23-ce2-3a-pratique','ce2','3a','pratique','apte',5,3), ('n23-ce2-3a-se','ce2','3a','savoir_etre','apte',4,4),
  ('n23-ce2-3b-oral','ce2','3b','oral','apte',3,1), ('n23-ce2-3b-ecrit','ce2','3b','ecrit','apte',9,2), ('n23-ce2-3b-pratique','ce2','3b','pratique','apte',5,3), ('n23-ce2-3b-se','ce2','3b','savoir_etre','apte',3,4),
  ('n23-ce2-4a-oral','ce2','4a','oral','apte',5,1), ('n23-ce2-4a-ecrit','ce2','4a','ecrit','apte',2,2), ('n23-ce2-4a-pratique','ce2','4a','pratique','apte',11,3), ('n23-ce2-4a-se','ce2','4a','savoir_etre','apte',2,4),
  ('n23-ce2-5a-oral','ce2','5a','oral','apte',4,1), ('n23-ce2-5a-ecrit','ce2','5a','ecrit','apte',10,2), ('n23-ce2-5a-pratique','ce2','5a','pratique','apte',20,3), ('n23-ce2-5a-se','ce2','5a','savoir_etre','apte',6,4),
  ('n23-ce2-6a-oral-a','ce2','6a','oral','apte',2,1), ('n23-ce2-6a-ecrit-a','ce2','6a','ecrit','apte',2,2), ('n23-ce2-6a-pratique-a','ce2','6a','pratique','apte',12,3), ('n23-ce2-6a-se-a','ce2','6a','savoir_etre','apte',4,4),
  ('n23-ce2-6a-oral-i','ce2','6a','oral','inapte',3,1), ('n23-ce2-6a-ecrit-i','ce2','6a','ecrit','inapte',15,2), ('n23-ce2-6a-se-i','ce2','6a','savoir_etre','inapte',2,3),
  ('n23-ce2-6b-oral','ce2','6b','oral','apte',2,1), ('n23-ce2-6b-ecrit','ce2','6b','ecrit','apte',4,2), ('n23-ce2-6b-pratique','ce2','6b','pratique','apte',12,3), ('n23-ce2-6b-se','ce2','6b','savoir_etre','apte',2,4),
  -- ── CM1 (identique) ──
  ('n23-cm1-1a-oral','cm1','1a','oral','apte',12,1), ('n23-cm1-1a-ecrit','cm1','1a','ecrit','apte',15,2), ('n23-cm1-1a-se','cm1','1a','savoir_etre','apte',3,3),
  ('n23-cm1-1b-oral','cm1','1b','oral','apte',12,1), ('n23-cm1-1b-ecrit','cm1','1b','ecrit','apte',15,2), ('n23-cm1-1b-se','cm1','1b','savoir_etre','apte',3,3),
  ('n23-cm1-1c-oral','cm1','1c','oral','apte',10,1), ('n23-cm1-1c-ecrit','cm1','1c','ecrit','apte',6,2), ('n23-cm1-1c-pratique','cm1','1c','pratique','apte',2,3), ('n23-cm1-1c-se','cm1','1c','savoir_etre','apte',2,4),
  ('n23-cm1-2a-oral','cm1','2a','oral','apte',8,1), ('n23-cm1-2a-ecrit','cm1','2a','ecrit','apte',28,2), ('n23-cm1-2a-se','cm1','2a','savoir_etre','apte',4,3),
  ('n23-cm1-2b-oral','cm1','2b','oral','apte',6,1), ('n23-cm1-2b-ecrit','cm1','2b','ecrit','apte',7,2), ('n23-cm1-2b-pratique','cm1','2b','pratique','apte',20,3), ('n23-cm1-2b-se','cm1','2b','savoir_etre','apte',7,4),
  ('n23-cm1-3a-oral','cm1','3a','oral','apte',3,1), ('n23-cm1-3a-ecrit','cm1','3a','ecrit','apte',8,2), ('n23-cm1-3a-pratique','cm1','3a','pratique','apte',5,3), ('n23-cm1-3a-se','cm1','3a','savoir_etre','apte',4,4),
  ('n23-cm1-3b-oral','cm1','3b','oral','apte',3,1), ('n23-cm1-3b-ecrit','cm1','3b','ecrit','apte',9,2), ('n23-cm1-3b-pratique','cm1','3b','pratique','apte',5,3), ('n23-cm1-3b-se','cm1','3b','savoir_etre','apte',3,4),
  ('n23-cm1-4a-oral','cm1','4a','oral','apte',5,1), ('n23-cm1-4a-ecrit','cm1','4a','ecrit','apte',2,2), ('n23-cm1-4a-pratique','cm1','4a','pratique','apte',11,3), ('n23-cm1-4a-se','cm1','4a','savoir_etre','apte',2,4),
  ('n23-cm1-5a-oral','cm1','5a','oral','apte',4,1), ('n23-cm1-5a-ecrit','cm1','5a','ecrit','apte',10,2), ('n23-cm1-5a-pratique','cm1','5a','pratique','apte',20,3), ('n23-cm1-5a-se','cm1','5a','savoir_etre','apte',6,4),
  ('n23-cm1-6a-oral-a','cm1','6a','oral','apte',2,1), ('n23-cm1-6a-ecrit-a','cm1','6a','ecrit','apte',2,2), ('n23-cm1-6a-pratique-a','cm1','6a','pratique','apte',12,3), ('n23-cm1-6a-se-a','cm1','6a','savoir_etre','apte',4,4),
  ('n23-cm1-6a-oral-i','cm1','6a','oral','inapte',3,1), ('n23-cm1-6a-ecrit-i','cm1','6a','ecrit','inapte',15,2), ('n23-cm1-6a-se-i','cm1','6a','savoir_etre','inapte',2,3),
  ('n23-cm1-6b-oral','cm1','6b','oral','apte',2,1), ('n23-cm1-6b-ecrit','cm1','6b','ecrit','apte',4,2), ('n23-cm1-6b-pratique','cm1','6b','pratique','apte',12,3), ('n23-cm1-6b-se','cm1','6b','savoir_etre','apte',2,4),
  -- ── CM2 (identique) ──
  ('n23-cm2-1a-oral','cm2','1a','oral','apte',12,1), ('n23-cm2-1a-ecrit','cm2','1a','ecrit','apte',15,2), ('n23-cm2-1a-se','cm2','1a','savoir_etre','apte',3,3),
  ('n23-cm2-1b-oral','cm2','1b','oral','apte',12,1), ('n23-cm2-1b-ecrit','cm2','1b','ecrit','apte',15,2), ('n23-cm2-1b-se','cm2','1b','savoir_etre','apte',3,3),
  ('n23-cm2-1c-oral','cm2','1c','oral','apte',10,1), ('n23-cm2-1c-ecrit','cm2','1c','ecrit','apte',6,2), ('n23-cm2-1c-pratique','cm2','1c','pratique','apte',2,3), ('n23-cm2-1c-se','cm2','1c','savoir_etre','apte',2,4),
  ('n23-cm2-2a-oral','cm2','2a','oral','apte',8,1), ('n23-cm2-2a-ecrit','cm2','2a','ecrit','apte',28,2), ('n23-cm2-2a-se','cm2','2a','savoir_etre','apte',4,3),
  ('n23-cm2-2b-oral','cm2','2b','oral','apte',6,1), ('n23-cm2-2b-ecrit','cm2','2b','ecrit','apte',7,2), ('n23-cm2-2b-pratique','cm2','2b','pratique','apte',20,3), ('n23-cm2-2b-se','cm2','2b','savoir_etre','apte',7,4),
  ('n23-cm2-3a-oral','cm2','3a','oral','apte',3,1), ('n23-cm2-3a-ecrit','cm2','3a','ecrit','apte',8,2), ('n23-cm2-3a-pratique','cm2','3a','pratique','apte',5,3), ('n23-cm2-3a-se','cm2','3a','savoir_etre','apte',4,4),
  ('n23-cm2-3b-oral','cm2','3b','oral','apte',3,1), ('n23-cm2-3b-ecrit','cm2','3b','ecrit','apte',9,2), ('n23-cm2-3b-pratique','cm2','3b','pratique','apte',5,3), ('n23-cm2-3b-se','cm2','3b','savoir_etre','apte',3,4),
  ('n23-cm2-4a-oral','cm2','4a','oral','apte',5,1), ('n23-cm2-4a-ecrit','cm2','4a','ecrit','apte',2,2), ('n23-cm2-4a-pratique','cm2','4a','pratique','apte',11,3), ('n23-cm2-4a-se','cm2','4a','savoir_etre','apte',2,4),
  ('n23-cm2-5a-oral','cm2','5a','oral','apte',4,1), ('n23-cm2-5a-ecrit','cm2','5a','ecrit','apte',10,2), ('n23-cm2-5a-pratique','cm2','5a','pratique','apte',20,3), ('n23-cm2-5a-se','cm2','5a','savoir_etre','apte',6,4),
  ('n23-cm2-6a-oral-a','cm2','6a','oral','apte',2,1), ('n23-cm2-6a-ecrit-a','cm2','6a','ecrit','apte',2,2), ('n23-cm2-6a-pratique-a','cm2','6a','pratique','apte',12,3), ('n23-cm2-6a-se-a','cm2','6a','savoir_etre','apte',4,4),
  ('n23-cm2-6a-oral-i','cm2','6a','oral','inapte',3,1), ('n23-cm2-6a-ecrit-i','cm2','6a','ecrit','inapte',15,2), ('n23-cm2-6a-se-i','cm2','6a','savoir_etre','inapte',2,3),
  ('n23-cm2-6b-oral','cm2','6b','oral','apte',2,1), ('n23-cm2-6b-ecrit','cm2','6b','ecrit','apte',4,2), ('n23-cm2-6b-pratique','cm2','6b','pratique','apte',12,3), ('n23-cm2-6b-se','cm2','6b','savoir_etre','apte',2,4)
ON CONFLICT (id) DO UPDATE
  SET points_max = EXCLUDED.points_max, ordre = EXCLUDED.ordre;
