#!/usr/bin/env bash
# =============================================================================
# NotesCam LAN — diagnostic « ça ne fonctionne pas sans connexion »
# À lancer SUR LE SERVEUR LINUX DE L'ÉCOLE, de préférence Internet débranché.
#
# LECTURE SEULE : aucune écriture, aucun redémarrage de service, aucune donnée
# modifiée. Rejouable autant de fois que voulu.
#
# Pourquoi ce script : l'édition LAN n'a, dans son code, AUCUNE dépendance
# Internet sur les chemins critiques (connexion, lecture, écriture). Quand une
# école rapporte « sans connexion, rien ne marche », la cause est presque
# toujours l'une de CINQ, qu'aucun message d'erreur ne distingue à l'écran :
#
#   1. `dist/` est un build CLOUD -> la page parle à Supabase, pas au serveur
#      de l'école. Sans Internet : « ça refuse d'enregistrer ».
#   2. La base locale n'a aucun compte -> « Email ou mot de passe incorrect ».
#      Les comptes créés dans le Cloud n'arrivent au serveur qu'une fois le
#      pont d'identifiants passé, ce qui exige Internet AU MOINS UNE FOIS.
#   3. Le service ne tourne pas / n'écoute pas sur 0.0.0.0.
#   4. Les postes tapent `localhost` au lieu de l'IP du serveur.
#   5. Le verrou de licence attend une clé (l'activation elle-même est
#      hors-ligne, mais sans clé l'écran reste bloquant).
#
# Usage :
#     sudo bash diagnostic-hors-ligne.sh
#     sudo bash diagnostic-hors-ligne.sh --port 8080
# =============================================================================

INSTALL_DIR=/opt/notescam
APP_DIR="$INSTALL_DIR/app"
NODE_BIN="$INSTALL_DIR/node/bin/node"
DATA_DIR=/var/lib/notescam/data
DB="$DATA_DIR/notescam.db"
ENV_FILE=/etc/notescam/notescam.env
SERVICE=notescam

PORT=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --port) PORT="$2"; shift 2 ;;
    *) echo "Option inconnue : $1" >&2; exit 2 ;;
  esac
done

C_OK=$'\033[32m'; C_KO=$'\033[31m'; C_WARN=$'\033[33m'; C_T=$'\033[36m'; C_0=$'\033[0m'
[[ -t 1 ]] || { C_OK=""; C_KO=""; C_WARN=""; C_T=""; C_0=""; }

PROBLEMS=()
title() { printf '\n%s=== %s ===%s\n' "$C_T" "$1" "$C_0"; }
ok()    { printf '%s[OK]%s   %s\n'   "$C_OK" "$C_0" "$1"; }
ko()    { printf '%s[KO]%s   %s\n'   "$C_KO" "$C_0" "$1"; PROBLEMS+=("$2"); }
warn()  { printf '%s[!]%s    %s\n'   "$C_WARN" "$C_0" "$1"; }
info()  { printf '         %s\n' "$1"; }

printf '%s' "$C_T"
cat <<'BANNER'
+---------------------------------------------------------------+
|  NotesCam LAN — diagnostic hors ligne                         |
|  Lecture seule. Rien n'est modifie.                           |
+---------------------------------------------------------------+
BANNER
printf '%s' "$C_0"

if [[ "$(id -u)" -ne 0 ]]; then
  warn "Lancé sans sudo : la base et le journal ne seront pas lisibles."
  warn "Relance avec :  sudo bash $0"
fi

# --- 0. Version installée ----------------------------------------------------
title "Version installée"
if [[ -f "$APP_DIR/package.json" ]]; then
  VER="$(grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' "$APP_DIR/package.json" | head -1 | sed 's/.*"\([^"]*\)"$/\1/')"
  ok "NotesCam ${VER:-inconnue}  ($APP_DIR)"
  # Le garde-fou d'édition du dist n'existe que depuis le 2026-10-01. Son
  # absence veut dire que le serveur sert `dist/` SANS vérifier comment il a
  # été compilé : c'est la cause n°1, et elle passe alors inaperçue.
  if [[ -f "$APP_DIR/server/distEdition.js" ]]; then
    ok "Garde-fou d'édition du dist présent (server/distEdition.js)."
  else
    ko "Garde-fou d'édition ABSENT : cette version sert dist/ sans le vérifier." \
       "Version antérieure au garde-fou d'édition : mets à jour vers le dernier paquet."
  fi
else
  ko "Aucune installation trouvée dans $APP_DIR." \
     "NotesCam ne semble pas installé dans $INSTALL_DIR."
fi

# --- 1. Édition du dist servi — LA cause n°1 ---------------------------------
title "Édition du dist servi (cloud vs LAN)"
if [[ -d "$APP_DIR/dist" ]]; then
  EDITION="unknown"
  if [[ -f "$APP_DIR/dist/edition.json" ]]; then
    grep -q '"edition"[[:space:]]*:[[:space:]]*"lan"'   "$APP_DIR/dist/edition.json" && EDITION="lan"
    grep -q '"edition"[[:space:]]*:[[:space:]]*"cloud"' "$APP_DIR/dist/edition.json" && EDITION="cloud"
  elif ls "$APP_DIR"/dist/assets/vendor-supabase-*.js >/dev/null 2>&1; then
    # Ce morceau n'est émis QUE par le build cloud.
    EDITION="cloud"
  fi
  case "$EDITION" in
    lan)   ok "dist/ est un build LAN (estampille edition.json). C'est le bon." ;;
    cloud) ko "dist/ est un build CLOUD : la page écrit dans Supabase, PAS dans la base de l'école." \
              "CAUSE PROBABLE TROUVÉE : dist/ est un build cloud. Réinstalle le paquet Linux officiel (il embarque un build LAN)." ;;
    *)     warn "dist/ sans estampille d'édition (build antérieur)."
           if ls "$APP_DIR"/dist/assets/vendor-supabase-*.js >/dev/null 2>&1; then
             ko "Un chunk vendor-supabase-*.js est présent : c'est la signature d'un build CLOUD." \
                "dist/ ressemble à un build cloud. Réinstalle le paquet Linux officiel."
           else
             ok "Aucun chunk vendor-supabase-*.js : cohérent avec un build LAN."
           fi ;;
  esac
else
  ko "$APP_DIR/dist est absent : aucune interface à servir." \
     "dist/ absent : l'archive d'installation était incomplète."
fi

# --- 2. Service -------------------------------------------------------------
title "Service systemd '$SERVICE'"
if command -v systemctl >/dev/null 2>&1; then
  ACT="$(systemctl is-active "$SERVICE" 2>/dev/null)"
  ENA="$(systemctl is-enabled "$SERVICE" 2>/dev/null)"
  [[ "$ACT" == "active" ]] \
    && ok "Service actif." \
    || ko "Service NON actif (état : ${ACT:-inconnu})." \
          "Service arrêté : 'sudo systemctl start $SERVICE', puis 'journalctl -u $SERVICE -e'."
  [[ "$ENA" == "enabled" ]] \
    && ok "Démarrage automatique au boot : activé." \
    || warn "Démarrage au boot NON activé (sudo systemctl enable $SERVICE)."
else
  warn "systemctl indisponible : service non vérifiable."
fi

# --- 3. Port d'écoute -------------------------------------------------------
title "Port d'écoute"
if [[ -z "$PORT" && -r "$ENV_FILE" ]]; then
  PORT="$(sed -n 's/^PORT=\([0-9]\+\).*/\1/p' "$ENV_FILE" | head -1)"
fi
PORT="${PORT:-8080}"
info "Port retenu : $PORT  (source : ${ENV_FILE})"
if command -v ss >/dev/null 2>&1; then
  LISTEN="$(ss -ltn 2>/dev/null | awk -v p=":$PORT\$" '$4 ~ p {print $4}')"
  if [[ -z "$LISTEN" ]]; then
    ko "Rien n'écoute sur le port $PORT." \
       "Aucune écoute sur $PORT : le serveur n'a pas démarré (voir journalctl)."
  elif grep -qE '^(0\.0\.0\.0|\*|\[::\]):' <<<"$LISTEN"; then
    ok "Écoute sur $LISTEN — accessible depuis tout le réseau."
  else
    ko "Écoute sur $LISTEN seulement, pas sur 0.0.0.0." \
       "HOST n'est pas 0.0.0.0 dans $ENV_FILE : les autres postes ne peuvent pas joindre le serveur."
  fi
else
  warn "'ss' indisponible : écoute non vérifiable."
fi

# --- 4. Réponse HTTP, en local puis sur le réseau ---------------------------
title "Réponse du serveur (sans Internet)"
http_code() { curl -s -o /dev/null -w '%{http_code}' --max-time 8 "$1" 2>/dev/null; }
if command -v curl >/dev/null 2>&1; then
  CODE="$(http_code "http://127.0.0.1:$PORT/")"
  [[ "$CODE" == "200" ]] \
    && ok "http://127.0.0.1:$PORT/ -> HTTP 200 (le serveur fonctionne hors ligne)." \
    || ko "http://127.0.0.1:$PORT/ -> HTTP ${CODE:-aucune réponse}." \
          "Le serveur ne répond pas en local : le problème est côté service, pas côté réseau."
else
  warn "'curl' indisponible : réponse HTTP non testée."
fi

# --- 5. Comptes dans la base locale — LA cause n°2 --------------------------
title "Comptes de connexion dans la base locale"
if [[ ! -r "$DB" ]]; then
  warn "Base illisible ($DB). Relance avec sudo."
elif [[ ! -x "$NODE_BIN" ]]; then
  warn "Node embarqué introuvable ($NODE_BIN) : comptes non vérifiables."
else
  USERS_OUT="$("$NODE_BIN" -e '
    const { DatabaseSync } = require("node:sqlite");
    try {
      const db = new DatabaseSync(process.argv[1], { readOnly: true });
      const rows = db.prepare("SELECT email, password_hash AS h FROM users").all();
      const vrais = rows.filter(r => !/@test\.local$/i.test(r.email || ""));
      const sansHash = rows.filter(r => !r.h);
      console.log(JSON.stringify({ total: rows.length, vrais: vrais.length, sansHash: sansHash.length,
                                   exemples: vrais.slice(0, 5).map(r => r.email) }));
    } catch (e) { console.log(JSON.stringify({ erreur: e.message })); }
  ' "$DB" 2>/dev/null)"
  TOTAL="$(sed -n 's/.*"total":\([0-9]*\).*/\1/p' <<<"$USERS_OUT")"
  VRAIS="$(sed -n 's/.*"vrais":\([0-9]*\).*/\1/p' <<<"$USERS_OUT")"
  SANSH="$(sed -n 's/.*"sansHash":\([0-9]*\).*/\1/p' <<<"$USERS_OUT")"
  if [[ -z "$TOTAL" ]]; then
    warn "Lecture de la table users impossible : $USERS_OUT"
  else
    info "Comptes locaux : $TOTAL au total, dont $VRAIS hors @test.local."
    if [[ "${VRAIS:-0}" -eq 0 ]]; then
      if [[ -f "$APP_DIR/server/reset-password-cli.mjs" ]]; then
        ko "AUCUN compte réel dans la base locale (seuls des comptes de test, ou rien)." \
           "CAUSE PROBABLE TROUVÉE : les comptes n'existent que dans le Cloud. Répare-les sur place, hors ligne : sudo $NODE_BIN $APP_DIR/server/reset-password-cli.mjs --liste --data-dir $DATA_DIR"
      else
        # L'outil n'est arrivé qu'avec les versions récentes. Inutile de
        # réinstaller pour dépanner un mot de passe : il tourne depuis une clé
        # USB avec --app-dir, qui emprunte db.js et security.js à CETTE
        # installation (un hash scrypt calculé par une autre version du code
        # verrouillerait l'école en silence).
        ko "AUCUN compte réel dans la base locale, et l'outil de réparation n'est pas installé." \
           "CAUSE PROBABLE TROUVÉE : les comptes n'existent que dans le Cloud. Demande à l'éditeur reset-password-cli.mjs + resetPassword.js (clé USB), puis : sudo $NODE_BIN /media/usb/reset-password-cli.mjs --liste --app-dir $APP_DIR/server --data-dir $DATA_DIR"
      fi
    else
      ok "$VRAIS compte(s) réel(s) présent(s) : la connexion hors ligne est possible."
      info "Exemples : $(sed -n 's/.*"exemples":\[\([^]]*\)\].*/\1/p' <<<"$USERS_OUT")"
    fi
    [[ "${SANSH:-0}" -gt 0 ]] && ko "$SANSH compte(s) sans mot de passe local." \
      "$SANSH compte(s) sans hash : leurs titulaires ne peuvent pas se connecter hors ligne."
  fi
fi

# --- 6. Verrou de licence ---------------------------------------------------
title "Verrou de licence (activation hors-ligne)"
if command -v curl >/dev/null 2>&1; then
  LIC="$(curl -s --max-time 8 "http://127.0.0.1:$PORT/api/license" 2>/dev/null)"
  if [[ -z "$LIC" ]]; then
    warn "/api/license muet — l'écran de licence passe alors en fail-open, non bloquant."
  elif grep -q '"licensing_enabled":false' <<<"$LIC"; then
    ok "Licence non exigée sur cette installation."
  elif grep -q '"activation":null' <<<"$LIC"; then
    ko "Licence EXIGÉE et NON activée : l'écran d'activation bloque l'application." \
       "CAUSE PROBABLE TROUVÉE : licence non activée. L'activation est hors-ligne : relève l'identifiant machine affiché à l'écran et demande une clé à l'éditeur."
  else
    ok "Licence activée."
  fi
fi

# --- 7. URL à taper sur les autres postes — cause n°4 -----------------------
title "URL à taper sur les autres postes"
IPS="$(ip -4 -o addr show scope global 2>/dev/null | awk '{print $2" "$4}' | sed 's#/[0-9]*##')"
# Repli pour une installation minimale sans iproute2.
if [[ -z "$IPS" ]] && command -v hostname >/dev/null 2>&1; then
  IPS="$(hostname -I 2>/dev/null | tr ' ' '\n' | grep -E '^[0-9]+\.' | sed 's/^/? /')"
fi
if [[ -n "$IPS" ]]; then
  while read -r IFACE ADDR; do
    [[ -z "$ADDR" ]] && continue
    [[ "$ADDR" == 169.254.* ]] && { info "$ADDR ($IFACE) — APIPA, inutilisable"; continue; }
    printf '         %shttp://%s:%s%s   (via %s)\n' "$C_OK" "$ADDR" "$PORT" "$C_0" "$IFACE"
  done <<<"$IPS"
  warn "Sur les postes, NE JAMAIS taper « localhost » : ce mot désigne le poste"
  warn "lui-même, pas le serveur. Seules les adresses ci-dessus fonctionnent."
else
  ko "Aucune adresse réseau globale sur ce serveur." \
     "Le serveur n'a pas d'adresse réseau : branche-le au réseau de l'école."
fi

# --- 8. Journal : des échecs réseau sont NORMAUX hors ligne -----------------
title "Journal du service (30 dernières minutes)"
if command -v journalctl >/dev/null 2>&1 && [[ "$(id -u)" -eq 0 ]]; then
  NETERR="$(journalctl -u "$SERVICE" --since '-30 min' --no-pager 2>/dev/null \
            | grep -ciE 'fetch failed|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|getaddrinfo')"
  FATAL="$(journalctl -u "$SERVICE" --since '-30 min' --no-pager 2>/dev/null \
            | grep -ciE 'Échec démarrage|FATAL|unhandledRejection|uncaughtException')"
  info "Échecs réseau sortants : ${NETERR:-0} (ATTENDUS hors ligne, sans conséquence :"
  info "la synchronisation est en fire-and-forget et sera rejouée plus tard)."
  if [[ "${FATAL:-0}" -gt 0 ]]; then
    ko "${FATAL} erreur(s) FATALE(S) dans le journal." \
       "Erreurs fatales au journal : envoie à l'éditeur 'journalctl -u $SERVICE --since \"-30 min\" --no-pager | tail -50'."
  else
    ok "Aucune erreur fatale au journal."
  fi
else
  warn "Journal non lisible (relance avec sudo)."
fi

# --- Verdict ----------------------------------------------------------------
title "VERDICT"
if [[ ${#PROBLEMS[@]} -eq 0 ]]; then
  printf '%sAucun problème détecté côté serveur : NotesCam fonctionne sans Internet.%s\n' "$C_OK" "$C_0"
  echo
  echo "Si une école dit malgré tout que « rien ne marche sans connexion », le"
  echo "problème est sur les POSTES, pas sur le serveur. Fais vérifier, sur un poste :"
  echo "  1. l'URL tapée : une des adresses http://… ci-dessus, JAMAIS localhost ;"
  echo "  2. que le poste est bien sur le même réseau que ce serveur ;"
  echo "  3. 'ping <IP-du-serveur>' depuis le poste."
else
  printf '%s%s point(s) à corriger :%s\n' "$C_WARN" "${#PROBLEMS[@]}" "$C_0"
  for p in "${PROBLEMS[@]}"; do printf '   - %s\n' "$p"; done
fi
echo
echo "Copie TOUT l'affichage ci-dessus et envoie-le à l'éditeur."
