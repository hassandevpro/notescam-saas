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
rm -rf "$STAGE/app/server/data" "$STAGE/app/server/_test_data" "$STAGE/app/server/node_modules"
find "$STAGE/app/server" -name '*.log' -delete

# Moteurs purs partagés importés par le serveur (budgetGuard, gouvernance
# hybride H1-H7) : mêmes chemins relatifs que le build Windows (app/src/...).
for sub in lib governance domains; do
  mkdir -p "$STAGE/app/src/$sub"
  cp -r "$ROOT/src/$sub/." "$STAGE/app/src/$sub/"
  find "$STAGE/app/src/$sub" -name '*.log' -delete
done

step "Installation des dépendances serveur (fastify, @fastify/static)"
( cd "$STAGE/app/server" && npm install --omit=dev --no-audit --no-fund )

step "Copie des scripts d'installation"
cp "$HERE/install.sh" "$HERE/uninstall.sh" "$HERE/notescam.service" "$HERE/LISEZ-MOI.txt" "$STAGE/"
chmod +x "$STAGE/install.sh" "$STAGE/uninstall.sh"

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
