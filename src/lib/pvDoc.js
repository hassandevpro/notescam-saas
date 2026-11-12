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
import { themeOf, dispositionMatieres, abreger, legendeAbreviations } from './documentTheme.js';

// Profil de page du PV : A4 PAYSAGE. Géométrie, marges, couleurs d'impression et
// règles de saut viennent du socle (lib/print) — ce fichier ne décrit que le
// contenu. En particulier : plus une seule déclaration `print-color-adjust`,
// le socle l'applique à toute la feuille.
const PROFILE = 'large';

const S = createDocumentScale({ category: 'standard', orientation: 'landscape', ...pageDimsPx('landscape') });

const L = (sys, fr, en, es) => (sys === 'EN' ? en : sys === 'ES' ? (es || fr) : fr);
// Arrondi à deux décimales, avec garde-fou : NaN et Infinity sortent en « — ».
const num = (v) => fmt(Number.isFinite(v) ? Math.round(v * 100) / 100 : v);

// Couleurs : UN thème central (lib/documentTheme.js), changeable par école. Sobre : filets fins gris, en-têtes
// gris clair, accent unique sur le titre. T est posé au début de chaque feuille (génération synchrone).
let T = themeOf(null);
const OK = '#155724';
const KO = '#c0392b';

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
      <div style="border:1px solid ${T.line};border-radius:2px;background:#fff;padding:5px 6px;text-align:center;font-size:8.5px;line-height:1.5;">
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
    <div style="border-top:1px solid ${T.line};margin:8px 0 10px;"></div>`;
}

// ── Bandeau d'identification de la classe (panneau à liseré) ─────────────────
function classLineHtml(pv, sys) {
  const cls = pv.cls || {};
  const item = (k, v) => `<span style="margin-right:22px;white-space:nowrap"><strong>${k} :</strong> <span style="color:#555">${esc(v || '—')}</span></span>`;
  const subsystem = sys === 'EN' ? 'Anglophone' : sys === 'ES' ? 'Hispanophone' : 'Francophone';
  return `
    <div class="${CLASS.keep}" style="font-size:9.5px;color:${T.text};background:#fff;border:1px solid ${T.line};padding:7px 10px;margin-bottom:10px">
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
// Les matières sont coupées en BANDES au-delà de MATIERES_PAR_BANDE : chaque bande répète la colonne des élèves
// (et la dernière porte Moy. Gén. + Rang), et <thead> se répète sur chaque page imprimée.
function tableHtml(pv, sys, { detailed, lay, school }) {
  const pt = lay.policePt;
  const line = `1px solid ${T.line}`;
  const cell = `border:${line};padding:1.6mm 1mm;font-size:${pt}pt;text-align:center;line-height:1.25;color:${T.text}`;
  // table-layout:fixed impose la largeur des colonnes : la coupure de mot n'est autorisée QUE dans la colonne
  // de décision — surtout pas sur les noms d'élèves, qu'on ne coupe jamais en deux.
  const cellWrap = `${cell};overflow-wrap:anywhere;word-break:break-word`;
  const head = `${cell};background:${T.headerBg};color:${T.text};font-weight:bold;padding:1.6mm 1mm`;
  const perSubject = detailed ? pv.units.length + 1 : 1;
  const nomCourt = (c) => (lay.vertical ? abreger(c.name, school, 18) : c.name);
  const petit = Math.max(7, pt - 1);

  const sub = (label) => `<th style="${head};font-size:${Math.max(7, pt - 0.5)}pt;font-weight:600">${label}</th>`;

  const bande = ([d, f], derniere) => {
    const cols = pv.cols.slice(d, f);
    const subjectCols = cols.map((c) => (lay.vertical
      ? `<th colspan="${perSubject}" style="${head};height:34mm;padding:1.6mm 0.5mm"><div style="writing-mode:vertical-rl;transform:rotate(180deg);margin:0 auto;max-height:32mm;overflow:hidden;text-align:left;line-height:1.15">${esc(nomCourt(c))}</div></th>`
      : `<th colspan="${perSubject}" style="${head};height:12mm;overflow-wrap:anywhere;word-break:break-word;hyphens:auto">${esc(c.name)}${c.code ? `<br/><span style="font-weight:normal;font-size:${petit}pt">(${esc(c.code)})</span>` : ''}</th>`)).join('');
    const subCols = cols.map(() => (detailed
      ? pv.units.map((u) => sub(esc(u.label))).join('') + sub(L(sys, 'Moy.', 'Avg', 'Prom.'))
      : '')).join('');

    const rows = pv.rows.map((r, i) => {
      const zebra = `background:${i % 2 ? T.zebra : '#fff'};`;
      const cells = cols.map((c) => {
        const dd = r.cells[c.key] || {};
        const moyCell = `<td style="${cell};${zebra}font-weight:bold">${num(dd.moy)}</td>`;
        if (!detailed) return moyCell;
        return pv.units.map((u) => `<td style="${cell};${zebra}">${num(dd.byUnit?.[u.key])}</td>`).join('') + moyCell;
      }).join('');
      const tail = derniere ? `
        <td style="${cell};${zebra}font-weight:bold">${num(r.avg)}</td>
        <td style="${cellWrap};${zebra}line-height:1.2">
          <span style="color:${r.decision.passed === false ? KO : r.decision.passed === true ? OK : '#555'};font-weight:bold">${esc(r.decision.text)}</span>
          <span>· ${esc(r.rankTxt)}</span><br/>
          <span style="font-size:${petit}pt;color:#555">${esc(r.mention)}</span>
        </td>` : '';
      return `
      <tr>
        <td style="${cell};${zebra}text-align:left;padding-left:3mm;padding-right:2mm">
          <strong>${esc(r.name)}</strong>
          ${r.matricule ? `<br/><span style="color:#555;font-size:${petit}pt">${esc(r.matricule)}</span>` : ''}
        </td>
        ${cells}${tail}
      </tr>`;
    }).join('');

    const span = 1 + cols.length * perSubject + (derniere ? 2 : 0);
    const empty = `<tr><td colspan="${span}" style="${cell};padding:14px;color:#555">${L(sys, 'Aucun élève dans cette classe.', 'No student in this class.', 'Sin alumnos.')}</td></tr>`;
    const identRow = `
    <tr>
      <th colspan="${span}" style="${cell};background:${T.headerBg};color:${T.text};text-align:left;padding:1.2mm 3mm;font-weight:600">
        ${safe(pv.cls?.name, '')} · ${safe(pv.periodLabel, '')} · ${safe(pv.schoolYear, '')}
      </th>
    </tr>`;

    // Largeurs déclarées par <colgroup> (obligatoire avec table-layout:fixed, qui lit la première ligne).
    const fixe = 19 + (derniere ? 7 + 14 : 0);
    const noteCols = cols.length * perSubject;
    const noteW = (100 - fixe) / Math.max(1, noteCols);
    const colgroup = `
      <colgroup>
        <col style="width:19%"/>
        ${Array.from({ length: noteCols }, () => `<col style="width:${noteW.toFixed(3)}%"/>`).join('')}
        ${derniere ? '<col style="width:7%"/><col style="width:14%"/>' : ''}
      </colgroup>`;

    const rs = detailed ? 2 : 1;
    return `
    <table style="width:100%;border-collapse:collapse;table-layout:fixed;margin-bottom:6mm">
      ${colgroup}
      <thead>
        ${identRow}
        <tr>
          <th rowspan="${rs}" style="${head};text-align:left;padding-left:3mm">${L(sys, 'Élèves', 'Students', 'Alumnos')}</th>
          ${subjectCols}
          ${derniere ? `<th rowspan="${rs}" style="${head}">${L(sys, 'Moy. Gén.', 'Gen. Avg', 'Prom. Gen.')}</th>
          <th rowspan="${rs}" style="${head}">${L(sys, 'Rang / Mention', 'Rank / Remark', 'Puesto / Mención')}</th>` : ''}
        </tr>
        ${detailed ? `<tr>${subCols}</tr>` : ''}
      </thead>
      <tbody>${rows || empty}</tbody>
    </table>`;
  };

  const bandes = lay.bandes;
  const tables = bandes.map((b, i) => bande(b, i === bandes.length - 1)).join('');
  const legende = lay.vertical ? legendeAbreviations(pv.cols.map((c) => c.name), school, 18) : [];
  const legendHtml = legende.length ? `
    <div class="${CLASS.keep}" data-part="legende" style="font-size:${petit}pt;color:${T.text};margin:1mm 0 3mm;line-height:1.5;max-width:100%;overflow-wrap:anywhere">
      <strong>${L(sys, 'Légende', 'Key', 'Leyenda')} :</strong>
      ${/* UNE entrée peut être aussi longue qu'un intitulé de compétence (Genius, CE1 : « Utiliser les concepts… »).
           Avec `white-space:nowrap` elle sortait de la page à droite. Elle reste d'un bloc quand elle tient
           (inline-block), et se replie DANS la largeur quand elle ne tient pas (max-width:100%). */''}
      ${legende.map((l) => `<span style="display:inline-block;max-width:100%;margin-right:3mm;white-space:normal;overflow-wrap:anywhere;vertical-align:top">${esc(l.abrege)} = ${esc(l.complet)}</span>`).join(' ')}
    </div>` : '';
  return tables + legendHtml;
}

// ── Résumé de délibération (panneau à liseré) ────────────────────────────────
function summaryHtml(pv, sys) {
  const s = pv.summary;
  const item = (k, v) => `<span style="margin-right:26px;white-space:nowrap"><strong>${k} :</strong> <span style="color:#555">${esc(v)}</span></span>`;
  return `
    <div class="${CLASS.keep}" style="margin-top:8px;background:#fff;border:1px solid ${T.line};padding:7px 10px;font-size:9.5px;color:${T.text}">
      <div style="font-weight:bold;font-size:11px;color:${T.text};margin-bottom:4px">${L(sys, 'Résumé', 'Summary', 'Resumen')}</div>
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
  T = themeOf(school, { secondaire: !basic });
  const sys = pv.sys || 'FR';
  const lay = dispositionMatieres(pv.cols.length);
  const noteCols = pv.cols.length * (pv.units.length + 1);
  const detailed = pv.units.length > 1 && noteCols <= MAX_NOTE_COLS && !lay.vertical;

  return `
    ${sheetOpen({ school, profile: PROFILE, fontSize: 9, color: '#333' })}
      ${headerHtml(school, { sys, basic })}

      <div class="${CLASS.ink}" data-part="title" style="color:${T.accent};text-align:center;padding:3mm 0 2.5mm;font-weight:bold;font-size:15pt;letter-spacing:.6px;border-bottom:1px solid ${T.accent};margin-bottom:4mm">
        ${L(sys, 'PROCÈS-VERBAL DE DÉLIBÉRATION', 'DELIBERATION MINUTES', 'ACTA DE DELIBERACIÓN')} — ${safe(pv.periodLabel?.toUpperCase(), '')}
      </div>

      ${classLineHtml(pv, sys)}
      ${tableHtml(pv, sys, { detailed, lay, school })}
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
  T = themeOf(school, { secondaire: !basic });
  const cell = `border:1px solid ${T.line};padding:4px 6px;font-size:9px;text-align:center;color:${T.text};`;
  const head = `${cell};background:${T.headerBg};color:${T.text};font-weight:bold`;

  const totals = pvs.reduce((a, p) => ({
    total: a.total + p.summary.total,
    admis: a.admis + p.summary.admis,
    ajournes: a.ajournes + p.summary.ajournes,
    notes: a.notes + p.summary.notes,
  }), { total: 0, admis: 0, ajournes: 0, notes: 0 });
  const rate = totals.notes ? Math.round((totals.admis / totals.notes) * 100) : null;

  const rows = pvs.map((p, i) => `
    <tr${i % 2 ? ` style="background:${T.zebra}"` : ''}>
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

      <div class="${CLASS.ink}" data-part="title" style="color:${T.accent};text-align:center;padding:3mm 0 2.5mm;font-weight:bold;font-size:14pt;letter-spacing:.5px;border-bottom:1px solid ${T.accent};margin-bottom:4mm">
        ${L(sys, 'PROCÈS-VERBAL DE DÉLIBÉRATION — SYNTHÈSE DE L’ÉTABLISSEMENT', 'DELIBERATION MINUTES — SCHOOL SUMMARY', 'ACTA DE DELIBERACIÓN — RESUMEN DEL CENTRO')} — ${esc((periodLabel || '').toUpperCase())}
      </div>

      <div style="font-size:9.5px;color:${T.text};background:#fff;border:1px solid ${T.line};padding:7px 10px;margin-bottom:10px;">
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
            <td colspan="2" style="${cell};text-align:right;font-weight:bold;background:${T.headerBg}">${L(sys, 'TOTAL', 'TOTAL', 'TOTAL')}</td>
            <td style="${cell};font-weight:bold;background:${T.headerBg}">${totals.total}</td>
            <td style="${cell};font-weight:bold;background:${T.headerBg};color:${OK}">${totals.admis}</td>
            <td style="${cell};font-weight:bold;background:${T.headerBg};color:${KO}">${totals.ajournes}</td>
            <td style="${cell};font-weight:bold;background:${T.headerBg}">${rate == null ? '—' : `${rate}%`}</td>
            <td colspan="2" style="${cell};background:${T.headerBg}"></td>
          </tr>
        </tbody>
      </table>

      ${signaturesHtml(school, sys, { basic })}
    ${SHEET_CLOSE}`;
}
