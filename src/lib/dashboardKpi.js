// Indicateurs du tableau de bord de direction — fonctions PURES (testées).
// Règle commune : une moyenne de classes de barèmes différents se compare SUR 20
// (moyenne ÷ barème × 20), pondérée par le nombre d'élèves NOTÉS ; une variation ne
// compare que les classes qui ont les DEUX périodes (sinon on compare des populations).
const sur20 = (avg, maxScale) => (avg == null || !(maxScale > 0) ? null : (avg / maxScale) * 20);
const arrondi = (x, n = 2) => (x == null ? null : Math.round(x * 10 ** n) / 10 ** n);

/**
 * @param {Array<{cur: {avg, graded, above, maxScale}|null, prev: {avg, graded, above, maxScale}|null}>} lignes
 * @returns {{moyenne, reussite, variationMoyenne, variationReussite, classes, eleves, comparable}}
 *   moyenne : /20 pondérée ; reussite : % ; variations : écart (points / % points) ou null.
 */
export function kpisGlobaux(lignes) {
  const avec = (lignes || []).filter((l) => l.cur && l.cur.graded > 0 && l.cur.avg != null);
  const agr = (cle) => {
    const lots = avec.map((l) => l[cle]).filter((x) => x && x.graded > 0 && x.avg != null);
    const eleves = lots.reduce((s, x) => s + x.graded, 0);
    if (!eleves) return null;
    const moy = lots.reduce((s, x) => s + sur20(x.avg, x.maxScale) * x.graded, 0) / eleves;
    const reu = lots.reduce((s, x) => s + x.above, 0) / eleves;
    return { moyenne: moy, reussite: reu * 100, eleves, classes: lots.length };
  };
  const cur = agr('cur');
  // Variation : mêmes classes des deux côtés.
  const memes = avec.filter((l) => l.prev && l.prev.graded > 0 && l.prev.avg != null);
  const c2 = memes.length ? (() => {
    const e = memes.reduce((s, l) => s + l.cur.graded, 0);
    const m = memes.reduce((s, l) => s + sur20(l.cur.avg, l.cur.maxScale) * l.cur.graded, 0) / e;
    const r = memes.reduce((s, l) => s + l.cur.above, 0) / e * 100;
    const ep = memes.reduce((s, l) => s + l.prev.graded, 0);
    const mp = memes.reduce((s, l) => s + sur20(l.prev.avg, l.prev.maxScale) * l.prev.graded, 0) / ep;
    const rp = memes.reduce((s, l) => s + l.prev.above, 0) / ep * 100;
    return { dm: m - mp, dr: r - rp };
  })() : null;
  return {
    moyenne: cur ? arrondi(cur.moyenne) : null,
    reussite: cur ? Math.round(cur.reussite) : null,
    variationMoyenne: c2 ? arrondi(c2.dm) : null,
    variationReussite: c2 ? Math.round(c2.dr) : null,
    classes: cur ? cur.classes : 0,
    eleves: cur ? cur.eleves : 0,
    comparable: memes.length,
  };
}

/** Tendance lisible : 'hausse' | 'baisse' | 'stable' | null (pas de comparaison honnête). */
export function tendance(variation, seuil = 0.1) {
  if (variation == null) return null;
  if (variation > seuil) return 'hausse';
  if (variation < -seuil) return 'baisse';
  return 'stable';
}

/** Barres par classe : moyenne sur 20, triées de la plus faible à la plus forte. */
export function barresParClasse(lignes) {
  return (lignes || [])
    .filter((l) => l.cur && l.cur.graded > 0 && l.cur.avg != null)
    .map((l) => ({ id: l.id, nom: l.nom, valeur: arrondi(sur20(l.cur.avg, l.cur.maxScale)), notes: l.cur.graded }))
    .sort((a, b) => a.valeur - b.valeur);
}

/** Répartition des moyennes individuelles par tranche de 2 points sur 20 (histogramme). */
export function repartition(moyennesSur20) {
  const tranches = Array.from({ length: 10 }, (_, i) => ({ de: i * 2, a: i * 2 + 2, n: 0 }));
  for (const v of moyennesSur20 || []) {
    if (v == null || Number.isNaN(v)) continue;
    const i = Math.min(9, Math.max(0, Math.floor(v / 2)));
    tranches[i].n += 1;
  }
  return tranches;
}
