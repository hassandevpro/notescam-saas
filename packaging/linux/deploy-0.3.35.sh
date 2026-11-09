#!/usr/bin/env bash
# =============================================================================
# NotesCam 0.3.35 — BAREME DE CLASSE (FORM1/FORM2 SUR /20), SEQUENCES 1..6 A L ECRAN
# ENSEIGNANT, ABSENTS (ABS) HORS STATISTIQUES, RAPPORTS/PV/CONSEIL SUR LE BAREME
# DE LA CLASSE, LOGO QUI CONTIENT LE NOM, COULEUR DE BULLETIN VIDE.
#
#   sudo ./deploy-0.3.35.sh notescam-linux-x64-0.3.35.tar.gz
#
# A LANCER EN ROOT SUR LE SERVEUR UBUNTU DE L ECOLE.
# PREREQUIS CLOUD (a faire AVANT de distribuer ce paquet) : la colonne
# schools.logo_contient_nom doit exister sur le Cloud (supabase_logo_contient_nom.sql),
# sinon la synchronisation rejette la ligne « ecole » en entier.
# =============================================================================
#
# CE QUE CETTE VERSION CHANGE
#
#  1. BAREME — une matiere cree dans une classe a grade_max 20 prend /20 (et non /100) ;
#     « Fail » ne s affiche plus pour un 17/20 : reussite = moitie du bareme.
#  2. ECRAN ENSEIGNANT — « Sequence 1..6 » comme la generation des bulletins (plus « Term »).
#  3. ABSENTS — « ABS » compte comme saisi, n entre dans aucune moyenne ni statistique,
#     et le bulletin affiche ABS (et non un tiret) pour un eleve absent.
#  4. RAPPORTS — rapport de classe, PV et Conseil de classe lisent le bareme de la classe
#     (une classe anglophone a 20 n est plus calculee sur 100) ; seuil de reussite = bareme / 2.
#  5. Libelle « EN /100 » retire de la page de notes.
#  6. BULLETIN — reglage « le logo contient deja le nom » ; logo plus grand ; filigrane.
#  7. REGLAGES — une couleur de bulletin vide ne bloque plus l enregistrement de l ecole.
#  + tout le contenu de la 0.3.34.
#
# CE QUE CETTE VERSION NE CHANGE PAS : aucune note, aucun bareme n est modifie par
# l installation. Colonne ajoutee au demarrage : schools.logo_contient_nom (defaut 0).
# La base est sauvegardee et verifiee AVANT l installation, comptages reverifies APRES.
# =============================================================================

set -uo pipefail

ARCHIVE="${1:-}"
PORT="${PORT:-8080}"
BASE="http://127.0.0.1:$PORT"
DATA=/var/lib/notescam/data
DB="$DATA/notescam.db"
NODE=/opt/notescam/node/bin/node
VERSION=0.3.35
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
marqueur "Classes : liste cochable du primaire"          "mêmes noms"
marqueur "Classes : programme anglophone bilingue"          "Programme anglophone de la classe"
marqueur "Services : import par le modele"                  "Importer avec le mod"
marqueur "Bulletins : filigrane global de l impression"     "official-print-watermark"
marqueur "Fiche eleve : notes par competence"               "Notes par comp"
marqueur "Fiche eleve : progression par sequence"           "moyennes par s"
marqueur "Primaire : moyenne sur 20"                        "Moyenne /20"
marqueur "Notes : ecran enseignant en sequences"          "sat the exam"
if grep -qF "quarantinedBrut" /opt/notescam/app/server/syncEtat.js 2>/dev/null; then
  vert "  PASS  le serveur porte le compteur de quarantaine corrige"
else
  rouge "  FAIL  le serveur n a pas le compteur de quarantaine corrige (syncEtat.js)"; ko=$((ko+1))
fi
if grep -qF "ligneDeRejeu" /opt/notescam/app/src/lib/sync.js 2>/dev/null; then
  vert "  PASS  le rejeu des notes protege la note d un collegue"
else
  rouge "  FAIL  correctif du rejeu des notes absent (sync.js)"; ko=$((ko+1))
fi
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

# ── LA QUARANTAINE DE SYNCHRO : ON LA LIT, ON NE LA TOUCHE PAS ──────────────
# La notice 0.3.30 annoncait 221 lignes en quarantaine ; le Cloud en affichait 181 253 le
# 2026-11-04. Le diagnostic (LECTURE SEULE : il n ecrit rien, ne contacte pas le Cloud, ne
# touche a aucune file) donne les entrees, les lignes DISTINCTES, le croisement table x motif
# de refus et la repartition par jour. On garde sa sortie dans un fichier a envoyer.
titre "6 bis. Quarantaine de synchronisation (lecture seule)"
DIAG="$DATA/diagnostic-sync-$VERSION-$HORO.txt"
if [[ -f /opt/notescam/app/scripts/diagnostic-sync-lan.mjs ]]; then
  NOTESCAM_DATA_DIR="$DATA" "$NODE" /opt/notescam/app/scripts/diagnostic-sync-lan.mjs > "$DIAG" 2>&1 || true
  chown notescam:notescam "$DIAG" 2>/dev/null
  sed -n '/7. QUARANTAINE/,/8. JOURNAL/p' "$DIAG" | sed '$d' | sed 's/^/  /'
  jaune "  Sortie complete : $DIAG   <<< envoyez ce fichier."
else
  jaune "  diagnostic-sync-lan.mjs absent du paquet : etape sautee."
fi

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
  echo "  2. Sur un poste de l ecole, faites Ctrl+Shift+R, puis ouvrez un bulletin"
  echo "     de FORM1 (format APC) : moyenne generale sur /20, grades A1..F9 sur"
  echo "     les matieres, rangs en « 19th », une seule page a l impression."
  echo "  3. Classes -> CE1 BIL -> Modifier la classe : une seule liste, avec des"
  echo "     cases a cocher, aux memes noms qu a la saisie des notes."
  echo "  4. Sur CE1 BIL : « Ajouter les 11 competences en anglais », verifiez la"
  echo "     liste, puis seulement apres « Supprimer les N lignes en double »"
  echo "     (corbeille, restaurable)."
  echo "  5. Synchronisation : le badge doit afficher un nombre de lignes refusees"
  echo "     bien inferieur a 181 253. Lancez ensuite le diagnostic :"
  echo "       /opt/notescam/node/bin/node /opt/notescam/app/scripts/diagnostic-sync-lan.mjs"
  echo "     et envoyez la section 7 (TABLE x MOTIF) pour trouver la cause."
  echo
  echo "Sauvegarde de la base d avant installation : $COPIE"
else
  rouge "$ko controle(s) en echec — lisez les FAIL ci-dessus."
  echo "La sauvegarde verifiee est dans : $COPIE"
  exit 4
fi
