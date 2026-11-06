// Auto-configuration des matières d'une classe du PROGRAMME D'ÉDUCATION BILINGUE
// SPÉCIAL (premier cycle) depuis le référentiel de l'arrêté 239-23/MINESEC.
// Résolution pure ; la persistance reste dans schoolStore (offline-first).

import { resolveClassEngine, firstCycleClasseSlug, isBilClasseEnService } from '../core/engineResolver.js';
import { matieresForBilClasse, subjectsFromBilReferentiel, bilSerieForClasseSlug } from '../core/bilEngine.js';
import { resolveRefRow } from '../core/refNameMatch.js';
import { domaineForSubject } from '../core/subjectGroup.js';

// (série, classe) du référentiel pour une classe de l'école, ou null.
// Le sous-système se déduit du niveau : 6e–3e → francophone, Form 1–3 →
// anglophone. Rien à saisir à la main, donc rien à saisir de travers.
//
// Renvoie null pour Form 4/5 : elles figurent dans le référentiel, mais ne sont
// PAS en service tant que l'établissement n'a pas arrêté ses orientations (leurs
// matières « au choix » rendraient le total de coefficients faux).
export function bilRefKeyForClass(cls) {
  const classeId = firstCycleClasseSlug(cls?.level || '', cls?.name || '');
  if (!classeId || !isBilClasseEnService(classeId)) return null;
  const serieId = bilSerieForClasseSlug(classeId);
  return serieId ? { serieId, classeId } : null;
}

// Matières d'une classe bilingue ENRICHIES du référentiel (domaine, coefficient,
// charge horaire). UNE seule définition pour le bulletin, le procès-verbal et le
// relevé : si chacun la recopiait, leurs coefficients — donc leurs moyennes —
// finiraient par diverger. Sans référentiel chargé ou sans clé de classe, les
// matières sont rendues telles quelles.
export function enrichBilSubjects(classSubjects, bilReferentiel, cls) {
  const key = bilRefKeyForClass(cls);
  if (!bilReferentiel || !key) return classSubjects;
  const rows = matieresForBilClasse(bilReferentiel, key);
  if (!rows.length) return classSubjects;
  // Rapprochement tolérant : un nom abrégé ne doit pas coûter son domaine à la matière.
  return classSubjects.map((s) => {
    if (s.bil_domaine_ordre != null) return s;
    const r = resolveRefRow(s.name, rows, (x) => x.nom);
    if (!r) {
      // MATIÈRE MAISON : on ne reprend que le nom et l'ordre du domaine ; le
      // coefficient et la charge restent ceux que l'école a saisis.
      const d = domaineForSubject(s, rows);
      if (!d) return s;
      return { ...s, bil_domaine: d.domaine_nom, bil_domaine_ordre: d.domaine_ordre };
    }
    return {
      ...s,
      bil_domaine: r.domaine_nom,
      bil_domaine_ordre: r.domaine_ordre,
      bil_obligatoire: r.obligatoire,
      charge_horaire: s.charge_horaire ?? r.charge_horaire,
      coef: (s.coef != null && s.coef !== 1) ? s.coef : (r.coefficient || s.coef),
    };
  });
}

// Renvoie les `subjects` à créer pour `cls` (ou [] si non concerné).
//
// `includeOptional` reste à false : les matières « au choix selon les
// orientations » (Form 4/5) ne sont JAMAIS créées d'office — l'orientation de
// l'élève n'est pas une donnée que le logiciel peut deviner. Dans le périmètre
// en service (6e–3e, Form 1–3), l'arrêté ne prévoit aucune option : la question
// ne se pose pas.
export function buildBilSubjectsForClass({ referentiel, school, cls, makeId, includeOptional = false }) {
  if (!referentiel || resolveClassEngine(school, cls) !== 'bilingue') return [];
  const key = bilRefKeyForClass(cls);
  if (!key) return [];

  const rows = matieresForBilClasse(referentiel, key);
  if (!rows.length) return [];

  return subjectsFromBilReferentiel(rows, {
    schoolId: cls.school_id,
    classId: cls.id,
    gradeMax: cls.grade_max || 20,
    makeId,
    includeOptional,
  });
}
