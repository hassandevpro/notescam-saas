// Insère les élèves d'un fichier Excel dans une école, côté Cloud.
//
// POURQUOI CE SCRIPT PLUTÔT QUE L'ÉCRAN D'IMPORT : l'écran crée une fiche par
// ligne sans jamais rapprocher des élèves existants (addStudent génère un uuid
// neuf à chaque appel, et la garde anti-doublon ne couvre que la saisie
// manuelle). Ici on REFUSE d'insérer un matricule ou un couple nom+naissance
// déjà présent : une relance ne peut donc pas dupliquer l'effectif.
//
// Les lignes sont fabriquées par `rawRowsToStudents` — la fonction d'import de
// l'application elle-même — pour que le résultat soit identique à ce que
// produirait l'écran : même construction du nom, même normalisation du sexe, des
// dates et des statuts. Reproduire ces règles à la main, c'est se condamner à
// diverger d'elles un jour.
//
// Usage :
//   SUPABASE_ACCESS_TOKEN=... node scripts/import-bright-continent.mjs <fichier.xlsx> --check
//   SUPABASE_ACCESS_TOKEN=... node scripts/import-bright-continent.mjs <fichier.xlsx> --apply
import XLSX from 'xlsx';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const FICHIER = process.argv[2];
const APPLY = process.argv.includes('--apply');
if (!FICHIER) { console.error('Usage : node scripts/import-bright-continent.mjs <fichier.xlsx> [--check|--apply]'); process.exit(1); }

// Jeton : jamais dans le dépôt. Lu dans l'environnement, ou dans .env.local.
if (!process.env.SUPABASE_ACCESS_TOKEN) {
  try {
    for (const l of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
      const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] ??= m[2];
    }
  } catch { /* pas de .env.local : le jeton doit venir de l'environnement */ }
}
const REF = process.env.SUPABASE_PROJECT_REF;
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!TOKEN) { console.error('SUPABASE_ACCESS_TOKEN absent — rien exécuté.'); process.exit(1); }

const ECOLE = 'BRIGHT CONTINENT';
// Libellés du fichier qui ne correspondent à aucune classe de l'école, et la
// classe visée. Validé par l'établissement le 14/09/2026 — ces rapprochements ne
// se devinent pas : « NI » peut être Nursery 1 comme autre chose.
const CLASSES_EQUIV = {
  'NI': 'Nursery 1',
  'Class II': 'Class 2',
  'Class One': 'Class 1',
  'One (1)': 'Class 1',
  'Class II (observation)': 'Class 2',
};
// Élèves dont le fichier ne porte aucune classe : la base refuse un élève sans
// classe (class_id NOT NULL), l'établissement les a donc désignées une par une.
const CLASSE_PAR_MATRICULE = {
  s260001: 'Pre-Nursery',
  s260009: 'Nursery 1',
  s260026: 'CM1',
};

const sql = async (query) => {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status} — ${t.slice(0, 400)}`);
  return JSON.parse(t);
};
const lit = (v) => (v === null || v === undefined || v === '' ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);

// ── La fonction d'import de l'application, réutilisée telle quelle ───────────
const src = readFileSync('src/lib/exportCsv.js', 'utf8');
const extrait = (nom) => {
  const a = src.indexOf(`function ${nom}`);
  if (a < 0) throw new Error(`fonction introuvable : ${nom}`);
  const b = src.indexOf('\nfunction ', a + 10);
  return src.slice(a, b > 0 ? b : undefined);
};
const dep = ['normalizeDate', 'normalizeGender', 'normalizeStudentName', 'normalizeStatut', 'normalizeStatutEtab']
  .filter((n) => src.includes(`function ${n}`));
const rawRowsToStudents = new Function('msg',
  `${dep.map(extrait).join('\n')}\n${extrait('rawRowsToStudents')}\nreturn rawRowsToStudents;`)(() => 'erreur');

// ── Lecture ─────────────────────────────────────────────────────────────────
const wb = XLSX.readFile(FICHIER);
const aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '', raw: false });
const brut = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: false });
const { rows, error } = rawRowsToStudents(aoa);
if (error) { console.error('Fichier illisible :', error); process.exit(1); }
if (rows.length !== brut.length) { console.error(`Incohérence : ${rows.length} lues pour ${brut.length} lignes.`); process.exit(1); }

const [ecole] = await sql(`SELECT id, name, current_year FROM schools WHERE name ILIKE '%${ECOLE}%'`);
if (!ecole) { console.error(`École introuvable : ${ECOLE}`); process.exit(1); }
const classes = await sql(`SELECT id, name FROM classes WHERE school_id = '${ecole.id}'`);
const classeParNom = new Map(classes.map((c) => [c.name.trim().toLowerCase(), c.id]));

// Clé de rapprochement : nom NORMALISÉ + date de naissance. La normalisation
// n'est pas un détail — « ONDOA AKOA HAILEY FELICIA » est enregistrée en base
// avec un espace final. Sans `trim` et sans réduction des espaces multiples, la
// comparaison échouait et l'élève aurait été insérée une seconde fois. C'est
// précisément le doublon que ce script existe pour empêcher.
const cle = (nom, dn) => `${String(nom || '').trim().replace(/\s+/g, ' ').toUpperCase()}|${dn || ''}`;

const CHAMPS_FICHE = ['matricule', 'gender', 'statut', 'date_naissance', 'lieu_naissance',
  'adresse', 'parent_phone', 'contact_urgence', 'nom_pere', 'profession_pere',
  'nom_mere', 'profession_mere', 'tuteur'];

const existants = await sql(`SELECT id, matricule, name AS nom, date_naissance::text AS dn,
  ${CHAMPS_FICHE.filter((c) => c !== 'date_naissance').join(', ')}
  FROM students WHERE school_id = '${ecole.id}'`);
const matPris = new Set(existants.map((e) => (e.matricule || '').trim()).filter(Boolean));
const cleNomDn = new Set(existants.map((e) => cle(e.nom, e.dn)));
// Rapprochement sur le seul nom : un même enfant réinscrit avec une date de
// naissance corrigée ne doit pas non plus passer deux fois. Signalé, pas refusé
// en silence — l'homonymie existe, surtout dans une fratrie.
const nomsExistants = new Map(existants.map((e) => [cle(e.nom, ''), e.matricule || '(sans matricule)']));

console.log(`École : ${ecole.name} (${ecole.current_year})`);
console.log(`Fichier : ${rows.length} élèves\n`);

// Un élève déjà présent n'est pas réinséré : sa fiche est COMPLÉTÉE, et
// uniquement sur les cases vides. On ne remplace jamais une valeur déjà
// enregistrée — c'est la règle posée par l'établissement, et c'est aussi la
// prudence élémentaire : la base est la référence, le fichier peut être plus
// ancien ou contenir une coquille.
const parCleExacte = new Map(existants.map((e) => [cle(e.nom, e.dn), e]));
const parNomSeul = new Map(existants.map((e) => [cle(e.nom, ''), e]));

const aInserer = []; const aCompleter = []; const refuses = [];
rows.forEach((r, i) => {
  const mat = String(brut[i].matricule || '').trim();
  const libelle = String(brut[i].classe || '').trim();
  const voulue = CLASSE_PAR_MATRICULE[mat] || CLASSES_EQUIV[libelle] || libelle;
  const classId = classeParNom.get(voulue.toLowerCase());
  // Déjà en base ? On complète au lieu d'insérer.
  const deja = parCleExacte.get(cle(r.name, r.date_naissance)) || parNomSeul.get(cle(r.name, ''));
  if (deja) {
    const vides = CHAMPS_FICHE.filter((c) => {
      const actuel = c === 'date_naissance' ? deja.dn : deja[c];
      return !String(actuel ?? '').trim() && String(r[c] ?? '').trim();
    });
    if (matPris.has(mat) && !String(deja.matricule ?? '').trim()) vides.splice(vides.indexOf('matricule'), 1);
    if (vides.length) aCompleter.push({ id: deja.id, mat, nom: r.name, vides, valeurs: r });
    else refuses.push({ mat, nom: r.name, motif: 'déjà inscrit, fiche déjà complète — rien à ajouter' });
    return;
  }
  const motif = !voulue ? 'aucune classe'
    : !classId ? `classe inconnue : ${voulue}`
      : matPris.has(mat) ? `matricule déjà pris par un autre élève : ${mat}`
        : null;
  if (motif) { refuses.push({ mat, nom: r.name, motif }); return; }
  aInserer.push({ ...r, id: randomUUID(), class_id: classId, classe: voulue });
});

console.log(`À INSÉRER (élèves absents de l'école) : ${aInserer.length}`);
for (const e of aInserer) console.log(`  ${String(e.matricule).padEnd(9)} ${String(e.name).padEnd(36)} ${e.classe}`);

if (aCompleter.length) {
  console.log(`\nÀ COMPLÉTER (déjà inscrits, cases vides seulement) : ${aCompleter.length}`);
  for (const c of aCompleter) console.log(`  ${String(c.mat).padEnd(9)} ${String(c.nom).padEnd(36)} ${c.vides.join(', ')}`);
}
if (refuses.length) {
  console.log(`\nLAISSÉS DE CÔTÉ : ${refuses.length}`);
  for (const r of refuses) console.log(`  ${String(r.mat).padEnd(9)} ${String(r.nom).padEnd(36)} ${r.motif}`);
}

if (!APPLY) { console.log('\n(essai à blanc — rien écrit. Relancer avec --apply)'); process.exit(0); }
if (!aInserer.length && !aCompleter.length) { console.log('\nRien à faire.'); process.exit(0); }

// ── Complétion des fiches existantes ────────────────────────────────────────
// `coalesce(colonne, valeur)` : la valeur du fichier ne s'applique QUE si la
// colonne est nulle. Même si le calcul ci-dessus se trompait, la base refuserait
// d'écraser une donnée saisie. Deux garde-fous valent mieux qu'un sur une base
// d'établissement.
for (const c of aCompleter) {
  const set = c.vides.map((col) => `${col} = coalesce(${col}, ${lit(c.valeurs[col])})`).join(', ');
  await sql(`UPDATE students SET ${set}, updated_at = now(), version = coalesce(version,0) + 1
             WHERE id = '${c.id}'`);
}
if (aCompleter.length) console.log(`\n${aCompleter.length} fiche(s) complétée(s).`);

// ── Écriture ────────────────────────────────────────────────────────────────
// `updated_at` au présent : sync-pull est un keyset sur (updated_at, id), une
// ligne antidatée resterait derrière le curseur du serveur de l'école et ne
// descendrait jamais.
const COLS = ['id', 'school_id', 'class_id', 'name', 'matricule', 'gender', 'statut',
  'date_naissance', 'lieu_naissance', 'adresse', 'parent_phone', 'contact_urgence',
  'nom_pere', 'profession_pere', 'nom_mere', 'profession_mere', 'tuteur'];
const valeurs = aInserer.map((e) => `(${COLS.map((c) => {
  if (c === 'school_id') return lit(ecole.id);
  return lit(e[c] ?? null);
}).join(', ')}, now(), now(), 1)`).join(',\n  ');

const res = await sql(`
  INSERT INTO students (${COLS.join(', ')}, created_at, updated_at, version)
  VALUES
  ${valeurs}
  RETURNING matricule, name`);
console.log(`\n${res.length} élève(s) inséré(s).`);
