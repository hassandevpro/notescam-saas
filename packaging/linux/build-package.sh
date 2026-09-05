#!/usr/bin/env bash
# Assemble le paquet NotesCam LAN pour Ubuntu/Debian (.tar.gz autonome).
#
# Étapes :
#   1. Télécharge Node portable (linux-x64) depuis nodejs.org
#   2. Compile la SPA en édition LAN (npm run build:lan)
#   3. Copie le serveur + les modules partagés (src/lib, src/governance, src/domains)
#   4. Installe les dépendances runtime du serveur (fastify, @fastify/static)
#   5. Ajoute install.sh / uninstall.sh / notescam.service
#   6. Archive -> Output/notescam-linux-x64-<version>.tar.gz
#
# Prérequis sur la machine de build : Node + npm, curl, tar. Fonctionne aussi
# depuis Git Bash sur Windows (le paquet produit est pour Linux, la machine de
# build peut être n'importe quel OS — fastify/@fastify/static sont du JS pur,
# aucune compilation native).
#
# Usage :
#   cd packaging/linux
#   ./build-package.sh              # dernière version Node v24.x
#   ./build-package.sh v24.6.0      # version Node précise
#
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
STAGE_PARENT="$HERE/_stage"
STAGE="$STAGE_PARENT/notescam-linux-x64"
CACHE="$HERE/_cache"
OUT="$HERE/Output"
NODE_VERSION="${1:-}"

step() { echo; echo "=== $1 ==="; }

step "Préparation du dossier de staging"
rm -rf "$STAGE_PARENT"
mkdir -p "$STAGE/node/bin" "$STAGE/app" "$CACHE" "$OUT"

step "Récupération de Node portable (linux-x64)"
if [[ -z "$NODE_VERSION" ]]; then
  NODE_VERSION="$(curl -fsSL https://nodejs.org/dist/index.json \
    | grep -o '"version":"v24\.[0-9.]*"' | head -1 | cut -d'"' -f4)"
  echo "Dernière v24 : $NODE_VERSION"
fi
TARBALL="node-$NODE_VERSION-linux-x64.tar.xz"
if [[ ! -f "$CACHE/$TARBALL" ]]; then
  echo "Téléchargement https://nodejs.org/dist/$NODE_VERSION/$TARBALL"
  curl -fsSL -o "$CACHE/$TARBALL" "https://nodejs.org/dist/$NODE_VERSION/$TARBALL"
fi
EXTRACT="$CACHE/node-$NODE_VERSION-linux-x64"
[[ -d "$EXTRACT" ]] || tar -xf "$CACHE/$TARBALL" -C "$CACHE"
cp "$EXTRACT/bin/node" "$STAGE/node/bin/node"
chmod +x "$STAGE/node/bin/node"
echo "node prêt ($(du -h "$STAGE/node/bin/node" | cut -f1))"

step "Compilation de la SPA (édition LAN)"
( cd "$ROOT" && npm run build:lan )
cp -r "$ROOT/dist" "$STAGE/app/dist"

step "Copie du serveur (sans données ni node_modules)"
mkdir -p "$STAGE/app/server"
cp -r "$ROOT/server/." "$STAGE/app/server/"
rm -rf "$STAGE/app/server/data" "$STAGE/app/server/data-demo" "$STAGE/app/server/_test_data" "$STAGE/app/server/node_modules"
find "$STAGE/app/server" -name '*.log' -delete

# Bases et cles : elles ne sont pas suivies par Git, donc invisibles a la
# relecture d'un diff, mais `cp -r` les emporte quand meme. La 0.2.3 est ainsi
# partie chez l'ecole avec server/data-demo/ (jwt-secret.key, mirror.key,
# server-token.key, la base de la demo et ses sauvegardes) et une sauvegarde de
# la base de THE GENIUS laissee a la racine de server/. Rien de tout cela n'est
# necessaire : install.sh ne lit aucune cle du paquet, elles sont generees a
# l'installation dans /var/lib/notescam/data.
find "$STAGE/app" \( -name '*.db' -o -name '*.db-journal' -o -name '*.key' -o -name '.env*' \) -delete

# Moteurs purs partagés importés par le serveur (budgetGuard, gouvernance
# hybride H1-H7) : mêmes chemins relatifs que le build Windows (app/src/...).
for sub in lib governance domains; do
  mkdir -p "$STAGE/app/src/$sub"
  cp -r "$ROOT/src/$sub/." "$STAGE/app/src/$sub/"
  find "$STAGE/app/src/$sub" -name '*.log' -delete
done

step "Identité de l'application (nom + version)"
# `appVersion()` (server/syncAudit.js) lit la version dans `app/package.json`.
# Ce fichier n'était copié NULLE PART : tout serveur installé annonçait donc la
# version « ? » — dans /api/version, dans le journal d'audit de synchro et dans la
# comparaison de mise à jour, qui ne pouvait comparer quoi que ce soit. Seul le NOM
# de l'archive portait le numéro, et il ne survit pas à l'installation.
#
# On n'écrit QUE l'identité, pas le package.json de la racine : les dépendances du
# front (react, vite…) n'ont rien à faire sur un serveur d'école, et les y déclarer
# ferait croire à un audit qu'elles y sont installées.
APP_VERSION="$(grep -m1 '"version"' "$ROOT/package.json" | sed -E 's/.*"version"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/')"
cat > "$STAGE/app/package.json" <<JSON
{
  "name": "notescam-app",
  "private": true,
  "version": "$APP_VERSION",
  "type": "module"
}
JSON
echo "  version embarquée : $APP_VERSION"

step "Installation des dépendances serveur (fastify, @fastify/static)"
( cd "$STAGE/app/server" && npm install --omit=dev --no-audit --no-fund )

step "Copie des scripts d'installation"
cp "$HERE/install.sh" "$HERE/uninstall.sh" "$HERE/notescam.service" "$HERE/LISEZ-MOI.txt" "$STAGE/"
chmod +x "$STAGE/install.sh" "$STAGE/uninstall.sh"

step "Normalisation des fins de ligne (LF)"
# Un build lance depuis Windows avec core.autocrlf=true recupere les .sh en CRLF.
# Sous Linux, le shebang devient «bash\r» et le script est INEXECUTABLE :
#   /usr/bin/env: «bash\r»: Aucun fichier ou dossier de ce type
# Le paquet part alors casse sans que rien ne le signale a la construction.
# On normalise donc systematiquement, quelle que soit la machine de build.
crlf=0
while IFS= read -r -d '' f; do
  if grep -qU $'\r' "$f" 2>/dev/null; then
    sed -i 's/\r$//' "$f"; crlf=$((crlf+1))
  fi
done < <(find "$STAGE" -maxdepth 2 -name '*.sh' -type f -print0)
echo "  scripts convertis de CRLF vers LF : $crlf"
# Garde-fou : le paquet ne doit JAMAIS sortir avec un shebang en CRLF.
for f in "$STAGE"/install.sh "$STAGE"/uninstall.sh; do
  if head -1 "$f" | grep -qU $'\r'; then
    echo "ERREUR : $f a encore un shebang CRLF — construction interrompue." >&2
    exit 1
  fi
done

step "Garde-fou : ni base ni secret dans le paquet"
# Le nettoyage ci-dessus vise ce qu'on connait ; ce controle vise ce qu'on ne
# connait pas encore. Un paquet client ne doit JAMAIS transporter de base ni de
# cle : plutot echouer ici que le decouvrir apres livraison.
intrus="$(find "$STAGE" -path "$STAGE/node" -prune -o -type f \
  \( -name '*.db' -o -name '*.db-journal' -o -name '*.key' -o -name '.env*' \) -print)"
if [[ -n "$intrus" ]]; then
  echo "ERREUR : ces fichiers ne doivent pas etre livres — construction interrompue :" >&2
  echo "$intrus" >&2
  exit 1
fi
echo "  aucune base, aucune cle"

step "Archive finale"
APP_VERSION="$(grep -m1 '"version"' "$ROOT/package.json" | sed -E 's/.*"version"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/')"
PKG="notescam-linux-x64-$APP_VERSION.tar.gz"
tar -czf "$OUT/$PKG" -C "$STAGE_PARENT" notescam-linux-x64

echo
echo "[OK] Paquet prêt : $OUT/$PKG"
echo
echo "Sur le serveur Ubuntu :"
echo "  tar xzf $PKG"
echo "  cd notescam-linux-x64"
echo "  sudo ./install.sh          # port 8080 par défaut, ou: sudo ./install.sh 9090"
