import { getLang } from './i18n';
import { useAuthStore } from '../store/authStore';
import { resolveCountryCode, defaultLangForCountry } from '../countries';

// Langue du MODÈLE d'import / export.
// Règle (alignée sur syncUiLangToSchool de authStore) :
//   1. Si l'admin a explicitement choisi une langue via la sidebar
//      (notescam_ui_lang_user_set), ce choix prime : le modèle suit l'UI.
//      Ex. école camerounaise dont l'UI est basculée en espagnol → modèle ES.
//   2. Sinon on suit la langue par défaut du pays de l'école (ses classes,
//      en-têtes et données d'exemple sont localisés). Une école Guinée Éq.
//      obtient le modèle espagnol par défaut.
//   3. À défaut d'école, on retombe sur la langue de l'UI.
function templateLang() {
  try {
    const userPick = localStorage.getItem('notescam_ui_lang_user_set') === 'true';
    if (userPick) return getLang();
    const school = useAuthStore.getState().school;
    if (school) return defaultLangForCountry(resolveCountryCode(school));
  } catch (_) { /* ignore */ }
  return getLang();
}

// User-facing import messages, localized FR / EN / ES.
const MSG = {
  empty:     { fr: 'Fichier vide.', en: 'Empty file.', es: 'Archivo vacío.' },
  emptyData: { fr: 'Fichier vide ou sans données.', en: 'Empty file or no data.', es: 'Archivo vacío o sin datos.' },
  cantRead:  { fr: 'Impossible de lire le fichier.', en: 'Could not read the file.', es: 'No se pudo leer el archivo.' },
  readErr:   { fr: 'Erreur de lecture : ', en: 'Read error: ', es: 'Error de lectura: ' },
  noStudentCols: {
    fr: 'Colonnes "prenom" et "nom" introuvables. Vérifiez les en-têtes.',
    en: 'Columns "firstName" and "lastName" not found. Check the headers.',
    es: 'No se encontraron las columnas "nombre" y "apellidos". Revise los encabezados.',
  },
  noTeacherCol: {
    fr: 'Colonne "nom_complet" introuvable. Vérifiez les en-têtes.',
    en: 'Column "full_name" not found. Check the headers.',
    es: 'No se encontró la columna "nombre_completo". Revise los encabezados.',
  },
};
const msg = (key) => MSG[key][getLang()] || MSG[key].fr;

// xlsx is loaded on-demand only when Excel read/write is actually needed
async function loadXLSX() {
  return (await import('xlsx'));
}

// ── CSV download ──────────────────────────────────────────────────────────────
export function downloadCSV(filename, rows) {
  const escape = (v) => {
    const s = v == null ? '' : String(v);
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = rows.map((r) => r.map(escape).join(',')).join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, filename);
}

// ── Excel download ────────────────────────────────────────────────────────────
export async function downloadExcel(filename, rows, sheetName = 'Données') {
  const XLSX = await loadXLSX();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  for (let c = range.s.c; c <= range.e.c; c++) {
    const cell = ws[XLSX.utils.encode_cell({ r: 0, c })];
    if (cell) cell.s = { font: { bold: true } };
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename);
}

// ── Excel / CSV parse (returns { rows, error }) ───────────────────────────────
export function parseSpreadsheet(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    const isExcel = /\.(xlsx|xls|ods)$/i.test(file.name);

    reader.onload = async (e) => {
      try {
        if (isExcel) {
          const XLSX = await loadXLSX();
          const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
          resolve(rawRowsToStudents(raw));
        } else {
          resolve(parseCsvText(e.target.result));
        }
      } catch (err) {
        resolve({ rows: [], error: msg('readErr') + err.message });
      }
    };
    reader.onerror = () => resolve({ rows: [], error: msg('cantRead') });

    if (isExcel) reader.readAsArrayBuffer(file);
    else         reader.readAsText(file, 'UTF-8');
  });
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function parseCsvText(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { rows: [], error: msg('emptyData') };
  const delim = lines[0].includes(';') ? ';' : ',';
  const headers = lines[0].split(delim).map((h) => h.trim().toLowerCase());
  const raw = lines.slice(1).map((l) => l.split(delim).map((c) => c.trim()));
  return rawRowsToStudents([headers, ...raw]);
}

function rawRowsToStudents(raw) {
  if (raw.length < 2) return { rows: [], error: msg('empty') };

  const headers = raw[0].map((h) => String(h).trim().toLowerCase().replace(/[^a-zàâéèêëîïôùûç0-9_]/g, ''));
  // Exact match first (avoids "nom" capturing the Spanish "nombre"), then loose substring.
  const col = (candidates) => {
    let i = headers.findIndex((h) => candidates.includes(h));
    if (i === -1) i = headers.findIndex((h) => candidates.some((c) => h.includes(c)));
    return i;
  };

  const prenomIdx    = col(['prenom', 'prénom', 'nombre', 'firstname', 'first_name']);
  const nomIdx       = col(['nom', 'apellidos', 'apellido', 'lastname', 'last_name', 'name', 'eleve', 'élève']);
  const matriculeIdx = col(['matricule', 'matricula', 'studentid', 'mat', 'immatricul']);
  const genderIdx    = col(['sexe', 'sexo', 'genre', 'gender']);
  const dateIdx      = col(['datenaissance', 'fechanacimiento', 'dateofbirth', 'date_naissance', 'dob', 'birthdate', 'naissance']);
  const lieuIdx      = col(['lieunaissance', 'lugarnacimiento', 'placeofbirth', 'lieu_naissance', 'birthplace', 'lieu']);
  const adresseIdx   = col(['adresse', 'direccion', 'address']);
  const phoneIdx     = col(['telephone', 'telefono', 'téléphone', 'tel', 'phone', 'parent_phone']);
  const urgenceIdx   = col(['contacturgence', 'contactoemergencia', 'emergencycontact', 'contact_urgence', 'urgence', 'emergency']);
  const pereNomIdx   = col(['nompere', 'nombrepadre', 'fathername', 'nom_pere', 'father', 'padre', 'pere']);
  const pereProfIdx  = col(['professionpere', 'profesionpadre', 'fatherjob', 'profession_pere']);
  const mereNomIdx   = col(['nommere', 'nombremadre', 'mothername', 'nom_mere', 'mother', 'madre', 'mere']);
  const mereProfIdx  = col(['professionmere', 'profesionmadre', 'motherjob', 'profession_mere']);
  const tuteurIdx    = col(['tuteur', 'tutor', 'guardian']);
  const classeIdx    = col(['classe', 'clase', 'class', 'classname', 'class_name']);
  const statutIdx    = col(['statut', 'estado', 'status', 'inscription', 'type_eleve', 'typeeleve']);

  if (prenomIdx === -1 && nomIdx === -1) {
    return { rows: [], error: msg('noStudentCols') };
  }

  const rows = raw.slice(1)
    .map((cols) => {
      const str = (i) => i >= 0 ? String(cols[i] || '').trim() : '';

      let name = '';
      if (prenomIdx >= 0 && nomIdx >= 0) {
        const nom = str(nomIdx);
        const prenom = str(prenomIdx);
        name = nom && prenom ? `${nom} ${prenom}` : nom || prenom;
      } else {
        name = str(prenomIdx >= 0 ? prenomIdx : nomIdx);
      }

      return {
        name,
        matricule:        str(matriculeIdx),
        gender:           genderIdx    >= 0 ? normalizeGender(str(genderIdx)) : '',
        date_naissance:   dateIdx      >= 0 ? normalizeDate(cols[dateIdx])    : null,
        lieu_naissance:   str(lieuIdx),
        adresse:          str(adresseIdx),
        parent_phone:     str(phoneIdx),
        contact_urgence:  str(urgenceIdx),
        nom_pere:         str(pereNomIdx),
        profession_pere:  str(pereProfIdx),
        nom_mere:         str(mereNomIdx),
        profession_mere:  str(mereProfIdx),
        tuteur:           str(tuteurIdx),
        class_name:       str(classeIdx),
        statut:           statutIdx >= 0 ? normalizeStatut(str(statutIdx)) : '',
      };
    })
    .filter((r) => r.name);

  return { rows, error: null };
}

function normalizeStatut(val) {
  const v = val.trim().toLowerCase();
  if (['n', 'nouveau', 'new', 'nouvelle', 'nuevo', 'nueva', '0', 'non'].includes(v)) return 'nouveau';
  if (['r', 'redoublant', 'redoublante', 'repeating', 'repetidor', 'repetidora', 'repite', '1', 'oui', 'red'].includes(v)) return 'redoublant';
  if (['t', 'transfere', 'transféré', 'transfer', 'transfert', 'transferido', 'transferida', 'trasladado', 'mutation'].includes(v)) return 'transfere';
  return '';
}

function normalizeGender(val) {
  const v = val.trim().toLowerCase();
  if (['m', 'masculin', 'masculino', 'male', 'garçon', 'garcon', 'h', 'homme', 'hombre'].includes(v)) return 'Masculin';
  if (['f', 'féminin', 'feminin', 'femenino', 'femenina', 'female', 'fille', 'femme', 'mujer'].includes(v)) return 'Feminin';
  return '';
}

function normalizeDate(val) {
  if (!val) return null;
  const s = String(val).trim();
  if (!s) return null;
  // Excel serial number — pure JS conversion (no XLSX needed)
  if (/^\d{4,5}$/.test(s)) {
    const n = Number(s);
    const ms = Math.round((n - 25569) * 86400 * 1000);
    const d = new Date(ms);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  // DD/MM/YYYY or DD-MM-YYYY
  const m = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  // YYYY-MM-DD passthrough
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return null;
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ── Grades CSV import ─────────────────────────────────────────────────────────
// Input: the CSV exported by Grades page (Élève, Sub1 /20, Sub2 /20, Moyenne)
// Returns: { subjectNames: string[], rows: [{studentName, grades: {name: val}}], error }
export function parseGradesCSV(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    const isExcel = /\.(xlsx|xls|ods)$/i.test(file.name);

    reader.onload = async (e) => {
      try {
        let raw; // tableau de lignes (chaque ligne = tableau de cellules)
        if (isExcel) {
          const XLSX = await loadXLSX();
          const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
          const ws = wb.Sheets[wb.SheetNames[0]];
          raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
            .map((r) => r.map((c) => String(c ?? '').trim()));
        } else {
          const lines = e.target.result.split(/\r?\n/).filter((l) => l.trim());
          if (lines.length < 2) { resolve({ rows: [], subjectNames: [], error: 'Fichier vide.' }); return; }
          const delim = lines[0].includes(';') ? ';' : ',';
          raw = lines.map((l) => splitCSVLine(l, delim).map((c) => c.trim()));
        }
        resolve(rawRowsToGrades(raw));
      } catch (err) {
        resolve({ rows: [], subjectNames: [], error: `Erreur : ${err.message}` });
      }
    };
    reader.onerror = () => resolve({ rows: [], subjectNames: [], error: 'Impossible de lire le fichier.' });
    if (isExcel) reader.readAsArrayBuffer(file);
    else         reader.readAsText(file, 'UTF-8');
  });
}

// Transforme un tableau de lignes brutes (en-tête « Élève, Mat /20…, Moyenne »)
// en { rows, subjectNames }. La virgule décimale d'Excel FR (« 12,5 ») est
// conservée telle quelle : validateGrade la normalise à l'import.
function rawRowsToGrades(raw) {
  if (!raw || raw.length < 2) return { rows: [], subjectNames: [], error: 'Fichier vide.' };
  const headers = raw[0].map((h) => String(h).trim());

  // Colonnes du milieu = matières (col 0 = Élève, on saute Moyenne/Moy)
  const subjectCols = [];
  for (let i = 1; i < headers.length; i++) {
    const h = headers[i];
    if (/^moy/i.test(h.replace(/[^a-z]/gi, ''))) continue;
    const name = h.replace(/\s*\/\d+\s*$/, '').trim();
    if (name) subjectCols.push({ index: i, name });
  }
  if (subjectCols.length === 0) {
    return { rows: [], subjectNames: [], error: 'Aucune colonne de matière trouvée.' };
  }

  const rows = raw.slice(1).map((cols) => {
    const studentName = String(cols[0] || '').trim();
    const grades = {};
    subjectCols.forEach(({ index, name }) => {
      const v = String(cols[index] ?? '').trim();
      if (v) grades[name] = v;
    });
    return { studentName, grades };
  }).filter((r) => r.studentName);

  return { rows, subjectNames: subjectCols.map((c) => c.name), error: null };
}

function splitCSVLine(line, delim) {
  const result = [];
  let cur = '', inQ = false;
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ; }
    else if (ch === delim && !inQ) { result.push(cur); cur = ''; }
    else cur += ch;
  }
  result.push(cur);
  return result;
}

// ── Teacher export ────────────────────────────────────────────────────────────
const TEACHER_EXPORT_HEADERS = {
  fr: { cols: ['Nom complet', 'Email', 'Téléphone', 'Spécialité', 'Compte app'], yes: 'Oui', no: 'Non', file: 'enseignants' },
  en: { cols: ['Full name', 'Email', 'Phone', 'Specialty', 'App account'],       yes: 'Yes', no: 'No',  file: 'teachers' },
  es: { cols: ['Nombre completo', 'Email', 'Teléfono', 'Especialidad', 'Cuenta app'], yes: 'Sí', no: 'No', file: 'profesores' },
};

export function exportTeachers(teachers) {
  const h = TEACHER_EXPORT_HEADERS[templateLang()] || TEACHER_EXPORT_HEADERS.fr;
  const rows = [
    h.cols,
    ...teachers.map((t) => [
      t.name || '',
      t.email || '',
      t.phone || '',
      t.specialty || '',
      t.auth_user_id ? h.yes : h.no,
    ]),
  ];
  downloadCSV(`${h.file}_${new Date().toISOString().slice(0, 10)}.csv`, rows);
}

// ── Teacher import template ───────────────────────────────────────────────────
const TEACHER_TEMPLATE = {
  fr: {
    filename: 'modele_import_enseignants.csv',
    rows: [
      ['nom_complet', 'email', 'telephone', 'specialite'],
      ['M. KAMGA Paul',    'paul.kamga@ecole.cm',   '677001122', 'Mathématiques'],
      ['Mme NKENG Claire', 'claire.nkeng@ecole.cm', '699334455', 'Français'],
      ['M. BIBI Samuel',   '',                      '655778899', 'Histoire-Géographie'],
    ],
  },
  en: {
    filename: 'teacher_import_template.csv',
    rows: [
      ['full_name', 'email', 'phone', 'specialty'],
      ['Mr Paul KAMGA',     'paul.kamga@school.gq',   '222001122', 'Mathematics'],
      ['Mrs Claire NKENG',  'claire.nkeng@school.gq', '222334455', 'English'],
      ['Mr Samuel BIBI',    '',                       '222778899', 'Geography & History'],
    ],
  },
  es: {
    filename: 'modelo_importacion_profesores.csv',
    rows: [
      ['nombre_completo', 'email', 'telefono', 'especialidad'],
      ['Sr. NGUEMA Pedro',  'pedro.nguema@escuela.gq', '222001122', 'Matemáticas'],
      ['Sra. OBIANG Carmen','carmen.obiang@escuela.gq','222334455', 'Lengua Española'],
      ['Sr. ABAGA Daniel',  '',                        '222778899', 'Geografía e Historia'],
    ],
  },
};

export function downloadTeacherTemplate() {
  const tpl = TEACHER_TEMPLATE[templateLang()] || TEACHER_TEMPLATE.fr;
  downloadCSV(tpl.filename, tpl.rows);
}

// ── Teacher spreadsheet parse ─────────────────────────────────────────────────
export function parseTeachersSpreadsheet(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    const isExcel = /\.(xlsx|xls|ods)$/i.test(file.name);

    reader.onload = async (e) => {
      try {
        let raw;
        if (isExcel) {
          const XLSX = await loadXLSX();
          const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
          const ws = wb.Sheets[wb.SheetNames[0]];
          raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        } else {
          const lines = e.target.result.split(/\r?\n/).filter((l) => l.trim());
          const delim = lines[0]?.includes(';') ? ';' : ',';
          raw = lines.map((l) => l.split(delim).map((c) => c.trim()));
        }

        if (!raw || raw.length < 2) {
          resolve({ rows: [], error: msg('emptyData') });
          return;
        }

        const headers = raw[0].map((h) => String(h).trim().toLowerCase().replace(/[^a-zàâéèêëîïôùûç0-9_]/g, ''));
        const col = (candidates) => headers.findIndex((h) => candidates.some((c) => h === c || h.includes(c)));

        const nomIdx       = col(['nomcomplet', 'nom_complet', 'nombrecompleto', 'nombre_completo', 'nom', 'name', 'enseignant', 'fullname', 'full_name']);
        const emailIdx     = col(['email', 'mail', 'courriel']);
        const phoneIdx     = col(['telephone', 'telefono', 'téléphone', 'tel', 'phone', 'portable']);
        const specialtyIdx = col(['specialite', 'spécialité', 'especialidad', 'specialty', 'matiere', 'discipline', 'asignatura']);

        if (nomIdx === -1) {
          resolve({ rows: [], error: msg('noTeacherCol') });
          return;
        }

        const rows = raw.slice(1)
          .map((cols) => {
            const str = (i) => i >= 0 ? String(cols[i] || '').trim() : '';
            const name = str(nomIdx);
            if (!name) return null;
            return {
              name,
              email:     str(emailIdx),
              phone:     str(phoneIdx),
              specialty: str(specialtyIdx),
            };
          })
          .filter(Boolean);

        resolve({ rows, error: null });
      } catch (err) {
        resolve({ rows: [], error: msg('readErr') + err.message });
      }
    };

    reader.onerror = () => resolve({ rows: [], error: msg('cantRead') });
    if (isExcel) reader.readAsArrayBuffer(file);
    else         reader.readAsText(file, 'UTF-8');
  });
}

// ── Student import template ───────────────────────────────────────────────────
const STUDENT_TEMPLATE = {
  fr: {
    filename: 'modele_import_eleves.xlsx',
    sheet:    'Modèle élèves',
    rows: [
      ['matricule', 'prenom', 'nom', 'dateNaissance', 'lieuNaissance',
       'sexe', 'statut', 'adresse', 'telephone', 'contactUrgence',
       'nomPere', 'professionPere', 'nomMere', 'professionMere', 'tuteur', 'classe'],
      ['s260001', 'Jean', 'DUPONT', '2015-03-15', 'Yaoundé',
       'MALE', 'nouveau', 'Quartier Bastos, Yaoundé', '677123456', '699987654',
       'Pierre DUPONT', 'Ingénieur', 'Marie DUPONT', 'Enseignante', '', 'CP A'],
      ['s260002', 'Brigitte', 'ELOUNDOU', '2014-09-22', 'Douala',
       'FEMALE', 'redoublant', 'Akwa, Douala', '655000001', '',
       'Paul ELOUNDOU', 'Commerçant', 'Anne ELOUNDOU', 'Ménagère', '', 'CP A'],
    ],
  },
  en: {
    filename: 'student_import_template.xlsx',
    sheet:    'Students template',
    rows: [
      ['studentId', 'firstName', 'lastName', 'dateOfBirth', 'placeOfBirth',
       'gender', 'status', 'address', 'phone', 'emergencyContact',
       'fatherName', 'fatherJob', 'motherName', 'motherJob', 'guardian', 'class'],
      ['s260001', 'John', 'SMITH', '2015-03-15', 'Malabo',
       'MALE', 'new', '12 Independence Ave., Malabo', '222123456', '222987654',
       'Peter SMITH', 'Engineer', 'Mary SMITH', 'Teacher', '', '1st A'],
      ['s260002', 'Grace', 'JONES', '2014-09-22', 'Bata',
       'FEMALE', 'repeating', 'Mondoasi district, Bata', '222000001', '',
       'Paul JONES', 'Trader', 'Anne JONES', 'Homemaker', '', '1st A'],
    ],
  },
  es: {
    filename: 'modelo_importacion_alumnos.xlsx',
    sheet:    'Modelo alumnos',
    rows: [
      ['matricula', 'nombre', 'apellidos', 'fechaNacimiento', 'lugarNacimiento',
       'sexo', 'estado', 'direccion', 'telefono', 'contactoEmergencia',
       'nombrePadre', 'profesionPadre', 'nombreMadre', 'profesionMadre', 'tutor', 'clase'],
      ['s260001', 'Juan', 'MBA NDONG', '2015-03-15', 'Malabo',
       'MASCULINO', 'nuevo', 'Barrio Ela Nguema, Malabo', '222123456', '222987654',
       'Pedro MBA', 'Ingeniero', 'María NDONG', 'Profesora', '', '1º A'],
      ['s260002', 'Lucía', 'OYANA OBONO', '2014-09-22', 'Bata',
       'FEMENINO', 'repetidor', 'Barrio Mondoasi, Bata', '222000001', '',
       'Pablo OYANA', 'Comerciante', 'Ana OBONO', 'Ama de casa', '', '1º A'],
    ],
  },
};

export function downloadStudentTemplate() {
  const tpl = STUDENT_TEMPLATE[templateLang()] || STUDENT_TEMPLATE.fr;
  return downloadExcel(tpl.filename, tpl.rows, tpl.sheet);
}
