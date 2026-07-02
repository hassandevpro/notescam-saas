// Bulletin SECOND CYCLE MINESEC (lycée) — APERÇU ÉCRAN imprimable.
//
// Pendant React du builder HTML→PDF `scBulletinDoc.js` : matières regroupées en
// GROUPE 1 / GROUPE 2 (coef + charge), sous-totaux, moyenne générale + rang +
// décision du conseil. Imprimé via `window.print()` natif.
//
// Pagination EXPLICITE (mutualisée via `paginateScGroups`) : une `.bulletin-paper`
// = une page physique, numérotée « Page i / N » PAR ÉLÈVE. En-tête répété sur
// chaque page ; synthèse + signature sur la dernière.

import {
  CELL, TH, HEAD, fix2,
  OfficialHeader, OfficialIdentity, OfficialSignatures, OfficialSheet, ContinuationHeader,
} from './bulletinOfficialParts';
import { paginateScGroups } from '../../lib/scBulletinDoc';

function TableHead() {
  return (
    <thead>
      <tr>
        <th style={{ ...TH, width: '30%' }}>MATIÈRES ET NOM DE L'ENSEIGNANT</th>
        <th style={{ ...TH, width: '6%' }}>Coef</th>
        <th style={{ ...TH, width: '7%' }}>Charge h</th>
        <th style={{ ...TH, width: '8%' }}>Moy/20</th>
        <th style={{ ...TH, width: '9%' }}>Moy×Coef</th>
        <th style={{ ...TH, width: '7%' }}>Rang</th>
        <th style={{ ...TH, width: '10%' }}>[Min–Max]</th>
        <th style={{ ...TH, width: '13%' }}>Appréciation et Visa</th>
      </tr>
    </thead>
  );
}

// Un groupe de matières (en-tête de groupe + lignes + sous-total).
function GroupBlock({ g }) {
  return (
    <tbody className="apc-mat">
      <tr><td colSpan={8} style={{ ...CELL, background: '#dde7f3', fontWeight: 'bold' }}>{g.nom}</td></tr>
      {g.rows.map((r) => (
        <tr key={r.id}>
          <td style={CELL}>
            <strong>{r.nom}</strong><br />
            <span style={{ color: '#666' }}>{r.enseignant || 'M/Mme'}</span>
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
        <td style={{ ...CELL, textAlign: 'right', fontWeight: 'bold' }}>Total {g.nom}</td>
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
function Synthesis({ data, discipline, decision }) {
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
              <Mini title="Travail de l'élève">
                <KV k="Total général (M×coef)" v={fix2(data.mxSum)} />
                <KV k="Total coefficients" v={fix2(data.coefSum)} />
                <KV k="MOYENNE GÉNÉRALE" v={`${fix2(data.moyenneGenerale)}/20`} strong />
                <KV k="Rang" v={data.generalRank || ''} strong />
                <KV k="Appréciation" v={data.appreciation} />
              </Mini>
            </td>
            <td style={{ width: '34%', verticalAlign: 'top', paddingRight: 4 }}>
              <Mini title="Discipline et conduite">
                <KV k="Abs. non just. (h)" v={d.absNJ ?? ''} />
                <KV k="Abs. just. (h)" v={d.absJ ?? ''} />
                <KV k="Conduite" v={d.conduite || ''} />
                <KV k="Exclusion (jours)" v={d.exclusions || ''} />
              </Mini>
            </td>
            <td style={{ width: '32%', verticalAlign: 'top' }}>
              <Mini title="Profil de la classe">
                <KV k="Moyenne de la classe" v={fix2(data.classStats?.avg)} />
                <KV k="[Min – Max]" v={data.classStats ? `${fix2(data.classStats.min)} – ${fix2(data.classStats.max)}` : ''} />
                <KV k="Nombre de moyennes" v={data.classStats?.count ?? ''} />
                <KV k="Taux de réussite" v={data.classStats?.rate != null ? `${data.classStats.rate}%` : ''} />
              </Mini>
            </td>
          </tr>
        </tbody>
      </table>
      <table className="apc-keep" style={{ width: '100%', borderCollapse: 'collapse', marginTop: 4 }}>
        <tbody>
          <tr>
            <td style={{ ...CELL, verticalAlign: 'top' }}>
              Décision du conseil de classe : <strong>{decision || d.decision || ''}</strong>
              {d.mentions?.length > 0 && (
                <><br /><span style={{ color: '#444' }}>Mentions : {d.mentions.join(' · ')}</span></>
              )}
            </td>
          </tr>
        </tbody>
      </table>
    </>
  );
}

// ── Bulletin Second Cycle officiel (1..N pages numérotées par élève) ──────────
export default function BulletinScOfficial({
  school, sys = 'FR', title, student, classLabel, serieLabel, effectif,
  profPrincipal = '', data, discipline, decision,
}) {
  const { pages, footerOwnPage } = paginateScGroups(data.groups);
  const total = pages.length + (footerOwnPage ? 1 : 0);
  const idProps = { student, classLabel, serieLabel, effectif, profPrincipal };

  const sheets = pages.map((slice, i) => {
    const withFooter = i === pages.length - 1 && !footerOwnPage;
    return (
      <OfficialSheet key={`p${i}`} school={school} pageNo={i + 1} total={total}>
        {i === 0 ? (
          <>
            <OfficialHeader school={school} sys={sys} title={title} />
            <OfficialIdentity {...idProps} />
          </>
        ) : (
          <ContinuationHeader title={title} student={student} classLabel={classLabel} serieLabel={serieLabel} />
        )}
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <TableHead />
          {slice.map((g) => <GroupBlock key={g.ordre} g={g} />)}
          {data.groups.length === 0 && (
            <tbody><tr><td colSpan={8} style={{ ...CELL, textAlign: 'center', color: '#9ca3af', padding: '10px' }}>Aucune matière notée pour cette période.</td></tr></tbody>
          )}
        </table>
        {withFooter && <Synthesis data={data} discipline={discipline} decision={decision} />}
        {withFooter && <OfficialSignatures school={school} sys={sys} profPrincipal={profPrincipal} />}
      </OfficialSheet>
    );
  });

  if (footerOwnPage) {
    sheets.push(
      <OfficialSheet key="pf" school={school} pageNo={total} total={total}>
        <ContinuationHeader title={title} student={student} classLabel={classLabel} serieLabel={serieLabel} />
        <Synthesis data={data} discipline={discipline} decision={decision} />
        <OfficialSignatures school={school} sys={sys} profPrincipal={profPrincipal} />
      </OfficialSheet>
    );
  }

  return <>{sheets}</>;
}
