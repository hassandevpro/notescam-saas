// Bulletin PRIMAIRE APC officiel (MINEDUB) — aperçu écran imprimable.
//
// Tableau des 11 compétences nationales : Moyenne /10 + Coef + Cote (A+/A/ECA/NA)
// + Appréciation. Pied : moyenne générale, cote, rang. En-tête / identité /
// signatures mutualisés via bulletinOfficialParts (layout APC standard).
//
// Rendu piloté par PROPS déjà calculées (par la page Bulletins via primEngine) :
//   rows = [{ code, intitule, moyenne, coef, cote, appreciation? }]

import {
  mkCell, mkTH, fix2,
  OfficialHeader, OfficialIdentityBand, OfficialSignatures, OfficialSheet,
} from './bulletinOfficialParts';

const PRIM_COTE_COLORS = { 'A+': '#059669', A: '#10b981', ECA: '#f59e0b', NA: '#ef4444' };

// Identité visuelle PRIMAIRE APC (MINEDUB) : vert. Distincte du bleu marine
// MINESEC (collège/lycée) et du violet maternelle. `accent` = barre de titre,
// `thBg`/`thColor` = en-têtes de tableau (impression forcée via print-color-adjust).
const PRIM_ACCENT = '#047857';
const PRIM_TH_BG  = '#d1fae5';
const PRIM_TH_TXT = '#065f46';

export default function BulletinPrimOfficial({
  school, sys = 'FR', title, student, classLabel, effectif, profPrincipal = '',
  rows = [], moyenneGenerale = null, coteGenerale = null, rang, classStats, appreciation = '', decision = '',
}) {
  const cell = mkCell(10);
  const th   = { ...mkTH(11), background: PRIM_TH_BG, color: PRIM_TH_TXT, WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' };
  const noted = rows.filter((r) => r.moyenne != null);

  // Fondamental MINEDUB : l'enseignant titulaire n'est pas un « professeur
  // principal » et le chef d'établissement est un directeur/directrice (jamais
  // proviseur, propre au lycée).
  const teacherLabel = sys === 'EN' ? 'The Class Teacher' : sys === 'ES' ? 'El Maestro / La Maestra' : "L'Enseignant(e)";
  const headLabel    = sys === 'EN' ? 'The Head Teacher'  : sys === 'ES' ? 'El Director / La Directora' : 'Le Directeur / La Directrice';
  const ppLabel      = sys === 'EN' ? 'Class teacher'     : sys === 'ES' ? 'Maestro/a' : 'Enseignant(e)';

  return (
    <OfficialSheet school={school} pt={10} pageNo={1} total={1}>
      <OfficialHeader school={school} sys={sys} title={title} accent={PRIM_ACCENT} basic />
      <OfficialIdentityBand student={student} classLabel={classLabel} effectif={effectif} profPrincipal={profPrincipal} ppLabel={ppLabel} accent={PRIM_ACCENT} tint={PRIM_TH_BG} />

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ ...th, width: '6%' }}>N°</th>
            <th style={{ ...th, width: '55%', textAlign: 'left' }}>COMPÉTENCES NATIONALES</th>
            <th style={{ ...th, width: '11%' }}>Moy. /10</th>
            <th style={{ ...th, width: '7%' }}>Coef</th>
            <th style={{ ...th, width: '9%' }}>COTE</th>
            <th style={{ ...th, width: '12%' }}>Appréciation</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={6} style={{ ...cell, textAlign: 'center', color: '#9ca3af', padding: '10px' }}>
              Aucune compétence évaluée pour cette période.
            </td></tr>
          )}
          {rows.map((r) => (
            <tr key={r.code}>
              <td style={{ ...cell, textAlign: 'center' }}>{r.code}</td>
              <td style={cell}>{r.intitule}</td>
              <td style={{ ...cell, textAlign: 'center', fontWeight: 'bold' }}>{fix2(r.moyenne)}</td>
              <td style={{ ...cell, textAlign: 'center' }}>{String(r.coef ?? 1)}</td>
              <td style={{ ...cell, textAlign: 'center' }}>
                <strong style={{ color: r.moyenne != null ? PRIM_COTE_COLORS[r.cote] : undefined }}>{r.moyenne != null ? r.cote : ''}</strong>
              </td>
              <td style={cell}>{r.appreciation || ''}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Synthèse */}
      <table className="apc-keep" style={{ width: '100%', borderCollapse: 'collapse', marginTop: 5 }}>
        <tbody>
          <tr>
            <td style={{ width: '50%', verticalAlign: 'top', paddingRight: 4 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  <tr><td colSpan={2} style={th}>Bilan de l'élève</td></tr>
                  <tr><td style={cell}>Moyenne générale /10</td><td style={{ ...cell, textAlign: 'center' }}><strong>{fix2(moyenneGenerale)}</strong></td></tr>
                  <tr><td style={cell}>Cote générale</td><td style={{ ...cell, textAlign: 'center' }}>
                    <strong style={{ color: moyenneGenerale != null ? PRIM_COTE_COLORS[coteGenerale] : undefined }}>{moyenneGenerale != null ? coteGenerale : ''}</strong>
                  </td></tr>
                  <tr><td style={cell}>Rang</td><td style={{ ...cell, textAlign: 'center' }}><strong>{rang ? `${rang} / ${effectif ?? ''}` : ''}</strong></td></tr>
                  <tr><td style={cell}>Compétences acquises (A+/A)</td><td style={{ ...cell, textAlign: 'center' }}>
                    {noted.filter((r) => r.cote === 'A+' || r.cote === 'A').length} / {noted.length}
                  </td></tr>
                </tbody>
              </table>
            </td>
            <td style={{ width: '50%', verticalAlign: 'top' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  <tr><td colSpan={2} style={th}>Profil de la classe</td></tr>
                  <tr><td style={cell}>Moyenne générale</td><td style={{ ...cell, textAlign: 'center' }}>{fix2(classStats?.avg)}</td></tr>
                  <tr><td style={cell}>[Min – Max]</td><td style={{ ...cell, textAlign: 'center' }}>{classStats ? `${fix2(classStats.min)} – ${fix2(classStats.max)}` : ''}</td></tr>
                  <tr><td style={cell}>Nombre de moyennes</td><td style={{ ...cell, textAlign: 'center' }}>{classStats?.count ?? ''}</td></tr>
                  <tr><td style={cell}>Taux de réussite</td><td style={{ ...cell, textAlign: 'center' }}>{classStats?.rate != null ? `${classStats.rate}%` : ''}</td></tr>
                </tbody>
              </table>
            </td>
          </tr>
        </tbody>
      </table>

      <table className="apc-keep" style={{ width: '100%', borderCollapse: 'collapse', marginTop: 3 }}>
        <tbody>
          <tr><td style={{ ...cell, height: 30 }}>Appréciation générale du Conseil des maîtres : {appreciation}</td></tr>
          {decision ? <tr><td style={cell}>Décision du conseil : <strong>{decision}</strong></td></tr> : null}
        </tbody>
      </table>

      <OfficialSignatures school={school} sys={sys} profPrincipal={profPrincipal} headLabel={headLabel} teacherLabel={teacherLabel} />
    </OfficialSheet>
  );
}
