-- BARÈME OFFICIEL CM1 / CM2 — 11 compétences, 300 points
-- ============================================================================
-- SOURCE : le relevé de notes papier de BRIGHT CONTINENT BILINGUAL SCHOOL,
-- année 2026/2027, relu ligne par ligne par l'établissement.
--
-- Le document de spécification fourni au départ donnait 1A=90, 3B=20 et 5A=40.
-- La relecture du RELEVÉ a corrigé les trois : 1A=30, 3B=40, 5A=20. C'est la
-- règle que l'établissement a lui-même posée — « le maximum imprimé prime, ne
-- jamais deviner » — et elle a servi trois fois. Les valeurs ci-dessous sont
-- celles du papier, pas celles de la spécification.
--
-- ── CE QUE CE FICHIER NE FAIT PAS ───────────────────────────────────────────
-- Il ne crée AUCUNE classe, AUCUN élève, AUCUNE école, et ne touche à AUCUNE
-- note. Il n'écrit que dans `prim_bareme_criteres`, en `ON CONFLICT DO UPDATE` :
-- rejouable sans doublon.
--
-- ── CM1 ET CM2 SONT DEUX CONFIGURATIONS DISTINCTES ──────────────────────────
-- La table est indexée par `niveau_id` : 'cm1' et 'cm2' sont deux jeux de lignes
-- séparés. Ils portent aujourd'hui les mêmes valeurs, mais chacun évoluera sans
-- toucher l'autre — c'était la demande.
--
-- ── NOMMAGE DES CLASSES ─────────────────────────────────────────────────────
-- Le barème s'attache au NIVEAU du référentiel, pas au nom de la classe. Une
-- classe nommée « Class 5 » est résolue en 'cm1' et « Class 6 » en 'cm2'
-- (src/core/engineResolver.js). Ce barème couvre donc les deux nommages, sans
-- rien dupliquer.
--
-- ── RESTE À FOURNIR : LE PROFIL « INAPTE » DE 6A ────────────────────────────
-- La compétence 6A (activités physiques) a deux profils : 'apte' et 'inapte'.
-- Un élève dispensé de sport n'est pas noté sur la Pratique — ses points sont
-- redistribués pour que son total reste comparable (précédent SIL : apte
-- 3+3+10+4=20, inapte 8+10+2=20).
-- Cette répartition n'a PAS été lue sur le relevé CM1/CM2 : elle n'est donc pas
-- écrite ici. Conséquence, signalée par le contrôle final : un élève marqué
-- `sport_aptitude = 'inapte'` n'a AUCUN critère en 6A et n'y est pas évalué.
-- Fournir les quatre chiffres et rejouer ce fichier complété.
-- ============================================================================

-- ── 1. Les 11 compétences, profil « apte » ──────────────────────────────────
-- Lecture : (niveau, compétence, critère, aptitude, points, ordre).
-- Un critère ABSENT = non évalué pour cette compétence (cellule grisée sur le
-- relevé) : 1B et 2A n'ont pas de « Pratique ». On n'insère pas une ligne à 0,
-- qui afficherait une colonne vide et inviterait à y saisir une note.
INSERT INTO public.prim_bareme_criteres (id, niveau_id, competence_id, critere_id, aptitude, points_max, ordre) VALUES
  -- 1A — Communiquer en français .......................................... /30
  ('bc-cm1-1a-oral','cm1','1a','oral','apte',8,1),  ('bc-cm1-1a-ecrit','cm1','1a','ecrit','apte',15,2),
  ('bc-cm1-1a-prat','cm1','1a','pratique','apte',5,3), ('bc-cm1-1a-se','cm1','1a','savoir_etre','apte',2,4),
  -- 1B — Communicate in English ........................................... /30
  ('bc-cm1-1b-oral','cm1','1b','oral','apte',12,1), ('bc-cm1-1b-ecrit','cm1','1b','ecrit','apte',15,2),
  ('bc-cm1-1b-se','cm1','1b','savoir_etre','apte',3,4),
  -- 1C — Pratiquer une langue nationale ................................... /20
  ('bc-cm1-1c-oral','cm1','1c','oral','apte',5,1),  ('bc-cm1-1c-ecrit','cm1','1c','ecrit','apte',11,2),
  ('bc-cm1-1c-prat','cm1','1c','pratique','apte',2,3), ('bc-cm1-1c-se','cm1','1c','savoir_etre','apte',2,4),
  -- 2A — Notions de base en mathématiques ................................. /40
  ('bc-cm1-2a-oral','cm1','2a','oral','apte',8,1),  ('bc-cm1-2a-ecrit','cm1','2a','ecrit','apte',30,2),
  ('bc-cm1-2a-se','cm1','2a','savoir_etre','apte',2,4),
  -- 2B — Notions de base en sciences et technologies ...................... /40
  ('bc-cm1-2b-oral','cm1','2b','oral','apte',6,1),  ('bc-cm1-2b-ecrit','cm1','2b','ecrit','apte',20,2),
  ('bc-cm1-2b-prat','cm1','2b','pratique','apte',7,3), ('bc-cm1-2b-se','cm1','2b','savoir_etre','apte',7,4),
  -- 3A — Pratiquer les valeurs sociales ................................... /20
  ('bc-cm1-3a-oral','cm1','3a','oral','apte',5,1),  ('bc-cm1-3a-ecrit','cm1','3a','ecrit','apte',10,2),
  ('bc-cm1-3a-prat','cm1','3a','pratique','apte',3,3), ('bc-cm1-3a-se','cm1','3a','savoir_etre','apte',2,4),
  -- 3B — Pratiquer les valeurs citoyennes ................................. /40
  ('bc-cm1-3b-oral','cm1','3b','oral','apte',5,1),  ('bc-cm1-3b-ecrit','cm1','3b','ecrit','apte',30,2),
  ('bc-cm1-3b-prat','cm1','3b','pratique','apte',3,3), ('bc-cm1-3b-se','cm1','3b','savoir_etre','apte',2,4),
  -- 4A — Autonomie, initiative, créativité, entrepreneuriat ............... /20
  ('bc-cm1-4a-oral','cm1','4a','oral','apte',5,1),  ('bc-cm1-4a-ecrit','cm1','4a','ecrit','apte',2,2),
  ('bc-cm1-4a-prat','cm1','4a','pratique','apte',11,3), ('bc-cm1-4a-se','cm1','4a','savoir_etre','apte',2,4),
  -- 5A — Concepts de base et outils des TIC ............................... /20
  ('bc-cm1-5a-oral','cm1','5a','oral','apte',3,1),  ('bc-cm1-5a-ecrit','cm1','5a','ecrit','apte',10,2),
  ('bc-cm1-5a-prat','cm1','5a','pratique','apte',5,3), ('bc-cm1-5a-se','cm1','5a','savoir_etre','apte',2,4),
  -- 6A — Activités physiques et sportives ................................. /20
  ('bc-cm1-6a-oral','cm1','6a','oral','apte',2,1),  ('bc-cm1-6a-ecrit','cm1','6a','ecrit','apte',2,2),
  ('bc-cm1-6a-prat','cm1','6a','pratique','apte',12,3), ('bc-cm1-6a-se','cm1','6a','savoir_etre','apte',4,4),
  -- 6B — Activités artistiques ............................................ /20
  ('bc-cm1-6b-oral','cm1','6b','oral','apte',2,1),  ('bc-cm1-6b-ecrit','cm1','6b','ecrit','apte',8,2),
  ('bc-cm1-6b-prat','cm1','6b','pratique','apte',8,3), ('bc-cm1-6b-se','cm1','6b','savoir_etre','apte',2,4),

  -- ── CM2 : mêmes valeurs AUJOURD'HUI, configuration SÉPARÉE ────────────────
  ('bc-cm2-1a-oral','cm2','1a','oral','apte',8,1),  ('bc-cm2-1a-ecrit','cm2','1a','ecrit','apte',15,2),
  ('bc-cm2-1a-prat','cm2','1a','pratique','apte',5,3), ('bc-cm2-1a-se','cm2','1a','savoir_etre','apte',2,4),
  ('bc-cm2-1b-oral','cm2','1b','oral','apte',12,1), ('bc-cm2-1b-ecrit','cm2','1b','ecrit','apte',15,2),
  ('bc-cm2-1b-se','cm2','1b','savoir_etre','apte',3,4),
  ('bc-cm2-1c-oral','cm2','1c','oral','apte',5,1),  ('bc-cm2-1c-ecrit','cm2','1c','ecrit','apte',11,2),
  ('bc-cm2-1c-prat','cm2','1c','pratique','apte',2,3), ('bc-cm2-1c-se','cm2','1c','savoir_etre','apte',2,4),
  ('bc-cm2-2a-oral','cm2','2a','oral','apte',8,1),  ('bc-cm2-2a-ecrit','cm2','2a','ecrit','apte',30,2),
  ('bc-cm2-2a-se','cm2','2a','savoir_etre','apte',2,4),
  ('bc-cm2-2b-oral','cm2','2b','oral','apte',6,1),  ('bc-cm2-2b-ecrit','cm2','2b','ecrit','apte',20,2),
  ('bc-cm2-2b-prat','cm2','2b','pratique','apte',7,3), ('bc-cm2-2b-se','cm2','2b','savoir_etre','apte',7,4),
  ('bc-cm2-3a-oral','cm2','3a','oral','apte',5,1),  ('bc-cm2-3a-ecrit','cm2','3a','ecrit','apte',10,2),
  ('bc-cm2-3a-prat','cm2','3a','pratique','apte',3,3), ('bc-cm2-3a-se','cm2','3a','savoir_etre','apte',2,4),
  ('bc-cm2-3b-oral','cm2','3b','oral','apte',5,1),  ('bc-cm2-3b-ecrit','cm2','3b','ecrit','apte',30,2),
  ('bc-cm2-3b-prat','cm2','3b','pratique','apte',3,3), ('bc-cm2-3b-se','cm2','3b','savoir_etre','apte',2,4),
  ('bc-cm2-4a-oral','cm2','4a','oral','apte',5,1),  ('bc-cm2-4a-ecrit','cm2','4a','ecrit','apte',2,2),
  ('bc-cm2-4a-prat','cm2','4a','pratique','apte',11,3), ('bc-cm2-4a-se','cm2','4a','savoir_etre','apte',2,4),
  ('bc-cm2-5a-oral','cm2','5a','oral','apte',3,1),  ('bc-cm2-5a-ecrit','cm2','5a','ecrit','apte',10,2),
  ('bc-cm2-5a-prat','cm2','5a','pratique','apte',5,3), ('bc-cm2-5a-se','cm2','5a','savoir_etre','apte',2,4),
  ('bc-cm2-6a-oral','cm2','6a','oral','apte',2,1),  ('bc-cm2-6a-ecrit','cm2','6a','ecrit','apte',2,2),
  ('bc-cm2-6a-prat','cm2','6a','pratique','apte',12,3), ('bc-cm2-6a-se','cm2','6a','savoir_etre','apte',4,4),
  ('bc-cm2-6b-oral','cm2','6b','oral','apte',2,1),  ('bc-cm2-6b-ecrit','cm2','6b','ecrit','apte',8,2),
  ('bc-cm2-6b-prat','cm2','6b','pratique','apte',8,3), ('bc-cm2-6b-se','cm2','6b','savoir_etre','apte',2,4)
ON CONFLICT (niveau_id, competence_id, critere_id, aptitude)
  DO UPDATE SET points_max = EXCLUDED.points_max, ordre = EXCLUDED.ordre;

-- ── 2. CONTRÔLE — la migration ÉCHOUE si le compte ne tombe pas ─────────────
-- C'est la règle posée par l'établissement : « si le total n'est pas 300, ne pas
-- valider la configuration ». Elle est appliquée ICI, par la base, et non laissée
-- à la relecture d'un humain : un barème faux ne se voit pas sur un bulletin, il
-- fausse silencieusement toutes les cotes de l'année.
DO $$
DECLARE n record; v_total numeric; v_nb integer;
BEGIN
  FOR n IN SELECT unnest(ARRAY['cm1','cm2']) AS niveau LOOP
    SELECT coalesce(sum(points_max), 0), count(DISTINCT competence_id)
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

  -- Le profil « inapte » de 6A reste a fournir : sans lui, un eleve dispense de
  -- sport n'a aucun critere en 6A et n'y est pas evalue du tout.
  IF NOT EXISTS (SELECT 1 FROM public.prim_bareme_criteres
                  WHERE niveau_id IN ('cm1','cm2') AND competence_id = '6a' AND aptitude = 'inapte') THEN
    RAISE WARNING 'Profil 6A « inapte » absent pour CM1/CM2 : un eleve dispense de sport ne sera pas evalue sur cette competence. Fournir la repartition et rejouer.';
  END IF;
END $$;

-- ── 3. Le détail, à relire après exécution ─────────────────────────────────
SELECT niveau_id,
       competence_id,
       sum(points_max)                                                   AS total_competence,
       string_agg(critere_id || ':' || points_max, ' + ' ORDER BY ordre)  AS repartition
  FROM public.prim_bareme_criteres
 WHERE niveau_id IN ('cm1','cm2') AND aptitude = 'apte'
 GROUP BY niveau_id, competence_id
 ORDER BY niveau_id, competence_id;
