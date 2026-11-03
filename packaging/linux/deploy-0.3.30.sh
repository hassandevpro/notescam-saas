#!/usr/bin/env bash
# =============================================================================
# NotesCam 0.3.30 — LA PAGE BUDGETS REFAITE, LE MOT DE PASSE ENSEIGNANT, ET
# LE CONTROLE DU BAREME DE FORM1 / FORM2.
#
#   sudo ./deploy-0.3.30.sh notescam-linux-x64-0.3.30.tar.gz
#
# A LANCER EN ROOT SUR LE SERVEUR UBUNTU DE L ECOLE.
# =============================================================================
#
# CE QUE CETTE VERSION CHANGE (par rapport a la 0.3.29)
#
#  1. PAGE BUDGETS. L ecran dit enfin ou en est le budget : Enveloppe, Reparti,
#     Active, Depensable maintenant. Un depassement de l enveloppe nomme les
#     lignes en cause. Les rubriques se replient, on cherche et on filtre les
#     lignes, on active toutes les lignes pretes en une seule fois (apercu,
#     puis confirmation). Les deux unites qui portent le meme nom se
#     distinguent par leur section.
#  2. DEPENSES. Une page sans ligne active dit pourquoi : pas de droit, version
#     en lecture seule, ou aucune ligne activee.
#  3. MOT DE PASSE ENSEIGNANT. L administrateur redefinit le mot de passe d un
#     enseignant qui l a perdu (Enseignants -> Mot de passe). Le serveur de
#     l ecole porte le handler correspondant : sans lui l ecran echouerait.
#  4. Animation de chargement commune ; montants affiches avec un separateur de
#     milliers lisible dans toutes les polices.
#  5. Bulletin de sequence : une seule page, nombre de moyennes exact.
#
# CE QUE CETTE VERSION NE CHANGE PAS : aucune migration de schema, aucune
# donnee. La base est sauvegardee et verifiee AVANT l installation, et ses
# comptages sont reverifies APRES.
#
# LE BAREME DE FORM1 ET FORM2. Ce script NE LE CORRIGE PAS tout seul : il
# l ecrirait en base de production sans que l administrateur l ait decide. Il le
# MESURE (simulation, rien n est ecrit) et affiche la commande a lancer ensuite :
#     sudo ./corriger-bareme-form.sh --appliquer
# ou, plus prudent, par l application : Classes -> FORM1 -> Modifier la classe
# -> bareme 20 (refuse si une sequence est verrouillee).
# =============================================================================

set -uo pipefail

ARCHIVE="${1:-}"
PORT="${PORT:-8080}"
BASE="http://127.0.0.1:$PORT"
DATA=/var/lib/notescam/data
DB="$DATA/notescam.db"
NODE=/opt/notescam/node/bin/node
VERSION=0.3.30
ICI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

rouge() { printf '\033[31m%s\033[0m\n' "$*"; }
vert()  { printf '\033[32m%s\033[0m\n' "$*"; }
jaune() { printf '\033[33m%s\033[0m\n' "$*"; }
titre() { printf '\n=== %s ===\n' "$*"; }

ko=0
verifie() { # verifie "libelle" "obtenu" "attendu"
  if [[ "$2" == "$3" ]]; then vert "  PASS  $1 ($2)"
  else rouge "  FAIL  $1 — obtenu: '$2', attendu: '$3'"; ko=$((ko+1)); fi
}
verifie_min() { # verifie_min "libelle" "obtenu" "minimum"
  if [[ -n "$2" && "$2" -ge "$3" ]] 2>/dev/null; then vert "  PASS  $1 ($2 >= $3)"
  else rouge "  FAIL  $1 — obtenu: '$2', attendu au moins: '$3'"; ko=$((ko+1)); fi
}

[[ $EUID -eq 0 ]] || { rouge "A lancer en root : sudo $0 <archive.tar.gz>"; exit 1; }
[[ -f "$ARCHIVE" ]] || { rouge "Archive introuvable : $ARCHIVE"; exit 1; }
[[ -f "$DB" ]] || { rouge "Base introuvable : $DB — ce script met a JOUR une installation existante."; exit 1; }

# Interroge la base SANS dependre du paquet sqlite3 (souvent absent d un serveur
# d ecole). Le node embarque sait le faire : `node:sqlite` est dans le runtime.
# ATTENTION AUX INDICES : avec `node -e`, le premier argument est argv[1].
JS_LIRE="$(cat <<'JS'
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(process.argv[1], { readOnly: true });
for (const r of db.prepare(process.argv[2]).all()) console.log(Object.values(r).join('|'));
JS
)"
JS_COPIER="$(cat <<'JS'
// VACUUM INTO : copie COHERENTE d une base en mode WAL, sans toucher la source.
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(process.argv[1], { readOnly: true });
db.exec("VACUUM INTO '" + process.argv[2].replace(/'/g, "''") + "'");
JS
)"
sqf() { "$NODE" -e "$JS_LIRE" "$1" "$2" 2>/dev/null; }

COMPTAGES="SELECT (SELECT COUNT(*) FROM students) || '|' ||
                  (SELECT COUNT(*) FROM grades) || '|' ||
                  (SELECT COUNT(*) FROM fee_payments) || '|' ||
                  (SELECT COUNT(*) FROM budget_chapters) || '|' ||
                  (SELECT COUNT(*) FROM budget_expenses)"

titre "1. Etat avant"
VER_AVANT="$(curl -fsS --max-time 5 "$BASE/api/version" 2>/dev/null || echo '<serveur arrete>')"
echo "  version servie : $VER_AVANT"
systemctl stop notescam 2>/dev/null
sleep 2
echo "  service : $(systemctl is-active notescam)"

titre "2. Sauvegarde VERIFIABLE de la base"
AVANT="$(sqf "$DB" "$COMPTAGES")"
echo "  eleves|notes|versements|lignes budget|depenses = $AVANT"
HORO="$(date +%Y%m%d%H%M%S)"
COPIE="$DATA/notescam.db.avant-$VERSION-$HORO"
"$NODE" -e "$JS_COPIER" "$DB" "$COPIE" \
  || { rouge "  La copie a echoue — RIEN n a ete modifie."; systemctl start notescam; exit 1; }
chown notescam:notescam "$COPIE" 2>/dev/null
echo "  copie : $COPIE ($(stat -c%s "$COPIE") octets)"

INTEG="$(sqf "$COPIE" "PRAGMA integrity_check")"
COPIE_CPT="$(sqf "$COPIE" "$COMPTAGES")"
verifie "integrity_check de la copie" "$INTEG" "ok"
verifie "comptages identiques dans la copie" "$COPIE_CPT" "$AVANT"
if [[ $ko -ne 0 ]]; then
  rouge "SAUVEGARDE NON VERIFIEE — on s arrete ici. L application n a PAS ete touchee."
  systemctl start notescam
  exit 2
fi
vert "  Sauvegarde verifiee. On peut installer."

titre "3. Installation"
TMP="$(mktemp -d)"
tar xzf "$ARCHIVE" -C "$TMP" || { rouge "Archive illisible"; systemctl start notescam; rm -rf "$TMP"; exit 1; }
DOSSIER="$(find "$TMP" -maxdepth 1 -type d -name 'notescam-linux-x64*' | head -1)"
[[ -d "$DOSSIER" ]] || { rouge "Contenu d archive inattendu"; systemctl start notescam; rm -rf "$TMP"; exit 1; }
# Archive construite sous Windows : les .sh peuvent etre en CRLF, et Linux refuse
# alors le shebang (« /usr/bin/env: 'bash\r' »). On normalise.
n=0
while IFS= read -r -d '' f; do
  if grep -qU $'\r' "$f" 2>/dev/null; then sed -i 's/\r$//' "$f"; n=$((n+1)); fi
done < <(find "$DOSSIER" -maxdepth 2 -name '*.sh' -type f -print0)
[[ $n -gt 0 ]] && echo "  (${n} script(s) normalise(s) CRLF -> LF)"
chmod +x "$DOSSIER"/*.sh 2>/dev/null
( cd "$DOSSIER" && ./install.sh "$PORT" ) || { rouge "install.sh a echoue"; rm -rf "$TMP"; exit 1; }
rm -rf "$TMP"

titre "4. Demarrage"
echo "  patience : jusqu a 5 minutes."
PRET=0
for i in $(seq 1 60); do
  if curl -fsS --max-time 5 "$BASE/api/version" >/dev/null 2>&1; then PRET=1; break; fi
  sleep 5
done
if [[ $PRET -ne 1 ]]; then
  rouge "  Le serveur ne repond toujours pas apres 5 minutes."
  echo "  Regardez le journal :  journalctl -u notescam -n 120 --no-pager"
  echo "  La sauvegarde verifiee est dans : $COPIE"
  exit 3
fi
VER_APRES="$(curl -fsS --max-time 5 "$BASE/api/version" 2>/dev/null)"
echo "  version servie : $VER_APRES"
echo "$VER_APRES" | grep -qF "$VERSION" \
  && vert "  PASS  le serveur annonce bien $VERSION" \
  || { rouge "  FAIL  le serveur n annonce pas $VERSION"; ko=$((ko+1)); }

# ── LE PAQUET PORTE-T-IL VRAIMENT LE CODE NEUF ? ────────────────────────────
# Libelles d interface, qui survivent a la minification la ou les noms de
# fonctions non. ATTENTION AU CHEMIN (I28) : $DIST se termine DEJA par /assets.
titre "5. Le code neuf est-il dans ce paquet ?"
DIST=/opt/notescam/app/dist/assets
marqueur() {
  if grep -rqsF "$2" "$DIST"; then vert "  PASS  $1"
  else rouge "  FAIL  $1 — marqueur absent du bundle"; ko=$((ko+1)); fi
}
marqueur "Budgets : la mesure « Dépensable maintenant »"   "Dépensable maintenant"
marqueur "Budgets : « Comment ça marche »"                 "Comment ça marche"
marqueur "Enseignants : « Réinitialiser le mot de passe »" "Réinitialiser le mot de passe"
if grep -qF "admin_set_teacher_password" /opt/notescam/app/server/rpc.js 2>/dev/null; then
  vert "  PASS  le serveur porte le handler du mot de passe enseignant"
else
  rouge "  FAIL  le serveur n a pas le handler admin_set_teacher_password"; ko=$((ko+1))
fi

titre "6. La base est-elle intacte ?"
APRES="$(sqf "$DB" "$COMPTAGES")"
verifie "aucune donnee metier perdue (eleves|notes|versements|lignes|depenses)" "$APRES" "$AVANT"
INTEG_APRES="$(sqf "$DB" "PRAGMA integrity_check")"
verifie "integrity_check de la base installee" "$INTEG_APRES" "ok"
DECL="$(sqf "$DB" "SELECT COUNT(*) FROM sqlite_master WHERE type='trigger' AND name LIKE 'trg_outbox_%'")"
verifie_min "les declencheurs de capture de la 0.3.29 sont toujours la" "${DECL:-0}" "150"

# ── LE BAREME DE FORM1 / FORM2 : ON MESURE, ON N ECRIT RIEN ─────────────────
titre "7. Bareme des classes (simulation, rien n est ecrit)"
if [[ -x "$ICI/corriger-bareme-form.sh" || -f "$ICI/corriger-bareme-form.sh" ]]; then
  bash "$ICI/corriger-bareme-form.sh" "$DB" 2>&1 | sed 's/^/  /'
else
  jaune "  corriger-bareme-form.sh absent du dossier du script : etape sautee."
  jaune "  Copiez-le a cote de $0 puis lancez : sudo ./corriger-bareme-form.sh"
fi

titre "8. Verdict"
if [[ $ko -eq 0 ]]; then
  vert "TOUS LES CONTROLES PASSENT — $VERSION est en place."
  echo
  jaune "A FAIRE MAINTENANT, DANS CET ORDRE :"
  echo "  1. Si l etape 7 a liste FORM1 / FORM2 : corrigez le bareme."
  echo "       sudo ./corriger-bareme-form.sh --appliquer"
  echo "     (sauvegarde automatique + commande de retour arriere affichee)"
  echo "     OU par l application : Classes -> FORM1 -> Modifier la classe -> 20."
  echo "  2. Sur un poste de l ecole, faites Ctrl+Shift+R, puis ouvrez « Budgets » :"
  echo "     vous devez voir les quatre mesures (Enveloppe, Reparti, Active,"
  echo "     Depensable maintenant) et, si le budget est complet, le bouton"
  echo "     « Activer les N lignes pretes »."
  echo "  3. Ouvrez un bulletin de FORM1 et comparez une note imprimee a la note"
  echo "     saisie : elles doivent etre IDENTIQUES (pas multipliees par 5)."
  echo "  4. Enseignants -> un enseignant qui a un acces -> « Mot de passe » :"
  echo "     definissez un mot de passe de test et verifiez qu il se connecte."
  echo
  echo "Sauvegarde de la base d avant installation : $COPIE"
else
  rouge "$ko controle(s) en echec — lisez les FAIL ci-dessus."
  echo "La sauvegarde verifiee est dans : $COPIE"
  exit 4
fi
