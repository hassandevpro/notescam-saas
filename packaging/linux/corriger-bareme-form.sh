#!/usr/bin/env bash
#
# CORRIGE LE BAREME DES CLASSES MAL REGLEES — ecriture en base de production.
#
# PAR DEFAUT IL N ECRIT RIEN : il montre ce qu il ferait. Il faut
# --appliquer pour qu il modifie quoi que ce soit.
#
#   sudo ./corriger-bareme-form.sh              # montre, n ecrit pas
#   sudo ./corriger-bareme-form.sh --appliquer  # sauvegarde puis corrige
#
# LE DEFAUT CORRIGE. A THE GENIUS, FORM1 et FORM2 portent grade_max = 100
# alors que 924 notes y sont saisies sur /20 (aucune ne depasse 20). Le
# bulletin, qui prend son bareme de la CLASSE et non de sa langue (cf.
# src/core/bulletinScale.js), remet donc les notes a l echelle /100 : un 13
# s imprime 65. Les matieres, elles, sont toutes a 20 — seule la classe est
# en cause.
#
# CE QU IL ECRIT, ET POURQUOI CES TROIS COLONNES.
#   grade_max  -> 20          le correctif lui-meme
#   updated_at -> maintenant  remoteWins() compare updated_at EN PREMIER.
#                             Sans cela le Cloud, dont la ligne est plus
#                             recente, renverrait 100 au prochain cycle et
#                             la correction serait annulee en silence.
#   version    -> +1          depart l egalite si les horodatages se touchent.
# device_id n est PAS touche : l anti-echo passe par sync_echo_guard, pas par
# cette colonne.
#
# LA REMONTEE AU CLOUD est assuree par les declencheurs de capture poses en
# 0.3.29 : l UPDATE enfile tout seul une entree dans sync_outbox. Le script
# le VERIFIE apres coup au lieu de le supposer.
#
# CE QUE CE SCRIPT CONTOURNE, ET QU IL FAUT SAVOIR. Dans l application, le
# changement de bareme est REFUSE quand une sequence est verrouillee. Une
# ecriture SQL directe ne passe pas par ce garde-fou. C est assume ici : le
# bareme actuel est FAUX, les bulletins deja imprimes le sont donc aussi, et
# la correction les repare au lieu de les abimer. Si vous preferez respecter
# le garde-fou, passez par Classes -> Modifier la classe et ne lancez pas ce
# script.

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

echo "Correction du bareme — $( [ "$APPLIQUER" = 1 ] && echo 'MODE ECRITURE' \
  || echo 'simulation (rien ne sera ecrit)' )"
echo "base : $DB"
echo "date : $(date '+%Y-%m-%d %H:%M:%S')"

TMPD="$(mktemp -d)"
trap 'rm -rf "$TMPD"' EXIT
JS="$TMPD/bareme.mjs"

# ── SAUVEGARDE, avant toute ecriture ───────────────────────────────────────
# VACUUM INTO et non une copie : la base fait ~4 Go dont ~3,9 Go de pages
# libres, la sauvegarde compactee en pesera une centaine de Mo. C est aussi
# la seule copie coherente d une base en mode WAL.
if [ "$APPLIQUER" = 1 ]; then
  SAUVE="$(dirname "$DB")/avant-bareme-$(date '+%Y%m%d-%H%M%S').db"
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

// MEME CRITERE QUE LE DIAGNOSTIC. Une classe est mal reglee quand AUCUNE note
// saisie n atteint la moitie de son bareme : les enseignants notent sur une
// echelle, le bulletin en imprime une autre. Le critere porte sur le MAXIMUM,
// donc une classe aux notes reellement basses ne le declenche pas. On ne vise
// PAS les classes par leur nom : si une troisieme est dans le meme cas, elle
// doit sortir ici plutot que d etre decouverte dans six mois.
const candidates = [];
for (const c of tous('SELECT id, name, grade_max, system, updated_at, version'
  + ' FROM classes WHERE grade_max IS NOT NULL AND grade_max <> 20'
  + ' ORDER BY name')) {
  const g = un('SELECT COUNT(*) n, MAX(CAST(value AS REAL)) mx FROM grades'
    + " WHERE class_id=? AND value IS NOT NULL AND value<>''", c.id);
  if (!g.n) continue;
  if (g.mx > c.grade_max / 2) continue;
  candidates.push({ ...c, notes: g.n, max: g.mx });
}

console.log('');
console.log('== Classes concernees');
if (!candidates.length) {
  console.log('  Aucune. Rien a corriger — le bareme est deja coherent.');
  process.exit(0);
}
for (const c of candidates) {
  console.log('  ' + c.name + '  bareme ' + c.grade_max + ' -> 20'
    + '   (' + c.notes + ' notes, la plus haute ' + c.max + ')');
  console.log('    version ' + c.version + ' -> ' + ((c.version || 0) + 1)
    + '   updated_at ' + (c.updated_at || '(vide)'));
}

if (!ecrire) {
  console.log('');
  console.log('SIMULATION : rien n a ete ecrit.');
  console.log('Pour appliquer : relancez avec --appliquer');
  process.exit(0);
}

// ── RETOUR ARRIERE : on imprime de quoi defaire, AVANT de faire ────────────
console.log('');
console.log('== Retour arriere (notez ces lignes)');
for (const c of candidates) {
  console.log("  UPDATE classes SET grade_max=" + c.grade_max
    + ", version=" + c.version
    + ", updated_at='" + (c.updated_at || '') + "'"
    + " WHERE id='" + c.id + "';");
}

// ── ECRITURE ──────────────────────────────────────────────────────────────
// updated_at = maintenant, sinon la ligne Cloud (plus recente) gagnerait au
// prochain cycle et la correction serait annulee sans un mot.
const quand = new Date().toISOString();
const maj = db.prepare('UPDATE classes SET grade_max = 20,'
  + ' updated_at = ?, version = COALESCE(version, 0) + 1 WHERE id = ?');

db.exec('BEGIN');
try {
  for (const c of candidates) maj.run(quand, c.id);
  db.exec('COMMIT');
} catch (e) {
  db.exec('ROLLBACK');
  console.log('');
  console.log('ECHEC : ' + e.message + ' — rien n a ete modifie.');
  process.exit(1);
}

// ── VERIFICATION : on ne SUPPOSE pas que la remontee est enfilee ──────────
console.log('');
console.log('== Verification');
let souci = 0;
for (const c of candidates) {
  const apres = un('SELECT grade_max, version, updated_at FROM classes'
    + ' WHERE id = ?', c.id);
  const enFile = un('SELECT COUNT(*) n FROM sync_outbox'
    + " WHERE tablename = 'classes' AND row_id = ?", c.id).n;
  console.log('  ' + c.name + ' : bareme ' + apres.grade_max
    + ', version ' + apres.version
    + ', en file pour le cloud : ' + (enFile ? 'oui' : 'NON'));
  if (apres.grade_max !== 20) { souci++; console.log('    /!\\ bareme non applique'); }
  if (!enFile) {
    souci++;
    console.log('    /!\\ le declencheur de capture n a rien enfile :');
    console.log('        la correction ne remontera PAS au site en ligne.');
  }
}

console.log('');
if (souci) {
  console.log('VERDICT : ' + souci + ' point(s) a regarder ci-dessus.');
  process.exit(1);
}
console.log('VERDICT : ' + candidates.length + ' classe(s) corrigee(s),'
  + ' en file pour le site en ligne.');
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
  echo "A VERIFIER DANS L APPLICATION : ouvrez un bulletin de FORM1 et"
  echo "comparez une note imprimee a la note que l enseignant a saisie."
  echo "Elles doivent etre IDENTIQUES, et non multipliees par 5."
else
  echo "Rien n a ete modifie."
fi
exit $CODE
