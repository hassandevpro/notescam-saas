-- ════════════════════════════════════════════════════════════════════════════
-- THE GENIUS — le service financier accède au groupe « Scolarité »
-- ════════════════════════════════════════════════════════════════════════════
-- Demande de l'établissement (09/2026) : « tout le service financier doit avoir
-- accès à la scolarité ». Trois comptes étaient enfermés dans les pages d'argent
-- et ne pouvaient pas ouvrir la fiche d'un élève ni la liste des classes :
--
--   Comptable / Caissier ........ ["/app/fees","/app/frais-catalogue"]
--   RAF ......................... + budgets, budget global, dépenses
--   Contrôleur .................. budgets, budget global, dépenses, rapports…
--
-- CE QUE CETTE MIGRATION FAIT, ET CE QU'ELLE NE FAIT PAS.
-- Elle AJOUTE trois pages de consultation (/app/students, /app/classes,
-- /app/timetable) aux permissions de ces trois comptes. Elle ne retire rien, ne
-- touche aucun autre compte, aucune autre école, et n'accorde AUCUNE autorité
-- nouvelle : ni note, ni bulletin, ni personnel, ni paramètre.
--
-- POURQUOI C'EST SANS DANGER ICI, ET SEULEMENT ICI.
-- `src/core/strictMatrix.js` pose deux axes indépendants : la pédagogie est
-- SECTORIELLE, la finance est GLOBALE, et « l'autorité financière n'ouvre aucune
-- page pédagogique ». Cette migration ne contredit pas ce principe : elle ne
-- dérive rien du rôle financier: c'est l'école qui confie EXPLICITEMENT ces
-- pages à ces comptes, exactement comme elle l'a fait pour le Secrétariat. La
-- matrice stricte, elle, ne retire /app/students ni /app/classes à personne sauf
-- aux enseignants — elle laissera donc passer sans être modifiée.
--
-- Le périmètre suit : ces trois comptes portent `scope_global = true` (vérifié
-- le 09/2026), donc ils verront TOUS les élèves des deux secteurs. Ouvrir la
-- page à un compte sans périmètre aurait donné un écran vide, ce qui est pire
-- qu'une page absente.
--
-- `updated_at` EST REMONTÉ VOLONTAIREMENT. `sync-pull` est un keyset sur
-- (updated_at, id) strictement supérieur au curseur : sans cela, la ligne
-- resterait derrière le curseur du serveur LAN de l'école et le changement ne
-- descendrait JAMAIS. C'est le défaut vécu le 27/08/2026 sur teachers.sector.
--
-- Idempotente : relancée, la sous-requête d'ajout rend un tableau vide et les
-- permissions ne bougent pas (donc `updated_at` non plus n'a pas à bouger, mais
-- il est remonté sans effet de bord — LWW départage sur une valeur identique).
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

UPDATE school_users u
SET permissions = (
      coalesce(u.permissions, '[]')::jsonb
      || (
        SELECT coalesce(jsonb_agg(to_jsonb(x.page)), '[]'::jsonb)
        FROM (VALUES ('/app/students'), ('/app/classes'), ('/app/timetable')) AS x(page)
        WHERE NOT (coalesce(u.permissions, '[]')::jsonb @> to_jsonb(x.page))
      )
    )::text,
    updated_at = now(),
    version    = coalesce(u.version, 0) + 1
WHERE u.school_id = '6b68407b-3d2e-426b-81ff-c4e68e66120a'
  AND u.full_name IN (
    'Comptable / Caissier',
    'Responsable Administratif et Financier',
    'Contrôleur'
  )
  -- Ne réécrit que ce qui doit l'être : si les trois pages sont déjà là, la ligne
  -- n'est pas touchée du tout (ni permissions, ni updated_at, ni version).
  AND NOT (coalesce(u.permissions, '[]')::jsonb
           @> '["/app/students","/app/classes","/app/timetable"]'::jsonb);

COMMIT;

-- ── Contrôle ────────────────────────────────────────────────────────────────
-- Attendu : les trois comptes portent les trois pages, et gardent celles qu'ils
-- avaient (la caisse pour le Caissier et le RAF, les budgets pour les trois).
SELECT full_name,
       (permissions::jsonb @> '["/app/students"]'::jsonb)  AS eleves,
       (permissions::jsonb @> '["/app/classes"]'::jsonb)   AS classes,
       (permissions::jsonb @> '["/app/timetable"]'::jsonb) AS emploi_du_temps,
       (permissions::jsonb @> '["/app/fees"]'::jsonb)      AS caisse,
       permissions
FROM school_users
WHERE school_id = '6b68407b-3d2e-426b-81ff-c4e68e66120a'
  AND full_name IN ('Comptable / Caissier',
                    'Responsable Administratif et Financier',
                    'Contrôleur')
ORDER BY full_name;
