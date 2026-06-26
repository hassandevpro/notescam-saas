// Palmarès de fin d'année — tableau d'honneur classé par classe.
//
// Génère des feuilles A4 (.nc-sheet) réutilisant l'infrastructure d'impression /
// PDF des relevés (transcriptDoc.printSheets + transcriptPdf.exportTranscriptsPdf),
// donc aucune duplication du pipeline d'export. En-tête officiel hérité du pays.

import { bulletinOfficials } from '../countries';
import { bulletinFontFamily } from './schoolTheme';
import { createDocumentScale, pageDimsPx } from './documentScale';

// Dimensionnement « standard » (palmarès A4) — aucune taille fixe.
const S = createDocumentScale({ category: 'standard', orientation: 'portrait', ...pageDimsPx('portrait') });

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
const L = (sys, fr, en, es) => (sys === 'EN' ? en : sys === 'ES' ? (es || fr) : fr);
const fmt = (v) => (v === null || v === undefined || v === '' ? '—' : v);

const CELL = 'border:1px solid #374151;padding:3px 6px;font-size:10px';
const TH = `${CELL};background:#7c2d12;color:#fff;text-align:center;font-weight:bold;font-size:9px`;

function headerHtml(school, sys, year) {
  const officials = bulletinOfficials(school);
  const blocks = officials?.blocks ?? [];
  const bilingual = officials?.bilingual && blocks.length > 1;
  const sideW = bilingual ? '33%' : '50%';
  const centerW = bilingual ? '34%' : '50%';
  const block = (b) => b ? `
    <td style="width:${sideW};text-align:center;font-size:9px;line-height:1.4;padding:2px;vertical-align:top">
      <strong>${esc(b.republic)}</strong><br/>${esc(b.motto)}<br/>————————<br/>
      ${esc(b.ministry)}${b.lines.length ? '<br/>' : ''}${b.lines.map(esc).join('<br/>')}
      ${b.establishment ? `<br/><strong>${esc(b.establishment)}</strong>` : ''}
    </td>` : '';
  return `
    <table style="width:100%;border-collapse:collapse;margin-bottom:6px">
      <tbody><tr>
        ${block(blocks[0])}
        <td style="width:${centerW};text-align:center;padding:2px;vertical-align:top">
          ${school?.logo_url ? `<img src="${esc(school.logo_url)}" alt="" style="width:${S.logoSm}px;height:${S.logoSm}px;object-fit:contain;display:block;margin:0 auto 3px"/>` : ''}
          <strong style="font-size:12px;display:block">${esc((school?.name || '').toUpperCase())}</strong>
          <span style="font-size:8.5px">${L(sys, 'Année scolaire', 'Academic year', 'Año escolar')} : <strong>${esc(year || '')}</strong></span>
        </td>
        ${bilingual ? block(blocks[1]) : ''}
      </tr></tbody>
    </table>`;
}

// Feuille A4 : palmarès d'une classe.
// data = { className, level, sys, rows:[{rank,name,avg,mention,mentionCol,isMajor}], stats:{avg,total} }
export function palmaresClassSheet(school, year, data) {
  const { className, sys, rows, stats } = data;
  const body = rows.map((r) => `
    <tr style="${r.isMajor ? 'background:#fffbeb' : ''}">
      <td style="${CELL};text-align:center;font-weight:${r.isMajor ? 'bold' : '600'}">${esc(r.rank)}${r.isMajor ? ' 🏆' : ''}</td>
      <td style="${CELL};font-weight:${r.isMajor ? 'bold' : '500'}">${esc(r.name)}</td>
      <td style="${CELL};text-align:center;font-weight:bold">${r.avg === null ? '—' : esc(r.avg)}</td>
      <td style="${CELL};text-align:center;color:${esc(r.mentionCol || '#374151')};font-weight:600">${esc(r.mention || '—')}</td>
    </tr>`).join('');

  return `
    <div class="nc-sheet" style="font-family:${bulletinFontFamily(school)};font-size:10px;color:#111;width:210mm;min-height:296mm;box-sizing:border-box;padding:10mm;background:#fff;margin:0 auto">
      ${headerHtml(school, sys, year)}
      <div style="background:#7c2d12;color:#fff;text-align:center;padding:5px 8px;font-weight:bold;font-size:13px;letter-spacing:.5px;margin-bottom:6px">
        🏆 ${L(sys, 'PALMARÈS', 'HONOUR ROLL', 'CUADRO DE HONOR')} — ${esc(className)}
      </div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:6px">
        <tbody><tr>
          <td style="${CELL};background:#fef3c7;width:50%;text-align:center"><strong>${L(sys, 'Effectif', 'Class size', 'Efectivo')}</strong> : ${fmt(stats?.total)}</td>
          <td style="${CELL};background:#fef3c7;width:50%;text-align:center"><strong>${L(sys, 'Moyenne de classe', 'Class average', 'Media de clase')}</strong> : ${fmt(stats?.avg)}</td>
        </tr></tbody>
      </table>
      <table style="width:100%;border-collapse:collapse">
        <thead><tr>
          <th style="${TH};width:12%">${L(sys, 'Rang', 'Rank', 'Puesto')}</th>
          <th style="${TH};text-align:left">${L(sys, 'Nom et prénom', 'Full name', 'Nombre y apellidos')}</th>
          <th style="${TH};width:16%">${L(sys, 'Moyenne', 'Average', 'Media')}</th>
          <th style="${TH};width:24%">${L(sys, 'Mention', 'Remark', 'Apreciación')}</th>
        </tr></thead>
        <tbody>${body || `<tr><td style="${CELL};text-align:center" colspan="4">—</td></tr>`}</tbody>
      </table>
      <p style="font-size:8px;color:#64748b;margin-top:8px;font-style:italic">
        ${L(sys, 'Classement établi sur la moyenne générale annuelle.', 'Ranking based on the annual general average.', 'Clasificación según la media general anual.')}
      </p>
    </div>`;
}
