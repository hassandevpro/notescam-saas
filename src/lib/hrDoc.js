// Documents imprimables du module RH (Phase C).
//   C.5 — Fiche de dossier personnel (synthèse + contrat + congés).
//   C.6 — Attestation de travail (document simple, signé).
//   C.7 — Bulletin de paie (mise en page calquée sur le modèle légal camerounais).
// Socle lib/printDoc (window.print, offline). Aucun générateur d'attestation
// n'existait dans l'app (seuls exportStaff CSV + printStaffList liste).
import { openPrintDocument, openRawPrintDocument, docRef, esc } from './printDoc.js';

// ── C.5 — Fiche de dossier personnel ─────────────────────────────────────────
export function printStaffFile({ school, t, money, staff, summary, data = {}, optionLabel }) {
  const tr = t || ((fr) => fr);
  const opt = optionLabel || ((v) => v || '—');
  const ref = docRef('RH', String(school?.current_year || '').slice(0, 4), staff?.id);
  const row = (k, v) => v ? `<tr><td class="k">${esc(k)}</td><td>${esc(v)}</td></tr>` : '';
  const c = summary?.contract;

  const contractBox = c ? `
    <div class="box avoid-break">
      <h3>${esc(tr('Contrat en cours', 'Current contract', 'Contrato actual'))}</h3>
      <table class="kv">
        ${row(tr('Type', 'Type', 'Tipo'), opt(c.type))}
        ${row(tr('Référence', 'Reference', 'Referencia'), c.reference)}
        ${row(tr('Intitulé', 'Title', 'Título'), c.title)}
        ${row(tr('Début', 'Start', 'Inicio'), c.start_date)}
        ${row(tr('Fin', 'End', 'Fin'), c.end_date)}
        ${c.salary != null ? row(tr('Salaire', 'Salary', 'Salario'), money(c.salary)) : ''}
      </table>
    </div>` : `<p style="font-size:11px;color:#b45309">${esc(tr('Aucun contrat actif enregistré.', 'No active contract on file.', 'Sin contrato activo.'))}</p>`;

  const bodyHtml = `
    <table class="kv avoid-break">
      ${row(tr('Nom & prénom', 'Full name', 'Nombre completo'), staff?.name)}
      ${row(tr('Matricule', 'Staff ID', 'Matrícula'), staff?.matricule)}
      ${row(tr('Fonction', 'Role', 'Función'), staff?.fonction)}
      ${row(tr('Département', 'Department', 'Departamento'), staff?.department)}
      ${row(tr("Date de recrutement", 'Hire date', 'Fecha de contratación'), staff?.hire_date)}
      ${row(tr('Téléphone', 'Phone', 'Teléfono'), staff?.phone)}
      ${row(tr('Email', 'Email', 'Correo'), staff?.email)}
    </table>

    <div class="box avoid-break">
      <h3>${esc(tr('Synthèse du dossier', 'File summary', 'Resumen del expediente'))}</h3>
      <table class="kv">
        <tr><td class="k">${esc(tr('Statut', 'Status', 'Estado'))}</td><td>${summary?.active ? esc(tr('Contrat actif', 'Active contract', 'Contrato activo')) : esc(tr('Sans contrat actif', 'No active contract', 'Sin contrato activo'))}</td></tr>
        <tr><td class="k">${esc(tr('Congés restants', 'Leave balance', 'Saldo de permisos'))}</td><td>${esc(summary?.leave?.remaining ?? '—')} ${esc(tr('jours', 'days', 'días'))}</td></tr>
        <tr><td class="k">${esc(tr('Taux de présence', 'Presence rate', 'Tasa de asistencia'))}</td><td>${summary?.att?.total ? esc(summary.att.presenceRate + '%') : '—'}</td></tr>
        <tr><td class="k">${esc(tr('Note moyenne', 'Average score', 'Nota media'))}</td><td>${summary?.evalAvg == null ? '—' : esc(summary.evalAvg + '/20')}</td></tr>
      </table>
    </div>

    ${contractBox}

    <div style="font-size:9.5px;color:#888;margin-top:6px">
      ${esc(tr('Contrats', 'Contracts', 'Contratos'))}: ${(data.contracts || []).length} ·
      ${esc(tr('Congés', 'Leaves', 'Permisos'))}: ${(data.leaves || []).length} ·
      ${esc(tr('Évaluations', 'Evaluations', 'Evaluaciones'))}: ${(data.evaluations || []).length}
    </div>`;

  return openPrintDocument({
    school, t: tr,
    title: tr('Fiche de dossier personnel', 'Staff file', 'Ficha de expediente'),
    ref, subtitle: staff?.name, bodyHtml,
  });
}

// ── C.6 — Attestation de travail ─────────────────────────────────────────────
export function printWorkCertificate({ school, t, staff, contract, optionLabel }) {
  const tr = t || ((fr) => fr);
  const opt = optionLabel || ((v) => v || '');
  const ref = docRef('ATT', String(school?.current_year || '').slice(0, 4), staff?.id);
  const today = new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
  const ctype = contract?.type ? opt(contract.type) : '';

  const body = tr(
    `Je soussigné(e), Chef d'établissement de <b>${esc(school?.name || '')}</b>, atteste que <b>${esc(staff?.name || '')}</b>${staff?.fonction ? `, exerçant les fonctions de <b>${esc(staff.fonction)}</b>,` : ''} fait partie du personnel de notre établissement${staff?.hire_date ? ` depuis le <b>${esc(staff.hire_date)}</b>` : ''}${ctype ? `, sous contrat de type <b>${esc(ctype)}</b>` : ''}.`,
    `I, the undersigned, Head of <b>${esc(school?.name || '')}</b>, certify that <b>${esc(staff?.name || '')}</b>${staff?.fonction ? `, holding the position of <b>${esc(staff.fonction)}</b>,` : ''} is a member of staff of our institution${staff?.hire_date ? ` since <b>${esc(staff.hire_date)}</b>` : ''}${ctype ? `, under a <b>${esc(ctype)}</b> contract` : ''}.`,
    `El/La abajo firmante, Director(a) de <b>${esc(school?.name || '')}</b>, certifica que <b>${esc(staff?.name || '')}</b>${staff?.fonction ? `, con el cargo de <b>${esc(staff.fonction)}</b>,` : ''} forma parte del personal de nuestra institución${staff?.hire_date ? ` desde el <b>${esc(staff.hire_date)}</b>` : ''}${ctype ? `, con contrato de tipo <b>${esc(ctype)}</b>` : ''}.`,
  );

  const closing = tr(
    'En foi de quoi la présente attestation lui est délivrée pour servir et valoir ce que de droit.',
    'In witness whereof this certificate is issued to serve as needed.',
    'Y para que conste, se expide la presente a los efectos oportunos.',
  );

  const bodyHtml = `
    <p style="font-size:13px;line-height:1.9;margin:18px 0">${body}</p>
    <p style="font-size:13px;line-height:1.9;margin:14px 0">${esc(closing)}</p>
    <p style="text-align:right;font-size:12px;margin-top:26px">${esc(school?.address ? school.address + ', ' : '')}${esc(tr('le', 'on', 'a'))} ${today}</p>
    <div class="sign-area avoid-break" style="justify-content:flex-end">
      <div class="sign-box" style="max-width:260px"><div class="sign-line"></div><div class="sign-label">${esc(tr("Le Chef d'établissement", 'The Head of institution', 'El Director'))}</div></div>
    </div>`;

  return openPrintDocument({
    school, t: tr,
    title: tr('Attestation de travail', 'Certificate of employment', 'Certificado de trabajo'),
    ref, subtitle: staff?.name, bodyHtml,
  });
}

// ── C.7 — Bulletin de paie (calqué sur le modèle légal camerounais) ──────────
// Mise en page reprise d'un bulletin réel : en-tête employeur (NIU / N° CNPS),
// grille d'identification de l'agent, tableau CODE / DÉSIGNATION / NOMBRE-BASE /
// TAUX / GAINS / RETENUES avec ses lignes de synthèse, encart NET À PAYER, bloc
// informatif des charges patronales, puis congés / ancienneté / identifiants.
//
// Ce document n'utilise PAS l'en-tête partagé (openPrintDocument) : sa mise en
// page est imposée de l'extérieur et ne peut pas s'accommoder du bandeau maison.
// Il passe donc par openRawPrintDocument, qui ne partage que la mécanique
// popup/impression.
//
// TOUS les montants et taux viennent du catalogue configuré par l'établissement
// (hr_payroll_catalog) : NotesCam n'embarque aucun barème fiscal ni CNPS. Les
// seules lignes calculées ici sont STRUCTURELLES (brut = base + primes,
// net = brut − retenues).

// Ancienneté « 4 ans 10 mois » à la date de RÉFÉRENCE du bulletin (fin de la
// période payée), jamais à la date d'impression : un bulletin doit ressortir à
// l'identique des années plus tard — même exigence que le n° de reçu
// (cf. lib/receiptDoc.js).
function seniorityLabel(hireDate, tr, asOf) {
  if (!hireDate) return null;
  const start = new Date(hireDate);
  if (isNaN(start)) return null;
  const now = asOf instanceof Date && !isNaN(asOf) ? asOf : new Date();
  let months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  if (now.getDate() < start.getDate()) months -= 1;
  if (months < 0) return null;
  const years = Math.floor(months / 12);
  const rem = months % 12;
  return tr(`${years} an${years > 1 ? 's' : ''} ${rem} mois`, `${years} yr${years > 1 ? 's' : ''} ${rem} mo`, `${years} año${years > 1 ? 's' : ''} ${rem} m`);
}

const PERIOD_RE = /^(\d{4})-(\d{2})$/;

// Dernier jour de la période payée — date de référence du bulletin (ancienneté).
function periodEndDate(period) {
  const m = PERIOD_RE.exec(String(period || ''));
  return m ? new Date(Number(m[1]), Number(m[2]), 0) : null;
}

// « 2021-08-01 » → « 01/08/2021 » (format du modèle). Repli sur la valeur brute.
function dateLabel(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : (iso || '');
}

// « 2026-08 » → « Août 2026 » (libellé du modèle). Repli sur la valeur brute.
function periodLabel(period) {
  const m = PERIOD_RE.exec(String(period || ''));
  if (!m) return period || '';
  const d = new Date(Number(m[1]), Number(m[2]) - 1, 1);
  if (isNaN(d)) return period;
  const s = d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const PAYSLIP_CSS = `
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Courier New',Courier,monospace;font-size:9px;color:#000;background:#fff}
  .page{padding:8mm 7mm}
  table{border-collapse:collapse;width:100%}
  .r{text-align:right}
  .ps-head{display:flex;align-items:flex-start;gap:14px;margin-bottom:12px}
  .ps-emp{flex:0 0 34%;line-height:1.45;font-size:8px}
  .ps-emp .nm{font-size:9.5px;font-weight:bold}
  .ps-title{flex:1;text-align:center;font-size:13px;font-weight:bold;letter-spacing:2.5px;text-decoration:underline;padding-top:3px}
  .ps-logo{flex:0 0 34%;text-align:right}
  .ps-logo img{max-width:130px;max-height:46px;object-fit:contain}
  .ps-grid{table-layout:fixed}
  .ps-grid td{border:1px solid #000;padding:2px 5px;vertical-align:top}
  .ps-grid .lbl{display:block;font-size:6px;letter-spacing:.3px}
  .ps-grid .val{display:block;font-size:9px;font-weight:bold;min-height:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .ps-main{margin-top:7px;table-layout:fixed}
  .ps-main th{border:1px solid #000;padding:2px 5px;font-size:6px;font-weight:normal;text-align:left;letter-spacing:.2px}
  .ps-main td{border-left:1px solid #000;border-right:1px solid #000;padding:1px 5px;font-size:8.5px;height:13px;white-space:nowrap;overflow:hidden}
  .ps-main tbody tr:first-child td{padding-top:4px}
  .ps-main .strong td{font-weight:bold}
  .ps-main .fill td{border-bottom:1px solid #000}
  .ps-main tfoot td{border:1px solid #000;font-size:8.5px;padding:2px 5px}
  .ps-net{margin:8px 0 0 auto;width:52%;border:1.5px solid #000}
  .ps-net .l{border-bottom:1.5px solid #000;padding:2px 6px;font-size:8px;font-weight:bold}
  .ps-net .v{padding:6px 10px;text-align:center;font-size:20px;font-weight:bold;letter-spacing:1px}
  .ps-net .v em{font-size:9px;font-weight:normal;font-style:normal;letter-spacing:0;margin-left:5px}
  .ps-pat{margin-top:16px;width:74%}
  .ps-pat .t{font-size:6.5px;letter-spacing:.4px;margin-bottom:2px}
  .ps-pat th{border-bottom:1px solid #000;font-size:6.5px;font-weight:normal;text-align:left;padding:1px 5px}
  .ps-pat td{padding:1px 5px;font-size:8px}
  .ps-pat .tot td{border-top:1px solid #000;font-weight:bold}
  .ps-foot{margin-top:14px}
  .ps-foot td{width:25%}
  .ps-note{margin-top:8px;text-align:center;font-size:7px;font-style:italic;color:#444}
`;

export function printPayslip({ school, t, money, staff, record, items = [], leave }) {
  const tr = t || ((fr) => fr);
  const year = String(record?.period || school?.current_year || '').slice(0, 4);
  const ref = docRef('PAIE', year, record?.id);
  // Montants SANS le code devise (le modèle ne le répète pas dans le tableau —
  // il n'apparaît qu'une fois, dans l'encart NET À PAYER).
  const amt = (n) => (typeof money?.amount === 'function' ? money.amount(n) : String(Number(n) || 0));
  const cur = money?.code || '';

  const base = Number(record?.base_salary) || 0;

  // Un bulletin antérieur au catalogue n'a pas de lignes détaillées : on
  // synthétise deux lignes depuis les totaux enregistrés pour qu'il s'imprime
  // dans la MÊME mise en page — pas de second gabarit à maintenir.
  const lines = items.length ? items : [
    ...(Number(record?.bonuses) ? [{ kind: 'prime', name: tr('Primes', 'Bonuses', 'Primas'), amount: record.bonuses }] : []),
    ...(Number(record?.deductions) ? [{ kind: 'retenue', name: tr('Retenues', 'Deductions', 'Retenciones'), amount: record.deductions }] : []),
  ];

  const primes = lines.filter((i) => i.kind === 'prime');
  const retenues = lines.filter((i) => i.kind === 'retenue');
  const patronales = lines.filter((i) => i.kind === 'patronale');
  const sum = (arr) => arr.reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const retenuesTotal = sum(retenues);
  const patronalTotal = sum(patronales);
  const brut = base + sum(primes);
  const net = record?.net_salary != null ? Number(record.net_salary) : Math.max(0, brut - retenuesTotal);

  const cell = (label, value) => `<td><span class="lbl">${esc(label)}</span><span class="val">${esc(value || '')}</span></td>`;
  // Taux « 4,2% » (1 décimale, comme le tableau du modèle) ou « 1,50% »
  // (2 décimales, comme son bloc patronal). Jamais d'arrondi destructeur : un
  // taux à 2 décimales (1,75 %) reste affiché en entier même en mode 1 décimale.
  const rateTxt = (rate, min) => {
    let s = (Number(rate) || 0).toFixed(2);
    if (min < 2 && s.endsWith('0')) s = s.slice(0, -1);
    return `${s.replace('.', ',')}%`;
  };
  const rateCell = (i, min = 1) => (i.calc_type === 'percent' ? rateTxt(i.rate, min) : '');
  const baseCell = (i) => (i.calc_type === 'percent' ? amt(i.base_ref === 'salaire_base' ? base : brut) : '');

  const itemRow = (i) => `<tr>
      <td>${esc(i.code || '')}</td><td>${esc(i.name)}</td>
      <td class="r">${esc(baseCell(i))}</td><td class="r">${esc(rateCell(i))}</td>
      <td class="r">${i.kind === 'prime' ? esc(amt(i.amount)) : ''}</td>
      <td class="r">${i.kind === 'retenue' ? esc(amt(i.amount)) : ''}</td>
    </tr>`;
  // Lignes de synthèse du modèle (astérisques comprises). `baseVal` n'est
  // renseigné que pour BASE TAXABLE, qui reprend le brut — affichage conforme
  // au modèle ; le calcul de l'impôt lui-même reste une ligne du catalogue.
  const summaryRow = (code, label, gains, baseVal) => `<tr class="strong">
      <td>${esc(code)}</td><td>${esc(label)} ***********</td>
      <td class="r">${baseVal == null ? '' : esc(amt(baseVal))}</td><td></td>
      <td class="r">${esc(amt(gains))}</td><td></td>
    </tr>`;

  const head = `
    <div class="ps-head">
      <div class="ps-emp">
        <div class="nm">${esc(school?.name || '')}</div>
        ${[school?.address,
    school?.niu ? `NIU: ${school.niu}` : '',
    school?.cnps_number ? `${tr('N° CNPS', 'CNPS no.', 'N.° CNPS')}: ${school.cnps_number}` : '',
  ].filter(Boolean).map((l) => `<div>${esc(l)}</div>`).join('')}
      </div>
      <div class="ps-title">${esc(tr('BULLETIN DE PAIE', 'PAYSLIP', 'NÓMINA'))}</div>
      <div class="ps-logo">${school?.logo_url ? `<img src="${esc(school.logo_url)}" alt=""/>` : ''}</div>
    </div>`;

  const idGrid = `
    <table class="ps-grid">
      <tr>
        ${cell(tr('MATRICULE', 'STAFF ID', 'MATRÍCULA'), staff?.matricule)}
        ${cell(tr('NOM & PRÉNOMS', 'FULL NAME', 'NOMBRE Y APELLIDOS'), staff?.name)}
        ${cell(tr('POSTE', 'POSITION', 'PUESTO'), staff?.fonction)}
      </tr>
      <tr>
        ${cell(tr('DÉPARTEMENT', 'DEPARTMENT', 'DEPARTAMENTO'), staff?.department)}
        ${cell(tr('CONVENTION COLLECTIVE', 'COLLECTIVE AGREEMENT', 'CONVENIO COLECTIVO'), staff?.convention_collective)}
        ${cell(tr('CATÉGORIE / ÉCHELON', 'CATEGORY / GRADE', 'CATEGORÍA / ESCALÓN'), staff?.categorie_echelon)}
      </tr>
      <tr>
        ${cell(tr('N° CNPS', 'CNPS NO.', 'N.° CNPS'), staff?.cnps_number)}
        ${cell(tr('SITUATION FAMILIALE', 'FAMILY STATUS', 'SITUACIÓN FAMILIAR'), staff?.situation_familiale)}
        ${cell(tr('PÉRIODE', 'PERIOD', 'PERÍODO'), periodLabel(record?.period))}
      </tr>
    </table>`;

  const mainTable = `
    <table class="ps-main">
      <colgroup><col style="width:7%"/><col style="width:45%"/><col style="width:13%"/><col style="width:9%"/><col style="width:13%"/><col style="width:13%"/></colgroup>
      <thead><tr>
        <th>${esc(tr('CODE', 'CODE', 'CÓDIGO'))}</th>
        <th>${esc(tr('DÉSIGNATION', 'DESCRIPTION', 'DESIGNACIÓN'))}</th>
        <th class="r">${esc(tr('NOMBRE / BASE', 'QTY / BASE', 'NÚMERO / BASE'))}</th>
        <th class="r">${esc(tr('TAUX', 'RATE', 'TASA'))}</th>
        <th class="r">${esc(tr('GAINS', 'EARNINGS', 'GANANCIAS'))}</th>
        <th class="r">${esc(tr('RETENUES', 'DEDUCTIONS', 'RETENCIONES'))}</th>
      </tr></thead>
      <tbody>
        <tr><td>100</td><td>${esc(tr('SALAIRE DE BASE', 'BASE SALARY', 'SALARIO BASE'))}</td><td class="r"></td><td class="r"></td><td class="r">${esc(amt(base))}</td><td class="r"></td></tr>
        ${primes.map(itemRow).join('')}
        ${summaryRow('500', tr('SALAIRE BRUT GLOBAL', 'TOTAL GROSS SALARY', 'SALARIO BRUTO GLOBAL'), brut)}
        ${summaryRow('505', tr('BASE TAXABLE', 'TAXABLE BASE', 'BASE IMPONIBLE'), 0, brut)}
        ${retenues.map(itemRow).join('')}
        ${summaryRow('700', tr('SALAIRE NET', 'NET SALARY', 'SALARIO NETO'), net)}
        <tr class="fill"><td style="height:${lines.length > 12 ? 24 : 150}px"></td><td></td><td></td><td></td><td></td><td></td></tr>
      </tbody>
      <tfoot><tr>
        <td colspan="4" class="r">${esc(tr('Totaux', 'Totals', 'Totales'))}</td>
        <td class="r">${esc(amt(brut))}</td><td class="r">${esc(amt(retenuesTotal))}</td>
      </tr></tfoot>
    </table>`;

  const netBox = `
    <div class="ps-net">
      <div class="l">${esc(tr('NET À PAYER', 'NET PAY', 'NETO A PAGAR'))}</div>
      <div class="v">${esc(amt(net))}<em>${esc(cur)}</em></div>
    </div>`;

  const patBlock = patronales.length ? `
    <div class="ps-pat">
      <div class="t">${esc(tr('CHARGES PATRONALES (INFO)', 'EMPLOYER CONTRIBUTIONS (INFO)', 'CARGAS PATRONALES (INFO)'))}</div>
      <table>
        <thead><tr>
          <th>${esc(tr('Libellé', 'Description', 'Concepto'))}</th>
          <th class="r">${esc(tr('Base', 'Base', 'Base'))}</th>
          <th class="r">${esc(tr('Taux', 'Rate', 'Tasa'))}</th>
          <th class="r">${esc(tr('Montant', 'Amount', 'Importe'))}</th>
        </tr></thead>
        <tbody>
          ${patronales.map((i) => `<tr><td>${esc(i.name)}</td><td class="r">${esc(baseCell(i))}</td><td class="r">${esc(rateCell(i, 2))}</td><td class="r">${esc(amt(i.amount))}</td></tr>`).join('')}
          <tr class="tot"><td colspan="3" class="r">${esc(tr('Total Patronal :', 'Employer total:', 'Total patronal:'))}</td><td class="r">${esc(amt(patronalTotal))}</td></tr>
        </tbody>
      </table>
    </div>` : '';

  const j = tr('j', 'd', 'd');
  const footGrid = `
    <table class="ps-grid ps-foot">
      <tr>
        ${cell(tr('CONGÉS ACQUIS', 'LEAVE ACCRUED', 'PERMISOS ADQUIRIDOS'), leave ? `${leave.entitlement} ${j}` : '')}
        ${cell(tr('DATE ENTRÉE', 'HIRE DATE', 'FECHA DE ENTRADA'), dateLabel(staff?.hire_date))}
        ${cell(tr('ANCIENNETÉ', 'SENIORITY', 'ANTIGÜEDAD'), seniorityLabel(staff?.hire_date, tr, periodEndDate(record?.period)))}
        ${cell(tr('N.I.U. (SALARIÉ)', 'TAX ID (STAFF)', 'N.I.U. (EMPLEADO)'), staff?.niu)}
      </tr>
      <tr>
        ${cell(tr('CONGÉS PRIS', 'LEAVE TAKEN', 'PERMISOS TOMADOS'), leave ? `${leave.used} ${j}` : '')}
        ${cell(tr('SOLDE CONGÉS', 'LEAVE BALANCE', 'SALDO PERMISOS'), leave ? `${leave.remaining} ${j}` : '')}
        ${cell(tr('BANQUE / COMPTE', 'BANK / ACCOUNT', 'BANCO / CUENTA'), staff?.bank_account)}
        ${cell(tr('N° CNI', 'ID CARD NO.', 'N.° CNI'), staff?.cni_number)}
      </tr>
    </table>`;

  const bodyHtml = `${head}${idGrid}${mainTable}${netBox}${patBlock}${footGrid}
    <div class="ps-note">${esc(tr(
    'Il est recommandé au salarié de conserver ce bulletin de paie sans limitation de durée.',
    'The employee is advised to keep this payslip indefinitely.',
    'Se recomienda al empleado conservar esta nómina sin límite de tiempo.'))}</div>
    <div class="ps-note" style="font-style:normal">${esc(ref)} · ${esc(tr(
    'Montants et taux issus du catalogue configuré par l’établissement.',
    'Amounts and rates come from the school’s own catalog configuration.',
    'Importes y tasas del catálogo configurado por el centro.'))}</div>`;

  return openRawPrintDocument({
    title: `${tr('Bulletin de paie', 'Payslip', 'Nómina')} — ${staff?.name || ''}`,
    css: PAYSLIP_CSS, bodyHtml,
  });
}
