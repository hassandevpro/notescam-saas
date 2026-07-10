// Documents imprimables du module IMMOBILISATIONS (Phase C).
//   C.7 — Fiche d'actif (identité + valeur + TCO + journaux).
//   C.8 — Registre du patrimoine (inventaire complet, une ligne par actif).
// Socle lib/printDoc (window.print, offline).
import { openPrintDocument, docRef, esc } from './printDoc.js';

// Table générique d'un journal (pannes / réparations / dépenses).
function journalTable(title, rows, money, t) {
  const tr = t || ((fr) => fr);
  const body = (rows || []).map((r, i) => `
    <tr class="${i % 2 === 0 ? 'even' : ''}">
      <td class="center" style="width:80px">${esc(r.date || '—')}</td>
      <td>${esc(r.description || '—')}</td>
      <td class="num" style="width:100px">${(r.cost ?? r.amount) != null ? esc(money(r.cost ?? r.amount)) : '—'}</td>
      <td style="width:90px">${esc(r.status || '—')}</td>
    </tr>`).join('');
  return `
    <div class="avoid-break" style="margin-top:10px">
      <h3 style="font-size:10.5px;text-transform:uppercase;letter-spacing:.5px;color:#1e3a5f;margin:0 0 5px">${esc(title)}</h3>
      ${rows && rows.length ? `<table><thead><tr>
        <th class="center">${esc(tr('Date', 'Date', 'Fecha'))}</th>
        <th>${esc(tr('Description', 'Description', 'Descripción'))}</th>
        <th class="right">${esc(tr('Montant', 'Amount', 'Importe'))}</th>
        <th>${esc(tr('Statut', 'Status', 'Estado'))}</th>
      </tr></thead><tbody>${body}</tbody></table>`
        : `<p style="font-size:10.5px;color:#999">${esc(tr('Aucun enregistrement.', 'No record.', 'Sin registros.'))}</p>`}
    </div>`;
}

// ── C.7 — Fiche d'actif ──────────────────────────────────────────────────────
export function printAssetSheet({ school, t, money, asset, summary, journals = {}, categoryLabel, statusLabel }) {
  const tr = t || ((fr) => fr);
  const catL = categoryLabel || ((c) => c || '—');
  const statL = statusLabel || ((s) => s || '—');
  const ref = docRef('IMMO', String(school?.current_year || '').slice(0, 4), asset?.id);
  const row = (k, v) => v ? `<tr><td class="k">${esc(k)}</td><td>${esc(v)}</td></tr>` : '';

  const bodyHtml = `
    <table class="kv avoid-break">
      ${row(tr('Désignation', 'Name', 'Denominación'), asset?.name)}
      ${row(tr('Catégorie', 'Category', 'Categoría'), catL(asset?.category))}
      ${row(tr("N° d'inventaire", 'Asset number', 'N.º de inventario'), asset?.asset_number)}
      ${row(tr('N° de série', 'Serial number', 'N.º de serie'), asset?.serial_number)}
      ${row(tr('Emplacement', 'Location', 'Ubicación'), asset?.location)}
      ${row(tr("Date d'acquisition", 'Acquisition date', 'Fecha de adquisición'), asset?.acquisition_date)}
      ${row(tr('État', 'Status', 'Estado'), statL(asset?.status))}
    </table>

    <div class="box avoid-break">
      <h3>${esc(tr('Synthèse patrimoniale', 'Asset summary', 'Resumen patrimonial'))}</h3>
      <table class="kv">
        <tr><td class="k">${esc(tr('Valeur', 'Value', 'Valor'))}</td><td class="num">${esc(money(summary?.value))}</td></tr>
        <tr><td class="k">${esc(tr('Pannes ouvertes', 'Open faults', 'Averías abiertas'))}</td><td class="num">${esc(summary?.open ?? 0)}</td></tr>
        <tr><td class="k">${esc(tr("Coût d'entretien", 'Maintenance cost', 'Coste de mantenimiento'))}</td><td class="num">${esc(money(summary?.maintenanceCost))}</td></tr>
        <tr><td class="k">${esc(tr('Coût total (TCO)', 'Total cost (TCO)', 'Coste total (TCO)'))}</td><td class="num">${esc(money(summary?.tco))}</td></tr>
      </table>
    </div>

    ${journalTable(tr('Pannes', 'Breakdowns', 'Averías'), journals.breakdowns, money, tr)}
    ${journalTable(tr('Réparations', 'Repairs', 'Reparaciones'), journals.repairs, money, tr)}
    ${journalTable(tr('Dépenses', 'Expenses', 'Gastos'), journals.expenses, money, tr)}

    ${asset?.notes ? `<div class="box avoid-break" style="margin-top:10px"><h3>${esc(tr('Notes', 'Notes', 'Notas'))}</h3><p>${esc(asset.notes)}</p></div>` : ''}`;

  return openPrintDocument({
    school, t: tr,
    title: tr("Fiche d'immobilisation", 'Asset sheet', 'Ficha de activo'),
    ref, subtitle: asset?.name, bodyHtml,
  });
}

// ── C.8 — Registre du patrimoine ─────────────────────────────────────────────
export function printAssetRegister({ school, t, money, assets = [], categoryLabel, statusLabel }) {
  const tr = t || ((fr) => fr);
  const catL = categoryLabel || ((c) => c || '—');
  const statL = statusLabel || ((s) => s || '—');
  const sorted = [...assets].sort((a, b) =>
    String(a.category || '').localeCompare(String(b.category || '')) || String(a.name || '').localeCompare(String(b.name || '')));
  const total = sorted.reduce((s, a) => s + (Number(a.value) || 0), 0);

  const body = sorted.map((a, i) => `
    <tr class="${i % 2 === 0 ? 'even' : ''}">
      <td>${esc(catL(a.category))}</td>
      <td class="center">${esc(a.asset_number || '—')}</td>
      <td><strong>${esc(a.name)}</strong></td>
      <td>${esc(a.location || '—')}</td>
      <td>${esc(statL(a.status))}</td>
      <td class="num">${a.value != null ? esc(money(a.value)) : '—'}</td>
    </tr>`).join('');

  const bodyHtml = `
    <table>
      <thead><tr>
        <th style="width:120px">${esc(tr('Catégorie', 'Category', 'Categoría'))}</th>
        <th class="center" style="width:80px">${esc(tr('N°', 'No.', 'N.º'))}</th>
        <th>${esc(tr('Désignation', 'Name', 'Denominación'))}</th>
        <th style="width:120px">${esc(tr('Emplacement', 'Location', 'Ubicación'))}</th>
        <th style="width:90px">${esc(tr('État', 'Status', 'Estado'))}</th>
        <th class="right" style="width:110px">${esc(tr('Valeur', 'Value', 'Valor'))}</th>
      </tr></thead>
      <tbody>${body || `<tr><td colspan="6" class="center" style="padding:14px;color:#888">${esc(tr('Aucune immobilisation.', 'No asset.', 'Sin activos.'))}</td></tr>`}</tbody>
      <tfoot><tr>
        <td colspan="5" class="right">${esc(tr('Valeur totale du patrimoine', 'Total asset value', 'Valor total'))} (${sorted.length})</td>
        <td class="num">${esc(money(total))}</td>
      </tr></tfoot>
    </table>
    <div class="sign-area avoid-break">
      <div class="sign-box"><div class="sign-line"></div><div class="sign-label">${esc(tr("Le Chef d'établissement", 'The Head', 'El Director'))}</div></div>
      <div class="sign-box"><div class="sign-line"></div><div class="sign-label">${esc(tr('Le Comptable-matières', 'The Storekeeper', 'El Responsable de bienes'))}</div></div>
    </div>`;

  return openPrintDocument({
    school, t: tr,
    title: tr('Registre du patrimoine', 'Asset register', 'Registro de patrimonio'),
    ref: docRef('REG', String(school?.current_year || '').slice(0, 4), school?.id),
    bodyHtml,
  });
}
