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
import { PAL_SEC } from '../core/bulletinAccent.js';
import {
  competencesFor, sequencesOfTrimestre, matiereAverage, weightedMatiere,
  generalAverage, apcCoteFromScale, apcBulletinCols, coefFor, APC_COTE_CODES,
  noteScale, APC_DEFAULT_MAX,
} from '../core/apcEngine.js';
import { moyenneEvaluations } from '../core/apcEvaluations.js';
import { gradeScaleBand, scaleMention } from '../core/bulletinEngine.js';
import { apcMatiereLabel } from '../core/referentielI18n.js';

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
// trimestre (toutes ses seqs) sans dupliquer la logique.
//   Pour chaque matière : ses compétences (N/xx = moyenne des séquences retenues),
//   M/xx (moyenne matière), coef (par classe), M×coef, cote.
//
// `onlyEvaluated` — bulletin de SÉQUENCE : on ne liste que les compétences
// réellement notées dans la séquence, et on omet la matière qui n'en a aucune.
// AUCUNE moyenne ne change : `matiereAverage` ignore déjà les compétences sans
// note (jamais comptées 0), donc le filtre ne touche que la liste affichée.
// Le bulletin TRIMESTRIEL garde la liste complète — c'est lui qui doit montrer
// ce qui reste à évaluer (cf. core/apcPeriods, « le bulletin de séquence »).
export function assemblePeriod(referentiel, apcNotes, { classeSlug, trimestreId, seqIds, student, teacherByMatiere = {}, gradeScale, sys = 'FR', onlyEvaluated = false }) {
  const seqs = seqIds && seqIds.length
    ? seqIds
    : sequencesOfTrimestre(referentiel.sequences, trimestreId).map((s) => s.id);

  // Note de la période d'une compétence : la moyenne de ses évaluations du
  // trimestre — une par séquence au plus (clé `apc_notes_uniq`), chacune avec
  // son propre barème.
  //
  // LA RÈGLE EST PARTAGÉE, elle n'est plus recopiée ici. Elle vit dans
  // `core/apcEvaluations.js` (`moyenneEvaluations`) depuis que l'écran de saisie
  // en a besoin lui aussi, pour afficher la note provisoire d'une compétence
  // évaluée une fois sur deux. Deux copies d'une règle de moyenne finissent par
  // donner deux moyennes — et c'est le bulletin qui a raison devant le parent.
  //
  // Rappel de ce qu'elle fait : barèmes identiques → moyenne brute, barème
  // conservé (« 2/3 » reste « 2/3 ») ; barèmes différents → moyenne des
  // proportions, exprimée sur /20.
  // Renvoie { note, max } ou null si la compétence n'est pas évaluée.
  const compNote = (competenceId) => moyenneEvaluations(
    seqs.map((sid) => apcNotes[noteNkey(student.id, competenceId, sid)]),
  );

  const matieres = [];
  for (const m of referentiel.matieres) {
    const comps = competencesFor(referentiel.competences, { classeId: classeSlug, trimestreId, matiereId: m.id });
    if (!comps.length) continue;
    const notesByComp = {};
    const compRows = comps.map((c) => {
      const v = compNote(c.id);                       // { note, max } | null
      if (v != null) notesByComp[c.id] = v;           // matiereAverage normalise
      // LE DÉTAIL DES ÉVALUATIONS, demandé le 2026-11-01 : « pour une matière à
      // une compétence, afficher les deux notes et leur moyenne (Éval. 1 |
      // Éval. 2 | Moyenne) en gardant la mise en page actuelle ». La moyenne
      // reste donc dans la colonne N, et les notes qui la composent s'écrivent
      // sous l'intitulé de la compétence : aucune colonne n'est ajoutée au
      // tableau, dont la largeur est déjà contrainte par le format A4.
      //
      // Renseigné SEULEMENT quand la compétence a plusieurs évaluations : sur une
      // matière à trois compétences notées une fois chacune, répéter la note sous
      // son propre intitulé n'apprendrait rien et mangerait une ligne.
      const evaluations = seqs
        .map((sid, i) => ({ rang: i + 1, v: noteScale(apcNotes[noteNkey(student.id, c.id, sid)]) }))
        .filter((x) => x.v !== null)
        .map((x) => ({ rang: x.rang, note: x.v.note, max: x.v.max }));
      return {
        intitule: c.intitule, note: v?.note ?? null, max: v?.max ?? null,
        evaluations: evaluations.length > 1 ? evaluations : null,
        // Porté jusqu'au rendu : c'est le nombre de compétences de la MATIÈRE
        // qui décide si le détail des évaluations tient sur la page (cf.
        // `evalDetailHtml`), pas la compétence prise isolément.
        nbCompetencesMatiere: comps.length,
      };
    });
    // La moyenne se calcule sur TOUTES les compétences du trimestre (celles sans
    // note étant ignorées) : elle est donc identique avec ou sans le filtre.
    const moyenne = matiereAverage(notesByComp, comps);
    const compRowsShown = onlyEvaluated ? compRows.filter((r) => r.note != null) : compRows;
    // Matière sans aucune compétence évaluée dans la séquence : rien à imprimer.
    if (onlyEvaluated && !compRowsShown.length) continue;
    const coef = coefFor(referentiel.classeMatieres, classeSlug, m);
    // Appréciation + intervalle [Min–Max] pilotés par le barème configurable de
    // l'école (school.grade_scale) — exactement comme le second cycle.
    const band = gradeScaleBand(moyenne, gradeScale);
    matieres.push({
      // Une classe anglophone qui n'a pas encore importé son référentiel CBA
      // retombe sur le catalogue francophone : on rend alors le nom de matière en
      // anglais (le catalogue anglophone, lui, est déjà rédigé en anglais).
      id: m.id, nom: apcMatiereLabel(m, sys), coef,
      enseignant: teacherByMatiere[m.id] || '',
      competences: compRowsShown,
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

// Le clamp deux lignes, en style en ligne : ce document est un HTML autonome
// envoyé à l'impression, il ne reçoit pas la feuille de style de l'application.
const CLAMP2 = 'display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden';

const TH = (txt, w) => `<th style="${C};background:${PAL_SEC().th};text-align:center;font-size:8.5px${w ? `;width:${w}` : ''}">${txt}</th>`;

// Colonnes de fin optionnelles (COTE / [Min–Max] / Appréciation) selon les bascules
// de l'établissement (school.apc_bulletin_cols). Ordre officiel préservé.
// LES MÊMES LARGEURS QUE L'APERÇU, AU POINT PRÈS.
//
// Ce document est le JUMEAU PDF de BulletinApcOfficial : le lot d'export passe
// par ici, l'aperçu écran par là, et le code dit depuis l'origine que les deux
// ne doivent pas diverger. Le 2026-11-02 l'aperçu a été rééquilibré (colonne
// compétences ramenée à 35 %, numériques élargies) parce que, SANS
// `table-layout: fixed`, le navigateur ignorait les pourcentages et donnait
// 26 % à une colonne qui en déclarait 42. Le jumeau avait exactement le même
// défaut : il est corrigé ici de la même façon, avec les mêmes chiffres.
// Libellés raccourcis pour la même raison : « Appréciations et Visa » occupait
// à lui seul une colonne vide de 114 px.
const TRAIL_TH = (sys) => ({
  cote:         [L(sys, 'COTE', 'GRADE'), '6%'],
  minmax:       ['Min–Max', '9%'],
  appreciation: [L(sys, 'Appréc. / Visa', 'Remarks / Visa'), '8%'],
});
const trailingCols = (cols) => ['cote', 'minmax', 'appreciation'].filter((k) => cols[k]);

// Toutes les compétences notées de la feuille sont-elles sur le barème /20 ?
// Si oui, l'en-tête officiel « N/20 » reste exact et le bulletin ne bouge pas
// d'un pixel. Sinon, chaque cellule porte son propre dénominateur (« 2/3 ») et
// l'en-tête devient « N » : un titre « N/20 » au-dessus d'un 2/3 mentirait.
const scalesUniform = (data) =>
  (data?.matieres || []).every((m) => (m.competences || [])
    .every((c) => c.note == null || c.max == null || c.max === APC_DEFAULT_MAX));

function tableHeadHtml(cols, sys, uniform = true) {
  const tr = trailingCols(cols);
  const th = TRAIL_TH(sys);
  const trailTh = (tr.length ? tr.map((k) => TH(th[k][0], th[k][1])) : [TH('', '23%')]).join('');
  return `<tr>
    ${TH(L(sys, 'MATIÈRES / ENSEIGNANT', 'SUBJECT / TEACHER'), '17%')}
    ${TH(L(sys, 'COMPÉTENCES ÉVALUÉES', 'COMPETENCES ASSESSED'), '35%')}
    ${TH(uniform ? 'N/20' : 'N', '6%')}${TH('M/20', '6%')}${TH('Coef', '5%')}${TH('M×coef', '8%')}${trailTh}
  </tr>`;
}

// Cellule « N » d'une compétence : la valeur seule quand le barème est celui du
// bulletin (/20), sinon la note AVEC son dénominateur réel.
const compNoteCell = (c) => {
  if (c.note == null) return '';
  const m = c.max == null ? APC_DEFAULT_MAX : c.max;
  return m === APC_DEFAULT_MAX ? fix2(c.note) : `${fix2(c.note)}/${fix2(m)}`;
};

// LE DÉTAIL D'UNE COMPÉTENCE ÉVALUÉE PLUSIEURS FOIS DANS LE TRIMESTRE.
// « 12 · 16 » au-dessus de leur moyenne, DANS LA COLONNE N. Le parent voit donc
// les deux notes et la note qui en découle, et l'enseignant reconnaît l'ordre
// des colonnes de sa grille de saisie (Éval. 1, puis Éval. 2).
//
// POURQUOI DANS CETTE COLONNE, ET PAS SOUS L'INTITULÉ — c'est une contrainte
// mesurée, pas une préférence. Placé sous l'intitulé, le détail ajoutait UNE
// LIGNE PAR COMPÉTENCE : le banc d'impression (`npm run test:print`, scénario
// « APC 14×4 ») est passé de 3 pages à 4, en rompant le contrat « une feuille =
// une page » tenu depuis I27/D28. La hauteur de la ligne est imposée par
// l'intitulé de la compétence, qui tient sur plusieurs lignes : écrire le détail
// dans la colonne N consomme une hauteur DÉJÀ PAYÉE. Vérifié : 3 pages → 3.
//
// Chaque note garde SON barème quand il n'est pas le barème par défaut : une
// évaluation sur 3 et une sur 20 se moyennent par leurs proportions (cf.
// core/apcEvaluations.js), et afficher « 2 · 14 » sans dénominateur laisserait
// croire à une erreur.
const evalDetailHtml = (c, sys) => {
  if (!c.evaluations || c.evaluations.length < 2) return '';
  // LE BUDGET D'UNE PAGE A4, mesuré et non supposé. Chaque détail ajoute une
  // ligne : sur une matière à 4 compétences toutes évaluées deux fois, le banc
  // d'impression passe de 3 pages à 4 (`npm run test:print`, « APC 14×4 ») et
  // rompt le contrat « une feuille = une page » tenu depuis I27/D28.
  //
  // Le détail est donc réservé aux matières de 1 ou 2 compétences — c'est
  // EXACTEMENT le cas demandé le 2026-11-01 (« pour une matière à une
  // compétence, afficher les deux notes et leur moyenne »), et il tient : 14
  // matières à une compétence évaluée deux fois restent sur le même nombre de
  // pages (scénario « APC 14×1 », ajouté au banc pour le prouver).
  //
  // Au-delà, la note de la compétence reste la moyenne de ses évaluations — le
  // calcul ne change pas — et le détail se lit sur l'écran de saisie.
  if (c.nbCompetencesMatiere > 2) return '';
  const une = (e) => `${L(sys, 'Éval.', 'Assess.')} ${e.rang} : ${
    e.max === APC_DEFAULT_MAX ? fix2(e.note) : `${fix2(e.note)}/${fix2(e.max)}`}`;
  return ` <span style="color:#666;font-size:.9em;white-space:nowrap">(${
    esc(c.evaluations.map(une).join(' · '))})</span>`;
};

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
      ${first ? `<td rowspan="${rs}" style="${C}"><strong>${esc(m.nom)}</strong><br/>${m.enseignant ? `<span style="color:#666">${esc(m.enseignant)}</span>` : ''}</td>` : ''}
      ${/* DEUX LIGNES AU PLUS, comme à l'aperçu. Le clamp est POSÉ SUR UN DIV
            INTERNE et jamais sur le <td> : -webkit-box retirerait à la cellule
            son display:table-cell et disloquerait la table. Le détail des
            évaluations reste HORS du clamp — c'est une donnée chiffrée, pas une
            phrase, et la tronquer serait une perte. */''}
      <td style="${C}" title="${esc(c.intitule)}"><div style="${CLAMP2}">${esc(c.intitule)}</div>${evalDetailHtml(c, sys)}</td>
      <td style="${C};text-align:center">${compNoteCell(c)}</td>
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
              <tr><td colspan="2" style="${C};background:${PAL_SEC().th};text-align:center;font-weight:bold">${L(sys, 'Discipline', 'Discipline')}</td></tr>
              ${kv(L(sys, 'Abs. non just. (h)', 'Unjust. abs. (h)'), '')}${kv(L(sys, 'Abs. just. (h)', 'Just. abs. (h)'), '')}${kv(L(sys, 'Retards (nombre)', 'Late arrivals (number)'), '')}${kv(L(sys, 'Consignes (h)', 'Detentions (h)'), '')}
              ${kv(L(sys, 'Avertissement', 'Warning'), '')}${kv(L(sys, 'Blâme de conduite', 'Conduct reprimand'), '')}${kv(L(sys, 'Exclusions (jours)', 'Exclusions (days)'), '')}${kv(L(sys, 'Exclusion définitive', 'Permanent exclusion'), '')}
            </tbody>
          </table>
        </td>
        <td style="width:34%;vertical-align:top;padding-right:4px">
          <table style="width:100%;border-collapse:collapse">
            <tbody>
              <tr><td colspan="2" style="${C};background:${PAL_SEC().th};text-align:center;font-weight:bold">${L(sys, "Travail de l'élève", "Student's work")}</td></tr>
              ${kv(L(sys, 'Total général', 'Grand total'), fix2(data.mxSum))}${kv('Coef', fix2(data.coefSum))}
              ${kv(L(sys, 'MOYENNE TRIM', 'TERM AVERAGE'), `<strong>${fix2(data.moyenneGenerale)}</strong>`)}${kv(L(sys, 'Cote', 'Grade'), `<strong>${data.moyenneGenerale != null ? data.cote : ''}</strong>`)}
              ${APC_COTE_CODES.map((c) => kv(c, coteCounts[c])).join('')}
            </tbody>
          </table>
        </td>
        <td style="width:32%;vertical-align:top">
          <table style="width:100%;border-collapse:collapse">
            <tbody>
              <tr><td colspan="2" style="${C};background:${PAL_SEC().th};text-align:center;font-weight:bold">${L(sys, 'Profil de la classe', 'Class profile')}</td></tr>
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
// 34 et non 44 : la colonne COMPÉTENCES déclare 35 % de 194 mm, soit 68 mm,
// et un caractère de 8 px en occupe environ 2,0 mm. 44 était la valeur de
// l'époque où la colonne prenait toute la place restante ; la garder, c'était
// compter une ligne là où le document en rend deux.
const APC_CHARS_PER_LINE = 34;

// BORNÉ À DEUX, parce que le rendu l'est maintenant (CLAMP2). Compter trois ou
// quatre lignes pour un intitulé long, c'est réserver une hauteur que le
// document n'occupe plus : le paginateur coupait alors en deux une feuille qui
// tenait. La borne n'est pas une approximation, c'est la règle de rendu.
const APC_LIGNES_MAX_COMP = 2;
const apcCompLines = (c) => Math.min(
  APC_LIGNES_MAX_COMP,
  Math.max(1, Math.ceil(String(c.intitule || '').length / APC_CHARS_PER_LINE)),
);
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
  const uniforme = scalesUniform(data);   // toutes les compétences notées sur /20 ?

  const title = TRIM_TITLE[trimestreId] || TRIM_TITLE.t1;
  const header = (pageData, withFooter) => {
    const rows = pageData.map((m) => matiereRowsHtml(m, cols, sys)).join('');
    return SHEET_OPEN
      + officialHeaderHtml(school, { sys, title: sys === 'EN' ? title.en : title.fr, accent: PAL_SEC().accent })
      + identityHtml(student, { classLabel, sys, effectif, profPrincipal })
      + `<table style="width:100%;border-collapse:collapse;table-layout:fixed"><thead>${tableHeadHtml(cols, sys, uniforme)}</thead><tbody>${rows}${withFooter && !footerOwnPage ? totalRowHtml(data, cols, sys) : ''}</tbody></table>`
      + (withFooter && !footerOwnPage ? footerBlocksHtml(data, { classStats, sys }) : '')
      + SHEET_CLOSE;
  };

  const sheets = pages.map((pg, i) => header(pg, i === pages.length - 1));
  if (footerOwnPage) {
    sheets.push(
      SHEET_OPEN
      + officialHeaderHtml(school, { sys, title: sys === 'EN' ? title.en : title.fr, accent: PAL_SEC().accent })
      + `<table style="width:100%;border-collapse:collapse;table-layout:fixed"><thead>${tableHeadHtml(cols, sys, uniforme)}</thead><tbody>${totalRowHtml(data, cols, sys)}</tbody></table>`
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
