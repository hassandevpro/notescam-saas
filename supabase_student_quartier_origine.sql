-- ÉLÈVE : QUARTIER DE RÉSIDENCE + ANCIEN ÉTABLISSEMENT
-- ============================================================================
-- Ajoute deux colonnes à `students` :
--   quartier       quartier de résidence de l'élève
--   ecole_origine  ancien établissement (établissement de provenance)
--
-- ── POURQUOI `quartier`, ALORS QU'`adresse` EXISTE ──────────────────────────
-- `adresse` est un texte libre d'une ligne (« Quartier Bastos, Yaoundé »). Le
-- quartier y est noyé, donc inexploitable : impossible de grouper les élèves par
-- quartier, ce dont l'école a besoin pour organiser le ramassage scolaire, les
-- visites à domicile et la convocation des parents par secteur. Une colonne
-- propre rend la question calculable (GROUP BY quartier), ce qu'un LIKE sur une
-- adresse libre ne fera jamais de façon fiable.
-- Les deux cohabitent : `quartier` = le secteur, `adresse` = le reste du détail.
--
-- ── POURQUOI `ecole_origine` ────────────────────────────────────────────────
-- Le modèle savait déjà qu'un élève est « transféré » (`statut = 'transfere'`)
-- et « nouveau dans l'établissement » (`statut_etablissement = 'nouveau'`),
-- mais nulle part D'OÙ il vient. Or les écoles détiennent l'information au
-- dossier d'inscription et en ont besoin :
--   • le registre matricule et les PV d'admission la portent ;
--   • un transfert exige de citer l'établissement de provenance ;
--   • les statistiques de recrutement (quelles écoles nous envoient des élèves)
--     n'étaient pas calculables.
-- Faute de colonne, elle était saisie dans `adresse` ou dans les notes de
-- frais, où rien ne peut l'exploiter.
--
-- Les deux sont du TEXTE LIBRE, non normalisé : les quartiers et les écoles
-- d'origine sont écrits comme le parent les a dictés (« EP Bastos », « École
-- Publique de Bastos »). Imposer un référentiel serait un autre chantier — et
-- refuser une valeur hors référentiel bloquerait une inscription au guichet.
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
  ADD COLUMN IF NOT EXISTS quartier      TEXT,
  ADD COLUMN IF NOT EXISTS ecole_origine TEXT;

COMMENT ON COLUMN public.students.quartier IS
  'Quartier de résidence de l''élève (texte libre, NULL = non renseigné).';
COMMENT ON COLUMN public.students.ecole_origine IS
  'Ancien établissement / établissement de provenance (texte libre, NULL = non renseigné).';

-- ── Contrôle : la migration ÉCHOUE si une colonne manque ────────────────────
DO $$
DECLARE
  c text;
BEGIN
  FOREACH c IN ARRAY ARRAY['quartier', 'ecole_origine'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'students' AND column_name = c
    ) THEN
      RAISE EXCEPTION 'students.% absente apres migration.', c;
    END IF;
  END LOOP;
  RAISE NOTICE 'students.quartier et students.ecole_origine OK.';
END $$;

-- ── Après exécution : taux de remplissage, par école ────────────────────────
-- Utile pour vérifier qu'un import a bien rempli les colonnes.
-- SELECT e.name                                          AS ecole,
--        count(*)                                        AS eleves,
--        count(s.quartier)                               AS avec_quartier,
--        count(s.ecole_origine)                          AS avec_ancien_etab,
--        count(*) FILTER (WHERE s.statut = 'transfere')   AS transferes
--   FROM public.students s
--   JOIN public.schools  e ON e.id = s.school_id
--  GROUP BY e.name
--  ORDER BY e.name;

-- ── Les quartiers les plus représentés (ramassage scolaire, secteurs) ───────
-- SELECT s.quartier, count(*) AS eleves
--   FROM public.students s
--   JOIN public.schools  e ON e.id = s.school_id
--  WHERE e.name ILIKE '%bright continent%' AND s.quartier IS NOT NULL
--  GROUP BY s.quartier
--  ORDER BY eleves DESC;
