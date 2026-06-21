// Boletín de calificaciones — Guinea Ecuatorial (modelo detallado).
// Reutiliza la DISPOSICIÓN del boletín por grupos de asignaturas (tabla agrupada
// + bloques de síntesis), pero 100 % en español y sin ninguna terminología
// camerunesa ni mención "APC". Notas /10 o /20 según la configuración del centro.
//
// Mismas props que BoletinGE (intercambiable por el dispatcher de Bulletins.jsx).

import { guineaEq } from '../../countries/guinea_eq';
import BulletinPhoto from './BulletinPhoto';
import { esGrade, geAnnualDecision } from '../../core/bulletinEngine';

// Agrupación de asignaturas por áreas (etiquetas en español).
const GRUPOS = [
  { key: 'CIENCIAS',  label: 'CIENCIAS' },
  { key: 'LENGUAS',   label: 'LENGUAS' },
  { key: 'SOCIALES',  label: 'CIENCIAS SOCIALES' },
  { key: 'ARTES',     label: 'ARTES Y DEPORTE' },
  { key: 'OTRAS',     label: 'OTRAS ASIGNATURAS' },
];

function grupoDe(nombre) {
  const n = (nombre || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (/matematic|fisic|quimic|biolog|natural|informatic|tecnolog|ciencia/.test(n)) return 'CIENCIAS';
  if (/lengua|espanol|ingles|frances|aleman|literatura|idioma|lectura/.test(n))   return 'LENGUAS';
  if (/social|historia|geografia|civic|ciudadania|etica|filosof|religion/.test(n)) return 'SOCIALES';
  if (/educacion fisica|deporte|musica|arte|dibujo|plastica/.test(n))             return 'ARTES';
  return 'OTRAS';
}

function decisionLabel(value) {
  return guineaEq.passingDecisions.find((d) => d.value === value)?.label || '';
}

export default function BoletinGEDetalle({
  school, cls, student, subjects, subjectGrades, studentAvg, rank, stats, period,
  gradeMap, classId, teachers, annualDecision, classStudents = [], maxScale = 10, useCoef = true, qrSrc,
}) {
  const MAX  = maxScale;
  const PASS = maxScale / 2;
  const isAnual = period?.seqs?.length >= 3;
  const passed  = studentAvg !== null && studentAvg >= PASS;
  const apr = (nota) => (nota === null || nota === undefined ? { text: '—', col: '#6b7280' } : esGrade(nota, MAX));

  // Nota de una asignatura para un alumno, en la escala del centro.
  const notaAsig = (subId, studentId) => {
    const vals = (period?.seqs || []).map((seq) => {
      const v = (gradeMap?.[`${classId}_${studentId}_${seq}`] || {})[subId];
      return !v || v === 'ABS' || v === '' ? null : parseFloat(v);
    }).filter((x) => x !== null && !isNaN(x));
    if (!vals.length) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  };

  const onScale = (sub, raw) => (raw === null || raw === undefined ? null : Math.round((raw / sub.max) * MAX * 100) / 100);

  // Suggestion de décision annuelle selon la règle officielle GE.
  const gradesOnScale = {};
  subjects.forEach((sub) => { gradesOnScale[sub.id] = onScale(sub, subjectGrades[sub.id]); });
  const suggestedDecision = geAnnualDecision(subjects, gradesOnScale, PASS);

  // Puesto del alumno en una asignatura.
  const puestoAsig = (sub) => {
    const mine = subjectGrades[sub.id];
    if (mine === null || mine === undefined) return '—';
    let r = 1, total = 0;
    for (const s of classStudents) {
      const g = notaAsig(sub.id, s.id);
      if (g !== null) { total++; if (g > mine) r++; }
    }
    return total ? `${r}/${total}` : '—';
  };

  // Absencias y conducta (mismos campos especiales que el resto de boletines).
  let absJ = 0, absNJ = 0, conducta = null;
  for (const seq of (period?.seqs || [])) {
    const s = gradeMap?.[`${classId}_${student.id}_${seq}`] || {};
    if (s['__abs_j__'])    absJ  += parseInt(s['__abs_j__'],  10) || 0;
    if (s['__abs_nj__'])   absNJ += parseInt(s['__abs_nj__'], 10) || 0;
    if (s['__conduite__']) conducta = s['__conduite__'];
  }

  // Agrupar asignaturas.
  const agrupadas = {};
  GRUPOS.forEach((g) => { agrupadas[g.key] = []; });
  subjects.forEach((sub) => { (agrupadas[grupoDe(sub.name)] || agrupadas.OTRAS).push(sub); });

  const grupoStats = (subs) => {
    let pts = 0, coefSum = 0;
    subs.forEach((sub) => {
      const g = onScale(sub, subjectGrades[sub.id]);
      if (g !== null) {
        const c = useCoef ? sub.coef : 1;
        pts += g * c; coefSum += c;
      }
    });
    return { avg: coefSum ? Math.round((pts / coefSum) * 100) / 100 : null, coefSum, pts: Math.round(pts * 100) / 100 };
  };

  const border = '1px solid #374151';
  const cell = { border, padding: '3px 5px', fontSize: '10px', verticalAlign: 'middle' };
  const thS  = { ...cell, backgroundColor: '#065f46', color: '#fff', textAlign: 'center', fontWeight: 'bold', fontSize: '9px' };
  const ghdr = { ...cell, backgroundColor: '#0f766e', color: '#fff', fontWeight: 'bold', textAlign: 'center', fontSize: '9px', padding: '2px 5px' };
  const gtot = { ...cell, backgroundColor: '#ecfdf5', fontWeight: 'bold', fontSize: '9px' };
  const info = { ...cell, backgroundColor: '#f8fafc', fontSize: '9px' };

  const tutor = teachers?.find((t) => t.id === cls?.teacher_id) || null;

  return (
    <div className="bulletin-paper" style={{ fontFamily: 'Arial, sans-serif', fontSize: '10px', maxWidth: '210mm', margin: '0 auto', padding: '8px', boxSizing: 'border-box' }}>

      {/* CABECERA */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '5px' }}>
        <tbody>
          <tr>
            <td style={{ width: '34%', textAlign: 'center', fontSize: '9px', lineHeight: 1.5, padding: '2px' }}>
              <strong>REPÚBLICA DE GUINEA ECUATORIAL</strong><br />
              Unidad · Paz · Justicia<br />———————<br />
              {school?.region || ''}
            </td>
            <td style={{ width: '32%', textAlign: 'center', padding: '2px' }}>
              {school?.logo_url && (
                <img src={school.logo_url} alt="Logotipo" style={{ width: 60, height: 60, objectFit: 'contain', display: 'block', margin: '0 auto 3px' }} />
              )}
              <strong style={{ fontSize: '11px', display: 'block' }}>{(school?.name || 'Centro educativo').toUpperCase()}</strong>
              <span style={{ fontSize: '8.5px' }}>Año escolar : <strong>{school?.current_year || '—'}</strong></span>
            </td>
            <td style={{ width: '34%', textAlign: 'center', fontSize: '9px', lineHeight: 1.5, padding: '2px' }}>
              <strong>MINISTERIO DE EDUCACIÓN</strong><br />
              Y ENSEÑANZA UNIVERSITARIA<br />———————<br />
              {school?.region || ''}
            </td>
          </tr>
        </tbody>
      </table>

      {/* TÍTULO */}
      <div style={{ backgroundColor: '#065f46', color: '#fff', textAlign: 'center', padding: '5px 8px', fontWeight: 'bold', fontSize: '11px', letterSpacing: '0.5px', marginBottom: '5px' }}>
        {isAnual ? 'BOLETÍN ANUAL DE CALIFICACIONES' : 'BOLETÍN DE CALIFICACIONES'} — {(period?.label || '').toUpperCase()}
      </div>

      {/* DATOS DEL ALUMNO */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '5px' }}>
        <tbody>
          <tr>
            <td style={{ ...info, width: '10%', textAlign: 'center' }}>
              <BulletinPhoto src={student.photo_url} width={44} height={54} radius={2} />
            </td>
            <td style={{ ...info, width: '30%' }}><strong>APELLIDOS Y NOMBRE :</strong><br /><span style={{ fontWeight: 'bold', color: '#111' }}>{student.name}</span></td>
            <td style={{ ...info, width: '14%' }}><strong>Nº MATRÍCULA :</strong><br />{student.matricule || '—'}</td>
            <td style={{ ...info, width: '14%' }}><strong>F. NACIM. :</strong><br />{student.date_naissance || '—'}</td>
            <td style={{ ...info, width: '14%' }}><strong>CURSO :</strong><br />{cls?.name || '—'}</td>
            <td style={{ ...info, width: '14%' }}><strong>TUTOR/A :</strong><br />{tutor?.name || '—'}</td>
            <td style={{ ...info, width: '14%', textAlign: 'center' }}><strong>EFECTIVO :</strong><br /><strong style={{ fontSize: '13px' }}>{stats?.total ?? '—'}</strong></td>
            {qrSrc && (
              <td style={{ ...info, width: '11%', textAlign: 'center' }}><img src={qrSrc} alt="QR" style={{ width: 44, height: 44 }} /></td>
            )}
          </tr>
        </tbody>
      </table>

      {/* TABLA DE ASIGNATURAS AGRUPADAS */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '5px' }}>
        <thead>
          <tr>
            <th style={{ ...thS, width: '40%', textAlign: 'left' }}>ASIGNATURA</th>
            <th style={{ ...thS, width: '10%' }}>NOTA/{MAX}</th>
            <th style={{ ...thS, width: '8%' }}>COEF</th>
            <th style={{ ...thS, width: '10%' }}>TOTAL</th>
            <th style={{ ...thS, width: '10%' }}>PUESTO</th>
            <th style={{ ...thS, width: '22%' }}>APRECIACIÓN</th>
          </tr>
        </thead>
        {GRUPOS.map((grupo) => {
          const subs = agrupadas[grupo.key] || [];
          if (!subs.length) return null;
          const gs = grupoStats(subs);
          const ga = gs.avg !== null ? apr(gs.avg) : null;
          return (
            <tbody key={grupo.key}>
              <tr><td colSpan={6} style={ghdr}>{grupo.label}</td></tr>
              {subs.map((sub) => {
                const grade = onScale(sub, subjectGrades[sub.id]);
                const effCoef = useCoef ? sub.coef : 1;
                const total = grade !== null ? Math.round(grade * effCoef * 100) / 100 : '—';
                const a = grade !== null ? apr(grade) : null;
                const prof = teachers?.find((t) => t.id === sub.teacher_id);
                const ok = grade !== null && grade >= PASS;
                return (
                  <tr key={sub.id}>
                    <td style={{ ...cell, textAlign: 'left' }}>
                      {sub.name}
                      {prof && <span style={{ display: 'block', fontSize: '8px', color: '#6b7280' }}>{prof.name}</span>}
                    </td>
                    <td style={{ ...cell, textAlign: 'center', fontWeight: 'bold', color: grade !== null ? (ok ? '#059669' : '#dc2626') : '#9ca3af' }}>
                      {grade !== null ? grade : 'NP'}
                    </td>
                    <td style={{ ...cell, textAlign: 'center' }}>{effCoef}</td>
                    <td style={{ ...cell, textAlign: 'center' }}>{total}</td>
                    <td style={{ ...cell, textAlign: 'center', fontSize: '9px' }}>{puestoAsig(sub)}</td>
                    <td style={{ ...cell, textAlign: 'center', fontWeight: 'bold', fontSize: '9px', color: a?.col || '#9ca3af' }}>
                      {a?.text || '—'}
                    </td>
                  </tr>
                );
              })}
              <tr>
                <td style={{ ...gtot, textAlign: 'right' }}>TOTAL {grupo.label}</td>
                <td style={{ ...gtot, textAlign: 'center', color: ga?.col }}>{gs.avg !== null ? gs.avg : '—'}</td>
                <td style={{ ...gtot, textAlign: 'center' }}>{gs.coefSum || '—'}</td>
                <td style={{ ...gtot, textAlign: 'center' }}>{gs.pts || '—'}</td>
                <td style={{ ...gtot, textAlign: 'center' }}>—</td>
                <td style={{ ...gtot, textAlign: 'center', color: ga?.col }}>{ga?.text || '—'}</td>
              </tr>
            </tbody>
          );
        })}
      </table>

      {/* BLOQUES DE SÍNTESIS */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '5px' }}>
        <thead>
          <tr>
            <th style={{ ...thS, width: '34%' }}>RESULTADO DEL ALUMNO</th>
            <th style={{ ...thS, width: '33%' }}>PERFIL DE LA CLASE</th>
            <th style={{ ...thS, width: '33%' }}>ASISTENCIA Y CONDUCTA</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ ...cell, verticalAlign: 'top', padding: '5px' }}>
              <div>Media : <strong style={{ color: passed ? '#059669' : '#dc2626' }}>{studentAvg !== null ? `${studentAvg}/${MAX}` : '—'}</strong></div>
              <div>Puesto : <strong>{rank?.rankD || '—'} / {stats?.total ?? '—'}</strong></div>
              <div>Apreciación : <strong style={{ color: apr(studentAvg)?.col }}>{apr(studentAvg)?.text || '—'}</strong></div>
              {isAnual && (
                <div style={{ marginTop: 3 }}>
                  Decisión : <strong style={{ color: passed ? '#059669' : '#dc2626' }}>
                    {decisionLabel(annualDecision) || decisionLabel(suggestedDecision)}
                  </strong>
                </div>
              )}
            </td>
            <td style={{ ...cell, verticalAlign: 'top', padding: '5px' }}>
              <div>Media de la clase : <strong>{stats?.avg != null ? `${stats.avg}/${MAX}` : '—'}</strong></div>
              <div>Nota más alta : <strong>{stats?.max != null ? `${stats.max}/${MAX}` : '—'}</strong></div>
              <div>Nota más baja : <strong>{stats?.min != null ? `${stats.min}/${MAX}` : '—'}</strong></div>
              <div>Aprobados : <strong>{stats?.above != null && stats?.total ? `${stats.above}/${stats.total} (${Math.round((stats.above / stats.total) * 100)}%)` : '—'}</strong></div>
            </td>
            <td style={{ ...cell, verticalAlign: 'top', padding: '5px' }}>
              <div>Faltas justificadas : <strong>{absJ}</strong></div>
              <div>Faltas no justificadas : <strong>{absNJ}</strong></div>
              <div>Comportamiento : <strong>{conducta || '—'}</strong></div>
            </td>
          </tr>
        </tbody>
      </table>

      {/* OBSERVACIONES */}
      <div style={{ border, padding: '6px 8px', minHeight: 26, marginBottom: '6px', fontSize: '9px' }}>
        <strong style={{ textTransform: 'uppercase', color: '#374151' }}>Observaciones :</strong>
      </div>

      {/* FIRMAS */}
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          <tr>
            <td style={{ ...cell, width: '33%', textAlign: 'center', height: 52, verticalAlign: 'bottom', paddingBottom: 5 }}>
              <strong style={{ fontSize: '9px' }}>El Tutor / La Tutora</strong>
            </td>
            <td style={{ ...cell, width: '34%', textAlign: 'center', verticalAlign: 'bottom', paddingBottom: 5 }}>
              <strong style={{ fontSize: '9px' }}>La Junta de Evaluación</strong>
            </td>
            <td style={{ ...cell, width: '33%', textAlign: 'center', verticalAlign: 'top', paddingTop: 5 }}>
              <strong style={{ fontSize: '9px' }}>EL DIRECTOR / LA DIRECTORA</strong>
              {(school?.signature_url || school?.stamp_url) && (
                <div style={{ position: 'relative', height: 66, marginTop: 2 }}>
                  {school?.signature_url && (
                    <img src={school.signature_url} alt="Firma"
                      style={{ height: 46, maxWidth: 130, objectFit: 'contain', position: 'absolute', left: '50%', top: 16, transform: 'translateX(-50%)' }} />
                  )}
                  {school?.stamp_url && (
                    <img src={school.stamp_url} alt="Sello"
                      style={{ height: 64, width: 64, objectFit: 'contain', position: 'absolute', left: '50%', top: 0, transform: 'translateX(-60%) rotate(-8deg)', opacity: 0.85 }} />
                  )}
                </div>
              )}
            </td>
          </tr>
        </tbody>
      </table>

      <p style={{ fontSize: '7.5px', color: '#9ca3af', textAlign: 'center', fontStyle: 'italic', margin: '4px 0 0' }}>
        Este boletín solo es válido con la firma y el sello del director del centro.
      </p>
    </div>
  );
}
