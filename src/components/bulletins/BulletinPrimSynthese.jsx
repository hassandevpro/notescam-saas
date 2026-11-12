// SYNTHÈSE ET STATISTIQUES DU BULLETIN PRIMAIRE — bloc PARTAGÉ.
//
// Total obtenu · Moyenne · Cote · Rang, appréciation et décision, les quatre distinctions, les statistiques de
// performance, les observations, puis le tableau « Autres statistiques ». Extrait TEL QUEL de BulletinPrimCompact
// pour que le format « matières à note unique » (BulletinPrimNoteUnique) imprime exactement le même pied :
// une correction faite ici vaut pour les deux, au lieu de deux copies qui divergent.

import { fix2, L, B } from './bulletinOfficialParts';
import { PRIM_GRADE_MAX } from '../../core/primEngine';

export const COTE_COLORS = { 'A+': '#059669', A: '#10b981', ECA: '#f59e0b', IP: '#f59e0b', NA: '#ef4444' };

// LE RANG S ÉCRIT « 1er », PAS « 1 ». Le carnet papier et le modèle de l’école le portent ainsi, et « 1 / 41 » se
// lit comme une note sur 41 avant de se lire comme un rang.
export function rangOrdinal(rang, sys) {
  const n = Number(rang);
  if (!Number.isFinite(n)) return rang;
  if (sys === 'EN') {
    const d = n % 100;
    const suf = d >= 11 && d <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th');
    return `${n}${suf}`;
  }
  if (sys === 'ES') return `${n}.º`;
  return `${n}${n === 1 ? 'er' : 'e'}`;
}

export default function PrimSyntheseEtStats({
  sys, gap, th, num, cell, overall, moyenneGenerale, coteGenerale, masquerRang, rank, effectif,
  appreciationGenerale, decision, mentions, statsClasse, observations, repartition = [], repartitionTotal,
}) {
  return (
    <>
        {/* ── Synthèse ─────────────────────────────────────────────────────── */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: gap }}>
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
              {/* Rang masqué : la cote prend la largeur libérée, et la ligne GARDE ses
                  huit colonnes — celles sur lesquelles les lignes suivantes comptent
                  leurs `colSpan`. Une ligne à six colonnes désalignerait le bandeau. */}
              <td colSpan={masquerRang ? 3 : 1}
                style={{ ...num, fontWeight: 'bold', color: COTE_COLORS[coteGenerale] || '#111' }}>
                {coteGenerale || '—'}
              </td>
              {!masquerRang && (
              <td style={{ ...th, width: '10%' }}>{L(sys, 'Rang', 'Rank', 'Puesto')}</td>
              )}
              {/* Le rang absent s'écrit « — / effectif » et non « — » : l'effectif
                  est connu même quand le rang ne l'est pas, et le parent qui lit
                  « — » seul ne sait pas si la classe compte 8 élèves ou 60. */}
              {!masquerRang && (
              <td style={num}>{rank ? `${rangOrdinal(rank, sys)} / ${effectif}` : `— / ${effectif ?? ''}`}</td>
              )}
            </tr>
            {(appreciationGenerale || decision) && (
              <tr>
                <td style={th}>{L(sys, 'Appréciation', 'Appreciation', 'Apreciación')}</td>
                <td style={cell} colSpan={3}>{appreciationGenerale || ''}</td>
                <td style={th} colSpan={2}>{L(sys, 'Décision', 'Decision', 'Decisión')}</td>
                <td style={cell} colSpan={2}>{decision || ''}</td>
              </tr>
            )}
            {/* ── TRAVAIL ACADÉMIQUE ────────────────────────────────────────
                LES QUATRE DISTINCTIONS DU CARNET, SUR UNE LIGNE.
                « Félicitations » manquait — alors que les photos du carnet de
                l'école la portent, et que l'école la SAISIT déjà au conseil de
                classe (`__felicitation__`, lu par `getAbsCond` depuis toujours).
                Elle s'imprimait donc nulle part : un élève félicité par son
                conseil recevait un carnet muet là-dessus.
                La ligne de synthèse compte HUIT colonnes, et les trois paires
                d'alors en occupaient déjà huit avec l'en-tête « Travail
                académique ». L'en-tête part : c'est un nom de rubrique, pas une
                donnée, le carnet papier ne le porte pas, et les quatre paires
                (libellé + valeur) tiennent alors exactement. */}
            {mentions && (
              <tr>
                <td style={th}>{L(sys, 'Avertissement', 'Warning', 'Advertencia')}</td>
                <td style={num}>{mentions.avertissement || '—'}</td>
                <td style={th}>{L(sys, 'Tableau d’honneur', 'Honour roll', 'Cuadro de honor')}</td>
                <td style={num}>{mentions.tableauHonneur || '—'}</td>
                <td style={th}>{L(sys, 'Encouragement', 'Commendation', 'Estímulo')}</td>
                <td style={num}>{mentions.encouragement || '—'}</td>
                <td style={th}>{L(sys, 'Félicitations', 'Congratulations', 'Felicitación')}</td>
                <td style={num}>{mentions.felicitation || '—'}</td>
              </tr>
            )}

            {/* ── STATS DE PERFORMANCE ──────────────────────────────────────
                Situer l'élève dans sa classe : la meilleure moyenne, la plus
                faible, et celle de la classe. */}
            {statsClasse && (
              <tr>
                <td style={th}>{L(sys, 'Stats de performance', 'Performance stats', 'Estadísticas')}</td>
                <td style={th}>{L(sys, 'Moy. premier', 'Top average', 'Prom. primero')}</td>
                <td style={num}>{statsClasse.premier == null ? '—' : fix2(statsClasse.premier)}</td>
                <td style={th} colSpan={statsClasse.reussite == null && statsClasse.reussis == null && !statsClasse.vide ? 2 : 1}>
                  {L(sys, 'Moy. dernier', 'Lowest average', 'Prom. último')}
                </td>
                <td style={num}>{statsClasse.dernier == null ? '—' : fix2(statsClasse.dernier)}</td>
                {/* « Moy. générale » se lisait comme la moyenne de L ENFANT, juste
                    au-dessus. Le modèle de l’école lève l’ambiguïté : c’est celle de la
                    CLASSE. Même donnée, même calcul — seul le mot change. */}
                <td style={th}>{L(sys, 'Moyenne de la classe', 'Class average', 'Promedio de la clase')}</td>
                <td style={num}>{statsClasse.generale == null ? '—' : fix2(statsClasse.generale)}</td>
                {/* LE « % DE RÉUSSITE » TIENT DANS CETTE LIGNE SANS L'AGRANDIR.
                    « Moy. dernier » y occupait deux colonnes sur huit pour un
                    libellé de deux mots ; le carnet papier, lui, porte QUATRE
                    valeurs — 1st Avr., Least Avr., Gen. avr., Suc. rates. La
                    colonne rendue accueille la quatrième, et la ligne garde sa
                    hauteur : une ligne de plus coûterait de la place à la zone où
                    l'enseignant ÉCRIT. Sans taux fourni — toutes les écoles qui
                    n'ont rien demandé — la ligne reste celle d'avant, au point. */}
                {(statsClasse.reussite != null || statsClasse.reussis != null || statsClasse.vide) && (
                  <td style={{ ...num, fontWeight: 'bold' }}>
                    {(statsClasse.reussis != null || statsClasse.vide) && (
                      <>
                        <div>{L(sys, 'Réussis', 'Passed', 'Aprobados')} : {statsClasse.reussis ?? '—'}</div>
                        <div>{L(sys, 'Échoués', 'Failed', 'Reprobados')} : {statsClasse.echoues ?? '—'}</div>
                      </>
                    )}
                    {statsClasse.reussite != null && (
                      <div>{L(sys, 'Réussite', 'Pass', 'Éxito')} : {statsClasse.reussite} %</div>
                    )}
                  </td>
                )}
              </tr>
            )}

            <tr>
              <td style={th}>{L(sys, 'Observations de l’enseignant(e)', 'Class teacher’s remarks', 'Observaciones del maestro/a')}</td>
              {/* ZONE LIBRE : sa hauteur suit `--nc-observ`, qui reçoit en plus
                  le RELIQUAT de la page (cf. `--nc-reliquat`). C'est ici que va
                  la place restante d'un carnet peu rempli — pas dans un grand
                  vide en bas de feuille — parce que c'est ici qu'on écrit. */}
              {/* LA SIGNATURE DU PARENT N'EST IMPRIMÉE QU'UNE FOIS : dans le bloc des signatures, en bas
                  (« Visa du Parent / Tuteur »). Elle figurait aussi ici, dans la ligne des observations :
                  le même bulletin portait deux cases pour le même geste. `signatureParent` reste accepté
                  par compatibilité avec les appelants, mais n'ajoute plus de case. */}
              <td
                style={{
                  ...cell, height: 'var(--nc-observ)', borderTop: B, verticalAlign: 'top',
                  whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', textAlign: 'left',
                }}
                colSpan={7}
              >
                {observations}
              </td>
            </tr>
          </tbody>
        </table>

        {/* ── AUTRES STATISTIQUES ───────────────────────────────────────────
            Combien d'élèves par tranche de moyenne. Le carnet la porte en pied :
            un parent y lit où se situe son enfant dans la classe. */}
        {repartition.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: gap }}>
            <tbody>
              {/* LA COLONNE « TOTAL » DU CARNET PAPIER. Elle n'est pas décorative :
                  sans elle, un parent qui additionne les neuf tranches et tombe
                  sur 18 là où la classe compte 24 élèves ne sait pas si six
                  camarades manquent ou si le tableau est faux. Le total est
                  l'effectif RÉELLEMENT noté, fourni par l'écran — ce gabarit
                  n'additionne rien. */}
              <tr>
                <td style={{ ...th, textAlign: 'left' }} colSpan={repartition.length + (repartitionTotal != null ? 2 : 1)}>
                  {L(sys, 'Autres statistiques', 'Other statistics', 'Otras estadísticas')}
                </td>
              </tr>
              <tr>
                <td style={th}>
                  {L(sys, 'Intervalle de moyenne', 'Average range', 'Intervalo')}
                </td>
                {repartition.map((r) => <td key={r.label} style={th}>{r.label}</td>)}
                {repartitionTotal != null && <td style={th}>{L(sys, 'Total', 'Total', 'Total')}</td>}
              </tr>
              <tr>
                <td style={th}>{L(sys, 'Nombre d’élèves', 'Number of pupils', 'N.º de alumnos')}</td>
                {repartition.map((r) => <td key={r.label} style={num}>{r.n}</td>)}
                {repartitionTotal != null && (
                  <td style={{ ...num, fontWeight: 'bold' }}>{repartitionTotal}</td>
                )}
              </tr>
            </tbody>
          </table>
        )}
    </>
  );
}
