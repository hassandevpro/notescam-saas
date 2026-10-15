// Éprouve le fichier d'échange de notes entre le poste d'un enseignant et la
// base de l'admin (gradeBundle.js). Ce qui compte ici n'est pas qu'une note
// arrive : c'est qu'une note n'arrive JAMAIS au mauvais endroit, et qu'aucune
// note déjà en base ne disparaisse en silence.
//
// Lancer : node --experimental-loader ./scripts/lib/esm-resolve.mjs src/lib/_gradeBundle.test.mjs
import {
  BUNDLE_FORMAT, buildGradeBundle, countBundleNotes, parseGradeBundle, planGradeImport,
  collectTeacherGrades, groupClassicWrites,
} from './gradeBundle.js';

let pass = 0, fail = 0;
const ok = (c, label, got) => {
  if (c) { console.log(`✅ ${label}`); pass++; }
  else { console.log(`❌ ${label} (obtenu: ${JSON.stringify(got)})`); fail++; }
};

// ── La base de l'admin ───────────────────────────────────────────────────────
const ECOLE = { id: 'sch-1', name: 'BRIGHT CONTINENT BILINGUAL SCHOOL', current_year: '2026-2027' };
const CIBLE_BASE = {
  schoolId: 'sch-1',
  schoolName: 'BRIGHT CONTINENT BILINGUAL SCHOOL',
  classes: [
    { id: 'c1', name: 'Class 1', level: 'Class 1' },
    { id: 'c6', name: '6ème', level: '6ème' },
  ],
  students: [
    { id: 'e1', name: 'AYDEN-KAIS MARS', matricule: 's260001', class_id: 'c1' },
    { id: 'e2', name: 'GHAMGNE EVA MAIWENN', matricule: 's260002', class_id: 'c1' },
    { id: 'e3', name: 'NDZIE LEMA', matricule: 's260003', class_id: 'c6' },
  ],
  subjects: [
    { id: 'm1', name: 'Mathématiques', max: 20, class_id: 'c1' },
    { id: 'm2', name: 'English', max: 20, class_id: 'c1' },
    { id: 'm3', name: 'Mathématiques', max: 20, class_id: 'c6' },
  ],
};
const cible = (existant = {}) => ({ ...CIBLE_BASE, existant });

// ── Construction du fichier côté enseignant ─────────────────────────────────
const bundle = buildGradeBundle({
  school: ECOLE,
  teacher: { id: 't1', name: 'M. NKOULOU', email: 'nkoulou@bright.cm' },
  classes: [
    {
      id: 'c1', name: 'Class 1', level: 'Class 1', engine: 'apc_primaire',
      students: [
        { id: 'e1', matricule: 's260001', name: 'AYDEN-KAIS MARS' },
        { id: 'e2', matricule: 's260002', name: 'GHAMGNE EVA MAIWENN' },
      ],
      classic: [{ subject_id: 'm1', subject_name: 'Mathématiques', max: 20, sequence: 1, grades: { e1: '14', e2: '12,5' } }],
      prim: [{
        competence_id: '1a', critere_id: 'oral', ua: 1,
        competence_label: 'Lire', critere_label: 'Oral',
        notes: { e1: { note: '8', points_max: 10 } },
      }],
    },
    // Classe sans aucune note : elle ne doit pas voyager.
    { id: 'c6', name: '6ème', students: [{ id: 'e3', name: 'NDZIE LEMA' }], classic: [{ subject_id: 'm3', subject_name: 'Mathématiques', sequence: 1, grades: {} }] },
  ],
});

ok(bundle.format === BUNDLE_FORMAT, 'export : format marqué', bundle.format);
ok(bundle.school.id === 'sch-1' && bundle.school.year === '2026-2027', 'export : identité de l’école portée par le fichier', bundle.school);
ok(bundle.teacher.name === 'M. NKOULOU', 'export : l’enseignant est nommé', bundle.teacher);
ok(bundle.classes.length === 1 && bundle.classes[0].id === 'c1', 'export : une classe sans note ne voyage pas', bundle.classes.map((c) => c.name));
ok(countBundleNotes(bundle) === 3, 'export : 3 notes transportées (2 classiques + 1 compétence)', countBundleNotes(bundle));

// ── Lecture du fichier ──────────────────────────────────────────────────────
const relu = parseGradeBundle(JSON.stringify(bundle));
ok(!relu.error && relu.bundle.classes.length === 1, 'lecture : aller-retour JSON fidèle', relu.error);
ok(/illisible/i.test(parseGradeBundle('{pas du json').error || ''), 'lecture : JSON cassé → message clair');
ok(/pas un fichier de notes/i.test(parseGradeBundle('{"format":"autre/v9"}').error || ''), 'lecture : autre format refusé');
ok(/sans section/i.test(parseGradeBundle(`{"format":"${BUNDLE_FORMAT}"}`).error || ''), 'lecture : fichier sans classes refusé');

// ── Garde-fou : le fichier d'une AUTRE école ────────────────────────────────
const autre = planGradeImport(
  { ...bundle, school: { id: 'sch-9', name: 'COLLÈGE LA RETRAITE' } },
  cible(),
);
ok(autre.ok === false && /autre établissement/i.test(autre.erreur || ''), 'garde : fichier d’une autre école refusé en bloc', autre.erreur);
ok(autre.ecritures.length === 0, 'garde : rien n’est écrit dans ce cas');

// Identifiant d'école différent mais MÊME nom (base recréée) : accepté.
const recreee = planGradeImport({ ...bundle, school: { id: 'autre-uuid', name: 'bright continent bilingual school' } }, cible());
ok(recreee.ok && recreee.ecritures.length === 3, 'garde : même école, identifiant recréé → accepté', recreee.resume);

// ── Base vide : tout s'écrit, et au bon endroit ─────────────────────────────
const vierge = planGradeImport(bundle, cible());
ok(vierge.ok && vierge.ecritures.length === 3, 'import : 3 écritures prévues sur une base vierge', vierge.resume);
const wClassic = vierge.ecritures.filter((e) => e.kind === 'classic');
const wPrim = vierge.ecritures.filter((e) => e.kind === 'prim');
ok(wClassic.length === 2 && wPrim.length === 1, 'import : chaque note part vers SON moteur', vierge.ecritures.map((e) => e.kind));
ok(wClassic.every((e) => e.classId === 'c1' && e.subjectId === 'm1' && e.sequence === 1),
  'import : classe, matière et séquence viennent du FICHIER, pas de l’écran', wClassic);
ok(wClassic.some((e) => e.studentId === 'e2' && e.value === '12.5'),
  'import : la virgule décimale est normalisée comme à la saisie', wClassic);
ok(wPrim[0].competenceId === '1a' && wPrim[0].critereId === 'oral' && wPrim[0].ua === 1 && wPrim[0].pointsMax === 10,
  'import : compétence × critère × UA et barème de l’évaluation conservés', wPrim[0]);

// ── Conflits : la base garde sa valeur ──────────────────────────────────────
const avecConflit = planGradeImport(bundle, cible({
  classic: (classId, eleveId, seq, subjectId) =>
    (classId === 'c1' && eleveId === 'e1' && seq === 1 && subjectId === 'm1' ? '9' : null),
}));
ok(avecConflit.conflits.length === 1, 'conflit : une note différente en base est signalée', avecConflit.conflits);
ok(avecConflit.conflits[0].actuel === '9' && avecConflit.conflits[0].entrant === '14',
  'conflit : ancienne et nouvelle valeur affichées', avecConflit.conflits[0]);
ok(!avecConflit.ecritures.some((e) => e.studentId === 'e1' && e.kind === 'classic'),
  'conflit : la note en conflit n’est PAS écrite', avecConflit.ecritures);
ok(avecConflit.ecritures.length === 2, 'conflit : les autres notes passent quand même', avecConflit.resume);

// Valeur identique : ni écriture, ni conflit.
const identique = planGradeImport(bundle, cible({
  classic: (classId, eleveId, seq, subjectId) =>
    (eleveId === 'e1' && subjectId === 'm1' ? '14' : null),
}));
ok(identique.identiques === 1 && identique.conflits.length === 0, 'identique : reconnu, aucun conflit', identique.resume);
ok(identique.ecritures.length === 2, 'identique : pas de réécriture inutile', identique.ecritures.length);

// Compétence primaire : le conflit se lit sur l'objet { note, points_max }.
const conflitPrim = planGradeImport(bundle, cible({ prim: () => ({ note: '5', points_max: 10 }) }));
ok(conflitPrim.conflits.some((c) => c.kind === 'prim' && c.actuel === '5' && c.entrant === '8'),
  'conflit : compétence primaire comparée sur la note', conflitPrim.conflits);

// ── Ce qui ne se rattache pas est DIT, pas écrit ailleurs ───────────────────
const classeInconnue = planGradeImport(
  { ...bundle, classes: [{ ...bundle.classes[0], id: 'zz', name: 'Class 9' }] },
  cible(),
);
ok(classeInconnue.ecritures.length === 0
  && classeInconnue.ignores.some((i) => i.type === 'classe_inconnue' && i.classe === 'Class 9'),
  'rattachement : classe absente de la base → signalée, rien écrit', classeInconnue.ignores);

const eleveInconnu = planGradeImport({
  ...bundle,
  classes: [{
    ...bundle.classes[0],
    students: [{ id: 'xx', matricule: 'zzz', name: 'ÉLÈVE PARTI AILLEURS' }],
    classic: [{ subject_id: 'm1', subject_name: 'Mathématiques', sequence: 1, grades: { xx: '15' } }],
    prim: [],
  }],
}, cible());
ok(eleveInconnu.ecritures.length === 0
  && eleveInconnu.ignores.some((i) => i.type === 'eleve_introuvable'),
  'rattachement : élève introuvable → signalé, rien écrit', eleveInconnu.ignores);

const matiereInconnue = planGradeImport({
  ...bundle,
  classes: [{
    ...bundle.classes[0],
    classic: [{ subject_id: 'm-zz', subject_name: 'Latin', sequence: 1, grades: { e1: '15' } }],
    prim: [],
  }],
}, cible());
ok(matiereInconnue.ecritures.length === 0
  && matiereInconnue.ignores.some((i) => i.type === 'matiere_inconnue' && i.matiere === 'Latin'),
  'rattachement : matière absente de la classe → signalée, rien écrit', matiereInconnue.ignores);

// Appariement par matricule puis par nom quand l'identifiant a changé de poste.
const parMatricule = planGradeImport({
  ...bundle,
  classes: [{
    ...bundle.classes[0],
    students: [{ id: 'local-999', matricule: 's260001', name: 'AYDEN-KAIS MARS' }],
    classic: [{ subject_id: 'm1', subject_name: 'Mathématiques', sequence: 1, grades: { 'local-999': '16' } }],
    prim: [],
  }],
}, cible());
ok(parMatricule.ecritures.length === 1 && parMatricule.ecritures[0].studentId === 'e1',
  'appariement : identifiant local inconnu → retrouvé par matricule', parMatricule.ecritures);

const parNom = planGradeImport({
  ...bundle,
  classes: [{
    ...bundle.classes[0],
    students: [{ id: 'local-998', matricule: '', name: '  ghamgne   eva maiwenn ' }],
    classic: [{ subject_id: 'm1', subject_name: 'MATHEMATIQUES', sequence: 1, grades: { 'local-998': '11' } }],
    prim: [],
  }],
}, cible());
ok(parNom.ecritures.length === 1 && parNom.ecritures[0].studentId === 'e2',
  'appariement : nom et matière retrouvés malgré casse, accents et espaces', parNom.ecritures);

// Homonymes dans la même classe : on refuse de choisir.
const homonymes = planGradeImport({
  ...bundle,
  classes: [{
    ...bundle.classes[0],
    students: [{ id: 'local-997', matricule: '', name: 'MBALLA JEAN' }],
    classic: [{ subject_id: 'm1', subject_name: 'Mathématiques', sequence: 1, grades: { 'local-997': '13' } }],
    prim: [],
  }],
}, {
  ...CIBLE_BASE,
  students: [
    { id: 'h1', name: 'MBALLA JEAN', matricule: 'a', class_id: 'c1' },
    { id: 'h2', name: 'MBALLA JEAN', matricule: 'b', class_id: 'c1' },
  ],
  existant: {},
});
ok(homonymes.ecritures.length === 0 && homonymes.ignores.some((i) => i.type === 'eleve_ambigu'),
  'appariement : deux homonymes dans la classe → refus de choisir', homonymes.ignores);

// ── Validation des valeurs : le fichier n'entre pas ce que l'écran refuse ───
const horsBornes = planGradeImport({
  ...bundle,
  classes: [{
    ...bundle.classes[0],
    classic: [{ subject_id: 'm1', subject_name: 'Mathématiques', max: 20, sequence: 1, grades: { e1: '45', e2: 'ABS' } }],
    prim: [],
  }],
}, cible());
ok(horsBornes.ignores.some((i) => i.type === 'note_invalide' && i.valeur === '45'),
  'validation : note hors barème refusée et signalée', horsBornes.ignores);
ok(horsBornes.ecritures.length === 1 && horsBornes.ecritures[0].value === 'ABS',
  'validation : « ABS » reste une valeur légitime', horsBornes.ecritures);

// ── Résumé lisible avant d'appliquer ───────────────────────────────────────
ok(vierge.resume.enseignant === 'M. NKOULOU'
  && vierge.resume.notes_du_fichier === 3
  && vierge.resume.a_ecrire === 3
  && Array.isArray(vierge.resume.classes),
  'résumé : qui, combien, et pour quelles classes', vierge.resume);

// ── Collecte depuis les structures réelles du store ─────────────────────────
// Un identifiant de classe contenant « _ » : la collecte doit tenir, parce que
// les clés de gradeMap se reconstruisent au lieu de se découper.
const collecte = collectTeacherGrades({
  classes: [{ id: 'cl_a_1', name: 'Class 1', level: 'Class 1', engine: 'apc_primaire' }],
  students: [
    { id: 'e1', name: 'AYDEN-KAIS MARS', matricule: 's260001', class_id: 'cl_a_1' },
    { id: 'e2', name: 'GHAMGNE EVA MAIWENN', matricule: 's260002', class_id: 'cl_a_1' },
  ],
  subjects: [{ id: 'm1', name: 'Mathématiques', max: 20, class_id: 'cl_a_1' }],
  gradeMap: {
    'cl_a_1_e1_1': { m1: '14' },
    'cl_a_1_e2_1': { m1: '' },          // cellule vidée : ne voyage pas
    'cl_a_1_e1_3': { m1: '16' },
  },
  apcNotes: {
    k1: { eleve_id: 'e1', competence_id: 'c-aa', sequence_id: 'seq-1', note: '12', note_max: 20 },
    k2: { eleve_id: 'e2', competence_id: 'c-aa', sequence_id: 'seq-1', note: null },  // vide
    k3: { eleve_id: 'autre-classe', competence_id: 'c-aa', sequence_id: 'seq-1', note: '9' },
  },
  primNotes: {
    p1: { eleve_id: 'e1', competence_id: '1a', critere_id: 'oral', ua: 1, note: '8', points_max: 10 },
    p2: { eleve_id: 'e2', competence_id: '1a', critere_id: 'oral', ua: 1, note: '7', points_max: null },
  },
  matObservations: {
    o1: { eleve_id: 'e1', domaine_id: 'd1', trimestre_id: 't1', niveau_acquis: 'A', observation: 'Très à l’aise' },
  },
  labels: { prim: { '1a': 'Lire' }, critere: { oral: 'Oral' } },
});
const c0 = collecte[0];
ok(collecte.length === 1 && c0.students.length === 2, 'collecte : la classe et ses élèves', collecte.length);
ok(c0.classic.length === 2, 'collecte : un bloc par (matière, séquence) notée — séq. 1 et 3', c0.classic.map((b) => b.sequence));
ok(c0.classic.find((b) => b.sequence === 1).grades.e1 === '14'
  && !('e2' in c0.classic.find((b) => b.sequence === 1).grades),
  'collecte : une cellule vide ne voyage pas', c0.classic[0].grades);
ok(c0.apc.length === 1 && Object.keys(c0.apc[0].notes).length === 1,
  'collecte : APC — note vide écartée, élève d’une autre classe écarté', c0.apc);
ok(c0.prim.length === 1 && Object.keys(c0.prim[0].notes).length === 2
  && c0.prim[0].competence_label === 'Lire' && c0.prim[0].critere_label === 'Oral',
  'collecte : primaire regroupé par compétence × critère × UA, libellés joints', c0.prim);
ok(c0.prim[0].notes.e2.points_max === null,
  'collecte : barème absent transporté comme tel (barème officiel à l’arrivée)', c0.prim[0].notes.e2);
ok(c0.mat.length === 1 && c0.mat[0].observations.e1.niveau_acquis === 'A',
  'collecte : maternelle — niveau et observation', c0.mat);

// ── Regroupement des écritures classiques ───────────────────────────────────
const { classic: lignes, autres } = groupClassicWrites([
  { kind: 'classic', classId: 'c1', studentId: 'e1', sequence: 1, subjectId: 'm1', value: '14' },
  { kind: 'classic', classId: 'c1', studentId: 'e1', sequence: 1, subjectId: 'm2', value: '15' },
  { kind: 'classic', classId: 'c1', studentId: 'e2', sequence: 1, subjectId: 'm1', value: '9' },
  { kind: 'prim', eleveId: 'e1', competenceId: '1a', critereId: 'oral', ua: 1, note: '8' },
]);
ok(lignes.length === 2, 'regroupement : une écriture par (classe, élève, séquence)', lignes.length);
ok(lignes[0].scores.m1 === '14' && lignes[0].scores.m2 === '15',
  'regroupement : deux matières du même élève dans UNE écriture (sinon l’une écrase l’autre)', lignes[0]);
ok(autres.length === 1 && autres[0].kind === 'prim',
  'regroupement : les autres moteurs passent intacts', autres);

// ── Aller-retour complet, avec les VRAIES clés des magasins ────────────────
// Le test qui protège l'essentiel : l'export lit les magasins du store, l'import
// interroge l'existant avec les constructeurs de clés de chaque moteur. Si ces
// deux côtés divergeaient d'un caractère, l'import ne verrait jamais les notes
// déjà en base — et les écraserait toutes en silence.
const { noteNkey } = await import('../core/apcEngine.js');
const { primNkey } = await import('../core/primEngine.js');
const { obsNkey } = await import('../core/matEngine.js');

const CL = { id: 'c1', name: 'Class 1', level: 'Class 1', engine: 'apc_primaire' };
const EL = [{ id: 'e1', name: 'AYDEN-KAIS MARS', matricule: 's1', class_id: 'c1' }];
const MA = [{ id: 'm1', name: 'Mathématiques', max: 20, class_id: 'c1' }];

const magasins = {
  gradeMap: { 'c1_e1_1': { m1: '14' } },
  apcNotes: { [noteNkey('e1', 'cmp-1', 'seq-1')]: { eleve_id: 'e1', competence_id: 'cmp-1', sequence_id: 'seq-1', note: '12', note_max: 20 } },
  primNotes: { [primNkey('e1', '1a', 'oral', 1)]: { eleve_id: 'e1', competence_id: '1a', critere_id: 'oral', ua: 1, note: '8', points_max: 10 } },
  matObservations: { [obsNkey('e1', 'd1', 't1')]: { eleve_id: 'e1', domaine_id: 'd1', trimestre_id: 't1', niveau_acquis: 'A', observation: 'ok' } },
};

const fichier = JSON.stringify(buildGradeBundle({
  school: ECOLE,
  teacher: { id: 't1', name: 'M. NKOULOU', email: 'n@b.cm' },
  classes: collectTeacherGrades({ classes: [CL], students: EL, subjects: MA, ...magasins }),
}));
const { bundle: relu2 } = parseGradeBundle(fichier);
ok(countBundleNotes(relu2) === 4, 'aller-retour : les 4 moteurs ont voyagé', countBundleNotes(relu2));

// a) La base de l'admin est VIDE → les 4 notes s'écrivent.
const versVide = planGradeImport(relu2, {
  schoolId: 'sch-1', schoolName: ECOLE.name, classes: [CL], students: EL, subjects: MA, existant: {},
});
ok(versVide.ecritures.length === 4, 'aller-retour : base vide → 4 écritures', versVide.resume);
ok(new Set(versVide.ecritures.map((e) => e.kind)).size === 4,
  'aller-retour : une écriture par moteur (classic, apc, prim, mat)', versVide.ecritures.map((e) => e.kind));

// b) La base de l'admin contient DÉJÀ ces mêmes notes, interrogée avec les vraies
//    clés → aucune écriture, aucun conflit : tout est reconnu identique.
const cibleMemes = {
  schoolId: 'sch-1', schoolName: ECOLE.name, classes: [CL], students: EL, subjects: MA,
  existant: {
    classic: (classId, eleveId, seq, subjectId) => magasins.gradeMap[`${classId}_${eleveId}_${seq}`]?.[subjectId],
    apc: (eleveId, cid, sid) => magasins.apcNotes[noteNkey(eleveId, cid, sid)],
    prim: (eleveId, cid, crid, ua) => magasins.primNotes[primNkey(eleveId, cid, crid, ua)],
    mat: (eleveId, did, tid) => magasins.matObservations[obsNkey(eleveId, did, tid)],
  },
};
const versMemes = planGradeImport(relu2, cibleMemes);
ok(versMemes.ecritures.length === 0 && versMemes.identiques === 4 && versMemes.conflits.length === 0,
  'aller-retour : notes déjà présentes → reconnues par leurs vraies clés, rien de réécrit', versMemes.resume);

// c) La base porte d'AUTRES valeurs → 4 conflits, et toujours zéro écriture.
const versAutres = planGradeImport(relu2, {
  ...cibleMemes,
  existant: {
    classic: () => '7',
    apc: () => ({ note: '3' }),
    prim: () => ({ note: '2' }),
    mat: () => ({ niveau_acquis: 'NA' }),
  },
});
ok(versAutres.conflits.length === 4 && versAutres.ecritures.length === 0,
  'aller-retour : valeurs divergentes → 4 conflits, AUCUNE écriture', versAutres.resume);

console.log(`\n=== ${fail === 0 ? 'OK' : 'ÉCHEC'} : ${pass} ok, ${fail} ko ===`);
process.exit(fail === 0 ? 0 : 1);
