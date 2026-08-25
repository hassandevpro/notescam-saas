#!/usr/bin/env bash
# Déploiement du correctif « pont d'identifiants Cloud → Local » sur le serveur
# LAN d'une école DÉJÀ APPAIRÉE (cas THE GENIUS).
#
# Ce que ce script NE fait PAS, par construction :
#   • il ne supprime aucune base       (install.sh conserve /var/lib/notescam/data)
#   • il ne refait aucun appairage     (le jeton et migration_state sont intacts)
#   • il ne change aucun school_id     (rien n'est écrit dans la base)
#   • il ne crée aucun compte en SQL   (les comptes arrivent par le canal chiffré)
#
# Il installe la nouvelle version, redémarre le service, puis VÉRIFIE et affiche
# un verdict. À lancer en root, depuis le dossier contenant l'archive :
#
#   sudo ./deploy-correctif-credentials.sh notescam-linux-x64-0.2.0.tar.gz
#
set -uo pipefail

ARCHIVE="${1:-}"
PORT="${PORT:-8080}"
BASE="http://127.0.0.1:$PORT"
DATA=/var/lib/notescam/data

rouge() { printf '\033[31m%s\033[0m\n' "$*"; }
vert()  { printf '\033[32m%s\033[0m\n' "$*"; }
titre() { printf '\n=== %s ===\n' "$*"; }

ko=0
verifie() { # verifie "libellé" "valeur obtenue" "valeur attendue"
  if [[ "$2" == "$3" ]]; then vert "  PASS  $1 ($2)"; else rouge "  FAIL  $1 — obtenu: '$2', attendu: '$3'"; ko=$((ko+1)); fi
}

[[ $EUID -eq 0 ]] || { rouge "À lancer en root : sudo $0 <archive.tar.gz>"; exit 1; }
[[ -f "$ARCHIVE" ]] || { rouge "Archive introuvable : $ARCHIVE"; exit 1; }

titre "0. État AVANT (pour comparaison)"
AVANT_SCHOOL="$(curl -fsS --max-time 5 "$BASE/api/pair/status" 2>/dev/null | grep -o '"schoolId":"[^"]*"' | cut -d'"' -f4)"
echo "  school_id actuel : ${AVANT_SCHOOL:-<serveur arrêté ou non appairé>}"
echo "  base            : $(stat -c%s "$DATA/notescam.db" 2>/dev/null || echo absente) octets"
echo "  jeton d'école   : $([[ -f "$DATA/server-token.key" ]] && echo présent || echo ABSENT)"
cp -a "$DATA/notescam.db" "$DATA/notescam.db.avant-correctif-$(date +%Y%m%d%H%M%S)" 2>/dev/null \
  && echo "  copie de sûreté de la base : faite"

titre "1. Installation (les données sont conservées)"
TMP="$(mktemp -d)"
tar xzf "$ARCHIVE" -C "$TMP" || { rouge "Archive illisible"; exit 1; }
DOSSIER="$(find "$TMP" -maxdepth 1 -type d -name 'notescam-linux-x64*' | head -1)"
[[ -d "$DOSSIER" ]] || { rouge "Contenu d'archive inattendu"; exit 1; }

# Une archive construite sous Windows (core.autocrlf=true) contient des .sh en
# CRLF : le shebang devient «bash\r» et Linux refuse de les exécuter, avec
#   /usr/bin/env: «bash\r»: Aucun fichier ou dossier de ce type
# On normalise systématiquement — ainsi une archive déjà téléchargée reste
# utilisable, sans avoir à la retélécharger.
n=0
while IFS= read -r -d '' f; do
  if grep -qU $'\r' "$f" 2>/dev/null; then sed -i 's/\r$//' "$f"; n=$((n+1)); fi
done < <(find "$DOSSIER" -maxdepth 2 -name '*.sh' -type f -print0)
[[ $n -gt 0 ]] && echo "  (${n} script(s) de l'archive normalisé(s) CRLF -> LF)"
chmod +x "$DOSSIER"/*.sh 2>/dev/null

( cd "$DOSSIER" && ./install.sh "$PORT" ) || { rouge "install.sh a échoué"; exit 1; }
rm -rf "$TMP"

titre "2. Le correctif est-il bien en place ?"
grep -q "syncCloudCredentials" /opt/notescam/app/server/authBridge.js \
  && vert "  PASS  authBridge.js contient syncCloudCredentials" \
  || { rouge "  FAIL  authBridge.js : correctif ABSENT"; ko=$((ko+1)); }
grep -q "credentialTick" /opt/notescam/app/server/index.js \
  && vert "  PASS  index.js branche le tirage des credentials" \
  || { rouge "  FAIL  index.js : branchement ABSENT"; ko=$((ko+1)); }

titre "3. Service"
systemctl restart notescam
for _ in $(seq 1 40); do curl -fsS --max-time 2 "$BASE/api/license" >/dev/null 2>&1 && break; sleep 1; done
verifie "service actif" "$(systemctl is-active notescam)" "active"

titre "4. Rattachement PRÉSERVÉ (aucun ré-appairage)"
APRES="$(curl -fsS --max-time 5 "$BASE/api/pair/status")"
APRES_SCHOOL="$(echo "$APRES" | grep -o '"schoolId":"[^"]*"' | cut -d'"' -f4)"
echo "  /api/pair/status : $APRES"
if [[ -n "$AVANT_SCHOOL" ]]; then
  verifie "school_id inchangé" "$APRES_SCHOOL" "$AVANT_SCHOOL"
else
  echo "  school_id après installation : ${APRES_SCHOOL:-<vide>}"
fi
verifie "jeton d'école toujours présent" "$([[ -f "$DATA/server-token.key" ]] && echo oui || echo non)" "oui"

titre "5. Canal de credentials (60 s d'observation)"
sleep 60
ERREURS_401="$(journalctl -u notescam --since '-2 min' --no-pager 2>/dev/null | grep -c 'credentials-pull: HTTP 401')"
BAD_TOKEN="$(journalctl -u notescam --since '-2 min' --no-pager 2>/dev/null | grep -c 'bad_token')"
verifie "credentials-pull HTTP 401" "$ERREURS_401" "0"
verifie "bad_token" "$BAD_TOKEN" "0"
journalctl -u notescam --since '-2 min' --no-pager 2>/dev/null | grep -E '\[credentials\]|\[sync\]' | tail -5

titre "VERDICT"
if [[ $ko -eq 0 ]]; then
  vert "Toutes les vérifications locales sont PASS."
  echo
  echo "Étape suivante, à faire confirmer par l'éditeur : la clé publique de"
  echo "l'école doit maintenant apparaître dans school_credential_keys côté cloud."
  echo "C'est le signal que le canal Cloud → Local est ouvert."
else
  rouge "$ko vérification(s) en échec — ne pas réinitialiser les mots de passe."
  echo "Envoyer à l'éditeur : journalctl -u notescam --since '-10 min' --no-pager | tail -50"
fi
exit $ko
