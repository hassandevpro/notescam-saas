-- BARÈME DES CLASSES 2, 3 ET 4 — recopié de CLASS 1
-- ============================================================================
-- DEMANDE : « prendre pour référence la Class 1 de Bright Continent et remplir
-- les autres classes ».
--
-- CE QUI EST FAIT ICI : Class 1 (niveau 'sil') est recopiée sur Class 2 ('cp'),
-- Class 3 ('ce1') et Class 4 ('ce2'). CE1 et CE2 n'avaient AUCUNE ligne : sur ces
-- niveaux l'écran de saisie n'affichait pas une seule colonne. CP avait déjà les
-- mêmes valeurs ; elles sont réécrites à l'identique, sans effet.
--
-- CE QUI N'EST PAS FAIT, ET POURQUOI : CM1 et CM2 sont LAISSÉS DE CÔTÉ. Ils ont
-- leur propre barème, tiré du relevé papier de l'établissement et vérifié ligne
-- par ligne — 11 compétences, 300 points, 1A/1B/2A AVEC leur Pratique
-- (supabase_prim_bareme_cm1_cm2.sql). Y recopier Class 1 remplacerait un barème
-- juste par un barème incomplet.
--
-- ── RÉSERVE IMPORTANTE ──────────────────────────────────────────────────────
-- Class 1 totalise 280 POINTS, PAS 300. Ses compétences 1A, 1B et 2A n'ont
-- aucune ligne « pratique » depuis le seed d'origine — ce sont très exactement
-- les 20 points manquants. Ce fichier PROPAGE donc ce manque sur trois niveaux
-- de plus. C'est un choix assumé : mieux vaut un barème incomplet mais utilisable
-- que trois niveaux où l'on ne peut rien saisir du tout.
--
-- Deux façons de le compléter ensuite, au choix :
--   • par niveau, depuis l'écran : les quatre critères officiels sont désormais
--     toujours proposés, celui sans barème portant « à définir » (703cc4b) ;
--   • en bloc, par une migration : fournir la Pratique de 1A, 1B et 2A lue sur le
--     relevé de chaque niveau.
--
-- Additif, idempotent (ON CONFLICT DO UPDATE). Ne touche ni classes, ni élèves,
-- ni notes. À EXÉCUTER dans Supabase.
-- ============================================================================

INSERT INTO public.prim_bareme_criteres (id, niveau_id, competence_id, critere_id, aptitude, points_max, ordre) VALUES
  ('ref1-cp-1a-oral-a','cp','1a','oral','apte',20,1),
  ('ref1-cp-1a-ecrit-a','cp','1a','ecrit','apte',15,2),
  ('ref1-cp-1a-se-a','cp','1a','savoir_etre','apte',5,3),
  ('ref1-cp-1b-oral-a','cp','1b','oral','apte',20,1),
  ('ref1-cp-1b-ecrit-a','cp','1b','ecrit','apte',15,2),
  ('ref1-cp-1b-se-a','cp','1b','savoir_etre','apte',5,3),
  ('ref1-cp-1c-oral-a','cp','1c','oral','apte',10,1),
  ('ref1-cp-1c-ecrit-a','cp','1c','ecrit','apte',5,2),
  ('ref1-cp-1c-prat-a','cp','1c','pratique','apte',3,3),
  ('ref1-cp-1c-se-a','cp','1c','savoir_etre','apte',2,4),
  ('ref1-cp-2a-oral-a','cp','2a','oral','apte',5,1),
  ('ref1-cp-2a-ecrit-a','cp','2a','ecrit','apte',20,2),
  ('ref1-cp-2a-se-a','cp','2a','savoir_etre','apte',5,3),
  ('ref1-cp-2b-oral-a','cp','2b','oral','apte',5,1),
  ('ref1-cp-2b-ecrit-a','cp','2b','ecrit','apte',5,2),
  ('ref1-cp-2b-prat-a','cp','2b','pratique','apte',15,3),
  ('ref1-cp-2b-se-a','cp','2b','savoir_etre','apte',5,4),
  ('ref1-cp-3a-oral-a','cp','3a','oral','apte',3,1),
  ('ref1-cp-3a-ecrit-a','cp','3a','ecrit','apte',3,2),
  ('ref1-cp-3a-prat-a','cp','3a','pratique','apte',10,3),
  ('ref1-cp-3a-se-a','cp','3a','savoir_etre','apte',4,4),
  ('ref1-cp-3b-oral-a','cp','3b','oral','apte',5,1),
  ('ref1-cp-3b-ecrit-a','cp','3b','ecrit','apte',5,2),
  ('ref1-cp-3b-prat-a','cp','3b','pratique','apte',8,3),
  ('ref1-cp-3b-se-a','cp','3b','savoir_etre','apte',2,4),
  ('ref1-cp-4a-oral-a','cp','4a','oral','apte',5,1),
  ('ref1-cp-4a-ecrit-a','cp','4a','ecrit','apte',3,2),
  ('ref1-cp-4a-prat-a','cp','4a','pratique','apte',10,3),
  ('ref1-cp-4a-se-a','cp','4a','savoir_etre','apte',2,4),
  ('ref1-cp-5a-oral-a','cp','5a','oral','apte',3,1),
  ('ref1-cp-5a-ecrit-a','cp','5a','ecrit','apte',3,2),
  ('ref1-cp-5a-prat-a','cp','5a','pratique','apte',10,3),
  ('ref1-cp-5a-se-a','cp','5a','savoir_etre','apte',4,4),
  ('ref1-cp-6a-oral-a','cp','6a','oral','apte',3,1),
  ('ref1-cp-6a-ecrit-a','cp','6a','ecrit','apte',3,2),
  ('ref1-cp-6a-prat-a','cp','6a','pratique','apte',10,3),
  ('ref1-cp-6a-se-a','cp','6a','savoir_etre','apte',4,4),
  ('ref1-cp-6a-oral-i','cp','6a','oral','inapte',8,1),
  ('ref1-cp-6a-ecrit-i','cp','6a','ecrit','inapte',10,2),
  ('ref1-cp-6a-se-i','cp','6a','savoir_etre','inapte',2,3),
  ('ref1-cp-6b-oral-a','cp','6b','oral','apte',4,1),
  ('ref1-cp-6b-ecrit-a','cp','6b','ecrit','apte',3,2),
  ('ref1-cp-6b-prat-a','cp','6b','pratique','apte',10,3),
  ('ref1-cp-6b-se-a','cp','6b','savoir_etre','apte',3,4),
  ('ref1-ce1-1a-oral-a','ce1','1a','oral','apte',20,1),
  ('ref1-ce1-1a-ecrit-a','ce1','1a','ecrit','apte',15,2),
  ('ref1-ce1-1a-se-a','ce1','1a','savoir_etre','apte',5,3),
  ('ref1-ce1-1b-oral-a','ce1','1b','oral','apte',20,1),
  ('ref1-ce1-1b-ecrit-a','ce1','1b','ecrit','apte',15,2),
  ('ref1-ce1-1b-se-a','ce1','1b','savoir_etre','apte',5,3),
  ('ref1-ce1-1c-oral-a','ce1','1c','oral','apte',10,1),
  ('ref1-ce1-1c-ecrit-a','ce1','1c','ecrit','apte',5,2),
  ('ref1-ce1-1c-prat-a','ce1','1c','pratique','apte',3,3),
  ('ref1-ce1-1c-se-a','ce1','1c','savoir_etre','apte',2,4),
  ('ref1-ce1-2a-oral-a','ce1','2a','oral','apte',5,1),
  ('ref1-ce1-2a-ecrit-a','ce1','2a','ecrit','apte',20,2),
  ('ref1-ce1-2a-se-a','ce1','2a','savoir_etre','apte',5,3),
  ('ref1-ce1-2b-oral-a','ce1','2b','oral','apte',5,1),
  ('ref1-ce1-2b-ecrit-a','ce1','2b','ecrit','apte',5,2),
  ('ref1-ce1-2b-prat-a','ce1','2b','pratique','apte',15,3),
  ('ref1-ce1-2b-se-a','ce1','2b','savoir_etre','apte',5,4),
  ('ref1-ce1-3a-oral-a','ce1','3a','oral','apte',3,1),
  ('ref1-ce1-3a-ecrit-a','ce1','3a','ecrit','apte',3,2),
  ('ref1-ce1-3a-prat-a','ce1','3a','pratique','apte',10,3),
  ('ref1-ce1-3a-se-a','ce1','3a','savoir_etre','apte',4,4),
  ('ref1-ce1-3b-oral-a','ce1','3b','oral','apte',5,1),
  ('ref1-ce1-3b-ecrit-a','ce1','3b','ecrit','apte',5,2),
  ('ref1-ce1-3b-prat-a','ce1','3b','pratique','apte',8,3),
  ('ref1-ce1-3b-se-a','ce1','3b','savoir_etre','apte',2,4),
  ('ref1-ce1-4a-oral-a','ce1','4a','oral','apte',5,1),
  ('ref1-ce1-4a-ecrit-a','ce1','4a','ecrit','apte',3,2),
  ('ref1-ce1-4a-prat-a','ce1','4a','pratique','apte',10,3),
  ('ref1-ce1-4a-se-a','ce1','4a','savoir_etre','apte',2,4),
  ('ref1-ce1-5a-oral-a','ce1','5a','oral','apte',3,1),
  ('ref1-ce1-5a-ecrit-a','ce1','5a','ecrit','apte',3,2),
  ('ref1-ce1-5a-prat-a','ce1','5a','pratique','apte',10,3),
  ('ref1-ce1-5a-se-a','ce1','5a','savoir_etre','apte',4,4),
  ('ref1-ce1-6a-oral-a','ce1','6a','oral','apte',3,1),
  ('ref1-ce1-6a-ecrit-a','ce1','6a','ecrit','apte',3,2),
  ('ref1-ce1-6a-prat-a','ce1','6a','pratique','apte',10,3),
  ('ref1-ce1-6a-se-a','ce1','6a','savoir_etre','apte',4,4),
  ('ref1-ce1-6a-oral-i','ce1','6a','oral','inapte',8,1),
  ('ref1-ce1-6a-ecrit-i','ce1','6a','ecrit','inapte',10,2),
  ('ref1-ce1-6a-se-i','ce1','6a','savoir_etre','inapte',2,3),
  ('ref1-ce1-6b-oral-a','ce1','6b','oral','apte',4,1),
  ('ref1-ce1-6b-ecrit-a','ce1','6b','ecrit','apte',3,2),
  ('ref1-ce1-6b-prat-a','ce1','6b','pratique','apte',10,3),
  ('ref1-ce1-6b-se-a','ce1','6b','savoir_etre','apte',3,4),
  ('ref1-ce2-1a-oral-a','ce2','1a','oral','apte',20,1),
  ('ref1-ce2-1a-ecrit-a','ce2','1a','ecrit','apte',15,2),
  ('ref1-ce2-1a-se-a','ce2','1a','savoir_etre','apte',5,3),
  ('ref1-ce2-1b-oral-a','ce2','1b','oral','apte',20,1),
  ('ref1-ce2-1b-ecrit-a','ce2','1b','ecrit','apte',15,2),
  ('ref1-ce2-1b-se-a','ce2','1b','savoir_etre','apte',5,3),
  ('ref1-ce2-1c-oral-a','ce2','1c','oral','apte',10,1),
  ('ref1-ce2-1c-ecrit-a','ce2','1c','ecrit','apte',5,2),
  ('ref1-ce2-1c-prat-a','ce2','1c','pratique','apte',3,3),
  ('ref1-ce2-1c-se-a','ce2','1c','savoir_etre','apte',2,4),
  ('ref1-ce2-2a-oral-a','ce2','2a','oral','apte',5,1),
  ('ref1-ce2-2a-ecrit-a','ce2','2a','ecrit','apte',20,2),
  ('ref1-ce2-2a-se-a','ce2','2a','savoir_etre','apte',5,3),
  ('ref1-ce2-2b-oral-a','ce2','2b','oral','apte',5,1),
  ('ref1-ce2-2b-ecrit-a','ce2','2b','ecrit','apte',5,2),
  ('ref1-ce2-2b-prat-a','ce2','2b','pratique','apte',15,3),
  ('ref1-ce2-2b-se-a','ce2','2b','savoir_etre','apte',5,4),
  ('ref1-ce2-3a-oral-a','ce2','3a','oral','apte',3,1),
  ('ref1-ce2-3a-ecrit-a','ce2','3a','ecrit','apte',3,2),
  ('ref1-ce2-3a-prat-a','ce2','3a','pratique','apte',10,3),
  ('ref1-ce2-3a-se-a','ce2','3a','savoir_etre','apte',4,4),
  ('ref1-ce2-3b-oral-a','ce2','3b','oral','apte',5,1),
  ('ref1-ce2-3b-ecrit-a','ce2','3b','ecrit','apte',5,2),
  ('ref1-ce2-3b-prat-a','ce2','3b','pratique','apte',8,3),
  ('ref1-ce2-3b-se-a','ce2','3b','savoir_etre','apte',2,4),
  ('ref1-ce2-4a-oral-a','ce2','4a','oral','apte',5,1),
  ('ref1-ce2-4a-ecrit-a','ce2','4a','ecrit','apte',3,2),
  ('ref1-ce2-4a-prat-a','ce2','4a','pratique','apte',10,3),
  ('ref1-ce2-4a-se-a','ce2','4a','savoir_etre','apte',2,4),
  ('ref1-ce2-5a-oral-a','ce2','5a','oral','apte',3,1),
  ('ref1-ce2-5a-ecrit-a','ce2','5a','ecrit','apte',3,2),
  ('ref1-ce2-5a-prat-a','ce2','5a','pratique','apte',10,3),
  ('ref1-ce2-5a-se-a','ce2','5a','savoir_etre','apte',4,4),
  ('ref1-ce2-6a-oral-a','ce2','6a','oral','apte',3,1),
  ('ref1-ce2-6a-ecrit-a','ce2','6a','ecrit','apte',3,2),
  ('ref1-ce2-6a-prat-a','ce2','6a','pratique','apte',10,3),
  ('ref1-ce2-6a-se-a','ce2','6a','savoir_etre','apte',4,4),
  ('ref1-ce2-6a-oral-i','ce2','6a','oral','inapte',8,1),
  ('ref1-ce2-6a-ecrit-i','ce2','6a','ecrit','inapte',10,2),
  ('ref1-ce2-6a-se-i','ce2','6a','savoir_etre','inapte',2,3),
  ('ref1-ce2-6b-oral-a','ce2','6b','oral','apte',4,1),
  ('ref1-ce2-6b-ecrit-a','ce2','6b','ecrit','apte',3,2),
  ('ref1-ce2-6b-prat-a','ce2','6b','pratique','apte',10,3),
  ('ref1-ce2-6b-se-a','ce2','6b','savoir_etre','apte',3,4)
ON CONFLICT (niveau_id, competence_id, critere_id, aptitude)
  DO UPDATE SET points_max = EXCLUDED.points_max, ordre = EXCLUDED.ordre;

-- ── Contrôle ────────────────────────────────────────────────────────────────
DO $$
DECLARE n record; v_total numeric; v_nb integer;
BEGIN
  FOR n IN SELECT unnest(ARRAY['cp','ce1','ce2']) AS niveau LOOP
    SELECT coalesce(sum(points_max),0), count(DISTINCT competence_id)
      INTO v_total, v_nb
      FROM public.prim_bareme_criteres
     WHERE niveau_id = n.niveau AND aptitude = 'apte';
    IF v_nb <> 11 THEN
      RAISE EXCEPTION '% : % competences au lieu de 11.', upper(n.niveau), v_nb;
    END IF;
    IF v_total <> 280 THEN
      RAISE EXCEPTION '% : total %, attendu 280 (copie de Class 1).', upper(n.niveau), v_total;
    END IF;
    RAISE NOTICE '% : 11 competences, total % — conforme a Class 1.', upper(n.niveau), v_total;
  END LOOP;

  RAISE WARNING 'Class 1 et ses copies totalisent 280 points, pas 300 : 1A, 1B et 2A n''ont pas de critere « pratique ». A completer depuis l''ecran de saisie, ou par une migration dediee.';

  -- CM1/CM2 ne doivent pas avoir ete touches par ce fichier.
  IF EXISTS (SELECT 1 FROM public.prim_bareme_criteres
              WHERE niveau_id IN ('cm1','cm2') AND id LIKE 'ref1-%') THEN
    RAISE EXCEPTION 'CM1/CM2 ont ete ecrases par la copie de Class 1 — ce n''etait pas voulu.';
  END IF;
END $$;

-- Etat de tous les niveaux, a relire apres execution.
SELECT niveau_id,
       count(DISTINCT competence_id) AS competences,
       sum(points_max)               AS total_apte
  FROM public.prim_bareme_criteres
 WHERE aptitude = 'apte'
 GROUP BY niveau_id
 ORDER BY CASE niveau_id WHEN 'sil' THEN 1 WHEN 'cp' THEN 2 WHEN 'ce1' THEN 3
                         WHEN 'ce2' THEN 4 WHEN 'cm1' THEN 5 ELSE 6 END;
