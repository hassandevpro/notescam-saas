// Bulletin APC ANNUEL (MINESEC, premier cycle) — APERÇU ÉCRAN imprimable.
//
// Format ministériel : une ligne PAR MATIÈRE avec les moyennes T1 · T2 · T3, la
// moyenne annuelle, Coef, M×coef, COTE, appréciation ; puis synthèse (Travail /
// Discipline / Profil de la classe) + DÉCISION DU CONSEIL DE CLASSE + signature.
// Niveau matière (pas de compétences) → compact : tient sur 1 page. En-tête /
// filigrane / identité / signature mutualisés (bulletinOfficialParts).

import {
  mkCell, mkTH, fix2, L,
  OfficialHeader, OfficialIdentity, OfficialSheet, OfficialSignatures,
} from './bulletinOfficialParts';
import { APC_COTE_CODES, APC_COTE_COLORS, apcBulletinCols } from '../../core/apcEngine';

// Colonnes de fin optionnelles du bulletin annuel : COTE / Appréciation (pas de
// [Min–Max] en annuel). Au moins une reste affichée pour héberger « MOYENNE ».
const ANNUAL_TRAILING = (sys) => [
  { key: 'cote', opt: 'cote',         w: '7%',  label: L(sys, 'COTE', 'GRADE', 'NOTA') },
  { key: 'app',  opt: 'appreciation', w: '13%', label: L(sys, 'Appréciation', 'Remarks', 'Apreciación') },
];
const annualTrailing = (cols, sys) => {
  const t = ANNUAL_TRAILING(sys).filter((c) => cols[c.opt]);
  return t.length ? t : [{ key: 'ph', w: '13%', label: '' }];
};

// Auto-fit : plus grande police (10 → 8pt) qui fait tenir le bulletin annuel sur
// UNE page A4 (lignes matière sur 1 ligne, donc compactes). Le bulletin annuel
// privilégie le « tout sur une page » → la police peut descendre sous 10pt.
function fitAnnualPt(nMatieres) {
  const rows = nMatieres + 1;                 // matières + ligne TOTAL
  for (const pt of [10, 9.5, 9, 8.5, 8]) {
    const lh = pt * 0.42;
    const rowH   = lh + 1.3;
    const header = 50 + 4 * (lh + 1.6);       // officiel + titre + identité
    const thead  = lh * 2 + 2.5;
    const footer = 6 + 8 * (lh + 1.1) + 30;   // synthèse (≈8 lignes) + décision + bloc signatures (3 col, ~19mm)
    const used   = header + thead + 5 + footer + rows * rowH;
    if (used <= 281) return pt;               // hauteur utile A4 (marges 6mm)
  }
  return 8;
}

export default function BulletinApcAnnual({
  school, sys = 'FR', title = 'BULLETIN ANNUEL', student, classLabel, effectif,
  profPrincipal = '', rang, classStats, data, decision, appreciation = '',
}) {
  const pt   = fitAnnualPt(data.matieres.length);
  const cell = mkCell(pt);
  const th   = mkTH(pt);
  const num  = (v) => (v == null ? <span style={{ color: '#9ca3af' }}>—</span> : fix2(v));
  // Colonnes de fin selon les bascules de l'établissement (COTE / Appréciation).
  const trailing = annualTrailing(apcBulletinCols(school), sys);
  const trailCell = (key, m) => {
    if (key === 'cote') return <td key={key} style={{ ...cell, textAlign: 'center', fontWeight: 'bold', color: m.moyenne != null ? APC_COTE_COLORS[m.cote] : undefined }}>{m.moyenne != null ? m.cote : ''}</td>;
    if (key === 'app')  return <td key={key} style={cell}>{m.appreciation || ''}</td>;
    return <td key={key} style={cell} />;
  };
  const colCount = 7 + trailing.length; // 7 colonnes fixes + colonnes de fin

  const coteCounts = APC_COTE_CODES.reduce((o, code) => {
    o[code] = data.matieres.filter((m) => m.moyenne != null && m.cote === code).length; return o;
  }, {});
  const KV = ({ k, v, strong }) => (
    <tr><td style={cell}>{k}</td><td style={{ ...cell, textAlign: 'center' }}>{strong ? <strong>{v}</strong> : v}</td></tr>
  );
  const Mini = ({ t, children }) => (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}><tbody><tr><td colSpan={2} style={th}>{t}</td></tr>{children}</tbody></table>
  );

  return (
    <OfficialSheet school={school} pt={pt} pageNo={1} total={1}>
      <OfficialHeader school={school} sys={sys} title={title} />
      <OfficialIdentity student={student} classLabel={classLabel} effectif={effectif} profPrincipal={profPrincipal} sys={sys} />

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ ...th, width: '30%', textAlign: 'left' }}>{L(sys, "MATIÈRES ET NOM DE L'ENSEIGNANT", "SUBJECTS & TEACHER'S NAME", 'ASIGNATURAS Y DOCENTE')}</th>
            <th style={{ ...th, width: '8%' }}>T1/20</th>
            <th style={{ ...th, width: '8%' }}>T2/20</th>
            <th style={{ ...th, width: '8%' }}>T3/20</th>
            <th style={{ ...th, width: '10%' }}>{L(sys, 'Moy.An/20', 'Ann.Avg/20', 'Prom.An/20')}</th>
            <th style={{ ...th, width: '7%' }}>Coef</th>
            <th style={{ ...th, width: '9%' }}>M×coef</th>
            {trailing.map((c) => <th key={c.key} style={{ ...th, width: c.w }}>{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {data.matieres.map((m) => (
            <tr key={m.id}>
              <td style={cell}>
                <strong>{m.nom}</strong>
                {m.enseignant ? <span style={{ color: '#666' }}> — {m.enseignant}</span> : null}
              </td>
              <td style={{ ...cell, textAlign: 'center' }}>{num(m.t1)}</td>
              <td style={{ ...cell, textAlign: 'center' }}>{num(m.t2)}</td>
              <td style={{ ...cell, textAlign: 'center' }}>{num(m.t3)}</td>
              <td style={{ ...cell, textAlign: 'center', fontWeight: 'bold' }}>{num(m.moyenne)}</td>
              <td style={{ ...cell, textAlign: 'center' }}>{m.coef}</td>
              <td style={{ ...cell, textAlign: 'center' }}>{m.moyenne != null ? fix2(m.ponderee) : '—'}</td>
              {trailing.map((c) => trailCell(c.key, m))}
            </tr>
          ))}
          {data.matieres.length === 0 && (
            <tr><td colSpan={colCount} style={{ ...cell, textAlign: 'center', color: '#9ca3af', padding: '10px' }}>{L(sys, 'Aucune note pour cette année.', 'No marks for this year.', 'Ninguna nota para este año.')}</td></tr>
          )}
          <tr>
            <td colSpan={4} style={{ ...cell, textAlign: 'right', fontWeight: 'bold' }}>TOTAL</td>
            <td style={cell} />
            <td style={{ ...cell, textAlign: 'center', fontWeight: 'bold' }}>{fix2(data.coefSum)}</td>
            <td style={{ ...cell, textAlign: 'center', fontWeight: 'bold' }}>{fix2(data.mxSum)}</td>
            <td colSpan={trailing.length} style={{ ...cell, textAlign: 'right', fontWeight: 'bold' }}>{L(sys, 'MOYENNE', 'AVERAGE', 'PROMEDIO')} : {fix2(data.moyenneGenerale)}</td>
          </tr>
        </tbody>
      </table>

      {/* Synthèse */}
      <table className="apc-keep" style={{ width: '100%', borderCollapse: 'collapse', marginTop: 5 }}>
        <tbody>
          <tr>
            <td style={{ width: '34%', verticalAlign: 'top', paddingRight: 4 }}>
              <Mini t={L(sys, 'Discipline', 'Discipline', 'Disciplina')}>
                <KV k={L(sys, 'Abs. non just. (h)', 'Unjust. abs. (h)', 'Faltas injust. (h)')} v="" /><KV k={L(sys, 'Abs. just. (h)', 'Just. abs. (h)', 'Faltas just. (h)')} v="" />
                <KV k={L(sys, 'Retards (nombre)', 'Lateness (count)', 'Retrasos (n.º)')} v="" /><KV k={L(sys, 'Exclusions (jours)', 'Exclusions (days)', 'Expulsiones (días)')} v="" />
              </Mini>
            </td>
            <td style={{ width: '34%', verticalAlign: 'top', paddingRight: 4 }}>
              <Mini t={L(sys, "Travail de l'élève", "Student's work", 'Trabajo del alumno')}>
                <KV k={L(sys, 'Moyenne annuelle', 'Annual average', 'Promedio anual')} v={`${fix2(data.moyenneGenerale)}/20`} strong />
                <KV k={L(sys, 'Cote', 'Grade', 'Nota')} v={data.moyenneGenerale != null ? data.cote : ''} strong />
                <KV k={L(sys, 'Rang', 'Rank', 'Puesto')} v={rang ? `${rang} / ${effectif ?? ''}` : ''} strong />
                {APC_COTE_CODES.map((c) => <KV key={c} k={c} v={coteCounts[c]} />)}
              </Mini>
            </td>
            <td style={{ width: '32%', verticalAlign: 'top' }}>
              <Mini t={L(sys, 'Profil de la classe', 'Class profile', 'Perfil de la clase')}>
                <KV k={L(sys, 'Moyenne générale', 'General average', 'Promedio general')} v={fix2(classStats?.avg)} />
                <KV k="[Min – Max]" v={classStats ? `${fix2(classStats.min)} – ${fix2(classStats.max)}` : ''} />
                <KV k={L(sys, 'Nombre de moyennes', 'Number of averages', 'N.º de promedios')} v={classStats?.count ?? ''} />
                <KV k={L(sys, 'Taux de réussite', 'Pass rate', 'Tasa de aprobados')} v={classStats?.rate != null ? `${classStats.rate}%` : ''} />
              </Mini>
            </td>
          </tr>
        </tbody>
      </table>

      {/* Appréciation libre du travail de l'élève (points forts / à améliorer) */}
      <table className="apc-keep" style={{ width: '100%', borderCollapse: 'collapse', marginTop: 4 }}>
        <tbody>
          <tr><td style={{ ...cell, height: 28, verticalAlign: 'top' }}>
            <strong>{L(sys, "Appréciation du travail de l'élève (points forts et points à améliorer)", "Remarks on the student's work (strengths and areas to improve)", 'Apreciación del trabajo del alumno (puntos fuertes y a mejorar)')}</strong>
            {appreciation ? <div style={{ marginTop: 2, whiteSpace: 'pre-wrap' }}>{appreciation}</div> : null}
          </td></tr>
        </tbody>
      </table>

      {/* Décision du conseil de classe (ligne pleine largeur) */}
      <table className="apc-keep" style={{ width: '100%', borderCollapse: 'collapse', marginTop: 4 }}>
        <tbody>
          <tr><td style={cell}><strong>{L(sys, 'Décision du conseil de classe :', 'Class council decision:', 'Decisión del consejo de clase:')}</strong> {decision || '—'}</td></tr>
        </tbody>
      </table>

      {/* Signatures — 3 colonnes distinctes, espacées pour signer (partagé). */}
      <OfficialSignatures school={school} sys={sys} profPrincipal={profPrincipal} />
    </OfficialSheet>
  );
}
