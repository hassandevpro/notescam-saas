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

## Vérifié

Le **layout exact de l'installation** (node.exe portable + app + 2 dépendances
runtime) a été testé : la SPA est servie, le fallback de routing fonctionne,
l'API complète répond. Seul `node.exe` (≈ 80 Mo) + `fastify`/`@fastify/static`
sont nécessaires à l'exécution — aucun module natif, aucune compilation.

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
