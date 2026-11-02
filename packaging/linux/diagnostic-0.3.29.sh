#!/usr/bin/env bash
#
# DIAGNOSTIC NOTESCAM — LECTURE SEULE. N'ECRIT RIEN, NE MODIFIE RIEN.
#
# POURQUOI CE FICHIER EXISTE. Les memes controles, passes au terminal en
# copier-coller, arrivaient tronques : la liaison SSH de THE GENIUS perd des
# caracteres sur les lignes longues (constate le 02/11/2026 — « FROM gralue IS
# NOT NULLAND value<>'' », « if (s.max != » ). Trois tentatives, trois scripts
# mutiles. Un fichier transfere par scp ne se tronque pas : c'est la parade.
#
# USAGE, depuis le poste Windows :
#   scp diagnostic-0.3.29.sh genius-server@192.168.10.1:/tmp/
#   ssh genius-server@192.168.10.1
#   chmod +x /tmp/diagnostic-0.3.29.sh
#   sudo /tmp/diagnostic-0.3.29.sh
#
# Un chemin de base peut etre passe en argument, pour juger sur une copie :
#   sudo /tmp/diagnostic-0.3.29.sh /chemin/vers/copie.db
#
# Il repond aux deux questions ouvertes du 02/11/2026 :
#   1. la synchronisation est-elle saine, ou le cloud refuse-t-il des lignes ;
#   2. le bareme des bulletins est-il coherent avec les notes reellement
#      saisies (FORM1 et FORM2 impriment sur /100 des notes saisies sur /20).

set -uo pipefail

DB="${1:-/var/lib/notescam/data/notescam.db}"
NODE="${NOTESCAM_NODE:-/opt/notescam/node/bin/node}"
[ -x "$NODE" ] || NODE="$(command -v node || true)"

if [ ! -r "$DB" ]; then
  echo "ARRET : base illisible -> $DB"
  echo "        Lancez avec sudo, ou donnez le chemin en argument."
  exit 1
fi
if [ -z "$NODE" ]; then
  echo "ARRET : aucun node trouve."
  echo "        Ni /opt/notescam/node/bin/node, ni node dans le PATH."
  exit 1
fi

echo "NotesCam — diagnostic en lecture seule"
echo "base : $DB"
echo "node : $NODE ($("$NODE" -v))"
echo "date : $(date '+%Y-%m-%d %H:%M:%S')"

echo
echo "== Version servie"
curl -s --max-time 5 http://localhost:8080/api/version \
  || echo "  (serveur injoignable sur le port 8080)"
echo

# Le disque AVANT tout le reste : une base qui ne peut plus ecrire arrete la
# synchronisation pour une raison qui n a rien a voir avec le code, et le
# message a l ecran ne le dira pas.
echo
echo "== Disque"
df -h "$(dirname "$DB")" | tail -2
echo "  fichiers de la base :"
ls -lh "$DB"* 2>/dev/null | awk '{print "    " $5 "  " $9}'

# Un repertoire temporaire, et non « mktemp » seul : node refuse de charger un
# module ESM dont le fichier n a pas l extension .mjs
# (ERR_UNKNOWN_FILE_EXTENSION ".i0sEra6Hs6").
TMPD="$(mktemp -d)"
JS="$TMPD/diagnostic.mjs"
trap 'rm -rf "$TMPD"' EXIT

cat > "$JS" <<'JSFIN'
import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync(process.argv[2], { readOnly: true });
const un = (sql, ...a) => db.prepare(sql).get(...a);
const tous = (sql, ...a) => db.prepare(sql).all(...a);
const existe = (t) =>
  !!un("SELECT 1 n FROM sqlite_master WHERE type='table' AND name=?", t);
const compte = (t) =>
  existe(t) ? un('SELECT COUNT(*) n FROM "' + t + '"').n : null;

let alertes = 0;
const alerte = (m) => { alertes++; console.log('  /!\\ ' + m); };

// Chaque section est isolee. Un diagnostic qui s arrete a la premiere requete
// fautive ne diagnostique rien : la section suivante porte peut-etre justement
// la reponse. Constate ici meme le 02/11/2026 — « SELECT MAX(last_pull_at) »
// sur une table cle/valeur tuait les trois sections d apres.
const section = (titre, fn) => {
  console.log('');
  console.log('== ' + titre);
  try {
    fn();
  } catch (e) {
    alerte('section « ' + titre + ' » interrompue : ' + e.message);
  }
};

// -- 1. SYNCHRONISATION -----------------------------------------------------
section('Synchronisation', () => {

const file = compte('sync_outbox');
const quar = compte('sync_outbox_quarantine');
const conf = compte('sync_conflicts');

console.log('  file d attente (sync_outbox)       : ' + file);
console.log('  refusees par le cloud (quarantine) : ' + quar);
console.log('  desaccords enregistres             : ' + conf);

if (file === null) {
  alerte('sync_outbox absente : le paquet 0.3.29 n est pas en place');
} else if (file > 5000) {
  alerte('file tres chargee — la synchronisation est en retard');
}

// Une ligne en quarantaine est une ligne que le cloud a REFUSEE. C est la
// seule cause qui produise durablement « ca ne remonte pas » : la file, elle,
// se vide toute seule.
if (quar > 0) {
  // ENTREES contre LIGNES. sync_outbox_quarantine n a pas d index unique sur
  // (tablename, row_id) — contrairement a sync_outbox depuis I35. Et
  // syncRepair.reconcile() reenfile toute ligne locale ABSENTE du Cloud. Une
  // ligne que le Cloud refuse structurellement n y sera jamais : elle est donc
  // reenfilee, repoussee, refusee, et remise en quarantaine A CHAQUE PASSE,
  // avec une nouvelle entree a chaque fois. L ecart entre les deux chiffres
  // ci-dessous mesure cette boucle.
  const d = un('SELECT COUNT(DISTINCT tablename || char(31) || row_id) n'
    + ' FROM sync_outbox_quarantine').n;
  console.log('  dont LIGNES distinctes             : ' + d);
  if (d > 0 && quar / d >= 3) {
    alerte('boucle : ' + Math.round(quar / d) + ' entrees par ligne reelle'
      + ' — la quarantaine se reempile a chaque passe de reparation');
  }
  alerte(d + ' ligne(s) REFUSEES par le cloud — voir les motifs');

  console.log('');
  console.log('  Motifs de refus (lignes distinctes), les 10 premiers :');
  const q = 'SELECT tablename, last_error,'
    + ' COUNT(DISTINCT row_id) d, COUNT(*) n'
    + ' FROM sync_outbox_quarantine'
    + ' GROUP BY tablename, last_error ORDER BY d DESC LIMIT 10';
  for (const r of tous(q)) {
    console.log('    ' + r.d + ' lignes (' + r.n + ' entrees)  '
      + r.tablename);
    console.log('       -> ' + r.last_error);
  }
}

if (conf > 0 && existe('sync_conflicts')) {
  const q0 = 'SELECT COUNT(*) n FROM sync_conflicts WHERE resolved_at IS NULL';
  const ouverts = un(q0).n;
  console.log('  dont non tranches par un humain    : ' + ouverts);
  if (ouverts > 0) {
    console.log('');
    console.log('  A trancher dans l ecran Synchronisation, les 5 derniers :');
    const q = 'SELECT tablename, col, val_local, val_distant, retenu'
      + ' FROM sync_conflicts WHERE resolved_at IS NULL'
      + ' ORDER BY at DESC LIMIT 5';
    for (const r of tous(q)) {
      console.log('    ' + r.tablename + '.' + r.col);
      console.log('       a l ecole : ' + r.val_local);
      console.log('       en ligne  : ' + r.val_distant);
      console.log('       ' + (r.retenu
        ? 'tranche automatiquement : ' + r.retenu
        : 'NON TRANCHE'));
    }
  }
}

// sync_cursor est une table CLE/VALEUR (name, value), pas une table a
// colonnes nommees : « SELECT MAX(last_pull_at) » y leve une exception.
if (existe('sync_cursor')) {
  const c = un("SELECT value FROM sync_cursor WHERE name = 'pull_at'");
  console.log('  derniere descente du cloud         : '
    + (c && c.value ? c.value : '(jamais)'));
}

});

// -- 2. CAPTURE DES ECRITURES -----------------------------------------------
// Les deux garde-fous poses en 0.3.29 : sans les declencheurs, des ecritures
// contournent la file ; sans l index unique, la file regonfle sans limite.
section('Capture des ecritures (0.3.29)', () => {

const trg = un("SELECT COUNT(*) n FROM sqlite_master"
  + " WHERE type='trigger' AND name LIKE 'trg_outbox_%'").n;
const idx = un("SELECT COUNT(*) n FROM sqlite_master"
  + " WHERE type='index' AND name='idx_sync_outbox_cle'").n;

console.log('  declencheurs de capture : ' + trg
  + (trg >= 150 ? '  (ok)' : '  (ATTENDU : au moins 150)'));
console.log('  index anti-doublon      : '
  + (idx ? 'present  (ok)' : 'ABSENT'));

if (trg < 150) alerte('des ecritures peuvent encore contourner la file');
if (!idx) alerte('sans index unique, la file peut regonfler');

});

// -- 3. BAREME DES BULLETINS ------------------------------------------------
section('Bareme des bulletins', () => {

const classes = tous('SELECT id, name, grade_max, system FROM classes'
  + ' WHERE grade_max IS NOT NULL ORDER BY name');

let malReglees = 0;
for (const c of classes) {
  const g = un('SELECT COUNT(*) n, MAX(CAST(value AS REAL)) mx FROM grades'
    + " WHERE class_id=? AND value IS NOT NULL AND value<>''", c.id);
  if (!g.n) continue;

  // CRITERE. Une classe est mal reglee quand AUCUNE note saisie n atteint la
  // moitie de son bareme. Sur 652 notes, qu aucune ne depasse 20 alors que le
  // bareme vaut 100 ne peut pas etre un hasard : les enseignants notent sur
  // une echelle, le bulletin en imprime une autre, et il multiplie donc en
  // silence. Le critere est volontairement prudent — une classe ou tout le
  // monde a reellement des notes basses ne le declenche pas, puisqu il faut
  // que le MAXIMUM reste sous la moitie.
  if (g.mx > c.grade_max / 2) continue;

  malReglees++;
  const facteur = c.grade_max / 20;
  console.log('');
  console.log('  CLASSE MAL REGLEE : ' + c.name);
  console.log('    bareme declare : ' + c.grade_max
    + '   systeme : ' + c.system);
  console.log('    notes saisies  : ' + g.n
    + '   la plus haute : ' + g.mx);
  if (facteur > 1) {
    console.log('    CONSEQUENCE : le bulletin multiplie par ' + facteur
      + ' — une note de 13 s imprime ' + (13 * facteur));
  }
  console.log('    CORRECTIF : Classes -> ' + c.name
    + ' -> Modifier la classe -> bareme 20');
  console.log('      (si une sequence est verrouillee, le changement est');
  console.log('       refuse : deverrouiller, corriger, reverrouiller)');

  const mats = tous('SELECT id, name, max FROM subjects'
    + ' WHERE class_id=? ORDER BY name', c.id);
  const fautives = [];
  for (const s of mats) {
    const sg = un('SELECT COUNT(*) n, MAX(CAST(value AS REAL)) mx'
      + " FROM grades WHERE subject_id=? AND value IS NOT NULL AND value<>''",
      s.id);
    if (s.max != 20 || (sg.mx || 0) > 20) {
      fautives.push('      ' + s.name + '   bareme=' + s.max
        + '   note max=' + sg.mx + '   (' + sg.n + ' notes)');
    }
  }
  if (fautives.length) {
    console.log('    MATIERES hors echelle, a remettre a 20 une par une :');
    for (const l of fautives) console.log(l);
  } else {
    console.log('    Les matieres sont toutes a 20 : seule la classe');
    console.log('    est a corriger.');
  }
}

if (malReglees) {
  alerte(malReglees + ' classe(s) au bareme incoherent avec leurs notes');
} else {
  console.log('  Aucune classe mal reglee.');
}

});

// -- 4. VOLUME --------------------------------------------------------------
section('Volume', () => {

const ps = un('PRAGMA page_size').page_size;
const pc = un('PRAGMA page_count').page_count;
const fl = un('PRAGMA freelist_count').freelist_count;
const mo = (n) => (n * ps / 1048576).toFixed(0) + ' Mo';

console.log('  taille de la base : ' + mo(pc));
console.log('  pages libres      : ' + mo(fl)
  + (pc && fl / pc > 0.3 ? '   (un VACUUM les rendrait au disque)' : ''));

for (const t of ['students', 'grades', 'fee_payments',
                 'parent_accounts', 'parent_student_links']) {
  if (existe(t)) console.log('  ' + t.padEnd(21) + ' : ' + compte(t));
}

});

// -- VERDICT ----------------------------------------------------------------
console.log('');
console.log(alertes === 0
  ? 'VERDICT : aucun point d alerte.'
  : 'VERDICT : ' + alertes + ' point(s) d alerte, marques /!\\ ci-dessus.');
JSFIN

"$NODE" "$JS" "$DB"

echo
echo "Fin du diagnostic. Aucune donnee n a ete modifiee."
