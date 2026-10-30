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
  mkCellVar, mkTHVar, fix2, L,
  OfficialHeader, OfficialIdentityBand, OfficialSignatures, OfficialSheet,
} from './bulletinOfficialParts';
import { headTeacherLabel, headTeacherCount } from '../../lib/headTeachers';
// Les six regroupements officiels du carnet MINEDUB. MÊME fonction que le
// gabarit compact : un seul calcul pour un même carnet, deux dispositions.
import { groupesDe, reperesDeGroupe } from '../../core/primCompactRows';
// L'échelle vient du moteur : un « /10 » écrit en dur dans le libellé se serait
// mis à mentir dès que l'échelle change.
import { PRIM_GRADE_MAX } from '../../core/primEngine';

const PRIM_COTE_COLORS = { 'A+': '#059669', A: '#10b981', ECA: '#f59e0b', NA: '#ef4444' };
const PRIM_ACCENT = '#047857';
const PRIM_TH_BG  = '#d1fae5';
const PRIM_TH_TXT = '#065f46';
const TRIM_LABELS = { fr: ['Premier', 'Deuxième', 'Troisième'], en: ['First', 'Second', 'Third'], es: ['Primer', 'Segundo', 'Tercer'] };

// Barème à ANNONCER pour une ligne de critère : celui que l'enseignant a
// réellement utilisé, s'il est le même sur toutes les UA notées de la période.
// Sinon le barème officiel — aucun nombre unique ne décrirait honnêtement une
// ligne interrogée /5 puis /20, et le détail par UA reste lisible juste à côté.
//
// AU NIVEAU DU MODULE, et pas dans un composant : le seul appelant est
// `CompetenceUATable` ci-dessous. Défini dans `BulletinPrimAnnualUA`, il était
// hors de portée à l'appel et faisait lever « baremeAffiche is not defined » à
// CHAQUE rendu d'un bulletin primaire détaillé par UA — donc un écran blanc, React
// démontant tout l'arbre sur une exception de rendu. La fonction est pure (elle ne
// dépend que de ses deux arguments) : la hisser ici suffit, et la met hors de
// portée d'une nouvelle erreur de placement.
const baremeAffiche = (row, cr) => {
  const vus = new Set();
  for (const u of row.uas) {
    const b = u.baremes?.[cr.id];
    if (b != null) vus.add(Number(b));
  }
  return vus.size === 1 ? [...vus][0] : cr.points_max;
};

// ── Un mini-tableau (une compétence) ────────────────────────────────────────────
// `row.uas` peut être un sous-ensemble (bulletin trimestriel : UA1-3, UA4-6 ou
// UA7-8) ou les 8 UA (vue annuelle) — la largeur du tableau et le regroupement
// par trimestre s'adaptent au nombre d'UA réellement présentes (2 colonnes,
// Notes+Cote, par UA).
function CompetenceUATable({ sys, row }) {
  const cell = mkCellVar(1.1);
  const th   = { ...mkTHVar(1.1), background: PRIM_TH_BG, color: PRIM_TH_TXT, WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' };
  const trimLabels = TRIM_LABELS[sys === 'EN' ? 'en' : sys === 'ES' ? 'es' : 'fr'];
  const labelCol = { width: '16%', textAlign: 'left' };
  const colCount = 1 + row.uas.length * 2;
  // Regroupe les UA présentes par trimestre (1/2/3), dans l'ordre, en ne
  // gardant que les trimestres réellement couverts par `row.uas`.
  const trimGroups = [1, 2, 3]
    .map((tn) => ({ tn, uas: row.uas.filter((u) => u.trimestre === tn) }))
    .filter((g) => g.uas.length > 0);

  return (
    <table className="apc-keep" style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 'var(--nc-gap)' }}>
      <thead>
        <tr>
          <td colSpan={colCount} style={{ ...th, textAlign: 'left', fontSize: 'var(--nc-body)' }}>
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
              <th style={{ ...th, fontSize: 'var(--nc-small)' }}>{L(sys, 'Notes', 'Marks', 'Notas')}</th>
              <th style={{ ...th, fontSize: 'var(--nc-small)' }}>{L(sys, 'Cote', 'Grade', 'Nota')}</th>
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
  // ── CE QUE LE CARNET DE L'ÉCOLE PORTE EN PLUS ────────────────────────────
  // Mêmes blocs que la disposition compacte, mêmes props, même défaut : une
  // école qui n'a pas coché « carnet » reçoit exactement le bulletin d'avant.
  //
  // POURQUOI ICI AUSSI. `prim_bulletin_mode = 'carnet'` n'allumait les blocs
  // que sur la disposition COMPACTE. Or « Auto » ne la choisit que pour une
  // période d'UNE unité d'apprentissage : dès qu'on imprimait un trimestre
  // (UA1-3), la disposition détaillée reprenait la main et le carnet perdait
  // ses regroupements, son travail académique et sa répartition — sans qu'aucun
  // message ne l'explique. Le réglage de l'école doit valoir pour les DEUX
  // dispositions, sinon il ne vaut rien.
  mentions,                     // { avertissement, tableauHonneur, encouragement, felicitation }
  repartition = [],             // [{ label: '[10-11.99]', n: 3 }]
  groupes: avecGroupes = false, // les six regroupements officiels
}) {
  // MÊME CONTRAT DE DENSITÉ QUE LA DISPOSITION COMPACTE (lib/print/fitDensity.js).
  // Il n'était posé que sur le gabarit compact — or « Auto » ne le choisit que
  // pour une période d'UNE unité d'apprentissage. Dès qu'une école imprimait un
  // trimestre ou l'année, c'est CE gabarit qui rendait, sans aucune variable
  // `--nc-*` : l'ajustement ne trouvait plus de feuille à mesurer, ne réduisait
  // rien, et le carnet débordait sur une deuxième page. Mesuré dans
  // l'application elle-même (édition LAN) : Trimestre 1 et Annuel sortaient sur
  // 3 pages, la console disant « aucune feuille .bulletin-paper.nc-densite ».
  const cell = mkCellVar();
  const th   = { ...mkTHVar(), background: PRIM_TH_BG, color: PRIM_TH_TXT, WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' };

  const teacherLabel = sys === 'EN' ? 'The Class Teacher' : sys === 'ES' ? 'El Maestro / La Maestra' : "L'Enseignant(e)";
  const headLabel    = sys === 'EN' ? 'The Head Teacher'  : sys === 'ES' ? 'El Director / La Directora' : 'Le Directeur / La Directrice';
  // Accord au nombre : deux enseignants principaux -> « Enseignant(e)s ».
  const ppLabel      = headTeacherLabel(headTeacherCount(profPrincipal), sys, { basic: true });

  // Cote par critère (dérivée du barème de CE critère, pas de la compétence
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

  // ── LES SIX REGROUPEMENTS ────────────────────────────────────────────────
  // Le total d'un groupe se lit sur les MÊMES nombres que la disposition
  // compacte : `totalAchieved` / `totalPossible` par compétence, calculés une
  // seule fois dans `primAnnualRowsFor`. Rien n'est additionné ici.
  const groupes = avecGroupes
    ? groupesDe(competenceRows.map((r) => ({
      code: r.code, domaine: r.domaine ?? null,
      achieved: r.totalAchieved ?? null,
      // Une compétence non évaluée n'apporte pas son barème au total — même
      // règle que `buildCompactRows` : « — /40 » laisserait croire qu'elle a
      // été interrogée et ratée.
      possible: r.totalAchieved == null ? null : (r.totalPossible ?? null),
    })), sys)
    : [];
  // Le bandeau se pose avant la PREMIÈRE compétence de la famille, le total
  // après la DERNIÈRE. Les deux repères viennent du moteur, et non d'une
  // comparaison avec la ligne voisine : celle-ci dédoublait bandeau et total
  // dès qu'une compétence maison coupait la famille en deux.
  const { debut: debutsDeGroupe, fin: finsDeGroupe } = reperesDeGroupe(competenceRows, groupes);
  const debutDeGroupe = (i) => debutsDeGroupe.get(i) || null;
  const finDeGroupe = (i) => finsDeGroupe.get(i) || null;

  return (
    <OfficialSheet school={school} pt={10} pageNo={1} total={1} sys={sys} vars>
      <OfficialHeader school={school} sys={sys} title={title} accent={PRIM_ACCENT} basic vars />
      <OfficialIdentityBand student={student} classLabel={classLabel} effectif={effectif} profPrincipal={profPrincipal} ppLabel={ppLabel} sys={sys} accent={PRIM_ACCENT} tint={PRIM_TH_BG} vars />

      {rowsWithCriteresCote.map((row, i) => (
        <Fragment key={row.code}>
          {/* Bandeau « n) INTITULÉ OFFICIEL » — ouvre la famille. */}
          {debutDeGroupe(i) && (
            <div style={{
              ...th, textAlign: 'left', padding: 'var(--nc-pad-v) 4px',
              marginBottom: 'calc(var(--nc-gap) * 0.3)', fontSize: 'var(--nc-small)',
            }}>
              {debutDeGroupe(i).numero != null ? `${debutDeGroupe(i).numero}) ` : ''}
              {debutDeGroupe(i).intitule.toUpperCase()}
            </div>
          )}
          <CompetenceUATable sys={sys} row={row} />
          {/* Total et moyenne de la famille — ferme le groupe, comme au carnet. */}
          {finDeGroupe(i) && (
            <div style={{
              ...cell, background: '#f3f4f6', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact',
              display: 'flex', justifyContent: 'space-between', padding: 'var(--nc-pad-v) 4px',
              marginBottom: 'var(--nc-gap)', fontSize: 'var(--nc-small)',
            }}>
              <span style={{ fontStyle: 'italic' }}>
                {finDeGroupe(i).numero != null ? `${finDeGroupe(i).numero}) ` : ''}{finDeGroupe(i).intitule}
              </span>
              <span style={{ fontWeight: 'bold' }}>
                {finDeGroupe(i).achieved == null
                  ? '—'
                  : `${L(sys, 'Total', 'Total', 'Total')}: ${fix2(finDeGroupe(i).achieved)}`}
                {'   '}
                {finDeGroupe(i).moyenne == null
                  ? ''
                  : `${L(sys, 'Moy', 'Avg', 'Prom')}: ${fix2(finDeGroupe(i).moyenne)}`}
              </span>
            </div>
          )}
        </Fragment>
      ))}

      {/* Synthèse — identique à la vue trimestrielle */}
      <table className="apc-keep" style={{ width: '100%', borderCollapse: 'collapse', marginTop: 'var(--nc-gap)' }}>
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

      {/* ── TRAVAIL ACADÉMIQUE ──────────────────────────────────────────────
          Les QUATRE distinctions du carnet. Elles sont DÉJÀ saisies par l'école
          au conseil de classe : on les affiche, on ne les déduit pas de la
          moyenne. L'écran de saisie, lui, en PROPOSE une valeur tirée du travail
          de l'élève (`core/conseilPropositions.js`) ; le conseil l'applique d'un
          clic, et c'est cette saisie-là qui arrive ici.
          « Félicitations » manquait des deux dispositions du carnet. Ce tableau
          est autonome — pas de grille à huit colonnes à respecter — donc la
          quatrième paire s'ajoute sans rien déplacer. */}
      {mentions && (
        <table className="apc-keep" style={{ width: '100%', borderCollapse: 'collapse', marginTop: 'calc(var(--nc-gap) * 0.5)' }}>
          <tbody>
            <tr>
              <td style={th}>{L(sys, 'Travail académique', 'Academic record', 'Trabajo académico')}</td>
              <td style={th}>{L(sys, 'Avertissement', 'Warning', 'Advertencia')}</td>
              <td style={{ ...cell, textAlign: 'center' }}>{mentions.avertissement || '—'}</td>
              <td style={th}>{L(sys, 'Tableau d’honneur', 'Honour roll', 'Cuadro de honor')}</td>
              <td style={{ ...cell, textAlign: 'center' }}>{mentions.tableauHonneur || '—'}</td>
              <td style={th}>{L(sys, 'Encouragement', 'Commendation', 'Estímulo')}</td>
              <td style={{ ...cell, textAlign: 'center' }}>{mentions.encouragement || '—'}</td>
              <td style={th}>{L(sys, 'Félicitations', 'Congratulations', 'Felicitación')}</td>
              <td style={{ ...cell, textAlign: 'center' }}>{mentions.felicitation || '—'}</td>
            </tr>
          </tbody>
        </table>
      )}

      <table className="apc-keep" style={{ width: '100%', borderCollapse: 'collapse', marginTop: 'calc(var(--nc-gap) * 0.5)' }}>
        <tbody>
          <tr><td style={{ ...cell, height: 'var(--nc-observ)' }}>{L(sys, 'Appréciation générale du Conseil des maîtres', "Teachers' council general remarks", 'Apreciación general del consejo de maestros')} : {appreciation}</td></tr>
        </tbody>
      </table>

      {/* ── AUTRES STATISTIQUES ─────────────────────────────────────────────
          Combien d'élèves par tranche de moyenne : un parent y lit où se situe
          son enfant sans connaître les notes des autres. */}
      {repartition.length > 0 && (
        <table className="apc-keep" style={{ width: '100%', borderCollapse: 'collapse', marginTop: 'calc(var(--nc-gap) * 0.5)' }}>
          <tbody>
            <tr>
              <td style={{ ...th, textAlign: 'left' }} colSpan={repartition.length + 1}>
                {L(sys, 'Autres statistiques', 'Other statistics', 'Otras estadísticas')}
              </td>
            </tr>
            <tr>
              <td style={th}>{L(sys, 'Intervalle de moyenne', 'Average range', 'Intervalo')}</td>
              {repartition.map((r) => <td key={r.label} style={th}>{r.label}</td>)}
            </tr>
            <tr>
              <td style={th}>{L(sys, 'Nombre d’élèves', 'Number of pupils', 'N.º de alumnos')}</td>
              {repartition.map((r) => <td key={r.label} style={{ ...cell, textAlign: 'center' }}>{r.n}</td>)}
            </tr>
          </tbody>
        </table>
      )}

      <OfficialSignatures school={school} sys={sys} profPrincipal={profPrincipal} headLabel={headLabel} teacherLabel={teacherLabel} vars />
    </OfficialSheet>
  );
}
