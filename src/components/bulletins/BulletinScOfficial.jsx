// Bulletin SECOND CYCLE MINESEC (lycée) — APERÇU ÉCRAN imprimable.
//
// Pendant React du builder HTML→PDF `scBulletinDoc.js` : matières regroupées en
// GROUPE 1 / GROUPE 2 (coef + charge), sous-totaux, moyenne générale + rang +
// décision du conseil. Imprimé via `window.print()` natif.
//
// Pagination EXPLICITE (mutualisée via `paginateScGroups`) : une `.bulletin-paper`
// = une page physique, numérotée « Page i / N » PAR ÉLÈVE. En-tête répété sur
// chaque page ; synthèse + signature sur la dernière.
//
// Cette maquette sert AUSSI au bulletin « Classique » (toutes sections) : seuls
// l'en-tête (`basic` → tutelle MINEDUB au fondamental), les libellés de signature
// et le barème (`maxScale`) changent — voir BulletinClassic dans pages/Bulletins.

import {
  CELL, TH, HEAD, fix2, L,
  OfficialHeader, OfficialIdentity, OfficialSignatures, OfficialSheet, ContinuationHeader,
} from './bulletinOfficialParts';
import { paginateScGroups } from '../../lib/scBulletinDoc';

function TableHead({ sys, maxScale = 20 }) {
  return (
    <thead>
      <tr>
        <th style={{ ...TH, width: '30%' }}>{L(sys, "MATIÈRES ET NOM DE L'ENSEIGNANT", "SUBJECTS & TEACHER'S NAME", 'ASIGNATURAS Y DOCENTE')}</th>
        <th style={{ ...TH, width: '6%' }}>Coef</th>
        <th style={{ ...TH, width: '7%' }}>{L(sys, 'Charge h', 'Periods', 'Horas')}</th>
        <th style={{ ...TH, width: '8%' }}>{L(sys, `Moy/${maxScale}`, `Avg/${maxScale}`, `Prom/${maxScale}`)}</th>
        <th style={{ ...TH, width: '9%' }}>{L(sys, 'Moy×Coef', 'Avg×Coef', 'Prom×Coef')}</th>
        <th style={{ ...TH, width: '7%' }}>{L(sys, 'Rang', 'Rank', 'Puesto')}</th>
        <th style={{ ...TH, width: '10%' }}>[Min–Max]</th>
        <th style={{ ...TH, width: '13%' }}>{L(sys, 'Appréciation et Visa', 'Remarks & Signature', 'Apreciación y Visa')}</th>
      </tr>
    </thead>
  );
}

// Un groupe de matières (en-tête de groupe + lignes + sous-total).
function GroupBlock({ g, sys }) {
  return (
    <tbody className="apc-mat">
      <tr><td colSpan={8} style={{ ...CELL, background: '#dde7f3', fontWeight: 'bold' }}>{g.nom}</td></tr>
      {g.rows.map((r) => (
        <tr key={r.id}>
          <td style={CELL}>
            <strong>{r.nom}</strong><br />
            <span style={{ color: '#666' }}>{r.enseignant || L(sys, 'M/Mme', 'Mr/Mrs', 'Sr/Sra')}</span>
          </td>
          <td style={{ ...CELL, textAlign: 'center' }}>{r.coef}</td>
          <td style={{ ...CELL, textAlign: 'center' }}>{r.charge ?? ''}</td>
          <td style={{ ...CELL, textAlign: 'center' }}><strong>{fix2(r.moyenne)}</strong></td>
          <td style={{ ...CELL, textAlign: 'center' }}>{fix2(r.ponderee)}</td>
          <td style={{ ...CELL, textAlign: 'center' }}>{r.rang}</td>
          <td style={{ ...CELL, textAlign: 'center' }}>{r.minmax ? `${fix2(r.minmax.min)} – ${fix2(r.minmax.max)}` : ''}</td>
          <td style={CELL}>{r.appreciation}</td>
        </tr>
      ))}
      <tr style={{ background: '#f4f7fb' }}>
        <td style={{ ...CELL, textAlign: 'right', fontWeight: 'bold' }}>{L(sys, 'Total', 'Total', 'Total')} {g.nom}</td>
        <td style={{ ...CELL, textAlign: 'center', fontWeight: 'bold' }}>{fix2(g.coefSum)}</td>
        <td style={{ ...CELL, textAlign: 'center', fontWeight: 'bold' }}>{fix2(g.chargeSum)}</td>
        <td style={{ ...CELL, textAlign: 'center', fontWeight: 'bold' }}>{fix2(g.moyenne)}</td>
        <td style={{ ...CELL, textAlign: 'center', fontWeight: 'bold' }}>{fix2(g.mxSum)}</td>
        <td colSpan={3} style={CELL} />
      </tr>
    </tbody>
  );
}

// Synthèse : Travail | Discipline/conduite | Profil de la classe + décision.
function Synthesis({ data, discipline, decision, sys, maxScale = 20 }) {
  const d = discipline || {};
  const KV = ({ k, v, strong }) => (
    <tr><td style={CELL}>{k}</td><td style={{ ...CELL, textAlign: 'center' }}>{strong ? <strong>{v}</strong> : v}</td></tr>
  );
  const Mini = ({ title, children }) => (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <tbody><tr><td colSpan={2} style={HEAD}>{title}</td></tr>{children}</tbody>
    </table>
  );
  return (
    <>
      <table className="apc-keep" style={{ width: '100%', borderCollapse: 'collapse', marginTop: 6 }}>
        <tbody>
          <tr>
            <td style={{ width: '34%', verticalAlign: 'top', paddingRight: 4 }}>
              <Mini title={L(sys, "Travail de l'élève", "Student's work", 'Trabajo del alumno')}>
                <KV k={L(sys, 'Total général (M×coef)', 'Grand total (M×coef)', 'Total general (M×coef)')} v={fix2(data.mxSum)} />
                <KV k={L(sys, 'Total coefficients', 'Total coefficients', 'Total coeficientes')} v={fix2(data.coefSum)} />
                <KV k={L(sys, 'MOYENNE GÉNÉRALE', 'GENERAL AVERAGE', 'PROMEDIO GENERAL')} v={`${fix2(data.moyenneGenerale)}/${maxScale}`} strong />
                <KV k={L(sys, 'Rang', 'Rank', 'Puesto')} v={data.generalRank || ''} strong />
                <KV k={L(sys, 'Appréciation', 'Remarks', 'Apreciación')} v={data.appreciation} />
              </Mini>
            </td>
            <td style={{ width: '34%', verticalAlign: 'top', paddingRight: 4 }}>
              <Mini title={L(sys, 'Discipline et conduite', 'Discipline and conduct', 'Disciplina y conducta')}>
                <KV k={L(sys, 'Abs. non just. (h)', 'Unjust. abs. (h)', 'Faltas injust. (h)')} v={d.absNJ ?? ''} />
                <KV k={L(sys, 'Abs. just. (h)', 'Just. abs. (h)', 'Faltas just. (h)')} v={d.absJ ?? ''} />
                <KV k={L(sys, 'Conduite', 'Conduct', 'Conducta')} v={d.conduite || ''} />
                <KV k={L(sys, 'Exclusion (jours)', 'Exclusion (days)', 'Expulsión (días)')} v={d.exclusions || ''} />
              </Mini>
            </td>
            <td style={{ width: '32%', verticalAlign: 'top' }}>
              <Mini title={L(sys, 'Profil de la classe', 'Class profile', 'Perfil de la clase')}>
                <KV k={L(sys, 'Moyenne de la classe', 'Class average', 'Promedio de la clase')} v={fix2(data.classStats?.avg)} />
                <KV k="[Min – Max]" v={data.classStats ? `${fix2(data.classStats.min)} – ${fix2(data.classStats.max)}` : ''} />
                <KV k={L(sys, 'Nombre de moyennes', 'Number of averages', 'N.º de promedios')} v={data.classStats?.count ?? ''} />
                <KV k={L(sys, 'Taux de réussite', 'Pass rate', 'Tasa de aprobados')} v={data.classStats?.rate != null ? `${data.classStats.rate}%` : ''} />
              </Mini>
            </td>
          </tr>
        </tbody>
      </table>
      <table className="apc-keep" style={{ width: '100%', borderCollapse: 'collapse', marginTop: 4 }}>
        <tbody>
          <tr>
            <td style={{ ...CELL, verticalAlign: 'top' }}>
              {L(sys, 'Décision du conseil de classe', 'Class council decision', 'Decisión del consejo de clase')} : <strong>{decision || d.decision || ''}</strong>
              {d.mentions?.length > 0 && (
                <><br /><span style={{ color: '#444' }}>{L(sys, 'Mentions', 'Distinctions', 'Menciones')} : {d.mentions.join(' · ')}</span></>
              )}
            </td>
          </tr>
        </tbody>
      </table>
    </>
  );
}

// ── Bulletin Second Cycle officiel (1..N pages numérotées par élève) ──────────
// `basic` : tutelle Éducation de Base (MINEDUB) dans l'en-tête — utilisé par le
// bulletin Classique des sections maternelle/primaire. `headLabel`/`teacherLabel`/
// `ppLabel` renomment le chef d'établissement et l'enseignant en conséquence.
export default function BulletinScOfficial({
  school, sys = 'FR', title, student, classLabel, serieLabel, effectif,
  profPrincipal = '', data, discipline, decision,
  basic = false, accent, headLabel, teacherLabel, ppLabel, maxScale = 20, qrSrc,
}) {
  const { pages, footerOwnPage } = paginateScGroups(data.groups);
  const total = pages.length + (footerOwnPage ? 1 : 0);
  const idProps = { student, classLabel, serieLabel, effectif, profPrincipal, sys, ppLabel, qrSrc };
  const footer = (
    <>
      <Synthesis data={data} discipline={discipline} decision={decision} sys={sys} maxScale={maxScale} />
      <OfficialSignatures school={school} sys={sys} profPrincipal={profPrincipal} headLabel={headLabel} teacherLabel={teacherLabel} />
    </>
  );

  const sheets = pages.map((slice, i) => {
    const withFooter = i === pages.length - 1 && !footerOwnPage;
    return (
      <OfficialSheet key={`p${i}`} school={school} pageNo={i + 1} total={total}>
        {i === 0 ? (
          <>
            <OfficialHeader school={school} sys={sys} title={title} basic={basic} {...(accent ? { accent } : {})} />
            <OfficialIdentity {...idProps} />
          </>
        ) : (
          <ContinuationHeader title={title} student={student} classLabel={classLabel} serieLabel={serieLabel} sys={sys} />
        )}
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <TableHead sys={sys} maxScale={maxScale} />
          {slice.map((g) => <GroupBlock key={g.ordre} g={g} sys={sys} />)}
          {data.groups.length === 0 && (
            <tbody><tr><td colSpan={8} style={{ ...CELL, textAlign: 'center', color: '#9ca3af', padding: '10px' }}>{L(sys, 'Aucune matière notée pour cette période.', 'No subject graded for this period.', 'Ninguna asignatura calificada en este periodo.')}</td></tr></tbody>
          )}
        </table>
        {withFooter && footer}
      </OfficialSheet>
    );
  });

  if (footerOwnPage) {
    sheets.push(
      <OfficialSheet key="pf" school={school} pageNo={total} total={total}>
        <ContinuationHeader title={title} student={student} classLabel={classLabel} serieLabel={serieLabel} sys={sys} />
        {footer}
      </OfficialSheet>
    );
  }

  return <>{sheets}</>;
}
