-- NOTES DU PRIMAIRE — UA1 (Trim. 1) — BRIGHT CONTINENT BILINGUAL SCHOOL
-- ============================================================================
-- SOURCE : les relevés papier transmis le 2026-10-08, pour 9 élèves des Class 3
-- à 6. Saisie des QUATRE critères (Oral, Écrit, Pratique, Savoir-être) de chaque
-- compétence, telle qu'elle figure sur la fiche.
--
-- ── PRÉREQUIS ───────────────────────────────────────────────────────────────
-- Appliquer D'ABORD supabase_prim_bareme_bright_continent.sql. Sans lui, les
-- niveaux CE1→CM2 n'ont AUCUN barème et ces notes s'afficheraient sans maximum.
--
-- ── RÈGLE DE SAISIE ─────────────────────────────────────────────────────────
-- `points_max` reste NULL : cela signifie « barème officiel du référentiel »
-- (cf. primEngine.primNoteScale). Aucune de ces évaluations n'est dérogatoire.
-- Un critère non noté sur la fiche (« — ») n'est PAS inséré : le moteur calcule
-- le total et la cote sur les seuls critères saisis. Mettre 0 serait une faute.
-- Idem pour une compétence entièrement absente : aucune ligne.
-- UA1 appartient au trimestre 1 (primEngine.trimestreOfUA) : `trimestre_id` vaut
-- donc 't1'. C'est une colonne vestige, NOT NULL côté Supabase, plus lue.
--
-- ── CE QUE LA FICHE NE DIT PAS AU CARRÉ ─────────────────────────────────────
-- Les notes individuelles sont CONSERVÉES TELLES QUELLES, conformément à la
-- consigne. Là où le total manuscrit ne correspond pas à la somme des quatre
-- critères, c'est la somme des critères qui s'imposera à l'écran :
--   BETI     3A  5 +  7  + 3 + 2 = 17     (total manuscrit : 15)
--   BETI     6B  3 +  8  + 5 + 2 = 18     (total manuscrit : 15)
--   NDZIE    6A  3 +  5  + 8 + 2 = 18     (total manuscrit : 15)
--   ORUC     6B  3 +  8  + 5 + 2 = 18     (total manuscrit : 15)
--   OLIALIMA 2B  5 + 28  + 3 + 2 = 38     (total manuscrit : 35)
--   OLIALIMA 3A  5 +  7.5+ 3 + 2 = 17.5   (total manuscrit : 15.5)
--   OLIALIMA 6B  3 +  8  + 5 + 2 = 18     (total manuscrit : 15)
--
-- ── UNE NOTE HORS BARÈME, À TRANCHER ────────────────────────────────────────
-- OLIALIMA, compétence 1B : la fiche porte Pratique 5 et Savoir-être 5, alors
-- que le barème officiel de 1B plafonne à 3 et 2. La base l'accepte (aucune
-- contrainte ne borne `note` au barème), mais l'écran affichera « 5/3 » et
-- « 5/2 », et le total de 1B dépassera 40. Les valeurs sont insérées telles
-- quelles ; à corriger dans l'écran de saisie si la fiche a été mal relevée.
--
-- Additif, idempotent (ON CONFLICT DO UPDATE sur la clé métier). Ne touche ni
-- classes, ni élèves, ni barèmes, ni bulletins. 354 lignes attendues.
-- À EXÉCUTER dans Supabase, dans un onglet VIDE, SANS RIEN SURLIGNER.
-- ============================================================================

-- ── 1) Les relevés, un enregistrement par (élève, compétence) ───────────────
-- NULL = critère non noté sur la fiche.
DROP TABLE IF EXISTS imp_brut;
DROP TABLE IF EXISTS imp_notes;
DROP TABLE IF EXISTS imp_resolu;

CREATE TEMP TABLE imp_brut (
  eleve         text NOT NULL,
  classe        text NOT NULL,
  competence_id text NOT NULL,
  oral          numeric,
  ecrit         numeric,
  pratique      numeric,
  savoir_etre   numeric
);

INSERT INTO imp_brut (eleve, classe, competence_id, oral, ecrit, pratique, savoir_etre) VALUES
  -- 1. ASMANE BEN OUMAR — Class 4 — total attendu 152
  ('ASMANE BEN OUMAR','Class 4','1a',  6,   11,  5, 5),
  ('ASMANE BEN OUMAR','Class 4','1b',  2,   10,  1, 2),
  ('ASMANE BEN OUMAR','Class 4','1c',  6,    4,  1, 2),
  ('ASMANE BEN OUMAR','Class 4','2a',  5,    3,  3, 2),
  ('ASMANE BEN OUMAR','Class 4','2b',  2,   10,  3, 2),
  ('ASMANE BEN OUMAR','Class 4','3a',  1,    3,  1, 1),
  ('ASMANE BEN OUMAR','Class 4','3b',  1,    2,  2, 1),
  ('ASMANE BEN OUMAR','Class 4','4a',  5,    4,  3, 2),
  ('ASMANE BEN OUMAR','Class 4','5a',  3,    5,  5, 2),
  ('ASMANE BEN OUMAR','Class 4','6a',  1,    3, 10, 2),
  ('ASMANE BEN OUMAR','Class 4','6b',  1,    5,  3, 1),

  -- 2. BETI ASSOMO MIKE-EVANS — Class 4 — 1A non notée — total attendu 243
  ('BETI ASSOMO MIKE-EVANS','Class 4','1b', 10,  19,  3, 2),
  ('BETI ASSOMO MIKE-EVANS','Class 4','1c',  8,   6,  2, 2),
  ('BETI ASSOMO MIKE-EVANS','Class 4','2a',  5,  28,  3, 2),
  ('BETI ASSOMO MIKE-EVANS','Class 4','2b',  5,  28,  3, 2),
  ('BETI ASSOMO MIKE-EVANS','Class 4','3a',  5,   7,  3, 2),
  ('BETI ASSOMO MIKE-EVANS','Class 4','3b',  5,  10,  3, 2),
  ('BETI ASSOMO MIKE-EVANS','Class 4','4a',  5,  10,  3, 2),
  ('BETI ASSOMO MIKE-EVANS','Class 4','5a',  3,  10,  5, 2),
  ('BETI ASSOMO MIKE-EVANS','Class 4','6a',  3,   5, 10, 2),
  ('BETI ASSOMO MIKE-EVANS','Class 4','6b',  3,   8,  5, 2),

  -- 3. NDZIE LEMA — Class 3 — 1A non notée — total attendu 125
  ('NDZIE LEMA','Class 3','1b',  1,   9,  1, 2),
  ('NDZIE LEMA','Class 3','1c',  8,   3,  1, 1),
  ('NDZIE LEMA','Class 3','2a',  2,   8,  1, 1),
  ('NDZIE LEMA','Class 3','2b',  2,  10,  1, 1),
  ('NDZIE LEMA','Class 3','3a',  1,   5,  1, 1),
  ('NDZIE LEMA','Class 3','3b',  1,   2,  1, 1),
  ('NDZIE LEMA','Class 3','4a',  1,   3,  3, 2),
  ('NDZIE LEMA','Class 3','5a',  3,  10,  5, 2),
  ('NDZIE LEMA','Class 3','6a',  3,   5,  8, 2),
  ('NDZIE LEMA','Class 3','6b',  2,   7,  3, 1),

  -- 4. ORUÇ SADETTIN TUNAHAN — Class 4 — total attendu 284.5
  ('ORUÇ SADETTIN TUNAHAN','Class 4','1a', 10, 17.5,  5, 5),
  ('ORUÇ SADETTIN TUNAHAN','Class 4','1b', 10,   20,  3, 2),
  ('ORUÇ SADETTIN TUNAHAN','Class 4','1c',  8,    6,  2, 2),
  ('ORUÇ SADETTIN TUNAHAN','Class 4','2a',  5,   28,  3, 2),
  ('ORUÇ SADETTIN TUNAHAN','Class 4','2b',  5,   28,  3, 2),
  ('ORUÇ SADETTIN TUNAHAN','Class 4','3a',  5,   10,  3, 2),
  ('ORUÇ SADETTIN TUNAHAN','Class 4','3b',  5,   10,  3, 2),
  ('ORUÇ SADETTIN TUNAHAN','Class 4','4a',  5,   10,  3, 2),
  ('ORUÇ SADETTIN TUNAHAN','Class 4','5a',  3,   10,  5, 2),
  ('ORUÇ SADETTIN TUNAHAN','Class 4','6a',  3,    5, 10, 2),
  ('ORUÇ SADETTIN TUNAHAN','Class 4','6b',  3,    8,  5, 2),

  -- 5. NWAKEZE CHEMLIE VICTOR — Class 4 — total attendu 260
  ('NWAKEZE CHEMLIE VICTOR','Class 4','1a', 10, 15,  5, 5),
  ('NWAKEZE CHEMLIE VICTOR','Class 4','1b',  8, 20,  3, 2),
  ('NWAKEZE CHEMLIE VICTOR','Class 4','1c',  8,  6,  2, 2),
  ('NWAKEZE CHEMLIE VICTOR','Class 4','2a',  5, 18,  3, 2),
  ('NWAKEZE CHEMLIE VICTOR','Class 4','2b',  5, 18,  3, 2),
  ('NWAKEZE CHEMLIE VICTOR','Class 4','3a',  5, 10,  3, 2),
  ('NWAKEZE CHEMLIE VICTOR','Class 4','3b',  5, 10,  3, 2),
  ('NWAKEZE CHEMLIE VICTOR','Class 4','4a',  5, 10,  3, 2),
  ('NWAKEZE CHEMLIE VICTOR','Class 4','5a',  3, 10,  5, 2),
  ('NWAKEZE CHEMLIE VICTOR','Class 4','6a',  3,  5, 10, 2),
  ('NWAKEZE CHEMLIE VICTOR','Class 4','6b',  3,  8,  5, 2),

  -- 6. OLIALIMA MARTHINOVA CHRYSTIE URIELLE — Class 4 — total attendu 274.5
  --    1B : Pratique 5 et Savoir-être 5 DÉPASSENT le barème (3 et 2). Cf. en-tête.
  ('OLIALIMA MARTHINOVA CHRYSTIE URIELLE','Class 4','1a', 8,   18,  5, 5),
  ('OLIALIMA MARTHINOVA CHRYSTIE URIELLE','Class 4','1b', 8,   17,  5, 5),
  ('OLIALIMA MARTHINOVA CHRYSTIE URIELLE','Class 4','1c', 8,    6,  2, 2),
  ('OLIALIMA MARTHINOVA CHRYSTIE URIELLE','Class 4','2a', 1,   27,  3, 2),
  ('OLIALIMA MARTHINOVA CHRYSTIE URIELLE','Class 4','2b', 5,   28,  3, 2),
  ('OLIALIMA MARTHINOVA CHRYSTIE URIELLE','Class 4','3a', 5,  7.5,  3, 2),
  ('OLIALIMA MARTHINOVA CHRYSTIE URIELLE','Class 4','3b', 5,   10,  3, 2),
  ('OLIALIMA MARTHINOVA CHRYSTIE URIELLE','Class 4','4a', 5,   10,  3, 2),
  ('OLIALIMA MARTHINOVA CHRYSTIE URIELLE','Class 4','5a', 3,    9,  5, 2),
  ('OLIALIMA MARTHINOVA CHRYSTIE URIELLE','Class 4','6a', 3,    5, 10, 2),
  ('OLIALIMA MARTHINOVA CHRYSTIE URIELLE','Class 4','6b', 3,    8,  5, 2),

  -- 7. SEUDIEU HELE SEAN ANDREW — Class 6 — 1A et 6A non notées — total attendu 195
  --    1C : Savoir-être non noté sur la fiche -> NULL, pas 0.
  ('SEUDIEU HELE SEAN ANDREW','Class 6','1b',   6,  18,  2,    2),
  ('SEUDIEU HELE SEAN ANDREW','Class 6','1c',  10,   6,  2, NULL),
  ('SEUDIEU HELE SEAN ANDREW','Class 6','2a',   4,  14,  2,    2),
  ('SEUDIEU HELE SEAN ANDREW','Class 6','2b',   5,  26,  3,    2),
  ('SEUDIEU HELE SEAN ANDREW','Class 6','3a',   5,   9,  3,    2),
  ('SEUDIEU HELE SEAN ANDREW','Class 6','3b', 4.5, 9.5,  3,    2),
  ('SEUDIEU HELE SEAN ANDREW','Class 6','4a',   4,   8,  2,    2),
  ('SEUDIEU HELE SEAN ANDREW','Class 6','5a',   3,   9,  5,    2),
  ('SEUDIEU HELE SEAN ANDREW','Class 6','6b',   3,   9,  4,    2),

  -- 8. AFAMENYI EMANUEL YOYO — Class 5 — 1A, 3B et 6A non notées — total attendu 193
  --    2B : Oral non noté sur la fiche -> NULL (l'écran affiche 32/35).
  ('AFAMENYI EMANUEL YOYO','Class 5','1b',   10, 22, 3, 2),
  ('AFAMENYI EMANUEL YOYO','Class 5','1c',    8,  6, 2, 2),
  ('AFAMENYI EMANUEL YOYO','Class 5','2a',    5, 17, 3, 2),
  ('AFAMENYI EMANUEL YOYO','Class 5','2b', NULL, 27, 3, 2),
  ('AFAMENYI EMANUEL YOYO','Class 5','3a',    5, 10, 3, 2),
  ('AFAMENYI EMANUEL YOYO','Class 5','4a',    5,  9, 3, 2),
  ('AFAMENYI EMANUEL YOYO','Class 5','5a',    3, 10, 5, 2),
  ('AFAMENYI EMANUEL YOYO','Class 5','6b',    3, 10, 5, 2),

  -- 9. MOHAMMADOU-MAHZOU BAH — Class 5 — 1A, 3B et 6A non notées — total attendu 176
  ('MOHAMMADOU-MAHZOU BAH','Class 5','1b',  8, 19, 3, 2),
  ('MOHAMMADOU-MAHZOU BAH','Class 5','1c', 10,  6, 2, 2),
  ('MOHAMMADOU-MAHZOU BAH','Class 5','2a',  5,  7, 3, 2),
  ('MOHAMMADOU-MAHZOU BAH','Class 5','2b',  5, 25, 3, 2),
  ('MOHAMMADOU-MAHZOU BAH','Class 5','3a',  5, 10, 3, 2),
  ('MOHAMMADOU-MAHZOU BAH','Class 5','4a',  5,  8, 3, 2),
  ('MOHAMMADOU-MAHZOU BAH','Class 5','5a',  3, 10, 5, 2),
  ('MOHAMMADOU-MAHZOU BAH','Class 5','6b',  3,  6, 3, 2);

-- ── 2) Dépliage en une ligne par critère NOTÉ ──────────────────────────────
CREATE TEMP TABLE imp_notes AS
SELECT b.eleve, b.classe, b.competence_id, c.critere_id, c.note
  FROM imp_brut b
  CROSS JOIN LATERAL (VALUES
         ('oral',        b.oral),
         ('ecrit',       b.ecrit),
         ('pratique',    b.pratique),
         ('savoir_etre', b.savoir_etre)
       ) AS c(critere_id, note)
 WHERE c.note IS NOT NULL;

-- ── 3) Résolution de l'école, des classes et des élèves, PAR NOM ───────────
-- Aucun identifiant n'est codé en dur : tout est résolu ici, et le lot refuse
-- de s'appliquer si quoi que ce soit reste ambigu ou introuvable.
CREATE TEMP TABLE imp_resolu AS
SELECT i.eleve, i.classe, i.competence_id, i.critere_id, i.note,
       s.id AS eleve_id, s.school_id
  FROM imp_notes i
  JOIN public.schools  e ON e.name ILIKE '%bright continent%'
  JOIN public.classes  k ON k.school_id = e.id
                        AND upper(btrim(k.name)) = upper(btrim(i.classe))
  JOIN public.students s ON s.school_id = e.id
                        AND s.class_id  = k.id
                        AND upper(btrim(s.name)) = upper(btrim(i.eleve));

DO $$
DECLARE
  v_ecoles  integer;
  v_manque  text := '';
  v_ambigu  text := '';
  r         record;
BEGIN
  SELECT count(*) INTO v_ecoles FROM public.schools WHERE name ILIKE '%bright continent%';
  IF v_ecoles <> 1 THEN
    RAISE EXCEPTION 'schools ILIKE ''%%bright continent%%'' renvoie % ecole(s), il en faut 1. Precisez le nom.', v_ecoles;
  END IF;

  -- Un (eleve, classe) de la fiche qui ne tombe sur AUCUN eleve de la base.
  FOR r IN
    SELECT i.eleve, i.classe FROM (SELECT DISTINCT eleve, classe FROM imp_notes) i
     WHERE NOT EXISTS (SELECT 1 FROM imp_resolu x
                        WHERE x.eleve = i.eleve AND x.classe = i.classe)
     ORDER BY 2, 1
  LOOP
    v_manque := v_manque || format(E'\n  - %s  (%s)', r.eleve, r.classe);
  END LOOP;
  IF v_manque <> '' THEN
    RAISE EXCEPTION E'Introuvables dans Bright Continent (nom ET classe doivent correspondre exactement) :%\nRien n''a ete ecrit.', v_manque;
  END IF;

  -- Un (eleve, classe) qui tombe sur PLUSIEURS eleves : homonymes.
  FOR r IN
    SELECT eleve, classe, count(DISTINCT eleve_id) AS n
      FROM imp_resolu GROUP BY eleve, classe HAVING count(DISTINCT eleve_id) > 1
     ORDER BY 2, 1
  LOOP
    v_ambigu := v_ambigu || format(E'\n  - %s  (%s) -> %s eleves', r.eleve, r.classe, r.n);
  END LOOP;
  IF v_ambigu <> '' THEN
    RAISE EXCEPTION E'Homonymes, impossible de trancher :%\nRien n''a ete ecrit.', v_ambigu;
  END IF;

  RAISE NOTICE 'Ecole et 9 eleves resolus. %  lignes de notes a ecrire.',
    (SELECT count(*) FROM imp_resolu);
END $$;

-- ── 4) Écriture ────────────────────────────────────────────────────────────
-- `points_max` n'est pas renseigne : NULL = barème officiel du référentiel.
INSERT INTO public.prim_notes
       (school_id, eleve_id, competence_id, critere_id, ua, trimestre_id,
        note, date_saisie, updated_at, version)
SELECT school_id, eleve_id, competence_id, critere_id, 1, 't1',
       note, now(), now(), 1
  FROM imp_resolu
ON CONFLICT (eleve_id, competence_id, critere_id, ua) DO UPDATE
  SET note       = EXCLUDED.note,
      updated_at = now(),
      version    = prim_notes.version + 1;

-- ── 5) Contrôle : le compte doit tomber ────────────────────────────────────
DO $$
DECLARE v_ecrit integer; v_attendu integer;
BEGIN
  SELECT count(*) INTO v_attendu FROM imp_resolu;
  SELECT count(*) INTO v_ecrit
    FROM public.prim_notes n
    JOIN imp_resolu r ON r.eleve_id = n.eleve_id
                     AND r.competence_id = n.competence_id
                     AND r.critere_id = n.critere_id
   WHERE n.ua = 1 AND n.note = r.note;
  IF v_ecrit <> v_attendu THEN
    RAISE EXCEPTION '% lignes relues au lieu de % : l''ecriture est incomplete.', v_ecrit, v_attendu;
  END IF;
  RAISE NOTICE 'UA1 Bright Continent : % notes ecrites et relues a l''identique. OK', v_ecrit;
END $$;

-- ── 6) Le détail, à relire après exécution ─────────────────────────────────
-- Total par élève, confronté au total attendu relevé sur la fiche.
SELECT r.classe,
       r.eleve,
       count(*)                      AS criteres_saisis,
       count(DISTINCT r.competence_id) AS competences,
       sum(r.note)                   AS total_obtenu,
       a.total_attendu,
       CASE WHEN sum(r.note) = a.total_attendu THEN 'OK' ELSE 'ECART' END AS verdict
  FROM imp_resolu r
  JOIN (VALUES
          ('ASMANE BEN OUMAR',                      152.0),
          ('BETI ASSOMO MIKE-EVANS',                243.0),
          ('NDZIE LEMA',                            125.0),
          ('ORUÇ SADETTIN TUNAHAN',                 284.5),
          ('NWAKEZE CHEMLIE VICTOR',                260.0),
          ('OLIALIMA MARTHINOVA CHRYSTIE URIELLE',  274.5),
          ('SEUDIEU HELE SEAN ANDREW',              195.0),
          ('AFAMENYI EMANUEL YOYO',                 193.0),
          ('MOHAMMADOU-MAHZOU BAH',                 176.0)
       ) AS a(eleve, total_attendu) ON a.eleve = r.eleve
 GROUP BY r.classe, r.eleve, a.total_attendu
 ORDER BY r.classe, r.eleve;
