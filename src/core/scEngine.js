// Moteur SECOND CYCLE MINESEC — logique métier pure (pas de React, pas de DOM).
//
// Le second cycle réutilise le moteur de NOTES classique (bulletinEngine.js) :
// ce module ne fait QUE résoudre le référentiel (matières/coefficients/charges/
// groupes par série×classe) et préparer les regroupements du futur bulletin.
//
// Formes de données (référentiel chargé par scService) :
//   serie         = { id, nom, categorie, description }
//   groupe        = { id, nom, ordre }            ('g1','g2')
//   matiere       = { id, nom, code, domaine_apprentissage, ordre }
//   serieMatiere  = { serie_id, classe_id, matiere_id, groupe_id, coefficient,
//                     charge_horaire, obligatoire, actif }

// Matières d'une (série, classe), résolues depuis sc_serie_matieres, enrichies du
// nom/groupe, triées par (ordre de groupe, ordre de matière). C'est la liste qui
// auto-configure les `subjects` de la classe.
export function matieresForSerieClasse(referentiel, { serieId, classeId }) {
  const matById  = new Map((referentiel?.matieres || []).map((m) => [m.id, m]));
  const grpById  = new Map((referentiel?.groupes  || []).map((g) => [g.id, g]));
  return (referentiel?.serieMatieres || [])
    .filter((r) => r.actif !== false && r.serie_id === serieId && r.classe_id === classeId)
    .map((r) => {
      const m = matById.get(r.matiere_id) || { id: r.matiere_id, nom: r.matiere_id };
      const g = grpById.get(r.groupe_id) || { id: r.groupe_id, nom: r.groupe_id, ordre: 99 };
      return {
        matiere_id: r.matiere_id,
        nom: m.nom,
        code: m.code || null,
        domaine: m.domaine_apprentissage || null,
        coefficient: Number(r.coefficient) || 0,
        charge_horaire: r.charge_horaire == null ? null : Number(r.charge_horaire),
        groupe_id: r.groupe_id,
        groupe_nom: g.nom,
        groupe_ordre: g.ordre ?? 99,
        obligatoire: r.obligatoire !== false,
        matiere_ordre: m.ordre ?? 0,
      };
    })
    .sort((a, b) => (a.groupe_ordre - b.groupe_ordre) || (a.matiere_ordre - b.matiere_ordre) || a.nom.localeCompare(b.nom));
}

// Regroupe des lignes de matières par groupe (pour le bulletin groupé MINESEC) et
// calcule, par groupe, la somme des coefficients (+ moyenne pondérée si `moyenne`
// est fournie sur les lignes). Renvoie [{ groupe_id, groupe_nom, ordre, rows,
// coefSum, mxSum, moyenne }].
export function groupSubtotals(rows) {
  const byGroupe = new Map();
  for (const r of rows || []) {
    if (!byGroupe.has(r.groupe_id)) {
      byGroupe.set(r.groupe_id, { groupe_id: r.groupe_id, groupe_nom: r.groupe_nom, ordre: r.groupe_ordre, rows: [], coefSum: 0, mxSum: 0 });
    }
    const g = byGroupe.get(r.groupe_id);
    g.rows.push(r);
    if (r.moyenne != null) {
      g.coefSum += r.coefficient;
      g.mxSum   += r.moyenne * r.coefficient;
    }
  }
  return [...byGroupe.values()]
    .map((g) => ({ ...g, moyenne: g.coefSum ? Math.round((g.mxSum / g.coefSum) * 100) / 100 : null }))
    .sort((a, b) => a.ordre - b.ordre);
}

// ── Bulletin SECOND CYCLE groupé : assemblage des données (logique pure) ───────
// Réutilise le moteur de NOTES classique. Vit ici (module pur, testable en Node)
// ; le rendu HTML/PDF est dans src/lib/scBulletinDoc.js + scBulletinPdf.js.
import { fusedG, multiAvg, getAppreciation } from './bulletinEngine.js';

const GROUP_LABEL = { 1: 'GROUPE 1', 2: 'GROUPE 2' };

// Matières de premier niveau triées par (groupe, position). Les sous-composantes
// (parent_id) sont ignorées : le moteur classique les agrège déjà.
export function orderedScSubjects(subjects) {
  return (subjects || [])
    .filter((s) => !s.parent_id)
    .slice()
    .sort((a, b) =>
      ((a.sc_groupe_ordre ?? 99) - (b.sc_groupe_ordre ?? 99)) ||
      ((a.position ?? 0) - (b.position ?? 0)) ||
      String(a.name).localeCompare(String(b.name)));
}

// Moyenne d'une matière (élève) sur les séquences du trimestre, sur le barème de
// la matière (/20 en second cycle) — via fusedG, comme le reste de l'app.
function scSubjectMean(allGrades, classId, studentId, seqs, subject) {
  const fg = fusedG(allGrades, classId, studentId, seqs, [subject]);
  const v = fg[subject.id];
  return v == null || v === '' ? null : Number(v);
}

// Assemble le bulletin groupé d'un élève pour un trimestre :
//   { groups:[{ ordre,nom,rows,coefSum,mxSum,chargeSum,moyenne }],
//     coefSum, mxSum, moyenneGenerale, appreciation, generalRank, classStats }
// ctx.subjectRanks[subjectId][studentId] / ctx.subjectStats[subjectId] (optionnels).
export function assembleScBulletin(ctx) {
  const { subjects, allGrades, classId, student, seqs, sys = 'FR', opts = {},
    gradeScale, subjectRanks = {}, subjectStats = {}, generalRank, classStats,
    teachersById = {} } = ctx;
  const maxScale = opts.maxScale ?? (sys === 'EN' ? 100 : 20);
  const r2 = (v) => Math.round(v * 100) / 100;

  const rows = orderedScSubjects(subjects).map((s) => {
    const moyenne = scSubjectMean(allGrades, classId, student.id, seqs, s);
    const coef = Number(s.coef) || 0;
    const app = getAppreciation(moyenne, gradeScale, sys, maxScale);
    const st = subjectStats[s.id];
    return {
      id: s.id, nom: s.name, coef,
      enseignant: (s.teacher_id && teachersById[s.teacher_id]) || '',
      charge: s.charge_horaire == null ? null : Number(s.charge_horaire),
      groupe_ordre: s.sc_groupe_ordre ?? 99,
      groupe_nom: s.sc_groupe || GROUP_LABEL[s.sc_groupe_ordre] || '',
      moyenne, ponderee: moyenne == null ? null : r2(moyenne * coef),
      rang: subjectRanks[s.id]?.[student.id] || '',
      minmax: st && st.min != null ? { min: st.min, max: st.max } : null,
      appreciation: app?.text || '',
    };
  });

  const groupsMap = new Map();
  for (const r of rows) {
    if (!groupsMap.has(r.groupe_ordre)) {
      groupsMap.set(r.groupe_ordre, {
        ordre: r.groupe_ordre,
        nom: r.groupe_nom || GROUP_LABEL[r.groupe_ordre] || `Groupe ${r.groupe_ordre}`,
        rows: [], coefSum: 0, mxSum: 0, chargeSum: 0,
      });
    }
    const g = groupsMap.get(r.groupe_ordre);
    g.rows.push(r);
    if (r.moyenne != null) { g.coefSum += r.coef; g.mxSum += r.ponderee; }
    if (r.charge != null) g.chargeSum += r.charge;
  }
  const groups = [...groupsMap.values()]
    .sort((a, b) => a.ordre - b.ordre)
    .map((g) => ({
      ...g,
      // Repli propre si la matière n'a pas de groupe (ordre 99) — jamais « Groupe 99 ».
      nom: (g.ordre === 99 && (!g.nom || /99/.test(g.nom))) ? 'AUTRES MATIÈRES' : g.nom,
      mxSum: r2(g.mxSum),
      moyenne: g.coefSum ? r2(g.mxSum / g.coefSum) : null,
    }));

  const coefSum = groups.reduce((a, g) => a + g.coefSum, 0);
  const mxSum = r2(groups.reduce((a, g) => a + g.mxSum, 0));
  const moyenneGenerale = multiAvg(allGrades, classId, student.id, seqs, subjects, sys, opts);
  const app = getAppreciation(moyenneGenerale, gradeScale, sys, maxScale);

  return { groups, coefSum, mxSum, moyenneGenerale, appreciation: app?.text || '', generalRank, classStats };
}

// Lecture de la DISCIPLINE + DÉCISION DU CONSEIL depuis gradeMap (clés spéciales
// __abs_j__/__abs_nj__/__conduite__/__exclusions__/__aver_*__/__blame_*__/__th__/
// __encouragement__/__felicitation__/__decision__). Mêmes conventions que
// Bulletins.jsx & ConseilDeClasse.jsx → réutilise la saisie existante, aucune
// table dédiée. Renvoie { absJ, absNJ, conduite, exclusions, mentions[], decision }.
// Codes écrits par le sélecteur de décision annuelle (AnnualDecisionPicker) :
// admis / redouble / renvoye / rattrapage — plus les variantes historiques.
const SC_DECISION_LABEL = {
  admis: 'Admis(e)', redoublant: 'Redoublant(e)', renvoye: 'Renvoyé(e)',
  redouble: 'Autorisé(e) à redoubler', rattrapage: 'Examen de rattrapage',
  aprobado: 'Aprobado', repite: 'Repite', expulsado: 'Expulsado',
};
export function scDisciplineConseil(allGrades, classId, studentId, seqs) {
  const n = (v) => parseInt(v || '0', 10) || 0;
  let absJ = 0, absNJ = 0, conduite = null, exclusions = 0;
  let averTravail = 0, blameTravail = 0, averConduite = 0, blameConduite = 0;
  let th = false, encouragement = false, felicitation = false, decisionRaw = '';
  for (const seq of seqs) {
    const s = allGrades[`${classId}_${studentId}_${seq}`] || {};
    absJ += n(s['__abs_j__']); absNJ += n(s['__abs_nj__']);
    if (s['__conduite__']) conduite = s['__conduite__'];
    if (s['__exclusions__'])     exclusions   = n(s['__exclusions__']);
    if (s['__aver_travail__'])   averTravail  = n(s['__aver_travail__']);
    if (s['__blame_travail__'])  blameTravail = n(s['__blame_travail__']);
    if (s['__aver_conduite__'])  averConduite = n(s['__aver_conduite__']);
    if (s['__blame_conduite__']) blameConduite = n(s['__blame_conduite__']);
    if (s['__th__'] !== undefined)            th            = s['__th__'] === 'true';
    if (s['__encouragement__'] !== undefined) encouragement = s['__encouragement__'] === 'true';
    if (s['__felicitation__'] !== undefined)  felicitation  = s['__felicitation__'] === 'true';
    if (s['__decision__']) decisionRaw = s['__decision__'];
  }
  const mentions = [];
  if (felicitation) mentions.push('Félicitations');
  else if (encouragement) mentions.push('Encouragements');
  if (th) mentions.push("Tableau d'honneur");
  const x = (n) => (n > 1 ? ` ×${n}` : '');
  if (averTravail)  mentions.push(`Avertissement travail${x(averTravail)}`);
  if (blameTravail) mentions.push(`Blâme travail${x(blameTravail)}`);
  if (averConduite)  mentions.push(`Avertissement conduite${x(averConduite)}`);
  if (blameConduite) mentions.push(`Blâme conduite${x(blameConduite)}`);
  return {
    absJ, absNJ, conduite, exclusions, mentions,
    decision: SC_DECISION_LABEL[decisionRaw] || decisionRaw || '',
  };
}

// Agrégation des SANCTIONS Vie scolaire (disciplinary_actions, module surveillant)
// vers les compteurs de conduite du bulletin, pour la/les séquence(s) `seqs`.
// Règle simple et sans ambiguïté :
//   avertissement_oral / avertissement_ecrit → averConduiteAuto
//   blame                                    → blameConduiteAuto
//   exclusion_temporaire / exclusion_definitive → exclusionsAuto (somme des
//     jours ; 1 jour par défaut si duration_days n'est pas renseigné)
// `retenue` et `travail_interet` n'ont pas de champ bulletin correspondant —
// ils restent visibles uniquement dans le rapport Discipline (/app/reports).
// Seule source auto : les sanctions officielles (disciplinary_actions) — jamais
// les avertissements informels, pour éviter tout double comptage.
export function vieScolaireAutoConduite(actionsRows, classId, studentId, seqs) {
  const seqSet = new Set(seqs);
  const rows = (actionsRows || []).filter((a) =>
    a.class_id === classId && a.student_id === studentId && seqSet.has(a.sequence_order));

  let averConduiteAuto = 0, blameConduiteAuto = 0, exclusionsAuto = 0;
  for (const a of rows) {
    if (a.action_type === 'avertissement_oral' || a.action_type === 'avertissement_ecrit') averConduiteAuto++;
    else if (a.action_type === 'blame') blameConduiteAuto++;
    else if (a.action_type === 'exclusion_temporaire' || a.action_type === 'exclusion_definitive') {
      exclusionsAuto += parseInt(a.duration_days, 10) || 1;
    }
  }
  return { averConduiteAuto, blameConduiteAuto, exclusionsAuto };
}

// Convertit les lignes du référentiel en `subjects` à créer pour une classe.
// schoolId/classId/gradeMax viennent de la classe ; le reste du référentiel.
// (id généré par l'appelant via uuid pour rester pur ici.)
export function subjectsFromReferentiel(rows, { schoolId, classId, gradeMax = 20, makeId }) {
  return (rows || []).map((r, i) => ({
    id: makeId(),
    school_id: schoolId,
    class_id: classId,
    name: r.nom,
    coef: r.coefficient || 1,
    max: gradeMax,
    position: i,
    sc_groupe: r.groupe_nom,
    sc_groupe_ordre: r.groupe_ordre,
    charge_horaire: r.charge_horaire,
  }));
}
