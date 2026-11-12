# Export / import global de NotesCam et installation en réseau local — audit du 2026-11-11

Tout ce qui est écrit « testé » a été exécuté pour de vrai sur une COPIE jetable de la base de dev
(`server/data`, jamais modifiée). Ce qui n'a pas été exécuté est dans la section 7, sans fard.

## 1. Inventaire : ce que chaque mécanisme sauvegarde

Il existe trois mécanismes. Ils ne couvrent pas la même chose.

| Mécanisme | Où | Contenu |
|---|---|---|
| **Archive complète `.ncbak`** (nouveau, branché aujourd'hui) | LAN : Paramètres → Sauvegarde | Base entière + tous les fichiers (`files/` : photos, logos, signatures, tampons), empreintes SHA-256, résumé |
| Copie `.db` (existant) | LAN, toutes les 2 h | Base entière, **sans** les fichiers |
| Export JSON (existant) | Cloud et LAN | Tables ayant `school_id` et autorisées par l'API, **sans** fichiers, **sans** comptes de connexion |

| Donnée | `.ncbak` | `.db` | JSON |
|---|---|---|---|
| Établissement, paramètres (seuils, séquences, année, en-tête) | oui | oui | oui |
| Logo, cachet, signatures, photos d'élèves (fichiers) | **oui** | non | non |
| Classes, matières, barèmes, critères, ordre | oui | oui | oui (tables `school_id`) |
| Référentiels nationaux (APC, SC, bilingue, primaire) | oui | oui | non (pas de `school_id`) |
| Élèves (matricule, naissance, parents) | oui | oui | oui |
| Enseignants, rôles, affectations (`school_users`) | oui | oui | oui |
| **Comptes de connexion** (`users`, mots de passe hachés) | **oui** | oui | **non** |
| Comptes parents | oui | oui | non |
| Notes, critères, absences, conduite, appréciations, décisions | oui | oui | oui |
| Frais, paiements, caisse, budgets, RH | oui | oui | oui |
| Liens parent↔élève, activation cloud, état de migration | oui | oui | **non** (hors API, signalé au log) |
| Secrets (jetons, clés SMS, appairage) | présents dans la base | présents | exclus volontairement |
| Modèles de bulletins / cartes / certificats | dans la base si stockés en réglages d'école ; **non vérifié table par table** | idem | idem |

Conclusion qui compte : **le JSON seul ne permet PAS de reconstruire une école sur une machine vide** (pas
de comptes, pas de photos, pas de référentiels). Pour transférer ou pour la reprise après sinistre, c'est
l'archive `.ncbak` qu'il faut. Mots de passe : stockés hachés dans `users`, jamais en clair.

## 2. Test d'aller-retour (preuve)

Source : copie de la base de dev (130 tables) + **1 215 élèves, 57 600 notes classiques, 9 600 notes
primaire (67 200 notes au total)**, 300 photos, noms avec accents, apostrophes et caractères chinois
(`N'GUESSAN Ève-Marie`, `陈小明`, `李 华`, `ÉTOUNDI Hélène`).

- Export archive : 42,9 Mo, 2 à 4 s. Vérification SHA-256 de chaque entrée : saine.
- Import dans un dossier vide : 2,6 s. **129 tables comparées par empreinte SHA-256 de chaque ligne : 0 différence.**
  `PRAGMA integrity_check` : ok. Nom chinois relu intact. 300/300 fichiers présents avec mêmes empreintes.
- **Bout en bout avec deux vrais serveurs** (A = école source, B = installation neuve avec son propre
  compte) : création de l'archive par l'API admin → téléchargement → dépôt sur B → aperçu → restauration
  programmée → redémarrage de B → connexion avec le compte admin de l'école source → effectifs identiques
  (1 215 / 57 600 / 9 600 / 6 classes) et 300 fichiers. Script : 19 vérifications, 0 échec.

## 3. Cas d'échec

| Cas | Résultat |
|---|---|
| Archive tronquée | refusée, aucune cible créée (testé) |
| Octets altérés | refusée **au dépôt** (HTTP 422, « Fichier refusé, rien n'a été modifié ») ; avant correction, une archive altérée remplaçait quand même la cible → **corrigé** |
| Fichier qui n'est pas une archive NotesCam | message clair en français (testé) |
| Cible non vide | avant : écrasée sans rien demander → **corrigé** : refus `TARGET_NOT_EMPTY` sauf accord explicite ; l'ancien contenu est mis de côté, jamais supprimé |
| Restauration sur le serveur | l'ancienne base ET l'ancien dossier `files/` partent dans `pre-restore/` : la « sauvegarde automatique avant » est le dossier mis de côté |
| Archive d'une version plus récente | refusée avec message (comparaison numérique 0.3.37 > 0.3.9, testée en unitaire) |
| Archive d'un autre établissement | refusée si l'école actuelle a des élèves ; autorisée sur une installation neuve (aucun élève) — **ajouté**, sinon le transfert vers une machine neuve était impossible |
| Cloud actif | restauration de fichier refusée (le Cloud réécraserait) : voir JSON |
| Identifiants | la base est restaurée telle quelle, les identifiants sont donc ceux d'origine : pas de conflit possible (pas de fusion) |

## 4. Sécurité

- Création, dépôt, téléchargement, aperçu, restauration : **administrateur de l'établissement seulement** côté serveur.
  Sans connexion : refusé (HTTP 403, testé). Le rôle « enseignant » n'a pas été testé explicitement.
- Journal : `DATA_DIR/backup-journal.log` (qui, quoi, quand) pour création, dépôt, refus, restauration.
  **Il n'y a pas d'écran pour le lire** : c'est un fichier.
- **Chiffrement du fichier d'export : NON fait.** L'archive contient les empreintes de mots de passe : la garder
  sur une clé USB sous clé / ne pas l'envoyer par WhatsApp.

## 5. Ce qui a été ajouté ou corrigé (fichiers)

- `server/backupArchive.js` : métadonnées dans le manifeste (version de l'app, auteur, école, effectifs) ;
  refus d'une cible non vide sans accord ; une archive altérée n'est plus jamais promue ; ancienne cible mise de
  côté ; extraction synchrone pour le démarrage ; correction d'un avertissement de fuite d'écouteurs.
- `server/backup.js` : archive complète (`runArchiveBackup`), une par 24 h en plus des copies `.db`
  (7 gardées, `NOTESCAM_BACKUP_KEEP_ARCHIVES`), listage, vérification de version, journal.
- `server/db.js` : `applyPendingRestore` sait restaurer une `.ncbak` (base + fichiers) au démarrage, après
  vérification complète et extraction à côté.
- `server/index.js` : `POST /api/backup {full:true}`, `POST /api/backup/upload` (flux, jamais en mémoire),
  `GET /api/backup/preview/:file`, restauration d'archive, règle « installation neuve ».
- `src/lib/backupService.js`, `src/components/settings/BackupPanel.jsx` : « Sauvegarder maintenant » crée
  une archive complète ; carte « Venez-vous d'une autre machine ? » avec envoi, progression et aperçu.
- `server/_backup_archive_garde.test.mjs` (nouveau, 8 tests). Les tests existants passent (26 + 37).

## 6. Mode réseau local — guide pour l'école

**Principe : une seule machine « serveur » porte la base. Les autres postes ouvrent le navigateur. Aucun
export/import entre l'administrateur et le directeur : ils travaillent sur LA MÊME base.**

### Installation (sur le PC serveur)
1. Installer `NotesCam-Setup.exe` (options par défaut). Le service démarre tout seul avec Windows (tâche
   planifiée « au démarrage », compte SYSTEM, relance automatique 3 fois) et la règle de pare-feu « NotesCam LAN »
   (TCP 8080 entrant) est créée par `install-service.ps1`.
2. Désactiver la mise en veille du PC serveur.
3. Fixer l'adresse IP du PC serveur : dans le routeur (réservation DHCP) ou dans les paramètres réseau de Windows.
   Sinon l'adresse change et les postes ne trouvent plus le serveur.
4. Noter l'adresse : PowerShell → `powershell -ExecutionPolicy Bypass -File check-lan.ps1 -Port 8080`
   (elle affiche les adresses utilisables et teste le serveur).
5. Sur chaque autre poste (même Wi-Fi / même câble), navigateur : `http://ADRESSE-IP:8080`
   (ex. `http://192.168.1.20:8080`). Mettre la page en favori.
6. Créer un compte pour le directeur (rôle admin) depuis Paramètres → équipe. Il se connecte avec SON compte.

### Si le directeur ne peut pas se connecter
1. Sur le PC serveur, `http://localhost:8080` marche-t-il ? Non → le service est arrêté : redémarrer le PC, ou
   Planificateur de tâches → « NotesCam » → Exécuter.
2. Sur le poste du directeur, `ping ADRESSE-IP` répond-il ? Non → câble / Wi-Fi différent, ou isolation des
   clients activée sur le routeur (réseau « invité »).
3. Le ping répond mais pas la page → pare-feu : relancer `install-service.ps1` (recrée la règle), ou autoriser
   TCP 8080 entrant. Vérifier que le réseau est en profil Privé ou que la règle couvre « tous les profils ».
4. L'adresse a changé → refaire l'étape 4 ; fixer l'IP (étape 3).
5. Mot de passe oublié → `reinitialiser-mot-de-passe.cmd` sur le PC serveur.

### Sauvegarde, coupure de courant
- Copies de la base toutes les 2 h + une **archive complète (base + photos) par 24 h**, dans
  `C:\ProgramData\NotesCam\data\backups` (ou `NOTESCAM_BACKUP_DIR`). Copier l'archive du jour sur une clé USB
  chaque semaine : si le disque lâche, les sauvegardes partent avec lui.
- Base en WAL avec `synchronous=FULL` : une note validée a atteint le disque. Au retour du courant, le service
  repart seul au démarrage de Windows.

### Restaurer sur une autre machine (ou après un sinistre)
Installer NotesCam, créer le compte, puis Paramètres → Sauvegarde → « Choisir une archive (.ncbak) » → lire le
résumé (école, élèves, notes, date) → « Restaurer la base » → redémarrer le serveur → se connecter avec les
comptes de l'école d'origine.

## 7. Ce qui ne marche pas encore, ou n'a pas été prouvé

- **Aucune base réelle de Genius ni de Bright n'a été utilisée** (elles sont sur le Cloud / sur le serveur
  d'école, inaccessibles d'ici). Les chiffres viennent de la base de dev étendue de données de test. Le test
  sur les vraies données reste à faire sur une copie, avec le même script.
- **100 000 notes** : 67 200 notes testées, pas 100 000. Aucun problème de mémoire (archive en flux).
- **Bulletins et PV comparés en PDF avant/après : NON fait.** J'ai comparé les lignes de la base (identiques
  à l'octet près), pas des PDF. Mêmes données ⇒ mêmes calculs, mais ce n'est pas démontré par PDF.
- **Coupure en plein import** : non simulée par un arrêt brutal. La conception limite le risque (extraction
  dans un dossier à côté, vérification complète, puis bascule par renommages), mais un arrêt exactement entre
  deux renommages n'a pas été joué. Les dossiers `pre-restore/` permettent alors de reprendre à la main.
- **Archive d'une version plus ancienne** restaurée sur une version plus récente : la montée de schéma se fait
  au démarrage (`ensureColumn`), mais je ne l'ai pas rejouée avec une vraie archive ancienne.
- **L'interface n'a pas été vue dans un navigateur** : le build compile, l'API est testée de bout en bout,
  mais l'écran « Choisir une archive » n'a pas été cliqué.
- **Pas de « Fusionner » pour une archive** : la restauration `.ncbak` remplace tout (avec l'ancien mis de côté).
  La fusion existe seulement via le JSON (« réinsérer ce qui manque » / « revenir à l'état »).
- **Import JSON non transactionnel** : écritures ligne par ligne, une ligne refusée est comptée et signalée.
  Je n'y ai pas touché.
- **Pas de barre de progression pour la création** de l'archive (seul l'envoi en a une). Le téléchargement passe
  par le navigateur en mémoire : correct pour 40 Mo, à surveiller pour plusieurs Go (copier le fichier depuis
  `backups/` à la place).
- **Dossier de sauvegarde configurable** : variable d'environnement seulement, pas d'écran.
- **Chiffrement** : non fait (voir section 4). **Journal** : fichier, pas d'écran.
- **Restauration appliquée seulement au redémarrage** du serveur, et refusée si la synchronisation Cloud est active.
- **Saisie simultanée** : 5 clients HTTP × 400 notes + une même case écrite par tous, sur le vrai serveur :
  4 000 écritures acceptées, 0 refus, 2 000/2 000 notes présentes, la case commune en un seul exemplaire.
  Dernier écrivain gagnant sur une même case : il n'y a pas de détection de conflit visible pour l'utilisateur.
  Débit mesuré ≈ 40 écritures/s sur ce poste (100 s pour 4 000) — acceptable pour une saisie humaine.
  (Trois processus écrivant directement dans le même fichier SQLite, hors serveur, ont perdu 10 écritures sur
  9 000 : ce n'est pas la configuration d'une école, où un seul serveur écrit, mais ne jamais ouvrir la base
  d'un second programme pendant que le service tourne.)

## 8. Checklist « avant de partir à l'école » (15 minutes sur place)

1. Le PC serveur est branché sur secteur, mise en veille désactivée, Windows à jour hors redémarrage forcé.
2. `http://localhost:8080` s'ouvre sur le serveur.
3. Adresse IP du serveur notée et **fixée** (réservation DHCP ou IP statique).
4. `check-lan.ps1` : « écoute sur 0.0.0.0 » et règle de pare-feu présente.
5. Depuis un autre poste : `http://IP:8080` s'ouvre, connexion avec le compte du directeur réussie.
6. Saisir une note sur le poste A, la voir apparaître sur le poste B après rafraîchissement.
7. Paramètres → Sauvegarde → « Sauvegarder maintenant » : l'archive apparaît avec « base + photos » et sa taille.
8. Copier cette archive sur une clé USB ; ouvrir son aperçu (école, élèves, notes) pour vérifier qu'elle est lisible.
9. Redémarrer le PC serveur : sans rien toucher, la page se rouvre toute seule au bout de 1 à 2 minutes.
10. Écrire sur papier collé au serveur : l'IP, le compte admin, le numéro de support, et « ne pas éteindre pendant la saisie ».
