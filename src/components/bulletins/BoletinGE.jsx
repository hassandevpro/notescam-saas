// Boletín de notas — Guinea Ecuatorial.
// Diseño profesional en español, notas sobre 10 con apreciaciones del MEC.
// Las props son las mismas que las que recibe BulletinClassic en Bulletins.jsx,
// para que el dispatcher pueda intercambiarlas sin tocar la lógica de cálculo.

import { guineaEq } from '../../countries/guinea_eq';
import { geAnnualDecision } from '../../core/bulletinEngine';
import BulletinPhoto from './BulletinPhoto';
import AssetImg from '../AssetImg';

function apreciacion(nota, maxScale) {
  if (nota === null || nota === undefined) return { text: '—', col: '#6b7280' };
  const f = maxScale / 10;
  const scale = guineaEq.defaultGradeScale;
  const hit = scale.find((s) => nota >= s.min * f && nota <= s.max * f);
  return hit ? { text: hit.mention, col: hit.color } : { text: '—', col: '#6b7280' };
}

function decisionLabel(value) {
  return guineaEq.passingDecisions.find((d) => d.value === value)?.label || '';
}

export default function BoletinGE({
  school, cls, student, subjects, subjectGrades, studentAvg, rank, stats, period,
  gradeMap, classId, teachers, annualDecision, maxScale = 10, useCoef = true, qrSrc,
}) {
  const MAX  = maxScale;       // 10 (défaut) ou 20, choisi par l'admin
  const PASS = maxScale / 2;   // 5/10 ou 10/20
  // studentAvg est déjà calculé sur l'échelle de l'école (via gradingOpts).
  const studentAvg10 = studentAvg;
  const passed = studentAvg10 !== null && studentAvg10 >= PASS;
  const appr   = apreciacion(studentAvg10, MAX);
  const isAnual = period?.seqs?.length >= 3;

  // Décision annuelle : valeur saisie sinon suggestion selon la règle officielle GE.
  const gradesOnScale = {};
  subjects.forEach((sub) => {
    const raw = subjectGrades[sub.id];
    gradesOnScale[sub.id] = raw === null || raw === undefined ? null : Math.round((raw / sub.max) * MAX * 100) / 100;
  });
  const suggestedDecision = geAnnualDecision(subjects, gradesOnScale, PASS);

  // Absencias y comportamiento — leídos de los mismos campos especiales que el bulletin FR.
  let absJ = 0, absNJ = 0;
  let conducta = null;
  for (const seq of (period?.seqs || [])) {
    const s = gradeMap?.[`${classId}_${student.id}_${seq}`] || {};
    if (s['__abs_j__'])    absJ  += parseInt(s['__abs_j__'],  10) || 0;
    if (s['__abs_nj__'])   absNJ += parseInt(s['__abs_nj__'], 10) || 0;
    if (s['__conduite__']) conducta = s['__conduite__'];
  }

  return (
    <div className="bulletin-paper">
      <div className="bulletin-header">
        <div>
          <strong>REPÚBLICA DE GUINEA ECUATORIAL</strong><br />
          Unidad – Paz – Justicia<br />————————<br />
          <em>{school?.region || ''}</em>
        </div>
        <div className="bulletin-logo" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          {school?.logo_url
            ? <AssetImg src={school.logo_url} alt="Logotipo" style={{ width: 90, height: 90, objectFit: 'contain' }} />
            : '🎓'
          }
          {qrSrc && <img src={qrSrc} alt="QR" style={{ width: 48, height: 48 }} />}
        </div>
        <div>
          <strong>MINISTERIO DE EDUCACIÓN</strong><br />
          Y ENSEÑANZA UNIVERSITARIA<br />————————<br />
          <em>{school?.region || ''}</em>
        </div>
      </div>

      <div className="bulletin-school">
        <h1>{school?.name || 'Centro educativo'}</h1>
        <p>
          {school?.address ? `Apdo. ${school.address} · ` : ''}
          {school?.phone || ''}
          {school?.type ? ` · Enseñanza ${school.type}` : ''}
        </p>
        <p>Año escolar: <strong>{school?.current_year || '—'}</strong></p>
      </div>

      <div className="bulletin-title">
        {isAnual
          ? `Boletín Anual de Calificaciones — ${period.label}`
          : `Boletín de Calificaciones — ${period.label}`}
      </div>

      <div className="bulletin-student" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <BulletinPhoto src={student.photo_url} width={56} height={70} />
        <div className="bulletin-student-grid" style={{ flex: 1 }}>
          <div><strong>Apellidos y nombre :</strong>&nbsp;{student.name}</div>
          <div><strong>Nº de matrícula :</strong>&nbsp;{student.matricule || '—'}</div>
          <div><strong>Curso :</strong>&nbsp;{cls?.name || '—'}</div>
          <div><strong>Sexo :</strong>&nbsp;{student.gender || '—'}</div>
          <div><strong>Puesto :</strong>&nbsp;{rank?.rankD || '—'} / {stats?.total ?? '—'}</div>
          <div><strong>Efectivo :</strong>&nbsp;{stats?.total ?? '—'}</div>
        </div>
      </div>

      <table className="bulletin-table">
        <thead>
          <tr>
            <th style={{ width: '38%', textAlign: 'left' }}>Asignatura</th>
            <th>Nota/{MAX}</th>
            <th>Coef</th>
            <th>N×C</th>
            <th style={{ width: '25%' }}>Apreciación</th>
          </tr>
        </thead>
        <tbody>
          {subjects.map((sub) => {
            const raw     = subjectGrades[sub.id];
            // Ramener la note de la matière sur l'échelle de l'école (/10 ou /20).
            const grade =
              raw === null || raw === undefined ? null
              : Math.round((raw / sub.max) * MAX * 100) / 100;
            const effCoef  = useCoef ? sub.coef : 1;
            const gradeStr = grade !== null ? String(grade) : 'NP'; // NP = no presentado
            const mxc      = grade !== null ? Math.round(grade * effCoef * 100) / 100 : '—';
            const a        = grade !== null ? apreciacion(grade, MAX) : null;
            const prof     = teachers?.find((t) => t.id === sub.teacher_id);
            return (
              <tr key={sub.id}>
                <td className="subject-name">
                  <span>{sub.name}</span>
                  {prof && (
                    <span style={{ display: 'block', fontSize: '0.7em', color: '#6b7280', fontWeight: 'normal' }}>
                      {prof.name}
                    </span>
                  )}
                </td>
                <td className="grade-cell"
                    style={{ color: grade !== null ? (grade >= PASS ? '#059669' : '#dc2626') : '#6b7280' }}>
                  {gradeStr}
                </td>
                <td style={{ textAlign: 'center' }}>{effCoef}</td>
                <td style={{ textAlign: 'center' }}>{mxc}</td>
                <td className="appreciation-cell" style={{ color: a?.col || '#6b7280' }}>
                  {a?.text || '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="bulletin-bottom">
        <div className="bulletin-box">
          <div className="bulletin-box-title">Resultados</div>
          <div className="bulletin-box-body">
            <p><span>Media general</span>
              <strong style={{ color: passed ? '#059669' : '#dc2626' }}>
                {studentAvg !== null ? `${Math.round(studentAvg * 100) / 100}/${MAX}` : '—'}
              </strong>
            </p>
            <p><span>Puesto</span><strong>{rank?.rankD || '—'} / {stats?.total ?? '—'}</strong></p>
            <p><span>Apreciación</span>
              <strong style={{ color: appr?.col }}>{appr?.text || '—'}</strong>
            </p>
            {isAnual && (
              <p><span>Decisión</span>
                <strong style={{ color: passed ? '#059669' : '#dc2626' }}>
                  {decisionLabel(annualDecision) || decisionLabel(suggestedDecision)}
                </strong>
              </p>
            )}
          </div>
        </div>

        <div className="bulletin-box">
          <div className="bulletin-box-title">Asistencia y comportamiento</div>
          <div className="bulletin-box-body">
            <p><span>Faltas justificadas</span><strong>{absJ}</strong></p>
            <p><span>Faltas no justificadas</span><strong>{absNJ}</strong></p>
            <p><span>Comportamiento</span><strong>{conducta || '—'}</strong></p>
          </div>
        </div>
      </div>

      <div className="bulletin-signatures">
        <div className="signature-block">
          <div>El tutor / La tutora</div>
          <div className="signature-line">_______________</div>
        </div>
        <div className="signature-block">
          <div>El profesor encargado</div>
          <div className="signature-line">_______________</div>
        </div>
        <div className="signature-block">
          <div>El Director / La Directora</div>
          {(school?.signature_url || school?.stamp_url) && (
            <div style={{ position: 'relative', height: 80, marginTop: 4 }}>
              {school?.signature_url && (
                <AssetImg src={school.signature_url} alt="Firma"
                  style={{ height: 54, maxWidth: 150, objectFit: 'contain', position: 'absolute', left: '50%', top: 20, transform: 'translateX(-50%)' }} />
              )}
              {school?.stamp_url && (
                <AssetImg src={school.stamp_url} alt="Sello"
                  style={{ height: 78, width: 78, objectFit: 'contain', position: 'absolute', left: '50%', top: 0, transform: 'translateX(-62%) rotate(-9deg)', opacity: 0.85 }} />
              )}
            </div>
          )}
          <div className="signature-line">_______________</div>
        </div>
      </div>
    </div>
  );
}
