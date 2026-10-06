// QUI PEUT CONFIGURER LES MATIÈRES D'UNE CLASSE.
//
// Ce test existe pour une raison précise : ces fonctions sont le MIROIR CLIENT de
// la policy RLS `subjects: écriture par l'enseignant de la classe`
// (supabase_teacher_edits_subjects.sql). Si l'écran propose un bouton que la base
// refusera, l'écriture part en file hors-ligne et y tourne en boucle sans rien
// dire — exactement le défaut corrigé en cd04fd9 pour `mat_observations`.
//
// Toute modification ici doit être reportée dans la policy, et réciproquement.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canManageClassSubjects, canEditSubjectRow } from './teacherScope.js';

const MOI = 'teacher-1';
const COLLEGUE = 'teacher-2';
const ouverte = { id: 'e1', teacher_edits_subjects: true };
const fermee  = { id: 'e1', teacher_edits_subjects: false };

const maClasse  = { id: 'c1', name: '6e A', level: '6e', teacher_id: MOI };
const sonClasse = { id: 'c2', name: '5e B', level: '5e', teacher_id: COLLEGUE };

const maMatiere  = { id: 's1', class_id: 'c2', name: 'Maths',    teacher_id: MOI };
const saMatiere  = { id: 's2', class_id: 'c2', name: 'Français', teacher_id: COLLEGUE };
const orpheline  = { id: 's3', class_id: 'c2', name: 'EPS',      teacher_id: null };

test('AUCUN RÉGLAGE : le droit ne dépend d’aucune case cochée', () => {
  // L'interrupteur `teacher_edits_subjects` a été retiré
  // (supabase_teacher_edits_subjects_toujours.sql). Une école qui ne l'a jamais
  // connu, et une école qui l'avait laissé à false, se comportent pareil : le
  // titulaire gère sa classe. La sécurité tient au PÉRIMÈTRE, pas à un réglage.
  for (const school of [{}, fermee, ouverte, null]) {
    assert.equal(canManageClassSubjects({ role: 'teacher', school, cls: maClasse, teacherId: MOI }), true,
      JSON.stringify(school));
  }
});

test("l'administration garde tout, partout", () => {
  for (const school of [{}, fermee, ouverte]) {
    assert.equal(canManageClassSubjects({ role: 'admin', school, cls: sonClasse, teacherId: null }), true);
    assert.equal(canManageClassSubjects({ role: 'censeur', school, cls: sonClasse, teacherId: null, isDelegate: true }), true,
      'compte délégué portant /app/classes');
  }
});

test('le titulaire gère SA classe, jamais celle du collègue', () => {
  assert.equal(canManageClassSubjects({ role: 'teacher', school: ouverte, cls: maClasse, teacherId: MOI }), true);
  assert.equal(canManageClassSubjects({ role: 'teacher', school: ouverte, cls: sonClasse, teacherId: MOI }), false);
});

test('le titulariat vaut pour TOUS les cycles, pas seulement le fondamental', () => {
  const cycles = [
    { id: 'a', name: 'PS A',   level: 'PS',   teacher_id: MOI },
    { id: 'b', name: 'CM2',    level: 'CM2',  teacher_id: MOI },
    { id: 'c', name: '6e A',   level: '6e',   teacher_id: MOI },
    { id: 'd', name: 'Tle C',  level: 'Tle',  teacher_id: MOI },
    { id: 'e', name: 'Form 4', level: 'Form 4', teacher_id: MOI },
  ];
  for (const cls of cycles) {
    assert.equal(canManageClassSubjects({ role: 'teacher', school: ouverte, cls, teacherId: MOI }), true, cls.name);
  }
});

test("l'enseignant de matière ne touche QUE ses propres lignes", () => {
  const base = { role: 'teacher', school: ouverte, cls: sonClasse, teacherId: MOI };
  assert.equal(canEditSubjectRow({ ...base, subject: maMatiere }), true,  'la sienne');
  assert.equal(canEditSubjectRow({ ...base, subject: saMatiere }), false, "celle d'un collègue");
  assert.equal(canEditSubjectRow({ ...base, subject: orpheline }), false, 'une matière sans enseignant');
  // …et il ne gère PAS la liste de cette classe : ni ajout, ni suppression.
  assert.equal(canManageClassSubjects(base), false);
});

test('le titulaire peut modifier même la ligne affectée à un collègue, chez lui', () => {
  const chezMoi = { ...saMatiere, class_id: 'c1' };
  assert.equal(canEditSubjectRow({
    role: 'teacher', school: ouverte, cls: maClasse, teacherId: MOI, subject: chezMoi,
  }), true);
});

test('un compte sans fiche enseignant (teacherId null) n’obtient rien', () => {
  const sansFiche = { role: 'teacher', school: ouverte, cls: { ...maClasse, teacher_id: null }, teacherId: null };
  assert.equal(canManageClassSubjects(sansFiche), false,
    'null === null ne doit jamais valoir titulariat');
  assert.equal(canEditSubjectRow({ ...sansFiche, cls: sonClasse, subject: orpheline }), false,
    'ni une matière sans enseignant');
});
