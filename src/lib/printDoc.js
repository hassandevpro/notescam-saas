// Socle d'IMPRESSION partagé (Finances / RH / Patrimoine).
// Approche « maison » déjà en place dans l'app (cf. lib/staffExport.printStaffList) :
// window.open + document HTML autonome + CSS @media print + window.print().
// → Zéro dépendance, 100 % hors-ligne, aucune requête réseau pour générer le doc.
//
// L'en-tête établissement est lu depuis l'objet `school` existant (nom, logo,
// adresse, contact…) — éventuellement déjà surchargé par unité via
// lib/schoolIdentity.documentIdentity() côté appelant.

export const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

// Référence STABLE d'un document, calculée à l'impression (pas de compteur en base).
// Déterministe pour un même document (même id ⇒ même réf) : dérivée de l'id.
//   docRef('BD', 2026, expense.id) -> 'BD-2026-A1B2C3'
export function docRef(type, year, id) {
  const short = String(id || '').replace(/[^a-zA-Z0-9]/g, '').slice(-6).toUpperCase() || '000000';
  return `${type}-${year || new Date().getFullYear()}-${short}`;
}

const SHARED_CSS = `
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Segoe UI',Arial,sans-serif;font-size:12px;color:#111}
  .page{padding:16mm 14mm}
  .doc-header{display:flex;align-items:center;gap:14px;border-bottom:2px solid #1e3a5f;padding-bottom:12px;margin-bottom:16px}
  .doc-header .logo{width:56px;height:56px;object-fit:contain;flex:0 0 auto}
  .doc-header .identity{flex:1;min-width:0}
  .doc-header .school{font-size:15px;font-weight:800;text-transform:uppercase;color:#1e3a5f;letter-spacing:.4px}
  .doc-header .contact{font-size:10px;color:#555;margin-top:2px;line-height:1.35}
  .doc-header .right{text-align:right;flex:0 0 auto}
  .doc-header .doc-title{font-size:15px;font-weight:800;text-transform:uppercase;letter-spacing:.6px;color:#111}
  .doc-header .ref{font-size:11px;font-weight:700;color:#1e3a5f;margin-top:2px}
  .doc-header .meta{font-size:9.5px;color:#888;margin-top:2px}
  table{width:100%;border-collapse:collapse;font-size:11px}
  thead tr{background:#e8edf4}
  th{padding:6px 8px;font-weight:600;font-size:9.5px;text-transform:uppercase;letter-spacing:.3px;border-bottom:1px solid #bcc8d8;text-align:left}
  td{padding:5px 8px;border-bottom:1px solid #e5e9ef;vertical-align:middle}
  tr.even td{background:#f7f9fc}
  tfoot td{background:#f0f3f8!important;border-top:1px solid #bcc8d8;font-weight:600}
  .center{text-align:center}.right{text-align:right}.num{text-align:right;font-variant-numeric:tabular-nums}
  .kv{width:100%;border-collapse:collapse;margin:2px 0 8px}
  .kv td{padding:4px 8px;border-bottom:1px solid #eef1f5;font-size:11.5px}
  .kv td.k{color:#666;width:38%;font-weight:600}
  .box{border:1px solid #dbe1ea;border-radius:6px;padding:10px 12px;margin-bottom:10px}
  .box h3{font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:#1e3a5f;margin-bottom:6px}
  .amount-hero{font-size:20px;font-weight:800;color:#111}
  .avoid-break{page-break-inside:avoid}
  .sign-area{display:flex;gap:40px;margin-top:26px}
  .sign-box{flex:1;text-align:center}
  .sign-line{border-bottom:1px solid #999;margin:38px 8px 4px}
  .sign-label{font-size:10px;color:#555;font-weight:600}
  .doc-footer{margin-top:18px;padding-top:8px;border-top:1px solid #e5e9ef;display:flex;justify-content:space-between;font-size:9.5px;color:#999}
  .badge{display:inline-block;font-size:9.5px;font-weight:700;padding:2px 8px;border-radius:999px;border:1px solid currentColor}
  .stamp{display:inline-block;border:2px solid #b45309;color:#b45309;font-weight:800;font-size:11px;letter-spacing:1px;padding:3px 10px;border-radius:6px;transform:rotate(-4deg)}
`;

// Ouvre une fenêtre d'impression avec l'en-tête établissement + le corps fourni.
// `t` = fonction i18n (fr,en,es). Renvoie false si le popup est bloqué.
export function openPrintDocument({ school, t, title, ref, subtitle, bodyHtml, orientation = 'portrait', footNote = '' }) {
  const tr = t || ((fr) => fr);
  const today = new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
  const logo = school?.logo_url ? `<img class="logo" src="${esc(school.logo_url)}" alt=""/>` : '';
  const contactParts = [school?.address, school?.phone, school?.email].filter(Boolean).map(esc);
  const subLine = subtitle ? esc(subtitle) : [school?.motto, school?.establishment_no ? `N° ${school.establishment_no}` : '']
    .filter(Boolean).map(esc).join(' — ');

  const html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"/>
<title>${esc(title)} — ${esc(school?.name || 'Établissement')}</title>
<style>${SHARED_CSS}
  @media print{@page{margin:12mm;size:A4 ${orientation}}body{padding:0}.page{padding:0}}
</style></head>
<body><div class="page">
  <div class="doc-header">
    ${logo}
    <div class="identity">
      <div class="school">${esc(school?.name || 'Établissement scolaire')}</div>
      ${subLine ? `<div class="contact">${subLine}</div>` : ''}
      ${contactParts.length ? `<div class="contact">${contactParts.join(' · ')}</div>` : ''}
    </div>
    <div class="right">
      <div class="doc-title">${esc(title)}</div>
      ${ref ? `<div class="ref">${esc(ref)}</div>` : ''}
      <div class="meta">${esc(tr('Année', 'Year', 'Año'))} : ${esc(school?.current_year || '—')}<br/>${esc(tr('Imprimé le', 'Printed on', 'Impreso el'))} ${today}</div>
    </div>
  </div>
  <main>${bodyHtml}</main>
  <div class="doc-footer">
    <span>${esc(footNote)}</span>
    <span>${esc(title)}${ref ? ' · ' + esc(ref) : ''} · ${esc(tr('Imprimé le', 'Printed on', 'Impreso el'))} ${today}</span>
  </div>
</div></body></html>`;

  return openPrintWindow(html);
}

// Document d'impression SANS l'en-tête/pied partagés : l'appelant fournit tout
// (CSS + corps). Réservé aux pièces dont la mise en page est imposée de
// l'extérieur et ne peut pas s'accommoder du bandeau maison — aujourd'hui le
// seul cas est le BULLETIN DE PAIE, calqué sur le modèle légal camerounais
// (en-tête employeur NIU/CNPS, tableau CODE/DÉSIGNATION/BASE/TAUX/GAINS/
// RETENUES). Toute la mécanique popup/print reste ici, en un seul endroit.
export function openRawPrintDocument({ title, css = '', bodyHtml, orientation = 'portrait', lang = 'fr' }) {
  const html = `<!DOCTYPE html>
<html lang="${esc(lang)}"><head><meta charset="utf-8"/>
<title>${esc(title)}</title>
<style>${css}
  @media print{@page{margin:8mm;size:A4 ${orientation}}body{padding:0}.page{padding:0}}
</style></head>
<body><div class="page">${bodyHtml}</div></body></html>`;
  return openPrintWindow(html);
}

// Ouverture + impression d'un document HTML complet. Renvoie false si le popup
// est bloqué (l'appelant affiche alors le message « autorisez les pop-ups »).
function openPrintWindow(html) {
  const win = window.open('', '_blank', 'width=980,height=740');
  if (!win) return false; // popup bloqué
  win.document.open();
  win.document.write(html);
  win.document.close();
  setTimeout(() => { win.focus(); win.print(); }, 400);
  return true;
}
