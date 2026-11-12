// Bulletin MATERNELLE officiel (MINEDUB) — aperçu écran imprimable.
//
// Tableau des domaines pédagogiques : niveau d'acquisition (A / ECA / NA) + observation pédagogique.
// Aucune note, aucune moyenne, aucun rang : ces cases n'existent pas en maternelle, donc elles ne s'impriment pas.
//
// ── MÊME GABARIT QUE LE PRIMAIRE (2026-11-12) ────────────────────────────────
// En-tête officiel, bande d'identité, signatures et feuille sont ceux du primaire (bulletinOfficialParts), AVEC le
// mode « densité » (`vars`) : le bulletin tient sur UNE page A4 par le même ajustement mesuré que le carnet primaire
// (lib/print/fitDensity.js), au lieu de tailles écrites en dur. Palette, bordures et cellules viennent de
// `fondamentalTheme` et de `mkCellVar/mkTHVar` : une correction de style faite pour le primaire vaut pour la
// maternelle. Ce qui reste propre à la maternelle : les domaines, les cotes A / ECA / NA et leur légende.
//
// ── LES UA DU TRIMESTRE, PUIS LA SYNTHÈSE ────────────────────────────────────
// Le bulletin trimestriel montre UNE COLONNE PAR UA du trimestre, puis la synthèse de la période. La synthèse est la
// cote DOMINANTE des UA cotées (core/matEngine · syntheseTrimestre), jamais une moyenne : A/ECA/NA ne s'additionnent
// pas. Une seule UA : aucune colonne d'UA, le titre dit laquelle.
//
// ── DEUX FORMATS, UN SEUL MOTEUR (2026-11-12) ────────────────────────────────
//   format 'classique' (défaut, l'ancien bulletin) : tableau N° / Domaine / Niveau / Observations. Avec `emojis`, la
//     colonne Niveau porte UN visage suivi de la lettre, la légende montre les trois visages et la photo est plein cadre.
//     SANS `emojis` : l'ancien bulletin, à l'identique (lettres seules).
//   format 'enfantin' : cartes arrondies, trois visages par domaine (celui de l'enfant en couleur), observation
//     automatique selon le niveau, remarques sur fond jaune pâle. Toujours avec visages.
// Les deux lisent les MÊMES lignes (`rows`) : passer de l'un à l'autre ne perd aucune évaluation.
//
// Rendu piloté par PROPS :
//   uas  = [1, 2, 3] — les UA de la période (vide ⇒ une seule colonne « Niveau »)
//   rows = [{ code, intitule, parUa: { 1: 'A', … }, niveau (synthèse), observation }]

import {
  mkCellVar, mkTHVar, L,
  OfficialHeader, OfficialIdentityBand, OfficialSignatures, OfficialSheet,
} from './bulletinOfficialParts';
import { headTeacherLabel, headTeacherCount } from '../../lib/headTeachers';
import { matAcquisLabel, matAcquisCode } from '../../core/referentielI18n';
import { FOND_COTE_COLORS } from './fondamentalTheme';
// Les teintes se déduisent de l'accent CHOISI PAR L'ÉCOLE, comme au carnet primaire : une école qui n'a rien
// choisi obtient le vert par défaut, et celle qui a choisi une couleur la retrouve sur les deux bulletins.
import { teintesDeLEcole } from '../../core/bulletinAccent';
import MatVisage from './MatEmojis';
import { MatIdentite, MatDomainesEnfantin, MatRemarques } from './BulletinMatEnfantin';
import { MAT_NIVEAU_TEXTE, MAT_FORMAT_ENFANTIN } from '../../core/matBulletin';

const MAT_LABELS = { A: 'Acquis', ECA: 'En cours d’acquisition', NA: 'Non acquis' };
// Infobulle de la cote : les mêmes mots que la légende, dans le système de la classe.
const matLevelLabel = (code, sys) => matAcquisLabel(code, MAT_LABELS[code], sys);
const CODES = ['A', 'ECA', 'NA'];

export default function BulletinMatOfficial({
  paysage = false,
  school, sys = 'FR', title, student, classLabel, effectif, profPrincipal = '',
  uas = [], rows = [], appreciation = '', decision = '',
  format = 'classique', emojis = false, visage = 'triste',
}) {
  const enfantin = format === MAT_FORMAT_ENFANTIN;
  const avecVisages = enfantin || emojis === true;
  const C = teintesDeLEcole(school);
  const cell = mkCellVar();
  // Avec les visages, les lignes sont plus hautes et leur contenu se centre ; sans eux, la cellule d'origine, inchangée.
  const cellL = avecVisages ? { ...cell, verticalAlign: 'middle' } : cell;
  const th   = { ...mkTHVar(), background: C.tint, color: C.texte, WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' };

  // Les colonnes d'UA ne s'affichent que si la période en fournit PLUSIEURS : la « synthèse » d'une unique unité EST
  // cette unité, les deux colonnes porteraient la même cote côte à côte.
  const uasRecues = Array.isArray(uas) ? uas.filter((n) => Number.isFinite(Number(n))) : [];
  const colUas = uasRecues.length > 1 ? uasRecues : [];
  const parUA = colUas.length > 0;
  const wDomaine = parUA ? `${38 - colUas.length * 3}%` : '38%';
  const wUa      = `${Math.max(7, Math.round(21 / Math.max(1, colUas.length)))}%`;
  const wNiveau  = parUA ? '11%' : '16%';
  const wObs     = parUA ? '30%' : '40%';
  const nbCols   = 4 + colUas.length;

  // Cote : sigle du système de la classe, dans la couleur de la cote (comme les cotes du primaire). Avec les visages :
  // UN visage (celui du niveau) puis la lettre, dans la couleur du niveau (A vert, IP orange, NA bleu).
  const coteCell = (code) => {
    if (!code) return '';
    if (!avecVisages) return <strong style={{ color: FOND_COTE_COLORS[code] }} title={matLevelLabel(code, sys)}>{matAcquisCode(code, sys)}</strong>;
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        <MatVisage niveau={code} actif visage={visage} taille="calc(var(--nc-body) * 2.9)" title={matLevelLabel(code, sys)} />
        <strong style={{ color: MAT_NIVEAU_TEXTE[code], fontSize: 'calc(var(--nc-body) * 1.1)' }}>{matAcquisCode(code, sys)}</strong>
      </span>
    );
  };

  // Fondamental MINEDUB : enseignant(e) titulaire + directeur/directrice (jamais professeur principal / proviseur).
  const teacherLabel = sys === 'EN' ? 'The Class Teacher' : sys === 'ES' ? 'El Maestro / La Maestra' : "L'Enseignant(e)";
  const headLabel    = sys === 'EN' ? 'The Head Teacher'  : sys === 'ES' ? 'El Director / La Directora' : 'Le Directeur / La Directrice';
  const ppLabel      = headTeacherLabel(headTeacherCount(profPrincipal), sys, { basic: true });

  if (enfantin) {
    return (
      <OfficialSheet school={school} pt={10} pageNo={1} total={1} sys={sys} vars>
        <OfficialHeader school={school} sys={sys} title={title} accent={C.accent} rounded basic vars grand={paysage} etoiles />
        <MatIdentite student={student} classLabel={classLabel} effectif={effectif} profPrincipal={profPrincipal} ppLabel={ppLabel} sys={sys} accent={C.accent} tint={C.tint} arrondi grand={paysage} />
        <MatDomainesEnfantin rows={rows} sys={sys} accent={C.accent} tint={C.tint} visage={visage} colUas={colUas} />
        <MatRemarques texte={appreciation} decision={decision} sys={sys} />
        <OfficialSignatures school={school} sys={sys} profPrincipal={profPrincipal} headLabel={headLabel} teacherLabel={teacherLabel} vars />
      </OfficialSheet>
    );
  }

  return (
    <OfficialSheet school={school} pt={10} pageNo={1} total={1} sys={sys} vars>
      <OfficialHeader school={school} sys={sys} title={title} accent={C.accent} rounded basic vars grand={paysage} />
      {avecVisages
        ? <MatIdentite student={student} classLabel={classLabel} effectif={effectif} profPrincipal={profPrincipal} ppLabel={ppLabel} sys={sys} accent={C.accent} tint={C.tint} grand={paysage} />
        : <OfficialIdentityBand student={student} classLabel={classLabel} effectif={effectif} profPrincipal={profPrincipal} ppLabel={ppLabel} sys={sys} accent={C.accent} tint={C.tint} variant="carnet" vars grand={paysage} />}

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ ...th, width: '6%' }}>N°</th>
            <th style={{ ...th, width: wDomaine, textAlign: 'left' }}>{L(sys, 'DOMAINES PÉDAGOGIQUES', 'LEARNING AREAS', 'ÁMBITOS PEDAGÓGICOS')}</th>
            {colUas.map((n) => (
              <th key={n} style={{ ...th, width: wUa }}>{L(sys, `UA${n}`, `LU${n}`, `UA${n}`)}</th>
            ))}
            <th style={{ ...th, width: wNiveau }}>
              {parUA ? L(sys, 'Synthèse', 'Summary', 'Síntesis') : L(sys, 'Niveau', 'Level', 'Nivel')}
            </th>
            <th style={{ ...th, width: wObs, textAlign: 'left' }}>{L(sys, 'Observations', 'Observations', 'Observaciones')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={nbCols} style={{ ...cell, textAlign: 'center', color: '#9ca3af' }}>
              {L(sys, 'Aucun domaine évalué pour cette période.', 'No learning area assessed for this period.', 'Ningún ámbito evaluado en este periodo.')}
            </td></tr>
          )}
          {rows.map((r) => (
            <tr key={r.code}>
              <td style={{ ...cellL, textAlign: 'center' }}>{r.code}</td>
              <td style={cellL}>{r.intitule}</td>
              {colUas.map((n) => (
                <td key={n} style={{ ...cellL, textAlign: 'center' }}>{coteCell(r.parUa?.[n] || '')}</td>
              ))}
              <td style={{ ...cellL, textAlign: 'center' }}>{coteCell(r.niveau || '')}</td>
              <td style={cellL}>{r.observation || ''}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Légende des cotes — même style de cellule que le reste du bulletin, sans bandeau coloré à part. */}
      <table className="apc-keep" style={{ width: '100%', borderCollapse: 'collapse', marginTop: 'calc(var(--nc-gap) * 0.5)' }}>
        <tbody>
          <tr>
            <td style={{ ...cell, fontSize: 'var(--nc-small)' }}>
              <strong>{L(sys, 'Légende', 'Key', 'Leyenda')} :</strong>{' '}
              {CODES.map((c, i) => (
                <span key={c} style={avecVisages ? { display: 'inline-flex', alignItems: 'center', gap: 4, marginRight: 14 } : undefined}>
                  {!avecVisages && i > 0 ? ' · ' : ''}
                  {avecVisages && <MatVisage niveau={c} actif visage={visage} taille="calc(var(--nc-body) * 1.9)" pastille={false} decor={false} />}
                  <strong style={{ color: avecVisages ? MAT_NIVEAU_TEXTE[c] : FOND_COTE_COLORS[c] }}>{matAcquisCode(c, sys)}</strong> = {matLevelLabel(c, sys)}
                </span>
              ))}
            </td>
          </tr>
        </tbody>
      </table>

      <table className="apc-keep" style={{ width: '100%', borderCollapse: 'collapse', marginTop: 'calc(var(--nc-gap) * 0.5)' }}>
        <tbody>
          <tr><td style={{ ...cell, height: 'var(--nc-observ)' }}>{L(sys, "Appréciation générale de l'enseignant(e)", "Class teacher's general remarks", 'Apreciación general del maestro/a')} : {appreciation}</td></tr>
          {decision ? <tr><td style={cell}>{L(sys, 'Décision', 'Decision', 'Decisión')} : <strong>{decision}</strong></td></tr> : null}
        </tbody>
      </table>

      <OfficialSignatures school={school} sys={sys} profPrincipal={profPrincipal} headLabel={headLabel} teacherLabel={teacherLabel} vars />
    </OfficialSheet>
  );
}
