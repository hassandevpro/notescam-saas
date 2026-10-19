#!/usr/bin/env bash
# Dédoublonne la file de poussée (`sync_outbox`) du serveur LAN.
#
# LE CONSTAT, relevé sur le serveur de THE GENIUS le 2026-10-19 :
#     entrées de file ......... 11 789 647
#     pointeurs distincts ..... 3 815        (3 090 doublons chacun)
#     dont `students` ......... 3 901 260    pour 713 élèves
#
# La file s'alimente plus vite (~900 par cycle) qu'elle ne s'écoule (500 par
# cycle, un cycle toutes les 5 minutes) : elle ne peut pas se résorber, et les
# saisies récentes attendent derrière onze millions d'entrées périmées.
#
# POURQUOI C'EST SANS PERTE
# Une entrée de `sync_outbox` n'est qu'un POINTEUR : (table, id de ligne, op).
# À l'envoi, `cloudSync.push` relit la ligne en base —
#     SELECT * FROM "<table>" WHERE id = ?
# — le contenu ne vient JAMAIS de la file. Trois mille pointeurs vers le même
# élève envoient trois mille fois la même ligne, dans son état actuel. N'en
# garder qu'un n'enlève rien.
#
# On garde le pointeur de `id` MAXIMAL par (table, ligne) : le plus récent, donc
# celui qui porte la bonne opération si la ligne a été modifiée puis supprimée
# (`upsert` remplacé par `delete`). `id` est AUTOINCREMENT : les nouveaux
# pointeurs continuent au-dessus, aucun identifiant n'est réutilisé.
#
# CE QUE CE SCRIPT NE FAIT PAS
#   - il ne vide pas la file : ce n'est PAS une réinitialisation, les 3 815
#     pointeurs distincts sont tous conservés, et c'est le contrôle d'arrêt ;
#   - il ne touche à AUCUNE donnée métier : ni élève, ni note, ni versement ;
#   - il ne touche ni aux curseurs de descente, ni aux tombstones, ni à la
#     quarantaine, ni au jeton d'appairage ;
#   - il ne lance aucune synchronisation.
#
# CRITÈRE D'ARRÊT : si le nombre de pointeurs distincts change, ne serait-ce que
# de un, le script le signale et rend un code non nul. La sauvegarde vérifiée
# prise au début permet de revenir en arrière.
#
# Usage, en root :
#   sudo ./dedoublonner-file-poussee.sh --simulation   # mesure seule, n'écrit rien
#   sudo ./dedoublonner-file-poussee.sh
set -uo pipefail

SIMULATION=0
[[ "${1:-}" == "--simulation" ]] && SIMULATION=1

DATA=/var/lib/notescam/data
DB="$DATA/notescam.db"
SQL="$(command -v sqlite3 || true)"

rouge() { printf '\033[31m%s\033[0m\n' "$*"; }
vert()  { printf '\033[32m%s\033[0m\n' "$*"; }
jaune() { printf '\033[33m%s\033[0m\n' "$*"; }
titre() { printf '\n=== %s ===\n' "$*"; }

[[ $EUID -eq 0 ]] || { rouge "À lancer en root : sudo $0"; exit 1; }
[[ -f "$DB" ]]    || { rouge "Base introuvable : $DB"; exit 1; }
[[ -n "$SQL" ]]   || { rouge "sqlite3 introuvable : sudo apt install -y sqlite3"; exit 1; }

# TOUT le SQL passe par l utilisateur `notescam`, JAMAIS par root : sqlite3 cree
# `notescam.db-wal` et `-shm` a cote de la base, et s ils appartenaient a root le
# service — qui tourne sous `notescam` — ne pourrait plus ecrire ensuite.
q() { sudo -u notescam "$SQL" "$DB" "$1"; }

titre "1. Mesure AVANT"
TOTAL_AV="$(q "SELECT COUNT(*) FROM sync_outbox;")"
DISTINCT_AV="$(q "SELECT COUNT(DISTINCT tablename || '|' || row_id) FROM sync_outbox;")"
TAILLE_AV="$(stat -c%s "$DB")"
echo "  entrées de file ..... $TOTAL_AV"
echo "  pointeurs distincts . $DISTINCT_AV"
echo "  taille de la base ... $TAILLE_AV octets"
echo "  Répartition par table (entrées -> distinctes) :"
q "SELECT '    ' || tablename || '  ' || COUNT(*) || ' -> ' || COUNT(DISTINCT row_id) FROM sync_outbox GROUP BY tablename ORDER BY COUNT(*) DESC;"

if [[ "$TOTAL_AV" == "$DISTINCT_AV" ]]; then
  vert "La file ne contient aucun doublon. Rien à faire."
  exit 0
fi

if [[ $SIMULATION -eq 1 ]]; then
  echo
  jaune "SIMULATION : rien n'a été modifié."
  echo "  Le dédoublonnage ramènerait $TOTAL_AV entrées à $DISTINCT_AV,"
  echo "  soit $(( (DISTINCT_AV + 499) / 500 )) cycle(s) de poussée au lieu de"
  echo "  $(( (TOTAL_AV + 499) / 500 )) — à 5 minutes le cycle."
  exit 0
fi

titre "2. Arrêt du service"
systemctl stop notescam
sleep 2
echo "  service : $(systemctl is-active notescam)"

titre "3. Sauvegarde VÉRIFIÉE (rien n'est modifié avant)"
HORO="$(date +%Y%m%d%H%M%S)"
COPIE="$DATA/notescam.db.avant-dedoublonnage-$HORO"
q "VACUUM INTO '$COPIE';" || { rouge "  Copie impossible — RIEN n'a été modifié."; systemctl start notescam; exit 1; }
chown notescam:notescam "$COPIE" 2>/dev/null
# Ceinture : si un -wal/-shm avait malgre tout ete cree par root, on le rend.
chown notescam:notescam "$DB" "$DB-wal" "$DB-shm" 2>/dev/null
INTEG="$(sudo -u notescam "$SQL" "$COPIE" "PRAGMA integrity_check;")"
COPIE_TOTAL="$(sudo -u notescam "$SQL" "$COPIE" "SELECT COUNT(*) FROM sync_outbox;")"
COPIE_ELEVES="$(sudo -u notescam "$SQL" "$COPIE" "SELECT COUNT(*) FROM students;")"
VIVE_ELEVES="$(q "SELECT COUNT(*) FROM students;")"
echo "  copie ............... $COPIE ($(stat -c%s "$COPIE") octets)"
echo "  integrity_check ..... $INTEG"
echo "  file dans la copie .. $COPIE_TOTAL (attendu $TOTAL_AV)"
echo "  élèves dans la copie. $COPIE_ELEVES (attendu $VIVE_ELEVES)"
if [[ "$INTEG" != "ok" || "$COPIE_TOTAL" != "$TOTAL_AV" || "$COPIE_ELEVES" != "$VIVE_ELEVES" ]]; then
  rouge "SAUVEGARDE NON VÉRIFIÉE — on s'arrête. La base n'a PAS été modifiée."
  systemctl start notescam
  exit 2
fi
vert "  Sauvegarde vérifiée."

titre "4. Dédoublonnage"
# Table temporaire INDEXÉE (`id INTEGER PRIMARY KEY`) : le `NOT IN` devient une
# recherche d'arbre sur 3 815 lignes au lieu d'un balayage de onze millions. La
# définition de `sync_outbox` n'est pas touchée — on ne la reconstruit pas, donc
# rien à deviner sur ses colonnes (`attempts`, `last_error`...).
q "CREATE TEMP TABLE garder (id INTEGER PRIMARY KEY);
INSERT INTO garder (id) SELECT MAX(id) FROM sync_outbox GROUP BY tablename, row_id;
BEGIN IMMEDIATE;
DELETE FROM sync_outbox WHERE id NOT IN (SELECT id FROM garder);
COMMIT;" || { rouge "  Échec — transaction annulée, base inchangée."; systemctl start notescam; exit 1; }
echo "  fait. Récupération de l'espace disque (VACUUM)..."
q "VACUUM;"

titre "5. Contrôles APRÈS"
TOTAL_AP="$(q "SELECT COUNT(*) FROM sync_outbox;")"
DISTINCT_AP="$(q "SELECT COUNT(DISTINCT tablename || '|' || row_id) FROM sync_outbox;")"
INTEG_AP="$(q "PRAGMA integrity_check;")"
ELEVES_AP="$(q "SELECT COUNT(*) FROM students;")"
TAILLE_AP="$(stat -c%s "$DB")"
ko=0
ctrl() { if [[ "$2" == "$3" ]]; then vert "  PASS  $1 ($2)"; else rouge "  FAIL  $1 — obtenu '$2', attendu '$3'"; ko=$((ko+1)); fi; }
ctrl "AUCUN pointeur perdu" "$DISTINCT_AP" "$DISTINCT_AV"
ctrl "plus aucun doublon"   "$TOTAL_AP"    "$DISTINCT_AV"
ctrl "intégrité de la base" "$INTEG_AP"    "ok"
ctrl "élèves intacts"       "$ELEVES_AP"   "$VIVE_ELEVES"
echo "  taille : $TAILLE_AV -> $TAILLE_AP octets"

titre "6. Redémarrage"
systemctl start notescam
for _ in $(seq 1 40); do curl -fsS --max-time 2 http://127.0.0.1:8080/ >/dev/null 2>&1 && break; sleep 1; done
ctrl "service actif" "$(systemctl is-active notescam)" "active"

titre "VERDICT"
if [[ $ko -eq 0 ]]; then
  vert "Dédoublonnage réussi : $TOTAL_AV -> $TOTAL_AP entrées, $DISTINCT_AV pointeurs tous conservés."
  echo
  echo "La file s'écoule par lots de 500, un cycle toutes les 5 minutes :"
  echo "  il reste $(( (TOTAL_AP + 499) / 500 )) cycle(s), soit environ $(( ((TOTAL_AP + 499) / 500) * 5 )) minutes."
  echo
  jaune "À SURVEILLER dans l'heure qui suit :"
  echo "  sudo sqlite3 $DB \"SELECT COUNT(*) FROM sync_outbox;\"   # doit DESCENDRE"
  echo "  sudo sqlite3 $DB \"SELECT tablename, COUNT(*), MAX(last_error) FROM sync_outbox_quarantine GROUP BY tablename;\""
  echo
  echo "Si le total REMONTE au lieu de descendre, la cause du réenfilement n'est"
  echo "pas éteinte : arrêtez-vous là et envoyez cette sortie à l'éditeur."
  echo
  echo "Sauvegarde conservée : $COPIE  (ne pas la supprimer)"
else
  rouge "$ko contrôle(s) en ÉCHEC."
  echo
  echo "N'ESSAYEZ AUCUNE RÉPARATION. Pour revenir à l'état d'avant :"
  echo "    sudo systemctl stop notescam"
  echo "    sudo cp -a $COPIE $DB"
  echo "    sudo rm -f $DB-wal $DB-shm"
  echo "    sudo systemctl start notescam"
  echo "Puis envoyez cette sortie à l'éditeur."
fi
exit $ko
