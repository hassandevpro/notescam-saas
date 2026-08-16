// Procès-verbal de délibération — feuille A4 PAYSAGE (impression + aperçu).
//
// Même principe que les relevés (transcriptDoc.js) : une chaîne HTML unique sert
// à l'aperçu écran, à l'impression et à toute capture ultérieure. La maquette
// reprend le procès-verbal officiel : en-tête bilingue du pays, coordonnées de
// l'établissement, bandeau de titre, ligne d'identification de la classe, grand
// tableau de délibération (une ligne par élève, un groupe de colonnes par
// matière), résumé chiffré et trois blocs de signature.
//
// Le tableau s'adapte au nombre de matières : au-delà d'une certaine densité, le
// détail par unité d'évaluation s'efface et seule la moyenne de matière reste —
// une page paysage garde ainsi des colonnes lisibles.

import { bulletinOfficials } from '../countries/index.js';
import { createDocumentScale, pageDimsPx } from './documentScale.js';
import { sheetOpen, SHEET_CLOSE, esc, safe, num as fmt, CLASS } from './print/index.js';

// Profil de page du PV : A4 PAYSAGE. Géométrie, marges, couleurs d'impression et
// règles de saut viennent du socle (lib/print) — ce fichier ne décrit que le
// contenu. En particulier : plus une seule déclaration `print-color-adjust`,
// le socle l'applique à toute la feuille.
const PROFILE = 'large';

const S = createDocumentScale({ category: 'standard', orientation: 'landscape', ...pageDimsPx('landscape') });

const L = (sys, fr, en, es) => (sys === 'EN' ? en : sys === 'ES' ? (es || fr) : fr);
// Arrondi à deux décimales, avec garde-fou : NaN et Infinity sortent en « — ».
const num = (v) => fmt(Number.isFinite(v) ? Math.round(v * 100) / 100 : v);

const NAVY = '#1e3a5f';
const OK = '#155724';
const KO = '#c0392b';
const LINE = '#dee2e6';     // filets du tableau — légers, pas de grille noire
const TINT = '#f8f9fa';     // fonds de panneau

// Densité : nb total de colonnes de notes au-delà duquel on masque le détail par
// unité (une A4 paysage tient confortablement ~34 colonnes étroites).
const MAX_NOTE_COLS = 34;

// ── En-tête officiel (blocs pays encadrés + logo + agrément + coordonnées) ───
function headerHtml(school, { sys, basic }) {
  const officials = bulletinOfficials(school, { sys, basic });
  const blocks = officials?.blocks ?? [];
  const bilingual = officials?.bilingual && blocks.length > 1;
  const sideW = bilingual ? '34%' : '42%';
  const centerW = bilingual ? '32%' : '58%';

  // Bloc officiel dans un cadre arrondi clair (maquette du PV officiel).
  const block = (b) => (b ? `
    <td style="width:${sideW};padding:0 4px;vertical-align:top">
      <div style="border:1px solid ${LINE};border-radius:6px;background:#fdfdfe;padding:5px 6px;text-align:center;font-size:8.5px;line-height:1.5;">
        <strong style="font-size:9.5px">${esc(b.republic)}</strong><br/>
        <em>${esc(b.motto)}</em><br/>
        <span style="color:#999;letter-spacing:1px">°°°°°°°°°°°°</span><br/>
        <strong>${esc(b.ministry)}</strong>
        ${b.lines.length ? `<br/><span style="color:#999;letter-spacing:1px">°°°°°°°°°°°°</span><br/>${b.lines.map((ln) => esc(ln)).join('<br/>')}` : ''}
      </div>
    </td>` : '');

  const contact = [
    school?.email ? `<strong>${L(sys, 'Email', 'Email', 'Correo')} :</strong> ${esc(school.email)}` : '',
    school?.phone ? `<strong>${L(sys, 'Tél', 'Phone', 'Tel')} :</strong> ${esc(school.phone)}` : '',
    school?.address ? `<strong>${L(sys, 'Adresse', 'Address', 'Dirección')} :</strong> ${esc(school.address)}` : '',
  ].filter(Boolean).join(' &nbsp;|&nbsp; ');

  return `
    <table style="width:100%;border-collapse:collapse">
      <tbody><tr>
        ${block(blocks[0])}
        <td style="width:${centerW};text-align:center;padding:2px;vertical-align:middle">
          ${school?.logo_url ? `<img data-part="logo" src="${esc(school.logo_url)}" alt="" style="width:${Math.round(S.logoSm * 0.75)}px;height:${Math.round(S.logoSm * 0.75)}px;object-fit:contain;display:block;margin:0 auto 3px"/>` : ''}
          <strong style="font-size:13px;display:block;letter-spacing:.3px">${esc((school?.name || '').toUpperCase())}</strong>
          <span style="font-size:8.5px;color:#555">${L(sys, 'Année scolaire', 'Academic year', 'Año escolar')} : <strong>${esc(school?.current_year || '—')}</strong></span>
        </td>
        ${bilingual ? block(blocks[1]) : ''}
      </tr></tbody>
    </table>
    ${school?.establishment_no ? `<div style="text-align:center;font-size:8.5px;font-weight:bold;font-style:italic;color:#c0392b;margin-top:3px;">${L(sys, 'Arrêté N°', 'Order N°', 'Orden N°')} ${esc(school.establishment_no)}</div>` : ''}
    ${contact ? `<div style="text-align:center;font-size:8px;color:#444;margin-top:1px">${contact}</div>` : ''}
    <div style="border-top:2px solid ${NAVY};margin:5px 0 7px;"></div>`;
}

// ── Bandeau d'identification de la classe (panneau à liseré) ─────────────────
function classLineHtml(pv, sys) {
  const cls = pv.cls || {};
  const item = (k, v) => `<span style="margin-right:22px;white-space:nowrap"><strong>${k} :</strong> <span style="color:#555">${esc(v || '—')}</span></span>`;
  const subsystem = sys === 'EN' ? 'Anglophone' : sys === 'ES' ? 'Hispanophone' : 'Francophone';
  return `
    <div class="${CLASS.keep}" style="font-size:9.5px;color:#333;background:${TINT};border-left:4px solid ${NAVY};padding:7px 10px;margin-bottom:7px">
      ${item(L(sys, 'Classe', 'Class', 'Clase'), cls.name)}
      ${item(L(sys, 'Niveau', 'Level', 'Nivel'), cls.level)}
      ${cls.serie ? item(L(sys, 'Série', 'Stream', 'Serie'), String(cls.serie).toUpperCase()) : ''}
      ${item(L(sys, 'Sous-système', 'Sub-system', 'Subsistema'), subsystem)}
      ${item(L(sys, 'Effectif', 'Class size', 'Efectivo'), pv.summary.total)}
      ${item(L(sys, 'Année', 'Year', 'Año'), pv.schoolYear)}
      ${item(L(sys, 'Période', 'Period', 'Periodo'), pv.periodLabel)}
      ${pv.teacherName ? item(L(sys, 'P. principal', 'Form master', 'Tutor'), pv.teacherName) : ''}
    </div>`;
}

// ── Tableau de délibération ──────────────────────────────────────────────────
function tableHtml(pv, sys, { detailed }) {
  // Densité de séance : assez aéré pour se lire à l'œil nu, assez compact pour
  // qu'une classe de 40 tienne en deux pages.
  const cell = `border:1px solid ${LINE};padding:2px 3px;font-size:8.5px;text-align:center;line-height:1.25`;
  // `table-layout:fixed` impose la largeur des colonnes : une décision longue
  // (« Redouble la classe ») déborderait de sa cellule et se ferait rogner au
  // bord du tableau. La coupure de mot n'est autorisée QUE dans cette colonne —
  // surtout pas sur les noms d'élèves, qu'on ne coupe jamais en deux.
  const cellWrap = `${cell};overflow-wrap:anywhere;word-break:break-word`;
  const head = `${cell};background:${NAVY};color:#fff;font-weight:bold;padding:3px 2px`;
  const perSubject = detailed ? pv.units.length + 1 : 1;

  const subjectCols = pv.cols.map((c) => `
    <th colspan="${perSubject}" style="${head};font-size:8.5px">
      ${esc(c.name)}${c.code ? `<br/><span style="font-weight:normal;font-size:6.5px;opacity:.8">(${esc(c.code)})</span>` : ''}
    </th>`).join('');

  const sub = (label) => `<th style="${head};font-size:7.5px;font-weight:600">${label}</th>`;
  const subCols = pv.cols.map(() => (detailed
    ? pv.units.map((u) => sub(esc(u.label))).join('') + sub(L(sys, 'Moy.', 'Avg', 'Prom.'))
    : sub(L(sys, 'Moy.', 'Avg', 'Prom.')))).join('');

  const rows = pv.rows.map((r, i) => {
    const zebra = i % 2 ? `background:${TINT};` : '';
    const cells = pv.cols.map((c) => {
      const d = r.cells[c.key] || {};
      const moyCell = `<td style="${cell};${zebra}font-weight:bold">${num(d.moy)}</td>`;
      if (!detailed) return moyCell;
      return pv.units.map((u) => `<td style="${cell};${zebra}color:#666">${num(d.byUnit?.[u.key])}</td>`).join('') + moyCell;
    }).join('');
    const col = r.decision.passed === false ? KO : r.decision.passed === true ? OK : '#777';
    return `
      <tr>
        <td style="${cell};${zebra}text-align:left;padding-left:6px">
          <strong style="font-size:8.5px">${esc(r.name)}</strong>
          ${r.matricule ? `<br/><span style="color:#888;font-size:7px">${esc(r.matricule)}</span>` : ''}
        </td>
        ${cells}
        <td style="${cell};${zebra}font-weight:bold;font-size:10px">${num(r.avg)}</td>
        <td style="${cellWrap};${zebra}line-height:1.2">
          <span style="color:${col};font-weight:bold;font-size:8px">${esc(r.decision.text)}</span>
          <span style="font-size:8px">· ${esc(r.rankTxt)}</span><br/>
          <span style="font-size:7px;color:#888">${esc(r.mention)}</span>
        </td>
      </tr>`;
  }).join('');

  const span = 3 + pv.cols.length * perSubject; // élèves + matières + moy. gén. + rang
  const empty = `<tr><td colspan="${span}" style="${cell};padding:14px;color:#888">${L(sys, 'Aucun élève dans cette classe.', 'No student in this class.', 'Sin alumnos.')}</td></tr>`;

  // Ligne d'identification DANS l'en-tête : un PV de 40 élèves occupe plusieurs
  // pages, et `<thead>` est réimprimé par le navigateur en tête de chacune. La
  // page 3 d'un procès-verbal reste donc rattachable à sa classe et à sa période.
  const identRow = `
    <tr>
      <th colspan="${span}" style="${cell};background:#eef2f7;color:${NAVY};text-align:left;padding:3px 6px;font-size:8.5px;font-weight:600">
        ${safe(pv.cls?.name, '')} · ${safe(pv.periodLabel, '')} · ${safe(pv.schoolYear, '')}
      </th>
    </tr>`;

  // Largeurs déclarées par <colgroup>. Indispensable avec `table-layout:fixed` :
  // ce mode lit les largeurs de la PREMIÈRE ligne, et notre première ligne est
  // la ligne d'identification (une seule cellule en colspan). Sans colgroup,
  // toutes les colonnes deviendraient égales — noms d'élèves écrasés sur six
  // lignes et colonne « Rang / Mention » rognée.
  const noteCols = pv.cols.length * perSubject;
  const noteW = (100 - 16 - 6 - 13) / Math.max(1, noteCols);
  const colgroup = `
      <colgroup>
        <col style="width:16%"/>
        ${Array.from({ length: noteCols }, () => `<col style="width:${noteW.toFixed(3)}%"/>`).join('')}
        <col style="width:6%"/>
        <col style="width:13%"/>
      </colgroup>`;

  return `
    <table style="width:100%;border-collapse:collapse;table-layout:fixed">
      ${colgroup}
      <thead>
        ${identRow}
        <tr>
          <th rowspan="2" style="${head};text-align:left;padding-left:6px">${L(sys, 'Élèves', 'Students', 'Alumnos')}</th>
          ${subjectCols}
          <th rowspan="2" style="${head}">${L(sys, 'Moy. Gén.', 'Gen. Avg', 'Prom. Gen.')}</th>
          <th rowspan="2" style="${head}">${L(sys, 'Rang / Mention', 'Rank / Remark', 'Puesto / Mención')}</th>
        </tr>
        <tr>${subCols}</tr>
      </thead>
      <tbody>${rows || empty}</tbody>
    </table>`;
}

// ── Résumé de délibération (panneau à liseré) ────────────────────────────────
function summaryHtml(pv, sys) {
  const s = pv.summary;
  const item = (k, v) => `<span style="margin-right:26px;white-space:nowrap"><strong>${k} :</strong> <span style="color:#555">${esc(v)}</span></span>`;
  return `
    <div class="${CLASS.keep}" style="margin-top:8px;background:${TINT};border-left:4px solid ${NAVY};padding:7px 10px;font-size:9.5px">
      <div style="font-weight:bold;font-size:11px;color:${NAVY};margin-bottom:4px">${L(sys, 'Résumé', 'Summary', 'Resumen')}</div>
      ${item(L(sys, 'Total élèves', 'Total students', 'Total alumnos'), s.total)}
      ${item(L(sys, 'Admis', 'Passed', 'Aprobados'), s.admis)}
      ${item(L(sys, 'Ajournés', 'Failed', 'Suspensos'), s.ajournes)}
      ${item(L(sys, 'Taux de réussite', 'Pass rate', 'Tasa de aprobados'), s.rate == null ? '—' : `${s.rate}%`)}
      ${item(L(sys, 'Moyenne de la classe', 'Class average', 'Promedio'), `${num(s.avg)}/${pv.maxScale}`)}
      ${item('[Min – Max]', `${num(s.min)} – ${num(s.max)}`)}
    </div>`;
}

// ── Signatures (trois colonnes sur trait, comme le PV officiel) ──────────────
// Président du jury · Chef d'établissement (visa et cachet) · Professeur
// principal. Au fondamental, les intitulés passent au directeur / à l'enseignant.
function signaturesHtml(school, sys, { basic, teacherName = '' }) {
  const sig = school?.signature_url
    ? `<img data-part="signature" src="${esc(school.signature_url)}" alt="" style="height:${Math.round(S.signatureHeight * 0.75)}px;display:block;margin:0 auto;object-fit:contain;mix-blend-mode:multiply"/>`
    : '';
  const stamp = school?.stamp_url
    ? `<img data-part="stamp" src="${esc(school.stamp_url)}" alt="" style="height:${Math.round(S.stamp * 0.75)}px;display:block;margin:-8px auto 0;object-fit:contain;opacity:.95;mix-blend-mode:multiply"/>`
    : '';

  const head = basic
    ? L(sys, 'Le Directeur / La Directrice', 'The Head Teacher', 'El Director / La Directora')
    : L(sys, "Le Chef d'établissement", 'The Principal', 'El Director');
  const teacher = basic
    ? L(sys, "L'Enseignant(e) titulaire", 'The Class Teacher', 'El Maestro / La Maestra')
    : L(sys, 'Le Professeur Principal', 'The Form Master', 'El Tutor');

  // Titre · espace de signature (images du chef au milieu) · trait · mention.
  const col = (title, hint, inner = '', name = '') => `
    <td style="width:33.33%;padding:0 22px;text-align:center;vertical-align:top">
      <div style="font-weight:bold;font-size:10px;color:#333">${title}</div>
      <div style="height:42px;display:flex;align-items:center;justify-content:center">${inner}</div>
      <div style="border-top:1px solid #555"></div>
      <div style="font-size:8px;color:#777;margin-top:2px">(${hint})</div>
      ${name ? `<div style="font-size:8px;color:#555">${esc(name)}</div>` : ''}
    </td>`;

  return `
    <table class="${CLASS.keep}" data-part="signature-block" style="width:100%;border-collapse:collapse;margin-top:14px">
      <tbody><tr>
        ${col(L(sys, 'Le Président du Jury', 'The Chair of the Board', 'El Presidente del Jurado'), L(sys, 'Signature', 'Signature', 'Firma'))}
        ${col(head, L(sys, 'Visa et Cachet', 'Signature and stamp', 'Visto y sello'), `<div>${sig}${stamp}</div>`, school?.director || '')}
        ${col(teacher, L(sys, 'Signature', 'Signature', 'Firma'), '', teacherName)}
      </tr></tbody>
    </table>`;
}

// ── Feuille complète (A4 paysage) ────────────────────────────────────────────
// `pv` = sortie de buildClassPv ; `school` = identité (surchargée par l'unité).
export function pvSheetHtml(pv, { school, basic = false }) {
  const sys = pv.sys || 'FR';
  const noteCols = pv.cols.length * (pv.units.length + 1);
  const detailed = pv.units.length > 1 && noteCols <= MAX_NOTE_COLS;

  return `
    ${sheetOpen({ school, profile: PROFILE, fontSize: 9, color: '#333' })}
      ${headerHtml(school, { sys, basic })}

      <div class="${CLASS.ink}" data-part="title" style="background:${NAVY};color:#fff;text-align:center;padding:9px 8px;font-weight:bold;font-size:16px;letter-spacing:.6px;border-radius:3px;margin-bottom:7px">
        ${L(sys, 'PROCÈS-VERBAL DE DÉLIBÉRATION', 'DELIBERATION MINUTES', 'ACTA DE DELIBERACIÓN')} — ${safe(pv.periodLabel?.toUpperCase(), '')}
      </div>

      ${classLineHtml(pv, sys)}
      ${tableHtml(pv, sys, { detailed })}
      ${!detailed && pv.units.length > 1 ? `<div style="font-size:7px;color:#888;margin-top:3px;font-style:italic">${L(sys, 'Détail par séquence masqué (trop de matières) — seules les moyennes de matière sont affichées.', 'Per-sequence detail hidden (too many subjects) — subject averages only.', 'Detalle por secuencia oculto — solo promedios.')}</div>` : ''}
      ${summaryHtml(pv, sys)}
      ${signaturesHtml(school, sys, { basic, teacherName: pv.teacherName })}
    ${SHEET_CLOSE}`;
}

// ── Feuille de synthèse « établissement » ────────────────────────────────────
// Récapitule la délibération de TOUTES les classes générées : une ligne par
// classe (effectif, admis, taux, moyenne, meilleur/plus faible). Sert de page de
// garde au PV de l'établissement.
export function pvSchoolSummarySheetHtml(pvs, { school, sys = 'FR', periodLabel, schoolYear, basic = false }) {
  const cell = `border:1px solid ${LINE};padding:4px 6px;font-size:9px;text-align:center;`;
  const head = `${cell};background:${NAVY};color:#fff;font-weight:bold`;

  const totals = pvs.reduce((a, p) => ({
    total: a.total + p.summary.total,
    admis: a.admis + p.summary.admis,
    ajournes: a.ajournes + p.summary.ajournes,
    notes: a.notes + p.summary.notes,
  }), { total: 0, admis: 0, ajournes: 0, notes: 0 });
  const rate = totals.notes ? Math.round((totals.admis / totals.notes) * 100) : null;

  const rows = pvs.map((p, i) => `
    <tr${i % 2 ? ' style="background:#f8f9fa"' : ''}>
      <td style="${cell};text-align:left;font-weight:600">${esc(p.cls?.name || '')}</td>
      <td style="${cell}">${esc(p.cls?.level || '—')}</td>
      <td style="${cell}">${p.summary.total}</td>
      <td style="${cell};color:${OK};font-weight:bold">${p.summary.admis}</td>
      <td style="${cell};color:${KO}">${p.summary.ajournes}</td>
      <td style="${cell};font-weight:bold">${p.summary.rate == null ? '—' : `${p.summary.rate}%`}</td>
      <td style="${cell}">${num(p.summary.avg)}/${p.maxScale}</td>
      <td style="${cell}">${num(p.summary.min)} – ${num(p.summary.max)}</td>
    </tr>`).join('');

  return `
    ${sheetOpen({ school, profile: PROFILE, fontSize: 9, color: '#333' })}
      ${headerHtml(school, { sys, basic })}

      <div class="${CLASS.ink}" data-part="title" style="background:${NAVY};color:#fff;text-align:center;padding:9px 8px;font-weight:bold;font-size:15px;letter-spacing:.5px;border-radius:3px;margin-bottom:7px">
        ${L(sys, 'PROCÈS-VERBAL DE DÉLIBÉRATION — SYNTHÈSE DE L’ÉTABLISSEMENT', 'DELIBERATION MINUTES — SCHOOL SUMMARY', 'ACTA DE DELIBERACIÓN — RESUMEN DEL CENTRO')} — ${esc((periodLabel || '').toUpperCase())}
      </div>

      <div style="font-size:9.5px;color:#333;background:${TINT};border-left:4px solid ${NAVY};padding:7px 10px;margin-bottom:7px;">
        <span style="margin-right:22px"><strong>${L(sys, 'Année', 'Year', 'Año')} :</strong> <span style="color:#555">${esc(schoolYear || school?.current_year || '—')}</span></span>
        <span style="margin-right:22px"><strong>${L(sys, 'Classes délibérées', 'Classes deliberated', 'Clases')} :</strong> <span style="color:#555">${pvs.length}</span></span>
        <span><strong>${L(sys, 'Effectif total', 'Total students', 'Efectivo total')} :</strong> <span style="color:#555">${totals.total}</span></span>
      </div>

      <table style="width:100%;border-collapse:collapse">
        <thead><tr>
          <th style="${head};text-align:left;width:22%">${L(sys, 'Classe', 'Class', 'Clase')}</th>
          <th style="${head};width:12%">${L(sys, 'Niveau', 'Level', 'Nivel')}</th>
          <th style="${head};width:10%">${L(sys, 'Effectif', 'Size', 'Efectivo')}</th>
          <th style="${head};width:10%">${L(sys, 'Admis', 'Passed', 'Aprobados')}</th>
          <th style="${head};width:10%">${L(sys, 'Ajournés', 'Failed', 'Suspensos')}</th>
          <th style="${head};width:12%">${L(sys, 'Taux', 'Rate', 'Tasa')}</th>
          <th style="${head};width:12%">${L(sys, 'Moyenne', 'Average', 'Promedio')}</th>
          <th style="${head};width:12%">[Min – Max]</th>
        </tr></thead>
        <tbody>
          ${rows}
          <tr>
            <td colspan="2" style="${cell};text-align:right;font-weight:bold;background:#e8edf2">${L(sys, 'TOTAL', 'TOTAL', 'TOTAL')}</td>
            <td style="${cell};font-weight:bold;background:#e8edf2">${totals.total}</td>
            <td style="${cell};font-weight:bold;background:#e8edf2;color:${OK}">${totals.admis}</td>
            <td style="${cell};font-weight:bold;background:#e8edf2;color:${KO}">${totals.ajournes}</td>
            <td style="${cell};font-weight:bold;background:#e8edf2">${rate == null ? '—' : `${rate}%`}</td>
            <td colspan="2" style="${cell};background:#e8edf2"></td>
          </tr>
        </tbody>
      </table>

      ${signaturesHtml(school, sys, { basic })}
    ${SHEET_CLOSE}`;
}
