#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Convertisseur CSV (ancienne app) → format pivot NotesCam v1.
//
// Squelette À ADAPTER : tu ne touches QU'À la section MAP ci-dessous, qui associe
// chaque champ du pivot à un EN-TÊTE de colonne de tes fichiers CSV. Tout
// l'assemblage (regroupement année → classe → élève) et la validation sont déjà
// faits (lib/pivot-assemble.mjs).
//
// Deux organisations possibles, sans changer le code :
//   • PLUSIEURS fichiers (un par entité) : classes.csv, eleves.csv, notes.csv…
//   • UN SEUL fichier « à plat » (une ligne par note, infos répétées) : pointe
//     toutes les entités vers le même `file` et mappe les colonnes qui existent.
//     Les classes/matières/élèves répétés sont dédoublonnés automatiquement.
//
// Parseur CSV autonome (aucune dépendance) : gère guillemets, virgules/;, CRLF, BOM.
// Délimiteur détecté automatiquement (`,` ou `;` — Excel FR utilise souvent `;`).
//
// USAGE
//   node scripts/csv-to-pivot.mjs --list <dossier-csv>
//        → liste les .csv du dossier et leurs colonnes (en-têtes).
//   node scripts/csv-to-pivot.mjs <dossier-csv> [sortie.json]
//        → produit le pivot (défaut: import-bundle.json) et le valide.
//
// Format pivot & règles : voir IMPORT_FORMAT.md.
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateBundle } from '../src/lib/dataImportCore.js';
import { assemblePivot } from './lib/pivot-assemble.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ═════════════════════════════════════════════════════════════════════════════
// ▼▼▼  ZONE À ADAPTER  ▼▼▼
//
// Pour chaque entité : `file` = nom du CSV (dans le dossier passé en argument) ;
// `cols` = { champ_pivot: 'En-tête CSV' }. Mets une valeur à `null` si la colonne
// n'existe pas, ou l'entité entière à `null` si elle n'a pas de fichier.
//
// `class_key` / `student_key` : identifiant STABLE de la source (PK, ou à défaut
// une colonne unique) servant à relier les lignes. Pour un fichier à plat sans id
// d'élève, tu peux pointer `student_key` vers la colonne matricule (ou nom).
// ═════════════════════════════════════════════════════════════════════════════
const MAP = {
  teachers: {
    file: 'enseignants.csv',
    cols: { name: 'nom', email: 'email', phone: 'telephone', specialty: 'matiere' },
  },
  classes: {
    file: 'classes.csv',
    cols: { year: 'annee', class_key: 'id', name: 'nom', level: 'niveau', section: 'section', system: null, teacher: null },
  },
  subjects: {
    file: 'matieres.csv',
    cols: { year: 'annee', class_key: 'classe_id', name: 'nom', coef: 'coefficient', max: 'note_max' },
  },
  enrollments: {
    file: 'inscriptions.csv',
    cols: { year: 'annee', class_key: 'classe_id', student_key: 'eleve_id', name: 'nom_complet', matricule: 'matricule', gender: 'sexe', date_naissance: 'date_naissance', statut: 'statut' },
  },
  grades: {
    file: 'notes.csv',
    cols: { year: 'annee', class_key: 'classe_id', student_key: 'eleve_id', subject: 'matiere', sequence: 'sequence', value: 'valeur' },
  },
  fees: {
    file: 'frais.csv',
    cols: { year: 'annee', student_key: 'eleve_id', frais_annuels: 'montant_annuel', frais_payes: 'montant_paye' },
  },
  payments: {
    file: 'versements.csv',
    cols: { year: 'annee', student_key: 'eleve_id', amount: 'montant', date: 'date_paiement', note: 'libelle' },
  },
};
// ═════════════════════════════════════════════════════════════════════════════
// ▲▲▲  FIN DE LA ZONE À ADAPTER  ▲▲▲
// ═════════════════════════════════════════════════════════════════════════════

// ─── Parseur CSV autonome ────────────────────────────────────────────────────
function detectDelimiter(headerLine) {
  const c = (headerLine.match(/,/g) || []).length;
  const s = (headerLine.match(/;/g) || []).length;
  const t = (headerLine.match(/\t/g) || []).length;
  if (t > c && t > s) return '\t';
  return s > c ? ';' : ',';
}

function parseCsv(text) {
  text = text.replace(/^﻿/, '');                 // BOM
  if (!text.trim()) return [];
  const firstLine = text.slice(0, text.search(/\r?\n/) >= 0 ? text.search(/\r?\n/) : text.length);
  const delim = detectDelimiter(firstLine);

  const rows = [];
  let field = '', row = [], inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delim) {
      row.push(field); field = '';
    } else if (ch === '\n') {
      row.push(field); rows.push(row); field = ''; row = [];
    } else if (ch === '\r') {
      // ignore (géré par \n)
    } else field += ch;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }

  const header = (rows.shift() || []).map((h) => h.trim());
  return rows
    .filter((r) => r.some((v) => String(v).trim() !== ''))   // saute les lignes vides
    .map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? '').trim()])));
}

function readCsv(dir, file) {
  const path = join(dir, file);
  if (!existsSync(path)) return null;
  return parseCsv(readFileSync(path, 'utf8'));
}

// Applique le mapping cols (champ_pivot -> en-tête CSV) à chaque ligne brute.
function mapRows(records, cols) {
  return records.map((rec) => {
    const out = {};
    for (const [field, header] of Object.entries(cols)) {
      if (header == null) continue;
      const v = rec[header];
      out[field] = v === '' ? undefined : v;
    }
    return out;
  });
}

// ─── Mode --list ─────────────────────────────────────────────────────────────
function listDir(dir) {
  const files = readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.csv'));
  if (!files.length) { console.log(`(aucun .csv dans ${dir})`); return; }
  for (const f of files) {
    const recs = parseCsv(readFileSync(join(dir, f), 'utf8'));
    const cols = recs.length ? Object.keys(recs[0]) : [];
    console.log(`\n📋 ${f}  (${recs.length} lignes)`);
    console.log(`     colonnes : ${cols.join(', ') || '(vide)'}`);
  }
  console.log('');
}

// ─── Construction ────────────────────────────────────────────────────────────
function loadEntity(dir, entity) {
  const cfg = MAP[entity];
  if (!cfg || !cfg.file) return [];
  const recs = readCsv(dir, cfg.file);
  if (recs == null) { console.warn(`⚠️  ${entity}: fichier « ${cfg.file} » introuvable — ignoré.`); return []; }
  return mapRows(recs, cfg.cols);
}

function buildPivot(dir) {
  return assemblePivot({
    teachers:    loadEntity(dir, 'teachers'),
    classRows:   loadEntity(dir, 'classes'),
    subjectRows: loadEntity(dir, 'subjects'),
    enrollRows:  loadEntity(dir, 'enrollments'),
    gradeRows:   loadEntity(dir, 'grades'),
    feeRows:     loadEntity(dir, 'fees'),
    payRows:     loadEntity(dir, 'payments'),
  });
}

// ─── CLI ─────────────────────────────────────────────────────────────────────
function main() {
  const args = process.argv.slice(2);
  const isList = args.includes('--list');
  const positional = args.filter((a) => !a.startsWith('--'));
  const dir = positional[0];

  if (!dir) {
    console.error('Usage:\n  node scripts/csv-to-pivot.mjs --list <dossier-csv>\n  node scripts/csv-to-pivot.mjs <dossier-csv> [sortie.json]');
    process.exit(1);
  }
  if (!existsSync(dir)) { console.error(`❌ Dossier introuvable : ${dir}`); process.exit(1); }

  if (isList) { listDir(dir); return; }

  const outPath = positional[1] || join(__dirname, '..', 'import-bundle.json');
  const { bundle, warnings } = buildPivot(dir);

  const check = validateBundle(bundle);
  const s = check.stats;
  console.log(`\n📦 Pivot construit :`);
  console.log(`   ${s.years} année(s) · ${s.classes} classe(s) · ${s.subjects} matière(s)`);
  console.log(`   ${s.students} inscription(s) · ${s.grades} note(s) · ${s.teachers} enseignant(s)`);
  console.log(`   ${s.fees} frais · ${s.payments} versement(s)`);

  if (warnings.length) {
    console.log(`\n⚠️  ${warnings.length} avertissement(s) d'assemblage (10 premiers) :`);
    for (const w of warnings.slice(0, 10)) console.log(`   - ${w}`);
  }
  if (!check.ok) {
    console.error(`\n❌ Pivot invalide :`);
    for (const e of check.errors) console.error(`   - ${e}`);
    process.exit(1);
  }
  if (check.warnings.length) console.log(`\nℹ️  ${check.warnings.length} avertissement(s) de validation (mineurs).`);

  writeFileSync(outPath, JSON.stringify(bundle, null, 2), 'utf8');
  console.log(`\n✅ Écrit dans ${outPath}`);
  console.log(`   → NotesCam → Paramètres → Import de données → déposer ce fichier.\n`);
}

main();
