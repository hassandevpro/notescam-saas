#!/usr/bin/env bash
# =============================================================================
# NotesCam — « est-ce que les enseignants voient leur matière et leurs élèves
#              pour saisir les notes ? »
#
# À lancer SUR LE SERVEUR LINUX DE L'ÉCOLE. LECTURE SEULE : aucune écriture,
# aucun service redémarré. Rejouable autant de fois que voulu.
#
# ── CE QUE LE LOGICIEL EXIGE, ET QUE CE SCRIPT VÉRIFIE ──────────────────────
#
# Un enseignant voit une CLASSE s'il remplit l'une des deux conditions
# (schoolStore.init) :
#     a) il en est le TITULAIRE          -> classes.teacher_id = lui
#     b) une MATIÈRE de cette classe lui est affectée -> subjects.teacher_id
#
# Ce qu'il peut SAISIR dépend ensuite du mode de l'établissement
# (schools.grade_entry_mode, cf. lib/teacherScope.js) :
#     'principal' (défaut) -> aucune restriction par matière : il saisit tout
#                             sur les classes qu'il voit ;
#     'subject'            -> seulement SES matières… AVEC UNE EXCEPTION
#                             capitale au fondamental.
#
# L'EXCEPTION DU FONDAMENTAL. En maternelle et au primaire, le titulaire tient
# sa classe ENTIÈRE : il garde toutes les matières/compétences même en mode
# 'subject', sans qu'aucune ligne `subjects` lui soit nommément affectée. C'est
# le cas NORMAL d'une école primaire. Un primaire dont les classes n'ont PAS de
# titulaire est donc la panne la plus probable : l'enseignant se voit répondre
# « Aucune classe attribuée » alors que tout le reste est correct.
#
# POUR LE CARNET MINISTÉRIEL DU PRIMAIRE, un enseignant NON titulaire a besoin
# en plus que sa matière se rattache à une compétence du référentiel : soit par
# `subjects.prim_competence_id`, soit par le NOM de la matière (« Lecture » et
# « Grammaire » tombent sur la compétence de français). Le rattachement par nom
# ne se vérifie pas en SQL — ce script compte donc les liens EXPLICITES, et un
# compte à zéro n'est pas forcément une panne si les matières portent des noms
# reconnaissables. Le titulaire, lui, n'a besoin d'aucun des deux.
#
# Usage :
#     sudo bash diagnostic-saisie-notes.sh
# =============================================================================

DB=/var/lib/notescam/data/notescam.db
NODE=/opt/notescam/node/bin/node

C_OK=$'\033[32m'; C_KO=$'\033[31m'; C_WARN=$'\033[33m'; C_T=$'\033[36m'; C_0=$'\033[0m'
[[ -t 1 ]] || { C_OK=""; C_KO=""; C_WARN=""; C_T=""; C_0=""; }

printf '%s' "$C_T"
cat <<'BANNER'
+---------------------------------------------------------------+
|  NotesCam — saisie des notes par les enseignants              |
|  Lecture seule. Rien n'est modifie.                           |
+---------------------------------------------------------------+
BANNER
printf '%s' "$C_0"

[[ "$(id -u)" -eq 0 ]] || { printf '%s[KO]%s   À lancer avec sudo : la base n'"'"'est pas lisible autrement.\n' "$C_KO" "$C_0"; exit 1; }
[[ -r "$DB" ]]   || { printf '%s[KO]%s   Base introuvable : %s\n' "$C_KO" "$C_0" "$DB"; exit 1; }
[[ -x "$NODE" ]] || { printf '%s[KO]%s   Node embarqué introuvable : %s\n' "$C_KO" "$C_0" "$NODE"; exit 1; }

# La base est lue EN DIRECT, sans copie. Verifie le 2026-10-12 sur une base
# detenue par le serveur en marche : SQLite en mode WAL accepte un second
# lecteur, et les SELECT / PRAGMA passent sans gener personne.
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

cat > "$TMP/diag.js" <<'JS'
const { DatabaseSync } = require('node:sqlite');
// `node script.js <base>` : argv[0]=node, argv[1]=LE SCRIPT, argv[2]=la base.
const db = new DatabaseSync(process.argv[2]);
const q = (sql, ...a) => { try { return db.prepare(sql).all(...a); } catch (e) { return { _err: e.message }; } };
const one = (sql, ...a) => { const r = q(sql, ...a); return Array.isArray(r) ? r[0] : r; };

const out = { ecoles: [], classes: [], enseignants: [], erreurs: [] };

const ecoles = q('SELECT id, name, bulletin_engine, grade_entry_mode FROM schools');
if (ecoles._err) { out.erreurs.push('schools: ' + ecoles._err); }
else out.ecoles = ecoles;

// Par classe : titulaire, matieres, affectations, liens de competence, effectif.
const cls = q(`
  SELECT c.id, c.name, c.level, c.teacher_id,
         (SELECT name FROM teachers t WHERE t.id = c.teacher_id)                       AS titulaire,
         (SELECT count(*) FROM subjects s WHERE s.class_id = c.id)                     AS nb_matieres,
         (SELECT count(*) FROM subjects s WHERE s.class_id = c.id
            AND s.teacher_id IS NOT NULL AND s.teacher_id <> '')                       AS nb_affectees,
         (SELECT count(*) FROM students st WHERE st.class_id = c.id
            AND (st.archived_at IS NULL OR st.archived_at = ''))                       AS nb_eleves
    FROM classes c ORDER BY c.name`);
if (cls._err) out.erreurs.push('classes: ' + cls._err);
else out.classes = cls;

// Lien matiere -> competence du primaire, si la colonne existe.
const colsSub = q('PRAGMA table_info(subjects)');
const aPrimCol = Array.isArray(colsSub) && colsSub.some((c) => c.name === 'prim_competence_id');
if (aPrimCol) {
  for (const c of out.classes) {
    const r = one(`SELECT count(*) AS n FROM subjects
                    WHERE class_id = ? AND prim_competence_id IS NOT NULL
                      AND prim_competence_id <> ''`, c.id);
    c.nb_liees_competence = r && r.n != null ? r.n : 0;
  }
} else {
  out.colonneAbsente = 'subjects.prim_competence_id';
}

// Par enseignant : compte-t-il un compte de connexion, des classes, des matieres ?
const ens = q(`
  SELECT t.id, t.name, t.email,
         (SELECT count(*) FROM classes  c WHERE c.teacher_id  = t.id) AS titulaire_de,
         (SELECT count(*) FROM subjects s WHERE s.teacher_id  = t.id) AS matieres,
         (SELECT count(DISTINCT s.class_id) FROM subjects s WHERE s.teacher_id = t.id) AS classes_par_matiere
    FROM teachers t
   WHERE (t.active IS NULL OR t.active <> 0)
   ORDER BY t.name`);
if (ens._err) out.erreurs.push('teachers: ' + ens._err);
else out.enseignants = ens;

// Le compte de connexion : un enseignant sans compte local ne se connecte pas,
// donc ne saisit rien, quelles que soient ses affectations.
for (const e of out.enseignants) {
  const r = one('SELECT count(*) AS n FROM users WHERE lower(email) = lower(?)', e.email || '');
  e.compte_local = r && r.n ? true : false;
}

console.log(JSON.stringify(out));
JS

JSON_OUT="$("$NODE" "$TMP/diag.js" "$DB" 2>/dev/null)"
[[ -n "$JSON_OUT" ]] || { printf '%s[KO]%s   Lecture de la base impossible.\n' "$C_KO" "$C_0"; exit 1; }

printf '%s\n' "$JSON_OUT" > "$TMP/out.json"
cat > "$TMP/rapport.js" <<'JS'
const d = JSON.parse(require('node:fs').readFileSync(process.argv[2], 'utf8'));
const T = (s) => console.log('\n=== ' + s + ' ===');
const pad = (s, n) => String(s == null ? '' : s).padEnd(n);
const soucis = [];

T('Reglages de l etablissement');
for (const e of d.ecoles) {
  const mode = e.grade_entry_mode === 'subject' ? 'subject' : 'principal';
  console.log('  ecole           : ' + e.name);
  console.log('  bulletins       : ' + (e.bulletin_engine || 'classic'));
  console.log('  saisie des notes: ' + mode
    + (mode === 'principal'
      ? '  -> aucune restriction par matiere'
      : '  -> chacun ne saisit QUE ses matieres (sauf titulaire du fondamental)'));
}

T('Par classe');
console.log('  ' + pad('classe', 16) + pad('titulaire', 22) + pad('matieres', 9)
  + pad('affectees', 10) + pad('liees', 7) + pad('eleves', 7) + 'verdict');
console.log('  ' + '-'.repeat(86));
for (const c of d.classes) {
  const liees = c.nb_liees_competence == null ? '-' : c.nb_liees_competence;
  let verdict = 'ok';
  if (!c.nb_eleves)                         verdict = 'aucun eleve';
  else if (!c.teacher_id && !c.nb_affectees) verdict = 'PERSONNE NE PEUT SAISIR';
  else if (!c.teacher_id)                   verdict = 'pas de titulaire';
  if (verdict === 'PERSONNE NE PEUT SAISIR') {
    soucis.push(`${c.name} : ni titulaire ni matiere affectee -> l'enseignant ne verra pas cette classe.`);
  } else if (verdict === 'pas de titulaire') {
    soucis.push(`${c.name} : pas de titulaire. Au primaire/maternelle, c'est le titulaire qui ouvre toute la classe.`);
  }
  console.log('  ' + pad(c.name, 16) + pad(c.titulaire || '—', 22) + pad(c.nb_matieres, 9)
    + pad(c.nb_affectees, 10) + pad(liees, 7) + pad(c.nb_eleves, 7) + verdict);
}
if (d.colonneAbsente) {
  console.log('\n  (colonne ' + d.colonneAbsente + ' absente de cette version :');
  console.log('   la colonne « liees » n est pas mesurable, ce n est pas une panne)');
}

T('Par enseignant');
console.log('  ' + pad('enseignant', 24) + pad('compte', 8) + pad('titulaire de', 13)
  + pad('matieres', 9) + 'verdict');
console.log('  ' + '-'.repeat(74));
for (const e of d.enseignants) {
  let verdict = 'ok';
  if (!e.compte_local)                          verdict = 'AUCUN COMPTE DE CONNEXION';
  else if (!e.titulaire_de && !e.matieres)       verdict = 'RIEN A SAISIR';
  if (verdict !== 'ok') soucis.push(`${e.name} : ${verdict.toLowerCase()}.`);
  console.log('  ' + pad(e.name, 24) + pad(e.compte_local ? 'oui' : 'NON', 8)
    + pad(e.titulaire_de, 13) + pad(e.matieres, 9) + verdict);
}

T('VERDICT');
if (!soucis.length) {
  console.log('Chaque classe a quelqu un pour saisir, et chaque enseignant a');
  console.log('un compte et quelque chose a saisir.');
} else {
  console.log(soucis.length + ' point(s) a corriger :');
  for (const s of soucis) console.log('   - ' + s);
  console.log('\nRappel : au primaire et en maternelle, designer le TITULAIRE de la');
  console.log('classe suffit — il obtient automatiquement toutes les competences,');
  console.log('sans avoir a lui affecter les matieres une par une.');
}
for (const err of d.erreurs) console.log('  (lecture partielle : ' + err + ')');
console.log('\nCopie TOUT l affichage ci-dessus et envoie-le a l editeur.');
JS

"$NODE" "$TMP/rapport.js" "$TMP/out.json"
echo
echo "Appuie sur Entree pour fermer…"
read -r _
