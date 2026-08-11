// Documents imprimables du module RH (Phase C).
//   C.5 — Fiche de dossier personnel (synthèse + contrat + congés).
//   C.6 — Attestation de travail (document simple, signé).
//   C.7 — Bulletin de paie (registre indicatif, un bulletin = une impression).
// Socle lib/printDoc (window.print, offline). Aucun générateur d'attestation
// n'existait dans l'app (seuls exportStaff CSV + printStaffList liste).
import { openPrintDocument, docRef, esc } from './printDoc.js';

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

// ── C.7 — Bulletin de paie ────────────────────────────────────────────────────
// Registre INDICATIF (net résolu depuis le catalogue primes/retenues côté
// hrEngine.resolvePayrollItems) : les taux/montants viennent ENTIÈREMENT de la
// configuration de l'école (PayrollCatalogModal) — aucun calcul fiscal/CNPS
// supposé ici. `items` = lignes hr_payroll_items attachées à ce bulletin
// (vide sur un bulletin créé avant cette fonctionnalité → repli sur les deux
// totaux bruts `record.bonuses`/`record.deductions`, mise en page inchangée
// pour ne pas faire régresser un bulletin déjà émis).
function seniorityLabel(hireDate, tr) {
  if (!hireDate) return null;
  const start = new Date(hireDate);
  if (isNaN(start)) return null;
  const now = new Date();
  let months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  if (now.getDate() < start.getDate()) months -= 1;
  if (months < 0) return null;
  const years = Math.floor(months / 12);
  const rem = months % 12;
  return tr(`${years} an${years > 1 ? 's' : ''} ${rem} mois`, `${years} yr${years > 1 ? 's' : ''} ${rem} mo`, `${years} año${years > 1 ? 's' : ''} ${rem} m`);
}

export function printPayslip({ school, t, money, staff, record, items = [], optionLabel, leave }) {
  const tr = t || ((fr) => fr);
  const opt = optionLabel || ((v) => v || '—');
  const year = String(record?.period || school?.current_year || '').slice(0, 4);
  const ref = docRef('PAIE', year, record?.id);
  const row = (k, v) => v ? `<tr><td class="k">${esc(k)}</td><td>${esc(v)}</td></tr>` : '';

  const legalLine = (school?.niu || school?.cnps_number) ? `
    <p style="font-size:10px;color:#666;margin:-6px 0 10px">
      ${school?.niu ? `${esc(tr('NIU', 'Tax ID', 'N.I.U.'))} : ${esc(school.niu)}` : ''}
      ${school?.niu && school?.cnps_number ? ' &middot; ' : ''}
      ${school?.cnps_number ? `${esc(tr('N° CNPS', 'CNPS no.', 'N.° CNPS'))} : ${esc(school.cnps_number)}` : ''}
    </p>` : '';

  const employeeBox = `
    <table class="kv avoid-break">
      ${row(tr('Matricule', 'Staff ID', 'Matrícula'), staff?.matricule)}
      ${row(tr('Nom & prénom', 'Full name', 'Nombre completo'), staff?.name)}
      ${row(tr('Poste', 'Position', 'Puesto'), staff?.fonction)}
      ${row(tr('Département', 'Department', 'Departamento'), staff?.department)}
      ${row(tr('Convention collective', 'Collective agreement', 'Convenio colectivo'), staff?.convention_collective)}
      ${row(tr('Catégorie / échelon', 'Category / grade', 'Categoría / escalón'), staff?.categorie_echelon)}
      ${row(tr('N° CNPS (agent)', 'CNPS no. (staff)', 'N.° CNPS (empleado)'), staff?.cnps_number)}
      ${row(tr('Situation familiale', 'Family status', 'Situación familiar'), staff?.situation_familiale)}
      ${row(tr('Période', 'Period', 'Período'), record?.period)}
      ${row(tr('Statut', 'Status', 'Estado'), opt(record?.status))}
    </table>`;

  const base = Number(record?.base_salary) || 0;
  const primes = items.filter((i) => i.kind === 'prime');
  const retenues = items.filter((i) => i.kind === 'retenue');
  const hasItems = items.length > 0;

  const primesTotal = primes.reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const retenuesTotal = retenues.reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const brut = hasItems ? base + primesTotal : base + (Number(record?.bonuses) || 0);
  const net = record?.net_salary != null ? Number(record.net_salary) : (brut - retenuesTotal);

  const lineRow = (code, name, item) => {
    const base_ref = item.base_ref === 'salaire_base' ? base : brut;
    const baseCell = item.calc_type === 'percent' ? money(base_ref) : '';
    const tauxCell = item.calc_type === 'percent' ? `${item.rate ?? 0}%` : '';
    const isPrime = item.kind === 'prime';
    return `<tr>
      <td>${esc(code || '')}</td><td>${esc(name)}</td>
      <td class="num">${esc(baseCell)}</td><td class="num">${esc(tauxCell)}</td>
      <td class="num">${isPrime ? money(item.amount) : ''}</td>
      <td class="num">${!isPrime ? money(item.amount) : ''}</td>
    </tr>`;
  };

  const detailTable = hasItems ? `
    <table class="avoid-break">
      <thead><tr>
        <th>${esc(tr('Code', 'Code', 'Código'))}</th><th>${esc(tr('Désignation', 'Description', 'Designación'))}</th>
        <th class="right">${esc(tr('Base', 'Base', 'Base'))}</th><th class="right">${esc(tr('Taux', 'Rate', 'Tasa'))}</th>
        <th class="right">${esc(tr('Gains', 'Earnings', 'Ganancias'))}</th><th class="right">${esc(tr('Retenues', 'Deductions', 'Retenciones'))}</th>
      </tr></thead>
      <tbody>
        <tr><td>100</td><td>${esc(tr('SALAIRE DE BASE', 'BASE SALARY', 'SALARIO BASE'))}</td><td class="num"></td><td class="num"></td><td class="num">${money(base)}</td><td class="num"></td></tr>
        ${primes.map((i) => lineRow(i.code, i.name, i)).join('')}
        <tr class="even"><td>500</td><td><b>${esc(tr('SALAIRE BRUT GLOBAL', 'GROSS SALARY', 'SALARIO BRUTO'))}</b></td><td class="num"></td><td class="num"></td><td class="num"><b>${money(brut)}</b></td><td class="num"></td></tr>
        ${retenues.map((i) => lineRow(i.code, i.name, i)).join('')}
      </tbody>
      <tfoot><tr>
        <td colspan="4">${esc(tr('Totaux', 'Totals', 'Totales'))}</td>
        <td class="num">${money(brut)}</td><td class="num">${money(retenuesTotal)}</td>
      </tr></tfoot>
    </table>` : `
    <table class="kv avoid-break">
      <tr><td class="k">${esc(tr('Salaire de base', 'Base salary', 'Salario base'))}</td><td class="num">${money(base)}</td></tr>
      <tr><td class="k">${esc(tr('Primes', 'Bonuses', 'Primas'))}</td><td class="num">${money(record?.bonuses)}</td></tr>
      <tr><td class="k">${esc(tr('Retenues', 'Deductions', 'Retenciones'))}</td><td class="num">${money(record?.deductions != null ? -Math.abs(record.deductions) : 0)}</td></tr>
    </table>`;

  const seniority = seniorityLabel(staff?.hire_date, tr);
  const footRow = (k, v) => v ? `<tr><td class="k">${esc(k)}</td><td>${esc(v)}</td></tr>` : '';
  const footerBox = (leave || staff?.hire_date || staff?.niu || staff?.cni_number || staff?.bank_account) ? `
    <div class="box avoid-break" style="margin-top:10px">
      <table class="kv">
        ${leave ? footRow(tr('Congés acquis', 'Leave accrued', 'Permisos adquiridos'), `${leave.entitlement} ${tr('j', 'd', 'd')}`) : ''}
        ${leave ? footRow(tr('Congés pris', 'Leave taken', 'Permisos tomados'), `${leave.used} ${tr('j', 'd', 'd')}`) : ''}
        ${leave ? footRow(tr('Solde congés', 'Leave balance', 'Saldo de permisos'), `${leave.remaining} ${tr('j', 'd', 'd')}`) : ''}
        ${footRow(tr('Date d’entrée', 'Hire date', 'Fecha de entrada'), staff?.hire_date)}
        ${footRow(tr('Ancienneté', 'Seniority', 'Antigüedad'), seniority)}
        ${footRow(tr('N.I.U. (salarié)', 'Tax ID (staff)', 'N.I.U. (empleado)'), staff?.niu)}
        ${footRow(tr('N° CNI', 'ID card no.', 'N.° CNI'), staff?.cni_number)}
        ${footRow(tr('Banque / Compte', 'Bank / Account', 'Banco / Cuenta'), staff?.bank_account)}
      </table>
    </div>` : '';

  const bodyHtml = `
    ${legalLine}
    ${employeeBox}
    ${detailTable}
    <p class="amount-hero" style="margin-top:8px">${esc(tr('NET À PAYER', 'NET PAY', 'NETO A PAGAR'))} : ${money(net)}</p>
    ${footerBox}
    ${record?.notes ? `<p style="font-size:11px;color:#555;margin-top:8px">${esc(record.notes)}</p>` : ''}

    <div class="sign-area avoid-break">
      <div class="sign-box"><div class="sign-line"></div><div class="sign-label">${esc(tr('Signature de l’agent', 'Employee signature', 'Firma del empleado'))}</div></div>
      <div class="sign-box"><div class="sign-line"></div><div class="sign-label">${esc(tr("Le Chef d'établissement", 'The Head of institution', 'El Director'))}</div></div>
    </div>

    <p style="font-size:9.5px;color:#888;margin-top:10px">
      ${esc(tr('Bulletin indicatif — montants issus du catalogue configuré par l’établissement, aucun calcul fiscal/CNPS garanti par NotesCam.',
        'Indicative payslip — amounts come from the school’s own catalog configuration, no tax/social security computation guaranteed by NotesCam.',
        'Nómina indicativa — montos del catálogo configurado por el centro, sin cálculo fiscal/CNPS garantizado por NotesCam.'))}
    </p>`;

  return openPrintDocument({
    school, t: tr,
    title: tr('Bulletin de paie', 'Payslip', 'Nómina'),
    ref, subtitle: `${staff?.name || ''}${record?.period ? ` — ${record.period}` : ''}`, bodyHtml,
  });
}
