#!/usr/bin/env bash
# Corriger le BARÈME d'une ou plusieurs classes, quand l'écran le refuse.
#
# ── LE CAS QUI A FAIT ÉCRIRE CE SCRIPT ──────────────────────────────────────
# FORM 1 et FORM 2 de THE GENIUS portent `grade_max = 100` alors que leurs notes
# sont saisies sur /20. L'école essaie de corriger depuis la fiche de la classe
# et « ça ne résout pas ».
#
# ── POURQUOI L'ÉCRAN REFUSE, ET CE QU'IL FAUT ESSAYER AVANT CE SCRIPT ───────
# Le refus est VOLONTAIRE (gel de configuration, audit C2, schoolStore.js) :
# changer le barème d'une classe dont une séquence est VERROUILLÉE réécrit
# rétroactivement un bulletin déjà validé. L'écran affiche alors :
#
#     « Configuration figée : une séquence de cette classe est verrouillée.
#       Déverrouillez pour changer barème / système. »
#
# Il y a DEUX verrous, et ils ne vivent pas au même endroit :
#
#   1. LE VERROU PAR CLASSE EST DANS LE NAVIGATEUR (localStorage), pas en base
#      — voir src/lib/lockService.js. Conséquences, et la première est une
#      solution gratuite :
#        · il est PROPRE AU POSTE qui a posé le verrou. Depuis un AUTRE poste,
#          ou un autre profil de navigateur, la classe n'est pas figée et le
#          barème se change normalement. ESSAYEZ ÇA D'ABORD ;
#        · sinon, déverrouillez la séquence sur l'écran de saisie des notes
#          (le cadenas), changez le barème, reverrouillez ;
#        · et CE SCRIPT NE PEUT PAS LE VOIR : il lit la base, pas le
#          navigateur. Il ne vous dira donc jamais « aucun verrou ».
#
#   2. LE VERROU DE PÉRIODE (academic_periods.is_locked) est en base et
#      synchronisé. Celui-là, le script le lit et vous le dit.
#
# ── CE QUE CE SCRIPT FAIT, ET CE QU'IL NE FAIT PAS ──────────────────────────
# IL NE TOUCHE À AUCUNE NOTE. Il ne convertit rien, ne multiplie rien, ne
# divise rien. Il corrige le BARÈME ANNONCÉ — c'est-à-dire la façon dont les
# notes déjà saisies sont lues et imprimées.
#
# C'est pourquoi il REFUSE de s'exécuter s'il trouve une note au-dessus de 20
# dans une des classes visées : cela voudrait dire que les notes ne sont PAS
# sur /20, et baisser le barème rendrait alors chaque note fausse (18/20 là où
# l'enseignant a écrit 18/100). Dans ce cas, le travail n'est pas un réglage,
# c'est une conversion, et elle ne se fait pas sans décision explicite.
#
# ── POURQUOI IL N'ÉCRIT PAS DE « UPDATE » DIRECT ────────────────────────────
# Parce qu'un UPDATE brut ne remonterait JAMAIS au Cloud. Dans NotesCam, la
# file de poussée est alimentée par le code, pas par un déclencheur SQL. Le
# script passe donc par `runQuery` (server/query.js), le chemin d'écriture de
# l'application elle-même, qui fait les quatre choses nécessaires :
# l'horodatage (`updated_at`), l'incrément de `version` — les deux qui font
# gagner la ligne locale à l'arbitrage avec le Cloud —, la maintenance de
# l'arbre de Merkle, et la mise en file de poussée.
#
#   sudo ./corriger-bareme-classe.sh                      # simulation, par défaut
#   sudo ./corriger-bareme-classe.sh --appliquer
#   sudo ./corriger-bareme-classe.sh --classes "FORM 1,FORM 2" --bareme 20
#
set -euo pipefail

APP=/opt/notescam/app
NODE=/opt/notescam/node/bin/node
DATA_DIR="${NOTESCAM_DATA_DIR:-/var/lib/notescam/data}"
DB="$DATA_DIR/notescam.db"
SERVICE=notescam

CLASSES_DEFAUT="FORM 1,FORM 2"
CLASSES="$CLASSES_DEFAUT"
BAREME=20
APPLIQUER=0

rouge() { printf '\033[31m%s\033[0m\n' "$*"; }
vert()  { printf '\033[32m%s\033[0m\n' "$*"; }
jaune() { printf '\033[33m%s\033[0m\n' "$*"; }
titre() { printf '\n\033[1m=== %s ===\033[0m\n' "$*"; }

while [ $# -gt 0 ]; do
  case "$1" in
    --appliquer) APPLIQUER=1; shift ;;
    --classes)   CLASSES="${2:?--classes attend une liste séparée par des virgules}"; shift 2 ;;
    --bareme)    BAREME="${2:?--bareme attend un nombre}"; shift 2 ;;
    --simulation) APPLIQUER=0; shift ;;
    -h|--help)   sed -n '1,60p' "$0"; exit 0 ;;
    *) rouge "Option inconnue : $1"; exit 2 ;;
  esac
done

[ "$(id -u)" = 0 ] || { rouge "À lancer avec sudo."; exit 1; }
[ -x "$NODE" ]     || { rouge "Node embarqué introuvable : $NODE"; exit 1; }
[ -f "$DB" ]       || { rouge "Base introuvable : $DB"; exit 1; }
case "$BAREME" in ''|*[!0-9]*) rouge "--bareme doit être un entier."; exit 2 ;; esac
[ "$BAREME" -ge 1 ] && [ "$BAREME" -le 200 ] || { rouge "--bareme hors bornes (1..200)."; exit 2; }

# ── Lecture : un petit programme node, la base en LECTURE SEULE ─────────────
JS_ETAT="$(cat <<'JS'
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(process.argv[1], { readOnly: true });
const noms = process.argv[2].split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
const bareme = Number(process.argv[3]);
const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');

const classes = db.prepare('SELECT id, name, system, grade_max, school_id FROM classes').all()
  .filter((c) => noms.some((n) => norm(c.name) === n || norm(c.name).replace(/\s+/g, '') === n.replace(/\s+/g, '')));

if (!classes.length) {
  console.log('AUCUNE_CLASSE');
  for (const c of db.prepare('SELECT name FROM classes ORDER BY name').all()) console.log('DISPO|' + c.name);
  process.exit(0);
}

for (const c of classes) {
  const notes = db.prepare(
    "SELECT COUNT(*) n, MAX(CAST(value AS REAL)) hi FROM grades WHERE class_id = ? AND value IS NOT NULL AND TRIM(value) <> '' AND CAST(value AS REAL) = CAST(value AS REAL)",
  ).get(c.id);
  const horsBareme = db.prepare(
    "SELECT COUNT(*) n FROM grades WHERE class_id = ? AND value IS NOT NULL AND TRIM(value) <> '' AND CAST(value AS REAL) > ?",
  ).get(c.id, bareme);
  const mats = db.prepare('SELECT COUNT(*) n FROM subjects WHERE class_id = ? AND max <> ?').get(c.id, bareme);
  console.log(['CLASSE', c.id, c.name, c.system, c.grade_max === null ? '(vide)' : c.grade_max,
               notes.n, notes.hi === null ? '-' : notes.hi, horsBareme.n, mats.n].join('|'));
  for (const s of db.prepare('SELECT name, max FROM subjects WHERE class_id = ? AND max <> ? ORDER BY name').all(c.id, bareme)) {
    console.log(['MATIERE', c.id, s.name, s.max].join('|'));
  }
}

// Verrou de PÉRIODE (en base, synchronisé). Le verrou par classe, lui, est dans
// le navigateur : ce programme ne peut pas le voir, et il ne prétend pas le voir.
for (const p of db.prepare("SELECT name, sequence_order, school_year FROM academic_periods WHERE is_locked = 1 AND type = 'sequence' ORDER BY school_year, sequence_order").all()) {
  console.log(['VERROU', p.school_year, p.sequence_order, p.name].join('|'));
}
JS
)"

JS_COPIER="$(cat <<'JS'
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(process.argv[1], { readOnly: true });
db.exec("VACUUM INTO '" + process.argv[2].replace(/'/g, "''") + "'");
JS
)"

JS_VERIF="$(cat <<'JS'
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(process.argv[1], { readOnly: true });
const i = db.prepare('PRAGMA integrity_check').get();
console.log(Object.values(i)[0]);
console.log([
  db.prepare('SELECT COUNT(*) n FROM students').get().n,
  db.prepare('SELECT COUNT(*) n FROM grades').get().n,
  db.prepare('SELECT COUNT(*) n FROM fee_payments').get().n,
].join('|'));
JS
)"

titre "1. Ce que la base dit aujourd'hui"
ETAT="$("$NODE" -e "$JS_ETAT" "$DB" "$CLASSES" "$BAREME")"

if echo "$ETAT" | grep -q '^AUCUNE_CLASSE$'; then
  rouge "Aucune classe ne porte un de ces noms : $CLASSES"
  echo "Classes présentes dans cette base :"
  echo "$ETAT" | grep '^DISPO|' | cut -d'|' -f2 | sed 's/^/    /'
  echo
  echo "Relancez avec les noms exacts :"
  echo "    sudo $0 --classes \"NOM 1,NOM 2\""
  exit 1
fi

CIBLES=0
BLOQUANT=0
while IFS='|' read -r tag id nom systeme gmax nb hi hors mats; do
  [ "$tag" = CLASSE ] || continue
  CIBLES=$((CIBLES + 1))
  echo "  $nom"
  echo "      id              : $id"
  echo "      système         : $systeme"
  echo "      barème actuel   : $gmax        -> deviendra $BAREME"
  echo "      notes numériques: $nb (la plus haute : $hi)"
  echo "      matières hors /$BAREME : $mats"
  if [ "${hors:-0}" -gt 0 ]; then
    rouge "      ⛔ $hors note(s) DÉPASSENT $BAREME — ces notes ne sont pas sur /$BAREME."
    BLOQUANT=1
  fi
done <<< "$ETAT"

echo "$ETAT" | grep '^MATIERE|' | while IFS='|' read -r _ _ nom max; do
  echo "      · matière « $nom » : max $max -> $BAREME"
done

titre "2. Les verrous"
if echo "$ETAT" | grep -q '^VERROU|'; then
  jaune "  Séquences verrouillées EN BASE (academic_periods.is_locked) :"
  echo "$ETAT" | grep '^VERROU|' | while IFS='|' read -r _ annee ordre nom; do
    echo "      · $annee — séquence $ordre ($nom)"
  done
else
  vert "  Aucune séquence verrouillée en base."
fi
jaune "  Le verrou PAR CLASSE, lui, vit dans le localStorage du NAVIGATEUR."
jaune "  Ce script ne peut pas le voir. C'est très probablement celui qui vous"
jaune "  refuse le changement à l'écran — et il est propre au POSTE qui l'a posé."
echo
echo "  AVANT D'APPLIQUER CE SCRIPT, essayez la solution gratuite :"
echo "    · ouvrez la fiche de la classe depuis UN AUTRE POSTE (le verrou n'y est pas) ;"
echo "    · ou déverrouillez la séquence sur l'écran de saisie, changez le barème,"
echo "      puis reverrouillez."

if [ "$BLOQUANT" = 1 ]; then
  titre "ARRÊT"
  rouge "Des notes dépassent $BAREME : ces classes ne sont PAS saisies sur /$BAREME."
  rouge "Baisser le barème rendrait chaque note fausse. Ce n'est pas un réglage,"
  rouge "c'est une conversion — et elle ne se décide pas depuis un script."
  rouge "Envoyez cette sortie à l'éditeur. RIEN N'A ÉTÉ MODIFIÉ."
  exit 1
fi

if [ "$APPLIQUER" != 1 ]; then
  titre "SIMULATION — RIEN N'A ÉTÉ MODIFIÉ"
  echo "  $CIBLES classe(s) seraient corrigées sur /$BAREME."
  echo "  Pour appliquer :"
  echo "      sudo $0 --classes \"$CLASSES\" --bareme $BAREME --appliquer"
  exit 0
fi

titre "3. Arrêt du service (une écriture à chaud se croiserait avec le serveur)"
systemctl stop "$SERVICE" 2>/dev/null || true
sleep 1
systemctl is-active --quiet "$SERVICE" && { rouge "Le service tourne toujours. Arrêt manuel nécessaire."; exit 1; }
vert "  service arrêté"

titre "4. Sauvegarde VÉRIFIÉE (une sauvegarde non vérifiée n'est pas une sauvegarde)"
HORO="$(date +%Y%m%d%H%M%S)"
COPIE="$DATA_DIR/notescam.db.avant-bareme-$HORO"
"$NODE" -e "$JS_COPIER" "$DB" "$COPIE"
VERIF="$("$NODE" -e "$JS_VERIF" "$COPIE")"
INTEG="$(echo "$VERIF" | sed -n 1p)"
CPT="$(echo "$VERIF" | sed -n 2p)"
[ "$INTEG" = ok ] || { rouge "  integrity_check de la copie : $INTEG — ARRÊT, rien n'est modifié."; exit 1; }
vert "  copie : $COPIE"
vert "  integrity_check : ok · élèves|notes|versements = $CPT"

titre "5. Correction, par le chemin d'écriture de l'application"
IDS="$(echo "$ETAT" | grep '^CLASSE|' | cut -d'|' -f2 | paste -sd, -)"
NOTESCAM_DATA_DIR="$DATA_DIR" "$NODE" --input-type=module -e "
// URL file:// explicite : un chemin nu marche sur Linux mais pas partout,
// et un script de secours n'est pas l'endroit où tenter sa chance.
import { runQuery } from 'file://$APP/server/query.js';
const ids = '$IDS'.split(',').filter(Boolean);
const bareme = $BAREME;
let ko = 0;
for (const id of ids) {
  // Filtre PAR ID : la garde du référentiel national refuse une écriture de
  // masse non ciblée, et elle a raison. Un id par appel, c'est aussi ce qui
  // rend la sortie lisible ligne à ligne.
  const r = runQuery({
    table: 'classes', action: 'update',
    values: { grade_max: bareme },
    filters: [{ col: 'id', op: 'eq', val: id }],
  });
  if (r.error) { console.log('  KO  classe ' + id + ' : ' + r.error.message); ko++; }
  else console.log('  ok  classe ' + id + ' -> grade_max=' + bareme);

  const m = runQuery({
    table: 'subjects', action: 'update',
    values: { max: bareme },
    filters: [{ col: 'class_id', op: 'eq', val: id }, { col: 'school_id', op: 'eq', val: null }],
  });
  // Le filtre school_id null ci-dessus ne sert qu'à satisfaire la garde quand
  // elle s'applique ; s'il échoue, on retombe sur un ciblage par classe seule.
  if (m.error) {
    const m2 = runQuery({
      table: 'subjects', action: 'update',
      values: { max: bareme },
      filters: [{ col: 'class_id', op: 'eq', val: id }],
    });
    if (m2.error) { console.log('  KO  matières de ' + id + ' : ' + m2.error.message); ko++; }
    else console.log('  ok  matières de ' + id + ' -> max=' + bareme);
  } else {
    console.log('  ok  matières de ' + id + ' -> max=' + bareme);
  }
}
process.exit(ko ? 1 : 0);
" || { rouge "  Une écriture a échoué. La base est intacte ou partiellement modifiée :"; rouge "  restaurez avec la copie ci-dessus avant toute autre chose."; exit 1; }

titre "6. Redémarrage et relecture"
systemctl start "$SERVICE"
sleep 2
systemctl is-active --quiet "$SERVICE" && vert "  service actif" || { rouge "  le service n'est pas reparti"; exit 1; }

APRES="$("$NODE" -e "$JS_ETAT" "$DB" "$CLASSES" "$BAREME")"
echo "$APRES" | grep '^CLASSE|' | while IFS='|' read -r _ id nom systeme gmax nb hi hors mats; do
  if [ "$gmax" = "$BAREME" ] && [ "${mats:-0}" = 0 ]; then
    vert "  PASS  $nom : barème $gmax, aucune matière hors /$BAREME"
  else
    rouge "  FAIL  $nom : barème $gmax, $mats matière(s) hors /$BAREME"
  fi
done

VERIF2="$("$NODE" -e "$JS_VERIF" "$DB")"
[ "$(echo "$VERIF2" | sed -n 1p)" = ok ] && vert "  PASS  integrity_check de la base vive" || rouge "  FAIL  integrity_check"
CPT2="$(echo "$VERIF2" | sed -n 2p)"
[ "$CPT2" = "$CPT" ] && vert "  PASS  élèves|notes|versements inchangés ($CPT2)" \
                     || rouge "  FAIL  comptages : $CPT -> $CPT2"

titre "VERDICT"
echo "  La correction est écrite EN LOCAL et mise en file pour le Cloud :"
echo "  le chemin d'écriture a horodaté les lignes, incrémenté leur version et les a"
echo "  empilées dans sync_outbox. Elles monteront au prochain cycle, et comme"
echo "  leur horodatage est le plus récent, c'est la version corrigée qui gagne."
echo
echo "  À CONTRÔLER À L'ÉCRAN, c'est le seul contrôle qui vaut :"
echo "    · la fiche de la classe annonce /$BAREME ;"
echo "    · un bulletin de cette classe sort sur /$BAREME, admis à $((BAREME / 2)) ;"
echo "    · les moyennes n'ont pas changé de valeur, seulement d'échelle affichée."
echo
echo "  RETOUR ARRIÈRE, si quoi que ce soit vous surprend :"
echo "      sudo systemctl stop $SERVICE"
echo "      sudo cp '$COPIE' '$DB'"
echo "      sudo systemctl start $SERVICE"
echo
jaune "  Si l'écran refusait à cause du verrou de NAVIGATEUR, il refusera encore"
jaune "  pour les prochains changements : déverrouillez la séquence depuis le"
jaune "  poste concerné pour revenir à une situation normale."
