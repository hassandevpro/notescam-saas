# Packaging — Édition LAN NotesCam pour Ubuntu/Debian

Équivalent Linux de `packaging/` (l'installateur Windows `.exe`) : un paquet
`.tar.gz` autonome qui installe le serveur NotesCam sur un PC/serveur Ubuntu
d'école, le **démarre automatiquement au boot** via systemd et le rend
accessible aux autres appareils du réseau local. Même codebase, même serveur
Fastify + SQLite — voir `../../LAN_EDITION.md` pour l'architecture.

## Ce que fait l'installation (sur la machine Ubuntu)

1. Copie dans `/opt/notescam/` : **Node portable** (`node/bin/node`), la SPA
   compilée et le serveur + ses dépendances.
2. Crée un utilisateur système `notescam` (sans login, sans home) qui
   exécute le serveur — jamais en root.
3. Enregistre un **service systemd** `notescam.service` :
   - démarrage **au boot** (`systemctl enable`),
   - **redémarrage automatique** en cas de crash (`Restart=on-failure`),
   - durci (`ProtectSystem=strict`, `NoNewPrivileges`, écriture limitée à
     `/var/lib/notescam`),
   - démarré immédiatement après l'installation.
4. Ouvre le port `8080/tcp` dans **ufw** si actif.
5. Données + sauvegardes dans `/var/lib/notescam/data/` (jamais supprimées à
   la désinstallation).

Accès : `http://localhost:8080` sur la machine, `http://<IP-machine>:8080`
depuis le réseau.

## Construire le paquet (machine de développement)

**Prérequis :** Node + npm, `curl`, `tar` (fonctionne aussi depuis Git Bash
sur Windows — le paquet produit cible Linux, mais rien n'est compilé
nativement : `fastify`/`@fastify/static` sont du JS pur).

```bash
cd packaging/linux
./build-package.sh
# -> packaging/linux/Output/notescam-linux-x64-<version>.tar.gz
```

Le script : télécharge Node portable (linux-x64), compile la SPA
(`npm run build:lan`), assemble `_stage/`, installe les dépendances runtime
du serveur, puis archive le tout avec les scripts d'installation.

Option : `./build-package.sh v24.6.0` pour figer la version de Node
(par défaut : dernière `v24.x`).

## Installer sur le serveur Ubuntu

```bash
scp packaging/linux/Output/notescam-linux-x64-*.tar.gz ecole@serveur:~
ssh ecole@serveur
tar xzf notescam-linux-x64-*.tar.gz
cd notescam-linux-x64
sudo ./install.sh          # port 8080 par défaut
sudo ./install.sh 9090     # ou un port différent
```

Mettre à jour : relancer `sudo ./install.sh` avec une nouvelle archive — le
service est arrêté, l'app remplacée, les données et la config
(`/etc/notescam/notescam.env`) sont conservées.

## Désinstaller

```bash
sudo ./uninstall.sh            # retire le service + ufw, garde les données
sudo ./uninstall.sh --purge    # + propose d'effacer /var/lib/notescam
```

## Fichiers

| Fichier | Rôle |
|---|---|
| `build-package.sh` | orchestration complète (Node + build + stage + archive) |
| `install.sh` | crée l'utilisateur système, installe le service + ufw, démarre |
| `uninstall.sh` | retire service + ufw (conserve les données sauf `--purge`) |
| `notescam.service` | unit systemd (copiée telle quelle dans `/etc/systemd/system/`) |

## Exploitation

- **Logs** : `journalctl -u notescam -f` (pas de fichier de log manuel,
  contrairement à l'édition Windows — systemd s'en charge).
- **Statut / contrôle** : `systemctl status notescam`,
  `systemctl restart notescam`.
- **Configuration** (`PORT`, `HOST`, `NOTESCAM_DATA_DIR`, …) : éditer
  `/etc/notescam/notescam.env` puis `sudo systemctl restart notescam`.
- **IP fixe recommandée** (réservation DHCP ou IP statique) pour que les
  appareils gardent la même adresse.
- **HTTPS/PWA** : en `http://<IP>`, le mode hors-ligne PWA des appareils
  clients ne s'active pas (contexte non sécurisé) — l'app reste pleinement
  fonctionnelle en ligne sur le LAN. Pour le HTTPS, mettre un reverse proxy
  (Caddy/nginx avec certificat local) devant le port `8080`.
