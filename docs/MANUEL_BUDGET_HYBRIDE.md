# Manuel d'emploi — Système budgétaire hybride

Ce manuel décrit le parcours **complet**, de la création des rôles jusqu'au suivi de l'exécution, pour un établissement fonctionnant en **mode hybride**.

> **Ce qu'est le mode hybride, en une phrase.**
> L'argent est géré **sur place** (le serveur LAN de l'école est la seule autorité qui écrit), et la **gouvernance se fait à distance** (la direction générale décide depuis le Cloud, où qu'elle soit). Le Cloud ne modifie jamais directement les données financières : il **envoie des demandes** que le serveur de l'école applique.

Cette règle explique presque tout le comportement du logiciel. Gardez-la en tête.

---

## Sommaire

| Phase | Étapes | Qui |
|---|---|---|
| **A. Préparation technique** | 1 → 2 | Informaticien / éditeur |
| **B. Structure de l'établissement** | 3 → 6 | Fondatrice / Coordonnateur |
| **C. Construction du budget** | 7 → 11 | RAF / Coordonnateur |
| **D. Exploitation quotidienne** | 12 → 15 | Secteurs, RAF, Caissier |
| **E. Suivi et incidents** | 16 → 18 | Direction |

---

# Phase A — Préparation technique

## Étape 1 — Appliquer les migrations et redéployer

À faire **une seule fois par établissement Cloud**, avant toute utilisation. Dans Supabase → SQL Editor, exécuter dans cet ordre :

1. `supabase_budget_lines_v3.sql` — le modèle de budget v3 (périodes dédiées + allocations)
2. `supabase_budget_enforcement_v3.sql` — les contrôles serveur non contournables
3. `supabase_budget_ops_v3.sql` — réallocation et révision
4. `supabase_budget_finance_grants_v4.sql` — droits financiers de la Fondatrice et du Coordonnateur
5. `supabase_governance.sql` et `supabase_governance_catalog.sql` — les rôles de gouvernance
6. `supabase_validation_rules.sql` — le barème de validation
7. `supabase_notifications.sql` — les notifications internes
8. `supabase_phase_f_budget_rls.sql` — l'isolation par rôle et par secteur

Puis **redéployer les fonctions edge** : `sync-pull`, `sync-push`, `sync-verify`, `sync-repair`. Sans ce redéploiement, les nouvelles tables budgétaires ne se synchronisent pas entre le LAN et le Cloud.

> ⚠️ Sauter cette étape ne produit pas un message d'erreur clair : le budget semble fonctionner puis « perd » des données à la synchronisation. Vérifiez-la en premier devant tout comportement étrange.

## Étape 2 — Activer le mode hybride et appairer le serveur

1. Côté **Cloud**, aller dans **Paramètres → Préparer le mode hybride**.
2. Cliquer pour générer un **code d'appairage** (valable 30 minutes par défaut).
   Cette action pose la politique de déploiement de l'école (`finance` exécutée en LAN, gouvernance au Cloud) et accorde l'**accès distant** aux comptes de décision.
3. Côté **serveur LAN de l'école**, sur l'écran d'accueil, cliquer **« Connecter à une école Cloud »** et saisir le code.
4. La synchronisation initiale se lance. Attendre qu'elle se termine.

**Comment savoir que le mode hybride est actif :** un bandeau orange **🛰️ Gouvernance à distance** apparaît en haut de la page Budgets, côté Cloud. Ce bandeau est votre repère permanent — il change le sens de tous les boutons d'enregistrement (voir étape 17).

---

# Phase B — Structure de l'établissement

## Étape 3 — Déclarer les unités (secteurs)

**Paramètres → Unités de l'établissement.**

Créez une unité par secteur réel : Maternelle, Primaire, Collège, Lycée… Ce sont ces unités qui serviront à répartir les budgets par secteur et à borner ce que chaque directeur voit.

> Les unités sont **structurelles**, pas des classes. Ne créez pas une unité par classe.

## Étape 4 — Créer les comptes du personnel

**Personnel** → choisir le département (administration, comptabilité, surveillance, santé, support, enseignants) → **Ajouter un agent**.

Pour chaque personne qui utilisera le logiciel, renseignez au minimum : nom, **département**, et créez-lui un **accès** (le compte de connexion). Sans compte, une personne ne peut recevoir ni notification ni droit.

> Le **département** n'est pas décoratif : il sert à router automatiquement les signalements et il apparaît dans les dossiers RH.

## Étape 5 — Attribuer les rôles de gouvernance

**Personnel → onglet 🏛️ Gouvernance → Attributions.**

Ces rôles s'**ajoutent** au rôle de base du compte (ils ne le remplacent pas). Dix rôles existent :

| Rôle | Portée | Autorité |
|---|---|---|
| **Fondatrice** | Complexe | La plus haute — dernier recours sur tout |
| **Coordonnateur Général** | Complexe | Valide selon les seuils, arbitre entre secteurs |
| **RAF** (Responsable Administratif et Financier) | Complexe | Prépare le budget, valide les petits montants |
| **Contrôleur** | Complexe | **Consultation et audit uniquement** — n'approuve rien |
| **Caissier** | Complexe | **Décaisse uniquement** — ne crée ni ne valide rien |
| **Principal** | Collège | Demande, ne valide pas |
| **Vice-principal** | Collège | Comme le Principal |
| **Directrice du primaire** | Primaire | Demande, ne valide pas |
| **Directrice adjointe du primaire** | Primaire | Comme ci-dessus |
| **Responsable de la maternelle** | Maternelle | Demande, ne valide pas |

Pour un rôle **de secteur**, précisez le secteur : la personne ne verra alors que les données de son secteur.

> **Règle de conception à connaître :** les chefs de secteur *demandent*, ils ne valident pas. La validation est réservée au RAF, au Coordonnateur et à la Fondatrice, selon le montant (étape 6). Le Caissier, lui, ne fait que payer ce qui a déjà été approuvé.

## Étape 6 — Régler le barème de validation

Le barème répond à une seule question : **quel montant exige quelle signature ?**

Barème par défaut, si vous ne configurez rien :

| Montant de la dépense | Validateur requis |
|---|---|
| moins de 25 000 | **RAF** |
| de 25 000 à 250 000 | **Coordonnateur Général** |
| au-delà de 250 000 | **Fondatrice** |

Ces seuils sont **modifiables par établissement**. Aucun montant n'est figé dans le logiciel.

> **Point important :** le validateur est celui dont le palier correspond **exactement** au montant. Un Coordonnateur ne signe pas à la place du RAF sur une petite dépense — chacun son palier. Seule la Fondatrice fait office de dernier recours.

---

# Phase C — Construction du budget

Le modèle est volontairement simple, à trois niveaux :

```
BUDGET ANNUEL  (l'enveloppe de l'exercice)
   └── RUBRIQUE          (ex. « Fonctionnement »)
         └── LIGNE       (ex. « Carburant » — 6 000 000)   ← porte le montant
               ├── réparti par PÉRIODE  (% par trimestre)
               └── réparti par SECTEUR  (% par unité, si la ligne les concerne)
```

**C'est la LIGNE qui porte l'argent.** La rubrique n'est qu'un regroupement, et les totaux par période ou par secteur sont **calculés** à partir des lignes — jamais saisis deux fois.

## Étape 7 — Configurer les périodes budgétaires

**Budgets → bouton Périodes.**

Créez les périodes de l'exercice (par exemple trois trimestres) : un nom libre, une date de début, une date de fin.

> ⚠️ **Ces périodes sont propres au budget.** Elles ne sont pas les séquences de notes. Elles ne doivent **pas se chevaucher** : une dépense doit tomber dans une période et une seule (voir étape 12).

## Étape 8 — Créer le budget annuel

**Budgets → Créer le budget annuel.** Saisissez l'enveloppe de l'exercice.

Le **statut du budget annuel n'est jamais saisi** : il se déduit de ses lignes.

| Vous voyez | Cela veut dire |
|---|---|
| Brouillon | aucune ligne n'est encore activée |
| Partiellement actif | certaines lignes sont activées, d'autres non |
| Actif | toutes les lignes prévues sont activées |
| Clôturé | l'exercice a été explicitement fermé |

## Étape 9 — Créer les rubriques et les lignes

Créez d'abord vos **rubriques** (Fonctionnement, Personnel, Investissement…), puis, dans chacune, les **lignes**.

Pour chaque ligne, indiquez :
- son **libellé** (ex. Carburant) ;
- son **montant annuel** ;
- sa **portée** : soit **Complexe** (la dépense concerne tout l'établissement), soit **Secteurs** (elle ne concerne que certaines unités).

## Étape 10 — Répartir chaque ligne

Ouvrez une ligne → **Répartir**.

**Répartition par période :** indiquez le pourcentage du montant annuel consommable sur chaque période. Le montant correspondant s'affiche à côté. **La somme doit faire 100 %.**

**Répartition par secteur** (uniquement si la portée est « Secteurs ») : cochez les secteurs réellement concernés et donnez leur pourcentage. **La somme doit faire 100 %.**

> **Le logiciel ne répartit jamais le reste à votre place.** Il affiche « X % restent à répartir » et vous laisse décider. C'est volontaire : une répartition automatique serait une décision budgétaire prise par la machine.

## Étape 11 — Activer les lignes

Une ligne en **brouillon n'engage rien** : aucune dépense ne peut s'y imputer. Il faut l'**activer**.

L'activation est refusée tant que :
- le montant annuel n'est pas défini ;
- la somme des pourcentages de période ≠ 100 % ;
- la somme des pourcentages de secteur ≠ 100 % (pour une ligne sectorielle) ;
- l'activation ferait dépasser l'enveloppe annuelle du budget.

> **Bonne nouvelle :** vous n'avez pas besoin que *toutes* les rubriques soient prêtes. Une ligne correctement configurée s'active seule et devient utilisable immédiatement.

> ⚠️ **Une ligne activée se fige.** Son montant, sa portée et ses répartitions ne se modifient plus directement. Pour les changer, il faut passer par une **réallocation** ou une **révision** (étape 15) — qui laissent une trace. C'est la garantie qu'un budget voté ne se réécrit pas discrètement.

---

# Phase D — Exploitation quotidienne

## Étape 12 — Saisir une dépense

**Dépenses** → sélectionner la **ligne** concernée → **Nouvelle dépense**.

Renseignez : catégorie, fournisseur, montant, demandeur, **date de la dépense**, justificatif.

Deux points méritent votre attention :

**La période n'est pas choisie, elle est déduite de la date.** Si la dépense date du 12 janvier, elle tombe dans la période qui contient cette date. Vous ne pouvez pas l'imputer ailleurs, et le serveur recalcule cette période même si un outil externe tentait d'en imposer une autre. Si aucune période ne couvre la date — ou si deux se chevauchent — la dépense est refusée : corrigez vos périodes (étape 7).

**Le secteur doit être cohérent avec la ligne.** Vous pouvez imputer à un secteur précis **parmi ceux autorisés par la ligne**, ou à **Complexe / Global** si la dépense ne relève d'aucun secteur en particulier. Une dépense « Maternelle » sur une ligne réservée au Primaire et au Secondaire est refusée.

## Étape 13 — Le circuit de validation

Une dépense passe par ces états :

```
Brouillon → Soumise → Approuvée → Payée
                  ↘ Refusée      ↘ Annulée (tracée, jamais supprimée)
```

- **Brouillon** : n'engage rien, modifiable, supprimable.
- **Soumise** : engage le budget et part vers le validateur du palier (étape 6).
- **Approuvée** : bon à payer.
- **Payée** : décaissée par le Caissier.
- **Annulée** : conservée avec son motif — jamais effacée.

Dès qu'une dépense est **soumise, approuvée ou payée**, elle consomme le budget. Un brouillon, non.

**Le blocage en cas de dépassement est dur et vérifié côté serveur**, à quatre niveaux successifs : la ligne, la période, le secteur, puis l'enveloppe annuelle. Le premier niveau qui manque de place bloque la dépense et vous dit lequel.

## Étape 14 — Une ligne est épuisée

Quand une dépense dépasse le disponible, elle est **bloquée**. Vous pouvez alors demander un **déblocage** depuis le même écran.

La demande part au décideur habilité **pour ce montant** (même barème qu'à l'étape 6), qui a trois réponses possibles :

| Décision | Effet |
|---|---|
| **Refuser** | rien ne change |
| **Autoriser exceptionnellement** | ce dépassement précis passe, la ligne n'est pas modifiée |
| **Augmenter la ligne** | le montant de la ligne est relevé définitivement |

Toutes les demandes et décisions sont historisées avec leur auteur, leur date et leur motif.

## Étape 15 — Réallouer ou réviser

Deux opérations distinctes, toutes deux tracées :

**Réallocation** — déplacer du montant **d'une ligne vers une autre**. Le total annuel ne change pas. On ne peut pas retirer d'une ligne ce qu'elle a déjà engagé.

**Révision** — changer **l'enveloppe annuelle** elle-même. Elle ne peut pas descendre en dessous de ce qui est déjà engagé, ni en dessous de la somme des lignes activées.

Ces deux opérations demandent une décision, exactement comme une dépense.

---

# Phase E — Suivi et incidents

## Étape 16 — Suivre l'exécution

**Budget global** : vue d'ensemble, du budget annuel jusqu'à la ligne, avec ventilation par période et par secteur. Un chef de secteur n'y voit que son secteur, et un bandeau le lui rappelle.

**Tableau de bord du groupe** (`/app/groupe`) : vue consolidée de la direction générale — finances, RH, discipline, budgets, dépenses, alertes.

Pour chaque ligne, vous lisez : **alloué** → **engagé** → **payé** → **disponible**.

## Étape 17 — Ce qui change vraiment en mode hybride

C'est la section la plus importante de ce manuel, et la source de la quasi-totalité des incompréhensions.

**Quand le bandeau orange 🛰️ est affiché, les boutons d'enregistrement du Cloud n'enregistrent pas : ils envoient une demande.**

Concrètement, si vous répartissez une ligne depuis le Cloud :

1. vous saisissez vos pourcentages et vous validez ;
2. le message affiché est **« Demande envoyée · en attente d'application par le serveur de l'école »** — et non « Répartition enregistrée » ;
3. **les champs reviennent à 0 %**, parce que rien n'a encore été écrit ;
4. le serveur LAN de l'école applique la demande dès qu'il est joignable ;
5. **alors seulement** les pourcentages apparaissent.

> **Votre saisie n'est pas perdue.** Le bandeau orange liste les demandes en attente et leur état. Une demande qui reste « en attente » très longtemps signale que le serveur de l'école n'est pas joignable ou que sa synchronisation est bloquée — voir l'étape 18.

Le serveur LAN **revérifie tout** avant d'appliquer : votre droit, le périmètre de l'école, la version de la donnée, les plafonds. Il peut donc **refuser** une demande, et vous serez notifié du refus avec son motif.

**Pour éviter cette attente**, faites les opérations de structure (périodes, lignes, répartitions, activations) **directement sur le poste de l'école**. Réservez le Cloud à ce pour quoi il est fait : **décider à distance** (approuver, refuser, arbitrer).

## Étape 18 — Notifications

Le logiciel prévient automatiquement les bonnes personnes, **dans l'application** (cloche en haut à droite et page Notifications) :

| Événement | Qui est prévenu |
|---|---|
| Dépense soumise | le validateur du palier correspondant au montant |
| Dépense approuvée | le demandeur **et** le Caissier |
| Dépense refusée, payée ou annulée | le demandeur |
| Déblocage demandé | le décideur habilité au montant |
| Déblocage tranché | le demandeur |
| Réallocation / révision | le décideur, puis le demandeur |

> **À ce jour, seules les notifications internes existent.** L'e-mail, le SMS et WhatsApp sont prévus mais **aucun message n'est encore envoyé** vers l'extérieur. Ne comptez pas dessus pour alerter quelqu'un qui n'ouvre pas l'application.

---

# Dépannage

| Symptôme | Cause la plus fréquente | Que faire |
|---|---|---|
| **La répartition revient à 0 % après enregistrement** | Mode hybride : c'était une demande, pas un enregistrement | Vérifier le bandeau orange et l'état des demandes. Si elles restent en attente, le serveur LAN ne les applique pas → vérifier sa synchronisation |
| **Impossible d'activer une ligne** | Σ des pourcentages ≠ 100 %, ou dépassement de l'enveloppe annuelle | Le bouton indique la raison exacte ; corriger la répartition ou l'enveloppe |
| **Dépense refusée : « aucune période »** | La date de la dépense ne tombe dans aucune période budgétaire | Corriger la date, ou créer/étendre la période (étape 7) |
| **Dépense refusée : « chevauchement »** | Deux périodes couvrent la même date | Corriger les dates des périodes — elles ne doivent jamais se chevaucher |
| **« Ligne active : ses allocations ne se modifient pas »** | Comportement normal : une ligne activée est figée | Passer par une réallocation ou une révision (étape 15) |
| **Le Cloud affiche moins de données que le poste de l'école** | Synchronisation incomplète, ou migrations de l'étape 1 non appliquées | Vérifier l'étape 1, puis l'état de la synchronisation |
| **Un utilisateur ne voit pas le menu Budgets** | Aucun rôle de gouvernance attribué à son compte | Étape 5 |
| **Un directeur de secteur ne voit qu'une partie des données** | Comportement normal : son rôle est borné à son secteur | Rien à faire |

---

# Limites connues à ce jour

Pour éviter toute mauvaise surprise, voici ce que le module **ne fait pas encore** :

- **Pas de recettes.** Le budget ne couvre que les **dépenses**. Les recettes prévisionnelles (frais scolaires attendus) ne s'y saisissent pas, et il n'existe donc pas de solde prévisionnel recettes/dépenses.
- **Pas d'envoi externe.** Aucune notification ne part par e-mail, SMS ou WhatsApp.
- **Pas de rapport d'exécution imprimable** consolidé, ni de document de clôture d'exercice.
- **Contrôles d'action côté serveur incomplets.** Les règles « le Caissier ne crée pas » et « le RAF ne valide pas au-dessus de son palier » sont appliquées par l'interface. Le serveur, lui, contrôle l'accès au module et le périmètre de secteur, mais pas encore chaque action individuellement.
- **Pas de tableau de bord dédié par rôle** : chacun voit le tableau de bord général, filtré à son périmètre.

---

*Document de référence — à mettre à jour à chaque évolution du module Budgets.*
