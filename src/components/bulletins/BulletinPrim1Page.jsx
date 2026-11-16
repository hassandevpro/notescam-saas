// Bulletin PRIMAIRE APC (CBA / MINEDUB) — gabarit « UNE PAGE, sobre, économe en encre ».
//
// Remplace, pour un TRIMESTRE (au plus 3 UA), le mini-tableau par compétence de
// BulletinPrimAnnualUA : UNE ligne par compétence, trois blocs d'UA
// (Oral · Written · Pract. · Attit. · Total) et une colonne PERIOD. Portrait ET
// paysage A4, mêmes données, mêmes calculs.
//
// ── CE QUE CE GABARIT NE CALCULE PAS ──────────────────────────────────────
// Rien de métier. Notes, totaux, cotes, moyennes, rang et appréciation arrivent
// en PROPS, déjà calculés par Bulletins.jsx (primAnnualRowsFor…), comme pour tous
// les gabarits du primaire. Seule la cote PAR CRITÈRE est dérivée ici, avec les
// MÊMES seuils (90/75/55 %) et le même barème réellement utilisé que
// BulletinPrimAnnualUA — c'était déjà un calcul de présentation de ce gabarit.
//
// ── POURQUOI UNE PAGE EST GARANTIE ────────────────────────────────────────
// La feuille a une hauteur FIXE (celle de la zone imprimable A4, marge @page
// 8 mm), les lignes de compétence se partagent le reste (flex, plafonnées à
// 37 pt en portrait / 27 pt en paysage) : plus de compétences → lignes plus
// basses et polices réduites (jamais sous 6,5 pt, 5,8 pt pour un intitulé de
// paysage), jamais une 2e page. Tout bloc de texte libre est borné (line-clamp).
//
// ── ENCRE ──────────────────────────────────────────────────────────────────
// Fond blanc, pas de filigrane. Vert #0B5D45 : titre, codes, titres de section,
// filets d'en-tête. Couleur ailleurs : uniquement les cotes. Lisible en niveaux
// de gris : les cotes restent écrites en toutes lettres (NA / ECA / A / A+).

import { useSignedUrl } from '../AssetImg';
import AssetImg from '../AssetImg';
import { useLogoShape } from '../useLogoShape';
import { bulletinOfficials } from '../../countries';
import { bulletinFontFamily } from '../../lib/schoolTheme';
import { L, fix2, genderLabel } from './bulletinOfficialParts';
import { headTeacherLabel, headTeacherCount } from '../../lib/headTeachers';
import { groupesDe, reperesDeGroupe } from '../../core/primCompactRows';
import { PRIM_GRADE_MAX, PRIM_COTE_DEFAULT } from '../../core/primEngine';
import { primCoteLabel } from '../../core/referentielI18n';

// Marqueur de version du gabarit : posé dans le DOM (data-gabarit), dans le pied
// de page imprimé, et donc vérifiable dans le paquet (packaging/markers.json).
export const PRIM1P_GABARIT = 'prim-1p-v1';

const VERT = '#0B5D45';
const GRIS_FILET = '#c9ced6';
const COTE_COULEUR = { 'A+': VERT, A: '#111', ECA: '#92600a', IP: '#92600a', NA: '#9b1c1c' };
const FILET = `0.5pt solid ${GRIS_FILET}`;

// Géométrie (pt). `H` = hauteur de la zone imprimable A4 moins une réserve (le
// moteur d'impression pose 8 mm de marge via @page ; 6 pt de sécurité).
const GEO = {
  // ANNUEL : 8 UA, paysage uniquement. Cotes a 5,8 pt (plancher 5,5), titres jusqu'a 5,6 pt.
  annuel: {
    H: 544, rowMax: 27.5, avail: 270, compW: '21%', perW: '8.5%', logo: 58,
    titreFs: 7, noteFs: 7, coteFs: 5.8, maxFs: 5.6, ligneTitre: 2, coteMin: 5.5, noteMin: 6.5,
  },
  portrait: {
    H: 790, rowMax: 37, avail: 380, compW: '27.6%', perW: '9.2%', logo: 68,
    titreFs: 7.6, noteFs: 9, coteFs: 6.5, maxFs: 6.5, ligneTitre: 2,
  },
  paysage: {
    H: 544, rowMax: 27, avail: 238, compW: '31.6%', perW: '10.2%', logo: 58,
    titreFs: 7.6, noteFs: 8.5, coteFs: 6.5, maxFs: 6.5, ligneTitre: 1,
  },
};

const SLOTS = [
  { re: /oral/i,                         fr: 'Oral',  en: 'Oral',    es: 'Oral' },
  { re: /[ée]cri|writ/i,                 fr: 'Écrit', en: 'Written', es: 'Escrito' },
  { re: /prat|pract|manip/i,             fr: 'Prat.', en: 'Pract.',  es: 'Prác.' },
  { re: /savoir|[êe]tre|attit|comport/i, fr: 'Att.',  en: 'Attit.',  es: 'Act.' },
];

// Range les critères d'une compétence dans les 4 colonnes. Un critère reconnu va
// dans SA colonne ; les autres prennent les colonnes restantes dans l'ordre.
// Au-delà de 4 critères, les surnuméraires n'ont pas de colonne : ils restent
// dans le total (calculé par le moteur) et dans la ligne des maximums.
export function assignerColonnes(criteres = []) {
  const slots = [null, null, null, null];
  const reste = [];
  for (const cr of criteres) {
    const i = SLOTS.findIndex((s, k) => slots[k] == null && s.re.test(cr?.nom || ''));
    if (i >= 0) slots[i] = cr; else reste.push(cr);
  }
  for (const cr of reste) {
    const libre = slots.findIndex((s) => s == null);
    if (libre >= 0) slots[libre] = cr;
  }
  return slots;
}

const coteDeCritere = (note, bareme) => {
  const b = Number(bareme);
  if (note == null || !b) return null;
  const pct = (Number(note) / b) * 100;
  if (Number.isNaN(pct)) return null;
  return pct >= 90 ? 'A+' : pct >= 75 ? 'A' : pct >= 55 ? 'ECA' : 'NA';
};

// Barème à annoncer pour un critère : celui réellement utilisé s'il est le même
// sur toutes les UA notées, sinon le barème officiel (même règle que le gabarit
// détaillé).
const baremeAffiche = (row, cr) => {
  const vus = new Set();
  for (const u of row.uas) { const b = u.baremes?.[cr.id]; if (b != null) vus.add(Number(b)); }
  return vus.size === 1 ? [...vus][0] : cr.points_max;
};

const valeur = (n) => (n == null || n === '' ? '' : (typeof n === 'number' || /^-?\d+([.,]\d+)?$/.test(String(n)) ? fix2(Number(String(n).replace(',', '.'))) : String(n)));

function Photo({ src, w, h }) {
  const url = useSignedUrl(src);
  const cadre = { width: w, height: h, border: FILET, flexShrink: 0, boxSizing: 'border-box' };
  return url ? <img src={url} alt="" style={{ ...cadre, objectFit: 'cover' }} /> : <div style={cadre} />;
}

const coupe = (n) => ({ display: '-webkit-box', WebkitLineClamp: n, WebkitBoxOrient: 'vertical', overflow: 'hidden', overflowWrap: 'anywhere' });

function Entete({ school, sys, g, paysage }) {
  const officials = bulletinOfficials(school, { basic: true, sys });
  const blocs = officials?.blocks ?? [];
  const bilingue = officials?.bilingual && blocs.length > 1;
  const { banner, onLoad } = useLogoShape(school?.logo_url);
  const annee = sys === 'EN' ? 'Academic year' : sys === 'ES' ? 'Año escolar' : 'Année scolaire';
  const Bloc = ({ b, align }) => (
    <div style={{ flex: '1 1 0', minWidth: 0, textAlign: align, fontSize: '7pt', lineHeight: 1.3, overflow: 'hidden' }}>
      <strong>{b.republic}</strong><br />
      {b.motto}<br />————————<br />
      {b.ministry}
      {(b.lines || []).map((ln, i) => <span key={i}><br />{ln}</span>)}
      {b.establishment && <><br /><strong>{b.establishment}</strong></>}
    </div>
  );
  const centre = (
    <div style={{ flex: `0 0 ${paysage ? '24%' : '22%'}`, textAlign: 'center', fontSize: '7pt', lineHeight: 1.3 }}>
      {school?.logo_url && (
        <AssetImg src={school.logo_url} alt="" onLoad={onLoad}
          style={banner
            ? { width: '100%', maxHeight: g.logo, objectFit: 'contain', display: 'block', margin: '0 auto 1px' }
            : { width: g.logo, height: g.logo, objectFit: 'contain', display: 'block', margin: '0 auto 1px' }} />
      )}
      {school?.phone && <span style={{ whiteSpace: 'nowrap' }}>{school.phone}</span>}
      {paysage && school?.phone ? ' · ' : <br />}
      <strong style={{ whiteSpace: 'nowrap' }}>{annee} : {school?.current_year || '—'}</strong>
    </div>
  );
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', paddingBottom: 4, flexShrink: 0 }}>
      {blocs[0] && <Bloc b={blocs[0]} align="center" />}
      {centre}
      {bilingue && blocs[1] ? <Bloc b={blocs[1]} align="center" /> : <div style={{ flex: '1 1 0' }} />}
    </div>
  );
}

const GRILLE = (g, nUA = 3) => ({
  display: 'grid',
  gridTemplateColumns: `${g.compW} repeat(${nUA}, ${(100 - parseFloat(g.compW) - parseFloat(g.perW)) / nUA}%) ${g.perW}`,
});

// Titre de competence de l'ANNUEL : on reduit la police (7 -> 5,6 pt) jusqu'a ce que le titre tienne
// sur 2 lignes ; au plancher, on autorise une 3e ligne plutot que de couper en silence.
export function ajusterTitre(texte, largeurPt, { max = 7, min = 5.6, hauteur = 27.5, maxLigne = 5.6 } = {}) {
  // Hauteur dispo pour le titre = ligne - rembourrage - ligne des maximums.
  const dispo = hauteur - 4 - maxLigne * 1.2;
  let dernier = null;
  for (let fs = max; fs >= min - 1e-9; fs -= 0.2) {
    const lignes = Math.max(1, Math.ceil((texte.length * 0.56 * fs) / largeurPt));
    dernier = { fs: Math.round(fs * 10) / 10, lignes };
    if (lignes * fs * 1.18 <= dispo && lignes <= 3) return dernier;
  }
  // Plancher atteint : on garde le nombre de lignes qui TIENT dans la hauteur ; au-dela le CSS
  // coupe avec des points de suspension visibles (jamais en silence).
  return { fs: min, lignes: Math.max(1, Math.min(3, Math.floor(dispo / (min * 1.18)))) };
}

// ── ANNUEL PORTRAIT : tableau TRANSPOSE ─────────────────────────────────────
// Compétences en COLONNES ; lignes = UA × [Oral, Written, Pract., Attit., Total] ; libellés de
// trimestre verticaux à gauche ; ligne ANNUAL en bas ; maximums sous chaque titre de compétence.
// Un titre n'est JAMAIS coupé : retour à la ligne par mots (jusqu'à 6 lignes), police réduite de
// 6,6 à 4,2 pt. Si même 4,2 pt ne suffit pas (trop de colonnes), on le SIGNALE en console plutôt
// que de déborder sur une 2e page ; le mot trop long est alors rompu pour rester dans sa colonne.
export function ajusterTitrePortrait(texte, largeurPt, { max = 6.6, min = 4.2, lignesMax = 6 } = {}) {
  const mots = String(texte || '').split(/\s+/).filter(Boolean);
  const plusLong = mots.reduce((a, m) => Math.max(a, m.length), 0);
  const simuler = (fs) => {
    const cap = Math.max(1, Math.floor(largeurPt / (0.54 * fs)));
    let lignes = 1; let cur = 0;
    for (const m of mots) {
      const l = m.length;
      if (cur === 0) cur = l; else if (cur + 1 + l <= cap) cur += 1 + l; else { lignes += 1; cur = l; }
      while (cur > cap) { lignes += 1; cur -= cap; }
    }
    return lignes;
  };
  for (let fs = max; fs >= min - 1e-9; fs -= 0.2) {
    const f1 = Math.round(fs * 10) / 10;
    if (plusLong * 0.54 * f1 <= largeurPt) {
      const lignes = simuler(f1);
      if (lignes <= lignesMax) return { fs: f1, lignes, ok: true };
    }
  }
  return { fs: min, lignes: Math.min(lignesMax, simuler(min)), ok: false };
}

function TableauAnnuelPortrait({ rows, sys, uaCols, trimDe, trimLabel, evalLbl, cMin, k }) {
  const N = Math.max(1, rows.length);
  const M = uaCols.length;
  const largeurCol = (548 - 66) / N;
  const entetes = rows.map((row) => {
    const titre = `${row.intitule}${row.totalPossible ? ` (${fix2(row.totalPossible)})` : ''}`;
    const fit = ajusterTitrePortrait(titre, largeurCol - 4);
    if (!fit.ok && typeof console !== 'undefined') {
      console.warn(`[bulletin annuel portrait] titre de ${row.code} illisible sous 4,2 pt (${N} compétences) : mot rompu`);
    }
    return { titre, fit };
  });
  const hautEntete = Math.max(34, ...entetes.map((e) => 11 + e.fit.lignes * e.fit.fs * 1.14 + 8));
  const colonnes = `13pt 19pt 33pt repeat(${N}, minmax(0, 1fr))`;
  const noteFs = `${Math.max(5, Math.round(7.2 * k * 10) / 10)}pt`;
  const coteFs = `${Math.max(4.2, Math.round(5.6 * k * 10) / 10)}pt`;
  const trims = [];
  uaCols.forEach((ua, i) => { const t = trimDe(ua); const d = trims[trims.length - 1]; if (d && d.t === t) d.n += 1; else trims.push({ t, n: 1, debut: i }); });
  const finDeTrimestre = new Set(trims.map((t) => t.debut + t.n - 1));
  const cellule = { display: 'flex', alignItems: 'center', justifyContent: 'space-around', minWidth: 0, overflow: 'hidden', lineHeight: 1.05, borderLeft: FILET };

  const items = [];
  // En-tête
  items.push(<div key="h-lab" style={{ gridRow: 1, gridColumn: '1 / span 3', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: VERT, fontSize: '7pt' }}>{L(sys, 'COMPÉTENCE', 'COMPETENCY', 'COMPETENCIA')}</div>);
  rows.forEach((row, c) => {
    const slots = assignerColonnes(row.criteres);
    const maxLigne = slots.map((cr, i) => (cr ? `${evalLbl(i).charAt(0)}${baremeAffiche(row, cr)}` : null)).filter(Boolean).join(' ');
    items.push(
      <div key={`h-${c}`} style={{ gridRow: 1, gridColumn: 4 + c, borderLeft: FILET, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '1pt 1pt 1pt', minWidth: 0, overflow: 'hidden', textAlign: 'center' }}>
        <span style={{ color: VERT, fontWeight: 'bold', fontSize: '8.5pt', lineHeight: 1.1 }}>{row.code}</span>
        <span style={{ fontWeight: 'bold', fontSize: `${entetes[c].fit.fs}pt`, lineHeight: 1.14, overflowWrap: 'anywhere', hyphens: 'none' }}>{entetes[c].titre}</span>
        <span style={{ marginTop: 'auto', color: '#6b7280', fontSize: '4.8pt', whiteSpace: 'nowrap' }}>{maxLigne}</span>
      </div>,
    );
  });
  // Libellés de trimestre (verticaux), UA, évaluations
  trims.forEach((t, i) => items.push(
    <div key={`t-${i}`} style={{ gridRow: `${2 + t.debut * 5} / span ${t.n * 5}`, gridColumn: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', borderTop: t.debut > 0 ? `1.2pt solid ${VERT}` : undefined, color: VERT, fontWeight: 'bold', fontSize: '6.5pt', letterSpacing: '.3px', writingMode: 'vertical-rl', transform: 'rotate(180deg)', whiteSpace: 'nowrap', overflow: 'hidden' }}>{trimLabel(t.t)}</div>,
  ));
  uaCols.forEach((ua, u) => {
    items.push(<div key={`u-${u}`} style={{ gridRow: `${2 + u * 5} / span 5`, gridColumn: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', color: VERT, fontWeight: 'bold', fontSize: '8pt', borderTop: u === 0 ? undefined : trims.some((t) => t.debut === u) ? `1.2pt solid ${VERT}` : FILET }}>UA{ua}</div>);
    [0, 1, 2, 3, 4].forEach((e) => {
      const total = e === 4;
      const r = 2 + u * 5 + e;
      const bord = total ? (finDeTrimestre.has(u) ? `1.2pt solid ${VERT}` : FILET) : undefined;
      items.push(<div key={`e-${u}-${e}`} style={{ gridRow: r, gridColumn: 3, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 3, color: total ? '#111' : '#6b7280', fontWeight: total ? 'bold' : 'normal', fontSize: '5.8pt', borderBottom: bord, borderTop: e === 0 && !trims.some((t) => t.debut === u) ? FILET : undefined }}>{total ? 'Total' : evalLbl(e)}</div>);
      rows.forEach((row, c) => {
        const slots = assignerColonnes(row.criteres);
        const ligneUA = row.uas.find((x) => x.ua === ua);
        let note = null; let cote = null;
        if (ligneUA) {
          if (total) { note = ligneUA.achieved != null ? fix2(ligneUA.achieved) : null; cote = ligneUA.achieved != null ? ligneUA.cote : null; }
          else {
            const cr = slots[e];
            const v = cr ? ligneUA.notesByCritere?.[cr.id] : null;
            note = v != null ? valeur(v) : null;
            cote = v != null && cr ? coteDeCritere(v, ligneUA.baremes?.[cr.id] ?? cr.points_max) : null;
          }
        }
        items.push(
          <div key={`c-${u}-${e}-${c}`} style={{ ...cellule, gridRow: r, gridColumn: 4 + c, borderBottom: bord, borderTop: e === 0 && !trims.some((t) => t.debut === u) ? FILET : undefined }}>
            <span style={{ fontSize: noteFs, fontWeight: total ? 'bold' : 'normal' }}>{note ?? ''}</span>
            <span style={{ fontSize: coteFs, color: cote ? COTE_COULEUR[cote] : undefined, fontWeight: cote === 'NA' || cote === 'A+' || total ? 'bold' : 'normal' }}>{cote || ''}</span>
          </div>,
        );
      });
    });
  });
  // Ligne ANNUAL
  const ra = 2 + M * 5;
  items.push(<div key="a-lab" style={{ gridRow: ra, gridColumn: '1 / span 3', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: VERT, fontSize: '7.5pt', borderTop: `1.2pt solid ${VERT}`, borderBottom: `1.2pt solid ${VERT}` }}>{L(sys, 'ANNUEL', 'ANNUAL', 'ANUAL')}</div>);
  rows.forEach((row, c) => items.push(
    <div key={`a-${c}`} style={{ gridRow: ra, gridColumn: 4 + c, borderLeft: FILET, borderTop: `1.2pt solid ${VERT}`, borderBottom: `1.2pt solid ${VERT}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', lineHeight: 1.1, padding: '1.5pt 0', minWidth: 0, overflow: 'hidden' }}>
      <span style={{ fontSize: `${Math.max(5, Math.round(7.4 * k * 10) / 10)}pt`, fontWeight: 'bold', color: row.totalCote ? COTE_COULEUR[row.totalCote] : undefined, whiteSpace: 'nowrap' }}>{row.totalAchieved != null ? `${fix2(row.totalAchieved)}/${fix2(row.totalPossible)}` : ''}</span>
      <span style={{ fontSize: coteFs, fontWeight: 'bold', color: row.totalCote ? COTE_COULEUR[row.totalCote] : undefined }}>{row.totalAchieved != null ? (row.totalCote || '') : ''}</span>
    </div>,
  ));

  return (
    <div style={{ marginTop: 4, flex: '0 1 auto', minHeight: 0, display: 'grid', gridTemplateColumns: colonnes, gridTemplateRows: `${hautEntete}pt repeat(${M * 5}, minmax(0, 11.5pt)) auto`, overflow: 'hidden', borderTop: `1.2pt solid ${VERT}` }}>
      {items}
    </div>
  );
}

export default function BulletinPrim1Page({
  paysage: paysageProp = false,
  annuel: annuelProp = false,
  school, sys = 'FR', title, student, classLabel, effectif, profPrincipal = '',
  competenceRows = [], moyenneGenerale = null, coteGenerale = null, rang, classStats, appreciation = '',
  // Texte du cadre « remarques de l'enseignant(e) » : l'observation saisie quand elle est fournie
  // (undefined = l'appel ne la gère pas, on retombe sur l'appréciation).
  observations,
  // Réglages d'affichage du carnet (poste / école) : rang et statistiques de classe masquables.
  masquerRang = false, masquerStats = false,
  bareme = [],
  mentions, repartition = [], groupes: avecGroupes = false,
}) {
  // L'ANNUEL SUIT L'ORIENTATION CHOISIE : portrait (défaut) = tableau transposé, paysage = tableau à
  // compétences en lignes. `annuel` ci-dessous désigne l'annuel PAYSAGE ; `annuelPortrait` l'autre.
  const paysage = paysageProp;
  const annuelPortrait = annuelProp && !paysage;
  const annuel = annuelProp && paysage;
  const n = Math.max(1, competenceRows.length);
  const g = annuel ? { ...GEO.annuel, compW: n > 11 ? '24%' : GEO.annuel.compW } : paysage ? GEO.paysage : GEO.portrait;
  const cMin = g.coteMin ?? 6.5;
  const nMin = g.noteMin ?? 7;
  // Échelle de police : 1 jusqu'à 11 compétences, puis réduction proportionnelle
  // (plancher 6,5 pt appliqué plus bas).
  const k = Math.min(1, 11 / n);
  const fs = (base, plancher = 6.5) => `${Math.max(plancher, Math.round(base * k * 10) / 10)}pt`;

  // Un nom long passe sur 2 lignes, en police réduite (jamais tronqué sur un document officiel).
  const tailleNom = (pt) => `${(student?.name || '').length > 28 ? Math.max(8.5, pt - 2.5) : pt}pt`;
  const redoublant = String(student?.statut || '').toLowerCase().includes('redoubl');
  const parents = [student?.nom_pere, student?.nom_mere, student?.tuteur].filter(Boolean).join(' · ');
  const tel = student?.parent_phone ? ` (${student.parent_phone})` : '';
  const ppLbl = headTeacherLabel(headTeacherCount(profPrincipal), sys, { basic: true });
  const teacherLabel = sys === 'EN' ? 'The Class Teacher' : sys === 'ES' ? 'El Maestro / La Maestra' : "L'Enseignant(e)";
  const headLabel = sys === 'EN' ? 'The Head Teacher' : sys === 'ES' ? 'El Director / La Directora' : 'Le Directeur / La Directrice';
  const lbl = (b) => <span style={{ color: '#555' }}>{b}</span>;

  const coteLib = bareme.find((b) => b.cote === coteGenerale);
  const coteTexte = coteGenerale ? primCoteLabel(coteGenerale, coteLib?.libelle || coteGenerale, sys) : '';

  // Les trois colonnes d'UA : celles de la période (UA1-3, UA4-6, UA7-8). Une UA
  // sans note reste une colonne VIDE, comme au modèle.
  const uaNums = (competenceRows[0]?.uas || []).map((u) => u.ua);
  const uaCols = uaNums.length ? uaNums : (annuelProp ? [1, 2, 3, 4, 5, 6, 7, 8] : [1, 2, 3]);
  const nUA = uaCols.length;
  // Groupes de trimestre (annuel) : UA1-3, UA4-6, UA7-8 d'apres le `trimestre` porte par chaque UA.
  const trimDe = (ua) => (competenceRows[0]?.uas || []).find((u) => u.ua === ua)?.trimestre ?? (ua <= 3 ? 1 : ua <= 6 ? 2 : 3);
  const groupesTrim = [];
  for (const ua of uaCols) { const t = trimDe(ua); const d = groupesTrim[groupesTrim.length - 1]; if (d && d.t === t) d.n += 1; else groupesTrim.push({ t, n: 1 }); }
  const trimLabel = (t) => (sys === 'EN' ? ['FIRST TERM', 'SECOND TERM', 'THIRD TERM'] : sys === 'ES' ? ['PRIMER TRIMESTRE', 'SEGUNDO TRIMESTRE', 'TERCER TRIMESTRE'] : ['PREMIER TRIMESTRE', 'DEUXIÈME TRIMESTRE', 'TROISIÈME TRIMESTRE'])[t - 1] || '';

  const groupesCalc = avecGroupes
    ? groupesDe(competenceRows.map((r) => ({
      code: r.code, domaine: r.domaine ?? null, achieved: r.totalAchieved ?? null,
      possible: r.totalAchieved == null ? null : (r.totalPossible ?? null),
    })), sys)
    : [];
  const { debut: debuts } = reperesDeGroupe(competenceRows, groupesCalc);

  const evalLbl = (i) => SLOTS[i][sys === 'EN' ? 'en' : sys === 'ES' ? 'es' : 'fr'];
  const entetesUA = (
    <>
      {uaCols.map((ua) => (
        <div key={ua} style={{ textAlign: 'center', fontWeight: 'bold', color: VERT, fontSize: '7.5pt', borderLeft: FILET }}>UA{ua}</div>
      ))}
    </>
  );
  const unitesRegles = annuel ? '1% 1% 1% 1% 1.6%' : '4.2% 4.2% 4.2% 4.2% 5.4%'; // cinq sous-colonnes, en % de l'UA (somme 22.2 → normalisée par grid)

  const sousGrille = { display: 'grid', gridTemplateColumns: unitesRegles.split(' ').map((p) => `${parseFloat(p)}fr`).join(' ') };

  return (
    <div
      className="bulletin-paper prim1p"
      data-gabarit={PRIM1P_GABARIT}
      data-orientation={paysage ? 'paysage' : 'portrait'}
      data-periode={annuelProp ? 'annuel' : 'trimestre'}
      style={{
        boxSizing: 'border-box', height: `${g.H}pt`, width: '100%', maxWidth: paysage ? '800pt' : '560pt', margin: '0 auto', overflow: 'hidden', boxShadow: 'none', borderRadius: 0,
        display: 'flex', flexDirection: 'column', background: '#fff', color: '#111',
        fontFamily: bulletinFontFamily(school), fontSize: '8pt', padding: '3pt',
        WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact',
      }}
    >
      <Entete school={school} sys={sys} g={g} paysage={paysage} />

      {/* Titre entre deux filets verts */}
      <div style={{ borderTop: `1.2pt solid ${VERT}`, borderBottom: `1.2pt solid ${VERT}`, textAlign: 'center', color: VERT, fontWeight: 'bold', fontSize: paysage ? '10pt' : '11pt', padding: '3pt 0', margin: '2pt 0 4pt', flexShrink: 0, ...coupe(1) }}>
        {title}
      </div>

      {/* Bloc élève */}
      <div style={{ border: FILET, display: 'flex', alignItems: 'stretch', flexShrink: 0, padding: '3pt', gap: 6, fontSize: '7.6pt', lineHeight: 1.3 }}>
        <Photo src={student?.photo_url} w={paysage ? 28 : 32} h={paysage ? 36 : 42} />
        {paysage ? (
          <>
            <div style={{ flex: '1 1 0', minWidth: 0 }}>
              <div style={{ fontSize: tailleNom(11), fontWeight: 'bold', lineHeight: 1.15, ...coupe(2) }}>{student?.name || ''}</div>
              <div>{lbl(L(sys, 'Classe', 'Class', 'Clase'))} : {classLabel}{effectif != null ? <> · {lbl(L(sys, 'Effectif', 'Class size', 'Total'))} : {effectif}</> : null}</div>
              <div>{lbl(L(sys, 'Né(e) le', 'Born on', 'Nacido/a el'))} : {student?.date_naissance || '—'}{student?.lieu_naissance ? ` ${L(sys, 'à', 'in', 'en')} ${student.lieu_naissance}` : ''}</div>
            </div>
            <div style={{ flex: '1 1 0', minWidth: 0, borderLeft: FILET, paddingLeft: 6 }}>
              <div>{lbl(L(sys, 'Genre', 'Gender', 'Género'))} : {genderLabel(student?.gender, sys)} · {lbl(L(sys, 'Identifiant', 'ID', 'Identificador'))} : {student?.matricule || '—'}</div>
              <div>{lbl(L(sys, 'Redoublant', 'Repeater', 'Repetidor'))} : {redoublant ? L(sys, 'Oui', 'Yes', 'Sí') : L(sys, 'Non', 'No', 'No')}</div>
              <div style={coupe(1)}>{lbl(ppLbl)} : {profPrincipal || '—'}</div>
            </div>
            <div style={{ flex: '1.2 1 0', minWidth: 0, borderLeft: FILET, paddingLeft: 6, ...coupe(3) }}>
              {lbl(L(sys, 'Parents / Tuteurs', 'Parents / Guardians', 'Padres / Tutores'))} : {parents || '—'}{tel}
            </div>
          </>
        ) : (
          <>
            <div style={{ flex: '1 1 0', minWidth: 0 }}>
              <div style={{ fontSize: tailleNom(12), fontWeight: 'bold', lineHeight: 1.15, ...coupe(2) }}>{student?.name || ''}</div>
              <div>{lbl(L(sys, 'Classe', 'Class', 'Clase'))} : {classLabel}{effectif != null ? <> · {lbl(L(sys, 'Effectif', 'Class size', 'Total'))} : {effectif}</> : null}</div>
              <div>{lbl(L(sys, 'Né(e) le', 'Born on', 'Nacido/a el'))} : {student?.date_naissance || '—'}{student?.lieu_naissance ? ` ${L(sys, 'à', 'in', 'en')} ${student.lieu_naissance}` : ''}</div>
            </div>
            <div style={{ flex: '1 1 0', minWidth: 0, borderLeft: FILET, paddingLeft: 6 }}>
              <div>{lbl(L(sys, 'Genre', 'Gender', 'Género'))} : {genderLabel(student?.gender, sys)} · {lbl(L(sys, 'Identifiant', 'ID', 'Identificador'))} : {student?.matricule || '—'}</div>
              <div>{lbl(L(sys, 'Redoublant', 'Repeater', 'Repetidor'))} : {redoublant ? L(sys, 'Oui', 'Yes', 'Sí') : L(sys, 'Non', 'No', 'No')} · {lbl(ppLbl)} : <span>{profPrincipal || '—'}</span></div>
              <div style={coupe(2)}>{lbl(L(sys, 'Parents / Tuteurs', 'Parents / Guardians', 'Padres / Tutores'))} : {parents || '—'}{tel}</div>
            </div>
          </>
        )}
      </div>

      {annuelPortrait ? (
        <TableauAnnuelPortrait rows={competenceRows} sys={sys} uaCols={uaCols} trimDe={trimDe} trimLabel={trimLabel} evalLbl={evalLbl} cMin={cMin} k={k} />
      ) : (<>
      {/* TABLEAU : en-têtes à deux niveaux (trimestriel) ou trois niveaux (annuel) */}
      <div style={{ marginTop: 4, flexShrink: 0, borderTop: `1.2pt solid ${VERT}`, fontSize: '7pt' }}>
        {annuel && (
          <div style={{ ...GRILLE(g, nUA), alignItems: 'center', height: '11pt' }}>
            <div style={{ fontWeight: 'bold', color: VERT, fontSize: '7.5pt', paddingLeft: 2 }}>{L(sys, 'COMPÉTENCE', 'COMPETENCY', 'COMPETENCIA')}</div>
            {groupesTrim.map((gr, i) => (
              <div key={i} style={{ gridColumn: `span ${gr.n}`, textAlign: 'center', fontWeight: 'bold', color: VERT, fontSize: '7pt', borderLeft: FILET }}>{trimLabel(gr.t)}</div>
            ))}
            <div style={{ textAlign: 'center', fontWeight: 'bold', color: VERT, fontSize: '7.5pt', borderLeft: FILET }}>{L(sys, 'ANNUEL', 'ANNUAL', 'ANUAL')}</div>
          </div>
        )}
        <div style={{ ...GRILLE(g, nUA), alignItems: 'center', height: annuel ? '10pt' : '13pt' }}>
          <div style={{ fontWeight: 'bold', color: VERT, fontSize: '7.5pt', paddingLeft: 2 }}>{annuel ? '' : L(sys, 'COMPÉTENCE', 'COMPETENCY', 'COMPETENCIA')}</div>
          {entetesUA}
          <div style={{ textAlign: 'center', fontWeight: 'bold', color: VERT, fontSize: '7.5pt', borderLeft: FILET }}>{annuel ? '' : L(sys, 'PÉRIODE', 'PERIOD', 'PERÍODO')}</div>
        </div>
        <div style={{ ...GRILLE(g, nUA), alignItems: 'center', height: '11pt', borderBottom: `1.2pt solid ${VERT}`, color: '#555', fontSize: annuel ? '6pt' : '6.5pt' }}>
          <div style={{ fontStyle: 'italic', paddingLeft: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {L(sys, '(barème de chaque évaluation sous l’intitulé)', '(max. points per assessment under each title)', '(máximo de cada evaluación bajo el título)')}
          </div>
          {uaCols.map((ua) => (
            <div key={ua} style={{ ...sousGrille, textAlign: 'center', borderLeft: FILET }}>
              {[0, 1, 2, 3].map((i) => <span key={i}>{annuel ? evalLbl(i).charAt(0) : evalLbl(i)}</span>)}
              <span style={{ fontWeight: 'bold', color: '#111' }}>{annuel ? 'T' : 'Total'}</span>
            </div>
          ))}
          <div style={{ textAlign: 'center', borderLeft: FILET }}>{L(sys, 'Note · Cote', 'Mark · Grade', 'Nota · Cota')}</div>
        </div>
      </div>

      {/* LIGNES : se partagent la hauteur restante, plafonnées */}
      <div style={{ flex: '0 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column', borderBottom: `1.2pt solid ${VERT}`, overflow: 'hidden' }}>
        {competenceRows.map((row, i) => {
          const slots = assignerColonnes(row.criteres);
          const maxLigne = (row.criteres || []).map((cr) => {
            const idx = slots.indexOf(cr);
            const nom = idx >= 0 ? evalLbl(idx) : cr.nom;
            return `${nom} ${baremeAffiche(row, cr)}`;
          }).join(' · ');
          const intitule = `${row.intitule}${row.totalPossible ? ` (${fix2(row.totalPossible)})` : ''}`;
          // Paysage : titre sur UNE ligne, police réduite jusqu'à 5,8 pt puis troncature.
          const largeurUtile = 250 - 22;
          const ajuste = annuel ? ajusterTitre(intitule, (parseFloat(g.compW) / 100) * 790 - 20, { max: g.titreFs * Math.min(1, k + 0.15), min: 5.6, hauteur: Math.min(g.rowMax, g.avail / n), maxLigne: g.maxFs }) : null;
          const fsTitre = annuel ? ajuste.fs : paysage
            ? Math.max(5.8, Math.min(g.titreFs, Math.round((largeurUtile / (intitule.length * 0.56)) * 10) / 10))
            : g.titreFs;
          const bandeau = debuts.get(i);
          return (
            <div key={row.code} style={{ display: 'contents' }}>
              {bandeau && (
                <div style={{ flex: '0 0 auto', fontSize: '6.8pt', fontWeight: 'bold', color: VERT, padding: '1pt 2pt', borderTop: FILET, ...coupe(1) }}>
                  {bandeau.numero != null ? `${bandeau.numero}) ` : ''}{String(bandeau.intitule || '').toUpperCase()}
                </div>
              )}
              <div style={{ ...GRILLE(g, nUA), flex: `0 1 ${g.rowMax}pt`, minHeight: 0, borderTop: i === 0 && !bandeau ? 'none' : FILET, overflow: 'hidden' }}>
                <div style={{ padding: '2pt 3pt', minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', overflow: 'hidden' }}>
                  <div style={{ display: 'flex', gap: 3, alignItems: 'baseline', minWidth: 0 }}>
                    <span style={{ color: VERT, fontWeight: 'bold', fontSize: fs(g.titreFs + 1, 6.5), flexShrink: 0 }}>{row.code}</span>
                    <span style={{
                      fontWeight: 'bold', fontSize: `${paysage ? fsTitre : Math.max(6.5, g.titreFs * k)}pt`, lineHeight: 1.18, minWidth: 0,
                      ...(annuel ? coupe(ajuste.lignes) : paysage ? { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } : coupe(g.ligneTitre)),
                    }}>{intitule}</span>
                  </div>
                  <div style={{ color: '#6b7280', fontSize: `${g.maxFs}pt`, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', paddingLeft: 1 }}>{maxLigne}</div>
                </div>
                {row.uas.map((u) => (
                  <div key={u.ua} style={{ ...sousGrille, borderLeft: FILET, minWidth: 0 }}>
                    {slots.map((cr, si) => {
                      const note = cr ? u.notesByCritere?.[cr.id] : null;
                      const cote = note != null && cr ? coteDeCritere(note, u.baremes?.[cr.id] ?? cr.points_max) : null;
                      return (
                        <div key={si} style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'center', lineHeight: 1.15, overflow: 'hidden' }}>
                          <span style={{ fontSize: fs(g.noteFs, nMin) }}>{valeur(note)}</span>
                          <span style={{ fontSize: `${Math.max(cMin, g.coteFs * k)}pt`, color: cote ? COTE_COULEUR[cote] : undefined, fontWeight: cote === 'NA' || cote === 'A+' ? 'bold' : 'normal' }}>{cote || ''}</span>
                        </div>
                      );
                    })}
                    <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'center', lineHeight: 1.15, overflow: 'hidden' }}>
                      <span style={{ fontSize: fs(g.noteFs, nMin), fontWeight: 'bold' }}>{u.achieved != null ? fix2(u.achieved) : ''}</span>
                      <span style={{ fontSize: `${Math.max(cMin, g.coteFs * k)}pt`, color: u.cote ? COTE_COULEUR[u.cote] : undefined, fontWeight: 'bold' }}>{u.achieved != null ? (u.cote || '') : ''}</span>
                    </div>
                  </div>
                ))}
                <div style={{ borderLeft: FILET, textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'center', lineHeight: 1.15, overflow: 'hidden' }}>
                  <span style={{ fontSize: fs(g.noteFs + 1, nMin), fontWeight: 'bold', color: row.totalCote ? COTE_COULEUR[row.totalCote] : undefined }}>
                    {row.totalAchieved != null ? `${fix2(row.totalAchieved)}/${fix2(row.totalPossible)}` : ''}
                  </span>
                  <span style={{ fontSize: `${Math.max(cMin, g.coteFs * k)}pt`, color: row.totalCote ? COTE_COULEUR[row.totalCote] : undefined, fontWeight: 'bold' }}>{row.totalAchieved != null ? (row.totalCote || '') : ''}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      </>)}

      {/* Bas de page : synthèse | remarques | signatures */}
      {(() => {
        const cadre = { border: FILET, padding: '3pt 5pt', minWidth: 0, overflow: 'hidden', boxSizing: 'border-box' };
        const titreSection = { color: VERT, fontWeight: 'bold', fontSize: '7.5pt', borderBottom: `0.5pt solid ${VERT}`, paddingBottom: 1, marginBottom: 2 };
        const ligne = { display: 'flex', justifyContent: 'space-between', gap: 6, fontSize: '8pt', lineHeight: 1.35 };
        const extra = [
          classStats && !masquerStats ? `${L(sys, 'Classe', 'Class', 'Clase')} : ${fix2(classStats.avg)} · ↑${fix2(classStats.max)} · ↓${fix2(classStats.min)}${classStats.rate != null ? ` · ${classStats.rate}%` : ''}` : null,
          mentions ? [
            mentions.avertissement && `${L(sys, 'Avert.', 'Warning', 'Adv.')} ${mentions.avertissement}`,
            mentions.tableauHonneur && `${L(sys, 'T. d’honneur', 'Honour roll', 'C. honor')} ${mentions.tableauHonneur}`,
            mentions.encouragement && `${L(sys, 'Encour.', 'Commend.', 'Estím.')} ${mentions.encouragement}`,
            mentions.felicitation && `${L(sys, 'Félic.', 'Congrats', 'Felic.')} ${mentions.felicitation}`,
          ].filter(Boolean).join(' · ') : null,
          repartition.length ? repartition.map((r) => `${r.label}: ${r.n}`).join(' · ') : null,
        ].filter(Boolean);
        const synthese = (
          <div style={{ ...cadre, flex: paysage ? '0 0 26%' : '1 1 0' }}>
            <div style={titreSection}>{L(sys, 'BILAN DE L’ÉLÈVE', 'STUDENT\'S SUMMARY', 'BALANCE DEL ALUMNO')}</div>
            <div style={ligne}><span>{L(sys, `Moyenne générale /${PRIM_GRADE_MAX}`, `General average /${PRIM_GRADE_MAX}`, `Promedio general /${PRIM_GRADE_MAX}`)}</span><strong style={{ fontSize: '10pt', color: moyenneGenerale != null ? COTE_COULEUR[coteGenerale] : undefined }}>{moyenneGenerale != null ? fix2(moyenneGenerale) : ''}</strong></div>
            <div style={ligne}><span>{L(sys, 'Cote générale', 'General grade', 'Nota general')}</span><strong style={{ color: COTE_COULEUR[coteGenerale] }}>{moyenneGenerale != null ? coteGenerale : ''}</strong></div>
            <div style={ligne}><span>{L(sys, 'Appréciation', 'Appreciation', 'Apreciación')}</span><strong style={{ color: COTE_COULEUR[coteGenerale] }}>{moyenneGenerale != null ? coteTexte : ''}</strong></div>
            {rang && !masquerRang ? <div style={ligne}><span>{L(sys, 'Rang', 'Rank', 'Puesto')}</span><strong>{rang} / {effectif ?? ''}</strong></div> : null}
            {extra.map((t, i) => <div key={i} style={{ fontSize: '6.5pt', color: '#444', lineHeight: 1.25, ...coupe(2) }}>{t}</div>)}
          </div>
        );
        const remarques = (
          <div style={{ ...cadre, flex: paysage ? '0 0 27%' : '1 1 0' }}>
            <div style={titreSection}>{L(sys, 'OBSERVATIONS DE L’ENSEIGNANT(E)', 'CLASS TEACHER\'S REMARKS', 'OBSERVACIONES DEL MAESTRO')}</div>
            <div style={{ fontSize: '8pt', lineHeight: 1.3, whiteSpace: 'pre-wrap', ...coupe(4) }}>{observations !== undefined ? observations : appreciation}</div>
          </div>
        );
        const colSign = (titre, nom, extraNode) => (
          <div style={{ flex: '1 1 0', minWidth: 0, borderLeft: FILET, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', padding: '3pt 3pt', position: 'relative' }}>
            <div style={{ fontWeight: 'bold', fontSize: '8pt', textAlign: 'center' }}>{titre}</div>
            {extraNode}
            <div style={{ color: '#666', fontSize: '7.5pt', minHeight: 10, textAlign: 'center', ...coupe(1) }}>{nom}</div>
          </div>
        );
        const signatures = (
          <div style={{ ...cadre, padding: 0, display: 'flex', flex: paysage ? '1 1 0' : '0 0 auto', height: paysage ? undefined : '54pt' }}>
            <div style={{ flex: '1 1 0', minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '3pt' }}>
              <div style={{ fontWeight: 'bold', fontSize: '8pt', textAlign: 'center' }}>{L(sys, 'Visa du Parent / Tuteur', 'Parent / Guardian', 'Padre / Tutor')}</div>
            </div>
            {colSign(teacherLabel, profPrincipal)}
            {colSign(headLabel, school?.director || '', (school?.stamp_url || school?.signature_url) ? (
              <div style={{ position: 'relative', flex: 1, width: '100%', minHeight: 0 }}>
                {school?.stamp_url && <AssetImg src={school.stamp_url} alt="" className="bulletin-stamp-img" style={{ position: 'absolute', left: '50%', top: 0, transform: 'translateX(-50%)', height: '90%', width: 'auto', maxWidth: 'none', objectFit: 'contain', margin: 0 }} />}
                {school?.signature_url && <AssetImg src={school.signature_url} alt="" className="bulletin-sig-img" style={{ position: 'absolute', left: '50%', top: 0, transform: 'translateX(-50%)', height: '70%', width: 'auto', maxWidth: 'none', objectFit: 'contain', margin: 0 }} />}
              </div>
            ) : null)}
          </div>
        );
        return paysage ? (
          <div style={{ display: 'flex', gap: 4, marginTop: 4, height: `${(extra.length || (rang && !masquerRang)) ? 84 : 66}pt`, flexShrink: 0 }}>{synthese}{remarques}{signatures}</div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 4, marginTop: 5, height: `${extra.length ? 78 : 64}pt`, flexShrink: 0 }}>{synthese}{remarques}</div>
            <div style={{ marginTop: 4, flexShrink: 0 }}>{signatures}</div>
          </>
        );
      })()}

      {/* Légende + page */}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: '6.5pt', color: '#555', marginTop: 4, flexShrink: 0 }}>
        <span style={coupe(1)}>
          {L(sys, 'Cotes', 'Grades', 'Notas')} : {(bareme.length ? bareme : PRIM_COTE_DEFAULT).map((b) => `${b.cote} ${primCoteLabel(b.cote, b.libelle || '', sys)}`.trim()).join(' · ')}
        </span>
        <span style={{ whiteSpace: 'nowrap' }}>{annuelProp
          ? L(sys, `UA : Unité d’apprentissage · O Oral · É Écrit · P Pratique · A Savoir-être${annuelPortrait ? ' (points max.)' : ' · T Total'}`, `UA : Learning unit · O Oral · W Written · P Practical · A Attitude${annuelPortrait ? ' (max. points)' : ' · T Total'}`, `UA : Unidad de aprendizaje · O Oral · E Escrito · P Práctico · A Actitud${annuelPortrait ? ' (puntos máx.)' : ' · T Total'}`)
          : L(sys, 'UA : Unité d’apprentissage', 'UA : Learning unit', 'UA : Unidad de aprendizaje')}</span>
      </div>
      <div style={{ textAlign: 'center', fontSize: '6.5pt', color: '#777', marginTop: 2, flexShrink: 0 }}>
        {L(sys, 'Page 1 sur 1', 'Page 1 of 1', 'Página 1 de 1')} <span style={{ color: '#aaa' }}>· {PRIM1P_GABARIT}</span>
      </div>
    </div>
  );
}
