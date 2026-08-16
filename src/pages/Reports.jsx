import { useState, useMemo, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSchoolStore } from '../store/schoolStore';
import { useAuthStore } from '../store/authStore';
import { frApp, enGrade, esGrade } from '../core/bulletinEngine';
import { MAT_ACQUIS, MAT_ACQUIS_COLORS, MAT_ACQUIS_LABELS } from '../core/matEngine';
import { downloadCSV } from '../lib/exportCsv';
import Layout from '../components/Layout';
import { useT } from '../lib/i18n';
import { resolveCountryCode } from '../countries';
import { gradingOpts, geGradeMax } from '../lib/useCountry';
import SectionFilterSelect, { inSection } from '../components/SectionFilterSelect';
import { resolveClassEngine, SECTIONS } from '../core/engineResolver';
import { buildClassReport, REPORT_KIND } from '../lib/classReportEngine';
import { fetchVieScolaireSnapshot } from '../lib/vieScolaireService';

const PERIODS_EN = [
  { value: 'term_1', label: 'Term 1', seqs: [1], group: 'terms' },
  { value: 'term_2', label: 'Term 2', seqs: [2], group: 'terms' },
  { value: 'term_3', label: 'Term 3', seqs: [3], group: 'terms' },
  { value: 'annual', label: 'Annual', seqs: [1, 2, 3], group: 'annual' },
];

// Guinea Ecuatorial — tres trimestres oficiales + anual, notas /10.
const PERIODS_GE = [
  { value: 'trim_1', label: 'Primer Trimestre',  seqs: [1], group: 'terms' },
  { value: 'trim_2', label: 'Segundo Trimestre', seqs: [2], group: 'terms' },
  { value: 'trim_3', label: 'Tercer Trimestre',  seqs: [3], group: 'terms' },
  { value: 'anual',  label: 'Anual',             seqs: [1, 2, 3], group: 'annual' },
];

// Appréciation littérale d'une moyenne. Les moteurs officiels (APC collège,
// primaire MINEDUB) dérivent la leur d'une COTE : elle arrive déjà calculée dans
// `row.cote` / `row.appreciation`, on n'y superpose pas le barème historique.
function apprFor(row, sys, maxScale) {
  if (row.avg === null || row.avg === undefined) return null;
  if (row.cote) return { text: row.appreciation || row.cote, g: row.cote, col: null };
  return sys === 'ES' ? esGrade(row.avg, maxScale) : sys === 'FR' ? frApp(row.avg) : enGrade(row.avg);
}

// ── Impression dans une nouvelle fenêtre (propre, sans sidebar) ───────────────
// cols : { matricule, appreciation, decision, subjectTable, distribution }
function reportBodyHtml({ school, selectedClass, period, stats, studentResults, subjectStats,
                       classStudents, classSubjects = [], maxScale, passThreshold, sys, cols = {}, isGE = false }) {
  const {
    matricule     = true,
    appreciation  = true,
    decision      = true,
    subjectTable  = true,
    subjectScores = true,
    distribution  = false,
  } = cols;

  // Étiquettes du document : espagnol pour la Guinée Équatoriale, français sinon.
  const Lp = (fr, es) => (isGE ? es : fr);

  const today = new Date().toLocaleDateString(isGE ? 'es-ES' : 'fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  const passRateGlobal = stats?.above != null && stats?.total
    ? Math.round((stats.above / stats.total) * 100) : null;

  // Build rank table header
  const thMatricule    = matricule    ? `<th style="width:90px">${Lp('Matricule', 'Matrícula')}</th>` : '';
  const thAppreciation = appreciation ? `<th style="width:80px">${Lp('Appréciation', 'Apreciación')}</th>` : '';
  const thDecision     = decision     ? `<th style="width:85px">${Lp('Décision', 'Decisión')}</th>` : '';
  // Une colonne par matière — note de chaque élève, pas seulement sa moyenne
  // générale (façon PV/relevé de classe papier).
  const thSubjects = subjectScores
    ? classSubjects.map((sub) => `<th style="width:32px;font-size:7px;line-height:1.2">${sub.name}<br/>/${sub.max}</th>`).join('')
    : '';

  const rankRows = studentResults.map(({ student, avg, rank, appr, scores = {} }) => {
    const passed = avg !== null && avg >= passThreshold;
    const avgColor = avg !== null ? (passed ? '#059669' : '#ef4444') : '#9ca3af';
    const tdMatricule    = matricule    ? `<td style="text-align:center;font-family:monospace;color:#6b7280">${student.matricule || '—'}</td>` : '';
    const tdAppreciation = appreciation ? `<td style="text-align:center;color:#374151">${sys === 'EN' ? (appr ? appr.g : '—') : (appr?.text || '—')}</td>` : '';
    const tdDecision     = decision     ? `<td style="text-align:center;font-weight:700;color:${passed ? '#059669' : '#dc2626'}">${passed ? Lp('Admis(e)', 'Aprobado') : Lp('Ajourné(e)', 'Suspenso')}</td>` : '';
    const tdSubjects     = subjectScores
      ? classSubjects.map((sub) => `<td style="text-align:center;font-size:8.5px;color:#374151">${scores[sub.id] ?? '—'}</td>`).join('')
      : '';
    return `<tr>
      <td style="text-align:center;font-weight:700">${rank?.rankD ? rank.rankN : '—'}</td>
      <td style="font-weight:600">${student.name}</td>
      ${tdMatricule}
      ${tdSubjects}
      <td style="text-align:center;font-weight:800;color:${avgColor}">${avg ?? '—'}</td>
      ${tdAppreciation}
      ${tdDecision}
    </tr>`;
  }).join('');

  const subRows = subjectStats.map(({ sub, avg, min, max, passCount, total }) => {
    const passRate = total ? Math.round((passCount / total) * 100) : null;
    const pass = sub.max ? (passThreshold / maxScale) * sub.max : passThreshold;
    const avgOk = avg !== null && avg >= pass;
    return `<tr>
      <td><strong>${sub.name}</strong> <span style="color:#9ca3af;font-size:10px">/${sub.max}</span></td>
      <td style="text-align:center">${sub.coef}</td>
      <td style="text-align:center;font-weight:700;color:${avg !== null ? (avgOk ? '#059669' : '#ef4444') : '#9ca3af'}">${avg ?? '—'}</td>
      <td style="text-align:center;color:#6b7280">${min ?? '—'}</td>
      <td style="text-align:center;color:#6b7280">${max ?? '—'}</td>
      <td style="text-align:center">${total ? `${passCount}/${total}` : '—'}</td>
      <td style="text-align:center;font-weight:700;color:${passRate !== null ? (passRate >= 50 ? '#059669' : '#ef4444') : '#9ca3af'}">${passRate !== null ? passRate + '%' : '—'}</td>
    </tr>`;
  }).join('');

  const logoTag = school?.logo_url
    ? `<img src="${school.logo_url}" alt="Logo" class="rc-logo" />`
    : '';

  const body = `<div class="page">
  <table class="rc-head"><tbody><tr>
    <td class="rc-side">${isGE
      ? `<strong>REPÚBLICA DE GUINEA ECUATORIAL</strong><br/>Unidad – Paz – Justicia<br/>———————<br/>Ministerio de Educación<br/>y Enseñanza Universitaria<br/>${school?.region || '—'}`
      : `<strong>RÉPUBLIQUE DU CAMEROUN</strong><br/>Paix – Travail – Patrie<br/>———————<br/>Ministère des Enseignements Secondaires (MINESEC)<br/>Délégation Régionale ${school?.region || '—'}<br/>Délégation Départementale ${school?.division || '—'}`}</td>
    <td class="rc-center">
      ${logoTag}
      <strong class="rc-school">${(school?.name || Lp('Établissement', 'Centro educativo')).toUpperCase()}</strong>
      ${(school?.address || school?.phone) ? `<span class="rc-meta">${school?.address ? (isGE ? 'Apdo. ' : 'B.P. ') + school.address : ''}${school?.address && school?.phone ? ' · ' : ''}${school?.phone || ''}</span><br/>` : ''}
      <span class="rc-meta">${Lp('Année scolaire', 'Año escolar')} : <strong>${school?.current_year || '—'}</strong></span>
    </td>
    <td class="rc-side">${isGE
      ? `<strong>MINISTERIO DE EDUCACIÓN</strong><br/>Y Enseñanza Universitaria<br/>———————<br/>Dirección Provincial<br/>${school?.region || '—'}`
      : `<strong>REPUBLIC OF CAMEROON</strong><br/>Peace – Work – Fatherland<br/>———————<br/>Ministry of Secondary Education (MINESEC)<br/>Regional Delegation ${school?.region || '—'}<br/>Divisional Delegation ${school?.division || '—'}`}</td>
  </tr></tbody></table>

  <div class="title-bar">${Lp('RAPPORT DE RÉSULTATS', 'INFORME DE RESULTADOS')} — ${(selectedClass?.name || '').toUpperCase()} — ${period.label.toUpperCase()}</div>

  <table class="doc-info"><tbody><tr>
    <td><strong>${Lp('Classe', 'Curso')} :</strong> ${selectedClass?.name || '—'}</td>
    <td><strong>${Lp('Période', 'Período')} :</strong> ${period.label}</td>
    <td><strong>${Lp('Effectif', 'Efectivo')} :</strong> ${stats?.total ?? classStudents.length}</td>
    <td><strong>${Lp('Date', 'Fecha')} :</strong> ${today}</td>
  </tr></tbody></table>

  <div class="stats">
    <div class="stat">
      <div class="stat-val">${stats?.total ?? classStudents.length}</div>
      <div class="stat-lbl">${Lp('Effectif', 'Efectivo')}</div>
    </div>
    <div class="stat">
      <div class="stat-val" style="color:#1e3a5f">${stats?.avg != null ? stats.avg : '—'}<span style="font-size:12px;font-weight:400;color:#9ca3af">/${maxScale}</span></div>
      <div class="stat-lbl">${Lp('Moyenne classe', 'Media de la clase')}</div>
    </div>
    <div class="stat">
      <div class="stat-val" style="color:${passRateGlobal !== null ? (passRateGlobal >= 50 ? '#059669' : '#ef4444') : '#9ca3af'}">${passRateGlobal !== null ? passRateGlobal + '%' : '—'}</div>
      <div class="stat-lbl">${Lp('Taux de réussite', 'Tasa de aprobados')}</div>
    </div>
    <div class="stat">
      <div class="stat-val">${stats?.above ?? '—'}<span style="font-size:12px;font-weight:400;color:#9ca3af"> / ${stats?.total ?? ''}</span></div>
      <div class="stat-lbl">${Lp('Admis', 'Aprobados')}</div>
    </div>
  </div>

  <h3>${Lp('Classement des élèves', 'Clasificación de los alumnos')}</h3>
  <table>
    <thead><tr>
      <th style="width:36px">${Lp('Rang', 'Puesto')}</th>
      <th>${Lp('Nom complet', 'Apellidos y nombre')}</th>
      ${thMatricule}
      ${thSubjects}
      <th style="width:75px">${Lp('Moy.', 'Media')} /${maxScale}</th>
      ${thAppreciation}
      ${thDecision}
    </tr></thead>
    <tbody>${rankRows}</tbody>
  </table>

  ${subjectTable ? `
  <h3>${Lp('Résultats par matière', 'Resultados por asignatura')}</h3>
  <table>
    <thead><tr>
      <th>${Lp('Matière', 'Asignatura')}</th>
      <th style="width:38px">${Lp('Coef', 'Coef')}</th>
      <th style="width:70px">${Lp('Moy. classe', 'Media clase')}</th>
      <th style="width:44px">Min</th>
      <th style="width:44px">Max</th>
      <th style="width:58px">${Lp('Admis', 'Aprob.')}</th>
      <th style="width:55px">${Lp('Taux', 'Tasa')}</th>
    </tr></thead>
    <tbody>${subRows}</tbody>
  </table>` : ''}

  <table class="foot"><tbody><tr>
    <td style="border:none;width:55%"></td>
    <td class="foot-head" style="width:45%">
      ${Lp('Le Proviseur / Directeur', 'El Director / La Directora')}
      ${school?.signature_url ? `<img src="${school.signature_url}" alt="Signature" />` : ''}
      ${school?.stamp_url ? `<img src="${school.stamp_url}" alt="Cachet" />` : ''}
    </td>
  </tr></tbody></table>

  <div class="notice">${Lp(
    "Ce rapport n'est valable qu'avec la signature et le cachet du chef d'établissement.",
    'Este informe solo es válido con la firma y el sello del director del centro.'
  )}</div>
</div>`;

  return body;
}

// ── Corps imprimé du rapport MATERNELLE (MINEDUB) ────────────────────────────
// Le préscolaire n'a ni note, ni moyenne, ni rang : le document officiel rend
// compte de l'ACQUISITION (A / ECA / NA) par domaine, jamais d'un classement.
function acquisitionBodyHtml({ school, selectedClass, period, report, classStudents }) {
  const today = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  const { columns, rows, columnStats, classStats } = report;
  const pct = (n) => (classStats.rated ? Math.round((n / classStats.rated) * 100) : 0);

  const thDomaines = columns.map((c) =>
    `<th style="width:34px;font-size:7px;line-height:1.2">${c.name}</th>`).join('');

  const bodyRows = rows.map((r) => `<tr>
      <td style="font-weight:600">${r.student.name}</td>
      ${columns.map((c) => {
        const lvl = r.cotes[c.id];
        return `<td style="text-align:center;font-weight:700;color:${lvl ? MAT_ACQUIS_COLORS[lvl] : '#9ca3af'}">${lvl || '—'}</td>`;
      }).join('')}
      <td style="text-align:center;font-weight:800;color:${r.cote ? MAT_ACQUIS_COLORS[r.cote] : '#9ca3af'}">${r.cote || '—'}</td>
    </tr>`).join('');

  const domRows = columnStats.map(({ col, counts, rated, total }) => `<tr>
      <td><strong>${col.name}</strong></td>
      ${MAT_ACQUIS.map((a) => `<td style="text-align:center;color:${a.col};font-weight:700">${counts[a.code] || '—'}</td>`).join('')}
      <td style="text-align:center;color:#6b7280">${rated}/${total}</td>
    </tr>`).join('');

  const logoTag = school?.logo_url ? `<img src="${school.logo_url}" alt="Logo" class="rc-logo" />` : '';

  return `<div class="page">
  <table class="rc-head"><tbody><tr>
    <td class="rc-side"><strong>RÉPUBLIQUE DU CAMEROUN</strong><br/>Paix – Travail – Patrie<br/>———————<br/>Ministère de l'Éducation de Base (MINEDUB)<br/>Délégation Régionale ${school?.region || '—'}<br/>Délégation Départementale ${school?.division || '—'}</td>
    <td class="rc-center">
      ${logoTag}
      <strong class="rc-school">${(school?.name || 'Établissement').toUpperCase()}</strong>
      <span class="rc-meta">Année scolaire : <strong>${school?.current_year || '—'}</strong></span>
    </td>
    <td class="rc-side"><strong>REPUBLIC OF CAMEROON</strong><br/>Peace – Work – Fatherland<br/>———————<br/>Ministry of Basic Education (MINEDUB)<br/>Regional Delegation ${school?.region || '—'}<br/>Divisional Delegation ${school?.division || '—'}</td>
  </tr></tbody></table>

  <div class="title-bar">RAPPORT D'ACQUISITION — ${(selectedClass?.name || '').toUpperCase()} — ${period.label.toUpperCase()}</div>

  <table class="doc-info"><tbody><tr>
    <td><strong>Classe :</strong> ${selectedClass?.name || '—'}</td>
    <td><strong>Période :</strong> ${period.label}</td>
    <td><strong>Effectif :</strong> ${classStudents.length}</td>
    <td><strong>Date :</strong> ${today}</td>
  </tr></tbody></table>

  <div class="stats">
    <div class="stat"><div class="stat-val">${classStudents.length}</div><div class="stat-lbl">Effectif</div></div>
    ${MAT_ACQUIS.map((a) => `<div class="stat">
      <div class="stat-val" style="color:${a.col}">${classStats.counts[a.code]}<span style="font-size:12px;font-weight:400;color:#9ca3af"> · ${pct(classStats.counts[a.code])}%</span></div>
      <div class="stat-lbl">${a.libelle}</div>
    </div>`).join('')}
  </div>

  <h3>Niveaux d'acquisition par élève</h3>
  <table>
    <thead><tr>
      <th>Nom complet</th>
      ${thDomaines}
      <th style="width:60px">Tendance</th>
    </tr></thead>
    <tbody>${bodyRows}</tbody>
  </table>

  <h3>Synthèse par domaine</h3>
  <table>
    <thead><tr>
      <th>Domaine</th>
      ${MAT_ACQUIS.map((a) => `<th style="width:70px">${a.code}</th>`).join('')}
      <th style="width:80px">Évalués</th>
    </tr></thead>
    <tbody>${domRows}</tbody>
  </table>

  <table class="foot"><tbody><tr>
    <td style="border:none;width:55%"></td>
    <td class="foot-head" style="width:45%">
      Le Directeur / La Directrice
      ${school?.signature_url ? `<img src="${school.signature_url}" alt="Signature" />` : ''}
      ${school?.stamp_url ? `<img src="${school.stamp_url}" alt="Cachet" />` : ''}
    </td>
  </tr></tbody></table>

  <div class="notice">A : Acquis · ECA : En cours d'acquisition · NA : Non acquis. Le préscolaire n'établit ni moyenne, ni classement.</div>
</div>`;
}

// Enveloppe HTML commune (styles) : un ou plusieurs corps de rapport concaténés,
// chaque classe sur sa propre page (`.page + .page` → saut de page).
function reportDocShell({ isGE, title, bodies, landscape = false }) {
  return `<!DOCTYPE html>
<html lang="${isGE ? 'es' : 'fr'}">
<head>
  <meta charset="UTF-8"/>
  <title>${title}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Arial,sans-serif;font-size:11px;color:#000;background:#fff}
    .page{padding:8px}
    .page + .page{page-break-before:always}
    /* ── En-tête République (3 colonnes), façon bulletin APC ── */
    .rc-head{width:100%;border-collapse:collapse;margin-bottom:5px}
    .rc-head td{padding:2px;vertical-align:top;text-align:center}
    .rc-side{width:33%;font-size:9px;line-height:1.5}
    .rc-center{width:34%}
    .rc-logo{width:64px;height:64px;object-fit:contain;display:block;margin:0 auto 3px}
    .rc-school{font-size:12px;font-weight:bold;display:block}
    .rc-meta{font-size:8.5px}
    /* ── Barre titre ── */
    .title-bar{background:#1e3a5f;color:#fff;text-align:center;padding:5px 8px;font-weight:bold;font-size:12px;letter-spacing:.5px;margin-bottom:5px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    /* ── Ligne info ── */
    .doc-info{width:100%;border-collapse:collapse;margin-bottom:8px}
    .doc-info td{border:1px solid #374151;padding:3px 6px;font-size:9.5px;background:#f8fafc;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    /* ── Stats ── */
    .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:10px}
    .stat{border:1px solid #374151;padding:7px 6px;text-align:center}
    .stat-val{font-size:18px;font-weight:800}
    .stat-lbl{font-size:9px;color:#374151;margin-top:2px;font-weight:600;text-transform:uppercase;letter-spacing:.03em}
    /* ── Sections + tableaux ── */
    h3{font-size:10.5px;font-weight:bold;text-transform:uppercase;letter-spacing:.04em;background:#1e3a5f;color:#fff;padding:3px 8px;margin:10px 0 0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    table{width:100%;border-collapse:collapse;font-size:10px;margin-bottom:6px}
    thead th{background:#1e3a5f;color:#fff;border:1px solid #374151;padding:4px 6px;text-align:center;font-size:9px;text-transform:uppercase;letter-spacing:.03em;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    tbody td{border:1px solid #374151;padding:3px 6px}
    tbody tr:nth-child(even) td{background:#f4f6f9;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    /* ── Pied signatures bordées ── */
    .foot{width:100%;border-collapse:collapse;margin-top:16px}
    .foot td{border:1px solid #374151;width:33.33%;text-align:center;font-size:9px;font-weight:bold;height:62px;vertical-align:bottom;padding:4px 4px 6px}
    .foot td.foot-head{vertical-align:top;padding-top:5px}
    .foot td.foot-head img{height:34px;display:block;margin:2px auto;object-fit:contain;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .notice{font-size:7.5px;color:#9ca3af;text-align:center;font-style:italic;margin-top:6px}
    @media print{
      @page{margin:10mm;size:A4 ${landscape ? 'landscape' : 'portrait'}}
      body{padding:0}
      .page{padding:0}
    }
  </style>
</head>
<body>
${bodies.join('\n')}
</body>
</html>`;
}

function openPrintWindow(html) {
  const win = window.open('', '_blank', 'width=960,height=720');
  win.document.open();
  win.document.write(html);
  win.document.close();
  setTimeout(() => { win.focus(); win.print(); }, 400);
}

// Impression d'UN rapport de classe (enveloppe + un seul corps).
// Le corps du document dépend du TYPE de rapport : moyennes et classement pour
// tout ce qui note, niveaux d'acquisition pour la maternelle.
const bodyHtmlFor = (args) =>
  (args.kind === REPORT_KIND.ACQUISITION ? acquisitionBodyHtml(args) : reportBodyHtml(args));

function printReport(args) {
  const title = `${args.isGE ? 'Informe' : 'Rapport'} — ${args.selectedClass?.name || ''} — ${args.period?.label || ''}`;
  const landscape = args.kind === REPORT_KIND.ACQUISITION
    ? (args.classSubjects?.length || 0) > 6
    : args.cols?.subjectScores !== false && (args.classSubjects?.length || 0) > 6;
  openPrintWindow(reportDocShell({ isGE: args.isGE, title, bodies: [bodyHtmlFor(args)], landscape }));
}

// Calcule le payload de rapport d'UNE classe pour une période, QUEL QUE SOIT son
// moteur de bulletin (classique, lycée, collège APC, primaire MINEDUB,
// maternelle). Le calcul lui-même vit dans `lib/classReportEngine` (pur, testé) ;
// ici on ne fait que l'adapter à la forme attendue par l'écran et l'impression.
//
// Renvoie null si la classe n'a rien d'exploitable (aucun élève, aucune colonne,
// ou référentiel officiel pas encore chargé).
function computeClassReport(cls, period, ctx) {
  const { school, students, subjects } = ctx;
  const sys   = cls?.system || 'FR';
  const isGE  = resolveCountryCode(school) === 'guinea_eq';
  const gOpts = gradingOpts(school, cls?.cycle);
  const engine = resolveClassEngine(school, cls);

  const classSubjects = subjects.filter((s) => s.class_id === cls.id)
    .sort((a, b) => b.coef - a.coef || a.name.localeCompare(b.name));
  const classStudents = students.filter((s) => s.class_id === cls.id)
    .sort((a, b) => a.name.localeCompare(b.name));
  if (!classStudents.length) return null;

  const report = buildClassReport({
    engine, cls, students: classStudents, subjects: classSubjects, period,
    gradeMap:        ctx.gradeMap,
    apcNotes:        ctx.apcNotes,
    apcReferentiel:  ctx.apcReferentiel,
    primNotes:       ctx.primNotes,
    primReferentiel: ctx.primReferentiel,
    matObservations: ctx.matObservations,
    sys, gOpts,
    scaleMax:      isGE ? geGradeMax(school) : sys === 'FR' ? 20 : 100,
    passThreshold: isGE ? geGradeMax(school) / 2 : sys === 'FR' ? 10 : 50,
    gradeScale:    school?.grade_scale,
  });
  if (!report.ready || !report.columns.length) {
    return { engine, report, classStudents, classSubjects, isGE, sys, notReady: true };
  }

  const maxScale      = report.scaleMax;
  const passThreshold = report.passThreshold;

  // Forme historique consommée par l'écran et le document imprimé. Les colonnes
  // d'un moteur officiel (matières APC, compétences MINEDUB) y prennent la place
  // des matières : mêmes clés (`id`, `name`, `coef`, `max`), même rendu.
  const studentResults = report.rows
    .map((r) => ({ ...r, appr: apprFor(r, sys, maxScale) }))
    .sort((a, b) => (a.avg === null && b.avg === null) ? 0 : a.avg === null ? 1 : b.avg === null ? -1 : b.avg - a.avg);
  const subjectStats = report.columnStats.map(({ col, ...rest }) => ({ sub: col, ...rest }));

  return {
    engine, report, notReady: false,
    kind: report.kind,
    stats: report.classStats, studentResults, subjectStats,
    classStudents, classSubjects: report.columns,
    distribution: report.distribution,
    maxScale, passThreshold, sys, isGE,
  };
}

// Impression EN LOT : un rapport par classe (période courante), une page chacun.
// Ignore les classes sans données. Renvoie le nombre de classes imprimées.
function printReportsBatch({ title, classesToPrint, period, cols, ctx }) {
  const isGE = resolveCountryCode(ctx.school) === 'guinea_eq';
  let maxSubjects = 0;
  const bodies = classesToPrint
    .map((cls) => {
      const rep = computeClassReport(cls, period, ctx);
      // Classe sans élève, ou dont le référentiel officiel n'est pas chargé : on
      // la saute plutôt que d'imprimer une page de tirets.
      if (!rep || rep.notReady) return null;
      maxSubjects = Math.max(maxSubjects, rep.classSubjects?.length || 0);
      return bodyHtmlFor({ school: ctx.school, selectedClass: cls, period, cols, ...rep });
    })
    .filter(Boolean);
  if (!bodies.length) return 0;
  const landscape = cols?.subjectScores !== false && maxSubjects > 6;
  openPrintWindow(reportDocShell({ isGE, title, bodies, landscape }));
  return bodies.length;
}

// ── Onglet DISCIPLINE — rapport Vie scolaire (surveillant), périodisé ─────────
// Un enregistrement (incident/sanction/retard) est rattaché à la période si sa
// séquence est dans `period.seqs`. Les enregistrements SANS séquence (saisies
// avant l'ajout de ce champ) ne sont comptés qu'en vue Annuel — jamais
// silencieusement ignorés — et signalés par `unclassifiedCount` sinon.
function isAnnualPeriodValue(value) { return value === 'annual' || value === 'anual'; }

function computeClassDiscipline(cls, period, { students, vsData }) {
  const classId = cls.id;
  const classStudents = students.filter((s) => s.class_id === classId)
    .sort((a, b) => a.name.localeCompare(b.name));
  const annual = isAnnualPeriodValue(period.value);
  const inPeriod = (r) => (r.sequence_order == null ? annual : period.seqs.includes(r.sequence_order));

  const byClass = (list) => list.filter((r) => r.class_id === classId);
  const incidentsAll = byClass(vsData.incidents);
  const actionsAll   = byClass(vsData.actions);
  const lateAll      = byClass(vsData.lateArrivals);

  const rows = classStudents.map((student) => {
    const incidents = incidentsAll.filter((r) => r.student_id === student.id && inPeriod(r));
    const sanctions = actionsAll.filter((r) => r.student_id === student.id && inPeriod(r));
    const lateArrivals = lateAll.filter((r) => r.student_id === student.id && inPeriod(r));
    const exclusionDays = sanctions
      .filter((a) => a.action_type === 'exclusion_temporaire' || a.action_type === 'exclusion_definitive')
      .reduce((sum, a) => sum + (parseInt(a.duration_days, 10) || 1), 0);
    return { student, incidents, sanctions, lateArrivals, exclusionDays };
  });

  const totals = rows.reduce((acc, r) => ({
    incidents:     acc.incidents + r.incidents.length,
    sanctions:     acc.sanctions + r.sanctions.length,
    lateArrivals:  acc.lateArrivals + r.lateArrivals.length,
    exclusionDays: acc.exclusionDays + r.exclusionDays,
  }), { incidents: 0, sanctions: 0, lateArrivals: 0, exclusionDays: 0 });

  const unclassifiedCount = annual ? 0 :
    [...incidentsAll, ...actionsAll, ...lateAll].filter((r) => r.sequence_order == null).length;

  if (!classStudents.length) return null;
  return { classStudents, rows, totals, unclassifiedCount };
}

function disciplineReportBodyHtml({ school, selectedClass, period, isGE, rows, totals, unclassifiedCount }) {
  const Lp = (fr, es) => (isGE ? es : fr);
  const today = new Date().toLocaleDateString(isGE ? 'es-ES' : 'fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  const logoTag = school?.logo_url ? `<img src="${school.logo_url}" alt="Logo" class="rc-logo" />` : '';

  const studentRows = rows.map(({ student, incidents, sanctions, lateArrivals, exclusionDays }) => `<tr>
      <td style="font-weight:600">${student.name}</td>
      <td style="text-align:center">${incidents.length || '—'}</td>
      <td style="text-align:center">${sanctions.length || '—'}</td>
      <td style="text-align:center">${lateArrivals.length || '—'}</td>
      <td style="text-align:center;font-weight:${exclusionDays ? 700 : 400};color:${exclusionDays ? '#dc2626' : '#9ca3af'}">${exclusionDays || '—'}</td>
    </tr>`).join('');

  return `<div class="page">
  <table class="rc-head"><tbody><tr>
    <td class="rc-center" colspan="3">
      ${logoTag}
      <strong class="rc-school">${(school?.name || Lp('Établissement', 'Centro educativo')).toUpperCase()}</strong>
      <br/><span class="rc-meta">${Lp('Année scolaire', 'Año escolar')} : <strong>${school?.current_year || '—'}</strong></span>
    </td>
  </tr></tbody></table>

  <div class="title-bar">${Lp('RAPPORT DE DISCIPLINE', 'INFORME DE DISCIPLINA')} — ${(selectedClass?.name || '').toUpperCase()} — ${period.label.toUpperCase()}</div>

  <table class="doc-info"><tbody><tr>
    <td><strong>${Lp('Classe', 'Curso')} :</strong> ${selectedClass?.name || '—'}</td>
    <td><strong>${Lp('Période', 'Período')} :</strong> ${period.label}</td>
    <td><strong>${Lp('Effectif', 'Efectivo')} :</strong> ${rows.length}</td>
    <td><strong>${Lp('Date', 'Fecha')} :</strong> ${today}</td>
  </tr></tbody></table>

  <div class="stats">
    <div class="stat"><div class="stat-val">${totals.incidents}</div><div class="stat-lbl">${Lp('Incidents', 'Incidentes')}</div></div>
    <div class="stat"><div class="stat-val">${totals.sanctions}</div><div class="stat-lbl">${Lp('Sanctions', 'Sanciones')}</div></div>
    <div class="stat"><div class="stat-val">${totals.lateArrivals}</div><div class="stat-lbl">${Lp('Retards', 'Retrasos')}</div></div>
    <div class="stat"><div class="stat-val">${totals.exclusionDays}</div><div class="stat-lbl">${Lp('Jours d’exclusion', 'Días de expulsión')}</div></div>
  </div>

  <h3>${Lp('Détail par élève', 'Detalle por alumno')}</h3>
  <table>
    <thead><tr>
      <th>${Lp('Nom complet', 'Apellidos y nombre')}</th>
      <th style="width:75px">${Lp('Incidents', 'Incidentes')}</th>
      <th style="width:75px">${Lp('Sanctions', 'Sanciones')}</th>
      <th style="width:75px">${Lp('Retards', 'Retrasos')}</th>
      <th style="width:90px">${Lp('Jours excl.', 'Días exp.')}</th>
    </tr></thead>
    <tbody>${studentRows}</tbody>
  </table>

  ${unclassifiedCount ? `<p class="notice" style="font-style:normal;color:#b45309">${Lp(
    `${unclassifiedCount} enregistrement(s) sans séquence renseignée — exclus de cette vue périodisée (visibles en Annuel).`,
    `${unclassifiedCount} registro(s) sin secuencia indicada — excluidos de esta vista (visibles en Anual).`
  )}</p>` : ''}

  <table class="foot"><tbody><tr>
    <td style="border:none;width:55%"></td>
    <td class="foot-head" style="width:45%">
      ${Lp('Le Surveillant Général', 'El Jefe de Disciplina')}
      ${school?.signature_url ? `<img src="${school.signature_url}" alt="Signature" />` : ''}
      ${school?.stamp_url ? `<img src="${school.stamp_url}" alt="Cachet" />` : ''}
    </td>
  </tr></tbody></table>
</div>`;
}

function printDisciplineReport({ school, selectedClass, period, isGE, rows, totals, unclassifiedCount }) {
  const title = `${isGE ? 'Informe' : 'Rapport'} — ${selectedClass?.name || ''} — ${period?.label || ''}`;
  openPrintWindow(reportDocShell({
    isGE, title,
    bodies: [disciplineReportBodyHtml({ school, selectedClass, period, isGE, rows, totals, unclassifiedCount })],
  }));
}

function printDisciplineBatch({ title, classesToPrint, period, vsData, students, school }) {
  const isGE = resolveCountryCode(school) === 'guinea_eq';
  const bodies = classesToPrint
    .map((cls) => {
      const rep = computeClassDiscipline(cls, period, { students, vsData });
      if (!rep) return null;
      return disciplineReportBodyHtml({ school, selectedClass: cls, period, isGE, ...rep });
    })
    .filter(Boolean);
  if (!bodies.length) return 0;
  openPrintWindow(reportDocShell({ isGE, title, bodies }));
  return bodies.length;
}

// ── Stat badge ────────────────────────────────────────────────────────────────
function StatBadge({ value, total, label, accent = 'brand' }) {
  const colors = {
    brand:  { bg: 'bg-brand-50',   text: 'text-brand-700',   border: 'border-brand-100' },
    green:  { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-100' },
    red:    { bg: 'bg-red-50',     text: 'text-red-600',     border: 'border-red-100' },
    purple: { bg: 'bg-purple-50',  text: 'text-purple-700',  border: 'border-purple-100' },
  };
  const c = colors[accent] || colors.brand;
  return (
    <div className={`rounded-xl border p-5 text-center ${c.bg} ${c.border}`}>
      <div className={`text-2xl font-bold ${c.text}`}>
        {value ?? '—'}
        {total !== undefined && <span className="text-sm font-normal text-gray-400 ml-0.5">/{total}</span>}
      </div>
      <div className="text-xs text-gray-500 mt-1 font-semibold uppercase tracking-wide">{label}</div>
    </div>
  );
}

// ── Sélecteur de période en pills groupés ─────────────────────────────────────
function PeriodPills({ periodKey, setPeriodKey, periodsForClass, isEN, isGE, isFund }) {
  const t = useT();
  // Fondamental (maternelle / primaire) : 3 trimestres + Annuel, sans séquences.
  if (isFund) {
    const terms  = periodsForClass.filter((p) => p.group === 'terms');
    const annual = periodsForClass.find((p) => p.group === 'annual');
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        {terms.map((p) => (
          <button key={p.value} onClick={() => setPeriodKey(p.value)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              periodKey === p.value
                ? 'bg-brand-600 text-white shadow-sm'
                : 'bg-white border border-gray-200 text-gray-600 hover:border-brand-300'
            }`}>
            {p.label}
          </button>
        ))}
        {annual && (
          <>
            <span className="text-gray-200 mx-1">|</span>
            <button onClick={() => setPeriodKey(annual.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                periodKey === annual.value
                  ? 'bg-gray-800 text-white shadow-sm'
                  : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-400'
              }`}>
              {annual.label}
            </button>
          </>
        )}
      </div>
    );
  }
  if (isGE) {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        {PERIODS_GE.filter((p) => p.group === 'terms').map((p) => (
          <button key={p.value} onClick={() => setPeriodKey(p.value)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              periodKey === p.value
                ? 'bg-brand-600 text-white shadow-sm'
                : 'bg-white border border-gray-200 text-gray-600 hover:border-brand-300'
            }`}>
            {p.label}
          </button>
        ))}
        <span className="text-gray-200 mx-1">|</span>
        <button onClick={() => setPeriodKey('anual')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            periodKey === 'anual'
              ? 'bg-gray-800 text-white shadow-sm'
              : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-400'
          }`}>
          Anual
        </button>
      </div>
    );
  }
  if (isEN) {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        {PERIODS_EN.filter((p) => p.group === 'terms').map((p) => (
          <button key={p.value} onClick={() => setPeriodKey(p.value)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              periodKey === p.value
                ? 'bg-brand-600 text-white shadow-sm'
                : 'bg-white border border-gray-200 text-gray-600 hover:border-brand-300'
            }`}>
            {p.label}
          </button>
        ))}
        <span className="text-gray-200 mx-1">|</span>
        <button onClick={() => setPeriodKey('annual')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            periodKey === 'annual'
              ? 'bg-gray-800 text-white shadow-sm'
              : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-400'
          }`}>
          Annual
        </button>
      </div>
    );
  }

  const seqs = periodsForClass.filter((p) => p.seqs.length === 1);
  const trims = periodsForClass.filter((p) => p.seqs.length === 2);
  const annual = periodsForClass.find((p) => p.value === 'annual');

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-gray-400 font-medium mr-0.5">{t('Séq.', 'Seq.')}</span>
      {seqs.map((p) => (
        <button key={p.value} onClick={() => setPeriodKey(p.value)}
          className={`w-8 h-8 rounded-lg text-xs font-bold transition-colors ${
            periodKey === p.value
              ? 'bg-brand-600 text-white shadow-sm'
              : 'bg-white border border-gray-200 text-gray-600 hover:border-brand-300'
          }`}>
          {p.seqs[0]}
        </button>
      ))}
      <span className="text-gray-200 mx-1">|</span>
      <span className="text-xs text-gray-400 font-medium mr-0.5">{t('Trim.', 'Qtr')}</span>
      {trims.map((p, i) => (
        <button key={p.value} onClick={() => setPeriodKey(p.value)}
          className={`px-2.5 h-8 rounded-lg text-xs font-bold transition-colors ${
            periodKey === p.value
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'bg-white border border-gray-200 text-gray-600 hover:border-indigo-300'
          }`}>
          {i + 1}
        </button>
      ))}
      <span className="text-gray-200 mx-1">|</span>
      {annual && (
        <button onClick={() => setPeriodKey('annual')}
          className={`px-3 h-8 rounded-lg text-xs font-bold transition-colors ${
            periodKey === 'annual'
              ? 'bg-gray-800 text-white shadow-sm'
              : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-400'
          }`}>
          {t('Annuel', 'Annual')}
        </button>
      )}
    </div>
  );
}

// ── Page principale ───────────────────────────────────────────────────────────
export default function Reports() {
  const t = useT();
  const { school, role } = useAuthStore();
  const isSurveillant = role === 'surveillant';
  const schoolLanguage = school?.language || 'francophone';
  const classes  = useSchoolStore((s) => s.classes);
  const subjects = useSchoolStore((s) => s.subjects);
  const students = useSchoolStore((s) => s.students);
  const gradeMap = useSchoolStore((s) => s.gradeMap);

  // Moteurs officiels : leurs évaluations ne passent jamais par `gradeMap`.
  // Sans ces données, un rapport MINEDUB/APC n'aurait que des tirets.
  const apcNotes        = useSchoolStore((s) => s.apcNotes);
  const apcReferentiel  = useSchoolStore((s) => s.apcReferentiel);
  const primNotes       = useSchoolStore((s) => s.primNotes);
  const primReferentiel = useSchoolStore((s) => s.primReferentiel);
  const matObservations = useSchoolStore((s) => s.matObservations);
  const loadApc  = useSchoolStore((s) => s.loadApc);
  const loadMat  = useSchoolStore((s) => s.loadMat);
  const loadPrim = useSchoolStore((s) => s.loadPrim);

  const PERIODS_FR = [
    { value: 'seq_1',  label: t('Séquence 1',  'Sequence 1'),  seqs: [1] },
    { value: 'seq_2',  label: t('Séquence 2',  'Sequence 2'),  seqs: [2] },
    { value: 'seq_3',  label: t('Séquence 3',  'Sequence 3'),  seqs: [3] },
    { value: 'seq_4',  label: t('Séquence 4',  'Sequence 4'),  seqs: [4] },
    { value: 'seq_5',  label: t('Séquence 5',  'Sequence 5'),  seqs: [5] },
    { value: 'seq_6',  label: t('Séquence 6',  'Sequence 6'),  seqs: [6] },
    { value: 'term_1', label: t('Trimestre 1', 'Quarter 1'),   seqs: [1, 2] },
    { value: 'term_2', label: t('Trimestre 2', 'Quarter 2'),   seqs: [3, 4] },
    { value: 'term_3', label: t('Trimestre 3', 'Quarter 3'),   seqs: [5, 6] },
    { value: 'annual', label: t('Annuel',      'Annual'),      seqs: [1, 2, 3, 4, 5, 6] },
  ];

  // Fondamental (maternelle / primaire APC MINEDUB) : évaluation par TRIMESTRE
  // uniquement — pas de séquences. Aligné sur la saisie (Prim/Mat workspaces).
  const PERIODS_FUND = [
    { value: 't1',     label: t('Trimestre 1', 'Term 1'), seqs: [1],       group: 'terms' },
    { value: 't2',     label: t('Trimestre 2', 'Term 2'), seqs: [2],       group: 'terms' },
    { value: 't3',     label: t('Trimestre 3', 'Term 3'), seqs: [3],       group: 'terms' },
    { value: 'annual', label: t('Annuel',      'Annual'), seqs: [1, 2, 3], group: 'annual' },
  ];

  const [classId,     setClassId]     = useState('');
  const [sectionF,    setSectionF]    = useState('');
  const [periodKey,   setPeriodKey]   = useState('seq_1');
  const [showPrintOpts, setShowPrintOpts] = useState(false);
  const [tab, setTab] = useState('academique');    // 'academique' | 'discipline'
  const activeTab = isSurveillant ? 'discipline' : tab; // le surveillant n'a jamais accès aux notes

  // Vie scolaire (incidents/sanctions/retards) de l'année active — pour l'onglet
  // Discipline. Chargé une seule fois par école/année, filtré côté client par
  // classe + période (computeClassDiscipline).
  const [vsData, setVsData] = useState({ incidents: [], actions: [], lateArrivals: [] });
  useEffect(() => {
    if (!school?.id) return;
    let alive = true;
    fetchVieScolaireSnapshot(school.id, school.current_year).then((snap) => {
      if (alive) setVsData(snap);
    });
    return () => { alive = false; };
  }, [school?.id, school?.current_year]);

  // Arrivée depuis la fiche d'un élève (/app/reports?class=<id>) :
  // pré-sélectionner la classe de l'élève.
  const [searchParams] = useSearchParams();
  const handledClassParam = useRef(false);
  useEffect(() => {
    if (handledClassParam.current) return;
    const cid = searchParams.get('class');
    if (!cid) return;
    if (!classes.some((c) => c.id === cid)) return;
    handledClassParam.current = true;
    setClassId(cid);
  }, [searchParams, classes]);
  const [cols, setCols] = useState({
    matricule:     true,
    appreciation:  true,
    decision:      true,
    subjectTable:  true,
    subjectScores: true,
    distribution:  false,
  });
  const toggleCol = (key) => setCols((prev) => ({ ...prev, [key]: !prev[key] }));

  const selectedClass   = classes.find((c) => c.id === classId) || null;
  const sys             = selectedClass?.system || 'FR';
  const isEN            = sys === 'EN';
  const isGE            = resolveCountryCode(school) === 'guinea_eq';
  const gOpts           = gradingOpts(school, selectedClass?.cycle);
  const passThreshold   = isGE ? geGradeMax(school) / 2 : sys === 'FR' ? 10 : 50;
  const maxScale        = isGE ? geGradeMax(school) : sys === 'FR' ? 20 : 100;
  // Moteur de la classe : maternelle / primaire APC → périodes par trimestre.
  const classEngine     = selectedClass ? resolveClassEngine(school, selectedClass) : 'classic';
  const isFund          = classEngine === 'maternelle' || classEngine === 'apc_primaire';
  const periodsForClass = isFund ? PERIODS_FUND : isGE ? PERIODS_GE : isEN ? PERIODS_EN : PERIODS_FR;
  const period          = periodsForClass.find((p) => p.value === periodKey) || periodsForClass[0];

  useEffect(() => {
    const cls = classes.find((c) => c.id === classId);
    const eng = cls ? resolveClassEngine(school, cls) : 'classic';
    if (eng === 'maternelle' || eng === 'apc_primaire') setPeriodKey('t1');
    else if (resolveCountryCode(school) === 'guinea_eq') setPeriodKey('trim_1');
    else if (cls?.system === 'EN') setPeriodKey('term_1');
    else setPeriodKey('seq_1');
  }, [classId, classes, school]);

  // Référentiels officiels présents dans l'établissement — chargés à la demande
  // (idempotent côté store), car l'impression EN LOT touche toutes les classes,
  // pas seulement celle qui est sélectionnée.
  const engines = useMemo(() => {
    const set = new Set(classes.map((c) => resolveClassEngine(school, c)));
    return { apc: set.has('apc'), mat: set.has('maternelle'), prim: set.has('apc_primaire') };
  }, [classes, school]);
  useEffect(() => { if (engines.apc)  loadApc(); },  [engines.apc, loadApc]);
  useEffect(() => { if (engines.mat)  loadMat(); },  [engines.mat, loadMat]);
  useEffect(() => { if (engines.prim) loadPrim(); }, [engines.prim, loadPrim]);

  const classSubjects = useMemo(() =>
    subjects.filter((s) => s.class_id === classId).sort((a, b) => b.coef - a.coef || a.name.localeCompare(b.name)),
    [subjects, classId]
  );
  const classStudents = useMemo(() =>
    students.filter((s) => s.class_id === classId).sort((a, b) => a.name.localeCompare(b.name)),
    [students, classId]
  );

  // ── Rapport de la classe sélectionnée, quel que soit son moteur ────────────
  // Un seul calcul : `computeClassReport` choisit la source (gradeMap, notes APC,
  // notes primaire, observations maternelle) et normalise la forme.
  const reportCtx = useMemo(() => ({
    school, students, subjects, gradeMap,
    apcNotes, apcReferentiel, primNotes, primReferentiel, matObservations,
  }), [school, students, subjects, gradeMap, apcNotes, apcReferentiel, primNotes, primReferentiel, matObservations]);

  const classReport = useMemo(
    () => (selectedClass ? computeClassReport(selectedClass, period, reportCtx) : null),
    [selectedClass, period, reportCtx],
  );

  const isAcquisition = classReport?.kind === REPORT_KIND.ACQUISITION;
  const stats          = classReport?.stats ?? null;
  const studentResults = classReport?.studentResults ?? [];
  const subjectStats   = classReport?.subjectStats ?? [];
  const reportColumns  = classReport?.classSubjects ?? [];
  // Le barème effectif vient du moteur (le primaire MINEDUB note /10, pas /20).
  const reportScale    = classReport?.maxScale ?? maxScale;
  const reportPass     = classReport?.passThreshold ?? passThreshold;

  // Le rapport est exploitable dès qu'il a des colonnes ET des élèves. Pour les
  // moteurs officiels, les colonnes viennent du référentiel : une classe APC sans
  // ligne `subjects` a quand même un rapport.
  const hasData     = !!classReport && !classReport.notReady && reportColumns.length > 0;
  const notReady    = !!classReport?.notReady;
  const notReadyFor = classReport?.report?.reason ?? null;

  // ── Impression EN LOT (par section / tout l'établissement) ──────────────────
  // Contexte pur transmis au moteur de calcul ; utilise la période courante.
  const batchCtx = reportCtx;
  const sectionLabel = (key) => {
    const s = SECTIONS.find((x) => x.key === key);
    return s ? t(s.fr, s.en, s.es) : t('Toutes les sections', 'All sections');
  };
  const runBatch = (classesToPrint, title) => {
    if (!classesToPrint.length) {
      alert(t('Aucune classe à imprimer.', 'No class to print.', 'Ninguna clase para imprimir.'));
      return;
    }
    const n = printReportsBatch({ title, classesToPrint, period, cols, ctx: batchCtx });
    if (!n) alert(t('Aucune classe avec des notes à imprimer.', 'No class with grades to print.', 'Ninguna clase con notas.'));
  };
  const handlePrintSection = () => {
    const target = classes.filter((c) => inSection(c, sectionF));
    const label  = sectionF ? sectionLabel(sectionF) : t('Toutes les classes', 'All classes');
    runBatch(target, `${isGE ? 'Informe' : 'Rapport'} — ${label} — ${period.label}`);
  };
  const handlePrintAll = () =>
    runBatch(classes, `${isGE ? 'Informe' : 'Rapport'} — ${school?.name || ''} — ${period.label}`);

  // ── Onglet Discipline (surveillant) — même classe/période que l'académique,
  // aucune moyenne ni note n'y transite.
  const disciplineReport = useMemo(() => {
    if (!selectedClass) return null;
    return computeClassDiscipline(selectedClass, period, { students, vsData });
  }, [selectedClass, period, students, vsData]);

  const runDisciplineBatch = (classesToPrint, title) => {
    if (!classesToPrint.length) {
      alert(t('Aucune classe à imprimer.', 'No class to print.', 'Ninguna clase para imprimir.'));
      return;
    }
    const n = printDisciplineBatch({ title, classesToPrint, period, vsData, students, school });
    if (!n) alert(t('Aucune classe avec des élèves à imprimer.', 'No class with students to print.', 'Ninguna clase con alumnos.'));
  };
  const handlePrintDisciplineSection = () => {
    const target = classes.filter((c) => inSection(c, sectionF));
    const label  = sectionF ? sectionLabel(sectionF) : t('Toutes les classes', 'All classes');
    runDisciplineBatch(target, `${isGE ? 'Informe' : 'Rapport'} — ${label} — ${period.label}`);
  };
  const handlePrintDisciplineAll = () =>
    runDisciplineBatch(classes, `${isGE ? 'Informe' : 'Rapport'} — ${school?.name || ''} — ${period.label}`);

  const handleExportDiscipline = () => {
    if (!disciplineReport) return;
    const rows = [
      [t('Élève', 'Student'), t('Incidents', 'Incidents'), t('Sanctions', 'Sanctions'),
        t('Retards', 'Late arrivals'), t('Jours exclusion', 'Exclusion days')],
      ...disciplineReport.rows.map(({ student, incidents, sanctions, lateArrivals, exclusionDays }) => [
        student.name, incidents.length, sanctions.length, lateArrivals.length, exclusionDays,
      ]),
    ];
    const cn = selectedClass?.name?.replace(/\s+/g, '_') || 'classe';
    downloadCSV(`discipline_${cn}_${period.label.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`, rows);
  };

  // Bandes calées sur le barème réel du moteur (/20, /100, /10 primaire APC) ou,
  // en maternelle, comptage par niveau d'acquisition.
  const distribution = hasData ? (classReport?.distribution ?? []) : [];

  const csvName = (prefix) => {
    const cn = selectedClass?.name?.replace(/\s+/g, '_') || 'classe';
    return `${prefix}_${cn}_${period.label.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`;
  };

  const handleExportResults = () => {
    // Maternelle : ni moyenne ni rang — on exporte les niveaux d'acquisition.
    const rows = isAcquisition
      ? [
        [t('Nom', 'Name'), t('Matricule', 'Student ID'), ...reportColumns.map((c) => c.name), t('Tendance', 'Trend')],
        ...studentResults.map(({ student, cotes, cote }) => [
          student.name, student.matricule || '',
          ...reportColumns.map((c) => cotes[c.id] || ''),
          cote || '',
        ]),
      ]
      : [
        [t('Rang', 'Rank'), t('Nom', 'Name'), t('Matricule', 'Student ID'),
          ...reportColumns.map((c) => c.name),
          t('Moyenne', 'Average'), t('Appréciation', 'Grade'), t('Décision', 'Decision')],
        ...studentResults.map(({ student, avg, rank, appr, scores }) => {
          const decision = avg !== null ? (avg >= reportPass ? t('Admis(e)', 'Passed') : t('Ajourné(e)', 'Failed')) : '';
          return [
            rank?.rankN ?? '', student.name, student.matricule || '',
            ...reportColumns.map((c) => scores[c.id] ?? ''),
            avg ?? '',
            sys === 'EN' && appr?.txt ? `${appr.g} - ${appr.txt}` : (appr?.text || appr?.g || ''),
            decision,
          ];
        }),
      ];
    downloadCSV(csvName(isAcquisition ? 'acquisition' : 'resultats'), rows);
  };

  const handleExportSubjects = () => {
    const rows = isAcquisition
      ? [
        [t('Domaine', 'Domain'), ...MAT_ACQUIS.map((a) => a.code), t('Évalués', 'Assessed'), t('Effectif', 'Total')],
        ...subjectStats.map(({ sub, counts, rated, total }) => [
          sub.name, ...MAT_ACQUIS.map((a) => counts[a.code] ?? 0), rated, total,
        ]),
      ]
      : [
        [t('Matière', 'Subject'), t('Coef', 'Coeff'), t('Moy. classe', 'Class avg'),
          'Min', 'Max', t('Admis', 'Passed'), t('Effectif', 'Total'), t('Taux réussite', 'Pass rate')],
        ...subjectStats.map(({ sub, avg, min, max, passCount, total }) => [
          sub.name, sub.coef, avg ?? '', min ?? '', max ?? '', passCount, total,
          total ? `${Math.round((passCount / total) * 100)}%` : '',
        ]),
      ];
    downloadCSV(csvName(isAcquisition ? 'domaines' : 'matieres'), rows);
  };

  // Étiquette du référentiel suivi par la classe — utile quand plusieurs cohabitent.
  const engineBadge = {
    apc:          'APC MINESEC',
    apc_primaire: 'APC MINEDUB',
    maternelle:   'MINEDUB',
    sc:           'MINESEC',
  }[classReport?.engine] || null;

  const passRateGlobal = !isAcquisition && stats?.above != null && stats?.total
    ? Math.round((stats.above / stats.total) * 100) : null;
  // Part des observations réellement cotées (maternelle) : l'équivalent utile du
  // taux de réussite quand rien n'est noté.
  const ratedRate = isAcquisition && stats?.expected
    ? Math.round((stats.rated / stats.expected) * 100) : null;

  return (
    <Layout>
      <div className="max-w-6xl space-y-5">

        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t('Rapports', 'Reports')}</h1>
            <p className="text-sm text-gray-500 mt-1">
              {activeTab === 'academique'
                ? t('Résultats détaillés par classe et période.', 'Detailed results by class and period.')
                : t('Incidents, sanctions et retards par classe et période.', 'Incidents, sanctions and late arrivals by class and period.')}
            </p>
          </div>
          {!isSurveillant && (
            <div className="flex gap-1.5 bg-gray-100 rounded-xl p-1">
              {[
                { key: 'academique', label: t('Académique', 'Academic') },
                { key: 'discipline', label: t('Discipline', 'Discipline') },
              ].map((o) => (
                <button key={o.key} onClick={() => setTab(o.key)}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    tab === o.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}>
                  {o.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Barre de filtres ── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-wrap items-end gap-4">
          <SectionFilterSelect
            classes={classes}
            value={sectionF}
            onChange={(v) => { setSectionF(v); if (classId && !inSection(classes.find((c) => c.id === classId), v)) setClassId(''); }}
            style={{ maxWidth: 170 }}
          />
          <div className="min-w-[200px]">
            <label className="form-label">{t('Classe', 'Class')}</label>
            <select className="form-input" value={classId} onChange={(e) => setClassId(e.target.value)}>
              <option value="">{t('— Choisir une classe', '— Choose a class')}</option>
              {classes.filter((c) => inSection(c, sectionF)).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}{schoolLanguage === 'bilingue' ? ` [${c.system === 'EN' ? '/100' : '/20'}]` : ''} — {students.filter((s) => s.class_id === c.id).length} {t('élèves', 'students')}
                </option>
              ))}
            </select>
          </div>

          {classId && (
            <div className="flex-1">
              <label className="form-label">{t('Période', 'Period')}</label>
              <PeriodPills
                periodKey={periodKey}
                setPeriodKey={setPeriodKey}
                periodsForClass={periodsForClass}
                isEN={isEN}
                isGE={isGE}
                isFund={isFund}
              />
            </div>
          )}

          {/* Impression en lot — toujours disponible dès qu'il y a des classes. */}
          {classes.length > 0 && activeTab === 'academique' && (
            <div className="flex gap-2 flex-wrap ml-auto items-end">
              <button
                onClick={handlePrintSection}
                className="btn-secondary text-xs"
                style={{ width: 'auto' }}
                title={t('Imprimer le rapport de toutes les classes de la section', 'Print the report of every class in the section')}
              >
                🖨 {sectionF ? t('Section', 'Section') : t('Toutes les classes', 'All classes')}
              </button>
              <button
                onClick={handlePrintAll}
                className="btn-secondary text-xs"
                style={{ width: 'auto' }}
                title={t('Imprimer le rapport de toutes les classes de l\'établissement', 'Print the report of every class in the school')}
              >
                🏫 {t('Tout l\'établissement', 'Whole school')}
              </button>
            </div>
          )}

          {classes.length > 0 && activeTab === 'discipline' && (
            <div className="flex gap-2 flex-wrap ml-auto items-end">
              <button
                onClick={handlePrintDisciplineSection}
                className="btn-secondary text-xs"
                style={{ width: 'auto' }}
                title={t('Imprimer le rapport de toutes les classes de la section', 'Print the report of every class in the section')}
              >
                🖨 {sectionF ? t('Section', 'Section') : t('Toutes les classes', 'All classes')}
              </button>
              <button
                onClick={handlePrintDisciplineAll}
                className="btn-secondary text-xs"
                style={{ width: 'auto' }}
                title={t('Imprimer le rapport de toutes les classes de l\'établissement', 'Print the report of every class in the school')}
              >
                🏫 {t('Tout l\'établissement', 'Whole school')}
              </button>
            </div>
          )}

          {activeTab === 'academique' && hasData && (
            <div className="flex gap-2 flex-wrap items-end">
              <button onClick={handleExportResults} className="btn-secondary text-xs">
                CSV {t('résultats', 'results')}
              </button>
              <button onClick={handleExportSubjects} className="btn-secondary text-xs">
                CSV {t('matières', 'subjects')}
              </button>
              <button
                onClick={() => setShowPrintOpts((v) => !v)}
                title={t('Options d\'impression', 'Print options')}
                className={`btn-secondary text-xs px-3 ${showPrintOpts ? 'bg-gray-100' : ''}`}
                style={{ width: 'auto' }}
              >
                ⚙
              </button>
              <button
                onClick={() => printReport({ school, selectedClass, period, cols, ...classReport })}
                className="btn-primary text-xs"
                style={{ width: 'auto', paddingInline: '1.25rem' }}
              >
                🖨 {t('Imprimer / PDF', 'Print / PDF')}
              </button>
            </div>
          )}

          {activeTab === 'discipline' && classId && disciplineReport && (
            <div className="flex gap-2 flex-wrap items-end">
              <button onClick={handleExportDiscipline} className="btn-secondary text-xs">
                CSV {t('discipline', 'discipline')}
              </button>
              <button
                onClick={() => printDisciplineReport({ school, selectedClass, period, isGE, ...disciplineReport })}
                className="btn-primary text-xs"
                style={{ width: 'auto', paddingInline: '1.25rem' }}
              >
                🖨 {t('Imprimer / PDF', 'Print / PDF')}
              </button>
            </div>
          )}
        </div>

        {/* ── Options d'impression ── */}
        {activeTab === 'academique' && hasData && showPrintOpts && (
          <div className="bg-gray-50 border border-gray-200 rounded-xl px-5 py-4 flex flex-wrap gap-5 items-center">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider shrink-0">
              {t('Options PDF', 'PDF options')}
            </span>
            {[
              { key: 'matricule',     label: t('Matricule', 'Student ID') },
              { key: 'subjectScores', label: t('Notes par matière (par élève)', 'Per-subject scores (per student)') },
              { key: 'appreciation',  label: t('Appréciation', 'Grade') },
              { key: 'decision',      label: t('Décision admis/ajourné', 'Pass/Fail decision') },
              { key: 'subjectTable',  label: t('Tableau matières (moyennes classe)', 'Subject table (class averages)') },
            ].map(({ key, label }) => (
              <label key={key} className="flex items-center gap-2 cursor-pointer select-none text-sm text-gray-700">
                <input
                  type="checkbox"
                  className="accent-brand-600 w-4 h-4"
                  checked={cols[key]}
                  onChange={() => toggleCol(key)}
                />
                {label}
              </label>
            ))}
          </div>
        )}

        {/* ── Vue globale (aucune classe sélectionnée) ── */}
        {!classId && classes.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-800">{t('Aperçu', 'Overview')} — {school?.current_year}</h2>
              <p className="text-xs text-gray-400 mt-0.5">{t('Cliquez sur une ligne pour voir le rapport détaillé.', 'Click a row to view the detailed report.')}</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    <th className="px-6 py-3 text-left">{t('Classe', 'Class')}</th>
                    <th className="px-4 py-3 text-center">{t('Système', 'System')}</th>
                    <th className="px-4 py-3 text-center">{t('Élèves', 'Students')}</th>
                    <th className="px-4 py-3 text-center">{t('Matières', 'Subjects')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {classes.filter((c) => inSection(c, sectionF)).map((cls) => {
                    const studs = students.filter((s) => s.class_id === cls.id);
                    const subs  = subjects.filter((s) => s.class_id === cls.id);
                    return (
                      <tr key={cls.id}
                        className="hover:bg-brand-50 transition-colors cursor-pointer group"
                        onClick={() => setClassId(cls.id)}>
                        <td className="px-6 py-3 font-semibold text-gray-900 group-hover:text-brand-700">
                          {cls.name}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${
                            cls.system === 'EN' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                          }`}>{cls.system || 'FR'}</span>
                        </td>
                        <td className="px-4 py-3 text-center text-gray-600">{studs.length}</td>
                        <td className="px-4 py-3 text-center text-gray-600">{subs.length}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {!classId && classes.length === 0 && (
          <div className="bg-white rounded-xl p-12 text-center shadow-sm border border-gray-100">
            <div className="text-4xl mb-3">📊</div>
            <p className="text-gray-500 text-sm">
              {t('Aucune classe configurée.', 'No classes configured.')}
            </p>
          </div>
        )}

        {activeTab === 'academique' && classId && !hasData && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-sm text-amber-800">
            <strong>{selectedClass?.name}</strong>{' '}
            {notReady && notReadyFor === 'referentiel'
              ? t('suit un référentiel officiel qui n’est pas encore chargé. Reconnectez-vous à Internet une fois pour le télécharger.',
                  'follows an official framework that is not loaded yet. Go online once to download it.',
                  'sigue un marco oficial aún no descargado. Conéctese una vez a Internet.')
              : notReady && notReadyFor === 'classe'
                ? t('a un niveau qui ne correspond à aucun référentiel officiel — vérifiez son niveau dans Classes.',
                    'has a level that matches no official framework — check its level in Classes.',
                    'tiene un nivel que no corresponde a ningún marco oficial.')
                : t("n'a pas encore de matières ou d'élèves.", 'has no subjects or students yet.')}
          </div>
        )}

        {/* ── Données académiques ── */}
        {activeTab === 'academique' && hasData && (
          <>
            {/* Titre de section */}
            <div className="flex items-center gap-3">
              <h2 className="text-base font-bold text-gray-800">
                {selectedClass?.name}
                <span className="ml-2 text-sm font-normal text-gray-400">· {period.label}</span>
              </h2>
              {/* Le badge dit le RÉFÉRENTIEL de la classe, pas seulement sa langue :
                  une école « Officiel Cameroun » mêle /20 MINESEC, /10 MINEDUB et
                  cotes de maternelle sur le même écran. */}
              <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                isAcquisition ? 'bg-emerald-100 text-emerald-700'
                  : isEN ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
              }`}>
                {isAcquisition ? 'A · ECA · NA' : `${sys} /${reportScale}`}
              </span>
              {engineBadge && (
                <span className="px-2 py-0.5 rounded text-xs font-semibold bg-gray-100 text-gray-600">{engineBadge}</span>
              )}
            </div>

            {/* Stats — moyennes pour ce qui note, acquisition pour la maternelle */}
            {isAcquisition ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatBadge label={t('Effectif', 'Total')} value={stats?.total ?? classStudents.length} accent="brand" />
                {MAT_ACQUIS.map((a) => (
                  <StatBadge
                    key={a.code}
                    label={t(a.libelle, MAT_ACQUIS_LABELS[a.code])}
                    value={stats?.counts?.[a.code] ?? 0}
                    total={stats?.rated || null}
                    accent={a.code === 'A' ? 'green' : a.code === 'ECA' ? 'purple' : 'red'}
                  />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatBadge label={t('Effectif', 'Total')} value={stats?.total ?? classStudents.length} accent="brand" />
                <StatBadge
                  label={t('Moy. classe', 'Class avg')}
                  value={stats?.avg != null ? stats.avg : '—'}
                  total={reportScale}
                  accent="purple"
                />
                <StatBadge
                  label={t('Taux de réussite', 'Pass rate')}
                  value={passRateGlobal !== null ? `${passRateGlobal}%` : '—'}
                  accent={passRateGlobal !== null && passRateGlobal >= 50 ? 'green' : 'red'}
                />
                <StatBadge
                  label={t('Admis', 'Passed')}
                  value={stats?.above ?? '—'}
                  total={stats?.total}
                  accent="green"
                />
              </div>
            )}

            {isAcquisition && ratedRate !== null && (
              <p className="text-xs text-gray-400 -mt-2">
                {t(`${stats.rated}/${stats.expected} observations renseignées (${ratedRate} %) — le préscolaire n'établit ni moyenne, ni classement.`,
                   `${stats.rated}/${stats.expected} observations recorded (${ratedRate}%) — pre-school has no average and no ranking.`,
                   `${stats.rated}/${stats.expected} observaciones (${ratedRate} %).`)}
              </p>
            )}

            {/* Blocs NUMÉRIQUES — classique, lycée, APC collège, primaire MINEDUB. */}
            {!isAcquisition && (<>
            {/* Classement */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100">
                <h2 className="font-semibold text-gray-800">{t('Classement', 'Rankings')}</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  {classStudents.length} {t('élèves · triés par moyenne décroissante', 'students · sorted by descending average')}
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      <th className="px-4 py-3 text-center w-12">{t('Rang', 'Rank')}</th>
                      <th className="px-5 py-3 text-left">{t('Élève', 'Student')}</th>
                      <th className="px-4 py-3 text-center">{t('Matricule', 'ID')}</th>
                      <th className="px-4 py-3 text-center">{t('Moyenne', 'Avg')} /{reportScale}</th>
                      <th className="px-4 py-3 text-center">{t('Appréciation', 'Grade')}</th>
                      <th className="px-4 py-3 text-center">{t('Décision', 'Decision')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {studentResults.map(({ student, avg, rank, appr }, idx) => {
                      const passed = avg !== null && avg >= reportPass;
                      return (
                        <tr key={student.id} className={`hover:bg-gray-50 transition-colors ${idx % 2 === 0 ? '' : 'bg-gray-50/30'}`}>
                          <td className="px-4 py-3 text-center">
                            {rank?.rankD ? (
                              <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${
                                rank.rankN === 1 ? 'bg-yellow-100 text-yellow-700' :
                                rank.rankN === 2 ? 'bg-gray-100 text-gray-600' :
                                rank.rankN === 3 ? 'bg-orange-100 text-orange-600' :
                                'bg-gray-50 text-gray-500'
                              }`}>{rank.rankN}</span>
                            ) : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-5 py-3 font-semibold text-gray-900">{student.name}</td>
                          <td className="px-4 py-3 text-center text-gray-400 font-mono text-xs">
                            {student.matricule || '—'}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {avg !== null ? (
                              <span className={`font-bold text-base ${passed ? 'text-emerald-600' : 'text-red-500'}`}>
                                {avg}
                              </span>
                            ) : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-4 py-3 text-center text-xs font-medium" style={{ color: appr?.col || '#9ca3af' }}>
                            {sys === 'EN' ? (appr ? `${appr.g}` : '—') : (appr?.text || '—')}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {avg !== null ? (
                              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                                passed ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'
                              }`}>
                                {passed ? t('Admis(e)', 'Passed') : t('Ajourné(e)', 'Failed')}
                              </span>
                            ) : <span className="text-gray-300">—</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Distribution */}
            {distribution.some((b) => b.count > 0) && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                <h2 className="font-semibold text-gray-800 mb-4">{t('Distribution des moyennes', 'Grade distribution')}</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {distribution.map((b) => {
                    const isPass = b.min >= reportPass;
                    return (
                      <div key={b.label} className="space-y-2">
                        <div className="flex items-end justify-between">
                          <span className="text-xs font-semibold text-gray-600">{b.label}</span>
                          <span className={`text-lg font-bold ${isPass ? 'text-emerald-600' : 'text-red-500'}`}>{b.count}</span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${isPass ? 'bg-emerald-400' : 'bg-red-300'}`}
                            style={{ width: `${b.pct}%` }} />
                        </div>
                        <span className="text-xs text-gray-400">{b.pct}% {t('des élèves', 'of students')}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Résultats par matière */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100">
                <h2 className="font-semibold text-gray-800">{t('Résultats par matière', 'Results by subject')}</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      <th className="px-5 py-3 text-left">{t('Matière', 'Subject')}</th>
                      <th className="px-4 py-3 text-center">{t('Coef', 'Coeff')}</th>
                      <th className="px-4 py-3 text-center">{t('Moy. classe', 'Class avg')}</th>
                      <th className="px-4 py-3 text-center">Min</th>
                      <th className="px-4 py-3 text-center">Max</th>
                      <th className="px-4 py-3 text-center">{t('Admis', 'Passed')}</th>
                      <th className="px-4 py-3 text-center">{t('Taux', 'Rate')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {subjectStats.map(({ sub, avg, min, max, passCount, total }) => {
                      const passRate = total ? Math.round((passCount / total) * 100) : null;
                      const pass = sub.max ? (reportPass / reportScale) * sub.max : reportPass;
                      return (
                        <tr key={sub.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-5 py-3 font-semibold text-gray-900">
                            {sub.name}
                            <span className="text-xs text-gray-400 font-normal ml-1">/{sub.max}</span>
                          </td>
                          <td className="px-4 py-3 text-center text-gray-500 text-xs">{sub.coef}</td>
                          <td className="px-4 py-3 text-center">
                            {avg !== null ? (
                              <span className={`font-bold ${avg >= pass ? 'text-emerald-600' : 'text-red-500'}`}>{avg}</span>
                            ) : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-4 py-3 text-center text-gray-500">{min ?? '—'}</td>
                          <td className="px-4 py-3 text-center text-gray-500">{max ?? '—'}</td>
                          <td className="px-4 py-3 text-center text-gray-600">
                            {total ? `${passCount}/${total}` : '—'}
                          </td>
                          <td className="px-4 py-3 text-center min-w-[80px]">
                            {passRate !== null ? (
                              <div className="space-y-1">
                                <span className={`text-xs font-bold ${passRate >= 50 ? 'text-emerald-600' : 'text-red-500'}`}>
                                  {passRate}%
                                </span>
                                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mx-auto max-w-[60px]">
                                  <div className={`h-full rounded-full ${passRate >= 50 ? 'bg-emerald-400' : 'bg-red-300'}`}
                                    style={{ width: `${passRate}%` }} />
                                </div>
                              </div>
                            ) : <span className="text-gray-300">—</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            </>)}

            {/* ── Blocs ACQUISITION — maternelle MINEDUB ────────────────────
                Ni moyenne, ni rang : le préscolaire s'évalue en niveaux
                d'acquisition A / ECA / NA, par domaine pédagogique. */}
            {isAcquisition && (<>
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100">
                  <h2 className="font-semibold text-gray-800">{t('Niveaux d’acquisition par élève', 'Acquisition levels by student')}</h2>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {classStudents.length} {t('élèves · aucun classement en préscolaire', 'students · no ranking in pre-school')}
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        <th className="px-5 py-3 text-left">{t('Élève', 'Student')}</th>
                        {reportColumns.map((c) => (
                          <th key={c.id} className="px-2 py-3 text-center whitespace-nowrap">{c.name}</th>
                        ))}
                        <th className="px-4 py-3 text-center">{t('Tendance', 'Trend')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {studentResults.map(({ student, cotes, cote }, idx) => (
                        <tr key={student.id} className={`hover:bg-gray-50 transition-colors ${idx % 2 === 0 ? '' : 'bg-gray-50/30'}`}>
                          <td className="px-5 py-3 font-semibold text-gray-900">{student.name}</td>
                          {reportColumns.map((c) => (
                            <td key={c.id} className="px-2 py-3 text-center">
                              {cotes[c.id] ? (
                                <span className="px-1.5 py-0.5 rounded text-xs font-bold"
                                  style={{ color: MAT_ACQUIS_COLORS[cotes[c.id]], backgroundColor: `${MAT_ACQUIS_COLORS[cotes[c.id]]}1a` }}>
                                  {cotes[c.id]}
                                </span>
                              ) : <span className="text-gray-300">—</span>}
                            </td>
                          ))}
                          <td className="px-4 py-3 text-center">
                            {cote ? (
                              <span className="font-bold text-sm" style={{ color: MAT_ACQUIS_COLORS[cote] }}>{cote}</span>
                            ) : <span className="text-gray-300">—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {stats?.rated > 0 && (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                  <h2 className="font-semibold text-gray-800 mb-4">{t('Répartition des acquisitions', 'Acquisition breakdown')}</h2>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {distribution.map((b) => (
                      <div key={b.label} className="space-y-2">
                        <div className="flex items-end justify-between">
                          <span className="text-xs font-semibold text-gray-600">{b.label} · {b.libelle}</span>
                          <span className="text-lg font-bold" style={{ color: MAT_ACQUIS_COLORS[b.label] }}>{b.count}</span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all"
                            style={{ width: `${b.pct}%`, backgroundColor: MAT_ACQUIS_COLORS[b.label] }} />
                        </div>
                        <span className="text-xs text-gray-400">{b.pct}% {t('des observations', 'of observations')}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100">
                  <h2 className="font-semibold text-gray-800">{t('Synthèse par domaine', 'Summary by domain')}</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        <th className="px-5 py-3 text-left">{t('Domaine', 'Domain')}</th>
                        {MAT_ACQUIS.map((a) => (
                          <th key={a.code} className="px-4 py-3 text-center">{a.code}</th>
                        ))}
                        <th className="px-4 py-3 text-center">{t('Évalués', 'Assessed')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {subjectStats.map(({ sub, counts, rated, total }) => (
                        <tr key={sub.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-5 py-3 font-semibold text-gray-900">{sub.name}</td>
                          {MAT_ACQUIS.map((a) => (
                            <td key={a.code} className="px-4 py-3 text-center font-bold"
                              style={{ color: counts[a.code] ? a.col : '#d1d5db' }}>
                              {counts[a.code] || '—'}
                            </td>
                          ))}
                          <td className="px-4 py-3 text-center text-gray-600">{rated}/{total}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>)}
          </>
        )}

        {/* ── Données discipline (surveillant) ── */}
        {activeTab === 'discipline' && classId && !disciplineReport && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-sm text-amber-800">
            <strong>{selectedClass?.name}</strong> {t("n'a pas encore d'élèves.", 'has no students yet.')}
          </div>
        )}

        {activeTab === 'discipline' && disciplineReport && (
          <>
            <div className="flex items-center gap-3">
              <h2 className="text-base font-bold text-gray-800">
                {selectedClass?.name}
                <span className="ml-2 text-sm font-normal text-gray-400">· {period.label}</span>
              </h2>
            </div>

            {disciplineReport.unclassifiedCount > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800">
                {t(
                  `${disciplineReport.unclassifiedCount} enregistrement(s) sans séquence renseignée, exclus de cette vue — visibles en Annuel.`,
                  `${disciplineReport.unclassifiedCount} record(s) with no sequence set, excluded from this view — visible in Annual.`
                )}
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatBadge label={t('Incidents', 'Incidents')} value={disciplineReport.totals.incidents} accent="brand" />
              <StatBadge label={t('Sanctions', 'Sanctions')} value={disciplineReport.totals.sanctions} accent="purple" />
              <StatBadge label={t('Retards', 'Late arrivals')} value={disciplineReport.totals.lateArrivals} accent="brand" />
              <StatBadge label={t('Jours d’exclusion', 'Exclusion days')} value={disciplineReport.totals.exclusionDays} accent="red" />
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100">
                <h2 className="font-semibold text-gray-800">{t('Détail par élève', 'Detail by student')}</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  {disciplineReport.classStudents.length} {t('élèves', 'students')}
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      <th className="px-5 py-3 text-left">{t('Élève', 'Student')}</th>
                      <th className="px-4 py-3 text-center">{t('Incidents', 'Incidents')}</th>
                      <th className="px-4 py-3 text-center">{t('Sanctions', 'Sanctions')}</th>
                      <th className="px-4 py-3 text-center">{t('Retards', 'Late arrivals')}</th>
                      <th className="px-4 py-3 text-center">{t('Jours excl.', 'Excl. days')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {disciplineReport.rows.map(({ student, incidents, sanctions, lateArrivals, exclusionDays }) => (
                      <tr key={student.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-5 py-3 font-semibold text-gray-900">{student.name}</td>
                        <td className="px-4 py-3 text-center text-gray-700">{incidents.length || <span className="text-gray-300">—</span>}</td>
                        <td className="px-4 py-3 text-center text-gray-700">{sanctions.length || <span className="text-gray-300">—</span>}</td>
                        <td className="px-4 py-3 text-center text-gray-700">{lateArrivals.length || <span className="text-gray-300">—</span>}</td>
                        <td className="px-4 py-3 text-center">
                          {exclusionDays > 0
                            ? <span className="font-bold text-red-600">{exclusionDays}</span>
                            : <span className="text-gray-300">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
