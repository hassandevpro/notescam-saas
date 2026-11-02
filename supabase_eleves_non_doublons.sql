-- ============================================================================
-- « CE N'EST PAS UN DOUBLON » — MÉMORISER LA DÉCISION DE LA SECRÉTAIRE
-- ============================================================================
-- Consigne du responsable, 2026-11-01 :
--
--     « Alerte, jamais blocage : la secrétaire peut toujours confirmer que ce
--       sont deux élèves différents, et cette décision est mémorisée (paire
--       "non doublon"). »
--
-- Sans cette mémoire, la même alerte revient à chaque ouverture de fiche et à
-- chaque scan de la base. Au bout de trois fois, on clique sans lire — et
-- l'alerte ne protège plus rien.
--
-- UNE COLONNE, PAS UNE TABLE. `students` est déjà synchronisée LAN ↔ en ligne :
-- la décision suit l'école sans un branchement de plus, et elle disparaît avec
-- la fiche. Une table neuve aurait demandé d'être déclarée dans la synchro, le
-- Merkle, le scope guard, la politique d'accès et les fonctions Edge — donc un
-- redéploiement, donc une autorisation de mise en production, pour mémoriser
-- une préférence de guichet.
--
-- Ce que ça coûte, et c'est assumé : deux secrétaires qui tranchent la même
-- paire en même temps, chacune hors ligne, s'écrasent l'une l'autre (dernier
-- écrit gagne, comme pour le reste de la fiche). Conséquence : l'alerte revient
-- une fois. Aucune donnée scolaire n'est en jeu.
--
-- CONTENU : un tableau JSON d'identifiants d'élèves — ["uuid-a","uuid-b"].
-- Écrit DES DEUX CÔTÉS de la paire, pour que la suppression d'une fiche ne
-- fasse pas réapparaître l'alerte sur l'autre.
--
-- ⛔ ORDRE D'EXÉCUTION — ce fichier D'ABORD, l'application ENSUITE.
-- `students` est poussée colonne par colonne par `sync-push` : une colonne que
-- le Cloud ne connaît pas fait rejeter TOUTE la ligne (PGRST204), donc toutes
-- les inscriptions et toutes les modifications d'élèves. C'est l'incident du
-- 2026-10-26, à ne pas rejouer.
--
-- Additif et idempotent : rejouable sans effet.
-- ============================================================================

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS non_doublons text;

COMMENT ON COLUMN public.students.non_doublons IS
  'Paires déclarées « ce n''est pas un doublon » : tableau JSON d''ids d''élèves, écrit des deux côtés de la paire. Alimenté par l''écran Élèves (détection de doublons).';

-- Aucune politique RLS à ajouter : la colonne suit celles de `students`, qui
-- sont déjà scopées par école. Aucun index non plus — la colonne se lit avec la
-- fiche, jamais seule.

-- ── Contrôle (lecture seule) ───────────────────────────────────────────────
-- Attendu : une ligne, data_type = text, et 0 fiche porteuse pour l'instant.
SELECT
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'students'
      AND column_name = 'non_doublons')                        AS colonne_presente,
  (SELECT count(*) FROM public.students
    WHERE non_doublons IS NOT NULL AND non_doublons <> '[]')   AS fiches_avec_decision;
