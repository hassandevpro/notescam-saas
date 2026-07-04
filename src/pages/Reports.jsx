import { useState, useMemo, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSchoolStore } from '../store/schoolStore';
import { useAuthStore } from '../store/authStore';
import { getAvg, frApp, enGrade, esGrade, buildRanks, clsStat } from '../core/bulletinEngine';
import { downloadCSV } from '../lib/exportCsv';
import Layout from '../components/Layout';
import { useT } from '../lib/i18n';
import { resolveCountryCode } from '../countries';
import { gradingOpts, geGradeMax } from '../lib/useCountry';
import SectionFilterSelect, { inSection } from '../components/SectionFilterSelect';
import { resolveClassEngine, SECTIONS } from '../core/engineResolver';

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

function subjectAvgForStudent(subjectId, studentId, classId, seqs, gradeMap) {
  const vals = seqs.map((seq) => {
    const v = (gradeMap[`${classId}_${studentId}_${seq}`] || {})[subjectId];
    if (!v || v === 'ABS' || v === '') return null;
    const n = parseFloat(v);
    return isNaN(n) ? null : n;
  }).filter((x) => x !== null);
  if (!vals.length) return null;
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100;
}

// ── Impression dans une nouvelle fenêtre (propre, sans sidebar) ───────────────
// cols : { matricule, appreciation, decision, subjectTable, distribution }
function reportBodyHtml({ school, selectedClass, period, stats, studentResults, subjectStats,
                       classStudents, maxScale, passThreshold, sys, cols = {}, isGE = false }) {
  const {
    matricule    = true,
    appreciation = true,
    decision     = true,
    subjectTable = true,
    distribution = false,
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

  const rankRows = studentResults.map(({ student, avg, rank, appr }) => {
    const passed = avg !== null && avg >= passThreshold;
    const avgColor = avg !== null ? (passed ? '#059669' : '#ef4444') : '#9ca3af';
    const tdMatricule    = matricule    ? `<td style="text-align:center;font-family:monospace;color:#6b7280">${student.matricule || '—'}</td>` : '';
    const tdAppreciation = appreciation ? `<td style="text-align:center;color:#374151">${sys === 'EN' ? (appr ? appr.g : '—') : (appr?.text || '—')}</td>` : '';
    const tdDecision     = decision     ? `<td style="text-align:center;font-weight:700;color:${passed ? '#059669' : '#dc2626'}">${passed ? Lp('Admis(e)', 'Aprobado') : Lp('Ajourné(e)', 'Suspenso')}</td>` : '';
    return `<tr>
      <td style="text-align:center;font-weight:700">${rank?.rankD ? rank.rankN : '—'}</td>
      <td style="font-weight:600">${student.name}</td>
      ${tdMatricule}
      <td style="text-align:center;font-weight:800;color:${avgColor}">${avg ?? '—'}</td>
      ${tdAppreciation}
      ${tdDecision}
    </tr>`;
  }).join('');

  const subRows = subjectStats.map(({ sub, avg, min, max, passCount, total }) => {
    const passRate = total ? Math.round((passCount / total) * 100) : null;
    const pass = sys === 'FR' ? (passThreshold / maxScale) * sub.max : passThreshold;
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

// Enveloppe HTML commune (styles) : un ou plusieurs corps de rapport concaténés,
// chaque classe sur sa propre page (`.page + .page` → saut de page).
function reportDocShell({ isGE, title, bodies }) {
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
      @page{margin:10mm;size:A4 portrait}
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
function printReport(args) {
  const title = `${args.isGE ? 'Informe' : 'Rapport'} — ${args.selectedClass?.name || ''} — ${args.period?.label || ''}`;
  openPrintWindow(reportDocShell({ isGE: args.isGE, title, bodies: [reportBodyHtml(args)] }));
}

// Calcule le payload de rapport d'UNE classe pour une période (pur, réutilisable
// en lot). Renvoie null si la classe n'a ni élèves ni matières exploitables.
function computeClassReport(cls, period, { school, students, subjects, gradeMap }) {
  const classId = cls.id;
  const sys  = cls?.system || 'FR';
  const isGE = resolveCountryCode(school) === 'guinea_eq';
  const gOpts = gradingOpts(school, cls?.cycle);
  const passThreshold = isGE ? geGradeMax(school) / 2 : sys === 'FR' ? 10 : 50;
  const maxScale      = isGE ? geGradeMax(school) : sys === 'FR' ? 20 : 100;
  const classSubjects = subjects.filter((s) => s.class_id === classId)
    .sort((a, b) => b.coef - a.coef || a.name.localeCompare(b.name));
  const classStudents = students.filter((s) => s.class_id === classId)
    .sort((a, b) => a.name.localeCompare(b.name));
  if (!classSubjects.length || !classStudents.length) return null;

  const ranks = buildRanks(classStudents, gradeMap, classId, period.seqs, classSubjects, sys, {}, gOpts);
  const stats = clsStat(classStudents, gradeMap, classId, period.seqs, classSubjects, sys, {}, gOpts);
  const studentResults = classStudents.map((student) => {
    const scores = {};
    classSubjects.forEach((sub) => {
      const avg = subjectAvgForStudent(sub.id, student.id, classId, period.seqs, gradeMap);
      if (avg !== null) scores[sub.id] = String(avg);
    });
    const avg  = getAvg(scores, classSubjects, sys, gOpts);
    const rank = ranks.find((r) => r.id === student.id) || null;
    const appr = avg !== null ? (sys === 'ES' ? esGrade(avg, maxScale) : sys === 'FR' ? frApp(avg) : enGrade(avg)) : null;
    return { student, avg, rank, appr };
  }).sort((a, b) => (a.avg === null && b.avg === null) ? 0 : a.avg === null ? 1 : b.avg === null ? -1 : b.avg - a.avg);
  const subjectStats = classSubjects.map((sub) => {
    const vals = classStudents
      .map((s) => subjectAvgForStudent(sub.id, s.id, classId, period.seqs, gradeMap))
      .filter((x) => x !== null);
    if (!vals.length) return { sub, avg: null, min: null, max: null, passCount: 0, total: 0 };
    const avg  = Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100;
    const pass = sys === 'FR' ? (passThreshold / maxScale) * sub.max : passThreshold;
    return { sub, avg, min: Math.min(...vals), max: Math.max(...vals),
      passCount: vals.filter((v) => v >= pass).length, total: vals.length };
  });
  return { stats, studentResults, subjectStats, classStudents, maxScale, passThreshold, sys, isGE };
}

// Impression EN LOT : un rapport par classe (période courante), une page chacun.
// Ignore les classes sans données. Renvoie le nombre de classes imprimées.
function printReportsBatch({ title, classesToPrint, period, cols, ctx }) {
  const isGE = resolveCountryCode(ctx.school) === 'guinea_eq';
  const bodies = classesToPrint
    .map((cls) => {
      const rep = computeClassReport(cls, period, ctx);
      if (!rep) return null;
      return reportBodyHtml({ school: ctx.school, selectedClass: cls, period, cols, ...rep });
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
  const { school } = useAuthStore();
  const schoolLanguage = school?.language || 'francophone';
  const classes  = useSchoolStore((s) => s.classes);
  const subjects = useSchoolStore((s) => s.subjects);
  const students = useSchoolStore((s) => s.students);
  const gradeMap = useSchoolStore((s) => s.gradeMap);

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
    matricule:    true,
    appreciation: true,
    decision:     true,
    subjectTable: true,
    distribution: false,
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

  const classSubjects = useMemo(() =>
    subjects.filter((s) => s.class_id === classId).sort((a, b) => b.coef - a.coef || a.name.localeCompare(b.name)),
    [subjects, classId]
  );
  const classStudents = useMemo(() =>
    students.filter((s) => s.class_id === classId).sort((a, b) => a.name.localeCompare(b.name)),
    [students, classId]
  );

  const ranks = useMemo(() => {
    if (!classStudents.length || !classSubjects.length) return [];
    return buildRanks(classStudents, gradeMap, classId, period.seqs, classSubjects, sys, {}, gOpts);
  }, [classStudents, classSubjects, gradeMap, classId, period.seqs, sys, gOpts.maxScale, gOpts.useCoef]);

  const stats = useMemo(() => {
    if (!classStudents.length || !classSubjects.length) return null;
    return clsStat(classStudents, gradeMap, classId, period.seqs, classSubjects, sys, {}, gOpts);
  }, [classStudents, classSubjects, gradeMap, classId, period.seqs, sys, gOpts.maxScale, gOpts.useCoef]);

  const studentResults = useMemo(() => {
    return classStudents.map((student) => {
      const scores = {};
      classSubjects.forEach((sub) => {
        const avg = subjectAvgForStudent(sub.id, student.id, classId, period.seqs, gradeMap);
        if (avg !== null) scores[sub.id] = String(avg);
      });
      const avg  = getAvg(scores, classSubjects, sys, gOpts);
      const rank = ranks.find((r) => r.id === student.id) || null;
      const appr = avg !== null ? (sys === 'ES' ? esGrade(avg, maxScale) : sys === 'FR' ? frApp(avg) : enGrade(avg)) : null;
      return { student, avg, rank, appr };
    }).sort((a, b) => {
      if (a.avg === null && b.avg === null) return 0;
      if (a.avg === null) return 1;
      if (b.avg === null) return -1;
      return b.avg - a.avg;
    });
  }, [classStudents, classSubjects, classId, period.seqs, gradeMap, sys, ranks, gOpts.maxScale, gOpts.useCoef, maxScale]);

  const subjectStats = useMemo(() => {
    return classSubjects.map((sub) => {
      const vals = classStudents
        .map((s) => subjectAvgForStudent(sub.id, s.id, classId, period.seqs, gradeMap))
        .filter((x) => x !== null);
      if (!vals.length) return { sub, avg: null, min: null, max: null, passCount: 0, total: 0 };
      const avg  = Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100;
      const pass = sys === 'FR' ? (passThreshold / maxScale) * sub.max : passThreshold;
      return {
        sub, avg,
        min: Math.min(...vals),
        max: Math.max(...vals),
        passCount: vals.filter((v) => v >= pass).length,
        total: vals.length,
      };
    });
  }, [classSubjects, classStudents, classId, period.seqs, gradeMap, sys, passThreshold, maxScale]);

  const hasData = classSubjects.length > 0 && classStudents.length > 0;

  // ── Impression EN LOT (par section / tout l'établissement) ──────────────────
  // Contexte pur transmis au moteur de calcul ; utilise la période courante.
  const batchCtx = { school, students, subjects, gradeMap };
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

  const distribution = useMemo(() => {
    if (!hasData) return [];
    const bands = sys === 'FR'
      ? [{ label: '< 5', min: 0, max: 5 }, { label: '5–9', min: 5, max: 10 }, { label: '10–14', min: 10, max: 15 }, { label: '15–20', min: 15, max: 20.01 }]
      : [{ label: '< 25', min: 0, max: 25 }, { label: '25–49', min: 25, max: 50 }, { label: '50–74', min: 50, max: 75 }, { label: '75–100', min: 75, max: 100.01 }];
    const avgs = studentResults.map((r) => r.avg).filter((v) => v !== null);
    const peak = avgs.length || 1;
    return bands.map((b) => {
      const count = avgs.filter((v) => v >= b.min && v < b.max).length;
      return { ...b, count, pct: Math.round((count / peak) * 100) };
    });
  }, [studentResults, sys, hasData]);

  const handleExportResults = () => {
    const rows = [
      [t('Rang', 'Rank'), t('Nom', 'Name'), t('Matricule', 'Student ID'),
        ...classSubjects.map((s) => s.name),
        t('Moyenne', 'Average'), t('Appréciation', 'Grade'), t('Décision', 'Decision')],
      ...studentResults.map(({ student, avg, rank, appr }) => {
        const subGrades = classSubjects.map((sub) =>
          subjectAvgForStudent(sub.id, student.id, classId, period.seqs, gradeMap) ?? ''
        );
        const decision = avg !== null ? (avg >= passThreshold ? t('Admis(e)', 'Passed') : t('Ajourné(e)', 'Failed')) : '';
        return [
          rank?.rankN ?? '', student.name, student.matricule || '', ...subGrades, avg ?? '',
          sys === 'EN' ? (appr ? `${appr.g} - ${appr.txt}` : '') : (appr?.text || ''),
          decision,
        ];
      }),
    ];
    const cn = selectedClass?.name?.replace(/\s+/g, '_') || 'classe';
    downloadCSV(`resultats_${cn}_${period.label.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`, rows);
  };

  const handleExportSubjects = () => {
    const rows = [
      [t('Matière', 'Subject'), t('Coef', 'Coeff'), t('Moy. classe', 'Class avg'),
        'Min', 'Max', t('Admis', 'Passed'), t('Effectif', 'Total'), t('Taux réussite', 'Pass rate')],
      ...subjectStats.map(({ sub, avg, min, max, passCount, total }) => [
        sub.name, sub.coef, avg ?? '', min ?? '', max ?? '', passCount, total,
        total ? `${Math.round((passCount / total) * 100)}%` : '',
      ]),
    ];
    const cn = selectedClass?.name?.replace(/\s+/g, '_') || 'classe';
    downloadCSV(`matieres_${cn}_${period.label.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`, rows);
  };

  const passRateGlobal = stats?.above != null && stats?.total
    ? Math.round((stats.above / stats.total) * 100) : null;

  return (
    <Layout>
      <div className="max-w-6xl space-y-5">

        {/* ── Header ── */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('Rapports', 'Reports')}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {t('Résultats détaillés par classe et période.', 'Detailed results by class and period.')}
          </p>
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
          {classes.length > 0 && (
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

          {hasData && (
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
                onClick={() => printReport({ school, selectedClass, period, stats, studentResults, subjectStats, classStudents, maxScale, passThreshold, sys, cols, isGE })}
                className="btn-primary text-xs"
                style={{ width: 'auto', paddingInline: '1.25rem' }}
              >
                🖨 {t('Imprimer / PDF', 'Print / PDF')}
              </button>
            </div>
          )}
        </div>

        {/* ── Options d'impression ── */}
        {hasData && showPrintOpts && (
          <div className="bg-gray-50 border border-gray-200 rounded-xl px-5 py-4 flex flex-wrap gap-5 items-center">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider shrink-0">
              {t('Options PDF', 'PDF options')}
            </span>
            {[
              { key: 'matricule',    label: t('Matricule', 'Student ID') },
              { key: 'appreciation', label: t('Appréciation', 'Grade') },
              { key: 'decision',     label: t('Décision admis/ajourné', 'Pass/Fail decision') },
              { key: 'subjectTable', label: t('Tableau matières', 'Subject table') },
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

        {classId && !hasData && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-sm text-amber-800">
            <strong>{selectedClass?.name}</strong> {t("n'a pas encore de matières ou d'élèves.", 'has no subjects or students yet.')}
          </div>
        )}

        {/* ── Données ── */}
        {hasData && (
          <>
            {/* Titre de section */}
            <div className="flex items-center gap-3">
              <h2 className="text-base font-bold text-gray-800">
                {selectedClass?.name}
                <span className="ml-2 text-sm font-normal text-gray-400">· {period.label}</span>
              </h2>
              <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                isEN ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
              }`}>{sys} /{maxScale}</span>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatBadge label={t('Effectif', 'Total')} value={stats?.total ?? classStudents.length} accent="brand" />
              <StatBadge
                label={t('Moy. classe', 'Class avg')}
                value={stats?.avg != null ? stats.avg : '—'}
                total={maxScale}
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
                      <th className="px-4 py-3 text-center">{t('Moyenne', 'Avg')} /{maxScale}</th>
                      <th className="px-4 py-3 text-center">{t('Appréciation', 'Grade')}</th>
                      <th className="px-4 py-3 text-center">{t('Décision', 'Decision')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {studentResults.map(({ student, avg, rank, appr }, idx) => {
                      const passed = avg !== null && avg >= passThreshold;
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
                    const isPass = sys === 'FR' ? b.min >= 10 : b.min >= 50;
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
                      const pass = sys === 'FR' ? (passThreshold / maxScale) * sub.max : passThreshold;
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
          </>
        )}
      </div>
    </Layout>
  );
}
