> Pour Ubuntu/Debian, voir `linux/README.md` (paquet `.tar.gz` + service
> systemd — équivalent Linux de cet installateur Windows).

# Packaging — Installateur .exe NotesCam (édition LAN)

Produit un installateur Windows unique (`NotesCam-Setup.exe`) qui installe le
serveur NotesCam sur un PC d'école, le **démarre automatiquement au boot** et le
rend accessible aux autres appareils du réseau local.

## Ce que fait l'installateur (sur le PC de l'école)

1. Copie dans `C:\Program Files\NotesCam\` : **Node portable** (`node.exe`), le
   serveur, la SPA compilée et les dépendances.
2. Enregistre une **tâche planifiée** « NotesCam LAN Server » :
   - démarrage **au boot** (compte SYSTEM, sans login),
   - **redémarrage automatique** en cas de crash,
   - démarrée immédiatement après l'installation.
3. Ouvre le **pare-feu Windows** en entrée sur le port `8080` (TCP).
4. Données + sauvegardes stockées dans `C:\ProgramData\NotesCam\` (jamais
   supprimées à la désinstallation).

Accès : `http://localhost:8080` sur le PC, `http://<IP-du-PC>:8080` sur le réseau.

## Construire l'installateur (machine de développement)

**Prérequis :** Node + npm, accès internet (nodejs.org), et
[Inno Setup 6](https://jrsoftware.org/isdl.php).

```powershell
cd packaging
powershell -ExecutionPolicy Bypass -File build-installer.ps1
# -> packaging\Output\NotesCam-Setup.exe
```

Le script : télécharge Node portable, compile la SPA (`npm run build:lan`),
assemble `_stage\`, installe les dépendances runtime du serveur, puis lance
Inno Setup. Si Inno Setup n'est pas installé, le staging est quand même préparé
et la commande ISCC à lancer est affichée.

Options : `-NodeVersion v24.16.0` (version Node précise), `-AppVersion 1.0.0`.

## Fichiers

| Fichier | Rôle |
|---|---|
| `build-installer.ps1` | orchestration complète (Node + build + stage + ISCC) |
| `notescam.iss` | script Inno Setup (fichiers, raccourcis, hooks service) |
| `start-server.cmd` | lanceur (variables d'env + node + log) exécuté par la tâche |
| `install-service.ps1` | enregistre la tâche planifiée + règle pare-feu, démarre |
| `uninstall-service.ps1` | retire tâche + pare-feu (conserve les données) |
| `reinitialiser-mot-de-passe.cmd` | secours : réinitialise un mot de passe oublié (hors ligne) |
| `make-seed-ecole.mjs` | produit la base d'une école depuis le cloud (étape 1 d'un installeur chargé) |
| `stage-seed.mjs` | prépare cette base pour l'embarquement (WAL replié, état local purgé, zéro secret) |
| `seed-data.ps1` | pose la base embarquée sur le PC — jamais par-dessus une base existante |

## Vérifié

Le **layout exact de l'installation** (node.exe portable + app + 2 dépendances
runtime) a été testé : la SPA est servie, le fallback de routing fonctionne,
l'API complète répond. Seul `node.exe` (≈ 80 Mo) + `fastify`/`@fastify/static`
sont nécessaires à l'exécution — aucun module natif, aucune compilation.

## Installeur chargé des données d'une école (installation hors ligne)

Par défaut l'installeur est **vierge** : l'école le rattache à son compte cloud au
premier démarrage (assistant « code d'appairage » ou identifiants cloud), ce qui
exige **Internet sur le PC de l'école**. Quand ce PC n'a pas Internet, on produit
un installeur qui porte déjà la base de l'établissement : il installe, démarre, et
l'école **se connecte avec ses identifiants habituels**.

```bash
# 1. Produire la base depuis le cloud (mot de passe demande a l'ecran)
node packaging/make-seed-ecole.mjs --label bright-continent --email <admin cloud>
#    -> packaging/_seed/bright-continent/   (base + fichiers de l'ecole)

# 2. Construire l'installeur qui la porte
powershell -ExecutionPolicy Bypass -File packaging/build-installer.ps1 `
  -NodeVersion v24.20.0 -SeedData packaging/_seed/bright-continent -SeedLabel bright-continent
#    -> packaging/Output/NotesCam-Setup-bright-continent.exe
```

`-SeedLabel` est **obligatoire** avec `-SeedData` et nomme le `.exe` produit : un
installeur qui contient les données d'une école ne doit jamais porter le même nom
qu'un installeur vierge — on ne distribue pas les élèves d'une école par mégarde.

Ce qui est embarqué : `notescam.db` + `files/` (logos, cachets, signatures,
photos). Ce qui ne l'est **jamais** : les clés propres à un poste (jeton serveur
scellé, clé JWT, clé RSA du canal d'identifiants, clé de la file de miroir) — le
PC de l'école les génère au premier démarrage. L'état local du poste de build
(files et curseurs de synchro, file de miroir des mots de passe, réglages locaux)
est purgé, et `stage-seed.mjs` **affiche l'école, les effectifs et les comptes**
avant de produire quoi que ce soit.

À l'installation, `seed-data.ps1` ne pose la base **que si le PC n'en a pas
déjà une**. Une réinstallation, une mise à jour ou une réparation conserve
toujours les données présentes : l'installeur ne peut pas effacer une année
scolaire.

Mots de passe : le compte **admin** utilisé à l'étape 1 garde son mot de passe
cloud en local. Les autres comptes reçoivent un mot de passe aléatoire (le cloud
ne laisse pas lire les mots de passe). Pour livrer une école prête à travailler,
on pose une liste **entre les étapes 1 et 2** :

```bash
# comptes.txt :  email ; motdepasse     (une ligne par compte, # = commentaire)
npm run reset:password -- --data-dir packaging/_seed/bright-continent --liste
npm run reset:password -- --data-dir packaging/_seed/bright-continent --fichier comptes.txt
```

La liste est **tout ou rien** : un compte inconnu, un mot de passe trop court ou
un doublon, et aucune écriture n'a lieu — une base à moitié préparée livrerait à
l'école des comptes muets sans que personne sache lesquels. Ne pas laisser
`comptes.txt` dans le dépôt.

## Mot de passe oublié (secours hors ligne)

En LAN il n'y a ni e-mail ni lien « mot de passe oublié », et l'écran qui
redéfinit un mot de passe exige d'être **déjà connecté**. Une école dont le
directeur oublie son mot de passe perdrait donc l'accès à toute
l'administration. L'installateur embarque pour cela un outil de secours, à
lancer **sur le PC serveur** :

- Menu Démarrer → **NotesCam → Réinitialiser un mot de passe**
- ou double-clic sur `C:\Program Files\NotesCam\reinitialiser-mot-de-passe.cmd`

Il demande l'élévation (la base vit dans `C:\ProgramData\NotesCam\data`, écrite
par le compte SYSTÈME), liste les comptes de connexion, puis demande lequel
réinitialiser et avec quel mot de passe (vide = généré, lisible, sans caractère
ambigu). Le serveur peut rester allumé. **Rien ne sort du PC.**

En ligne de commande (console administrateur), ou en développement :

```powershell
# sur un PC d'école installé
& "C:\Program Files\NotesCam\node\node.exe" `
  "C:\Program Files\NotesCam\app\server\reset-password-cli.mjs" `
  --data-dir "C:\ProgramData\NotesCam\data" --liste

# en développement (base server/data)
npm run reset:password -- --liste
npm run reset:password -- --email directeur@ecole.cm
npm run reset:password -- --email directeur@ecole.cm --mot-de-passe 'Rentree2026!'
```

ÉCOLE DÉJÀ INSTALLÉE, version antérieure à l'outil : pas besoin de réinstaller.
Copier sur une clé USB `server/reset-password-cli.mjs`, `server/resetPassword.js`
et `packaging/reinitialiser-mot-de-passe.cmd`, puis lancer le `.cmd` sur le PC.
Il emprunte le `node.exe` et la base de l'installation présente (`--app-dir`) et
n'écrit rien dans Program Files. Le hachage vient TOUJOURS de l'installation
dépannée : une empreinte scrypt calculée par une autre version du code
verrouillerait l'école en silence.

L'outil ne révèle aucun mot de passe existant (scrypt est à sens unique), ne
touche qu'**un** compte à la fois, et laisse rôles, périmètres et données
intacts. Installation hybride : le cloud s'aligne seul à la première connexion
réussie (`mirrorToCloud`, `/api/auth/login`). Fichiers :
`server/reset-password-cli.mjs`, `server/resetPassword.js` (+ test
`server/_reset_password.test.mjs`), `packaging/reinitialiser-mot-de-passe.cmd`.


## Notes d'exploitation

- **Pas de service au sens SCM** : on utilise le Planificateur de tâches Windows
  (outil intégré, zéro binaire tiers à télécharger). Suffisant et fiable pour un
  poste d'école. Pour des stop/start « service » classiques : `schtasks /End` /
  `/Run /TN "NotesCam LAN Server"`.
- **IP fixe recommandée** (réservation DHCP) pour que les appareils gardent la
  même adresse, et **désactiver la veille** du PC serveur.
- **HTTPS/PWA** : en `http://<IP>`, le mode hors-ligne PWA des appareils clients
  ne s'active pas (contexte non sécurisé). L'app reste pleinement fonctionnelle
  en ligne sur le LAN. Voir `../LAN_EDITION.md`.
