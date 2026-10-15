// Bulletin PROGRAMME D'ÉDUCATION BILINGUE SPÉCIAL — feuilles HTML A4.
//
// Maquette dédiée (arrêté n°239-23/MINESEC du 14/06/2023) : matières regroupées
// par DOMAINE D'APPRENTISSAGE, avec le coefficient de l'arrêté, le détail des
// séquences du trimestre, les points pondérés, puis la synthèse.
//
// Les trois grandeurs de la synthèse sont affichées SÉPARÉMENT — total des points
// pondérés, total des coefficients, moyenne générale — et la moyenne imprimée est
// exactement le quotient des deux autres : une famille peut refaire le calcul.
//
// Document ISOLÉ du bulletin second cycle (scBulletinDoc.js), qui applique une
// autre règle de moyenne et n'est pas modifié.

import { sheetOpen, SHEET_CLOSE as SHEET_END, num } from './print';
import { officialHeaderHtml, officialSignatureHtml } from './officialDocHeader';
import { assembleBilBulletin, assembleBilAnnual, bilProvisoireTexte } from '../core/bilEngine';

export { assembleBilBulletin, assembleBilAnnual };

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));
// NaN et Infinity ne peuvent pas atteindre le papier.
const fix2 = (v) => (v == null ? '' : num(Math.round(v * 100) / 100, { fallback: '' }));
const L = (sys, fr, en) => (sys === 'EN' ? en : fr);

const SHEET_OPEN = sheetOpen({ profile: 'bulletin', fontSize: 10 });
const C = 'border:1px solid #374151;padding:2px 4px;font-size:9px;vertical-align:top';
const ACCENT = '#1e3a5f';

const TITLE = {
  t1: { fr: 'BULLETIN SCOLAIRE — PROGRAMME D\'ÉDUCATION BILINGUE SPÉCIAL — PREMIER TRIMESTRE',
        en: 'REPORT CARD — SPECIAL BILINGUAL EDUCATION PROGRAMME — FIRST TERM' },
  t2: { fr: 'BULLETIN SCOLAIRE — PROGRAMME D\'ÉDUCATION BILINGUE SPÉCIAL — DEUXIÈME TRIMESTRE',
        en: 'REPORT CARD — SPECIAL BILINGUAL EDUCATION PROGRAMME — SECOND TERM' },
  t3: { fr: 'BULLETIN SCOLAIRE — PROGRAMME D\'ÉDUCATION BILINGUE SPÉCIAL — TROISIÈME TRIMESTRE',
        en: 'REPORT CARD — SPECIAL BILINGUAL EDUCATION PROGRAMME — THIRD TERM' },
  annual: { fr: 'BULLETIN SCOLAIRE ANNUEL — PROGRAMME D\'ÉDUCATION BILINGUE SPÉCIAL',
            en: 'ANNUAL REPORT CARD — SPECIAL BILINGUAL EDUCATION PROGRAMME' },
};

// ── Bandeaux ─────────────────────────────────────────────────────────────────
// Un bulletin dont toutes les matières ne sont pas notées porte la mention
// PROVISOIRE : mieux vaut l'écrire que de laisser croire à une synthèse arrêtée.
function provisoireHtml(data, sys) {
  const txt = bilProvisoireTexte(data, sys);
  if (!txt) return '';
  return `<div style="border:1.5px solid #b45309;background:#fef3c7;color:#92400e;padding:4px 8px;margin-bottom:5px;font-size:9.5px;font-weight:bold;text-align:center;-webkit-print-color-adjust:exact;print-color-adjust:exact">${esc(txt)}</div>`;
}

function programmeBandHtml(data, sys, classLabel) {
  const sousSysteme = data.serieId === 'bil_en'
    ? L(sys, 'Sous-système anglophone', 'English sub-system')
    : L(sys, 'Sous-système francophone', 'French sub-system');
  const prog = L(sys, 'Programme d\'Éducation Bilingue Spécial', 'Special Bilingual Education Programme');
  return `<div style="border:1px solid ${ACCENT};border-left:4px solid ${ACCENT};padding:3px 8px;margin-bottom:5px;font-size:9px;-webkit-print-color-adjust:exact;print-color-adjust:exact">
    <strong>${esc(prog)}</strong> · ${esc(sousSysteme)} · ${esc(classLabel || '')}
    <span style="float:right;color:#555">${esc(L(sys, 'Arrêté n°239-23/MINESEC du 14 juin 2023', 'Order No. 239-23/MINESEC of 14 June 2023'))}</span>
  </div>`;
}

// Bloc identité — MÊMES champs que l'aperçu écran (`OfficialIdentity`) : nom,
// classe, naissance, genre, effectif, matricule, redoublant, titulaire, parents.
// L'écran et le papier doivent donner la même fiche d'élève, sans quoi un parent
// qui compare les deux croit à deux documents différents.
function identityHtml(student, { classLabel, effectif, titulaire, sys }) {
  const parents = [student?.nom_pere, student?.nom_mere, student?.tuteur].filter(Boolean).join(' · ');
  const phone = student?.parent_phone ? ` (${esc(student.parent_phone)})` : '';
  const redoublant = String(student?.statut || '').toLowerCase().includes('redoubl');
  const chk = (on) => `<span style="display:inline-block;width:9px;height:9px;border:1px solid #374151;margin:0 2px;vertical-align:middle;background:${on ? '#374151' : '#fff'}"></span>`;
  const genre = student?.gender || '';
  return `
  <table style="width:100%;border-collapse:collapse;margin-bottom:5px">
    <tbody>
      <tr>
        <td rowspan="4" style="${C};width:70px;text-align:center;vertical-align:middle">
          ${student?.photo_url ? `<img src="${esc(student.photo_url)}" style="width:58px;height:70px;object-fit:cover"/>` : `<div style="font-size:8px;color:#888">${esc(L(sys, 'Photo', 'Photo'))}</div>`}
        </td>
        <td style="${C}">${esc(L(sys, "Nom et prénoms de l'élève", 'Name'))} : <strong>${esc(student?.name || '')}</strong></td>
        <td style="${C};white-space:nowrap">${esc(L(sys, 'Classe', 'Class'))} : <strong>${esc(classLabel || '')}</strong></td>
      </tr>
      <tr>
        <td style="${C}">${esc(L(sys, 'Date et lieu de naissance', 'Date and place of birth'))} : ${esc(student?.date_naissance || '')} ${student?.lieu_naissance ? 'à ' + esc(student.lieu_naissance) : ''}</td>
        <td style="${C}">${esc(L(sys, 'Genre', 'Gender'))} : ${esc(genre)} · ${esc(L(sys, 'Effectif', 'Class size'))} : ${esc(effectif ?? '')}</td>
      </tr>
      <tr>
        <td style="${C}">${esc(L(sys, 'Identifiant Unique', 'Student ID'))} : ${esc(student?.matricule || '')}</td>
        <td style="${C}">${esc(L(sys, 'Redoublant', 'Repeating'))} : ${esc(L(sys, 'Oui', 'Yes'))} ${chk(redoublant)} ${esc(L(sys, 'Non', 'No'))} ${chk(!redoublant)} · ${esc(L(sys, 'Titulaire', 'Class teacher'))} : ${esc(titulaire || '')}</td>
      </tr>
      <tr>
        <td colspan="2" style="${C}">${esc(L(sys, 'Noms et contacts des Parents / Tuteurs', 'Parents / guardians'))} : ${esc(parents)}${phone}</td>
      </tr>
    </tbody>
  </table>`;
}

const TH = (txt, w) => `<th style="${C};background:#eef2f7;text-align:center;font-size:8.5px${w ? `;width:${w}` : ''}">${esc(txt)}</th>`;

// ── Tableau TRIMESTRIEL ──────────────────────────────────────────────────────
function termHeadHtml(sys, seqLabels) {
  return `<tr>
    ${TH(L(sys, 'MATIÈRE / ENSEIGNANT', 'SUBJECT / TEACHER'), '28%')}
    ${TH(L(sys, 'Coef', 'Coef'), '5%')}
    ${seqLabels.map((s) => TH(s, '8%')).join('')}
    ${TH(L(sys, 'Moyenne', 'Average'), '9%')}
    ${TH(L(sys, 'Moy × Coef', 'Avg × Coef'), '9%')}
    ${TH(L(sys, 'Rang', 'Rank'), '6%')}
    ${TH(L(sys, 'Appréciation', 'Remark'), '16%')}
  </tr>`;
}

function termDomainHtml(d, sys, nbSeq) {
  const span = 5 + nbSeq;
  const head = `<tr><td colspan="${span + 1}" style="${C};background:#dde7f3;font-weight:bold;-webkit-print-color-adjust:exact;print-color-adjust:exact">${esc(d.nom)}</td></tr>`;
  const body = d.rows.map((r) => {
    // Matière applicable mais non notée : dite explicitement, jamais notée 0.
    const nonEval = `<span style="color:#9a3412">${esc(L(sys, 'non évaluée', 'not assessed'))}</span>`;
    return `<tr>
      <td style="${C}"><strong>${esc(r.nom)}</strong>${r.enseignant ? `<br/><span style="color:#666">${esc(r.enseignant)}</span>` : ''}${r.obligatoire === false ? `<br/><span style="color:#666;font-size:8px">${esc(L(sys, 'au choix', 'optional'))}</span>` : ''}</td>
      <td style="${C};text-align:center">${r.coef}</td>
      ${(r.notes || []).map((n) => `<td style="${C};text-align:center">${n == null ? '—' : fix2(n)}</td>`).join('')}
      <td style="${C};text-align:center"><strong>${r.evaluee ? fix2(r.moyenne) : nonEval}</strong>${r.partielle ? `<br/><span style="color:#9a3412;font-size:7.5px;font-weight:normal">${esc(L(sys, `sur ${r.nbSeqNotees}/${r.nbSeqAttendues} séq.`, `on ${r.nbSeqNotees}/${r.nbSeqAttendues} seq.`))}</span>` : ''}</td>
      <td style="${C};text-align:center">${r.evaluee ? fix2(r.ponderee) : '—'}</td>
      <td style="${C};text-align:center">${esc(r.rang)}</td>
      <td style="${C}">${esc(r.appreciation)}</td>
    </tr>`;
  }).join('');
  const sub = `<tr style="background:#f4f7fb;-webkit-print-color-adjust:exact;print-color-adjust:exact">
    <td style="${C};text-align:right;font-weight:bold">${esc(L(sys, 'Sous-total', 'Subtotal'))} — ${esc(d.nom)}</td>
    <td style="${C};text-align:center;font-weight:bold">${fix2(d.coefSum)}</td>
    <td colspan="${nbSeq}" style="${C}"></td>
    <td style="${C};text-align:center;font-weight:bold">${fix2(d.moyenne)}</td>
    <td style="${C};text-align:center;font-weight:bold">${fix2(d.pointsSum)}</td>
    <td colspan="2" style="${C}"></td>
  </tr>`;
  return head + body + sub;
}

// Synthèse — les trois grandeurs distinctes, dans cet ordre, puis le quotient.
function synthesisHtml(data, { sys, decision, discipline, observations } = {}) {
  const d = discipline || {};
  const kv = (k, v, strong) => `<tr><td style="${C}">${esc(k)}</td><td style="${C};text-align:center">${strong ? `<strong>${v ?? ''}</strong>` : (v ?? '')}</td></tr>`;
  const bareme = `/${data.maxScale ?? 20}`;
  return `
  <table style="width:100%;border-collapse:collapse;margin-top:6px">
    <tbody><tr>
      <td style="width:38%;vertical-align:top;padding-right:4px">
        <table style="width:100%;border-collapse:collapse"><tbody>
          <tr><td colspan="2" style="${C};background:#eef2f7;text-align:center;font-weight:bold;-webkit-print-color-adjust:exact;print-color-adjust:exact">${esc(L(sys, 'Résultats', 'Results'))}</td></tr>
          ${kv(L(sys, 'Total des points pondérés Σ(Moy×Coef)', 'Total weighted points Σ(Avg×Coef)'), fix2(data.totalPoints))}
          ${kv(L(sys, 'Total des coefficients retenus', 'Total coefficients counted'), fix2(data.totalCoef))}
          ${kv(L(sys, 'MOYENNE GÉNÉRALE', 'OVERALL AVERAGE'), `${fix2(data.moyenneGenerale)}${bareme}`, true)}
          ${kv(L(sys, 'Rang', 'Rank'), esc(data.generalRank || ''), true)}
          ${kv(L(sys, 'Appréciation', 'Remark'), esc(data.appreciation))}
        </tbody></table>
      </td>
      <td style="width:30%;vertical-align:top;padding-right:4px">
        <table style="width:100%;border-collapse:collapse"><tbody>
          <tr><td colspan="2" style="${C};background:#eef2f7;text-align:center;font-weight:bold;-webkit-print-color-adjust:exact;print-color-adjust:exact">${esc(L(sys, 'Discipline et conduite', 'Discipline and conduct'))}</td></tr>
          ${kv(L(sys, 'Abs. non justifiées (h)', 'Unjustified absences (h)'), d.absNJ ?? '')}
          ${kv(L(sys, 'Abs. justifiées (h)', 'Justified absences (h)'), d.absJ ?? '')}
          ${kv(L(sys, 'Conduite', 'Conduct'), esc(d.conduite || ''))}
          ${kv(L(sys, 'Exclusion (jours)', 'Suspension (days)'), d.exclusions || '')}
        </tbody></table>
      </td>
      <td style="width:32%;vertical-align:top">
        <table style="width:100%;border-collapse:collapse"><tbody>
          <tr><td colspan="2" style="${C};background:#eef2f7;text-align:center;font-weight:bold;-webkit-print-color-adjust:exact;print-color-adjust:exact">${esc(L(sys, 'Profil de la classe', 'Class profile'))}</td></tr>
          ${kv(L(sys, 'Moyenne de la classe', 'Class average'), fix2(data.classStats?.avg))}
          ${kv(L(sys, '[Min – Max]', '[Min – Max]'), data.classStats ? `${fix2(data.classStats.min)} – ${fix2(data.classStats.max)}` : '')}
          ${kv(L(sys, 'Matières évaluées', 'Subjects assessed'), `${data.nbEvaluees} / ${data.nbApplicables}`)}
          ${kv(L(sys, 'Σ coef applicables', 'Σ applicable coef'), fix2(data.totalCoefApplicable))}
        </tbody></table>
      </td>
    </tr></tbody>
  </table>
  <table style="width:100%;border-collapse:collapse;margin-top:4px"><tbody><tr>
    <td style="${C};width:56%;vertical-align:top;min-height:26px">
      ${esc(L(sys, 'Observations du conseil de classe', 'Class council remarks'))} :
      <strong>${esc(decision || d.decision || '')}</strong>
      ${observations ? `<br/><span style="color:#444">${esc(observations)}</span>` : ''}
      ${d.mentions?.length ? `<br/><span style="color:#444">${esc(L(sys, 'Mentions', 'Mentions'))} : ${esc(d.mentions.join(' · '))}</span>` : ''}
    </td>
    <td style="${C};width:22%;text-align:center">${esc(L(sys, 'Visa du parent / tuteur', 'Parent / guardian'))}</td>
    <td style="${C};width:22%;text-align:center">${esc(L(sys, 'Visa du titulaire', 'Class teacher'))}</td>
  </tr></tbody></table>`;
}

// ── Feuille A4 — bulletin TRIMESTRIEL ────────────────────────────────────────
export function buildBilBulletinSheet(ctx) {
  const data = assembleBilBulletin(ctx);
  const {
    school, trimestreId = 't1', classLabel, effectif, titulaire,
    student, decision, discipline, observations, seqs = [],
  } = ctx;
  const sys = data.sys;
  const title = (TITLE[trimestreId] || TITLE.t1)[sys === 'EN' ? 'en' : 'fr'];
  const seqLabels = seqs.map((s) => L(sys, `Séq. ${s}`, `Seq. ${s}`));

  const body = data.domaines.map((d) => termDomainHtml(d, sys, seqs.length)).join('');
  return SHEET_OPEN
    + officialHeaderHtml(school, { sys, title })
    + programmeBandHtml(data, sys, classLabel)
    + identityHtml(student, { classLabel, effectif, titulaire, sys })
    + provisoireHtml(data, sys)
    + `<table style="width:100%;border-collapse:collapse"><thead>${termHeadHtml(sys, seqLabels)}</thead><tbody>${body}</tbody></table>`
    + synthesisHtml({ ...data, maxScale: ctx.maxScale ?? 20 }, { sys, decision, discipline, observations })
    + officialSignatureHtml(school, sys)
    + SHEET_END;
}

// ── Feuille A4 — bulletin ANNUEL ─────────────────────────────────────────────
function annualHeadHtml(sys) {
  return `<tr>
    ${TH(L(sys, 'MATIÈRE', 'SUBJECT'), '30%')}
    ${TH(L(sys, 'Coef', 'Coef'), '6%')}
    ${TH(L(sys, 'Trim. 1', 'Term 1'), '9%')}${TH(L(sys, 'Trim. 2', 'Term 2'), '9%')}${TH(L(sys, 'Trim. 3', 'Term 3'), '9%')}
    ${TH(L(sys, 'Moy. annuelle', 'Annual avg'), '11%')}
    ${TH(L(sys, 'Moy × Coef', 'Avg × Coef'), '10%')}
    ${TH(L(sys, 'Appréciation', 'Remark'), '16%')}
  </tr>`;
}

function annualDomainHtml(d, sys) {
  const head = `<tr><td colspan="8" style="${C};background:#dde7f3;font-weight:bold;-webkit-print-color-adjust:exact;print-color-adjust:exact">${esc(d.nom)}</td></tr>`;
  const body = d.rows.map((r) => `<tr>
    <td style="${C}"><strong>${esc(r.nom)}</strong></td>
    <td style="${C};text-align:center">${r.coef}</td>
    ${(r.trimestres || []).map((t) => `<td style="${C};text-align:center">${t == null ? '—' : fix2(t)}</td>`).join('')}
    <td style="${C};text-align:center"><strong>${r.evaluee ? fix2(r.moyenne) : '—'}</strong></td>
    <td style="${C};text-align:center">${r.evaluee ? fix2(r.ponderee) : '—'}</td>
    <td style="${C}">${esc(r.appreciation)}</td>
  </tr>`).join('');
  const sub = `<tr style="background:#f4f7fb;-webkit-print-color-adjust:exact;print-color-adjust:exact">
    <td style="${C};text-align:right;font-weight:bold">${esc(L(sys, 'Sous-total', 'Subtotal'))} — ${esc(d.nom)}</td>
    <td style="${C};text-align:center;font-weight:bold">${fix2(d.coefSum)}</td>
    <td colspan="3" style="${C}"></td>
    <td style="${C};text-align:center;font-weight:bold">${fix2(d.moyenne)}</td>
    <td style="${C};text-align:center;font-weight:bold">${fix2(d.pointsSum)}</td>
    <td style="${C}"></td>
  </tr>`;
  return head + body + sub;
}

export function buildBilAnnualSheet(ctx) {
  const data = assembleBilAnnual(ctx);
  const { school, classLabel, effectif, titulaire, student, decision, discipline, observations } = ctx;
  const sys = data.sys;
  const title = TITLE.annual[sys === 'EN' ? 'en' : 'fr'];

  const moyRow = (i, label) => `<tr><td style="${C}">${esc(label)}</td><td style="${C};text-align:center">${fix2(data.moyennesTrimestres[i])}</td></tr>`;
  const recap = `
    <table style="width:38%;border-collapse:collapse;margin-top:6px"><tbody>
      <tr><td colspan="2" style="${C};background:#eef2f7;text-align:center;font-weight:bold;-webkit-print-color-adjust:exact;print-color-adjust:exact">${esc(L(sys, 'Moyennes trimestrielles', 'Term averages'))}</td></tr>
      ${moyRow(0, L(sys, 'Trimestre 1', 'Term 1'))}${moyRow(1, L(sys, 'Trimestre 2', 'Term 2'))}${moyRow(2, L(sys, 'Trimestre 3', 'Term 3'))}
    </tbody></table>`;

  // Comptes réels sur l'ANNÉE : une matière compte dès qu'elle a été évaluée au
  // moins une fois. Sans cela, le profil affichait « 0 / 0 », qui ne veut rien dire.
  const toutes = data.domaines.flatMap((d) => d.rows);
  const nbApplicables = toutes.length;
  const nbEvaluees = toutes.filter((r) => r.evaluee).length;

  // La méthode d'agrégation annuelle n'est fixée par aucun texte officiel : elle
  // est donc ÉCRITE sur le bulletin, pour que personne n'ait à la deviner.
  const methode = data.mode === 'term_mean'
    ? L(sys, 'moyenne des trois moyennes générales trimestrielles',
           'mean of the three overall term averages')
    : L(sys, 'moyenne annuelle de chaque matière, puis pondération par les coefficients',
           'annual average per subject, then weighted by coefficients');
  const note = `<div style="margin-top:4px;font-size:8px;color:#555">${esc(L(sys, 'Méthode de calcul de la moyenne annuelle', 'Annual average method'))} : ${esc(methode)}.</div>`;

  const body = data.domaines.map((d) => annualDomainHtml(d, sys)).join('');
  return SHEET_OPEN
    + officialHeaderHtml(school, { sys, title })
    + programmeBandHtml(data, sys, classLabel)
    + identityHtml(student, { classLabel, effectif, titulaire, sys })
    + provisoireHtml({ ...data, nbEvaluees, nbApplicables }, sys)
    + `<table style="width:100%;border-collapse:collapse"><thead>${annualHeadHtml(sys)}</thead><tbody>${body}</tbody></table>`
    + recap
    + synthesisHtml({ ...data, nbEvaluees, nbApplicables, totalCoefApplicable: toutes.reduce((a, r) => a + r.coef, 0), maxScale: ctx.maxScale ?? 20 },
      { sys, decision, discipline, observations })
    + note
    + officialSignatureHtml(school, sys)
    + SHEET_END;
}
