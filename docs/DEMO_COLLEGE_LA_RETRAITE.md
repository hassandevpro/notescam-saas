# COLLÈGE LA RETRAITE — établissement de démonstration

Jeu de données **100 % fictif** conçu pour l'enregistrement des vidéos de formation
des utilisateurs. Aucune donnée réelle : les noms de personnes, d'élèves, de
fournisseurs et les montants sont inventés.

L'établissement existe dans les **deux éditions**, avec les mêmes comptes, les
mêmes identifiants et la même structure.

| | |
|---|---|
| **Établissement** | COLLÈGE LA RETRAITE — complexe scolaire privé confessionnel, Yaoundé III |
| **Identifiant école** | `8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8` (identique LAN et cloud) |
| **Année scolaire** | 2025-2026 |
| **Instantané** | 30 juin 2026 — T1/T2 clos, T3 actif, séquences 1-5 saisies, séquence 6 à ~70 % |
| **Mot de passe** | `Retraite2026!` — commun aux 16 comptes |
| **Devise** | XAF (FCFA) |

Toutes les dates du jeu sont **passées** : rien ne paraît incohérent à l'écran au
moment du tournage. Aucune période n'est verrouillée (`is_locked = false`) : une
saisie de notes reste possible en direct pendant une démonstration.

---

## Installation

### Édition LAN (SQLite) — recommandée pour filmer

Le script écrit dans `server/data-demo/`, **jamais** dans la base de production
`server/data/`. Il refuse d'écraser une base contenant un autre établissement.

```bash
node scripts/seed-college-la-retraite.mjs            # première installation
node scripts/seed-college-la-retraite.mjs --reset    # régénérer à neuf
node scripts/seed-college-la-retraite.mjs --data-dir <dossier>
```

Puis démarrer le serveur sur cette base :

```bash
# bash
NOTESCAM_DATA_DIR=server/data-demo npm run server
# PowerShell
$env:NOTESCAM_DATA_DIR="server/data-demo"; npm run server
```

### Édition cloud (Supabase)

Dans **SQL Editor → New query → Run**, dans cet ordre :

1. `supabase/seed_college_la_retraite.sql` — crée l'école, les comptes et les données ;
2. `supabase/seed_college_la_retraite_validate.sql` — 31 contrôles, doit finir sur `PASS` ;
3. `supabase/seed_college_la_retraite_cleanup.sql` — **uniquement** pour tout supprimer.

Les deux scripts sont bornés au `school_id` ci-dessus et au domaine de courriel
`@laretraite.demo` : aucune autre école ni aucun compte réel n'est touché.

---

## Les 16 comptes

Le rôle affiché dans l'application n'est pas `school_users.role` mais le **rôle de
gouvernance** le plus élevé du compte. Un « Principal » est techniquement un
compte `censeur` porteur du rôle de gouvernance `principal` : c'est ce rôle
additif qui détermine menus, permissions et pouvoirs de validation.

### Direction et administration — 13 rôles

| # | Rôle affiché | Courriel | Rôle de base | Rôle de gouvernance | Secteur |
|---|---|---|---|---|---|
| 1 | Administrateur | `admin@laretraite.demo` | `admin` | — | complexe |
| 2 | Fondatrice | `fondatrice@laretraite.demo` | `admin` | `fondatrice` | complexe |
| 3 | Coordonnateur Général | `coordonnateur@laretraite.demo` | `censeur` | `coordonnateur_general` | complexe |
| 4 | RAF | `raf@laretraite.demo` | `censeur` | `raf` | complexe |
| 5 | Contrôleur | `controleur@laretraite.demo` | `censeur` | `controleur` | complexe |
| 6 | Principal | `principal@laretraite.demo` | `censeur` | `principal` | collège |
| 7 | Vice-principal | `vice.principal@laretraite.demo` | `censeur` | `vice_principal` | collège |
| 8 | Directrice du Primaire | `dir.primaire@laretraite.demo` | `censeur` | `directrice_primaire` | primaire |
| 9 | Directrice adjointe du Primaire | `dir.adj.primaire@laretraite.demo` | `censeur` | `directrice_adjointe_primaire` | primaire |
| 10 | Responsable de la Maternelle | `resp.maternelle@laretraite.demo` | `censeur` | `responsable_maternelle` | maternelle |
| 11 | Caissière | `caissiere@laretraite.demo` | `censeur` | `caissier` | complexe |
| 12 | Censeur | `censeur@laretraite.demo` | `censeur` | — | — |
| 13 | Surveillant Général | `surveillant@laretraite.demo` | `surveillant` | — | — |

Noms à l'écran : ONANA Célestin, AWONO Marie-Thérèse, MBALLA Emmanuel,
FOTSO Landry, ONDOA Guy, NJOYA Blaise, ESSOMBA Rodrigue, ETOA Chantal,
NGO BELL Prisca, MANGA Odile, ABENA Carine, TABI Serge, BELLO Achille.

### Enseignants — 3 comptes, un par cycle

| Rôle affiché | Courriel | Nom | Classes dont il est titulaire |
|---|---|---|---|
| Enseignante — Maternelle | `ens.maternelle@laretraite.demo` | ABANDA Clarisse | PS, MS, GS |
| Enseignant — Primaire | `ens.primaire@laretraite.demo` | NKOULOU Bertrand | SIL, CP, CE1, CE2, CM1, CM2 |
| Enseignante — Secondaire | `ens.secondaire@laretraite.demo` | TCHUENTE Léonie | 6e, 5e, 4e, 3e |

> **Choix assumé.** Avec seulement 3 enseignants pour 13 classes, chacun est
> titulaire de toutes les classes de son cycle et professeur de toutes leurs
> matières. C'est volontairement dense : cela permet de filmer la vue enseignant
> d'un cycle entier avec un seul compte. Pour un rendu plus réaliste (un
> professeur par matière au collège), ajoutez des lignes dans `teachers` et
> répartissez `subjects.teacher_id`.

---

## Ce que contient l'établissement

| Domaine | Contenu |
|---|---|
| **Structure** | 3 unités pédagogiques (Maternelle, Primaire, Collège), 13 classes, 96 matières |
| **Élèves** | 232 — 36 en maternelle (PS/MS/GS), 108 au primaire (SIL→CM2), 88 au collège (6e→3e) |
| **Notes** | ~10 050 notes ; séquences 1 à 5 complètes, séquence 6 à ~70 % ; ~3 % de valeurs vides (élève absent à l'évaluation) |
| **Conseil de classe** | ~1 280 fiches : assiduité, conduite (TB/B/AB/P/M), tableau d'honneur, encouragements, félicitations, appréciations |
| **Périodes** | 3 trimestres + 6 séquences, dates d'examen, dates limites de saisie, dates de conseil |
| **Scolarité** | Grilles tarifaires par classe (120 000 / 150 000 / 200 000 FCFA + inscription), catalogue de 8 frais annexes, 232 dossiers de pension, 1 237 frais affectés aux élèves, 738 encaissements numérotés en série continue |
| **Budget** | Enveloppe annuelle 45 000 000 FCFA, 3 rubriques, 14 lignes, répartition 40/30/30 sur 3 périodes, répartition sectorielle 20/40/40, 21 dépenses |
| **Gouvernance** | Catalogue complet des 10 rôles, journal d'événements, journal d'audit, notifications en attente |
| **RH / paie** | 16 dossiers personnels, 16 contrats, catalogue de primes et retenues, 16 bulletins de paie de juin 2026, congés, présences, évaluations |
| **Vie scolaire** | 30 retards, 12 incidents, 8 sanctions, 10 avertissements, 5 retenues, 6 convocations de parents, 8 autorisations de sortie |
| **Patrimoine** | 12 immobilisations, pannes, réparations, dépenses associées |
| **Signalements** | 8 dossiers (dont ouverts, affectés, en cours, résolus) avec historique et commentaires |
| **Emploi du temps** | Semaine complète pour GS, CM2 et 6e (mercredi et vendredi après-midi libres) |

---

## Plan des vidéos de formation

**32 vidéos en 9 séries**, de la prise en main aux rôles de direction. Chaque
fiche donne le compte à utiliser, l'écran, et les données précises du jeu de
démonstration à montrer à l'image — tout est déjà en place, rien n'est à
préparer avant de lancer l'enregistrement.

Conventions : durée indicative ; les identifiants d'élèves et les montants cités
existent réellement dans la base. Régénérez avec `--reset` entre deux prises si
vous avez modifié des données à l'écran.

### Série 0 — Prise en main (3 vidéos)

| N° | Titre | Compte | Durée | À l'écran |
|---|---|---|---|---|
| 0.1 | Se connecter et comprendre son écran d'accueil | `admin@` | 3 min | `/login` puis `/app` — montrer que le tableau de bord change selon le rôle : rouvrir avec `surveillant@` et `caissiere@` pour comparer trois accueils différents |
| 0.2 | La barre latérale : trouver n'importe quel module | `admin@` | 4 min | Parcourir le menu ; expliquer que les entrées visibles dépendent du rôle, sans jamais « cacher pour cacher » |
| 0.3 | Mon profil, mon mot de passe, ma langue | `censeur@` | 3 min | `/app/profile` — changer le mot de passe, montrer FR/EN/ES |

### Série 1 — Structure de l'établissement (3 vidéos)

| N° | Titre | Compte | Durée | À l'écran |
|---|---|---|---|---|
| 1.1 | Le complexe scolaire : unités, classes, matières | `admin@` | 6 min | `/app/settings` (les 3 unités : Maternelle, Primaire, Collège) puis `/app/classes` — 13 classes, chacune rattachée à son unité et à son titulaire |
| 1.2 | Inscrire, affecter et suivre un élève | `admin@` | 7 min | `/app/students` → fiche `TABI Yannick` (ELV-2025-0215, 3e) ; montrer l'historique d'affectation et le statut `nouveau/redoublant/transfere` |
| 1.3 | Construire l'emploi du temps | `admin@` | 5 min | `/app/timetable` — semaines déjà remplies pour **GS**, **CM2** et **6e** ; montrer la vue Salle et la détection de conflit en déplaçant un cours |

### Série 2 — Notes, bulletins et conseil de classe (5 vidéos)

| N° | Titre | Compte | Durée | À l'écran |
|---|---|---|---|---|
| 2.1 | Saisir les notes d'une séquence | `ens.secondaire@` | 7 min | `/app/grades` → **3e**, **séquence 6** : il manque **69 notes sur 198**, la saisie se fait donc en direct, sans rien préparer |
| 2.2 | L'élève absent à une évaluation | `ens.secondaire@` | 3 min | Même écran — une note vide n'est pas un zéro ; montrer l'effet sur la moyenne |
| 2.3 | Suivre l'avancement des saisies | `censeur@` | 5 min | `/app/monitor` — cockpit : quelles classes et quelles matières sont en retard sur la séquence 6 |
| 2.4 | Tenir le conseil de classe | `censeur@` | 8 min | `/app/conseil` → **4e**, séquence 5 (close et complète) : absences, conduite TB/B/AB/P/M, tableau d'honneur, encouragements, félicitations, décision, appréciation |
| 2.5 | Éditer bulletins, relevés et palmarès | `censeur@` | 7 min | `/app/bulletins` (trimestre 1, complet) → `/app/releves` → `/app/palmares` ; montrer qu'un bulletin de **GS**, de **CM2** et de **6e** porte l'en-tête de **son unité** |

### Série 3 — Scolarité et caisse (4 vidéos)

| N° | Titre | Compte | Durée | À l'écran |
|---|---|---|---|---|
| 3.1 | Fixer les tarifs : grilles et catalogue de frais | `admin@` | 6 min | `/app/frais-catalogue` — 8 frais (5 obligatoires, 3 optionnels) ; grilles par classe : 120 000 / 150 000 / 200 000 FCFA + inscription, en 3 tranches |
| 3.2 | Encaisser un versement et imprimer le reçu | `caissiere@` | 6 min | `/app/fees` → `TABI Yannick` (ELV-2025-0215, **0 payé sur 200 000**) : encaisser, imprimer le reçu, montrer le ticket 80 mm et la réimpression |
| 3.3 | Piloter le recouvrement | `caissiere@` | 5 min | `/app/fees` — les 5 profils coexistent : impayés, 30 %, 55 %, 80 %, soldés (`NANA Rachel`, ELV-2025-0214). Détail par frais : soldé / partiel / impayé sur les annexes |
| 3.4 | La caisse infalsifiable | `raf@` | 7 min | **La vidéo qui vend le produit.** 738 reçus numérotés en série **continue** : un numéro manquant trahit une recette effacée. Montrer la contre-passation (jamais de suppression) et l'arrêté de caisse |

### Série 4 — Budget et gouvernance (5 vidéos)

Le cœur de la démonstration. Les 8 cas `CAS-A` à `CAS-H` sont déjà en base, un
par état du circuit : il suffit de les ouvrir.

| Cas | Ligne | Montant | État | Ce qu'il illustre |
|---|---|---|---|---|
| A | Fournitures | 85 000 | soumise | Attente du Coordonnateur (tranche 25 000 – 250 000) |
| B | Informatique | 450 000 | approuvée | Approuvée par la Fondatrice, décaissement à venir |
| C | Communication | 125 000 | payée | Circuit complet, 3 événements horodatés |
| D | Entretien | 1 250 000 | soumise | Attente de la Fondatrice (montant élevé) |
| E | Activités | 300 000 | rejetée | Rejet motivé |
| F | Examens | 220 000 | approuvée | Approuvée, non décaissée |
| G | Hygiène | 175 000 | payée | Exécutée et décaissée |
| H | Sécurité | 250 000 | brouillon | Bloquée : dépasse le disponible → demande de déblocage en attente |

| N° | Titre | Compte | Durée | À l'écran |
|---|---|---|---|---|
| 4.1 | Bâtir le budget annuel | `raf@` | 8 min | `/app/budgets` — enveloppe 45 000 000 FCFA, 3 rubriques, 14 lignes ; le total des lignes égale exactement l'enveloppe |
| 4.2 | Répartir dans le temps et entre les secteurs | `raf@` | 6 min | Même écran — 40/30/30 sur les 3 trimestres ; ligne *Fournitures* répartie 20 % maternelle / 40 % primaire / 40 % collège. Montrer qu'une ligne ne s'active qu'à 100 % |
| 4.3 | Soumettre une dépense | `caissiere@` | 5 min | `/app/depenses` — saisir puis soumettre ; montrer **CAS-A** déjà en attente |
| 4.4 | Approuver, rejeter, décaisser | `coordonnateur@` puis `fondatrice@` | 9 min | **Trois connexions successives.** Le Coordonnateur traite CAS-A ; la Fondatrice traite CAS-D (1 250 000) ; le RAF décaisse CAS-B. La cloche affiche les décisions en attente dès l'ouverture |
| 4.5 | Ligne épuisée : demander un déblocage | `raf@` puis `fondatrice@` | 6 min | **CAS-H** bloqué sur *Sécurité* → demande de 250 000 en attente ; la Fondatrice tranche. Finir sur `/app/historique` : le journal d'audit retrace qui a décidé quoi et quand |

### Série 5 — Vie scolaire (3 vidéos)

| N° | Titre | Compte | Durée | À l'écran |
|---|---|---|---|---|
| 5.1 | Retards et absences au quotidien | `surveillant@` | 6 min | `/app/retards` (30 retards saisis) et `/app/absences` ; justifier un retard, valider |
| 5.2 | De l'incident à la sanction | `surveillant@` | 8 min | `/app/incidents` → 4 dossiers **ouverts** à traiter, dont `NKOLO Solange` (6e, téléphone, **grave**, 22/02/2026) → `/app/sanctions` → `/app/convocations` → `/app/sorties` |
| 5.3 | Le dossier disciplinaire d'un élève | `surveillant@` puis `censeur@` | 6 min | `/app/vie-scolaire` puis le dossier d'un élève ; montrer que les sanctions **remontent automatiquement** sur le bulletin (compteurs de conduite) |

### Série 6 — Personnel, RH et patrimoine (4 vidéos)

| N° | Titre | Compte | Durée | À l'écran |
|---|---|---|---|---|
| 6.1 | Le registre du personnel | `admin@` | 5 min | `/app/personnel` — 16 dossiers, 6 départements, identité légale (CNPS, NIU, catégorie) |
| 6.2 | Contrats, congés, présences | `admin@` | 6 min | `/app/rh` — 16 contrats ; **congé en attente de décision** : `M. NKOULOU Bertrand`, annuel du 06/07 au 24/07/2026 (19 j) : accorder ou refuser à l'image |
| 6.3 | Le bulletin de paie | `admin@` | 7 min | `/app/rh` → paie de **juin 2026** : primes (transport, logement 15 %, ancienneté), retenues (CNPS 4,2 %, IRPP 8 %, avance), charges patronales indicatives ; imprimer un bulletin |
| 6.4 | Immobilisations et signalements | `admin@` | 6 min | `/app/immobilisations` — 12 biens, le **bus scolaire en maintenance** ; puis `/app/signalements` : 8 dossiers ouverts / affectés / en cours / résolus, avec historique |

### Série 7 — Les rôles en pratique (3 vidéos)

C'est la série qui fait comprendre la gouvernance. Elle vaut mieux que n'importe
quelle explication théorique : on montre deux écrans côte à côte.

| N° | Titre | Compte | Durée | À l'écran |
|---|---|---|---|---|
| 7.1 | Chacun ne voit que son périmètre | `principal@` puis `fondatrice@` | 7 min | Ouvrir **le même écran Budgets** avec les deux comptes : le Principal ne voit que le collège, la Fondatrice voit tout le complexe. Refaire avec `dir.primaire@` et `resp.maternelle@` |
| 7.2 | Le Contrôleur : tout voir, ne rien décider | `controleur@` | 5 min | `/app/budget-global` et `/app/depenses` — les chiffres sont là, **aucun bouton d'approbation**. Le contrôle n'est pas un pouvoir de décision |
| 7.3 | Créer un compte et lui attribuer un rôle | `admin@` | 8 min | `/app/personnel` → onglet Gouvernance : créer un compte, lui donner un rôle, une date de validité, un secteur ; se reconnecter avec pour montrer que les menus ont changé. Montrer l'historique des attributions |

### Série 8 — Hors-ligne et synchronisation (2 vidéos, édition LAN)

| N° | Titre | Compte | Durée | À l'écran |
|---|---|---|---|---|
| 8.1 | Travailler sans Internet | `admin@` | 6 min | Serveur LAN sur la base de démonstration : couper la connexion, continuer à saisir des notes et encaisser |
| 8.2 | Sauvegarde et synchronisation | `admin@` | 6 min | `/app/synchronisation` et `/app/historique` — état de la synchro, sauvegardes, ce qui remonte au cloud et quand |

### Ordre de production conseillé

Si vous ne tournez qu'une poignée de vidéos, prenez celles-ci, dans cet ordre :
**4.4** (approuver / rejeter), **3.4** (la caisse infalsifiable), **7.1**
(chacun son périmètre), **2.1** (saisir les notes), **2.5** (bulletins).
Ce sont les cinq qui montrent le plus vite ce que le produit fait de différent.

### Avant chaque session d'enregistrement

```bash
node scripts/seed-college-la-retraite.mjs --reset
NOTESCAM_DATA_DIR=server/data-demo npm run server
```

Le `--reset` remet l'établissement dans son état initial : les 8 cas budgétaires
redeviennent en attente, la séquence 6 redevient incomplète, les dossiers
disciplinaires se rouvrent. Vous pouvez donc refaire une prise autant de fois
que nécessaire, avec exactement les mêmes chiffres à l'écran.

---

## Notes techniques

- **Moteur de bulletin** : `classic` (notes sur 20) pour toutes les classes, y compris la maternelle. Pour filmer le carnet officiel MINEDUB (maternelle/primaire) ou MINESEC, basculez `schools.bulletin_engine` ou la surcharge `classes.bulletin_engine` — cela suppose que les référentiels APC/PRIM/MAT soient chargés et que les notes correspondantes existent.
- **`period_mode = 'manual'`** : l'instantané pilote les périodes, pas la date du jour. Sans cela, la période active serait recalculée et l'écran ouvrirait hors saison.
- **Codes normalisés** : `student_absences.conduite` utilise les codes `TB|B|AB|P|M` attendus par le bulletin, et `students.statut` les valeurs `nouveau|redoublant|transfere` contraintes en base. Écrire des libellés en clair les afficherait bruts ou ferait échouer l'insertion cloud.
- **Marqueur** : toutes les lignes synchronisables portent `device_id = 'seed-laretraite-v1'`.
- **Reproductibilité** : le générateur LAN utilise un PRNG amorcé (`mulberry32`, graine `20260630`) et le script cloud `setseed(0.20260630)` — deux exécutions produisent le même jeu.
- **Écarts LAN / cloud** : la structure, les comptes, les montants, le budget et les cas de validation sont identiques. Les valeurs tirées au hasard (notes individuelles, dates de versement) diffèrent, les deux éditions n'utilisant pas le même générateur.

## Fichiers

| Fichier | Rôle |
|---|---|
| `scripts/seed-college-la-retraite.mjs` | Générateur LAN (SQLite) |
| `supabase/seed_college_la_retraite.sql` | Seed cloud (Supabase) |
| `supabase/seed_college_la_retraite_validate.sql` | 31 contrôles de cohérence |
| `supabase/seed_college_la_retraite_cleanup.sql` | Suppression complète |
