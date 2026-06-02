import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useAuthStore } from '../store/authStore';
import { useSchoolStore } from '../store/schoolStore';
import { useUiStore } from '../store/uiStore';
import { usePlan, getStarterPrintRemaining, incrementDailyPrint, STARTER_DAILY_PRINT_LIMIT } from '../lib/plan';
import {
  getAvg, frApp, enGrade, getAppreciation, buildRanks, clsStat,
} from '../core/bulletinEngine';
import Layout from '../components/Layout';
import '../styles/bulletin.css';
import { useT } from '../lib/i18n';
import BoletinGE from '../components/bulletins/BoletinGE';
import BoletinGEDetalle from '../components/bulletins/BoletinGEDetalle';
import BulletinTheme from '../components/bulletins/BulletinTheme';
import { resolveCountryCode } from '../countries';
import { gradingOpts, geGradeMax } from '../lib/useCountry';

// ── Helpers avatar ───────────────────────────────────────────────────────────
const AVT_COLORS = [
  '#6366f1','#8b5cf6','#ec4899','#f59e0b','#10b981',
  '#3b82f6','#ef4444','#14b8a6','#f97316','#84cc16',
];
function avatarColor(name = '') {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff;
  return AVT_COLORS[Math.abs(h) % AVT_COLORS.length];
}
function initials(name = '') {
  return name.split(' ').slice(0, 2).map((w) => w[0] || '').join('').toUpperCase();
}


// ── Périodes système anglophone (3 Terms) ─────────────────────────────────────
const PERIODS_EN = [
  { value: 'term_1', label: 'Term 1',  short: 'T1',   seqs: [1] },
  { value: 'term_2', label: 'Term 2',  short: 'T2',   seqs: [2] },
  { value: 'term_3', label: 'Term 3',  short: 'T3',   seqs: [3] },
  { value: 'annuel', label: 'Annual',  short: 'Ann.', seqs: [1, 2, 3] },
];


// ── Helper i18n bulletin (basé sur sys de la classe, indépendant de la langue UI)
const L = (sys, fr, en) => (sys === 'EN' ? en : fr);

// ── Constantes conduite ───────────────────────────────────────────────────────
const CONDUITE_LABELS    = { TB: 'Très Bien', B: 'Bien', AB: 'Assez Bien', P: 'Passable', M: 'Mauvaise' };
const CONDUITE_LABELS_EN = { TB: 'Very Good', B: 'Good', AB: 'Fairly Good', P: 'Passable', M: 'Poor'    };
const CONDUITE_COLORS    = { TB: '#7c3aed', B: '#059669', AB: '#0284c7', P: '#d97706', M: '#dc2626' };
const conduiteLabel = (sys, code) => (sys === 'EN' ? CONDUITE_LABELS_EN : CONDUITE_LABELS)[code] || code;

function getAbsCond(gradeMap, classId, studentId, seqs) {
  let absJ = 0, absNJ = 0;
  const conduites = [];
  let th = false, encouragement = false, felicitation = false;
  let averTravail = 0, blameTravail = 0, exclusions = 0, averConduite = 0, blameConduite = 0;

  for (const seq of seqs) {
    const s = gradeMap[`${classId}_${studentId}_${seq}`] || {};
    if (s['__abs_j__'])    absJ  += parseInt(s['__abs_j__'],  10) || 0;
    if (s['__abs_nj__'])   absNJ += parseInt(s['__abs_nj__'], 10) || 0;
    if (s['__conduite__']) conduites.push(s['__conduite__']);
    // Conseil de classe — last sequence wins (decision set at end of term)
    if (s['__th__'] !== undefined)            th            = s['__th__']            === 'true';
    if (s['__encouragement__'] !== undefined) encouragement = s['__encouragement__'] === 'true';
    if (s['__felicitation__'] !== undefined)  felicitation  = s['__felicitation__']  === 'true';
    if (s['__aver_travail__'])   averTravail  = parseInt(s['__aver_travail__'],  10) || 0;
    if (s['__blame_travail__'])  blameTravail = parseInt(s['__blame_travail__'], 10) || 0;
    if (s['__exclusions__'])     exclusions   = parseInt(s['__exclusions__'],    10) || 0;
    if (s['__aver_conduite__'])  averConduite = parseInt(s['__aver_conduite__'], 10) || 0;
    if (s['__blame_conduite__']) blameConduite= parseInt(s['__blame_conduite__'],10) || 0;
  }

  const conduite = conduites.length ? conduites[conduites.length - 1] : null;
  return { absJ, absNJ, conduite, th, encouragement, felicitation, averTravail, blameTravail, exclusions, averConduite, blameConduite };
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function subjectGrade(subject, studentId, classId, seqs, gradeMap) {
  const vals = seqs
    .map((seq) => {
      const v = (gradeMap[`${classId}_${studentId}_${seq}`] || {})[subject.id];
      return !v || v === 'ABS' || v === '' ? null : parseFloat(v);
    })
    .filter((x) => x !== null && !isNaN(x));
  if (!vals.length) return null;
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100;
}

function seqGrade(subjectId, studentId, classId, seq, gradeMap) {
  const v = (gradeMap[`${classId}_${studentId}_${seq}`] || {})[subjectId];
  return !v || v === 'ABS' || v === '' ? null : parseFloat(v);
}

function apcLevel(grade, maxScale) {
  if (grade === null) return { label: 'Non évalué', col: '#9ca3af', short: 'NE' };
  const pct = (grade / maxScale) * 100;
  if (pct < 50) return { label: 'Non acquis',  col: '#dc2626', short: 'NA' };
  if (pct < 65) return { label: 'En cours',    col: '#d97706', short: 'EC' };
  if (pct < 80) return { label: 'Acquis',      col: '#059669', short: 'AQ' };
  return             { label: 'Bien acquis',   col: '#7c3aed', short: 'BA' };
}

// ── APC Subject Groups ────────────────────────────────────────────────────────
const APC_GROUPS = [
  { key: 'SCIENCES_EXACTES',  label: 'SCIENCES EXACTES / EXACT SCIENCES'  },
  { key: 'LANGUES',           label: 'LANGUES / LANGUAGES'                 },
  { key: 'SCIENCES_HUMAINES', label: 'SCIENCES HUMAINES / SOCIAL SCIENCES' },
  { key: 'ARTS_SPORTS',       label: 'ARTS ET SPORTS / ARTS & SPORTS'      },
  { key: 'AUTRES',            label: 'AUTRES MATIÈRES / OTHER SUBJECTS'    },
];

function getSubjectGroup(name) {
  const n = (name || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (/math|physique|chimie|svt|bio|informatique|numerique|technologie|s\.p\.c|s\.v\.t|physics|chemistry|biology|computer|science/.test(n)) return 'SCIENCES_EXACTES';
  if (/franc|anglais|espagnol|allemand|arabe|latin|langue|litterature|lecture|expression|communication|english|french|spanish|german|arabic|national language/.test(n)) return 'LANGUES';
  if (/histoire|geo|economie|philo|morale|civique|social|humain|epsp|epm|droit|juridique|history|geography|economics|civic|philosophy/.test(n)) return 'SCIENCES_HUMAINES';
  if (/art|musique|eps|sport|dessin|plastique|manuelle?|physical education|fine arts|music/.test(n)) return 'ARTS_SPORTS';
  return 'AUTRES';
}

// ── Bulletin Classique ────────────────────────────────────────────────────────
function BulletinClassic({ school, cls, student, subjects, subjectGrades, studentAvg, rank, stats, period, sys, teachers, gradeMap, classId }) {
  const passThreshold = sys === 'FR' ? 10 : 50;
  const maxScale      = sys === 'FR' ? 20 : 100;
  const passed        = studentAvg !== null && studentAvg >= passThreshold;
  const decision      = sys === 'FR' ? (passed ? 'Admis(e)' : 'Ajourné(e)') : (passed ? 'Passed' : 'Failed');
  const apprGlobal    = getAppreciation(studentAvg, school?.grade_scale, sys);
  const { absJ, absNJ, conduite } = getAbsCond(gradeMap, classId, student.id, period.seqs);

  return (
    <div className="bulletin-paper">
      <div className="bulletin-header">
        <div>
          <strong>RÉPUBLIQUE DU CAMEROUN</strong><br />
          Paix – Travail – Patrie<br />————————<br />
          <em>{school?.region || ''}</em>
        </div>
        <div className="bulletin-logo">
          {school?.logo_url
            ? <img src={school.logo_url} alt="Logo" style={{ width: 90, height: 90, objectFit: 'contain' }} />
            : '📚'
          }
        </div>
        <div>
          <strong>REPUBLIC OF CAMEROON</strong><br />
          Peace – Work – Fatherland<br />————————<br />
          <em>{school?.region || ''}</em>
        </div>
      </div>

      <div className="bulletin-school">
        <h1>{school?.name || 'Établissement'}</h1>
        <p>
          {school?.address ? `B.P. ${school.address} · ` : ''}
          {school?.phone || ''}
          {school?.type ? ` · Ens. ${school.type}` : ''}
        </p>
        <p>Année scolaire : <strong>{school?.current_year || '—'}</strong></p>
      </div>

      <div className="bulletin-title">
        {sys === 'EN'
          ? (period.seqs.length === 1 ? `Report Card — ${period.label}` : `Term Report — ${period.label}`)
          : (period.seqs.length === 1 ? `Bulletin de Notes — ${period.label}` : `Bulletin Trimestriel — ${period.label}`)
        }
        {sys !== 'EN' && (
          <>{' / '}{period.seqs.length === 1 ? `Report Card — ${period.label}` : `Term Report — ${period.label}`}</>
        )}
      </div>

      <div className="bulletin-student">
        <div className="bulletin-student-grid">
          <div><strong>{sys === 'EN' ? 'Name' : 'Nom / Name'} :</strong>&nbsp;{student.name}</div>
          <div><strong>Matricule :</strong>&nbsp;{student.matricule || '—'}</div>
          <div><strong>{sys === 'EN' ? 'Class' : 'Classe / Class'} :</strong>&nbsp;{cls?.name || '—'}</div>
          <div><strong>{sys === 'EN' ? 'Sex' : 'Sexe / Sex'} :</strong>&nbsp;{student.gender || '—'}</div>
          <div><strong>{sys === 'EN' ? 'Rank' : 'Rang / Rank'} :</strong>&nbsp;{rank?.rankD || '—'} / {stats?.total ?? '—'}</div>
          <div><strong>{sys === 'EN' ? 'Total' : 'Effectif / Total'} :</strong>&nbsp;{stats?.total ?? '—'}</div>
        </div>
      </div>

      <table className="bulletin-table">
        <thead>
          <tr>
            <th style={{ width: '35%', textAlign: 'left' }}>{sys === 'EN' ? 'Subject' : 'Matière / Subject'}</th>
            <th>{sys === 'FR' ? `Note/${maxScale}` : `Marks/${maxScale}`}</th>
            <th>Coef</th>
            <th>M×C</th>
            <th style={{ width: '25%' }}>{sys === 'FR' ? 'Appréciation' : 'Grade'}</th>
          </tr>
        </thead>
        <tbody>
          {subjects.map((sub) => {
            const grade    = subjectGrades[sub.id];
            const gradeStr = grade !== null ? String(grade) : 'ABS';
            const mxc      = grade !== null ? Math.round(grade * sub.coef * 100) / 100 : '—';
            const appr     = grade !== null
              ? getAppreciation(sys === 'FR' ? (grade / sub.max) * 20 : (grade / sub.max) * 100, school?.grade_scale, sys)
              : null;
            const subTeacher = teachers?.find((t) => t.id === sub.teacher_id);
            return (
              <tr key={sub.id}>
                <td className="subject-name">
                  <span>{sub.name}</span>
                  {subTeacher && (
                    <span style={{ display: 'block', fontSize: '0.7em', color: '#6b7280', fontWeight: 'normal' }}>
                      {subTeacher.name}
                    </span>
                  )}
                </td>
                <td className="grade-cell"
                    style={{ color: grade !== null ? (grade / sub.max >= passThreshold / maxScale ? '#059669' : '#dc2626') : '#6b7280' }}>
                  {gradeStr}
                </td>
                <td style={{ textAlign: 'center' }}>{sub.coef}</td>
                <td style={{ textAlign: 'center' }}>{mxc}</td>
                <td className="appreciation-cell" style={{ color: appr?.col || '#6b7280' }}>
                  {sys === 'FR' ? (appr?.text || '—') : (appr ? `${appr.g} — ${appr.txt}` : '—')}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="bulletin-bottom">
        <div className="bulletin-box">
          <div className="bulletin-box-title">{sys === 'EN' ? 'Results' : 'Résultats / Results'}</div>
          <div className="bulletin-box-body">
            <p><span>{sys === 'EN' ? 'Average' : 'Moyenne / Average'}</span>
              <strong style={{ color: passed ? '#059669' : '#dc2626' }}>
                {studentAvg !== null ? `${studentAvg}/${maxScale}` : '—'}
              </strong>
            </p>
            <p><span>{sys === 'EN' ? 'Rank' : 'Rang / Rank'}</span><strong>{rank?.rankD || '—'} / {stats?.total ?? '—'}</strong></p>
            <p><span>{sys === 'EN' ? 'Grade' : 'Appréciation'}</span>
              <strong style={{ color: apprGlobal?.col }}>
                {sys === 'FR' ? apprGlobal?.text : (apprGlobal ? `${apprGlobal.g} — ${apprGlobal.txt}` : '—')}
              </strong>
            </p>
            <p><span>{sys === 'EN' ? 'Decision' : 'Décision / Decision'}</span>
              <strong style={{ color: passed ? '#059669' : '#dc2626' }}>{decision}</strong>
            </p>
          </div>
        </div>
        <div className="bulletin-box">
          <div className="bulletin-box-title">{sys === 'EN' ? 'Class Statistics' : 'Statistiques de classe / Class Stats'}</div>
          <div className="bulletin-box-body">
            <p><span>{sys === 'EN' ? 'Total' : 'Effectif / Total'}</span><strong>{stats?.total ?? '—'}</strong></p>
            <p><span>{sys === 'EN' ? 'Class Average' : 'Moy. classe / Class avg'}</span>
              <strong>{stats?.avg != null ? `${stats.avg}/${maxScale}` : '—'}</strong>
            </p>
            <p><span>{sys === 'EN' ? 'Highest' : 'Note max / Highest'}</span>
              <strong>{stats?.max != null ? `${stats.max}/${maxScale}` : '—'}</strong>
            </p>
            <p><span>{sys === 'EN' ? 'Lowest' : 'Note min / Lowest'}</span>
              <strong>{stats?.min != null ? `${stats.min}/${maxScale}` : '—'}</strong>
            </p>
            <p><span>{sys === 'EN' ? 'Pass Rate' : 'Taux réussite / Pass rate'}</span>
              <strong>
                {stats?.above != null && stats?.total
                  ? `${stats.above}/${stats.total} (${Math.round((stats.above / stats.total) * 100)}%)`
                  : '—'}
              </strong>
            </p>
          </div>
        </div>
      </div>

      <div className="bulletin-absences-row">
        <span>{sys === 'EN' ? 'Justified absences' : 'Absences justifiées / Just. absences'} : <strong>{absJ > 0 ? `${absJ} h` : '—'}</strong></span>
        <span>{sys === 'EN' ? 'Unjustified absences' : 'Absences non justifiées / Unjust. absences'} : <strong>{absNJ > 0 ? `${absNJ} h` : '—'}</strong></span>
        {conduite && (
          <span>
            {sys === 'EN' ? 'Conduct' : 'Conduite / Conduct'} :&nbsp;
            <strong style={{ color: CONDUITE_COLORS[conduite] }}>
              {conduite} — {CONDUITE_LABELS[conduite]}
            </strong>
          </span>
        )}
      </div>

      <div className="bulletin-remark">
        <div className="bulletin-remark-title">{sys === 'EN' ? 'Remarks' : 'Observations / Remarks'}</div>
      </div>
      <div className="bulletin-signatures">
        <div className="bulletin-sig-block">
          {school?.signature_url && (
            <img src={school.signature_url} alt="Signature" className="bulletin-sig-img" />
          )}
          {school?.stamp_url && (
            <img src={school.stamp_url} alt="Tampon" className="bulletin-stamp-img" />
          )}
          <span>{sys === 'EN' ? 'The Principal' : <>Le Directeur<br />The Principal</>}</span>
        </div>
        <div>{sys === 'EN' ? 'Form Master' : <>Le Prof. Principal<br />The Form Master</>}</div>
        <div>{sys === 'EN' ? 'Parent / Guardian' : <>Parent / Tuteur<br />Parent / Guardian</>}</div>
      </div>
    </div>
  );
}

// ── Bulletin Moderne ──────────────────────────────────────────────────────────
function BulletinModern({ school, cls, student, subjects, subjectGrades, studentAvg, rank, stats, period, sys, teachers, gradeMap, classId }) {
  const passThreshold = sys === 'FR' ? 10 : 50;
  const maxScale      = sys === 'FR' ? 20 : 100;
  const passed        = studentAvg !== null && studentAvg >= passThreshold;
  const decision      = sys === 'FR' ? (passed ? 'Admis(e)' : 'Ajourné(e)') : (passed ? 'Passed' : 'Failed');
  const apprGlobal    = getAppreciation(studentAvg, school?.grade_scale, sys);
  const { absJ, absNJ, conduite } = getAbsCond(gradeMap, classId, student.id, period.seqs);

  const isAnnuel  = period.value === 'annuel';
  const isEN_m    = sys === 'EN';
  const termSeqsM = isAnnuel ? (isEN_m ? [[1],[2],[3]] : [[1,2],[3,4],[5,6]]) : null;
  const termLblM  = isAnnuel ? ['T1','T2','T3'] : null;

  function termAvgM(subId, seqs) {
    const vals = seqs.map((i) => {
      const v = (gradeMap[`${classId}_${student.id}_${i}`] || {})[subId];
      return !v || v === 'ABS' || v === '' ? null : parseFloat(v);
    }).filter((x) => x !== null && !isNaN(x));
    if (!vals.length) return null;
    return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100;
  }

  return (
    <div className="bulletin-paper bulletin-modern">
      <div className="bm-header-band">
        <div className="bm-logo-circle">
          {school?.logo_url
            ? <img src={school.logo_url} alt="Logo" style={{ width: 40, height: 40, objectFit: 'contain' }} />
            : '📚'
          }
        </div>
        <div className="bm-header-text">
          <div className="bm-school-name">{school?.name || 'Établissement'}</div>
          <div className="bm-school-meta">
            {[school?.region, school?.type ? `Ens. ${school.type}` : null, school?.current_year ? `Année ${school.current_year}` : null]
              .filter(Boolean).join(' · ')}
          </div>
        </div>
        <div className="bm-period-badge">{period.short}</div>
      </div>

      <div className="bm-student-card">
        <div className="bm-student-name">{student.name}</div>
        <div className="bm-student-meta">
          <span>{cls?.name || '—'}</span>
          {student.matricule && <><span>·</span><span>Mat. {student.matricule}</span></>}
          {student.gender && <><span>·</span><span>{student.gender}</span></>}
        </div>
        <div className="bm-student-rank">
          <span>{sys === 'EN' ? 'Rank' : 'Rang'}&nbsp;<strong>{rank?.rankD || '—'}</strong>&thinsp;/&thinsp;{stats?.total ?? '—'}</span>
          <span>{sys === 'EN' ? 'Average' : 'Moyenne'}&nbsp;
            <strong style={{ color: passed ? '#059669' : '#dc2626' }}>
              {studentAvg !== null ? `${studentAvg}/${maxScale}` : '—'}
            </strong>
          </span>
          <span style={{ color: passed ? '#059669' : '#dc2626', fontWeight: 700 }}>{decision}</span>
        </div>
      </div>

      <table className="bulletin-table bm-table">
        <thead>
          <tr>
            <th style={{ width: isAnnuel ? '28%' : '38%', textAlign: 'left' }}>{sys === 'EN' ? 'Subject' : 'Matière'}</th>
            {isAnnuel && <th style={{ fontSize: '0.8em' }}>{termLblM[0]}/{maxScale}</th>}
            {isAnnuel && <th style={{ fontSize: '0.8em' }}>{termLblM[1]}/{maxScale}</th>}
            {isAnnuel && <th style={{ fontSize: '0.8em' }}>{termLblM[2]}/{maxScale}</th>}
            <th>{isAnnuel ? `Moy.Ann/${maxScale}` : (sys === 'EN' ? `Marks/${maxScale}` : `Note/${maxScale}`)}</th>
            <th>Coef</th>
            <th>M×C</th>
            <th style={{ width: '22%' }}>{sys === 'EN' ? 'Grade' : 'Appréciation'}</th>
          </tr>
        </thead>
        <tbody>
          {subjects.map((sub) => {
            const grade    = subjectGrades[sub.id];
            const gradeStr = grade !== null ? String(grade) : 'ABS';
            const mxc      = grade !== null ? Math.round(grade * sub.coef * 100) / 100 : '—';
            const pct      = grade !== null ? grade / sub.max : null;
            const appr     = grade !== null
              ? getAppreciation(sys === 'FR' ? (grade / sub.max) * 20 : (grade / sub.max) * 100, school?.grade_scale, sys)
              : null;
            const subTeacher = teachers?.find((t) => t.id === sub.teacher_id);
            const gradeColor = grade !== null
              ? (grade / sub.max >= passThreshold / maxScale ? '#059669' : '#dc2626')
              : '#9ca3af';
            const mt1 = isAnnuel ? termAvgM(sub.id, termSeqsM[0]) : null;
            const mt2 = isAnnuel ? termAvgM(sub.id, termSeqsM[1]) : null;
            const mt3 = isAnnuel ? termAvgM(sub.id, termSeqsM[2]) : null;
            return (
              <tr key={sub.id}>
                <td className="subject-name">
                  <span>{sub.name}</span>
                  {subTeacher && (
                    <span style={{ display: 'block', fontSize: '0.7em', color: '#6b7280', fontWeight: 'normal' }}>
                      {subTeacher.name}
                    </span>
                  )}
                  {pct !== null && (
                    <div className="bm-progress-bar">
                      <div className="bm-progress-fill" style={{ width: `${Math.min(pct * 100, 100)}%`, background: gradeColor }} />
                    </div>
                  )}
                </td>
                {isAnnuel && <td style={{ textAlign: 'center', color: '#374151' }}>{mt1 !== null ? mt1 : '—'}</td>}
                {isAnnuel && <td style={{ textAlign: 'center', color: '#374151' }}>{mt2 !== null ? mt2 : '—'}</td>}
                {isAnnuel && <td style={{ textAlign: 'center', color: '#374151' }}>{mt3 !== null ? mt3 : '—'}</td>}
                <td className="grade-cell" style={{ color: gradeColor, fontWeight: 700 }}>{gradeStr}</td>
                <td style={{ textAlign: 'center' }}>{sub.coef}</td>
                <td style={{ textAlign: 'center' }}>{mxc}</td>
                <td className="appreciation-cell" style={{ color: appr?.col || '#9ca3af' }}>
                  {sys === 'FR' ? (appr?.text || '—') : (appr ? `${appr.g} — ${appr.txt}` : '—')}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="bm-metrics">
        {[
          { label: sys === 'EN' ? 'General Average' : 'Moyenne générale', value: studentAvg !== null ? `${studentAvg}/${maxScale}` : '—', color: passed ? '#059669' : '#dc2626' },
          { label: sys === 'EN' ? 'Rank'            : 'Rang',             value: `${rank?.rankD || '—'} / ${stats?.total ?? '—'}` },
          { label: sys === 'EN' ? 'Grade'           : 'Appréciation',     value: sys === 'FR' ? (apprGlobal?.text || '—') : (apprGlobal ? apprGlobal.g : '—'), color: apprGlobal?.col },
          { label: sys === 'EN' ? 'Class Average'   : 'Moy. classe',      value: stats?.avg != null ? `${stats.avg}/${maxScale}` : '—' },
          { label: sys === 'EN' ? 'Pass Rate'       : 'Taux réussite',    value: stats?.above != null && stats?.total ? `${Math.round((stats.above / stats.total) * 100)} %` : '—' },
          { label: sys === 'EN' ? 'Decision'        : 'Décision',         value: decision, color: passed ? '#059669' : '#dc2626' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bm-metric">
            <div className="bm-metric-label">{label}</div>
            <div className="bm-metric-value" style={{ color: color || '#111827' }}>{value}</div>
          </div>
        ))}
      </div>

      <div className="bulletin-absences-row">
        <span>{sys === 'EN' ? 'Just. absences' : 'Absences just.'} : <strong>{absJ > 0 ? `${absJ} h` : '—'}</strong></span>
        <span>{sys === 'EN' ? 'Unjust. absences' : 'Absences n.just.'} : <strong>{absNJ > 0 ? `${absNJ} h` : '—'}</strong></span>
        {conduite && (
          <span>{sys === 'EN' ? 'Conduct' : 'Conduite'} : <strong style={{ color: CONDUITE_COLORS[conduite] }}>{conduite} — {CONDUITE_LABELS[conduite]}</strong></span>
        )}
      </div>

      <div className="bm-remark">
        <div className="bm-remark-label">{sys === 'EN' ? 'Remarks' : 'Observations'}</div>
      </div>
      <div className="bm-signatures">
        <div className="bm-sig bulletin-sig-block">
          {school?.signature_url && (
            <img src={school.signature_url} alt="Signature" className="bulletin-sig-img" />
          )}
          {school?.stamp_url && (
            <img src={school.stamp_url} alt="Tampon" className="bulletin-stamp-img" />
          )}
          {sys === 'EN' ? 'The Principal' : 'Le Directeur'}
        </div>
        <div className="bm-sig">{sys === 'EN' ? 'Form Master' : 'Prof. Principal'}</div>
        <div className="bm-sig">{sys === 'EN' ? 'Parent / Guardian' : 'Parent / Tuteur'}</div>
      </div>
    </div>
  );
}

// ── Bulletin APC ──────────────────────────────────────────────────────────────
function BulletinAPC({ school, cls, student, subjects, subjectGrades, studentAvg, rank, stats, period, sys, teachers, gradeMap, classId, classStudents = [] }) {
  const isEnSys    = sys === 'EN';
  const passThr    = isEnSys ? 50 : 10;
  const maxScale   = isEnSys ? 100 : 20;
  const passed     = studentAvg !== null && studentAvg >= passThr;
  const decision   = isEnSys ? (passed ? 'PASSED' : 'FAILED') : (passed ? 'ADMIS(E)' : 'AJOURNÉ(E)');
  const apprGlobal = getAppreciation(studentAvg, school?.grade_scale, sys);
  const { absJ, absNJ, conduite, th, encouragement, felicitation, averTravail, blameTravail, exclusions, averConduite, blameConduite } = getAbsCond(gradeMap, classId, student.id, period.seqs);
  const isAnnuel    = period.value === 'annuel';
  const isEN        = sys === 'EN';
  const isTrimestre = !isAnnuel && period.seqs.length > 1;
  const termSeqs    = isAnnuel ? (isEN ? [[1],[2],[3]] : [[1,2],[3,4],[5,6]]) : null;
  const termLabel   = isAnnuel ? ['T1','T2','T3'] : null;

  function termAvg(subId, seqs) {
    const vals = seqs.map((i) => {
      const v = (gradeMap[`${classId}_${student.id}_${i}`] || {})[subId];
      return !v || v === 'ABS' || v === '' ? null : parseFloat(v);
    }).filter((x) => x !== null && !isNaN(x));
    if (!vals.length) return null;
    return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100;
  }

  function getSubjectRank(sub) {
    const myG = subjectGrades[sub.id];
    if (myG === null || myG === undefined) return '—';
    let r = 1;
    let total = 0;
    for (const s of classStudents) {
      const g = subjectGrade(sub, s.id, classId, period.seqs, gradeMap);
      if (g !== null) {
        total++;
        if (g > myG) r++;
      }
    }
    return total ? `${r}/${total}` : '—';
  }

  const grouped = {};
  APC_GROUPS.forEach((g) => { grouped[g.key] = []; });
  subjects.forEach((sub) => {
    const gk = getSubjectGroup(sub.name);
    (grouped[gk] || grouped['AUTRES']).push(sub);
  });

  function groupStats(subs) {
    let pts = 0, coefSum = 0;
    subs.forEach((sub) => {
      const g = subjectGrades[sub.id];
      if (g !== null && g !== undefined) {
        const on20 = sys === 'FR' ? g : Math.round((g / (sub.max || 100)) * 20 * 100) / 100;
        pts     += on20 * sub.coef;
        coefSum += sub.coef;
      }
    });
    return {
      avg:     coefSum ? Math.round((pts / coefSum) * 100) / 100 : null,
      coefSum,
      pts:     Math.round(pts * 100) / 100,
    };
  }

  const principalTeacher = teachers?.find((t) => t.id === cls?.teacher_id) || null;

  const termOrdinal = (() => {
    if (period.seqs.length >= 4) return isEnSys ? 'ANNUAL' : 'ANNUEL';
    const s = period.seqs[0];
    if (s <= 2) return isEnSys ? '1ST TERM' : '1er TRIMESTRE';
    if (s <= 4) return isEnSys ? '2ND TERM' : '2ème TRIMESTRE';
    return isEnSys ? '3RD TERM' : '3ème TRIMESTRE';
  })();

  const totalCols = isAnnuel ? 9 : isTrimestre ? 8 : 6;

  const border = '1px solid #374151';
  const cell   = { border, padding: '3px 5px', fontSize: '10px', verticalAlign: 'middle' };
  const thS    = { ...cell, backgroundColor: '#1e3a5f', color: '#fff', textAlign: 'center', fontWeight: 'bold', fontSize: '9px' };
  const ghdr   = { ...cell, backgroundColor: '#2d3748', color: '#fff', fontWeight: 'bold', textAlign: 'center', fontSize: '9px', padding: '2px 5px' };
  const gtot   = { ...cell, backgroundColor: '#e8edf2', fontWeight: 'bold', fontSize: '9px' };
  const info   = { ...cell, backgroundColor: '#f8fafc', fontSize: '9px' };

  return (
    <div className="bulletin-paper" style={{ fontFamily: 'Arial, sans-serif', fontSize: '10px', maxWidth: '210mm', margin: '0 auto', padding: '8px', boxSizing: 'border-box' }}>

      {/* HEADER */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '5px' }}>
        <tbody>
          <tr>
            <td style={{ width: '33%', textAlign: 'center', fontSize: '9px', lineHeight: 1.5, padding: '2px' }}>
              <strong>RÉPUBLIQUE DU CAMEROUN</strong><br />
              Paix – Travail – Patrie<br />
              ———————<br />
              Ministère des Enseignements Secondaires (MINESEC)<br />
              Délégation Régionale {school?.region || '—'}<br />
              Délégation Départementale {school?.division || '—'}
            </td>
            <td style={{ width: '34%', textAlign: 'center', padding: '2px' }}>
              {school?.logo_url && (
                <img src={school.logo_url} alt="Logo" style={{ width: 64, height: 64, objectFit: 'contain', display: 'block', margin: '0 auto 3px' }} />
              )}
              <strong style={{ fontSize: '11px', display: 'block' }}>{(school?.name || '').toUpperCase()}</strong>
              {(school?.address || school?.phone) && (
                <span style={{ fontSize: '8.5px' }}>
                  {school?.address ? `B.P. ${school.address}` : ''}{school?.address && school?.phone ? ' · ' : ''}{school?.phone || ''}
                </span>
              )}
              <br />
              <span style={{ fontSize: '8.5px' }}>Année scolaire : <strong>{school?.current_year || '—'}</strong></span>
            </td>
            <td style={{ width: '33%', textAlign: 'center', fontSize: '9px', lineHeight: 1.5, padding: '2px' }}>
              <strong>REPUBLIC OF CAMEROON</strong><br />
              Peace – Work – Fatherland<br />
              ———————<br />
              Ministry of Secondary Education (MINESEC)<br />
              Regional Delegation {school?.region || '—'}<br />
              Divisional Delegation {school?.division || '—'}
            </td>
          </tr>
        </tbody>
      </table>

      {/* TITLE BAR */}
      <div style={{ backgroundColor: '#1e3a5f', color: '#fff', textAlign: 'center', padding: '5px 8px', fontWeight: 'bold', fontSize: '11px', letterSpacing: '0.5px', marginBottom: '5px' }}>
        {isEnSys ? 'REPORT CARD' : 'BULLETIN SCOLAIRE'} – {(!isTrimestre && !isAnnuel) ? `${termOrdinal} – ` : ''}{period.label.toUpperCase()}
      </div>

      {/* STUDENT INFO */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '5px' }}>
        <tbody>
          <tr>
            <td style={{ ...info, width: '25%' }}><strong>{L(sys, 'NOM ET PRÉNOM', 'FULL NAME')} :</strong><br /><span style={{ fontWeight: 'bold', color: '#111' }}>{student.name}</span></td>
            <td style={{ ...info, width: '12%' }}><strong>{L(sys, 'MATRICULE', 'REG. NO.')} :</strong><br />{student.matricule || '—'}</td>
            <td style={{ ...info, width: '13%' }}><strong>{L(sys, 'DATE DE NAISS.', 'DATE OF BIRTH')} :</strong><br />{student.date_naissance || '—'}</td>
            <td style={{ ...info, width: '22%' }}><strong>{L(sys, 'ENS. PRINCIPAL', 'FORM MASTER')} :</strong><br />{principalTeacher?.name || '—'}</td>
            <td style={{ ...info, width: '14%' }}><strong>{L(sys, 'CLASSE', 'CLASS')} :</strong><br />{cls?.name || '—'}</td>
            <td style={{ ...info, width: '14%', textAlign: 'center' }}><strong>{L(sys, 'EFFECTIF', 'TOTAL')} :</strong><br /><strong style={{ fontSize: '14px' }}>{stats?.total ?? '—'}</strong></td>
          </tr>
        </tbody>
      </table>

      {/* SUBJECT TABLE */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '5px' }}>
        <thead>
          <tr>
            <th style={{ ...thS, width: isAnnuel ? '22%' : isTrimestre ? '28%' : '34%', textAlign: 'left' }}>{L(sys, 'MATIÈRES', 'SUBJECTS')}</th>
            {isAnnuel && <th style={{ ...thS, width: '8%' }}>{termLabel[0]}/20</th>}
            {isAnnuel && <th style={{ ...thS, width: '8%' }}>{termLabel[1]}/20</th>}
            {isAnnuel && <th style={{ ...thS, width: '8%' }}>{termLabel[2]}/20</th>}
            {isAnnuel && <th style={{ ...thS, width: '9%' }}>{L(sys, 'Moy.Ann', 'Ann.Avg')}/20</th>}
            {!isAnnuel && isTrimestre && <th style={{ ...thS, width: '9%' }}>{L(sys, 'SEQ', 'SEQ')} {period.seqs[0]} /20</th>}
            {!isAnnuel && isTrimestre && <th style={{ ...thS, width: '9%' }}>{L(sys, 'SEQ', 'SEQ')} {period.seqs[1]} /20</th>}
            {!isAnnuel && <th style={{ ...thS, width: '11%' }}>{isTrimestre ? L(sys, 'MOY /20', 'AVG /20') : `${L(sys, 'SEQ', 'SEQ')} ${period.seqs[0]} /20`}</th>}
            <th style={{ ...thS, width: '7%' }}>COEF</th>
            <th style={{ ...thS, width: '9%' }}>TOTAL</th>
            <th style={{ ...thS, width: '8%' }}>{L(sys, 'RANG', 'RANK')}</th>
            <th style={{ ...thS, width: isTrimestre ? '19%' : '21%' }}>{L(sys, 'APPRÉCIATION', 'GRADE')}</th>
          </tr>
        </thead>

        {APC_GROUPS.map((group) => {
          const subs = grouped[group.key] || [];
          if (!subs.length) return null;
          const gs      = groupStats(subs);
          const gApprIn = gs.avg !== null ? (isEnSys ? gs.avg * 5 : gs.avg) : null;
          const gAppr   = getAppreciation(gApprIn, school?.grade_scale, sys);
          const gPassed = gs.avg !== null && gs.avg >= 10;

          return (
            <tbody key={group.key}>
              <tr>
                <td colSpan={totalCols} style={ghdr}>{group.label}</td>
              </tr>

              {subs.map((sub) => {
                const rawG   = subjectGrades[sub.id];
                const on20   = rawG !== null && rawG !== undefined
                  ? (sys === 'FR' ? rawG : Math.round((rawG / (sub.max || 100)) * 20 * 100) / 100)
                  : null;
                const total  = on20 !== null ? Math.round(on20 * sub.coef * 100) / 100 : '—';
                const sRank  = getSubjectRank(sub);
                const apprIn = on20 !== null ? (isEnSys ? on20 * 5 : on20) : null;
                const appr   = getAppreciation(apprIn, school?.grade_scale, sys);
                const isPassed = on20 !== null && on20 >= 10;
                const s1     = isTrimestre ? seqGrade(sub.id, student.id, classId, period.seqs[0], gradeMap) : null;
                const s2     = isTrimestre ? seqGrade(sub.id, student.id, classId, period.seqs[1], gradeMap) : null;
                const t1     = isAnnuel ? termAvg(sub.id, termSeqs[0]) : null;
                const t2     = isAnnuel ? termAvg(sub.id, termSeqs[1]) : null;
                const t3     = isAnnuel ? termAvg(sub.id, termSeqs[2]) : null;
                const subTch = teachers?.find((t) => t.id === sub.teacher_id);

                return (
                  <tr key={sub.id}>
                    <td style={{ ...cell, textAlign: 'left' }}>
                      {sub.name}
                      {subTch && (
                        <span style={{ display: 'block', fontSize: '8px', color: '#6b7280' }}>{subTch.name}</span>
                      )}
                    </td>
                    {isAnnuel && (
                      <td style={{ ...cell, textAlign: 'center' }}>
                        {t1 !== null ? t1 : <span style={{ color: '#9ca3af' }}>—</span>}
                      </td>
                    )}
                    {isAnnuel && (
                      <td style={{ ...cell, textAlign: 'center' }}>
                        {t2 !== null ? t2 : <span style={{ color: '#9ca3af' }}>—</span>}
                      </td>
                    )}
                    {isAnnuel && (
                      <td style={{ ...cell, textAlign: 'center' }}>
                        {t3 !== null ? t3 : <span style={{ color: '#9ca3af' }}>—</span>}
                      </td>
                    )}
                    {!isAnnuel && isTrimestre && (
                      <td style={{ ...cell, textAlign: 'center' }}>
                        {s1 !== null ? s1 : <span style={{ color: '#9ca3af' }}>ABS</span>}
                      </td>
                    )}
                    {!isAnnuel && isTrimestre && (
                      <td style={{ ...cell, textAlign: 'center' }}>
                        {s2 !== null ? s2 : <span style={{ color: '#9ca3af' }}>ABS</span>}
                      </td>
                    )}
                    <td style={{ ...cell, textAlign: 'center', fontWeight: 'bold', color: on20 !== null ? (isPassed ? '#059669' : '#dc2626') : '#9ca3af' }}>
                      {on20 !== null ? on20 : <span style={{ color: '#9ca3af' }}>ABS</span>}
                    </td>
                    <td style={{ ...cell, textAlign: 'center' }}>{sub.coef}</td>
                    <td style={{ ...cell, textAlign: 'center' }}>{total}</td>
                    <td style={{ ...cell, textAlign: 'center', fontSize: '9px' }}>{sRank}</td>
                    <td style={{ ...cell, textAlign: 'center', fontWeight: 'bold', fontSize: '9px', color: on20 !== null ? appr?.col : '#9ca3af' }}>
                      {on20 !== null ? (isEnSys ? `${appr?.g} — ${appr?.txt}` : appr?.text) : '—'}
                    </td>
                  </tr>
                );
              })}

              <tr>
                <td colSpan={isAnnuel ? 4 : isTrimestre ? 3 : 1} style={{ ...gtot, textAlign: 'right' }}>
                  TOTAL {isEnSys ? group.label.split('/')[1].trim() : group.label.split('/')[0].trim()}
                </td>
                <td style={{ ...gtot, textAlign: 'center', color: gs.avg !== null ? (gPassed ? '#059669' : '#dc2626') : '#6b7280' }}>
                  {gs.avg !== null ? gs.avg : '—'}
                </td>
                <td style={{ ...gtot, textAlign: 'center' }}>{gs.coefSum || '—'}</td>
                <td style={{ ...gtot, textAlign: 'center' }}>{gs.pts || '—'}</td>
                <td style={{ ...gtot, textAlign: 'center' }}>—</td>
                <td style={{ ...gtot, textAlign: 'center', color: gAppr?.col }}>
                  {gs.avg !== null ? (isEnSys ? `${gAppr?.g} — ${gAppr?.txt}` : gAppr?.text) : '—'}
                </td>
              </tr>
            </tbody>
          );
        })}
      </table>

      {/* BOTTOM 4 COLUMNS */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '5px' }}>
        <thead>
          <tr>
            <th style={{ ...thS, width: '25%' }}>{L(sys, "RÉSULTAT DE L'ÉLÈVE",  'STUDENT RESULTS')}</th>
            <th style={{ ...thS, width: '25%' }}>{L(sys, 'PROFIL DE LA CLASSE',  'CLASS PROFILE')}</th>
            <th style={{ ...thS, width: '25%' }}>{L(sys, "TRAVAIL DE L'ÉLÈVE",   "STUDENT'S WORK")}</th>
            <th style={{ ...thS, width: '25%' }}>{L(sys, "CONDUITE DE L'ÉLÈVE",  "STUDENT'S CONDUCT")}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ ...cell, verticalAlign: 'top', padding: '5px' }}>
              <div>{L(sys, 'Moy. Gén.', 'Avg.')} : <strong style={{ color: passed ? '#059669' : '#dc2626' }}>{studentAvg !== null ? `${studentAvg}/${maxScale}` : '—'}</strong></div>
              <div>{L(sys, 'Rang', 'Rank')} : <strong>{rank?.rankD || '—'} / {stats?.total ?? '—'}</strong></div>
              <div style={{ marginTop: 3 }}>
                <strong style={{ color: passed ? '#059669' : '#dc2626', fontSize: '11px' }}>
                  {studentAvg !== null ? decision : '—'}
                </strong>
              </div>
            </td>
            <td style={{ ...cell, verticalAlign: 'top', padding: '5px' }}>
              <div>{L(sys, 'Moy. classe', 'Class avg.')} : <strong>{stats?.avg != null ? `${stats.avg}/${maxScale}` : '—'}</strong></div>
              <div>{L(sys, 'Note max', 'Highest')} : <strong>{stats?.max != null ? `${stats.max}/${maxScale}` : '—'}</strong></div>
              <div>{L(sys, 'Note min', 'Lowest')} : <strong>{stats?.min != null ? `${stats.min}/${maxScale}` : '—'}</strong></div>
              <div>{L(sys, 'Taux réussite', 'Pass rate')} : <strong>{stats?.above != null && stats?.total ? `${stats.above}/${stats.total} (${Math.round((stats.above / stats.total) * 100)}%)` : '—'}</strong></div>
            </td>
            <td style={{ ...cell, verticalAlign: 'top', padding: '5px' }}>
              <div style={{ color: apprGlobal?.col, fontWeight: 'bold', fontSize: '11px' }}>
                {isEnSys ? (apprGlobal ? `${apprGlobal.g} — ${apprGlobal.txt}` : '—') : (apprGlobal?.text || '—')}
              </div>
              {th            && <div style={{ color: '#059669', fontWeight: 'bold', fontSize: '9px', marginTop: 2 }}>{L(sys, "Tableau d'Honneur", 'Honor Roll')}</div>}
              {encouragement && <div style={{ color: '#059669', fontWeight: 'bold', fontSize: '9px', marginTop: 2 }}>{L(sys, 'T.H + Encouragement', 'Honor Roll + Encouragement')}</div>}
              {felicitation  && <div style={{ color: '#059669', fontWeight: 'bold', fontSize: '9px', marginTop: 2 }}>{L(sys, 'T.H + Félicitation', 'Honor Roll + Congratulations')}</div>}
              {averTravail  > 0 && <div style={{ color: '#d97706', fontSize: '9px', marginTop: 2 }}>{L(sys, 'Aver. Travail', 'Work Warning')} : <strong>{averTravail}</strong></div>}
              {blameTravail > 0 && <div style={{ color: '#dc2626', fontSize: '9px', marginTop: 2 }}>{L(sys, 'Blâme Travail', 'Work Reprimand')} : <strong>{blameTravail}</strong></div>}
            </td>
            <td style={{ ...cell, verticalAlign: 'top', padding: '5px' }}>
              <div style={{ fontSize: '9px' }}>{L(sys, "T. d'Honneur", 'Honor Roll')} : <strong style={{ color: th || encouragement || felicitation ? '#059669' : '#374151' }}>{th || encouragement || felicitation ? L(sys, 'Oui', 'Yes') : L(sys, 'Non', 'No')}</strong></div>
              <div style={{ fontSize: '9px' }}>{L(sys, 'Abs. totales', 'Total absences')} : <strong>{absJ + absNJ} H</strong></div>
              <div style={{ fontSize: '9px' }}>{L(sys, 'Absences NJ', 'Unjust. absences')} : <strong>{absNJ} H</strong></div>
              <div style={{ fontSize: '9px' }}>{L(sys, 'Exclusions', 'Exclusions')} : <strong>{exclusions} {L(sys, 'Jrs', 'days')}</strong></div>
              <div style={{ fontSize: '9px' }}>{L(sys, 'Aver. Conduite', 'Conduct Warning')} : <strong>{averConduite}</strong></div>
              <div style={{ fontSize: '9px' }}>{L(sys, 'Blâme Conduite', 'Conduct Reprimand')} : <strong>{blameConduite}</strong></div>
              <div style={{ fontSize: '9px' }}>{L(sys, 'Conduite', 'Conduct')} : <strong style={{ color: conduite ? CONDUITE_COLORS[conduite] : undefined }}>
                {conduite ? `${conduite} — ${conduiteLabel(sys, conduite)}` : '—'}
              </strong></div>
            </td>
          </tr>
        </tbody>
      </table>

      {/* SIGNATURES */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '4px' }}>
        <tbody>
          <tr>
            <td style={{ ...cell, width: '33%', textAlign: 'center', height: 56, verticalAlign: 'bottom', paddingBottom: 5 }}>
              <strong style={{ fontSize: '9px' }}>{L(sys, 'Signature du Parent / Tuteur', 'Parent / Guardian Signature')}</strong>
            </td>
            <td style={{ ...cell, width: '34%', textAlign: 'center', verticalAlign: 'bottom', paddingBottom: 5 }}>
              <strong style={{ fontSize: '9px' }}>{L(sys, 'Le Conseil de Classe', 'Class Council')}</strong>
            </td>
            <td style={{ ...cell, width: '33%', textAlign: 'center', verticalAlign: 'top', paddingTop: 5 }}>
              <strong style={{ fontSize: '9px' }}>{L(sys, 'LE PRINCIPAL', 'THE PRINCIPAL')}</strong>
              {school?.signature_url && (
                <img src={school.signature_url} alt="Signature" style={{ height: 32, display: 'block', margin: '2px auto' }} />
              )}
              {school?.stamp_url && (
                <img src={school.stamp_url} alt="Tampon" style={{ height: 32, display: 'block', margin: '2px auto' }} />
              )}
            </td>
          </tr>
        </tbody>
      </table>

      <p style={{ fontSize: '7.5px', color: '#9ca3af', textAlign: 'center', fontStyle: 'italic', margin: 0 }}>
        {isEnSys
          ? "This report card is valid only with the signature and stamp of the head of school. Any manual alteration is liable to sanction."
          : "Ce bulletin n'est valable qu'avec la signature et le cachet du chef d'établissement. Toute modification manuelle est passible de sanction."}
      </p>
    </div>
  );
}

// ── Bulletin Primaire (annuel — T1 + T2 + T3 côte à côte) ────────────────────
function BulletinPrimaire({ school, cls, student, subjects, studentAvg, rank, stats, sys, teachers, gradeMap, classId }) {
  const passThreshold = sys === 'FR' ? 10 : 50;
  const maxScale      = sys === 'FR' ? 20 : 100;
  const passed        = studentAvg !== null && studentAvg >= passThreshold;
  const decision      = sys === 'FR' ? (passed ? 'Admis(e)' : 'Ajourné(e)') : (passed ? 'Passed' : 'Failed');
  const apprGlobal    = getAppreciation(studentAvg, school?.grade_scale, sys);

  const getGrade = (subjectId, seq) => {
    const v = (gradeMap[`${classId}_${student.id}_${seq}`] || {})[subjectId];
    if (!v || v === 'ABS' || v === '') return null;
    const n = parseFloat(v);
    return isNaN(n) ? null : n;
  };

  const getAnnual = (sub) => {
    const vals = [1, 2, 3].map((s) => getGrade(sub.id, s)).filter((x) => x !== null);
    if (!vals.length) return null;
    return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100;
  };

  return (
    <div className="bulletin-paper">
      <div className="bulletin-header">
        <div>
          <strong>RÉPUBLIQUE DU CAMEROUN</strong><br />
          Paix – Travail – Patrie<br />————————<br />
          <em>{school?.region || ''}</em>
        </div>
        <div className="bulletin-logo">
          {school?.logo_url
            ? <img src={school.logo_url} alt="Logo" style={{ width: 90, height: 90, objectFit: 'contain' }} />
            : '📚'
          }
        </div>
        <div>
          <strong>REPUBLIC OF CAMEROON</strong><br />
          Peace – Work – Fatherland<br />————————<br />
          <em>{school?.region || ''}</em>
        </div>
      </div>

      <div className="bulletin-school">
        <h1>{school?.name || (sys === 'EN' ? 'School' : 'Établissement')}</h1>
        <p>
          {school?.address ? `B.P. ${school.address} · ` : ''}
          {school?.phone || ''}
          {school?.type ? ` · ${sys === 'EN' ? 'Ed.' : 'Ens.'} ${school.type}` : ''}
        </p>
        <p>{sys === 'EN' ? 'Academic year' : 'Année scolaire'} : <strong>{school?.current_year || '—'}</strong></p>
      </div>

      <div className="bulletin-title">
        {sys === 'EN' ? 'Annual Primary Report Card' : 'Bulletin Annuel — Enseignement Primaire / Annual Primary Report Card'}
      </div>

      <div className="bulletin-student">
        <div className="bulletin-student-grid">
          <div><strong>{sys === 'EN' ? 'Name' : 'Nom / Name'} :</strong>&nbsp;{student.name}</div>
          <div><strong>{sys === 'EN' ? 'Reg. No.' : 'Matricule'} :</strong>&nbsp;{student.matricule || '—'}</div>
          <div><strong>{sys === 'EN' ? 'Class' : 'Classe / Class'} :</strong>&nbsp;{cls?.name || '—'}</div>
          <div><strong>{sys === 'EN' ? 'Level' : 'Niveau'} :</strong>&nbsp;{cls?.level || '—'}</div>
          <div><strong>{sys === 'EN' ? 'Sex' : 'Sexe / Sex'} :</strong>&nbsp;{student.gender || '—'}</div>
          <div><strong>{sys === 'EN' ? 'Rank' : 'Rang / Rank'} :</strong>&nbsp;{rank?.rankD || '—'} / {stats?.total ?? '—'}</div>
        </div>
      </div>

      <table className="bulletin-table">
        <thead>
          <tr>
            <th style={{ width: '28%', textAlign: 'left' }}>Matière / Subject</th>
            <th>T1/{maxScale}</th>
            <th>T2/{maxScale}</th>
            <th>T3/{maxScale}</th>
            <th>Moy. Ann/{maxScale}</th>
            <th>Coef</th>
            <th style={{ width: '18%' }}>Appréciation</th>
          </tr>
        </thead>
        <tbody>
          {subjects.map((sub) => {
            const t1     = getGrade(sub.id, 1);
            const t2     = getGrade(sub.id, 2);
            const t3     = getGrade(sub.id, 3);
            const annual = getAnnual(sub);
            const appr   = annual !== null
              ? getAppreciation(sys === 'FR' ? (annual / sub.max) * 20 : (annual / sub.max) * 100, school?.grade_scale, sys)
              : null;
            const gradeColor = annual !== null
              ? (annual / sub.max >= passThreshold / maxScale ? '#059669' : '#dc2626')
              : '#6b7280';
            const subTeacher = teachers?.find((t) => t.id === sub.teacher_id);
            const abs = <span style={{ color: '#9ca3af' }}>—</span>;
            return (
              <tr key={sub.id}>
                <td className="subject-name">
                  <span>{sub.name}</span>
                  {subTeacher && (
                    <span style={{ display: 'block', fontSize: '0.7em', color: '#6b7280', fontWeight: 'normal' }}>
                      {subTeacher.name}
                    </span>
                  )}
                </td>
                <td style={{ textAlign: 'center', color: '#374151' }}>{t1 !== null ? t1 : abs}</td>
                <td style={{ textAlign: 'center', color: '#374151' }}>{t2 !== null ? t2 : abs}</td>
                <td style={{ textAlign: 'center', color: '#374151' }}>{t3 !== null ? t3 : abs}</td>
                <td className="grade-cell" style={{ color: gradeColor }}>
                  {annual !== null ? annual : abs}
                </td>
                <td style={{ textAlign: 'center' }}>{sub.coef}</td>
                <td className="appreciation-cell" style={{ color: appr?.col || '#9ca3af' }}>
                  {sys === 'FR' ? (appr?.text || '—') : (appr ? `${appr.g} — ${appr.txt}` : '—')}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="bulletin-bottom">
        <div className="bulletin-box">
          <div className="bulletin-box-title">Résultats Annuels / Annual Results</div>
          <div className="bulletin-box-body">
            <p><span>Moyenne Ann. / Average</span>
              <strong style={{ color: passed ? '#059669' : '#dc2626' }}>
                {studentAvg !== null ? `${studentAvg}/${maxScale}` : '—'}
              </strong>
            </p>
            <p><span>Rang / Rank</span><strong>{rank?.rankD || '—'} / {stats?.total ?? '—'}</strong></p>
            <p><span>Appréciation</span>
              <strong style={{ color: apprGlobal?.col }}>
                {sys === 'FR' ? (apprGlobal?.text || '—') : (apprGlobal ? `${apprGlobal.g} — ${apprGlobal.txt}` : '—')}
              </strong>
            </p>
            <p><span>Décision / Decision</span>
              <strong style={{ color: passed ? '#059669' : '#dc2626' }}>{decision}</strong>
            </p>
          </div>
        </div>
        <div className="bulletin-box">
          <div className="bulletin-box-title">Statistiques de classe / Class Stats</div>
          <div className="bulletin-box-body">
            <p><span>Effectif / Total</span><strong>{stats?.total ?? '—'}</strong></p>
            <p><span>Moy. classe / Class avg</span>
              <strong>{stats?.avg != null ? `${stats.avg}/${maxScale}` : '—'}</strong>
            </p>
            <p><span>Note max / Highest</span>
              <strong>{stats?.max != null ? `${stats.max}/${maxScale}` : '—'}</strong>
            </p>
            <p><span>Note min / Lowest</span>
              <strong>{stats?.min != null ? `${stats.min}/${maxScale}` : '—'}</strong>
            </p>
            <p><span>Taux réussite / Pass rate</span>
              <strong>
                {stats?.above != null && stats?.total
                  ? `${stats.above}/${stats.total} (${Math.round((stats.above / stats.total) * 100)}%)`
                  : '—'}
              </strong>
            </p>
          </div>
        </div>
      </div>

      <div className="bulletin-remark">
        <div className="bulletin-remark-title">Observations</div>
      </div>
      <div className="bulletin-signatures">
        <div className="bulletin-sig-block">
          {school?.signature_url && (
            <img src={school.signature_url} alt="Signature" className="bulletin-sig-img" />
          )}
          {school?.stamp_url && (
            <img src={school.stamp_url} alt="Tampon" className="bulletin-stamp-img" />
          )}
          <span>Le Directeur / The Principal</span>
        </div>
        <div>Le Maître / La Maîtresse</div>
        <div>Parent / Tuteur / Guardian</div>
      </div>
    </div>
  );
}

// ── Bulletin Annuel Secondaire (T1 / T2 / T3 / Moy.Ann) ──────────────────────
function BulletinAnnuelSecondaire({ school, cls, student, subjects, subjectGrades, studentAvg, rank, stats, sys, teachers, gradeMap, classId, annualDecision }) {
  const passThreshold = sys === 'FR' ? 10 : 50;
  const maxScale      = sys === 'FR' ? 20 : 100;
  const passed        = studentAvg !== null && studentAvg >= passThreshold;

  // Décision annuelle : valeur posée explicitement par l'admin, sinon dérivée du seuil.
  const DECISIONS_FR = {
    admis:      'Admis(e) en classe supérieure',
    redouble:   'Autorisé(e) à redoubler',
    renvoye:    'Exclu(e) de l\'établissement',
    rattrapage: 'Examen de rattrapage',
  };
  const DECISIONS_EN = {
    admis: 'Promoted', redouble: 'Repeats class', renvoye: 'Dismissed', rattrapage: 'Resit exam',
  };
  const decisionMap = sys === 'EN' ? DECISIONS_EN : DECISIONS_FR;
  const decision = annualDecision && decisionMap[annualDecision]
    ? decisionMap[annualDecision]
    : (sys === 'FR' ? (passed ? 'Admis(e) en classe supérieure' : 'Autorisé(e) à redoubler') : (passed ? 'Promoted' : 'Repeats class'));
  const apprGlobal    = getAppreciation(studentAvg, school?.grade_scale, sys);

  // EN: 3 terms (seq 1/2/3) — FR: 6 sequences grouped in 3 trimestres (seq 1-2/3-4/5-6)
  const isEN      = sys === 'EN';
  const termSeqs  = isEN ? [[1], [2], [3]] : [[1, 2], [3, 4], [5, 6]];
  const allSeqs   = isEN ? [1, 2, 3] : [1, 2, 3, 4, 5, 6];
  const termLabel = isEN
    ? ['Term 1', 'Term 2', 'Term 3']
    : ['T1', 'T2', 'T3'];

  const { absJ, absNJ, conduite } = getAbsCond(gradeMap, classId, student.id, allSeqs);

  const termAvg = (subId, seqs) => {
    const vals = seqs
      .map((i) => {
        const v = (gradeMap[`${classId}_${student.id}_${i}`] || {})[subId];
        return !v || v === 'ABS' || v === '' ? null : parseFloat(v);
      })
      .filter((x) => x !== null && !isNaN(x));
    if (!vals.length) return null;
    return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100;
  };

  const abs = <span style={{ color: '#9ca3af' }}>—</span>;

  return (
    <div className="bulletin-paper">
      <div className="bulletin-header">
        <div>
          <strong>RÉPUBLIQUE DU CAMEROUN</strong><br />
          Paix – Travail – Patrie<br />————————<br />
          <em>{school?.region || ''}</em>
        </div>
        <div className="bulletin-logo">
          {school?.logo_url
            ? <img src={school.logo_url} alt="Logo" style={{ width: 90, height: 90, objectFit: 'contain' }} />
            : '📚'
          }
        </div>
        <div>
          <strong>REPUBLIC OF CAMEROON</strong><br />
          Peace – Work – Fatherland<br />————————<br />
          <em>{school?.region || ''}</em>
        </div>
      </div>

      <div className="bulletin-school">
        <h1>{school?.name || (isEN ? 'School' : 'Établissement')}</h1>
        <p>
          {school?.address ? `B.P. ${school.address} · ` : ''}
          {school?.phone || ''}
          {school?.type ? ` · ${isEN ? 'Ed.' : 'Ens.'} ${school.type}` : ''}
        </p>
        <p>{isEN ? 'Academic year' : 'Année scolaire'} : <strong>{school?.current_year || '—'}</strong></p>
      </div>

      <div className="bulletin-title">
        {isEN ? 'Annual Report Card' : 'Bulletin Annuel / Annual Report Card'}
      </div>

      <div className="bulletin-student">
        <div className="bulletin-student-grid">
          <div><strong>Nom / Name :</strong>&nbsp;{student.name}</div>
          <div><strong>Matricule :</strong>&nbsp;{student.matricule || '—'}</div>
          <div><strong>Classe / Class :</strong>&nbsp;{cls?.name || '—'}</div>
          <div><strong>Sexe / Sex :</strong>&nbsp;{student.gender || '—'}</div>
          <div><strong>Rang / Rank :</strong>&nbsp;{rank?.rankD || '—'} / {stats?.total ?? '—'}</div>
          <div><strong>Effectif / Total :</strong>&nbsp;{stats?.total ?? '—'}</div>
        </div>
      </div>

      <table className="bulletin-table">
        <thead>
          <tr>
            <th style={{ width: '26%', textAlign: 'left' }}>{isEN ? 'Subject' : 'Matière / Subject'}</th>
            <th>{termLabel[0]}/{maxScale}</th>
            <th>{termLabel[1]}/{maxScale}</th>
            <th>{termLabel[2]}/{maxScale}</th>
            <th>{isEN ? 'Ann.' : 'Moy.Ann'}/{maxScale}</th>
            <th>Coef</th>
            <th style={{ width: '18%' }}>{isEN ? 'Grade' : 'Appréciation'}</th>
          </tr>
        </thead>
        <tbody>
          {subjects.map((sub) => {
            const t1     = termAvg(sub.id, termSeqs[0]);
            const t2     = termAvg(sub.id, termSeqs[1]);
            const t3     = termAvg(sub.id, termSeqs[2]);
            const annual = subjectGrades[sub.id];
            const appr   = annual !== null
              ? getAppreciation(sys === 'FR' ? (annual / sub.max) * 20 : (annual / sub.max) * 100, school?.grade_scale, sys)
              : null;
            const gradeColor = annual !== null
              ? (annual / sub.max >= passThreshold / maxScale ? '#059669' : '#dc2626')
              : '#6b7280';
            const subTeacher = teachers?.find((t) => t.id === sub.teacher_id);
            return (
              <tr key={sub.id}>
                <td className="subject-name">
                  <span>{sub.name}</span>
                  {subTeacher && (
                    <span style={{ display: 'block', fontSize: '0.7em', color: '#6b7280', fontWeight: 'normal' }}>
                      {subTeacher.name}
                    </span>
                  )}
                </td>
                <td style={{ textAlign: 'center', color: '#374151' }}>{t1 !== null ? t1 : abs}</td>
                <td style={{ textAlign: 'center', color: '#374151' }}>{t2 !== null ? t2 : abs}</td>
                <td style={{ textAlign: 'center', color: '#374151' }}>{t3 !== null ? t3 : abs}</td>
                <td className="grade-cell" style={{ color: gradeColor, fontWeight: 700 }}>
                  {annual !== null ? annual : abs}
                </td>
                <td style={{ textAlign: 'center' }}>{sub.coef}</td>
                <td className="appreciation-cell" style={{ color: appr?.col || '#9ca3af' }}>
                  {sys === 'FR' ? (appr?.text || '—') : (appr ? `${appr.g} — ${appr.txt}` : '—')}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="bulletin-bottom">
        <div className="bulletin-box">
          <div className="bulletin-box-title">{isEN ? 'Annual Results' : 'Résultats Annuels / Annual Results'}</div>
          <div className="bulletin-box-body">
            <p><span>{isEN ? 'Annual Average' : 'Moyenne Ann. / Average'}</span>
              <strong style={{ color: passed ? '#059669' : '#dc2626' }}>
                {studentAvg !== null ? `${studentAvg}/${maxScale}` : '—'}
              </strong>
            </p>
            <p><span>Rang / Rank</span><strong>{rank?.rankD || '—'} / {stats?.total ?? '—'}</strong></p>
            <p><span>{isEN ? 'Grade' : 'Appréciation'}</span>
              <strong style={{ color: apprGlobal?.col }}>
                {sys === 'FR' ? apprGlobal?.text : (apprGlobal ? `${apprGlobal.g} — ${apprGlobal.txt}` : '—')}
              </strong>
            </p>
            <p><span>{isEN ? 'Decision' : 'Décision / Decision'}</span>
              <strong style={{ color: passed ? '#059669' : '#dc2626' }}>{decision}</strong>
            </p>
          </div>
        </div>
        <div className="bulletin-box">
          <div className="bulletin-box-title">{isEN ? 'Class Statistics' : 'Statistiques / Class Stats'}</div>
          <div className="bulletin-box-body">
            <p><span>Effectif / Total</span><strong>{stats?.total ?? '—'}</strong></p>
            <p><span>{isEN ? 'Class average' : 'Moy. classe / Class avg'}</span>
              <strong>{stats?.avg != null ? `${stats.avg}/${maxScale}` : '—'}</strong>
            </p>
            <p><span>{isEN ? 'Highest mark' : 'Note max / Highest'}</span>
              <strong>{stats?.max != null ? `${stats.max}/${maxScale}` : '—'}</strong>
            </p>
            <p><span>{isEN ? 'Lowest mark' : 'Note min / Lowest'}</span>
              <strong>{stats?.min != null ? `${stats.min}/${maxScale}` : '—'}</strong>
            </p>
            <p><span>{isEN ? 'Pass rate' : 'Taux réussite / Pass rate'}</span>
              <strong>
                {stats?.above != null && stats?.total
                  ? `${stats.above}/${stats.total} (${Math.round((stats.above / stats.total) * 100)}%)`
                  : '—'}
              </strong>
            </p>
          </div>
        </div>
      </div>

      <div className="bulletin-absences-row">
        <span>Absences just. / Just. absences : <strong>{absJ > 0 ? `${absJ} h` : '—'}</strong></span>
        <span>Absences non just. / Unjust. absences : <strong>{absNJ > 0 ? `${absNJ} h` : '—'}</strong></span>
        {conduite && (
          <span>
            Conduite / Conduct :&nbsp;
            <strong style={{ color: CONDUITE_COLORS[conduite] }}>
              {conduite} — {CONDUITE_LABELS[conduite]}
            </strong>
          </span>
        )}
      </div>

      <div className="bulletin-remark">
        <div className="bulletin-remark-title">Observations / Remarks</div>
      </div>
      <div className="bulletin-signatures">
        <div className="bulletin-sig-block">
          {school?.signature_url && (
            <img src={school.signature_url} alt="Signature" className="bulletin-sig-img" />
          )}
          {school?.stamp_url && (
            <img src={school.stamp_url} alt="Tampon" className="bulletin-stamp-img" />
          )}
          <span>Le Directeur<br />The Principal</span>
        </div>
        <div>Le Prof. Principal<br />The Form Master</div>
        <div>Parent / Tuteur<br />Parent / Guardian</div>
      </div>
    </div>
  );
}

// ── Bulletin Maternelle (grille A / EA / NA par trimestre) ────────────────────
const COMP_BUL_COLORS = { A: '#059669', EA: '#d97706', NA: '#dc2626' };

function BulletinMaternelle({ school, cls, student, subjects, teachers, gradeMap, classId }) {
  const getComp = (subjectId, seq) => {
    const v = (gradeMap[`${classId}_${student.id}_${seq}`] || {})[subjectId];
    return v || '';
  };

  return (
    <div className="bulletin-paper">
      <div className="bulletin-header">
        <div>
          <strong>RÉPUBLIQUE DU CAMEROUN</strong><br />
          Paix – Travail – Patrie<br />————————<br />
          <em>{school?.region || ''}</em>
        </div>
        <div className="bulletin-logo">
          {school?.logo_url
            ? <img src={school.logo_url} alt="Logo" style={{ width: 90, height: 90, objectFit: 'contain' }} />
            : '📚'
          }
        </div>
        <div>
          <strong>REPUBLIC OF CAMEROON</strong><br />
          Peace – Work – Fatherland<br />————————<br />
          <em>{school?.region || ''}</em>
        </div>
      </div>

      <div className="bulletin-school">
        <h1>{school?.name || 'Établissement'}</h1>
        <p>
          {school?.address ? `B.P. ${school.address} · ` : ''}
          {school?.phone || ''}
          {school?.type ? ` · Ens. ${school.type}` : ''}
        </p>
        <p>Année scolaire : <strong>{school?.current_year || '—'}</strong></p>
      </div>

      <div className="bulletin-title">
        Bulletin de Compétences — Maternelle / Pre-Primary Competency Report
      </div>

      <div className="bulletin-student">
        <div className="bulletin-student-grid">
          <div><strong>Nom / Name :</strong>&nbsp;{student.name}</div>
          <div><strong>Classe / Class :</strong>&nbsp;{cls?.name || '—'}</div>
          <div><strong>Niveau :</strong>&nbsp;{cls?.level || '—'}</div>
          <div><strong>Sexe / Sex :</strong>&nbsp;{student.gender || '—'}</div>
        </div>
      </div>

      <table className="bulletin-table">
        <thead>
          <tr>
            <th style={{ width: '46%', textAlign: 'left' }}>Domaine / Compétence</th>
            <th>Trimestre 1</th>
            <th>Trimestre 2</th>
            <th>Trimestre 3</th>
          </tr>
        </thead>
        <tbody>
          {subjects.map((sub) => {
            const subTeacher = teachers?.find((t) => t.id === sub.teacher_id);
            return (
              <tr key={sub.id}>
                <td className="subject-name">
                  <span>{sub.name}</span>
                  {subTeacher && (
                    <span style={{ display: 'block', fontSize: '0.7em', color: '#6b7280', fontWeight: 'normal' }}>
                      {subTeacher.name}
                    </span>
                  )}
                </td>
                {[1, 2, 3].map((seq) => {
                  const c = getComp(sub.id, seq);
                  return (
                    <td key={seq} style={{ textAlign: 'center' }}>
                      {c ? (
                        <span style={{
                          display:       'inline-block',
                          padding:       '1px 8px',
                          borderRadius:  3,
                          background:    COMP_BUL_COLORS[c] + '20',
                          color:         COMP_BUL_COLORS[c],
                          fontWeight:    700,
                          fontSize:      '0.78em',
                          border:        `1px solid ${COMP_BUL_COLORS[c]}40`,
                        }}>
                          {c}
                        </span>
                      ) : (
                        <span style={{ color: '#9ca3af' }}>—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="apc-legend" style={{ marginTop: 8 }}>
        <strong>Légende / Legend :</strong>
        <span style={{ color: '#059669' }}>■ A — Acquis / Achieved</span>
        <span style={{ color: '#d97706' }}>■ EA — En cours d'Acquisition / In Progress</span>
        <span style={{ color: '#dc2626' }}>■ NA — Non Acquis / Not Achieved</span>
      </div>

      <div className="bulletin-remark">
        <div className="bulletin-remark-title">Observations</div>
      </div>
      <div className="bulletin-signatures">
        <div className="bulletin-sig-block">
          {school?.signature_url && (
            <img src={school.signature_url} alt="Signature" className="bulletin-sig-img" />
          )}
          {school?.stamp_url && (
            <img src={school.stamp_url} alt="Tampon" className="bulletin-stamp-img" />
          )}
          <span>La Directrice / Le Directeur</span>
        </div>
        <div>L'Éducatrice / L'Éducateur</div>
        <div>Parent / Tuteur / Guardian</div>
      </div>
    </div>
  );
}

// ── Helpers APC Moderne ───────────────────────────────────────────────────────
const APC_MODERNE_LEVEL_KEYS = ['EXCELLENT', 'GOOD', 'FAIRLY_GOOD', 'PASSABLE', 'IN_PROGRESS', 'INSUFFICIENT'];
const APC_MODERNE_LABELS_FR = {
  EXCELLENT:    'Très bien',
  GOOD:         'Bien',
  FAIRLY_GOOD:  'Assez bien',
  PASSABLE:     'Passable',
  IN_PROGRESS:  'En cours',
  INSUFFICIENT: 'Insuffisant',
};
const APC_MODERNE_LABELS_EN = {
  EXCELLENT:    'Excellent',
  GOOD:         'Good',
  FAIRLY_GOOD:  'Fairly good',
  PASSABLE:     'Passable',
  IN_PROGRESS:  'In progress',
  INSUFFICIENT: 'Insufficient',
};
function apcModerneLevelKey(grade, maxScale) {
  if (grade === null) return null;
  const pct = (grade / maxScale) * 100;
  if (pct >= 80) return 'EXCELLENT';
  if (pct >= 65) return 'GOOD';
  if (pct >= 55) return 'FAIRLY_GOOD';
  if (pct >= 50) return 'PASSABLE';
  if (pct >= 25) return 'IN_PROGRESS';
  return 'INSUFFICIENT';
}
function apcModerneLevel(grade, maxScale, sys = 'FR') {
  const key = apcModerneLevelKey(grade, maxScale);
  if (!key) return null;
  return (sys === 'EN' ? APC_MODERNE_LABELS_EN : APC_MODERNE_LABELS_FR)[key];
}

function coteLetter(avg, maxScale) {
  if (avg === null) return '—';
  const pct = (avg / maxScale) * 100;
  if (pct >= 80) return 'A';
  if (pct >= 65) return 'B';
  if (pct >= 55) return 'C';
  if (pct >= 50) return 'D';
  if (pct >= 25) return 'E';
  return 'F';
}

const APC_LEVEL_COLOR_BY_KEY = {
  EXCELLENT:    '#7c3aed',
  GOOD:         '#059669',
  FAIRLY_GOOD:  '#0284c7',
  PASSABLE:     '#d97706',
  IN_PROGRESS:  '#ea580c',
  INSUFFICIENT: '#dc2626',
};

// ── Bulletin APC Moderne ──────────────────────────────────────────────────────
function BulletinAPCModerne({ school, cls, student, subjects, subjectGrades, studentAvg, rank, stats, period, sys, teachers, gradeMap, classId }) {
  const maxScale      = sys === 'FR' ? 20 : 100;
  const passThreshold = sys === 'FR' ? 10 : 50;
  const passed        = studentAvg !== null && studentAvg >= passThreshold;
  const decision      = sys === 'FR' ? (passed ? 'Admis(e)' : 'Ajourné(e)') : (passed ? 'Passed' : 'Failed');
  const cote          = coteLetter(studentAvg, maxScale);
  const isAnnuel      = period.value === 'annuel';
  const isEN_a        = sys === 'EN';
  const isTrimestre   = !isAnnuel && period.seqs.length > 1;
  const termSeqsA     = isAnnuel ? (isEN_a ? [[1],[2],[3]] : [[1,2],[3,4],[5,6]]) : null;
  const termLblA      = isAnnuel ? ['T1','T2','T3'] : null;

  function termAvgA(subId, seqs) {
    const vals = seqs.map((i) => {
      const v = (gradeMap[`${classId}_${student.id}_${i}`] || {})[subId];
      return !v || v === 'ABS' || v === '' ? null : parseFloat(v);
    }).filter((x) => x !== null && !isNaN(x));
    if (!vals.length) return null;
    return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100;
  }

  const getSeqGrade = (subId, seq) => {
    const v = (gradeMap[`${classId}_${student.id}_${seq}`] || {})[subId];
    if (!v || v === 'ABS' || v === '') return null;
    const n = parseFloat(v);
    return isNaN(n) ? null : n;
  };

  return (
    <div className="bulletin-paper bulletin-apc-moderne">
      {/* ── En-tête bilingue ── */}
      <div className="bulletin-header">
        <div style={{ fontSize: '0.65em', lineHeight: 1.5 }}>
          <strong>RÉPUBLIQUE DU CAMEROUN</strong><br />
          Paix – Travail – Patrie<br />————————<br />
          <em style={{ fontSize: '0.9em' }}>{school?.region || ''}</em><br />
          <strong style={{ fontSize: '0.85em' }}>MINISTÈRE DES ENSEIGNEMENTS<br />SECONDAIRES</strong>
        </div>
        <div className="bulletin-logo">
          {school?.logo_url
            ? <img src={school.logo_url} alt="Logo" style={{ width: 80, height: 80, objectFit: 'contain' }} />
            : <div style={{ width: 80, height: 80, border: '1px solid #d1d5db', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.8em' }}>📚</div>
          }
        </div>
        <div style={{ fontSize: '0.65em', lineHeight: 1.5, textAlign: 'right' }}>
          <strong>REPUBLIC OF CAMEROON</strong><br />
          Peace – Work – Fatherland<br />————————<br />
          <em style={{ fontSize: '0.9em' }}>{school?.region || ''}</em><br />
          <strong style={{ fontSize: '0.85em' }}>MINISTRY OF SECONDARY<br />EDUCATION</strong>
        </div>
      </div>

      {/* ── Titre ── */}
      <div style={{ textAlign: 'center', borderTop: '2px solid #1e3a5f', borderBottom: '2px solid #1e3a5f', padding: '4px 0', margin: '4px 0' }}>
        <div style={{ fontWeight: 800, fontSize: '1em', letterSpacing: 1, color: '#1e3a5f' }}>
          {L(sys, 'BULLETIN DE NOTES APC', 'CBA REPORT CARD')}
        </div>
        <div style={{ fontSize: '0.78em', fontWeight: 600, color: '#374151' }}>
          {cls?.name || '—'} &nbsp;·&nbsp; {period.label} &nbsp;·&nbsp; {L(sys, 'Année scolaire', 'Academic year')} : {school?.current_year || '—'}
        </div>
      </div>

      {/* ── Fiche élève ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '70px 1fr auto', gap: 8, margin: '6px 0', border: '1px solid #d1d5db', borderRadius: 4, padding: 6, background: '#f8fafc' }}>
        {/* Photo placeholder */}
        <div style={{ width: 60, height: 72, border: '1px solid #9ca3af', borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f3f4f6', fontSize: '1.6em', color: '#9ca3af' }}>
          👤
        </div>
        {/* Infos élève */}
        <div style={{ fontSize: '0.7em', lineHeight: 2 }}>
          <div><strong>{L(sys, 'ÉTABLISSEMENT', 'SCHOOL')} :</strong> {school?.name || '—'}</div>
          <div><strong>{L(sys, 'NOM ET PRÉNOM', 'FULL NAME')} :</strong> {student.name}</div>
          <div><strong>{L(sys, 'MATRICULE', 'REG. NO.')} :</strong> {student.matricule || '—'}</div>
          <div style={{ display: 'flex', gap: 16 }}>
            <span><strong>{L(sys, 'EFFECTIF', 'TOTAL')} :</strong> {stats?.total ?? '—'}</span>
            <span><strong>{L(sys, 'SEXE', 'SEX')} :</strong> {student.gender || '—'}</span>
          </div>
        </div>
        {/* Séquences tracker */}
        <div style={{ fontSize: '0.62em', textAlign: 'center', minWidth: 120 }}>
          <div style={{ fontWeight: 700, marginBottom: 3, color: '#1e3a5f' }}>{L(sys, 'SÉQUENCES', 'SEQUENCES')}</div>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                {[1, 2, 3, 4, 5, 6].map((s) => (
                  <th key={s} style={{ border: '1px solid #d1d5db', padding: '1px 4px', background: '#e0e7ef', color: '#1e3a5f' }}>
                    {s}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {[1, 2, 3, 4, 5, 6].map((s) => {
                  const hasGrade = subjects.some((sub) => {
                    const v = (gradeMap[`${classId}_${student.id}_${s}`] || {})[sub.id];
                    return v && v !== '' && v !== 'ABS';
                  });
                  return (
                    <td key={s} style={{ border: '1px solid #d1d5db', padding: '1px 4px', textAlign: 'center', background: hasGrade ? '#dcfce7' : 'white' }}>
                      {period.seqs.includes(s) ? (
                        <span style={{ color: '#059669', fontWeight: 700 }}>✓</span>
                      ) : hasGrade ? (
                        <span style={{ color: '#6b7280' }}>·</span>
                      ) : ''}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
          <div style={{ marginTop: 4 }}>
            <strong>{L(sys, 'RANG', 'RANK')} :</strong> {rank?.rankD || '—'} / {stats?.total ?? '—'}
          </div>
        </div>
      </div>

      {/* ── Tableau des notes ── */}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.65em', marginBottom: 4 }}>
        <thead>
          <tr style={{ background: '#1e3a5f', color: 'white' }}>
            <th style={{ border: '1px solid #9ca3af', padding: '3px 4px', textAlign: 'left', width: '22%' }}>
              {isEN_a ? <>SUBJECTS /<br />ASSESSED COMPETENCIES</> : <>DISCIPLINES /<br />COMPÉTENCES ÉVALUÉES</>}
            </th>
            {isAnnuel ? (
              <>
                <th style={{ border: '1px solid #9ca3af', padding: '3px 2px', textAlign: 'center', width: '5%' }}>{termLblA[0]}</th>
                <th style={{ border: '1px solid #9ca3af', padding: '3px 2px', textAlign: 'center', width: '5%' }}>{termLblA[1]}</th>
                <th style={{ border: '1px solid #9ca3af', padding: '3px 2px', textAlign: 'center', width: '5%' }}>{termLblA[2]}</th>
              </>
            ) : isTrimestre ? (
              <>
                <th style={{ border: '1px solid #9ca3af', padding: '3px 2px', textAlign: 'center', width: '5%' }}>{L(sys, 'Séq', 'Seq')} {period.seqs[0]}</th>
                <th style={{ border: '1px solid #9ca3af', padding: '3px 2px', textAlign: 'center', width: '5%' }}>{L(sys, 'Séq', 'Seq')} {period.seqs[1]}</th>
              </>
            ) : (
              <th style={{ border: '1px solid #9ca3af', padding: '3px 2px', textAlign: 'center', width: '5%' }}>{L(sys, 'Note', 'Mark')}</th>
            )}
            <th style={{ border: '1px solid #9ca3af', padding: '3px 2px', textAlign: 'center', width: '4%' }}>{L(sys, 'Coef', 'Coef')}</th>
            <th style={{ border: '1px solid #9ca3af', padding: '3px 2px', textAlign: 'center', width: '5%' }}>{isAnnuel ? L(sys, 'Moy.Ann', 'Ann.Avg') : L(sys, 'Moy', 'Avg')}</th>
            <th style={{ border: '1px solid #9ca3af', padding: '3px 4px', textAlign: 'left', width: '18%' }}>
              {isEN_a ? <>TEACHERS /<br />TUTORS' REMARKS</> : <>NOTES DES<br />ENS. / TUTEURS</>}
            </th>
            {APC_MODERNE_LEVEL_KEYS.map((lvKey) => (
              <th key={lvKey} style={{ border: '1px solid #9ca3af', padding: '2px 1px', textAlign: 'center', fontSize: '0.85em', width: '6%', lineHeight: 1.2 }}>
                {(isEN_a ? APC_MODERNE_LABELS_EN : APC_MODERNE_LABELS_FR)[lvKey]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {subjects.map((sub, i) => {
            const grade    = subjectGrades[sub.id];
            const levelKey = apcModerneLevelKey(grade, sub.max);
            const s1       = isTrimestre ? getSeqGrade(sub.id, period.seqs[0]) : grade;
            const s2       = isTrimestre ? getSeqGrade(sub.id, period.seqs[1]) : null;
            const at1      = isAnnuel ? termAvgA(sub.id, termSeqsA[0]) : null;
            const at2      = isAnnuel ? termAvgA(sub.id, termSeqsA[1]) : null;
            const at3      = isAnnuel ? termAvgA(sub.id, termSeqsA[2]) : null;
            const mxc      = grade !== null ? Math.round(grade * sub.coef * 100) / 100 : null;
            const subTeacher = teachers?.find((t) => t.id === sub.teacher_id);
            const rowBg    = i % 2 === 0 ? 'white' : '#f8fafc';
            return (
              <tr key={sub.id} style={{ background: rowBg }}>
                <td style={{ border: '1px solid #d1d5db', padding: '3px 4px' }}>
                  <div style={{ fontWeight: 700, color: '#1e3a5f' }}>{sub.name}</div>
                  {subTeacher && (
                    <div style={{ fontSize: '0.85em', color: '#6b7280', fontStyle: 'italic' }}>
                      {subTeacher.name}
                    </div>
                  )}
                </td>
                {isAnnuel ? (
                  <>
                    <td style={{ border: '1px solid #d1d5db', padding: '3px 2px', textAlign: 'center', color: '#374151' }}>
                      {at1 !== null ? at1 : <span style={{ color: '#9ca3af' }}>—</span>}
                    </td>
                    <td style={{ border: '1px solid #d1d5db', padding: '3px 2px', textAlign: 'center', color: '#374151' }}>
                      {at2 !== null ? at2 : <span style={{ color: '#9ca3af' }}>—</span>}
                    </td>
                    <td style={{ border: '1px solid #d1d5db', padding: '3px 2px', textAlign: 'center', color: '#374151' }}>
                      {at3 !== null ? at3 : <span style={{ color: '#9ca3af' }}>—</span>}
                    </td>
                  </>
                ) : isTrimestre ? (
                  <>
                    <td style={{ border: '1px solid #d1d5db', padding: '3px 2px', textAlign: 'center', color: '#374151' }}>
                      {s1 !== null ? s1 : <span style={{ color: '#9ca3af' }}>—</span>}
                    </td>
                    <td style={{ border: '1px solid #d1d5db', padding: '3px 2px', textAlign: 'center', color: '#374151' }}>
                      {s2 !== null ? s2 : <span style={{ color: '#9ca3af' }}>—</span>}
                    </td>
                  </>
                ) : (
                  <td style={{ border: '1px solid #d1d5db', padding: '3px 2px', textAlign: 'center', fontWeight: 700, color: grade !== null ? (grade / sub.max >= passThreshold / maxScale ? '#059669' : '#dc2626') : '#9ca3af' }}>
                    {grade !== null ? grade : <span>ABS</span>}
                  </td>
                )}
                <td style={{ border: '1px solid #d1d5db', padding: '3px 2px', textAlign: 'center', color: '#374151' }}>{sub.coef}</td>
                <td style={{ border: '1px solid #d1d5db', padding: '3px 2px', textAlign: 'center', fontWeight: 700, color: grade !== null ? (grade / sub.max >= passThreshold / maxScale ? '#059669' : '#dc2626') : '#9ca3af' }}>
                  {grade !== null ? grade : '—'}
                </td>
                <td style={{ border: '1px solid #d1d5db', padding: '3px 4px', color: '#374151' }}></td>
                {APC_MODERNE_LEVEL_KEYS.map((lvKey) => (
                  <td key={lvKey} style={{ border: '1px solid #d1d5db', padding: '3px 1px', textAlign: 'center' }}>
                    {levelKey === lvKey && (
                      <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: APC_LEVEL_COLOR_BY_KEY[lvKey] }} />
                    )}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr style={{ background: '#e0e7ef', fontWeight: 700 }}>
            <td colSpan={isAnnuel ? 4 : isTrimestre ? 3 : 2} style={{ border: '1px solid #9ca3af', padding: '3px 4px', color: '#1e3a5f' }}>
              {L(sys, 'TOTAL DES COEFFICIENTS', 'TOTAL COEFFICIENTS')} : {subjects.reduce((s, x) => s + (x.coef || 0), 0)}
            </td>
            <td style={{ border: '1px solid #9ca3af', padding: '3px 2px', textAlign: 'center', color: '#1e3a5f' }}>
              {subjects.reduce((s, x) => s + (x.coef || 0), 0)}
            </td>
            <td style={{ border: '1px solid #9ca3af', padding: '3px 2px', textAlign: 'center', color: studentAvg !== null ? (studentAvg >= passThreshold ? '#059669' : '#dc2626') : '#9ca3af', fontSize: '1.05em' }}>
              {studentAvg !== null ? studentAvg : '—'}
            </td>
            <td colSpan={7} style={{ border: '1px solid #9ca3af', padding: '3px 4px' }} />
          </tr>
        </tfoot>
      </table>

      {/* ── Bas du bulletin ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 8, fontSize: '0.7em', marginTop: 4 }}>
        {/* Résultats */}
        <div style={{ border: '1px solid #d1d5db', borderRadius: 3, padding: '4px 8px', background: '#f8fafc' }}>
          <div style={{ fontWeight: 700, color: '#1e3a5f', borderBottom: '1px solid #e5e7eb', marginBottom: 3, paddingBottom: 2 }}>
            RÉSULTATS
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Moyenne générale :</span>
            <strong style={{ color: passed ? '#059669' : '#dc2626' }}>
              {studentAvg !== null ? `${studentAvg} / ${maxScale}` : '—'}
            </strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Moy. classe :</span>
            <strong>{stats?.avg != null ? `${stats.avg} / ${maxScale}` : '—'}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Taux réussite :</span>
            <strong>{stats?.above != null && stats?.total ? `${Math.round((stats.above / stats.total) * 100)} %` : '—'}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3, paddingTop: 3, borderTop: '1px solid #e5e7eb' }}>
            <span>Décision :</span>
            <strong style={{ color: passed ? '#059669' : '#dc2626' }}>{decision}</strong>
          </div>
        </div>

        {/* COTE + Mention centrale */}
        <div style={{ textAlign: 'center', border: '2px solid #1e3a5f', borderRadius: 4, padding: '6px 14px', minWidth: 110 }}>
          <div style={{ fontSize: '0.85em', fontWeight: 700, color: '#1e3a5f', letterSpacing: 1 }}>COTE</div>
          <div style={{ fontSize: '2.2em', fontWeight: 900, color: passed ? '#059669' : '#dc2626', lineHeight: 1 }}>
            {cote}
          </div>
          <div style={{ fontSize: '0.75em', color: '#6b7280', marginTop: 2 }}>MENTION</div>
          <div style={{ fontWeight: 700, color: APC_LEVEL_COLORS[apcModerneLevel(studentAvg, maxScale)] || '#374151', fontSize: '0.9em' }}>
            {studentAvg !== null ? apcModerneLevel(studentAvg, maxScale) : '—'}
          </div>
          <div style={{ fontSize: '0.75em', color: '#6b7280', marginTop: 4 }}>CLASSEMENT</div>
          <div style={{ fontWeight: 700, color: '#1e3a5f' }}>
            {rank?.rankD || '—'} / {stats?.total ?? '—'}
          </div>
        </div>

        {/* Observations */}
        <div style={{ border: '1px solid #d1d5db', borderRadius: 3, padding: '4px 8px', background: '#f8fafc' }}>
          <div style={{ fontWeight: 700, color: '#1e3a5f', borderBottom: '1px solid #e5e7eb', marginBottom: 3, paddingBottom: 2 }}>
            CONSEILS DU CONSEIL DE CLASSE
          </div>
          <div style={{ height: 48 }} />
        </div>
      </div>

      {/* ── Signatures ── */}
      <div className="bulletin-signatures" style={{ marginTop: 8, fontSize: '0.65em' }}>
        <div className="bulletin-sig-block">
          {school?.signature_url && (
            <img src={school.signature_url} alt="Signature" className="bulletin-sig-img" />
          )}
          {school?.stamp_url && (
            <img src={school.stamp_url} alt="Tampon" className="bulletin-stamp-img" />
          )}
          <span>SIGNATURE DU PARENT / TUTEUR</span>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ marginBottom: 4, color: '#6b7280' }}>DATE D'ÉDITION</div>
          <div style={{ fontWeight: 600 }}>
            {new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
          </div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div>LE CHEF D'ÉTABLISSEMENT</div>
          <div style={{ height: 32 }} />
          <div style={{ borderTop: '1px solid #9ca3af', paddingTop: 2, fontSize: '0.9em', color: '#6b7280' }}>
            Visa et Cachet
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Dispatcher selon le cycle et le format ────────────────────────────────────
function BulletinRenderer({ format, gradeMap, classId, cycle, period, countryCode, annualDecision, ...props }) {
  // Guinea Ecuatorial : boletín oficial espagnol pour TOUS les cycles.
  // (Pas de BulletinMaternelle FR ni de BulletinPrimaire FR pour ce profil.)
  if (countryCode === 'guinea_eq') {
    const BoletinComp = format === 'boletin_detalle' ? BoletinGEDetalle : BoletinGE;
    return <BoletinComp {...props} period={period} gradeMap={gradeMap} classId={classId} annualDecision={annualDecision} />;
  }
  if (cycle === 'maternelle') {
    return <BulletinMaternelle {...props} gradeMap={gradeMap} classId={classId} />;
  }
  if (cycle === 'primaire' && period.seqs.length === 3) {
    return <BulletinPrimaire {...props} gradeMap={gradeMap} classId={classId} />;
  }
  if (cycle === 'secondaire' && period.value === 'annuel' && format !== 'modern' && format !== 'apc' && format !== 'apc_moderne') {
    return <BulletinAnnuelSecondaire {...props} gradeMap={gradeMap} classId={classId} annualDecision={annualDecision} />;
  }
  if (format === 'modern')      return <BulletinModern     {...props} period={period} gradeMap={gradeMap} classId={classId} />;
  if (format === 'apc')         return <BulletinAPC        {...props} period={period} gradeMap={gradeMap} classId={classId} />;
  if (format === 'apc_moderne') return <BulletinAPCModerne {...props} period={period} gradeMap={gradeMap} classId={classId} />;
  return <BulletinClassic {...props} period={period} gradeMap={gradeMap} classId={classId} />;
}

// ── Sélecteur de décision annuelle ────────────────────────────────────────────
// Persiste sous gradeMap[<class>_<student>_<lastSeq>]['__decision__'].
// Visible uniquement pour les bulletins annuels (Admin only).
function AnnualDecisionPicker({ classId, studentId, lastSeq, current, countryCode }) {
  const saveGrade = useSchoolStore((s) => s.saveGrade);
  const t = useT();

  // Décisions par pays — affichées dans la langue du système.
  const DECISIONS = {
    cameroon_fr: [
      { value: 'admis',      label: 'Admis(e) en classe supérieure' },
      { value: 'redouble',   label: 'Autorisé(e) à redoubler' },
      { value: 'renvoye',    label: 'Exclu(e) de l\'établissement' },
      { value: 'rattrapage', label: 'Examen de rattrapage' },
    ],
    cameroon_en: [
      { value: 'admis',      label: 'Promoted to next class' },
      { value: 'redouble',   label: 'Allowed to repeat the class' },
      { value: 'renvoye',    label: 'Dismissed from the school' },
      { value: 'rattrapage', label: 'Resit examination required' },
    ],
    guinea_eq: [
      { value: 'admis',      label: 'Aprobado — pasa al curso siguiente' },
      { value: 'redouble',   label: 'Repite el curso' },
      { value: 'renvoye',    label: 'Expulsado del centro' },
      { value: 'rattrapage', label: 'Examen de recuperación' },
    ],
  };
  const options = DECISIONS[countryCode] || DECISIONS.cameroon_fr;

  const handleChange = async (e) => {
    const val = e.target.value;
    await saveGrade(classId, studentId, lastSeq, { __decision__: val });
  };

  return (
    <div className="mb-4 p-3 rounded-xl border border-amber-200 bg-amber-50 no-print">
      <label className="text-xs font-semibold text-amber-900 uppercase tracking-wider block mb-1.5">
        {countryCode === 'guinea_eq'
          ? 'Decisión del Consejo de Curso (anual)'
          : t('Décision du conseil de classe (annuel)', 'End-of-year council decision')}
      </label>
      <select
        className="form-input bg-white"
        value={current || ''}
        onChange={handleChange}
      >
        <option value="">
          {countryCode === 'guinea_eq' ? '— Automática según media —'
            : t('— Automatique d\'après la moyenne —', '— Auto from average —')}
        </option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

// ── Page principale ───────────────────────────────────────────────────────────
function WatermarkWrap({ active, children }) {
  if (!active) return children;
  return (
    <div style={{ position: 'relative' }}>
      {children}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 10,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden',
      }}>
        <span style={{
          transform: 'rotate(-35deg)',
          fontSize: '4rem', fontWeight: 900, letterSpacing: '0.05em',
          color: 'rgba(99,102,241,0.12)',
          textTransform: 'uppercase', whiteSpace: 'nowrap', userSelect: 'none',
        }}>
          NotesCam Starter
        </span>
      </div>
    </div>
  );
}


export default function Bulletins() {
  const t = useT();
  const { plan, f } = usePlan();

  const PERIODS = [
    { value: 'seq_1',  label: t('Séquence 1',  'Sequence 1'),  short: 'Séq 1', seqs: [1] },
    { value: 'seq_2',  label: t('Séquence 2',  'Sequence 2'),  short: 'Séq 2', seqs: [2] },
    { value: 'seq_3',  label: t('Séquence 3',  'Sequence 3'),  short: 'Séq 3', seqs: [3] },
    { value: 'seq_4',  label: t('Séquence 4',  'Sequence 4'),  short: 'Séq 4', seqs: [4] },
    { value: 'seq_5',  label: t('Séquence 5',  'Sequence 5'),  short: 'Séq 5', seqs: [5] },
    { value: 'seq_6',  label: t('Séquence 6',  'Sequence 6'),  short: 'Séq 6', seqs: [6] },
    { value: 'term_1', label: t('Trimestre 1', 'Quarter 1'),   short: 'T1',    seqs: [1, 2] },
    { value: 'term_2', label: t('Trimestre 2', 'Quarter 2'),   short: 'T2',    seqs: [3, 4] },
    { value: 'term_3', label: t('Trimestre 3', 'Quarter 3'),   short: 'T3',    seqs: [5, 6] },
    { value: 'annuel', label: t('Annuel',       'Annual'),      short: 'Ann.',  seqs: [1, 2, 3, 4, 5, 6] },
  ];

  const PERIODS_PRIMAIRE = [
    { value: 'tri_1',  label: t('Trimestre 1', 'Quarter 1'), short: 'T1',   seqs: [1] },
    { value: 'tri_2',  label: t('Trimestre 2', 'Quarter 2'), short: 'T2',   seqs: [2] },
    { value: 'tri_3',  label: t('Trimestre 3', 'Quarter 3'), short: 'T3',   seqs: [3] },
    { value: 'annuel', label: t('Annuel',       'Annual'),    short: 'Ann.', seqs: [1, 2, 3] },
  ];

  const school         = useAuthStore((s) => s.school);
  const role           = useAuthStore((s) => s.role);
  const teacherId      = useAuthStore((s) => s.teacherId);
  const schoolLanguage = school?.language || 'francophone';
  const classes        = useSchoolStore((s) => s.classes);
  const subjects = useSchoolStore((s) => s.subjects);
  const students = useSchoolStore((s) => s.students);
  const gradeMap = useSchoolStore((s) => s.gradeMap);
  const teachers = useSchoolStore((s) => s.teachers);

  const myTeacher       = role === 'teacher' ? teachers.find((t) => t.id === teacherId) : null;

  const FORMATS = [
    { key: 'classic',     label: t('Classique',   'Classic'),    icon: '📄' },
    { key: 'modern',      label: t('Moderne',     'Modern'),     icon: '✨' },
    { key: 'apc',         label: 'APC',                          icon: '🎯' },
    { key: 'apc_moderne', label: t('APC Moderne', 'APC Modern'), icon: '🏫' },
  ];

  // Guinea Ecuatorial : deux modelos oficiales (sin terminología camerunesa).
  const GE_FORMATS = [
    { key: 'boletin',         label: 'Clásico',   icon: '📄' },
    { key: 'boletin_detalle', label: 'Detallado', icon: '🗂️' },
  ];
  const canPrint        = role !== 'teacher' || (myTeacher?.can_print_bulletin ?? true);

  const classId   = useUiStore((s) => s.bulletinsClassId);
  const setClassId   = useUiStore((s) => s.setBulletinsClassId);
  const periodKey = useUiStore((s) => s.bulletinsPeriodKey);
  const setPeriodKey = useUiStore((s) => s.setBulletinsPeriodKey);
  const studentId = useUiStore((s) => s.bulletinsStudentId);
  const setStudentId = useUiStore((s) => s.setBulletinsStudentId);
  const format    = useUiStore((s) => s.bulletinsFormat);
  const setFormat    = useUiStore((s) => s.setBulletinsFormat);

  const [printAll,        setPrintAll]        = useState(false);
  const [sidebarSearch,   setSidebarSearch]   = useState('');
  const [screenshotBlur,  setScreenshotBlur]  = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [printCount,      setPrintCount]      = useState(() => {
    if (typeof window === 'undefined') return 0;
    try {
      const info = JSON.parse(localStorage.getItem('nc_print_daily') || '{}');
      const today = new Date().toISOString().split('T')[0];
      return info.date === today ? (info.count || 0) : 0;
    } catch { return 0; }
  });

  const selectedClass = classes.find((c) => c.id === classId) || null;
  const cycle         = selectedClass?.cycle || 'secondaire';
  const sys           = selectedClass?.system || 'FR';
  // Options de notation GE (échelle /10 ou /20, coef primaire) — {} hors GE.
  const gOpts         = gradingOpts(school, cycle);

  // Périodes Guinea Ecuatorial — 3 trimestres en espagnol + anual.
  const PERIODS_GE = [
    { value: 'trim_1', label: 'Primer Trimestre',  short: '1T',   seqs: [1] },
    { value: 'trim_2', label: 'Segundo Trimestre', short: '2T',   seqs: [2] },
    { value: 'trim_3', label: 'Tercer Trimestre',  short: '3T',   seqs: [3] },
    { value: 'anual',  label: 'Anual',              short: 'Anu.', seqs: [1, 2, 3] },
  ];

  // Résolution du pays — pilote la liste des périodes au-delà de FR/EN.
  const schoolCountryCode = resolveCountryCode(school);

  const periodsForClass =
    schoolCountryCode === 'guinea_eq'
      ? PERIODS_GE
      : cycle !== 'secondaire'
        ? PERIODS_PRIMAIRE
        : sys === 'EN' ? PERIODS_EN : PERIODS;
  const period = periodsForClass.find((p) => p.value === periodKey) || periodsForClass[0] || PERIODS[0];

  const classSubjects = useMemo(() =>
    subjects.filter((s) => s.class_id === classId).sort((a, b) => b.coef - a.coef || a.name.localeCompare(b.name)),
    [subjects, classId]
  );
  const classStudents = useMemo(() =>
    students.filter((s) => s.class_id === classId).sort((a, b) => a.name.localeCompare(b.name)),
    [students, classId]
  );
  const selectedStudent = classStudents.find((s) => s.id === studentId) || null;

  // Reset period + student when class ACTUALLY changes (skip on mount to preserve persisted state)
  const prevClassIdRef = useRef(null);
  useEffect(() => {
    if (prevClassIdRef.current === null) { prevClassIdRef.current = classId; return; }
    if (prevClassIdRef.current === classId) return;
    prevClassIdRef.current = classId;
    setStudentId('');
    setSidebarSearch('');
    const cls = classes.find((c) => c.id === classId);
    const newCycle = cls?.cycle || 'secondaire';
    const newSys   = cls?.system || 'FR';
    if (schoolCountryCode === 'guinea_eq') setPeriodKey('trim_1');
    else if (newCycle !== 'secondaire')    setPeriodKey('tri_1');
    else if (newSys === 'EN')              setPeriodKey('term_1');
    else                                   setPeriodKey('seq_1');
  }, [classId, classes]);

  const ranks = useMemo(() => {
    if (cycle === 'maternelle' || !classStudents.length || !classSubjects.length) return [];
    return buildRanks(classStudents, gradeMap, classId, period.seqs, classSubjects, sys, {}, gOpts);
  }, [cycle, classStudents, classSubjects, gradeMap, classId, period.seqs, sys, gOpts.maxScale, gOpts.useCoef]);

  const stats = useMemo(() => {
    if (cycle === 'maternelle' || !classStudents.length || !classSubjects.length) return null;
    return clsStat(classStudents, gradeMap, classId, period.seqs, classSubjects, sys, {}, gOpts);
  }, [cycle, classStudents, classSubjects, gradeMap, classId, period.seqs, sys, gOpts.maxScale, gOpts.useCoef]);

  const passThreshold = sys === 'ES' ? geGradeMax(school) / 2 : sys === 'FR' ? 10 : 50;

  const admisCount = useMemo(() => {
    if (cycle === 'maternelle' || !classStudents.length || !classSubjects.length) return null;
    return classStudents.filter((s) => {
      const subjectGrades = {};
      classSubjects.forEach((sub) => {
        subjectGrades[sub.id] = subjectGrade(sub, s.id, classId, period.seqs, gradeMap);
      });
      const scores = {};
      Object.entries(subjectGrades).forEach(([id, g]) => { if (g !== null) scores[id] = String(g); });
      const avg = getAvg(scores, classSubjects, sys, gOpts);
      return avg !== null && avg >= passThreshold;
    }).length;
  }, [classStudents, classSubjects, classId, period.seqs, gradeMap, sys, cycle, passThreshold, gOpts.maxScale, gOpts.useCoef]);

  const bulletinDataFor = useCallback((student) => {
    const thisCycle = classes.find((c) => c.id === classId)?.cycle || 'secondaire';

    if (thisCycle === 'maternelle') {
      return { subjectGrades: {}, studentAvg: null, rank: null };
    }

    const subjectGrades = {};
    classSubjects.forEach((sub) => {
      subjectGrades[sub.id] = subjectGrade(sub, student.id, classId, period.seqs, gradeMap);
    });
    const scores = {};
    Object.entries(subjectGrades).forEach(([id, g]) => { if (g !== null) scores[id] = String(g); });
    const avg  = getAvg(scores, classSubjects, sys, gOpts);
    const rank = ranks.find((r) => r.id === student.id) || null;
    return { subjectGrades, studentAvg: avg, rank };
  }, [classSubjects, classId, period.seqs, gradeMap, sys, ranks, classes, gOpts.maxScale, gOpts.useCoef]);

  useEffect(() => {
    if (!printAll) return;
    const timer = setTimeout(() => { window.print(); setPrintAll(false); }, 150);
    return () => clearTimeout(timer);
  }, [printAll]);

  // Protection capture d'écran : blur sur keydown, retire après 3s
  useEffect(() => {
    const onDown = (e) => { if (e.key === 'PrintScreen') setScreenshotBlur(true); };
    const onUp   = (e) => { if (e.key === 'PrintScreen') setTimeout(() => setScreenshotBlur(false), 3000); };
    document.addEventListener('keydown', onDown);
    document.addEventListener('keyup',   onUp);
    return () => {
      document.removeEventListener('keydown', onDown);
      document.removeEventListener('keyup',   onUp);
    };
  }, []);

  const printRemaining = plan === 'starter'
    ? Math.max(0, STARTER_DAILY_PRINT_LIMIT - printCount)
    : Infinity;

  const handlePrintSingle = () => {
    if (plan === 'starter') {
      if (printRemaining <= 0) { setShowUpgradeModal(true); return; }
      incrementDailyPrint();
      setPrintCount((c) => c + 1);
    }
    window.print();
  };

  const handlePrintAll = () => {
    if (plan === 'starter') { setShowUpgradeModal(true); return; }
    setPrintAll(true);
  };

  const handleChangeFormat = (key) => {
    setFormat(key);
  };

  const hasData = classSubjects.length > 0 && classStudents.length > 0;

  const countryCode = resolveCountryCode(school);

  // Décision annuelle — lue depuis le dernier slot de séquence (champ __decision__).
  // Stocke via Grades.jsx (champs spéciaux conseil de classe) ou via le sélecteur ci-dessous.
  const annualDecisionFor = (sid) => {
    const lastSeq = period?.seqs?.[period.seqs.length - 1];
    if (!lastSeq) return null;
    const slot = gradeMap?.[`${classId}_${sid}_${lastSeq}`] || {};
    return slot['__decision__'] || null;
  };

  const commonProps = {
    school, cls: selectedClass, subjects: classSubjects,
    stats, sys, teachers, gradeMap, classId, cycle, classStudents,
    countryCode,
    maxScale: geGradeMax(school),
    useCoef: gOpts.useCoef ?? true,
  };

  return (
    <Layout>
      <div>
        {/* En-tête page */}
        <div className="flex flex-wrap justify-between items-center mb-4 gap-3 no-print">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t('Bulletins', 'Report Cards')}</h1>
            <p className="text-sm text-gray-500 mt-1">{t('Génération et impression des bulletins scolaires.', 'Generate and print student report cards.')}</p>
          </div>
          {hasData && classId && (
            <div className="flex items-center gap-2">
              {canPrint ? (
                <>
                  <button onClick={handlePrintAll} className="btn-secondary">
                    {t('Imprimer la classe', 'Print all')} ({classStudents.length})
                    {plan === 'starter' && (
                      <span className="ml-1 text-xs text-amber-500">🔒</span>
                    )}
                  </button>
                  {selectedStudent && (
                    <button
                      onClick={handlePrintSingle}
                      className="btn-primary no-print"
                      style={{ width: 'auto', paddingLeft: '1.5rem', paddingRight: '1.5rem' }}
                    >
                      {t('Imprimer ce bulletin', 'Print this report card')}
                      {plan === 'starter' && printRemaining < Infinity && (
                        <span className="ml-2 text-xs opacity-75">({printRemaining} {t('restant', 'left')})</span>
                      )}
                    </button>
                  )}
                </>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 text-amber-700 text-sm border border-amber-200">
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd"/></svg>
                  {t("Impression non autorisée par l'administrateur", 'Printing not authorized by the administrator')}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Sélecteur de format — masqué pour Guinea Ecuatorial (un seul format officiel) */}
        {cycle === 'secondaire' && schoolCountryCode !== 'guinea_eq' && (
          <div className="flex flex-wrap items-center gap-3 mb-4 no-print">
            <span className="text-sm font-medium text-gray-500">{t('Format :', 'Format:')}</span>
            <div className="flex rounded-lg border border-gray-200 overflow-hidden">
              {FORMATS.map(({ key, label, icon }) => (
                <button
                  key={key}
                  onClick={() => handleChangeFormat(key)}
                  className={`px-4 py-2 text-sm font-medium transition-colors ${
                    format === key
                      ? 'bg-brand-700 text-white'
                      : 'bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {icon} {label}
                </button>
              ))}
            </div>
            {format === 'apc' && (
              <span className="text-xs text-gray-400 italic">
                {t('Approche Par Compétences — niveaux NA / EC / AQ / BA', 'Competency-Based Approach — levels NA / EC / AQ / BA')}
              </span>
            )}
            {format === 'modern' && (
              <span className="text-xs text-gray-400 italic">
                {t('Mise en page épurée avec barres de progression', 'Clean layout with progress bars')}
              </span>
            )}
          </div>
        )}

        {/* Guinea Ecuatorial — elección entre dos modelos oficiales de boletín */}
        {schoolCountryCode === 'guinea_eq' && cycle !== 'maternelle' && (
          <div className="mb-4 no-print">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-medium text-gray-500">Modelo de boletín :</span>
              <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                {GE_FORMATS.map(({ key, label, icon }) => {
                  const active = (format === 'boletin_detalle' ? 'boletin_detalle' : 'boletin') === key;
                  return (
                    <button
                      key={key}
                      onClick={() => handleChangeFormat(key)}
                      className={`px-4 py-2 text-sm font-medium transition-colors ${
                        active ? 'bg-emerald-700 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {icon} {label}
                    </button>
                  );
                })}
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-1.5 inline-flex items-center gap-1">
              📋 Boletín oficial — Ministerio de Educación de Guinea Ecuatorial
            </p>
          </div>
        )}

        {/* Sélecteurs classe + période */}
        <div className="flex flex-wrap gap-4 mb-5 no-print">
          <div className="flex-1 min-w-[180px] max-w-xs">
            <label className="form-label">{t('Classe', 'Class')}</label>
            <select className="form-input" value={classId} onChange={(e) => setClassId(e.target.value)}>
              <option value="">{t('Choisir…', 'Choose…')}</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}{schoolLanguage === 'bilingue' ? ` [${c.system === 'EN' ? 'EN /100' : 'FR /20'}]` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Période — cachée pour maternelle camerounaise (bulletin toujours annuel).
              Guinea Ecuatorial : afficher même pour preescolar (3 trimestres officiels). */}
          {classId && (cycle !== 'maternelle' || schoolCountryCode === 'guinea_eq') && (
            <div className="flex-1 min-w-[180px] max-w-xs">
              <label className="form-label">{t('Période', 'Period')}</label>
              <select className="form-input" value={periodKey} onChange={(e) => setPeriodKey(e.target.value)}>
                {schoolCountryCode === 'guinea_eq' ? (
                  <>
                    <optgroup label="Trimestres">
                      {PERIODS_GE.filter((p) => p.value !== 'anual').map((p) => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                      ))}
                    </optgroup>
                    <optgroup label="Resumen">
                      <option value="anual">Anual (1T + 2T + 3T)</option>
                    </optgroup>
                  </>
                ) : cycle === 'secondaire' && sys === 'EN' ? (
                  <>
                    <optgroup label="Terms">
                      {PERIODS_EN.filter((p) => p.value !== 'annuel').map((p) => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                      ))}
                    </optgroup>
                    <optgroup label="Summary">
                      <option value="annuel">Annual (Term 1 + Term 2 + Term 3)</option>
                    </optgroup>
                  </>
                ) : cycle === 'secondaire' ? (
                  <>
                    <optgroup label={t('Séquences', 'Sequences')}>
                      {PERIODS.filter((p) => p.seqs.length === 1).map((p) => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                      ))}
                    </optgroup>
                    <optgroup label={t('Trimestres (moyenne de 2 séquences)', 'Quarters (average of 2 sequences)')}>
                      {PERIODS.filter((p) => p.seqs.length === 2).map((p) => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                      ))}
                    </optgroup>
                    <optgroup label={t('Récapitulatif', 'Summary')}>
                      <option value="annuel">{t('Annuel (T1 + T2 + T3)', 'Annual (Q1 + Q2 + Q3)')}</option>
                    </optgroup>
                  </>
                ) : (
                  PERIODS_PRIMAIRE.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))
                )}
              </select>
            </div>
          )}

          {cycle === 'maternelle' && classId && schoolCountryCode !== 'guinea_eq' && (
            <div className="flex items-end">
              <span className="px-3 py-2 rounded-lg text-xs font-semibold bg-rose-100 text-rose-700">
                {t('Maternelle — bulletin compétences annuel', 'Pre-Primary — annual competency report')}
              </span>
            </div>
          )}
        </div>

        {/* États vides */}
        {!classId && (
          <div className="bg-white rounded-xl p-12 text-center shadow-sm border border-gray-100">
            <div className="text-4xl mb-3">📋</div>
            <p className="text-gray-500 text-sm">{t('Sélectionnez une classe pour générer les bulletins.', 'Select a class to generate report cards.')}</p>
          </div>
        )}
        {classId && !hasData && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-sm text-amber-800">
            {t('Cette classe manque de données. Vérifiez que des', 'This class has no data. Make sure')}{' '}
            <a href="/app/subjects" className="font-semibold underline">
              {cycle === 'maternelle' ? t('domaines de compétences', 'competency domains') : t('matières', 'subjects')}
            </a>{' '}
            {t('et des', 'and')} <a href="/app/students" className="font-semibold underline">{t('élèves', 'students')}</a> {t('sont configurés.', 'are configured.')}
          </div>
        )}

        {/* Layout bulletin : sidebar élèves + aperçu */}
        {hasData && (
          <div className="bulletin-layout">
            {/* Sidebar */}
            <div className="bulletin-sidebar no-print">
              {/* Header */}
              <div className="mb-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  {classStudents.length} {t('élève', 'student')}{classStudents.length > 1 ? 's' : ''} — {selectedClass?.name}
                </p>
                {admisCount !== null && (
                  <p className="text-xs mt-0.5">
                    <span className="text-emerald-600 font-semibold">{admisCount} {t('admis', 'passed')}</span>
                    <span className="text-gray-300 mx-1">·</span>
                    <span className="text-red-500 font-semibold">{classStudents.length - admisCount} {t('ajournés', 'failed')}</span>
                  </p>
                )}
              </div>

              {/* Recherche */}
              {classStudents.length > 8 && (
                <input
                  type="text"
                  placeholder={t('Rechercher élève…', 'Search student…')}
                  value={sidebarSearch}
                  onChange={(e) => setSidebarSearch(e.target.value)}
                  className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 focus:outline-none focus:border-brand-400 bg-white mb-3"
                />
              )}

              {/* Liste */}
              <div className="space-y-1">
                {classStudents
                  .filter((s) => !sidebarSearch || s.name.toLowerCase().includes(sidebarSearch.toLowerCase()))
                  .map((s) => {
                    const { studentAvg, rank } = bulletinDataFor(s);
                    const isPassed = studentAvg !== null && studentAvg >= passThreshold;
                    const color    = avatarColor(s.name);
                    return (
                      <button
                        key={s.id}
                        className={`bulletin-student-btn ${studentId === s.id ? 'active' : ''}`}
                        onClick={() => setStudentId(s.id)}
                      >
                        <div className="flex items-center gap-2">
                          <div
                            className="w-6 h-6 rounded-full flex items-center justify-center text-white font-bold shrink-0"
                            style={{ backgroundColor: color, fontSize: 9 }}
                          >
                            {initials(s.name)}
                          </div>
                          <span className="truncate flex-1 text-sm">{s.name}</span>
                          {rank?.rankN && (
                            <span className="text-[10px] text-gray-400 shrink-0">#{rank.rankN}</span>
                          )}
                          {studentAvg !== null && (
                            <span
                              className="text-xs shrink-0 font-semibold"
                              style={{ color: isPassed ? '#059669' : '#dc2626' }}
                            >
                              {studentAvg}
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                {sidebarSearch && classStudents.filter((s) => s.name.toLowerCase().includes(sidebarSearch.toLowerCase())).length === 0 && (
                  <p className="text-xs text-gray-400 text-center py-3">{t('Aucun résultat', 'No results')}</p>
                )}
              </div>
            </div>

            {/* Zone bulletin */}
            <div className={`bulletin-panel${screenshotBlur ? ' bulletin-screenshot-blur' : ''}`}>
              {/* Décision annuelle — admin only, période annuelle uniquement */}
              {role !== 'teacher' && selectedStudent && period?.seqs?.length >= 3 && (
                <AnnualDecisionPicker
                  classId={classId}
                  studentId={selectedStudent.id}
                  lastSeq={period.seqs[period.seqs.length - 1]}
                  current={annualDecisionFor(selectedStudent.id)}
                  countryCode={countryCode}
                />
              )}
              {!printAll && selectedStudent && (() => {
                const data = bulletinDataFor(selectedStudent);
                return (
                  <WatermarkWrap active={f.watermark}>
                    <BulletinTheme school={school}>
                      <BulletinRenderer
                        format={format}
                        period={period}
                        {...commonProps}
                        student={selectedStudent}
                        subjectGrades={data.subjectGrades}
                        studentAvg={data.studentAvg}
                        rank={data.rank}
                        annualDecision={annualDecisionFor(selectedStudent.id)}
                      />
                    </BulletinTheme>
                  </WatermarkWrap>
                );
              })()}

              {!printAll && !selectedStudent && (
                <div className="bg-white rounded-xl p-12 text-center shadow-sm border border-gray-100 no-print">
                  <div className="text-4xl mb-3">👤</div>
                  <p className="text-gray-500 text-sm">{t('Cliquez sur un élève dans la liste pour afficher son bulletin.', 'Click on a student in the list to view their report card.')}</p>
                </div>
              )}

              {printAll && classStudents.map((student) => {
                const data = bulletinDataFor(student);
                return (
                  <WatermarkWrap key={student.id} active={f.watermark}>
                    <BulletinTheme school={school}>
                      <BulletinRenderer
                        format={format}
                        period={period}
                        {...commonProps}
                        student={student}
                        subjectGrades={data.subjectGrades}
                        studentAvg={data.studentAvg}
                        rank={data.rank}
                        annualDecision={annualDecisionFor(student.id)}
                      />
                    </BulletinTheme>
                  </WatermarkWrap>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Modal mise à niveau plan Starter */}
      {showUpgradeModal && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50 no-print"
          style={{ background: 'rgba(0,0,0,0.55)' }}
          onClick={() => setShowUpgradeModal(false)}
        >
          <div
            className="bg-white rounded-2xl p-7 max-w-sm w-full mx-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center">
              <div className="text-5xl mb-3">🔒</div>
              <h2 className="text-xl font-bold text-gray-900 mb-1">
                {t('Limite atteinte', 'Limit reached')}
              </h2>
              <p className="text-gray-500 text-sm mb-2">
                {t(
                  `Le plan Starter permet d'imprimer ${STARTER_DAILY_PRINT_LIMIT} bulletins par jour. Passez au plan École pour une impression illimitée.`,
                  `The Starter plan allows printing ${STARTER_DAILY_PRINT_LIMIT} report cards per day. Upgrade to the School plan for unlimited printing.`
                )}
              </p>
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 mb-4 text-xs text-amber-700">
                {t('Plan actuel : Starter (Gratuit)', 'Current plan: Starter (Free)')}
                {' → '}
                <strong>{t('Plan École : 8 500 FCFA/mois', 'School plan: 8,500 FCFA/month')}</strong>
              </div>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => setShowUpgradeModal(false)}
                  className="px-4 py-2 rounded-lg text-sm border border-gray-200 text-gray-600 hover:bg-gray-50"
                >
                  {t('Fermer', 'Close')}
                </button>
                <a
                  href="/app/settings"
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
                  style={{ background: '#4f46e5' }}
                >
                  {t('Mettre à niveau', 'Upgrade')}
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Overlay protection capture d'écran */}
      {screenshotBlur && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center no-print"
          style={{ background: 'rgba(0,0,0,0.92)', color: 'white', userSelect: 'none' }}
        >
          <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>🚫</div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '0.4rem' }}>
            {t('Capture d\'écran bloquée', 'Screenshot blocked')}
          </h2>
          <p style={{ color: '#9ca3af', fontSize: '0.9rem' }}>
            {t('Les bulletins scolaires sont protégés.', 'Report cards are protected.')}
          </p>
        </div>
      )}
    </Layout>
  );
}
