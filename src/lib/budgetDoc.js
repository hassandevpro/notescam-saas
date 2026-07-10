// Documents imprimables du module BUDGETS (Phase C).
//   C.3 — Rapport d'exécution budgétaire (période) : Prévu / Engagé / Payé / Reste
//         par Catégorie › Chapitre › Sous-chapitre (reprend la distinction A.2).
//   C.4 — Rapport de clôture d'exercice (budget clôturé uniquement).
// Socle lib/printDoc (window.print, offline).
import { openPrintDocument, docRef, esc } from './printDoc.js';

const pct = (engage, planned) => (planned > 0 ? Math.round((engage / planned) * 100) : 0);

// Lignes récursives de l'exécution (indentation par profondeur).
function execRows(nodes, money, depth = 0) {
  return (nodes || []).map((n) => {
    const weight = depth === 0 ? 'font-weight:800' : depth === 1 ? 'font-weight:600' : 'font-weight:400;color:#444';
    const over = n.engage > n.planned;
    return `
      <tr class="avoid-break">
        <td style="${weight};padding-left:${8 + depth * 16}px">${esc(n.label)}</td>
        <td class="num">${esc(money(n.planned))}</td>
        <td class="num">${esc(money(n.engage))}</td>
        <td class="num">${esc(money(n.paid))}</td>
        <td class="num" style="${n.reste < 0 ? 'color:#b91c1c' : ''}">${esc(money(n.reste))}</td>
        <td class="num" style="${over ? 'color:#b91c1c;font-weight:700' : ''}">${pct(n.engage, n.planned)}%</td>
      </tr>
      ${execRows(n.children, money, depth + 1)}`;
  }).join('');
}

// Aplatit l'arbre en gardant les nœuds en dépassement (engagé > prévu).
function flattenOverruns(nodes, out = []) {
  for (const n of (nodes || [])) {
    if (n.planned > 0 && n.engage > n.planned) out.push(n);
    flattenOverruns(n.children, out);
  }
  return out;
}

// ── C.3 — Rapport d'exécution ────────────────────────────────────────────────
export function printBudgetExecution({ school, t, money, budget, sectorLabel, periodLabel, periodDates, rollup, totals }) {
  const tr = t || ((fr) => fr);
  const depense = (rollup || []).filter((n) => n.kind === 'depense');
  const ref = docRef('EXE', String(school?.current_year || '').slice(0, 4), budget?.id);

  const bodyHtml = `
    <table class="kv avoid-break">
      <tr><td class="k">${esc(tr('Budget', 'Budget', 'Presupuesto'))}</td><td>${esc(budget?.label || '—')}</td></tr>
      ${periodLabel ? `<tr><td class="k">${esc(tr('Période', 'Period', 'Período'))}</td><td>${esc(periodLabel)}${periodDates ? ` (${esc(periodDates)})` : ''}</td></tr>` : ''}
      ${sectorLabel ? `<tr><td class="k">${esc(tr('Secteur', 'Sector', 'Sector'))}</td><td>${esc(sectorLabel)}</td></tr>` : ''}
    </table>
    <table>
      <thead><tr>
        <th>${esc(tr('Poste', 'Line', 'Partida'))}</th>
        <th class="right" style="width:95px">${esc(tr('Prévu', 'Planned', 'Previsto'))}</th>
        <th class="right" style="width:95px">${esc(tr('Engagé', 'Committed', 'Comprom.'))}</th>
        <th class="right" style="width:95px">${esc(tr('Payé', 'Paid', 'Pagado'))}</th>
        <th class="right" style="width:95px">${esc(tr('Reste', 'Remaining', 'Restante'))}</th>
        <th class="right" style="width:60px">${esc(tr('Exéc.', 'Exec.', 'Ejec.'))}</th>
      </tr></thead>
      <tbody>${execRows(depense, money) || `<tr><td colspan="6" class="center" style="padding:14px;color:#888">${esc(tr('Aucun chapitre de dépense.', 'No expense chapter.', 'Sin capítulos.'))}</td></tr>`}</tbody>
      <tfoot><tr>
        <td>${esc(tr('Total dépenses', 'Total expenses', 'Total gastos'))}</td>
        <td class="num">${esc(money(totals?.depensesPrevues))}</td>
        <td class="num">${esc(money(totals?.engage))}</td>
        <td class="num">${esc(money(totals?.paid))}</td>
        <td class="num" style="${(totals?.reste ?? 0) < 0 ? 'color:#b91c1c' : ''}">${esc(money(totals?.reste))}</td>
        <td class="num">${pct(totals?.engage || 0, totals?.depensesPrevues || 0)}%</td>
      </tr></tfoot>
    </table>
    <p style="font-size:9.5px;color:#888;margin-top:8px">${esc(tr(
      '« Engagé » = validé + payé ; « Payé » = décaissé réel.',
      '“Committed” = approved + paid; “Paid” = actually disbursed.',
      '«Comprometido» = validado + pagado; «Pagado» = desembolsado.'))}</p>`;

  return openPrintDocument({
    school, t: tr,
    title: tr("Rapport d'exécution budgétaire", 'Budget execution report', 'Informe de ejecución'),
    ref, subtitle: [budget?.label, periodDates].filter(Boolean).join(' · '), bodyHtml,
  });
}

// ── C.4 — Rapport de clôture d'exercice ──────────────────────────────────────
// `requests` = demandes de déblocage (décidées) pour rapprocher les dépassements.
export function printBudgetClosure({ school, t, money, budget, sectorLabel, periodLabel, periodDates, rollup, totals, requests = [], chapterLabel }) {
  const tr = t || ((fr) => fr);
  const label = chapterLabel || ((id) => id || '—');
  const depense = (rollup || []).filter((n) => n.kind === 'depense');
  const ref = docRef('CLO', String(school?.current_year || '').slice(0, 4), budget?.id);
  const solde = (totals?.recettes || 0) - (totals?.depensesPrevues || 0);
  const overruns = flattenOverruns(depense);
  const decided = requests.filter((r) => r.status && r.status !== 'pending');

  const synth = `
    <div class="box avoid-break">
      <h3>${esc(tr('Synthèse de clôture', 'Closure summary', 'Resumen de cierre'))}</h3>
      <table class="kv">
        <tr><td class="k">${esc(tr('Recettes prévues', 'Planned revenue', 'Ingresos previstos'))}</td><td class="num">${esc(money(totals?.recettes))}</td></tr>
        <tr><td class="k">${esc(tr('Dépenses prévues', 'Planned expenses', 'Gastos previstos'))}</td><td class="num">${esc(money(totals?.depensesPrevues))}</td></tr>
        <tr><td class="k">${esc(tr('Engagé (validé)', 'Committed', 'Comprometido'))}</td><td class="num">${esc(money(totals?.engage))}</td></tr>
        <tr><td class="k">${esc(tr('Payé (décaissé)', 'Paid', 'Pagado'))}</td><td class="num">${esc(money(totals?.paid))}</td></tr>
        <tr><td class="k">${esc(tr('Solde prévisionnel', 'Forecast balance', 'Saldo'))}</td><td class="num" style="${solde < 0 ? 'color:#b91c1c' : ''}">${esc(money(solde))}</td></tr>
        <tr><td class="k">${esc(tr("Taux d'exécution", 'Execution rate', 'Tasa de ejecución'))}</td><td class="num">${pct(totals?.engage || 0, totals?.depensesPrevues || 0)}%</td></tr>
      </table>
    </div>`;

  const execTable = `
    <div class="avoid-break">
      <h3 style="font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:#1e3a5f;margin:10px 0 6px">${esc(tr('Exécution par chapitre', 'Execution by chapter', 'Ejecución por capítulo'))}</h3>
      <table>
        <thead><tr>
          <th>${esc(tr('Poste', 'Line', 'Partida'))}</th>
          <th class="right" style="width:95px">${esc(tr('Prévu', 'Planned', 'Previsto'))}</th>
          <th class="right" style="width:95px">${esc(tr('Engagé', 'Committed', 'Comprom.'))}</th>
          <th class="right" style="width:95px">${esc(tr('Payé', 'Paid', 'Pagado'))}</th>
          <th class="right" style="width:60px">${esc(tr('Exéc.', 'Exec.', 'Ejec.'))}</th>
        </tr></thead>
        <tbody>${depense.map((n) => `
          <tr class="avoid-break">
            <td style="font-weight:700">${esc(n.label)}</td>
            <td class="num">${esc(money(n.planned))}</td>
            <td class="num">${esc(money(n.engage))}</td>
            <td class="num">${esc(money(n.paid))}</td>
            <td class="num" style="${n.engage > n.planned ? 'color:#b91c1c;font-weight:700' : ''}">${pct(n.engage, n.planned)}%</td>
          </tr>`).join('')}</tbody>
      </table>
    </div>`;

  const overrunBlock = `
    <div class="avoid-break" style="margin-top:12px">
      <h3 style="font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:#b91c1c;margin:0 0 6px">${esc(tr('Dépassements de l’exercice', 'Overruns during the year', 'Excesos del ejercicio'))}</h3>
      ${overruns.length === 0
        ? `<p style="font-size:11px;color:#16a34a">${esc(tr('Aucun dépassement — exécution dans les limites prévues.', 'No overrun — execution within planned limits.', 'Sin excesos.'))}</p>`
        : `<table><thead><tr>
            <th>${esc(tr('Poste', 'Line', 'Partida'))}</th>
            <th class="right" style="width:95px">${esc(tr('Prévu', 'Planned', 'Previsto'))}</th>
            <th class="right" style="width:95px">${esc(tr('Engagé', 'Committed', 'Comprom.'))}</th>
            <th class="right" style="width:95px">${esc(tr('Dépassement', 'Overrun', 'Exceso'))}</th>
          </tr></thead><tbody>${overruns.map((n) => `
            <tr class="avoid-break"><td>${esc(n.label)}</td>
              <td class="num">${esc(money(n.planned))}</td>
              <td class="num">${esc(money(n.engage))}</td>
              <td class="num" style="color:#b91c1c;font-weight:700">${esc(money(n.engage - n.planned))}</td></tr>`).join('')}</tbody></table>`}
    </div>`;

  const unlockBlock = decided.length ? `
    <div class="avoid-break" style="margin-top:12px">
      <h3 style="font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:#1e3a5f;margin:0 0 6px">${esc(tr('Déblocages / dérogations', 'Unlocks / waivers', 'Desbloqueos'))}</h3>
      <table><thead><tr>
        <th>${esc(tr('Ligne', 'Line', 'Línea'))}</th>
        <th class="right" style="width:100px">${esc(tr('Accordé', 'Granted', 'Concedido'))}</th>
        <th>${esc(tr('Décision', 'Decision', 'Decisión'))}</th>
        <th>${esc(tr('Par', 'By', 'Por'))}</th>
      </tr></thead><tbody>${decided.map((r) => `
        <tr class="avoid-break"><td>${esc(label(r.budget_chapter_id))}</td>
          <td class="num">${esc(money(r.granted_amount))}</td>
          <td>${esc(r.status)}</td><td>${esc(r.decided_by || '—')}</td></tr>`).join('')}</tbody></table>
    </div>` : '';

  const signatures = `
    <div class="sign-area avoid-break">
      <div class="sign-box"><div class="sign-line"></div><div class="sign-label">${esc(tr('Le RAF', 'The Bursar', 'El RAF'))}</div></div>
      <div class="sign-box"><div class="sign-line"></div><div class="sign-label">${esc(tr('Le Coordonnateur', 'The Coordinator', 'El Coordinador'))}</div></div>
      <div class="sign-box"><div class="sign-line"></div><div class="sign-label">${esc(tr('La Fondatrice', 'The Founder', 'La Fundadora'))}</div></div>
    </div>`;

  return openPrintDocument({
    school, t: tr,
    title: tr("Rapport de clôture d'exercice", 'Year-end closure report', 'Informe de cierre'),
    ref, subtitle: [budget?.label, periodDates || periodLabel, sectorLabel].filter(Boolean).join(' · '),
    bodyHtml: synth + execTable + overrunBlock + unlockBlock + signatures,
  });
}
