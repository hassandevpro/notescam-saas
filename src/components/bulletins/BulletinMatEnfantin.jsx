// PIÈCES DU BULLETIN DE MATERNELLE « ENFANTIN » — partagées avec le « Classique à émojis ».
//
// UN SEUL MOTEUR DE RENDU : BulletinMatOfficial décide du format et appelle ces pièces. Même en-tête, mêmes données
// (niveaux A / ECA / NA, observations), mêmes visages (MatEmojis) : passer d'un format à l'autre ne perd rien.
//
// Rien n'est codé pour une école : couleur = accent choisi par l'école ; libellés et langue = ceux de la classe ;
// les couleurs des niveaux et la palette arc-en-ciel des domaines sont FIXES (core/matBulletin).

import { L, B, genderLabel } from './bulletinOfficialParts';
import { BulletinPhotoPleine } from './BulletinPhoto';
import MatVisage from './MatEmojis';
import {
  MAT_NIVEAUX, MAT_NIVEAU_COULEUR, MAT_NIVEAU_TEXTE, couleurDomaine, libelleNiveau, observationAffichee, densiteDomaines,
} from '../../core/matBulletin';
import { matAcquisCode } from '../../core/referentielI18n';

// Case à cocher des « Redoublant » (même dessin que l'en-tête officiel).
const Chk = ({ on }) => (
  <span style={{ display: 'inline-block', width: 9, height: 9, border: B, margin: '0 2px', verticalAlign: 'middle', background: on ? '#374151' : '#fff' }} />
);

const PASTILLE = (niveau) => (
  <span aria-hidden style={{
    display: 'inline-block', width: '0.78em', height: '0.78em', borderRadius: '50%', background: MAT_NIVEAU_COULEUR[niveau],
    marginRight: '0.4em', verticalAlign: 'baseline', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact',
  }} />
);

/**
 * Bloc d'identité : PHOTO PLEIN CADRE (carré, recadrage « cover ») + nom + état civil.
 * `arrondi` : cadre arrondi (Enfantin) ; sinon cadre droit teinté (Classique).
 */
export function MatIdentite({ student, classLabel, effectif, profPrincipal, ppLabel, sys, accent, tint, arrondi = false, grand = false }) {
  const redoublant = String(student?.statut || '').toLowerCase().includes('redoubl');
  const parents = [student?.nom_pere, student?.nom_mere, student?.tuteur].filter(Boolean).join(' · ');
  const phone = student?.parent_phone ? ` (${student.parent_phone})` : '';
  const photo = grand ? 104 : 88;
  const lib = { fontWeight: 'bold' };
  const ligne = { margin: 0, lineHeight: 1.25 };
  return (
    <div style={{
      display: 'flex', alignItems: 'stretch', gap: 12, boxSizing: 'border-box',
      background: tint, border: `${arrondi ? 2 : 1.5}px solid ${accent}`, borderRadius: arrondi ? 12 : 0,
      padding: arrondi ? 4 : 0, marginBottom: 'var(--nc-gap)', fontSize: 'var(--nc-body)',
      WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact',
    }}>
      <BulletinPhotoPleine
        src={student?.photo_url} taille={arrondi ? photo : photo + 4} accent={accent} tint={tint}
        rayon={arrondi ? 10 : 0} epaisseur={arrondi ? 3 : 0}
      />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 5, padding: arrondi ? '2px 0' : '4px 0' }}>
        <div style={{ ...ligne, fontSize: 'calc(var(--nc-head) * 1.7)', fontWeight: 800, color: accent, letterSpacing: '.3px', overflowWrap: 'anywhere' }}>
          {student?.name || ''}
        </div>
        <p style={ligne}>
          <span style={lib}>{L(sys, 'Né(e) le', 'Born on', 'Nacido/a el')} :</span> {student?.date_naissance || '—'}
          {student?.lieu_naissance ? ` ${L(sys, 'à', 'in', 'en')} ${student.lieu_naissance}` : ''}
        </p>
        <p style={ligne}>
          <span style={lib}>{L(sys, 'Parents / Tuteurs', 'Parents / Guardians', 'Padres / Tutores')} :</span> {parents || '—'}{phone}
        </p>
      </div>
      <div style={{ flex: '0 0 36%', minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 5, padding: arrondi ? '2px 8px 2px 0' : '4px 8px 4px 0' }}>
        <p style={ligne}>
          <span style={lib}>{L(sys, 'Classe', 'Class', 'Clase')} :</span> {classLabel}
          {effectif != null ? <> &nbsp;·&nbsp; <span style={lib}>{L(sys, 'Effectif', 'Class size', 'Total')} :</span> {effectif}</> : null}
        </p>
        <p style={ligne}>
          <span style={lib}>{L(sys, 'Genre', 'Gender', 'Género')} :</span> {genderLabel(student?.gender, sys)}
          &nbsp;·&nbsp; <span style={lib}>{L(sys, 'Identifiant', 'ID', 'Identificador')} :</span> {student?.matricule || '—'}
        </p>
        <p style={ligne}>
          <span style={lib}>{L(sys, 'Redoublant', 'Repeater', 'Repetidor')} :</span> {L(sys, 'Oui', 'Yes', 'Sí')} <Chk on={redoublant} /> {L(sys, 'Non', 'No', 'No')} <Chk on={!redoublant} />
          &nbsp;·&nbsp; <span style={lib}>{ppLabel} :</span> {profPrincipal || '—'}
        </p>
      </div>
    </div>
  );
}

// Grille commune de l'en-tête de colonnes et des lignes : pastille+code | domaine | 3 niveaux | observation.
const GRILLE = '56px minmax(0, 1fr) 11% 11% 11% 25%';

/** Les domaines en « cartes » : pastille arc-en-ciel, libellé, TROIS visages (celui de l'enfant en couleur), observation. */
export function MatDomainesEnfantin({ rows, sys, accent, tint, visage, colUas = [] }) {
  const entete = { fontWeight: 'bold', fontSize: 'var(--nc-small)', color: accent, display: 'flex', alignItems: 'center', justifyContent: 'center', whiteSpace: 'nowrap' };
  // Au-delà de dix domaines, les lignes se resserrent d'elles-mêmes (visages, hauteur, marges) : une ligne n'est jamais
  // coupée entre deux pages, et le bulletin reste sur UNE page.
  const k = densiteDomaines(rows.length);
  const tailleVisage = `calc(var(--nc-body) * ${(2.5 * k).toFixed(3)})`;
  const tailleActif = `calc(var(--nc-body) * ${(3.0 * k).toFixed(3)})`;
  return (
    <div style={{ marginBottom: 'var(--nc-gap)' }}>
      <div style={{
        display: 'grid', gridTemplateColumns: GRILLE, alignItems: 'center', background: tint, border: `1.5px solid ${accent}`,
        borderRadius: 10, padding: 'calc(var(--nc-pad-v) + 1px) 8px', marginBottom: 'calc(var(--nc-gap) * 0.6)',
        WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact',
      }}>
        <div style={entete}>N°</div>
        <div style={{ ...entete, justifyContent: 'flex-start', paddingLeft: 6 }}>{L(sys, 'DOMAINES D’APPRENTISSAGE', 'LEARNING AREAS', 'ÁMBITOS DE APRENDIZAJE')}</div>
        {MAT_NIVEAUX.map((n) => (
          <div key={n} style={entete}>{PASTILLE(n)}{libelleNiveau(n, sys)}</div>
        ))}
        <div style={{ ...entete, justifyContent: 'flex-start' }}>{L(sys, 'Observations', 'Observations', 'Observaciones')}</div>
      </div>

      {rows.length === 0 && (
        <div style={{ textAlign: 'center', color: '#9ca3af', padding: 8 }}>
          {L(sys, 'Aucun domaine évalué pour cette période.', 'No learning area assessed for this period.', 'Ningún ámbito evaluado en este periodo.')}
        </div>
      )}

      {rows.map((r, i) => {
        const c = couleurDomaine(i);
        const niveau = MAT_NIVEAUX.includes(r.niveau) ? r.niveau : '';
        return (
          <div key={r.code || i} data-domaine={r.code} style={{
            display: 'grid', gridTemplateColumns: GRILLE, alignItems: 'center', background: c.fond, border: `1.5px solid ${c.filet}`,
            borderRadius: 10, padding: `calc(var(--nc-pad-v) * ${(0.9 * k).toFixed(3)}) 8px`, marginBottom: `calc(var(--nc-gap) * ${(0.55 * k).toFixed(3)})`,
            breakInside: 'avoid', pageBreakInside: 'avoid', minHeight: `calc(var(--nc-body) * ${(3.4 * k).toFixed(3)})`,
            WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact',
          }}>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 'calc(var(--nc-body) * 2.1)', height: 'calc(var(--nc-body) * 2.1)',
                borderRadius: '50%', background: c.pastille, color: '#fff', fontWeight: 800, fontSize: String(r.code || '').length > 2 ? 'calc(var(--nc-small) * 0.78)' : 'var(--nc-small)',
                WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact',
              }}>{r.code}</span>
            </div>
            <div style={{ paddingLeft: 6, minWidth: 0, overflowWrap: 'anywhere', lineHeight: 1.2 }}>
              <div>{r.intitule}</div>
              {colUas.length > 0 && (
                <div style={{ fontSize: 'var(--nc-small)', color: '#6b7280', marginTop: 1 }}>
                  {colUas.map((n) => {
                    const lv = r.parUa?.[n];
                    return (
                      <span key={n} style={{ marginRight: 8 }}>
                        {L(sys, `UA${n}`, `LU${n}`, `UA${n}`)} <strong style={{ color: lv ? MAT_NIVEAU_TEXTE[lv] : '#9ca3af' }}>{lv ? matAcquisCode(lv, sys) : '—'}</strong>
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
            {MAT_NIVEAUX.map((n) => (
              <div key={n} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: tailleActif }}>
                <MatVisage
                  niveau={n} actif={niveau === n} visage={visage} taille={niveau === n ? tailleActif : tailleVisage}
                  title={`${r.intitule} — ${libelleNiveau(n, sys)}`}
                />
              </div>
            ))}
            <div style={{ fontStyle: 'italic', color: '#374151', overflowWrap: 'anywhere', lineHeight: 1.2 }}>
              {observationAffichee(r.observation, niveau, sys)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Encadré jaune pâle des remarques générales de l'enseignant(e). */
export function MatRemarques({ texte, decision, sys }) {
  return (
    <div className="apc-keep" style={{
      background: '#fffbeb', border: '1.5px solid #fcd34d', borderRadius: 10, padding: 'calc(var(--nc-pad-v) + 2px) 10px',
      marginBottom: 'calc(var(--nc-gap) * 0.6)', minHeight: 'var(--nc-observ)', boxSizing: 'border-box',
      WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact',
    }}>
      <div style={{ fontWeight: 'bold' }}>{L(sys, 'Appréciation générale de l’enseignant(e)', 'Class teacher’s general remarks', 'Apreciación general del maestro/a')} :</div>
      {texte ? <div style={{ fontStyle: 'italic', color: '#374151' }}>{texte}</div> : null}
      {decision ? <div style={{ marginTop: 2 }}>{L(sys, 'Décision', 'Decision', 'Decisión')} : <strong>{decision}</strong></div> : null}
    </div>
  );
}
