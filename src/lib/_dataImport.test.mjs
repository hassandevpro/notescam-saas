// Test du cœur pur de l'import (validation + transformation + idempotence).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { validateBundle, buildImportRecords } from './dataImportCore.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const bundle = JSON.parse(readFileSync(join(__dirname, '../../examples/import-bundle.example.json'), 'utf8'));
const SCHOOL = 'school-1';

let failed = false;
const ok = (cond, msg) => { console.log(`${cond ? '✅' : '❌'} ${msg}`); if (!cond) failed = true; };

// 1) Validation
const v = validateBundle(bundle);
ok(v.ok, `validation OK (${v.errors.length} erreurs)`);
ok(v.stats.years === 2, `2 années détectées (${v.stats.years})`);
ok(v.stats.classes === 2, `2 classes (${v.stats.classes})`);
ok(v.stats.students === 3, `3 inscriptions élèves (${v.stats.students})`);
ok(v.stats.grades === 6, `6 notes (${v.stats.grades})`);
ok(v.stats.teachers === 2, `2 enseignants (${v.stats.teachers})`);

// 2) Transformation (base vide)
const { out, reused } = buildImportRecords(bundle, SCHOOL, {});
ok(out.classes.length === 2, `2 classes créées (${out.classes.length})`);
ok(out.subjects.length === 4, `4 matières créées (2/classe) (${out.subjects.length})`);
ok(out.students.length === 3, `3 lignes élèves — Paul compte 2× (2 années) (${out.students.length})`);
ok(out.teachers.length === 2, `2 enseignants créés (${out.teachers.length})`);
ok(out.payments.length === 2, `2 versements (${out.payments.length})`);

// grades : 1 enregistrement par (classe,élève,séquence). Paul 6eA a séq 1 et 2 → 2 records.
const paul6e = out.students.find((s) => s.matricule === 'M-2019-001' && out.classes.find((c) => c.id === s.class_id)?.current_year === '2019-2020');
const paulRecs = out.grades.filter((g) => g.student_id === paul6e.id);
ok(paulRecs.length === 2, `Paul (6e A) : 2 enregistrements de notes — séq 1 & 2 (${paulRecs.length})`);
const seq1 = paulRecs.find((g) => g.sequence === 1);
ok(Object.keys(seq1.scores).length === 2, `séq 1 de Paul : 2 matières notées (${Object.keys(seq1.scores).length})`);
ok(Object.values(seq1.scores).every((v) => typeof v === 'string'), 'valeurs de notes stockées en string');

// FK : tout subject_id des scores doit pointer une matière créée de la MÊME classe
const subjById = new Map(out.subjects.map((s) => [s.id, s]));
const fkOk = out.grades.every((g) => Object.keys(g.scores).every((sid) => subjById.get(sid)?.class_id === g.class_id));
ok(fkOk, 'toutes les notes pointent une matière de leur propre classe (FK cohérente)');

// frais calculés depuis payments si frais_payes absent (Paul 6e : 25000+25000)
const paulFee = out.fees.find((f) => f.student_id === paul6e.id);
ok(paulFee.frais_payes === 50000, `frais_payes déduits des versements (${paulFee.frais_payes})`);

// gender normalisé
ok(out.students.every((s) => ['Masculin', 'Feminin', null].includes(s.gender)), 'genres normalisés');

// 3) Idempotence : 2e passe en réinjectant ce qui vient d'être créé.
//    Entités à PK (classes/subjects/students/teachers) → réutilisées, 0 création.
//    Versements (pas de clé naturelle en base) → dédoublonnés, 0 doublon.
//    grades/fees sont ré-émis mais écrasent par clé/id (sûrs, pas de doublon).
const existing = { classes: out.classes, subjects: out.subjects, students: out.students, fees: out.fees, teachers: out.teachers, payments: out.payments };
const second = buildImportRecords(bundle, SCHOOL, existing);
ok(second.out.classes.length === 0, `2e passe : 0 classe recréée (${second.out.classes.length})`);
ok(second.out.subjects.length === 0, `2e passe : 0 matière recréée (${second.out.subjects.length})`);
ok(second.out.students.length === 0, `2e passe : 0 élève recréé (${second.out.students.length})`);
ok(second.out.teachers.length === 0, `2e passe : 0 enseignant recréé (${second.out.teachers.length})`);
ok(second.out.payments.length === 0, `2e passe : 0 versement dupliqué (${second.out.payments.length})`);
ok(second.reused.classes === 2 && second.reused.students === 3, `réutilisation: ${second.reused.classes} classes, ${second.reused.students} élèves`);

// ═══════════ 4) NOUVEAUX MODULES (reprise depuis un autre logiciel) ═══════════
// Personnel/RH + catalogue de frais + immobilisations, y compris un bundle SANS
// années (import purement « personnel »).
console.log('\n──── Nouveaux modules (personnel / frais / immobilisations) ────');
const modBundle = {
  format: 'notescam-import/v1',
  staff: [
    { first_name: 'Awa', last_name: 'Sow', matricule: 'P-001', department: 'comptabilite', fonction: 'Comptable', gender: 'F',
      contracts: [{ type: 'cdi', start_date: '2022-09-01', salary: 150000 }],
      leaves: [{ type: 'annuel', start_date: '2024-08-01', end_date: '2024-08-15', days: 15 }],
      career_events: [{ event_date: '2023-01-01', type: 'promotion', title: 'Chef comptable' }] },
    { name: 'Jean Bikoko', department: 'administration' },
  ],
  fee_catalog: [
    { name: 'Frais de cantine', category: 'cantine', amount: 30000, academic_year: '2025-2026', mandatory: false, optional: true, payment_type: 'mensuel' },
    { name: 'Assurance', category: 'assurance', amount: 5000, academic_year: '2025-2026', mandatory: true },
  ],
  assets: [
    { name: 'Photocopieuse', category: 'materiel', asset_number: 'IMM-001', value: 800000, acquisition_date: '2023-05-10' },
  ],
};
const mv = validateBundle(modBundle);
ok(mv.ok, `bundle « modules seuls » (sans années) validé (${mv.errors.length} err)`);
ok(mv.stats.staff === 2, `2 membres du personnel détectés (${mv.stats.staff})`);
ok(mv.stats.feeCatalog === 2, `2 frais au catalogue (${mv.stats.feeCatalog})`);
ok(mv.stats.assets === 1, `1 immobilisation (${mv.stats.assets})`);

const m1 = buildImportRecords(modBundle, SCHOOL, {});
ok(m1.out.staff.length === 2, `2 agents créés (${m1.out.staff.length})`);
ok(m1.out.staff.find((s) => s.matricule === 'P-001')?.name === 'Awa Sow', 'nom composé prénom + nom');
ok(m1.out.hr_contracts.length === 1 && m1.out.hr_leaves.length === 1 && m1.out.hr_career_events.length === 1, 'satellites RH créés (contrat / congé / carrière)');
ok(m1.out.hr_contracts[0].staff_id === m1.out.staff.find((s) => s.matricule === 'P-001').id, 'contrat rattaché au bon agent (FK résolue)');
ok(m1.out.fee_catalog.length === 2 && m1.out.fee_catalog.find((f) => f.name === 'Assurance').mandatory === 1, 'catalogue de frais créé (obligatoire mappé)');
ok(m1.out.assets.length === 1 && m1.out.assets[0].value === 800000, 'immobilisation créée');

// Idempotence : 2e passe en réinjectant l'existant → 0 doublon.
const mExisting = { staff: m1.out.staff, hr_contracts: m1.out.hr_contracts, hr_leaves: m1.out.hr_leaves, hr_career_events: m1.out.hr_career_events, feeCatalog: m1.out.fee_catalog, assets: m1.out.assets };
const m2 = buildImportRecords(modBundle, SCHOOL, mExisting);
ok(m2.out.staff.length === 0, `2e passe : 0 agent recréé (${m2.out.staff.length})`);
ok(m2.out.hr_contracts.length === 0 && m2.out.hr_leaves.length === 0 && m2.out.hr_career_events.length === 0, '2e passe : 0 satellite RH dupliqué');
ok(m2.out.fee_catalog.length === 0, `2e passe : 0 frais dupliqué (${m2.out.fee_catalog.length})`);
ok(m2.out.assets.length === 0, `2e passe : 0 immobilisation dupliquée (${m2.out.assets.length})`);
ok(m2.reused.staff === 2 && m2.reused.assets === 1, `réutilisation modules : ${m2.reused.staff} agents, ${m2.reused.assets} actif`);

console.log(failed ? '\n=== ÉCHEC ===' : '\n=== OK ===');
process.exit(failed ? 1 : 0);
