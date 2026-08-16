// Relevé de notes, relevé multi-années et certificat de scolarité — génération
// des feuilles A4 imprimables.
//
// Source unique de vérité du rendu : la MÊME chaîne HTML sert à l'aperçu écran
// (dangerouslySetInnerHTML) et à l'impression. Aucune divergence possible.
//
// Toute la mécanique d'impression (géométrie de page, marges, couleurs, sauts
// de page, blocs solidaires, fenêtre d'impression) vient du socle `lib/print` :
// ce fichier ne décrit plus QUE le contenu propre à ces trois documents.
// Voir docs/PRINT_ENGINE.md.

import {
  sheetOpen, SHEET_CLOSE, officialHeaderHtml, titleBandHtml,
  signatureBlockHtml, verificationBlockHtml,
  buildPrintDocument, printSheets, PRINT_RESULT,
  esc, safe, num, EMPTY, CLASS,
} from './print';

// Réexportés pour les appelants historiques (ateliers, palmarès, tableaux
// d'honneur) : le socle reste le seul propriétaire de ces fonctions.
export { buildPrintDocument, printSheets, PRINT_RESULT };

const L = (sys, fr, en, es) => (sys === 'EN' ? en : sys === 'ES' ? (es || fr) : fr);

// Note imprimable : `null`, `NaN` et `Infinity` sortent tous en « — ».
const grade = (v) => num(v, { fallback: EMPTY });

const CELL = 'border:1px solid #374151;padding:3px 5px;font-size:9.5px';
const TH = `${CELL};background:#1e3a5f;color:#fff;text-align:center;font-weight:bold;font-size:9px`;
const IDENT = `${CELL};background:#eef2f7;text-align:left;font-size:9px;font-weight:600;color:#1e3a5f`;

// ── Feuille A4 : relevé annuel individuel ────────────────────────────────────
// `data` = sortie de buildTranscript ; `qrSrc` = dataURL QR ; `verification` = buildVerification(...)
export function transcriptSheetHtml(data, { qrSrc, verification, school }) {
  const { student, cls, sys, cols, rows, generalAvg, generalAppr, rankEntry, stats, decision, schoolYear, maxScale } = data;
  const scaleLabel = sys === 'EN' ? '/100' : sys === 'ES' ? `/${maxScale ?? 10}` : '/20';
  const year = schoolYear || school?.current_year || '';
  const colCount = 4 + cols.length;

  // Ligne d'identification répétée en tête de tableau : sur un relevé qui
  // déborde, la page suivante reste identifiable. `<thead>` est réimprimé par
  // le navigateur sur chaque page (cf. socle d'impression).
  const identRow = `
    <tr>
      <th style="${IDENT}" colspan="${colCount}">
        ${safe(student.name)} · ${safe(cls.name)} · ${safe(year, '')}
      </th>
    </tr>`;

  const headRow = `
    <tr>
      <th style="${TH};text-align:left;width:32%">${L(sys, 'Matière', 'Subject', 'Asignatura')}</th>
      <th style="${TH};width:8%">${L(sys, 'Coef', 'Coef', 'Coef')}</th>
      ${cols.map((c) => `<th style="${TH}">${safe(c.label, '')}</th>`).join('')}
      <th style="${TH};width:11%">${L(sys, 'Moy. An.', 'Annual', 'Media')}</th>
      <th style="${TH};width:15%">${L(sys, 'Mention', 'Remark', 'Apreciación')}</th>
    </tr>`;

  const bodyRows = rows.map((r) => `
    <tr>
      <td style="${CELL};text-align:left;font-weight:600">${safe(r.subject?.name)}</td>
      <td style="${CELL};text-align:center">${num(r.coef, { fallback: '1' })}</td>
      ${cols.map((c) => `<td style="${CELL};text-align:center">${grade(r.seqGrades?.[c.seq])}</td>`).join('')}
      <td style="${CELL};text-align:center;font-weight:bold">${grade(r.annual)}</td>
      <td style="${CELL};text-align:center;color:${esc(r.appreciation?.col || '#111')};font-weight:600">${safe(r.appreciation?.text, '')}</td>
    </tr>`).join('');

  const colspanLeft = 2 + cols.length;
  const passed = !!decision?.passed;

  return `
    ${sheetOpen({ school })}
      ${officialHeaderHtml(school, sys)}

      ${titleBandHtml(`${L(sys, 'RELEVÉ DE NOTES ANNUEL', 'ANNUAL TRANSCRIPT', 'CERTIFICACIÓN ACADÉMICA ANUAL')} — ${safe(year, '')}`)}

      <table class="${CLASS.keep}" style="width:100%;border-collapse:collapse;margin-bottom:6px">
        <tbody><tr>
          <td style="${CELL};background:#f8fafc;width:26%"><strong>${L(sys, 'NOM ET PRÉNOM', 'FULL NAME', 'NOMBRE Y APELLIDOS')} :</strong><br/><span style="font-weight:bold">${safe(student.name)}</span></td>
          <td style="${CELL};background:#f8fafc;width:16%"><strong>${L(sys, 'MATRICULE', 'REG. NO.', 'MATRÍCULA')} :</strong><br/>${safe(student.matricule)}</td>
          <td style="${CELL};background:#f8fafc;width:16%"><strong>${L(sys, 'NÉ(E) LE', 'BORN ON', 'NACIDO EL')} :</strong><br/>${safe(student.date_naissance)}</td>
          <td style="${CELL};background:#f8fafc;width:14%"><strong>${L(sys, 'CLASSE', 'CLASS', 'CLASE')} :</strong><br/>${safe(cls.name)}</td>
          <td style="${CELL};background:#f8fafc;width:14%;text-align:center"><strong>${L(sys, 'EFFECTIF', 'CLASS SIZE', 'EFECTIVO')} :</strong><br/>${num(stats?.total)}</td>
          <td style="${CELL};background:#f8fafc;width:14%;text-align:center"><strong>${L(sys, 'RANG', 'RANK', 'PUESTO')} :</strong><br/><span style="font-size:13px;font-weight:bold">${safe(rankEntry?.rankD)}</span></td>
        </tr></tbody>
      </table>

      <table style="width:100%;border-collapse:collapse">
        <thead>${identRow}${headRow}</thead>
        <tbody>
          ${bodyRows || `<tr><td style="${CELL};text-align:center" colspan="${colCount}">${L(sys, 'Aucune matière', 'No subjects', 'Sin asignaturas')}</td></tr>`}
          <tr>
            <td style="${CELL};background:#e8edf2;font-weight:bold;text-align:right" colspan="${colspanLeft}">${L(sys, 'MOYENNE GÉNÉRALE ANNUELLE', 'ANNUAL GENERAL AVERAGE', 'MEDIA GENERAL ANUAL')} ${esc(scaleLabel)}</td>
            <td style="${CELL};background:#e8edf2;text-align:center;font-weight:bold;font-size:12px;color:${passed ? '#059669' : '#dc2626'}">${grade(generalAvg)}</td>
            <td style="${CELL};background:#e8edf2;text-align:center;font-weight:600;color:${esc(generalAppr?.col || '#111')}">${safe(generalAppr?.text, '')}</td>
          </tr>
        </tbody>
      </table>

      <table class="${CLASS.keep}" style="width:100%;border-collapse:collapse;margin-top:6px">
        <tbody><tr>
          <td style="${CELL};background:#f1f5f9;width:25%;text-align:center"><strong>${L(sys, 'Moy. de la classe', 'Class average', 'Media de clase')}</strong><br/>${num(stats?.avg)}</td>
          <td style="${CELL};background:#f1f5f9;width:25%;text-align:center"><strong>${L(sys, 'Plus forte moy.', 'Highest avg', 'Media más alta')}</strong><br/>${num(stats?.max)}</td>
          <td style="${CELL};background:#f1f5f9;width:25%;text-align:center"><strong>${L(sys, 'Plus faible moy.', 'Lowest avg', 'Media más baja')}</strong><br/>${num(stats?.min)}</td>
          <td style="${CELL};width:25%;text-align:center"><strong>${L(sys, 'DÉCISION', 'DECISION', 'DECISIÓN')}</strong><br/><span style="font-weight:bold;color:${passed ? '#059669' : '#dc2626'}">${safe(L(sys, decision?.fr, decision?.en, decision?.es), '')}</span></td>
        </tr></tbody>
      </table>

      ${signatureBlockHtml(school, sys)}
      ${verificationBlockHtml(verification, qrSrc, sys, { docLabel: L(sys, 'ce relevé', 'this transcript', 'esta certificación') })}
    ${SHEET_CLOSE}`;
}

// ── Feuille A4 : relevé multi-années (historique 6e → Terminale) ─────────────
// `history` = sortie de buildMultiYearHistory ; `student` = ligne canonique.
export function multiYearSheetHtml(student, history, { qrSrc, verification, school, sys = 'FR' }) {
  const rows = (history || []).map((h) => `
    <tr>
      <td style="${CELL};text-align:center;font-weight:600">${safe(h.year)}</td>
      <td style="${CELL}">${safe(h.className)}</td>
      <td style="${CELL};text-align:center">${safe(h.level)}</td>
      <td style="${CELL};text-align:center;font-weight:bold">${grade(h.generalAvg)}${h.sys === 'EN' ? '/100' : h.sys === 'ES' ? `/${h.maxScale ?? 10}` : '/20'}</td>
      <td style="${CELL};text-align:center">${safe(h.rank)}</td>
      <td style="${CELL};text-align:center;color:${h.decision?.passed ? '#059669' : '#dc2626'};font-weight:600">${safe(L(sys, h.decision?.fr, h.decision?.en, h.decision?.es), '')}</td>
    </tr>`).join('');

  return `
    ${sheetOpen({ school })}
      ${officialHeaderHtml(school, sys)}

      ${titleBandHtml(L(sys, 'RELEVÉ DE NOTES — SCOLARITÉ COMPLÈTE', 'TRANSCRIPT — FULL SCHOOLING HISTORY', 'CERTIFICACIÓN — HISTORIAL COMPLETO'), { background: '#4338ca' })}

      <table class="${CLASS.keep}" style="width:100%;border-collapse:collapse;margin-bottom:6px">
        <tbody><tr>
          <td style="${CELL};background:#f8fafc;width:40%"><strong>${L(sys, 'NOM ET PRÉNOM', 'FULL NAME', 'NOMBRE Y APELLIDOS')} :</strong><br/><span style="font-weight:bold">${safe(student.name)}</span></td>
          <td style="${CELL};background:#f8fafc;width:30%"><strong>${L(sys, 'MATRICULE', 'REG. NO.', 'MATRÍCULA')} :</strong><br/>${safe(student.matricule)}</td>
          <td style="${CELL};background:#f8fafc;width:30%"><strong>${L(sys, 'NÉ(E) LE', 'BORN ON', 'NACIDO EL')} :</strong><br/>${safe(student.date_naissance)}</td>
        </tr></tbody>
      </table>

      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr><th style="${IDENT}" colspan="6">${safe(student.name)} · ${safe(student.matricule)}</th></tr>
          <tr>
            <th style="${TH};width:14%">${L(sys, 'Année', 'Year', 'Año')}</th>
            <th style="${TH};text-align:left">${L(sys, 'Classe', 'Class', 'Clase')}</th>
            <th style="${TH};width:14%">${L(sys, 'Niveau', 'Level', 'Nivel')}</th>
            <th style="${TH};width:16%">${L(sys, 'Moy. annuelle', 'Annual avg', 'Media anual')}</th>
            <th style="${TH};width:10%">${L(sys, 'Rang', 'Rank', 'Puesto')}</th>
            <th style="${TH};width:22%">${L(sys, 'Décision', 'Decision', 'Decisión')}</th>
          </tr>
        </thead>
        <tbody>${rows || `<tr><td style="${CELL};text-align:center" colspan="6">${L(sys, 'Aucune année', 'No years', 'Sin años')}</td></tr>`}</tbody>
      </table>

      ${signatureBlockHtml(school, sys)}
      ${verificationBlockHtml(verification, qrSrc, sys, { docLabel: L(sys, 'ce relevé', 'this transcript', 'esta certificación') })}
    ${SHEET_CLOSE}`;
}

// ── Feuille A4 : certificat de scolarité (attestation d'inscription) ──────────
// Document administratif simple : atteste qu'un élève est régulièrement inscrit
// dans l'établissement pour l'année scolaire en cours.
export function certificateSheetHtml(student, cls, { qrSrc, verification, school, sys = 'FR', schoolYear, place, date }) {
  const year = schoolYear || school?.current_year || '';
  const pob  = student.lieu_naissance ? ` ${L(sys, 'à', 'in', 'en')} <strong>${safe(student.lieu_naissance)}</strong>` : '';
  const dir  = safe(school?.director);
  const name = safe(student.name);
  const dob  = safe(student.date_naissance);
  const matr = safe(student.matricule);
  const sch  = safe((school?.name || '').toUpperCase());
  const clsN = safe(cls?.name);
  const yr   = safe(year);

  const body = L(sys,
    `Je soussigné(e), <strong>${dir}</strong>, Chef d'établissement de <strong>${sch}</strong>, certifie que l'élève <strong>${name}</strong>, né(e) le <strong>${dob}</strong>${pob}, immatriculé(e) sous le numéro <strong>${matr}</strong>, est régulièrement inscrit(e) et fréquente notre établissement en classe de <strong>${clsN}</strong> au titre de l'année scolaire <strong>${yr}</strong>.`,
    `I, the undersigned, <strong>${dir}</strong>, Principal of <strong>${sch}</strong>, hereby certify that the student <strong>${name}</strong>, born on <strong>${dob}</strong>${pob}, registration number <strong>${matr}</strong>, is duly enrolled and attends our school in class <strong>${clsN}</strong> for the <strong>${yr}</strong> academic year.`,
    `El/La abajo firmante, <strong>${dir}</strong>, Director(a) de <strong>${sch}</strong>, certifica que el/la alumno(a) <strong>${name}</strong>, nacido(a) el <strong>${dob}</strong>${pob}, con matrícula <strong>${matr}</strong>, está debidamente matriculado(a) y asiste a nuestro centro en la clase de <strong>${clsN}</strong> durante el año escolar <strong>${yr}</strong>.`,
  );
  const closing = L(sys,
    "Le présent certificat est délivré à l'intéressé(e) pour servir et valoir ce que de droit.",
    'This certificate is issued to the person concerned to serve as may be required.',
    'El presente certificado se expide al interesado(a) para los fines que correspondan.');

  return `
    ${sheetOpen({ school })}
      ${officialHeaderHtml(school, sys)}

      ${titleBandHtml(L(sys, 'CERTIFICAT DE SCOLARITÉ', 'CERTIFICATE OF ENROLLMENT', 'CERTIFICADO DE ESCOLARIDAD'), { fontSize: 14, margin: '14px 0 22px' })}

      <div class="${CLASS.keep}" style="font-size:12px;line-height:2;text-align:justify;padding:0 8px">
        <p style="margin:0 0 16px;text-indent:28px">${body}</p>
        <p style="margin:0">${esc(closing)}</p>
      </div>

      ${signatureBlockHtml(school, sys, { place, date, marginTop: 26, width: 48 })}
      ${verificationBlockHtml(verification, qrSrc, sys, { docLabel: L(sys, 'ce certificat', 'this certificate', 'este certificado') })}
    ${SHEET_CLOSE}`;
}
