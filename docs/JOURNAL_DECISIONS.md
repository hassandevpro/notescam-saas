# Journal des décisions techniques — NotesCam

> Une entrée par décision qui engage le produit : ce qui a été décidé, **pourquoi**, ce que
> ça interdit, et comment la défaire. On n'y consigne pas les détails d'implémentation,
> seulement ce qu'un futur intervenant risquerait de casser faute de connaître la raison.
>
> Les écarts du contrat de synchronisation LAN/Cloud ont leur propre registre, plus ancien
> et toujours en vigueur : **`docs/SUIVI_CONTRAT_SYNCHRO.md`**. Ne pas le dupliquer ici ;
> y renvoyer.

Format : `D<n>` · date · décision · raison · conséquence · comment revenir en arrière.

---

## D1 — La colonne `source_balance_raw` reste hors du schéma LAN

**Date** : 2026-10-18 · **Statut** : en attente de la migration Cloud
**Où** : `server/db.js:1282` (commentaire en place), `supabase_cash_book_raw_balance.sql`

**Décision.** Les deux `ensureColumn('…', 'source_balance_raw', …)` sont retirés du schéma
SQLite local, alors que le code de la caisse sait exploiter la colonne.

**Raison.** `supabase_cash_book_raw_balance.sql` n'est pas appliquée au Cloud (vérifié le
2026-10-18 : ni `cash_movements` ni `budget_expenses` n'ont la colonne en prod). Or la
poussée envoie la ligne entière (`SELECT *`) et `sync-push` l'applique telle quelle : une
colonne absente du schéma Cloud fait **refuser la ligne**. Toute dépense ou tout mouvement
de caisse modifié à l'école cesserait donc de remonter — le mécanisme exact qui a déjà
bloqué `students` et `subjects` quand leurs migrations ne suivaient pas.

**Conséquence.** Ne jamais rétablir ces deux lignes avant la migration Cloud. L'import
depuis le poste d'édition écrit directement au Cloud : la colonne lui sert là-bas, pas en
local, donc rien n'est perdu en attendant.

**Retour arrière.** Appliquer la migration Cloud, **puis** remettre les deux `ensureColumn`
dans le même lot. Jamais l'inverse.

---

## D2 — `AGENTS.md` reste la source unique des consignes, `CLAUDE.md` n'est qu'un renvoi

**Date** : 2026-10-18 · **Statut** : actif

**Décision.** `CLAUDE.md` ne contient aucune consigne propre : il renvoie à `AGENTS.md`,
`PROJECT_STATUS.md` et aux deux registres.

**Raison.** `AGENTS.md` existait déjà, était à jour et est chargé automatiquement en début
de session. Écrire un second fichier de consignes complet aurait créé deux vérités qui
divergent à la première modification.

**Retour arrière.** Si l'outillage impose un jour un `CLAUDE.md` autonome, déplacer le
contenu d'`AGENTS.md` et faire l'inverse du renvoi — jamais dupliquer les deux.

---

## D3 — `packaging/` est exclu du lanceur de tests

**Date** : 2026-10-18 · **Statut** : actif · **Où** : `scripts/run-tests.mjs` (`EXCLUS`)

**Décision.** `npm test` ne parcourt que `src/`, `server/` et `supabase/`.

**Raison.** `packaging/Output-maj/` et `packaging/_stage/` contiennent 899 copies figées
des tests livrés avec les paquets d'installation. Les inclure testerait des versions
anciennes du code et porterait le total de 176 à plus de 1000, sans rien prouver sur le
code courant.

**Retour arrière.** Retirer `'packaging'` de `EXCLUS`, en sachant que les échecs
remonteront alors depuis des sources archivées.

---

## D4 — Le lanceur de tests lit le loader documenté dans l'en-tête du test

**Date** : 2026-10-18 · **Statut** : actif · **Où** : `scripts/run-tests.mjs`
(`loaderDocumente`)

**Décision.** Avant de lancer un test, on cherche `--experimental-loader <X>` dans ses
2000 premiers caractères et on utilise ce loader.

**Raison.** La convention du dépôt veut que chaque test documente sa commande en en-tête,
et le loader n'est pas toujours le fichier frère : `_syncRestart` et `_syncDurability`
empruntent `_syncBatch.hooks.mjs`. Sans cette lecture, ces deux tests échouaient à tort
sur `import.meta.env` indéfini.

**Retour arrière.** Supprimer `loaderDocumente` ; il faudra alors une table de
correspondance test → loader, maintenue à la main.

---

## D5 — Les tests E2E ciblent l'édition LAN, jamais le Cloud

**Date** : 2026-10-18 · **Statut** : actif · **Où** : `playwright.config.mjs`

**Décision.** `playwright.config.mjs` lance le serveur LAN sur `127.0.0.1` avec un
`NOTESCAM_DATA_DIR` neuf à chaque exécution, et **refuse de démarrer** si l'URL cible
n'est pas locale.

**Raison.** Il n'existe aucun environnement de recette séparé : la recette se fait dans le
projet Supabase de **production** (risque R2). Un test E2E pointé sur le Cloud écrirait
donc dans les données d'écoles réelles. Le refus est explicite plutôt que documenté, parce
qu'une faute de frappe dans `E2E_BASE_URL` ne doit pas pouvoir atteindre la production.

**Conséquence.** Les parcours qui n'existent que côté Cloud (Auth Supabase, RLS) ne sont
pas couverts par l'E2E ; ils restent couverts par les tests colocalisés et par les
politiques RLS. Ne pas « débloquer » le garde-fou pour gagner en couverture : créer
d'abord un vrai environnement de recette.

**Retour arrière.** Lever la liste `LOCAL` seulement le jour où un projet Supabase de
recette, distinct de la production, existe.

---

## D6 — Les parcours critiques sont déclarés en `test.fixme`, pas en tests vides

**Date** : 2026-10-18 · **Statut** : actif
**Où** : `e2e/01-parcours-critiques.spec.mjs`

**Décision.** Les 21 parcours critiques sont écrits comme `test.fixme`, donc comptés et
affichés comme « à faire », mais non exécutés.

**Raison.** Un test vide qui passe donnerait une CI verte mensongère ; ne rien écrire
perdrait la liste des parcours et leurs prérequis. Le `fixme` garde la liste visible à
chaque exécution sans jamais mentir sur la couverture réelle.

**Conséquence.** `npm run test:e2e` affiche « 3 passés, 21 ignorés ». Ce 21 est une dette
assumée, inscrite en R7 : il ne doit pas diminuer autrement qu'en écrivant les tests.

**Retour arrière.** Aucun : activer un parcours signifie l'écrire.
