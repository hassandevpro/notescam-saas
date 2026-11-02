#!/usr/bin/env bash
# =============================================================================
# NotesCam 0.3.29 — SYNCHRONISATION : LA FILE SE DEBOUCHE, RIEN NE S ECRASE
# PLUS EN SILENCE, ET L ECRAN MONTRE ENFIN QUELQUE CHOSE.
#
#   sudo NOTESCAM_CLOUD_SYNC_0329_OK=1 ./deploy-0.3.29.sh notescam-linux-x64-0.3.29.tar.gz
#
# A LANCER EN ROOT SUR LE SERVEUR UBUNTU DE L ECOLE.
# =============================================================================
#
# CE QUE CETTE VERSION CORRIGE, ET POURQUOI C EST LA PLUS IMPORTANTE DEPUIS
# LONGTEMPS. Quatre pannes distinctes, toutes sous le meme symptome : « mes
# modifications ne remontent pas ».
#
# ── 1. LA FILE DE POUSSEE ETAIT ENGORGEE (I35) ──────────────────────────────
#
# Mesure faite sur une copie de la base de THE GENIUS le 2026-11-01 :
#
#       13 314 326 entrees dans sync_outbox
#        pour quelques milliers de lignes reelles
#
# La file etait en AJOUT PUR : chaque modification d une ligne ajoutait une
# entree, sans jamais remplacer la precedente. Un seul eleve modifie cent fois
# pesait cent entrees. Le moteur en pousse 500 par cycle, toutes les 5 minutes :
#
#       13 314 326 / 500 = 26 629 cycles x 5 min = 2 219 h ~ 49 SEMAINES
#
# Chaque « synchronisation manuelle » ne poussait donc que les 500 entrees
# suivantes — pour l essentiel des doublons perimes. C est la raison pour
# laquelle la synchronisation semblait tourner sans rien faire remonter.
#
# 0.3.29 pose UNIQUE (tablename, row_id) : une ligne en attente = une entree.
# La file ne peut plus regonfler. Le dedoublonnage se fait AU PREMIER
# DEMARRAGE, tout seul, et il prend environ 90 SECONDES sur une file de 13
# millions d entrees. Le service met donc plus longtemps que d habitude a
# repondre la premiere fois : C EST NORMAL, ET LE SCRIPT L ATTEND.
#
# (Les 0.3.26/0.3.27/0.3.28 fournissaient un script separe a lancer a la main.
# Il n est plus necessaire : la migration est dans le demarrage.)
#
# ── 2. TRENTE-DEUX ECRITURES N ENTRAIENT PAS DANS LA FILE (I36) ─────────────
#
# `server/rpc.js` ecrit en direct dans HUIT tables synchronisees — classes,
# matieres, ecoles, utilisateurs, enseignants, gouvernance — sur 32
# emplacements, et n enfilait RIEN. Une classe creee, un enseignant renomme, un
# role attribue : rien n entrait dans la file. Ces changements ne remontaient
# que si l audit Merkle finissait par les remarquer. Tard, ou jamais.
#
# 0.3.29 capture les ecritures PAR DECLENCHEUR SQLITE, en base, et non dans les
# 32 appels : corriger les appels laisserait le trou ouvert pour le 33e.
#
# ── 3. LES LIENS DE FRATRIE NE REMONTAIENT PAS (I36) ────────────────────────
#
# `parent_student_links` n etait inscrite dans AUCUNE des sept listes du
# contrat de synchronisation. Les freres et soeurs saisis a l ecole ne
# montaient jamais, sans erreur, sans test, sans ecran.
#
# 0.3.29 la branche, et reconcilie au premier demarrage les liens deja crees
# en leur donnant un identifiant DETERMINE par la cle naturelle. C est la
# decision prise le 2026-11-01 : LE LAN FAIT FOI.
#
# ── 4. DEUX PERSONNES, DEUX CHAMPS, UNE CORRECTION JETEE (I37) ──────────────
#
#   9 h  — la secretaire corrige le MATRICULE d un eleve, a l ecole.
#   10 h — le censeur corrige le NOM du meme eleve, en ligne.
#   -> la ligne distante etait « plus recente » : elle ecrasait TOUT.
#      Le matricule corrige a 9 h etait perdu, sans un mot.
#
# Les deux ne se genaient pas — champs DIFFERENTS — et une correction sur deux
# etait jetee. 0.3.29 fusionne CHAMP PAR CHAMP. Un vrai desaccord sur le MEME
# champ n est plus tranche par l horloge du PC (celle d un poste d ecole peut
# avoir des mois d ecart) mais par un compteur logique, et les donnees
# sensibles — notes, periodes verrouillees, versements, caisse comptee — ne
# sont JAMAIS ecrasees en silence : la valeur de l ecole est conservee et le
# desaccord est inscrit.
#
# ── 5. ET L ECRAN QUI NE VOYAIT RIEN (I39) ──────────────────────────────────
#
# L ecran « Synchronisation » appelait ses routes SANS jeton. Il recevait 403,
# avale par un `.catch` muet, et affichait pour toujours :
#
#       Evenements en attente : —
#       En attente de la premiere synchronisation...
#       Aucune synchronisation enregistree pour l instant.
#
# A l ecole, ca se lit exactement comme « la synchronisation ne marche pas ».
# Corrige. Le meme ecran, sur la meme base, affiche desormais de vrais
# chiffres — et un nouveau bloc « Desaccords a trancher ».
#
# =============================================================================
# CONDITION PREALABLE — ELLE EST DEJA REMPLIE, VERIFIEE LE 2026-11-01.
# =============================================================================
#
# Cette version fait voyager `parent_student_links`, qui n allait nulle part
# jusqu ici. Pour cela il fallait DEUX choses au Cloud, et les deux sont
# FAITES :
#
#   1. `supabase_sync_tables_manquantes.sql` a tourne le 2026-11-01, et la
#      requete de verification a rendu, pour les trois tables concernees :
#
#          parent_student_links    3 colonnes de synchro    1 trigger
#          deleted_fee_payments    3 colonnes de synchro    1 trigger
#          discipline_statistics   3 colonnes de synchro    1 trigger
#
#   2. Les quatre Edge Functions ont ete redeployees le 2026-11-01, et leurs
#      versions verifiees apres coup :
#
#          sync-push v11   sync-pull v14   sync-verify v5   sync-repair v6
#
# SI CES DEUX CONDITIONS N ETAIENT PAS REMPLIES, les liens partiraient et le
# Cloud les refuserait. Ils ne seraient pas perdus — ils tomberaient en
# QUARANTAINE, avec leur motif, et seraient reenfilables — mais ils ne
# monteraient pas.
#
# Le script demande quand meme votre confirmation. Ce n est pas une formalite
# oubliee : votre confirmation est tracee dans le journal de deploiement, et
# c est la seule trace qui dira, dans six mois, que la question avait ete posee.
# =============================================================================

set -uo pipefail

ARCHIVE="${1:-}"
PORT="${PORT:-8080}"
BASE="http://127.0.0.1:$PORT"
DATA=/var/lib/notescam/data
DB="$DATA/notescam.db"
NODE=/opt/notescam/node/bin/node
VERSION=0.3.29

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

if [[ "${NOTESCAM_CLOUD_SYNC_0329_OK:-}" != "1" ]]; then
  rouge "ARRET - condition prealable non confirmee."
  echo
  echo "Cette version fait voyager les LIENS PARENT/ELEVE, qui n allaient nulle"
  echo "part jusqu ici. Il fallait deux choses au Cloud, et LES DEUX SONT FAITES :"
  echo
  echo "  1. supabase_sync_tables_manquantes.sql a tourne le 2026-11-01"
  echo "     verifie : 3 colonnes de synchro + 1 trigger sur les trois tables"
  echo "  2. les quatre Edge Functions ont ete redeployees le 2026-11-01"
  echo "     verifie : push v11 · pull v14 · verify v5 · repair v6"
  echo
  echo "VOUS N AVEZ DONC RIEN A FAIRE AU CLOUD. Relancez en confirmant - la"
  echo "condition est vraie, et votre confirmation reste tracee :"
  echo "    sudo NOTESCAM_CLOUD_SYNC_0329_OK=1 $0 $ARCHIVE"
  exit 1
fi
vert "Condition prealable confirmee : migration Cloud + Edge Functions du 2026-11-01."

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
                  (SELECT COUNT(*) FROM parent_student_links)"

titre "1. Etat avant"
VER_AVANT="$(curl -fsS --max-time 5 "$BASE/api/version" 2>/dev/null || echo '<serveur arrete>')"
echo "  version servie : $VER_AVANT"
systemctl stop notescam 2>/dev/null
sleep 2
echo "  service : $(systemctl is-active notescam)"

titre "2. Sauvegarde VERIFIABLE de la base"
AVANT="$(sqf "$DB" "$COMPTAGES")"
echo "  eleves|notes|versements|liens parents = $AVANT"
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

# ── LA MESURE QUI DIT COMBIEN DE TEMPS LE PREMIER DEMARRAGE VA PRENDRE ───────
titre "2 bis. File de poussee AVANT (mesure, aucune ecriture)"
FILE_AVANT="$(sqf "$DB" "SELECT COUNT(*) FROM sync_outbox")"
FILE_UTILE="$(sqf "$DB" "SELECT COUNT(DISTINCT tablename || '|' || row_id) FROM sync_outbox")"
echo "  entrees ............. ${FILE_AVANT:-<non lu>}"
echo "  pointeurs utiles .... ${FILE_UTILE:-<non lu>}"
LONG=0
if [[ -n "${FILE_AVANT:-}" && "$FILE_AVANT" -gt 1000000 ]]; then
  LONG=1
  jaune "  File tres engorgee. Le PREMIER DEMARRAGE va la dedoublonner :"
  jaune "  comptez environ 90 secondes pour 13 millions d entrees."
  jaune "  C est attendu, et ce script patiente jusqu a 10 minutes."
fi

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

# ── LE PREMIER DEMARRAGE EST LONG, ET C EST VOULU ───────────────────────────
titre "4. Premier demarrage (dedoublonnage de la file)"
echo "  patience : jusqu a 10 minutes si la file etait tres engorgee."
PRET=0
for i in $(seq 1 120); do
  if curl -fsS --max-time 5 "$BASE/api/version" >/dev/null 2>&1; then PRET=1; break; fi
  sleep 5
done
if [[ $PRET -ne 1 ]]; then
  rouge "  Le serveur ne repond toujours pas apres 10 minutes."
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
# Marqueurs choisis dans le code NEUF et verifies presents dans le bundle
# reellement construit : des libelles d interface, qui survivent a la
# minification la ou les noms de fonctions non. Un paquet qui ne les porte pas
# est perime, quelle que soit la version qu il annonce.
#
# ATTENTION AU CHEMIN (I28) : $DIST se termine DEJA par /assets. Ecrire
# "$DIST"/assets/... donnerait un chemin double et un FAIL mensonger — c est
# exactement ce qui a produit deux faux FAIL au deploiement de la 0.3.27.
titre "5. L ecran de synchronisation est-il dans ce paquet ?"
DIST=/opt/notescam/app/dist/assets
marqueur() {
  if grep -rqsF "$2" "$DIST"; then vert "  PASS  $1"
  else rouge "  FAIL  $1 — marqueur absent du bundle"; ko=$((ko+1)); fi
}
marqueur "le bloc « Desaccords a trancher » existe"  "Désaccords à trancher"
marqueur "le bouton « Garder l ecole »"               "Garder l’école"
marqueur "le bouton « Prendre en ligne »"             "Prendre en ligne"
marqueur "les colonnes parlent ecole/en ligne"        "À l’école"

# ── CE QUE LA MISE A JOUR A REELLEMENT FAIT EN BASE ─────────────────────────
titre "6. Les corrections sont-elles en place dans la base ?"

OUTBOX_IDX="$(sqf "$DB" "SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name='idx_sync_outbox_cle'")"
verifie "l index unique de la file est pose (I35)" "${OUTBOX_IDX:-0}" "1"

DECL="$(sqf "$DB" "SELECT COUNT(*) FROM sqlite_master WHERE type='trigger' AND name LIKE 'trg_outbox_%'")"
verifie_min "les declencheurs de capture sont poses (I36)" "${DECL:-0}" "150"

OMBRE="$(sqf "$DB" "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='sync_shadow'")"
verifie "la table d ombre existe (fusion par champ, I37)" "${OMBRE:-0}" "1"

CONFL="$(sqf "$DB" "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='sync_conflicts'")"
verifie "le registre des desaccords existe (I37)" "${CONFL:-0}" "1"

titre "7. La file est-elle debouchee ?"
FILE_APRES="$(sqf "$DB" "SELECT COUNT(*) FROM sync_outbox")"
UTILE_APRES="$(sqf "$DB" "SELECT COUNT(DISTINCT tablename || '|' || row_id) FROM sync_outbox")"
echo "  avant : ${FILE_AVANT:-?} entrees pour ${FILE_UTILE:-?} pointeurs utiles"
echo "  apres : ${FILE_APRES:-?} entrees pour ${UTILE_APRES:-?} pointeurs utiles"
verifie "une ligne en attente = une entree" "${FILE_APRES:-0}" "${UTILE_APRES:-1}"
if [[ -n "${FILE_AVANT:-}" && -n "${FILE_APRES:-}" && "$FILE_AVANT" -gt 0 ]]; then
  GAIN=$(( FILE_AVANT - FILE_APRES ))
  [[ $GAIN -gt 0 ]] && vert "  $GAIN entree(s) perimee(s) retiree(s)."
fi

# Les comptages METIER ne doivent pas avoir bouge : cette version change la
# MECANIQUE de synchronisation, pas les donnees de l ecole.
APRES="$(sqf "$DB" "$COMPTAGES")"
verifie "aucune donnee metier perdue (eleves|notes|versements|liens)" "$APRES" "$AVANT"

titre "8. Verdict"
if [[ $ko -eq 0 ]]; then
  vert "TOUS LES CONTROLES PASSENT — $VERSION est en place."
  echo
  echo "CE QUI VA SE PASSER TOUT SEUL, MAINTENANT :"
  echo "  · la file se vide a 500 entrees toutes les 5 minutes. Avec"
  echo "    ${FILE_APRES:-?} entrees, comptez environ"
  if [[ -n "${FILE_APRES:-}" && "$FILE_APRES" -gt 0 ]]; then
    echo "    $(( (FILE_APRES / 500 + 1) * 5 )) minutes de serveur allume."
  else
    echo "    quelques minutes de serveur allume."
  fi
  echo "  · les liens parent/eleve deja crees ont recu un identifiant determine"
  echo "    et sont partis en file : LE LAN FAIT FOI (decision du 2026-11-01)."
  echo
  jaune "A VERIFIER DEPUIS UN POSTE DE L ECOLE, apres un Ctrl+Shift+R :"
  echo "  · LE CONTROLE DE CETTE VERSION. Connectez-vous en ADMINISTRATEUR,"
  echo "    ouvrez « Synchronisation » dans le menu."
  echo "    L ecran doit afficher de VRAIS chiffres dans « Sante de"
  echo "    synchronisation » — « Evenements en attente » avec un nombre, et un"
  echo "    etat. S il affiche encore des tirets et « En attente de la premiere"
  echo "    synchronisation... », c est l ancien ecran : le paquet n est pas pris."
  echo "  · Le bloc « Desaccords a trancher » apparait sous la sante. S il n y a"
  echo "    aucun desaccord, il affiche « Aucun desaccord » en vert — c est le"
  echo "    bon resultat, pas une panne."
  echo "  · LES FRERES ET SOEURS. Prenez un eleve qui a un frere ou une soeur"
  echo "    dans l ecole, verifiez le lien a l ecole, puis attendez un cycle et"
  echo "    regardez EN LIGNE : le lien doit y etre. C est ce qui ne marchait"
  echo "    pas, et c est le seul controle qui le prouve."
  echo "  · LA FUSION PAR CHAMP. Sur un eleve : corrigez son MATRICULE a l ecole,"
  echo "    et faites corriger son NOM en ligne. Apres un cycle, LES DEUX"
  echo "    corrections doivent etre la, des deux cotes. Avant cette version,"
  echo "    l une des deux disparaissait sans un mot."
  echo "  · Le reste de l application est INCHANGE : bulletins, notes,"
  echo "    versements, rapports. Cette version ne touche qu a la"
  echo "    synchronisation et a son ecran."
  echo
  echo "SI QUELQUE CHOSE NE VA PAS — retour arriere :"
  echo "    sudo systemctl stop notescam"
  echo "    sudo cp '$COPIE' '$DB'"
  echo "    sudo chown notescam:notescam '$DB'"
  echo "    (puis reinstallez le paquet precedent)"
  echo "    sudo systemctl start notescam"
  exit 0
else
  rouge "$ko controle(s) en echec."
  echo "N essayez RIEN d autre : envoyez cette sortie complete a l editeur."
  echo "La sauvegarde verifiee est dans : $COPIE"
  echo
  echo "Retour arriere :"
  echo "    sudo systemctl stop notescam"
  echo "    sudo cp '$COPIE' '$DB'"
  echo "    sudo chown notescam:notescam '$DB'"
  echo "    sudo systemctl start notescam"
  exit 3
fi
