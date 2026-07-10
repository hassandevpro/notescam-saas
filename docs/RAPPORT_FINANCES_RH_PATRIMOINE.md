# Rapport de fonctionnement — Budgets, Dépenses, RH & Immobilisations

_Date : 2026-07-10 · Portée : audit UX + fonctionnement des 4 modules de gestion (accès `admin`)._

Ce rapport décrit **comment fonctionne chaque module** (parcours utilisateur, moteurs,
règles métier), puis liste les **frictions UX** relevées et les **corrections déjà
appliquées**.

---

## 1. Vue d'ensemble

Les quatre modules partagent la même ossature **liste ↔ détail**, des **moteurs purs**
séparés de l'affichage, et le mode **hors-ligne** via `loadWithCache` (cache local +
rafraîchissement réseau qui ne bloque jamais).

| Module | Route | Rôle | Table(s) | Moteur |
|---|---|---|---|---|
| Budgets | `/app/budgets` | `admin` | `budgets`, `budget_chapters` | `lib/budgetEngine` |
| Budget global | `/app/budget-global` | `admin` | (lecture consolidée) | `lib/budgetAnalyticsEngine` |
| Dépenses | `/app/depenses` | `admin` | `expenses`, `budget_unlock_requests` | `lib/expenseEngine`, `governance/validationEngine` |
| RH | `/app/rh` | `admin` | `staff` (+ satellites contrats/congés/évals/présences/carrière) | `lib/hrEngine` |
| Immobilisations | `/app/immobilisations` | `admin` | `assets` (+ journaux pannes/réparations/dépenses) | `lib/assetEngine` |

> **Accès.** Ces modules sont réservés au rôle `admin` (nav `src/config/navigation.js`
> + gardes `ADMIN_ONLY` dans `src/App.jsx`). Un **surveillant** n'y accède pas, sauf en
> **compte délégué** avec capacités financières explicites (`school_users.permissions`,
> qui font alors autorité sur nav **et** routes).

---

## 2. Budgets (prévisionnel)

**But** : construire le budget prévisionnel de l'année active, par **secteur** (= section :
maternelle, primaire, collège, lycée… + administration, transport, cantine, internat, etc.).

**Parcours**
1. **Nouveau budget** → entête : libellé, période (annuel / trimestriel / mensuel + rang),
   **secteur**, notes.
2. Le budget créé est **vide** → bouton _« Générer la structure par défaut »_ (5 catégories :
   Fonctionnement, Maintenance, Pédagogie, Vie scolaire, Investissements) ou construction
   manuelle.
3. Arbre **Catégorie → Chapitre → Sous-chapitre** (3 niveaux), en deux colonnes
   **Recettes** / **Dépenses**. Les montants se **cumulent** vers le haut (`chapterRollup`).
4. **Totaux** : Recettes, Dépenses, Solde prévisionnel.

**Cycle de vie** (statut piloté par `canTransition`) :
`Brouillon → Actif → Clôturé`, avec **Rouvrir** depuis Clôturé. Un budget **clôturé**
passe en **lecture seule** (`isBudgetLocked`) : plus d'édition de chapitres.

**Filtre par secteur** _(ajouté)_ : un sélecteur apparaît au-dessus de la liste dès que
**plusieurs secteurs** existent, pour isoler « les différentes sections ».

---

## 3. Dépenses (exécution budgétaire)

**But** : enregistrer les dépenses réelles imputées sur les lignes du budget, avec
**contrôle de dépassement** et **circuit de validation**.

**Parcours**
1. **Choix du budget** via un sélecteur (libellé · période · secteur) → change de « section ».
2. Bandeau **budget restant** recalculé automatiquement : Prévu / Engagé / Reste /
   Taux de consommation + barre de progression (rouge si dépassement).
3. Tableau **Exécution par catégorie / chapitre / sous-chapitre** (`hierarchyRollup`).
4. **Nouvelle dépense** (`ExpenseFormModal`) :
   - Imputation **obligatoire** sur une **feuille** (sous-chapitre), affichée avec son
     **chemin complet** `Catégorie › Chapitre › Sous-chapitre`.
   - Le **secteur est hérité** du budget (aucune ressaisie).
   - Le **disponible de la ligne** s'affiche en direct ; si le montant dépasse →
     **dépense bloquée** + proposition de **demande de déblocage**.
5. **Validateur requis** affiché par dépense selon le **montant** (moteur générique
   `resolveValidatorRole` + barème `schools.validation_rules`, éditable via _« Seuils »_).
   Défaut : `< 25 000` RAF · `25 000–250 000` Coordonnateur · `> 250 000` Fondatrice.
6. **Statuts** de dépense pilotés par `canTransition` ; **déblocages** listés avec
   décision (Coordonnateur / Fondatrice / admin) et historique.

---

## 4. Budget global (consolidation & prévisions)

Tableau de bord **consultation seule** pour la direction (graphiques SVG maison) :
tuiles Recettes/Dépenses/Engagé/Solde, **jauge d'exécution** avec repère « temps écoulé »,
**donut engagé par secteur**, **prévision fin d'année** (rythme mensuel, risque de
dépassement), **recouvrement des frais** et **top postes de dépense**.
Lit les données **en ligne** ; hors-ligne, affiche le dernier instantané en cache ou un
message dédié (utiliser l'édition LAN pour un hors-ligne complet).

---

## 5. RH (dossiers du personnel)

**But** : enrichir le dossier `staff` (module Personnel) — **PAS de paie**.

**Parcours** : liste du personnel (recherche par nom) → **dossier** avec **synthèse**
(contrat courant, congés restants, taux de présence, note moyenne) puis **onglets** :
Contrats, Congés, Évaluations, Présences, Carrière. Chaque onglet est un tableau
**générique piloté par schéma** (`HR_ENTITIES` + `HrRecordModal`).
Moteur `hrEngine` : `currentContract`, `isContractActive`, `leaveBalance`,
`attendanceSummary`, `evaluationAverage`.

---

## 6. Immobilisations (patrimoine)

**But** : registre des actifs (6 catégories : véhicules, bâtiments, ordinateurs,
imprimantes, groupes électrogènes, mobilier) + journaux.

**Parcours** : liste **filtrable par catégorie** → **détail** de l'actif avec synthèse
(Valeur, Pannes ouvertes, Coût entretien, **Coût total / TCO**) puis onglets **journaux**
(Pannes, Réparations, Dépenses), réutilisant `HrRecordModal`. Moteur `assetEngine` :
`assetSummary`, `fleetStats`.

---

## 7. Audit UX — frictions relevées

| # | Priorité | Module | Constat | État |
|---|---|---|---|---|
| 1 | **P1** | Budgets | Liste plate, **aucun filtre par secteur/section** | ✅ Corrigé |
| 2 | **P1** | Dépenses, RH, Actifs | Tables en `overflow-hidden` → **coupées sur mobile/tablette** (pas de scroll) | ✅ Corrigé |
| 3 | **P1** | Budgets | Actions d'arbre `opacity-0 group-hover` → **invisibles au tactile** | ✅ Corrigé |
| 4 | P2 | Tous | **Aucun retour succès/erreur** ; échec d'écriture **silencieux** hors-ligne (pas de système de toast dans l'app) | ⏳ À faire |
| 5 | P2 | Tous | `window.confirm` natif (incohérent avec le design `Modal`, bloquant) | ⏳ À faire |
| 6 | P3 | Dépenses | Pas de recherche/filtre (statut, chapitre, fournisseur, date) | ⏳ Optionnel |
| 7 | P3 | RH | Pas d'état « Chargement… » ; « Aucun personnel » si le store n'est pas prêt ; recherche limitée au nom | ⏳ Optionnel |

**Points déjà solides** : héritage auto du secteur dans la dépense, imputation
obligatoire sur feuille avec chemin complet, blocage + demande de déblocage sur ligne
épuisée, validateur par montant sans montant codé en dur, consolidation par secteur avec
prévisions.

---

## 8. Corrections appliquées (P1)

Fichiers modifiés — syntaxe JSX validée (esbuild) :

- **`src/pages/Budgets.jsx`**
  - Filtre **secteur** au-dessus de la liste (`sectorFilter`, `sectorsPresent`,
    `visibleBudgets`) — visible dès qu'au moins 2 secteurs existent ; message dédié si le
    secteur choisi est vide.
  - Actions d'arbre : `opacity-0 group-hover` → **`opacity-60 group-hover:opacity-100
    focus-within:opacity-100`** (découvrables et tapables au tactile).
- **`src/pages/Expenses.jsx`** — 3 tables (rollup, dépenses, déblocages) enveloppées dans
  `overflow-x-auto` + `min-w-[…]` → **scroll horizontal** au lieu de clipping.
- **`src/pages/HR.jsx`**, **`src/pages/Assets.jsx`** — table des journaux enveloppée dans
  `overflow-x-auto`.

## 9. Suite proposée (non faite)

- **P2 — Toast partagé** : composant global succès/erreur branché sur les retours
  `upsert*`/`delete*`/`changeStatus` (aujourd'hui silencieux si le service échoue).
- **P2 — `ConfirmDialog`** partagé (basé sur `components/Modal`) en remplacement de tous
  les `window.confirm`.
- **P3** — recherche/filtre des dépenses ; état de chargement + filtre département en RH.
