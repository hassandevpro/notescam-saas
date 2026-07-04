// Générateur de données de démo pour une année scolaire donnée.
// Crée 2 classes (FR + EN), matières, élèves et notes sur 6 séquences.
// Pour une école Guinée Équatoriale (ES) : données 100 % espagnoles, notes /10,
// 3 trimestres — aucune donnée camerounaise.
// Utilise schoolStore pour que tout passe par la couche offline-first.

import { useSchoolStore } from '../store/schoolStore';
import { useAuthStore } from '../store/authStore';
import { resolveCountryCode } from '../countries';
import { geGradeMax, gePrimaryUsesCoef } from './useCountry';
import { supabase } from './supabase';
import { classesDB, subjectsDB, studentsDB, gradesDB, syncQueueDB, matObsDB, primNotesDB, apcNotesDB } from './db';
import { backendOnline } from './edition';
import { resolveClassEngine, isOfficialEngine, primaireNiveauSlug, firstCycleClasseSlug } from '../core/engineResolver';
import { domainesForMaternelle } from '../core/matEngine';
import { competencesForNiveau } from '../core/primEngine';
import { competencesFor, trimestreOfSequence } from '../core/apcEngine';

function rnd(min, max) {
  return Math.round((Math.random() * (max - min) + min) * 10) / 10;
}

// ── Marqueur des classes de démo ─────────────────────────────────────────────
// La démo est désormais générée DANS l'année active, à côté des vraies classes.
// Pour pouvoir la supprimer sans toucher aux données réelles, on retient l'ID des
// classes créées par le seed (côté client, par école). Pas de migration : un
// simple registre localStorage, suffisant pour des données de test.
const demoKey = (schoolId) => `notescam_demo_classes_${schoolId}`;

export function getDemoClassIds(schoolId) {
  try { return JSON.parse(localStorage.getItem(demoKey(schoolId)) || '[]'); }
  catch { return []; }
}

function saveDemoClassIds(schoolId, ids) {
  try { localStorage.setItem(demoKey(schoolId), JSON.stringify(ids)); }
  catch { /* localStorage indisponible : best-effort */ }
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

// ── Données démo Guinée Équatoriale (espagnol, notes /10) ────────────────────
const CLASSES_ES = [
  { name: '5º Primaria A', level: '5º Primaria', section: 'A', system: 'ES', cycle: 'primaire' },
  { name: '1º ESBA A',     level: '1º ESBA',     section: 'A', system: 'ES', cycle: 'secondaire' },
];

const SUBJECTS_ES = [
  { name: 'Lengua Española y Literatura', coef: 4, max: 10 },
  { name: 'Matemáticas',                  coef: 4, max: 10 },
  { name: 'Ciencias Naturales',           coef: 3, max: 10 },
  { name: 'Ciencias Sociales',            coef: 3, max: 10 },
  { name: 'Inglés',                       coef: 2, max: 10 },
  { name: 'Francés',                      coef: 2, max: 10 },
  { name: 'Educación Física',             coef: 1, max: 10 },
  { name: 'Educación para la Ciudadanía', coef: 1, max: 10 },
];

const STUDENTS_PRIMARIA = [
  { name: 'OBIANG NDONG Juan',    gender: 'Masculino', matricule: 'GE28001' },
  { name: 'NGUEMA MBA María',     gender: 'Femenino',  matricule: 'GE28002' },
  { name: 'NDONG ESONO José',     gender: 'Masculino', matricule: 'GE28003' },
  { name: 'ONDO NSUE Lucía',      gender: 'Femenino',  matricule: 'GE28004' },
  { name: 'MBA ABAGA Pablo',      gender: 'Masculino', matricule: 'GE28005' },
  { name: 'ESONO OYANA Carmen',   gender: 'Femenino',  matricule: 'GE28006' },
  { name: 'NSUE EDU Antonio',     gender: 'Masculino', matricule: 'GE28007' },
  { name: 'ABAGA NCHAMA Rosa',    gender: 'Femenino',  matricule: 'GE28008' },
];

const STUDENTS_ESBA = [
  { name: 'NCHAMA OYONO David',   gender: 'Masculino', matricule: 'GE28009' },
  { name: 'OYANA MICHA Isabel',   gender: 'Femenino',  matricule: 'GE28010' },
  { name: 'EDU NVE Francisco',    gender: 'Masculino', matricule: 'GE28011' },
  { name: 'MICHA ELÁ Teresa',     gender: 'Femenino',  matricule: 'GE28012' },
  { name: 'NVE OBONO Manuel',     gender: 'Masculino', matricule: 'GE28013' },
  { name: 'ELÁ MANGUE Pilar',     gender: 'Femenino',  matricule: 'GE28014' },
];

// ═════════════════════════════════════════════════════════════════════════════
// DÉMO « OFFICIEL » (MINEDUB + MINESEC) — une classe par cycle, année complète,
// avec décision de passage en classe supérieure. Dépend des référentiels chargés
// (migrations supabase_maternelle / supabase_apc_primaire / supabase_apc_minesec
// / supabase_sc_minesec). Un cycle dont le référentiel manque est simplement vide.
// ═════════════════════════════════════════════════════════════════════════════

// Profil de l'élève → pilote la distribution des notes ET la décision annuelle.
// 'strong'/'average' → Admis ; 'weak' → Redouble. Réparti pour avoir des deux.
const P = ['strong', 'average', 'weak', 'average', 'strong', 'weak', 'average', 'strong'];

const OFFICIEL_CLASSES = [
  {
    name: 'Petite Section', level: 'Petite Section', cycle: 'maternelle',
    students: [
      { name: 'AWONO Liya',      gender: 'Feminin',  matricule: 'MAT001', profile: P[0] },
      { name: 'BEDIMO Ethan',    gender: 'Masculin', matricule: 'MAT002', profile: P[1] },
      { name: 'NGONO Keren',     gender: 'Feminin',  matricule: 'MAT003', profile: P[2] },
      { name: 'TCHOUALA Ryan',   gender: 'Masculin', matricule: 'MAT004', profile: P[3] },
      { name: 'MVONDO Naomi',    gender: 'Feminin',  matricule: 'MAT005', profile: P[4] },
      { name: 'ESSOLA Loïc',     gender: 'Masculin', matricule: 'MAT006', profile: P[5] },
    ],
  },
  {
    name: 'CM2', level: 'CM2', cycle: 'primaire',
    students: [
      { name: 'ABEGA Sandrine',  gender: 'Feminin',  matricule: 'PRI001', profile: P[0] },
      { name: 'BILOA Cédric',    gender: 'Masculin', matricule: 'PRI002', profile: P[1] },
      { name: 'MANGA Prisca',    gender: 'Feminin',  matricule: 'PRI003', profile: P[2] },
      { name: 'ONANA Boris',     gender: 'Masculin', matricule: 'PRI004', profile: P[3] },
      { name: 'ZEH Merveille',   gender: 'Feminin',  matricule: 'PRI005', profile: P[4] },
      { name: 'AMOUGOU Steve',   gender: 'Masculin', matricule: 'PRI006', profile: P[5] },
    ],
  },
  {
    name: '6ème A', level: '6ème', cycle: 'secondaire',
    students: [
      { name: 'NKOA Daniel',     gender: 'Masculin', matricule: 'C1A001', profile: P[0] },
      { name: 'MBARGA Sophie',   gender: 'Feminin',  matricule: 'C1A002', profile: P[1] },
      { name: 'FOUDA Jean',      gender: 'Masculin', matricule: 'C1A003', profile: P[2] },
      { name: 'BELLA Marie',     gender: 'Feminin',  matricule: 'C1A004', profile: P[3] },
      { name: 'NDOUMBE Pierre',  gender: 'Masculin', matricule: 'C1A005', profile: P[4] },
      { name: 'ATANGANA Rose',   gender: 'Feminin',  matricule: 'C1A006', profile: P[5] },
    ],
  },
  {
    name: 'Terminale C', level: 'Terminale', serie: 'c', cycle: 'secondaire',
    students: [
      { name: 'NANGA Armand',    gender: 'Masculin', matricule: 'TLC001', profile: P[0] },
      { name: 'EYENGA Clarisse', gender: 'Feminin',  matricule: 'TLC002', profile: P[1] },
      { name: 'OWONA Franck',    gender: 'Masculin', matricule: 'TLC003', profile: P[2] },
      { name: 'MENYE Diane',     gender: 'Feminin',  matricule: 'TLC004', profile: P[3] },
      { name: 'BATION Hervé',    gender: 'Masculin', matricule: 'TLC005', profile: P[4] },
      { name: 'KOUAM Estelle',   gender: 'Feminin',  matricule: 'TLC006', profile: P[5] },
      { name: 'SADO Yvan',       gender: 'Masculin', matricule: 'TLC007', profile: P[6] },
      { name: 'NJOYA Farida',    gender: 'Feminin',  matricule: 'TLC008', profile: P[7] },
    ],
  },
];

// Niveau d'acquisition maternelle (A / ECA / NA) tiré selon le profil.
function randAcquis(profile) {
  const r = Math.random();
  if (profile === 'strong') return r < 0.8 ? 'A' : 'ECA';
  if (profile === 'weak')   return r < 0.4 ? 'NA' : r < 0.85 ? 'ECA' : 'A';
  return r < 0.5 ? 'A' : r < 0.9 ? 'ECA' : 'NA'; // average
}

// Note tirée selon le profil, mise à l'échelle du barème (max) — /10 primaire, /20 secondaire.
function randScaled(profile, max = 20) {
  const frac = profile === 'strong' ? rnd(0.68, 0.92)
    : profile === 'weak' ? rnd(0.28, 0.52)
    : rnd(0.48, 0.72);
  return Math.max(0, Math.min(max, Math.round(frac * max * 10) / 10));
}

// Décision de fin d'année selon le profil. `repeatVal` = valeur « redouble » du
// moteur concerné (APC premier cycle → 'redouble' ; Second Cycle → 'redoublant').
const decisionFor = (profile, repeatVal) => (profile === 'weak' ? repeatVal : 'admis');

async function fillMaternelle(store, cls, students) {
  const domaines = domainesForMaternelle(useSchoolStore.getState().matReferentiel);
  if (!domaines.length) return 0;
  let n = 0;
  for (const stu of students) {
    for (const d of domaines) {
      for (const trim of ['t1', 't2', 't3']) {
        await store.saveMatObservation({ eleveId: stu.id, domaineId: d.id, trimestreId: trim, niveauAcquis: randAcquis(stu.profile), observation: '' });
        n++;
      }
    }
  }
  return n;
}

async function fillPrimaire(store, cls, students) {
  const ref = useSchoolStore.getState().primReferentiel;
  const comps = competencesForNiveau(ref, primaireNiveauSlug(cls.level, cls.name));
  const criteres = ref?.criteres || [];
  if (!comps.length || !criteres.length) return 0;
  let n = 0;
  for (const stu of students) {
    for (const c of comps) {
      for (const cr of criteres) {
        for (const trim of ['t1', 't2', 't3']) {
          await store.savePrimNote({ eleveId: stu.id, competenceId: c.id, critereId: cr.id, trimestreId: trim, note: String(randScaled(stu.profile, 10)) });
          n++;
        }
      }
    }
  }
  // Décision de fin d'année primaire (stockée au dernier trimestre = séquence 3).
  for (const stu of students) await store.saveGrade(cls.id, stu.id, 3, { __decision__: decisionFor(stu.profile, 'redouble') });
  return n;
}

async function fillApcPremierCycle(store, cls, students) {
  const ref = useSchoolStore.getState().apcReferentiel;
  const classeSlug = firstCycleClasseSlug(cls.level, cls.name);
  if (!ref || !classeSlug) return 0;
  let n = 0;
  for (let seq = 1; seq <= 6; seq++) {
    const sequenceId = `s${seq}`;
    const trimestreId = trimestreOfSequence(ref.sequences, sequenceId);
    if (!trimestreId) continue;
    for (const m of (ref.matieres || [])) {
      const comps = competencesFor(ref.competences, { classeId: classeSlug, trimestreId, matiereId: m.id });
      for (const c of comps) {
        for (const stu of students) {
          await store.saveApcNote({ eleveId: stu.id, competenceId: c.id, sequenceId, note: String(randScaled(stu.profile, 20)), appreciation: '' });
          n++;
        }
      }
    }
  }
  for (const stu of students) await store.saveGrade(cls.id, stu.id, 6, { __decision__: decisionFor(stu.profile, 'redouble') });
  return n;
}

async function fillClassicOrSc(store, cls, students) {
  const subs = useSchoolStore.getState().subjects.filter((s) => s.class_id === cls.id);
  if (!subs.length) return 0;
  let n = 0;
  for (const stu of students) {
    for (let seq = 1; seq <= 6; seq++) {
      const scores = {};
      for (const sub of subs) scores[sub.id] = String(randScaled(stu.profile, sub.max || 20));
      await store.saveGrade(cls.id, stu.id, seq, scores);
      n += subs.length;
    }
    await store.saveGrade(cls.id, stu.id, 6, { __decision__: decisionFor(stu.profile, 'redoublant') });
  }
  return n;
}

export async function seedOfficielYear(schoolId, year) {
  const store  = useSchoolStore.getState();
  const school = useAuthStore.getState().school;
  // Précharge les 4 référentiels (le sous-jeu manquant → cycle vide, pas d'erreur).
  await Promise.all([store.loadMat(), store.loadPrim(), store.loadApc(), store.loadSc()]);

  let totalClasses = 0, totalSubjects = 0, totalStudents = 0, totalGrades = 0;
  const demoClassIds = [];

  for (const clsDef of OFFICIEL_CLASSES) {
    const cls = await store.addClass({
      name: clsDef.name, level: clsDef.level, cycle: clsDef.cycle, system: 'FR',
      grade_max: clsDef.cycle === 'primaire' ? 10 : 20,
      serie: clsDef.serie || null, current_year: year,
    });
    demoClassIds.push(cls.id);
    totalClasses++;
    // Les matières officielles sont auto-configurées par addClass (APC/SC/domaines).
    totalSubjects += useSchoolStore.getState().subjects.filter((s) => s.class_id === cls.id).length;

    const created = [];
    for (const s of clsDef.students) {
      const stu = await store.addStudent({ name: s.name, gender: s.gender, matricule: s.matricule, class_id: cls.id });
      created.push({ id: stu.id, profile: s.profile });
      totalStudents++;
    }

    const engine = resolveClassEngine(school, cls);
    if (engine === 'maternelle')        totalGrades += await fillMaternelle(store, cls, created);
    else if (engine === 'apc_primaire') totalGrades += await fillPrimaire(store, cls, created);
    else if (engine === 'apc')          totalGrades += await fillApcPremierCycle(store, cls, created);
    else                                totalGrades += await fillClassicOrSc(store, cls, created);
  }

  const merged = [...new Set([...getDemoClassIds(schoolId), ...demoClassIds])];
  saveDemoClassIds(schoolId, merged);
  return { totalClasses, totalSubjects, totalStudents, totalGrades };
}

export async function seedDemoYear(schoolId, year) {
  const store = useSchoolStore.getState();

  // Guinée Équatoriale : jeu de données espagnol, 3 trimestres, échelle /10 ou
  // /20 et coefficients primaire selon le choix de l'administrateur.
  const school = useAuthStore.getState().school;

  // Établissement en système officiel (MINEDUB + MINESEC) : jeu de données dédié
  // couvrant tous les cycles + décisions de passage. Prime sur le jeu classique.
  if (isOfficialEngine(school?.bulletin_engine)) {
    return seedOfficielYear(schoolId, year);
  }

  const isGE = resolveCountryCode(school) === 'guinea_eq';
  const seqCount = isGE ? 3 : 6;
  const geMax    = geGradeMax(school);          // 10 ou 20
  const gePrimCoef = gePrimaryUsesCoef(school); // coef au primaire ?

  const allClasses    = isGE ? CLASSES_ES : [...CLASSES_FR, ...CLASSES_EN];
  const studentsMap   = isGE
    ? {
        '5º Primaria A': STUDENTS_PRIMARIA,
        '1º ESBA A':     STUDENTS_ESBA,
      }
    : {
        '6ème A':   STUDENTS_6EME,
        '5ème B':   STUDENTS_5EME,
        'Form 1 A': STUDENTS_FORM1,
      };
  const subjectsMap = {
    'FR': SUBJECTS_FR,
    'EN': SUBJECTS_EN,
    'ES': SUBJECTS_ES,
  };

  let totalClasses = 0, totalSubjects = 0, totalStudents = 0, totalGrades = 0;
  const demoClassIds = []; // pour la suppression ciblée ultérieure

  for (const clsDef of allClasses) {
    // Créer la classe
    const cls = await store.addClass({ ...clsDef, current_year: year });
    demoClassIds.push(cls.id);
    totalClasses++;

    // Créer les matières (ES : barème = échelle choisie ; coef primaire optionnel)
    const subDefs = subjectsMap[clsDef.system];
    const isPrimaryES = clsDef.system === 'ES' && clsDef.cycle === 'primaire';
    const createdSubs = [];
    for (const subDef of subDefs) {
      const def = clsDef.system === 'ES'
        ? { ...subDef, max: geMax, coef: (isPrimaryES && !gePrimCoef) ? 1 : subDef.coef }
        : subDef;
      const sub = await store.addSubject({ ...def, class_id: cls.id });
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

    // Générer des notes : 6 séquences (FR/EN) ou 3 trimestres (ES).
    const sysCode = clsDef.system;
    for (const stu of createdStudents) {
      for (let seq = 1; seq <= seqCount; seq++) {
        const scores = {};
        for (const sub of createdSubs) {
          // Profil réaliste : chaque élève a un "niveau" de base selon le système.
          // ES : valeurs /10 mises à l'échelle selon le barème choisi (geMax).
          const esFactor = geMax / 10;
          const base =
            sysCode === 'EN' ? rnd(40, 78)
            : sysCode === 'ES' ? rnd(4, 9) * esFactor
            :                    rnd(8, 17);
          const noise =
            sysCode === 'EN' ? rnd(-5, 5)
            : sysCode === 'ES' ? rnd(-1, 1) * esFactor
            :                    rnd(-1.5, 1.5);
          const raw   = Math.max(0, Math.min(sub.max, Math.round((base + noise) * 10) / 10));
          scores[sub.id] = String(raw);
        }
        await store.saveGrade(cls.id, stu.id, seq, scores);
        totalGrades += Object.keys(scores).length;
      }
    }
  }

  // Enregistrer les classes démo créées (en cumulant avec d'éventuelles précédentes).
  const merged = [...new Set([...getDemoClassIds(schoolId), ...demoClassIds])];
  saveDemoClassIds(schoolId, merged);

  return { totalClasses, totalSubjects, totalStudents, totalGrades };
}

// ── Suppression des données de démo ──────────────────────────────────────────
// Supprime UNIQUEMENT les classes créées par le seed (repérées via le registre
// localStorage), et par cascade FK côté Supabase leurs matières, élèves, notes,
// emplois du temps, absences… Les vraies classes de l'année active ne sont jamais
// touchées. Nettoie aussi le cache IndexedDB et l'état du store en mémoire.
// N'envoie PAS les enregistrements à la corbeille : ce sont des données de test.
export async function deleteDemoYear(schoolId) {
  // 1. Les IDs des classes démo proviennent du registre rempli par le seed.
  const ids = getDemoClassIds(schoolId);
  if (ids.length === 0) return { deletedClasses: 0 };
  const idSet = new Set(ids);

  // 2. Suppression côté Supabase — le ON DELETE CASCADE retire matières,
  //    élèves, notes, etc. Hors ligne (ou en cas d'échec) : on met en file.
  let synced = false;
  if (backendOnline()) {
    const { error } = await supabase.from('classes').delete().in('id', ids);
    synced = !error;
  }
  if (!synced) {
    for (const id of ids) {
      await syncQueueDB.push({ table: 'classes', operation: 'delete', payload: { id } });
    }
  }

  // 3. Nettoyer le cache IndexedDB (matières, élèves, notes, puis classes).
  const subs = await subjectsDB.getAll();
  for (const s of subs) if (idSet.has(s.class_id)) await subjectsDB.delete(s.id);

  const studs = await studentsDB.getAll();
  const demoStudentIds = new Set(studs.filter((s) => idSet.has(s.class_id)).map((s) => s.id));
  for (const s of studs) if (idSet.has(s.class_id)) await studentsDB.delete(s.id);

  const grades = await gradesDB.getAll();
  for (const g of grades) if (idSet.has(g.class_id)) await gradesDB.delete(g.key);

  // Notes référentielles (maternelle / primaire / APC) des élèves démo. Côté cloud
  // le CASCADE FK (élève supprimé) les retire ; ici on nettoie le cache IndexedDB.
  for (const dbh of [matObsDB, primNotesDB, apcNotesDB]) {
    const rows = await dbh.getAll().catch(() => []);
    for (const r of rows) if (demoStudentIds.has(r.eleve_id)) await dbh.delete(r.id).catch(() => {});
  }

  for (const id of ids) await classesDB.delete(id);

  // 4. Retirer les enregistrements correspondants du store en mémoire
  //    (utile si l'année démo est l'année consultée).
  useSchoolStore.setState((s) => {
    const gradeMap = {};
    for (const [k, v] of Object.entries(s.gradeMap || {})) {
      // clé note = "${classId}_${studentId}_${sequence}" (UUID = pas d'underscore)
      if (!idSet.has(k.split('_')[0])) gradeMap[k] = v;
    }
    // Purge des notes référentielles en mémoire pour les élèves démo.
    const purgeByStudent = (map) => Object.fromEntries(
      Object.entries(map || {}).filter(([, v]) => !demoStudentIds.has(v?.eleve_id)),
    );
    return {
      classes:  s.classes.filter((c) => !idSet.has(c.id)),
      subjects: s.subjects.filter((x) => !idSet.has(x.class_id)),
      students: s.students.filter((x) => !idSet.has(x.class_id)),
      gradeMap,
      matObservations: purgeByStudent(s.matObservations),
      primNotes:       purgeByStudent(s.primNotes),
      apcNotes:        purgeByStudent(s.apcNotes),
    };
  });

  // 5. Vider le registre : il n'y a plus de classes démo pour cette école.
  saveDemoClassIds(schoolId, []);

  return { deletedClasses: ids.length };
}
