// « À suivre » (constats sur les résultats) et « À faire » (actions de la direction) —
// fonctions PURES. Chaque élément porte une `gravite` (1 = à surveiller, 2 = urgent), un
// `type` stable (testable) et la classe concernée. Aucun seuil caché : ils sont exportés.
export const SEUILS = { moyenneBasse: 10, reussiteBasse: 50, baisse: 1 };   // sur 20 ; en % ; en points sur 20

const sur20 = (avg, max) => (avg == null || !(max > 0) ? null : (avg / max) * 20);

/**
 * @param {Array<{id, nom, cur: {avg, graded, above, maxScale}|null, prev: {...}|null}>} lignes
 * @returns {Array<{type, gravite, classId, nom, valeur?}>}
 */
export function aSuivre(lignes) {
  const out = [];
  for (const l of lignes || []) {
    if (!l.cur || !(l.cur.graded > 0) || l.cur.avg == null) continue;
    const m = sur20(l.cur.avg, l.cur.maxScale);
    const reussite = (l.cur.above / l.cur.graded) * 100;
    if (m < SEUILS.moyenneBasse) out.push({ type: 'moyenne_basse', gravite: 2, classId: l.id, nom: l.nom, valeur: Math.round(m * 100) / 100 });
    if (reussite < SEUILS.reussiteBasse) out.push({ type: 'reussite_basse', gravite: m < SEUILS.moyenneBasse ? 2 : 1, classId: l.id, nom: l.nom, valeur: Math.round(reussite) });
    if (l.prev && l.prev.graded > 0 && l.prev.avg != null) {
      const ecart = m - sur20(l.prev.avg, l.prev.maxScale);
      if (ecart <= -SEUILS.baisse) out.push({ type: 'baisse', gravite: 1, classId: l.id, nom: l.nom, valeur: Math.round(ecart * 100) / 100 });
    }
  }
  return out.sort((a, b) => b.gravite - a.gravite);
}

/**
 * @param {object} p
 * @param {Array}  p.retards          lignes `suivi.retard` ({ cls, period, joursRetard, entered, expected })
 * @param {Array}  p.encours          lignes `suivi.encours` ({ cls, entered, atRisk, joursRestants })
 * @param {boolean} p.calendrierConfirme
 * @param {number} p.matieresSansEnseignant
 */
export function aFaire({ retards = [], encours = [], calendrierConfirme = true, matieresSansEnseignant = 0 } = {}) {
  const out = [];
  for (const r of retards) out.push({ type: 'saisie_en_retard', gravite: 2, classId: r.cls.id, nom: r.cls.name, valeur: r.joursRetard });
  for (const e of encours) if (e.atRisk) out.push({ type: 'limite_proche', gravite: 1, classId: e.cls.id, nom: e.cls.name, valeur: e.joursRestants });
  if (matieresSansEnseignant > 0) out.push({ type: 'matieres_sans_enseignant', gravite: 1, valeur: matieresSansEnseignant });
  if (!calendrierConfirme) out.push({ type: 'calendrier_a_confirmer', gravite: 1 });
  return out.sort((a, b) => b.gravite - a.gravite);
}

/** Identifiants de classes retenus par un filtre : 'all' | 'cycle:xxx' | 'class:id'. */
export function classesDuFiltre(filtre, classes) {
  if (!filtre || filtre === 'all') return null;
  if (filtre.startsWith('class:')) return new Set([filtre.slice(6)]);
  if (filtre.startsWith('cycle:')) {
    const c = filtre.slice(6);
    return new Set((classes || []).filter((x) => (x.cycle || '') === c).map((x) => x.id));
  }
  return null;
}

/** Texte d'une alerte, dans la langue de `t(fr, en, es?)` — partagé par l'écran et le rapport imprimé. */
export function libelleAlerte(x, t) {
  switch (x.type) {
    case 'moyenne_basse': return t(`${x.nom} : moyenne ${x.valeur}/20, sous 10`, `${x.nom}: average ${x.valeur}/20, below 10`);
    case 'reussite_basse': return t(`${x.nom} : ${x.valeur} % de réussite`, `${x.nom}: ${x.valeur}% pass rate`);
    case 'baisse': return t(`${x.nom} : moyenne en baisse de ${Math.abs(x.valeur)} pt`, `${x.nom}: average down ${Math.abs(x.valeur)} pt`);
    case 'saisie_en_retard': return t(`${x.nom} : saisie en retard de ${x.valeur} jour(s)`, `${x.nom}: entry ${x.valeur} day(s) late`);
    case 'limite_proche': return t(`${x.nom} : date limite dans ${x.valeur} jour(s)`, `${x.nom}: deadline in ${x.valeur} day(s)`);
    case 'matieres_sans_enseignant': return t(`${x.valeur} matière(s) sans enseignant affecté`, `${x.valeur} subject(s) without an assigned teacher`);
    case 'calendrier_a_confirmer': return t('Calendrier scolaire à confirmer', 'School calendar to confirm');
    default: return x.type;
  }
}
