// ════════════════════════════════════════════════════════════════════════════
// REÇU DE PAIEMENT — modèle UNIQUE, réutilisable pour toute l'application
// ════════════════════════════════════════════════════════════════════════════
// Format : A5 paysage, haute qualité, optimisé impression / export PDF.
// Style  : épuré, moderne, professionnel (inspiration bancaire / logiciels de
//          gestion scolaire haut de gamme). Couleurs de l'établissement.
//
// Toute édition de reçu DOIT passer par printReceipt() afin de garantir une
// présentation parfaitement uniforme partout dans l'app.
// ════════════════════════════════════════════════════════════════════════════
import { resolveCountryCode } from '../countries';
import { getSchoolTheme } from './schoolTheme';
import { formatMoney, currencyCode } from './currency';

// N° de reçu lisible et stable : AAAAMMJJ-MATRICULE(6) + suffixe horaire pour
// distinguer deux versements le même jour.
export function receiptNumber(studentMatricule, date) {
  const d = (date || new Date().toISOString().slice(0, 10)).replace(/-/g, '');
  const code = (studentMatricule || 'STU').toUpperCase().replace(/\s/g, '').slice(0, 6);
  const hm = new Date().toTimeString().slice(0, 5).replace(':', '');
  return `${d}-${code}-${hm}`;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/**
 * Imprime / exporte un reçu de paiement (A5 paysage).
 *
 * @param {object}  opts
 * @param {object}  opts.school        établissement (logo_url, name, address, phone, email, stamp_url, signature_url, current_year…)
 * @param {object}  opts.student       élève (name, matricule, tuteur/nom_pere/nom_mere…)
 * @param {string}  opts.className     libellé de la classe
 * @param {number}  opts.versement     montant encaissé ce jour
 * @param {number}  opts.newTotal      total déjà versé (cumulé, ce versement inclus)
 * @param {number}  opts.fraisAnnuels  total dû (frais)
 * @param {string}  opts.date          date du versement (ISO)
 * @param {string}  opts.mode          comptant | echelonne | libre
 * @param {string}  opts.cashierName   nom du caissier (utilisateur connecté)
 * @param {string} [opts.designation]  libellé du frais payé (ex. « Cantine ») ; défaut « Frais de scolarité »
 * @param {string}  opts.lang          langue de l'école (anglophone…)
 * @param {string} [opts.currency]     devise (défaut FCFA)
 */
// Construit le HTML complet du reçu (fonction PURE — testable, sans DOM).
export function buildReceiptHtml({
  school, student, className, versement, newTotal, fraisAnnuels,
  date, mode, cashierName, lang, currency, designation,
}) {
  const isGE   = resolveCountryCode(school) === 'guinea_eq';
  const isEn   = !isGE && lang === 'anglophone';
  const t      = (fr, en, es) => (isGE ? (es ?? fr) : isEn ? en : fr);
  const locale = isGE ? 'es-ES' : isEn ? 'en-GB' : 'fr-FR';
  const cur    = currency || currencyCode(school);
  const money  = (n) => formatMoney(n, cur);

  const total  = Number(fraisAnnuels || 0);
  const paid    = Number(newTotal || 0);
  const reste  = Math.max(0, total - paid);
  const num    = receiptNumber(student.matricule, date);

  const dateObj = date ? new Date(date) : new Date();
  const now     = new Date();
  const dateStr = dateObj.toLocaleDateString(locale, { day: '2-digit', month: 'long', year: 'numeric' });
  const timeStr = now.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });

  const modeLabel = mode === 'comptant'
    ? t('Comptant', 'Lump sum', 'Al contado')
    : mode === 'echelonne'
      ? t('Échelonné', 'Installments', 'A plazos')
      : t('Libre', 'Free', 'Libre');

  const guardian = student.tuteur || student.nom_pere || student.nom_mere || '';

  // Couleurs de l'établissement (thème déterministe par école).
  const { palette } = getSchoolTheme(school);
  const primary = palette.primary;
  const accent  = palette.accent;
  const soft    = palette.soft;

  const logoHtml = school?.logo_url
    ? `<img src="${esc(school.logo_url)}" alt="logo" class="logo">`
    : `<div class="logo logo-ph" style="background:${soft};color:${primary};">${esc((school?.name || 'E').charAt(0).toUpperCase())}</div>`;

  const signHtml = school?.signature_url
    ? `<img src="${esc(school.signature_url)}" alt="signature" class="sign-img">`
    : school?.stamp_url
      ? `<img src="${esc(school.stamp_url)}" alt="cachet" class="sign-img">`
      : '';

  const contactBits = [
    school?.address ? esc(school.address) : '',
    school?.phone   ? `☎ ${esc(school.phone)}` : '',
    school?.email   ? `✉ ${esc(school.email)}` : '',
  ].filter(Boolean);

  const metaRow = (label, value) =>
    `<tr><td class="m-l">${label}</td><td class="m-v">${value}</td></tr>`;

  const infoRow = (label, value) =>
    `<div class="info-row"><span class="i-l">${label}</span><span class="i-v">${value || '—'}</span></div>`;

  return `<!DOCTYPE html><html lang="${isEn ? 'en' : isGE ? 'es' : 'fr'}"><head>
<meta charset="UTF-8">
<title>${t('Reçu', 'Receipt', 'Recibo')} ${esc(num)} — ${esc(student.name)}</title>
<style>
  @page { size: A5 landscape; margin: 8mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  :root { --primary:${primary}; --accent:${accent}; --soft:${soft}; }
  html, body {
    font-family: 'Segoe UI', 'Helvetica Neue', Roboto, Arial, sans-serif;
    color: #1f2937; background: #fff; font-size: 11px; -webkit-font-smoothing: antialiased;
  }
  .sheet { width: 194mm; min-height: 132mm; margin: 0 auto; display: flex; flex-direction: column; }

  /* Filet d'accentuation supérieur */
  .topbar { height: 5px; background: linear-gradient(90deg, var(--primary), var(--accent)); border-radius: 3px 3px 0 0; }

  .card { border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 6px 6px; flex: 1; display: flex; flex-direction: column; padding: 12px 16px 10px; }

  /* En-tête */
  header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
  .brand { display: flex; gap: 11px; align-items: center; }
  .logo { width: 46px; height: 46px; object-fit: contain; border-radius: 8px; }
  .logo-ph { display: flex; align-items: center; justify-content: center; font-size: 22px; font-weight: 800; }
  .school-name { font-size: 16px; font-weight: 800; color: var(--primary); line-height: 1.15; letter-spacing: .2px; }
  .school-sub { font-size: 8.5px; color: #6b7280; margin-top: 3px; line-height: 1.5; }

  .meta { text-align: right; min-width: 168px; }
  .meta-title { font-size: 10px; font-weight: 800; letter-spacing: 2px; color: var(--primary); text-transform: uppercase; margin-bottom: 5px; }
  .meta table { width: 100%; border-collapse: collapse; }
  .meta td { padding: 1.5px 0; font-size: 9px; }
  .m-l { color: #9ca3af; text-align: left; text-transform: uppercase; letter-spacing: .4px; font-size: 8px; }
  .m-v { color: #111827; font-weight: 700; text-align: right; padding-left: 12px; }

  .divider { height: 1px; background: #eceff3; margin: 11px 0; }

  /* Corps : élève (gauche) + paiement (droite) */
  .body { display: flex; gap: 18px; flex: 1; }
  .col-student { width: 41%; }
  .col-pay { flex: 1; }

  .sec-title { font-size: 8px; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase; color: #9ca3af; margin-bottom: 7px; }
  .info-row { display: flex; justify-content: space-between; gap: 10px; padding: 4.5px 0; border-bottom: 1px dotted #edf0f3; }
  .info-row:last-child { border-bottom: none; }
  .i-l { color: #6b7280; font-size: 9.5px; }
  .i-v { color: #111827; font-weight: 600; font-size: 10px; text-align: right; }

  /* Tableau détail */
  table.detail { width: 100%; border-collapse: collapse; margin-bottom: 9px; }
  table.detail th { background: var(--soft); color: var(--primary); font-size: 8.5px; text-transform: uppercase; letter-spacing: .6px; text-align: left; padding: 6px 9px; }
  table.detail th.r { text-align: right; }
  table.detail td { padding: 8px 9px; border-bottom: 1px solid #f0f2f5; font-size: 11px; }
  table.detail td.amt { text-align: right; font-weight: 700; font-variant-numeric: tabular-nums; }

  /* Synthèse montants */
  .totals { border: 1px solid #eef1f4; border-radius: 6px; overflow: hidden; }
  .t-row { display: flex; justify-content: space-between; padding: 6px 11px; font-size: 10px; }
  .t-row + .t-row { border-top: 1px solid #f2f4f7; }
  .t-row .t-l { color: #6b7280; }
  .t-row .t-v { font-weight: 700; font-variant-numeric: tabular-nums; }
  .t-due  { background: ${reste > 0 ? '#fef2f2' : '#f0fdf4'}; }
  .t-due .t-l { color: ${reste > 0 ? '#b91c1c' : '#15803d'}; font-weight: 700; }
  .t-due .t-v { color: ${reste > 0 ? '#dc2626' : '#16a34a'}; font-size: 12px; }
  .mode-pill { display: inline-block; background: var(--soft); color: var(--primary); font-weight: 700; font-size: 9px; padding: 1px 8px; border-radius: 20px; }

  /* Pied */
  footer { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 12px; padding-top: 9px; border-top: 1px solid #eceff3; }
  .cashier { font-size: 9px; color: #6b7280; }
  .cashier .c-name { color: #111827; font-weight: 600; font-size: 10px; }
  .sign { margin-top: 2px; height: 34px; display: flex; align-items: flex-end; }
  .sign-img { max-height: 38px; max-width: 130px; opacity: .9; }
  .sign-line { width: 120px; border-top: 1px solid #cbd5e1; }
  .thanks { text-align: right; }
  .thanks .ty { font-size: 11px; font-weight: 700; color: var(--primary); }
  .thanks .sub { font-size: 8px; color: #9ca3af; margin-top: 2px; }

  @media print { html, body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
</style>
</head><body>
<div class="sheet">
  <div class="topbar"></div>
  <div class="card">

    <header>
      <div class="brand">
        ${logoHtml}
        <div>
          <div class="school-name">${esc(school?.name || '—')}</div>
          <div class="school-sub">${contactBits.join(' &nbsp;·&nbsp; ') || ''}</div>
        </div>
      </div>
      <div class="meta">
        <div class="meta-title">${t('Reçu de paiement', 'Payment Receipt', 'Recibo de pago')}</div>
        <table>
          ${metaRow(t('Reçu N°', 'Receipt No.', 'Recibo Nº'), `<span style="font-family:monospace">${esc(num)}</span>`)}
          ${metaRow(t('Date', 'Date', 'Fecha'), esc(dateStr))}
          ${metaRow(t('Heure', 'Time', 'Hora'), esc(timeStr))}
          ${metaRow(t('Année', 'Year', 'Año'), esc(school?.current_year || '—'))}
        </table>
      </div>
    </header>

    <div class="divider"></div>

    <div class="body">
      <div class="col-student">
        <div class="sec-title">${t('Élève', 'Student', 'Alumno')}</div>
        ${infoRow(t('Nom complet', 'Full name', 'Nombre completo'), esc(student.name))}
        ${infoRow(t('Matricule', 'Student ID', 'Matrícula'), student.matricule ? `<span style="font-family:monospace">${esc(student.matricule)}</span>` : '—')}
        ${infoRow(t('Classe', 'Class', 'Clase'), esc(className))}
        ${guardian ? infoRow(t('Responsable légal', 'Legal guardian', 'Responsable legal'), esc(guardian)) : ''}
      </div>

      <div class="col-pay">
        <div class="sec-title">${t('Détail du paiement', 'Payment details', 'Detalle del pago')}</div>
        <table class="detail">
          <thead>
            <tr>
              <th>${t('Désignation', 'Description', 'Concepto')}</th>
              <th class="r">${t('Montant', 'Amount', 'Importe')}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>${designation ? esc(designation) : t('Frais de scolarité', 'Tuition fees', 'Cuota escolar')}</td>
              <td class="amt">${money(versement)}</td>
            </tr>
          </tbody>
        </table>
        <div class="totals">
          <div class="t-row"><span class="t-l">${t('Total des frais', 'Total fees', 'Total')}</span><span class="t-v">${money(total)}</span></div>
          <div class="t-row"><span class="t-l">${t('Déjà versé', 'Total paid', 'Pagado')}</span><span class="t-v" style="color:#16a34a">${money(paid)}</span></div>
          ${reste > 0 || total > 0 ? `<div class="t-row t-due"><span class="t-l">${reste > 0 ? t('Reste à payer', 'Balance due', 'Saldo pendiente') : t('Soldé', 'Fully paid', 'Saldado')}</span><span class="t-v">${money(reste)}</span></div>` : ''}
          <div class="t-row"><span class="t-l">${t('Mode de paiement', 'Payment method', 'Forma de pago')}</span><span class="t-v"><span class="mode-pill">${modeLabel}</span></span></div>
        </div>
      </div>
    </div>

    <footer>
      <div class="cashier">
        <div>${t('Le caissier', 'Cashier', 'El cajero')}</div>
        <div class="c-name">${esc(cashierName || '—')}</div>
        <div class="sign">${signHtml || '<div class="sign-line"></div>'}</div>
      </div>
      <div class="thanks">
        <div class="ty">${t('Merci pour votre confiance.', 'Thank you for your trust.', 'Gracias por su confianza.')}</div>
        <div class="sub">${t('Ce reçu fait foi de paiement. Conservez-le.', 'This receipt is proof of payment. Please keep it.', 'Este recibo justifica el pago. Consérvelo.')}</div>
      </div>
    </footer>

  </div>
</div>
<script>window.onload = function(){ setTimeout(function(){ window.focus(); window.print(); }, 350); };</script>
</body></html>`;
}

// Ouvre le reçu dans une fenêtre dédiée et lance l'impression (A5 paysage).
// C'est le SEUL point d'entrée à utiliser dans l'app pour imprimer un reçu.
export function printReceipt(opts) {
  const html = buildReceiptHtml(opts);
  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(html);
  win.document.close();
}
