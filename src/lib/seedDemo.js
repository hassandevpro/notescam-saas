// Générateur de données de démo pour une année scolaire donnée.
// Crée 2 classes (FR + EN), matières, élèves et notes sur 6 séquences.
// Utilise schoolStore pour que tout passe par la couche offline-first.

import { useSchoolStore } from '../store/schoolStore';

function rnd(min, max) {
  return Math.round((Math.random() * (max - min) + min) * 10) / 10;
}

const CLASSES_FR = [
  { name: '6ème A', level: '6ème',  section: 'A', system: 'FR', cycle: 'secondaire' },
  { name: '5ème B', level: '5ème',  section: 'B', system: 'FR', cycle: 'secondaire' },
];
const CLASSES_EN = [
  { name: 'Form 1 A', level: 'Form 1', section: 'A', system: 'EN', cycle: 'secondaire' },
];

const SUBJECTS_FR = [
  { name: 'Français',                   coef: 4, max: 20 },
  { name: 'Mathématiques',              coef: 4, max: 20 },
  { name: 'Sciences de la Vie',         coef: 3, max: 20 },
  { name: 'Physique-Chimie',            coef: 3, max: 20 },
  { name: 'Histoire-Géographie',        coef: 2, max: 20 },
  { name: 'Anglais',                    coef: 3, max: 20 },
  { name: 'Informatique',               coef: 2, max: 20 },
  { name: 'Éducation Physique (EPS)',   coef: 2, max: 20 },
  { name: 'Éducation Civique',          coef: 1, max: 20 },
];

const SUBJECTS_EN = [
  { name: 'English Language',  coef: 4, max: 100 },
  { name: 'Mathematics',       coef: 4, max: 100 },
  { name: 'Biology',           coef: 3, max: 100 },
  { name: 'Chemistry/Physics', coef: 3, max: 100 },
  { name: 'History/Geography', coef: 2, max: 100 },
  { name: 'French Language',   coef: 3, max: 100 },
  { name: 'Computer Science',  coef: 2, max: 100 },
  { name: 'Physical Education',coef: 2, max: 100 },
  { name: 'Civics',            coef: 1, max: 100 },
];

const STUDENTS_6EME = [
  { name: 'NKOA Daniel',    gender: 'Masculin', matricule: 'NC28001' },
  { name: 'MBARGA Sophie',  gender: 'Feminin',  matricule: 'NC28002' },
  { name: 'FOUDA Jean',     gender: 'Masculin', matricule: 'NC28003' },
  { name: 'BELLA Marie',    gender: 'Feminin',  matricule: 'NC28004' },
  { name: 'NDOUMBE Pierre', gender: 'Masculin', matricule: 'NC28005' },
  { name: 'ATANGANA Rose',  gender: 'Feminin',  matricule: 'NC28006' },
  { name: 'ESSOMBA Paul',   gender: 'Masculin', matricule: 'NC28007' },
  { name: 'NOAH Carine',    gender: 'Feminin',  matricule: 'NC28008' },
];

const STUDENTS_5EME = [
  { name: 'BIYA Samuelle',  gender: 'Feminin',  matricule: 'NC28009' },
  { name: 'MFOU Eric',      gender: 'Masculin', matricule: 'NC28010' },
  { name: 'DIKA Lucie',     gender: 'Feminin',  matricule: 'NC28011' },
  { name: 'OWONO Marc',     gender: 'Masculin', matricule: 'NC28012' },
  { name: 'EKWE Claire',    gender: 'Feminin',  matricule: 'NC28013' },
  { name: 'TSIMI Jules',    gender: 'Masculin', matricule: 'NC28014' },
];

const STUDENTS_FORM1 = [
  { name: 'NKENG Paul',    gender: 'Masculin', matricule: 'NC28015' },
  { name: 'AYUK Grace',    gender: 'Feminin',  matricule: 'NC28016' },
  { name: 'MBAH John',     gender: 'Masculin', matricule: 'NC28017' },
  { name: 'FOMENA Alice',  gender: 'Feminin',  matricule: 'NC28018' },
  { name: 'BIYA Samuel',   gender: 'Masculin', matricule: 'NC28019' },
  { name: 'ENOW Mary',     gender: 'Feminin',  matricule: 'NC28020' },
];

export async function seedDemoYear(schoolId, year) {
  const store = useSchoolStore.getState();

  const allClasses    = [...CLASSES_FR, ...CLASSES_EN];
  const studentsMap   = {
    '6ème A':   STUDENTS_6EME,
    '5ème B':   STUDENTS_5EME,
    'Form 1 A': STUDENTS_FORM1,
  };
  const subjectsMap = {
    'FR': SUBJECTS_FR,
    'EN': SUBJECTS_EN,
  };

  let totalClasses = 0, totalSubjects = 0, totalStudents = 0, totalGrades = 0;

  for (const clsDef of allClasses) {
    // Créer la classe
    const cls = await store.addClass({ ...clsDef, current_year: year });
    totalClasses++;

    // Créer les matières
    const subDefs = subjectsMap[clsDef.system];
    const createdSubs = [];
    for (const subDef of subDefs) {
      const sub = await store.addSubject({ ...subDef, class_id: cls.id });
      createdSubs.push(sub);
      totalSubjects++;
    }

    // Créer les élèves
    const studentDefs = studentsMap[clsDef.name] || [];
    const createdStudents = [];
    for (const stuDef of studentDefs) {
      const stu = await store.addStudent({ ...stuDef, class_id: cls.id });
      createdStudents.push(stu);
      totalStudents++;
    }

    // Générer des notes pour les 6 séquences
    const isEN = clsDef.system === 'EN';
    for (const stu of createdStudents) {
      for (let seq = 1; seq <= 6; seq++) {
        const scores = {};
        for (const sub of createdSubs) {
          // Profil réaliste : chaque élève a un "niveau" de base
          const base = isEN
            ? rnd(40, 78)
            : rnd(8, 17);
          const noise = isEN ? rnd(-5, 5) : rnd(-1.5, 1.5);
          const raw   = Math.max(0, Math.min(sub.max, Math.round((base + noise) * 10) / 10));
          scores[sub.id] = String(raw);
        }
        await store.saveGrade(cls.id, stu.id, seq, scores);
        totalGrades += Object.keys(scores).length;
      }
    }
  }

  return { totalClasses, totalSubjects, totalStudents, totalGrades };
}
