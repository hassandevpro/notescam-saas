// Pièces partagées des bulletins OFFICIELS MINESEC (aperçu écran imprimable) :
// APC premier cycle ([[apc_minesec_engine]]) et Second Cycle ([[sc_minesec_engine]]).
// En-tête pays + filigrane logo + identité élève + signature unique sont
// identiques pour les deux ; seul le tableau central diffère.
//
// Tailles en POINTS (pt) pour un rendu papier fidèle (lisibilité ≥ 10pt). Les
// styles de cellule sont paramétrables par la taille de police (auto-fit APC).

import AssetImg from '../AssetImg';
import BulletinPhoto from './BulletinPhoto';
import { bulletinOfficials } from '../../countries';
import { bulletinFontFamily } from '../../lib/schoolTheme';

export const B = '1px solid #374151';

// Helper i18n des bulletins officiels : rendu selon le SYSTÈME de la classe
// (FR/EN/ES), indépendant de la langue de l'interface. `es` optionnel → repli FR.
export const L = (sys, fr, en, es) => (sys === 'EN' ? en : (sys === 'ES' && es != null ? es : fr));

// Le genre est stocké en FRANÇAIS ('Masculin' / 'Féminin') quel que soit le
// système : c'est la valeur canonique de la base, posée à l'import comme à
// l'export (lib/dataImportCore.js, lib/exportCsv.js). Traduire l'ÉTIQUETTE sans
// traduire la VALEUR laissait « Gender : Masculin » sur un bulletin anglophone.
// On traduit donc à l'affichage, sans jamais toucher au stockage.
// Une valeur inattendue est rendue telle quelle : mieux vaut une donnée brute
// qu'une donnée travestie sur un document officiel.
export const genderLabel = (value, sys) => {
  const v = String(value ?? '').trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (!v) return '';
  if (/^(m|masculin|masculino|male|garcon|h|homme|hombre)$/.test(v)) return L(sys, 'Masculin', 'Male', 'Masculino');
  if (/^(f|feminin|femenino|female|fille|femme|mujer)$/.test(v))     return L(sys, 'Féminin', 'Female', 'Femenino');
  return String(value);
};

// Fabriques de styles paramétrées par la taille de police (pt) — l'auto-fit APC
// fait varier la densité du corps du tableau (10–11pt) en gardant la lisibilité.
export const mkCell = (pt = 10, lineH = 1.18, padV = 1) => ({ border: B, padding: `${padV}px 3px`, fontSize: `${pt}pt`, lineHeight: lineH, verticalAlign: 'top' });
export const mkTH   = (pt = 10, lineH = 1.18, padV = 1) => ({ ...mkCell(pt, lineH, padV), background: '#eef2f7', textAlign: 'center', fontWeight: 'bold' });

// ── CONTRAT DE DENSITÉ (lib/print/fitDensity.js) ───────────────────────────
// Quand un gabarit demande `vars`, ses tailles ne sont plus des nombres écrits
// dans le JSX mais des références à `--nc-*`, toutes dérivées en CSS de la
// SEULE variable `--nc-d`. C'est ce qui permet de CHERCHER la bonne densité
// par la mesure au lieu de l'estimer : un seul bouton à tourner, et la feuille
// entière suit. Les gabarits qui ne le demandent pas ne changent pas d'un
// pixel — `dense` et les tailles en dur restent leur chemin.
export const mkCellVar = (lineH = 1.18) => ({
  border: B, padding: 'var(--nc-pad-v) 3px', fontSize: 'var(--nc-body)',
  lineHeight: lineH, verticalAlign: 'top',
});
export const mkTHVar = (lineH = 1.18) => ({
  ...mkCellVar(lineH), background: '#eef2f7', textAlign: 'center', fontWeight: 'bold',
});

// Constantes par défaut (10pt) — utilisées par le Second Cycle et l'identité.
export const CELL = mkCell(10);
export const TH   = mkTH(10);
export const HEAD = mkTH(10);

export const fix2 = (v) => (v == null ? '' : (Math.round(v * 100) / 100).toString());

// ── Filigrane logo au fond — APERÇU ÉCRAN uniquement (no-print) ───────────────
// À l'impression, le filigrane est géré GLOBALEMENT par un élément `position:fixed`
// (qui se répète sur chaque page) rendu par la page Bulletins.
export function OfficialWatermark({ src }) {
  if (!src) return null;
  return (
    <div
      aria-hidden
      className="no-print"
      style={{
        position: 'absolute', inset: 0, zIndex: 0, overflow: 'hidden',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        pointerEvents: 'none',
      }}
    >
      <AssetImg src={src} alt="" style={{ width: '66%', maxWidth: 460, objectFit: 'contain', opacity: 0.06 }} />
    </div>
  );
}

// ── En-tête officiel (blocs pays + nom établissement + barre de titre) ─────────
// Le logo n'apparaît plus ici : il est en filigrane au fond. Tailles lisibles
// (titre ~13pt, ministères ~9pt, nom ~11pt) — l'en-tête ne figure qu'en page 1.
// `accent` : couleur de la barre de titre. Défaut = bleu marine MINESEC (collège /
// lycée). Le fondamental MINEDUB passe sa propre teinte (maternelle violet,
// primaire vert) pour une identité visuelle distincte. `rounded` adoucit les coins
// (bulletins des tout-petits) sans changer le format officiel.
// `dense` : disposition resserrée, pour les carnets qui ne tiendraient pas sur
// une page autrement (densité mesurée, cf. lib/print/fitDensity.js). Rien n'est RETIRÉ — en-tête
// officiel, armoiries et mentions ministérielles restent au complet, ce sont des
// mentions obligatoires. Seuls le logo, les interlignes et les tailles cèdent du
// terrain. Défaut `false` : aucun autre bulletin n'est touché.
//
// `subtitle` : fondu DANS le bandeau de titre quand il est fourni. Deux bandeaux
// colorés empilés coûtaient 49 px pour deux lignes de texte ; un seul en coûte 29
// et dit la même chose.
export function OfficialHeader({
  school, sys, title, subtitle, accent = '#1e3a5f', rounded = false, basic = false,
  dense = false, vars = false,
}) {
  const officials = bulletinOfficials(school, { basic, sys });
  const blocks    = officials?.blocks ?? [];
  const bilingual = officials?.bilingual && blocks.length > 1;
  // Proportions INCHANGÉES. J'avais essayé le 37 / 26 / 37 de la spécification :
  // il rend bien de la place aux délégations, mais il étrangle le bloc central,
  // et « THE GENIUS INTERNATIONAL SCHOOL » y passait sur trois lignes avec le
  // NUMÉRO DE TÉLÉPHONE COUPÉ EN DEUX (« 690 56 76 » puis « 76 »). Un numéro
  // qu'un parent ne peut pas composer est un défaut plus grave qu'une
  // délégation sur deux lignes. La vraie correction est ci-dessous, sur le
  // retour à la ligne, et elle vaut pour TOUS les bulletins.
  const centerW   = bilingual ? '34%' : '50%';
  const sideW     = bilingual ? '33%' : '50%';
  const yearLbl   = sys === 'EN' ? 'Academic year' : sys === 'ES' ? 'Año escolar' : 'Année scolaire';
  const logoPx    = vars ? 'var(--nc-logo)' : dense ? 38 : 56;
  const ptPetit   = vars ? 'var(--nc-small)' : null;
  const gap       = vars ? 'var(--nc-gap)' : null;

  const Block = ({ b }) => (
    <td style={{
      width: sideW, textAlign: 'center',
      fontSize: ptPetit || (dense ? '8pt' : '9pt'), lineHeight: dense ? 1.12 : 1.3,
      padding: dense ? 1 : 2, verticalAlign: 'top',
    }}>
      <strong>{b.republic}</strong><br />
      {b.motto}<br />————————<br />
      {b.ministry}{b.lines.length > 0 && <br />}
      {b.lines.map((ln, i) => <span key={i}>{ln}{i < b.lines.length - 1 && <br />}</span>)}
      {b.establishment && (<><br /><strong>{b.establishment}</strong></>)}
    </td>
  );

  return (
    <>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: gap || (dense ? 2 : 4) }}>
        <tbody>
          <tr>
            {blocks[0] && <Block b={blocks[0]} />}
            <td style={{ width: centerW, textAlign: 'center', padding: dense ? 1 : 2, verticalAlign: 'top' }}>
              {school?.logo_url && (
                <AssetImg src={school.logo_url} alt="" style={{ width: logoPx, height: logoPx, objectFit: 'contain', display: 'block', margin: '0 auto 2px' }} />
              )}
              <strong style={{ fontSize: vars ? 'var(--nc-head)' : dense ? '10pt' : '11pt', display: 'block', lineHeight: dense ? 1.1 : undefined }}>{(school?.name || '').toUpperCase()}</strong>
              {/* UN NUMÉRO DE TÉLÉPHONE NE SE COUPE PAS. Relevé au rendu :
                  « 690 56 76 76 » passait à la ligne entre le 3e et le 4e
                  groupe, et un parent ne peut pas composer un numéro coupé.
                  La B.P. et le téléphone sont donc insécables chacun ; seul
                  le séparateur « · » peut passer à la ligne. */}
              {(school?.address || school?.phone) && (
                <span style={{ fontSize: ptPetit || (dense ? '8pt' : '8.5pt') }}>
                  {school?.address ? <span style={{ whiteSpace: 'nowrap' }}>{`B.P. ${school.address}`}</span> : ''}
                  {school?.address && school?.phone ? ' · ' : ''}
                  {school?.phone ? <span style={{ whiteSpace: 'nowrap' }}>{school.phone}</span> : ''}
                </span>
              )}
              <br />
              <span style={{ fontSize: ptPetit || (dense ? '8pt' : '8.5pt') }}>{yearLbl} : <strong>{school?.current_year || '—'}</strong></span>
            </td>
            {bilingual && blocks[1] && <Block b={blocks[1]} />}
          </tr>
        </tbody>
      </table>
      {title && (
        <div className="apc-title-bar" style={{
          background: accent, color: '#fff', textAlign: 'center',
          padding: vars ? 'calc(var(--nc-gap) * 0.7) 8px' : dense ? '2px 8px' : '4px 8px',
          fontWeight: 'bold',
          fontSize: vars ? 'calc(var(--nc-head) * 1.2)' : dense ? '11pt' : '13pt',
          letterSpacing: '.4px',
          marginBottom: gap || (dense ? 3 : 5), borderRadius: rounded ? 6 : 0,
          WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact',
        }}>
          {title}
          {subtitle && (
            <span style={{ fontWeight: 'normal', fontSize: vars ? 'var(--nc-body)' : dense ? '9pt' : '10pt', opacity: 0.95 }}>
              {'  ·  '}{subtitle}
            </span>
          )}
        </div>
      )}
    </>
  );
}

// ── Bandeau de continuation (pages 2+) ────────────────────────────────────────
export function ContinuationHeader({ title, student, classLabel, serieLabel, sys }) {
  const who = [student?.name, [classLabel, serieLabel].filter(Boolean).join(' · ')].filter(Boolean).join(' — ');
  return (
    <div style={{ borderBottom: B, marginBottom: 5, paddingBottom: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, fontSize: '10pt' }}>
      <strong style={{ whiteSpace: 'nowrap' }}>{title}</strong>
      <span style={{ color: '#374151', textAlign: 'right' }}>{who} <em style={{ color: '#6b7280' }}>{L(sys, '(suite)', '(cont.)', '(cont.)')}</em></span>
    </div>
  );
}

// ── Identité de l'élève (avec série optionnelle pour le second cycle) ──────────
// `ppLabel` : surcharge du libellé « P. principal » (le fondamental parle
// d'enseignant(e) de la classe). `qrSrc` : QR d'identification de l'élève (même
// payload que la carte scolaire) — colonne affichée seulement s'il est fourni.
export function OfficialIdentity({ student, classLabel, serieLabel, effectif, profPrincipal, sys, ppLabel, qrSrc }) {
  const redoublant = String(student?.statut || '').toLowerCase().includes('redoubl');
  const parents = [student?.nom_pere, student?.nom_mere, student?.tuteur].filter(Boolean).join(' · ');
  const phone = student?.parent_phone ? ` (${student.parent_phone})` : '';
  const classTxt = [classLabel, serieLabel].filter(Boolean).join(' · ');
  const yes = L(sys, 'Oui', 'Yes', 'Sí');
  const no  = L(sys, 'Non', 'No', 'No');
  const ppLbl = ppLabel || L(sys, 'P. principal', 'Form master', 'Tutor');
  const Chk = ({ on }) => (
    <span style={{ display: 'inline-block', width: 9, height: 9, border: B, margin: '0 2px', verticalAlign: 'middle', background: on ? '#374151' : '#fff' }} />
  );
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 4 }}>
      <tbody>
        <tr>
          <td rowSpan={4} style={{ ...CELL, width: 64, textAlign: 'center', verticalAlign: 'middle' }}>
            <BulletinPhoto src={student?.photo_url} width={52} height={64} radius={2} />
          </td>
          <td style={CELL}>{L(sys, "Nom et Prénoms de l'élève", "Student's full name", 'Nombre y apellidos')} : <strong>{student?.name || ''}</strong></td>
          <td style={{ ...CELL, whiteSpace: 'nowrap' }}>{L(sys, 'Classe', 'Class', 'Clase')} : <strong>{classTxt}</strong></td>
          {qrSrc && (
            <td rowSpan={4} style={{ ...CELL, width: 58, textAlign: 'center', verticalAlign: 'middle' }}>
              <img src={qrSrc} alt="QR" style={{ width: 48, height: 48, display: 'inline-block' }} />
              <div style={{ fontSize: '6pt', color: '#9ca3af', letterSpacing: 0.3 }}>SCAN</div>
            </td>
          )}
        </tr>
        <tr>
          <td style={CELL}>{L(sys, 'Date et lieu de naissance', 'Date and place of birth', 'Fecha y lugar de nacimiento')} : {student?.date_naissance || ''} {student?.lieu_naissance ? `${L(sys, 'à', 'in', 'en')} ${student.lieu_naissance}` : ''}</td>
          <td style={CELL}>{L(sys, 'Genre', 'Gender', 'Género')} : {genderLabel(student?.gender, sys)} · {L(sys, 'Effectif', 'Class size', 'Total')} : {effectif ?? ''}</td>
        </tr>
        <tr>
          <td style={CELL}>{L(sys, 'Identifiant Unique', 'Unique ID', 'Identificador único')} : {student?.matricule || ''}</td>
          <td style={CELL}>{L(sys, 'Redoublant', 'Repeater', 'Repetidor')} : {yes} <Chk on={redoublant} /> {no} <Chk on={!redoublant} /> · {ppLbl} : {profPrincipal || ''}</td>
        </tr>
        <tr><td colSpan={2} style={CELL}>{L(sys, 'Noms et contacts des Parents / Tuteurs', 'Parents / Guardians names and contacts', 'Nombres y contactos de los padres / tutores')} : {parents}{phone}</td></tr>
      </tbody>
    </table>
  );
}

// ── Identité « bandeau coloré » (fondamental : maternelle / primaire) ──────────
// Variante illustrée de OfficialIdentity : photo + nom de l'élève sur une bande
// teintée (accent), puis les détails d'état civil sur fond clair. Conserve TOUS
// les champs officiels (naissance, genre, matricule, redoublant, parents, P.
// principal) — seule la présentation change. `accent` = bande, `tint` = détails.
// `dense` : même bandeau, resserré. L'état civil reste COMPLET — un bulletin
// officiel porte la date et le lieu de naissance, le matricule et le tuteur, et
// ce n'est pas négociable pour gagner des millimètres. Ce sont la photo, les
// interlignes et les rembourrages qui cèdent.
export function OfficialIdentityBand({ student, classLabel, serieLabel, effectif, profPrincipal, ppLabel, sys, accent = '#1e3a5f', tint = '#eef2f7', dense = false, variant = 'bande', vars = false }) {
  const redoublant = String(student?.statut || '').toLowerCase().includes('redoubl');
  const parents = [student?.nom_pere, student?.nom_mere, student?.tuteur].filter(Boolean).join(' · ');
  const phone = student?.parent_phone ? ` (${student.parent_phone})` : '';
  const classTxt = [classLabel, serieLabel].filter(Boolean).join(' · ');
  const pcx = { WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' };
  const ppLbl = ppLabel || L(sys, 'P. principal', 'Class teacher', 'Tutor');
  const Chk = ({ on }) => (
    <span style={{ display: 'inline-block', width: 9, height: 9, border: B, margin: '0 2px', verticalAlign: 'middle', background: on ? '#374151' : '#fff' }} />
  );
  // En dense, la cellule d'état civil passe à 8,5 pt sans rembourrage vertical :
  // c'est la ligne la plus répétée du bandeau, donc celle qui rend le plus.
  const idCell = vars ? mkCellVar(1.15) : dense ? mkCell(8.5, 1.1, 0) : CELL;

  // ── VARIANTE « CARNET » ───────────────────────────────────────────────────
  //
  // Le carnet primaire MINEDUB encadre l'état civil : photo fusionnée sur les
  // trois lignes, nom en couleur d'accent sur fond blanc, et chaque ligne bordée
  // — au lieu de la bande pleine du secondaire.
  //
  // CE N'EST PAS QU'UNE QUESTION DE GOÛT. La bande pleine coûte une hauteur
  // fixe (photo 56 px + deux lignes de texte dans un bloc coloré) que le tableau
  // qui suit ne peut pas récupérer. Fusionner la photo sur les trois lignes de
  // l'état civil, c'est la même information dans la hauteur de ces trois
  // lignes — et c'est la disposition du modèle de référence.
  if (variant === 'carnet') {
    const photoH = dense ? 46 : 58;
    const libelle = { fontWeight: 'bold' };
    return (
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: vars ? 'var(--nc-gap)' : dense ? 2 : 4, tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: dense ? '8%' : '9%' }} />
          <col style={{ width: dense ? '52%' : '51%' }} />
          <col />
        </colgroup>
        <tbody>
          <tr>
            <td rowSpan={3} style={{ ...idCell, textAlign: 'center', verticalAlign: 'middle', padding: 2 }}>
              <BulletinPhoto src={student?.photo_url} width={photoH * 0.8} height={photoH} radius={2} />
            </td>
            <td style={{ ...idCell, fontSize: vars ? 'calc(var(--nc-head) * 1.15)' : dense ? '11pt' : '12.5pt', fontWeight: 'bold', color: accent, verticalAlign: 'middle' }}>
              {student?.name || ''}
            </td>
            <td style={{ ...idCell, background: tint, verticalAlign: 'middle', ...pcx }}>
              <span style={libelle}>{L(sys, 'Classe', 'Class', 'Clase')}</span> : <strong>{classTxt}</strong>
              {effectif != null ? <> · <span style={libelle}>{L(sys, 'Effectif', 'Class size', 'Total')}</span> : {effectif}</> : null}
            </td>
          </tr>
          <tr>
            <td style={{ ...idCell, background: tint, ...pcx }}>
              <span style={libelle}>{L(sys, 'Né(e) le', 'Born on', 'Nacido/a el')}</span> : {student?.date_naissance || '—'}
              {student?.lieu_naissance ? ` ${L(sys, 'à', 'in', 'en')} ${student.lieu_naissance}` : ''}
            </td>
            <td style={{ ...idCell, background: tint, ...pcx }}>
              <span style={libelle}>{L(sys, 'Genre', 'Gender', 'Género')}</span> : {genderLabel(student?.gender, sys)} · <span style={libelle}>{L(sys, 'Identifiant', 'ID', 'Identificador')}</span> : {student?.matricule || '—'}
            </td>
          </tr>
          <tr>
            <td style={idCell}>
              <span style={libelle}>{L(sys, 'Parents / Tuteurs', 'Parents / Guardians', 'Padres / Tutores')}</span> : {parents || '—'}{phone}
            </td>
            <td style={idCell}>
              <span style={libelle}>{L(sys, 'Redoublant', 'Repeater', 'Repetidor')}</span> : {L(sys, 'Oui', 'Yes', 'Sí')} <Chk on={redoublant} /> {L(sys, 'Non', 'No', 'No')} <Chk on={!redoublant} />
              {' · '}<span style={libelle}>{ppLbl}</span> : {profPrincipal || '—'}
            </td>
          </tr>
        </tbody>
      </table>
    );
  }

  return (
    <div style={{ marginBottom: dense ? 2 : 4 }}>
      {/* Bande colorée : photo + nom + classe */}
      <div style={{ display: 'flex', alignItems: 'center', gap: dense ? 7 : 10, background: accent, color: '#fff', borderRadius: '6px 6px 0 0', padding: dense ? '2px 8px' : '5px 10px', ...pcx }}>
        <div style={{ background: '#fff', borderRadius: 4, padding: dense ? 1 : 2, lineHeight: 0, flexShrink: 0 }}>
          <BulletinPhoto src={student?.photo_url} width={dense ? 34 : 46} height={dense ? 42 : 56} radius={2} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Ces deux tailles étaient les DERNIÈRES à rester figées sur une
              feuille qui demande `vars` : la recherche de densité tournait le
              bouton, et le nom de l'élève ne bougeait pas. Sans `vars`, rien
              ne change pour les gabarits qui n'ont pas pris le contrat. */}
          <div style={{ fontSize: vars ? 'calc(var(--nc-head) * 1.15)' : dense ? '11pt' : '13pt', fontWeight: 'bold', lineHeight: 1.1 }}>{student?.name || ''}</div>
          <div style={{ fontSize: vars ? 'var(--nc-body)' : dense ? '8.5pt' : '9pt', opacity: 0.95, lineHeight: 1.15 }}>
            {L(sys, 'Classe', 'Class', 'Clase')} : <strong>{classTxt}</strong>{effectif != null ? ` · ${L(sys, 'Effectif', 'Class size', 'Total')} : ${effectif}` : ''}
          </div>
        </div>
      </div>
      {/* Détails d'état civil (fond clair teinté) */}
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          <tr>
            <td style={{ ...idCell, background: tint, ...pcx }}>{L(sys, 'Né(e) le', 'Born on', 'Nacido/a el')} : {student?.date_naissance || ''} {student?.lieu_naissance ? `${L(sys, 'à', 'in', 'en')} ${student.lieu_naissance}` : ''}</td>
            <td style={{ ...idCell, background: tint, ...pcx }}>{L(sys, 'Genre', 'Gender', 'Género')} : {genderLabel(student?.gender, sys)} · {L(sys, 'Identifiant', 'ID', 'Identificador')} : {student?.matricule || ''}</td>
          </tr>
          <tr>
            <td style={idCell}>{L(sys, 'Parents / Tuteurs', 'Parents / Guardians', 'Padres / Tutores')} : {parents}{phone}</td>
            <td style={idCell}>{L(sys, 'Redoublant', 'Repeater', 'Repetidor')} : {L(sys, 'Oui', 'Yes', 'Sí')} <Chk on={redoublant} /> {L(sys, 'Non', 'No', 'No')} <Chk on={!redoublant} /> · {ppLbl} : {profPrincipal || ''}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ── Numéro de page (par ÉLÈVE) : « Page X sur Y » ─────────────────────────────
// Dernière ligne du document, donc dernière ligne à rester française sur un
// bulletin anglophone : elle suit le système de la classe comme tout le reste.
export function PageNumber({ n, total, sys, vars = false }) {
  if (!total) return null;
  return (
    <div className="apc-pagenum" style={{ textAlign: 'center', fontSize: vars ? 'var(--nc-small)' : '8.5pt', color: '#6b7280', marginTop: vars ? 'calc(var(--nc-gap) * 0.5)' : 5, paddingTop: 3, borderTop: '1px solid #e5e7eb' }}>
      {L(sys, `Page ${n} sur ${total}`, `Page ${n} of ${total}`, `Página ${n} de ${total}`)}
    </div>
  );
}

// ── Feuille A4 officielle = une page physique ─────────────────────────────────
// `dense` ajoute `apc-sheet-dense`, qui rend à la page le rembourrage VERTICAL
// de la feuille : `@page` fournit déjà 8 mm de marge, et les 4 px ajoutés en
// haut comme en bas s'empilaient par-dessus. C'est la marge du bas récupérée —
// la dernière, et celle qui ne coûte rien à personne.
export function OfficialSheet({ school, pageNo, total, pt = 10, sys, dense = false, vars = false, children }) {
  // `nc-densite` : la feuille déclare que sa BOÎTE appartient au socle
  // d'impression, et non à la feuille de style d'écran. Sans elle, la règle
  // `@media print { .apc-sheet { padding: 4px 7px !important } }` de
  // bulletin.css rendait la feuille 8 px plus haute et son contenu 14 px plus
  // étroit À L'IMPRESSION SEULEMENT : l'ajustement mesurait 1090 px et Chrome
  // paginait 1098 px, un intitulé repassait à la ligne, et le bas du bulletin
  // partait sur une 2e page. Les gabarits qui ne demandent pas `vars` gardent
  // cette règle — ils ne changent pas d'un pixel.
  return (
    <div
      className={`bulletin-paper apc-sheet${vars ? ' nc-densite' : ''}${dense ? ' apc-sheet-dense' : ''}`}
      style={{ position: 'relative', fontFamily: bulletinFontFamily(school), fontSize: vars ? 'var(--nc-body)' : `${pt}pt`, color: '#111' }}
    >
      <OfficialWatermark src={school?.logo_url} />
      <div style={{ position: 'relative', zIndex: 1 }}>
        {children}
        <PageNumber n={pageNo} total={total} sys={sys} vars={vars} />
      </div>
    </div>
  );
}

// ── Bloc de signatures à 3 colonnes (espacées pour signer) ────────────────────
// Parent/Tuteur · Professeur Principal · Chef d'établissement (avec signature +
// cachet). Partagé par tous les bulletins officiels — évite que les signatures
// soient collées les unes aux autres.
// `headLabel`/`teacherLabel` : surcharges optionnelles (ex. fondamental MINEDUB —
// « Le Directeur / La Directrice » et « L'Enseignant(e) » au lieu de Proviseur /
// Professeur Principal, propres au secondaire).
// `dense` : les trois cases restent, à une hauteur qui se signe encore. 92 px
// font 24 mm — généreux ; 58 px en font 15 mm, ce qui laisse la place d'une
// signature et d'un cachet. En dessous, on ne gagnerait plus des millimètres
// mais la possibilité de signer, et le bulletin ne vaudrait plus rien.
export function OfficialSignatures({ school, sys, profPrincipal, headLabel, teacherLabel, dense = false, vars = false }) {
  const chef   = headLabel    || (sys === 'EN' ? 'The Principal' : sys === 'ES' ? 'El Director' : "Le Chef d'établissement");
  const parent = sys === 'EN' ? 'Parent / Guardian' : sys === 'ES' ? 'Padre / Tutor' : 'Visa du Parent / Tuteur';
  const pp     = teacherLabel || (sys === 'EN' ? 'The Form Master' : sys === 'ES' ? 'El Tutor' : 'Le Professeur Principal');

  // 3 colonnes de largeur ET de hauteur identiques, chacune bordée (B). Titres
  // centrés, en gras ; taille et interligne uniformes (fidélité au modèle).
  // AVEC `vars`, LA HAUTEUR DU CADRE EST UNE ZONE LIBRE : c'est là que le
  // parent signe et que le reliquat de place va se loger (cf. `--nc-reliquat`
  // dans printStyles.js). Un cadre de signature plus grand n'est pas du vide :
  // c'est de la place pour écrire.
  const cell  = {
    ...(vars ? mkCellVar(1.2) : dense ? mkCell(9, 1.1, 0) : CELL),
    width: '33.33%', textAlign: 'center', verticalAlign: 'top',
    height: vars ? 'var(--nc-sign)' : dense ? 58 : 92,
    padding: vars ? 'var(--nc-pad-v) 6px' : dense ? '2px 4px 3px' : '4px 6px 6px',
  };
  const title = {
    fontWeight: 'bold',
    fontSize: vars ? 'var(--nc-body)' : dense ? '9pt' : '10pt',
    lineHeight: dense ? 1.15 : 1.25,
  };
  const name  = {
    color: '#666',
    fontSize: vars ? 'var(--nc-small)' : dense ? '8pt' : '9pt',
    lineHeight: 1.15, marginTop: 1,
  };
  // Neutralisation du fond blanc des scans (`mix-blend-mode:multiply` porté par
  // les classes .bulletin-*-img + print-color-adjust) : le tampon reste bleu et
  // parfaitement circulaire, la signature transparente. `objectFit:contain` +
  // largeur/hauteur cohérentes ⇒ aucune déformation ni étirement.
  const ink   = { objectFit: 'contain', background: 'transparent' };

  return (
    <table className="apc-keep" style={{ width: '100%', borderCollapse: 'collapse', marginTop: vars ? 'var(--nc-gap)' : dense ? 3 : 8 }}>
      <tbody>
        <tr>
          {/* Parent / Tuteur — espace de signature manuscrite (même hauteur) */}
          <td style={cell}>
            <div style={title}>{parent}</div>
          </td>

          {/* Professeur Principal — nom (grisé) centré sous le titre */}
          <td style={cell}>
            <div style={title}>{pp}</div>
            {profPrincipal ? <div style={name}>{profPrincipal}</div> : null}
          </td>

          {/* Chef d'établissement — signature scellée : tampon circulaire centré,
              légèrement descendu, signature superposée le traversant légèrement ;
              nom du chef centré en bas. Positionnement absolu MAÎTRISÉ (inline) qui
              neutralise le top/right/opacity de la classe .bulletin-stamp-img. */}
          <td style={cell}>
            <div style={title}>{chef}</div>
            {/* En dense, cette zone commande la hauteur de TOUTE la rangée : une
                case ramenée à 58 px que son tampon de 60 px repousserait à 60 ne
                ferait rien gagner. Tampon et signature suivent donc la même
                réduction, en gardant leurs proportions. */}
            <div style={{ position: 'relative', height: vars ? 'var(--nc-stamp)' : dense ? 36 : 60, maxWidth: 190, margin: '2px auto 0' }}>
              {school?.stamp_url && (
                <AssetImg
                  src={school.stamp_url}
                  alt=""
                  className="bulletin-stamp-img"
                  style={{
                    position: 'absolute', left: '50%', top: dense ? 2 : 8, right: 'auto',
                    transform: 'translateX(-50%)',
                    width: vars ? 'calc(var(--nc-stamp) * 0.92)' : dense ? 34 : 54,
                    height: vars ? 'calc(var(--nc-stamp) * 0.92)' : dense ? 34 : 54,
                    maxWidth: 'none', opacity: 0.95,
                    margin: 0, ...ink, zIndex: 1,
                  }}
                />
              )}
              {school?.signature_url && (
                <AssetImg
                  src={school.signature_url}
                  alt=""
                  className="bulletin-sig-img"
                  style={{
                    position: 'absolute', left: '50%', top: dense ? 0 : 2,
                    transform: 'translateX(-50%)',
                    height: vars ? 'calc(var(--nc-stamp) * 0.58)' : dense ? 22 : 34,
                    width: 'auto', maxWidth: dense ? 110 : 150,
                    margin: 0, ...ink, zIndex: 2,
                  }}
                />
              )}
            </div>
            <div style={{ ...name, color: '#111', marginTop: 2, minHeight: 12 }}>{school?.director || ''}</div>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

// ── Signature unique du chef d'établissement (conservée, repli) ───────────────
export function OfficialSignature({ school, sys }) {
  const lbl = sys === 'EN' ? 'The Principal' : sys === 'ES' ? 'El Director' : "Le Chef d'établissement";
  return (
    <table className="apc-keep" style={{ width: '100%', borderCollapse: 'collapse', marginTop: 12 }}>
      <tbody>
        <tr>
          <td style={{ width: '55%' }} />
          <td style={{ width: '45%', textAlign: 'center', verticalAlign: 'top', fontSize: '10pt' }}>
            <div style={{ fontWeight: 'bold' }}>{lbl}</div>
            {school?.signature_url
              ? <AssetImg src={school.signature_url} alt="" style={{ height: 34, display: 'block', margin: '2px auto', objectFit: 'contain' }} className="bulletin-sig-img" />
              : <div style={{ height: 30 }} />}
            {school?.stamp_url && (
              <AssetImg src={school.stamp_url} alt="" style={{ height: 48, display: 'block', margin: '-4px auto 2px', objectFit: 'contain' }} className="bulletin-stamp-img" />
            )}
            <div style={{ borderTop: '1px solid #94a3b8', marginTop: 2, paddingTop: 2, minHeight: 12 }}>{school?.director || ''}</div>
          </td>
        </tr>
      </tbody>
    </table>
  );
}
