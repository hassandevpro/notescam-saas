// Documents imprimables du module RH (Phase C).
//   C.5 — Fiche de dossier personnel (synthèse + contrat + congés).
//   C.6 — Attestation de travail (document simple, signé).
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
