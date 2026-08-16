// ─────────────────────────────────────────────────────────────────────────────
// MISE EN PAGE DES TABLEAUX D'HONNEUR — génère des feuilles A4 (.nc-sheet)
// réutilisables par le pipeline d'impression/PDF existant (transcriptDoc /
// transcriptPdf). Trois modèles : table collective, certificat individuel,
// affiche murale. Tout est piloté par la « personnalisation » du modèle
// (couleur, police, logo, signature, tampon, textes), donc zéro code par école.

import { bulletinOfficials, resolveCountryCode } from '../countries';
import { createDocumentScale, pageDimsPx } from './documentScale';
import { sheetOpen, SHEET_CLOSE, esc, CLASS } from './print';

// Dimensionnement « standard » (listes A4 : table collective / affiche). Les
// documents individuels (certificat / diplôme) passent par <HonorAward/> (prestige).
const S = createDocumentScale({ category: 'standard', orientation: 'portrait', ...pageDimsPx('portrait') });

const FLAG = { cameroon_fr: '🇨🇲', cameroon_en: '🇨🇲', guinea_eq: '🇬🇶', gabon: '🇬🇦', ivory_coast: '🇨🇮', congo: '🇨🇬' };

const L = (sys, fr, en, es) => (sys === 'EN' ? en : sys === 'ES' ? (es || fr) : fr);
const fmt = (v) => (v === null || v === undefined || v === '' ? '—' : v);

// En-tête officiel (république/ministère/établissement) hérité du pays.
function headerHtml(school, sys, year, primary) {
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
          ${school?.logo_url ? `<img data-part="logo" src="${esc(school.logo_url)}" alt="" style="width:${S.logoSm}px;height:${S.logoSm}px;object-fit:contain;display:block;margin:0 auto 3px"/>` : ''}
          <strong style="font-size:12px;display:block;color:${esc(primary)}">${esc((school?.name || '').toUpperCase())}</strong>
          <span style="font-size:8.5px">${L(sys, 'Année scolaire', 'Academic year', 'Año escolar')} : <strong>${esc(year || '')}</strong></span>
        </td>
        ${bilingual ? block(blocks[1]) : ''}
      </tr></tbody>
    </table>`;
}

// Bandeau-titre du tableau (nom personnalisé + sous-titre du groupe).
function bannerHtml(p, sys, subtitle) {
  const title = p.title || L(sys, "TABLEAU D'HONNEUR", 'HONOUR ROLL', 'CUADRO DE HONOR');
  return `
    <div class="${CLASS.keep}" data-part="title" style="background:${esc(p.primaryColor)};color:#fff;text-align:center;padding:6px 8px;font-weight:bold;font-size:14px;letter-spacing:.5px;margin-bottom:6px;border-radius:4px">
      🏆 ${esc(title)}${subtitle ? ` — ${esc(subtitle)}` : ''}
    </div>`;
}

// Bloc signature + tampon (pied de page).
function signatureHtml(school, sys) {
  const stamp = school?.stamp_url ? `<img data-part="stamp" src="${esc(school.stamp_url)}" alt="" style="width:${S.stamp}px;height:${S.stamp}px;object-fit:contain;opacity:.9;mix-blend-mode:multiply"/>` : '';
  const sign = school?.signature_url ? `<img data-part="signature" src="${esc(school.signature_url)}" alt="" style="height:${S.signatureHeight}px;object-fit:contain;display:block;margin:0 auto;mix-blend-mode:multiply"/>` : `<div style="height:${S.signatureHeight}px"></div>`;
  return `
    <table class="${CLASS.keep}" data-part="signature-block" style="width:100%;border-collapse:collapse;margin-top:14px">
      <tbody><tr>
        <td style="width:50%;text-align:center;vertical-align:bottom">${stamp}</td>
        <td style="width:50%;text-align:center;vertical-align:bottom;font-size:10px">
          ${sign}
          <div style="border-top:1px solid #94a3b8;margin:2px 24px 0;padding-top:2px">
            ${L(sys, 'Le Proviseur / Directeur', 'The Principal', 'El Director')}
          </div>
        </td>
      </tr></tbody>
    </table>`;
}

const COLS = {
  rank:    { w: '10%', th: (sys) => L(sys, 'Rang', 'Rank', 'Puesto'),    align: 'center' },
  photo:   { w: '12%', th: () => '',                                      align: 'center' },
  name:    { w: '',    th: (sys) => L(sys, 'Nom et prénom', 'Full name', 'Nombre y apellidos'), align: 'left' },
  class:   { w: '16%', th: (sys) => L(sys, 'Classe', 'Class', 'Clase'),   align: 'center' },
  avg:     { w: '14%', th: (sys) => L(sys, 'Moyenne', 'Average', 'Media'), align: 'center' },
  mention: { w: '20%', th: (sys) => L(sys, 'Mention', 'Remark', 'Apreciación'), align: 'center' },
  conduite:{ w: '12%', th: (sys) => L(sys, 'Conduite', 'Conduct', 'Conducta'), align: 'center' },
  gender:  { w: '10%', th: (sys) => L(sys, 'Sexe', 'Gender', 'Sexo'),     align: 'center' },
};

function cellValue(col, r) {
  switch (col) {
    case 'rank':    return `${r.rank || r.rankLabel || ''}${r.rank === 1 ? ' 🏆' : ''}`;
    case 'photo':   return r.photo_url ? `<img src="${esc(r.photo_url)}" style="width:34px;height:34px;border-radius:50%;object-fit:cover" alt=""/>` : '';
    case 'name':    return esc(r.name);
    case 'class':   return esc(r.className);
    case 'avg':     return r.avg == null ? '—' : `${esc(r.avg)}/${esc(r.scaleMax)}`;
    case 'mention': return `<span style="color:${esc(r.mentionCol || '#374151')};font-weight:600">${esc(r.mention || '—')}</span>`;
    case 'conduite':return esc(r.conduite || '—');
    case 'gender':  return esc(r.gender || '—');
    default:        return '';
  }
}

// ── Modèle 1 : TABLE COLLECTIVE ───────────────────────────────────────────────
export function tableSheet(school, year, p, group, sys) {
  const cols = (p.columns && p.columns.length ? p.columns : ['rank', 'name', 'class', 'avg', 'mention']);
  const CELL = 'border:1px solid #374151;padding:4px 6px;font-size:10px';
  const TH = `${CELL};background:${p.primaryColor};color:#fff;text-align:center;font-weight:bold;font-size:9px`;
  const landscape = p.orientation === 'landscape';

  const head = cols.map((c) => `<th style="${TH}${COLS[c].w ? `;width:${COLS[c].w}` : ''};text-align:${COLS[c].align}">${COLS[c].th(sys)}</th>`).join('');
  const body = group.rows.map((r) => `
    <tr style="${r.rank === 1 ? 'background:#fffbeb' : ''}">
      ${cols.map((c) => `<td style="${CELL};text-align:${COLS[c].align};font-weight:${r.rank === 1 ? 'bold' : '500'}">${cellValue(c, r)}</td>`).join('')}
    </tr>`).join('');

  return `
    ${sheetOpen({ school, profile: landscape ? 'large' : 'standard', fontSize: 10 })}
      ${headerHtml(school, sys, year, p.primaryColor)}
      ${bannerHtml(p, sys, group.title)}
      ${p.introText ? `<p style="font-size:10px;text-align:center;margin:4px 0 8px;font-style:italic;color:#475569">${esc(p.introText)}</p>` : ''}
      <table style="width:100%;border-collapse:collapse">
        <thead><tr>${head}</tr></thead>
        <tbody>${body || `<tr><td style="${CELL};text-align:center" colspan="${cols.length}">—</td></tr>`}</tbody>
      </table>
      ${p.congratsText ? `<p style="font-size:10px;text-align:center;margin-top:10px;color:${esc(p.primaryColor)};font-weight:600">${esc(p.congratsText)}</p>` : ''}
      ${p.specialMention ? `<p style="font-size:9px;text-align:center;margin-top:4px;font-style:italic;color:#64748b">${esc(p.specialMention)}</p>` : ''}
      ${signatureHtml(school, sys)}
    ${SHEET_CLOSE}`;
}

// ── Modèle 2 : CERTIFICAT INDIVIDUEL (une feuille par élève) ──────────────────
export function certificateSheet(school, year, p, row, sys) {
  return `
    ${sheetOpen({ school, fontSize: 12 })}
      <div class="nc-frame" style="min-height:265mm;box-sizing:border-box;padding:10mm;border:6px double ${esc(p.primaryColor)}">
      ${headerHtml(school, sys, year, p.primaryColor)}
      <div style="text-align:center;margin-top:18mm">
        <div style="font-size:30px;font-weight:bold;letter-spacing:2px;color:${esc(p.primaryColor)}">${esc(p.title || L(sys, "CERTIFICAT D'HONNEUR", 'CERTIFICATE OF HONOUR', 'CERTIFICADO DE HONOR'))}</div>
        <p style="font-size:13px;margin-top:14px;color:#475569">${esc(p.introText || L(sys, 'Décerné à', 'Awarded to', 'Otorgado a'))}</p>
        ${row.photo_url ? `<img src="${esc(row.photo_url)}" style="width:90px;height:90px;border-radius:50%;object-fit:cover;margin:10px auto;display:block;border:3px solid ${esc(p.primaryColor)}" alt=""/>` : ''}
        <div style="font-size:26px;font-weight:bold;margin-top:8px">${esc(row.name)}</div>
        <p style="font-size:13px;color:#475569;margin-top:6px">
          ${esc(row.className)}${row.rank ? ` · ${L(sys, 'Rang', 'Rank', 'Puesto')} ${row.rank}` : ''}
          ${row.avg != null ? ` · ${L(sys, 'Moyenne', 'Average', 'Media')} ${esc(row.avg)}/${esc(row.scaleMax)}` : ''}
          ${row.mention ? ` · ${esc(row.mention)}` : ''}
        </p>
        <p style="font-size:13px;margin-top:20px;max-width:120mm;margin-left:auto;margin-right:auto;color:#334155">
          ${esc(p.congratsText || L(sys, 'pour ses résultats remarquables et son excellence scolaire.', 'for outstanding results and academic excellence.', 'por sus excelentes resultados académicos.'))}
        </p>
        ${p.specialMention ? `<p style="font-size:11px;margin-top:10px;font-style:italic;color:#64748b">${esc(p.specialMention)}</p>` : ''}
      </div>
      ${signatureHtml(school, sys)}
      </div>
    ${SHEET_CLOSE}`;
}

// ── Modèle 3 : AFFICHE MURALE (grand format, top élèves) ──────────────────────
export function posterSheet(school, year, p, group, sys) {
  const top = group.rows.slice(0, 10);
  const medal = (i) => (i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`);
  const items = top.map((r, i) => `
    <li style="display:flex;align-items:center;gap:14px;padding:10px 16px;border-bottom:1px solid #e2e8f0;${i < 3 ? 'background:#fffbeb' : ''}">
      <span style="font-size:24px;width:40px;text-align:center">${medal(i)}</span>
      ${r.photo_url ? `<img src="${esc(r.photo_url)}" style="width:46px;height:46px;border-radius:50%;object-fit:cover" alt=""/>` : ''}
      <span style="flex:1;font-size:20px;font-weight:${i < 3 ? 'bold' : '600'}">${esc(r.name)}</span>
      <span style="font-size:14px;color:#64748b">${esc(r.className)}</span>
      <span style="font-size:20px;font-weight:bold;color:${esc(p.primaryColor)}">${r.avg == null ? '—' : `${esc(r.avg)}/${esc(r.scaleMax)}`}</span>
    </li>`).join('');
  return `
    ${sheetOpen({ school, fontSize: 12 })}
      <div style="padding:4mm">
      ${headerHtml(school, sys, year, p.primaryColor)}
      <div style="text-align:center;margin:10mm 0 6mm">
        <div style="font-size:34px;font-weight:bold;color:${esc(p.primaryColor)}">🏆 ${esc(p.title || L(sys, "TABLEAU D'HONNEUR", 'HONOUR ROLL', 'CUADRO DE HONOR'))}</div>
        ${group.title ? `<div style="font-size:18px;color:#475569;margin-top:4px">${esc(group.title)}</div>` : ''}
        ${p.introText ? `<p style="font-size:13px;color:#64748b;margin-top:6px;font-style:italic">${esc(p.introText)}</p>` : ''}
      </div>
      <ul style="list-style:none;padding:0;margin:0;border:2px solid ${esc(p.primaryColor)};border-radius:8px;overflow:hidden">${items}</ul>
      ${p.congratsText ? `<p style="font-size:14px;text-align:center;margin-top:12px;color:${esc(p.primaryColor)};font-weight:600">${esc(p.congratsText)}</p>` : ''}
      ${signatureHtml(school, sys)}
      </div>
    ${SHEET_CLOSE}`;
}

// ── Modèle 4 : DIPLÔME D'EXCELLENCE (paysage, riche, par élève) ───────────────
// Certificat ornemental individuel : en-tête pays + logo, photo, rang en médaille,
// panneau d'infos, performances par matière, mention spéciale, 3 signatures +
// cachet. Générique : s'adapte à toute école / pays / système / nb de matières.
export function diplomaSheet(school, year, p, row, sys) {
  const GOLD = '#b8860b';
  const NAVY = p.primaryColor && p.primaryColor !== '#7c2d12' ? p.primaryColor : '#1e3a8a';
  const officials = bulletinOfficials(school);
  const b0 = officials?.blocks?.[0] || {};
  const cc = resolveCountryCode(school);
  const flag = FLAG[cc] || '';
  const rank = row.rank || (row.rankInClass || null);
  const rankWord = rank === 1
    ? L(sys, 'PREMIER(E)', 'FIRST', 'PRIMERO(A)')
    : rank ? `${rank}ᵉ` : '';
  const place = p.place || school?.region || school?.division || school?.subdivision || '';
  const today = new Date().toLocaleDateString(sys === 'EN' ? 'en-GB' : sys === 'ES' ? 'es-ES' : 'fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

  const info = (label, val) => `
    <tr>
      <td style="border:1px solid ${GOLD};padding:3px 8px;font-size:9px;font-weight:bold;background:${NAVY};color:#fff">${esc(label)}</td>
      <td style="border:1px solid ${GOLD};padding:3px 8px;font-size:10px;font-weight:600;text-align:center">${val}</td>
    </tr>`;

  const subjects = (row.subjects || []).filter((s) => s.avg != null);
  const subjCells = subjects.map((s) => `
    <td style="border:1px solid ${GOLD};padding:3px 6px;text-align:center;vertical-align:top">
      <div style="font-size:7.5px;font-weight:bold;color:${NAVY};text-transform:uppercase;line-height:1.1">${esc(s.name)}</div>
      <div style="font-size:10px;font-weight:bold;margin-top:2px">${esc(s.avg)} / ${esc(s.max)}</div>
    </td>`).join('');

  const sigCol = (title, name, img) => `
    <td style="width:25%;text-align:center;vertical-align:bottom;font-size:9px;padding:0 4px">
      <div style="font-style:italic;color:${NAVY};margin-bottom:2px">${esc(title)}</div>
      ${img ? `<img src="${esc(img)}" style="height:30px;object-fit:contain;display:block;margin:0 auto"/>` : '<div style="height:30px"></div>'}
      <div style="border-top:1px solid #94a3b8;padding-top:1px">${esc(name || '')}</div>
    </td>`;

  return `
    ${sheetOpen({ school, profile: 'large', fontSize: 12 })}
      <div style="border:3px solid ${NAVY};border-radius:6px;min-height:186mm;box-sizing:border-box;padding:4mm">
       <div style="border:1px solid ${GOLD};border-radius:4px;box-sizing:border-box;padding:6mm;position:relative">

        <!-- En-tête -->
        <table style="width:100%;border-collapse:collapse">
          <tbody><tr>
            <td style="width:30%;vertical-align:top;font-size:10px">
              ${school?.logo_url ? `<img src="${esc(school.logo_url)}" style="width:54px;height:54px;object-fit:contain;float:left;margin-right:8px"/>` : ''}
              <strong style="font-size:13px;color:${NAVY};display:block">${esc((school?.name || '').toUpperCase())}</strong>
              <span style="font-size:8.5px;color:#475569">${esc(school?.address || place)}</span>
            </td>
            <td style="width:40%;text-align:center;vertical-align:top">
              <div style="font-size:9px;font-weight:bold;letter-spacing:.5px">${esc(b0.republic || '')} ${flag}</div>
              <div style="font-size:8px;color:#475569">${esc(b0.motto || '')}</div>
              <div style="font-size:22px;font-weight:bold;color:${NAVY};letter-spacing:1px;margin-top:4px">${esc(p.title || L(sys, "TABLEAU D'HONNEUR", 'HONOUR ROLL', 'CUADRO DE HONOR'))}</div>
              <div style="font-size:11px;font-weight:bold;color:${GOLD};letter-spacing:1px">${esc(p.subtitle || L(sys, "D'EXCELLENCE ACADÉMIQUE", 'OF ACADEMIC EXCELLENCE', 'DE EXCELENCIA ACADÉMICA'))}</div>
            </td>
            <td style="width:30%;text-align:right;vertical-align:top">
              <div style="display:inline-block;border:2px solid ${GOLD};border-radius:50%;width:70px;height:70px;line-height:1;text-align:center;color:${NAVY};font-size:7.5px;font-weight:bold;padding-top:14px;box-sizing:border-box">
                ${esc(L(sys, 'EXCELLENCE', 'EXCELLENCE', 'EXCELENCIA'))}<br/>${esc(L(sys, 'DISCIPLINE', 'DISCIPLINE', 'DISCIPLINA'))}<br/>${esc(L(sys, 'RÉUSSITE', 'SUCCESS', 'ÉXITO'))}
              </div>
            </td>
          </tr></tbody>
        </table>

        <!-- Corps -->
        <table style="width:100%;border-collapse:collapse;margin-top:6px">
          <tbody><tr>
            <td style="width:22%;text-align:center;vertical-align:top">
              ${row.photo_url ? `<img src="${esc(row.photo_url)}" style="width:95px;height:115px;object-fit:cover;border:3px solid ${NAVY};border-radius:4px"/>` : `<div style="width:95px;height:115px;border:3px solid ${NAVY};border-radius:4px;margin:0 auto;background:#f1f5f9"></div>`}
              <div style="background:${GOLD};color:#fff;font-size:9px;font-weight:bold;padding:2px;margin-top:4px;border-radius:3px">${esc(L(sys, 'FÉLICITATIONS !', 'CONGRATULATIONS!', '¡FELICIDADES!'))}</div>
            </td>
            <td style="width:48%;text-align:center;vertical-align:top;padding:0 8px">
              <p style="font-size:9.5px;color:#475569;margin:2px 0">${esc(p.introText || L(sys, "L'administration et l'ensemble du corps éducatif félicitent", 'The administration and teaching staff congratulate', 'La administración y el profesorado felicitan a'))}</p>
              <div style="font-size:24px;font-weight:bold;color:${NAVY};margin:4px 0">${esc(row.name)}</div>
              <p style="font-size:9.5px;color:#334155;font-style:italic;line-height:1.5;max-width:140mm;margin:4px auto">
                ${esc(p.congratsText || L(sys, 'pour ses résultats scolaires exceptionnels, son travail assidu, sa discipline exemplaire et son engagement constant vers l\'excellence.', 'for outstanding academic results, hard work, exemplary discipline and constant pursuit of excellence.', 'por sus excelentes resultados, su trabajo y su disciplina ejemplar.'))}
              </p>
            </td>
            <td style="width:30%;vertical-align:top">
              <div style="text-align:center;margin-bottom:4px">
                <span style="background:${NAVY};color:#fff;font-size:9px;font-weight:bold;padding:2px 14px;border-radius:3px">${esc(L(sys, 'RANG', 'RANK', 'PUESTO'))}</span>
              </div>
              <div style="text-align:center;margin-bottom:4px">
                <span style="display:inline-block;width:42px;height:42px;line-height:42px;border-radius:50%;background:${GOLD};color:#fff;font-size:22px;font-weight:bold">${rank || '—'}</span>
                <div style="font-size:9px;font-weight:bold;color:${NAVY}">${esc(rankWord)}</div>
              </div>
              <table style="width:100%;border-collapse:collapse">
                <tbody>
                  ${info(L(sys, 'CLASSE', 'CLASS', 'CLASE'), esc(row.className))}
                  ${info(L(sys, 'MOYENNE GÉNÉRALE', 'AVERAGE', 'MEDIA'), `${esc(row.avg)} / ${esc(row.scaleMax)}`)}
                  ${info(L(sys, 'MENTION', 'REMARK', 'MENCIÓN'), `<span style="color:${esc(row.mentionCol || '#111')}">${esc(row.mention || '—')}</span>`)}
                  ${info(L(sys, 'PÉRIODE', 'PERIOD', 'PERIODO'), esc(p.periodLabel || L(sys, 'Annuel', 'Annual', 'Anual')))}
                  ${info(L(sys, 'ANNÉE SCOLAIRE', 'SCHOOL YEAR', 'AÑO'), esc(year || ''))}
                </tbody>
              </table>
            </td>
          </tr></tbody>
        </table>

        <!-- Performances par matière -->
        ${subjects.length ? `
        <div style="background:${NAVY};color:#fff;text-align:center;font-size:9px;font-weight:bold;padding:2px;margin-top:6px;letter-spacing:.5px">${esc(L(sys, 'PERFORMANCES PAR MATIÈRE', 'PERFORMANCE BY SUBJECT', 'RENDIMIENTO POR ASIGNATURA'))}</div>
        <table style="width:100%;border-collapse:collapse;margin-top:2px">
          <tbody><tr>
            ${subjCells}
            <td style="border:2px solid ${GOLD};padding:3px 6px;text-align:center;background:#fffbeb;vertical-align:top">
              <div style="font-size:7.5px;font-weight:bold;color:${GOLD};text-transform:uppercase">${esc(L(sys, 'Moyenne', 'Average', 'Media'))}</div>
              <div style="font-size:12px;font-weight:bold;color:${NAVY}">${esc(row.avg)} / ${esc(row.scaleMax)}</div>
            </td>
          </tr></tbody>
        </table>` : ''}

        <!-- Pied : mention spéciale + signatures + cachet -->
        <table style="width:100%;border-collapse:collapse;margin-top:8px">
          <tbody><tr>
            <td style="width:40%;vertical-align:top;font-size:9px">
              ${p.specialMention ? `<div style="font-weight:bold;color:${GOLD}">🏆 ${esc(L(sys, 'MENTION SPÉCIALE', 'SPECIAL MENTION', 'MENCIÓN ESPECIAL'))}</div><div style="color:#475569">${esc(p.specialMention)}</div>` : ''}
            </td>
            <td style="width:60%;text-align:right;font-size:9px;color:#475569;vertical-align:top">
              ${esc(L(sys, 'Fait à', 'Done at', 'Hecho en'))} ${esc(place || '—')}, ${esc(L(sys, 'le', 'on', 'el'))} ${esc(today)}
            </td>
          </tr></tbody>
        </table>
        <table style="width:100%;border-collapse:collapse;margin-top:4px">
          <tbody><tr>
            ${sigCol(L(sys, 'Le Censeur', 'Dean of Studies', 'Jefe de Estudios'), school?.censeur_name, school?.censeur_signature_url)}
            ${sigCol(L(sys, 'Le Surveillant Général', 'Senior Discipline Master', 'Jefe de Disciplina'), school?.surveillant_name, school?.surveillant_signature_url)}
            ${sigCol(L(sys, 'Le Proviseur / Directeur', 'The Principal', 'El Director'), school?.director, school?.signature_url)}
            <td style="width:25%;text-align:center;vertical-align:bottom">
              ${school?.stamp_url ? `<img src="${esc(school.stamp_url)}" style="width:58px;height:58px;object-fit:contain"/>` : ''}
              <div style="font-size:8px;color:#94a3b8">${esc(L(sys, 'CACHET OFFICIEL', 'OFFICIAL STAMP', 'SELLO OFICIAL'))}</div>
            </td>
          </tr></tbody>
        </table>

       </div>
      </div>
    ${SHEET_CLOSE}`;
}

// ── Orchestrateur : modèle + groupes → feuilles HTML ──────────────────────────
// template.personalization = { title, primaryColor, introText, congratsText,
//   specialMention, columns, orientation }
// template.layout = 'table' | 'certificate' | 'poster'
export function buildHonorRollSheets(template, groups, school, { year } = {}) {
  const p = {
    title: '', primaryColor: '#7c2d12', introText: '', congratsText: '', specialMention: '',
    columns: ['rank', 'name', 'class', 'avg', 'mention'], orientation: 'portrait',
    ...(template.personalization || {}),
  };
  const layout = template.layout || 'table';
  const sheets = [];
  groups.forEach((g) => {
    const sys = g.rows[0]?.sys || 'FR';
    if (layout === 'diploma') {
      g.rows.forEach((r) => sheets.push(diplomaSheet(school, year, p, r, sys)));
    } else if (layout === 'certificate') {
      g.rows.forEach((r) => sheets.push(certificateSheet(school, year, p, r, sys)));
    } else if (layout === 'poster') {
      sheets.push(posterSheet(school, year, p, g, sys));
    } else {
      sheets.push(tableSheet(school, year, p, g, sys));
    }
  });
  return sheets;
}
