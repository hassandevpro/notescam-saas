// Documents imprimables du module DÉPENSES (Phase C).
//   C.1 — Bon de dépense individuel (support de validation + sortie de caisse).
//   C.2 — Bordereau de dépenses (liste filtrée + total).
// S'appuie sur le socle lib/printDoc (window.print, offline). Aucune donnée réseau.
import { openPrintDocument, docRef, esc } from './printDoc.js';
import { EXPENSE_STATUS_UI } from '../components/expenses/expenseUi.js';

const yearOf = (dateStr, school) =>
  String(dateStr || '').slice(0, 4) || String(school?.current_year || '').slice(0, 4) || String(new Date().getFullYear());

const statusLabel = (t, status) => {
  const ui = EXPENSE_STATUS_UI[status] || EXPENSE_STATUS_UI.draft;
  return t(...ui.label);
};

// ── C.1 — Bon de dépense ─────────────────────────────────────────────────────
// `chapterPath` = 'Catégorie › Chapitre › Sous-chapitre' (résolu par l'appelant).
// `validatorLabel` = rôle validateur requis (résolu via resolveValidatorRole).
export function printExpenseVoucher(expense, { school, t, money, chapterPath, sectorLabel, validatorLabel }) {
  const tr = t || ((fr) => fr);
  const ref = docRef('BD', yearOf(expense?.expense_date, school), expense?.id);
  const row = (k, v) => v ? `<tr><td class="k">${esc(k)}</td><td>${esc(v)}</td></tr>` : '';

  const objet = [expense?.category, expense?.subcategory].filter(Boolean).join(' — ');
  const bodyHtml = `
    <div class="box avoid-break" style="display:flex;justify-content:space-between;align-items:center;gap:16px">
      <div>
        <h3>${esc(tr('Montant', 'Amount', 'Importe'))}</h3>
        <div class="amount-hero">${esc(money(expense?.amount))}</div>
      </div>
      <span class="badge">${esc(statusLabel(tr, expense?.status))}</span>
    </div>

    <table class="kv avoid-break">
      ${row(tr('Objet', 'Object', 'Objeto'), objet)}
      ${row(tr('Imputation budgétaire', 'Budget line', 'Imputación'), chapterPath)}
      ${row(tr('Secteur', 'Sector', 'Sector'), sectorLabel)}
      ${row(tr('Fournisseur', 'Supplier', 'Proveedor'), expense?.supplier)}
      ${row(tr('Demandeur', 'Requester', 'Solicitante'), expense?.requester || expense?.created_by)}
      ${row(tr('Date', 'Date', 'Fecha'), expense?.expense_date)}
      ${row(tr('Pièce justificative', 'Receipt', 'Justificante'), expense?.receipt)}
      ${row(tr('Validateur requis', 'Required approver', 'Validador requerido'), validatorLabel)}
    </table>

    ${expense?.notes ? `<div class="box avoid-break"><h3>${esc(tr('Motif / Observations', 'Reason / Notes', 'Motivo / Notas'))}</h3><p>${esc(expense.notes)}</p></div>` : ''}

    <div class="sign-area avoid-break">
      <div class="sign-box"><div class="sign-line"></div><div class="sign-label">${esc(tr('Le Demandeur', 'Requester', 'El Solicitante'))}</div></div>
      <div class="sign-box"><div class="sign-line"></div><div class="sign-label">${esc(tr('Le Validateur', 'Approver', 'El Validador'))}${validatorLabel ? ' (' + esc(validatorLabel) + ')' : ''}</div></div>
      <div class="sign-box"><div class="sign-line"></div><div class="sign-label">${esc(tr('Le Caissier', 'Cashier', 'El Cajero'))}</div></div>
    </div>`;

  return openPrintDocument({
    school, t: tr,
    title: tr('Bon de dépense', 'Expense voucher', 'Comprobante de gasto'),
    ref,
    footNote: tr('Document interne — à signer avant sortie de caisse.', 'Internal document — sign before disbursement.', 'Documento interno — firmar antes del desembolso.'),
    bodyHtml,
  });
}

// ── C.2 — Bordereau de dépenses (liste filtrée) ──────────────────────────────
// `rows` = dépenses déjà filtrées (Phase B.3). `chapterLabel(id)` résout le libellé.
// `filterSummary` = texte décrivant les filtres actifs (facultatif).
export function printExpenseList(rows, { school, t, money, budget, chapterLabel, filterSummary }) {
  const tr = t || ((fr) => fr);
  const label = chapterLabel || ((id) => id || '—');
  const total = rows.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const ref = docRef('BORD', String(school?.current_year || '').slice(0, 4), budget?.id);

  const body = rows.map((e, i) => `
      <tr class="${i % 2 === 0 ? 'even' : ''}">
        <td class="center">${esc(e.expense_date || '—')}</td>
        <td>${esc(label(e.budget_chapter_id))}</td>
        <td>${esc([e.category, e.subcategory].filter(Boolean).join(' — ') || '—')}</td>
        <td>${esc(e.supplier || '—')}</td>
        <td class="num">${esc(money(e.amount))}</td>
        <td>${esc(statusLabel(tr, e.status))}</td>
      </tr>`).join('');

  const subtitleParts = [
    budget?.label ? `${tr('Budget', 'Budget', 'Presupuesto')} : ${budget.label}` : '',
    filterSummary || '',
  ].filter(Boolean).join('  ·  ');

  const bodyHtml = `
    <table>
      <thead><tr>
        <th class="center" style="width:80px">${esc(tr('Date', 'Date', 'Fecha'))}</th>
        <th>${esc(tr('Imputation', 'Budget line', 'Imputación'))}</th>
        <th>${esc(tr('Objet', 'Object', 'Objeto'))}</th>
        <th style="width:130px">${esc(tr('Fournisseur', 'Supplier', 'Proveedor'))}</th>
        <th class="right" style="width:110px">${esc(tr('Montant', 'Amount', 'Importe'))}</th>
        <th style="width:90px">${esc(tr('Statut', 'Status', 'Estado'))}</th>
      </tr></thead>
      <tbody>${body || `<tr><td colspan="6" class="center" style="padding:14px;color:#888">${esc(tr('Aucune dépense.', 'No expense.', 'Ningún gasto.'))}</td></tr>`}</tbody>
      <tfoot><tr>
        <td colspan="4" class="right">${esc(tr('Total', 'Total', 'Total'))} (${rows.length})</td>
        <td class="num">${esc(money(total))}</td><td></td>
      </tr></tfoot>
    </table>`;

  return openPrintDocument({
    school, t: tr,
    title: tr('Bordereau de dépenses', 'Expense schedule', 'Relación de gastos'),
    ref,
    subtitle: subtitleParts,
    bodyHtml,
    orientation: 'portrait',
  });
}
