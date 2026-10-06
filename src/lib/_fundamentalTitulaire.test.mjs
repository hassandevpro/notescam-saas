// La titulaire du FONDAMENTAL enseigne toute sa classe.
//
// Régression mesurée à BRIGHT CONTINENT BILINGUAL SCHOOL : en mode « enseignant de
// matière », une institutrice titulaire d'une classe de maternelle lisait « Aucune
// classe attribuée » et « Aucune matière ne vous est attribuée », sans un élève ni
// une cote A / ECA / NA — alors que le store lui donnait bien sa classe (il compte
// le titulariat). Les écrans de saisie, eux, exigeaient une ligne `subjects` à son
// nom : elle n'en a aucune, puisqu'elle enseigne TOUS les domaines.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isFundamentalTitulaire, isSubjectScopedForClass, subjectsForClass, isSubjectScoped,
} from './teacherScope.js';

const MOI = 'teacher-1';
const AUTRE = 'teacher-2';
const subjectMode = { grade_entry_mode: 'subject' };
const principalMode = { grade_entry_mode: 'principal' };

const ps   = { id: 'c-ps',  name: 'PS A',       level: 'PS',       teacher_id: MOI };
const ce1  = { id: 'c-ce1', name: 'CE1',        level: 'CE1',      teacher_id: MOI };
const nur  = { id: 'c-nur', name: 'Nursery 2',  level: 'Nursery 2', teacher_id: MOI, system: 'EN' };
const sixe = { id: 'c-6e',  name: '6e A',       level: '6e',       teacher_id: MOI };
const psAutre = { ...ps, id: 'c-ps2', teacher_id: AUTRE };

test('titulaire de maternelle / primaire → exemptée', () => {
  assert.equal(isFundamentalTitulaire(ps, MOI), true);
  assert.equal(isFundamentalTitulaire(ce1, MOI), true);
  assert.equal(isFundamentalTitulaire(nur, MOI), true, 'Nursery anglophone aussi');
});

test('titulaire du SECONDAIRE → pas exemptée (chaque matière a son spécialiste)', () => {
  assert.equal(isFundamentalTitulaire(sixe, MOI), false);
});

test('ne pas être titulaire ne donne rien', () => {
  assert.equal(isFundamentalTitulaire(psAutre, MOI), false);
  assert.equal(isFundamentalTitulaire(ps, null), false);
  assert.equal(isFundamentalTitulaire(null, MOI), false);
});

test('le périmètre par classe suit cette exception', () => {
  // Mode « enseignant de matière » : resserré partout, SAUF sa classe fondamentale.
  assert.equal(isSubjectScoped('teacher', subjectMode), true);
  assert.equal(isSubjectScopedForClass('teacher', subjectMode, ps, MOI), false);
  assert.equal(isSubjectScopedForClass('teacher', subjectMode, sixe, MOI), true);
  // Mode 'principal' : rien n'est resserré, l'exception ne change rien.
  assert.equal(isSubjectScopedForClass('teacher', principalMode, sixe, MOI), false);
  // Un admin garde la vue complète.
  assert.equal(isSubjectScopedForClass('admin', subjectMode, sixe, null), false);
});

test('toutes les matières de SA classe maternelle, aucune ailleurs', () => {
  const subjects = [
    { id: 's1', class_id: 'c-ps', name: 'Langage',            teacher_id: null },
    { id: 's2', class_id: 'c-ps', name: 'Graphisme',          teacher_id: AUTRE },
    { id: 's3', class_id: 'c-6e', name: 'Mathématiques',      teacher_id: MOI },
    { id: 's4', class_id: 'c-6e', name: 'Français',           teacher_id: AUTRE },
  ];
  // Sa classe maternelle : les 2 domaines, même celui affecté à quelqu'un d'autre.
  const enMaternelle = subjectsForClass(subjects, MOI, ps, 'teacher', subjectMode);
  assert.deepEqual(enMaternelle.map((s) => s.id), ['s1', 's2']);

  // Sa 6e : seulement sa matière — le titulariat du secondaire ne donne rien.
  const en6e = subjectsForClass(subjects, MOI, sixe, 'teacher', subjectMode);
  assert.deepEqual(en6e.map((s) => s.id), ['s3']);

  // La maternelle d'une collègue : rien.
  assert.deepEqual(subjectsForClass(subjects, MOI, psAutre, 'teacher', subjectMode), []);
});
