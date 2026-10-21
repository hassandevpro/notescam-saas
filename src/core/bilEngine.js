// Moteur PROGRAMME D'ÉDUCATION BILINGUE SPÉCIAL — premier cycle (logique pure).
//
// Référence : arrêté n°239-23/MINESEC du 14 juin 2023, sections I-2 (francophone,
// 6e–3e) et II-2 (anglophone, Form 1–5).
//
// ISOLATION — ce module ne modifie RIEN du moteur SC-MINESEC (scEngine.js) ni du
// moteur de notes classique (bulletinEngine.js). Il définit sa PROPRE règle de
// moyenne générale, décidée pour ce bulletin :
//
//     Moyenne générale = Σ (moyenne de matière × coefficient) / Σ coefficients
//
// Elle diffère volontairement de `multiAvg` (moyenne arithmétique des moyennes
// générales de chaque séquence) utilisée par le second cycle. Les deux coexistent :
// chaque bulletin applique la règle de son propre arrêté.
//
// Règles de comptage (décidées, non négociables) :
//   • une note réellement égale à 0 COMPTE ;
//   • une matière non évaluée est exclue du numérateur ET du dénominateur ;
//   • une matière non applicable à la classe n'existe pas dans le bulletin ;
//   • le coefficient vient du référentiel — JAMAIS la charge horaire.

import { DEFAULT_GRADE_SCALE, scaleMention } from './bulletinEngine.js';

// ── Appréciation ─────────────────────────────────────────────────────────────
// On ne passe PAS par `getAppreciation` : pour sys 'EN' celle-ci bascule sur
// `enGrade`, qui raisonne en pourcentage (/100) et expose `.txt` et non `.text`.
// Or l'arrêté 239-23 fixe des COEFFICIENTS, pas un barème : les deux
// sous-systèmes du programme bilingue sont notés sur l'échelle de la classe
// (/20 par défaut). On lit donc les bandes du barème de l'école, et seule la
// LANGUE du libellé suit le sous-système — via `scaleMention`, qui laisse intact
// le vocabulaire d'un barème personnalisé.
export function bilAppreciation(moyenne, gradeScale, sys) {
  if (moyenne === null || moyenne === undefined) return '';
  const scale = Array.isArray(gradeScale) && gradeScale.length ? gradeScale : DEFAULT_GRADE_SCALE;
  const sorted = [...scale].sort((a, b) => b.min - a.min);
  const band = sorted.find((e) => moyenne >= e.min && moyenne <= e.max)
    || (moyenne >= sorted[0].min ? sorted[0] : sorted[sorted.length - 1]);
  return scaleMention(band, gradeScale, sys) || '';
}

// ── Arrondi centralisé ───────────────────────────────────────────────────────
// Un seul point d'arrondi pour tout le bulletin : aperçu et PDF partagent cette
// fonction, donc ils ne peuvent pas diverger d'un centième.
export const r2 = (v) => (v == null ? null : Math.round(v * 100) / 100);

// ── Séries du programme ──────────────────────────────────────────────────────
export const BIL_SERIE_FR = 'bil_fr';
export const BIL_SERIE_EN = 'bil_en';

// Sous-système déduit du slug de classe du référentiel : 6e…3e → francophone,
// form1…form5 → anglophone. La correspondance est 1:1 et sans ambiguïté, donc le
// sous-système n'a pas à être saisi à la main.
export function bilSerieForClasseSlug(classeSlug) {
  if (!classeSlug) return null;
  if (['6e', '5e', '4e', '3e'].includes(classeSlug)) return BIL_SERIE_FR;
  if (/^form[1-5]$/.test(classeSlug)) return BIL_SERIE_EN;
  return null;
}

// Classes EN SERVICE — source de vérité dans engineResolver (c'est lui qui route),
// ré-exportée ici pour que le domaine bilingue n'ait qu'un point d'entrée.
export { BIL_CLASSES_EN_SERVICE, BIL_CLASSES_HORS_SERVICE, isBilClasseEnService } from './engineResolver.js';

// Système de notation d'une série : le francophone note /20, l'anglophone /20
// également dans ce programme (l'arrêté fixe des coefficients, pas un barème ;
// le barème reste celui de la classe via `grade_max`). `sys` ne sert donc qu'à la
// langue des appréciations.
export const bilSysForSerie = (serieId) => (serieId === BIL_SERIE_EN ? 'EN' : 'FR');

// ── Lecture d'une note ───────────────────────────────────────────────────────
// Renvoie un nombre, ou null si la note est absente / non évaluée.
//
// ATTENTION — la différence avec `fusedG` du moteur classique est VOULUE : celui-ci
// teste `!v`, ce qui écarte le nombre 0 (la chaîne "0" passe, et comme
// `grades.value` est une colonne TEXT, le cas ne se produit pas en pratique).
// Ici le zéro est une note comme une autre, quelle que soit sa forme, parce que la
// règle décidée l'exige explicitement.
export function parseNote(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v).trim();
  if (s === '' || s.toUpperCase() === 'ABS') return null;
  const n = parseFloat(s.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

// Notes d'une matière, séquence par séquence, ramenées au barème de sortie.
// Alimente les colonnes « Séquence 1 / Séquence 2 » du bulletin : l'élève et sa
// famille doivent pouvoir refaire le calcul à la main depuis le papier.
export function subjectSeqNotes(allGrades, classId, studentId, seqs, subject, maxScale = 20) {
  const max = Number(subject.max) || maxScale;
  return (seqs || []).map((seq) => {
    const n = parseNote((allGrades?.[`${classId}_${studentId}_${seq}`] || {})[subject.id]);
    return n === null ? null : r2((n / max) * maxScale);
  });
}

// Moyenne d'une matière sur les séquences demandées, ramenée au barème de sortie.
// Chaque note est normalisée par le barème de SA matière (`max`) puis remise à
// l'échelle `maxScale` — un contrôle noté /10 ne pèse donc pas double.
// Renvoie null si AUCUNE séquence n'est notée (matière non évaluée).
export function subjectMean(allGrades, classId, studentId, seqs, subject, maxScale = 20) {
  const max = Number(subject.max) || maxScale;
  const vals = [];
  for (const seq of seqs || []) {
    const n = parseNote((allGrades?.[`${classId}_${studentId}_${seq}`] || {})[subject.id]);
    if (n !== null) vals.push((n / max) * maxScale);
  }
  if (!vals.length) return null;
  return r2(vals.reduce((a, b) => a + b, 0) / vals.length);
}

// ── Référentiel → matières d'une classe ──────────────────────────────────────
// Lignes du référentiel pour (série, classe), enrichies du nom de matière et du
// domaine, triées par (ordre de domaine, ordre de matière, nom).
// `obligatoire: false` (Form 4/5 « au choix selon les orientations ») est CONSERVÉ
// tel quel : c'est l'appelant qui décide de l'affecter ou non à l'élève.
export function matieresForBilClasse(referentiel, { serieId, classeId }) {
  const matById = new Map((referentiel?.matieres || []).map((m) => [m.id, m]));
  const domById = new Map((referentiel?.groupes || []).map((g) => [g.id, g]));
  return (referentiel?.entries || referentiel?.serieMatieres || [])
    .filter((r) => r.actif !== false
      && (r.serie ?? r.serie_id) === serieId
      && (r.classe ?? r.classe_id) === classeId)
    .map((r) => {
      const mid = r.matiere ?? r.matiere_id;
      const gid = r.groupe ?? r.groupe_id;
      const m = matById.get(mid) || { id: mid, nom: mid };
      const d = domById.get(gid) || { id: gid, nom: gid, ordre: 99 };
      return {
        matiere_id: mid,
        nom: m.nom,
        coefficient: Number(r.coef ?? r.coefficient) || 0,
        // Transportée pour l'affichage uniquement — jamais utilisée comme coefficient.
        charge_horaire: (r.charge ?? r.charge_horaire) == null ? null : Number(r.charge ?? r.charge_horaire),
        domaine_id: gid,
        domaine_nom: d.nom,
        domaine_ordre: d.ordre ?? 99,
        obligatoire: r.obligatoire !== false,
        matiere_ordre: m.ordre ?? 0,
      };
    })
    .sort((a, b) => (a.domaine_ordre - b.domaine_ordre)
      || (a.matiere_ordre - b.matiere_ordre)
      || a.nom.localeCompare(b.nom, 'fr'));
}

// ── Bulletin TRIMESTRIEL ─────────────────────────────────────────────────────
// ctx : { subjects, allGrades, classId, student, seqs, serieId, gradeScale,
//         maxScale, subjectRanks, subjectStats, generalRank, classStats,
//         teachersById }
//
// `subjects` = les matières RÉELLEMENT affectées à la classe (donc déjà filtrées
// sur l'applicabilité). Chacune porte : id, name, coef, max, bil_domaine,
// bil_domaine_ordre, charge_horaire, position.
//
// Renvoie :
//   { domaines[], totalCoef, totalPoints, moyenneGenerale, appreciation,
//     nbApplicables, nbEvaluees, complet, provisoire, generalRank, classStats }
//
// totalPoints = Σ(moyenne × coef) et totalCoef = Σcoef ne portent QUE sur les
// matières évaluées — c'est ce qui rend `totalPoints / totalCoef` exactement égal
// à la moyenne générale imprimée. Les trois sont exposés séparément pour pouvoir
// être affichés distinctement, comme décidé.
export function assembleBilBulletin(ctx) {
  const {
    subjects = [], allGrades = {}, classId, student, seqs = [],
    serieId = BIL_SERIE_FR, gradeScale, maxScale = 20,
    subjectRanks = {}, subjectStats = {}, generalRank = null, classStats = null,
    teachersById = {},
  } = ctx;
  const sys = bilSysForSerie(serieId);

  const nbSeq = (seqs || []).length;
  const rows = orderedBilSubjects(subjects).map((s) => {
    const coef = Number(s.coef) || 0;
    const notes = subjectSeqNotes(allGrades, classId, student.id, seqs, s, maxScale);
    const moyenne = subjectMean(allGrades, classId, student.id, seqs, s, maxScale);
    const evaluee = moyenne !== null;
    // COUVERTURE DES SÉQUENCES — distincte de « évaluée ». Une matière notée en
    // séquence 1 mais pas en séquence 2 EST évaluée (sa moyenne existe), mais sa
    // couverture est PARTIELLE. Les deux situations sont tenues séparées : l'une
    // dit « aucune information », l'autre « information incomplète ». Un zéro
    // réel n'est ni l'une ni l'autre : c'est une note, et il est compté.
    const nbSeqNotees = notes.filter((n) => n !== null).length;
    const partielle = evaluee && nbSeq > 0 && nbSeqNotees < nbSeq;
    const st = subjectStats[s.id];
    return {
      id: s.id,
      nom: s.name,
      coef,
      nbSeqNotees,
      nbSeqAttendues: nbSeq,
      partielle,
      charge: s.charge_horaire == null ? null : Number(s.charge_horaire),
      obligatoire: s.bil_obligatoire !== false,
      domaine_nom: s.bil_domaine || '',
      domaine_ordre: s.bil_domaine_ordre ?? 99,
      enseignant: (s.teacher_id && teachersById[s.teacher_id]) || '',
      notes,
      moyenne,
      evaluee,
      // Points pondérés de la matière : null si non évaluée (et non 0, qui se
      // confondrait avec un élève ayant réellement eu 0).
      ponderee: evaluee ? r2(moyenne * coef) : null,
      rang: subjectRanks[s.id]?.[student.id] || '',
      minmax: st && st.min != null ? { min: st.min, max: st.max } : null,
      appreciation: evaluee ? bilAppreciation(moyenne, gradeScale, sys) : '',
    };
  });

  // Regroupement par domaine d'apprentissage.
  const byDom = new Map();
  for (const r of rows) {
    const key = `${r.domaine_ordre}|${r.domaine_nom}`;
    if (!byDom.has(key)) {
      // Libellé de repli dans la LANGUE du sous-système : il était figé en
      // français, et une classe Form 1–5 (sous-système anglophone) lisait donc
      // « AUTRES MATIÈRES » au milieu d'un bulletin anglais.
      const replis = sys === 'EN' ? 'OTHER SUBJECTS' : 'AUTRES MATIÈRES';
      byDom.set(key, { nom: r.domaine_nom || replis, ordre: r.domaine_ordre, rows: [], coefSum: 0, pointsSum: 0, chargeSum: 0 });
    }
    const d = byDom.get(key);
    d.rows.push(r);
    if (r.evaluee) { d.coefSum += r.coef; d.pointsSum += r.ponderee; }
    if (r.charge != null) d.chargeSum += r.charge;
  }
  const domaines = [...byDom.values()]
    .sort((a, b) => a.ordre - b.ordre)
    .map((d) => ({
      ...d,
      pointsSum: r2(d.pointsSum),
      moyenne: d.coefSum ? r2(d.pointsSum / d.coefSum) : null,
    }));

  const totalCoef = domaines.reduce((a, d) => a + d.coefSum, 0);
  const totalPoints = r2(domaines.reduce((a, d) => a + d.pointsSum, 0));
  const moyenneGenerale = totalCoef ? r2(totalPoints / totalCoef) : null;

  const nbApplicables = rows.length;
  const nbEvaluees = rows.filter((r) => r.evaluee).length;
  // Matières évaluées mais sur une PARTIE seulement des séquences du trimestre.
  const nbPartielles = rows.filter((r) => r.partielle).length;
  const matieresPartielles = rows.filter((r) => r.partielle).map((r) => r.nom);
  const matieresNonEvaluees = rows.filter((r) => !r.evaluee).map((r) => r.nom);
  // COMPLET = toutes applicables évaluées ET toutes les séquences couvertes.
  // Sans la seconde condition, un bulletin reposant sur une seule séquence sur
  // deux passait pour définitif — c'est exactement le cas où les méthodes de
  // moyenne divergent, donc celui qu'il faut signaler.
  const complet = nbApplicables > 0 && nbEvaluees === nbApplicables && nbPartielles === 0;

  return {
    domaines,
    totalCoef,
    totalPoints,
    moyenneGenerale,
    appreciation: moyenneGenerale === null ? ''
      : bilAppreciation(moyenneGenerale, gradeScale, sys),
    nbApplicables,
    nbEvaluees,
    nbPartielles,
    // Deux motifs DISTINCTS, pour que le bandeau dise lequel s'applique.
    matieresNonEvaluees,
    matieresPartielles,
    complet,
    // Un bulletin dont toutes les matières ne sont pas notées est PROVISOIRE : on
    // préfère le dire que de publier une synthèse qui a l'air définitive.
    provisoire: !complet,
    totalCoefApplicable: rows.reduce((a, r) => a + r.coef, 0),
    serieId,
    sys,
    generalRank,
    classStats,
  };
}

// Matières de premier niveau triées par (domaine, position, nom).
export function orderedBilSubjects(subjects) {
  return (subjects || [])
    .filter((s) => !s.parent_id)
    .slice()
    .sort((a, b) =>
      ((a.bil_domaine_ordre ?? 99) - (b.bil_domaine_ordre ?? 99))
      || ((a.position ?? 0) - (b.position ?? 0))
      || String(a.name).localeCompare(String(b.name), 'fr'));
}

// ── Libellé du bandeau PROVISOIRE ────────────────────────────────────────────
// Construit ICI, dans la logique pure, pour que l'aperçu écran et le document
// imprimé affichent exactement la même phrase. Les deux motifs sont tenus
// séparés : une matière SANS AUCUNE note (aucune information) n'est pas la même
// chose qu'une matière notée sur une partie des séquences (information
// incomplète). Un zéro réel n'apparaît dans aucun des deux : c'est une note.
export function bilProvisoireTexte(data, sys = 'FR') {
  if (!data?.provisoire) return '';
  const en = sys === 'EN';
  const parts = [];
  if (data.nbEvaluees < data.nbApplicables) {
    parts.push(en
      ? `${data.nbApplicables - data.nbEvaluees} subject(s) not assessed`
      : `${data.nbApplicables - data.nbEvaluees} matière(s) non évaluée(s)`);
  }
  if (data.nbPartielles > 0) {
    parts.push(en
      ? `${data.nbPartielles} subject(s) graded on part of the sequences only`
      : `${data.nbPartielles} matière(s) notée(s) sur une partie des séquences seulement`);
  }
  const tete = en ? 'PROVISIONAL' : 'PROVISOIRE';
  const queue = en
    ? 'Totals cover assessed subjects only.'
    : 'Les totaux ne portent que sur les matières notées.';
  return `${tete} — ${parts.join(' · ')}. ${queue}`;
}

// ── Bulletin ANNUEL ──────────────────────────────────────────────────────────
// `termSeqs` = [[1,2],[3,4],[5,6]] — les séquences de chaque trimestre.
//
// Agrégation annuelle PAR MATIÈRE : moyenne des moyennes trimestrielles
// RÉELLEMENT obtenues (un trimestre non évalué ne compte pas et ne vaut pas 0),
// puis la même règle pondérée que le trimestriel :
//     Moyenne annuelle = Σ (moyenne annuelle de matière × coef) / Σ coef
//
// `mode` permet de changer de méthode sans toucher au moteur :
//   'subject_mean' (défaut) — ci-dessus ;
//   'term_mean'             — moyenne arithmétique des 3 moyennes générales.
// Aucune des deux n'est imposée par un texte officiel : le choix appartient à
// l'établissement (voir docs/BILINGUE_SPECIAL_REFERENTIEL.md).
export function assembleBilAnnual(ctx) {
  const { termSeqs = [[1, 2], [3, 4], [5, 6]], mode = 'subject_mean', ...rest } = ctx;

  const terms = termSeqs.map((seqs) => assembleBilBulletin({ ...rest, seqs }));

  // Moyenne annuelle de chaque matière = moyenne de ses moyennes trimestrielles.
  const annualBySubject = new Map();
  for (const t of terms) {
    for (const d of t.domaines) {
      for (const r of d.rows) {
        if (!r.evaluee) continue;
        if (!annualBySubject.has(r.id)) annualBySubject.set(r.id, []);
        annualBySubject.get(r.id).push(r.moyenne);
      }
    }
  }

  const ref = terms[0];
  const domaines = ref.domaines.map((d) => {
    const rows = d.rows.map((r) => {
      const vals = annualBySubject.get(r.id) || [];
      const moyenne = vals.length ? r2(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
      return {
        ...r,
        moyenne,
        evaluee: moyenne !== null,
        ponderee: moyenne === null ? null : r2(moyenne * r.coef),
        // Détail trimestre par trimestre, pour la colonne T1/T2/T3 du bulletin annuel.
        trimestres: terms.map((t) => {
          for (const td of t.domaines) {
            const tr = td.rows.find((x) => x.id === r.id);
            if (tr) return tr.moyenne;
          }
          return null;
        }),
        nbTrimestresEvalues: vals.length,
      };
    });
    const coefSum = rows.filter((r) => r.evaluee).reduce((a, r) => a + r.coef, 0);
    const pointsSum = r2(rows.filter((r) => r.evaluee).reduce((a, r) => a + r.ponderee, 0));
    return { ...d, rows, coefSum, pointsSum, moyenne: coefSum ? r2(pointsSum / coefSum) : null };
  });

  const totalCoef = domaines.reduce((a, d) => a + d.coefSum, 0);
  const totalPoints = r2(domaines.reduce((a, d) => a + d.pointsSum, 0));

  let moyenneGenerale;
  if (mode === 'term_mean') {
    const vals = terms.map((t) => t.moyenneGenerale).filter((v) => v !== null);
    moyenneGenerale = vals.length ? r2(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
  } else {
    moyenneGenerale = totalCoef ? r2(totalPoints / totalCoef) : null;
  }

  const sys = bilSysForSerie(rest.serieId || BIL_SERIE_FR);
  return {
    domaines,
    totalCoef,
    totalPoints,
    moyenneGenerale,
    mode,
    moyennesTrimestres: terms.map((t) => t.moyenneGenerale),
    trimestres: terms,
    appreciation: moyenneGenerale === null ? ''
      : bilAppreciation(moyenneGenerale, rest.gradeScale, sys),
    complet: terms.every((t) => t.complet),
    provisoire: !terms.every((t) => t.complet),
    serieId: rest.serieId || BIL_SERIE_FR,
    sys,
  };
}

// ── Référentiel → `subjects` à créer pour une classe ─────────────────────────
// N'inclut QUE les matières obligatoires. Les matières « au choix selon les
// orientations » (Form 4/5) ne sont jamais créées automatiquement : elles
// supposent un choix d'orientation que seul l'établissement peut poser.
export function subjectsFromBilReferentiel(rows, { schoolId, classId, gradeMax = 20, makeId, includeOptional = false }) {
  return (rows || [])
    .filter((r) => includeOptional || r.obligatoire !== false)
    .map((r, i) => ({
      id: makeId(r.nom),
      school_id: schoolId,
      class_id: classId,
      name: r.nom,
      coef: r.coefficient || 1,
      max: gradeMax,
      position: i,
      bil_domaine: r.domaine_nom,
      bil_domaine_ordre: r.domaine_ordre,
      bil_obligatoire: r.obligatoire !== false,
      charge_horaire: r.charge_horaire,
    }));
}
