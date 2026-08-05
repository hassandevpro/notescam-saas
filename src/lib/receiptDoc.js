// ════════════════════════════════════════════════════════════════════════════
// REÇU DE PAIEMENT — modèle UNIQUE, réutilisable pour toute l'application
// ════════════════════════════════════════════════════════════════════════════
// DEUX formats, un seul contenu comptable (même n°, mêmes montants, même
// caissier) — l'école choisit selon son imprimante :
//   • printReceipt() → A5 paysage, épuré, couleurs de l'établissement (bureau) ;
//   • printTicket()  → rouleau 80 mm monospace, style ticket de caisse
//                      (imprimante thermique de guichet).
//
// Toute édition de reçu DOIT passer par l'un de ces deux points d'entrée, afin
// que la présentation reste uniforme partout dans l'app.
//
// RÈGLES NON NÉGOCIABLES (pièce comptable) :
//   1. le n° de reçu est dérivé du VERSEMENT, jamais de l'heure d'impression →
//      un reçu ressort à l'identique des années plus tard ;
//   2. le reçu porte le caissier qui a ENCAISSÉ (fee_payments.recorded_by_name),
//      jamais l'utilisateur qui réimprime ;
//   3. toute réimpression est marquée DUPLICATA — sinon un second tirage peut
//      être présenté comme la preuve d'un second paiement.
// ════════════════════════════════════════════════════════════════════════════
// Spécificateur explicite (et non '../countries') : ce module est couvert par un
// test lancé sous Node nu, qui ne résout pas les imports de répertoire.
import { resolveCountryCode } from '../countries/index.js';
import { getSchoolTheme } from './schoolTheme.js';
import { formatMoney, currencyCode } from './currency.js';

// N° de reçu : AAAAMMJJ-MATRICULE(6)-SUFFIXE.
//
// Le suffixe est dérivé de l'ID du VERSEMENT, jamais de l'heure d'impression :
// un reçu doit ressortir à l'identique des années plus tard. (L'ancienne version
// utilisait l'heure courante — deux impressions du même versement donnaient deux
// numéros différents, donc aucune pièce comptable reproductible.)
export function receiptNumberFor(payment = {}, studentMatricule) {
  const raw = String(payment.date || payment.created_at || '').slice(0, 10);
  const d = (raw || new Date().toISOString().slice(0, 10)).replace(/-/g, '');
  const code = (studentMatricule || 'STU').toUpperCase().replace(/\s/g, '').slice(0, 6);
  // 4 derniers caractères alphanumériques de l'uuid → stable, lisible, suffisant
  // pour distinguer plusieurs versements d'un même élève le même jour.
  const id = String(payment.id || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const suffix = id ? id.slice(-4) : String(payment.amount ?? '').slice(-4).padStart(4, '0');
  return `${d}-${code}-${suffix}`;
}

// Rétro-compat : ancien appel sans ligne de versement (aucun n° stable possible).
export function receiptNumber(studentMatricule, date) {
  return receiptNumberFor({ date }, studentMatricule);
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// Langue + devise du reçu — partagé par les DEUX formats (A5 et ticket 80 mm),
// pour qu'ils ne divergent jamais sur un libellé ou un arrondi.
function receiptI18n(school, lang, currency) {
  const isGE = resolveCountryCode(school) === 'guinea_eq';
  const isEn = !isGE && lang === 'anglophone';
  const cur  = currency || currencyCode(school);
  return {
    isGE, isEn, cur,
    t:      (fr, en, es) => (isGE ? (es ?? fr) : isEn ? en : fr),
    locale: isGE ? 'es-ES' : isEn ? 'en-GB' : 'fr-FR',
    money:  (n) => formatMoney(n, cur),
  };
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
 * @param {object} [opts.payment]      ligne fee_payments (id/date) → n° de reçu stable
 * @param {boolean}[opts.duplicate]    réimpression : marque la pièce « DUPLICATA »
 * @param {string} [opts.reprintBy]    qui réimprime (mentionné sur le duplicata)
 */
// Construit le HTML complet du reçu (fonction PURE — testable, sans DOM).
export function buildReceiptHtml({
  school, student, className, versement, newTotal, fraisAnnuels,
  date, mode, cashierName, lang, currency, designation,
  payment, duplicate, reprintBy,
}) {
  const { isGE, isEn, t, locale, money } = receiptI18n(school, lang, currency);

  const total  = Number(fraisAnnuels || 0);
  const paid    = Number(newTotal || 0);
  const reste  = Math.max(0, total - paid);
  const num    = receiptNumberFor(payment || { date }, student.matricule);

  const dateObj = date ? new Date(date) : new Date();
  const dateStr = dateObj.toLocaleDateString(locale, { day: '2-digit', month: 'long', year: 'numeric' });
  // Heure de l'ENCAISSEMENT (pas de l'impression) : sur un duplicata, l'heure
  // courante n'aurait aucun sens comptable.
  const stampAt = payment?.created_at ? new Date(payment.created_at) : new Date();
  const timeStr = stampAt.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });

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

  /* Duplicata : une réimpression ne doit jamais pouvoir passer pour un 2e encaissement. */
  .dup { margin: 8px 0 0; border: 1px dashed #f59e0b; background: #fffbeb; color: #92400e;
         border-radius: 5px; padding: 4px 9px; font-size: 8.5px; font-weight: 700;
         letter-spacing: 1px; text-transform: uppercase; text-align: center; }
  .dup span { font-weight: 500; letter-spacing: 0; text-transform: none; }

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

    ${duplicate ? `<div class="dup">${t('Duplicata', 'Duplicate', 'Duplicado')}
      <span>— ${t('réimpression du', 'reprinted on', 'reimpreso el')} ${esc(new Date().toLocaleDateString(locale))}${reprintBy ? ` ${t('par', 'by', 'por')} ${esc(reprintBy)}` : ''}. ${t('Ne vaut pas second paiement.', 'Not a second payment.', 'No constituye un segundo pago.')}</span>
    </div>` : ''}

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

// ════════════════════════════════════════════════════════════════════════════
// TICKET DE CAISSE — rouleau 80 mm (imprimante thermique), style supermarché
// ════════════════════════════════════════════════════════════════════════════
// Même contenu comptable que le reçu A5, mais en colonne étroite monospace :
// hauteur libre (`size: 80mm auto`), pas de cadre ni d'aplat de couleur (le
// thermique n'imprime que du noir), séparateurs en tirets. Aucune signature :
// un ticket ne se signe pas, c'est le n° de reçu qui l'identifie.
//
// Mêmes options que buildReceiptHtml(). Fonction PURE (testable, sans DOM).
export function buildTicketHtml({
  school, student, className, versement, newTotal, fraisAnnuels,
  date, mode, cashierName, lang, currency, designation,
  payment, duplicate, reprintBy,
}) {
  const { isGE, isEn, t, locale, money } = receiptI18n(school, lang, currency);

  const total = Number(fraisAnnuels || 0);
  const paid  = Number(newTotal || 0);
  const reste = Math.max(0, total - paid);
  const num   = receiptNumberFor(payment || { date }, student.matricule);

  const dateObj = date ? new Date(date) : new Date();
  const stampAt = payment?.created_at ? new Date(payment.created_at) : new Date();
  const dateStr = dateObj.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' });
  const timeStr = stampAt.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });

  const modeLabel = mode === 'comptant'
    ? t('COMPTANT', 'LUMP SUM', 'AL CONTADO')
    : mode === 'echelonne'
      ? t('ECHELONNE', 'INSTALLMENTS', 'A PLAZOS')
      : t('LIBRE', 'FREE', 'LIBRE');

  // Ligne « libellé ....... valeur » : le libellé peut passer à la ligne, la
  // valeur reste collée à droite (pas de tabulation possible en 42 colonnes).
  const row = (label, value, cls = '') =>
    `<div class="row ${cls}"><span class="l">${label}</span><span class="v">${value}</span></div>`;

  const contact = [school?.address, school?.phone].filter(Boolean).map(esc).join(' · ');

  return `<!DOCTYPE html><html lang="${isEn ? 'en' : isGE ? 'es' : 'fr'}"><head>
<meta charset="UTF-8">
<title>${t('Reçu', 'Receipt', 'Recibo')} ${esc(num)} — ${esc(student.name)}</title>
<style>
  @page { size: 80mm auto; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { background: #fff; color: #000; }
  body {
    width: 80mm; padding: 4mm 3.5mm 8mm;
    font-family: 'Consolas', 'DejaVu Sans Mono', 'Courier New', monospace;
    font-size: 11px; line-height: 1.45; -webkit-font-smoothing: none;
  }
  .c { text-align: center; }
  .logo { display: block; margin: 0 auto 3px; max-width: 34mm; max-height: 16mm; object-fit: contain;
          filter: grayscale(100%) contrast(180%); }
  .school { font-size: 14px; font-weight: 700; text-transform: uppercase; line-height: 1.2; letter-spacing: .3px; }
  .contact { font-size: 9.5px; margin-top: 2px; }
  .kind { font-size: 12px; font-weight: 700; letter-spacing: 2px; margin: 3px 0 1px; }

  /* Séparateurs : des tirets, pas des filets — un thermique bas de gamme rend
     mal les bordures fines, jamais les caractères. */
  .sep  { margin: 4px 0; overflow: hidden; white-space: nowrap; letter-spacing: .5px; }
  .sep::after { content: "----------------------------------------"; }
  .sep2 { margin: 4px 0; overflow: hidden; white-space: nowrap; letter-spacing: .5px; }
  .sep2::after { content: "========================================"; }

  .row { display: flex; justify-content: space-between; gap: 6px; align-items: baseline; }
  .row .l { flex: 1; min-width: 0; word-break: break-word; }
  .row .v { white-space: nowrap; font-weight: 700; text-align: right; }
  .row.dim .l, .row.dim .v { font-weight: 400; }

  .item { margin: 2px 0; }
  .item .l { text-transform: uppercase; }

  .grand { font-size: 15px; font-weight: 700; margin: 2px 0; }
  .grand .v { font-size: 17px; }
  .due { font-size: 12px; font-weight: 700; }

  .dup { border: 1px dashed #000; padding: 3px 4px; margin: 4px 0; text-align: center;
         font-size: 10px; font-weight: 700; text-transform: uppercase; }
  .dup em { display: block; font-style: normal; font-weight: 400; text-transform: none; font-size: 9px; margin-top: 1px; }

  .foot { margin-top: 5px; font-size: 9.5px; }
  .thanks { font-size: 12px; font-weight: 700; letter-spacing: .5px; }
  .no { font-family: inherit; letter-spacing: .5px; }

  @media print { html, body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
</style>
</head><body>

  <div class="c">
    ${school?.logo_url ? `<img src="${esc(school.logo_url)}" alt="" class="logo">` : ''}
    <div class="school">${esc(school?.name || '—')}</div>
    ${contact ? `<div class="contact">${contact}</div>` : ''}
    <div class="kind">${t('REÇU', 'RECEIPT', 'RECIBO')}</div>
    <div class="contact no">N° ${esc(num)}</div>
  </div>

  <div class="sep2"></div>

  ${row(t('Date', 'Date', 'Fecha'), `${esc(dateStr)} ${esc(timeStr)}`, 'dim')}
  ${row(t('Caissier', 'Cashier', 'Cajero'), esc(cashierName || '—'), 'dim')}
  ${school?.current_year ? row(t('Année', 'Year', 'Año'), esc(school.current_year), 'dim') : ''}

  <div class="sep"></div>

  ${row(t('Élève', 'Student', 'Alumno'), esc(student.name), 'dim')}
  ${student.matricule ? row(t('Matricule', 'ID', 'Matrícula'), esc(student.matricule), 'dim') : ''}
  ${row(t('Classe', 'Class', 'Clase'), esc(className || '—'), 'dim')}

  <div class="sep"></div>

  <div class="item">
    ${row(esc(designation || t('Frais de scolarité', 'Tuition fees', 'Cuota escolar')), money(versement))}
  </div>

  <div class="sep2"></div>

  ${row(t('TOTAL VERSÉ', 'AMOUNT PAID', 'TOTAL PAGADO'), money(versement), 'grand')}

  <div class="sep"></div>

  ${total > 0 ? row(t('Total des frais', 'Total fees', 'Total'), money(total), 'dim') : ''}
  ${row(t('Cumul versé', 'Total paid to date', 'Pagado acumulado'), money(paid), 'dim')}
  ${total > 0 ? row(
    reste > 0 ? t('RESTE À PAYER', 'BALANCE DUE', 'SALDO PENDIENTE') : t('SOLDÉ', 'FULLY PAID', 'SALDADO'),
    money(reste), 'due',
  ) : ''}
  ${row(t('Mode', 'Method', 'Forma'), esc(modeLabel), 'dim')}

  ${duplicate ? `<div class="dup">${t('*** DUPLICATA ***', '*** DUPLICATE ***', '*** DUPLICADO ***')}
    <em>${t('Réimprimé le', 'Reprinted on', 'Reimpreso el')} ${esc(new Date().toLocaleDateString(locale))}${reprintBy ? ` ${t('par', 'by', 'por')} ${esc(reprintBy)}` : ''}.
    ${t('Ne vaut pas second paiement.', 'Not a second payment.', 'No constituye un segundo pago.')}</em>
  </div>` : '<div class="sep"></div>'}

  <div class="c foot">
    <div class="thanks">${t('MERCI !', 'THANK YOU!', '¡GRACIAS!')}</div>
    <div>${t('Ce reçu fait foi de paiement.', 'This receipt is proof of payment.', 'Este recibo justifica el pago.')}</div>
    <div>${t('Conservez-le.', 'Please keep it.', 'Consérvelo.')}</div>
  </div>

<script>window.onload = function(){ setTimeout(function(){ window.focus(); window.print(); }, 350); };</script>
</body></html>`;
}

// Ouvre le reçu dans une fenêtre dédiée et lance l'impression (A5 paysage).
// C'est le SEUL point d'entrée à utiliser dans l'app pour imprimer un reçu A5.
export function printReceipt(opts) {
  openPrintWindow(buildReceiptHtml(opts));
}

// Idem, au format ticket de caisse 80 mm (imprimante thermique).
export function printTicket(opts) {
  openPrintWindow(buildTicketHtml(opts), 'width=380,height=760');
}

function openPrintWindow(html, features) {
  const win = window.open('', '_blank', features);
  if (!win) return;
  win.document.write(html);
  win.document.close();
}
