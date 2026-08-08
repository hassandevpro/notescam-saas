import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useAuthStore } from '../store/authStore';
import { useSchoolStore } from '../store/schoolStore';
import { useUiStore } from '../store/uiStore';
import { usePlan, getStarterPrintRemaining, incrementDailyPrint, STARTER_DAILY_PRINT_LIMIT } from '../lib/plan';
import {
  getAvg, frApp, enGrade, getAppreciation, buildRanks, clsStat, resolveScores,
} from '../core/bulletinEngine';
import Layout from '../components/Layout';
import Modal from '../components/Modal';
import AssetImg from '../components/AssetImg';
import '../styles/bulletin.css';
import { useT } from '../lib/i18n';
import BulletinPhoto from '../components/bulletins/BulletinPhoto';
import BoletinGE from '../components/bulletins/BoletinGE';
import BoletinGEDetalle from '../components/bulletins/BoletinGEDetalle';
import BulletinTheme from '../components/bulletins/BulletinTheme';
import BulletinApcOfficial from '../components/bulletins/BulletinApcOfficial';
import BulletinApcAnnual from '../components/bulletins/BulletinApcAnnual';
import BulletinScOfficial from '../components/bulletins/BulletinScOfficial';
import BulletinPrimAnnualUA from '../components/bulletins/BulletinPrimAnnualUA';
import BulletinMatOfficial from '../components/bulletins/BulletinMatOfficial';
import { mkCell, mkTH, OfficialHeader, OfficialIdentity, OfficialSignatures, OfficialSheet } from '../components/bulletins/bulletinOfficialParts';
import { resolveClassEngine, firstCycleClasseSlug, secondCycleClasseSlug, primaireNiveauSlug, maternelleNiveauSlug, SECTIONS, classSectionKey } from '../core/engineResolver';
import { classIdentity } from '../lib/schoolIdentity';
import {
  competencesForNiveau, bulletinRows as primBulletinRows, generalAverage as primGeneralAverage,
  primCote, buildPrimRanks, PRIM_COTE_DEFAULT, criteresForCompetence, competencePointsTotal, UA_PAR_TRIMESTRE, trimestreOfUA,
} from '../core/primEngine';
import { domainesForMaternelle } from '../core/matEngine';
import { obsNkey } from '../lib/matService';
import { primNkey } from '../lib/primService';
import { assemblePeriod, assembleApcAnnual } from '../lib/apcBulletinDoc';
import { buildApcRanks, sequencesOfTrimestre, SEQ_TO_TRIM } from '../core/apcEngine';
import { assembleScBulletin, scDisciplineConseil, matieresForSerieClasse } from '../core/scEngine';
import { perSubjectRanksAndStats, classProfile } from '../lib/scBulletinPdf';
import { teacherByMatiere as teacherByMatiereMap, teacherIndexById, normName } from '../lib/teacherNames';
import { resolveCountryCode, bulletinOfficials } from '../countries';
import { gradingOpts, geGradeMax } from '../lib/useCountry';
import { bulletinFontFamily } from '../lib/schoolTheme';
import { buildCardId, qrDataUrl } from '../lib/idCardService';

// QR de bulletin : même payload que la carte scolaire (buildCardId) → le même
// scanner identifie l'élève. Placé discrètement (en-tête / pied selon le modèle).
function BulletinQR({ src, size = 52, label = true }) {
  if (!src) return null;
  return (
    <div style={{ textAlign: 'center', lineHeight: 1 }}>
      <img src={src} alt="QR" style={{ width: size, height: size, display: 'inline-block' }} />
      {label && <div style={{ fontSize: '6.5px', color: '#9ca3af', marginTop: 1, letterSpacing: 0.3 }}>SCAN</div>}
    </div>
  );
}

// ── Helpers avatar ───────────────────────────────────────────────────────────
const AVT_COLORS = [
  '#6366f1','#8b5cf6','#ec4899','#f59e0b','#10b981',
  '#3b82f6','#ef4444','#14b8a6','#f97316','#84cc16',
];
function avatarColor(name = '') {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff;
  return AVT_COLORS[Math.abs(h) % AVT_COLORS.length];
}
function initials(name = '') {
  return name.split(' ').slice(0, 2).map((w) => w[0] || '').join('').toUpperCase();
}

// Ordre d'affichage des matières sur le bulletin : `position` (croissante) en
// priorité ; les matières sans position gardent le tri historique (coef puis
// nom) et sont placées après les matières ordonnées. Rétrocompatible.
function bySubjectOrder(a, b) {
  const ha = a.position != null, hb = b.position != null;
  if (ha && hb) return a.position - b.position;
  if (ha) return -1;
  if (hb) return 1;
  return b.coef - a.coef || a.name.localeCompare(b.name);
}

// ── Modal : réorganiser les matières d'une classe (glisser-déposer) ─────────────
function SubjectOrderModal({ subjects, onClose }) {
  const t = useT();
  const updateSubject = useSchoolStore((s) => s.updateSubject);
  const [order, setOrder]   = useState(subjects);
  const [saving, setSaving] = useState(false);
  const [dragIdx, setDragIdx] = useState(null);   // index de la ligne en cours de déplacement

  // Déplace l'élément depuis -> vers (réordonnancement en direct au survol).
  const reorder = (from, to) => setOrder((arr) => {
    if (from === to || from == null || to == null) return arr;
    const next = [...arr];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    return next;
  });

  const onDragStart = (idx) => (e) => {
    setDragIdx(idx);
    e.dataTransfer.effectAllowed = 'move';
    // Firefox exige des données pour démarrer le drag.
    try { e.dataTransfer.setData('text/plain', String(idx)); } catch { /* ignore */ }
  };
  const onDragOver = (idx) => (e) => {
    e.preventDefault();                 // autorise le drop
    e.dataTransfer.dropEffect = 'move';
    if (dragIdx !== null && dragIdx !== idx) {
      reorder(dragIdx, idx);
      setDragIdx(idx);                  // la ligne déplacée suit le curseur
    }
  };
  const onDragEnd = () => setDragIdx(null);

  const handleSave = async () => {
    setSaving(true);
    // N'écrit que les positions réellement modifiées.
    await Promise.all(
      order
        .map((sub, i) => (sub.position === i ? null : updateSubject(sub.id, { position: i })))
        .filter(Boolean)
    );
    setSaving(false);
    onClose();
  };

  return (
    <Modal title={t('Ordre des matières sur le bulletin', 'Subject order on the report card')} onClose={onClose} size="md">
      <p className="text-sm text-gray-500 mb-4">
        {t('Glissez-déposez les matières dans l’ordre où elles doivent apparaître sur le bulletin.',
           'Drag and drop the subjects into the order they should appear on the report card.')}
      </p>
      <ul className="space-y-1.5">
        {order.map((sub, idx) => (
          <li
            key={sub.id}
            draggable
            onDragStart={onDragStart(idx)}
            onDragOver={onDragOver(idx)}
            onDrop={(e) => e.preventDefault()}
            onDragEnd={onDragEnd}
            className={`flex items-center gap-3 px-3 py-2 rounded-lg border bg-white cursor-grab active:cursor-grabbing transition-colors ${
              dragIdx === idx ? 'border-brand-400 bg-brand-50/60 opacity-80 shadow-sm' : 'border-gray-100 hover:border-brand-200'
            }`}
          >
            <span className="text-gray-300 select-none shrink-0" aria-hidden>⠿</span>
            <span className="text-xs text-gray-400 w-5 text-right shrink-0">{idx + 1}</span>
            <span className="flex-1 text-sm font-medium text-gray-800 truncate">{sub.name}</span>
            <span className="text-xs text-gray-400 shrink-0">{t('coef', 'coef')} {sub.coef}</span>
          </li>
        ))}
      </ul>
      <div className="flex gap-3 mt-5">
        <button onClick={handleSave} disabled={saving} className="btn-primary"
          style={{ width: 'auto', paddingLeft: '2rem', paddingRight: '2rem' }}>
          {saving ? t('Enregistrement…', 'Saving…') : t('Enregistrer l’ordre', 'Save order')}
        </button>
        <button onClick={onClose} className="btn-secondary">{t('Annuler', 'Cancel')}</button>
      </div>
    </Modal>
  );
}


// ── Périodes système anglophone (3 Terms) ─────────────────────────────────────
const PERIODS_EN = [
  { value: 'term_1', label: 'Term 1',  short: 'T1',   seqs: [1] },
  { value: 'term_2', label: 'Term 2',  short: 'T2',   seqs: [2] },
  { value: 'term_3', label: 'Term 3',  short: 'T3',   seqs: [3] },
  { value: 'annuel', label: 'Annual',  short: 'Ann.', seqs: [1, 2, 3] },
];


// ── Helper i18n bulletin (basé sur sys de la classe, indépendant de la langue UI)
const L = (sys, fr, en) => (sys === 'EN' ? en : fr);

// ── Constantes conduite ───────────────────────────────────────────────────────
const CONDUITE_LABELS    = { TB: 'Très Bien', B: 'Bien', AB: 'Assez Bien', P: 'Passable', M: 'Mauvaise' };
const CONDUITE_LABELS_EN = { TB: 'Very Good', B: 'Good', AB: 'Fairly Good', P: 'Passable', M: 'Poor'    };
const CONDUITE_COLORS    = { TB: '#7c3aed', B: '#059669', AB: '#0284c7', P: '#d97706', M: '#dc2626' };
const conduiteLabel = (sys, code) => (sys === 'EN' ? CONDUITE_LABELS_EN : CONDUITE_LABELS)[code] || code;

function getAbsCond(gradeMap, classId, studentId, seqs) {
  let absJ = 0, absNJ = 0;
  const conduites = [];
  let th = false, encouragement = false, felicitation = false;
  let averTravail = 0, blameTravail = 0, exclusions = 0, averConduite = 0, blameConduite = 0;

  for (const seq of seqs) {
    const s = gradeMap[`${classId}_${studentId}_${seq}`] || {};
    if (s['__abs_j__'])    absJ  += parseInt(s['__abs_j__'],  10) || 0;
    if (s['__abs_nj__'])   absNJ += parseInt(s['__abs_nj__'], 10) || 0;
    if (s['__conduite__']) conduites.push(s['__conduite__']);
    // Conseil de classe — last sequence wins (decision set at end of term)
    if (s['__th__'] !== undefined)            th            = s['__th__']            === 'true';
    if (s['__encouragement__'] !== undefined) encouragement = s['__encouragement__'] === 'true';
    if (s['__felicitation__'] !== undefined)  felicitation  = s['__felicitation__']  === 'true';
    if (s['__aver_travail__'])   averTravail  = parseInt(s['__aver_travail__'],  10) || 0;
    if (s['__blame_travail__'])  blameTravail = parseInt(s['__blame_travail__'], 10) || 0;
    if (s['__exclusions__'])     exclusions   = parseInt(s['__exclusions__'],    10) || 0;
    if (s['__aver_conduite__'])  averConduite = parseInt(s['__aver_conduite__'], 10) || 0;
    if (s['__blame_conduite__']) blameConduite= parseInt(s['__blame_conduite__'],10) || 0;
  }

  const conduite = conduites.length ? conduites[conduites.length - 1] : null;
  return { absJ, absNJ, conduite, th, encouragement, felicitation, averTravail, blameTravail, exclusions, averConduite, blameConduite };
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function subjectGrade(subject, studentId, classId, seqs, gradeMap) {
  const vals = seqs
    .map((seq) => {
      const v = (gradeMap[`${classId}_${studentId}_${seq}`] || {})[subject.id];
      return !v || v === 'ABS' || v === '' ? null : parseFloat(v);
    })
    .filter((x) => x !== null && !isNaN(x));
  if (!vals.length) return null;
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100;
}

function seqGrade(subjectId, studentId, classId, seq, gradeMap) {
  const v = (gradeMap[`${classId}_${studentId}_${seq}`] || {})[subjectId];
  return !v || v === 'ABS' || v === '' ? null : parseFloat(v);
}

function apcLevel(grade, maxScale) {
  if (grade === null) return { label: 'Non évalué', col: '#9ca3af', short: 'NE' };
  const pct = (grade / maxScale) * 100;
  if (pct < 50) return { label: 'Non acquis',  col: '#dc2626', short: 'NA' };
  if (pct < 65) return { label: 'En cours',    col: '#d97706', short: 'EC' };
  if (pct < 80) return { label: 'Acquis',      col: '#059669', short: 'AQ' };
  return             { label: 'Bien acquis',   col: '#7c3aed', short: 'BA' };
}

// ── APC Subject Groups ────────────────────────────────────────────────────────
const APC_GROUPS = [
  { key: 'SCIENCES_EXACTES',  label: 'SCIENCES EXACTES / EXACT SCIENCES'  },
  { key: 'LANGUES',           label: 'LANGUES / LANGUAGES'                 },
  { key: 'SCIENCES_HUMAINES', label: 'SCIENCES HUMAINES / SOCIAL SCIENCES' },
  { key: 'ARTS_SPORTS',       label: 'ARTS ET SPORTS / ARTS & SPORTS'      },
  { key: 'AUTRES',            label: 'AUTRES MATIÈRES / OTHER SUBJECTS'    },
];

function getSubjectGroup(name) {
  const n = (name || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (/math|physique|chimie|svt|bio|informatique|numerique|technologie|s\.p\.c|s\.v\.t|physics|chemistry|biology|computer|science/.test(n)) return 'SCIENCES_EXACTES';
  if (/franc|anglais|espagnol|allemand|arabe|latin|langue|litterature|lecture|expression|communication|english|french|spanish|german|arabic|national language/.test(n)) return 'LANGUES';
  if (/histoire|geo|economie|philo|morale|civique|social|humain|epsp|epm|droit|juridique|history|geography|economics|civic|philosophy/.test(n)) return 'SCIENCES_HUMAINES';
  if (/art|musique|eps|sport|dessin|plastique|manuelle?|physical education|fine arts|music/.test(n)) return 'ARTS_SPORTS';
  return 'AUTRES';
}

// ── Styles partagés en-tête / pied institutionnels camerounais (CM) ───────────
// Constantes hissées au module pour être réutilisées par BulletinAPC ET par le
// nouveau Bulletin Classique (mutualisation, zéro duplication de style).
const CM_BORDER = '1px solid #374151';
const CM_CELL   = { border: CM_BORDER, padding: '3px 5px', fontSize: '10px', verticalAlign: 'middle' };
const CM_THS    = { ...CM_CELL, backgroundColor: '#1e3a5f', color: '#fff', textAlign: 'center', fontWeight: 'bold', fontSize: '9px' };
const CM_GHDR   = { ...CM_CELL, backgroundColor: '#2d3748', color: '#fff', fontWeight: 'bold', textAlign: 'center', fontSize: '9px', padding: '2px 5px' };
const CM_GTOT   = { ...CM_CELL, backgroundColor: '#e8edf2', fontWeight: 'bold', fontSize: '9px' };
const CM_INFO   = { ...CM_CELL, backgroundColor: '#f8fafc', fontSize: '9px' };

// Wrapper « papier » commun aux bulletins institutionnels (Arial 10px, A4).
const CM_PAPER_STYLE = { fontFamily: 'Arial, sans-serif', fontSize: '10px', maxWidth: '210mm', margin: '0 auto', padding: '8px', boxSizing: 'border-box' };
// Applique la police de bulletin choisie par l'école (Settings) au papier A4.
const cmPaper = (school) => ({ ...CM_PAPER_STYLE, fontFamily: bulletinFontFamily(school) });

// ── En-tête institutionnel partagé (ex-APC) ───────────────────────────────────
// Disposition République du Cameroun / MINESEC / Délégations + logo + infos élève.
function BulletinCMHeader({ school, cls, student, stats, teachers, sys, period, qrSrc }) {
  const isEnSys     = sys === 'EN';
  const isAnnuel    = period.value === 'annuel';
  const isTrimestre = !isAnnuel && period.seqs.length > 1;
  const principalTeacher = teachers?.find((t) => t.id === cls?.teacher_id) || null;
  const termOrdinal = (() => {
    if (period.seqs.length >= 4) return isEnSys ? 'ANNUAL' : 'ANNUEL';
    const s = period.seqs[0];
    if (s <= 2) return isEnSys ? '1ST TERM' : '1er TRIMESTRE';
    if (s <= 4) return isEnSys ? '2ND TERM' : '2ème TRIMESTRE';
    return isEnSys ? '3RD TERM' : '3ème TRIMESTRE';
  })();

  // En-tête officiel hérité du PAYS choisi à la configuration (Cameroun bilingue,
  // Côte d'Ivoire / Gabon / Congo mono-langue…). Le N° d'établissement apparaît
  // sous les délégations. Repli Cameroun si la config pays n'expose rien.
  const officials = bulletinOfficials(school, { sys });
  const blocks    = officials?.blocks ?? [];
  const bilingual = officials?.bilingual && blocks.length > 1;
  const leftW     = bilingual ? '33%' : '50%';
  const centerW   = bilingual ? '34%' : '50%';

  const OfficialBlock = ({ block }) => (
    <td style={{ width: leftW, textAlign: 'center', fontSize: '9px', lineHeight: 1.5, padding: '2px' }}>
      <strong>{block.republic}</strong><br />
      {block.motto}<br />
      ———————<br />
      {block.ministry}{block.lines.length > 0 && <br />}
      {block.lines.map((ln, i) => (
        <span key={i}>{ln}{i < block.lines.length - 1 && <br />}</span>
      ))}
      {block.establishment && (<><br /><strong>{block.establishment}</strong></>)}
    </td>
  );

  return (
    <>
      {/* HEADER — officiels par pays + identification de l'établissement */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '5px' }}>
        <tbody>
          <tr>
            {blocks[0] && <OfficialBlock block={blocks[0]} />}
            <td style={{ width: centerW, textAlign: 'center', padding: '2px' }}>
              {school?.logo_url && (
                <AssetImg src={school.logo_url} alt="Logo" style={{ width: 64, height: 64, objectFit: 'contain', display: 'block', margin: '0 auto 3px' }} />
              )}
              <strong style={{ fontSize: '11px', display: 'block' }}>{(school?.name || '').toUpperCase()}</strong>
              {(school?.address || school?.phone) && (
                <span style={{ fontSize: '8.5px' }}>
                  {school?.address ? `B.P. ${school.address}` : ''}{school?.address && school?.phone ? ' · ' : ''}{school?.phone || ''}
                </span>
              )}
              <br />
              <span style={{ fontSize: '8.5px' }}>{L(sys, 'Année scolaire', 'Academic year')} : <strong>{school?.current_year || '—'}</strong></span>
            </td>
            {bilingual && blocks[1] && <OfficialBlock block={blocks[1]} />}
          </tr>
        </tbody>
      </table>

      {/* TITLE BAR */}
      <div style={{ backgroundColor: '#1e3a5f', color: '#fff', textAlign: 'center', padding: '5px 8px', fontWeight: 'bold', fontSize: '11px', letterSpacing: '0.5px', marginBottom: '5px' }}>
        {isEnSys ? 'REPORT CARD' : 'BULLETIN SCOLAIRE'} – {(!isTrimestre && !isAnnuel) ? `${termOrdinal} – ` : ''}{period.label.toUpperCase()}
      </div>

      {/* STUDENT INFO */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '5px' }}>
        <tbody>
          <tr>
            <td style={{ ...CM_INFO, width: '10%', textAlign: 'center' }}>
              <BulletinPhoto src={student.photo_url} width={44} height={54} radius={2} />
            </td>
            <td style={{ ...CM_INFO, width: '25%' }}><strong>{L(sys, 'NOM ET PRÉNOM', 'FULL NAME')} :</strong><br /><span style={{ fontWeight: 'bold', color: '#111' }}>{student.name}</span></td>
            <td style={{ ...CM_INFO, width: '12%' }}><strong>{L(sys, 'MATRICULE', 'REG. NO.')} :</strong><br />{student.matricule || '—'}</td>
            <td style={{ ...CM_INFO, width: '13%' }}><strong>{L(sys, 'DATE DE NAISS.', 'DATE OF BIRTH')} :</strong><br />{student.date_naissance || '—'}</td>
            <td style={{ ...CM_INFO, width: '22%' }}><strong>{L(sys, 'ENS. PRINCIPAL', 'FORM MASTER')} :</strong><br />{principalTeacher?.name || '—'}</td>
            <td style={{ ...CM_INFO, width: '14%' }}><strong>{L(sys, 'CLASSE', 'CLASS')} :</strong><br />{cls?.name || '—'}</td>
            <td style={{ ...CM_INFO, width: '14%', textAlign: 'center' }}><strong>{L(sys, 'EFFECTIF', 'TOTAL')} :</strong><br /><strong style={{ fontSize: '14px' }}>{stats?.total ?? '—'}</strong></td>
            {qrSrc && (
              <td style={{ ...CM_INFO, width: '11%', textAlign: 'center' }}><BulletinQR src={qrSrc} size={46} /></td>
            )}
          </tr>
        </tbody>
      </table>
    </>
  );
}

// ── En-tête « primaire » partagé (bulletins primaire annuel) ──────────────────
// Même source pays que BulletinCMHeader : République / devise héritées du pays
// choisi, N° d'établissement sous la zone officielle.
function BulletinPrimaryHeader({ school, qrSrc }) {
  const officials = bulletinOfficials(school);
  const blocks    = officials?.blocks ?? [];
  const bilingual = officials?.bilingual && blocks.length > 1;
  const Block = ({ b }) => (
    <div>
      <strong>{b.republic}</strong><br />
      {b.motto}<br />————————<br />
      <em>{school?.region || ''}</em>
      {b.establishment && (<><br /><strong>{b.establishment}</strong></>)}
    </div>
  );
  return (
    <div className="bulletin-header">
      {blocks[0] && <Block b={blocks[0]} />}
      <div className="bulletin-logo" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
        {school?.logo_url
          ? <AssetImg src={school.logo_url} alt="Logo" style={{ width: 90, height: 90, objectFit: 'contain' }} />
          : '📚'}
        {qrSrc && <BulletinQR src={qrSrc} size={48} />}
      </div>
      {bilingual && blocks[1] && <Block b={blocks[1]} />}
    </div>
  );
}

// ── Pied institutionnel partagé (ex-APC) ──────────────────────────────────────
// 4 colonnes (Résultat / Profil classe / Travail / Conduite) + signatures + mention.
function BulletinCMFooter({ school, sys, studentAvg, maxScale, passed, decision, apprGlobal, rank, stats, abs }) {
  const isEnSys = sys === 'EN';
  const { absJ, absNJ, conduite, th, encouragement, felicitation, averTravail, blameTravail, exclusions, averConduite, blameConduite } = abs;

  return (
    <>
      {/* BOTTOM 4 COLUMNS */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '5px' }}>
        <thead>
          <tr>
            <th style={{ ...CM_THS, width: '25%' }}>{L(sys, "RÉSULTAT DE L'ÉLÈVE",  'STUDENT RESULTS')}</th>
            <th style={{ ...CM_THS, width: '25%' }}>{L(sys, 'PROFIL DE LA CLASSE',  'CLASS PROFILE')}</th>
            <th style={{ ...CM_THS, width: '25%' }}>{L(sys, "TRAVAIL DE L'ÉLÈVE",   "STUDENT'S WORK")}</th>
            <th style={{ ...CM_THS, width: '25%' }}>{L(sys, "CONDUITE DE L'ÉLÈVE",  "STUDENT'S CONDUCT")}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ ...CM_CELL, verticalAlign: 'top', padding: '5px' }}>
              <div>{L(sys, 'Moy. Gén.', 'Avg.')} : <strong style={{ color: passed ? '#059669' : '#dc2626' }}>{studentAvg !== null ? `${studentAvg}/${maxScale}` : '—'}</strong></div>
              <div>{L(sys, 'Rang', 'Rank')} : <strong>{rank?.rankD || '—'} / {stats?.total ?? '—'}</strong></div>
              <div style={{ marginTop: 3 }}>
                <strong style={{ color: passed ? '#059669' : '#dc2626', fontSize: '11px' }}>
                  {studentAvg !== null ? decision : '—'}
                </strong>
              </div>
            </td>
            <td style={{ ...CM_CELL, verticalAlign: 'top', padding: '5px' }}>
              <div>{L(sys, 'Moy. classe', 'Class avg.')} : <strong>{stats?.avg != null ? `${stats.avg}/${maxScale}` : '—'}</strong></div>
              <div>{L(sys, 'Note max', 'Highest')} : <strong>{stats?.max != null ? `${stats.max}/${maxScale}` : '—'}</strong></div>
              <div>{L(sys, 'Note min', 'Lowest')} : <strong>{stats?.min != null ? `${stats.min}/${maxScale}` : '—'}</strong></div>
              <div>{L(sys, 'Taux réussite', 'Pass rate')} : <strong>{stats?.above != null && stats?.total ? `${stats.above}/${stats.total} (${Math.round((stats.above / stats.total) * 100)}%)` : '—'}</strong></div>
            </td>
            <td style={{ ...CM_CELL, verticalAlign: 'top', padding: '5px' }}>
              <div style={{ color: apprGlobal?.col, fontWeight: 'bold', fontSize: '11px' }}>
                {isEnSys ? (apprGlobal ? `${apprGlobal.g} — ${apprGlobal.txt}` : '—') : (apprGlobal?.text || '—')}
              </div>
              {th            && <div style={{ color: '#059669', fontWeight: 'bold', fontSize: '9px', marginTop: 2 }}>{L(sys, "Tableau d'Honneur", 'Honor Roll')}</div>}
              {encouragement && <div style={{ color: '#059669', fontWeight: 'bold', fontSize: '9px', marginTop: 2 }}>{L(sys, 'T.H + Encouragement', 'Honor Roll + Encouragement')}</div>}
              {felicitation  && <div style={{ color: '#059669', fontWeight: 'bold', fontSize: '9px', marginTop: 2 }}>{L(sys, 'T.H + Félicitation', 'Honor Roll + Congratulations')}</div>}
              {averTravail  > 0 && <div style={{ color: '#d97706', fontSize: '9px', marginTop: 2 }}>{L(sys, 'Aver. Travail', 'Work Warning')} : <strong>{averTravail}</strong></div>}
              {blameTravail > 0 && <div style={{ color: '#dc2626', fontSize: '9px', marginTop: 2 }}>{L(sys, 'Blâme Travail', 'Work Reprimand')} : <strong>{blameTravail}</strong></div>}
            </td>
            <td style={{ ...CM_CELL, verticalAlign: 'top', padding: '5px' }}>
              <div style={{ fontSize: '9px' }}>{L(sys, "T. d'Honneur", 'Honor Roll')} : <strong style={{ color: th || encouragement || felicitation ? '#059669' : '#374151' }}>{th || encouragement || felicitation ? L(sys, 'Oui', 'Yes') : L(sys, 'Non', 'No')}</strong></div>
              <div style={{ fontSize: '9px' }}>{L(sys, 'Abs. totales', 'Total absences')} : <strong>{absJ + absNJ} H</strong></div>
              <div style={{ fontSize: '9px' }}>{L(sys, 'Absences NJ', 'Unjust. absences')} : <strong>{absNJ} H</strong></div>
              <div style={{ fontSize: '9px' }}>{L(sys, 'Exclusions', 'Exclusions')} : <strong>{exclusions} {L(sys, 'Jrs', 'days')}</strong></div>
              <div style={{ fontSize: '9px' }}>{L(sys, 'Aver. Conduite', 'Conduct Warning')} : <strong>{averConduite}</strong></div>
              <div style={{ fontSize: '9px' }}>{L(sys, 'Blâme Conduite', 'Conduct Reprimand')} : <strong>{blameConduite}</strong></div>
              <div style={{ fontSize: '9px' }}>{L(sys, 'Conduite', 'Conduct')} : <strong style={{ color: conduite ? CONDUITE_COLORS[conduite] : undefined }}>
                {conduite ? `${conduite} — ${conduiteLabel(sys, conduite)}` : '—'}
              </strong></div>
            </td>
          </tr>
        </tbody>
      </table>

      {/* SIGNATURES */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '4px' }}>
        <tbody>
          <tr>
            <td style={{ ...CM_CELL, width: '33%', textAlign: 'center', height: 56, verticalAlign: 'bottom', paddingBottom: 5 }}>
              <strong style={{ fontSize: '9px' }}>{L(sys, 'Signature du Parent / Tuteur', 'Parent / Guardian Signature')}</strong>
            </td>
            <td style={{ ...CM_CELL, width: '34%', textAlign: 'center', verticalAlign: 'bottom', paddingBottom: 5 }}>
              <strong style={{ fontSize: '9px' }}>{L(sys, 'Le Conseil de Classe', 'Class Council')}</strong>
            </td>
            <td style={{ ...CM_CELL, width: '33%', textAlign: 'center', verticalAlign: 'top', paddingTop: 5 }}>
              <strong style={{ fontSize: '9px' }}>{L(sys, 'LE PRINCIPAL', 'THE PRINCIPAL')}</strong>
              {school?.signature_url && (
                <AssetImg src={school.signature_url} alt="Signature" style={{ height: 32, display: 'block', margin: '2px auto' }} />
              )}
              {school?.stamp_url && (
                <AssetImg src={school.stamp_url} alt="Tampon" style={{ height: 32, display: 'block', margin: '2px auto' }} />
              )}
            </td>
          </tr>
        </tbody>
      </table>

      <p style={{ fontSize: '7.5px', color: '#9ca3af', textAlign: 'center', fontStyle: 'italic', margin: 0 }}>
        {isEnSys
          ? "This report card is valid only with the signature and stamp of the head of school. Any manual alteration is liable to sanction."
          : "Ce bulletin n'est valable qu'avec la signature et le cachet du chef d'établissement. Toute modification manuelle est passible de sanction."}
      </p>
    </>
  );
}

// ── Bulletin Classique ────────────────────────────────────────────────────────
function BulletinClassic({ school, cls, student, subjects, subjectGrades, studentAvg, rank, stats, period, sys, teachers, gradeMap, classId, qrSrc }) {
  const passThreshold = sys === 'FR' ? 10 : 50;
  const maxScale      = sys === 'FR' ? 20 : 100;
  const passed        = studentAvg !== null && studentAvg >= passThreshold;
  const decision      = sys === 'FR' ? (passed ? 'Admis(e)' : 'Ajourné(e)') : (passed ? 'Passed' : 'Failed');
  const apprGlobal    = getAppreciation(studentAvg, school?.grade_scale, sys);
  const abs           = getAbsCond(gradeMap, classId, student.id, period.seqs);

  return (
    <div className="bulletin-paper" style={cmPaper(school)}>
      {/* En-tête institutionnel mutualisé (ex-APC) */}
      <BulletinCMHeader school={school} cls={cls} student={student} stats={stats} teachers={teachers} sys={sys} period={period} qrSrc={qrSrc} />

      {/* Tableau détaillé des matières — design Classique conservé (notes, coef, M×C, appréciations, couleurs, calculs) */}
      <table className="bulletin-table">
        <thead>
          <tr>
            <th style={{ width: '35%', textAlign: 'left' }}>{sys === 'EN' ? 'Subject' : 'Matière / Subject'}</th>
            <th>{sys === 'FR' ? `Note/${maxScale}` : `Marks/${maxScale}`}</th>
            <th>Coef</th>
            <th>M×C</th>
            <th style={{ width: '25%' }}>{sys === 'FR' ? 'Appréciation' : 'Grade'}</th>
          </tr>
        </thead>
        <tbody>
          {subjects.map((sub) => {
            const grade    = subjectGrades[sub.id];
            const gradeStr = grade !== null ? String(grade) : 'ABS';
            const mxc      = grade !== null ? Math.round(grade * sub.coef * 100) / 100 : '—';
            const appr     = grade !== null
              ? getAppreciation(sys === 'FR' ? (grade / sub.max) * 20 : (grade / sub.max) * 100, school?.grade_scale, sys)
              : null;
            const subTeacher = teachers?.find((t) => t.id === sub.teacher_id);
            return (
              <tr key={sub.id}>
                <td className="subject-name">
                  <span>{sub.name}</span>
                  {subTeacher && (
                    <span style={{ display: 'block', fontSize: '0.7em', color: '#6b7280', fontWeight: 'normal' }}>
                      {subTeacher.name}
                    </span>
                  )}
                </td>
                <td className="grade-cell"
                    style={{ color: grade !== null ? (grade / sub.max >= passThreshold / maxScale ? '#059669' : '#dc2626') : '#6b7280' }}>
                  {gradeStr}
                </td>
                <td style={{ textAlign: 'center' }}>{sub.coef}</td>
                <td style={{ textAlign: 'center' }}>{mxc}</td>
                <td className="appreciation-cell" style={{ color: appr?.col || '#6b7280' }}>
                  {sys === 'FR' ? (appr?.text || '—') : (appr ? `${appr.g} — ${appr.txt}` : '—')}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Bas de page institutionnel mutualisé (ex-APC) : résultat, profil classe, travail, conduite, signatures */}
      <BulletinCMFooter
        school={school} sys={sys} studentAvg={studentAvg} maxScale={maxScale}
        passed={passed} decision={decision} apprGlobal={apprGlobal}
        rank={rank} stats={stats} abs={abs}
      />
    </div>
  );
}

// ── Bulletin Moderne ──────────────────────────────────────────────────────────
function BulletinModern({ school, cls, student, subjects, subjectGrades, studentAvg, rank, stats, period, sys, teachers, gradeMap, classId, qrSrc }) {
  const passThreshold = sys === 'FR' ? 10 : 50;
  const maxScale      = sys === 'FR' ? 20 : 100;
  const passed        = studentAvg !== null && studentAvg >= passThreshold;
  const decision      = sys === 'FR' ? (passed ? 'Admis(e)' : 'Ajourné(e)') : (passed ? 'Passed' : 'Failed');
  const apprGlobal    = getAppreciation(studentAvg, school?.grade_scale, sys);
  const { absJ, absNJ, conduite } = getAbsCond(gradeMap, classId, student.id, period.seqs);

  const isAnnuel  = period.value === 'annuel';
  const isEN_m    = sys === 'EN';
  const termSeqsM = isAnnuel ? (isEN_m ? [[1],[2],[3]] : [[1,2],[3,4],[5,6]]) : null;
  const termLblM  = isAnnuel ? ['T1','T2','T3'] : null;

  function termAvgM(subId, seqs) {
    const vals = seqs.map((i) => {
      const v = (gradeMap[`${classId}_${student.id}_${i}`] || {})[subId];
      return !v || v === 'ABS' || v === '' ? null : parseFloat(v);
    }).filter((x) => x !== null && !isNaN(x));
    if (!vals.length) return null;
    return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100;
  }

  return (
    <div className="bulletin-paper bulletin-modern">
      <div className="bm-header-band">
        <div className="bm-logo-circle">
          {school?.logo_url
            ? <AssetImg src={school.logo_url} alt="Logo" style={{ width: 40, height: 40, objectFit: 'contain' }} />
            : '📚'
          }
        </div>
        <div className="bm-header-text">
          <div className="bm-school-name">{school?.name || 'Établissement'}</div>
          <div className="bm-school-meta">
            {[school?.region, school?.type ? `Ens. ${school.type}` : null, school?.current_year ? `Année ${school.current_year}` : null]
              .filter(Boolean).join(' · ')}
          </div>
        </div>
        <div className="bm-period-badge">{period.short}</div>
      </div>

      <div className="bm-student-card" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <BulletinPhoto src={student.photo_url} width={56} height={70} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="bm-student-name">{student.name}</div>
          <div className="bm-student-meta">
            <span>{cls?.name || '—'}</span>
            {student.matricule && <><span>·</span><span>Mat. {student.matricule}</span></>}
            {student.gender && <><span>·</span><span>{student.gender}</span></>}
          </div>
          <div className="bm-student-rank">
            <span>{sys === 'EN' ? 'Rank' : 'Rang'}&nbsp;<strong>{rank?.rankD || '—'}</strong>&thinsp;/&thinsp;{stats?.total ?? '—'}</span>
            <span>{sys === 'EN' ? 'Average' : 'Moyenne'}&nbsp;
              <strong style={{ color: passed ? '#059669' : '#dc2626' }}>
                {studentAvg !== null ? `${studentAvg}/${maxScale}` : '—'}
              </strong>
            </span>
            <span style={{ color: passed ? '#059669' : '#dc2626', fontWeight: 700 }}>{decision}</span>
          </div>
        </div>
        {qrSrc && <BulletinQR src={qrSrc} size={54} />}
      </div>

      <table className="bulletin-table bm-table">
        <thead>
          <tr>
            <th style={{ width: isAnnuel ? '28%' : '38%', textAlign: 'left' }}>{sys === 'EN' ? 'Subject' : 'Matière'}</th>
            {isAnnuel && <th style={{ fontSize: '0.8em' }}>{termLblM[0]}/{maxScale}</th>}
            {isAnnuel && <th style={{ fontSize: '0.8em' }}>{termLblM[1]}/{maxScale}</th>}
            {isAnnuel && <th style={{ fontSize: '0.8em' }}>{termLblM[2]}/{maxScale}</th>}
            <th>{isAnnuel ? `Moy.Ann/${maxScale}` : (sys === 'EN' ? `Marks/${maxScale}` : `Note/${maxScale}`)}</th>
            <th>Coef</th>
            <th>M×C</th>
            <th style={{ width: '22%' }}>{sys === 'EN' ? 'Grade' : 'Appréciation'}</th>
          </tr>
        </thead>
        <tbody>
          {subjects.map((sub) => {
            const grade    = subjectGrades[sub.id];
            const gradeStr = grade !== null ? String(grade) : 'ABS';
            const mxc      = grade !== null ? Math.round(grade * sub.coef * 100) / 100 : '—';
            const pct      = grade !== null ? grade / sub.max : null;
            const appr     = grade !== null
              ? getAppreciation(sys === 'FR' ? (grade / sub.max) * 20 : (grade / sub.max) * 100, school?.grade_scale, sys)
              : null;
            const subTeacher = teachers?.find((t) => t.id === sub.teacher_id);
            const gradeColor = grade !== null
              ? (grade / sub.max >= passThreshold / maxScale ? '#059669' : '#dc2626')
              : '#9ca3af';
            const mt1 = isAnnuel ? termAvgM(sub.id, termSeqsM[0]) : null;
            const mt2 = isAnnuel ? termAvgM(sub.id, termSeqsM[1]) : null;
            const mt3 = isAnnuel ? termAvgM(sub.id, termSeqsM[2]) : null;
            return (
              <tr key={sub.id}>
                <td className="subject-name">
                  <span>{sub.name}</span>
                  {subTeacher && (
                    <span style={{ display: 'block', fontSize: '0.7em', color: '#6b7280', fontWeight: 'normal' }}>
                      {subTeacher.name}
                    </span>
                  )}
                  {pct !== null && (
                    <div className="bm-progress-bar">
                      <div className="bm-progress-fill" style={{ width: `${Math.min(pct * 100, 100)}%`, background: gradeColor }} />
                    </div>
                  )}
                </td>
                {isAnnuel && <td style={{ textAlign: 'center', color: '#374151' }}>{mt1 !== null ? mt1 : '—'}</td>}
                {isAnnuel && <td style={{ textAlign: 'center', color: '#374151' }}>{mt2 !== null ? mt2 : '—'}</td>}
                {isAnnuel && <td style={{ textAlign: 'center', color: '#374151' }}>{mt3 !== null ? mt3 : '—'}</td>}
                <td className="grade-cell" style={{ color: gradeColor, fontWeight: 700 }}>{gradeStr}</td>
                <td style={{ textAlign: 'center' }}>{sub.coef}</td>
                <td style={{ textAlign: 'center' }}>{mxc}</td>
                <td className="appreciation-cell" style={{ color: appr?.col || '#9ca3af' }}>
                  {sys === 'FR' ? (appr?.text || '—') : (appr ? `${appr.g} — ${appr.txt}` : '—')}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="bm-metrics">
        {[
          { label: sys === 'EN' ? 'General Average' : 'Moyenne générale', value: studentAvg !== null ? `${studentAvg}/${maxScale}` : '—', color: passed ? '#059669' : '#dc2626' },
          { label: sys === 'EN' ? 'Rank'            : 'Rang',             value: `${rank?.rankD || '—'} / ${stats?.total ?? '—'}` },
          { label: sys === 'EN' ? 'Grade'           : 'Appréciation',     value: sys === 'FR' ? (apprGlobal?.text || '—') : (apprGlobal ? apprGlobal.g : '—'), color: apprGlobal?.col },
          { label: sys === 'EN' ? 'Class Average'   : 'Moy. classe',      value: stats?.avg != null ? `${stats.avg}/${maxScale}` : '—' },
          { label: sys === 'EN' ? 'Pass Rate'       : 'Taux réussite',    value: stats?.above != null && stats?.total ? `${Math.round((stats.above / stats.total) * 100)} %` : '—' },
          { label: sys === 'EN' ? 'Decision'        : 'Décision',         value: decision, color: passed ? '#059669' : '#dc2626' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bm-metric">
            <div className="bm-metric-label">{label}</div>
            <div className="bm-metric-value" style={{ color: color || '#111827' }}>{value}</div>
          </div>
        ))}
      </div>

      <div className="bulletin-absences-row">
        <span>{sys === 'EN' ? 'Just. absences' : 'Absences just.'} : <strong>{absJ > 0 ? `${absJ} h` : '—'}</strong></span>
        <span>{sys === 'EN' ? 'Unjust. absences' : 'Absences n.just.'} : <strong>{absNJ > 0 ? `${absNJ} h` : '—'}</strong></span>
        {conduite && (
          <span>{sys === 'EN' ? 'Conduct' : 'Conduite'} : <strong style={{ color: CONDUITE_COLORS[conduite] }}>{conduite} — {CONDUITE_LABELS[conduite]}</strong></span>
        )}
      </div>

      <div className="bm-remark">
        <div className="bm-remark-label">{sys === 'EN' ? 'Remarks' : 'Observations'}</div>
      </div>
      <div className="bm-signatures">
        <div className="bm-sig bulletin-sig-block">
          {school?.signature_url && (
            <AssetImg src={school.signature_url} alt="Signature" className="bulletin-sig-img" />
          )}
          {school?.stamp_url && (
            <AssetImg src={school.stamp_url} alt="Tampon" className="bulletin-stamp-img" />
          )}
          {sys === 'EN' ? 'The Principal' : 'Le Directeur'}
        </div>
        <div className="bm-sig">{sys === 'EN' ? 'Form Master' : 'Prof. Principal'}</div>
        <div className="bm-sig">{sys === 'EN' ? 'Parent / Guardian' : 'Parent / Tuteur'}</div>
      </div>
    </div>
  );
}

// ── Bulletin APC ──────────────────────────────────────────────────────────────
function BulletinAPC({ school, cls, student, subjects, subjectGrades, studentAvg, rank, stats, period, sys, teachers, gradeMap, classId, classStudents = [], qrSrc }) {
  const isEnSys    = sys === 'EN';
  const passThr    = isEnSys ? 50 : 10;
  const maxScale   = isEnSys ? 100 : 20;
  const passed     = studentAvg !== null && studentAvg >= passThr;
  const decision   = isEnSys ? (passed ? 'PASSED' : 'FAILED') : (passed ? 'ADMIS(E)' : 'AJOURNÉ(E)');
  const apprGlobal = getAppreciation(studentAvg, school?.grade_scale, sys);
  const abs = getAbsCond(gradeMap, classId, student.id, period.seqs);
  // Appréciation libre du travail de l'élève (saisie via l'éditeur du panneau,
  // stockée sous `__appreciation__` au dernier slot de séquence de la période).
  const lastSeq = period.seqs[period.seqs.length - 1];
  const workAppreciation = (gradeMap[`${classId}_${student.id}_${lastSeq}`] || {})['__appreciation__'] || '';
  const isAnnuel    = period.value === 'annuel';
  const isEN        = sys === 'EN';
  const isTrimestre = !isAnnuel && period.seqs.length > 1;
  const termSeqs    = isAnnuel ? (isEN ? [[1],[2],[3]] : [[1,2],[3,4],[5,6]]) : null;
  const termLabel   = isAnnuel ? ['T1','T2','T3'] : null;

  function termAvg(subId, seqs) {
    const vals = seqs.map((i) => {
      const v = (gradeMap[`${classId}_${student.id}_${i}`] || {})[subId];
      return !v || v === 'ABS' || v === '' ? null : parseFloat(v);
    }).filter((x) => x !== null && !isNaN(x));
    if (!vals.length) return null;
    return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100;
  }

  function getSubjectRank(sub) {
    const myG = subjectGrades[sub.id];
    if (myG === null || myG === undefined) return '—';
    let r = 1;
    let total = 0;
    for (const s of classStudents) {
      const g = subjectGrade(sub, s.id, classId, period.seqs, gradeMap);
      if (g !== null) {
        total++;
        if (g > myG) r++;
      }
    }
    return total ? `${r}/${total}` : '—';
  }

  const grouped = {};
  APC_GROUPS.forEach((g) => { grouped[g.key] = []; });
  subjects.forEach((sub) => {
    const gk = getSubjectGroup(sub.name);
    (grouped[gk] || grouped['AUTRES']).push(sub);
  });

  function groupStats(subs) {
    let pts = 0, coefSum = 0;
    subs.forEach((sub) => {
      const g = subjectGrades[sub.id];
      if (g !== null && g !== undefined) {
        // Échelle native du système : /20 en FR, /100 en EN (anglophone).
        const disp = sys === 'FR' ? g : Math.round((g / (sub.max || 100)) * maxScale * 100) / 100;
        pts     += disp * sub.coef;
        coefSum += sub.coef;
      }
    });
    return {
      avg:     coefSum ? Math.round((pts / coefSum) * 100) / 100 : null,
      coefSum,
      pts:     Math.round(pts * 100) / 100,
    };
  }

  const totalCols = isAnnuel ? 9 : isTrimestre ? 8 : 6;

  // Styles officiels MINESEC : en-têtes de colonnes gris clair, cellules fines.
  const cell = mkCell(9.5);
  const thS  = mkTH(9);
  const pcx  = { WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' };
  const ghdr = { ...cell, background: '#dbe3ec', fontWeight: 'bold', textAlign: 'center', ...pcx };
  const gtot = { ...cell, background: '#eef2f7', fontWeight: 'bold', ...pcx };

  // Titre, prof principal et synthèse « Travail » (total pondéré, coef cumulé).
  const title = `${isEnSys ? 'APC REPORT CARD' : 'BULLETIN APC'} – ${period.label.toUpperCase()}`;
  const profPrincipal = teachers?.find((tt) => tt.id === cls?.teacher_id)?.name || '';
  let gPts = 0, gCoef = 0;
  subjects.forEach((sub) => {
    const rawG = subjectGrades[sub.id];
    if (rawG !== null && rawG !== undefined) {
      const on20 = sys === 'FR' ? rawG : Math.round((rawG / (sub.max || 100)) * maxScale * 100) / 100;
      gPts += on20 * sub.coef; gCoef += sub.coef;
    }
  });
  gPts = Math.round(gPts * 100) / 100;

  // Petites tables du pied officiel (Discipline / Travail / Profil de la classe).
  const KV = ({ k, v, strong }) => (
    <tr><td style={cell}>{k}</td><td style={{ ...cell, textAlign: 'center' }}>{strong ? <strong>{v}</strong> : v}</td></tr>
  );
  const Mini = ({ title: mt, children }) => (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <tbody><tr><td colSpan={2} style={thS}>{mt}</td></tr>{children}</tbody>
    </table>
  );

  return (
    <OfficialSheet school={school}>
      {/* En-tête officiel MINESEC : logo en filigrane au fond + barre de titre */}
      <OfficialHeader school={school} sys={sys} title={title} />
      <OfficialIdentity
        student={student} classLabel={cls?.name || ''}
        effectif={stats?.total} profPrincipal={profPrincipal}
      />

      {/* SUBJECT TABLE — matières groupées (monde Classique), en-têtes gris officiels */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '5px' }}>
        <thead>
          <tr>
            <th style={{ ...thS, width: isAnnuel ? '22%' : isTrimestre ? '28%' : '34%', textAlign: 'left' }}>{L(sys, 'MATIÈRES', 'SUBJECTS')}</th>
            {isAnnuel && <th style={{ ...thS, width: '8%' }}>{termLabel[0]}/{maxScale}</th>}
            {isAnnuel && <th style={{ ...thS, width: '8%' }}>{termLabel[1]}/{maxScale}</th>}
            {isAnnuel && <th style={{ ...thS, width: '8%' }}>{termLabel[2]}/{maxScale}</th>}
            {isAnnuel && <th style={{ ...thS, width: '9%' }}>{L(sys, 'Moy.Ann', 'Ann.Avg')}/{maxScale}</th>}
            {!isAnnuel && isTrimestre && <th style={{ ...thS, width: '9%' }}>{L(sys, 'SEQ', 'Term')} {period.seqs[0]} /{maxScale}</th>}
            {!isAnnuel && isTrimestre && <th style={{ ...thS, width: '9%' }}>{L(sys, 'SEQ', 'Term')} {period.seqs[1]} /{maxScale}</th>}
            {!isAnnuel && <th style={{ ...thS, width: '11%' }}>{isTrimestre ? L(sys, `MOY /${maxScale}`, `AVG /${maxScale}`) : `${L(sys, 'SEQ', 'Term')} ${period.seqs[0]} /${maxScale}`}</th>}
            <th style={{ ...thS, width: '7%' }}>COEF</th>
            <th style={{ ...thS, width: '9%' }}>TOTAL</th>
            <th style={{ ...thS, width: '8%' }}>{L(sys, 'RANG', 'RANK')}</th>
            <th style={{ ...thS, width: isTrimestre ? '19%' : '21%' }}>{L(sys, 'APPRÉCIATION', 'GRADE')}</th>
          </tr>
        </thead>

        {APC_GROUPS.map((group) => {
          const subs = grouped[group.key] || [];
          if (!subs.length) return null;
          const gs      = groupStats(subs);
          // gs.avg est déjà sur l'échelle native (/20 FR, /100 EN), ce que getAppreciation attend.
          const gAppr   = getAppreciation(gs.avg, school?.grade_scale, sys);
          const gPassed = gs.avg !== null && gs.avg >= passThr;

          return (
            <tbody key={group.key}>
              <tr>
                <td colSpan={totalCols} style={ghdr}>{group.label}</td>
              </tr>

              {subs.map((sub) => {
                const rawG   = subjectGrades[sub.id];
                // Échelle native du système : /20 en FR, /100 en EN (anglophone).
                const on20   = rawG !== null && rawG !== undefined
                  ? (sys === 'FR' ? rawG : Math.round((rawG / (sub.max || 100)) * maxScale * 100) / 100)
                  : null;
                const total  = on20 !== null ? Math.round(on20 * sub.coef * 100) / 100 : '—';
                const sRank  = getSubjectRank(sub);
                // on20 est déjà sur l'échelle native attendue par getAppreciation (/20 FR, /100 EN).
                const appr   = getAppreciation(on20, school?.grade_scale, sys);
                const isPassed = on20 !== null && on20 >= passThr;
                const s1     = isTrimestre ? seqGrade(sub.id, student.id, classId, period.seqs[0], gradeMap) : null;
                const s2     = isTrimestre ? seqGrade(sub.id, student.id, classId, period.seqs[1], gradeMap) : null;
                const t1     = isAnnuel ? termAvg(sub.id, termSeqs[0]) : null;
                const t2     = isAnnuel ? termAvg(sub.id, termSeqs[1]) : null;
                const t3     = isAnnuel ? termAvg(sub.id, termSeqs[2]) : null;
                const subTch = teachers?.find((t) => t.id === sub.teacher_id);

                return (
                  <tr key={sub.id}>
                    <td style={{ ...cell, textAlign: 'left' }}>
                      {sub.name}
                      {subTch && (
                        <span style={{ display: 'block', fontSize: '8px', color: '#6b7280' }}>{subTch.name}</span>
                      )}
                    </td>
                    {isAnnuel && (
                      <td style={{ ...cell, textAlign: 'center' }}>
                        {t1 !== null ? t1 : <span style={{ color: '#9ca3af' }}>—</span>}
                      </td>
                    )}
                    {isAnnuel && (
                      <td style={{ ...cell, textAlign: 'center' }}>
                        {t2 !== null ? t2 : <span style={{ color: '#9ca3af' }}>—</span>}
                      </td>
                    )}
                    {isAnnuel && (
                      <td style={{ ...cell, textAlign: 'center' }}>
                        {t3 !== null ? t3 : <span style={{ color: '#9ca3af' }}>—</span>}
                      </td>
                    )}
                    {!isAnnuel && isTrimestre && (
                      <td style={{ ...cell, textAlign: 'center' }}>
                        {s1 !== null ? s1 : <span style={{ color: '#9ca3af' }}>ABS</span>}
                      </td>
                    )}
                    {!isAnnuel && isTrimestre && (
                      <td style={{ ...cell, textAlign: 'center' }}>
                        {s2 !== null ? s2 : <span style={{ color: '#9ca3af' }}>ABS</span>}
                      </td>
                    )}
                    <td style={{ ...cell, textAlign: 'center', fontWeight: 'bold', color: on20 !== null ? (isPassed ? '#059669' : '#dc2626') : '#9ca3af' }}>
                      {on20 !== null ? on20 : <span style={{ color: '#9ca3af' }}>ABS</span>}
                    </td>
                    <td style={{ ...cell, textAlign: 'center' }}>{sub.coef}</td>
                    <td style={{ ...cell, textAlign: 'center' }}>{total}</td>
                    <td style={{ ...cell, textAlign: 'center', fontSize: '9px' }}>{sRank}</td>
                    <td style={{ ...cell, textAlign: 'center', fontWeight: 'bold', fontSize: '9px', color: on20 !== null ? appr?.col : '#9ca3af' }}>
                      {on20 !== null ? (isEnSys ? `${appr?.g} — ${appr?.txt}` : appr?.text) : '—'}
                    </td>
                  </tr>
                );
              })}

              <tr>
                <td colSpan={isAnnuel ? 4 : isTrimestre ? 3 : 1} style={{ ...gtot, textAlign: 'right' }}>
                  TOTAL {isEnSys ? group.label.split('/')[1].trim() : group.label.split('/')[0].trim()}
                </td>
                <td style={{ ...gtot, textAlign: 'center', color: gs.avg !== null ? (gPassed ? '#059669' : '#dc2626') : '#6b7280' }}>
                  {gs.avg !== null ? gs.avg : '—'}
                </td>
                <td style={{ ...gtot, textAlign: 'center' }}>{gs.coefSum || '—'}</td>
                <td style={{ ...gtot, textAlign: 'center' }}>{gs.pts || '—'}</td>
                <td style={{ ...gtot, textAlign: 'center' }}>—</td>
                <td style={{ ...gtot, textAlign: 'center', color: gAppr?.col }}>
                  {gs.avg !== null ? (isEnSys ? `${gAppr?.g} — ${gAppr?.txt}` : gAppr?.text) : '—'}
                </td>
              </tr>
            </tbody>
          );
        })}
      </table>

      {/* Pied officiel à 3 blocs : Discipline · Travail de l'élève · Profil de la classe */}
      <table className="apc-keep" style={{ width: '100%', borderCollapse: 'collapse', marginTop: 5 }}>
        <tbody>
          <tr>
            <td style={{ width: '34%', verticalAlign: 'top', paddingRight: 4 }}>
              <Mini title={L(sys, 'Discipline', 'Discipline')}>
                <KV k={L(sys, 'Abs. non just. (h)', 'Unjust. abs. (h)')} v={abs.absNJ || 0} />
                <KV k={L(sys, 'Abs. just. (h)', 'Just. abs. (h)')} v={abs.absJ || 0} />
                <KV k={L(sys, 'Avert. travail', 'Work warning')} v={abs.averTravail || 0} />
                <KV k={L(sys, 'Blâme travail', 'Work reprimand')} v={abs.blameTravail || 0} />
                <KV k={L(sys, 'Avert. conduite', 'Conduct warning')} v={abs.averConduite || 0} />
                <KV k={L(sys, 'Blâme conduite', 'Conduct reprimand')} v={abs.blameConduite || 0} />
                <KV k={L(sys, 'Exclusions (jours)', 'Exclusions (days)')} v={abs.exclusions || 0} />
                <KV k={L(sys, 'Conduite', 'Conduct')} v={abs.conduite ? conduiteLabel(sys, abs.conduite) : '—'} />
              </Mini>
            </td>
            <td style={{ width: '34%', verticalAlign: 'top', paddingRight: 4 }}>
              <Mini title={L(sys, "Travail de l'élève", "Student's work")}>
                <KV k={L(sys, 'Total général', 'Grand total')} v={gPts || '—'} />
                <KV k="Coef" v={gCoef || '—'} />
                <KV k={L(sys, 'Moyenne', 'Average')} v={studentAvg !== null ? `${studentAvg}/${maxScale}` : '—'} strong />
                <KV k={L(sys, 'Rang', 'Rank')} v={`${rank?.rankD || '—'} / ${stats?.total ?? '—'}`} strong />
                <KV k={L(sys, 'Appréciation', 'Grade')} v={isEnSys ? (apprGlobal?.g || '—') : (apprGlobal?.text || '—')} />
                <KV k={L(sys, "Tableau d'honneur", 'Honor roll')} v={(abs.th || abs.encouragement || abs.felicitation) ? L(sys, 'Oui', 'Yes') : L(sys, 'Non', 'No')} />
                <KV k={L(sys, 'Décision', 'Decision')} v={studentAvg !== null ? decision : '—'} strong />
              </Mini>
            </td>
            <td style={{ width: '32%', verticalAlign: 'top' }}>
              <Mini title={L(sys, 'Profil de la classe', 'Class profile')}>
                <KV k={L(sys, 'Moyenne générale', 'General average')} v={stats?.avg != null ? `${stats.avg}/${maxScale}` : '—'} />
                <KV k="[Min – Max]" v={stats?.min != null && stats?.max != null ? `${stats.min} – ${stats.max}` : '—'} />
                <KV k={L(sys, 'Nombre de moyennes', 'Number of averages')} v={stats?.total ?? '—'} />
                <KV k={L(sys, 'Taux de réussite', 'Pass rate')} v={stats?.above != null && stats?.total ? `${Math.round((stats.above / stats.total) * 100)}%` : '—'} />
              </Mini>
            </td>
          </tr>
        </tbody>
      </table>
      <table className="apc-keep" style={{ width: '100%', borderCollapse: 'collapse', marginTop: 3 }}>
        <tbody><tr><td style={{ ...cell, height: 30, verticalAlign: 'top' }}>
          <strong>{L(sys, "Appréciation du travail de l'élève (points forts et points à améliorer)",
                  "Remarks on the student's work (strengths and areas to improve)")}</strong>
          {workAppreciation ? <div style={{ marginTop: 2, whiteSpace: 'pre-wrap' }}>{workAppreciation}</div> : null}
        </td></tr></tbody>
      </table>

      {/* Signatures officielles à 3 colonnes (Parent · Prof principal · Chef d'établissement) */}
      <OfficialSignatures school={school} sys={sys} profPrincipal={profPrincipal} />
    </OfficialSheet>
  );
}

// ── Bulletin Primaire (annuel — T1 + T2 + T3 côte à côte) ────────────────────
function BulletinPrimaire({ school, cls, student, subjects, studentAvg, rank, stats, sys, teachers, gradeMap, classId, qrSrc }) {
  const passThreshold = sys === 'FR' ? 10 : 50;
  const maxScale      = sys === 'FR' ? 20 : 100;
  const passed        = studentAvg !== null && studentAvg >= passThreshold;
  const decision      = sys === 'FR' ? (passed ? 'Admis(e)' : 'Ajourné(e)') : (passed ? 'Passed' : 'Failed');
  const apprGlobal    = getAppreciation(studentAvg, school?.grade_scale, sys);

  const getGrade = (subjectId, seq) => {
    const v = (gradeMap[`${classId}_${student.id}_${seq}`] || {})[subjectId];
    if (!v || v === 'ABS' || v === '') return null;
    const n = parseFloat(v);
    return isNaN(n) ? null : n;
  };

  const getAnnual = (sub) => {
    const vals = [1, 2, 3].map((s) => getGrade(sub.id, s)).filter((x) => x !== null);
    if (!vals.length) return null;
    return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100;
  };

  return (
    <div className="bulletin-paper" style={{ fontFamily: bulletinFontFamily(school) }}>
      <BulletinPrimaryHeader school={school} qrSrc={qrSrc} />

      <div className="bulletin-school">
        <h1>{school?.name || (sys === 'EN' ? 'School' : 'Établissement')}</h1>
        <p>
          {school?.address ? `B.P. ${school.address} · ` : ''}
          {school?.phone || ''}
          {school?.type ? ` · ${sys === 'EN' ? 'Ed.' : 'Ens.'} ${school.type}` : ''}
        </p>
        <p>{sys === 'EN' ? 'Academic year' : 'Année scolaire'} : <strong>{school?.current_year || '—'}</strong></p>
      </div>

      <div className="bulletin-title">
        {sys === 'EN' ? 'Annual Primary Report Card' : 'Bulletin Annuel — Enseignement Primaire / Annual Primary Report Card'}
      </div>

      <div className="bulletin-student" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <BulletinPhoto src={student.photo_url} width={56} height={70} />
        <div className="bulletin-student-grid" style={{ flex: 1 }}>
          <div><strong>{sys === 'EN' ? 'Name' : 'Nom / Name'} :</strong>&nbsp;{student.name}</div>
          <div><strong>{sys === 'EN' ? 'Reg. No.' : 'Matricule'} :</strong>&nbsp;{student.matricule || '—'}</div>
          <div><strong>{sys === 'EN' ? 'Class' : 'Classe / Class'} :</strong>&nbsp;{cls?.name || '—'}</div>
          <div><strong>{sys === 'EN' ? 'Level' : 'Niveau'} :</strong>&nbsp;{cls?.level || '—'}</div>
          <div><strong>{sys === 'EN' ? 'Sex' : 'Sexe / Sex'} :</strong>&nbsp;{student.gender || '—'}</div>
          <div><strong>{sys === 'EN' ? 'Rank' : 'Rang / Rank'} :</strong>&nbsp;{rank?.rankD || '—'} / {stats?.total ?? '—'}</div>
        </div>
      </div>

      <table className="bulletin-table">
        <thead>
          <tr>
            <th style={{ width: '28%', textAlign: 'left' }}>Matière / Subject</th>
            <th>T1/{maxScale}</th>
            <th>T2/{maxScale}</th>
            <th>T3/{maxScale}</th>
            <th>Moy. Ann/{maxScale}</th>
            <th>Coef</th>
            <th style={{ width: '18%' }}>Appréciation</th>
          </tr>
        </thead>
        <tbody>
          {subjects.map((sub) => {
            const t1     = getGrade(sub.id, 1);
            const t2     = getGrade(sub.id, 2);
            const t3     = getGrade(sub.id, 3);
            const annual = getAnnual(sub);
            const appr   = annual !== null
              ? getAppreciation(sys === 'FR' ? (annual / sub.max) * 20 : (annual / sub.max) * 100, school?.grade_scale, sys)
              : null;
            const gradeColor = annual !== null
              ? (annual / sub.max >= passThreshold / maxScale ? '#059669' : '#dc2626')
              : '#6b7280';
            const subTeacher = teachers?.find((t) => t.id === sub.teacher_id);
            const abs = <span style={{ color: '#9ca3af' }}>—</span>;
            return (
              <tr key={sub.id}>
                <td className="subject-name">
                  <span>{sub.name}</span>
                  {subTeacher && (
                    <span style={{ display: 'block', fontSize: '0.7em', color: '#6b7280', fontWeight: 'normal' }}>
                      {subTeacher.name}
                    </span>
                  )}
                </td>
                <td style={{ textAlign: 'center', color: '#374151' }}>{t1 !== null ? t1 : abs}</td>
                <td style={{ textAlign: 'center', color: '#374151' }}>{t2 !== null ? t2 : abs}</td>
                <td style={{ textAlign: 'center', color: '#374151' }}>{t3 !== null ? t3 : abs}</td>
                <td className="grade-cell" style={{ color: gradeColor }}>
                  {annual !== null ? annual : abs}
                </td>
                <td style={{ textAlign: 'center' }}>{sub.coef}</td>
                <td className="appreciation-cell" style={{ color: appr?.col || '#9ca3af' }}>
                  {sys === 'FR' ? (appr?.text || '—') : (appr ? `${appr.g} — ${appr.txt}` : '—')}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="bulletin-bottom">
        <div className="bulletin-box">
          <div className="bulletin-box-title">Résultats Annuels / Annual Results</div>
          <div className="bulletin-box-body">
            <p><span>Moyenne Ann. / Average</span>
              <strong style={{ color: passed ? '#059669' : '#dc2626' }}>
                {studentAvg !== null ? `${studentAvg}/${maxScale}` : '—'}
              </strong>
            </p>
            <p><span>Rang / Rank</span><strong>{rank?.rankD || '—'} / {stats?.total ?? '—'}</strong></p>
            <p><span>Appréciation</span>
              <strong style={{ color: apprGlobal?.col }}>
                {sys === 'FR' ? (apprGlobal?.text || '—') : (apprGlobal ? `${apprGlobal.g} — ${apprGlobal.txt}` : '—')}
              </strong>
            </p>
            <p><span>Décision / Decision</span>
              <strong style={{ color: passed ? '#059669' : '#dc2626' }}>{decision}</strong>
            </p>
          </div>
        </div>
        <div className="bulletin-box">
          <div className="bulletin-box-title">Statistiques de classe / Class Stats</div>
          <div className="bulletin-box-body">
            <p><span>Effectif / Total</span><strong>{stats?.total ?? '—'}</strong></p>
            <p><span>Moy. classe / Class avg</span>
              <strong>{stats?.avg != null ? `${stats.avg}/${maxScale}` : '—'}</strong>
            </p>
            <p><span>Note max / Highest</span>
              <strong>{stats?.max != null ? `${stats.max}/${maxScale}` : '—'}</strong>
            </p>
            <p><span>Note min / Lowest</span>
              <strong>{stats?.min != null ? `${stats.min}/${maxScale}` : '—'}</strong>
            </p>
            <p><span>Taux réussite / Pass rate</span>
              <strong>
                {stats?.above != null && stats?.total
                  ? `${stats.above}/${stats.total} (${Math.round((stats.above / stats.total) * 100)}%)`
                  : '—'}
              </strong>
            </p>
          </div>
        </div>
      </div>

      <div className="bulletin-remark">
        <div className="bulletin-remark-title">Observations</div>
      </div>
      <div className="bulletin-signatures">
        <div className="bulletin-sig-block">
          {school?.signature_url && (
            <AssetImg src={school.signature_url} alt="Signature" className="bulletin-sig-img" />
          )}
          {school?.stamp_url && (
            <AssetImg src={school.stamp_url} alt="Tampon" className="bulletin-stamp-img" />
          )}
          <span>Le Directeur / The Principal</span>
        </div>
        <div>Le Maître / La Maîtresse</div>
        <div>Parent / Tuteur / Guardian</div>
      </div>
    </div>
  );
}

// ── Bulletin Annuel Secondaire (T1 / T2 / T3 / Moy.Ann) ──────────────────────
function BulletinAnnuelSecondaire({ school, cls, student, subjects, subjectGrades, studentAvg, rank, stats, sys, teachers, gradeMap, classId, annualDecision, qrSrc }) {
  const passThreshold = sys === 'FR' ? 10 : 50;
  const maxScale      = sys === 'FR' ? 20 : 100;
  const passed        = studentAvg !== null && studentAvg >= passThreshold;

  // Décision annuelle : valeur posée explicitement par l'admin, sinon dérivée du seuil.
  const DECISIONS_FR = {
    admis:      'Admis(e) en classe supérieure',
    redouble:   'Autorisé(e) à redoubler',
    renvoye:    'Exclu(e) de l\'établissement',
    rattrapage: 'Examen de rattrapage',
  };
  const DECISIONS_EN = {
    admis: 'Promoted', redouble: 'Repeats class', renvoye: 'Dismissed', rattrapage: 'Resit exam',
  };
  const decisionMap = sys === 'EN' ? DECISIONS_EN : DECISIONS_FR;
  const decision = annualDecision && decisionMap[annualDecision]
    ? decisionMap[annualDecision]
    : (sys === 'FR' ? (passed ? 'Admis(e) en classe supérieure' : 'Autorisé(e) à redoubler') : (passed ? 'Promoted' : 'Repeats class'));
  const apprGlobal    = getAppreciation(studentAvg, school?.grade_scale, sys);

  // EN: 3 terms (seq 1/2/3) — FR: 6 sequences grouped in 3 trimestres (seq 1-2/3-4/5-6)
  const isEN      = sys === 'EN';
  const termSeqs  = isEN ? [[1], [2], [3]] : [[1, 2], [3, 4], [5, 6]];
  const allSeqs   = isEN ? [1, 2, 3] : [1, 2, 3, 4, 5, 6];
  const termLabel = isEN
    ? ['Term 1', 'Term 2', 'Term 3']
    : ['T1', 'T2', 'T3'];

  const { absJ, absNJ, conduite } = getAbsCond(gradeMap, classId, student.id, allSeqs);

  const termAvg = (subId, seqs) => {
    const vals = seqs
      .map((i) => {
        const v = (gradeMap[`${classId}_${student.id}_${i}`] || {})[subId];
        return !v || v === 'ABS' || v === '' ? null : parseFloat(v);
      })
      .filter((x) => x !== null && !isNaN(x));
    if (!vals.length) return null;
    return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100;
  };

  const abs = <span style={{ color: '#9ca3af' }}>—</span>;

  return (
    <div className="bulletin-paper" style={{ fontFamily: bulletinFontFamily(school) }}>
      <BulletinPrimaryHeader school={school} qrSrc={qrSrc} />

      <div className="bulletin-school">
        <h1>{school?.name || (isEN ? 'School' : 'Établissement')}</h1>
        <p>
          {school?.address ? `B.P. ${school.address} · ` : ''}
          {school?.phone || ''}
          {school?.type ? ` · ${isEN ? 'Ed.' : 'Ens.'} ${school.type}` : ''}
        </p>
        <p>{isEN ? 'Academic year' : 'Année scolaire'} : <strong>{school?.current_year || '—'}</strong></p>
      </div>

      <div className="bulletin-title">
        {isEN ? 'Annual Report Card' : 'Bulletin Annuel / Annual Report Card'}
      </div>

      <div className="bulletin-student" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <BulletinPhoto src={student.photo_url} width={56} height={70} />
        <div className="bulletin-student-grid" style={{ flex: 1 }}>
          <div><strong>Nom / Name :</strong>&nbsp;{student.name}</div>
          <div><strong>Matricule :</strong>&nbsp;{student.matricule || '—'}</div>
          <div><strong>Classe / Class :</strong>&nbsp;{cls?.name || '—'}</div>
          <div><strong>Sexe / Sex :</strong>&nbsp;{student.gender || '—'}</div>
          <div><strong>Rang / Rank :</strong>&nbsp;{rank?.rankD || '—'} / {stats?.total ?? '—'}</div>
          <div><strong>Effectif / Total :</strong>&nbsp;{stats?.total ?? '—'}</div>
        </div>
      </div>

      <table className="bulletin-table">
        <thead>
          <tr>
            <th style={{ width: '26%', textAlign: 'left' }}>{isEN ? 'Subject' : 'Matière / Subject'}</th>
            <th>{termLabel[0]}/{maxScale}</th>
            <th>{termLabel[1]}/{maxScale}</th>
            <th>{termLabel[2]}/{maxScale}</th>
            <th>{isEN ? 'Ann.' : 'Moy.Ann'}/{maxScale}</th>
            <th>Coef</th>
            <th style={{ width: '18%' }}>{isEN ? 'Grade' : 'Appréciation'}</th>
          </tr>
        </thead>
        <tbody>
          {subjects.map((sub) => {
            const t1     = termAvg(sub.id, termSeqs[0]);
            const t2     = termAvg(sub.id, termSeqs[1]);
            const t3     = termAvg(sub.id, termSeqs[2]);
            const annual = subjectGrades[sub.id];
            const appr   = annual !== null
              ? getAppreciation(sys === 'FR' ? (annual / sub.max) * 20 : (annual / sub.max) * 100, school?.grade_scale, sys)
              : null;
            const gradeColor = annual !== null
              ? (annual / sub.max >= passThreshold / maxScale ? '#059669' : '#dc2626')
              : '#6b7280';
            const subTeacher = teachers?.find((t) => t.id === sub.teacher_id);
            return (
              <tr key={sub.id}>
                <td className="subject-name">
                  <span>{sub.name}</span>
                  {subTeacher && (
                    <span style={{ display: 'block', fontSize: '0.7em', color: '#6b7280', fontWeight: 'normal' }}>
                      {subTeacher.name}
                    </span>
                  )}
                </td>
                <td style={{ textAlign: 'center', color: '#374151' }}>{t1 !== null ? t1 : abs}</td>
                <td style={{ textAlign: 'center', color: '#374151' }}>{t2 !== null ? t2 : abs}</td>
                <td style={{ textAlign: 'center', color: '#374151' }}>{t3 !== null ? t3 : abs}</td>
                <td className="grade-cell" style={{ color: gradeColor, fontWeight: 700 }}>
                  {annual !== null ? annual : abs}
                </td>
                <td style={{ textAlign: 'center' }}>{sub.coef}</td>
                <td className="appreciation-cell" style={{ color: appr?.col || '#9ca3af' }}>
                  {sys === 'FR' ? (appr?.text || '—') : (appr ? `${appr.g} — ${appr.txt}` : '—')}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="bulletin-bottom">
        <div className="bulletin-box">
          <div className="bulletin-box-title">{isEN ? 'Annual Results' : 'Résultats Annuels / Annual Results'}</div>
          <div className="bulletin-box-body">
            <p><span>{isEN ? 'Annual Average' : 'Moyenne Ann. / Average'}</span>
              <strong style={{ color: passed ? '#059669' : '#dc2626' }}>
                {studentAvg !== null ? `${studentAvg}/${maxScale}` : '—'}
              </strong>
            </p>
            <p><span>Rang / Rank</span><strong>{rank?.rankD || '—'} / {stats?.total ?? '—'}</strong></p>
            <p><span>{isEN ? 'Grade' : 'Appréciation'}</span>
              <strong style={{ color: apprGlobal?.col }}>
                {sys === 'FR' ? apprGlobal?.text : (apprGlobal ? `${apprGlobal.g} — ${apprGlobal.txt}` : '—')}
              </strong>
            </p>
            <p><span>{isEN ? 'Decision' : 'Décision / Decision'}</span>
              <strong style={{ color: passed ? '#059669' : '#dc2626' }}>{decision}</strong>
            </p>
          </div>
        </div>
        <div className="bulletin-box">
          <div className="bulletin-box-title">{isEN ? 'Class Statistics' : 'Statistiques / Class Stats'}</div>
          <div className="bulletin-box-body">
            <p><span>Effectif / Total</span><strong>{stats?.total ?? '—'}</strong></p>
            <p><span>{isEN ? 'Class average' : 'Moy. classe / Class avg'}</span>
              <strong>{stats?.avg != null ? `${stats.avg}/${maxScale}` : '—'}</strong>
            </p>
            <p><span>{isEN ? 'Highest mark' : 'Note max / Highest'}</span>
              <strong>{stats?.max != null ? `${stats.max}/${maxScale}` : '—'}</strong>
            </p>
            <p><span>{isEN ? 'Lowest mark' : 'Note min / Lowest'}</span>
              <strong>{stats?.min != null ? `${stats.min}/${maxScale}` : '—'}</strong>
            </p>
            <p><span>{isEN ? 'Pass rate' : 'Taux réussite / Pass rate'}</span>
              <strong>
                {stats?.above != null && stats?.total
                  ? `${stats.above}/${stats.total} (${Math.round((stats.above / stats.total) * 100)}%)`
                  : '—'}
              </strong>
            </p>
          </div>
        </div>
      </div>

      <div className="bulletin-absences-row">
        <span>Absences just. / Just. absences : <strong>{absJ > 0 ? `${absJ} h` : '—'}</strong></span>
        <span>Absences non just. / Unjust. absences : <strong>{absNJ > 0 ? `${absNJ} h` : '—'}</strong></span>
        {conduite && (
          <span>
            Conduite / Conduct :&nbsp;
            <strong style={{ color: CONDUITE_COLORS[conduite] }}>
              {conduite} — {CONDUITE_LABELS[conduite]}
            </strong>
          </span>
        )}
      </div>

      <div className="bulletin-remark">
        <div className="bulletin-remark-title">Observations / Remarks</div>
      </div>
      <div className="bulletin-signatures">
        <div className="bulletin-sig-block">
          {school?.signature_url && (
            <AssetImg src={school.signature_url} alt="Signature" className="bulletin-sig-img" />
          )}
          {school?.stamp_url && (
            <AssetImg src={school.stamp_url} alt="Tampon" className="bulletin-stamp-img" />
          )}
          <span>Le Directeur<br />The Principal</span>
        </div>
        <div>Le Prof. Principal<br />The Form Master</div>
        <div>Parent / Tuteur<br />Parent / Guardian</div>
      </div>
    </div>
  );
}

// ── Bulletin Maternelle (grille A / EA / NA par trimestre) ────────────────────
const COMP_BUL_COLORS = { A: '#059669', EA: '#d97706', NA: '#dc2626' };

function BulletinMaternelle({ school, cls, student, subjects, teachers, gradeMap, classId, qrSrc }) {
  const getComp = (subjectId, seq) => {
    const v = (gradeMap[`${classId}_${student.id}_${seq}`] || {})[subjectId];
    return v || '';
  };

  return (
    <div className="bulletin-paper" style={{ fontFamily: bulletinFontFamily(school) }}>
      <BulletinPrimaryHeader school={school} qrSrc={qrSrc} />

      <div className="bulletin-school">
        <h1>{school?.name || 'Établissement'}</h1>
        <p>
          {school?.address ? `B.P. ${school.address} · ` : ''}
          {school?.phone || ''}
          {school?.type ? ` · Ens. ${school.type}` : ''}
        </p>
        <p>Année scolaire : <strong>{school?.current_year || '—'}</strong></p>
      </div>

      <div className="bulletin-title">
        Bulletin de Compétences — Maternelle / Pre-Primary Competency Report
      </div>

      <div className="bulletin-student" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <BulletinPhoto src={student.photo_url} width={56} height={70} />
        <div className="bulletin-student-grid" style={{ flex: 1 }}>
          <div><strong>Nom / Name :</strong>&nbsp;{student.name}</div>
          <div><strong>Classe / Class :</strong>&nbsp;{cls?.name || '—'}</div>
          <div><strong>Niveau :</strong>&nbsp;{cls?.level || '—'}</div>
          <div><strong>Sexe / Sex :</strong>&nbsp;{student.gender || '—'}</div>
        </div>
      </div>

      <table className="bulletin-table">
        <thead>
          <tr>
            <th style={{ width: '46%', textAlign: 'left' }}>Domaine / Compétence</th>
            <th>Trimestre 1</th>
            <th>Trimestre 2</th>
            <th>Trimestre 3</th>
          </tr>
        </thead>
        <tbody>
          {subjects.map((sub) => {
            const subTeacher = teachers?.find((t) => t.id === sub.teacher_id);
            return (
              <tr key={sub.id}>
                <td className="subject-name">
                  <span>{sub.name}</span>
                  {subTeacher && (
                    <span style={{ display: 'block', fontSize: '0.7em', color: '#6b7280', fontWeight: 'normal' }}>
                      {subTeacher.name}
                    </span>
                  )}
                </td>
                {[1, 2, 3].map((seq) => {
                  const c = getComp(sub.id, seq);
                  return (
                    <td key={seq} style={{ textAlign: 'center' }}>
                      {c ? (
                        <span style={{
                          display:       'inline-block',
                          padding:       '1px 8px',
                          borderRadius:  3,
                          background:    COMP_BUL_COLORS[c] + '20',
                          color:         COMP_BUL_COLORS[c],
                          fontWeight:    700,
                          fontSize:      '0.78em',
                          border:        `1px solid ${COMP_BUL_COLORS[c]}40`,
                        }}>
                          {c}
                        </span>
                      ) : (
                        <span style={{ color: '#9ca3af' }}>—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="apc-legend" style={{ marginTop: 8 }}>
        <strong>Légende / Legend :</strong>
        <span style={{ color: '#059669' }}>■ A — Acquis / Achieved</span>
        <span style={{ color: '#d97706' }}>■ EA — En cours d'Acquisition / In Progress</span>
        <span style={{ color: '#dc2626' }}>■ NA — Non Acquis / Not Achieved</span>
      </div>

      <div className="bulletin-remark">
        <div className="bulletin-remark-title">Observations</div>
      </div>
      <div className="bulletin-signatures">
        <div className="bulletin-sig-block">
          {school?.signature_url && (
            <AssetImg src={school.signature_url} alt="Signature" className="bulletin-sig-img" />
          )}
          {school?.stamp_url && (
            <AssetImg src={school.stamp_url} alt="Tampon" className="bulletin-stamp-img" />
          )}
          <span>La Directrice / Le Directeur</span>
        </div>
        <div>L'Éducatrice / L'Éducateur</div>
        <div>Parent / Tuteur / Guardian</div>
      </div>
    </div>
  );
}

// ── Dispatcher selon le cycle et le format ────────────────────────────────────
function BulletinRenderer({ format, gradeMap, classId, cycle, period, countryCode, annualDecision, ...props }) {
  // Guinea Ecuatorial : boletín oficial espagnol pour TOUS les cycles.
  // (Pas de BulletinMaternelle FR ni de BulletinPrimaire FR pour ce profil.)
  if (countryCode === 'guinea_eq') {
    const BoletinComp = format === 'boletin_detalle' ? BoletinGEDetalle : BoletinGE;
    return <BoletinComp {...props} period={period} gradeMap={gradeMap} classId={classId} annualDecision={annualDecision} />;
  }
  if (cycle === 'maternelle') {
    return <BulletinMaternelle {...props} gradeMap={gradeMap} classId={classId} />;
  }
  if (cycle === 'primaire' && period.seqs.length === 3) {
    return <BulletinPrimaire {...props} gradeMap={gradeMap} classId={classId} />;
  }
  if (cycle === 'secondaire' && period.value === 'annuel' && format !== 'modern' && format !== 'apc') {
    return <BulletinAnnuelSecondaire {...props} gradeMap={gradeMap} classId={classId} annualDecision={annualDecision} />;
  }
  if (format === 'modern') return <BulletinModern {...props} period={period} gradeMap={gradeMap} classId={classId} />;
  if (format === 'apc')    return <BulletinAPC    {...props} period={period} gradeMap={gradeMap} classId={classId} />;
  return <BulletinClassic {...props} period={period} gradeMap={gradeMap} classId={classId} />;
}

// ── Sélecteur de décision annuelle ────────────────────────────────────────────
// Persiste sous gradeMap[<class>_<student>_<lastSeq>]['__decision__'].
// Visible uniquement pour les bulletins annuels (Admin only).
function AnnualDecisionPicker({ classId, studentId, lastSeq, current, countryCode }) {
  const saveGrade = useSchoolStore((s) => s.saveGrade);
  const t = useT();

  // Décisions par pays — affichées dans la langue du système.
  const DECISIONS = {
    cameroon_fr: [
      { value: 'admis',      label: 'Admis(e) en classe supérieure' },
      { value: 'redouble',   label: 'Autorisé(e) à redoubler' },
      { value: 'renvoye',    label: 'Exclu(e) de l\'établissement' },
      { value: 'rattrapage', label: 'Examen de rattrapage' },
    ],
    cameroon_en: [
      { value: 'admis',      label: 'Promoted to next class' },
      { value: 'redouble',   label: 'Allowed to repeat the class' },
      { value: 'renvoye',    label: 'Dismissed from the school' },
      { value: 'rattrapage', label: 'Resit examination required' },
    ],
    guinea_eq: [
      { value: 'admis',      label: 'Aprobado — pasa al curso siguiente' },
      { value: 'redouble',   label: 'Repite el curso' },
      { value: 'renvoye',    label: 'Expulsado del centro' },
      { value: 'rattrapage', label: 'Examen de recuperación' },
    ],
  };
  const options = DECISIONS[countryCode] || DECISIONS.cameroon_fr;

  const handleChange = async (e) => {
    const val = e.target.value;
    await saveGrade(classId, studentId, lastSeq, { __decision__: val });
  };

  return (
    <div className="mb-4 p-3 rounded-xl border border-amber-200 bg-amber-50 no-print">
      <label className="text-xs font-semibold text-amber-900 uppercase tracking-wider block mb-1.5">
        {countryCode === 'guinea_eq'
          ? 'Decisión del Consejo de Curso (anual)'
          : t('Décision du conseil de classe (annuel)', 'End-of-year council decision')}
      </label>
      <select
        className="form-input bg-white"
        value={current || ''}
        onChange={handleChange}
      >
        <option value="">
          {countryCode === 'guinea_eq' ? '— Automática según media —'
            : t('— Automatique d\'après la moyenne —', '— Auto from average —')}
        </option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

// ── Éditeur d'appréciation du travail de l'élève (par élève & par période) ────
// Persiste sous gradeMap[<class>_<student>_<lastSeq>]['__appreciation__'] — même
// mécanisme que la décision annuelle. Écriture au blur (pas à chaque frappe).
function AppreciationEditor({ classId, studentId, lastSeq, current, sys }) {
  const saveGrade = useSchoolStore((s) => s.saveGrade);
  const t = useT();
  const [val, setVal] = useState(current || '');
  useEffect(() => { setVal(current || ''); }, [current, studentId, lastSeq]);
  const commit = async () => {
    if ((current || '') === (val || '')) return;
    await saveGrade(classId, studentId, lastSeq, { __appreciation__: val });
  };
  return (
    <div className="mb-4 p-3 rounded-xl border border-sky-200 bg-sky-50 no-print">
      <label className="text-xs font-semibold text-sky-900 uppercase tracking-wider block mb-1.5">
        {L(sys, "Appréciation du travail de l'élève", "Remarks on the student's work", 'Apreciación del trabajo del alumno')}
      </label>
      <textarea
        className="form-input bg-white"
        rows={2}
        placeholder={L(sys, 'Points forts et points à améliorer…', 'Strengths and areas to improve…', 'Puntos fuertes y a mejorar…')}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={commit}
      />
      <p className="text-xs text-sky-700/70 mt-1">
        {t('Saisie par élève et par période — apparaît sur le bulletin.', 'Per student and period — shown on the report card.')}
      </p>
    </div>
  );
}

// ── Page principale ───────────────────────────────────────────────────────────
function WatermarkWrap({ active, children }) {
  if (!active) return children;
  return (
    <div style={{ position: 'relative' }}>
      {children}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 10,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden',
      }}>
        <span style={{
          transform: 'rotate(-35deg)',
          fontSize: '4rem', fontWeight: 900, letterSpacing: '0.05em',
          color: 'rgba(99,102,241,0.12)',
          textTransform: 'uppercase', whiteSpace: 'nowrap', userSelect: 'none',
        }}>
          NotesCam Starter
        </span>
      </div>
    </div>
  );
}


export default function Bulletins() {
  const t = useT();
  const { plan, f } = usePlan();

  const PERIODS = [
    { value: 'seq_1',  label: t('Séquence 1',  'Sequence 1'),  short: 'Séq 1', seqs: [1] },
    { value: 'seq_2',  label: t('Séquence 2',  'Sequence 2'),  short: 'Séq 2', seqs: [2] },
    { value: 'seq_3',  label: t('Séquence 3',  'Sequence 3'),  short: 'Séq 3', seqs: [3] },
    { value: 'seq_4',  label: t('Séquence 4',  'Sequence 4'),  short: 'Séq 4', seqs: [4] },
    { value: 'seq_5',  label: t('Séquence 5',  'Sequence 5'),  short: 'Séq 5', seqs: [5] },
    { value: 'seq_6',  label: t('Séquence 6',  'Sequence 6'),  short: 'Séq 6', seqs: [6] },
    { value: 'term_1', label: t('Trimestre 1', 'Quarter 1'),   short: 'T1',    seqs: [1, 2] },
    { value: 'term_2', label: t('Trimestre 2', 'Quarter 2'),   short: 'T2',    seqs: [3, 4] },
    { value: 'term_3', label: t('Trimestre 3', 'Quarter 3'),   short: 'T3',    seqs: [5, 6] },
    { value: 'annuel', label: t('Annuel',       'Annual'),      short: 'Ann.',  seqs: [1, 2, 3, 4, 5, 6] },
  ];

  const PERIODS_PRIMAIRE = [
    { value: 'tri_1',  label: t('Trimestre 1', 'Quarter 1'), short: 'T1',   seqs: [1] },
    { value: 'tri_2',  label: t('Trimestre 2', 'Quarter 2'), short: 'T2',   seqs: [2] },
    { value: 'tri_3',  label: t('Trimestre 3', 'Quarter 3'), short: 'T3',   seqs: [3] },
    { value: 'annuel', label: t('Annuel',       'Annual'),    short: 'Ann.', seqs: [1, 2, 3] },
  ];

  const rawSchool      = useAuthStore((s) => s.school);
  const role           = useAuthStore((s) => s.role);
  const teacherId      = useAuthStore((s) => s.teacherId);
  const schoolLanguage = rawSchool?.language || 'francophone';
  const classes        = useSchoolStore((s) => s.classes);
  const schoolUnits    = useSchoolStore((s) => s.schoolUnits);
  const subjects = useSchoolStore((s) => s.subjects);
  const students = useSchoolStore((s) => s.students);
  const gradeMap = useSchoolStore((s) => s.gradeMap);
  const teachers = useSchoolStore((s) => s.teachers);
  const apcReferentiel = useSchoolStore((s) => s.apcReferentiel);
  const apcNotes       = useSchoolStore((s) => s.apcNotes);
  const loadApc        = useSchoolStore((s) => s.loadApc);
  const scReferentiel  = useSchoolStore((s) => s.scReferentiel);
  const loadSc         = useSchoolStore((s) => s.loadSc);
  const matReferentiel  = useSchoolStore((s) => s.matReferentiel);
  const matObservations = useSchoolStore((s) => s.matObservations);
  const loadMat         = useSchoolStore((s) => s.loadMat);
  const primReferentiel = useSchoolStore((s) => s.primReferentiel);
  const primNotes       = useSchoolStore((s) => s.primNotes);
  const loadPrim        = useSchoolStore((s) => s.loadPrim);

  const myTeacher       = role === 'teacher' ? teachers.find((t) => t.id === teacherId) : null;

  const FORMATS = [
    { key: 'classic',     label: t('Classique',   'Classic'),    icon: '📄' },
    { key: 'modern',      label: t('Moderne',     'Modern'),     icon: '✨' },
    { key: 'apc',         label: 'APC',                          icon: '🎯' },
  ];

  // Guinea Ecuatorial : deux modelos oficiales (sin terminología camerunesa).
  const GE_FORMATS = [
    { key: 'boletin',         label: 'Clásico',   icon: '📄' },
    { key: 'boletin_detalle', label: 'Detallado', icon: '🗂️' },
  ];
  const canPrint        = role !== 'teacher' || (myTeacher?.can_print_bulletin ?? true);

  const classId   = useUiStore((s) => s.bulletinsClassId);
  const setClassId   = useUiStore((s) => s.setBulletinsClassId);
  const periodKey = useUiStore((s) => s.bulletinsPeriodKey);
  const setPeriodKey = useUiStore((s) => s.setBulletinsPeriodKey);
  const studentId = useUiStore((s) => s.bulletinsStudentId);
  const setStudentId = useUiStore((s) => s.setBulletinsStudentId);
  const format    = useUiStore((s) => s.bulletinsFormat);
  const setFormat    = useUiStore((s) => s.setBulletinsFormat);

  const [printAll,        setPrintAll]        = useState(false);
  const [sectionFilter,   setSectionFilter]   = useState('');
  const [showOrderModal,  setShowOrderModal]  = useState(false);
  const [sidebarSearch,   setSidebarSearch]   = useState('');
  const [screenshotBlur,  setScreenshotBlur]  = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [printCount,      setPrintCount]      = useState(() => {
    if (typeof window === 'undefined') return 0;
    try {
      const info = JSON.parse(localStorage.getItem('nc_print_daily') || '{}');
      const today = new Date().toISOString().split('T')[0];
      return info.date === today ? (info.count || 0) : 0;
    } catch { return 0; }
  });

  const selectedClass = classes.find((c) => c.id === classId) || null;

  // Identité effective des documents = école SURCHARGÉE par l'unité pédagogique
  // de la classe sélectionnée (logo/cachet/directeur/adresse/devise du primaire,
  // du collège…). Sans unité, `school` reste l'objet école (zéro régression).
  // Les champs non-identité (country_system, bulletin_engine, ge_grade_max, année,
  // police…) sont préservés → moteurs et officiels du pays inchangés.
  const school = useMemo(
    () => classIdentity(rawSchool, selectedClass, schoolUnits),
    [rawSchool, selectedClass, schoolUnits],
  );

  // ── Filtre par SECTION (raccourcit le sélecteur de classe) ───────────────────
  // On choisit d'abord la section (maternelle / primaire / 1er cycle / 2nd cycle)
  // puis la classe filtrée. École mono-section → auto-sélectionnée.
  const availableSections = useMemo(() => {
    const present = new Set(classes.map(classSectionKey));
    return SECTIONS.filter((s) => present.has(s.key));
  }, [classes]);
  const effectiveSection = sectionFilter
    || (selectedClass ? classSectionKey(selectedClass) : '')
    || (availableSections.length === 1 ? availableSections[0].key : '');
  const visibleClasses = useMemo(
    () => (effectiveSection ? classes.filter((c) => classSectionKey(c) === effectiveSection) : []),
    [classes, effectiveSection],
  );

  const cycle         = selectedClass?.cycle || 'secondaire';
  const sys           = selectedClass?.system || 'FR';
  // Moteur pédagogique résolu PAR CLASSE : 'classic' | 'apc' | 'sc'. Les bulletins
  // 'apc'/'sc' (MINESEC officiels) sont des PDF — pas d'aperçu React : on remplace
  // le sélecteur de format + l'aperçu classique par le panneau d'export dédié.
  const classEngine   = resolveClassEngine(school, selectedClass);
  // APC (premier cycle) ET Second Cycle (lycée) sont désormais des APERÇUS ÉCRAN
  // imprimables (window.print), comme les autres bulletins — plus d'export PDF lourd.
  const isApc         = classEngine === 'apc';
  const isSc          = classEngine === 'sc';
  const isPrim        = classEngine === 'apc_primaire';   // primaire APC (compétences /10)
  const isMat         = classEngine === 'maternelle';     // maternelle (domaines A/ECA/NA)
  // Les bulletins officiels MINESEC sont des FORMATS de plus (à côté de Classique/
  // Moderne/APC), pas un remplacement : affichés seulement si l'utilisateur les
  // choisit. APC (1er cycle) → 'apc_officiel' ; Second Cycle (lycée) → 'sc_officiel'.
  const showApcOfficial = isApc && format === 'apc_officiel';
  const showScOfficial  = isSc  && format === 'sc_officiel';
  const showPrimOfficial = isPrim && format === 'prim_officiel';
  const showMatOfficial  = isMat  && format === 'mat_officiel';
  // On ajoute l'option officielle adaptée à la classe sans retirer les autres.
  const formatsForClass = isApc
    ? [...FORMATS, { key: 'apc_officiel', label: t('APC officiel', 'Official APC'), icon: '🏛️' }]
    : isSc
      ? [...FORMATS, { key: 'sc_officiel', label: t('2nd cycle officiel', 'Official 2nd cycle'), icon: '🏛️' }]
    : isPrim
      ? [...FORMATS, { key: 'prim_officiel', label: t('Primaire APC officiel', 'Official Primary APC'), icon: '🏛️' }]
    : isMat
      ? [...FORMATS, { key: 'mat_officiel', label: t('Maternelle officiel', 'Official Nursery'), icon: '🏛️' }]
      : FORMATS;
  // Options de notation GE (échelle /10 ou /20, coef primaire) — {} hors GE.
  const gOpts         = gradingOpts(school, cycle);

  // Périodes Guinea Ecuatorial — 3 trimestres en espagnol + anual.
  const PERIODS_GE = [
    { value: 'trim_1', label: 'Primer Trimestre',  short: '1T',   seqs: [1] },
    { value: 'trim_2', label: 'Segundo Trimestre', short: '2T',   seqs: [2] },
    { value: 'trim_3', label: 'Tercer Trimestre',  short: '3T',   seqs: [3] },
    { value: 'anual',  label: 'Anual',              short: 'Anu.', seqs: [1, 2, 3] },
  ];

  // Résolution du pays — pilote la liste des périodes au-delà de FR/EN.
  const schoolCountryCode = resolveCountryCode(school);

  // Nature de la classe résolue par la SECTION (détectée par le nom → fiable même si
  // le champ `cycle` en base est erroné) + les moteurs résolus. Maternelle & primaire
  // fonctionnent par TRIMESTRE ; collège/lycée par séquences (ou terms en anglais).
  const selClassSection  = classSectionKey(selectedClass);
  const isFundamentalClass = isMat || isPrim || selClassSection === 'maternelle' || selClassSection === 'primaire';
  const isSecondaryClass   = !isFundamentalClass && (isApc || isSc || cycle === 'secondaire' || selClassSection === 'premier_cycle' || selClassSection === 'second_cycle');

  const periodsForClass =
    // APC officiel : 6 séquences + 3 trimestres + annuel, quel que soit le système
    // (le référentiel MINESEC est trimestriel à 2 séquences ; l'annuel agrège T1/T2/T3).
    showApcOfficial
      ? PERIODS
      : schoolCountryCode === 'guinea_eq'
        ? PERIODS_GE
        : isFundamentalClass
          ? PERIODS_PRIMAIRE
          : sys === 'EN' ? PERIODS_EN : PERIODS;
  const period = periodsForClass.find((p) => p.value === periodKey) || periodsForClass[0] || PERIODS[0];

  const classSubjects = useMemo(() =>
    subjects.filter((s) => s.class_id === classId).sort(bySubjectOrder),
    [subjects, classId]
  );

  // Matières composites — liste AFFICHÉE sur le bulletin selon le réglage école.
  // Le calcul des moyennes utilise toujours `classSubjects` (liste complète, le
  // moteur exclut les enfants) ; seul l'AFFICHAGE des lignes change ici.
  //   synthetic : matières principales uniquement.
  //   detailed  : matières + sous-composantes en retrait (« ↳ »).
  const bulletinMode = school?.bulletin_subject_mode === 'detailed' ? 'detailed' : 'synthetic';
  const displaySubjects = useMemo(() => {
    if (!classSubjects.some((s) => s.parent_id)) return classSubjects;
    if (bulletinMode === 'detailed') {
      return classSubjects.map((s) => (s.parent_id ? { ...s, name: '↳ ' + s.name } : s));
    }
    return classSubjects.filter((s) => !s.parent_id);
  }, [classSubjects, bulletinMode]);
  const classStudents = useMemo(() =>
    students.filter((s) => s.class_id === classId).sort((a, b) => a.name.localeCompare(b.name)),
    [students, classId]
  );
  const selectedStudent = classStudents.find((s) => s.id === studentId) || null;

  // ── APC (premier cycle) — données du bulletin officiel pour l'aperçu écran ───
  // Charge le référentiel à la sélection d'une classe APC (idempotent côté store).
  useEffect(() => { if (isApc) loadApc(); }, [isApc, loadApc]);

  // Slug de classe référentiel ('6e'…'3e') + résolution séquence(s) de la période.
  // Période = 1 séquence (bulletin de séquence) OU 2 séquences (trimestre).
  const apcClasseSlug = isApc ? firstCycleClasseSlug(selectedClass?.level, selectedClass?.name) : null;
  const apcAnnual     = isApc && period.value === 'annuel';   // bulletin annuel (T1+T2+T3)
  const apcSeqNums    = period.seqs;                       // [1] | [1,2] | [1..6] (annuel)
  const apcTrimId     = SEQ_TO_TRIM[apcSeqNums[0]] || 't1';
  const apcSeqIds = useMemo(() => {
    if (!isApc || !apcReferentiel) return [];
    const all = apcReferentiel.sequences || [];
    return apcSeqNums.map((num) => {
      const trimSeqs = sequencesOfTrimestre(all, SEQ_TO_TRIM[num]);   // triées par numero
      const byGlobal = trimSeqs.find((s) => s.numero === num);        // numero global (1..6)
      if (byGlobal) return byGlobal.id;
      const pos = (num % 2 === 1) ? 0 : 1;                            // sinon position dans le trimestre
      return (trimSeqs[pos] || trimSeqs[0])?.id;
    }).filter(Boolean);
  }, [isApc, apcReferentiel, apcSeqNums.join(',')]);

  const apcProfPrincipal = teachers.find((tc) => tc.id === selectedClass?.teacher_id)?.name || '';
  const apcTeacherMap = useMemo(
    () => (isApc && apcReferentiel ? teacherByMatiereMap(apcReferentiel.matieres, classSubjects, teachers) : {}),
    [isApc, apcReferentiel, classSubjects, teachers],
  );

  // Données assemblées par élève. Annuel → assembleApcAnnual (T1/T2/T3 par matière) ;
  // sinon assemblePeriod (séquence ou trimestre, par compétence).
  const apcDataById = useMemo(() => {
    if (!isApc || !apcReferentiel || !apcClasseSlug) return {};
    const out = {};
    for (const s of classStudents) {
      out[s.id] = apcAnnual
        ? assembleApcAnnual(apcReferentiel, apcNotes, { classeSlug: apcClasseSlug, student: s, teacherByMatiere: apcTeacherMap, gradeScale: school?.grade_scale })
        : assemblePeriod(apcReferentiel, apcNotes, { classeSlug: apcClasseSlug, trimestreId: apcTrimId, seqIds: apcSeqIds, student: s, teacherByMatiere: apcTeacherMap, gradeScale: school?.grade_scale });
    }
    return out;
  }, [isApc, apcAnnual, apcReferentiel, apcClasseSlug, apcTrimId, apcSeqIds, classStudents, apcNotes, apcTeacherMap, school?.grade_scale]);

  // Rangs (moyennes générales) + profil de la classe pour le pied du bulletin.
  const apcRanks = useMemo(() => {
    if (!isApc) return {};
    const avgById = {};
    Object.entries(apcDataById).forEach(([id, d]) => { avgById[id] = d?.moyenneGenerale ?? null; });
    return Object.fromEntries(buildApcRanks(classStudents, avgById).map((r) => [r.id, r.rang]));
  }, [isApc, apcDataById, classStudents]);

  const apcClassStats = useMemo(() => {
    if (!isApc) return null;
    const avgs = Object.values(apcDataById).map((d) => d?.moyenneGenerale).filter((v) => v != null);
    if (!avgs.length) return null;
    const sum = avgs.reduce((a, b) => a + b, 0);
    return {
      min: Math.min(...avgs), max: Math.max(...avgs),
      avg: Math.round((sum / avgs.length) * 100) / 100, count: avgs.length,
      rate: Math.round((avgs.filter((a) => a >= 10).length / avgs.length) * 100),
    };
  }, [isApc, apcDataById]);

  // Titre officiel selon la période (séquence isolée ou trimestre complet).
  const apcTitle = useMemo(() => {
    if (!isApc) return '';
    const en = sys === 'EN';
    if (apcAnnual) return en ? 'ANNUAL REPORT CARD' : 'BULLETIN ANNUEL';
    if (apcSeqNums.length >= 2) {
      return { t1: en ? 'FIRST TERM REPORT CARD'  : 'BULLETIN SCOLAIRE DU PREMIER TRIMESTRE',
               t2: en ? 'SECOND TERM REPORT CARD' : 'BULLETIN SCOLAIRE DU DEUXIÈME TRIMESTRE',
               t3: en ? 'THIRD TERM REPORT CARD'  : 'BULLETIN SCOLAIRE DU TROISIÈME TRIMESTRE' }[apcTrimId];
    }
    const n = apcSeqNums[0];
    if (en) return `SEQUENCE ${n} REPORT CARD`;
    const ord = { 1: 'PREMIÈRE', 2: 'DEUXIÈME', 3: 'TROISIÈME', 4: 'QUATRIÈME', 5: 'CINQUIÈME', 6: 'SIXIÈME' }[n] || '';
    return `BULLETIN DE LA ${ord} SÉQUENCE`;
  }, [isApc, apcAnnual, sys, apcSeqNums.join(','), apcTrimId]);

  // Prêt à afficher : référentiel chargé + classe reconnue 1er cycle + des élèves.
  const apcReady = isApc && !!apcReferentiel && !!apcClasseSlug && classStudents.length > 0;

  // ── PRIMAIRE APC (SIL–CM2) — données du bulletin officiel (aperçu écran) ─────
  useEffect(() => { if (isPrim) loadPrim(); }, [isPrim, loadPrim]);
  const primNiveauSlug = isPrim ? primaireNiveauSlug(selectedClass?.level, selectedClass?.name) : null;
  const PRIM_GRADE_MAX = 10;
  const primAnnual = isPrim && period.value === 'annuel'; // moyenne annuelle = UA1..UA8
  // UA (Unité d'Apprentissage, 1-8) couvertes par la période courante — la saisie
  // se fait par UA, pas par trimestre (carnet officiel MINEDUB).
  const primUAs = primAnnual ? [1, 2, 3, 4, 5, 6, 7, 8] : (UA_PAR_TRIMESTRE[period.seqs?.[0] || 1] || [1, 2, 3]);
  const primBareme = primReferentiel?.bareme?.length ? primReferentiel.bareme : PRIM_COTE_DEFAULT;

  // Barème (critères + points_max) d'UNE compétence pour UN élève — l'aptitude
  // sportive ne joue que pour '6a' (deux profils de barème possibles).
  const primCriteresFor = (compId, student) => {
    const aptitude = compId === '6a' && student?.sport_aptitude === 'inapte' ? 'inapte' : 'apte';
    return criteresForCompetence(primReferentiel, primNiveauSlug, compId, aptitude);
  };

  // Moyenne /10 d'une compétence sur la période : moyenne des pourcentages
  // (points obtenus / points du barème officiel, variable par compétence) de
  // chaque UA notée — ramenée à /10 pour rester comparable à l'échelle historique
  // du bulletin (cote, classement, moyenne générale inchangés).
  const primCompAvg = (eleveId, compId, student) => {
    const criteres = primCriteresFor(compId, student);
    if (!criteres.length) return null;
    const pcts = primUAs.map((ua) => {
      const notesByCritere = {};
      for (const cr of criteres) {
        const r = primNotes[primNkey(eleveId, compId, cr.id, ua)];
        if (r?.note != null && r.note !== '') notesByCritere[cr.id] = r.note;
      }
      const { achieved, possible } = competencePointsTotal(notesByCritere, criteres);
      return achieved != null && possible ? (achieved / possible) * 100 : null;
    }).filter((v) => v != null);
    if (!pcts.length) return null;
    const avgPct = pcts.reduce((a, b) => a + b, 0) / pcts.length;
    return Math.round((avgPct / 100 * PRIM_GRADE_MAX) * 100) / 100;
  };

  // Détail par critère (moyenne simple des UA de la période, sur l'échelle du
  // barème officiel de ce critère) — pour l'affichage détaillé du bulletin
  // trimestriel. { [critere_id]: { note, max, nom } }.
  const primNotesByCritereFor = (eleveId, compId, student) => {
    const criteres = primCriteresFor(compId, student);
    const out = {};
    for (const cr of criteres) {
      const vals = primUAs
        .map((ua) => primNotes[primNkey(eleveId, compId, cr.id, ua)]?.note)
        .filter((v) => v != null && v !== '')
        .map(Number);
      if (vals.length) out[cr.id] = { note: Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100, max: cr.points_max, nom: cr.nom };
    }
    return out;
  };

  const primDataById = useMemo(() => {
    if (!isPrim || !primReferentiel || !primNiveauSlug) return {};
    const comps = competencesForNiveau(primReferentiel, primNiveauSlug);
    const out = {};
    for (const s of classStudents) {
      const rows = comps.map((c) => {
        const moyenne = primCompAvg(s.id, c.id, s);
        const coef = c.coefficient == null ? 1 : Number(c.coefficient) || 1;
        const cote = primCote(moyenne, PRIM_GRADE_MAX, primBareme);
        // L'appréciation APC = le libellé de la cote (« Acquis », « En cours
        // d'acquisition »…) — dérivée, jamais saisie. Absente sur compétence non notée.
        const notesByCritere = primNotesByCritereFor(s.id, c.id, s);
        return { code: c.code, intitule: c.intitule, moyenne, coef, cote: cote ? cote.cote : null, appreciation: cote ? cote.libelle : '', notesByCritere };
      });
      const moyenneGenerale = primGeneralAverage(rows.map((r) => ({ moyenne: r.moyenne, coef: r.coef })));
      const cg = primCote(moyenneGenerale, PRIM_GRADE_MAX, primBareme);
      out[s.id] = { rows, moyenneGenerale, coteGenerale: cg ? cg.cote : null, appreciationGenerale: cg ? cg.libelle : '' };
    }
    return out;
  }, [isPrim, primReferentiel, primNiveauSlug, classStudents, primNotes, primUAs.join(',')]);

  const primRanks = useMemo(() => {
    if (!isPrim) return {};
    const avgById = {};
    Object.entries(primDataById).forEach(([id, d]) => { avgById[id] = d?.moyenneGenerale ?? null; });
    return Object.fromEntries(buildPrimRanks(classStudents, avgById).map((r) => [r.id, r.rang]));
  }, [isPrim, primDataById, classStudents]);

  const primClassStats = useMemo(() => {
    if (!isPrim) return null;
    const avgs = Object.values(primDataById).map((d) => d?.moyenneGenerale).filter((v) => v != null);
    if (!avgs.length) return null;
    const sum = avgs.reduce((a, b) => a + b, 0);
    return {
      min: Math.min(...avgs), max: Math.max(...avgs),
      avg: Math.round((sum / avgs.length) * 100) / 100, count: avgs.length,
      rate: Math.round((avgs.filter((a) => a >= PRIM_GRADE_MAX / 2).length / avgs.length) * 100),
    };
  }, [isPrim, primDataById]);

  // Détail par compétence × UA — un mini-tableau par compétence avec Notes/Cote
  // par UA, TOTAL et COTE, fidèle au carnet officiel MINEDUB. Affiché sur TOUS
  // les bulletins (trimestriel ET annuel) : `primUAs` borne déjà les UA à la
  // période courante (UA1-3 pour le Trimestre 1, les 8 en vue Annuel). Calculé
  // à la demande (pas en useMemo : seulement quelques élèves affichés à la fois,
  // coût négligeable).
  const primAnnualRowsFor = (student) => {
    if (!isPrim || !primReferentiel || !primNiveauSlug) return [];
    const comps = competencesForNiveau(primReferentiel, primNiveauSlug);
    return comps.map((c) => {
      const criteres = primCriteresFor(c.id, student);
      const uas = primUAs.map((ua) => {
        const notesByCritere = {};
        for (const cr of criteres) {
          const r = primNotes[primNkey(student.id, c.id, cr.id, ua)];
          if (r?.note != null && r.note !== '') notesByCritere[cr.id] = r.note;
        }
        const { achieved, possible } = competencePointsTotal(notesByCritere, criteres);
        const cote = achieved != null ? primCote(achieved, possible, primBareme) : null;
        return { ua, trimestre: trimestreOfUA(ua), notesByCritere, achieved, possible, cote: cote?.cote || null };
      });
      const notedUAs = uas.filter((u) => u.achieved != null);
      const totalPossible = criteres.reduce((a, cr) => a + (cr.points_max || 0), 0);
      const totalAchieved = notedUAs.length
        ? Math.round((notedUAs.reduce((a, u) => a + u.achieved, 0) / notedUAs.length) * 100) / 100
        : null;
      const totalCote = totalAchieved != null ? primCote(totalAchieved, totalPossible, primBareme) : null;
      return { code: c.code, intitule: c.intitule, criteres, uas, totalAchieved, totalPossible, totalCote: totalCote?.cote || null };
    });
  };

  const primTitle = (() => {
    const n = period.seqs?.[0] || 1;
    if (period.value === 'annuel') return 'BULLETIN ANNUEL — PRIMAIRE APC';
    return `BULLETIN DU ${['PREMIER', 'DEUXIÈME', 'TROISIÈME'][n - 1] || ''} TRIMESTRE — PRIMAIRE APC`;
  })();
  const primReady = isPrim && !!primReferentiel && !!primNiveauSlug && classStudents.length > 0;

  // ── MATERNELLE (PS/MS/GS) — données du bulletin officiel (aperçu écran) ──────
  useEffect(() => { if (isMat) loadMat(); }, [isMat, loadMat]);
  const matTrimId = `t${period.seqs?.[0] || 1}`;
  const matDomaines = useMemo(() => domainesForMaternelle(matReferentiel), [matReferentiel]);

  const matDataById = useMemo(() => {
    if (!isMat || !matReferentiel) return {};
    const out = {};
    for (const s of classStudents) {
      out[s.id] = {
        rows: matDomaines.map((d) => {
          const r = matObservations[obsNkey(s.id, d.id, matTrimId)];
          return { code: d.code, intitule: d.intitule, niveau: r?.niveau_acquis || '', observation: r?.observation || '' };
        }),
      };
    }
    return out;
  }, [isMat, matReferentiel, matDomaines, classStudents, matObservations, matTrimId]);

  const matTitle = (() => {
    const n = period.seqs?.[0] || 1;
    return `BULLETIN DU ${['PREMIER', 'DEUXIÈME', 'TROISIÈME'][n - 1] || ''} TRIMESTRE — MATERNELLE`;
  })();
  const matReady = isMat && !!matReferentiel && classStudents.length > 0;

  // ── Second Cycle (lycée) — données du bulletin officiel pour l'aperçu écran ──
  // SC réutilise le moteur de NOTES classique (subjects + gradeMap). On charge le
  // référentiel pour RÉSOUDRE le groupe (Groupe 1/2) et la charge horaire des
  // matières qui n'ont pas été auto-configurées (sinon « Groupe 99 »).
  useEffect(() => { if (isSc) loadSc(); }, [isSc, loadSc]);

  const scEnrichedSubjects = useMemo(() => {
    if (!isSc) return classSubjects;
    const serieId  = (selectedClass?.serie || '').toLowerCase();
    const classeId = secondCycleClasseSlug(selectedClass?.level, selectedClass?.name);
    if (!scReferentiel || !serieId || !classeId) return classSubjects;
    const rows = matieresForSerieClasse(scReferentiel, { serieId, classeId });
    if (!rows.length) return classSubjects;
    const byName = new Map(rows.map((r) => [normName(r.nom), r]));
    // Enrichit MATIÈRE PAR MATIÈRE (celles déjà groupées sont laissées telles quelles) :
    // groupe (1/2) + charge + coef résolus depuis le référentiel selon la SÉRIE.
    return classSubjects.map((s) => {
      if (s.sc_groupe_ordre != null) return s;
      const r = byName.get(normName(s.name));
      if (!r) return s;
      return {
        ...s,
        sc_groupe_ordre: r.groupe_ordre,        // 1 ou 2 → libellé GROUPE 1/2 dérivé
        sc_groupe: undefined,                   // laisse assembleScBulletin nommer proprement
        charge_horaire: s.charge_horaire ?? r.charge_horaire,
        coef: (s.coef != null && s.coef !== 1) ? s.coef : (r.coefficient || s.coef),
      };
    });
  }, [isSc, classSubjects, scReferentiel, selectedClass]);

  const scProfPrincipal = apcProfPrincipal;     // même résolution (prof. de la classe)
  const scSerieLabel    = selectedClass?.serie ? `Série ${String(selectedClass.serie).toUpperCase()}` : '';
  const scTrimId        = period.seqs.length >= 4 ? 'annual' : (SEQ_TO_TRIM[period.seqs[0]] || 't1');
  const scTitle = useMemo(() => {
    if (!showScOfficial) return '';
    const en = sys === 'EN';
    if (period.seqs.length >= 4) return en ? 'ANNUAL REPORT CARD' : 'BULLETIN DE NOTES ANNUEL';
    if (period.seqs.length >= 2) {
      return { t1: en ? 'FIRST TERM REPORT CARD'  : 'BULLETIN DE NOTES DU PREMIER TRIMESTRE',
               t2: en ? 'SECOND TERM REPORT CARD' : 'BULLETIN DE NOTES DU DEUXIÈME TRIMESTRE',
               t3: en ? 'THIRD TERM REPORT CARD'  : 'BULLETIN DE NOTES DU TROISIÈME TRIMESTRE' }[scTrimId];
    }
    const n = period.seqs[0];
    return en ? `SEQUENCE ${n} REPORT CARD` : `BULLETIN DE NOTES — SÉQUENCE ${n}`;
  }, [showScOfficial, sys, period.seqs.join(','), scTrimId]);

  const scDataById = useMemo(() => {
    if (!showScOfficial || !scEnrichedSubjects.length || !classStudents.length) return {};
    const subs = scEnrichedSubjects;
    const teachersById = teacherIndexById(teachers);
    const { ranks, stats } = perSubjectRanksAndStats(subs, gradeMap, classId, period.seqs, classStudents);
    const stats2 = classProfile(subs, gradeMap, classId, period.seqs, classStudents, sys, gOpts);
    const ranked = buildRanks(classStudents, gradeMap, classId, period.seqs, subs, sys, {}, gOpts);
    const generalRankById = Object.fromEntries(ranked.map((s) => [s.id, s.rankD]));
    const pass = (gOpts.maxScale ?? (sys === 'EN' ? 100 : 20)) / 2;
    const isAnnual = period.seqs.length >= 4;
    const out = {};
    for (const s of classStudents) {
      const data = assembleScBulletin({
        subjects: subs, allGrades: gradeMap, classId, student: s, seqs: period.seqs,
        sys, opts: gOpts, gradeScale: school?.grade_scale,
        subjectRanks: ranks, subjectStats: stats, classStats: stats2, teachersById,
        generalRank: generalRankById[s.id],
      });
      const discipline = scDisciplineConseil(gradeMap, classId, s.id, period.seqs);
      const fallback = isAnnual && data.moyenneGenerale != null ? (data.moyenneGenerale >= pass ? 'Admis(e)' : '') : '';
      out[s.id] = { data, discipline, decision: discipline.decision || fallback };
    }
    return out;
  }, [showScOfficial, scEnrichedSubjects, gradeMap, classId, period.seqs, classStudents, sys, gOpts.maxScale, gOpts.useCoef, school?.grade_scale, teachers]);

  // QR (data-URL) par élève pour le bulletin — même payload que la carte scolaire
  // (buildCardId) → un scan identifie l'élève de façon cohérente.
  const [qrMap, setQrMap] = useState({});
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!school?.id || !classStudents.length) { setQrMap({}); return; }
      const map = {};
      for (const s of classStudents) {
        map[s.id] = await qrDataUrl(buildCardId(school.id, s.id));
      }
      if (!cancelled) setQrMap(map);
    })();
    return () => { cancelled = true; };
  }, [school?.id, classStudents]);

  // Reset period + student when class ACTUALLY changes (skip on mount to preserve persisted state)
  const prevClassIdRef = useRef(null);
  useEffect(() => {
    if (prevClassIdRef.current === null) { prevClassIdRef.current = classId; return; }
    if (prevClassIdRef.current === classId) return;
    prevClassIdRef.current = classId;
    setStudentId('');
    setSidebarSearch('');
    const cls = classes.find((c) => c.id === classId);
    const newSys   = cls?.system || 'FR';
    // Section détectée par le nom → trimestres pour maternelle/primaire, séquences
    // (ou terms) pour collège/lycée. Robuste même si `cycle` en base est erroné.
    const newSection = classSectionKey(cls);
    const newFundamental = newSection === 'maternelle' || newSection === 'primaire' || (cls?.cycle && cls.cycle !== 'secondaire');
    if (schoolCountryCode === 'guinea_eq') setPeriodKey('trim_1');
    else if (newFundamental)               setPeriodKey('tri_1');
    else if (newSys === 'EN')              setPeriodKey('term_1');
    else                                   setPeriodKey('seq_1');
    // Format par défaut selon la classe (les autres formats restent disponibles) :
    // APC → 'apc_officiel' ; Second Cycle → 'sc_officiel' ; sinon on quitte un
    // format officiel devenu inapplicable.
    const newEngine = resolveClassEngine(school, cls);
    if (newEngine === 'apc')                                     setFormat('apc_officiel');
    else if (newEngine === 'sc')                                 setFormat('sc_officiel');
    else if (newEngine === 'apc_primaire')                       setFormat('prim_officiel');
    else if (newEngine === 'maternelle')                         setFormat('mat_officiel');
    else if (['apc_officiel', 'sc_officiel', 'prim_officiel', 'mat_officiel'].includes(format)) setFormat('classic');
  }, [classId, classes]);

  const ranks = useMemo(() => {
    if (cycle === 'maternelle' || !classStudents.length || !classSubjects.length) return [];
    return buildRanks(classStudents, gradeMap, classId, period.seqs, classSubjects, sys, {}, gOpts);
  }, [cycle, classStudents, classSubjects, gradeMap, classId, period.seqs, sys, gOpts.maxScale, gOpts.useCoef]);

  const stats = useMemo(() => {
    if (cycle === 'maternelle' || !classStudents.length || !classSubjects.length) return null;
    return clsStat(classStudents, gradeMap, classId, period.seqs, classSubjects, sys, {}, gOpts);
  }, [cycle, classStudents, classSubjects, gradeMap, classId, period.seqs, sys, gOpts.maxScale, gOpts.useCoef]);

  // APC officiel : notes toujours sur /20 (cotes MINESEC) → seuil 10 quel que soit le système.
  const passThreshold = showApcOfficial ? 10 : sys === 'ES' ? geGradeMax(school) / 2 : sys === 'FR' ? 10 : 50;

  const admisCount = useMemo(() => {
    // Maternelle : pas de réussite/échec (évaluation par domaines, non chiffrée).
    if (isMat || cycle === 'maternelle' || !classStudents.length) return null;
    // Primaire APC : moyenne générale /10 issue du référentiel (seuil 5), PAS de gradeMap.
    if (isPrim) {
      return classStudents.filter((s) => {
        const avg = primDataById[s.id]?.moyenneGenerale;
        return avg != null && avg >= 5;
      }).length;
    }
    // APC premier cycle : moyenne générale /20 issue du référentiel (seuil 10).
    if (isApc) {
      return classStudents.filter((s) => {
        const avg = apcDataById[s.id]?.moyenneGenerale;
        return avg != null && avg >= 10;
      }).length;
    }
    // Classique / Second Cycle : moyenne calculée depuis les notes (gradeMap).
    if (!classSubjects.length) return null;
    return classStudents.filter((s) => {
      const subjectGrades = {};
      classSubjects.forEach((sub) => {
        subjectGrades[sub.id] = subjectGrade(sub, s.id, classId, period.seqs, gradeMap);
      });
      const scores = {};
      Object.entries(subjectGrades).forEach(([id, g]) => { if (g !== null) scores[id] = String(g); });
      const avg = getAvg(scores, classSubjects, sys, gOpts);
      return avg !== null && avg >= passThreshold;
    }).length;
  }, [classStudents, classSubjects, classId, period.seqs, gradeMap, sys, cycle, passThreshold, gOpts.maxScale, gOpts.useCoef, isMat, isPrim, isApc, primDataById, apcDataById]);

  const bulletinDataFor = useCallback((student) => {
    const thisCycle = classes.find((c) => c.id === classId)?.cycle || 'secondaire';

    if (thisCycle === 'maternelle') {
      return { subjectGrades: {}, studentAvg: null, rank: null };
    }

    const subjectGrades = {};
    classSubjects.forEach((sub) => {
      subjectGrades[sub.id] = subjectGrade(sub, student.id, classId, period.seqs, gradeMap);
    });
    const scores = {};
    Object.entries(subjectGrades).forEach(([id, g]) => { if (g !== null) scores[id] = String(g); });
    // Matières composites : la note d'une matière parente est calculée depuis
    // ses enfants (le moteur exclut les enfants de la moyenne générale).
    if (classSubjects.some((s) => s.parent_id)) {
      const { g: eff } = resolveScores(scores, classSubjects);
      classSubjects.forEach((sub) => {
        if (!sub.parent_id && subjectGrades[sub.id] === null && eff[sub.id] !== undefined) {
          subjectGrades[sub.id] = parseFloat(eff[sub.id]);
        }
      });
    }
    const avg  = getAvg(scores, classSubjects, sys, gOpts);
    const rank = ranks.find((r) => r.id === student.id) || null;
    return { subjectGrades, studentAvg: avg, rank };
  }, [classSubjects, classId, period.seqs, gradeMap, sys, ranks, classes, gOpts.maxScale, gOpts.useCoef]);

  useEffect(() => {
    if (!printAll) return;
    const timer = setTimeout(() => { window.print(); setPrintAll(false); }, 150);
    return () => clearTimeout(timer);
  }, [printAll]);

  // Protection capture d'écran : blur sur keydown, retire après 3s
  useEffect(() => {
    const onDown = (e) => { if (e.key === 'PrintScreen') setScreenshotBlur(true); };
    const onUp   = (e) => { if (e.key === 'PrintScreen') setTimeout(() => setScreenshotBlur(false), 3000); };
    document.addEventListener('keydown', onDown);
    document.addEventListener('keyup',   onUp);
    return () => {
      document.removeEventListener('keydown', onDown);
      document.removeEventListener('keyup',   onUp);
    };
  }, []);

  const printRemaining = plan === 'starter'
    ? Math.max(0, STARTER_DAILY_PRINT_LIMIT - printCount)
    : Infinity;

  const handlePrintSingle = () => {
    if (plan === 'starter') {
      if (printRemaining <= 0) { setShowUpgradeModal(true); return; }
      incrementDailyPrint();
      setPrintCount((c) => c + 1);
    }
    window.print();
  };

  const handlePrintAll = () => {
    if (plan === 'starter') { setShowUpgradeModal(true); return; }
    setPrintAll(true);
  };

  const handleChangeFormat = (key) => {
    setFormat(key);
  };

  const hasData = classSubjects.length > 0 && classStudents.length > 0;
  // Disponibilité de l'aperçu/impression : l'APC officiel s'appuie sur le référentiel
  // (pas sur classSubjects) ; les autres bulletins sur matières + élèves.
  const canShow = showApcOfficial ? apcReady
    : showPrimOfficial ? primReady
    : showMatOfficial  ? matReady
    : hasData;

  const countryCode = resolveCountryCode(school);

  // Décision annuelle — lue depuis le dernier slot de séquence (champ __decision__).
  // Stocke via Grades.jsx (champs spéciaux conseil de classe) ou via le sélecteur ci-dessous.
  const annualDecisionFor = (sid) => {
    const lastSeq = period?.seqs?.[period.seqs.length - 1];
    if (!lastSeq) return null;
    const slot = gradeMap?.[`${classId}_${sid}_${lastSeq}`] || {};
    return slot['__decision__'] || null;
  };

  // Appréciation LIBRE du travail de l'élève (points forts / à améliorer),
  // saisie par période et par élève. Stockée comme un champ spécial du conseil
  // (`__appreciation__`) sur le dernier slot de séquence de la période — même
  // mécanisme que la décision annuelle.
  const apcAppreciationFor = (sid) => {
    const lastSeq = period?.seqs?.[period.seqs.length - 1];
    if (!lastSeq) return '';
    return (gradeMap?.[`${classId}_${sid}_${lastSeq}`] || {})['__appreciation__'] || '';
  };

  // Libellé de la décision du conseil (bulletin APC annuel).
  const APC_DECISION_LABELS = {
    admis:      t('Admis(e) en classe supérieure', 'Promoted to next class'),
    redouble:   t('Autorisé(e) à redoubler', 'Allowed to repeat the class'),
    renvoye:    t("Exclu(e) de l'établissement", 'Dismissed from school'),
    rattrapage: t('Examen de rattrapage', 'Resit examination required'),
  };
  const apcDecisionLabel = (sid) => {
    const d = annualDecisionFor(sid);
    return d ? (APC_DECISION_LABELS[d] || d) : '';
  };

  // Rend le bon bulletin APC (annuel ou séquence/trimestre) pour un élève.
  const renderApcBulletin = (student) => {
    const data = apcDataById[student.id];
    if (!data) return null;
    const common = {
      school, sys, title: apcTitle,
      student, classLabel: selectedClass?.name || '',
      effectif: classStudents.length, profPrincipal: apcProfPrincipal,
      rang: apcRanks[student.id], classStats: apcClassStats, data,
      appreciation: apcAppreciationFor(student.id),
    };
    return (
      <WatermarkWrap key={student.id} active={f.watermark}>
        {apcAnnual
          ? <BulletinApcAnnual {...common} decision={apcDecisionLabel(student.id)} />
          : <BulletinApcOfficial {...common} />}
      </WatermarkWrap>
    );
  };

  // Rend le bulletin PRIMAIRE APC officiel d'un élève — détail par UA
  // (BulletinPrimAnnualUA), borné aux UA de la période choisie (`primUAs` :
  // UA1-3 pour le Trimestre 1, etc., les 8 en vue Annuel). Le détail par UA est
  // visible dès le premier trimestre, pas seulement en fin d'année.
  const renderPrimBulletin = (student) => {
    const d = primDataById[student.id];
    if (!d) return null;
    return (
      <WatermarkWrap key={student.id} active={f.watermark}>
        <BulletinPrimAnnualUA
          school={school} sys={sys} title={primTitle}
          student={student} classLabel={selectedClass?.name || ''}
          effectif={classStudents.length} profPrincipal={apcProfPrincipal}
          competenceRows={primAnnualRowsFor(student)}
          moyenneGenerale={d.moyenneGenerale} coteGenerale={d.coteGenerale}
          rang={primRanks[student.id]} classStats={primClassStats}
          appreciation={d.appreciationGenerale}
        />
      </WatermarkWrap>
    );
  };

  // Rend le bulletin MATERNELLE officiel d'un élève.
  const renderMatBulletin = (student) => {
    const d = matDataById[student.id];
    if (!d) return null;
    return (
      <WatermarkWrap key={student.id} active={f.watermark}>
        <BulletinMatOfficial
          school={school} sys={sys} title={matTitle}
          student={student} classLabel={selectedClass?.name || ''}
          effectif={classStudents.length} profPrincipal={apcProfPrincipal}
          rows={d.rows}
          decision={period?.seqs?.length >= 3 ? apcDecisionLabel(student.id) : ''}
        />
      </WatermarkWrap>
    );
  };

  const commonProps = {
    school, cls: selectedClass, subjects: displaySubjects,
    stats, sys, teachers, gradeMap, classId, cycle, classStudents,
    countryCode,
    maxScale: geGradeMax(school),
    useCoef: gOpts.useCoef ?? true,
  };

  return (
    <Layout>
      <div>
        {/* En-tête page */}
        <div className="flex flex-wrap justify-between items-center mb-4 gap-3 no-print">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t('Bulletins', 'Report Cards')}</h1>
            <p className="text-sm text-gray-500 mt-1">{t('Génération et impression des bulletins scolaires.', 'Generate and print student report cards.')}</p>
          </div>
          {canShow && classId && (
            <div className="flex items-center gap-2">
              {canPrint ? (
                <>
                  <button onClick={handlePrintAll} className="btn-secondary">
                    {t('Imprimer la classe', 'Print all')} ({classStudents.length})
                    {plan === 'starter' && (
                      <span className="ml-1 text-xs text-amber-500">🔒</span>
                    )}
                  </button>
                  {selectedStudent && (
                    <button
                      onClick={handlePrintSingle}
                      className="btn-primary no-print"
                      style={{ width: 'auto', paddingLeft: '1.5rem', paddingRight: '1.5rem' }}
                    >
                      {t('Imprimer ce bulletin', 'Print this report card')}
                      {plan === 'starter' && printRemaining < Infinity && (
                        <span className="ml-2 text-xs opacity-75">({printRemaining} {t('restant', 'left')})</span>
                      )}
                    </button>
                  )}
                </>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 text-amber-700 text-sm border border-amber-200">
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd"/></svg>
                  {t("Impression non autorisée par l'administrateur", 'Printing not authorized by the administrator')}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Sélecteur de format — masqué pour Guinea Ecuatorial (un seul format
            officiel). Pour les classes MINESEC, on AJOUTE l'option officielle
            (APC ou 2nd cycle) sans retirer Classique/Moderne/APC. */}
        {cycle === 'secondaire' && schoolCountryCode !== 'guinea_eq' && (
          <div className="flex flex-wrap items-center gap-3 mb-4 no-print">
            <span className="text-sm font-medium text-gray-500">{t('Format :', 'Format:')}</span>
            <div className="flex rounded-lg border border-gray-200 overflow-hidden">
              {formatsForClass.map(({ key, label, icon }) => (
                <button
                  key={key}
                  onClick={() => handleChangeFormat(key)}
                  className={`px-4 py-2 text-sm font-medium transition-colors ${
                    format === key
                      ? 'bg-brand-700 text-white'
                      : 'bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {icon} {label}
                </button>
              ))}
            </div>
            {format === 'apc_officiel' && (
              <span className="text-xs text-gray-400 italic">
                {t('Bulletin officiel MINESEC par compétences (référentiel)', 'Official MINESEC competency report card (framework)')}
              </span>
            )}
            {format === 'sc_officiel' && (
              <span className="text-xs text-gray-400 italic">
                {t('Bulletin officiel MINESEC du second cycle (matières par groupe)', 'Official MINESEC second-cycle report card (subjects by group)')}
              </span>
            )}
            {format === 'apc' && (
              <span className="text-xs text-gray-400 italic">
                {t('Approche Par Compétences — niveaux NA / EC / AQ / BA', 'Competency-Based Approach — levels NA / EC / AQ / BA')}
              </span>
            )}
            {format === 'modern' && (
              <span className="text-xs text-gray-400 italic">
                {t('Mise en page épurée avec barres de progression', 'Clean layout with progress bars')}
              </span>
            )}
          </div>
        )}

        {/* Guinea Ecuatorial — elección entre dos modelos oficiales de boletín */}
        {schoolCountryCode === 'guinea_eq' && cycle !== 'maternelle' && (
          <div className="mb-4 no-print">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-medium text-gray-500">Modelo de boletín :</span>
              <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                {GE_FORMATS.map(({ key, label, icon }) => {
                  const active = (format === 'boletin_detalle' ? 'boletin_detalle' : 'boletin') === key;
                  return (
                    <button
                      key={key}
                      onClick={() => handleChangeFormat(key)}
                      className={`px-4 py-2 text-sm font-medium transition-colors ${
                        active ? 'bg-emerald-700 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {icon} {label}
                    </button>
                  );
                })}
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-1.5 inline-flex items-center gap-1">
              📋 Boletín oficial — Ministerio de Educación de Guinea Ecuatorial
            </p>
          </div>
        )}

        {/* Sélecteurs section + classe + période */}
        <div className="flex flex-wrap gap-4 mb-5 no-print">
          {availableSections.length > 1 && (
            <div className="flex-1 min-w-[180px] max-w-xs">
              <label className="form-label">{t('Section', 'Section')}</label>
              <select
                className="form-input"
                value={effectiveSection}
                onChange={(e) => {
                  const v = e.target.value;
                  setSectionFilter(v);
                  if (selectedClass && classSectionKey(selectedClass) !== v) setClassId('');
                }}
              >
                <option value="">{t('Choisir une section…', 'Choose a section…')}</option>
                {availableSections.map((s) => (
                  <option key={s.key} value={s.key}>{t(s.fr, s.en, s.es)}</option>
                ))}
              </select>
            </div>
          )}

          <div className="flex-1 min-w-[180px] max-w-xs">
            <label className="form-label">{t('Classe', 'Class')}</label>
            <select className="form-input" value={classId} onChange={(e) => setClassId(e.target.value)} disabled={!effectiveSection}>
              <option value="">
                {effectiveSection ? t('Choisir…', 'Choose…') : t('Choisissez d’abord une section', 'Choose a section first')}
              </option>
              {visibleClasses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}{schoolLanguage === 'bilingue' ? ` [${c.system === 'EN' ? 'EN /100' : 'FR /20'}]` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Période — affichée pour TOUTES les classes. Maternelle & primaire sont
              par trimestre (le bulletin par domaines/compétences est trimestriel). */}
          {classId && (
            <div className="flex-1 min-w-[180px] max-w-xs">
              <label className="form-label">{t('Période', 'Period')}</label>
              <select className="form-input" value={periodKey} onChange={(e) => setPeriodKey(e.target.value)}>
                {isApc ? (
                  <>
                    <optgroup label={t('Séquences', 'Sequences')}>
                      {PERIODS.filter((p) => p.seqs.length === 1).map((p) => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                      ))}
                    </optgroup>
                    <optgroup label={t('Trimestres (moyenne de 2 séquences)', 'Quarters (average of 2 sequences)')}>
                      {PERIODS.filter((p) => p.seqs.length === 2).map((p) => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                      ))}
                    </optgroup>
                    <optgroup label={t('Récapitulatif', 'Summary')}>
                      <option value="annuel">{t('Annuel (T1 + T2 + T3)', 'Annual (T1 + T2 + T3)')}</option>
                    </optgroup>
                  </>
                ) : schoolCountryCode === 'guinea_eq' ? (
                  <>
                    <optgroup label="Trimestres">
                      {PERIODS_GE.filter((p) => p.value !== 'anual').map((p) => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                      ))}
                    </optgroup>
                    <optgroup label="Resumen">
                      <option value="anual">Anual (1T + 2T + 3T)</option>
                    </optgroup>
                  </>
                ) : isSecondaryClass && sys === 'EN' ? (
                  <>
                    <optgroup label="Terms">
                      {PERIODS_EN.filter((p) => p.value !== 'annuel').map((p) => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                      ))}
                    </optgroup>
                    <optgroup label="Summary">
                      <option value="annuel">Annual (Term 1 + Term 2 + Term 3)</option>
                    </optgroup>
                  </>
                ) : isSecondaryClass ? (
                  <>
                    <optgroup label={t('Séquences', 'Sequences')}>
                      {PERIODS.filter((p) => p.seqs.length === 1).map((p) => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                      ))}
                    </optgroup>
                    <optgroup label={t('Trimestres (moyenne de 2 séquences)', 'Quarters (average of 2 sequences)')}>
                      {PERIODS.filter((p) => p.seqs.length === 2).map((p) => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                      ))}
                    </optgroup>
                    <optgroup label={t('Récapitulatif', 'Summary')}>
                      <option value="annuel">{t('Annuel (T1 + T2 + T3)', 'Annual (Q1 + Q2 + Q3)')}</option>
                    </optgroup>
                  </>
                ) : (
                  PERIODS_PRIMAIRE.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))
                )}
              </select>
            </div>
          )}

          {isMat && classId && schoolCountryCode !== 'guinea_eq' && (
            <div className="flex items-end">
              <span className="px-3 py-2 rounded-lg text-xs font-semibold bg-rose-100 text-rose-700">
                {t('Maternelle — bulletin par domaines (par trimestre)', 'Nursery — report by domains (per term)')}
              </span>
            </div>
          )}

          {/* Réorganiser l'ordre des matières sur le bulletin (admin/direction) */}
          {classId && cycle !== 'maternelle' && classSubjects.length > 1 && role !== 'teacher' && (
            <div className="flex items-end">
              <button
                type="button"
                onClick={() => setShowOrderModal(true)}
                className="btn-secondary inline-flex items-center gap-1.5"
                style={{ width: 'auto' }}
                title={t('Changer l’ordre des matières sur le bulletin', 'Change subject order on the report card')}
              >
                <span aria-hidden>↕</span> {t('Ordre des matières', 'Subject order')}
              </button>
            </div>
          )}
        </div>

        {/* États vides */}
        {!classId && (
          <div className="bg-white rounded-xl p-12 text-center shadow-sm border border-gray-100">
            <div className="text-4xl mb-3">📋</div>
            <p className="text-gray-500 text-sm">{t('Sélectionnez une classe pour générer les bulletins.', 'Select a class to generate report cards.')}</p>
          </div>
        )}
        {classId && !showApcOfficial && !showPrimOfficial && !showMatOfficial && !hasData && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-sm text-amber-800">
            {t('Cette classe manque de données. Vérifiez que des', 'This class has no data. Make sure')}{' '}
            <a href="/app/classes" className="font-semibold underline">
              {cycle === 'maternelle' ? t('domaines de compétences', 'competency domains') : t('matières', 'subjects')}
            </a>{' '}
            {t('et des', 'and')} <a href="/app/students" className="font-semibold underline">{t('élèves', 'students')}</a> {t('sont configurés.', 'are configured.')}
          </div>
        )}

        {/* APC officiel — états spécifiques (référentiel en cours, classe non reconnue, vide) */}
        {classId && showApcOfficial && !apcReady && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-sm text-amber-800">
            {!apcClasseSlug
              ? t('Classe non reconnue comme premier cycle (6e–3e).', 'Class not recognized as first cycle (6e–3e).')
              : classStudents.length === 0
                ? t('Aucun élève dans cette classe.', 'No student in this class.')
                : t('Référentiel APC en cours de chargement…', 'APC framework still loading…')}
          </div>
        )}

        {/* Primaire APC officiel — le bulletin s'appuie sur le référentiel (compétences),
            pas sur des matières classiques : on ne réclame donc pas classSubjects. */}
        {classId && showPrimOfficial && !primReady && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-sm text-amber-800">
            {!primNiveauSlug
              ? t('Classe non reconnue comme primaire (SIL–CM2). Renommez la classe ou choisissez son niveau.', 'Class not recognized as primary (SIL–CM2). Rename the class or set its level.')
              : classStudents.length === 0
                ? t('Aucun élève dans cette classe.', 'No student in this class.')
                : t('Référentiel primaire en cours de chargement…', 'Primary framework still loading…')}
          </div>
        )}

        {/* Maternelle officiel — bulletin par domaines (référentiel), pas de matières classiques. */}
        {classId && showMatOfficial && !matReady && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-sm text-amber-800">
            {classStudents.length === 0
              ? t('Aucun élève dans cette classe.', 'No student in this class.')
              : t('Référentiel maternelle en cours de chargement…', 'Nursery framework still loading…')}
          </div>
        )}

        {/* Layout bulletin : sidebar élèves + aperçu */}
        {canShow && (
          <div className="bulletin-layout">
            {/* Sidebar */}
            <div className="bulletin-sidebar no-print">
              {/* Header */}
              <div className="mb-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  {classStudents.length} {t('élève', 'student')}{classStudents.length > 1 ? 's' : ''} — {selectedClass?.name}
                </p>
                {!showApcOfficial && admisCount !== null && (
                  <p className="text-xs mt-0.5">
                    <span className="text-emerald-600 font-semibold">{admisCount} {t('admis', 'passed')}</span>
                    <span className="text-gray-300 mx-1">·</span>
                    <span className="text-red-500 font-semibold">{classStudents.length - admisCount} {t('ajournés', 'failed')}</span>
                  </p>
                )}
              </div>

              {/* Recherche */}
              {classStudents.length > 8 && (
                <input
                  type="text"
                  placeholder={t('Rechercher élève…', 'Search student…')}
                  value={sidebarSearch}
                  onChange={(e) => setSidebarSearch(e.target.value)}
                  className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 focus:outline-none focus:border-brand-400 bg-white mb-3"
                />
              )}

              {/* Liste */}
              <div className="space-y-1">
                {classStudents
                  .filter((s) => !sidebarSearch || s.name.toLowerCase().includes(sidebarSearch.toLowerCase()))
                  .map((s) => {
                    // Moyenne/rang lus dans la BONNE source selon le moteur : référentiel
                    // pour maternelle/primaire/APC, gradeMap classique pour SC/classique.
                    let studentAvg, rankN, passT = passThreshold;
                    if (isMat) {
                      studentAvg = null; rankN = null;
                    } else if (isPrim) {
                      studentAvg = primDataById[s.id]?.moyenneGenerale ?? null;
                      rankN = primRanks[s.id] === '—' ? null : primRanks[s.id];
                      passT = 5; // moyenne /10
                    } else if (isApc || showApcOfficial) {
                      studentAvg = apcDataById[s.id]?.moyenneGenerale ?? null;
                      rankN = apcRanks[s.id] === '—' ? null : apcRanks[s.id];
                      passT = 10; // moyenne /20
                    } else {
                      studentAvg = bulletinDataFor(s).studentAvg;
                      rankN = bulletinDataFor(s).rank?.rankN;
                    }
                    const isPassed = studentAvg !== null && studentAvg >= passT;
                    const color    = avatarColor(s.name);
                    return (
                      <button
                        key={s.id}
                        className={`bulletin-student-btn ${studentId === s.id ? 'active' : ''}`}
                        onClick={() => setStudentId(s.id)}
                      >
                        <div className="flex items-center gap-2">
                          <div
                            className="w-6 h-6 rounded-full flex items-center justify-center text-white font-bold shrink-0"
                            style={{ backgroundColor: color, fontSize: 9 }}
                          >
                            {initials(s.name)}
                          </div>
                          <span className="truncate flex-1 text-sm">{s.name}</span>
                          {rankN && (
                            <span className="text-[10px] text-gray-400 shrink-0">#{rankN}</span>
                          )}
                          {studentAvg !== null && (
                            <span
                              className="text-xs shrink-0 font-semibold"
                              style={{ color: isPassed ? '#059669' : '#dc2626' }}
                            >
                              {studentAvg}
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                {sidebarSearch && classStudents.filter((s) => s.name.toLowerCase().includes(sidebarSearch.toLowerCase())).length === 0 && (
                  <p className="text-xs text-gray-400 text-center py-3">{t('Aucun résultat', 'No results')}</p>
                )}
              </div>
            </div>

            {/* Zone bulletin */}
            <div className={`bulletin-panel${screenshotBlur ? ' bulletin-screenshot-blur' : ''}`}>
              {/* Filigrane logo À L'IMPRESSION uniquement : élément `position:fixed`
                  unique → se répète sur CHAQUE page (bulletin long ou classe entière)
                  sans se cumuler. L'aperçu écran a son propre filigrane par feuille. */}
              {(showApcOfficial || showScOfficial) && school?.logo_url && (
                <div className="official-print-watermark" aria-hidden>
                  <AssetImg src={school.logo_url} alt="" />
                </div>
              )}

              {/* Décision annuelle — admin only, période annuelle uniquement.
                  Disponible pour le Second Cycle et pour le bulletin APC ANNUEL. */}
              {(!isApc || apcAnnual) && role !== 'teacher' && selectedStudent && period?.seqs?.length >= 3 && (
                <AnnualDecisionPicker
                  classId={classId}
                  studentId={selectedStudent.id}
                  lastSeq={period.seqs[period.seqs.length - 1]}
                  current={annualDecisionFor(selectedStudent.id)}
                  countryCode={countryCode}
                />
              )}

              {/* Appréciation du travail de l'élève — bulletins APC (officiel 1er
                  cycle + APC classique). Saisie par élève et par période. */}
              {selectedStudent && !printAll && (showApcOfficial || format === 'apc') && period?.seqs?.length > 0 && (
                <AppreciationEditor
                  classId={classId}
                  studentId={selectedStudent.id}
                  lastSeq={period.seqs[period.seqs.length - 1]}
                  current={apcAppreciationFor(selectedStudent.id)}
                  sys={sys}
                />
              )}

              {/* Second Cycle officiel (lycée) — aperçu écran, imprimable nativement. */}
              {showScOfficial && !printAll && selectedStudent && scDataById[selectedStudent.id] && (
                <WatermarkWrap active={f.watermark}>
                  <BulletinScOfficial
                    school={school} sys={sys} title={scTitle}
                    student={selectedStudent} classLabel={selectedClass?.name || ''}
                    serieLabel={scSerieLabel} effectif={classStudents.length} profPrincipal={scProfPrincipal}
                    data={scDataById[selectedStudent.id].data}
                    discipline={scDataById[selectedStudent.id].discipline}
                    decision={scDataById[selectedStudent.id].decision}
                  />
                </WatermarkWrap>
              )}

              {showScOfficial && !printAll && !selectedStudent && (
                <div className="bg-white rounded-xl p-12 text-center shadow-sm border border-gray-100 no-print">
                  <div className="text-4xl mb-3">🏛️</div>
                  <p className="text-gray-500 text-sm">{t('Cliquez sur un élève dans la liste pour afficher son bulletin du second cycle.', 'Click on a student in the list to view their second-cycle report card.')}</p>
                </div>
              )}

              {showScOfficial && printAll && classStudents.map((student) => (
                scDataById[student.id] ? (
                  <WatermarkWrap key={student.id} active={f.watermark}>
                    <BulletinScOfficial
                      school={school} sys={sys} title={scTitle}
                      student={student} classLabel={selectedClass?.name || ''}
                      serieLabel={scSerieLabel} effectif={classStudents.length} profPrincipal={scProfPrincipal}
                      data={scDataById[student.id].data}
                      discipline={scDataById[student.id].discipline}
                      decision={scDataById[student.id].decision}
                    />
                  </WatermarkWrap>
                ) : null
              ))}

              {/* APC officiel (premier cycle) — aperçu écran, imprimable nativement.
                  Annuel → bulletin annuel (T1/T2/T3 + décision) ; sinon séquence/trimestre. */}
              {showApcOfficial && !printAll && selectedStudent && renderApcBulletin(selectedStudent)}

              {showApcOfficial && !printAll && !selectedStudent && (
                <div className="bg-white rounded-xl p-12 text-center shadow-sm border border-gray-100 no-print">
                  <div className="text-4xl mb-3">🏛️</div>
                  <p className="text-gray-500 text-sm">{t('Cliquez sur un élève dans la liste pour afficher son bulletin APC officiel.', 'Click on a student in the list to view their official APC report card.')}</p>
                </div>
              )}

              {showApcOfficial && printAll && classStudents.map((student) => renderApcBulletin(student))}

              {/* Primaire APC officiel (SIL–CM2) — aperçu écran imprimable. */}
              {showPrimOfficial && !printAll && selectedStudent && renderPrimBulletin(selectedStudent)}
              {showPrimOfficial && !printAll && !selectedStudent && (
                <div className="bg-white rounded-xl p-12 text-center shadow-sm border border-gray-100 no-print">
                  <div className="text-4xl mb-3">🏛️</div>
                  <p className="text-gray-500 text-sm">{t('Cliquez sur un élève pour afficher son bulletin primaire APC.', 'Click a student to view their primary APC report card.')}</p>
                </div>
              )}
              {showPrimOfficial && printAll && classStudents.map((student) => renderPrimBulletin(student))}

              {/* Maternelle officiel (PS/MS/GS) — aperçu écran imprimable. */}
              {showMatOfficial && !printAll && selectedStudent && renderMatBulletin(selectedStudent)}
              {showMatOfficial && !printAll && !selectedStudent && (
                <div className="bg-white rounded-xl p-12 text-center shadow-sm border border-gray-100 no-print">
                  <div className="text-4xl mb-3">🏛️</div>
                  <p className="text-gray-500 text-sm">{t('Cliquez sur un élève pour afficher son bulletin maternelle.', 'Click a student to view their nursery report card.')}</p>
                </div>
              )}
              {showMatOfficial && printAll && classStudents.map((student) => renderMatBulletin(student))}

              {!showApcOfficial && !showScOfficial && !showPrimOfficial && !showMatOfficial && !printAll && selectedStudent && (() => {
                const data = bulletinDataFor(selectedStudent);
                return (
                  <WatermarkWrap active={f.watermark}>
                    <BulletinTheme school={school}>
                      <BulletinRenderer
                        format={format}
                        period={period}
                        {...commonProps}
                        student={selectedStudent}
                        subjectGrades={data.subjectGrades}
                        studentAvg={data.studentAvg}
                        rank={data.rank}
                        qrSrc={qrMap[selectedStudent.id]}
                        annualDecision={annualDecisionFor(selectedStudent.id)}
                      />
                    </BulletinTheme>
                  </WatermarkWrap>
                );
              })()}

              {!showApcOfficial && !showScOfficial && !showPrimOfficial && !showMatOfficial && !printAll && !selectedStudent && (
                <div className="bg-white rounded-xl p-12 text-center shadow-sm border border-gray-100 no-print">
                  <div className="text-4xl mb-3">👤</div>
                  <p className="text-gray-500 text-sm">{t('Cliquez sur un élève dans la liste pour afficher son bulletin.', 'Click on a student in the list to view their report card.')}</p>
                </div>
              )}

              {!showApcOfficial && !showScOfficial && !showPrimOfficial && !showMatOfficial && printAll && classStudents.map((student) => {
                const data = bulletinDataFor(student);
                return (
                  <WatermarkWrap key={student.id} active={f.watermark}>
                    <BulletinTheme school={school}>
                      <BulletinRenderer
                        format={format}
                        period={period}
                        {...commonProps}
                        student={student}
                        subjectGrades={data.subjectGrades}
                        studentAvg={data.studentAvg}
                        rank={data.rank}
                        qrSrc={qrMap[student.id]}
                        annualDecision={annualDecisionFor(student.id)}
                      />
                    </BulletinTheme>
                  </WatermarkWrap>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Modal : ordre des matières sur le bulletin */}
      {showOrderModal && (
        <SubjectOrderModal subjects={classSubjects} onClose={() => setShowOrderModal(false)} />
      )}

      {/* Modal mise à niveau plan Starter */}
      {showUpgradeModal && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50 no-print"
          style={{ background: 'rgba(0,0,0,0.55)' }}
          onClick={() => setShowUpgradeModal(false)}
        >
          <div
            className="bg-white rounded-2xl p-7 max-w-sm w-full mx-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center">
              <div className="text-5xl mb-3">🔒</div>
              <h2 className="text-xl font-bold text-gray-900 mb-1">
                {t('Limite atteinte', 'Limit reached')}
              </h2>
              <p className="text-gray-500 text-sm mb-2">
                {t(
                  `Le plan Starter permet d'imprimer ${STARTER_DAILY_PRINT_LIMIT} bulletins par jour. Passez au plan École pour une impression illimitée.`,
                  `The Starter plan allows printing ${STARTER_DAILY_PRINT_LIMIT} report cards per day. Upgrade to the School plan for unlimited printing.`
                )}
              </p>
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 mb-4 text-xs text-amber-700">
                {t('Plan actuel : Starter (Gratuit)', 'Current plan: Starter (Free)')}
                {' → '}
                <strong>{t('Plan École : 8 500 FCFA/mois', 'School plan: 8,500 FCFA/month')}</strong>
              </div>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => setShowUpgradeModal(false)}
                  className="px-4 py-2 rounded-lg text-sm border border-gray-200 text-gray-600 hover:bg-gray-50"
                >
                  {t('Fermer', 'Close')}
                </button>
                <a
                  href="/app/settings"
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
                  style={{ background: '#4f46e5' }}
                >
                  {t('Mettre à niveau', 'Upgrade')}
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Overlay protection capture d'écran */}
      {screenshotBlur && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center no-print"
          style={{ background: 'rgba(0,0,0,0.92)', color: 'white', userSelect: 'none' }}
        >
          <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>🚫</div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '0.4rem' }}>
            {t('Capture d\'écran bloquée', 'Screenshot blocked')}
          </h2>
          <p style={{ color: '#9ca3af', fontSize: '0.9rem' }}>
            {t('Les bulletins scolaires sont protégés.', 'Report cards are protected.')}
          </p>
        </div>
      )}
    </Layout>
  );
}
