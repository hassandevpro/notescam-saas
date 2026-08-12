#!/usr/bin/env bash
# Installe NotesCam (édition LAN) sur Ubuntu/Debian : service systemd qui
# démarre au boot et redémarre seul en cas de crash, + règle pare-feu ufw.
#
# À exécuter en root, depuis le dossier extrait de l'archive
# notescam-linux-x64-*.tar.gz (celui qui contient node/, app/, notescam.service…) :
#
#   sudo ./install.sh [port]      # port par défaut : 8080
#
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "Ce script doit être lancé en root (sudo ./install.sh)" >&2
  exit 1
fi

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT="${1:-8080}"
INSTALL_DIR=/opt/notescam
DATA_ROOT=/var/lib/notescam
DATA_DIR="$DATA_ROOT/data"
ENV_DIR=/etc/notescam
SERVICE_NAME=notescam

if [[ ! -d "$HERE/node" || ! -d "$HERE/app" ]]; then
  echo "node/ ou app/ introuvable à côté de install.sh — archive incomplète." >&2
  exit 1
fi

echo "==> Utilisateur système '$SERVICE_NAME'"
id -u "$SERVICE_NAME" >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin "$SERVICE_NAME"

echo "==> Arrêt du service existant (mise à jour éventuelle)"
systemctl stop "$SERVICE_NAME" 2>/dev/null || true

echo "==> Copie de l'application vers $INSTALL_DIR"
mkdir -p "$INSTALL_DIR"
rm -rf "$INSTALL_DIR/node" "$INSTALL_DIR/app"
cp -a "$HERE/node" "$INSTALL_DIR/node"
cp -a "$HERE/app" "$INSTALL_DIR/app"
chmod +x "$INSTALL_DIR/node/bin/node"
chown -R root:root "$INSTALL_DIR"

echo "==> Dossier de données $DATA_DIR (jamais supprimé à la désinstallation)"
mkdir -p "$DATA_DIR"
chown -R "$SERVICE_NAME:$SERVICE_NAME" "$DATA_ROOT"
chmod 750 "$DATA_ROOT"

echo "==> Configuration ($ENV_DIR/notescam.env)"
mkdir -p "$ENV_DIR"
if [[ ! -f "$ENV_DIR/notescam.env" ]]; then
  cat > "$ENV_DIR/notescam.env" <<EOF
PORT=$PORT
HOST=0.0.0.0
NOTESCAM_DATA_DIR=$DATA_DIR
EOF
else
  echo "  ($ENV_DIR/notescam.env existe déjà — conservé tel quel)"
fi
chmod 640 "$ENV_DIR/notescam.env"
chown root:"$SERVICE_NAME" "$ENV_DIR/notescam.env"
PORT="$(grep -Po '^PORT=\K.*' "$ENV_DIR/notescam.env" 2>/dev/null || echo "$PORT")"

echo "==> Service systemd"
cp "$HERE/notescam.service" /etc/systemd/system/notescam.service
systemctl daemon-reload
systemctl enable --now "$SERVICE_NAME"

echo "==> Pare-feu"
if command -v ufw >/dev/null 2>&1 && ufw status | grep -qi "Status: active"; then
  ufw allow "${PORT}/tcp" comment "NotesCam LAN" || true
  echo "  Règle ufw ajoutée (TCP $PORT entrant)."
else
  echo "  ufw inactif ou absent — ouvrir le port $PORT manuellement si un pare-feu est utilisé."
fi

sleep 1
if systemctl is-active --quiet "$SERVICE_NAME"; then
  IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
  echo
  echo "[OK] NotesCam démarré et actif au boot."
  echo "  Local  : http://localhost:$PORT"
  [[ -n "${IP:-}" ]] && echo "  Réseau : http://$IP:$PORT"
  echo "  Logs   : journalctl -u $SERVICE_NAME -f"
else
  echo "[ERREUR] Le service ne démarre pas. Diagnostic : journalctl -u $SERVICE_NAME -e" >&2
  exit 1
fi
