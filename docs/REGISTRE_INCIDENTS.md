# Registre des incidents — NotesCam

> Les pannes réellement rencontrées en école, et ce qui empêche désormais leur retour.
> Une entrée n'est **close** que si un test ou un garde-fou interdit la récidive : sinon
> elle reste **ouverte**, même si le symptôme a disparu.
>
> Entrées reconstituées le 2026-10-18 depuis l'historique Git et les en-têtes de tests de
> non-régression, qui documentent chacun l'incident qui les a fait naître.

Format : `I<n>` · date · symptôme vu par l'école · cause réelle · parade · garde-fou.

---

## I1 — Des notes présentes en base n'apparaissent pas dans l'application

**Date** : 2026-10-18 · **Statut** : **ouvert** (cause probable, non confirmée par l'école)
**École** : BRIGHT CONTINENT BILINGUAL SCHOOL

**Symptôme.** 118 notes écrites en base ne sont pas visibles sur `/app/grades`.

**Ce qui a été écarté par la mesure.** La base contient bien les 118 notes en séquence 1 ;
l'administrateur de l'école les lit toutes avec les politiques RLS appliquées (requête
exécutée sous son identité) ; le site de production pointe bien vers
`ltxopwoxvgslsgzixbpx`. Ce n'est donc ni une perte de données, ni un droit manquant, ni
une erreur de base.

**Causes probables, par ordre de vraisemblance.**
1. L'application peint d'abord le cache IndexedDB puis rafraîchit depuis Supabase : un
   onglet déjà ouvert ignore une écriture faite **hors application**. Un rechargement
   forcé est nécessaire.
2. L'école est en `grade_entry_mode = 'subject'` : l'écran n'affiche qu'une matière à la
   fois, et l'onglet par défaut est le premier par ordre alphabétique — « Anglais » en
   6ème, qui n'a aucune note.
3. Le sélecteur de classe reste vide tant qu'aucune section n'est choisie, l'école ayant
   plusieurs sections. Les quatre classes concernées sont en « Premier cycle ».

**Leçon de fond.** Écrire en base sans passer par l'application contourne la file de
synchronisation et les caches : à éviter hors import outillé.

**Garde-fou** : aucun. Entrée à clore quand l'école confirme, ou quand la cause est isolée.

---

## I2 — Une seule entrée refusée bloquait toute la file de poussée

**Date** : vers 2026-10-17 · **Statut** : clos · **Source** : commits `f1de1e0`, `60e8e60`

**Symptôme.** Plus rien ne remontait au Cloud depuis l'école.

**Cause.** Une entrée refusée restait en tête de file et la réparation ne tournait jamais.

**Parade.** Un verdict par ligne, plus un refus global (`36ebb1c`, branche
`fix/sync-contract`, non fusionnée).

**Garde-fou** : `server/_push_refus.test.mjs`, `server/_sync_repair.test.mjs`.

---

## I3 — Les lignes à `updated_at` NULL ne montaient jamais au Cloud

**Date** : vers 2026-10-16 · **Statut** : clos · **Source** : commit `9b22e57`

**Symptôme.** Des données saisies à l'école restaient indéfiniment absentes du Cloud, sans
erreur visible.

**Cause.** Le curseur de poussée comparait des `updated_at` ; une ligne à NULL n'était
jamais sélectionnée.

**Garde-fou** : `server/_sync_contract.test.mjs`, qui fait échouer le test pour tout écart
non inscrit dans `docs/SUIVI_CONTRAT_SYNCHRO.md`.

---

## I4 — Un retour arrière de version bloquait l'application

**Date** : vers 2026-10-17 · **Statut** : clos · **Source** : commit `a3733ad`

**Symptôme.** Après installation d'une version plus ancienne, l'application ne démarrait
plus à l'école.

**Garde-fou** : test de non-régression côté serveur ; à confirmer lequel.

---

## I5 — Des notes du vendredi disparaissaient avant d'avoir été transmises

**Date** : antérieure à 2026-07 · **Statut** : clos
**Source** : en-tête de `src/lib/_syncDurability.test.mjs`

**Symptôme.** Des enseignants saisissaient des notes le vendredi sur le poste local ;
elles avaient disparu le lundi.

**Cause.** `pruneExpiredItems()` supprimait tout élément de file de plus de 48 heures, et
il était appelé au démarrage **avant** la première tentative de transmission.

**Garde-fou** : `src/lib/_syncDurability.test.mjs` et `src/lib/_syncRestart.test.mjs`
(à lancer avec le loader `_syncBatch.hooks.mjs`, que `npm test` applique désormais seul).

---

## I6 — « Le lieu de naissance ne se récupère pas » (THE GENIUS)

**Date** : 2026-09-10 · **Statut** : clos
**Source** : en-tête de `src/lib/_importStudents.test.mjs`

**Symptôme.** Plainte de l'école : le lieu de naissance ne serait pas importé.

**Cause réelle.** Le lieu était bien importé. C'était la **date** qui se trompait de
colonne : la recherche d'en-tête tentait une correspondance exacte puis approximative, et
« naissance » figurait parmi les candidats de la date.

**Leçon.** Une plainte d'école désigne rarement le bon champ : mesurer avant de corriger.

**Garde-fou** : `src/lib/_importStudents.test.mjs` — **actuellement en échec**, voir
`PROJECT_STATUS.md` B2. Ce garde-fou est donc **inopérant** tant que B2 n'est pas traité.

---

## I7 — Un même frais compté deux fois, et des boutons invisibles au guichet

**Date** : vers 2026-10-13 · **Statut** : clos · **Source** : commit `8920fdd`

**Symptôme.** Au guichet, un frais apparaissait deux fois dans le dû de l'élève, et des
actions n'étaient pas cliquables.

**Garde-fou** : tests de frais dans `src/lib/`; à préciser.
