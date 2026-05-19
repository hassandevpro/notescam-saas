import { useState, useMemo, useEffect } from 'react';
import { useSchoolStore } from '../store/schoolStore';
import { useAuthStore } from '../store/authStore';
import { getAvg, frApp, enGrade, buildRanks, clsStat } from '../core/bulletinEngine';
import { downloadCSV } from '../lib/exportCsv';
import Layout from '../components/Layout';
import { useT } from '../lib/i18n';

const PERIODS_EN = [
  { value: 'term_1', label: 'Term 1', seqs: [1], group: 'terms' },
  { value: 'term_2', label: 'Term 2', seqs: [2], group: 'terms' },
  { value: 'term_3', label: 'Term 3', seqs: [3], group: 'terms' },
  { value: 'annual', label: 'Annual', seqs: [1, 2, 3], group: 'annual' },
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
function printReport({ school, selectedClass, period, stats, studentResults, subjectStats,
                       classStudents, maxScale, passThreshold, sys, cols = {} }) {
  const {
    matricule    = true,
    appreciation = true,
    decision     = true,
    subjectTable = true,
    distribution = false,
  } = cols;

  const today = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  const passRateGlobal = stats?.above != null && stats?.total
    ? Math.round((stats.above / stats.total) * 100) : null;

  // Build rank table header
  const thMatricule    = matricule    ? '<th style="width:90px">Matricule</th>' : '';
  const thAppreciation = appreciation ? '<th style="width:80px">Appréciation</th>' : '';
  const thDecision     = decision     ? '<th style="width:85px">Décision</th>' : '';

  const rankRows = studentResults.map(({ student, avg, rank, appr }) => {
    const passed = avg !== null && avg >= passThreshold;
    const avgColor = avg !== null ? (passed ? '#059669' : '#ef4444') : '#9ca3af';
    const decisionBg  = passed ? '#d1fae5' : '#fee2e2';
    const decisionCol = passed ? '#065f46' : '#991b1b';
    const tdMatricule    = matricule    ? `<td style="text-align:center;font-family:monospace;color:#6b7280">${student.matricule || '—'}</td>` : '';
    const tdAppreciation = appreciation ? `<td style="text-align:center;color:#374151">${sys === 'FR' ? (appr?.text || '—') : (appr ? appr.g : '—')}</td>` : '';
    const tdDecision     = decision     ? `<td style="text-align:center"><span style="display:inline-block;padding:2px 8px;border-radius:9999px;font-size:10px;font-weight:700;background:${decisionBg};color:${decisionCol}">${passed ? 'Admis(e)' : 'Ajourné(e)'}</span></td>` : '';
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
    ? `<img src="${school.logo_url}" alt="Logo" style="width:64px;height:64px;object-fit:contain" />`
    : `<div style="width:64px;height:64px;border-radius:50%;background:#eef2ff;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:800;color:#4f46e5">${(school?.name || 'E').charAt(0)}</div>`;

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8"/>
  <title>Rapport — ${selectedClass?.name} — ${period.label}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Arial,sans-serif;font-size:11.5px;color:#111;background:#fff}
    .page{padding:16mm 14mm}
    /* ── En-tête établissement ── */
    .hdr{display:flex;align-items:flex-start;gap:14px;border-bottom:2.5px solid #4f46e5;padding-bottom:12px;margin-bottom:14px}
    .hdr-logo{flex-shrink:0}
    .hdr-school{flex:1}
    .hdr-school h1{font-size:15px;font-weight:800;letter-spacing:-.3px}
    .hdr-school p{font-size:10px;color:#555;margin-top:2px;line-height:1.5}
    .hdr-report{text-align:right;flex-shrink:0}
    .hdr-report h2{font-size:13px;font-weight:700;color:#4f46e5}
    .hdr-report p{font-size:10px;color:#6b7280;margin-top:2px}
    /* ── Stats ── */
    .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px}
    .stat{border:1px solid #e5e7eb;border-radius:8px;padding:9px 8px;text-align:center}
    .stat-val{font-size:19px;font-weight:800}
    .stat-lbl{font-size:9.5px;color:#6b7280;margin-top:2px;font-weight:600;text-transform:uppercase;letter-spacing:.03em}
    /* ── Tableaux ── */
    h3{font-size:12px;font-weight:700;margin:14px 0 7px;padding-left:4px;border-left:3px solid #4f46e5}
    table{width:100%;border-collapse:collapse;font-size:10.5px;margin-bottom:6px}
    thead th{background:#f9fafb;border-bottom:1.5px solid #e5e7eb;padding:5px 7px;text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:.05em;color:#6b7280;font-weight:700}
    tbody td{padding:5px 7px;border-bottom:1px solid #f3f4f6}
    tbody tr:nth-child(even) td{background:#fafafa}
    /* ── Pied ── */
    .footer{margin-top:20px;border-top:1px solid #e5e7eb;padding-top:12px;display:flex;justify-content:space-between}
    .sign-box{text-align:center;width:180px}
    .sign-line{border-bottom:1px solid #aaa;margin-bottom:4px;height:32px}
    .sign-lbl{font-size:9.5px;color:#555}
    @media print{
      @page{margin:12mm;size:A4 portrait}
      body{padding:0}
      .page{padding:0}
    }
  </style>
</head>
<body>
<div class="page">
  <div class="hdr">
    <div class="hdr-logo">${logoTag}</div>
    <div class="hdr-school">
      <h1>${school?.name || 'Établissement'}</h1>
      <p>${[school?.type, school?.region, school?.division].filter(Boolean).join(' · ')}</p>
      ${school?.director ? `<p>Dir. : <strong>${school.director}</strong></p>` : ''}
      ${school?.address ? `<p>${school.address}</p>` : ''}
    </div>
    <div class="hdr-report">
      <h2>Rapport de résultats</h2>
      <p><strong>${selectedClass?.name}</strong> · ${period.label}</p>
      <p>Année : ${school?.current_year || '—'}</p>
      <p style="margin-top:4px;color:#9ca3af">${today}</p>
    </div>
  </div>

  <div class="stats">
    <div class="stat">
      <div class="stat-val">${stats?.total ?? classStudents.length}</div>
      <div class="stat-lbl">Effectif</div>
    </div>
    <div class="stat">
      <div class="stat-val" style="color:#4f46e5">${stats?.avg != null ? stats.avg : '—'}<span style="font-size:12px;font-weight:400;color:#9ca3af">/${maxScale}</span></div>
      <div class="stat-lbl">Moyenne classe</div>
    </div>
    <div class="stat">
      <div class="stat-val" style="color:${passRateGlobal !== null ? (passRateGlobal >= 50 ? '#059669' : '#ef4444') : '#9ca3af'}">${passRateGlobal !== null ? passRateGlobal + '%' : '—'}</div>
      <div class="stat-lbl">Taux de réussite</div>
    </div>
    <div class="stat">
      <div class="stat-val">${stats?.above ?? '—'}<span style="font-size:12px;font-weight:400;color:#9ca3af"> / ${stats?.total ?? ''}</span></div>
      <div class="stat-lbl">Admis</div>
    </div>
  </div>

  <h3>Classement des élèves</h3>
  <table>
    <thead><tr>
      <th style="width:36px">Rang</th>
      <th>Nom complet</th>
      ${thMatricule}
      <th style="width:75px">Moy. /${maxScale}</th>
      ${thAppreciation}
      ${thDecision}
    </tr></thead>
    <tbody>${rankRows}</tbody>
  </table>

  ${subjectTable ? `
  <h3>Résultats par matière</h3>
  <table>
    <thead><tr>
      <th>Matière</th>
      <th style="width:38px">Coef</th>
      <th style="width:70px">Moy. classe</th>
      <th style="width:44px">Min</th>
      <th style="width:44px">Max</th>
      <th style="width:58px">Admis</th>
      <th style="width:55px">Taux</th>
    </tr></thead>
    <tbody>${subRows}</tbody>
  </table>` : ''}

  <div class="footer">
    <div class="sign-box">
      <div class="sign-line"></div>
      <div class="sign-lbl">Le Censeur / DSCE</div>
    </div>
    <div class="sign-box" style="text-align:center">
      <div class="sign-lbl" style="margin-bottom:2px;font-weight:700">Cachet de l'établissement</div>
      <div style="border:1px dashed #ccc;height:50px;border-radius:4px"></div>
    </div>
    <div class="sign-box">
      <div class="sign-line"></div>
      <div class="sign-lbl">Le Proviseur / Directeur</div>
    </div>
  </div>
</div>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=960,height=720');
  win.document.open();
  win.document.write(html);
  win.document.close();
  setTimeout(() => { win.focus(); win.print(); }, 400);
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
function PeriodPills({ periodKey, setPeriodKey, periodsForClass, isEN }) {
  const t = useT();
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

  const [classId,     setClassId]     = useState('');
  const [periodKey,   setPeriodKey]   = useState('seq_1');
  const [showPrintOpts, setShowPrintOpts] = useState(false);
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
  const passThreshold   = sys === 'FR' ? 10 : 50;
  const maxScale        = sys === 'FR' ? 20 : 100;
  const periodsForClass = isEN ? PERIODS_EN : PERIODS_FR;
  const period          = periodsForClass.find((p) => p.value === periodKey) || periodsForClass[0];

  useEffect(() => {
    const cls = classes.find((c) => c.id === classId);
    if (cls?.system === 'EN') setPeriodKey('term_1');
    else setPeriodKey('seq_1');
  }, [classId, classes]);

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
    return buildRanks(classStudents, gradeMap, classId, period.seqs, classSubjects, sys);
  }, [classStudents, classSubjects, gradeMap, classId, period.seqs, sys]);

  const stats = useMemo(() => {
    if (!classStudents.length || !classSubjects.length) return null;
    return clsStat(classStudents, gradeMap, classId, period.seqs, classSubjects, sys);
  }, [classStudents, classSubjects, gradeMap, classId, period.seqs, sys]);

  const studentResults = useMemo(() => {
    return classStudents.map((student) => {
      const scores = {};
      classSubjects.forEach((sub) => {
        const avg = subjectAvgForStudent(sub.id, student.id, classId, period.seqs, gradeMap);
        if (avg !== null) scores[sub.id] = String(avg);
      });
      const avg  = getAvg(scores, classSubjects, sys);
      const rank = ranks.find((r) => r.id === student.id) || null;
      const appr = avg !== null ? (sys === 'FR' ? frApp(avg) : enGrade(avg)) : null;
      return { student, avg, rank, appr };
    }).sort((a, b) => {
      if (a.avg === null && b.avg === null) return 0;
      if (a.avg === null) return 1;
      if (b.avg === null) return -1;
      return b.avg - a.avg;
    });
  }, [classStudents, classSubjects, classId, period.seqs, gradeMap, sys, ranks]);

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
          sys === 'FR' ? (appr?.text || '') : (appr ? `${appr.g} - ${appr.txt}` : ''),
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
          <div className="min-w-[200px]">
            <label className="form-label">{t('Classe', 'Class')}</label>
            <select className="form-input" value={classId} onChange={(e) => setClassId(e.target.value)}>
              <option value="">{t('— Choisir une classe', '— Choose a class')}</option>
              {classes.map((c) => (
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
              />
            </div>
          )}

          {hasData && (
            <div className="flex gap-2 flex-wrap ml-auto items-end">
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
                onClick={() => printReport({ school, selectedClass, period, stats, studentResults, subjectStats, classStudents, maxScale, passThreshold, sys, cols })}
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
                  {classes.map((cls) => {
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
                            {sys === 'FR' ? (appr?.text || '—') : (appr ? `${appr.g}` : '—')}
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
