// Bulletin PRIMAIRE « MATIÈRES À NOTE UNIQUE ».
//
// Une ligne par MATIÈRE : MATIÈRE | Note | Barème | N/20 | COTE | Min–Max | Appréc. / Visa. Ni compétences, ni codes, ni mot
// « Écrit », ni coefficients. Le pied (total obtenu, moyenne, cote, rang, distinctions, statistiques de la classe,
// répartition) est LE MÊME composant que le carnet du primaire (BulletinPrimSynthese), et l'en-tête, la feuille à
// densité mesurée (une page A4) et les signatures sont ceux des autres bulletins officiels.
//
// Aucun calcul ici : les lignes, les totaux, la moyenne, la cote et la plage Min–Max viennent de core/primNoteUnique,
// l'écran fournit les statistiques de la classe. Couleurs = accent du cycle PRIMAIRE choisi par l'école
// (Paramètres → Affichage du bulletin) ; les cotes gardent leurs couleurs fixes.

import {
  mkCellVar, mkTHVar, fix2, L,
  OfficialHeader, OfficialIdentityBand, OfficialSignatures, OfficialSheet,
} from './bulletinOfficialParts';
import PrimSyntheseEtStats, { COTE_COLORS } from './BulletinPrimSynthese';
import { headTeacherLabel, headTeacherCount } from '../../lib/headTeachers';
import { teintesDeLEcole } from '../../core/bulletinAccent';
import { primCoteLabel } from '../../core/referentielI18n';
import { plageCoteTexte } from '../../core/primNoteUnique';

const TIRET = <span style={{ color: '#9ca3af' }}>—</span>;

export default function BulletinPrimNoteUnique({
  school, cls, student, sys = 'FR', effectif, titulaire, title,
  lignes = [],                 // lignesNoteUnique(...) : { intitule, note, bareme, sur20, cote, libelle }
  totaux,                      // totauxNoteUnique(lignes) : { totalNotes, totalBareme, moyenne }
  coteGenerale, coteBareme = [],
  appreciationGenerale, decision, observations = '', rank, masquerRang = false,
  mentions, statsClasse, repartition = [], repartitionTotal,
  paysage = false,
}) {
  const C = teintesDeLEcole(school);
  const cell = mkCellVar();
  const th = { ...mkTHVar(), background: C.tint, color: C.texte, WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' };
  const num = { ...cell, textAlign: 'center', whiteSpace: 'nowrap' };
  const etiquette = { ...cell, background: C.tint, color: C.texte, fontWeight: 'bold', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' };
  const gap = 'var(--nc-gap)';

  const teacherLabel = L(sys, "L'Enseignant(e)", 'The Class Teacher', 'El Maestro / La Maestra');
  const headLabel = L(sys, 'Le Chef d’établissement', 'The Head Teacher', 'El Director / La Directora');
  const ppLabel = headTeacherLabel(headTeacherCount(titulaire), sys, { basic: true });
  const t = totaux || {};

  // Les cotes et leur intitulé viennent des bandes de l'ÉCOLE ; `primCoteLabel` les met dans la langue du bulletin.
  const libelle = (l) => (l.cote ? primCoteLabel(l.cote, l.libelle, sys) : '');

  return (
    <OfficialSheet school={school} pageNo={1} total={1} pt={10} sys={sys} vars>
      <OfficialHeader school={school} sys={sys} title={title} accent={C.accent} rounded basic vars grand={paysage} />
      <OfficialIdentityBand
        student={student} classLabel={cls?.name || ''} effectif={effectif} profPrincipal={titulaire} ppLabel={ppLabel}
        sys={sys} accent={C.accent} tint={C.tint} variant="noteUnique" vars grand={paysage}
      />

      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
        <colgroup>
          <col />
          <col style={{ width: '10%' }} />
          <col style={{ width: '10%' }} />
          <col style={{ width: '10%' }} />
          <col style={{ width: '9%' }} />
          <col style={{ width: '13%' }} />
          <col style={{ width: '21%' }} />
        </colgroup>
        <thead>
          <tr>
            <th style={{ ...th, textAlign: 'left' }}>{L(sys, 'MATIÈRE', 'SUBJECT', 'ASIGNATURA')}</th>
            <th style={th}>{L(sys, 'Note', 'Mark', 'Nota')}</th>
            <th style={th}>{L(sys, 'Barème', 'Out of', 'Escala')}</th>
            <th style={th}>N/20</th>
            <th style={th}>{L(sys, 'COTE', 'GRADE', 'NOTA')}</th>
            <th style={th}>Min–Max</th>
            <th style={th}>{L(sys, 'Appréc. / Visa', 'Remark / Visa', 'Apreciación / Visto')}</th>
          </tr>
        </thead>
        <tbody>
          {lignes.length === 0 && (
            <tr><td colSpan={7} style={{ ...cell, textAlign: 'center', color: '#9ca3af' }}>
              {L(sys, 'Aucune matière pour cette période.', 'No subject for this period.', 'Ninguna asignatura en este periodo.')}
            </td></tr>
          )}
          {lignes.map((l, i) => (
            <tr key={`${l.intitule}-${i}`}>
              {/* Les noms longs RETOURNENT À LA LIGNE : jamais de débordement horizontal. */}
              <td style={{ ...cell, overflowWrap: 'anywhere' }}>{l.intitule}</td>
              <td style={num}>{l.note == null ? TIRET : fix2(l.note)}</td>
              <td style={num}>{l.bareme == null ? TIRET : fix2(l.bareme)}</td>
              <td style={{ ...num, fontWeight: 'bold' }}>{l.sur20 == null ? TIRET : fix2(l.sur20)}</td>
              <td style={{ ...num, fontWeight: 'bold', color: COTE_COLORS[l.cote] || '#111' }}>{l.cote || TIRET}</td>
              <td style={num}>{l.cote ? plageCoteTexte(l.cote, coteBareme) : ''}</td>
              <td style={{ ...cell, textAlign: 'center', overflowWrap: 'anywhere' }}>{libelle(l)}</td>
            </tr>
          ))}
          <tr>
            <td style={{ ...etiquette, textAlign: 'center' }}>TOTAL</td>
            <td style={{ ...etiquette, textAlign: 'center' }}>{t.totalNotes == null ? '—' : fix2(t.totalNotes)}</td>
            <td style={{ ...etiquette, textAlign: 'center' }}>{t.totalBareme == null ? '—' : fix2(t.totalBareme)}</td>
            <td style={{ ...etiquette, textAlign: 'center' }} colSpan={4}>
              {L(sys, 'MOYENNE', 'AVERAGE', 'PROMEDIO')} : {t.moyenne == null ? '—' : fix2(t.moyenne)} / 20
            </td>
          </tr>
        </tbody>
      </table>

      <PrimSyntheseEtStats
        sys={sys} gap={gap} th={th} num={num} cell={cell}
        overall={{ achieved: t.totalNotes, possible: t.totalBareme }}
        moyenneGenerale={t.moyenne} coteGenerale={coteGenerale} masquerRang={masquerRang}
        rank={rank} effectif={effectif} appreciationGenerale={appreciationGenerale} decision={decision}
        mentions={mentions} statsClasse={statsClasse} observations={observations}
        repartition={repartition} repartitionTotal={repartitionTotal}
      />

      <OfficialSignatures
        school={school} sys={sys} profPrincipal={titulaire} vars headLabel={headLabel} teacherLabel={teacherLabel}
      />
    </OfficialSheet>
  );
}
