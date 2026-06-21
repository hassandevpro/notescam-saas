// Export / impression / import du personnel, PAR DÉPARTEMENT (catégorie).
// Réutilise downloadCSV de exportCsv.js et le style d'impression de la liste
// enseignants. `departmentLabel` est le libellé localisé déjà résolu par l'UI.

import { downloadCSV } from './exportCsv';

// ── Helpers de normalisation (import) ────────────────────────────────────────
function normalizeGender(val = '') {
  const v = String(val).trim().toLowerCase();
  if (['m', 'masculin', 'masculino', 'male', 'garçon', 'garcon', 'h', 'homme', 'hombre'].includes(v)) return 'Masculin';
  if (['f', 'féminin', 'feminin', 'femenino', 'femenina', 'female', 'fille', 'femme', 'mujer'].includes(v)) return 'Feminin';
  return '';
}
function normalizeDate(val) {
  if (!val) return '';
  const s = String(val).trim();
  if (/^\d{4,5}$/.test(s)) { // numéro de série Excel
    const d = new Date(Math.round((Number(s) - 25569) * 86400 * 1000));
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  const m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return '';
}

// ── Export CSV ───────────────────────────────────────────────────────────────
export function exportStaff(members, departmentLabel = 'personnel') {
  const rows = [
    ['Matricule', 'Nom', 'Prénom', 'Sexe', 'Fonction', 'Téléphone', 'Email', 'Adresse', 'Date de recrutement', 'Statut'],
    ...members.map((m) => [
      m.matricule || '', m.last_name || m.name || '', m.first_name || '', m.gender || '',
      m.fonction || '', m.phone || '', m.email || '', m.address || '', m.hire_date || '', m.status || '',
    ]),
  ];
  const slug = String(departmentLabel).toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '_');
  downloadCSV(`personnel_${slug}_${new Date().toISOString().slice(0, 10)}.csv`, rows);
}

// ── Modèle d'import ──────────────────────────────────────────────────────────
export function downloadStaffTemplate() {
  downloadCSV('modele_import_personnel.csv', [
    ['prenom', 'nom', 'matricule', 'sexe', 'telephone', 'email', 'adresse', 'fonction', 'date_recrutement', 'statut'],
    ['Awa', 'NDIAYE', 'P-001', 'F', '699000111', 'awa@ecole.cm', 'Yaoundé', 'Secrétaire', '2024-09-01', 'Titulaire'],
    ['Paul', 'OBAM', 'P-002', 'M', '677223344', '', 'Douala', 'Comptable', '2023-01-15', 'Vacataire'],
  ]);
}

// ── Import (CSV / Excel) → lignes prêtes pour addStaff ───────────────────────
export function parseStaffSpreadsheet(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    const isExcel = /\.(xlsx|xls|ods)$/i.test(file.name);
    reader.onload = async (e) => {
      try {
        let raw;
        if (isExcel) {
          const XLSX = await import('xlsx');
          const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
          const ws = wb.Sheets[wb.SheetNames[0]];
          raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        } else {
          const lines = e.target.result.split(/\r?\n/).filter((l) => l.trim());
          const delim = lines[0]?.includes(';') ? ';' : ',';
          raw = lines.map((l) => l.split(delim).map((c) => c.trim()));
        }
        if (!raw || raw.length < 2) { resolve({ rows: [], error: 'Fichier vide ou sans données.' }); return; }

        const headers = raw[0].map((h) => String(h).trim().toLowerCase().replace(/[^a-zàâéèêëîïôùûç0-9_]/g, ''));
        const col = (cands) => headers.findIndex((h) => cands.some((c) => h === c || h.includes(c)));
        const iPrenom = col(['prenom', 'prénom', 'nombre', 'firstname', 'first_name']);
        const iNom    = col(['nomcomplet', 'nom_complet', 'apellidos', 'lastname', 'last_name', 'nom', 'name']);
        const iMat    = col(['matricule', 'matricula', 'mat', 'staffid']);
        const iSexe   = col(['sexe', 'sexo', 'gender', 'genre']);
        const iTel    = col(['telephone', 'telefono', 'téléphone', 'tel', 'phone', 'portable']);
        const iMail   = col(['email', 'mail', 'courriel']);
        const iAddr   = col(['adresse', 'direccion', 'address']);
        const iFonc   = col(['fonction', 'poste', 'role', 'función', 'funcion', 'cargo']);
        const iDate   = col(['daterecrutement', 'date_recrutement', 'hiredate', 'fechacontratacion', 'recrutement', 'embauche']);
        const iStat   = col(['statut', 'estado', 'status']);

        if (iNom === -1 && iPrenom === -1) { resolve({ rows: [], error: 'Colonne « nom » introuvable. Vérifiez les en-têtes.' }); return; }

        const rows = raw.slice(1).map((cols) => {
          const str = (i) => i >= 0 ? String(cols[i] || '').trim() : '';
          const first_name = str(iPrenom);
          const last_name  = str(iNom);
          const name = `${last_name} ${first_name}`.trim() || str(iMat);
          if (!name) return null;
          return {
            first_name, last_name, name,
            matricule: str(iMat),
            gender:    normalizeGender(str(iSexe)),
            phone:     str(iTel),
            email:     str(iMail),
            address:   str(iAddr),
            fonction:  str(iFonc),
            hire_date: normalizeDate(cols[iDate]),
            status:    str(iStat),
          };
        }).filter(Boolean);

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

// ── Impression PDF de la liste d'une catégorie ───────────────────────────────
export function printStaffList(members, departmentLabel, school) {
  const today = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const rows = members.map((m, i) => `
      <tr class="${i % 2 === 0 ? 'even' : ''}">
        <td class="center">${esc(m.matricule || '—')}</td>
        <td><strong>${esc(m.name)}</strong></td>
        <td>${esc(m.fonction || '—')}</td>
        <td class="center">${esc(m.phone || '—')}</td>
        <td>${esc(m.status || '—')}</td>
      </tr>`).join('');

  const html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"/>
<title>Personnel — ${esc(departmentLabel)} — ${esc(school?.name || 'École')}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Segoe UI',Arial,sans-serif;font-size:12px;color:#111}
  .page{padding:16mm 14mm}
  .header{text-align:center;margin-bottom:18px;border-bottom:2px solid #1e3a5f;padding-bottom:12px}
  .header .school{font-size:15px;font-weight:700;text-transform:uppercase;color:#1e3a5f;letter-spacing:.5px}
  .header .subtitle{font-size:11px;color:#555;margin-top:2px}
  .header .doc-title{font-size:17px;font-weight:800;margin-top:8px;text-transform:uppercase;letter-spacing:1px}
  .header .meta{font-size:10px;color:#777;margin-top:4px}
  table{width:100%;border-collapse:collapse;font-size:11px}
  thead tr{background:#e8edf4}
  th{padding:6px 8px;font-weight:600;font-size:10px;text-transform:uppercase;letter-spacing:.3px;border-bottom:1px solid #bcc8d8;text-align:left}
  td{padding:5px 8px;border-bottom:1px solid #e5e9ef;vertical-align:middle}
  tr.even td{background:#f7f9fc}
  .center{text-align:center}
  tfoot td{background:#f0f3f8!important;border-top:1px solid #bcc8d8}
  .sign-area{display:flex;gap:60px;margin-top:30px}
  .sign-box{flex:1;text-align:center}
  .sign-line{border-bottom:1px solid #999;margin:40px 0 4px}
  .sign-label{font-size:10px;color:#555}
  @media print{@page{margin:14mm;size:A4 portrait}body{padding:0}.page{padding:0}}
</style></head>
<body><div class="page">
  <div class="header">
    <div class="school">${esc(school?.name || 'Établissement scolaire')}</div>
    <div class="subtitle">${esc([school?.type, school?.region].filter(Boolean).join(' — '))}</div>
    <div class="doc-title">Personnel — ${esc(departmentLabel)}</div>
    <div class="meta">Année scolaire : ${esc(school?.current_year || '—')} &nbsp;·&nbsp; Imprimé le ${today}</div>
  </div>
  <table>
    <thead><tr>
      <th class="center" style="width:90px">Matricule</th>
      <th>Nom &amp; prénom</th>
      <th style="width:150px">Fonction</th>
      <th class="center" style="width:110px">Téléphone</th>
      <th style="width:110px">Statut</th>
    </tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr><td colspan="5" style="text-align:right;padding:6px 8px;font-size:11px;color:#555">
      Total : <strong>${members.length}</strong> membre${members.length !== 1 ? 's' : ''}
    </td></tr></tfoot>
  </table>
  <div class="sign-area"><div class="sign-box"><div class="sign-line"></div><div class="sign-label">Le Chef d'établissement</div></div></div>
</div></body></html>`;

  const win = window.open('', '_blank', 'width=960,height=720');
  win.document.open();
  win.document.write(html);
  win.document.close();
  setTimeout(() => { win.focus(); win.print(); }, 400);
}
