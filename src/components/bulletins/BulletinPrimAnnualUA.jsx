// Bulletin PRIMAIRE APC officiel (MINEDUB) — détail par Unité d'Apprentissage
// (UA), fidèle au carnet officiel : un mini-tableau par compétence, une colonne
// Notes+Cote par UA, une ligne TOTAL (points obtenus/possibles) et une ligne
// COTE. Utilisé pour TOUS les bulletins primaire (trimestriel ET annuel) :
// `competenceRows[].uas` ne porte que les UA de la période choisie (UA1-3 pour
// le Trimestre 1, les 8 en vue Annuel — cf. Bulletins.jsx `primUAs`) ; les
// en-têtes de colonnes (trimestre, largeur du tableau) s'adaptent en
// conséquence. En-tête / identité / signatures mutualisés via
// bulletinOfficialParts (mêmes styles).
//
// Rendu piloté par PROPS déjà calculées (Bulletins.jsx, primAnnualRowsFor) :
//   competenceRows = [{ code, intitule, criteres, uas, totalAchieved, totalPossible, totalCote }]
//     criteres = [{ id, nom, points_max }]
//     uas      = [{ ua, trimestre, notesByCritere, achieved, possible, cote }]  (sous-ensemble borné à la période)

import { Fragment } from 'react';
import {
  mkCell, mkTH, fix2, L,
  OfficialHeader, OfficialIdentityBand, OfficialSignatures, OfficialSheet,
} from './bulletinOfficialParts';
import { headTeacherLabel, headTeacherCount } from '../../lib/headTeachers';
// L'échelle vient du moteur : un « /10 » écrit en dur dans le libellé se serait
// mis à mentir dès que l'échelle change.
import { PRIM_GRADE_MAX } from '../../core/primEngine';

const PRIM_COTE_COLORS = { 'A+': '#059669', A: '#10b981', ECA: '#f59e0b', NA: '#ef4444' };
const PRIM_ACCENT = '#047857';
const PRIM_TH_BG  = '#d1fae5';
const PRIM_TH_TXT = '#065f46';
const TRIM_LABELS = { fr: ['Premier', 'Deuxième', 'Troisième'], en: ['First', 'Second', 'Third'], es: ['Primer', 'Segundo', 'Tercer'] };

// ── Un mini-tableau (une compétence) ────────────────────────────────────────────
// `row.uas` peut être un sous-ensemble (bulletin trimestriel : UA1-3, UA4-6 ou
// UA7-8) ou les 8 UA (vue annuelle) — la largeur du tableau et le regroupement
// par trimestre s'adaptent au nombre d'UA réellement présentes (2 colonnes,
// Notes+Cote, par UA).
function CompetenceUATable({ sys, row }) {
  const cell = mkCell(7, 1.1, 1);
  const th   = { ...mkTH(7, 1.1, 1), background: PRIM_TH_BG, color: PRIM_TH_TXT, WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' };
  const trimLabels = TRIM_LABELS[sys === 'EN' ? 'en' : sys === 'ES' ? 'es' : 'fr'];
  const labelCol = { width: '16%', textAlign: 'left' };
  const colCount = 1 + row.uas.length * 2;
  // Regroupe les UA présentes par trimestre (1/2/3), dans l'ordre, en ne
  // gardant que les trimestres réellement couverts par `row.uas`.
  const trimGroups = [1, 2, 3]
    .map((tn) => ({ tn, uas: row.uas.filter((u) => u.trimestre === tn) }))
    .filter((g) => g.uas.length > 0);

  return (
    <table className="apc-keep" style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 8 }}>
      <thead>
        <tr>
          <td colSpan={colCount} style={{ ...th, textAlign: 'left', fontSize: 8 }}>
            {L(sys, 'COMPÉTENCE', 'COMPETENCY', 'COMPETENCIA')} {row.code} : {row.intitule.toUpperCase()}
            {row.totalPossible ? ` (${row.totalPossible} ${L(sys, 'points', 'points', 'puntos')})` : ''}
          </td>
        </tr>
        <tr>
          <th style={{ ...th, ...labelCol }}>{L(sys, 'Trimestre', 'Term', 'Trimestre')}</th>
          {trimGroups.map((g) => (
            <th key={g.tn} colSpan={g.uas.length * 2} style={th}>{trimLabels[g.tn - 1]}</th>
          ))}
        </tr>
        <tr>
          <th style={{ ...th, ...labelCol }}>{L(sys, 'Unité d’apprentissage', 'Learning unit', 'Unidad de aprendizaje')}</th>
          {row.uas.map((u) => <th key={u.ua} colSpan={2} style={th}>UA{u.ua}</th>)}
        </tr>
        <tr>
          <th style={{ ...th, ...labelCol }}>{L(sys, 'Évaluation', 'Assessment', 'Evaluación')}</th>
          {row.uas.map((u) => (
            <Fragment key={u.ua}>
              <th style={{ ...th, fontSize: 6.5 }}>{L(sys, 'Notes', 'Marks', 'Notas')}</th>
              <th style={{ ...th, fontSize: 6.5 }}>{L(sys, 'Cote', 'Grade', 'Nota')}</th>
            </Fragment>
          ))}
        </tr>
      </thead>
      <tbody>
        {row.criteres.map((cr) => (
          <tr key={cr.id}>
            {/* Le barème annoncé est celui RÉELLEMENT utilisé sur la période. Il
                n'est affiché que s'il est le même partout : si l'enseignant a
                interrogé /5 puis /20, aucun nombre unique ne décrit la ligne, et
                on retombe sur le barème officiel du référentiel. */}
            <td style={{ ...cell, ...labelCol }}>{cr.nom} {baremeAffiche(row, cr)} {L(sys, 'pts', 'pts', 'pts')}</td>
            {row.uas.map((u) => {
              const note = u.notesByCritere?.[cr.id];
              const cote = note != null ? row.criteresCote?.[u.ua]?.[cr.id] : null;
              return (
                <Fragment key={u.ua}>
                  <td style={{ ...cell, textAlign: 'center' }}>{note != null ? fix2(note) : ''}</td>
                  <td style={{ ...cell, textAlign: 'center' }}>{cote || ''}</td>
                </Fragment>
              );
            })}
          </tr>
        ))}
        <tr>
          <td style={{ ...cell, ...labelCol, fontWeight: 'bold' }}>{L(sys, 'TOTAL', 'TOTAL', 'TOTAL')}</td>
          {row.uas.map((u) => (
            <Fragment key={u.ua}>
              <td style={{ ...cell, textAlign: 'center', fontWeight: 'bold' }}>
                {u.achieved != null ? `${fix2(u.achieved)}` : ''}
              </td>
              <td style={{ ...cell, textAlign: 'center', fontWeight: 'bold' }}>
                <span style={{ color: u.cote ? PRIM_COTE_COLORS[u.cote] : undefined }}>{u.cote || ''}</span>
              </td>
            </Fragment>
          ))}
        </tr>
        <tr>
          <td colSpan={colCount} style={{ ...cell, background: '#f8fafc' }}>
            <strong>{L(sys, 'Cote de la période', 'Period grade', 'Nota del período')} :</strong>{' '}
            <span style={{ color: row.totalCote ? PRIM_COTE_COLORS[row.totalCote] : undefined, fontWeight: 'bold' }}>
              {row.totalAchieved != null ? `${fix2(row.totalAchieved)}/${row.totalPossible} — ${row.totalCote || ''}` : '—'}
            </span>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

export default function BulletinPrimAnnualUA({
  school, sys = 'FR', title, student, classLabel, effectif, profPrincipal = '',
  competenceRows = [], moyenneGenerale = null, coteGenerale = null, rang, classStats, appreciation = '',
}) {
  const cell = mkCell(10);
  const th   = { ...mkTH(11), background: PRIM_TH_BG, color: PRIM_TH_TXT, WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' };

  const teacherLabel = sys === 'EN' ? 'The Class Teacher' : sys === 'ES' ? 'El Maestro / La Maestra' : "L'Enseignant(e)";
  const headLabel    = sys === 'EN' ? 'The Head Teacher'  : sys === 'ES' ? 'El Director / La Directora' : 'Le Directeur / La Directrice';
  // Accord au nombre : deux enseignants principaux -> « Enseignant(e)s ».
  const ppLabel      = headTeacherLabel(headTeacherCount(profPrincipal), sys, { basic: true });

  // Cote par critère (dérivée du barème de CE critère, pas de la compétence
  // Barème à ANNONCER pour une ligne de critère : celui que l'enseignant a
  // réellement utilisé, s'il est le même sur toutes les UA notées de la période.
  // Sinon le barème officiel — aucun nombre unique ne décrirait honnêtement une
  // ligne interrogée /5 puis /20, et le détail par UA reste lisible juste à côté.
  const baremeAffiche = (row, cr) => {
    const vus = new Set();
    for (const u of row.uas) {
      const b = u.baremes?.[cr.id];
      if (b != null) vus.add(Number(b));
    }
    return vus.size === 1 ? [...vus][0] : cr.points_max;
  };

  // entière) — calculée ici pour ne pas alourdir le calcul côté Bulletins.jsx.
  const rowsWithCriteresCote = competenceRows.map((row) => {
    const criteresCote = {};
    for (const u of row.uas) {
      criteresCote[u.ua] = {};
      for (const cr of row.criteres) {
        const note = u.notesByCritere?.[cr.id];
        if (note == null) continue;
        // Seuils identiques au barème officiel, appliqués au barème RÉELLEMENT
        // utilisé pour cette évaluation : un 4 sur une interrogation notée /5 est
        // un A+, pas un NA parce que le référentiel dit /20. Repli sur le barème
        // du référentiel pour toute note antérieure, qui en vient par définition.
        const bareme = Number(u.baremes?.[cr.id] ?? cr.points_max) || cr.points_max;
        const pct = (Number(note) / bareme) * 100;
        criteresCote[u.ua][cr.id] = pct >= 90 ? 'A+' : pct >= 75 ? 'A' : pct >= 55 ? 'ECA' : 'NA';
      }
    }
    return { ...row, criteresCote };
  });

  return (
    <OfficialSheet school={school} pt={10} pageNo={1} total={1} sys={sys}>
      <OfficialHeader school={school} sys={sys} title={title} accent={PRIM_ACCENT} basic />
      <OfficialIdentityBand student={student} classLabel={classLabel} effectif={effectif} profPrincipal={profPrincipal} ppLabel={ppLabel} sys={sys} accent={PRIM_ACCENT} tint={PRIM_TH_BG} />

      {rowsWithCriteresCote.map((row) => <CompetenceUATable key={row.code} sys={sys} row={row} />)}

      {/* Synthèse — identique à la vue trimestrielle */}
      <table className="apc-keep" style={{ width: '100%', borderCollapse: 'collapse', marginTop: 5 }}>
        <tbody>
          <tr>
            <td style={{ width: '50%', verticalAlign: 'top', paddingRight: 4 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  <tr><td colSpan={2} style={th}>{L(sys, "Bilan de l'élève", "Student's summary", 'Balance del alumno')}</td></tr>
                  <tr><td style={cell}>{L(sys, `Moyenne générale /${PRIM_GRADE_MAX}`, `General average /${PRIM_GRADE_MAX}`, `Promedio general /${PRIM_GRADE_MAX}`)}</td><td style={{ ...cell, textAlign: 'center' }}><strong>{fix2(moyenneGenerale)}</strong></td></tr>
                  <tr><td style={cell}>{L(sys, 'Cote générale', 'General grade', 'Nota general')}</td><td style={{ ...cell, textAlign: 'center' }}>
                    <strong style={{ color: moyenneGenerale != null ? PRIM_COTE_COLORS[coteGenerale] : undefined }}>{moyenneGenerale != null ? coteGenerale : ''}</strong>
                  </td></tr>
                  <tr><td style={cell}>{L(sys, 'Rang', 'Rank', 'Puesto')}</td><td style={{ ...cell, textAlign: 'center' }}><strong>{rang ? `${rang} / ${effectif ?? ''}` : ''}</strong></td></tr>
                </tbody>
              </table>
            </td>
            <td style={{ width: '50%', verticalAlign: 'top' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  <tr><td colSpan={2} style={th}>{L(sys, 'Profil de la classe', 'Class profile', 'Perfil de la clase')}</td></tr>
                  <tr><td style={cell}>{L(sys, 'Moyenne générale', 'General average', 'Promedio general')}</td><td style={{ ...cell, textAlign: 'center' }}>{fix2(classStats?.avg)}</td></tr>
                  <tr><td style={cell}>[Min – Max]</td><td style={{ ...cell, textAlign: 'center' }}>{classStats ? `${fix2(classStats.min)} – ${fix2(classStats.max)}` : ''}</td></tr>
                  <tr><td style={cell}>{L(sys, 'Taux de réussite', 'Pass rate', 'Tasa de aprobados')}</td><td style={{ ...cell, textAlign: 'center' }}>{classStats?.rate != null ? `${classStats.rate}%` : ''}</td></tr>
                </tbody>
              </table>
            </td>
          </tr>
        </tbody>
      </table>

      <table className="apc-keep" style={{ width: '100%', borderCollapse: 'collapse', marginTop: 3 }}>
        <tbody>
          <tr><td style={{ ...cell, height: 30 }}>{L(sys, 'Appréciation générale du Conseil des maîtres', "Teachers' council general remarks", 'Apreciación general del consejo de maestros')} : {appreciation}</td></tr>
        </tbody>
      </table>

      <OfficialSignatures school={school} sys={sys} profPrincipal={profPrincipal} headLabel={headLabel} teacherLabel={teacherLabel} />
    </OfficialSheet>
  );
}
