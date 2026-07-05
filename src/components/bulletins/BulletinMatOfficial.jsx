// Bulletin MATERNELLE officiel (MINEDUB) — aperçu écran imprimable.
//
// Tableau des 8 domaines pédagogiques : niveau d'acquisition (A / ECA / NA) +
// observation pédagogique, par trimestre. Aucune note, aucune moyenne, aucun rang.
// En-tête / identité / signatures mutualisés (layout APC standard).
//
// Rendu piloté par PROPS :
//   rows = [{ code, intitule, niveau ('A'|'ECA'|'NA'|''), observation }]

import {
  mkCell, mkTH,
  OfficialHeader, OfficialIdentityBand, OfficialSignatures, OfficialSheet,
} from './bulletinOfficialParts';

const MAT_COLORS = { A: '#059669', ECA: '#f59e0b', NA: '#ef4444' };
const MAT_LABELS = { A: 'Acquis', ECA: 'En cours d’acquisition', NA: 'Non acquis' };
// Cote illustrée pour un bulletin de tout-petits : smiley + lettre (reste officiel).
const MAT_EMOJI  = { A: '😀', ECA: '😐', NA: '☹️' };

// Icône par domaine — résolue par MOTS-CLÉS de l'intitulé (robuste : indépendante
// des codes D1…D8, qui peuvent varier). Repli 🌟 si aucun mot-clé ne correspond.
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const DOMAINE_ICONS = [
  [/langage|communicat|parole|oral/,            '💬'],
  [/lecture|ecrit|graph|trace/,                 '✏️'],
  [/numer|logi|math|calcul|nombre/,             '🔢'],
  [/psychomot|motric|corps|physique|sport/,     '🤸'],
  [/monde|scien|nature|environ|decouverte/,     '🌍'],
  [/social|affect|vivre|emotion|citoyen/,       '❤️'],
  [/art|music|dessin|creativ|chant|danse/,      '🎨'],
  [/autonom|hygien|proprete|personnel/,         '🧩'],
];
const domaineIcon = (intitule) => {
  const s = norm(intitule);
  for (const [re, ic] of DOMAINE_ICONS) if (re.test(s)) return ic;
  return '🌟';
};

// Identité visuelle MATERNELLE (MINEDUB) : violet, coins arrondis. Distincte du
// bleu marine MINESEC (collège/lycée) et du vert primaire APC.
const MAT_ACCENT = '#7c3aed';
const MAT_TH_BG  = '#f3e8ff';
const MAT_TH_TXT = '#6d28d9';

export default function BulletinMatOfficial({
  school, sys = 'FR', title, student, classLabel, effectif, profPrincipal = '',
  rows = [], appreciation = '', decision = '',
}) {
  const cell = mkCell(10);
  const th   = { ...mkTH(11), background: MAT_TH_BG, color: MAT_TH_TXT, WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' };

  // Fondamental MINEDUB : enseignant(e) titulaire + directeur/directrice (jamais
  // professeur principal / proviseur, propres au secondaire).
  const teacherLabel = sys === 'EN' ? 'The Class Teacher' : sys === 'ES' ? 'El Maestro / La Maestra' : "L'Enseignant(e)";
  const headLabel    = sys === 'EN' ? 'The Head Teacher'  : sys === 'ES' ? 'El Director / La Directora' : 'Le Directeur / La Directrice';
  const ppLabel      = sys === 'EN' ? 'Class teacher'     : sys === 'ES' ? 'Maestro/a' : 'Enseignant(e)';

  return (
    <OfficialSheet school={school} pt={10} pageNo={1} total={1}>
      <OfficialHeader school={school} sys={sys} title={title} accent={MAT_ACCENT} rounded basic />
      <OfficialIdentityBand student={student} classLabel={classLabel} effectif={effectif} profPrincipal={profPrincipal} ppLabel={ppLabel} accent={MAT_ACCENT} tint={MAT_TH_BG} />

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ ...th, width: '6%' }}>N°</th>
            <th style={{ ...th, width: '38%', textAlign: 'left' }}>DOMAINES PÉDAGOGIQUES</th>
            <th style={{ ...th, width: '16%' }}>Niveau</th>
            <th style={{ ...th, width: '40%', textAlign: 'left' }}>Observations</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={4} style={{ ...cell, textAlign: 'center', color: '#9ca3af', padding: '10px' }}>
              Aucun domaine évalué pour cette période.
            </td></tr>
          )}
          {rows.map((r) => (
            <tr key={r.code}>
              <td style={{ ...cell, textAlign: 'center' }}>{r.code}</td>
              <td style={cell}><span style={{ marginRight: 5 }} aria-hidden>{domaineIcon(r.intitule)}</span>{r.intitule}</td>
              <td style={{ ...cell, textAlign: 'center' }}>
                {r.niveau ? <strong style={{ color: MAT_COLORS[r.niveau] }} title={MAT_LABELS[r.niveau]}>{MAT_EMOJI[r.niveau]} {r.niveau}</strong> : ''}
              </td>
              <td style={cell}>{r.observation || ''}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Légende — bandeau violet doux (identité maternelle) */}
      <div style={{ fontSize: '8.5pt', color: MAT_TH_TXT, background: MAT_TH_BG, border: `1px solid ${MAT_ACCENT}22`, borderRadius: 6, padding: '3px 8px', marginTop: 4, WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
        😀 A = Acquis · 😐 ECA = En cours d'acquisition · ☹️ NA = Non acquis
      </div>

      <table className="apc-keep" style={{ width: '100%', borderCollapse: 'collapse', marginTop: 4 }}>
        <tbody>
          <tr><td style={{ ...cell, height: 34 }}>Appréciation générale de l'enseignant(e) : {appreciation}</td></tr>
          {decision ? <tr><td style={cell}>Décision : <strong>{decision}</strong></td></tr> : null}
        </tbody>
      </table>

      <OfficialSignatures school={school} sys={sys} profPrincipal={profPrincipal} headLabel={headLabel} teacherLabel={teacherLabel} />
    </OfficialSheet>
  );
}
