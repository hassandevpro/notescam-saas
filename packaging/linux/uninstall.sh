#!/usr/bin/env bash
# Retire le service NotesCam LAN (systemd + règle ufw) et l'application
# (/opt/notescam). Les DONNÉES de l'école (/var/lib/notescam) ne sont JAMAIS
# supprimées, sauf --purge explicite avec confirmation.
#
#   sudo ./uninstall.sh            # garde les données
#   sudo ./uninstall.sh --purge    # propose d'effacer aussi les données
#
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "Ce script doit être lancé en root (sudo ./uninstall.sh)" >&2
  exit 1
fi

SERVICE_NAME=notescam
PURGE=0
[[ "${1:-}" == "--purge" ]] && PURGE=1

PORT="$(grep -Po '^PORT=\K.*' /etc/notescam/notescam.env 2>/dev/null || echo 8080)"

systemctl stop "$SERVICE_NAME" 2>/dev/null || true
systemctl disable "$SERVICE_NAME" 2>/dev/null || true
rm -f /etc/systemd/system/notescam.service
systemctl daemon-reload
echo "Service '$SERVICE_NAME' retiré."

if command -v ufw >/dev/null 2>&1; then
  ufw delete allow "${PORT}/tcp" 2>/dev/null || true
fi

rm -rf /opt/notescam
echo "Application retirée (/opt/notescam)."

if [[ $PURGE -eq 1 ]]; then
  read -r -p "Supprimer aussi les DONNÉES /var/lib/notescam et /etc/notescam ? [y/N] " ans
  if [[ "$ans" =~ ^[Yy]$ ]]; then
    rm -rf /var/lib/notescam /etc/notescam
    userdel "$SERVICE_NAME" 2>/dev/null || true
    echo "Données et utilisateur système supprimés."
  else
    echo "Annulé — données conservées."
  fi
else
  echo "Données conservées dans /var/lib/notescam (utiliser --purge pour tout effacer)."
fi
