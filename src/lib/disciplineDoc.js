// Documents imprimables de la VIE SCOLAIRE : convocation (élève/parent) et
// autorisation de sortie. Pipeline HTML → fenêtre → window.print() (même approche
// légère que receiptDoc.js), format A5.

import { bulletinOfficials } from '../countries';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function headerHtml(school) {
  const off = bulletinOfficials(school);
  const block = off?.blocks?.[0];
  const lines = block
    ? [block.republic, block.motto, block.ministry, ...(block.lines || [])].filter(Boolean)
    : [];
  return `
    <div class="head">
      <div class="head-left">${lines.map((l) => `<div>${esc(l)}</div>`).join('')}</div>
      <div class="head-right"><div class="school">${esc(school?.name || '')}</div>
        ${school?.establishment_no ? `<div class="est">N° ${esc(school.establishment_no)}</div>` : ''}
      </div>
    </div>`;
}

function shell(title, school, bodyHtml) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  @page { size: A5; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1f2937; margin: 0; }
  .doc { max-width: 148mm; margin: 0 auto; }
  .head { display: flex; justify-content: space-between; gap: 12px; border-bottom: 2px solid #111; padding-bottom: 8px; margin-bottom: 14px; font-size: 10px; }
  .head-right { text-align: right; }
  .school { font-weight: 800; font-size: 13px; }
  h1 { text-align: center; font-size: 17px; letter-spacing: .04em; margin: 10px 0 4px; text-transform: uppercase; }
  .ref { text-align: center; color: #6b7280; font-size: 11px; margin-bottom: 16px; }
  .row { margin: 7px 0; font-size: 12.5px; }
  .row b { display: inline-block; min-width: 46mm; color: #374151; }
  .body { font-size: 12.5px; line-height: 1.6; margin: 12px 0; }
  .sign { margin-top: 26px; display: flex; justify-content: space-between; font-size: 12px; }
  .sign .line { margin-top: 22px; border-top: 1px solid #9ca3af; width: 55mm; }
  .foot { margin-top: 18px; font-size: 10px; color: #9ca3af; text-align: center; }
</style></head><body>
  <div class="doc">
    ${headerHtml(school)}
    ${bodyHtml}
  </div>
  <script>window.onload=function(){setTimeout(function(){window.focus();window.print();},350);};</script>
</body></html>`;
}

function open(html) {
  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(html);
  win.document.close();
}

// Convocation d'un élève et/ou d'un parent.
export function printConvocation({ school, student, className, meeting, t }) {
  const targetLabel = meeting.target === 'eleve'
    ? t('l’élève', 'the student')
    : meeting.target === 'les_deux' ? t('l’élève et son parent', 'the student and their parent')
    : t('le parent / tuteur', 'the parent / guardian');
  const body = `
    <h1>${t('Convocation', 'Summons')}</h1>
    <div class="ref">${t('Réf', 'Ref')}: ${esc((meeting.id || '').slice(0, 8).toUpperCase())} · ${esc(meeting.meeting_date || '')}</div>
    <div class="body">
      ${t('La Direction convoque', 'The administration summons')} <b>${esc(targetLabel)}</b> :
    </div>
    <div class="row"><b>${t('Élève', 'Student')}</b> ${esc(student?.name || '—')}</div>
    <div class="row"><b>${t('Classe', 'Class')}</b> ${esc(className || '—')}</div>
    <div class="row"><b>${t('Date du RDV', 'Meeting date')}</b> ${esc(meeting.meeting_date || '—')} ${esc(meeting.meeting_time || '')}</div>
    <div class="row"><b>${t('Lieu', 'Location')}</b> ${esc(meeting.location || '—')}</div>
    <div class="row"><b>${t('Motif', 'Reason')}</b> ${esc(meeting.reason || '—')}</div>
    <div class="sign">
      <div>${t('Le surveillant général', 'The supervisor')}<div class="line"></div></div>
      <div>${t('Le Chef d’établissement', 'The Principal')}<div class="line"></div></div>
    </div>
    <div class="foot">${t('Merci de vous présenter à la date indiquée.', 'Please attend on the indicated date.')}</div>`;
  open(shell(t('Convocation', 'Summons'), school, body));
}

// Autorisation de sortie.
export function printExitPermission({ school, student, className, permission, t, typeLabel }) {
  const body = `
    <h1>${t('Autorisation de sortie', 'Exit permission')}</h1>
    <div class="ref">${t('Réf', 'Ref')}: ${esc((permission.id || '').slice(0, 8).toUpperCase())} · ${esc(permission.date || '')}</div>
    <div class="row"><b>${t('Élève', 'Student')}</b> ${esc(student?.name || '—')}</div>
    <div class="row"><b>${t('Classe', 'Class')}</b> ${esc(className || '—')}</div>
    <div class="row"><b>${t('Type', 'Type')}</b> ${esc(typeLabel || permission.exit_type || '—')}</div>
    <div class="row"><b>${t('Date', 'Date')}</b> ${esc(permission.date || '—')}</div>
    <div class="row"><b>${t('Heure de sortie', 'Exit time')}</b> ${esc(permission.exit_time || '—')}</div>
    <div class="row"><b>${t('Retour prévu', 'Expected return')}</b> ${esc(permission.return_time || '—')}</div>
    <div class="row"><b>${t('Motif', 'Reason')}</b> ${esc(permission.reason || '—')}</div>
    <div class="row"><b>${t('Autorisé par', 'Authorized by')}</b> ${esc(permission.authorized_by || '—')}</div>
    <div class="row"><b>${t('Accompagné de', 'Accompanied by')}</b> ${esc(permission.accompanied_by || '—')}</div>
    <div class="sign">
      <div>${t('Signature du responsable', 'Guardian signature')}<div class="line"></div></div>
      <div>${t('Le surveillant général', 'The supervisor')}<div class="line"></div></div>
    </div>`;
  open(shell(t('Autorisation de sortie', 'Exit permission'), school, body));
}
