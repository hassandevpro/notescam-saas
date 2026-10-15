// Bulletin PRIMAIRE APC — disposition COMPACTE du carnet de référence.
//
// Fidèle au « REPORT OF MARKS » de Bright Continent : UNE ligne par compétence,
// les critères d'évaluation en COLONNES (Oral / Écrit / Pratique / Savoir-être),
// chaque cellule portant `note /barème`, puis le total et la cote.
//
// ── POURQUOI UN SECOND GABARIT, À CÔTÉ DE BulletinPrimAnnualUA ─────────────
// `BulletinPrimAnnualUA` met les UA en COLONNES et les critères en LIGNES (un
// mini-tableau par compétence). C'est la bonne lecture pour un trimestre ou une
// année — on y suit la progression d'une UA à l'autre. Mais pour UNE unité
// d'apprentissage, cette disposition occupe une page entière pour onze valeurs,
// alors que le carnet officiel tient la même information sur onze lignes.
// Les deux coexistent donc, et l'écran choisit selon la période.
//
// ── CE QUE CE GABARIT NE CALCULE PAS ──────────────────────────────────────
// Rien. Toutes les valeurs arrivent en PROPS, déjà calculées par Bulletins.jsx
// à partir du moteur (`pointsForPeriod`, `pointsOverall`, `generalAverage`).
// Un gabarit qui recalculerait ses totaux finirait par contredire l'aperçu,
// le rapport de classe et le PDF — c'est la règle de tous les bulletins ici.
//
// RAPPEL SUR LES DEUX LIGNES DE SYNTHÈSE, qui ne se déduisent pas l'une de
// l'autre (décision du 2026-10-12) :
//   « Total obtenu »  = Σ points / Σ barèmes des évaluations faites
//   « Moyenne »       = `generalAverage`, moyenne des compétences pondérée par
//                       coefficient — la règle du bulletin APC primaire, CONSERVÉE
// Sur les mêmes notes, le carnet de référence affiche 14,82 là où
// `generalAverage` donne 15,08. Les deux sont justes ; ce ne sont pas le même
// calcul. Ne pas « aligner » l'une sur l'autre ici.

import {
  mkCell, mkTH, fix2, L, B,
  OfficialHeader, OfficialIdentityBand, OfficialSignatures, OfficialSheet,
} from './bulletinOfficialParts';
import { headTeacherLabel, headTeacherCount } from '../../lib/headTeachers';
import { PRIM_GRADE_MAX } from '../../core/primEngine';
import { primCoteLabel } from '../../core/referentielI18n';

const COTE_COLORS = { 'A+': '#059669', A: '#10b981', ECA: '#f59e0b', IP: '#f59e0b', NA: '#ef4444' };
const ACCENT  = '#047857';   // vert foncé du bandeau — identité du carnet
const TH_BG   = '#d1fae5';
const TH_TXT  = '#065f46';

// Une cellule de critère : « 6.3 /10 ». Le barème est affiché À CÔTÉ de la note,
// comme sur le carnet, parce qu'il VARIE d'une compétence à l'autre (l'Écrit vaut
// 20 en 1A et 30 en 2A) et d'une évaluation à l'autre. Une note nue serait
// illisible — 17 ne dit rien sans savoir sur combien.
function CritereCell({ val, pt }) {
  const cell = { ...mkCell(pt), textAlign: 'center', whiteSpace: 'nowrap' };
  // Distinction CAPITALE : une absence de note (`null`) s'écrit « — », jamais 0.
  // Un zéro réellement attribué s'écrit « 0 », et compte dans les totaux.
  if (!val || val.note == null) return <td style={{ ...cell, color: '#9ca3af' }}>—</td>;
  return (
    <td style={cell}>
      {fix2(val.note)}
      <span style={{ color: '#6b7280', fontSize: '0.86em' }}> /{fix2(val.max)}</span>
    </td>
  );
}

export default function BulletinPrimCompact({
  school, cls, student, sys = 'FR', effectif, qrSrc,
  periodLabel,                 // « UA 1 », « Trimestre 1 », « Annuel »
  critereColumns = [],         // [{ id, nom }] — colonnes, dans l'ordre du référentiel
  rows = [],                   // [{ code, intitule, parCritere, achieved, possible, cote, appreciation }]
  overall,                     // { achieved, possible, pct, evaluees, nonEvaluees }
  niveauTotal,                 // barème théorique du niveau (300) — pour la mention provisoire
  nonEvalueesCodes = [],       // ['1C','3B','4A']
  moyenneGenerale, coteGenerale, appreciationGenerale,
  rank, decision,
  additionalSubjects = [],     // matières hors référentiel (tableau secondaire)
  coteBareme = [],             // bandes de cotes, pour la légende
  titulaire,
  pt = 9,
  pageNo, total,
}) {
  const classLabel = cls?.name || '';
  const titre = L(sys, `BULLETIN DE NOTES — ${classLabel}`,
    `REPORT OF MARKS – ${classLabel}`, `BOLETÍN DE NOTAS — ${classLabel}`);
  const sousTitre = [periodLabel, school?.current_year].filter(Boolean).join(' · ');

  const th = { ...mkTH(pt), background: TH_BG, color: TH_TXT };
  const cell = mkCell(pt);
  const num = { ...cell, textAlign: 'center', whiteSpace: 'nowrap' };

  // Mention « provisoire » : elle n'apparaît QUE s'il reste des compétences non
  // évaluées, et elle dit les trois choses dont l'école a besoin — lesquelles,
  // le dénominateur réellement utilisé, et sur quoi la moyenne est calculée.
  // Sans elle, un total sur 240 se lit comme un total sur 300 et l'élève paraît
  // avoir échoué sur un programme qu'on ne lui a pas encore enseigné.
  const provisoire = nonEvalueesCodes.length > 0;

  return (
    <OfficialSheet school={school} pageNo={pageNo} total={total} pt={pt} sys={sys}>
      <OfficialHeader school={school} sys={sys} title={titre} accent={ACCENT} rounded basic />

      <div style={{
        background: ACCENT, color: '#fff', textAlign: 'center', fontWeight: 'bold',
        padding: '3px 6px', fontSize: `${pt + 0.5}pt`, letterSpacing: '0.02em',
        WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact',
      }}>
        {sousTitre}
      </div>

      <OfficialIdentityBand
        student={student} classLabel={classLabel} effectif={effectif}
        profPrincipal={titulaire} sys={sys} accent={ACCENT} tint={TH_BG}
        ppLabel={headTeacherLabel(headTeacherCount(titulaire), sys, { basic: true })}
      />

      {/* ── Tableau principal : une ligne par compétence ─────────────────── */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 4, tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: '6%' }} />
          <col />
          {critereColumns.map((c) => <col key={c.id} style={{ width: '8%' }} />)}
          <col style={{ width: '10%' }} />
          <col style={{ width: '7%' }} />
        </colgroup>
        <thead>
          <tr>
            <th style={th} rowSpan={2}>{L(sys, 'Comp.', 'Comp.', 'Comp.')}</th>
            <th style={th} rowSpan={2}>{L(sys, 'Compétence évaluée', 'Competence assessed', 'Competencia evaluada')}</th>
            <th style={th} colSpan={critereColumns.length}>
              {L(sys, 'Critères d’évaluation — note / barème',
                 'Assessment criteria — mark / scale',
                 'Criterios de evaluación — nota / escala')}
            </th>
            <th style={th} rowSpan={2}>{L(sys, 'Total', 'Total', 'Total')}</th>
            <th style={th} rowSpan={2}>{L(sys, 'Cote', 'Grade', 'Nota')}</th>
          </tr>
          <tr>
            {critereColumns.map((c) => <th key={c.id} style={th}>{c.nom}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.code} style={{ breakInside: 'avoid' }}>
              <td style={{ ...num, fontWeight: 'bold' }}>{r.code}</td>
              <td style={cell}>{r.intitule}</td>
              {critereColumns.map((c) => (
                <CritereCell key={c.id} val={r.parCritere?.[c.id]} pt={pt} />
              ))}
              <td style={{ ...num, fontWeight: 'bold' }}>
                {r.achieved == null
                  ? <span style={{ color: '#9ca3af' }}>—</span>
                  : <>{fix2(r.achieved)}<span style={{ color: '#6b7280', fontSize: '0.86em' }}> /{fix2(r.possible)}</span></>}
              </td>
              <td style={{ ...num, fontWeight: 'bold', color: COTE_COLORS[r.cote] || '#111' }}>
                {r.cote || <span style={{ color: '#9ca3af' }}>—</span>}
              </td>
            </tr>
          ))}
          <tr style={{ background: TH_BG, WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
            <td style={{ ...th, textAlign: 'left' }} colSpan={2 + critereColumns.length}>
              {L(sys, 'TOTAL GÉNÉRAL', 'OVERALL TOTAL', 'TOTAL GENERAL')}
            </td>
            <td style={{ ...th }}>
              {overall?.achieved == null ? '—' : `${fix2(overall.achieved)} /${fix2(overall.possible)}`}
            </td>
            <td style={{ ...th, color: COTE_COLORS[coteGenerale] || TH_TXT }}>{coteGenerale || '—'}</td>
          </tr>
        </tbody>
      </table>

      {/* ── Matières hors référentiel ─────────────────────────────────────
          Le carnet de référence porte un second tableau « Additional subjects »
          (Social Values, Music, National Language…) : des matières que l'école
          évalue sans qu'elles correspondent à une compétence du référentiel
          national. Elles n'entrent PAS dans le total général — sinon le /240
          cesserait d'être comparable au barème du niveau. */}
      {additionalSubjects.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 6, tableLayout: 'fixed' }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: 'left' }} colSpan={2 + critereColumns.length + 2}>
                {L(sys, `Matières complémentaires — évaluation ${classLabel}`,
                   `Additional subjects – ${classLabel} evaluation`,
                   `Asignaturas complementarias — ${classLabel}`)}
              </th>
            </tr>
            <tr>
              <th style={th} colSpan={2}>{L(sys, 'Matière', 'Subject', 'Asignatura')}</th>
              {critereColumns.map((c) => <th key={c.id} style={th}>{c.nom}</th>)}
              <th style={th}>{L(sys, 'Total', 'Total', 'Total')}</th>
              <th style={th}>{L(sys, 'Cote', 'Grade', 'Nota')}</th>
            </tr>
          </thead>
          <tbody>
            {additionalSubjects.map((s) => (
              <tr key={s.id || s.name} style={{ breakInside: 'avoid' }}>
                <td style={cell} colSpan={2}>{s.name}</td>
                {critereColumns.map((c) => <CritereCell key={c.id} val={s.parCritere?.[c.id]} pt={pt} />)}
                <td style={{ ...num, fontWeight: 'bold' }}>
                  {s.achieved == null
                    ? <span style={{ color: '#9ca3af' }}>—</span>
                    : <>{fix2(s.achieved)}<span style={{ color: '#6b7280', fontSize: '0.86em' }}> /{fix2(s.possible)}</span></>}
                </td>
                <td style={{ ...num, fontWeight: 'bold', color: COTE_COLORS[s.cote] || '#111' }}>
                  {s.cote || <span style={{ color: '#9ca3af' }}>—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* ── Légende des cotes ────────────────────────────────────────────── */}
      {coteBareme.length > 0 && (
        <div style={{ marginTop: 4, fontSize: `${pt - 0.8}pt`, color: '#374151' }}>
          <strong>{L(sys, 'Échelle', 'Grading scale', 'Escala')} :</strong>{' '}
          {/* Le libellé passe par `primCoteLabel` : `PRIM_COTE_DEFAULT` porte des
              libellés FRANÇAIS, et la légende d'un bulletin anglophone affichait
              donc « Très bien acquis », « En cours d'acquisition ». Le carnet de
              référence dit « Very well achieved », « In progress ». Constaté sur
              le rendu réel le 2026-10-12. Le fallback reste le libellé de
              l'école : un barème reconfiguré garde SES mots. */}
          {coteBareme.map((b, i) => (
            <span key={b.cote}>
              {i > 0 && ' · '}
              <strong style={{ color: COTE_COLORS[b.cote] || '#111' }}>{b.cote}</strong>{' '}
              {primCoteLabel(b.cote, b.libelle, sys)} (≥ {b.seuil_min} %)
            </span>
          ))}
        </div>
      )}

      {/* ── Mention « bulletin provisoire » ──────────────────────────────── */}
      {provisoire && (
        <div style={{
          marginTop: 4, padding: '3px 6px', border: `1px solid ${ACCENT}`,
          background: '#ecfdf5', fontSize: `${pt - 0.8}pt`, color: '#065f46',
          WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact',
        }}>
          <strong>{L(sys, 'Bulletin provisoire', 'Provisional report', 'Boletín provisional')} :</strong>{' '}
          {L(sys,
            `compétences non encore évaluées (${nonEvalueesCodes.join(', ')}). Le total porte sur ${fix2(overall?.possible)} points et non sur ${fix2(niveauTotal)} ; la moyenne ne tient compte que des compétences évaluées.`,
            `competences not yet assessed (${nonEvalueesCodes.join(', ')}). The total is out of ${fix2(overall?.possible)}, not ${fix2(niveauTotal)}; the average is calculated on the assessed competences only.`,
            `competencias aún no evaluadas (${nonEvalueesCodes.join(', ')}). El total es sobre ${fix2(overall?.possible)}, no sobre ${fix2(niveauTotal)}.`)}
        </div>
      )}

      {/* ── Synthèse ─────────────────────────────────────────────────────── */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 5 }}>
        <tbody>
          <tr>
            <td style={{ ...th, width: '20%' }}>{L(sys, 'Total obtenu', 'Total obtained', 'Total obtenido')}</td>
            <td style={num}>
              {overall?.achieved == null ? '—' : `${fix2(overall.achieved)} / ${fix2(overall.possible)}`}
            </td>
            <td style={{ ...th, width: '14%' }}>{L(sys, 'Moyenne', 'Average', 'Promedio')}</td>
            <td style={num}>
              {moyenneGenerale == null ? '—' : `${fix2(moyenneGenerale)} / ${PRIM_GRADE_MAX}`}
            </td>
            <td style={{ ...th, width: '10%' }}>{L(sys, 'Cote', 'Grade', 'Nota')}</td>
            <td style={{ ...num, fontWeight: 'bold', color: COTE_COLORS[coteGenerale] || '#111' }}>
              {coteGenerale || '—'}
            </td>
            <td style={{ ...th, width: '10%' }}>{L(sys, 'Rang', 'Rank', 'Puesto')}</td>
            <td style={num}>{rank ? `${rank} / ${effectif}` : '—'}</td>
          </tr>
          {(appreciationGenerale || decision) && (
            <tr>
              <td style={th}>{L(sys, 'Appréciation', 'Appreciation', 'Apreciación')}</td>
              <td style={cell} colSpan={3}>{appreciationGenerale || ''}</td>
              <td style={th} colSpan={2}>{L(sys, 'Décision', 'Decision', 'Decisión')}</td>
              <td style={cell} colSpan={2}>{decision || ''}</td>
            </tr>
          )}
          <tr>
            <td style={th}>{L(sys, 'Observations du titulaire', 'Class teacher’s remarks', 'Observaciones')}</td>
            <td style={{ ...cell, height: 26, borderTop: B }} colSpan={7} />
          </tr>
        </tbody>
      </table>

      <OfficialSignatures
        school={school} sys={sys} profPrincipal={titulaire}
        headLabel={L(sys, 'Le Directeur / La Directrice', 'The Head Teacher', 'El Director / La Directora')}
        teacherLabel={L(sys, "L'Enseignant(e)", 'The Class Teacher', 'El Maestro / La Maestra')}
      />
    </OfficialSheet>
  );
}
