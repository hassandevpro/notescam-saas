// Diplôme d'honneur NotesCam — PAYSAGE UNIQUEMENT.
//
// Reproduction fidèle de la maquette de référence « Diplôme d'Excellence » :
// en-tête bilingue 3 colonnes (République / sceau + établissement / Republic),
// puis bloc central CENTRÉ VERTICALEMENT avec grandes marges respirantes dans
// l'ordre strict : 1) Titre monumental, 2) Nom de l'élève (cursive dorée),
// 3) Texte de félicitations, 4) Statistiques (Classe / Moyenne / Rang / Mention),
// 5) Médaillon d'excellence ; pied avec 2 grandes signatures au-dessus de leurs
// lignes, proches de sceaux dorés, et la rosette au centre. Lauriers d'angle.
//
// Rendu par le MÊME moteur PDF que la carte scolaire (html-to-image → jsPDF).
// Aucun élément de badge d'identification. Tampons/logos sans fond blanc.

import { bulletinOfficials } from '../countries';
import { createDocumentScale } from '../lib/documentScale';
import { DocumentWatermark, DocumentLogo, DocumentStamp } from './DocumentAssets';

// A4 PAYSAGE (297×210 mm) en pixels — base haute résolution.
export const AWARD_W = 1273;
export const AWARD_H = 900;

// Paysage uniquement : la taille ne dépend plus de l'orientation.
export function awardSize() {
  return { w: AWARD_W, h: AWARD_H };
}

const GOLD = '#c8a24c';
const GOLD_DK = '#a07b2a';
const NAVY = '#16235b';

const VARIANTS = {
  honneur:      { navy: NAVY,      title: { fr: "DIPLÔME D'HONNEUR", en: 'DIPLOMA OF HONOUR', es: 'DIPLOMA DE HONOR' } },
  excellence:   { navy: NAVY,      title: { fr: "DIPLÔME D'EXCELLENCE", en: 'DIPLOMA OF EXCELLENCE', es: 'DIPLOMA DE EXCELENCIA' } },
  major:        { navy: '#7a3b0a', title: { fr: 'DIPLÔME DU MAJOR', en: 'TOP OF THE CLASS', es: 'DIPLOMA DEL PRIMERO' } },
  felicitations:{ navy: '#7a1322', title: { fr: 'DIPLÔME DE FÉLICITATIONS', en: 'DIPLOMA OF CONGRATULATIONS', es: 'DIPLOMA DE FELICITACIÓN' } },
  filles:       { navy: '#7a1448', title: { fr: 'MEILLEURE ÉLÈVE', en: 'TOP GIRL', es: 'MEJOR ALUMNA' } },
  garcons:      { navy: '#0c3a63', title: { fr: 'MEILLEUR ÉLÈVE', en: 'TOP BOY', es: 'MEJOR ALUMNO' } },
  meritants:    { navy: '#13502b', title: { fr: 'DIPLÔME DU MÉRITE', en: 'MERIT DIPLOMA', es: 'DIPLOMA AL MÉRITO' } },
  disciplines:  { navy: '#3f2d70', title: { fr: 'DIPLÔME DE DISCIPLINE', en: 'DISCIPLINE DIPLOMA', es: 'DIPLOMA DE DISCIPLINA' } },
  distinctions: { navy: NAVY,      title: { fr: "DIPLÔME D'HONNEUR", en: 'DIPLOMA OF HONOUR', es: 'DIPLOMA DE HONOR' } },
};

export function awardStyleFromTemplate(tpl = {}) {
  const n = (tpl.name || '').toLowerCase();
  const p = tpl.personalization || {};
  let key = 'excellence';
  if (tpl.filters?.gender === 'F' || n.includes('fille')) key = 'filles';
  else if (tpl.filters?.gender === 'M' || n.includes('garçon') || n.includes('garcon')) key = 'garcons';
  else if (n.includes('major') || tpl.filters?.maxRank === 1) key = 'major';
  else if (n.includes('excell')) key = 'excellence';
  else if (n.includes('félic') || n.includes('felic')) key = 'felicitations';
  else if (n.includes('mérit') || n.includes('merit')) key = 'meritants';
  else if (n.includes('disciplin')) key = 'disciplines';
  else if (n.includes('honneur') || n.includes('honour') || n.includes('honor')) key = 'honneur';
  const v = VARIANTS[key] || VARIANTS.excellence;
  return {
    key,
    navy: p.primaryColor || v.navy,
    title: v.title,
    customTitle: p.title && !/tableau|nouveau/i.test(p.title) ? p.title : '',
    introText: p.introText || '',
    congratsText: p.congratsText || '',
    specialMention: p.specialMention || '',
    place: p.place || '',
  };
}

function L(fr, en, es, lang) {
  if (lang === 'es') return es ?? en ?? fr;
  if (lang === 'en') return en ?? fr;
  return fr;
}

function splitYears(cur) {
  const m = String(cur || '').match(/(\d{4})\D+(\d{4})/);
  if (m) return `${m[1]} - ${m[2]}`;
  const y = String(cur || '').match(/(\d{4})/);
  const s = y ? +y[1] : new Date().getFullYear();
  return `${s} - ${s + 1}`;
}

function estLine(school, lang) {
  const raw = (school?.type || '').trim();
  const qual = raw ? raw.toUpperCase() : (lang === 'es' ? 'PRIVADO' : lang === 'en' ? 'PRIVATE' : 'PRIVÉ');
  if (lang === 'es') return `CENTRO ${qual} DE ENSEÑANZA GENERAL`;
  if (lang === 'en') return `${qual} INSTITUTION OF GENERAL EDUCATION`;
  return `ÉTABLISSEMENT ${qual} D'ENSEIGNEMENT GÉNÉRAL`;
}

// ── Branche de laurier (échantillonnage d'une courbe de Bézier) ──────────────
function Laurel({ size = 120, color = GOLD, rotate = 0, flip = false, style }) {
  const p0 = [16, 96], p1 = [2, 44], p2 = [52, 6];
  const N = 7;
  const leaves = [];
  for (let i = 1; i <= N; i++) {
    const tt = i / (N + 1);
    const x = (1 - tt) ** 2 * p0[0] + 2 * (1 - tt) * tt * p1[0] + tt ** 2 * p2[0];
    const y = (1 - tt) ** 2 * p0[1] + 2 * (1 - tt) * tt * p1[1] + tt ** 2 * p2[1];
    const dx = 2 * (1 - tt) * (p1[0] - p0[0]) + 2 * tt * (p2[0] - p1[0]);
    const dy = 2 * (1 - tt) * (p1[1] - p0[1]) + 2 * tt * (p2[1] - p1[1]);
    const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
    leaves.push({ x, y, ang, s: 1 - tt * 0.4 });
  }
  return (
    <svg width={size} height={size} viewBox="0 0 70 100" style={{ transform: `rotate(${rotate}deg) scaleX(${flip ? -1 : 1})`, ...style }}>
      <path d={`M${p0[0]},${p0[1]} Q${p1[0]},${p1[1]} ${p2[0]},${p2[1]}`} stroke={color} strokeWidth="1.6" fill="none" />
      {leaves.map((p, i) => (
        <g key={i} transform={`translate(${p.x},${p.y}) rotate(${p.ang})`}>
          <ellipse cx="0" cy="-6.5" rx={8 * p.s} ry={3.1 * p.s} fill={color} transform="rotate(-22)" />
          <ellipse cx="0" cy="6.5" rx={8 * p.s} ry={3.1 * p.s} fill={color} transform="rotate(22)" />
        </g>
      ))}
    </svg>
  );
}

// ── Sceau doré décoratif (anneaux + étoile) — aucun fond blanc ───────────────
function GoldSeal({ size = 64 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      <circle cx="50" cy="50" r="46" fill="none" stroke={GOLD_DK} strokeWidth="3" />
      <circle cx="50" cy="50" r="39" fill="none" stroke={GOLD} strokeWidth="5" />
      <circle cx="50" cy="50" r="31" fill="none" stroke={GOLD_DK} strokeWidth="1.5" />
      {Array.from({ length: 24 }).map((_, i) => {
        const a = (i / 24) * Math.PI * 2;
        return <circle key={i} cx={50 + Math.cos(a) * 43} cy={50 + Math.sin(a) * 43} r="1.3" fill={GOLD_DK} />;
      })}
      <polygon points="50,30 55,45 71,45 58,55 63,71 50,61 37,71 42,55 29,45 45,45" fill={GOLD} />
    </svg>
  );
}

// ── Pastille d'icône dorée (au-dessus des statistiques) ──────────────────────
const PILL_ICONS = {
  cap:   'M12 3 1 9l11 6 9-4.9V17h2V9L12 3zM5 13.2v3L12 20l7-3.8v-3L12 17l-7-3.8z',
  chart: 'M4 20h16v-2H4v2zM6 16h3V8H6v8zm5 0h3V4h-3v12zm5 0h3v-6h-3v6z',
  medal: 'M12 2a5 5 0 1 0 0 10A5 5 0 0 0 12 2zm-3 11-2 8 5-3 5 3-2-8a6.9 6.9 0 0 1-6 0z',
  star:  'M12 2l3 6.5 7 .7-5.3 4.7 1.6 6.9L12 17.8 5.7 20.8l1.6-6.9L2 9.2l7-.7L12 2z',
};
function BadgeIcon({ icon, size = 30 }) {
  return (
    <span style={{ width: size, height: size, borderRadius: '50%', background: `linear-gradient(145deg, ${GOLD}, ${GOLD_DK})`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 5px rgba(0,0,0,0.18)', border: '1.5px solid #fff' }}>
      <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24" fill="#fff"><path d={PILL_ICONS[icon]} /></svg>
    </span>
  );
}

// ── Rosette « Excellence » (médaillon + rubans) ──────────────────────────────
function Rosette({ navy, lang, size = 92 }) {
  return (
    <svg width={size} height={size * (128 / 96)} viewBox="0 0 96 128">
      <polygon points="40,70 24,124 48,108 48,74" fill={navy} />
      <polygon points="56,70 72,124 48,108 48,74" fill={GOLD_DK} />
      <circle cx="48" cy="46" r="36" fill={navy} stroke={GOLD} strokeWidth="3.5" />
      <circle cx="48" cy="46" r="28" fill="none" stroke={GOLD} strokeWidth="1.2" />
      <text x="48" y="38" textAnchor="middle" fill={GOLD} fontSize="9" fontWeight="800" letterSpacing="0.5" fontFamily="Arial">{L('EXCELLENCE', 'EXCELLENCE', 'EXCELENCIA', lang)}</text>
      <text x="48" y="49" textAnchor="middle" fill="#fff" fontSize="8" fontWeight="700" fontFamily="Arial">{L('DIPLÔME', 'DIPLOMA', 'DIPLOMA', lang)}</text>
      <text x="48" y="60" textAnchor="middle" fill={GOLD} fontSize="8" fontWeight="700" letterSpacing="1" fontFamily="Arial">{L('PRESTIGE', 'PRESTIGE', 'PRESTIGIO', lang)}</text>
    </svg>
  );
}

function OfficialBlock({ b }) {
  if (!b) return <td style={{ width: '30%' }} />;
  return (
    <td style={{ width: '30%', verticalAlign: 'top', textAlign: 'center', fontSize: 9, lineHeight: 1.45, color: '#374151' }}>
      <div style={{ fontWeight: 800, color: NAVY, fontSize: 9.5 }}>{b.republic}</div>
      <div style={{ fontStyle: 'italic', fontSize: 8.5 }}>{b.motto}</div>
      <div style={{ color: GOLD_DK }}>————</div>
      <div style={{ fontWeight: 700, fontSize: 8.5 }}>{b.ministry}</div>
      {b.lines?.map((l, i) => <div key={i} style={{ fontSize: 8 }}>{l}</div>)}
      {b.establishment && <div style={{ fontSize: 8, fontWeight: 700 }}>{b.establishment}</div>}
    </td>
  );
}

// ── Colonne de signature (grande signature au-dessus de la ligne + sceau) ─────
function SignatureColumn({ label, signatureUrl, stampUrl, navy, sigH, sealSize, width }) {
  return (
    <div style={{ position: 'relative', width, textAlign: 'center' }}>
      {/* Sceau doré (ou tampon réel transparent) proche de la signature */}
      <div style={{ position: 'absolute', left: '50%', top: -sealSize * 0.18, transform: `translateX(${-width * 0.34}px)`, opacity: 0.95, pointerEvents: 'none' }}>
        {stampUrl
          ? <DocumentStamp url={stampUrl} size={sealSize} fallback={<GoldSeal size={sealSize} />} />
          : <GoldSeal size={sealSize} />}
      </div>
      {/* Signature manuscrite, juste au-dessus de la ligne */}
      <div style={{ height: sigH, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', position: 'relative', zIndex: 1 }}>
        {signatureUrl && <img src={signatureUrl} crossOrigin="anonymous" alt="" style={{ height: sigH, objectFit: 'contain', mixBlendMode: 'multiply' }} />}
      </div>
      <div style={{ borderTop: `1.5px solid ${navy}`, marginTop: 2, paddingTop: 5, fontSize: 13, fontWeight: 700, fontStyle: 'italic', color: navy, position: 'relative', zIndex: 1 }}>{label}</div>
    </div>
  );
}

/**
 * Diplôme paysage. Props : award (ligne élève), school, style, countryCode, year, innerRef.
 */
export default function HonorAward({ award = {}, school = {}, style, countryCode, year, innerRef }) {
  const v = style || awardStyleFromTemplate({});
  const W = AWARD_W, H = AWARD_H;
  const navy = v.navy;
  const isGE = countryCode === 'guinea_eq';
  const lang = isGE ? 'es' : award.sys === 'EN' ? 'en' : 'fr';

  // Filigrane discret (catégorie prestige, opacité 0.03–0.06).
  const scale = createDocumentScale({ docType: 'diploma', orientation: 'landscape', pageWidth: W, pageHeight: H });

  const officials = bulletinOfficials(school);
  const blocks = officials?.blocks || [];

  const title = v.customTitle || L(v.title.fr, v.title.en, v.title.es, lang);
  const rank = award.rank || award.rankInClass || null;
  const rankStr = award.rankLabel
    ? `${award.rankLabel}${award.classSize ? ` / ${award.classSize}` : ''}`
    : rank ? `${rank}${award.classSize ? ` / ${award.classSize}` : ''}` : '—';
  const place = v.place || school?.region || school?.division || school?.city || '';
  const today = new Date().toLocaleDateString(lang === 'en' ? 'en-GB' : lang === 'es' ? 'es-ES' : 'fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

  const intro = v.introText || L('décerné à', 'awarded to', 'otorgado a', lang);
  const congrats = v.congratsText || L(
    'En reconnaissance de ses résultats exceptionnels, de son travail assidu et de son engagement tout au long de l\'année scolaire.',
    'In recognition of outstanding results, diligent work and dedication throughout the school year.',
    'En reconocimiento de sus excelentes resultados, su trabajo y su dedicación durante todo el año escolar.',
    lang,
  );

  const INFO = [
    { icon: 'cap',   label: L('Classe', 'Class', 'Clase', lang),             value: award.className || '—' },
    { icon: 'chart', label: L('Moyenne générale', 'Average', 'Media', lang), value: award.avg != null ? `${award.avg} / ${award.scaleMax}` : '—' },
    { icon: 'medal', label: L('Rang', 'Rank', 'Puesto', lang),              value: rankStr },
    { icon: 'star',  label: L('Mention', 'Remark', 'Mención', lang),         value: (award.mention || '—').toUpperCase() },
  ];

  // Dimensions proportionnelles à la largeur de page (aucune taille fixe).
  const titleSize = Math.round(W * 0.056);   // ~71 — monumental
  const nameSize  = Math.round(W * 0.046);   // ~59 — 2e élément le plus fort
  const titleLaurel = Math.round(W * 0.052);
  const cornerLaurel = Math.round(W * 0.085);
  const badge = Math.round(W * 0.024);
  const statValue = Math.round(W * 0.0145);
  const rosette = Math.round(W * 0.072);
  const sigH = Math.round(H * 0.07);         // signatures « beaucoup plus grandes »
  const seal = Math.round(W * 0.055);
  const colW = Math.round(W * 0.26);

  return (
    <div
      ref={innerRef}
      style={{
        position: 'relative', width: W, height: H, background: '#fffdf8',
        fontFamily: "'Segoe UI', Arial, sans-serif", color: '#1f2937', boxSizing: 'border-box',
        WebkitFontSmoothing: 'antialiased', overflow: 'hidden',
      }}
    >
      {/* Bordures ornementales (navy épais + or fin) */}
      <div style={{ position: 'absolute', inset: 14, border: `7px solid ${navy}`, borderRadius: 8 }} />
      <div style={{ position: 'absolute', inset: 26, border: `2px solid ${GOLD}`, borderRadius: 5 }} />

      {/* Filigrane central discret (logo établissement) */}
      <DocumentWatermark url={school?.logo_url} scale={scale} />

      {/* Lauriers d'angle */}
      <Laurel size={cornerLaurel} color={GOLD} rotate={0}   flip={false} style={{ position: 'absolute', left: 30,  bottom: 30 }} />
      <Laurel size={cornerLaurel} color={GOLD} rotate={0}   flip       style={{ position: 'absolute', right: 30, bottom: 30 }} />
      <Laurel size={cornerLaurel} color={GOLD} rotate={180} flip       style={{ position: 'absolute', left: 30,  top: 30 }} />
      <Laurel size={cornerLaurel} color={GOLD} rotate={180} flip={false} style={{ position: 'absolute', right: 30, top: 30 }} />

      {/* Contenu : en-tête (haut) · bloc central (centré vertical) · pied (bas) */}
      <div style={{ position: 'relative', zIndex: 1, height: '100%', boxSizing: 'border-box', padding: '40px 80px 36px', display: 'flex', flexDirection: 'column' }}>

        {/* En-tête bilingue 3 colonnes */}
        <table style={{ width: '100%', borderCollapse: 'collapse', flexShrink: 0 }}>
          <tbody>
            <tr>
              <OfficialBlock b={blocks[0]} />
              <td style={{ width: '40%', textAlign: 'center', verticalAlign: 'top' }}>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 2 }}>
                  <DocumentLogo url={school?.logo_url} scale={scale} kind="school-sm" />
                </div>
                <div style={{ fontSize: 20, fontWeight: 900, color: GOLD_DK, letterSpacing: 0.5, lineHeight: 1.05 }}>{(school?.name || '').toUpperCase()}</div>
                <div style={{ fontSize: 8.5, fontWeight: 700, color: navy, marginTop: 2 }}>{estLine(school, lang)}</div>
                <div style={{ fontSize: 9, color: '#475569', marginTop: 2 }}>{L('Année scolaire', 'Academic year', 'Año escolar', lang)} : <strong>{splitYears(year || school?.current_year)}</strong></div>
              </td>
              <OfficialBlock b={blocks[1]} />
            </tr>
          </tbody>
        </table>

        {/* ── BLOC CENTRAL — centré verticalement, marges respirantes ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>

          {/* 1) Titre monumental encadré de lauriers */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
            <Laurel size={titleLaurel} color={GOLD} rotate={64} flip />
            <div style={{ fontFamily: "'Georgia', 'Times New Roman', serif", fontSize: titleSize, fontWeight: 800, color: navy, letterSpacing: 2, lineHeight: 1, textShadow: '0 1px 0 rgba(0,0,0,0.06)', whiteSpace: 'nowrap' }}>{title}</div>
            <Laurel size={titleLaurel} color={GOLD} rotate={-64} />
          </div>

          {/* 2) Nom de l'élève (cursive dorée) */}
          <div style={{ fontSize: 14, fontStyle: 'italic', color: '#64748b', marginTop: 22 }}>{intro}</div>
          <div style={{ fontFamily: "'Gabriola', 'Lucida Calligraphy', 'Edwardian Script ITC', 'Palace Script MT', 'Segoe Script', cursive", fontSize: nameSize, fontWeight: 600, color: GOLD_DK, lineHeight: 1.15, marginTop: 6 }}>{award?.name || ''}</div>
          <div style={{ width: 380, height: 1.5, background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)`, marginTop: 6 }} />

          {/* 3) Texte de félicitations */}
          <div style={{ textAlign: 'center', fontSize: 14, color: '#334155', lineHeight: 1.55, maxWidth: 800, marginTop: 20 }}>{congrats}</div>

          {/* 4) Statistiques (séparateurs verticaux fins) */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 30 }}>
            {INFO.map((it, i) => (
              <div key={it.label} style={{ display: 'flex', alignItems: 'center' }}>
                {i > 0 && <div style={{ width: 1, height: 52, background: `${GOLD}66`, margin: '0 30px' }} />}
                <div style={{ textAlign: 'center', minWidth: 120 }}>
                  <div style={{ display: 'flex', justifyContent: 'center' }}><BadgeIcon icon={it.icon} size={badge} /></div>
                  <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1, color: GOLD_DK, textTransform: 'uppercase', marginTop: 7 }}>{it.label}</div>
                  <div style={{ fontSize: statValue, fontWeight: 900, color: navy, marginTop: 3 }}>{it.value}</div>
                </div>
              </div>
            ))}
          </div>

          {v.specialMention && (
            <div style={{ textAlign: 'center', fontSize: 12, color: GOLD_DK, fontWeight: 700, marginTop: 14 }}>🏆 {v.specialMention}</div>
          )}
        </div>

        {/* ── PIED : signatures (G/D) + médaillon excellence (centre) ── */}
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 }}>
          <SignatureColumn
            label={L("Le Chef d'Établissement", 'The Principal', 'El Director', lang)}
            signatureUrl={school?.signature_url} stampUrl={school?.stamp_url}
            navy={navy} sigH={sigH} sealSize={seal} width={colW}
          />
          {/* 5) Médaillon d'excellence */}
          <div style={{ textAlign: 'center', flexShrink: 0 }}>
            <Rosette navy={navy} lang={lang} size={rosette} />
            <div style={{ fontSize: 9, color: '#94a3b8', marginTop: -4 }}>{L('Fait à', 'Done at', 'Hecho en', lang)} {place || '—'}, {L('le', 'on', 'el', lang)} {today}</div>
          </div>
          <SignatureColumn
            label={L('Le Proviseur / Directeur', 'The Principal', 'El Director', lang)}
            signatureUrl={school?.director_signature_url || school?.signature_url} stampUrl={null}
            navy={navy} sigH={sigH} sealSize={seal} width={colW}
          />
        </div>
      </div>
    </div>
  );
}
