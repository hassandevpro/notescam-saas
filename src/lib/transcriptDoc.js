// Relevé de notes — génération du HTML A4 (impression + capture PDF).
//
// Source unique de vérité du rendu : la MÊME chaîne HTML sert à l'aperçu écran
// (dangerouslySetInnerHTML), à l'impression (window.open + print) et à l'export
// PDF (capture html-to-image). Même approche éprouvée que idCardService.js.
//
// En-tête officiel hérité du pays (bulletinOfficials) → conformité Cameroun /
// autres pays. Trois signatures : Chef d'établissement, Censeur, Surveillant
// Général. QR de vérification + code court + mention légale.

import { bulletinOfficials } from '../countries';
import { bulletinFontFamily } from './schoolTheme';

// Échappement HTML minimal (les données viennent de la saisie utilisateur).
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

const L = (sys, fr, en, es) => (sys === 'EN' ? en : sys === 'ES' ? (es || fr) : fr);

const fmt = (v) => (v === null || v === undefined || v === '' ? '—' : v);

// ── En-tête officiel (République / Ministère / délégations + établissement) ──
function officialsHeaderHtml(school, sys) {
  const officials = bulletinOfficials(school);
  const blocks = officials?.blocks ?? [];
  const bilingual = officials?.bilingual && blocks.length > 1;
  const centerW = bilingual ? '34%' : '50%';
  const sideW = bilingual ? '33%' : '50%';

  const block = (b) => b ? `
    <td style="width:${sideW};text-align:center;font-size:9px;line-height:1.45;padding:2px;vertical-align:top">
      <strong>${esc(b.republic)}</strong><br/>
      ${esc(b.motto)}<br/>————————<br/>
      ${esc(b.ministry)}${b.lines.length ? '<br/>' : ''}
      ${b.lines.map((ln) => esc(ln)).join('<br/>')}
      ${b.establishment ? `<br/><strong>${esc(b.establishment)}</strong>` : ''}
    </td>` : '';

  return `
    <table style="width:100%;border-collapse:collapse;margin-bottom:6px">
      <tbody><tr>
        ${block(blocks[0])}
        <td style="width:${centerW};text-align:center;padding:2px;vertical-align:top">
          ${school?.logo_url ? `<img src="${esc(school.logo_url)}" alt="" style="width:60px;height:60px;object-fit:contain;display:block;margin:0 auto 3px"/>` : ''}
          <strong style="font-size:12px;display:block">${esc((school?.name || '').toUpperCase())}</strong>
          ${(school?.address || school?.phone) ? `<span style="font-size:8.5px">${school?.address ? 'B.P. ' + esc(school.address) : ''}${school?.address && school?.phone ? ' · ' : ''}${esc(school?.phone || '')}</span><br/>` : ''}
          <span style="font-size:8.5px">${L(sys, 'Année scolaire', 'Academic year', 'Año escolar')} : <strong>${esc(school?.current_year || '—')}</strong></span>
        </td>
        ${bilingual ? block(blocks[1]) : ''}
      </tr></tbody>
    </table>`;
}

// ── Bloc signatures (3 autorités) + cachet ───────────────────────────────────
function signaturesHtml(school, sys) {
  const sigImg = (url) => url
    ? `<img src="${esc(url)}" alt="" style="height:34px;display:block;margin:2px auto;object-fit:contain"/>`
    : `<div style="height:34px"></div>`;

  const censeurName     = school?.censeur_name || '';
  const directorName    = school?.director || '';
  const surveillantName = school?.surveillant_name || '';

  const col = (title, name, sigUrl, extra = '') => `
    <td style="width:33.33%;text-align:center;vertical-align:top;padding:4px 6px;font-size:9px">
      <div style="font-weight:bold;margin-bottom:2px">${esc(title)}</div>
      ${sigImg(sigUrl)}
      ${extra}
      <div style="border-top:1px solid #94a3b8;margin-top:2px;padding-top:2px;min-height:12px">${esc(name)}</div>
    </td>`;

  const stamp = school?.stamp_url
    ? `<img src="${esc(school.stamp_url)}" alt="" style="height:46px;display:block;margin:2px auto;object-fit:contain;opacity:.95"/>`
    : '';

  return `
    <table style="width:100%;border-collapse:collapse;margin-top:10px">
      <tbody><tr>
        ${col(L(sys, 'Le Censeur', 'The Dean of Studies', 'El Jefe de Estudios'), censeurName, school?.censeur_signature_url)}
        ${col(L(sys, "Le Chef d'établissement", 'The Principal', 'El Director'), directorName, school?.signature_url, stamp)}
        ${col(L(sys, 'Le Surveillant Général', 'The Senior Discipline Master', 'El Jefe de Disciplina'), surveillantName, school?.surveillant_signature_url)}
      </tr></tbody>
    </table>`;
}

// ── QR + code de vérification + mention légale ───────────────────────────────
function verifyBlockHtml(verification, qrSrc, sys) {
  return `
    <table style="width:100%;border-collapse:collapse;margin-top:10px;border-top:1px dashed #cbd5e1;padding-top:6px">
      <tbody><tr>
        <td style="width:64px;vertical-align:middle;padding-top:6px">
          ${qrSrc ? `<img src="${esc(qrSrc)}" alt="QR" style="width:60px;height:60px;display:block"/>` : ''}
        </td>
        <td style="vertical-align:middle;padding:6px 0 0 8px;font-size:8px;color:#475569;line-height:1.4">
          <div><strong>${L(sys, 'Vérification', 'Verification', 'Verificación')} :</strong> <span style="font-family:monospace;font-size:9px">${esc(verification.code)}</span></div>
          <div style="margin-top:2px;font-style:italic">
            ${L(sys,
              "Scannez le QR code pour vérifier l'authenticité de ce relevé. Document non valable sans la signature et le cachet du chef d'établissement.",
              'Scan the QR code to verify the authenticity of this transcript. Not valid without the signature and stamp of the head of school.',
              'Escanee el código QR para verificar la autenticidad de esta certificación. No válido sin la firma y el sello del director.')}
          </div>
        </td>
      </tr></tbody>
    </table>`;
}

const PAPER_OPEN = (school) =>
  `<div class="nc-sheet" style="font-family:${bulletinFontFamily(school)};font-size:10px;color:#111;width:210mm;min-height:296mm;box-sizing:border-box;padding:10mm;background:#fff;margin:0 auto">`;

const CELL = 'border:1px solid #374151;padding:3px 5px;font-size:9.5px';
const TH = `${CELL};background:#1e3a5f;color:#fff;text-align:center;font-weight:bold;font-size:9px`;

// ── Feuille A4 : relevé annuel individuel ────────────────────────────────────
// `data` = sortie de buildTranscript ; `qrSrc` = dataURL QR ; `verification` = buildVerification(...)
export function transcriptSheetHtml(data, { qrSrc, verification, school }) {
  const { student, cls, sys, cols, rows, generalAvg, generalAppr, rankEntry, stats, decision, schoolYear, maxScale } = data;
  const scaleLabel = sys === 'EN' ? '/100' : sys === 'ES' ? `/${maxScale ?? 10}` : '/20';

  const headRow = `
    <tr>
      <th style="${TH};text-align:left;width:32%">${L(sys, 'Matière', 'Subject', 'Asignatura')}</th>
      <th style="${TH};width:8%">${L(sys, 'Coef', 'Coef', 'Coef')}</th>
      ${cols.map((c) => `<th style="${TH}">${esc(c.label)}</th>`).join('')}
      <th style="${TH};width:11%">${L(sys, 'Moy. An.', 'Annual', 'Media')}</th>
      <th style="${TH};width:15%">${L(sys, 'Mention', 'Remark', 'Apreciación')}</th>
    </tr>`;

  const bodyRows = rows.map((r) => `
    <tr>
      <td style="${CELL};text-align:left;font-weight:600">${esc(r.subject.name)}</td>
      <td style="${CELL};text-align:center">${esc(r.coef)}</td>
      ${cols.map((c) => `<td style="${CELL};text-align:center">${r.seqGrades[c.seq] === null || r.seqGrades[c.seq] === undefined ? '—' : esc(r.seqGrades[c.seq])}</td>`).join('')}
      <td style="${CELL};text-align:center;font-weight:bold">${r.annual === null ? '—' : esc(r.annual)}</td>
      <td style="${CELL};text-align:center;color:${esc(r.appreciation.col)};font-weight:600">${esc(r.appreciation.text)}</td>
    </tr>`).join('');

  const colspanLeft = 2 + cols.length;

  return `
    ${PAPER_OPEN(school)}
      ${officialsHeaderHtml(school, sys)}

      <div style="background:#1e3a5f;color:#fff;text-align:center;padding:5px 8px;font-weight:bold;font-size:12px;letter-spacing:.5px;margin-bottom:6px">
        ${L(sys, 'RELEVÉ DE NOTES ANNUEL', 'ANNUAL TRANSCRIPT', 'CERTIFICACIÓN ACADÉMICA ANUAL')} — ${esc(schoolYear || school?.current_year || '')}
      </div>

      <table style="width:100%;border-collapse:collapse;margin-bottom:6px">
        <tbody><tr>
          <td style="${CELL};background:#f8fafc;width:26%"><strong>${L(sys, 'NOM ET PRÉNOM', 'FULL NAME', 'NOMBRE Y APELLIDOS')} :</strong><br/><span style="font-weight:bold">${esc(student.name)}</span></td>
          <td style="${CELL};background:#f8fafc;width:16%"><strong>${L(sys, 'MATRICULE', 'REG. NO.', 'MATRÍCULA')} :</strong><br/>${esc(student.matricule || '—')}</td>
          <td style="${CELL};background:#f8fafc;width:16%"><strong>${L(sys, 'NÉ(E) LE', 'BORN ON', 'NACIDO EL')} :</strong><br/>${esc(student.date_naissance || '—')}</td>
          <td style="${CELL};background:#f8fafc;width:14%"><strong>${L(sys, 'CLASSE', 'CLASS', 'CLASE')} :</strong><br/>${esc(cls.name)}</td>
          <td style="${CELL};background:#f8fafc;width:14%;text-align:center"><strong>${L(sys, 'EFFECTIF', 'CLASS SIZE', 'EFECTIVO')} :</strong><br/>${fmt(stats?.total)}</td>
          <td style="${CELL};background:#f8fafc;width:14%;text-align:center"><strong>${L(sys, 'RANG', 'RANK', 'PUESTO')} :</strong><br/><span style="font-size:13px;font-weight:bold">${fmt(rankEntry?.rankD)}</span></td>
        </tr></tbody>
      </table>

      <table style="width:100%;border-collapse:collapse">
        <thead>${headRow}</thead>
        <tbody>
          ${bodyRows || `<tr><td style="${CELL};text-align:center" colspan="${colspanLeft + 2}">${L(sys, 'Aucune matière', 'No subjects', 'Sin asignaturas')}</td></tr>`}
          <tr>
            <td style="${CELL};background:#e8edf2;font-weight:bold;text-align:right" colspan="${colspanLeft}">${L(sys, 'MOYENNE GÉNÉRALE ANNUELLE', 'ANNUAL GENERAL AVERAGE', 'MEDIA GENERAL ANUAL')} ${esc(scaleLabel)}</td>
            <td style="${CELL};background:#e8edf2;text-align:center;font-weight:bold;font-size:12px;color:${decision.passed ? '#059669' : '#dc2626'}">${generalAvg === null ? '—' : esc(generalAvg)}</td>
            <td style="${CELL};background:#e8edf2;text-align:center;font-weight:600;color:${esc(generalAppr.col)}">${esc(generalAppr.text)}</td>
          </tr>
        </tbody>
      </table>

      <table style="width:100%;border-collapse:collapse;margin-top:6px">
        <tbody><tr>
          <td style="${CELL};background:#f1f5f9;width:25%;text-align:center"><strong>${L(sys, 'Moy. de la classe', 'Class average', 'Media de clase')}</strong><br/>${fmt(stats?.avg)}</td>
          <td style="${CELL};background:#f1f5f9;width:25%;text-align:center"><strong>${L(sys, 'Plus forte moy.', 'Highest avg', 'Media más alta')}</strong><br/>${fmt(stats?.max)}</td>
          <td style="${CELL};background:#f1f5f9;width:25%;text-align:center"><strong>${L(sys, 'Plus faible moy.', 'Lowest avg', 'Media más baja')}</strong><br/>${fmt(stats?.min)}</td>
          <td style="${CELL};width:25%;text-align:center"><strong>${L(sys, 'DÉCISION', 'DECISION', 'DECISIÓN')}</strong><br/><span style="font-weight:bold;color:${decision.passed ? '#059669' : '#dc2626'}">${esc(L(sys, decision.fr, decision.en, decision.es))}</span></td>
        </tr></tbody>
      </table>

      ${signaturesHtml(school, sys)}
      ${verifyBlockHtml(verification, qrSrc, sys)}
    </div>`;
}

// ── Feuille A4 : relevé multi-années (historique 6e → Terminale) ─────────────
// `history` = sortie de buildMultiYearHistory ; `student` = ligne canonique.
export function multiYearSheetHtml(student, history, { qrSrc, verification, school, sys = 'FR' }) {
  const rows = history.map((h) => `
    <tr>
      <td style="${CELL};text-align:center;font-weight:600">${esc(h.year)}</td>
      <td style="${CELL}">${esc(h.className)}</td>
      <td style="${CELL};text-align:center">${esc(h.level)}</td>
      <td style="${CELL};text-align:center;font-weight:bold">${h.generalAvg === null ? '—' : esc(h.generalAvg)}${h.sys === 'EN' ? '/100' : h.sys === 'ES' ? `/${h.maxScale ?? 10}` : '/20'}</td>
      <td style="${CELL};text-align:center">${esc(h.rank)}</td>
      <td style="${CELL};text-align:center;color:${h.decision.passed ? '#059669' : '#dc2626'};font-weight:600">${esc(L(sys, h.decision.fr, h.decision.en, h.decision.es))}</td>
    </tr>`).join('');

  return `
    ${PAPER_OPEN(school)}
      ${officialsHeaderHtml(school, sys)}

      <div style="background:#4338ca;color:#fff;text-align:center;padding:5px 8px;font-weight:bold;font-size:12px;letter-spacing:.5px;margin-bottom:6px">
        ${L(sys, 'RELEVÉ DE NOTES — SCOLARITÉ COMPLÈTE', 'TRANSCRIPT — FULL SCHOOLING HISTORY', 'CERTIFICACIÓN — HISTORIAL COMPLETO')}
      </div>

      <table style="width:100%;border-collapse:collapse;margin-bottom:6px">
        <tbody><tr>
          <td style="${CELL};background:#f8fafc;width:40%"><strong>${L(sys, 'NOM ET PRÉNOM', 'FULL NAME', 'NOMBRE Y APELLIDOS')} :</strong><br/><span style="font-weight:bold">${esc(student.name)}</span></td>
          <td style="${CELL};background:#f8fafc;width:30%"><strong>${L(sys, 'MATRICULE', 'REG. NO.', 'MATRÍCULA')} :</strong><br/>${esc(student.matricule || '—')}</td>
          <td style="${CELL};background:#f8fafc;width:30%"><strong>${L(sys, 'NÉ(E) LE', 'BORN ON', 'NACIDO EL')} :</strong><br/>${esc(student.date_naissance || '—')}</td>
        </tr></tbody>
      </table>

      <table style="width:100%;border-collapse:collapse">
        <thead><tr>
          <th style="${TH};width:14%">${L(sys, 'Année', 'Year', 'Año')}</th>
          <th style="${TH};text-align:left">${L(sys, 'Classe', 'Class', 'Clase')}</th>
          <th style="${TH};width:14%">${L(sys, 'Niveau', 'Level', 'Nivel')}</th>
          <th style="${TH};width:16%">${L(sys, 'Moy. annuelle', 'Annual avg', 'Media anual')}</th>
          <th style="${TH};width:10%">${L(sys, 'Rang', 'Rank', 'Puesto')}</th>
          <th style="${TH};width:22%">${L(sys, 'Décision', 'Decision', 'Decisión')}</th>
        </tr></thead>
        <tbody>${rows || `<tr><td style="${CELL};text-align:center" colspan="6">${L(sys, 'Aucune année', 'No years', 'Sin años')}</td></tr>`}</tbody>
      </table>

      ${signaturesHtml(school, sys)}
      ${verifyBlockHtml(verification, qrSrc, sys)}
    </div>`;
}

// ── Document d'impression complet (1..N feuilles) ────────────────────────────
export function buildPrintDocument(sheets, title) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
  <title>${esc(title)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background:#f1f5f9; }
    .nc-sheet { page-break-after: always; box-shadow: 0 1px 6px rgba(0,0,0,.12); margin: 8mm auto; }
    .nc-sheet:last-child { page-break-after: auto; }
    @media print {
      body { background:#fff; }
      .nc-sheet { box-shadow:none; margin:0 auto; }
      @page { size: A4; margin: 0; }
    }
  </style></head>
  <body>
    ${sheets.join('\n')}
    <script>window.onload = () => setTimeout(() => window.print(), 300);</script>
  </body></html>`;
}

// Ouvre une fenêtre d'impression avec les feuilles fournies.
export function printSheets(sheets, title) {
  const win = window.open('', '_blank', 'width=920,height=1200');
  if (!win) {
    alert("Veuillez autoriser les pop-ups pour imprimer les relevés.");
    return false;
  }
  win.document.open();
  win.document.write(buildPrintDocument(sheets, title));
  win.document.close();
  return true;
}
