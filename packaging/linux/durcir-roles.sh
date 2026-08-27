#!/usr/bin/env bash
# Lève `schools.strict_role_enforcement` sur le serveur LAN d'une école — c'est le
# drapeau qui RETIRE au censeur (et à tout rôle sans autorité financière) les pages
# d'argent : Frais scolaires, Budgets, Dépenses, Décisions à approuver.
#
# Pourquoi un script et pas une simple synchro : la colonne existe des deux côtés,
# mais la table `schools` du LAN n'a pas de `updated_at` et le durcissement cloud
# (supabase_genius_role_permissions.sql) ne bouscule pas cet horodatage. Le drapeau
# ne voyage donc PAS du Cloud vers le serveur d'école : il se pose sur place.
#
# Ce qu'il ne fait pas : aucune donnée scolaire n'est modifiée, aucun compte n'est
# touché, aucun ré-appairage. Une copie de sûreté de la base est déposée avant.
#
#   sudo ./durcir-roles.sh                       # école unique de la base
#   sudo ./durcir-roles.sh <school_id>           # école explicite
#   sudo ./durcir-roles.sh <school_id> --annuler # revient en arrière (drapeau baissé)
set -uo pipefail

NODE=/opt/notescam/node/bin/node
DB=/var/lib/notescam/data/notescam.db
SCHOOL="${1:-}"
[[ "${1:-}" == "--annuler" ]] && SCHOOL=""
VALEUR=1
for a in "$@"; do [[ "$a" == "--annuler" ]] && VALEUR=0; done

rouge() { printf '\033[31m%s\033[0m\n' "$*"; }
vert()  { printf '\033[32m%s\033[0m\n' "$*"; }

[[ $EUID -eq 0 ]] || { rouge "À lancer en root : sudo $0 [school_id] [--annuler]"; exit 1; }
[[ -x "$NODE" ]]  || { rouge "Node introuvable : $NODE"; exit 1; }
[[ -f "$DB" ]]    || { rouge "Base introuvable : $DB"; exit 1; }

echo "==> Copie de sûreté"
cp -a "$DB" "$DB.avant-durcissement-$(date +%Y%m%d%H%M%S)" && vert "  faite"

echo "==> Arrêt du service"
systemctl stop notescam

"$NODE" -e '
const { DatabaseSync } = require("node:sqlite");
const db = new DatabaseSync(process.argv[1]);
const want = Number(process.argv[3]);
let id = process.argv[2];
const rows = db.prepare("SELECT id, name, strict_role_enforcement AS f FROM schools").all();
if (!rows.length) { console.error("Aucune école dans la base."); process.exit(1); }
if (!id) {
  if (rows.length > 1) {
    console.error("Plusieurs écoles — précisez le school_id :");
    for (const r of rows) console.error("  " + r.id + "  " + r.name);
    process.exit(1);
  }
  id = rows[0].id;
}
const row = rows.find((r) => r.id === id);
if (!row) { console.error("École introuvable : " + id); process.exit(1); }
console.log("  école  : " + row.name + " (" + row.id + ")");
console.log("  avant  : strict_role_enforcement = " + row.f);
db.prepare("UPDATE schools SET strict_role_enforcement = ? WHERE id = ?").run(want, id);
const apres = db.prepare("SELECT strict_role_enforcement AS f FROM schools WHERE id = ?").get(id);
console.log("  après  : strict_role_enforcement = " + apres.f);
' "$DB" "$SCHOOL" "$VALEUR" || { rouge "Échec — la base n'a pas été modifiée au-delà de la copie."; systemctl start notescam; exit 1; }

echo "==> Redémarrage (le serveur pose alors la matrice d'autorité : fees.manage au caissier/RAF…)"
systemctl start notescam
sleep 3

if systemctl is-active --quiet notescam; then
  vert "OK — service actif."
  echo
  echo "À vérifier à l'écran, en vous reconnectant :"
  echo "  • Censeur      : plus de « Frais scolaires », plus de « Budgets »/« Dépenses »."
  echo "  • Caissier/RAF : la caisse et les budgets sont toujours là (leur RÔLE les porte)."
  echo "  • Administrateur : menu inchangé."
else
  rouge "Le service n'est pas reparti :"
  journalctl -u notescam --since '-2 min' --no-pager | tail -30
  exit 1
fi
