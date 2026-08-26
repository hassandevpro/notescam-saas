// Bulletin APC officiel (MINESEC) — construction des feuilles HTML A4.
//
// Réplique de la maquette officielle du premier cycle :
//   en-tête bilingue + photo + identité (Identifiant Unique, Redoublant, prof
//   principal) · tableau Matière / Compétences évaluées / N20 / M20 / Coef /
//   M×coef / COTE / [Min–Max] / Appréciations · ligne TOTAL/MOYENNE · pieds
//   Discipline | Travail de l'élève | Profil de la classe · signatures.
//
// Rendu par le SOCLE D'IMPRESSION (lib/print), en vectoriel : chaque feuille est
// une page A4 du profil « bulletin », le tableau est paginé par matières (jamais
// coupé au milieu d'une matière) et l'en-tête est répété sur chaque page, comme
// sur l'officiel. Géométrie, marges, couleurs et sauts viennent du socle — ce
// fichier ne décrit que le contenu.

import { sheetOpen, SHEET_CLOSE as SHEET_END, num } from './print/index.js';
import { officialHeaderHtml, officialSignatureHtml } from './officialDocHeader.js';
import { noteNkey } from '../core/apcEngine.js';
import {
  competencesFor, sequencesOfTrimestre, matiereAverage, weightedMatiere,
  generalAverage, apcCoteFromScale, apcBulletinCols, coefFor, APC_COTE_CODES,
} from '../core/apcEngine.js';
import { gradeScaleBand, scaleMention } from '../core/bulletinEngine.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));
// Nombre imprimable : NaN et Infinity ne peuvent pas atteindre le papier.
const fix2 = (v) => (v == null ? '' : num(Math.round(v * 100) / 100, { fallback: '' }));

// Helper i18n, même contrat que celui de components/bulletins/bulletinOfficialParts.jsx :
// on rend selon le SYSTÈME de la classe (FR/EN), pas selon la langue de l'interface.
// Ce fichier recevait déjà `sys` — il ne s'en servait que pour le titre, et le reste
// de la feuille sortait en français sur un bulletin anglophone.
const L = (sys, fr, en) => (sys === 'EN' ? en : fr);

// Le genre est stocké en français ('Masculin' / 'Féminin') quelle que soit la
// classe : on le traduit à l'affichage, jamais en base. Valeur inattendue rendue
// telle quelle — sur un document officiel, une donnée brute vaut mieux qu'une
// donnée travestie.
const genderTxt = (value, sys) => {
  const v = String(value ?? '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (!v) return '';
  if (/^(m|masculin|masculino|male|garcon|h|homme|hombre)$/.test(v)) return L(sys, 'Masculin', 'Male');
  if (/^(f|feminin|femenino|female|fille|femme|mujer)$/.test(v))     return L(sys, 'Féminin', 'Female');
  return String(value);
};

const SHEET_OPEN = sheetOpen({ profile: 'bulletin', fontSize: 10 });
const SHEET_CLOSE = SHEET_END;
const C = 'border:1px solid #374151;padding:2px 4px;font-size:9px;vertical-align:top';

const TRIM_TITLE = {
  t1: { fr: 'BULLETIN SCOLAIRE DU PREMIER TRIMESTRE', en: 'FIRST TERM REPORT CARD' },
  t2: { fr: 'BULLETIN SCOLAIRE DU DEUXIÈME TRIMESTRE', en: 'SECOND TERM REPORT CARD' },
  t3: { fr: 'BULLETIN SCOLAIRE DU TROISIÈME TRIMESTRE', en: 'THIRD TERM REPORT CARD' },
  annual: { fr: 'BULLETIN SCOLAIRE ANNUEL', en: 'ANNUAL REPORT CARD' },
};

// ── Assemblage des données d'une période pour un élève ─────────────────────────
// Période = une ou plusieurs séquences (`seqIds`). Les compétences restent celles
// du trimestre `trimestreId` (héritées par ses séquences) ; seules les notes des
// séquences listées sont moyennées. Permet un bulletin de séquence (1 seq) OU de
// trimestre (les 2 seqs) sans dupliquer la logique.
//   Pour chaque matière : ses compétences (N/xx = moyenne des séquences retenues),
//   M/xx (moyenne matière), coef (par classe), M×coef, cote.
export function assemblePeriod(referentiel, apcNotes, { classeSlug, trimestreId, seqIds, student, teacherByMatiere = {}, gradeScale, sys = 'FR' }) {
  const seqs = seqIds && seqIds.length
    ? seqIds
    : sequencesOfTrimestre(referentiel.sequences, trimestreId).map((s) => s.id);

  // Note de la période d'une compétence = moyenne de ses notes sur les séquences.
  const compNote = (competenceId) => {
    const vals = seqs
      .map((sid) => apcNotes[noteNkey(student.id, competenceId, sid)]?.note)
      .filter((n) => n != null && n !== '')
      .map(Number)
      .filter((n) => !isNaN(n));
    return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100 : null;
  };

  const matieres = [];
  for (const m of referentiel.matieres) {
    const comps = competencesFor(referentiel.competences, { classeId: classeSlug, trimestreId, matiereId: m.id });
    if (!comps.length) continue;
    const notesByComp = {};
    const compRows = comps.map((c) => {
      const n = compNote(c.id);
      if (n != null) notesByComp[c.id] = n;
      return { intitule: c.intitule, note: n };
    });
    const moyenne = matiereAverage(notesByComp, comps);
    const coef = coefFor(referentiel.classeMatieres, classeSlug, m);
    // Appréciation + intervalle [Min–Max] pilotés par le barème configurable de
    // l'école (school.grade_scale) — exactement comme le second cycle.
    const band = gradeScaleBand(moyenne, gradeScale);
    matieres.push({
      id: m.id, nom: m.nom, coef,
      enseignant: teacherByMatiere[m.id] || '',
      competences: compRows,
      moyenne, ponderee: weightedMatiere(moyenne, coef),
      cote: apcCoteFromScale(moyenne, gradeScale).code,
      appreciation: scaleMention(band, gradeScale, sys),
      minmax: band ? { min: band.min, max: band.max } : null,
    });
  }

  const coefSum = matieres.reduce((a, m) => a + (m.moyenne != null ? m.coef : 0), 0);
  const mxSum   = matieres.reduce((a, m) => a + (m.ponderee || 0), 0);
  const moyenneGenerale = generalAverage(matieres.map((m) => ({ moyenne: m.moyenne, coef: m.coef })));

  return { matieres, coefSum, mxSum, moyenneGenerale, cote: apcCoteFromScale(moyenneGenerale, gradeScale).code };
}

// Assemblage d'un TRIMESTRE entier (les 2 séquences) — conservé pour le pipeline
// PDF existant. Délègue à assemblePeriod avec les séquences du trimestre.
export function assembleTrimester(referentiel, apcNotes, { classeSlug, trimestreId, student, teacherByMatiere = {}, gradeScale, sys = 'FR' }) {
  const seqIds = sequencesOfTrimestre(referentiel.sequences, trimestreId).map((s) => s.id);
  return assemblePeriod(referentiel, apcNotes, { classeSlug, trimestreId, seqIds, student, teacherByMatiere, gradeScale, sys });
}

// ── Assemblage ANNUEL (T1 · T2 · T3 → moyenne annuelle par matière) ───────────
// Niveau MATIÈRE (pas de compétences) : chaque matière porte ses moyennes des 3
// trimestres, la moyenne annuelle (moyenne des trimestres notés), coef, M×coef,
// cote. + totaux + moyenne générale annuelle. Format du bulletin annuel MINESEC.
export function assembleApcAnnual(referentiel, apcNotes, { classeSlug, student, teacherByMatiere = {}, gradeScale, sys = 'FR' }) {
  const trims = ['t1', 't2', 't3'].map((tid) =>
    assembleTrimester(referentiel, apcNotes, { classeSlug, trimestreId: tid, student, teacherByMatiere, gradeScale, sys }));

  const byId = new Map();
  trims.forEach((d, i) => {
    for (const m of d.matieres) {
      if (!byId.has(m.id)) byId.set(m.id, { id: m.id, nom: m.nom, coef: m.coef, enseignant: m.enseignant, t: [null, null, null] });
      byId.get(m.id).t[i] = m.moyenne;
    }
  });

  const matieres = [...byId.values()].map((e) => {
    const vals = e.t.filter((v) => v != null);
    const moyenne = vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100 : null;
    const band = gradeScaleBand(moyenne, gradeScale);
    return {
      id: e.id, nom: e.nom, coef: e.coef, enseignant: e.enseignant,
      t1: e.t[0], t2: e.t[1], t3: e.t[2],
      moyenne, ponderee: weightedMatiere(moyenne, e.coef), cote: apcCoteFromScale(moyenne, gradeScale).code,
      appreciation: scaleMention(band, gradeScale, sys),
      minmax: band ? { min: band.min, max: band.max } : null,
    };
  });

  const coefSum = matieres.reduce((a, m) => a + (m.moyenne != null ? m.coef : 0), 0);
  const mxSum   = matieres.reduce((a, m) => a + (m.ponderee || 0), 0);
  const moyenneGenerale = generalAverage(matieres.map((m) => ({ moyenne: m.moyenne, coef: m.coef })));
  return { matieres, coefSum, mxSum, moyenneGenerale, cote: apcCoteFromScale(moyenneGenerale, gradeScale).code, annual: true };
}

// ── Blocs HTML ─────────────────────────────────────────────────────────────────
function identityHtml(student, { classLabel, sys, effectif, profPrincipal }) {
  const redoublant = String(student?.statut || '').toLowerCase().includes('redoubl');
  const chk = (on) => `<span style="display:inline-block;width:9px;height:9px;border:1px solid #374151;margin:0 2px;vertical-align:middle;background:${on ? '#374151' : '#fff'}"></span>`;
  const parents = [student?.nom_pere, student?.nom_mere, student?.tuteur].filter(Boolean).join(' · ');
  const phone = student?.parent_phone ? ` (${esc(student.parent_phone)})` : '';
  return `
  <table style="width:100%;border-collapse:collapse;margin-bottom:5px">
    <tbody>
      <tr>
        <td rowspan="4" style="${C};width:70px;text-align:center;vertical-align:middle">
          ${student?.photo_url ? `<img src="${esc(student.photo_url)}" style="width:58px;height:70px;object-fit:cover"/>` : `<div style="font-size:8px;color:#888">${L(sys, "Photo de l'élève", "Student's photo")}</div>`}
        </td>
        <td style="${C}">${L(sys, "Nom et Prénoms de l'élève", "Student's full name")} : <strong>${esc(student?.name || '')}</strong></td>
        <td style="${C};white-space:nowrap">${L(sys, 'Classe', 'Class')} : <strong>${esc(classLabel)}</strong></td>
      </tr>
      <tr>
        <td style="${C}">${L(sys, 'Date et lieu de naissance', 'Date and place of birth')} : ${esc(student?.date_naissance || '')} ${student?.lieu_naissance ? `${L(sys, 'à', 'in')} ` + esc(student.lieu_naissance) : ''}</td>
        <td style="${C}">${L(sys, 'Genre', 'Gender')} : ${esc(genderTxt(student?.gender, sys))} · ${L(sys, 'Effectif', 'Class size')} : ${esc(effectif ?? '')}</td>
      </tr>
      <tr>
        <td style="${C}">${L(sys, 'Identifiant Unique', 'Unique ID')} : ${esc(student?.matricule || '')}</td>
        <td style="${C}">${L(sys, 'Redoublant', 'Repeater')} : ${L(sys, 'Oui', 'Yes')} ${chk(redoublant)} ${L(sys, 'Non', 'No')} ${chk(!redoublant)} · ${L(sys, 'P. principal', 'Form master')} : ${esc(profPrincipal || '')}</td>
      </tr>
      <tr><td colspan="2" style="${C}">${L(sys, 'Noms et contacts des Parents / Tuteurs', 'Parents / Guardians names and contacts')} : ${esc(parents)}${phone}</td></tr>
    </tbody>
  </table>`;
}

const TH = (txt, w) => `<th style="${C};background:#eef2f7;text-align:center;font-size:8.5px${w ? `;width:${w}` : ''}">${txt}</th>`;

// Colonnes de fin optionnelles (COTE / [Min–Max] / Appréciation) selon les bascules
// de l'établissement (school.apc_bulletin_cols). Ordre officiel préservé.
const TRAIL_TH = (sys) => ({
  cote:         [L(sys, 'COTE', 'GRADE'), '6%'],
  minmax:       ['[Min–Max]', '8%'],
  appreciation: [L(sys, 'Appréciations et Visa', 'Remarks and signature'), '13%'],
});
const trailingCols = (cols) => ['cote', 'minmax', 'appreciation'].filter((k) => cols[k]);

function tableHeadHtml(cols, sys) {
  const tr = trailingCols(cols);
  const th = TRAIL_TH(sys);
  const trailTh = (tr.length ? tr.map((k) => TH(th[k][0], th[k][1])) : [TH('', '10%')]).join('');
  return `<tr>
    ${TH(L(sys, 'MATIÈRES ET NOM DE L\'ENSEIGNANT', 'SUBJECTS AND TEACHER'), '20%')}
    ${TH(L(sys, 'COMPÉTENCES ÉVALUÉES', 'COMPETENCES ASSESSED'))}
    ${TH('N/20', '7%')}${TH('M/20', '7%')}${TH('Coef', '5%')}${TH('M×coef', '7%')}${trailTh}
  </tr>`;
}

// Lignes d'une matière (compétences en sous-lignes ; M/20, coef, etc. fusionnés).
function matiereRowsHtml(m, cols, sys) {
  const rs = m.competences.length || 1;
  const tr = trailingCols(cols);
  const trailContent = (k) => {
    if (k === 'cote')   return `<strong>${m.moyenne != null ? m.cote : ''}</strong>`;
    if (k === 'minmax') return m.minmax ? `${fix2(m.minmax.min)}&ndash;${fix2(m.minmax.max)}` : '';
    return esc(m.appreciation || '');
  };
  return m.competences.map((c, i) => {
    const first = i === 0;
    const span = (content) => first ? `<td rowspan="${rs}" style="${C};text-align:center">${content}</td>` : '';
    const trailCells = (tr.length ? tr.map(trailContent) : ['']).map(span).join('');
    return `<tr>
      ${first ? `<td rowspan="${rs}" style="${C}"><strong>${esc(m.nom)}</strong><br/><span style="color:#666">${esc(m.enseignant || L(sys, 'M/Mme', 'Mr/Mrs'))}</span></td>` : ''}
      <td style="${C}">${esc(c.intitule)}</td>
      <td style="${C};text-align:center">${fix2(c.note)}</td>
      ${span(`<strong>${fix2(m.moyenne)}</strong>`)}
      ${span(String(m.coef))}
      ${span(fix2(m.ponderee))}
      ${trailCells}
    </tr>`;
  }).join('');
}

function totalRowHtml(data, cols, sys) {
  const trailN = trailingCols(cols).length || 1;
  return `<tr>
    <td colspan="3" style="${C};text-align:right;font-weight:bold">${L(sys, 'TOTAL', 'TOTAL')}</td>
    <td style="${C}"></td>
    <td style="${C};text-align:center;font-weight:bold">${fix2(data.coefSum)}</td>
    <td style="${C};text-align:center;font-weight:bold">${fix2(data.mxSum)}</td>
    <td colspan="${trailN}" style="${C};text-align:right;font-weight:bold">${L(sys, 'MOYENNE', 'AVERAGE')} : ${fix2(data.moyenneGenerale)}</td>
  </tr>`;
}

// Pieds : Discipline | Travail de l'élève | Profil de la classe.
function footerBlocksHtml(data, { classStats, sys } = {}) {
  const coteCounts = APC_COTE_CODES.reduce((o, code) => {
    o[code] = data.matieres.filter((m) => m.moyenne != null && m.cote === code).length; return o;
  }, {});
  const kv = (k, v) => `<tr><td style="${C}">${k}</td><td style="${C};text-align:center">${v ?? ''}</td></tr>`;
  return `
  <table style="width:100%;border-collapse:collapse;margin-top:6px">
    <tbody>
      <tr>
        <td style="width:34%;vertical-align:top;padding-right:4px">
          <table style="width:100%;border-collapse:collapse">
            <tbody>
              <tr><td colspan="2" style="${C};background:#eef2f7;text-align:center;font-weight:bold">${L(sys, 'Discipline', 'Discipline')}</td></tr>
              ${kv(L(sys, 'Abs. non just. (h)', 'Unjust. abs. (h)'), '')}${kv(L(sys, 'Abs. just. (h)', 'Just. abs. (h)'), '')}${kv(L(sys, 'Retards (nombre)', 'Late arrivals (number)'), '')}${kv(L(sys, 'Consignes (h)', 'Detentions (h)'), '')}
              ${kv(L(sys, 'Avertissement', 'Warning'), '')}${kv(L(sys, 'Blâme de conduite', 'Conduct reprimand'), '')}${kv(L(sys, 'Exclusions (jours)', 'Exclusions (days)'), '')}${kv(L(sys, 'Exclusion définitive', 'Permanent exclusion'), '')}
            </tbody>
          </table>
        </td>
        <td style="width:34%;vertical-align:top;padding-right:4px">
          <table style="width:100%;border-collapse:collapse">
            <tbody>
              <tr><td colspan="2" style="${C};background:#eef2f7;text-align:center;font-weight:bold">${L(sys, "Travail de l'élève", "Student's work")}</td></tr>
              ${kv(L(sys, 'Total général', 'Grand total'), fix2(data.mxSum))}${kv('Coef', fix2(data.coefSum))}
              ${kv(L(sys, 'MOYENNE TRIM', 'TERM AVERAGE'), `<strong>${fix2(data.moyenneGenerale)}</strong>`)}${kv(L(sys, 'Cote', 'Grade'), `<strong>${data.moyenneGenerale != null ? data.cote : ''}</strong>`)}
              ${APC_COTE_CODES.map((c) => kv(c, coteCounts[c])).join('')}
            </tbody>
          </table>
        </td>
        <td style="width:32%;vertical-align:top">
          <table style="width:100%;border-collapse:collapse">
            <tbody>
              <tr><td colspan="2" style="${C};background:#eef2f7;text-align:center;font-weight:bold">${L(sys, 'Profil de la classe', 'Class profile')}</td></tr>
              ${kv(L(sys, 'Moyenne générale', 'General average'), fix2(classStats?.avg))}
              ${kv('[Min – Max]', classStats ? `${fix2(classStats.min)} – ${fix2(classStats.max)}` : '')}
              ${kv(L(sys, 'Nombre de moyennes', 'Number of averages'), classStats?.count ?? '')}
              ${kv(L(sys, 'Taux de réussite', 'Pass rate'), classStats?.rate != null ? `${classStats.rate}%` : '')}
            </tbody>
          </table>
        </td>
      </tr>
    </tbody>
  </table>
  <table style="width:100%;border-collapse:collapse;margin-top:4px"><tbody><tr>
    <td style="${C};height:42px;vertical-align:top">${L(sys, "Appréciation du travail de l'élève (points forts et points à améliorer)", "Remarks on the student's work (strengths and areas to improve)")}</td>
    <td style="${C};width:22%;vertical-align:top;text-align:center">${L(sys, 'Visa du parent / Tuteur', 'Parent / Guardian signature')}</td>
    <td style="${C};width:22%;vertical-align:top;text-align:center">${L(sys, 'Nom et visa du professeur principal', 'Form master: name and signature')}</td>
  </tr></tbody></table>`;
}

// ── Pagination d'un trimestre en feuilles A4 ───────────────────────────────────
// Empile les matières par budget de lignes de compétences (matière jamais coupée).
// L'en-tête institutionnel + identité sont répétés sur chaque page. Le pied
// (TOTAL + blocs) est placé après la dernière matière, sur une page qui le contient.
// Budget en LIGNES DE TEXTE estimées (pas en nombre de compétences) : les intitulés
// de compétences sont longs et s'enroulent sur plusieurs lignes ; compter les lignes
// rendues évite qu'une page déborde sur une 2e page physique (et désynchronise la
// numérotation « i / N »). ~34 caractères par ligne dans la colonne COMPÉTENCES.
//
// IMPORTANT : la PAGE 1 perd ~1/3 de sa hauteur pour l'en-tête institutionnel +
// l'identité ; les pages SUIVANTES n'ont qu'un bandeau de continuation léger →
// elles tiennent presque deux fois plus de lignes. On REMPLIT donc chaque page au
// maximum (budgets distincts) pour réduire le nombre de pages.
// Calibré pour la densité compacte (police 8px, padding serré) afin de tenir un
// bulletin de premier cycle (15–21 matières) sur 2 PAGES : page 1 (en-tête + identité)
// puis page 2 qui se remplit jusqu'au pied. ~44 caractères par ligne à 8px.
export const APC_FIRST_PAGE_LINES = 42;   // page 1 (en-tête complet + identité)
export const APC_CONT_PAGE_LINES  = 80;   // pages 2+ (bandeau de continuation léger)
export const APC_FOOTER_LINES     = 26;   // réserve pour le pied (TOTAL + blocs + signature)
const APC_CHARS_PER_LINE = 44;

const apcCompLines = (c) => Math.max(1, Math.ceil(String(c.intitule || '').length / APC_CHARS_PER_LINE));
export const apcMatiereLines = (m) => Math.max(1, (m.competences || []).reduce((a, c) => a + apcCompLines(c), 0));

// Découpe pure des matières en pages (matière jamais coupée), en remplissant chaque
// page au maximum (budget page 1 < pages suivantes) + indique si le pied doit aller
// sur une page à lui. Partagé par le PDF et l'aperçu écran (numérotation par élève).
export function paginateApcMatieres(matieres) {
  const budgetFor = (pageIndex) => (pageIndex === 0 ? APC_FIRST_PAGE_LINES : APC_CONT_PAGE_LINES);
  const pages = [];
  let cur = [], curLines = 0;
  for (const m of matieres || []) {
    const r = apcMatiereLines(m);
    if (cur.length && curLines + r > budgetFor(pages.length)) { pages.push(cur); cur = []; curLines = 0; }
    cur.push(m); curLines += r;
  }
  if (cur.length) pages.push(cur);
  if (!pages.length) pages.push([]);
  const lastBudget = budgetFor(pages.length - 1);
  const lastLines = pages[pages.length - 1].reduce((a, m) => a + apcMatiereLines(m), 0);
  const footerOwnPage = lastLines + APC_FOOTER_LINES > lastBudget;
  return { pages, footerOwnPage };
}

export function buildTrimesterSheets(referentiel, apcNotes, ctx) {
  const { classeSlug, trimestreId, student, school, sys = 'FR', classLabel, effectif, profPrincipal, classStats, teacherByMatiere } = ctx;
  const data = assembleTrimester(referentiel, apcNotes, { classeSlug, trimestreId, student, teacherByMatiere, gradeScale: school?.grade_scale, sys });
  const cols = apcBulletinCols(school); // bascules COTE / [Min–Max] / Appréciation

  // Découpe des matières en pages (logique mutualisée avec l'aperçu écran).
  const { pages, footerOwnPage } = paginateApcMatieres(data.matieres);

  const title = TRIM_TITLE[trimestreId] || TRIM_TITLE.t1;
  const header = (pageData, withFooter) => {
    const rows = pageData.map((m) => matiereRowsHtml(m, cols, sys)).join('');
    return SHEET_OPEN
      + officialHeaderHtml(school, { sys, title: sys === 'EN' ? title.en : title.fr })
      + identityHtml(student, { classLabel, sys, effectif, profPrincipal })
      + `<table style="width:100%;border-collapse:collapse"><thead>${tableHeadHtml(cols, sys)}</thead><tbody>${rows}${withFooter && !footerOwnPage ? totalRowHtml(data, cols, sys) : ''}</tbody></table>`
      + (withFooter && !footerOwnPage ? footerBlocksHtml(data, { classStats, sys }) : '')
      + SHEET_CLOSE;
  };

  const sheets = pages.map((pg, i) => header(pg, i === pages.length - 1));
  if (footerOwnPage) {
    sheets.push(
      SHEET_OPEN
      + officialHeaderHtml(school, { sys, title: sys === 'EN' ? title.en : title.fr })
      + `<table style="width:100%;border-collapse:collapse"><thead>${tableHeadHtml(cols, sys)}</thead><tbody>${totalRowHtml(data, cols, sys)}</tbody></table>`
      + footerBlocksHtml(data, { classStats, sys })
      + officialSignatureHtml(school, sys)
      + SHEET_CLOSE,
    );
  } else {
    // Signature sur la dernière feuille existante (réinjection simple).
    sheets[sheets.length - 1] = sheets[sheets.length - 1].replace(
      SHEET_CLOSE, officialSignatureHtml(school, sys) + SHEET_CLOSE,
    );
  }
  return sheets;
}
