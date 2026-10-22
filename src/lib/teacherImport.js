// IMPORT DES ENSEIGNANTS depuis un classeur Excel — TOUS les champs
// de la fiche, PLUS les matières que l'enseignant enseigne.
//
// Pourquoi un module à part de exportCsv.js : l'import enseignant ne se contente
// pas de créer des lignes. Il doit AUSSI rattacher l'enseignant aux matières
// déjà déclarées dans l'école — et ce rattachement ne vit pas sur la fiche
// enseignant : c'est `subjects.teacher_id` qui le porte, une ligne par couple
// (matière, classe). L'import doit donc résoudre un libellé écrit à la main
// (« Mathématiques (6e A) ») vers des lignes `subjects` existantes, dire ce
// qu'il a trouvé, et SURTOUT dire ce qu'il n'a pas trouvé : une matière mal
// orthographiée qui disparaîtrait en silence, c'est un enseignant sans classe
// que personne ne remarque avant les bulletins.
//
// L'import ne CRÉE jamais de matière ni de classe : il n'affecte que ce qui
// existe déjà (cf. écran Matières). C'est volontaire — inventer une classe
// depuis une faute de frappe ferait bien plus de dégâts que de la signaler.

import { getLang } from './i18n';
import { PERSONNEL_SECTORS } from './personnelSectors';

// exportCsv est chargé À LA DEMANDE (il tire le store d'auth et le client
// Supabase, pour résoudre la langue du modèle) : la LECTURE d'un fichier et la
// résolution des matières restent ainsi du code pur, testable hors navigateur —
// et le gros module xlsx n'entre pas dans le bundle initial.
const excelIO = () => import('./exportCsv');

// ── Normalisation des valeurs ───────────────────────────────────────────────

// Comparaison « tolérante » d'un libellé saisi à la main : sans accents, sans
// casse, sans ponctuation ni espaces. « Histoire-Géo » == « histoire geo ».
export function normLabel(val = '') {
  return String(val).trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function normalizeGender(val = '') {
  const v = normLabel(val);
  if (['m', 'masculin', 'masculino', 'male', 'garcon', 'h', 'homme', 'hombre'].includes(v)) return 'Masculin';
  if (['f', 'feminin', 'femenino', 'femenina', 'female', 'fille', 'femme', 'mujer'].includes(v)) return 'Feminin';
  return '';
}

// Secteur de rattachement : la VALEUR stockée est 'college' pour « secondaire »
// (cf. personnelSectors.js — une 4e valeur rendrait la fiche invisible de tous).
function normalizeSector(val = '') {
  const v = normLabel(val);
  if (!v) return '';
  if (PERSONNEL_SECTORS.includes(v)) return v;
  if (['secondaire', 'secondary', 'secundaria', 'college', 'lycee', 'ces', 'ceg'].includes(v)) return 'college';
  if (['primaire', 'primary', 'primaria', 'ecole', 'ep'].includes(v)) return 'primaire';
  if (['maternelle', 'nursery', 'preescolar', 'prescolaire', 'kindergarten', 'creche'].includes(v)) return 'maternelle';
  return '';
}

// Dates : numéro de série Excel, jj/mm/aaaa, ou déjà ISO. Hors de ces formes on
// rend '' — une date fausse vaut moins que pas de date (colonne `date` en cloud).
function normalizeDate(val) {
  if (val == null || val === '') return '';
  if (val instanceof Date && !isNaN(val.getTime())) return val.toISOString().slice(0, 10);
  const s = String(val).trim();
  if (/^\d{4,5}(\.\d+)?$/.test(s)) {
    const d = new Date(Math.round((Number(s) - 25569) * 86400 * 1000));
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (m) {
    const year = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${year}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return '';
}

// ── Colonnes reconnues ──────────────────────────────────────────────────────
// `key` = champ de la fiche enseignant ; `aliases` = en-têtes acceptés (FR / EN
// / ES, avec et sans séparateurs). L'ordre compte : la résolution est gloutonne,
// une colonne déjà prise n'est pas réattribuée.
export const TEACHER_IMPORT_COLUMNS = [
  { key: 'name', required: true, aliases: ['nom_complet', 'nomcomplet', 'nom_et_prenom', 'full_name', 'fullname', 'nombre_completo', 'nombrecompleto', 'enseignant', 'professeur', 'nom', 'name', 'nombre'],
    label: { fr: 'Nom complet', en: 'Full name', es: 'Nombre completo' },
    hint:  { fr: 'Nom et prénom', en: 'First and last name', es: 'Nombre y apellidos' } },
  { key: 'matricule', aliases: ['matricule', 'matricula', 'staff_id', 'staffid', 'numero_matricule', 'num_matricule', 'id_enseignant'],
    label: { fr: 'Matricule', en: 'Staff ID', es: 'Matrícula' },
    hint:  { fr: 'Identifiant interne', en: 'Internal ID', es: 'Identificador interno' } },
  { key: 'gender', aliases: ['sexe', 'sexo', 'gender', 'genre'],
    label: { fr: 'Sexe', en: 'Gender', es: 'Sexo' },
    hint:  { fr: 'M / F', en: 'M / F', es: 'M / F' } },
  { key: 'phone', aliases: ['telephone', 'téléphone', 'telefono', 'portable', 'tel', 'phone', 'contact'],
    label: { fr: 'Téléphone', en: 'Phone', es: 'Teléfono' },
    hint:  { fr: 'Numéro de téléphone', en: 'Phone number', es: 'Número de teléfono' } },
  { key: 'email', aliases: ['email', 'e_mail', 'mail', 'courriel', 'correo'],
    label: { fr: 'Email', en: 'Email', es: 'Correo' },
    hint:  { fr: 'Adresse email', en: 'Email address', es: 'Dirección de correo' } },
  { key: 'address', aliases: ['adresse', 'address', 'direccion', 'domicile', 'quartier'],
    label: { fr: 'Adresse', en: 'Address', es: 'Dirección' },
    hint:  { fr: 'Domicile / quartier', en: 'Home / district', es: 'Domicilio / barrio' } },
  { key: 'specialty', aliases: ['specialite', 'spécialité', 'especialidad', 'specialty', 'discipline'],
    label: { fr: 'Spécialité', en: 'Specialty', es: 'Especialidad' },
    hint:  { fr: 'Discipline de formation', en: 'Field of training', es: 'Disciplina' } },
  { key: 'fonction', aliases: ['fonction', 'función', 'funcion', 'poste', 'cargo', 'role', 'qualite'],
    label: { fr: 'Fonction', en: 'Role', es: 'Función' },
    hint:  { fr: 'Ex. professeur principal', en: 'E.g. lead teacher', es: 'P. ej. profesor principal' } },
  { key: 'sector', aliases: ['secteur', 'sector', 'ordre_enseignement', 'cycle', 'section'],
    label: { fr: 'Secteur', en: 'Sector', es: 'Sector' },
    hint:  { fr: 'maternelle / primaire / secondaire', en: 'nursery / primary / secondary', es: 'preescolar / primaria / secundaria' } },
  { key: 'hire_date', aliases: ['date_recrutement', 'daterecrutement', 'date_embauche', 'recrutement', 'embauche', 'hire_date', 'hiredate', 'fecha_contratacion', 'fechacontratacion'],
    label: { fr: 'Date de recrutement', en: 'Hire date', es: 'Fecha de contratación' },
    hint:  { fr: 'AAAA-MM-JJ ou JJ/MM/AAAA', en: 'YYYY-MM-DD or DD/MM/YYYY', es: 'AAAA-MM-DD o DD/MM/AAAA' } },
  { key: 'status', aliases: ['statut', 'status', 'estado', 'situation'],
    label: { fr: 'Statut', en: 'Status', es: 'Estado' },
    hint:  { fr: 'Titulaire, vacataire…', en: 'Permanent, contract…', es: 'Titular, contratado…' } },
  // Pas un champ de la fiche : la liste des matières enseignées, résolue vers
  // les lignes `subjects` de l'école (cf. resolveTeacherSubjects).
  { key: 'subjects', aliases: ['matieres', 'matières', 'matiere', 'matière', 'asignaturas', 'asignatura', 'subjects', 'subject', 'enseigne', 'cours', 'disciplines_enseignees'],
    label: { fr: 'Matières enseignées', en: 'Subjects taught', es: 'Asignaturas' },
    hint:  { fr: 'Maths (6e A) ; PCT (5e B)', en: 'Maths (Form 1A); Physics (Form 2B)', es: 'Mates (1ºA); Física (2ºB)' } },
];

const L = (obj) => obj[getLang()] || obj.fr;
export const columnLabel = (col) => L(col.label);
export const columnHint   = (col) => L(col.hint);

// En-tête normalisé pour la comparaison : on garde `_` (il distingue
// `date_recrutement` de `daterecrutement`, tous deux acceptés) et les accents.
function normHeader(h) {
  return String(h ?? '').trim().toLowerCase().replace(/[^a-zàâäéèêëîïôöùûüç0-9_]/g, '');
}

// ── Liste de matières saisie à la main ──────────────────────────────────────
// Accepte « Maths (6e A) ; PCT (5e A, 5e B) | Anglais : 4e A » et les retours à
// la ligne dans la cellule. Une matière SANS classe entre parenthèses vaut
// « partout où cette matière existe » (cf. resolveTeacherSubjects).
export function parseSubjectList(raw) {
  if (raw == null || raw === '') return [];
  return String(raw)
    .split(/[;|\n\r]+/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      // Classes entre parenthèses, ou après « : ». Jamais après un tiret :
      // « Histoire-Géographie » est un nom de matière, pas une classe.
      const paren = chunk.match(/^(.*?)\s*[([]([^)\]]*)[)\]]\s*$/);
      let name = chunk;
      let classPart = '';
      if (paren) {
        name = paren[1];
        classPart = paren[2];
      } else {
        const colon = chunk.match(/^([^:]+):(.*)$/);
        if (colon) { name = colon[1]; classPart = colon[2]; }
      }
      const classNames = classPart.split(/[,;/]+/).map((c) => c.trim()).filter(Boolean);
      return { name: name.trim(), classNames };
    })
    .filter((e) => e.name);
}

// ── Résolution matières → lignes `subjects` ─────────────────────────────────
// Rend les ids de lignes `subjects` à rattacher, et la liste des libellés
// introuvables (`unmatched`) pour que l'écran les montre au lieu de les perdre.
export function resolveTeacherSubjects(entries, { subjects = [], classes = [] } = {}) {
  const classById = new Map(classes.map((c) => [c.id, c]));
  const ids = new Set();
  const matched = [];
  const unmatched = [];

  for (const entry of entries) {
    const wantName = normLabel(entry.name);
    const sameName = subjects.filter((s) => normLabel(s.name) === wantName);
    if (!sameName.length) { unmatched.push({ ...entry, reason: 'subject' }); continue; }

    if (!entry.classNames.length) {
      // Pas de classe précisée : toutes les classes où la matière est déclarée.
      sameName.forEach((s) => ids.add(s.id));
      matched.push({ name: entry.name, className: null, count: sameName.length });
      continue;
    }

    for (const wanted of entry.classNames) {
      const wantClass = normLabel(wanted);
      const hit = sameName.filter((s) => normLabel(classById.get(s.class_id)?.name) === wantClass);
      if (!hit.length) { unmatched.push({ name: entry.name, classNames: [wanted], reason: 'class' }); continue; }
      hit.forEach((s) => ids.add(s.id));
      matched.push({ name: entry.name, className: wanted, count: hit.length });
    }
  }

  return { subjectIds: [...ids], matched, unmatched };
}

// ── Modèle d'import (.xlsx) ─────────────────────────────────────────────────
// Deux feuilles. La 1re est le modèle à remplir. La 2e liste les matières
// RÉELLES de l'école avec leur classe : c'est elle qui fait que la colonne
// « matières » tombe juste du premier coup — l'école recopie, elle ne devine pas.

const TEMPLATE_TEXT = {
  fr: {
    filename: 'modele_import_enseignants.xlsx',
    exportFile: 'enseignants',
    sheet: 'Enseignants',
    refSheet: 'Matières de l_école',
    refCols: ['Matière', 'Classe', 'Enseignant actuel'],
    refEmpty: ['Aucune matière déclarée — créez-les dans l’écran « Matières ».', '', ''],
    headers: ['nom_complet', 'matricule', 'sexe', 'telephone', 'email', 'adresse', 'specialite', 'fonction', 'secteur', 'date_recrutement', 'statut', 'matieres'],
    samples: [
      ['M. KAMGA Paul', 'E-001', 'M', '677001122', 'paul.kamga@ecole.cm', 'Bastos, Yaoundé', 'Mathématiques', 'Professeur principal', 'secondaire', '2021-09-01', 'Titulaire', 'Mathématiques (6e A) ; Mathématiques (6e B)'],
      ['Mme NKENG Claire', 'E-002', 'F', '699334455', 'claire.nkeng@ecole.cm', 'Akwa, Douala', 'Français', '', 'secondaire', '15/09/2023', 'Vacataire', 'Français'],
      ['M. BIBI Samuel', 'E-003', 'M', '655778899', '', 'Mvog-Ada', 'Histoire-Géographie', '', 'secondaire', '', 'Titulaire', 'Histoire-Géographie (5e A, 5e B)'],
    ],
  },
  en: {
    filename: 'teacher_import_template.xlsx',
    exportFile: 'teachers',
    sheet: 'Teachers',
    refSheet: 'School subjects',
    refCols: ['Subject', 'Class', 'Current teacher'],
    refEmpty: ['No subject declared yet — create them in the “Subjects” screen.', '', ''],
    headers: ['full_name', 'staff_id', 'gender', 'phone', 'email', 'address', 'specialty', 'role', 'sector', 'hire_date', 'status', 'subjects'],
    samples: [
      ['Mr Paul KAMGA', 'E-001', 'M', '222001122', 'paul.kamga@school.cm', 'Bastos', 'Mathematics', 'Lead teacher', 'secondary', '2021-09-01', 'Permanent', 'Mathematics (Form 1A); Mathematics (Form 1B)'],
      ['Mrs Claire NKENG', 'E-002', 'F', '222334455', 'claire.nkeng@school.cm', 'Akwa', 'English', '', 'secondary', '15/09/2023', 'Contract', 'English'],
      ['Mr Samuel BIBI', 'E-003', 'M', '222778899', '', 'Mvog-Ada', 'Geography & History', '', 'secondary', '', 'Permanent', 'Geography & History (Form 2A, Form 2B)'],
    ],
  },
  es: {
    filename: 'modelo_importacion_profesores.xlsx',
    exportFile: 'profesores',
    sheet: 'Profesores',
    refSheet: 'Asignaturas del centro',
    refCols: ['Asignatura', 'Clase', 'Profesor actual'],
    refEmpty: ['Ninguna asignatura declarada — créelas en la pantalla «Asignaturas».', '', ''],
    headers: ['nombre_completo', 'matricula', 'sexo', 'telefono', 'email', 'direccion', 'especialidad', 'cargo', 'sector', 'fecha_contratacion', 'estado', 'asignaturas'],
    samples: [
      ['Sr. NGUEMA Pedro', 'E-001', 'M', '222001122', 'pedro.nguema@escuela.gq', 'Ela Nguema', 'Matemáticas', 'Profesor principal', 'secundaria', '2021-09-01', 'Titular', 'Matemáticas (1ºA); Matemáticas (1ºB)'],
      ['Sra. OBIANG Carmen', 'E-002', 'F', '222334455', 'carmen.obiang@escuela.gq', 'Malabo', 'Lengua Española', '', 'secundaria', '15/09/2023', 'Contratado', 'Lengua Española'],
      ['Sr. ABAGA Daniel', 'E-003', 'M', '222778899', '', 'Bata', 'Geografía e Historia', '', 'secundaria', '', 'Titular', 'Geografía e Historia (2ºA, 2ºB)'],
    ],
  },
};

// La langue du modèle n'est pas celle de l'interface : elle suit la règle de
// templateLang() (choix explicite de l'admin, sinon langue du pays de l'école).
export async function teacherTemplateText() {
  const { templateLang } = await excelIO();
  return TEMPLATE_TEXT[templateLang()] || TEMPLATE_TEXT.fr;
}

export async function downloadTeacherTemplate({ subjects = [], classes = [], teachers = [] } = {}) {
  const { downloadExcelSheets } = await excelIO();
  const tpl = await teacherTemplateText();
  const classNameById   = new Map(classes.map((c) => [c.id, c.name]));
  const teacherNameById = new Map(teachers.map((t) => [t.id, t.name]));

  const refRows = subjects
    .map((s) => [s.name || '', classNameById.get(s.class_id) || '', teacherNameById.get(s.teacher_id) || ''])
    .sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));

  await downloadExcelSheets(tpl.filename, [
    { name: tpl.sheet,    rows: [tpl.headers, ...tpl.samples] },
    { name: tpl.refSheet, rows: [tpl.refCols, ...(refRows.length ? refRows : [tpl.refEmpty])] },
  ]);
}

// ── Export Excel, RÉIMPORTABLE tel quel ─────────────────────────────────────
// Mêmes en-têtes que le modèle d'import, et la colonne « matieres » écrite au
// format que l'import sait relire (« Maths (6e A) ; Maths (6e B) »). C'est ce
// qui rend le va-et-vient possible : l'école exporte, corrige dans Excel,
// réimporte — et rien ne se duplique (rapprochement par matricule, puis nom).
export async function exportTeachers(teachers = [], { subjects = [], classes = [] } = {}) {
  const { downloadExcelSheets } = await excelIO();
  const tpl = await teacherTemplateText();
  const classNameById = new Map(classes.map((c) => [c.id, c.name]));

  // Matières par enseignant, regroupées par intitulé pour écrire
  // « Maths (6e A, 6e B) » plutôt que de répéter la matière.
  const byTeacher = new Map();
  for (const s of subjects) {
    if (!s.teacher_id) continue;
    const perName = byTeacher.get(s.teacher_id) || new Map();
    const list = perName.get(s.name) || [];
    const cls = classNameById.get(s.class_id);
    if (cls) list.push(cls);
    perName.set(s.name, list);
    byTeacher.set(s.teacher_id, perName);
  }
  const subjectCell = (teacherId) => {
    const perName = byTeacher.get(teacherId);
    if (!perName) return '';
    return [...perName.entries()]
      .map(([name, cls]) => (cls.length ? `${name} (${cls.sort().join(', ')})` : name))
      .sort()
      .join(' ; ');
  };

  const rows = [
    tpl.headers,
    ...teachers.map((t) => [
      t.name || '', t.matricule || '', t.gender || '', t.phone || '', t.email || '',
      t.address || '', t.specialty || '', t.fonction || '', t.sector || '',
      t.hire_date || '', t.status || '', subjectCell(t.id),
    ]),
  ];
  const stamp = new Date().toISOString().slice(0, 10);
  await downloadExcelSheets(`${tpl.exportFile}_${stamp}.xlsx`, [{ name: tpl.sheet, rows }]);
}

// ── Lecture du fichier ──────────────────────────────────────────────────────

const MSG = {
  emptyData: { fr: 'Fichier vide ou sans données.', en: 'Empty file or no data.', es: 'Archivo vacío o sin datos.' },
  cantRead:  { fr: 'Impossible de lire le fichier.', en: 'Could not read the file.', es: 'No se pudo leer el archivo.' },
  readErr:   { fr: 'Erreur de lecture : ', en: 'Read error: ', es: 'Error de lectura: ' },
  noNameCol: {
    fr: 'Colonne « nom_complet » introuvable. Téléchargez le modèle et conservez la ligne d’en-têtes.',
    en: 'Column “full_name” not found. Download the template and keep the header row.',
    es: 'No se encontró la columna «nombre_completo». Descargue el modelo y conserve la fila de encabezados.',
  },
};
const msg = (key) => MSG[key][getLang()] || MSG[key].fr;

// Associe chaque colonne reconnue à un index. Deux passes : d'abord les
// correspondances EXACTES (un en-tête « nom » ne doit pas être volé par une
// recherche approximative), puis les approximatives sur ce qui reste. Une
// colonne déjà attribuée n'est jamais réutilisée — sans quoi l'alias
// « matiere » raflerait la colonne « matricule ».
export function mapHeaders(headerRow) {
  const headers = (headerRow || []).map(normHeader);
  const used = new Set();
  const index = {};

  for (const col of TEACHER_IMPORT_COLUMNS) {
    const i = headers.findIndex((h, k) => h && !used.has(k) && col.aliases.some((a) => h === normHeader(a)));
    if (i !== -1) { index[col.key] = i; used.add(i); }
  }
  for (const col of TEACHER_IMPORT_COLUMNS) {
    if (col.key in index) continue;
    const i = headers.findIndex((h, k) => h && !used.has(k) && col.aliases.some((a) => h.includes(normHeader(a))));
    if (i !== -1) { index[col.key] = i; used.add(i); }
  }
  return index;
}

// Les fichiers réels portent souvent un titre (« LISTE DU PERSONNEL 2025-2026 »)
// avant les en-têtes. On cherche donc la ligne d'en-têtes dans les 10 premières
// au lieu de tenir la 1re pour acquise.
function findHeaderRow(raw) {
  const limit = Math.min(raw.length, 10);
  for (let r = 0; r < limit; r++) {
    const index = mapHeaders(raw[r]);
    if ('name' in index) return { row: r, index };
  }
  return { row: -1, index: {} };
}

function readRows(raw) {
  const { row: headerRow, index } = findHeaderRow(raw);
  if (headerRow === -1) return { rows: [], error: msg('noNameCol') };

  const rows = raw.slice(headerRow + 1).map((cols) => {
    const str = (key) => {
      const i = index[key];
      return i >= 0 && i != null ? String(cols[i] ?? '').trim() : '';
    };
    const name = str('name');
    // Une ligne sans nom n'est pas un enseignant : c'est une ligne vide, un
    // sous-total ou une ligne de séparation. On la saute sans bruit.
    if (!name) return null;

    const subjectEntries = parseSubjectList(index.subjects != null ? cols[index.subjects] : '');
    return {
      name,
      matricule: str('matricule'),
      gender:    normalizeGender(str('gender')),
      phone:     str('phone'),
      email:     str('email'),
      address:   str('address'),
      specialty: str('specialty'),
      fonction:  str('fonction'),
      sector:    normalizeSector(str('sector')),
      hire_date: normalizeDate(index.hire_date != null ? cols[index.hire_date] : ''),
      status:    str('status'),
      subjectEntries,
    };
  }).filter(Boolean);

  if (!rows.length) return { rows: [], error: msg('emptyData') };
  const merged = mergeDuplicateRows(rows);
  return {
    rows: merged,
    error: null,
    columns: Object.keys(index),
    mergedCount: rows.length - merged.length,
  };
}

// Lit la 1re feuille d'un classeur Excel et rend des lignes prêtes pour
// addTeacher — plus `subjectEntries`, à résoudre par resolveTeacherSubjects.
// La lecture est celle d'exportCsv.js : ce qu'un fichier accepté contient, et le
// refus de ce qui n'est pas un classeur, s'y décident une seule fois.
export async function parseTeachersSpreadsheet(file) {
  const { readWorkbookAoa } = await excelIO();
  // `texte` : les colonnes de ce classeur sont des libellés (matières,
  // téléphone, matricule) — c'est ce que cette lecture faisait déjà.
  const { sheets, error } = await readWorkbookAoa(file, { texte: true });
  if (error) return { rows: [], error };
  const raw = sheets[0]?.raw;
  if (!raw || raw.length < 2) return { rows: [], error: msg('emptyData') };
  return readRows(raw);
}

// Découpage d'une ligne CSV, gardé pour ce qu'il DOCUMENTE : la colonne
// « matières » contient des « ; » et des « , », elle est donc presque toujours
// entre guillemets, et un split naïf la couperait. Plus appelé par l'import
// (classeurs Excel uniquement depuis le 2026-10-19) ; `_teacherImport.test.mjs`
// l'éprouve encore, et il resservira tel quel si un vecteur texte revient.
export function parseCsvText(text) {
  const lines = String(text).replace(/^﻿/, '').split(/\r?\n/);
  const first = lines.find((l) => l.trim()) || '';
  const delim = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : ',';
  const rows = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const cells = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = !inQ;
      } else if (ch === delim && !inQ) { cells.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    cells.push(cur.trim());
    rows.push(cells);
  }
  return rows;
}

// ── Fusion des lignes d'un même enseignant ──────────────────────────────────
// Beaucoup de listes d'école sont tenues UNE LIGNE PAR MATIÈRE : le même
// enseignant revient 4 fois, avec 4 matières et des champs d'identité parfois
// renseignés sur une seule des lignes. Sans fusion, l'import créerait 4 fiches
// dont 3 incomplètes. On regroupe donc par matricule (à défaut par nom), on
// garde la 1re valeur non vide de chaque champ, et on cumule les matières.
export function mergeDuplicateRows(rows) {
  const byKey = new Map();
  const order = [];
  for (const row of rows) {
    const key = normLabel(row.matricule) || `nom:${normLabel(row.name)}`;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, { ...row, subjectEntries: [...row.subjectEntries] });
      order.push(key);
      continue;
    }
    for (const [field, value] of Object.entries(row)) {
      if (field === 'subjectEntries') continue;
      if (!prev[field] && value) prev[field] = value;
    }
    prev.subjectEntries.push(...row.subjectEntries);
  }
  return order.map((k) => byKey.get(k));
}

// ── Rapprochement avec les enseignants déjà en base ─────────────────────────
// Un réimport (le fichier corrigé, la liste de l'an dernier complétée) ne doit
// pas doubler les fiches. On rapproche par matricule, sinon par nom normalisé.
export function findExistingTeacher(row, teachers = []) {
  const mat = normLabel(row.matricule);
  if (mat) {
    const byMat = teachers.find((t) => normLabel(t.matricule) === mat);
    if (byMat) return byMat;
  }
  const name = normLabel(row.name);
  return teachers.find((t) => normLabel(t.name) === name) || null;
}

// Champs de la FICHE enseignant uniquement (sans subjectEntries), et sans les
// champs laissés vides dans le fichier : un réimport partiel complète la fiche,
// il ne l'efface pas.
export function teacherFieldsOf(row) {
  const out = {};
  for (const key of ['name', 'matricule', 'gender', 'phone', 'email', 'address', 'specialty', 'fonction', 'sector', 'hire_date', 'status']) {
    if (row[key]) out[key] = row[key];
  }
  return out;
}
