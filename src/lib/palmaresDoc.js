// Palmarès de fin d'année — tableau d'honneur classé par classe.
//
// Génère des feuilles A4 sur le socle d'impression partagé (lib/print) : page,
// marges, couleurs et sauts viennent de là, ce fichier ne décrit que le contenu.
// En-tête officiel hérité du pays.

import { sheetOpen, SHEET_CLOSE, officialHeaderHtml, titleBandHtml, esc, safe, num, CLASS } from './print';

const L = (sys, fr, en, es) => (sys === 'EN' ? en : sys === 'ES' ? (es || fr) : fr);
const fmt = (v) => safe(v);

const CELL = 'border:1px solid #374151;padding:3px 6px;font-size:10px';
const TH = `${CELL};background:#7c2d12;color:#fff;text-align:center;font-weight:bold;font-size:9px`;

// Feuille A4 : palmarès d'une classe.
// data = { className, level, sys, rows:[{rank,name,avg,mention,mentionCol,isMajor}], stats:{avg,total} }
export function palmaresClassSheet(school, year, data) {
  const { className, sys, rows, stats } = data;
  const body = rows.map((r) => `
    <tr style="${r.isMajor ? 'background:#fffbeb' : ''}">
      <td style="${CELL};text-align:center;font-weight:${r.isMajor ? 'bold' : '600'}">${safe(r.rank)}${r.isMajor ? ' 🏆' : ''}</td>
      <td style="${CELL};font-weight:${r.isMajor ? 'bold' : '500'}">${safe(r.name)}</td>
      <td style="${CELL};text-align:center;font-weight:bold">${num(r.avg)}</td>
      <td style="${CELL};text-align:center;color:${esc(r.mentionCol || '#374151')};font-weight:600">${safe(r.mention)}</td>
    </tr>`).join('');

  // La classe est rappelée dans l'en-tête de tableau : un palmarès de 60 élèves
  // occupe deux pages, et `<thead>` se réimprime sur chacune.
  return `
    ${sheetOpen({ school })}
      ${officialHeaderHtml({ ...school, current_year: year || school?.current_year }, sys)}
      ${titleBandHtml(`🏆 ${L(sys, 'PALMARÈS', 'HONOUR ROLL', 'CUADRO DE HONOR')} — ${safe(className, '')}`, { background: '#7c2d12', fontSize: 13 })}
      <table class="${CLASS.keep}" style="width:100%;border-collapse:collapse;margin-bottom:6px">
        <tbody><tr>
          <td style="${CELL};background:#fef3c7;width:50%;text-align:center"><strong>${L(sys, 'Effectif', 'Class size', 'Efectivo')}</strong> : ${fmt(stats?.total)}</td>
          <td style="${CELL};background:#fef3c7;width:50%;text-align:center"><strong>${L(sys, 'Moyenne de classe', 'Class average', 'Media de clase')}</strong> : ${fmt(stats?.avg)}</td>
        </tr></tbody>
      </table>
      <table style="width:100%;border-collapse:collapse">
        <thead>
        <tr><th style="${CELL};background:#fef3c7;text-align:left;font-size:9px;font-weight:600" colspan="4">${safe(className, '')} · ${safe(year, '')}</th></tr>
        <tr>
          <th style="${TH};width:12%">${L(sys, 'Rang', 'Rank', 'Puesto')}</th>
          <th style="${TH};text-align:left">${L(sys, 'Nom et prénom', 'Full name', 'Nombre y apellidos')}</th>
          <th style="${TH};width:16%">${L(sys, 'Moyenne', 'Average', 'Media')}</th>
          <th style="${TH};width:24%">${L(sys, 'Mention', 'Remark', 'Apreciación')}</th>
        </tr></thead>
        <tbody>${body || `<tr><td style="${CELL};text-align:center" colspan="4">—</td></tr>`}</tbody>
      </table>
      <p class="${CLASS.keep}" style="font-size:8px;color:#64748b;margin-top:8px;font-style:italic">
        ${L(sys, 'Classement établi sur la moyenne générale annuelle.', 'Ranking based on the annual general average.', 'Clasificación según la media general anual.')}
      </p>
    ${SHEET_CLOSE}`;
}
