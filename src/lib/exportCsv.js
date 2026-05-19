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
        resolve({ rows: [], error: `Erreur de lecture : ${err.message}` });
      }
    };
    reader.onerror = () => resolve({ rows: [], error: 'Impossible de lire le fichier.' });

    if (isExcel) reader.readAsArrayBuffer(file);
    else         reader.readAsText(file, 'UTF-8');
  });
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function parseCsvText(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { rows: [], error: 'Fichier vide ou sans données.' };
  const delim = lines[0].includes(';') ? ';' : ',';
  const headers = lines[0].split(delim).map((h) => h.trim().toLowerCase());
  const raw = lines.slice(1).map((l) => l.split(delim).map((c) => c.trim()));
  return rawRowsToStudents([headers, ...raw]);
}

function rawRowsToStudents(raw) {
  if (raw.length < 2) return { rows: [], error: 'Fichier vide.' };

  const headers = raw[0].map((h) => String(h).trim().toLowerCase().replace(/[^a-zàâéèêëîïôùûç0-9_]/g, ''));
  const col = (candidates) => headers.findIndex((h) => candidates.some((c) => h === c || h.includes(c)));

  const prenomIdx    = col(['prenom', 'prénom', 'firstname', 'first_name']);
  const nomIdx       = col(['nom', 'lastname', 'last_name', 'name', 'eleve', 'élève']);
  const matriculeIdx = col(['matricule', 'mat', 'immatricul']);
  const genderIdx    = col(['sexe', 'genre', 'gender']);
  const dateIdx      = col(['datenaissance', 'date_naissance', 'dob', 'birthdate', 'naissance']);
  const lieuIdx      = col(['lieunaissance', 'lieu_naissance', 'birthplace', 'lieu']);
  const adresseIdx   = col(['adresse', 'address']);
  const phoneIdx     = col(['telephone', 'téléphone', 'tel', 'phone', 'parent_phone']);
  const urgenceIdx   = col(['contacturgence', 'contact_urgence', 'urgence', 'emergency']);
  const pereNomIdx   = col(['nompere', 'nom_pere', 'father', 'pere']);
  const pereProfIdx  = col(['professionpere', 'profession_pere']);
  const mereNomIdx   = col(['nommere', 'nom_mere', 'mother', 'mere']);
  const mereProfIdx  = col(['professionmere', 'profession_mere']);
  const tuteurIdx    = col(['tuteur', 'guardian']);
  const classeIdx    = col(['classe', 'class', 'classname', 'class_name']);
  const statutIdx    = col(['statut', 'status', 'inscription', 'type_eleve', 'typeeleve']);

  if (prenomIdx === -1 && nomIdx === -1) {
    return { rows: [], error: 'Colonnes "prenom" et "nom" introuvables. Vérifiez les en-têtes.' };
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
  if (['n', 'nouveau', 'new', 'nouvelle', '0', 'non'].includes(v)) return 'nouveau';
  if (['r', 'redoublant', 'redoublante', 'repeating', '1', 'oui', 'red'].includes(v)) return 'redoublant';
  if (['t', 'transfere', 'transféré', 'transfer', 'transfert', 'mutation'].includes(v)) return 'transfere';
  return '';
}

function normalizeGender(val) {
  const v = val.trim().toLowerCase();
  if (['m', 'masculin', 'male', 'garçon', 'garcon', 'h', 'homme'].includes(v)) return 'Masculin';
  if (['f', 'féminin', 'feminin', 'female', 'fille', 'femme'].includes(v)) return 'Feminin';
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
    reader.onload = (e) => {
      try {
        const lines = e.target.result.split(/\r?\n/).filter((l) => l.trim());
        if (lines.length < 2) { resolve({ rows: [], subjectNames: [], error: 'Fichier vide.' }); return; }

        const delim = lines[0].includes(';') ? ';' : ',';
        const headers = lines[0].split(delim).map((h) => h.trim());

        // Middle columns = subjects (skip col 0 = Élève, skip Moyenne/Moy columns)
        const subjectCols = [];
        for (let i = 1; i < headers.length; i++) {
          const h = headers[i];
          if (/^moy/i.test(h.replace(/[^a-z]/gi, ''))) continue;
          const name = h.replace(/\s*\/\d+\s*$/, '').trim();
          if (name) subjectCols.push({ index: i, name });
        }

        if (subjectCols.length === 0) {
          resolve({ rows: [], subjectNames: [], error: 'Aucune colonne de matière trouvée.' });
          return;
        }

        const rows = lines.slice(1).map((line) => {
          const cols = splitCSVLine(line, delim);
          const studentName = (cols[0] || '').trim();
          const grades = {};
          subjectCols.forEach(({ index, name }) => {
            const v = (cols[index] || '').trim();
            if (v) grades[name] = v;
          });
          return { studentName, grades };
        }).filter((r) => r.studentName);

        resolve({ rows, subjectNames: subjectCols.map((c) => c.name), error: null });
      } catch (err) {
        resolve({ rows: [], subjectNames: [], error: `Erreur : ${err.message}` });
      }
    };
    reader.onerror = () => resolve({ rows: [], subjectNames: [], error: 'Impossible de lire le fichier.' });
    reader.readAsText(file, 'UTF-8');
  });
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
export function exportTeachers(teachers) {
  const rows = [
    ['Nom complet', 'Email', 'Téléphone', 'Spécialité', 'Compte app'],
    ...teachers.map((t) => [
      t.name || '',
      t.email || '',
      t.phone || '',
      t.specialty || '',
      t.auth_user_id ? 'Oui' : 'Non',
    ]),
  ];
  downloadCSV(`enseignants_${new Date().toISOString().slice(0, 10)}.csv`, rows);
}

// ── Teacher import template ───────────────────────────────────────────────────
export function downloadTeacherTemplate() {
  const rows = [
    ['nom_complet', 'email', 'telephone', 'specialite'],
    ['M. KAMGA Paul',    'paul.kamga@ecole.cm',    '677001122', 'Mathématiques'],
    ['Mme NKENG Claire', 'claire.nkeng@ecole.cm',  '699334455', 'Français'],
    ['M. BIBI Samuel',   '',                        '655778899', 'Histoire-Géographie'],
  ];
  downloadCSV('modele_import_enseignants.csv', rows);
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
          resolve({ rows: [], error: 'Fichier vide ou sans données.' });
          return;
        }

        const headers = raw[0].map((h) => String(h).trim().toLowerCase().replace(/[^a-zàâéèêëîïôùûç0-9_]/g, ''));
        const col = (candidates) => headers.findIndex((h) => candidates.some((c) => h === c || h.includes(c)));

        const nomIdx       = col(['nomcomplet', 'nom_complet', 'nom', 'name', 'enseignant', 'fullname']);
        const emailIdx     = col(['email', 'mail', 'courriel']);
        const phoneIdx     = col(['telephone', 'téléphone', 'tel', 'phone', 'portable']);
        const specialtyIdx = col(['specialite', 'spécialité', 'specialty', 'matiere', 'discipline']);

        if (nomIdx === -1) {
          resolve({ rows: [], error: 'Colonne "nom_complet" introuvable. Vérifiez les en-têtes.' });
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
        resolve({ rows: [], error: `Erreur de lecture : ${err.message}` });
      }
    };

    reader.onerror = () => resolve({ rows: [], error: 'Impossible de lire le fichier.' });
    if (isExcel) reader.readAsArrayBuffer(file);
    else         reader.readAsText(file, 'UTF-8');
  });
}

// ── Student import template ───────────────────────────────────────────────────
export function downloadStudentTemplate() {
  const rows = [
    [
      'matricule', 'prenom', 'nom', 'dateNaissance', 'lieuNaissance',
      'sexe', 'statut', 'adresse', 'telephone', 'contactUrgence',
      'nomPere', 'professionPere', 'nomMere', 'professionMere', 'tuteur', 'classe',
    ],
    [
      's260001', 'Jean', 'DUPONT', '2015-03-15', 'Yaoundé',
      'MALE', 'nouveau', 'Quartier Bastos, Yaoundé', '677123456', '699987654',
      'Pierre DUPONT', 'Ingénieur', 'Marie DUPONT', 'Enseignante', '', 'CP A',
    ],
    [
      's260002', 'Brigitte', 'ELOUNDOU', '2014-09-22', 'Douala',
      'FEMALE', 'redoublant', 'Akwa, Douala', '655000001', '',
      'Paul ELOUNDOU', 'Commerçant', 'Anne ELOUNDOU', 'Ménagère', '', 'CP A',
    ],
  ];
  return downloadExcel('modele_import_eleves.xlsx', rows, 'Modèle élèves');
}
