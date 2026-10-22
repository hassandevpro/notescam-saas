// Valide l'import des enseignants : reconnaissance des en-têtes quel que soit
// leur ordre ou leur langue, normalisation des champs, lecture de la colonne
// « matières », et résolution de ces libellés vers les lignes `subjects`
// existantes — y compris ce qu'elle REFUSE de deviner.
//
// Lancer : node --experimental-loader ./src/lib/_teacherImport.hooks.mjs src/lib/_teacherImport.test.mjs
//
// Le module importe i18n/exportCsv (qui touchent localStorage et le store) : on
// neutralise ces dépendances de navigateur avant de le charger, le test ne porte
// que sur la logique pure.
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.window = globalThis.window || {};
globalThis.document = globalThis.document || { createElement: () => ({ style: {}, click() {} }), body: { appendChild() {}, removeChild() {} } };

const {
  mapHeaders, parseSubjectList, resolveTeacherSubjects, parseCsvText,
  findExistingTeacher, teacherFieldsOf, normLabel, mergeDuplicateRows,
} = await import('./teacherImport.js');

let pass = 0, fail = 0;
const ok = (c, label, got) => { c ? (console.log(`✅ ${label}`), pass++) : (console.log(`❌ ${label} (obtenu: ${JSON.stringify(got)})`), fail++); };
const eqJSON = (a, b, label) => ok(JSON.stringify(a) === JSON.stringify(b), label, a);

// ── En-têtes : ordre libre, langues mélangées, variantes d'écriture ─────────
const idx = mapHeaders(['Matières', 'Nom complet', 'Téléphone', 'Date de recrutement', 'Sexe', 'Matricule', 'Secteur']);
ok(idx.name === 1,      'en-tête : nom reconnu hors 1re colonne', idx.name);
ok(idx.subjects === 0,  'en-tête : « Matières » reconnu', idx.subjects);
ok(idx.matricule === 5, 'en-tête : « Matricule » n’est PAS volé par l’alias « matiere »', idx.matricule);
ok(idx.hire_date === 3, 'en-tête : date de recrutement reconnue malgré les espaces', idx.hire_date);
ok(idx.sector === 6,    'en-tête : secteur reconnu', idx.sector);

const idxEn = mapHeaders(['full_name', 'staff_id', 'phone', 'subjects', 'hire_date']);
ok(idxEn.name === 0 && idxEn.matricule === 1 && idxEn.subjects === 3, 'en-tête : modèle anglais reconnu', idxEn);
const idxEs = mapHeaders(['nombre_completo', 'matricula', 'telefono', 'asignaturas']);
ok(idxEs.name === 0 && idxEs.matricule === 1 && idxEs.subjects === 3, 'en-tête : modèle espagnol reconnu', idxEs);

// Un fichier sans colonne de nom n'est pas importable : l'absence doit se voir.
ok(!('name' in mapHeaders(['age', 'ville'])), 'en-tête : absence de nom détectée');

// ── Colonne « matières » ───────────────────────────────────────────────────
eqJSON(parseSubjectList('Mathématiques (6e A) ; Mathématiques (6e B)'),
  [{ name: 'Mathématiques', classNames: ['6e A'] }, { name: 'Mathématiques', classNames: ['6e B'] }],
  'matières : « ; » sépare les entrées, les parenthèses portent la classe');

eqJSON(parseSubjectList('Histoire-Géographie (5e A, 5e B)'),
  [{ name: 'Histoire-Géographie', classNames: ['5e A', '5e B'] }],
  'matières : plusieurs classes dans une parenthèse — et le tiret du nom est préservé');

eqJSON(parseSubjectList('Français'), [{ name: 'Français', classNames: [] }],
  'matières : sans parenthèses = aucune classe précisée');

eqJSON(parseSubjectList('Anglais : 4e A\nSVT | PCT'),
  [{ name: 'Anglais', classNames: ['4e A'] }, { name: 'SVT', classNames: [] }, { name: 'PCT', classNames: [] }],
  'matières : « : », retour à la ligne et « | » acceptés');

eqJSON(parseSubjectList(''), [], 'matières : cellule vide = aucune entrée');

// ── Résolution vers les lignes `subjects` ──────────────────────────────────
const classes = [
  { id: 'c1', name: '6e A' }, { id: 'c2', name: '6e B' }, { id: 'c3', name: '5e A' },
];
const subjects = [
  { id: 's1', name: 'Mathématiques',       class_id: 'c1' },
  { id: 's2', name: 'Mathématiques',       class_id: 'c2' },
  { id: 's3', name: 'Mathématiques',       class_id: 'c3' },
  { id: 's4', name: 'Histoire-Géographie', class_id: 'c1' },
];
const deps = { subjects, classes };

const r1 = resolveTeacherSubjects(parseSubjectList('Mathématiques (6e A)'), deps);
eqJSON(r1.subjectIds, ['s1'], 'résolution : classe précisée = cette ligne seule');

const r2 = resolveTeacherSubjects(parseSubjectList('Mathématiques'), deps);
eqJSON(r2.subjectIds.sort(), ['s1', 's2', 's3'], 'résolution : sans classe = toutes les classes où la matière existe');

const r3 = resolveTeacherSubjects(parseSubjectList('mathematiques (6E a)'), deps);
eqJSON(r3.subjectIds, ['s1'], 'résolution : insensible aux accents, à la casse et aux espaces');

const r4 = resolveTeacherSubjects(parseSubjectList('Mathématiques (6e A) ; Mathématiques (6e A)'), deps);
eqJSON(r4.subjectIds, ['s1'], 'résolution : un doublon dans le fichier ne compte qu’une fois');

// Ce que la résolution refuse d'inventer — c'est le cœur du garde-fou.
const r5 = resolveTeacherSubjects(parseSubjectList('Informatique'), deps);
eqJSON(r5.subjectIds, [], 'résolution : matière inconnue → rien affecté');
ok(r5.unmatched.length === 1 && r5.unmatched[0].reason === 'subject',
   'résolution : matière inconnue signalée', r5.unmatched);

const r6 = resolveTeacherSubjects(parseSubjectList('Mathématiques (Terminale C)'), deps);
eqJSON(r6.subjectIds, [], 'résolution : classe inconnue → rien affecté');
ok(r6.unmatched.length === 1 && r6.unmatched[0].reason === 'class',
   'résolution : classe inconnue signalée (et pas confondue avec matière inconnue)', r6.unmatched);

// Matière connue + une classe bonne et une mauvaise : on prend la bonne ET on
// signale l'autre. Tout ou rien ferait perdre une affectation valable.
const r7 = resolveTeacherSubjects(parseSubjectList('Mathématiques (6e A, Terminale C)'), deps);
eqJSON(r7.subjectIds, ['s1'], 'résolution : la classe valable est affectée…');
ok(r7.unmatched.length === 1, '…et la classe inconnue reste signalée', r7.unmatched);

// ── CSV : la colonne matières contient des « ; » et des « , » ──────────────
const csv = 'nom_complet,matricule,matieres\n"M. KAMGA Paul",E-001,"Mathématiques (6e A) ; Mathématiques (6e B)"\n';
const rawCsv = parseCsvText(csv);
ok(rawCsv.length === 2, 'CSV : 2 lignes lues', rawCsv.length);
eqJSON(rawCsv[1], ['M. KAMGA Paul', 'E-001', 'Mathématiques (6e A) ; Mathématiques (6e B)'],
  'CSV : la cellule entre guillemets n’est pas coupée par ses « , » et « ; »');

const csvSemi = 'nom_complet;matricule;matieres\nM. BIBI;E-003;"SVT (6e A), PCT"\n';
eqJSON(parseCsvText(csvSemi)[1], ['M. BIBI', 'E-003', 'SVT (6e A), PCT'],
  'CSV : séparateur « ; » détecté quand il domine');

// ── Réimport : rapprochement, pas duplication ──────────────────────────────
const existing = [
  { id: 't1', name: 'M. KAMGA Paul', matricule: 'E-001', email: 'ancien@ecole.cm' },
  { id: 't2', name: 'Mme NKENG Claire', matricule: '' },
];
ok(findExistingTeacher({ matricule: 'e 001', name: 'Autre orthographe' }, existing)?.id === 't1',
   'réimport : rapproché par matricule, même écrit différemment');
ok(findExistingTeacher({ matricule: '', name: 'mme nkeng claire' }, existing)?.id === 't2',
   'réimport : à défaut de matricule, rapproché par nom normalisé');
ok(findExistingTeacher({ matricule: 'E-999', name: 'M. NOUVEAU' }, existing) === null,
   'réimport : un inconnu reste un nouvel enseignant');

// Une colonne laissée vide ne doit pas effacer ce que l'école a déjà saisi.
eqJSON(teacherFieldsOf({ name: 'M. KAMGA Paul', email: '', phone: '677001122', subjectEntries: [{ name: 'X' }] }),
  { name: 'M. KAMGA Paul', phone: '677001122' },
  'réimport : les champs vides sont omis (ils n’écrasent rien), subjectEntries exclu de la fiche');

ok(normLabel('  Histoire-Géographie  ') === 'histoiregeographie', 'normLabel : accents, casse et ponctuation retirés');

// ── Fichier tenu « une ligne par matière » (le cas le plus courant) ────────
const perSubjectFile = [
  { name: 'M. KAMGA Paul', matricule: 'E-001', phone: '677001122', email: '', specialty: 'Mathématiques', subjectEntries: parseSubjectList('Mathématiques (6e A)') },
  { name: 'M. KAMGA Paul', matricule: 'E-001', phone: '',          email: 'paul@ecole.cm', specialty: '', subjectEntries: parseSubjectList('Mathématiques (6e B)') },
  { name: 'Mme NKENG Claire', matricule: '',   phone: '699334455', email: '', specialty: 'Français', subjectEntries: parseSubjectList('Français') },
];
const mergedRows = mergeDuplicateRows(perSubjectFile);
ok(mergedRows.length === 2, 'fusion : 3 lignes → 2 enseignants', mergedRows.length);
ok(mergedRows[0].phone === '677001122' && mergedRows[0].email === 'paul@ecole.cm',
   'fusion : chaque champ prend la 1re valeur non vide, d’où qu’elle vienne', mergedRows[0]);
ok(mergedRows[0].subjectEntries.length === 2, 'fusion : les matières des 2 lignes sont cumulées', mergedRows[0].subjectEntries);
eqJSON(resolveTeacherSubjects(mergedRows[0].subjectEntries, deps).subjectIds.sort(), ['s1', 's2'],
  'fusion : l’enseignant fusionné récupère bien ses 2 classes');
ok(mergedRows[1].name === 'Mme NKENG Claire', 'fusion : l’ordre du fichier est conservé', mergedRows[1].name);

// Deux homonymes SANS matricule restent fusionnés (on ne peut pas les
// distinguer) ; avec des matricules distincts ils restent deux fiches.
ok(mergeDuplicateRows([
  { name: 'M. OBAM', matricule: 'E-010', subjectEntries: [] },
  { name: 'M. OBAM', matricule: 'E-011', subjectEntries: [] },
]).length === 2, 'fusion : deux matricules distincts = deux fiches, même nom');

console.log(`\n${pass} réussis, ${fail} échoués`);
process.exit(fail ? 1 : 0);
