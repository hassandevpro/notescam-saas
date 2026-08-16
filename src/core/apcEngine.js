// Moteur APC_MINISTERIEL_MINESEC — logique métier pure (pas de React, pas de DOM).
// Pendant de bulletinEngine.js pour le modèle PAR COMPÉTENCES du premier cycle
// secondaire camerounais :
//
//   Cycle → Classe → Trimestre → Séquence → Matière → Compétence → Note
//
// Une compétence appartient à (cycle, classe, trimestre, matière) et est HÉRITÉE
// par les deux séquences de son trimestre (S1+S2→T1, S3+S4→T2, S5+S6→T3) SANS
// duplication : la note porte (competence_id, sequence_id).
//
// Formes de données (telles que renvoyées par le référentiel) :
//   competence = { id, cycle_id, classe_id, trimestre_id, matiere_id, ordre,
//                  intitule, coefficient|null, actif }
//   matiere    = { id, nom, coefficient, optionnelle }
//   sequence   = { id, numero, trimestre_id }
//   notes      = { [competence_id]: <nombre> }   (pour un élève × une séquence)

// --- Cotes officielles MINESEC (colonne « COTE » du bulletin APC) --------------
// 5 niveaux : CTBA / CBA / CA / CMA / CNA. Source unique pour que Grades.jsx, le
// moteur et le PDF restent cohérents. Bornes sur /20 (colonne « [Min – Max] ») —
// valeurs par défaut courantes, ajustables ultérieurement par configuration.
export const APC_COTE_BANDS = [
  { code: 'CTBA', min: 16, max: 20,    mention: { fr: 'Compétence Très Bien Acquise', en: 'Skill Very Well Acquired' }, col: '#059669' },
  { code: 'CBA',  min: 14, max: 15.99, mention: { fr: 'Compétence Bien Acquise',      en: 'Skill Well Acquired' },      col: '#10b981' },
  { code: 'CA',   min: 12, max: 13.99, mention: { fr: 'Compétence Acquise',           en: 'Skill Acquired' },           col: '#3b82f6' },
  { code: 'CMA',  min: 10, max: 11.99, mention: { fr: 'Compétence Moyennement Acquise', en: 'Skill Moderately Acquired' }, col: '#f59e0b' },
  { code: 'CNA',  min: 0,  max: 9.99,  mention: { fr: 'Compétence Non Acquise',        en: 'Skill Not Acquired' },        col: '#ef4444' },
];

export const APC_COTE_CODES  = APC_COTE_BANDS.map((b) => b.code);
export const APC_COTE_COLORS = Object.fromEntries(APC_COTE_BANDS.map((b) => [b.code, b.col]));
export const APC_COTE_LABELS = Object.fromEntries(APC_COTE_BANDS.map((b) => [b.code, b.mention]));

// Cote (CTBA…CNA) d'une note/moyenne sur /20.
export const apcCote = (avg) => {
  if (avg == null) return { code: '—', col: '#6b7280' };
  const hit = APC_COTE_BANDS.find((b) => avg >= b.min) || APC_COTE_BANDS[APC_COTE_BANDS.length - 1];
  return { code: hit.code, mention: hit.mention, col: hit.col };
};

// Cote ALIGNÉE sur le barème configurable de l'école (school.grade_scale).
// Principe : on prend le RANG de la bande du barème (triée par minimum décroissant)
// et on lui associe le code de cote MINESEC de même rang (1re bande → CTBA, etc.).
// Ainsi la COTE et l'Appréciation pointent toujours le MÊME niveau, et changer les
// seuils du barème dans Paramètres déplace la cote en conséquence.
export const apcCoteFromScale = (avg, gradeScale) => {
  if (avg == null) return { code: '—', col: '#6b7280' };
  const scale  = Array.isArray(gradeScale) && gradeScale.length ? gradeScale : null;
  if (!scale) return apcCote(avg); // pas de barème → repli sur les bandes MINESEC
  const sorted = [...scale].sort((a, b) => b.min - a.min);
  let idx = sorted.findIndex((e) => avg >= e.min && avg <= e.max);
  if (idx < 0) idx = avg >= sorted[0].min ? 0 : sorted.length - 1;
  const band = APC_COTE_BANDS[Math.min(idx, APC_COTE_BANDS.length - 1)];
  return { code: band.code, mention: band.mention, col: band.col };
};

// Colonnes optionnelles du bulletin APC (premier cycle) : COTE / [Min–Max] /
// Appréciation. Chacune peut être activée ou désactivée par l'établissement
// (school.apc_bulletin_cols). Par défaut : toutes affichées.
export const APC_BULLETIN_COLS_DEFAULT = { cote: true, minmax: true, appreciation: true };
export const apcBulletinCols = (school) => {
  const c = school?.apc_bulletin_cols;
  if (!c || typeof c !== 'object') return { ...APC_BULLETIN_COLS_DEFAULT };
  return {
    cote:         c.cote !== false,
    minmax:       c.minmax !== false,
    appreciation: c.appreciation !== false,
  };
};

// --- Correspondance fixe séquence ⇄ trimestre (repli si pas de table fournie) --
export const SEQ_TO_TRIM = { 1: 't1', 2: 't1', 3: 't2', 4: 't2', 5: 't3', 6: 't3' };
export const TRIM_TO_SEQ = { t1: [1, 2], t2: [3, 4], t3: [5, 6] };

// trimestre d'une séquence — via la table fournie si dispo, sinon la constante.
export const trimestreOfSequence = (sequences, sequenceId) => {
  const s = (sequences || []).find((x) => x.id === sequenceId);
  if (s) return s.trimestre_id;
  // repli : sequenceId peut être 's3' ou le numéro 3
  const num = typeof sequenceId === 'string' ? parseInt(sequenceId.replace(/\D/g, ''), 10) : sequenceId;
  return SEQ_TO_TRIM[num] || null;
};

// les deux séquences d'un trimestre (héritage des compétences, sans duplication).
export const sequencesOfTrimestre = (sequences, trimestreId) => {
  const fromTable = (sequences || []).filter((s) => s.trimestre_id === trimestreId);
  if (fromTable.length) return fromTable.sort((a, b) => a.numero - b.numero);
  return (TRIM_TO_SEQ[trimestreId] || []).map((numero) => ({ id: `s${numero}`, numero, trimestre_id: trimestreId }));
};

// --- Sélection des compétences officielles ------------------------------------
// Toutes les compétences ACTIVES de (classe, trimestre, matière), triées par ordre.
// C'est la liste verrouillée chargée à l'ouverture de la saisie enseignant.
export const competencesFor = (competences, { classeId, trimestreId, matiereId }) =>
  (competences || [])
    .filter(
      (c) =>
        c.actif !== false &&
        c.classe_id === classeId &&
        c.trimestre_id === trimestreId &&
        c.matiere_id === matiereId,
    )
    .sort((a, b) => (a.ordre || 0) - (b.ordre || 0));

const _num = (v) => {
  if (v === null || v === undefined || v === '' || v === 'ABS') return null;
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
};

// --- Moyenne d'une matière ----------------------------------------------------
// Moyenne (pondérée par competence.coefficient, défaut 1) des compétences NOTÉES
// de la matière. Les compétences sans note sont ignorées. Renvoie null si aucune.
export const matiereAverage = (notes, competences) => {
  let sw = 0, tc = 0;
  for (const c of competences || []) {
    const n = _num(notes?.[c.id]);
    if (n === null) continue;
    const coef = c.coefficient == null ? 1 : Number(c.coefficient) || 1;
    sw += n * coef;
    tc += coef;
  }
  return tc ? Math.round((sw / tc) * 100) / 100 : null;
};

// Moyenne matière × coefficient de la matière (contribution à la moyenne générale).
export const weightedMatiere = (moyenneMatiere, matiereCoef) =>
  moyenneMatiere == null ? null : Math.round(moyenneMatiere * (matiereCoef || 1) * 100) / 100;

// --- Moyenne générale ---------------------------------------------------------
// Calculée UNIQUEMENT à partir des moyennes matières (jamais des compétences
// brutes). `rows` = [{ moyenne, coef }] ; les matières non notées sont exclues.
export const generalAverage = (rows) => {
  let sw = 0, tc = 0;
  for (const r of rows || []) {
    if (r.moyenne == null) continue;
    const coef = r.coef || 1;
    sw += r.moyenne * coef;
    tc += coef;
  }
  return tc ? Math.round((sw / tc) * 100) / 100 : null;
};

// Coefficient d'une matière POUR une classe (table apc_classe_matieres si
// fournie, sinon repli sur le coef global de la matière, sinon 1).
export const coefFor = (classeMatieres, classeId, matiere) => {
  const row = (classeMatieres || []).find((r) => r.classe_id === classeId && r.matiere_id === matiere.id);
  if (row && row.coefficient != null) return Number(row.coefficient) || 1;
  return matiere?.coefficient || 1;
};

// Construit les moyennes matières d'un élève sur une séquence (ou un trimestre
// déjà fusionné) à partir des compétences et des notes.
//   competences   : toutes les compétences (classe/trimestre confondus possibles)
//   matieres       : [{ id, coefficient }]
//   notes          : { [competence_id]: note }
//   filter         : { classeId, trimestreId } pour restreindre les compétences
//   classeMatieres : table coef par (classe, matière) — optionnelle
// Renvoie [{ matiere, moyenne, coef, ponderee, cote }].
export const matiereRows = (competences, matieres, notes, filter = {}, classeMatieres = []) =>
  (matieres || []).map((m) => {
    const comps = (competences || []).filter(
      (c) =>
        c.actif !== false &&
        c.matiere_id === m.id &&
        (!filter.classeId || c.classe_id === filter.classeId) &&
        (!filter.trimestreId || c.trimestre_id === filter.trimestreId),
    );
    const moyenne = matiereAverage(notes, comps);
    const coef = filter.classeId ? coefFor(classeMatieres, filter.classeId, m) : (m.coefficient || 1);
    return {
      matiere: m,
      moyenne,
      coef,
      ponderee: weightedMatiere(moyenne, coef),
      cote: apcCote(moyenne).code,
    };
  });

// --- Matières d'une classe (auto-configuration) -------------------------------
// Liste ORDONNÉE des matières du référentiel qui s'appliquent à une classe APC
// (slug '6e'…'3e'), avec coef. Le contenu fait autorité : on prend l'UNION des
// matières ayant des compétences pour la classe ET de celles déclarées dans
// apc_classe_matieres (coef/ordre). Repli ultime si rien par classe mais que le
// catalogue de matières est seedé → tout le catalogue. Renvoie [{ matiere_id, nom,
// coef, ordre }].
export function matieresForApcClasse(referentiel, classeSlug) {
  const matById = new Map((referentiel?.matieres || []).map((m) => [m.id, m]));
  const cmRows  = (referentiel?.classeMatieres || []).filter((r) => r.classe_id === classeSlug);
  const cmById  = new Map(cmRows.map((r) => [r.matiere_id, r]));

  // Matières référencées par au moins une compétence active de la classe.
  const compIds = (referentiel?.competences || [])
    .filter((c) => c.actif !== false && c.classe_id === classeSlug)
    .map((c) => c.matiere_id);

  // Union (compétences + classe_matieres), en préservant l'unicité.
  const ids = [...new Set([...compIds, ...cmRows.map((r) => r.matiere_id)])];

  let entries = ids
    .map((id) => {
      const m = matById.get(id);
      if (!m) return null;
      const cm = cmById.get(id);
      return {
        matiere_id: id,
        nom: m.nom,
        coef: cm && cm.coefficient != null ? Number(cm.coefficient) || 1 : (m.coefficient || 1),
        ordre: cm && cm.ordre != null ? cm.ordre : (m.ordre ?? 0),
      };
    })
    .filter(Boolean);

  // Repli ultime : aucune info par classe (référentiel partiel) mais catalogue de
  // matières présent → on configure tout le catalogue (l'utilisateur ajustera).
  if (!entries.length && matById.size) {
    entries = [...matById.values()].map((m) => ({ matiere_id: m.id, nom: m.nom, coef: m.coefficient || 1, ordre: m.ordre ?? 0 }));
  }

  return entries.sort((a, b) => (a.ordre - b.ordre) || a.nom.localeCompare(b.nom));
}

// Convertit les lignes de matières APC en `subjects` à créer pour une classe.
// (id généré par l'appelant via uuid pour rester pur ici.)
export function subjectsFromApcReferentiel(rows, { schoolId, classId, gradeMax = 20, makeId }) {
  return (rows || []).map((r, i) => ({
    id: makeId(),
    school_id: schoolId,
    class_id: classId,
    name: r.nom,
    coef: r.coef || 1,
    max: gradeMax,
    position: i,
  }));
}

// --- Classement (rangs) à partir des moyennes générales -----------------------
// students = [{ id, ... }] ; avgById = { [studentId]: moyenneGenerale|null }.
// Mêmes règles que buildRanks (bulletinEngine) : ex æquo partagent le rang.
export const buildApcRanks = (students, avgById, excl = {}) => {
  const wa = (students || []).map((s) => ({
    ...s,
    excluded: !!excl[s.id],
    av: excl[s.id] ? null : (avgById?.[s.id] ?? null),
  }));
  wa.sort((a, b) => {
    if (a.av === null && b.av === null) return 0;
    if (a.av === null) return 1;
    if (b.av === null) return -1;
    return b.av - a.av;
  });
  let rk = 1;
  wa.forEach((s, i) => {
    if (s.av === null) { s.rang = '—'; return; }
    if (i > 0 && wa[i - 1].av !== null && s.av < wa[i - 1].av) rk = i + 1;
    s.rang = rk;
  });
  return wa;
};

// ── Clé locale d'une note APC ────────────────────────────────────────────────
// Identité d'une note = (élève, compétence, séquence). Définie ICI (module pur)
// pour que les assembleurs de bulletins et de procès-verbaux puissent la lire
// sans dépendre de la couche Supabase ; `lib/apcService` la réexporte.
export const noteNkey = (eleveId, competenceId, sequenceId) =>
  `${eleveId}_${competenceId}_${sequenceId}`;
