#!/usr/bin/env bash
# Déploiement de la 0.3.17 sur le serveur LAN d'une école déjà appairée.
#
# POURQUOI UN SCRIPT ET PAS install.sh TOUT SEUL
# ──────────────────────────────────────────────
# `install.sh` remplace l'application et conserve /var/lib/notescam/data, mais il
# NE SAUVEGARDE PAS la base. Ici le service est arrêté AVANT la copie, la copie
# est consolidée (VACUUM INTO) et elle est VÉRIFIÉE. Une sauvegarde non vérifiée
# n'est pas une sauvegarde.
#
# CE QUE LA 0.3.17 CHANGE, ET CE QUE ÇA IMPLIQUE POUR CE SCRIPT
# ──────────────────────────────────────────────────────────────
# Elle ne touche NI au schéma, NI au serveur : tout est dans l'interface
# (échange de fichiers en Excel partout, et le classeur des bulletins du second
# cycle). Aucune table, aucune colonne, aucune RPC n'est ajoutée. Les contrôles
# « contenu » portent donc sur le `dist/` livré — les libellés d'une interface
# minifiée survivent à la minification, les noms de fonctions non.
#
# Les contrôles de la 0.3.16 sont CONSERVÉS tels quels : ils ne vérifient pas une
# nouveauté, ils gardent fermé ce qui a déjà coûté une intervention (profil,
# référentiel, masques, `source_balance_raw` qui doit rester absente).
#
# Ce script ne fait RIEN d'autre que ce qui est écrit ci-dessous :
#   • il ne supprime aucune base, ne réinitialise aucune file de synchronisation ;
#   • il ne refait aucun appairage, ne change aucun school_id ;
#   • il n'écrit aucune donnée métier, ni en LAN ni au Cloud ;
#   • il ne lance aucune synchronisation forcée.
#
# CRITÈRES D'ARRÊT. Le script s'arrête de lui-même, AVANT de toucher à
# l'application, si la sauvegarde n'est pas vérifiable. Après l'installation, il
# compare et rend un code de sortie non nul au moindre écart : le code ≠ 0 est le
# signal d'appeler l'éditeur, PAS de tenter une réparation.
#
# Usage, en root, depuis le dossier contenant l'archive :
#   sudo ./deploy-0.3.17.sh notescam-linux-x64-0.3.17.tar.gz
#
set -uo pipefail

ARCHIVE="${1:-}"
PORT="${PORT:-8080}"
BASE="http://127.0.0.1:$PORT"
DATA=/var/lib/notescam/data
DB="$DATA/notescam.db"
NODE=/opt/notescam/node/bin/node
VERSION=0.3.17

rouge() { printf '\033[31m%s\033[0m\n' "$*"; }
vert()  { printf '\033[32m%s\033[0m\n' "$*"; }
jaune() { printf '\033[33m%s\033[0m\n' "$*"; }
titre() { printf '\n=== %s ===\n' "$*"; }

ko=0
verifie() { # verifie "libellé" "obtenu" "attendu"
  if [[ "$2" == "$3" ]]; then vert "  PASS  $1 ($2)"
  else rouge "  FAIL  $1 — obtenu: '$2', attendu: '$3'"; ko=$((ko+1)); fi
}

[[ $EUID -eq 0 ]] || { rouge "À lancer en root : sudo $0 <archive.tar.gz>"; exit 1; }
[[ -f "$ARCHIVE" ]] || { rouge "Archive introuvable : $ARCHIVE"; exit 1; }
[[ -f "$DB" ]]      || { rouge "Base introuvable : $DB — ce script met à JOUR une installation existante."; exit 1; }

# Interroge la base SANS dépendre du paquet sqlite3 (souvent absent d'un serveur
# d'école). Le node embarqué sait le faire : `node:sqlite` est dans le runtime.
#
# ATTENTION AUX INDICES. Avec `node -e`, il n'y a PAS de chemin de script dans
# process.argv : le premier argument est argv[1]. Avec `node script.js`, c'est
# argv[2].
#
# Le JS passe par un heredoc : il contient des apostrophes, qui fermeraient
# prématurément une chaîne entre quotes simples dans le shell.
JS_LIRE="$(cat <<'JS'
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(process.argv[1], { readOnly: true });
for (const r of db.prepare(process.argv[2]).all()) console.log(Object.values(r).join('|'));
JS
)"
JS_COPIER="$(cat <<'JS'
// VACUUM INTO : copie COHÉRENTE d'une base en mode WAL, sans toucher la source.
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(process.argv[1], { readOnly: true });
db.exec("VACUUM INTO '" + process.argv[2].replace(/'/g, "''") + "'");
JS
)"
sqf() { "$NODE" -e "$JS_LIRE" "$1" "$2" 2>/dev/null; }

COMPTAGES="SELECT (SELECT COUNT(*) FROM students) || '|' ||
                  (SELECT COUNT(*) FROM grades) || '|' ||
                  (SELECT COUNT(*) FROM fee_payments) || '|' ||
                  (SELECT COUNT(*) FROM budget_expenses) || '|' ||
                  (SELECT COUNT(*) FROM sync_outbox) AS c"

titre "0. État AVANT"
VER_AVANT="$(curl -fsS --max-time 5 "$BASE/api/version" 2>/dev/null || echo '<serveur arrêté>')"
SCHOOL_AVANT="$(curl -fsS --max-time 5 "$BASE/api/pair/status" 2>/dev/null | grep -o '"schoolId":"[^"]*"' | cut -d'"' -f4)"
echo "  version       : $VER_AVANT"
echo "  school_id     : ${SCHOOL_AVANT:-<non lu>}"
echo "  jeton d'école : $([[ -f "$DATA/server-token.key" ]] && echo présent || echo ABSENT)"

titre "1. Arrêt du service (avant la copie : une copie à chaud peut être déchirée)"
systemctl stop notescam
sleep 2
echo "  service : $(systemctl is-active notescam)"

titre "2. Sauvegarde VÉRIFIABLE de la base"
AVANT="$(sqf "$DB" "$COMPTAGES")"
echo "  eleves|notes|versements|depenses|file = $AVANT"
HORO="$(date +%Y%m%d%H%M%S)"
COPIE="$DATA/notescam.db.avant-$VERSION-$HORO"
"$NODE" -e "$JS_COPIER" "$DB" "$COPIE" \
  || { rouge "  La copie a échoué — RIEN n'a été modifié."; systemctl start notescam; exit 1; }
chown notescam:notescam "$COPIE" 2>/dev/null
echo "  copie : $COPIE ($(stat -c%s "$COPIE") octets)"

INTEG="$(sqf "$COPIE" "PRAGMA integrity_check")"
COPIE_CPT="$(sqf "$COPIE" "$COMPTAGES")"
verifie "integrity_check de la copie" "$INTEG" "ok"
verifie "comptages identiques dans la copie" "$COPIE_CPT" "$AVANT"
if [[ $ko -ne 0 ]]; then
  rouge "SAUVEGARDE NON VÉRIFIÉE — on s'arrête ici. L'application n'a PAS été touchée."
  systemctl start notescam
  exit 2
fi
vert "  Sauvegarde vérifiée. On peut installer."

titre "3. Installation"
TMP="$(mktemp -d)"
tar xzf "$ARCHIVE" -C "$TMP" || { rouge "Archive illisible"; systemctl start notescam; rm -rf "$TMP"; exit 1; }
DOSSIER="$(find "$TMP" -maxdepth 1 -type d -name 'notescam-linux-x64*' | head -1)"
[[ -d "$DOSSIER" ]] || { rouge "Contenu d'archive inattendu"; systemctl start notescam; rm -rf "$TMP"; exit 1; }
# Archive construite sous Windows : les .sh peuvent être en CRLF, et Linux refuse
# alors le shebang (« /usr/bin/env: 'bash\r' »). On normalise.
n=0
while IFS= read -r -d '' f; do
  if grep -qU $'\r' "$f" 2>/dev/null; then sed -i 's/\r$//' "$f"; n=$((n+1)); fi
done < <(find "$DOSSIER" -maxdepth 2 -name '*.sh' -type f -print0)
[[ $n -gt 0 ]] && echo "  (${n} script(s) normalisé(s) CRLF -> LF)"
chmod +x "$DOSSIER"/*.sh 2>/dev/null
( cd "$DOSSIER" && ./install.sh "$PORT" ) || { rouge "install.sh a échoué"; rm -rf "$TMP"; exit 1; }
rm -rf "$TMP"

titre "4. Ce que la 0.3.17 apporte est-il en place ?"
# L'interface est MINIFIÉE : les noms de fonctions n'y survivent pas, les
# LIBELLÉS si. Chaque contrôle vise donc un libellé que seul le code neuf écrit,
# et choisi SANS ACCENT pour ne dépendre d'aucun réglage de locale du serveur.
DIST=/opt/notescam/app/dist/assets
grep -rqs "Exporter Excel" "$DIST" \
  && vert "  PASS  les exports s'annoncent en Excel" \
  || { rouge "  FAIL  dist : « Exporter Excel » introuvable — interface périmée"; ko=$((ko+1)); }
grep -rqs "seuls les classeurs Excel" "$DIST" \
  && vert "  PASS  l'import refuse ce qui n'est pas un classeur, avec son message" \
  || { rouge "  FAIL  dist : le refus « classeur Excel » est ABSENT"; ko=$((ko+1)); }
grep -rqs "Feuilles vues" "$DIST" \
  && vert "  PASS  bulletins du second cycle : l'import du classeur est livré" \
  || { rouge "  FAIL  dist : l'import des bulletins du second cycle est ABSENT"; ko=$((ko+1)); }
# Le dist livré doit être celui de CETTE construction : sinon l'école garderait
# l'ancienne interface par-dessus le nouveau serveur.
grep -q '"edition"[[:space:]]*:[[:space:]]*"lan"' /opt/notescam/app/dist/edition.json 2>/dev/null \
  && vert "  PASS  interface : build LAN estampillé ($(grep -o '"built_at"[^,}]*' /opt/notescam/app/dist/edition.json))" \
  || { rouge "  FAIL  dist/edition.json absent ou non-LAN — interface douteuse"; ko=$((ko+1)); }

titre "4 bis. Ce que la 0.3.16 avait débloqué est toujours là"
# Ces contrôles ne vérifient pas une nouveauté : ils gardent fermé ce qui a déjà
# coûté une intervention sur site. Un paquet qui les perd est un paquet périmé.
grep -q "'cash_movements'" /opt/notescam/app/server/syncVerify.js \
  && vert "  PASS  syncVerify.js compare la caisse" \
  || { rouge "  FAIL  syncVerify.js : cash_movements ABSENTE"; ko=$((ko+1)); }
grep -q "'signalements'" /opt/notescam/app/server/syncVerify.js \
  && vert "  PASS  syncVerify.js compare les signalements" \
  || { rouge "  FAIL  syncVerify.js : signalements ABSENTE"; ko=$((ko+1)); }
grep -q "rejected" /opt/notescam/app/server/cloudSync.js \
  && vert "  PASS  cloudSync.js conserve les lignes refusées par le Cloud" \
  || { rouge "  FAIL  cloudSync.js : le mécanisme de refus est ABSENT"; ko=$((ko+1)); }
grep -q "TOMB_CHUNK" /opt/notescam/app/server/syncRepair.js \
  && vert "  PASS  syncRepair.js découpe les lots de tombstones" \
  || { rouge "  FAIL  syncRepair.js : découpage ABSENT"; ko=$((ko+1)); }
grep -q "update_my_profile" /opt/notescam/app/server/rpc.js \
  && vert "  PASS  écran « Mon profil » : les RPC sont présentes" \
  || { rouge "  FAIL  rpc.js : update_my_profile ABSENTE — le profil restera non modifiable"; ko=$((ko+1)); }
grep -q "guardReferentielNational" /opt/notescam/app/server/query.js \
  && vert "  PASS  référentiel : le national est protégé, le reste est ouvert" \
  || { rouge "  FAIL  query.js : guardReferentielNational ABSENTE"; ko=$((ko+1)); }
grep -q "prim_competences_masques" /opt/notescam/app/server/db.js \
  && vert "  PASS  « Modifier les compétences » : les tables de masques sont posées" \
  || { rouge "  FAIL  db.js : les tables de masques du référentiel sont ABSENTES"; ko=$((ko+1)); }
# La colonne de balance brute doit RESTER ABSENTE tant que la migration Cloud
# n'est pas passée : une colonne que le Cloud ignore fait refuser la poussée.
# Le motif vise une ligne ACTIVE, ancrée en début de ligne : db.js garde en
# commentaire les deux appels à rétablir le jour où la migration passera.
if grep -qE "^ensureColumn\('(budget_expenses|cash_movements)', *'source_balance_raw'" /opt/notescam/app/server/db.js; then
  rouge "  FAIL  db.js poserait source_balance_raw — paquet périmé, NE PAS l'utiliser"; ko=$((ko+1))
else
  vert "  PASS  source_balance_raw n'est pas posée (migration Cloud en attente)"
fi

titre "5. Service et base APRÈS"
for _ in $(seq 1 40); do curl -fsS --max-time 2 "$BASE/" >/dev/null 2>&1 && break; sleep 1; done
verifie "service actif" "$(systemctl is-active notescam)" "active"
verifie "page d'accueil" "$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$BASE/")" "200"
VER_APRES="$(curl -fsS --max-time 5 "$BASE/api/version" 2>/dev/null)"
echo "  /api/version : $VER_APRES"
# Le numéro cherché vient de $VERSION. Dans deploy-0.3.16.sh ce motif était écrit
# en dur et cherchait « 0.3.15 » sous un message annonçant 0.3.16 : le contrôle
# passait au vert sur une installation RESTÉE en arrière. Une seule source
# désormais, et le message la cite.
if echo "$VER_APRES" | grep -q "${VERSION//./\\.}"; then
  vert "  PASS  version $VERSION annoncée"
else
  rouge "  FAIL  la version annoncée n'est pas $VERSION"; ko=$((ko+1))
fi

APRES="$(sqf "$DB" "$COMPTAGES")"
echo "  eleves|notes|versements|depenses|file = $APRES"
# La FILE peut légitimement varier (elle se vide ou s'alimente). Les quatre
# premiers comptages, eux, ne doivent pas DIMINUER : une mise à jour n'efface
# aucune donnée.
for i in 1 2 3 4; do
  a="$(echo "$AVANT" | cut -d'|' -f$i)"; b="$(echo "$APRES" | cut -d'|' -f$i)"
  nom="$(echo "eleves notes versements depenses" | cut -d' ' -f$i)"
  if [[ "$b" -lt "$a" ]]; then rouge "  FAIL  $nom : $a -> $b (DIMINUTION)"; ko=$((ko+1));
  else vert "  PASS  $nom : $a -> $b"; fi
done
verifie "integrity_check de la base vive" "$(sqf "$DB" "PRAGMA integrity_check")" "ok"
verifie "jeton d'école toujours présent" "$([[ -f "$DATA/server-token.key" ]] && echo oui || echo non)" "oui"
SCHOOL_APRES="$(curl -fsS --max-time 5 "$BASE/api/pair/status" 2>/dev/null | grep -o '"schoolId":"[^"]*"' | cut -d'"' -f4)"
if [[ -n "$SCHOOL_AVANT" ]]; then verifie "school_id inchangé" "$SCHOOL_APRES" "$SCHOOL_AVANT"
else echo "  school_id après installation : ${SCHOOL_APRES:-<vide>}"; fi

titre "VERDICT"
if [[ $ko -eq 0 ]]; then
  vert "Toutes les vérifications locales sont PASS."
  echo
  echo "Cette version ne touche ni au schéma ni au serveur : elle n'ajoute aucune"
  echo "colonne, donc le curseur de synchronisation n'est PAS remis à zéro et il"
  echo "n'y a pas de long rattrapage à attendre, contrairement à la 0.3.16."
  echo
  echo "À vérifier depuis un poste de l'école, après un Ctrl+Shift+R :"
  echo "  · Bulletins -> une classe de 2nde/1ère/Tle -> format « 2nd cycle officiel » :"
  echo "    deux boutons « Exporter Excel » et « Importer Excel » apparaissent."
  echo "  · Exportez : le classeur contient un « Récapitulatif » et une feuille par"
  echo "    séquence de la période affichée."
  echo "  · Réimportez ce même classeur sans l'avoir modifié : l'aperçu doit annoncer"
  echo "    0 note à enregistrer. C'est la preuve que l'aller-retour est fidèle."
  exit 0
else
  rouge "$ko contrôle(s) en échec."
  echo "N'essayez RIEN d'autre : envoyez cette sortie complète à l'éditeur."
  echo "La sauvegarde vérifiée est dans : $COPIE"
  exit 3
fi
