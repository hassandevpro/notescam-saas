#!/usr/bin/env bash
#
# CORRIGE LES MATIERES RESTEES A /100 ALORS QUE LEURS NOTES SONT SUR /20.
# Ecriture en base de production.
#
# PAR DEFAUT IL N ECRIT RIEN : il montre ce qu il ferait. Il faut
# --appliquer pour qu il modifie quoi que ce soit.
#
#   sudo ./corriger-matieres-100.sh              # montre, n ecrit pas
#   sudo ./corriger-matieres-100.sh --appliquer  # sauvegarde puis corrige
#
# LE DEFAUT CORRIGE. A THE GENIUS, History et Citizenship de FORM1 et FORM2 ont
# subjects.max = 100 alors que toutes leurs notes sont sur /20. L ecran
# enseignant affiche « /100 » et l Observation dit « Fail » pour un 17/20 ;
# la moyenne divise chaque note par subjects.max, donc par 100.
# corriger-bareme-form.sh ne traite que la table `classes` : il ne repare PAS ceci.
#
# QUELLES MATIERES. Une matiere est visee quand TOUTES ces conditions tiennent :
#   - max = 100 ;
#   - sa classe declare grade_max = 20 (ou n en declare pas) ;
#   - elle porte au moins une note numerique dans `grades` ;
#   - AUCUNE de ses notes ne depasse 20. Une note > 20 prouve que l enseignant a
#     vraiment saisi sur /100 : ces matieres sont LISTEES, jamais modifiees.
# Les matieres sans note (ou notees ailleurs, ex. primaire APC) ne sont pas touchees.
#
# CE QU IL ECRIT. max -> 20, updated_at -> maintenant, version -> +1 : sans
# updated_at, la ligne Cloud (plus recente) gagnerait au prochain cycle et
# annulerait la correction. AUCUNE NOTE N EST MODIFIEE.
#
# LA REMONTEE AU CLOUD est assuree par les declencheurs de capture : l UPDATE
# enfile tout seul une entree dans sync_outbox. Le script le VERIFIE apres coup.
# Cote Cloud, appliquer ensuite (ou avant) supabase_corriger_bareme_100.sql.

set -uo pipefail

APPLIQUER=0
DB="/var/lib/notescam/data/notescam.db"
for a in "$@"; do
  case "$a" in
    --appliquer) APPLIQUER=1 ;;
    *) DB="$a" ;;
  esac
done

NODE="${NOTESCAM_NODE:-/opt/notescam/node/bin/node}"
[ -x "$NODE" ] || NODE="$(command -v node || true)"

if [ ! -r "$DB" ]; then
  echo "ARRET : base illisible -> $DB  (lancez avec sudo)"
  exit 1
fi
if [ -z "$NODE" ]; then
  echo "ARRET : aucun node trouve."
  exit 1
fi

echo "Correction des matieres a /100 — $( [ "$APPLIQUER" = 1 ] && echo 'MODE ECRITURE' \
  || echo 'simulation (rien ne sera ecrit)' )"
echo "base : $DB"
echo "date : $(date '+%Y-%m-%d %H:%M:%S')"

TMPD="$(mktemp -d)"
trap 'rm -rf "$TMPD"' EXIT
JS="$TMPD/matieres.mjs"

# ── SAUVEGARDE, avant toute ecriture ───────────────────────────────────────
# VACUUM INTO et non une copie : la base fait ~4 Go dont ~3,9 Go de pages
# libres, la sauvegarde compactee en pesera une centaine de Mo. C est aussi
# la seule copie coherente d une base en mode WAL.
if [ "$APPLIQUER" = 1 ]; then
  SAUVE="$(dirname "$DB")/avant-matieres-$(date '+%Y%m%d-%H%M%S').db"
  echo
  echo "== Sauvegarde"
  echo "  vers $SAUVE"
  if ! "$NODE" -e "
    const { DatabaseSync } = require('node:sqlite');
    const d = new DatabaseSync(process.argv[1], { readOnly: true });
    d.exec(\"VACUUM INTO '\" + process.argv[2].replace(/'/g, \"''\") + \"'\");
  " "$DB" "$SAUVE"; then
    echo "  ARRET : la sauvegarde a echoue. Rien n a ete modifie."
    exit 1
  fi
  echo "  taille : $(du -h "$SAUVE" | cut -f1)"

  # Une sauvegarde non verifiee n est pas une sauvegarde.
  echo "  verification de la copie :"
  if ! "$NODE" -e "
    const { DatabaseSync } = require('node:sqlite');
    const a = new DatabaseSync(process.argv[1], { readOnly: true });
    const b = new DatabaseSync(process.argv[2], { readOnly: true });
    const ok = b.prepare('PRAGMA integrity_check').get();
    const v = Object.values(ok)[0];
    if (v !== 'ok') { console.log('    integrite : ' + v); process.exit(1); }
    console.log('    integrite : ok');
    for (const t of ['classes', 'subjects', 'grades', 'students']) {
      const q = 'SELECT COUNT(*) n FROM \"' + t + '\"';
      const na = a.prepare(q).get().n, nb = b.prepare(q).get().n;
      console.log('    ' + t.padEnd(9) + ' : ' + na + ' / ' + nb
        + (na === nb ? '  ok' : '  ECART'));
      if (na !== nb) process.exit(1);
    }
  " "$DB" "$SAUVE"; then
    echo "  ARRET : la sauvegarde est inexploitable. Rien n a ete modifie."
    exit 1
  fi
fi

cat > "$JS" <<'JSFIN'
import { DatabaseSync } from 'node:sqlite';

const [chemin, mode] = process.argv.slice(2);
const ecrire = mode === 'ecrire';
const db = new DatabaseSync(chemin, { readOnly: !ecrire });
const un = (sql, ...a) => db.prepare(sql).get(...a);
const tous = (sql, ...a) => db.prepare(sql).all(...a);

const candidates = [];
const aLaisser = [];
for (const s of tous('SELECT s.id, s.name, s.max, s.updated_at, s.version,'
  + ' c.name AS classe, c.grade_max FROM subjects s JOIN classes c ON c.id = s.class_id'
  + ' WHERE s.max = 100 AND (c.grade_max = 20 OR c.grade_max IS NULL)'
  + ' ORDER BY c.name, s.name')) {
  const g = un('SELECT COUNT(*) n, MAX(CAST(REPLACE(value, \',\', \'.\') AS REAL)) mx FROM grades'
    + " WHERE subject_id = ? AND value IS NOT NULL AND value <> ''"
    + " AND REPLACE(value, ',', '.') GLOB '[0-9]*'", s.id);
  if (!g.n) continue;                      // pas notee dans `grades` : on n y touche pas
  if (g.mx > 20) { aLaisser.push({ ...s, notes: g.n, max: g.mx }); continue; }
  candidates.push({ ...s, notes: g.n, noteMax: g.mx });
}

console.log('');
console.log('== Matieres a /100 dont les notes sont sur /20');
if (!candidates.length) console.log('  Aucune. Rien a corriger.');
for (const s of candidates) {
  console.log('  ' + s.classe + ' / ' + s.name + '   max 100 -> 20'
    + '   (' + s.notes + ' notes, la plus haute ' + s.noteMax + ')');
}
if (aLaisser.length) {
  console.log('');
  console.log('== NON TOUCHEES : une note depasse 20 (saisie reelle sur /100)');
  for (const s of aLaisser) console.log('  ' + s.classe + ' / ' + s.name + '  (note la plus haute : ' + s.max + ')');
}
if (!candidates.length) process.exit(0);

if (!ecrire) {
  console.log('');
  console.log('SIMULATION : rien n a ete ecrit.');
  console.log('Pour appliquer : relancez avec --appliquer');
  process.exit(0);
}

console.log('');
console.log('== Retour arriere (notez ces lignes)');
for (const s of candidates) {
  console.log("  UPDATE subjects SET max=100, version=" + s.version
    + ", updated_at='" + (s.updated_at || '') + "' WHERE id='" + s.id + "';");
}

const quand = new Date().toISOString();
const maj = db.prepare('UPDATE subjects SET max = 20, updated_at = ?,'
  + ' version = COALESCE(version, 0) + 1 WHERE id = ? AND max = 100');
db.exec('BEGIN');
try {
  for (const s of candidates) maj.run(quand, s.id);
  db.exec('COMMIT');
} catch (e) {
  db.exec('ROLLBACK');
  console.log('');
  console.log('ECHEC : ' + e.message + ' — rien n a ete modifie.');
  process.exit(1);
}

console.log('');
console.log('== Verification');
let souci = 0;
for (const s of candidates) {
  const apres = un('SELECT max, version FROM subjects WHERE id = ?', s.id);
  const enFile = un('SELECT COUNT(*) n FROM sync_outbox'
    + " WHERE tablename = 'subjects' AND row_id = ?", s.id).n;
  console.log('  ' + s.classe + ' / ' + s.name + ' : max ' + apres.max
    + ', version ' + apres.version + ', en file pour le cloud : ' + (enFile ? 'oui' : 'NON'));
  if (apres.max !== 20) { souci++; console.log('    /!\ non applique'); }
  if (!enFile) { souci++; console.log('    /!\ rien enfile : la correction ne remontera PAS au Cloud.'); }
}
console.log('');
if (souci) { console.log('VERDICT : ' + souci + ' point(s) a regarder ci-dessus.'); process.exit(1); }
console.log('VERDICT : ' + candidates.length + ' matiere(s) corrigee(s), en file pour le site en ligne.');
JSFIN

if [ "$APPLIQUER" = 1 ]; then
  "$NODE" "$JS" "$DB" ecrire
  CODE=$?
else
  "$NODE" "$JS" "$DB" simuler
  CODE=$?
fi

echo
if [ "$APPLIQUER" = 1 ]; then
  echo "A VERIFIER DANS L APPLICATION : ouvrez la saisie de History (FORM2)."
  echo "L en-tete doit dire /20 et un 14 ne doit plus etre « Fail »."
else
  echo "Rien n a ete modifie."
fi
exit $CODE
