// En-tête institutionnel officiel partagé (mise en page « bulletin APC »).
//
// Standard de la plateforme : tous les documents à imprimer reprennent cet
// en-tête (blocs officiels du pays + logo + nom + année + barre de titre
// #1e3a5f) et un pied à signature UNIQUE (le chef d'établissement). Seules la
// carte scolaire, le diplôme et le reçu de frais y échappent.
//
// Source HTML-string réutilisable par tous les builders d'impression (relevés,
// rapports, listes, conseil, emploi du temps…). Calé sur officialsHeaderHtml de
// transcriptDoc.js pour un rendu identique au bulletin.

import { bulletinOfficials } from '../countries';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));
const L = (sys, fr, en, es) => (sys === 'EN' ? en : sys === 'ES' ? (es || fr) : fr);

// En-tête officiel (blocs pays + logo + établissement + année) avec barre de
// titre optionnelle. `sys` = 'FR' | 'EN' | 'ES'.
export function officialHeaderHtml(school, { sys = 'FR', title = '', subtitle = '' } = {}) {
  const officials = bulletinOfficials(school);
  const blocks    = officials?.blocks ?? [];
  const bilingual = officials?.bilingual && blocks.length > 1;
  const centerW   = bilingual ? '34%' : '50%';
  const sideW     = bilingual ? '33%' : '50%';

  const block = (b) => b ? `
    <td style="width:${sideW};text-align:center;font-size:9px;line-height:1.45;padding:2px;vertical-align:top">
      <strong>${esc(b.republic)}</strong><br/>
      ${esc(b.motto)}<br/>————————<br/>
      ${esc(b.ministry)}${b.lines.length ? '<br/>' : ''}
      ${b.lines.map((ln) => esc(ln)).join('<br/>')}
      ${b.establishment ? `<br/><strong>${esc(b.establishment)}</strong>` : ''}
    </td>` : '';

  const titleBar = title ? `
    <div style="background:#1e3a5f;color:#fff;text-align:center;padding:5px 8px;font-weight:bold;font-size:13px;letter-spacing:.5px;margin-bottom:6px;-webkit-print-color-adjust:exact;print-color-adjust:exact">
      ${esc(title)}${subtitle ? ` — ${esc(subtitle)}` : ''}
    </div>` : '';

  return `
    <table style="width:100%;border-collapse:collapse;margin-bottom:6px">
      <tbody><tr>
        ${block(blocks[0])}
        <td style="width:${centerW};text-align:center;padding:2px;vertical-align:top">
          ${school?.logo_url ? `<img src="${esc(school.logo_url)}" alt="" style="width:64px;height:64px;object-fit:contain;display:block;margin:0 auto 3px"/>` : ''}
          <strong style="font-size:12px;display:block">${esc((school?.name || '').toUpperCase())}</strong>
          ${(school?.address || school?.phone) ? `<span style="font-size:8.5px">${school?.address ? 'B.P. ' + esc(school.address) : ''}${school?.address && school?.phone ? ' · ' : ''}${esc(school?.phone || '')}</span><br/>` : ''}
          <span style="font-size:8.5px">${L(sys, 'Année scolaire', 'Academic year', 'Año escolar')} : <strong>${esc(school?.current_year || '—')}</strong></span>
        </td>
        ${bilingual ? block(blocks[1]) : ''}
      </tr></tbody>
    </table>
    ${titleBar}`;
}

// Pied de page : signature UNIQUE du chef d'établissement + cachet.
export function officialSignatureHtml(school, sys = 'FR') {
  const sig = school?.signature_url
    ? `<img src="${esc(school.signature_url)}" alt="" style="height:38px;display:block;margin:2px auto;object-fit:contain;mix-blend-mode:multiply"/>`
    : `<div style="height:38px"></div>`;
  const stamp = school?.stamp_url
    ? `<img src="${esc(school.stamp_url)}" alt="" style="height:54px;display:block;margin:-4px auto 2px;object-fit:contain;opacity:.95;mix-blend-mode:multiply"/>`
    : '';

  return `
    <table style="width:100%;border-collapse:collapse;margin-top:18px">
      <tbody><tr>
        <td style="width:55%"></td>
        <td style="width:45%;text-align:center;vertical-align:top;font-size:10px">
          <div style="font-weight:bold">${L(sys, "Le Chef d'établissement", 'The Principal', 'El Director')}</div>
          ${sig}${stamp}
          <div style="border-top:1px solid #94a3b8;margin-top:2px;padding-top:2px;min-height:12px">${esc(school?.director || '')}</div>
        </td>
      </tr></tbody>
    </table>`;
}
