// Carte scolaire NotesCam — recto unique, design officiel camerounais.
// Reproduit fidèlement la maquette : bande latérale « COLLÈGE » + classe,
// armoiries + en-tête bilingue + logo/établissement/ville, bandeau type,
// photo · tableau d'infos · QR, barre année/validité, pied (tél, e-mail,
// signature + cachet). Le même composant sert à l'aperçu ET au PDF.
//
// Modèles (couleurs) : 'premium' (défaut) · 'classique' · 'bilingue' · 'minimaliste'.

import armsUrl from '../assets/cameroon-arms.png'; // sceau du Cameroun, fond détouré (transparent)
import { createDocumentScale } from '../lib/documentScale';

export const CARD_W = 660;
export const CARD_H = 416;

// ── Palette par modèle ──────────────────────────────────────────────────────
function colors(variant) {
  switch (variant) {
    case 'classique':
      return { navy: '#15235c', red: '#c1121f', gold: '#15235c', soft: '#eef1f8', ink: '#1f2937' };
    case 'bilingue':
      return { navy: '#0a5c43', red: '#c1121f', gold: '#caa14a', soft: '#eef5f1', ink: '#0a3d2e' };
    case 'minimaliste':
      return { navy: '#334155', red: '#9ca3af', gold: '#cbd5e1', soft: '#f1f5f9', ink: '#334155' };
    case 'premium':
    default:
      return { navy: '#15235c', red: '#c1121f', gold: '#c9a14a', soft: '#eef1f8', ink: '#1f2937' };
  }
}

// ── Helpers données ─────────────────────────────────────────────────────────
function splitYears(cur) {
  const m = String(cur || '').match(/(\d{4})\D+(\d{4})/);
  if (m) return { start: m[1], end: m[2] };
  const y = String(cur || '').match(/(\d{4})/);
  const s = y ? +y[1] : new Date().getFullYear();
  return { start: String(s), end: String(s + 1) };
}

function hash5(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < String(str).length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return String(h % 100000).padStart(5, '0');
}

// N° de carte façon « NCAM-2026-00154 ».
export function formatCardNumber(school, student) {
  const { start } = splitYears(school?.current_year);
  return `NCAM-${start}-${hash5(`${school?.id || ''}${student?.id || ''}`)}`;
}

function fmtDob(d) {
  if (!d) return '—';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return String(d);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(dt.getDate())} / ${p(dt.getMonth() + 1)} / ${dt.getFullYear()}`;
}

// ── Langue de la carte ──────────────────────────────────────────────────────
// lang = 'fr' (francophone) · 'en' (classe anglophone) · 'es' (Guinée Éq.) ·
//        'bi' (modèle bilingue, Cameroun).
// Pour les textes contraints sur une seule ligne (bandeau type, mentions, barre
// année, pied) le mode 'bi' retombe sur le français : l'en-tête national est
// déjà bilingue et les LABELS de champs portent l'anglais (cf. InfoRow).
function T(fr, en, lang, es) {
  if (lang === 'es') return es ?? en ?? fr;
  if (lang === 'en') return en;
  return fr; // 'fr' et 'bi'
}

function genderLabel(g, lang) {
  if (!g) return '—';
  const v = g.toLowerCase();
  const isM = v.startsWith('m');
  const isF = v.startsWith('f');
  if (!isM && !isF) return g.toUpperCase();
  const fr = isM ? 'MASCULIN' : 'FÉMININ';
  const en = isM ? 'MALE' : 'FEMALE';
  const es = isM ? 'MASCULINO' : 'FEMENINO';
  if (lang === 'es') return es;
  if (lang === 'en') return en;
  if (lang === 'bi') return `${fr} / ${en}`;
  return fr;
}

// Nature de l'établissement (public, laïc, confessionnel…). Clés = valeurs
// exactes stockées dans school.type (cf. SCHOOL_TYPES de Settings.jsx).
const SCHOOL_TYPE_LABELS = {
  'Public':           { fr: 'PUBLIC',           en: 'PUBLIC',            es: 'PÚBLICO' },
  'Privé Laïc':       { fr: 'PRIVÉ LAÏC',       en: 'PRIVATE SECULAR',   es: 'PRIVADO LAICO' },
  'Privé Catholique': { fr: 'PRIVÉ CATHOLIQUE', en: 'PRIVATE CATHOLIC',  es: 'PRIVADO CATÓLICO' },
  'Privé Protestant': { fr: 'PRIVÉ PROTESTANT', en: 'PRIVATE PROTESTANT',es: 'PRIVADO PROTESTANTE' },
  'Privé Islamique':  { fr: 'PRIVÉ ISLAMIQUE',  en: 'PRIVATE ISLAMIC',   es: 'PRIVADO ISLÁMICO' },
  'Communautaire':    { fr: 'COMMUNAUTAIRE',    en: 'COMMUNITY',         es: 'COMUNITARIO' },
  'Autre':            { fr: '',                 en: '',                  es: '' },
};

function establishmentLine(school, lang) {
  const raw   = (school?.type || '').trim();
  const entry = SCHOOL_TYPE_LABELS[raw];
  // Qualificatif dans la bonne langue ; repli : type libre en majuscules,
  // sinon « privé » par défaut. « Autre » (entry vide) → aucun qualificatif.
  const qual = entry
    ? (lang === 'es' ? entry.es : lang === 'en' ? entry.en : entry.fr)
    : (raw ? raw.toUpperCase() : (lang === 'es' ? 'PRIVADO' : lang === 'en' ? 'PRIVATE' : 'PRIVÉ'));

  if (lang === 'es') return qual ? `CENTRO ${qual} DE ENSEÑANZA GENERAL` : 'CENTRO DE ENSEÑANZA GENERAL';
  if (lang === 'en') return qual ? `${qual} INSTITUTION OF GENERAL EDUCATION` : 'INSTITUTION OF GENERAL EDUCATION';
  return qual ? `ÉTABLISSEMENT ${qual} D'ENSEIGNEMENT GÉNÉRAL` : "ÉTABLISSEMENT D'ENSEIGNEMENT GÉNÉRAL";
}

// Drapeau de la Guinée Équatoriale (SVG inline → rendu fiable en capture).
function GeFlag({ w = 58 }) {
  return (
    <svg width={w} height={w * (2 / 3)} viewBox="0 0 30 20" style={{ display: 'block', flexShrink: 0, borderRadius: 2, boxShadow: '0 0 0 1px rgba(0,0,0,0.12)' }}>
      <rect x="0" y="0"     width="30" height="6.67" fill="#3e9a00" />
      <rect x="0" y="6.67"  width="30" height="6.67" fill="#ffffff" />
      <rect x="0" y="13.33" width="30" height="6.67" fill="#e32118" />
      <polygon points="0,0 0,20 7,10" fill="#0073ce" />
    </svg>
  );
}

// ── Icônes (SVG inline, fiables en capture) ─────────────────────────────────
const I = {
  user: 'M12 12c2.2 0 4-1.8 4-4s-1.8-4-4-4-4 1.8-4 4 1.8 4 4 4zm0 2c-2.7 0-8 1.3-8 4v2h16v-2c0-2.7-5.3-4-8-4z',
  cap: 'M12 3 1 9l11 6 9-4.9V17h2V9L12 3zM5 13.2v3L12 20l7-3.8v-3L12 17l-7-3.8z',
  users: 'M16 11c1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 3-1.34 3-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5C15 14.17 10.33 13 8 13zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z',
  cal: 'M7 2v2H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2V2h-2v2H9V2H7zm12 7v10H5V9h14z',
  phone: 'M6.6 10.8c1.4 2.8 3.8 5.2 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.2.2 2.4.6 3.6.1.4 0 .8-.3 1l-2.2 2.2z',
  mail: 'M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm0 4v10h16V8l-8 5-8-5zm0-2 8 5 8-5H4z',
  shield: 'M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5l-8-3zm-1.2 13.4-3.2-3.2 1.4-1.4 1.8 1.8 4.2-4.2 1.4 1.4-5.6 5.6z',
};
function Ico({ d, size = 14, color }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill={color} style={{ display: 'block', flexShrink: 0 }}><path d={d} /></svg>;
}

// ── Cachet rond (repli si pas d'image téléversée) ───────────────────────────
function StampFallback({ city, red, size = 64, lang = 'fr' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{ display: 'block', opacity: 0.92 }}>
      <circle cx="50" cy="50" r="46" fill="none" stroke={red} strokeWidth="3" />
      <circle cx="50" cy="50" r="38" fill="none" stroke={red} strokeWidth="1.5" />
      <defs>
        <path id="stamp-top" d="M50 12 a38 38 0 0 1 0 76" />
        <path id="stamp-bot" d="M50 88 a38 38 0 0 1 0 -76" />
      </defs>
      <text fill={red} fontSize="9.5" fontWeight="700" letterSpacing="1">
        <textPath href="#stamp-top" startOffset="6%">{T("LE CHEF D'ÉTABLISSEMENT", 'THE PRINCIPAL', lang, 'EL DIRECTOR')}</textPath>
      </text>
      <text fill={red} fontSize="9.5" fontWeight="700" letterSpacing="2">
        <textPath href="#stamp-bot" startOffset="20%">{(city || '').toUpperCase()}</textPath>
      </text>
      <polygon points="50,40 52.5,47 60,47 54,51.5 56,59 50,54.5 44,59 46,51.5 40,47 47.5,47" fill={red} />
    </svg>
  );
}

// Ligne du tableau d'infos. `labelEn` (optionnel) : 2e ligne anglaise en mode
// bilingue, affichée plus petite sous le label français.
function InfoRow({ icon, label, labelEn, value, c, last }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: last ? 'none' : `1px dotted ${c.gold}` }}>
      <span style={{ width: 22, height: 22, borderRadius: 5, background: c.soft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Ico d={icon} size={13} color={c.navy} />
      </span>
      <span style={{ width: 96, flexShrink: 0, fontSize: 9, fontWeight: 700, letterSpacing: 0.4, color: '#8a93a6', textTransform: 'uppercase', lineHeight: 1.05 }}>
        <span style={{ display: 'block' }}>{label}</span>
        {labelEn && <span style={{ display: 'block', fontSize: 7.5, fontWeight: 600, color: '#aab2c0', fontStyle: 'italic' }}>{labelEn}</span>}
      </span>
      <span style={{ flex: 1, fontSize: 13, fontWeight: 800, color: c.navy, lineHeight: 1 }}>{value || '—'}</span>
    </div>
  );
}

/**
 * Carte scolaire unique. Props : student, school, className, cardId (QR payload),
 * qrSrc, countryCode, variant, classLang ('fr'|'en' selon le système de la
 * classe), palette (ignoré ici), innerRef.
 *
 * Langue effective :
 *   - modèle « bilingue »        → 'bi' (labels FR + EN, sexe bilingue)
 *   - classe anglophone (EN)     → 'en' (toute la carte en anglais)
 *   - sinon                      → 'fr'
 */
export default function IdCard({ student, school, className, qrSrc, variant = 'premium', classLang = 'fr', countryCode, innerRef }) {
  const c = colors(variant);
  // Dimensionnement intelligent (catégorie « compact » — carte). Aucune taille fixe.
  const scale = createDocumentScale({ docType: 'idcard', orientation: 'landscape', pageWidth: CARD_W, pageHeight: CARD_H });
  const isGE = countryCode === 'guinea_eq';
  // GE : espagnol, point. Cameroun : modèle bilingue, sinon langue de la classe.
  const lang = isGE
    ? 'es'
    : variant === 'bilingue'
    ? 'bi'
    : classLang === 'en'
    ? 'en'
    : 'fr';
  const { start, end } = splitYears(school?.current_year);
  const cardNo = formatCardNumber(school, student);
  const city = (school?.city || school?.region || '').toUpperCase();

  // Labels de champs. En mode 'bi', `en` s'affiche en 2e ligne (cf. InfoRow).
  const lbl = (fr, en, es) =>
    lang === 'es' ? { label: es ?? en } :
    lang === 'en' ? { label: en } :
    lang === 'bi' ? { label: fr, labelEn: en } :
    { label: fr };

  const photo = student?.photo_url
    ? <img src={student.photo_url} crossOrigin="anonymous" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
    : <svg viewBox="0 0 24 24" style={{ width: '60%', height: '60%' }} fill="#c4cbd8"><path d="M12 12c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm0 2c-3.33 0-10 1.67-10 5v3h20v-3c0-3.33-6.67-5-10-5z" /></svg>;

  return (
    <div
      ref={innerRef}
      style={{
        position: 'relative', width: CARD_W, height: CARD_H, background: '#ffffff',
        borderRadius: 18, overflow: 'hidden', fontFamily: "'Segoe UI', Arial, sans-serif",
        border: '1px solid #e5e7eb', boxShadow: '0 14px 34px rgba(0,0,0,0.18)', color: c.ink,
        WebkitFontSmoothing: 'antialiased',
      }}
    >
      {/* Filigrane guilloché (cercles concentriques) */}
      <svg width={CARD_W} height={CARD_H} style={{ position: 'absolute', inset: 0, opacity: 0.06, pointerEvents: 'none' }}>
        {Array.from({ length: 16 }).map((_, i) => (
          <circle key={i} cx={CARD_W * 0.62} cy={CARD_H * 0.5} r={18 + i * 16} fill="none" stroke={c.navy} strokeWidth="1" />
        ))}
      </svg>
      {/* Filigrane logo établissement */}
      {school?.logo_url && (
        <img src={school.logo_url} crossOrigin="anonymous" alt="" style={{ position: 'absolute', top: '52%', left: '60%', width: scale.watermark, height: scale.watermark, objectFit: 'contain', transform: 'translate(-50%,-50%)', opacity: scale.watermarkOpacity, pointerEvents: 'none' }} />
      )}

      {/* ── Bande latérale rouge ── */}
      <div style={{ position: 'absolute', left: 0, top: 0, width: 52, height: CARD_H, background: `linear-gradient(180deg, ${c.red}, #8f0d18)`, borderRadius: '18px 40% 40% 18px / 18px 50% 50% 18px', zIndex: 2 }} />

      {/* ── Contenu ── */}
      <div style={{ position: 'relative', zIndex: 1, height: CARD_H, paddingLeft: 60, display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>

        {/* En-tête */}
        <div style={{ height: 84, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px 4px', boxSizing: 'border-box' }}>
          {isGE
            ? <GeFlag w={scale.ministryLogo} />
            : <img src={armsUrl} crossOrigin="anonymous" alt="" style={{ width: scale.ministryLogo, height: scale.ministryLogo, objectFit: 'contain', flexShrink: 0 }} />}
          <div style={{ flex: 1, textAlign: 'center', lineHeight: 1.15 }}>
            {isGE ? (
              <>
                <div style={{ fontSize: 13, fontWeight: 800, color: c.navy }}>REPÚBLICA DE</div>
                <div style={{ fontSize: 13, fontWeight: 800, color: c.navy }}>GUINEA ECUATORIAL</div>
                <div style={{ fontSize: 9.5, fontStyle: 'italic', color: c.red, fontWeight: 600, marginTop: 3 }}>Unidad · Paz · Justicia</div>
                <div style={{ fontSize: 8, fontWeight: 700, color: c.navy, marginTop: 3 }}>MINISTERIO DE EDUCACIÓN</div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 12.5, fontWeight: 800, color: c.navy }}>RÉPUBLIQUE DU CAMEROUN</div>
                <div style={{ fontSize: 9, fontStyle: 'italic', color: c.red, fontWeight: 600 }}>Paix – Travail – Patrie</div>
                <div style={{ fontSize: 12.5, fontWeight: 800, color: c.navy, marginTop: 2 }}>REPUBLIC OF CAMEROON</div>
                <div style={{ fontSize: 9, fontStyle: 'italic', color: c.red, fontWeight: 600 }}>Peace – Work – Fatherland</div>
              </>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, maxWidth: 230 }}>
            {school?.logo_url && <img src={school.logo_url} crossOrigin="anonymous" alt="" style={{ width: scale.logoSm, height: scale.logoSm, objectFit: 'contain', flexShrink: 0 }} />}
            <div style={{ textAlign: 'center', minWidth: 0, flex: 1 }}>
              {/* Nom d'établissement borné : 3 lignes max, ellipsis et taille de
                  police réduite pour les noms très longs → l'en-tête (84px) ne
                  déborde JAMAIS et les autres blocs restent alignés. `title`
                  affiche le nom complet au survol. */}
              <div
                title={school?.name || ''}
                style={{
                  fontSize: (school?.name || '').length > 38 ? 11.5 : (school?.name || '').length > 26 ? 13 : 15,
                  fontWeight: 900, color: c.navy, lineHeight: 1.08,
                  display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical',
                  overflow: 'hidden', wordBreak: 'break-word',
                }}
              >
                {(school?.name || '').toUpperCase()}
              </div>
              {city && <div style={{ fontSize: 10, fontWeight: 700, color: c.navy, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{city}</div>}
            </div>
          </div>
        </div>

        {/* Bandeau type d'établissement */}
        <div style={{ height: 22, flexShrink: 0, boxSizing: 'border-box', margin: '0 16px', background: c.navy, color: '#fff', textAlign: 'center', fontSize: 9.5, fontWeight: 700, letterSpacing: 0.6, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', whiteSpace: 'nowrap', overflow: 'hidden' }}>
          {establishmentLine(school, lang)}
        </div>

        {/* Corps : photo · infos · QR */}
        <div style={{ flex: 1, minHeight: 0, boxSizing: 'border-box', display: 'flex', gap: 12, padding: '6px 16px', alignItems: 'center', overflow: 'hidden' }}>
          {/* photo */}
          <div style={{ width: 108, height: 132, borderRadius: 8, overflow: 'hidden', border: `3px solid ${c.navy}`, background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 3px 8px rgba(0,0,0,0.15)' }}>
            {photo}
          </div>
          {/* infos */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Nom de l'élève : taille adaptative + 2 lignes max (ellipsis) pour
                ne JAMAIS couper un nom long. `title` = nom complet au survol. */}
            <div
              title={student?.name || ''}
              style={{
                fontSize: (student?.name || '').length > 32 ? 15 : (student?.name || '').length > 22 ? 17.5 : 21,
                fontWeight: 900, color: c.navy, letterSpacing: 0.3, marginBottom: 6, lineHeight: 1.05,
                display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                overflow: 'hidden', wordBreak: 'break-word',
              }}
            >
              {(student?.name || '').toUpperCase()}
            </div>
            <InfoRow icon={I.user}  {...lbl('Matricule', 'Reg. No.', 'Matrícula')} value={student?.matricule} c={c} />
            <InfoRow icon={I.cap}   {...lbl('Classe', 'Class', 'Curso')}          value={className} c={c} />
            <InfoRow icon={I.users} {...lbl('Sexe', 'Sex', 'Sexo')}               value={genderLabel(student?.gender, lang)} c={c} />
            <InfoRow icon={I.cal}   {...lbl('Date de naissance', 'Date of birth', 'Fecha de nac.')} value={fmtDob(student?.date_naissance)} c={c} last />
          </div>
          {/* QR + n° carte */}
          <div style={{ width: 116, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 104, height: 104, background: '#fff', border: `2px solid ${c.gold}`, borderRadius: 8, padding: 5 }}>
              {qrSrc && <img src={qrSrc} alt="QR" style={{ width: '100%', height: '100%' }} />}
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 1, color: '#8a93a6' }}>{T('N° CARTE', 'CARD No.', lang, 'N.º CARNÉ')}</div>
              <div style={{ fontSize: 12.5, fontWeight: 900, color: c.red, letterSpacing: 0.3 }}>{cardNo}</div>
            </div>
          </div>
        </div>

        {/* Barre année + mentions + validité */}
        <div style={{ height: 48, flexShrink: 0, boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px', whiteSpace: 'nowrap' }}>
          <div style={{ background: c.navy, color: '#fff', borderRadius: 8, padding: '5px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Ico d={I.cal} size={18} color="#fff" />
            <div style={{ lineHeight: 1.1 }}>
              <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: 0.5, opacity: 0.85 }}>{T('ANNÉE SCOLAIRE', 'ACADEMIC YEAR', lang, 'AÑO ESCOLAR')}</div>
              <div style={{ fontSize: 13, fontWeight: 900 }}>{start} - {end}</div>
            </div>
          </div>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, color: '#6b7280' }}>
            <Ico d={I.shield} size={18} color={c.gold} />
            <div style={{ fontSize: 8.5, fontWeight: 600, lineHeight: 1.25 }}>
              {lang === 'es'
                ? <>ESTE CARNÉ ES ESTRICTAMENTE PERSONAL<br />DEBE PRESENTARSE A TODA REQUISICIÓN</>
                : lang === 'en'
                ? <>THIS CARD IS STRICTLY PERSONAL<br />IT MUST BE PRESENTED ON REQUEST</>
                : <>CETTE CARTE EST STRICTEMENT PERSONNELLE<br />ELLE DOIT ÊTRE PRÉSENTÉE À TOUTE RÉQUISITION</>}
            </div>
          </div>
          <div style={{ fontSize: 9, fontWeight: 700, color: c.navy, lineHeight: 1.5 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Ico d={I.cal} size={12} color={c.navy} /> {T('ÉMISE LE', 'ISSUED', lang, 'EMITIDO EL')} : <span style={{ color: c.ink }}>01 / 09 / {start}</span></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Ico d={I.cal} size={12} color={c.navy} /> {T('EXPIRE LE', 'EXPIRES', lang, 'CADUCA EL')} : <span style={{ color: c.ink }}>31 / 07 / {end}</span></div>
          </div>
        </div>

        {/* Pied : téléphone · e-mail · signature + cachet */}
        <div style={{ height: 70, flexShrink: 0, boxSizing: 'border-box', borderTop: `1px solid ${c.soft}`, padding: '6px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ width: 24, height: 24, borderRadius: '50%', background: c.red, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Ico d={I.phone} size={13} color="#fff" /></span>
            <div style={{ lineHeight: 1.15 }}>
              <div style={{ fontSize: 8, fontWeight: 700, color: '#8a93a6', letterSpacing: 0.5 }}>{T('TÉLÉPHONE', 'PHONE', lang, 'TELÉFONO')}</div>
              <div style={{ fontSize: 11, fontWeight: 800, color: c.navy }}>{school?.phone || '—'}</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, flex: 1, minWidth: 0 }}>
            <span style={{ width: 24, height: 24, borderRadius: '50%', background: c.red, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Ico d={I.mail} size={13} color="#fff" /></span>
            <div style={{ lineHeight: 1.15, minWidth: 0 }}>
              <div style={{ fontSize: 8, fontWeight: 700, color: '#8a93a6', letterSpacing: 0.5 }}>E-MAIL</div>
              <div style={{ fontSize: 11, fontWeight: 800, color: c.navy, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{school?.email || '—'}</div>
            </div>
          </div>
          <div style={{ textAlign: 'center', position: 'relative', minWidth: 150 }}>
            <div style={{ fontSize: 8.5, fontWeight: 700, color: '#6b7280', letterSpacing: 0.4, lineHeight: 1 }}>{T("LE CHEF D'ÉTABLISSEMENT", 'THE PRINCIPAL', lang, 'EL DIRECTOR')}</div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, height: 44 }}>
              {school?.signature_url
                ? <img src={school.signature_url} crossOrigin="anonymous" alt="" style={{ height: scale.signatureHeight, objectFit: 'contain', mixBlendMode: 'multiply' }} />
                : <span style={{ width: 64 }} />}
              {school?.stamp_url
                ? <img src={school.stamp_url} crossOrigin="anonymous" alt="" style={{ height: scale.stamp, objectFit: 'contain', mixBlendMode: 'multiply' }} />
                : <StampFallback city={city} red={c.red} size={scale.stamp} lang={lang} />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
