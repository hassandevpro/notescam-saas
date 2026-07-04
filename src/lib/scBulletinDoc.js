// Bulletin SECOND CYCLE MINESEC (lycée) — construction des feuilles HTML A4.
//
// Réplique de la maquette officielle du second cycle : matières regroupées en
// GROUPE 1 (principales) / GROUPE 2 (complémentaires), avec coefficient + charge
// horaire issus de l'arrêté (portés par les `subjects` auto-configurés :
// sc_groupe / sc_groupe_ordre / charge_horaire). Pour chaque groupe : sous-total
// des coefficients, des M×coef et moyenne de groupe ; puis moyenne générale,
// rang, et décision du conseil de classe.
//
// Réutilise le MOTEUR DE NOTES CLASSIQUE (bulletinEngine.js) — pas de table de
// notes dédiée — et le pipeline partagé HTML→PNG→jsPDF (exportTranscriptsPdf),
// exactement comme le bulletin APC du premier cycle ([[apc_minesec_engine]]).

import { officialHeaderHtml, officialSignatureHtml } from './officialDocHeader';
import { assembleScBulletin } from '../core/scEngine';

export { assembleScBulletin };

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));
const fix2 = (v) => (v == null ? '' : (Math.round(v * 100) / 100).toString());

const SHEET_OPEN = '<div class="nc-sheet" style="font-family:Arial,Helvetica,sans-serif;font-size:10px;color:#111;width:210mm;min-height:296mm;box-sizing:border-box;padding:9mm;background:#fff;margin:0 auto">';
const SHEET_CLOSE = '</div>';
const C = 'border:1px solid #374151;padding:2px 4px;font-size:9px;vertical-align:top';

const TRIM_TITLE = {
  t1: { fr: 'BULLETIN DE NOTES DU PREMIER TRIMESTRE', en: 'FIRST TERM REPORT CARD' },
  t2: { fr: 'BULLETIN DE NOTES DU DEUXIÈME TRIMESTRE', en: 'SECOND TERM REPORT CARD' },
  t3: { fr: 'BULLETIN DE NOTES DU TROISIÈME TRIMESTRE', en: 'THIRD TERM REPORT CARD' },
  annual: { fr: 'BULLETIN DE NOTES ANNUEL', en: 'ANNUAL REPORT CARD' },
};

// ── Blocs HTML ─────────────────────────────────────────────────────────────────
function identityHtml(student, { classLabel, serieLabel, effectif, profPrincipal }) {
  const redoublant = String(student?.statut || '').toLowerCase().includes('redoubl');
  const chk = (on) => `<span style="display:inline-block;width:9px;height:9px;border:1px solid #374151;margin:0 2px;vertical-align:middle;background:${on ? '#374151' : '#fff'}"></span>`;
  const parents = [student?.nom_pere, student?.nom_mere, student?.tuteur].filter(Boolean).join(' · ');
  const phone = student?.parent_phone ? ` (${esc(student.parent_phone)})` : '';
  const classTxt = [classLabel, serieLabel].filter(Boolean).join(' · ');
  return `
  <table style="width:100%;border-collapse:collapse;margin-bottom:5px">
    <tbody>
      <tr>
        <td rowspan="4" style="${C};width:70px;text-align:center;vertical-align:middle">
          ${student?.photo_url ? `<img src="${esc(student.photo_url)}" style="width:58px;height:70px;object-fit:cover"/>` : `<div style="font-size:8px;color:#888">Photo de l'élève</div>`}
        </td>
        <td style="${C}">Nom et Prénoms de l'élève : <strong>${esc(student?.name || '')}</strong></td>
        <td style="${C};white-space:nowrap">Classe : <strong>${esc(classTxt)}</strong></td>
      </tr>
      <tr>
        <td style="${C}">Date et lieu de naissance : ${esc(student?.date_naissance || '')} ${student?.lieu_naissance ? 'à ' + esc(student.lieu_naissance) : ''}</td>
        <td style="${C}">Genre : ${esc(student?.gender || '')} · Effectif : ${esc(effectif ?? '')}</td>
      </tr>
      <tr>
        <td style="${C}">Identifiant Unique : ${esc(student?.matricule || '')}</td>
        <td style="${C}">Redoublant : Oui ${chk(redoublant)} Non ${chk(!redoublant)} · P. principal : ${esc(profPrincipal || '')}</td>
      </tr>
      <tr><td colspan="2" style="${C}">Noms et contacts des Parents / Tuteurs : ${esc(parents)}${phone}</td></tr>
    </tbody>
  </table>`;
}

const TH = (txt, w) => `<th style="${C};background:#eef2f7;text-align:center;font-size:8.5px${w ? `;width:${w}` : ''}">${txt}</th>`;

function tableHeadHtml() {
  return `<tr>
    ${TH('MATIÈRES ET NOM DE L\'ENSEIGNANT', '30%')}
    ${TH('Coef', '6%')}${TH('Charge h', '7%')}${TH('Moy/20', '8%')}${TH('Moy×Coef', '9%')}${TH('Rang', '7%')}${TH('[Min–Max]', '10%')}${TH('Appréciation et Visa', '13%')}
  </tr>`;
}

function groupBlockHtml(g) {
  const headRow = `<tr><td colspan="8" style="${C};background:#dde7f3;font-weight:bold">${esc(g.nom)}</td></tr>`;
  const body = g.rows.map((r) => `<tr>
    <td style="${C}"><strong>${esc(r.nom)}</strong><br/><span style="color:#666">${esc(r.enseignant || 'M/Mme')}</span></td>
    <td style="${C};text-align:center">${r.coef}</td>
    <td style="${C};text-align:center">${r.charge ?? ''}</td>
    <td style="${C};text-align:center"><strong>${fix2(r.moyenne)}</strong></td>
    <td style="${C};text-align:center">${fix2(r.ponderee)}</td>
    <td style="${C};text-align:center">${esc(r.rang)}</td>
    <td style="${C};text-align:center">${r.minmax ? `${fix2(r.minmax.min)} – ${fix2(r.minmax.max)}` : ''}</td>
    <td style="${C}">${esc(r.appreciation)}</td>
  </tr>`).join('');
  const sub = `<tr style="background:#f4f7fb">
    <td style="${C};text-align:right;font-weight:bold">Total ${esc(g.nom)}</td>
    <td style="${C};text-align:center;font-weight:bold">${fix2(g.coefSum)}</td>
    <td style="${C};text-align:center;font-weight:bold">${fix2(g.chargeSum)}</td>
    <td style="${C};text-align:center;font-weight:bold">${fix2(g.moyenne)}</td>
    <td style="${C};text-align:center;font-weight:bold">${fix2(g.mxSum)}</td>
    <td colspan="3" style="${C}"></td>
  </tr>`;
  return headRow + body + sub;
}

// Synthèse : Total général | Discipline/conduite | Profil + décision du conseil.
function synthesisHtml(data, { decision, discipline } = {}) {
  const d = discipline || {};
  const kv = (k, v) => `<tr><td style="${C}">${k}</td><td style="${C};text-align:center">${v ?? ''}</td></tr>`;
  return `
  <table style="width:100%;border-collapse:collapse;margin-top:6px">
    <tbody><tr>
      <td style="width:34%;vertical-align:top;padding-right:4px">
        <table style="width:100%;border-collapse:collapse"><tbody>
          <tr><td colspan="2" style="${C};background:#eef2f7;text-align:center;font-weight:bold">Travail de l'élève</td></tr>
          ${kv('Total général (M×coef)', fix2(data.mxSum))}${kv('Total coefficients', fix2(data.coefSum))}
          ${kv('MOYENNE GÉNÉRALE', `<strong>${fix2(data.moyenneGenerale)}/20</strong>`)}
          ${kv('Rang', `<strong>${esc(data.generalRank || '')}</strong>`)}
          ${kv('Appréciation', esc(data.appreciation))}
        </tbody></table>
      </td>
      <td style="width:34%;vertical-align:top;padding-right:4px">
        <table style="width:100%;border-collapse:collapse"><tbody>
          <tr><td colspan="2" style="${C};background:#eef2f7;text-align:center;font-weight:bold">Discipline et conduite</td></tr>
          ${kv('Abs. non just. (h)', d.absNJ ?? '')}${kv('Abs. just. (h)', d.absJ ?? '')}
          ${kv('Conduite', esc(d.conduite || ''))}${kv('Exclusion (jours)', d.exclusions || '')}
        </tbody></table>
      </td>
      <td style="width:32%;vertical-align:top">
        <table style="width:100%;border-collapse:collapse"><tbody>
          <tr><td colspan="2" style="${C};background:#eef2f7;text-align:center;font-weight:bold">Profil de la classe</td></tr>
          ${kv('Moyenne de la classe', fix2(data.classStats?.avg))}
          ${kv('[Min – Max]', data.classStats ? `${fix2(data.classStats.min)} – ${fix2(data.classStats.max)}` : '')}
          ${kv('Nombre de moyennes', data.classStats?.count ?? '')}
          ${kv('Taux de réussite', data.classStats?.rate != null ? `${data.classStats.rate}%` : '')}
        </tbody></table>
      </td>
    </tr></tbody>
  </table>
  <table style="width:100%;border-collapse:collapse;margin-top:4px"><tbody><tr>
    <td style="${C};width:56%;vertical-align:top">
      Décision du conseil de classe : <strong>${esc(decision || (d.decision || ''))}</strong>
      ${d.mentions?.length ? `<br/><span style="color:#444">Mentions : ${esc(d.mentions.join(' · '))}</span>` : ''}
    </td>
    <td style="${C};width:22%;vertical-align:top;text-align:center">Visa du parent / Tuteur</td>
    <td style="${C};width:22%;vertical-align:top;text-align:center">Nom et visa du professeur principal</td>
  </tr></tbody></table>`;
}

// ── Pagination des groupes en pages A4 (groupe jamais coupé) ──────────────────
// Partagé avec l'aperçu écran React pour numéroter « Page i / N » par élève. Un
// lycée tient en général sur 1 page ; le découpage couvre les rares cas longs.
// La page 1 perd de la hauteur pour l'en-tête + l'identité ; les pages suivantes
// (bandeau de continuation léger) en tiennent bien plus → on remplit au maximum.
// Densité compacte (police 8px) : un lycée tient largement sur 1 page.
export const SC_FIRST_PAGE_ROWS = 34;   // page 1 (en-tête complet + identité)
export const SC_CONT_PAGE_ROWS  = 58;   // pages 2+ (bandeau de continuation)
export const SC_FOOTER_ROWS     = 16;   // réserve pour la synthèse + bloc signatures (3 col)

export function paginateScGroups(groups) {
  const cost = (g) => 2 + (g.rows?.length || 0);   // en-tête + sous-total + matières
  const budgetFor = (i) => (i === 0 ? SC_FIRST_PAGE_ROWS : SC_CONT_PAGE_ROWS);
  const pages = [];
  let cur = [], curRows = 0;
  for (const g of groups || []) {
    const r = cost(g);
    if (cur.length && curRows + r > budgetFor(pages.length)) { pages.push(cur); cur = []; curRows = 0; }
    cur.push(g); curRows += r;
  }
  if (cur.length) pages.push(cur);
  if (!pages.length) pages.push([]);
  const lastRows = pages[pages.length - 1].reduce((a, g) => a + cost(g), 0);
  const footerOwnPage = lastRows + SC_FOOTER_ROWS > budgetFor(pages.length - 1);
  return { pages, footerOwnPage };
}

// ── Feuille A4 d'un élève (1 page ; les matières d'un lycée tiennent sur 1 page) ─
export function buildScBulletinSheet(ctx) {
  const data = assembleScBulletin(ctx);
  const { school, sys = 'FR', trimestreId = 't1', classLabel, serieLabel, effectif, profPrincipal, student, decision, discipline } = ctx;
  const title = TRIM_TITLE[trimestreId] || TRIM_TITLE.t1;

  const groupsHtml = data.groups.map(groupBlockHtml).join('');
  return SHEET_OPEN
    + officialHeaderHtml(school, { sys, title: sys === 'EN' ? title.en : title.fr })
    + identityHtml(student, { classLabel, serieLabel, effectif, profPrincipal })
    + `<table style="width:100%;border-collapse:collapse"><thead>${tableHeadHtml()}</thead><tbody>${groupsHtml}</tbody></table>`
    + synthesisHtml(data, { decision, discipline })
    + officialSignatureHtml(school, sys)
    + SHEET_CLOSE;
}
