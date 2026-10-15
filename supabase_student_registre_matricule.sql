-- ÉLÈVE : REGISTRE MATRICULE — ENTRÉE ET SORTIE DE L'ÉTABLISSEMENT
-- ============================================================================
-- Ajoute cinq colonnes à `students` :
--   date_entree        date (ou année) d'entrée dans l'établissement
--   motif_entree       comment l'élève a été admis (ED, ET, concours, test…)
--   date_sortie        date (ou année) de sortie
--   motif_sortie       pourquoi il est parti (NM, EX, TF, DM, LM, DC)
--   profession_tuteur  profession du tuteur / du parent responsable
--
-- ── D'OÙ VIENT LE BESOIN ────────────────────────────────────────────────────
-- Du registre matricule tenu par les établissements camerounais. Ses colonnes
-- sont fixées par l'administration et leur légende est imprimée en tête du
-- registre :
--   motif d'entrée  : ED = étude de dossier, ET = étude de dossier + test
--   motif de sortie : NM = normale,   EX = exclusion,     TF = transfert,
--                     DM = démission, LM = longue maladie, DC = décès
-- Le modèle élève savait déjà qu'un élève est « nouveau dans l'établissement »
-- (`statut_etablissement`) et d'où il vient (`ecole_origine`), mais ni QUAND il
-- est entré, ni COMMENT il a été admis, ni quand et pourquoi il est parti.
-- Faute de colonnes, un collège de 436 élèves tenait ces quatre informations
-- dans un classeur Excel à part — hors de l'application, donc absentes des
-- certificats de scolarité, des transferts et des statistiques de recrutement.
--
-- ── POURQUOI `date_entree` / `date_sortie` SONT DU TEXTE, PAS DES `date` ────
-- Parce que c'est ce que les registres contiennent. Sur le classeur repris ici,
-- les 70 valeurs renseignées sont des ANNÉES seules (« 2024 », « 2026 ») : le
-- secrétariat note l'année d'entrée, pas le jour. Une colonne `date` aurait
-- obligé à inventer un mois et un jour — une précision fausse, impossible à
-- distinguer ensuite d'une vraie date de rentrée — ou à jeter les 70 valeurs.
-- Le format écrit est donc normalisé mais non contraint :
--   « 2024 »        année seule          (ce que porte le registre)
--   « 2024-2025 »   année scolaire
--   « 2024-09-15 »  date complète ISO    (quand l'école la connaît)
-- Les trois se trient correctement entre elles dans l'ordre lexicographique,
-- et `academic_year` (table `fees`) suit déjà cette convention de texte.
--
-- ── POURQUOI LES MOTIFS NE SONT PAS CONTRAINTS ─────────────────────────────
-- Aucun CHECK, aucun enum. Le registre repris porte « concours », « test » et
-- « ed » là où la légende ne prévoit que ED et ET : une contrainte aurait fait
-- ÉCHOUER l'import de l'élève entier sur un libellé que l'école emploie
-- réellement. Même règle que `quartier` / `ecole_origine` — refuser une valeur
-- hors référentiel bloquerait une inscription au guichet.
--
-- ── POURQUOI `profession_tuteur` ───────────────────────────────────────────
-- Le modèle avait `nom_pere` + `profession_pere` et `nom_mere` +
-- `profession_mere`, mais `tuteur` SANS profession. Or beaucoup de registres ne
-- portent qu'un responsable, « nom du parent », sans dire s'il s'agit du père,
-- de la mère ou d'un tuteur — avec sa profession à côté. Sans cette colonne, il
-- fallait soit jeter la profession, soit la ranger dans `profession_pere` en
-- affirmant une paternité que le registre n'affirme pas.
--
-- Additif et idempotent. Ne touche aucune donnée existante : les colonnes
-- naissent NULL partout, et NULL veut dire « non renseigné ».
-- À EXÉCUTER dans Supabase, dans un onglet VIDE, SANS RIEN SURLIGNER.
--
-- Côté édition LAN, les mêmes colonnes sont posées par `server/db.js`
-- (`ensureColumn('students', …)`) : les deux éditions doivent les avoir, sinon
-- `pickColumns()`/`rawUpsert()` jettent la valeur EN SILENCE — exactement le
-- défaut qui avait vidé les champs parents (cf. le commentaire du bloc
-- « Modèle élève étendu » dans server/db.js).
-- ============================================================================

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS date_entree       TEXT,
  ADD COLUMN IF NOT EXISTS motif_entree      TEXT,
  ADD COLUMN IF NOT EXISTS date_sortie       TEXT,
  ADD COLUMN IF NOT EXISTS motif_sortie      TEXT,
  ADD COLUMN IF NOT EXISTS profession_tuteur TEXT;

COMMENT ON COLUMN public.students.date_entree IS
  'Entrée dans l''établissement : annee (« 2024 »), annee scolaire (« 2024-2025 ») ou date ISO. NULL = non renseigné.';
COMMENT ON COLUMN public.students.motif_entree IS
  'Motif d''entrée au registre matricule : ED = étude de dossier, ET = étude de dossier + test, ou libellé libre (concours, test…). NULL = non renseigné.';
COMMENT ON COLUMN public.students.date_sortie IS
  'Sortie de l''établissement, même format que date_entree. NULL = toujours inscrit.';
COMMENT ON COLUMN public.students.motif_sortie IS
  'Motif de sortie : NM = normale, EX = exclusion, TF = transfert, DM = démission, LM = longue maladie, DC = décès, ou libellé libre. NULL = toujours inscrit.';
COMMENT ON COLUMN public.students.profession_tuteur IS
  'Profession du tuteur / du parent responsable (texte libre, NULL = non renseigné). Pendant de profession_pere / profession_mere pour tuteur.';

-- ── Contrôle : la migration ÉCHOUE si une colonne manque ────────────────────
DO $$
DECLARE
  c text;
BEGIN
  FOREACH c IN ARRAY ARRAY['date_entree', 'motif_entree', 'date_sortie',
                           'motif_sortie', 'profession_tuteur'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'students' AND column_name = c
    ) THEN
      RAISE EXCEPTION 'students.% absente apres migration.', c;
    END IF;
  END LOOP;
  RAISE NOTICE 'students : les 5 colonnes du registre matricule sont en place.';
END $$;

-- ── Après exécution : taux de remplissage, par école ────────────────────────
-- Utile pour vérifier qu'un import a bien rempli les colonnes.
-- SELECT e.name                             AS ecole,
--        count(*)                           AS eleves,
--        count(s.date_entree)               AS avec_date_entree,
--        count(s.motif_entree)              AS avec_motif_entree,
--        count(s.date_sortie)               AS sortis,
--        count(s.profession_tuteur)         AS avec_profession_tuteur
--   FROM public.students s
--   JOIN public.schools  e ON e.id = s.school_id
--  WHERE s.archived_at IS NULL
--  GROUP BY e.name
--  ORDER BY e.name;

-- ── Recrutement : combien d'élèves entrés par année, et comment ─────────────
-- SELECT s.date_entree, coalesce(s.motif_entree, '(non precise)') AS motif,
--        count(*) AS eleves
--   FROM public.students s
--  WHERE s.date_entree IS NOT NULL
--  GROUP BY s.date_entree, s.motif_entree
--  ORDER BY s.date_entree DESC, eleves DESC;
