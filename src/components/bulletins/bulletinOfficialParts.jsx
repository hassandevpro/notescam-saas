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
export function OfficialHeader({ school, sys, title, accent = '#1e3a5f', rounded = false, basic = false }) {
  const officials = bulletinOfficials(school, { basic, sys });
  const blocks    = officials?.blocks ?? [];
  const bilingual = officials?.bilingual && blocks.length > 1;
  const centerW   = bilingual ? '34%' : '50%';
  const sideW     = bilingual ? '33%' : '50%';
  const yearLbl   = sys === 'EN' ? 'Academic year' : sys === 'ES' ? 'Año escolar' : 'Année scolaire';

  const Block = ({ b }) => (
    <td style={{ width: sideW, textAlign: 'center', fontSize: '9pt', lineHeight: 1.3, padding: 2, verticalAlign: 'top' }}>
      <strong>{b.republic}</strong><br />
      {b.motto}<br />————————<br />
      {b.ministry}{b.lines.length > 0 && <br />}
      {b.lines.map((ln, i) => <span key={i}>{ln}{i < b.lines.length - 1 && <br />}</span>)}
      {b.establishment && (<><br /><strong>{b.establishment}</strong></>)}
    </td>
  );

  return (
    <>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 4 }}>
        <tbody>
          <tr>
            {blocks[0] && <Block b={blocks[0]} />}
            <td style={{ width: centerW, textAlign: 'center', padding: 2, verticalAlign: 'top' }}>
              {school?.logo_url && (
                <AssetImg src={school.logo_url} alt="" style={{ width: 56, height: 56, objectFit: 'contain', display: 'block', margin: '0 auto 2px' }} />
              )}
              <strong style={{ fontSize: '11pt', display: 'block' }}>{(school?.name || '').toUpperCase()}</strong>
              {(school?.address || school?.phone) && (
                <span style={{ fontSize: '8.5pt' }}>
                  {school?.address ? `B.P. ${school.address}` : ''}{school?.address && school?.phone ? ' · ' : ''}{school?.phone || ''}
                </span>
              )}
              <br />
              <span style={{ fontSize: '8.5pt' }}>{yearLbl} : <strong>{school?.current_year || '—'}</strong></span>
            </td>
            {bilingual && blocks[1] && <Block b={blocks[1]} />}
          </tr>
        </tbody>
      </table>
      {title && (
        <div className="apc-title-bar" style={{ background: accent, color: '#fff', textAlign: 'center', padding: '4px 8px', fontWeight: 'bold', fontSize: '13pt', letterSpacing: '.4px', marginBottom: 5, borderRadius: rounded ? 6 : 0 }}>
          {title}
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
export function OfficialIdentityBand({ student, classLabel, serieLabel, effectif, profPrincipal, ppLabel, sys, accent = '#1e3a5f', tint = '#eef2f7' }) {
  const redoublant = String(student?.statut || '').toLowerCase().includes('redoubl');
  const parents = [student?.nom_pere, student?.nom_mere, student?.tuteur].filter(Boolean).join(' · ');
  const phone = student?.parent_phone ? ` (${student.parent_phone})` : '';
  const classTxt = [classLabel, serieLabel].filter(Boolean).join(' · ');
  const pcx = { WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' };
  const ppLbl = ppLabel || L(sys, 'P. principal', 'Class teacher', 'Tutor');
  const Chk = ({ on }) => (
    <span style={{ display: 'inline-block', width: 9, height: 9, border: B, margin: '0 2px', verticalAlign: 'middle', background: on ? '#374151' : '#fff' }} />
  );
  return (
    <div style={{ marginBottom: 4 }}>
      {/* Bande colorée : photo + nom + classe */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: accent, color: '#fff', borderRadius: '6px 6px 0 0', padding: '5px 10px', ...pcx }}>
        <div style={{ background: '#fff', borderRadius: 4, padding: 2, lineHeight: 0, flexShrink: 0 }}>
          <BulletinPhoto src={student?.photo_url} width={46} height={56} radius={2} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '13pt', fontWeight: 'bold', lineHeight: 1.15 }}>{student?.name || ''}</div>
          <div style={{ fontSize: '9pt', opacity: 0.95 }}>
            {L(sys, 'Classe', 'Class', 'Clase')} : <strong>{classTxt}</strong>{effectif != null ? ` · ${L(sys, 'Effectif', 'Class size', 'Total')} : ${effectif}` : ''}
          </div>
        </div>
      </div>
      {/* Détails d'état civil (fond clair teinté) */}
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          <tr>
            <td style={{ ...CELL, background: tint, ...pcx }}>{L(sys, 'Né(e) le', 'Born on', 'Nacido/a el')} : {student?.date_naissance || ''} {student?.lieu_naissance ? `${L(sys, 'à', 'in', 'en')} ${student.lieu_naissance}` : ''}</td>
            <td style={{ ...CELL, background: tint, ...pcx }}>{L(sys, 'Genre', 'Gender', 'Género')} : {genderLabel(student?.gender, sys)} · {L(sys, 'Identifiant', 'ID', 'Identificador')} : {student?.matricule || ''}</td>
          </tr>
          <tr>
            <td style={CELL}>{L(sys, 'Parents / Tuteurs', 'Parents / Guardians', 'Padres / Tutores')} : {parents}{phone}</td>
            <td style={CELL}>{L(sys, 'Redoublant', 'Repeater', 'Repetidor')} : {L(sys, 'Oui', 'Yes', 'Sí')} <Chk on={redoublant} /> {L(sys, 'Non', 'No', 'No')} <Chk on={!redoublant} /> · {ppLbl} : {profPrincipal || ''}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ── Numéro de page (par ÉLÈVE) : « Page X sur Y » ─────────────────────────────
export function PageNumber({ n, total }) {
  if (!total) return null;
  return (
    <div className="apc-pagenum" style={{ textAlign: 'center', fontSize: '8.5pt', color: '#6b7280', marginTop: 5, paddingTop: 3, borderTop: '1px solid #e5e7eb' }}>
      Page {n} sur {total}
    </div>
  );
}

// ── Feuille A4 officielle = une page physique ─────────────────────────────────
export function OfficialSheet({ school, pageNo, total, pt = 10, children }) {
  return (
    <div className="bulletin-paper apc-sheet" style={{ position: 'relative', fontFamily: bulletinFontFamily(school), fontSize: `${pt}pt`, color: '#111' }}>
      <OfficialWatermark src={school?.logo_url} />
      <div style={{ position: 'relative', zIndex: 1 }}>
        {children}
        <PageNumber n={pageNo} total={total} />
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
export function OfficialSignatures({ school, sys, profPrincipal, headLabel, teacherLabel }) {
  const chef   = headLabel    || (sys === 'EN' ? 'The Principal' : sys === 'ES' ? 'El Director' : "Le Chef d'établissement");
  const parent = sys === 'EN' ? 'Parent / Guardian' : sys === 'ES' ? 'Padre / Tutor' : 'Visa du Parent / Tuteur';
  const pp     = teacherLabel || (sys === 'EN' ? 'The Form Master' : sys === 'ES' ? 'El Tutor' : 'Le Professeur Principal');

  // 3 colonnes de largeur ET de hauteur identiques, chacune bordée (B). Titres
  // centrés, en gras ; taille et interligne uniformes (fidélité au modèle).
  const cell  = { ...CELL, width: '33.33%', textAlign: 'center', verticalAlign: 'top', height: 92, padding: '4px 6px 6px' };
  const title = { fontWeight: 'bold', fontSize: '10pt', lineHeight: 1.25 };
  const name  = { color: '#666', fontSize: '9pt', lineHeight: 1.2, marginTop: 1 };
  // Neutralisation du fond blanc des scans (`mix-blend-mode:multiply` porté par
  // les classes .bulletin-*-img + print-color-adjust) : le tampon reste bleu et
  // parfaitement circulaire, la signature transparente. `objectFit:contain` +
  // largeur/hauteur cohérentes ⇒ aucune déformation ni étirement.
  const ink   = { objectFit: 'contain', background: 'transparent' };

  return (
    <table className="apc-keep" style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8 }}>
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
            <div style={{ position: 'relative', height: 60, maxWidth: 190, margin: '2px auto 0' }}>
              {school?.stamp_url && (
                <AssetImg
                  src={school.stamp_url}
                  alt=""
                  className="bulletin-stamp-img"
                  style={{
                    position: 'absolute', left: '50%', top: 8, right: 'auto',
                    transform: 'translateX(-50%)',
                    width: 54, height: 54, maxWidth: 'none', opacity: 0.95,
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
                    position: 'absolute', left: '50%', top: 2,
                    transform: 'translateX(-50%)',
                    height: 34, width: 'auto', maxWidth: 150,
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
