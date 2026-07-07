// Bulletin APC officiel (MINESEC, premier cycle) — APERÇU ÉCRAN imprimable.
//
// Rendu piloté par le moteur d'AUTO-FIT `planApcLayout` (src/core/apcLayout.js) :
//   • choisit la PLUS GRANDE police ≥ 10pt qui fait tenir le bulletin sur 2 pages ;
//   • répartit les matières sur les pages en remplissant l'espace ;
//   • coupe une matière au niveau compétence seulement si nécessaire — l'en-tête de
//     colonnes est répété et la matière coupée porte « (suite) » ;
//   • pied (TOTAL + synthèse) et signature sur la dernière page ;
//   • numérotation « Page X sur Y » par élève.
// En-tête institutionnel / filigrane / identité / signature mutualisés (parts).

import {
  mkCell, mkTH, fix2, L,
  OfficialHeader, OfficialIdentity, OfficialSignatures, OfficialSheet, ContinuationHeader,
} from './bulletinOfficialParts';
import { planApcLayout, apcHeaderPt } from '../../core/apcLayout';
import { APC_COTE_CODES, APC_COTE_COLORS, apcBulletinCols } from '../../core/apcEngine';

// Colonnes fixes (toujours affichées) + colonnes de fin optionnelles pilotées par
// les bascules de l'établissement (COTE / [Min–Max] / Appréciation).
const FIXED_COLS = (sys) => [
  { key: 'mat',  w: '19%', label: L(sys, "MATIÈRES ET NOM DE L'ENSEIGNANT", "SUBJECTS & TEACHER'S NAME", 'ASIGNATURAS Y DOCENTE'), left: true },
  { key: 'comp', w: '42%', label: L(sys, 'COMPÉTENCES ÉVALUÉES', 'COMPETENCIES ASSESSED', 'COMPETENCIAS EVALUADAS'), left: true },
  { key: 'n',    w: '6%',  label: 'N/20' },
  { key: 'm',    w: '6%',  label: 'M/20' },
  { key: 'coef', w: '5%',  label: 'Coef' },
  { key: 'mc',   w: '7%',  label: 'M×coef' },
];
const TRAILING_DEF = (sys) => [
  { key: 'cote', opt: 'cote',         w: '6%', label: L(sys, 'COTE', 'GRADE', 'NOTA') },
  { key: 'mm',   opt: 'minmax',       w: '4%', label: '[Min–Max]' },
  { key: 'app',  opt: 'appreciation', w: '5%', label: L(sys, 'Appréciations et Visa', 'Remarks & Signature', 'Apreciación y Visa') },
];
// Colonnes de fin visibles selon les bascules — au moins une (héberge « MOYENNE »).
const visibleTrailing = (cols, sys) => {
  const t = TRAILING_DEF(sys).filter((c) => cols[c.opt]);
  return t.length ? t : [{ key: 'ph', w: '10%', label: '' }];
};

function TableHead({ th, cols }) {
  return (
    <thead>
      <tr>
        {cols.map((c) => (
          <th key={c.key} style={{ ...th, width: c.w, ...(c.left ? { textAlign: 'left' } : null) }}>{c.label}</th>
        ))}
      </tr>
    </thead>
  );
}

// Un « chunk » de matière = la part de ses compétences présente sur une page.
function MatiereChunk({ chunk, cell, trailing, sys }) {
  const m = chunk.m;
  const rs = chunk.comps.length || 1;
  const span = (first, content, extra) => (first
    ? <td rowSpan={rs} style={{ ...cell, textAlign: 'center', ...extra }}>{content}</td>
    : null);
  const trailContent = (key) => {
    if (key === 'cote') return <strong style={{ color: m.moyenne != null ? APC_COTE_COLORS[m.cote] : undefined }}>{m.moyenne != null ? m.cote : ''}</strong>;
    if (key === 'mm')   return m.minmax ? `${fix2(m.minmax.min)}–${fix2(m.minmax.max)}` : '';
    if (key === 'app')  return m.appreciation || '';
    return '';
  };
  return (
    <tbody className="apc-mat">
      {chunk.comps.map((c, i) => {
        const first = i === 0;
        return (
          <tr key={i}>
            {first && (
              <td rowSpan={rs} style={cell}>
                <strong>{m.nom}{chunk.contFromPrev ? L(sys, ' (suite)', ' (cont.)', ' (cont.)') : ''}</strong><br />
                <span style={{ color: '#666' }}>{m.enseignant || L(sys, 'M/Mme', 'Mr/Mrs', 'Sr/Sra')}</span>
              </td>
            )}
            <td style={cell}>{c.intitule}</td>
            <td style={{ ...cell, textAlign: 'center' }}>{fix2(c.note)}</td>
            {span(first, <strong>{fix2(m.moyenne)}</strong>)}
            {span(first, String(m.coef))}
            {span(first, fix2(m.ponderee))}
            {first && trailing.map((tc) => (
              <td key={tc.key} rowSpan={rs} style={{ ...cell, textAlign: 'center' }}>{trailContent(tc.key)}</td>
            ))}
          </tr>
        );
      })}
    </tbody>
  );
}

function TotalRow({ data, cell, empty, colCount, trailCount, sys }) {
  return (
    <tbody>
      {empty && (
        <tr><td colSpan={colCount} style={{ ...cell, textAlign: 'center', color: '#9ca3af', padding: '10px' }}>{L(sys, 'Aucune compétence évaluée pour cette période.', 'No competency assessed for this period.', 'Ninguna competencia evaluada en este periodo.')}</td></tr>
      )}
      <tr>
        <td colSpan={3} style={{ ...cell, textAlign: 'right', fontWeight: 'bold' }}>TOTAL</td>
        <td style={cell} />
        <td style={{ ...cell, textAlign: 'center', fontWeight: 'bold' }}>{fix2(data.coefSum)}</td>
        <td style={{ ...cell, textAlign: 'center', fontWeight: 'bold' }}>{fix2(data.mxSum)}</td>
        <td colSpan={trailCount} style={{ ...cell, textAlign: 'right', fontWeight: 'bold' }}>{L(sys, 'MOYENNE', 'AVERAGE', 'PROMEDIO')} : {fix2(data.moyenneGenerale)}</td>
      </tr>
    </tbody>
  );
}

// Pieds : Discipline | Travail de l'élève | Profil de la classe + appréciation.
function FooterBlocks({ data, classStats, rang, effectif, cell, head, sys, appreciation }) {
  const coteCounts = APC_COTE_CODES.reduce((o, code) => {
    o[code] = data.matieres.filter((m) => m.moyenne != null && m.cote === code).length; return o;
  }, {});
  const KV = ({ k, v, strong }) => (
    <tr><td style={cell}>{k}</td><td style={{ ...cell, textAlign: 'center' }}>{strong ? <strong>{v}</strong> : v}</td></tr>
  );
  const Mini = ({ title, children }) => (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <tbody><tr><td colSpan={2} style={head}>{title}</td></tr>{children}</tbody>
    </table>
  );
  return (
    <>
      <table className="apc-keep" style={{ width: '100%', borderCollapse: 'collapse', marginTop: 5 }}>
        <tbody>
          <tr>
            <td style={{ width: '34%', verticalAlign: 'top', paddingRight: 4 }}>
              <Mini title={L(sys, 'Discipline', 'Discipline', 'Disciplina')}>
                <KV k={L(sys, 'Abs. non just. (h)', 'Unjust. abs. (h)', 'Faltas injust. (h)')} v="" /><KV k={L(sys, 'Abs. just. (h)', 'Just. abs. (h)', 'Faltas just. (h)')} v="" />
                <KV k={L(sys, 'Retards (nombre)', 'Lateness (count)', 'Retrasos (n.º)')} v="" /><KV k={L(sys, 'Consignes (h)', 'Detention (h)', 'Sanciones (h)')} v="" />
                <KV k={L(sys, 'Avertissement', 'Warning', 'Amonestación')} v="" /><KV k={L(sys, 'Blâme de conduite', 'Conduct reprimand', 'Censura de conducta')} v="" />
                <KV k={L(sys, 'Exclusions (jours)', 'Exclusions (days)', 'Expulsiones (días)')} v="" /><KV k={L(sys, 'Exclusion définitive', 'Permanent exclusion', 'Expulsión definitiva')} v="" />
              </Mini>
            </td>
            <td style={{ width: '34%', verticalAlign: 'top', paddingRight: 4 }}>
              <Mini title={L(sys, "Travail de l'élève", "Student's work", 'Trabajo del alumno')}>
                <KV k={L(sys, 'Total général', 'Grand total', 'Total general')} v={fix2(data.mxSum)} />
                <KV k="Coef" v={fix2(data.coefSum)} />
                <KV k={L(sys, 'MOYENNE', 'AVERAGE', 'PROMEDIO')} v={fix2(data.moyenneGenerale)} strong />
                <KV k={L(sys, 'Cote', 'Grade', 'Nota')} v={data.moyenneGenerale != null ? data.cote : ''} strong />
                <KV k={L(sys, 'Rang', 'Rank', 'Puesto')} v={rang ? `${rang} / ${effectif ?? ''}` : ''} strong />
                {APC_COTE_CODES.map((c) => <KV key={c} k={c} v={coteCounts[c]} />)}
              </Mini>
            </td>
            <td style={{ width: '32%', verticalAlign: 'top' }}>
              <Mini title={L(sys, 'Profil de la classe', 'Class profile', 'Perfil de la clase')}>
                <KV k={L(sys, 'Moyenne générale', 'General average', 'Promedio general')} v={fix2(classStats?.avg)} />
                <KV k="[Min – Max]" v={classStats ? `${fix2(classStats.min)} – ${fix2(classStats.max)}` : ''} />
                <KV k={L(sys, 'Nombre de moyennes', 'Number of averages', 'N.º de promedios')} v={classStats?.count ?? ''} />
                <KV k={L(sys, 'Taux de réussite', 'Pass rate', 'Tasa de aprobados')} v={classStats?.rate != null ? `${classStats.rate}%` : ''} />
              </Mini>
            </td>
          </tr>
        </tbody>
      </table>
      <table className="apc-keep" style={{ width: '100%', borderCollapse: 'collapse', marginTop: 3 }}>
        <tbody>
          <tr>
            <td style={{ ...cell, height: 32, verticalAlign: 'top' }}>
              <div style={{ fontWeight: 'bold' }}>{L(sys, "Appréciation du travail de l'élève (points forts et points à améliorer)", "Remarks on the student's work (strengths and areas to improve)", 'Apreciación del trabajo del alumno (puntos fuertes y a mejorar)')}</div>
              {appreciation ? <div style={{ marginTop: 2, whiteSpace: 'pre-wrap' }}>{appreciation}</div> : null}
            </td>
          </tr>
        </tbody>
      </table>
    </>
  );
}

// ── Bulletin APC officiel (auto-fit, 1–2 pages numérotées par élève) ──────────
export default function BulletinApcOfficial({
  school, sys = 'FR', title, student, classLabel, effectif,
  profPrincipal = '', rang, classStats, data, appreciation = '',
}) {
  const { fontPt, lineH, cellPadV, pages, footerPageIndex, totalPages } = planApcLayout(data.matieres);
  const cell = mkCell(fontPt, lineH, cellPadV);
  const th   = mkTH(apcHeaderPt(fontPt), lineH, cellPadV);   // en-tête de colonnes +1pt (11–12pt)
  const idProps = { student, classLabel, effectif, profPrincipal, sys };
  // Colonnes de fin selon les bascules de l'établissement.
  const trailing = visibleTrailing(apcBulletinCols(school), sys);
  const allCols  = [...FIXED_COLS(sys), ...trailing];

  return (
    <>
      {pages.map((chunks, i) => (
        <OfficialSheet key={i} school={school} pt={fontPt} pageNo={i + 1} total={totalPages}>
          {i === 0 ? (
            <>
              <OfficialHeader school={school} sys={sys} title={title} />
              <OfficialIdentity {...idProps} />
            </>
          ) : (
            <ContinuationHeader title={title} student={student} classLabel={classLabel} sys={sys} />
          )}

          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <TableHead th={th} cols={allCols} />
            {chunks.map((chunk, j) => <MatiereChunk key={j} chunk={chunk} cell={cell} trailing={trailing} sys={sys} />)}
            {i === footerPageIndex && <TotalRow data={data} cell={cell} empty={data.matieres.length === 0} colCount={allCols.length} trailCount={trailing.length} sys={sys} />}
          </table>

          {i === footerPageIndex && (
            <FooterBlocks data={data} classStats={classStats} rang={rang} effectif={effectif} cell={cell} head={th} sys={sys} appreciation={appreciation} />
          )}
          {i === footerPageIndex && <OfficialSignatures school={school} sys={sys} profPrincipal={profPrincipal} />}
        </OfficialSheet>
      ))}
    </>
  );
}
