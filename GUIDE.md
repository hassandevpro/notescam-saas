# Guide d'utilisation — NotesCam

**Version** : 2026 · **Public** : Administrateurs d'établissement et enseignants

---

## Table des matières

1. [Présentation](#1-présentation)
2. [Inscription et connexion](#2-inscription-et-connexion)
3. [Assistant de configuration (Onboarding)](#3-assistant-de-configuration-onboarding)
4. [Tableau de bord](#4-tableau-de-bord)
5. [Classes](#5-classes)
6. [Matières](#6-matières)
7. [Élèves](#7-élèves)
8. [Saisie des notes](#8-saisie-des-notes)
9. [Bulletins](#9-bulletins)
10. [Absences](#10-absences)
11. [Enseignants](#11-enseignants)
12. [Frais scolaires](#12-frais-scolaires)
13. [Emploi du temps](#13-emploi-du-temps)
14. [Rapports](#14-rapports)
15. [Conseil de classe](#15-conseil-de-classe)
16. [Année académique et promotion](#16-année-académique-et-promotion)
17. [Paramètres de l'établissement](#17-paramètres-de-létablissement)
18. [Rôles et accès](#18-rôles-et-accès)
19. [Plans et fonctionnalités](#19-plans-et-fonctionnalités)
20. [Mode hors ligne](#20-mode-hors-ligne)
21. [Questions fréquentes](#21-questions-fréquentes)

---

## 1. Présentation

**NotesCam** est une plateforme de gestion scolaire conçue pour les établissements camerounais (primaire, secondaire, maternelle). Elle permet de :

- gérer les classes, matières et élèves ;
- saisir et consulter les notes par séquence ou trimestre ;
- générer des bulletins scolaires officiels ;
- suivre les absences quotidiennes ;
- gérer les frais de scolarité ;
- suivre les activités des enseignants ;
- fonctionner même sans connexion internet (mode hors ligne).

**Systèmes pédagogiques supportés :**

| Système | Périodes | Notes |
|---------|----------|-------|
| Francophone | 6 séquences | /20 |
| Anglophone | 3 termes | /100 |
| Bilingue | Les deux | Les deux |

---

## 2. Inscription et connexion

### 2.1 Créer un établissement (admin)

1. Accédez à `notescam.app` et cliquez sur **Créer un établissement**.
2. Remplissez les informations de l'établissement :
   - Nom de l'établissement
   - Type (Public / Privé laïc / Privé confessionnel)
   - Région
   - Système d'enseignement (Francophone / Anglophone / Bilingue)
   - Nom du Directeur / Proviseur
3. Créez votre compte administrateur (nom complet, email, mot de passe de 8 caractères minimum).
4. Cliquez sur **Créer mon compte gratuitement**.
5. Vérifiez votre boîte mail et cliquez sur le lien de confirmation pour activer votre compte.

> Le plan **Starter** est gratuit et sans engagement. Aucune carte bancaire requise.

### 2.2 Se connecter

1. Allez sur `notescam.app/login`.
2. Saisissez votre email et mot de passe.
3. Cliquez sur **Se connecter**.

> Si vous avez oublié votre mot de passe, cliquez sur **Oublié ?** pour recevoir un lien de réinitialisation par email.

### 2.3 Inscription enseignant

Les enseignants ne créent pas d'établissement. Ils rejoignent un établissement existant :

1. L'administrateur leur communique le **code établissement** (8 caractères, visible dans Paramètres → Code école).
2. L'enseignant accède à `notescam.app/teacher-signup`.
3. Il saisit son nom, email, mot de passe et le code de l'établissement.
4. Après validation, il se connecte et voit uniquement les classes et matières qui lui sont assignées.

---

## 3. Assistant de configuration (Onboarding)

Lors de la première connexion, un assistant en 3 étapes guide la configuration de base.

**Étape 1 — Créer une première classe**
- Choisissez le cycle (Secondaire / Primaire / Maternelle).
- Choisissez le système (Francophone / Anglophone).
- Sélectionnez le niveau (ex. : 6ème, Form 1, CP…).
- Ajoutez une section/lettre (ex. : A, B) si nécessaire.

**Étape 2 — Ajouter des matières**
- Une liste de matières recommandées s'affiche selon le cycle et le système.
- Cochez les matières à activer. Vous pouvez en ajouter de personnalisées.

**Étape 3 — Code établissement**
- Un code unique est généré pour votre établissement.
- Partagez-le à vos enseignants (bouton WhatsApp intégré).

> Vous pouvez ignorer l'assistant et tout configurer manuellement depuis les menus.

---

## 4. Tableau de bord

Le tableau de bord est la page d'accueil après connexion.

### Vue administrateur
- **Statistiques globales** : nombre de classes, d'élèves, d'enseignants.
- **Élèves en difficulté** : liste des élèves avec une moyenne inférieure à 10/20 (toutes classes confondues).
- **Activité récente des enseignants** : dernières saisies de notes par classe et séquence.
- **Notifications** : alertes de l'équipe enseignante.

### Vue enseignant
- **Mes classes** : liste des classes auxquelles l'enseignant est affecté.
- **Progression de saisie** : taux de remplissage des notes par classe et séquence.
- **Accès rapide** : boutons directs vers la saisie de notes.

---

## 5. Classes

Menu → **Classes**

### 5.1 Créer une classe

1. Cliquez sur **+ Nouvelle classe**.
2. Remplissez le formulaire :
   - **Cycle** : Secondaire, Primaire ou Maternelle
   - **Niveau** : ex. 6ème, CM1, Nursery 1
   - **Système** : FR ou EN (pour le bilingue)
   - **Section** : lettre ou couleur (ex. A, Rouge)
   - **Effectif maximum** (optionnel)
   - **Enseignant titulaire** (optionnel)
3. Cliquez sur **Enregistrer**.

> Le **nom de la classe** est généré automatiquement (ex. : « 6ème A »). Vous pouvez le modifier manuellement.

### 5.2 Configurer les matières d'une classe

Après création, cliquez sur la classe dans la liste pour ouvrir sa fiche détail. Vous pouvez y :
- ajouter, modifier ou supprimer des matières ;
- définir le coefficient et le barème de chaque matière ;
- assigner un enseignant par matière.

### 5.3 Fiche classe

La fiche classe affiche :
- le récapitulatif (nombre d'élèves, matières, enseignants, taux de complétion des notes) ;
- la liste des matières avec coefficients ;
- un accès direct à la saisie des notes pour cette classe.

---

## 6. Matières

Menu → **Matières**

La page Matières liste toutes les matières de toutes les classes de l'année en cours.

### Ajouter une matière

1. Sélectionnez la classe dans le menu déroulant.
2. Cliquez sur **+ Ajouter une matière**.
3. Renseignez :
   - **Nom** de la matière
   - **Coefficient** (ex. 4 pour Maths, 2 pour EPS)
   - **Barème** : 20 (francophone) ou 100 (anglophone)
   - **Enseignant** assigné (optionnel)
4. Cliquez sur **Ajouter**.

### Modifier ou supprimer

Cliquez sur l'icône crayon ou corbeille à côté de la matière.

> La suppression d'une matière supprime aussi toutes les notes associées. Cette action est irréversible.

---

## 7. Élèves

Menu → **Élèves**

### 7.1 Ajouter un élève

1. Cliquez sur **+ Nouvel élève**.
2. Renseignez :
   - Nom complet (obligatoire)
   - Classe (obligatoire)
   - Date de naissance, genre (optionnel)
   - Matricule, lieu de naissance (optionnel)
   - Contacts parentaux : nom du père/mère, téléphone, profession (optionnel)
3. Cliquez sur **Enregistrer**.

### 7.2 Importer des élèves (CSV)

Pour importer plusieurs élèves en une fois :

1. Cliquez sur **Importer CSV**.
2. Téléchargez le modèle si nécessaire.
3. Remplissez les colonnes requises : `nom`, `classe` (obligatoires).
4. Importez le fichier.

**Format CSV attendu :**
```
nom,classe,date_naissance,genre,matricule,parent_phone
MBARGA Jean,6ème A,2010-03-15,Masculin,CM123,699001122
```

### 7.3 Fiche élève

La fiche d'un élève affiche :
- ses informations personnelles et familiales ;
- ses notes par matière et par séquence ;
- ses bulletins générés ;
- son historique de frais scolaires ;
- un lien de portail parent (partageable par email ou WhatsApp).

### 7.4 Portail parent

Chaque élève dispose d'un lien unique que vous pouvez partager aux parents. Ce lien leur donne accès en lecture seule aux notes et bulletins de leur enfant, sans compte NotesCam.

---

## 8. Saisie des notes

Menu → **Notes**

### 8.1 Sélectionner le contexte

En haut de la page, sélectionnez :
- **Classe** : la classe à traiter
- **Matière** : la matière à renseigner
- **Séquence / Terme** : la période d'évaluation

### 8.2 Saisir les notes

Le tableau liste tous les élèves de la classe. Pour chaque élève :
- Cliquez sur la cellule de note et saisissez la valeur.
- Appuyez sur **Entrée** ou **Tab** pour passer à l'élève suivant.
- Saisissez `ABS` pour marquer un élève absent lors de la composition.

Les notes sont sauvegardées automatiquement à chaque saisie.

### 8.3 Données spéciales (bulletin)

En bas du tableau, vous pouvez renseigner pour chaque élève :
- **Absences justifiées / non justifiées** (en jours)
- **Conduite** (note sur 10)
- **Mentions** : Encouragement, Félicitation
- **Avertissements** et blâmes (travail / conduite)
- **Décision du conseil** (Passage, Redoublement…)

> Ces données apparaissent directement sur le bulletin imprimé.

---

## 9. Bulletins

Menu → **Bulletins**

### 9.1 Générer un bulletin

1. Sélectionnez la **classe** et la **séquence**.
2. Choisissez un élève dans la liste ou cliquez sur **Tous les élèves**.
3. Cliquez sur **Aperçu** pour visualiser le bulletin.
4. Cliquez sur **Imprimer** (PDF ou impression directe).

### 9.2 Contenu du bulletin

Le bulletin officiel contient :
- l'en-tête de l'établissement (logo, nom, région) ;
- les informations de l'élève ;
- le tableau des notes par matière (note, coefficient, note pondérée, rang dans la classe, appréciation de l'enseignant) ;
- la moyenne générale et le rang de l'élève dans la classe ;
- les absences, la conduite, les mentions ;
- la décision du conseil de classe ;
- la signature du Directeur.

### 9.3 Bulletins en masse

Pour imprimer tous les bulletins d'une classe en une fois :
1. Sélectionnez la classe et la séquence.
2. Cliquez sur **Imprimer tous les bulletins**.
3. Une page par élève est générée dans un PDF regroupé.

---

## 10. Absences

Menu → **Absences** *(Plan École et supérieur)*

Le module Absences permet le suivi journalier des présences, distinct des absences aux compositions.

### 10.1 Saisie des absences

Onglet **Saisie**

1. Sélectionnez la **classe**, la **date**, la **session** (Matin / Après-midi / Journée entière) et optionnellement la **matière**.
2. La liste des élèves de la classe s'affiche.
3. Pour chaque élève, cliquez sur le bouton correspondant à son statut :
   - **A** = Absent
   - **R** = Retard
   - **E** = Excusé
4. Cliquez sur **Enregistrer la saisie**.

> Par défaut, tous les élèves sont considérés présents. Vous ne cochez que les absents/retardataires.

### 10.2 Statistiques des absences

Onglet **Statistiques**

1. Sélectionnez la classe et une plage de dates.
2. Le tableau récapitule pour chaque élève :
   - nombre d'absences, de retards, d'absences excusées
   - total cumulé

> Les élèves avec 10 absences ou plus sont signalés par une icône d'alerte ⚠️.

---

## 11. Enseignants

Menu → **Enseignants** *(Plan École et supérieur)*

### 11.1 Ajouter un enseignant manuellement

1. Cliquez sur **+ Ajouter un enseignant**.
2. Renseignez le nom complet, la spécialité et le contact.
3. Enregistrez.

> Pour qu'un enseignant accède à l'application, il doit s'inscrire via `/teacher-signup` avec le code de l'établissement. Une fois inscrit, son compte est automatiquement lié à sa fiche.

### 11.2 Assigner un enseignant

- **Titulaire d'une classe** : dans la fiche de la classe → champ Enseignant.
- **Responsable d'une matière** : dans la fiche matière → champ Enseignant.

### 11.3 Suivi de l'activité (Monitor)

Menu → **Moniteur enseignants**

Cette vue donne à l'administrateur un aperçu en temps réel :
- quels enseignants ont saisi des notes ;
- pour quelles classes et séquences ;
- la date de dernière saisie.

---

## 12. Frais scolaires

Menu → **Frais scolaires**

### 12.1 Définir les frais d'un élève

1. Allez sur la fiche d'un élève ou directement dans le menu Frais.
2. Cliquez sur **Modifier les frais**.
3. Renseignez :
   - **Frais annuels** : montant total dû pour l'année
   - **Frais payés** : montant déjà réglé
   - **Date du dernier paiement**
   - **Notes** (ex. accord de paiement en plusieurs fois)
4. Enregistrez.

### 12.2 Tableau de bord des frais

La page Frais affiche :
- le total collecté et le total dû pour l'établissement ;
- la liste des élèves avec leur statut de paiement (À jour / Partiel / Non payé) ;
- les filtres par classe et par statut.

### 12.3 Imprimer un reçu de paiement

Après avoir enregistré un paiement, cliquez sur **Imprimer le reçu** pour générer un reçu officiel au nom de l'élève.

---

## 13. Emploi du temps

Menu → **Emploi du temps** *(Plan Pro et supérieur)*

### 13.1 Créer un emploi du temps

1. Sélectionnez la classe.
2. Cliquez sur un créneau horaire dans la grille (lundi→vendredi, matin→soir).
3. Sélectionnez la matière et l'enseignant pour ce créneau.
4. Enregistrez.

### 13.2 Consulter l'emploi du temps

Les enseignants peuvent consulter leur propre emploi du temps depuis leur interface.

---

## 14. Rapports

Menu → **Rapports**

Les rapports permettent d'analyser les performances de l'établissement :

- **Moyenne par classe** : classement des classes par moyenne générale.
- **Moyenne par matière** : identifier les matières avec les meilleurs/pires résultats.
- **Taux de réussite** : pourcentage d'élèves au-dessus de 10/20.
- **Comparaison séquences** : évolution des résultats d'une séquence à l'autre.

Tous les rapports sont exportables en PDF.

---

## 15. Conseil de classe

Menu → **Conseil de classe**

Le conseil de classe permet de finaliser les décisions de fin de séquence :

1. Sélectionnez la classe et la séquence.
2. La liste des élèves s'affiche avec leur moyenne, rang et données comportementales.
3. Saisissez ou modifiez la **décision** pour chaque élève (Passage, Redoublement, Renvoi…).
4. Ajoutez des **appréciations** générales.
5. Les décisions sont répercutées sur les bulletins.

---

## 16. Année académique et promotion

Menu → **Année académique**

### 16.1 Démarrer une nouvelle année

En fin d'année scolaire :

1. Accédez à **Année académique**.
2. Cliquez sur **Promouvoir vers l'année suivante**.
3. Confirmez : l'application va automatiquement :
   - créer de nouvelles classes (ex. 6ème → 5ème) ;
   - copier les matières et coefficients dans les nouvelles classes ;
   - transférer les élèves dans leur nouvelle classe ;
   - archiver les classes des élèves diplômés.
4. L'année précédente reste accessible en lecture seule depuis le sélecteur d'année.

### 16.2 Consulter une année archivée

En haut à droite de l'application, un menu déroulant permet de basculer entre les années académiques pour consulter les données passées (notes, bulletins, élèves).

---

## 17. Paramètres de l'établissement

Menu → **Paramètres**

### 17.1 Informations générales

- Nom de l'établissement, type, région, directeur
- Logo de l'établissement (uploadé pour apparaître sur les bulletins)
- Langue de l'interface (Français / English)

### 17.2 Code établissement

Le code est affiché dans Paramètres → **Code école**. Partagez-le aux enseignants pour qu'ils rejoignent l'établissement.

### 17.3 Synchronisation hors ligne

Dans Paramètres → **Synchronisation** :
- Voir le nombre d'opérations en attente de synchronisation.
- Forcer une synchronisation immédiate.
- Vider la file de synchronisation en cas de blocage.

---

## 18. Rôles et accès

NotesCam distingue deux rôles principaux dans un établissement.

### Administrateur

L'administrateur a accès à toutes les fonctionnalités :
- gestion complète des classes, matières, élèves ;
- saisie des notes pour toutes les classes ;
- génération de bulletins ;
- gestion des enseignants et frais ;
- paramètres de l'établissement ;
- rapports globaux.

### Enseignant

L'enseignant voit uniquement :
- les classes dans lesquelles il est affecté (titulaire ou matière assignée) ;
- la saisie des notes pour ses matières ;
- ses élèves ;
- les bulletins de ses classes ;
- les absences de ses classes ;
- son emploi du temps.

> Un enseignant ne peut pas voir les classes d'un autre enseignant, ni modifier les paramètres de l'établissement.

---

## 19. Plans et fonctionnalités

| Fonctionnalité | Starter (gratuit) | École | Pro | Réseau |
|---|:---:|:---:|:---:|:---:|
| Classes, matières, élèves | ✓ | ✓ | ✓ | ✓ |
| Saisie des notes | ✓ | ✓ | ✓ | ✓ |
| Bulletins | ✓ | ✓ | ✓ | ✓ |
| Frais scolaires | ✓ | ✓ | ✓ | ✓ |
| Gestion des enseignants | — | ✓ | ✓ | ✓ |
| Suivi des absences | — | ✓ | ✓ | ✓ |
| Rapports avancés | — | ✓ | ✓ | ✓ |
| Emploi du temps | — | — | ✓ | ✓ |
| Conseil de classe | — | — | ✓ | ✓ |
| Multi-établissements | — | — | — | ✓ |

Pour passer à un plan supérieur, contactez NotesCam :
- **WhatsApp** : +237 670 894 721
- **Email** : contact@notescam.app

---

## 20. Mode hors ligne

NotesCam fonctionne **sans connexion internet**. Voici comment :

### Comment ça marche

- Toutes vos données sont stockées localement dans votre navigateur (IndexedDB).
- Quand vous n'avez pas de connexion, vos actions (saisie de notes, ajout d'élèves…) sont enregistrées localement.
- Dès que la connexion revient, l'application synchronise automatiquement avec le serveur.

### Indicateur de synchronisation

En haut de l'interface, une icône indique l'état de synchronisation :
- **Vert** : tout est synchronisé ✓
- **Orange avec un chiffre** : X opérations en attente
- **Rouge** : erreur de synchronisation — cliquez pour voir les détails

### Bonnes pratiques

- Ne vous déconnectez pas du navigateur si vous avez des données non synchronisées.
- En cas d'erreur persistante, allez dans Paramètres → Synchronisation → **Vider la file**.

---

## 21. Questions fréquentes

**Je ne reçois pas l'email de confirmation à l'inscription.**
> Vérifiez votre dossier spam/indésirables. Sur la page de connexion, cliquez sur « Email non confirmé » puis « Renvoyer l'email de confirmation ».

**Un enseignant ne voit aucune classe après son inscription.**
> L'enseignant doit être assigné à au moins une classe (comme titulaire) ou une matière. Faites-le depuis la fiche classe → champ Enseignant, ou depuis la fiche matière.

**Comment changer l'email d'un compte ?**
> Contactez le support NotesCam. Pour l'instant, le changement d'email n'est pas possible en libre-service.

**Les notes d'un élève n'apparaissent pas sur son bulletin.**
> Vérifiez que la matière est bien configurée (coefficient ≥ 1) et que la note a bien été enregistrée pour la bonne séquence.

**Comment supprimer un élève ?**
> Allez sur la fiche de l'élève → Menu (···) → Supprimer. Attention : cela supprime également toutes ses notes et bulletins. Cette action est irréversible.

**La moyenne calculée ne correspond pas à ce que j'attends.**
> NotesCam calcule la moyenne pondérée : (somme des notes × coefficients) ÷ (somme des coefficients). Vérifiez que les coefficients des matières sont corrects.

**Comment imprimer les bulletins sans logo ?**
> Si aucun logo n'est uploadé dans Paramètres, le bulletin s'imprime sans logo. Vous pouvez en ajouter un dans Paramètres → Logo de l'établissement.

**L'application est lente à charger.**
> La première fois, le navigateur télécharge l'application complète. Les chargements suivants sont quasi-instantanés grâce au cache PWA. Assurez-vous d'utiliser un navigateur récent (Chrome, Firefox, Edge).

**Puis-je utiliser NotesCam sur téléphone ?**
> Oui. NotesCam est une application web responsive qui fonctionne sur mobile. Sur Android, vous pouvez aussi l'installer comme application (bouton « Ajouter à l'écran d'accueil » dans Chrome).

---

*Pour toute assistance, contactez NotesCam :*
*WhatsApp : +237 670 894 721 · Email : contact@notescam.app*
*Promoteur & actionnaire principal : Hassan Ousman*
