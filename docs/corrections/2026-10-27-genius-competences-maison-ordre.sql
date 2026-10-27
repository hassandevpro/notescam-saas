-- HUIT COMPÉTENCES MAISON COUPENT LA FAMILLE 6 EN DEUX — THE GENIUS
--
-- ⚠️  NON APPLIQUÉ, ET PROBABLEMENT INUTILE. Lire le § « CE QUI A CHANGÉ
--     DEPUIS » avant d'envisager de l'exécuter : le correctif de code rend ce
--     fichier facultatif, et l'écran offre désormais un meilleur geste.
--
-- ── CE QUI A ÉTÉ RELEVÉ EN PRODUCTION le 2026-10-27 ────────────────────────
--
-- La première version de ce fichier était écrite à partir de DEUX BULLETINS PDF
-- et du code, pas d'une lecture de la base : elle annonçait trois lignes et
-- portait un id d'école en gabarit. La requête de vérification a été lancée, et
-- elle a rendu HUIT lignes pour THE GENIUS (plus une pour BRIGHT CONTINENT) :
--
--   id école : 6b68407b-3d2e-426b-81ff-c4e68e66120a
--
--   code  intitulé             ordre   domaine
--   CH    Chinois               101     NULL
--   EC    Economics             102     NULL
--   MA    Management            103     NULL
--   PW    Practical Work        104     NULL
--   TP    Travaux Pratiques     105     NULL
--   EG    Économie Générale     106     NULL
--   GE    Gestion               107     NULL
--   GE2   General Economics     108     NULL
--
-- Le référentiel national du primaire occupe la plage 10 à 110 (1A=10 … 6A=100,
-- 6B=110). Les huit sont donc EXACTEMENT entre 6A et 6B : la famille 6 est
-- coupée en deux, et le carnet imprimait DEUX FOIS
-- « 6) PRATIQUER LES ACTIVITÉS PHYSIQUES, SPORTIVES ET ARTISTIQUES », avec le
-- même total les deux fois. « Économie Générale » se lisait sous un intitulé qui
-- parle d'activités physiques et sportives — ce qu'elle n'est pas.
--
-- ── CE QUI A CHANGÉ DEPUIS, ET POURQUOI CE FICHIER N'EST PLUS NÉCESSAIRE ───
--
-- 1. `addRefLigne` ne pose plus `ordre = 90 + lignes.length` mais
--    `max(ordre) + 10` : les PROCHAINES lignes se rangent après le national.
--
-- 2. `reperesDeGroupe` (src/core/primCompactRows.js) ferme une famille à sa
--    DERNIÈRE ligne, contiguë ou non : le doublon de bandeau a disparu sans
--    toucher à la base.
--
-- 3. Surtout — décision D27 — une ligne maison porte désormais une FAMILLE, que
--    l'école choisit à l'écran (« Modifier les compétences », liste au bout de
--    la ligne). C'est un MEILLEUR geste que ce fichier : « Chinois » rejoint les
--    langues (famille 1), ses points entrent dans le total de cette famille, et
--    elle cesse d'apparaître au milieu de la famille 6. Déplacer `ordre` ne
--    faisait que la sortir d'un endroit, sans lui en donner un.
--
-- CE FICHIER NE RESTE UTILE QUE POUR UNE LIGNE QUE L'ÉCOLE VEUT GARDER HORS DE
-- TOUTE FAMILLE : elle s'imprime alors en fin de liste plutôt qu'au milieu du
-- national. Dans tous les autres cas, préférer l'écran.
--
-- ── LA VRAIE QUESTION, QUE CE FICHIER NE TRANCHE PAS ──────────────────────
--
-- Sept de ces huit lignes sont des matières du SECONDAIRE — Economics,
-- Management, Practical Work, Travaux Pratiques, Économie Générale, Gestion,
-- General Economics — posées dans le référentiel du PRIMAIRE. Et elles vont par
-- paires bilingues (Economics / General Economics / Économie Générale ;
-- Gestion / Management ; Practical Work / Travaux Pratiques).
--
-- Les déplacer ne répond pas à ça. Il faut demander à l'école si elles ont leur
-- place ici, et sinon les RETIRER — ce que l'écran fait déjà, en supprimant
-- celles qui ne portent aucune note et en masquant les autres.

-- ── VÉRIFICATION — À LANCER SEULE, ET À LIRE, AVANT TOUT LE RESTE ──────────
--
-- Elle doit rendre les huit lignes ci-dessus, `domaine` NULL, `ordre` entre
-- celui de 6A et celui de 6B. Si elle rend autre chose — et notamment si des
-- `domaine` ont été renseignés depuis l'écran — NE RIEN APPLIQUER : le travail
-- a déjà été fait autrement, et ce fichier le déferait.

SELECT code, intitule, domaine, ordre, school_id
  FROM prim_competences
 WHERE school_id = '6b68407b-3d2e-426b-81ff-c4e68e66120a'
 ORDER BY ordre;

SELECT code, intitule, ordre
  FROM prim_competences
 WHERE school_id IS NULL
 ORDER BY ordre;

-- Et ce qu'elles portent : une ligne sans note ni classe se SUPPRIME depuis
-- l'écran, elle n'a pas besoin d'être déplacée.
SELECT p.code, p.intitule, p.ordre,
       (SELECT count(*) FROM prim_notes n
         WHERE n.competence_id = p.id)                                AS notes,
       (SELECT count(DISTINCT s.class_id) FROM subjects s
         WHERE s.school_id = p.school_id AND s.name ILIKE p.intitule) AS classes_qui_l_impriment
  FROM prim_competences p
 WHERE p.school_id = '6b68407b-3d2e-426b-81ff-c4e68e66120a'
 ORDER BY p.ordre;

-- ── CORRECTION ─────────────────────────────────────────────────────────────
--
-- Décommenter seulement si l'école veut garder ces lignes HORS famille, et
-- seulement après avoir lu les trois requêtes ci-dessus. L'écriture est
-- idempotente : elle repart du maximum national à chaque fois.
--
-- Elle ne touche QUE la colonne `ordre` de lignes appartenant à l'école. AUCUNE
-- NOTE n'est touchée, aucun barème, aucun identifiant : les notes sont
-- attachées à `competence_id`, qui ne bouge pas.

-- BEGIN;
--
-- WITH dernier_national AS (
--   SELECT COALESCE(MAX(ordre), 110) AS ordre_max
--     FROM prim_competences
--    WHERE school_id IS NULL
-- )
-- UPDATE prim_competences p
--    SET ordre = (SELECT ordre_max FROM dernier_national)
--                + 10 * ROW_NUMBER() OVER (ORDER BY p.ordre, p.code)
--  WHERE p.school_id = '6b68407b-3d2e-426b-81ff-c4e68e66120a'
--    AND p.domaine IS NULL          -- une ligne RANGÉE dans une famille n'a pas à bouger
--    AND p.ordre <= (SELECT ordre_max FROM dernier_national);
--
-- -- CONTRÔLE DANS LA MÊME TRANSACTION : toutes doivent être STRICTEMENT
-- -- au-dessus du dernier national. Sinon, ROLLBACK.
-- SELECT code, ordre FROM prim_competences
--  WHERE school_id = '6b68407b-3d2e-426b-81ff-c4e68e66120a' ORDER BY ordre;
--
-- COMMIT;

-- ── APRÈS COUP, À L'ÉCRAN — le seul contrôle qui vaut ──────────────────────
--
--   · le bulletin d'un élève de CE2 BIL n'imprime plus qu'UNE fois
--     « 6) PRATIQUER LES ACTIVITÉS PHYSIQUES, SPORTIVES ET ARTISTIQUES » ;
--   · les lignes maison se lisent APRÈS le total de la famille 6, et non entre
--     son bandeau et son total ;
--   · le TOTAL GÉNÉRAL de l'élève est INCHANGÉ — ces lignes comptaient déjà
--     dans le total général, et ce fichier ne fait que les déplacer.
--     Si ce nombre bouge, annuler : quelque chose d'autre a été touché.
