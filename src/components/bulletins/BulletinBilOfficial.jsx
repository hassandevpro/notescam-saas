// Bulletin PROGRAMME D'ÉDUCATION BILINGUE SPÉCIAL (premier cycle) — APERÇU ÉCRAN.
//
// Pendant React du builder HTML→PDF `bilBulletinDoc.js` : matières regroupées par
// DOMAINE D'APPRENTISSAGE de l'arrêté 239-23, détail des séquences, points
// pondérés, puis la synthèse où les trois grandeurs sont distinctes — total des
// points, total des coefficients, moyenne générale (qui est leur quotient exact).
//
// L'aperçu et le PDF consomment LE MÊME objet `data` (assembleBilBulletin) : ils
// ne peuvent pas afficher deux résultats différents.

import {
  CELL, TH, L,
  OfficialHeader, OfficialIdentity, OfficialSignatures, OfficialSheet,
} from './bulletinOfficialParts';
import { bilProvisoireTexte } from '../../core/bilEngine';

const fix2 = (v) => (v == null ? '' : (Math.round(v * 100) / 100).toString());
const ACCENT = '#1e3a5f';

// Bandeau « quel programme, quel sous-système, quel texte officiel ».
function ProgrammeBand({ data, sys, classLabel }) {
  const sousSysteme = data.serieId === 'bil_en'
    ? L(sys, 'Sous-système anglophone', 'English sub-system')
    : L(sys, 'Sous-système francophone', 'French sub-system');
  return (
    <div style={{
      border: `1px solid ${ACCENT}`, borderLeft: `4px solid ${ACCENT}`,
      padding: '3px 8px', marginBottom: 5, fontSize: '9px',
      display: 'flex', justifyContent: 'space-between', gap: 8,
    }}>
      <span>
        <strong>{L(sys, "Programme d'Éducation Bilingue Spécial", 'Special Bilingual Education Programme')}</strong>
        {' · '}{sousSysteme}{classLabel ? ` · ${classLabel}` : ''}
      </span>
      <span style={{ color: '#555', whiteSpace: 'nowrap' }}>
        {L(sys, 'Arrêté n°239-23/MINESEC du 14 juin 2023', 'Order No. 239-23/MINESEC of 14 June 2023')}
      </span>
    </div>
  );
}

// Un bulletin incomplet le DIT, et dit POURQUOI. Le libellé vient du moteur
// (`bilProvisoireTexte`) : l'écran et le papier ne peuvent pas diverger.
function ProvisionalBanner({ data, sys }) {
  const txt = bilProvisoireTexte(data, sys);
  if (!txt) return null;
  return (
    <div style={{
      border: '1.5px solid #b45309', background: '#fef3c7', color: '#92400e',
      padding: '4px 8px', marginBottom: 5, fontSize: '9.5px', fontWeight: 'bold',
      textAlign: 'center', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact',
    }}>
      {txt}
    </div>
  );
}

function TableHead({ sys, seqs, maxScale }) {
  return (
    <thead>
      <tr>
        <th style={{ ...TH, width: '28%' }}>{L(sys, 'MATIÈRE / ENSEIGNANT', 'SUBJECT / TEACHER')}</th>
        <th style={{ ...TH, width: '5%' }}>Coef</th>
        {seqs.map((n) => (
          <th key={n} style={{ ...TH, width: '8%' }}>{L(sys, `Séq. ${n}`, `Seq. ${n}`)}</th>
        ))}
        <th style={{ ...TH, width: '9%' }}>{L(sys, `Moy/${maxScale}`, `Avg/${maxScale}`)}</th>
        <th style={{ ...TH, width: '9%' }}>{L(sys, 'Moy×Coef', 'Avg×Coef')}</th>
        <th style={{ ...TH, width: '6%' }}>{L(sys, 'Rang', 'Rank')}</th>
        <th style={{ ...TH, width: '16%' }}>{L(sys, 'Appréciation', 'Remark')}</th>
      </tr>
    </thead>
  );
}

function DomainBlock({ d, sys, nbSeq }) {
  const span = 6 + nbSeq;
  const tint = { WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' };
  return (
    <tbody className="apc-mat">
      <tr>
        <td colSpan={span} style={{ ...CELL, background: '#dde7f3', fontWeight: 'bold', ...tint }}>{d.nom}</td>
      </tr>
      {d.rows.map((r) => (
        <tr key={r.id}>
          <td style={CELL}>
            <strong>{r.nom}</strong>
            {r.enseignant ? <><br /><span style={{ color: '#666' }}>{r.enseignant}</span></> : null}
            {r.obligatoire === false
              ? <><br /><span style={{ color: '#666', fontSize: '8px' }}>{L(sys, 'au choix', 'optional')}</span></>
              : null}
          </td>
          <td style={{ ...CELL, textAlign: 'center' }}>{r.coef}</td>
          {(r.notes || []).map((n, i) => (
            <td key={i} style={{ ...CELL, textAlign: 'center' }}>{n == null ? '—' : fix2(n)}</td>
          ))}
          <td style={{ ...CELL, textAlign: 'center' }}>
            {r.evaluee
              ? <strong>{fix2(r.moyenne)}</strong>
              : <span style={{ color: '#9a3412' }}>{L(sys, 'non évaluée', 'not assessed')}</span>}
            {/* Couverture partielle : dire laquelle, et sur combien de séquences. */}
            {r.partielle ? (
              <><br /><span style={{ color: '#9a3412', fontSize: '7.5px', fontWeight: 'normal' }}>
                {L(sys, `sur ${r.nbSeqNotees}/${r.nbSeqAttendues} séq.`, `on ${r.nbSeqNotees}/${r.nbSeqAttendues} seq.`)}
              </span></>
            ) : null}
          </td>
          <td style={{ ...CELL, textAlign: 'center' }}>{r.evaluee ? fix2(r.ponderee) : '—'}</td>
          <td style={{ ...CELL, textAlign: 'center' }}>{r.rang}</td>
          <td style={CELL}>{r.appreciation}</td>
        </tr>
      ))}
      <tr style={{ background: '#f4f7fb', ...tint }}>
        <td style={{ ...CELL, textAlign: 'right', fontWeight: 'bold' }}>
          {L(sys, 'Sous-total', 'Subtotal')} — {d.nom}
        </td>
        <td style={{ ...CELL, textAlign: 'center', fontWeight: 'bold' }}>{fix2(d.coefSum)}</td>
        <td colSpan={nbSeq} style={CELL} />
        <td style={{ ...CELL, textAlign: 'center', fontWeight: 'bold' }}>{fix2(d.moyenne)}</td>
        <td style={{ ...CELL, textAlign: 'center', fontWeight: 'bold' }}>{fix2(d.pointsSum)}</td>
        <td colSpan={2} style={CELL} />
      </tr>
    </tbody>
  );
}

function KV({ k, v, strong }) {
  return (
    <tr>
      <td style={CELL}>{k}</td>
      <td style={{ ...CELL, textAlign: 'center' }}>{strong ? <strong>{v}</strong> : v}</td>
    </tr>
  );
}

function Synthesis({ data, sys, maxScale, decision, discipline }) {
  const d = discipline || {};
  const tint = { WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' };
  const Box = ({ title, children, width }) => (
    <td style={{ width, verticalAlign: 'top', paddingRight: 4 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          <tr><td colSpan={2} style={{ ...CELL, background: '#eef2f7', textAlign: 'center', fontWeight: 'bold', ...tint }}>{title}</td></tr>
          {children}
        </tbody>
      </table>
    </td>
  );
  return (
    <>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 6 }}>
        <tbody><tr>
          <Box width="38%" title={L(sys, 'Résultats', 'Results')}>
            {/* Les trois grandeurs sont distinctes, et la moyenne est leur quotient. */}
            <KV k={L(sys, 'Total des points pondérés Σ(Moy×Coef)', 'Total weighted points Σ(Avg×Coef)')} v={fix2(data.totalPoints)} />
            <KV k={L(sys, 'Total des coefficients retenus', 'Total coefficients counted')} v={fix2(data.totalCoef)} />
            <KV k={L(sys, 'MOYENNE GÉNÉRALE', 'OVERALL AVERAGE')} v={`${fix2(data.moyenneGenerale)}/${maxScale}`} strong />
            <KV k={L(sys, 'Rang', 'Rank')} v={data.generalRank || ''} strong />
            <KV k={L(sys, 'Appréciation', 'Remark')} v={data.appreciation} />
          </Box>
          <Box width="30%" title={L(sys, 'Discipline et conduite', 'Discipline and conduct')}>
            <KV k={L(sys, 'Abs. non justifiées (h)', 'Unjustified absences (h)')} v={d.absNJ ?? ''} />
            <KV k={L(sys, 'Abs. justifiées (h)', 'Justified absences (h)')} v={d.absJ ?? ''} />
            <KV k={L(sys, 'Conduite', 'Conduct')} v={d.conduite || ''} />
            <KV k={L(sys, 'Exclusion (jours)', 'Suspension (days)')} v={d.exclusions || ''} />
          </Box>
          <Box width="32%" title={L(sys, 'Profil de la classe', 'Class profile')}>
            <KV k={L(sys, 'Moyenne de la classe', 'Class average')} v={fix2(data.classStats?.avg)} />
            <KV k="[Min – Max]" v={data.classStats ? `${fix2(data.classStats.min)} – ${fix2(data.classStats.max)}` : ''} />
            <KV k={L(sys, 'Matières évaluées', 'Subjects assessed')} v={`${data.nbEvaluees} / ${data.nbApplicables}`} />
            <KV k={L(sys, 'Σ coef applicables', 'Σ applicable coef')} v={fix2(data.totalCoefApplicable)} />
          </Box>
        </tr></tbody>
      </table>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 4 }}>
        <tbody><tr>
          <td style={{ ...CELL, width: '56%' }}>
            {L(sys, 'Observations du conseil de classe', 'Class council remarks')} : <strong>{decision || d.decision || ''}</strong>
            {d.mentions?.length ? <><br /><span style={{ color: '#444' }}>{L(sys, 'Mentions', 'Mentions')} : {d.mentions.join(' · ')}</span></> : null}
          </td>
          <td style={{ ...CELL, width: '22%', textAlign: 'center' }}>{L(sys, 'Visa du parent / tuteur', 'Parent / guardian')}</td>
          <td style={{ ...CELL, width: '22%', textAlign: 'center' }}>{L(sys, 'Visa du titulaire', 'Class teacher')}</td>
        </tr></tbody>
      </table>
    </>
  );
}

// ── Bulletin ANNUEL — aperçu écran ───────────────────────────────────────────
// Pendant React de `buildBilAnnualSheet`. Consomme le MÊME objet
// `assembleBilAnnual` que le PDF : les deux ne peuvent pas diverger.
function AnnualHead({ sys }) {
  return (
    <thead>
      <tr>
        <th style={{ ...TH, width: '30%' }}>{L(sys, 'MATIÈRE', 'SUBJECT')}</th>
        <th style={{ ...TH, width: '6%' }}>Coef</th>
        <th style={{ ...TH, width: '9%' }}>{L(sys, 'Trim. 1', 'Term 1')}</th>
        <th style={{ ...TH, width: '9%' }}>{L(sys, 'Trim. 2', 'Term 2')}</th>
        <th style={{ ...TH, width: '9%' }}>{L(sys, 'Trim. 3', 'Term 3')}</th>
        <th style={{ ...TH, width: '11%' }}>{L(sys, 'Moy. annuelle', 'Annual avg')}</th>
        <th style={{ ...TH, width: '10%' }}>{L(sys, 'Moy×Coef', 'Avg×Coef')}</th>
        <th style={{ ...TH, width: '16%' }}>{L(sys, 'Appréciation', 'Remark')}</th>
      </tr>
    </thead>
  );
}

function AnnualDomain({ d, sys }) {
  const tint = { WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' };
  return (
    <tbody className="apc-mat">
      <tr><td colSpan={8} style={{ ...CELL, background: '#dde7f3', fontWeight: 'bold', ...tint }}>{d.nom}</td></tr>
      {d.rows.map((r) => (
        <tr key={r.id}>
          <td style={CELL}><strong>{r.nom}</strong></td>
          <td style={{ ...CELL, textAlign: 'center' }}>{r.coef}</td>
          {(r.trimestres || []).map((t, i) => (
            <td key={i} style={{ ...CELL, textAlign: 'center' }}>{t == null ? '—' : fix2(t)}</td>
          ))}
          <td style={{ ...CELL, textAlign: 'center' }}>
            {r.evaluee ? <strong>{fix2(r.moyenne)}</strong> : '—'}
            {r.evaluee && r.nbTrimestresEvalues < 3 ? (
              <><br /><span style={{ color: '#9a3412', fontSize: '7.5px' }}>
                {L(sys, `sur ${r.nbTrimestresEvalues}/3 trim.`, `on ${r.nbTrimestresEvalues}/3 terms`)}
              </span></>
            ) : null}
          </td>
          <td style={{ ...CELL, textAlign: 'center' }}>{r.evaluee ? fix2(r.ponderee) : '—'}</td>
          <td style={CELL}>{r.appreciation}</td>
        </tr>
      ))}
      <tr style={{ background: '#f4f7fb', ...tint }}>
        <td style={{ ...CELL, textAlign: 'right', fontWeight: 'bold' }}>{L(sys, 'Sous-total', 'Subtotal')} — {d.nom}</td>
        <td style={{ ...CELL, textAlign: 'center', fontWeight: 'bold' }}>{fix2(d.coefSum)}</td>
        <td colSpan={3} style={CELL} />
        <td style={{ ...CELL, textAlign: 'center', fontWeight: 'bold' }}>{fix2(d.moyenne)}</td>
        <td style={{ ...CELL, textAlign: 'center', fontWeight: 'bold' }}>{fix2(d.pointsSum)}</td>
        <td style={CELL} />
      </tr>
    </tbody>
  );
}

export function BulletinBilAnnual({
  school, sys = 'FR', title, student, classLabel, effectif, titulaire,
  data, maxScale = 20, decision, discipline,
}) {
  if (!data) return null;
  const toutes = data.domaines.flatMap((d) => d.rows);
  const synth = {
    ...data,
    nbApplicables: toutes.length,
    nbEvaluees: toutes.filter((r) => r.evaluee).length,
    totalCoefApplicable: toutes.reduce((a, r) => a + r.coef, 0),
  };
  // La méthode d'agrégation annuelle n'est fixée par aucun texte officiel : elle
  // est donc ÉCRITE, comme sur le PDF, pour que personne n'ait à la deviner.
  const methode = data.mode === 'term_mean'
    ? L(sys, 'moyenne des trois moyennes générales trimestrielles', 'mean of the three overall term averages')
    : L(sys, 'moyenne annuelle de chaque matière, puis pondération par les coefficients',
           'annual average per subject, then weighted by coefficients');

  return (
    <OfficialSheet school={school} pageNo={1} total={1} sys={sys}>
      <OfficialHeader school={school} sys={sys} title={title} />
      <ProgrammeBand data={data} sys={sys} classLabel={classLabel} />
      <OfficialIdentity
        student={student} classLabel={classLabel} serieLabel="" effectif={effectif}
        profPrincipal={titulaire} sys={sys} ppLabel={L(sys, 'Titulaire', 'Class teacher')}
      />
      <ProvisionalBanner data={synth} sys={sys} />
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <AnnualHead sys={sys} />
        {data.domaines.map((d) => <AnnualDomain key={`${d.ordre}-${d.nom}`} d={d} sys={sys} />)}
      </table>
      <table style={{ width: '38%', borderCollapse: 'collapse', marginTop: 6 }}>
        <tbody>
          <tr><td colSpan={2} style={{ ...CELL, background: '#eef2f7', textAlign: 'center', fontWeight: 'bold', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
            {L(sys, 'Moyennes trimestrielles', 'Term averages')}
          </td></tr>
          {(data.moyennesTrimestres || []).map((m, i) => (
            <KV key={i} k={L(sys, `Trimestre ${i + 1}`, `Term ${i + 1}`)} v={fix2(m)} />
          ))}
        </tbody>
      </table>
      <Synthesis data={synth} sys={sys} maxScale={maxScale} decision={decision} discipline={discipline} />
      <div style={{ marginTop: 4, fontSize: '8px', color: '#555' }}>
        {L(sys, 'Méthode de calcul de la moyenne annuelle', 'Annual average method')} : {methode}.
      </div>
      <OfficialSignatures school={school} sys={sys} profPrincipal={titulaire} teacherLabel={L(sys, 'Le/La titulaire', 'Class teacher')} />
    </OfficialSheet>
  );
}

export default function BulletinBilOfficial({
  school, sys = 'FR', title, student, classLabel, effectif, titulaire,
  data, seqs = [], maxScale = 20, decision, discipline,
}) {
  if (!data) return null;
  return (
    <OfficialSheet school={school} pageNo={1} total={1} sys={sys}>
      <OfficialHeader school={school} sys={sys} title={title} />
      <ProgrammeBand data={data} sys={sys} classLabel={classLabel} />
      <OfficialIdentity
        student={student} classLabel={classLabel} serieLabel="" effectif={effectif}
        profPrincipal={titulaire} sys={sys}
        ppLabel={L(sys, 'Titulaire', 'Class teacher')}
      />
      <ProvisionalBanner data={data} sys={sys} />
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <TableHead sys={sys} seqs={seqs} maxScale={maxScale} />
        {data.domaines.map((d) => (
          <DomainBlock key={`${d.ordre}-${d.nom}`} d={d} sys={sys} nbSeq={seqs.length} />
        ))}
      </table>
      <Synthesis data={data} sys={sys} maxScale={maxScale} decision={decision} discipline={discipline} />
      <OfficialSignatures school={school} sys={sys} profPrincipal={titulaire} teacherLabel={L(sys, 'Le/La titulaire', 'Class teacher')} />
    </OfficialSheet>
  );
}
